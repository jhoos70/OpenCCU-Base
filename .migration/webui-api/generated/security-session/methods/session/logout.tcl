##
# Session.logout
# Ends a session (staged SP031).
#
# Parameters:
#   _session_id_: [string] the session id
#
# Return value: [bool] true
#
# Hardening: logout needs a valid session (GUEST level in the corrected registry). The script
# checks the session itself as defence in depth: an unknown or expired id is 400 access denied and
# system.ClearSessionID is not executed, so a caller who merely knows an id cannot end another
# session.
##

array set _chk_ {}
set _chk_(_session_id_) $args(_session_id_)

if { [hmscript_runFromFile "eq3/checksid.hms" _chk_] != "true" } then {
  jsonrpc_error 400 "access denied (\"GUEST\" needed, session level 0)"
}

hmscript {system.ClearSessionID(_session_id_);} args

jsonrpc_response true
