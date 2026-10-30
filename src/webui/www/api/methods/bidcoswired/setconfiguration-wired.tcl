##
# BidCoS_Wired.setConfiguration
# Rewrites the interface sections of /etc/config/hs485d.conf (staged SP030).
#
# Parameters:
#   interfaces: [array] elements {type, userName, serialNumber, encryptionKey[, ipAddress]}
#
# Return value: [bool] true on success, false if nothing could be written
#
# v1 behaviour kept: the header before the first "[Interface N]" (N = 0-9 digits) is retained,
# a generated header (Listen Port from /etc/eq3services.ports.tcl, else 2000) is used if the file
# does not exist, sections are numbered from 0.
# Hardening: CR/LF in an element is 403 "invalid argument (interfaces)" before any file access;
# the content is written to a temporary file in /etc/config and moved over hs485d.conf with
# rename, a failure leaves the previous file byte-identical and answers false.
##

set CONFIG_FILE /etc/config/hs485d.conf

set portnumber 2000
catch { source "/etc/eq3services.ports.tcl" }
if { [info exists EQ3_SERVICE_HS485D_PORT] } {
	set portnumber $EQ3_SERVICE_HS485D_PORT
}

# Step 1: validate the elements (no file access yet)
set malformed 0
set elements {}
foreach _interface_ $args(interfaces) {
  if { [catch { array set interface $_interface_ }] } then {
    set malformed 1
    array unset interface
    continue
  }
  foreach field {type userName serialNumber encryptionKey ipAddress} {
    if { [regexp {[\r\n]} [array_getValue interface $field]] } then {
      jsonrpc_error 403 "invalid argument (interfaces)"
    }
  }
  lappend elements [array get interface]
  array_clear interface
}

# Step 2: the header (existing file or generated)
set header ""
set readable 1
if { [file exists $CONFIG_FILE] == 1 } then {
	if { [catch { set fd [open $CONFIG_FILE r] }] } then {
	  set readable 0
	} else {
	  while { [gets $fd line] >= 0 } {
	    if { ![regexp {.*\[Interface [0-9]*\].*} $line] } then {
	      append header $line "\n"
	    } else {
	      break
	    }
	  }
	  close $fd
	}
} else {
	append header "# This File was automatically generated\n"
	append header "# TCP Port for XmlRpc connections\n"
	append header "Listen Port = $portnumber\n"
	append header "\n"
	append header "Log Destination = Syslog\n"
	append header "Log Identifier = hs485d\n"
	append header "\n"
}

# Step 3: build the complete content, then replace the file
set result false
if { !$malformed && $readable && "" != $header } then {
  set content "$header\n"
  set i 0
  foreach _interface_ $elements {
    array set interface $_interface_
    append content "\[Interface $i\]\n"
    append content "Type = [array_getValue interface type]\n"
    append content "Name = [array_getValue interface userName]\n"
    append content "Serial Number = [array_getValue interface serialNumber]\n"
    append content "Encryption Key = [array_getValue interface encryptionKey]\n"
    if { {} != [array_getValue interface ipAddress] } then {
      append content "IP Address = [array_getValue interface ipAddress]\n"
    }
    append content "\n"
    array_clear interface
    incr i
  }

  set tmp "$CONFIG_FILE.[pid].tmp"
  if { ![catch {
    set fd [open $tmp w]
    puts -nonewline $fd $content
    close $fd
    file rename -force -- $tmp $CONFIG_FILE
  }] } then {
    set result true
  } else {
    catch { file delete -force -- $tmp }
  }
}

jsonrpc_response $result
