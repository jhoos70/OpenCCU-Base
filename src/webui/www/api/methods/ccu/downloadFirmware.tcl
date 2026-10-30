##
# CCU.downloadFirmware
# Downloads the latest available CCU firmware (staged SP037, ADMIN only).
#
# Return value: true if the firmware was downloaded successfully, otherwise false.
#
# Hardening:
#  - exactly one response document: an unknown major version answers false and ends the
#    script before any wget (v1 continued with an undefined URL and wrote a second document)
#  - /VERSION and the serial are read with Tcl file I/O (no shell pipeline); version and serial
#    have to be plain tokens ([A-Za-z0-9._-]{1,64}) before they are used in the URL
#  - wget runs as an argument list under "timeout -k 5 <download_timeout_seconds>" (default 300,
#    key download_timeout_seconds in api/apiconfig.conf), so the CGI never blocks beyond the
#    timeout + 5 s; a timeout is recorded as "timeout" in /tmp/dwnld.error
#  - the download goes to a temporary name and replaces /tmp/fup.tgz only on exit status 0
#  - the client only ever sees true/false, never the wget error text or the URL (it contains
#    the serial); the error text is written to /tmp/dwnld.error as in v1
##

if { ![array exists API_CONFIG] } then { catch { source apiconfig.conf } }
set limit 300
if { [info exists API_CONFIG(download_timeout_seconds)] && [string is integer -strict $API_CONFIG(download_timeout_seconds)] \
     && $API_CONFIG(download_timeout_seconds) >= 1 && $API_CONFIG(download_timeout_seconds) <= 3600 } then {
  set limit $API_CONFIG(download_timeout_seconds)
}

proc fw_readFile { name } {
  if { [catch { set fd [open $name r]; set content [read $fd]; close $fd }] } then { return "" }
  return $content
}

set version ""
foreach line [split [fw_readFile /VERSION] "\n"] {
  if { [regexp {^VERSION=(.*)$} [string trim $line] -> v] } then { set version $v; break }
}
set major ""
regexp {^([0-9]+)} $version -> major

set serial ""
set url ""
if { [string compare $major "3"] == 0 } {
  set serial [string trim [fw_readFile /var/board_serial]]
  set product HM-CCU3
  set host ccu3-update.homematic.com
} elseif { [string compare $major "2"] == 0 } {
  set serial [string trim [fw_readFile /sys/module/plat_eq3ccu2/parameters/board_serial]]
  set product HM-CCU2
  set host update.homematic.com
} else {
  jsonrpc_response false
  return
}

if { ![regexp {^[A-Za-z0-9._-]{1,64}$} $version] || ![regexp {^[A-Za-z0-9._-]{1,64}$} $serial] } then {
  jsonrpc_response false
  return
}

set url "https://$host/firmware/download?cmd=download&version=$version&serial=$serial&lang=de&product=$product"

set tmp "/tmp/fup.tgz.[pid].tmp"
set rc [catch {exec timeout -k 5 $limit wget -q --https-only -O $tmp $url} error]
set errorCodeCopy $::errorCode

set ok 0
if { $rc == 0 } then {
  if { ![catch { file rename -force -- $tmp /tmp/fup.tgz }] } then { set ok 1 } else { set error "download could not be stored" }
} else {
  if { [lindex $errorCodeCopy 0] eq "CHILDSTATUS" && [lindex $errorCodeCopy 2] in {124 137} } then {
    set error "timeout"
  }
}

if { !$ok } then {
  catch { file delete -force -- $tmp }
  catch {
    set fd [open /tmp/dwnld.error w]
    puts $fd $error
    close $fd
  }
}

if { $ok } {
  jsonrpc_response true
} else {
  jsonrpc_response false
}
