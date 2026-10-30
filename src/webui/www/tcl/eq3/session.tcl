##
# session.tcl
# Session management (staged SP007; source of record: src/webui/www/tcl/eq3/session.tcl)
#
# v1 behaviour is kept (same procedures, same session id shape '@' + 10 characters + '@').
# Hardening:
#  - session_isValid is fail-closed: it returns exactly "true" or "false"; a failing ReGa or any
#    other answer is "false" (v1 returned '' on a ReGa failure)
#  - an id that contains a quote, backslash, newline or other control character is refused
#    ("false" / '') without contacting ReGa; an accepted id is embedded only after escaping
# The stricter sid shape ^@?[A-Za-z0-9]{10}@?$ is gated by EG-8 (sidshape.tcl, flag
# sid_shape_strict) and is not part of this library.
##

package require http

set LOGIN_URL http://127.0.0.1/login.htm
set RENEW_URL http://127.0.0.1/pages/index.htm

##
# session_getHttpHeader
# Returns the value of an HTTP header, or "" if the header is not set
#
# @param  pRequest   [string] HTTP token
# @param  headerName [string] name of the HTTP header
# @return [string] value of the HTTP header or ""
##
proc session_getHttpHeader { pRequest headerName } {
  upvar $pRequest request

  set headerName [string toupper $headerName]
  array set meta $request(meta)
  foreach header [array names meta] {
    if {$headerName == [string toupper $header] } then {
      return $meta($header)
    }
  }

  return ""
}

##
# session_login
# Creates a session and performs the user login
#
# @param  username [string] user name
# @param  password [string] password
# @return [string] session id
#
# @throws "create", if no session id could be created (e.g. too many concurrent sessions)
# @throws "credentials", if the user name or the password are wrong
##
proc session_login { username password } {
  global LOGIN_URL

  # step 1: user login and session creation

  set request  [::http::geturl $LOGIN_URL -query [::http::formatQuery tbUsername $username tbPassword $password]]
  set location [session_getHttpHeader $request location]
  set code     [::http::code $request]
  ::http::cleanup $request

  if { -1 != [string first 503 $code] } then {
    error "create"
  }

	if { ![regexp {sid=@([^@]*)@} $location dummy sid] } then {
    error "credentials"
  }

  return $sid
}

##
# session_isSafe
# Is the id usable inside a ReGa string literal? (no quote, backslash, newline or other control
# character)
##
proc session_isSafe { sid } {
  return [expr { ![regexp {["'\\[:cntrl:]]} $sid] }]
}

##
# session_escape
# The escaping of hmscript_escapeString: backslash, quotes, newline, CR and TAB
##
proc session_escape { str } {
  return [string map {
    "\\" "\\\\"
    "\'" "\\\'"
    "\"" "\\\""
    "\n" "\\n"
    "\r" "\\r"
    "\t" "\\t"
  } $str]
}

##
# session_isValid
# Checks whether a session is valid
#
# @param  sid [string] session id ('@' + 10 characters + '@')
# @return [bool] the literal "true" for a valid session, "false" for everything else
##
proc session_isValid { sid } {

  if {
    ([string index $sid 0] != "@")
    || ([string index $sid [expr [string length $sid] -1]]  != "@")
    || ([string length $sid] != 12)
    || ![session_isSafe $sid]} {

   return false
  }

  set    script "var _session_id_ = \"[session_escape $sid]\";"
  append script {
    var result = false;
    var s  = system.GetSessionVarStr(_session_id_);
    if (s) { result = true; }
    Write(result);
  }

  if { "true" == [string trim [rega_exec $script]] } then {
    return true
  }
  return false
}

##
# session_getUserId
# Returns the id of the logged in user
#
# @param sid [string] session id
# @return [string] user id or ""
##
proc session_getUserId { sid } {
	if { ![session_isSafe $sid] } then { return "" }

	set script "var id = \"[session_escape $sid]\";"
	append script {
		var s = system.GetSessionVarStr(id);
		Write(s.StrValueByIndex(";",0));
	}

	return [rega_exec $script]
}

##
# session_renew
# Renews a session
#
# @param sid [string] session id
##
proc session_renew { sid } {
  global RENEW_URL

  ::http::cleanup [::http::geturl "$RENEW_URL?sid=@$sid@"]
}


##
# session_logout
# Closes a running session. For an invalid session nothing happens and no error is raised.
#
# @param sid [string] session id
##
proc session_logout { sid } {
  if {[session_isValid $sid] == true} {
    rega_exec "system.ClearSessionID(\"[session_escape $sid]\");"
  }
}
