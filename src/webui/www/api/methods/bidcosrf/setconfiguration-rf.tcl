##
# BidCoS_RF.setConfiguration
# Rewrites the interface sections of /etc/config/rfd.conf (staged SP030).
#
# Parameters:
#   interfaces: [array] elements {type, userName, serialNumber, encryptionKey[, ipAddress]}
#
# Return value: [bool] true on success, false if nothing could be written
#
# v1 behaviour kept: the header lines before the first "[Interface N]" (N = 1-9 digits, so
# "[Interface 0]" stays in the header) are retained and one "[Interface i]" section per
# element is appended, numbered from 1.
# Hardening:
#  - an element with CR or LF in any value is rejected with 403 "invalid argument (interfaces)"
#    before the file is touched (no config line injection)
#  - the new content is built completely, written to a temporary file in /etc/config and moved
#    over rfd.conf with rename; an unreadable source, an empty header or a malformed element
#    leaves the previous file byte-identical and answers false
##

set CONFIG_FILE /etc/config/rfd.conf

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

# Step 2: read the header (everything before the first interface section)
set header ""
set readable 0
if { !$malformed && ![catch { set fd [open $CONFIG_FILE r] }] } then {
  set readable 1
  while { [gets $fd line] >= 0 } {
    if { ![regexp {.*\[Interface [1-9]*\].*} $line] } then {
      append header $line "\n"
    } else {
      break
    }
  }
  close $fd
}

# Step 3: build the complete content, then replace the file
set result false
if { $readable && "" != $header } then {
  set content "$header\n"
  set i 1
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
