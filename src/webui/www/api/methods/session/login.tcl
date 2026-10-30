##
# Session.login
# Creates a session by posting the credentials to the local login page (staged SP031).
#
# Parameters:
#   username: [string]
#   password: [string]
#
# Return value: [string] the inner session id (without the '@' wrappers)
#
# Errors: 503 "service not available" (login page answers 503), 501 "invalid credentials or too
# many sessions" (no sid in the Location header). v1 behaviour is kept; credentials are never
# logged.
##

package require http

set LOGIN_URL http://127.0.0.1/login.htm

proc getHttpHeader { pRequest headerName } {
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

set username $args(username)
set password $args(password)

# per-IP login limiter (opt-in: rate_limit / strict_mode / /api/v2; skipped entirely by default)
source eq3/ratelimit.tcl
set _remoteAddr_ ""
if { [info exists env(REMOTE_ADDR)] } then { set _remoteAddr_ $env(REMOTE_ADDR) }
lassign [ratelimit::login_ip_check $_remoteAddr_] _limited_ _retryAfter_
if { $_limited_ } then {
  # the wire mapping (HTTP 200 on v1, HTTP 429 + Retry-After on v2) is done by the dispatcher
  set API_RETRY_AFTER $_retryAfter_
  jsonrpc_error 429 "rate limit exceeded"
}

set request [::http::geturl $LOGIN_URL -query [::http::formatQuery tbUsername $username tbPassword $password]]
set location [getHttpHeader $request location]
set code     [::http::code $request]
::http::cleanup $request

if { -1 != [string first 503 $code] } then {
  jsonrpc_error 503 "service not available"
}

if { ![regexp {sid=@([^@]*)@} $location dummy sid] } then {
  jsonrpc_error 501 "invalid credentials or too many sessions"
}

jsonrpc_response [json_toString $sid]
