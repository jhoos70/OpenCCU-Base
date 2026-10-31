##
# privilege.tcl - enforcement of the per-method privilege level (staged SP003, IC001)
#
# checkPrivilegeLevel method_array args_array
#   returns normally when the session of args(_session_id_) has a privilege level (UPL) of at
#   least the LEVEL of the method; otherwise it ends the request with the JSON-RPC error
#     400 access denied ("<LEVEL>" needed, session level <upl>)       (wording locked, BD-07)
#
# Hardening (fail-closed, numeric):
#  - LEVEL NONE needs no session at all: no lookup happens
#  - the UPL comes from eq3/getupl.hms (StrValueByIndex(';',1) of the ReGa session string) through
#    hmscript_runFromFile, which escapes the session id; an answer that is not a non-negative
#    integer (empty after a ReGa failure, 'abc', '1;2', '-1', '1.5') denies explicitly and is
#    logged to the syslog with the correlation id - there is no string comparison fallback
#  - the comparison is numeric on 0/1/2/8
#  - when the sid-shape library (sidshape.tcl, gated by EG-8) is loaded, its check runs before
#    the lookup; without it the session id is only escaped (the interim state of EG-8)
# The per-sid rate limiter runs before this procedure (dispatcher pipeline), so a limited request
# never reaches the lookup.
##

if { ![array exists USER_LEVEL] } then {
  array set USER_LEVEL {NONE 0 GUEST 1 USER 2 ADMIN 8 0 NONE 1 GUEST 2 USER 8 ADMIN}
}

##
# Denies the request (400 access denied) and ends the script
##
proc privilege_deny { requiredName upl } {
  # session level 0 = no or unknown session (on /api/v2 this is HTTP 401 instead of 403)
  if { "0" == $upl } then { set ::API_AUTH_STATE nosid }
  jsonrpc_error 400 "access denied (\"$requiredName\" needed, session level $upl)"
}

##
# Checks the privilege level of the session of the current request
##
proc checkPrivilegeLevel { p_method p_args } {
  global USER_LEVEL
  upvar $p_method method
  upvar $p_args   args

  if { "NONE" == $method(LEVEL) } then { return }

  # the level must be known (an unknown LEVEL is a registry error: Tcl error -> internal error 200)
  set level $USER_LEVEL($method(LEVEL))

  # the session id must be present (Tcl error otherwise, as in v1)
  set sid $args(_session_id_)

  # optional sid shape check (library gated by EG-8)
  if { 0 < [llength [info commands sidshape_check]] && ![sidshape_check $sid] } then {
    privilege_deny $method(LEVEL) 0
  }

  array set _args_ ""
  set _args_(_session_id_) $sid
  set upl [string trim [hmscript_runFromFile "eq3/getupl.hms" _args_]]

  if { ![regexp {^[0-9]+$} $upl] } then {
    # not a non-negative integer: deny explicitly and log the failure
    if { 0 < [llength [info commands api_logError]] } then {
      api_logError 400 "privilege lookup returned an unusable value '[string range $upl 0 40]'"
    }
    privilege_deny $method(LEVEL) 0
  }

  # numeric comparison (leading zeros must not be read as octal)
  scan $upl %d upl
  if { $level > $upl } then {
    privilege_deny $method(LEVEL) $upl
  }
}

##
# Runs the check for a central; a config-tool request (explicit flag, SP013) skips it and writes
# one syslog line per request.
##
proc privilege_check_if_central { p_method p_args } {
  global central
  upvar $p_method method
  upvar $p_args   args

  if { [info exists central] && "false" == $central } then {
    if { 0 < [llength [info commands api_syslog]] } then {
      api_syslog daemon.warning "privilege check disabled (config-tool mode)"
    } else {
      catch { exec logger -t webui-api -p daemon.warning "privilege check disabled (config-tool mode)" }
    }
    return
  }
  checkPrivilegeLevel method args
}
