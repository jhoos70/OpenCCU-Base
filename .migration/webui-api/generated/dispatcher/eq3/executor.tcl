##
# executor.tcl - the method executor of the dispatcher (staged SP001, T139c; IC004 interface-gateway,
# IC005 rega-model, IC006 system-admin, IC007 user-profile, IC016 session methods)
#
# The pipeline of one JSON-RPC request (v1 /api/homematic.cgi and v2 /api/v2/rpc share it):
#   transport check (strict mode / v2) -> parse -> sid (v2: header) -> per-sid limiter -> lookup ->
#   privilege check -> argument-presence check -> script sourcing.
# The script of a method is named ONLY by methods.conf (SCRIPT_FILE, relative to api/methods; for
# the interface methods interface/dispatch.tcl reads METHOD_FILE); a client value never selects a
# path. The script is sourced in the global scope with the arrays 'method' (registry entry) and
# 'args' (params) as in v1 and emits its answer with jsonrpc_response / jsonrpc_error.
#
# Error codes: 401 method not found, 400 access denied (privilege.tcl), 402 missing argument,
# 405 strict-mode transport violation (v2: HTTP 415 for the content type, 403 for the missing
# X-Requested-With), 429 rate limit exceeded, 200 internal error (any Tcl error: the full text goes
# to the syslog with the correlation id, the client only sees the reference).
##

if { ![array exists USER_LEVEL] } then {
  array set USER_LEVEL {NONE 0 GUEST 1 USER 2 ADMIN 8 0 NONE 1 GUEST 2 USER 8 ADMIN}
}

##
# Returns the registry entry (list for 'array set') of a method; 401 if there is none.
# The match is exact and case-sensitive.
##
proc executor_lookup { name } {
  global METHOD_LIST
  if { [info exists METHOD_LIST($name)] } then { return $METHOD_LIST($name) }
  jsonrpc_error 401 "method not found ($name)"
}

##
# Fallback privilege check, used only when security-session's privilege.tcl is not installed:
# numeric comparison of the session level with the method level (v1 semantics).
##
if { 0 == [llength [info commands checkPrivilegeLevel]] } then {
  proc checkPrivilegeLevel { p_method p_args } {
    global USER_LEVEL
    upvar $p_method method
    upvar $p_args   args

    if { "NONE" != $method(LEVEL) } then {
      array set _args_ ""
      set _args_(_session_id_) $args(_session_id_)

      set level $USER_LEVEL($method(LEVEL))
      set upl   [hmscript_runFromFile "eq3/getupl.hms" _args_]
      if { $level > $upl } then {
        jsonrpc_error 400 "access denied (\"$method(LEVEL)\" needed $upl)"
      }
    }
  }
}

##
# Checks that every declared argument is present (the FIRST missing one in ARGUMENTS order is
# reported)
##
proc executor_checkArguments { p_method p_args } {
  upvar $p_method method
  upvar $p_args   args

  foreach argName $method(ARGUMENTS) {
    if { ![info exists args($argName)] } then {
      jsonrpc_error 402 "missing argument ($argName)"
    }
  }
}

##
# Sources the script of the method in the global scope
##
proc executor_source { p_method } {
  global env
  upvar $p_method method

  set file $method(SCRIPT_FILE)
  # the registry is trusted, but a path leaving api/methods is refused anyway
  if { ![regexp {^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*\.tcl$} $file] } then {
    error "invalid SCRIPT_FILE in the registry"
  }
  uplevel #0 [list source [file join $env(DOCUMENT_ROOT) "api/methods/$file"]]
}

##
# Strict mode (flag strict_mode) and every v2 route: the request has to be Content-Type
# application/json and carry a non-empty X-Requested-With header (anti-CSRF). Violations are
# answered before the body is read: 405 (v2: HTTP 415 resp. 403).
##
proc executor_checkTransport { {needBody 1} } {
  global env API_405_REASON

  if { ![api_isStrict] } then { return }

  # the content type only matters for requests that carry a body
  if { $needBody } then {
    set ct ""
    catch { set ct $env(CONTENT_TYPE) }
    set ct [string tolower [string trim [lindex [split $ct ";"] 0]]]
    if { "application/json" != $ct } then {
      set API_405_REASON content_type
      jsonrpc_error 405 "unsupported content type (application/json required)"
    }
  }

  set xrw ""
  catch { set xrw [string trim $env(HTTP_X_REQUESTED_WITH)] }
  if { "" == $xrw } then {
    set API_405_REASON xrw
    jsonrpc_error 405 "header X-Requested-With required"
  }
}

##
# The sid of the request ("" if there is none): v2 header first (v2/auth.tcl merges it into
# args(_session_id_)), else the parameter
##
proc executor_sid { p_args } {
  upvar $p_args args
  if { [info exists args(_session_id_)] } then { return $args(_session_id_) }
  return ""
}

##
# The per-sid limiter (counts one HTTP request once); ends the request with 429 if exceeded.
# Skipped without any file access when the limiter is not active.
##
proc executor_limit { sid } {
  global API_RETRY_AFTER
  if { 0 == [llength [info commands ::sidlimit::check]] } then { return }
  # the config gate: the limiter is not even called in the default configuration
  if { ![::sidlimit::enabled] || "" == $sid } then { return }
  lassign [::sidlimit::check $sid] limited retry
  if { $limited } then {
    set API_RETRY_AFTER $retry
    jsonrpc_error 429 "rate limit exceeded"
  }
}

##
# Lookup, privilege check, argument check, script of the (already parsed) request. 'central'
# false (config-tool deployment) skips the privilege check with one syslog line per request.
##
proc executor_dispatch { } {
  global JSONRPC central method args

  array unset method
  array set method [executor_lookup $JSONRPC(METHOD)]

  # a non-NONE method needs the sid before anything else (402 instead of a Tcl error)
  if { "NONE" != $method(LEVEL) && ![info exists args(_session_id_)] } then {
    if { 0 < [llength [info commands v2_noSid]] } then { v2_noSid }
    jsonrpc_error 402 "missing argument (_session_id_)"
  }

  # IC019: a LEVEL NONE method outside the unauthenticated allow-list is refused (fail closed)
  if { "NONE" == $method(LEVEL) && 0 < [llength [info commands unauthenticated_allow_list_check]] && ![unauthenticated_allow_list_check $JSONRPC(METHOD)] } then {
    jsonrpc_error 400 "access denied (\"NONE\" method is not on the unauthenticated allow-list)"
  }

  # IC002: the strict session check of /api/v2 (flag sid_shape_strict, default off)
  if { "NONE" != $method(LEVEL) && 0 < [llength [info commands v2_requireValidSession]] } then { v2_requireValidSession }

  if { ![info exists central] || [string is true -strict $central] } then {
    checkPrivilegeLevel method args
  } elseif { "NONE" != $method(LEVEL) } then {
    api_syslog daemon.warning "privilege check disabled (config-tool mode) method=$JSONRPC(METHOD)"
  }

  executor_checkArguments method args
  # central validation (SP032 acceptance[8]) before the script runs
  if { 0 < [llength [info commands validate_request]] } then { validate_request method args }
  # IC003: the script sees only the declared parameters (undeclared names are dropped, a control
  # character in a declared value is error 403)
  if { 0 < [llength [info commands hmscript_whitelist]] } then { hmscript_whitelist $method(ARGUMENTS) args }
  executor_source method
}

##
# Parses the body, merges the v2 sid, applies the limiter and dispatches
##
proc executor_request { body {limit 1} } {
  global JSONRPC args

  jsonrpc_parse $body
  array unset args
  array set args $JSONRPC(PARAMS)

  if { 0 < [llength [info commands v2_authApply]] && [jsonrpc_isV2] } then { v2_authApply args }

  # a batch is limited once as a whole (the caller passes limit 0 for its elements)
  if { $limit } then { executor_limit [executor_sid args] }
  executor_dispatch
}
