##
# CCU.createFile
# Creates (touches) a flag file (staged SP035, EG-3 resolved).
#
# Hardening:
#  - ADMIN only, also when the registry still lists the v1 level GUEST (defence in depth):
#    below 8 the answer is 400 access denied and no filesystem call happens
#  - the path has to be an exact member of the allow-list from the configuration
#    (api/apiconfig.conf key path_allow_list.CCU.createFile, default
#    /etc/config/userAckSecurityHint, /etc/config/firewallConfigured,
#    /etc/config/fieldTestActive and /etc/config/legacyAPIMigrationAccepted); no
#    normalisation, no globbing, no patterns, never extended by request values; anything else
#    is 500 "path not allowed"
#  - touch runs as an argument list with the '--' guard
#
# Parameters:
#   file: [string] absolute path
#
# Return value: [bool] true if touch printed nothing, false otherwise (logged to the syslog)
##

# configuration (the dispatcher loads API_CONFIG; stand-alone the file next to the CGI is used)
if { ![array exists API_CONFIG] } then { catch { source apiconfig.conf } }
if { [info exists API_CONFIG(path_allow_list.CCU.createFile)] } then {
  set allowList $API_CONFIG(path_allow_list.CCU.createFile)
} else {
  set allowList {/etc/config/userAckSecurityHint /etc/config/firewallConfigured /etc/config/fieldTestActive /etc/config/legacyAPIMigrationAccepted}
}

# level: ADMIN (8) at least
array set _lvl_ {}
set _lvl_(_session_id_) $args(_session_id_)
set _upl_ [hmscript_runFromFile "eq3/getupl.hms" _lvl_]
if { ![string is integer -strict $_upl_] || $_upl_ < 8 } then {
  jsonrpc_error 400 "access denied (\"ADMIN\" needed, session level $_upl_)"
}

if { [lsearch -exact $allowList $args(file)] < 0 } then {
  jsonrpc_error 500 "path not allowed"
}

set result false
catch {exec touch -- $args(file)} e

if {[string trim $e] == ""} {
  set result true
} else {
  set _msg_ [string map [list "\r" "" "\n" {\n}] $e]
  if { 0 < [llength [info commands api_cid]] } then { set _cid_ [api_cid] } else { set _cid_ [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]] }
  set _line_ "cid=$_cid_ method=CCU.createFile uid=- code=0 errorInfo=touch failed for $args(file): $_msg_"
  if { 0 < [llength [info commands api_syslog]] } then {
    api_syslog daemon.err $_line_
  } else {
    catch { exec logger -t webui-api -p daemon.err $_line_ }
  }
}

jsonrpc_response $result
