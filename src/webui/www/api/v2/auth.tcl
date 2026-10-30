##
# v2/auth.tcl - session handling of the /api/v2 routes (staged SP001, T139e; consumer of IC002
# session_isValid of security-session). Locked values (BD-05):
#   sid          header X-Session-Id; it wins over params._session_id_ and over the cookie, a
#                mismatch is written to the syslog
#   anti-CSRF    header X-Requested-With (any non-empty value), checked by executor_checkTransport
#   cookie       only with cookie_mode=true: hm_sid, attributes "HttpOnly; SameSite=Strict;
#                Path=/api", plus "Secure" when HTTPS is set in the CGI environment, no Max-Age
#                (a session cookie; the ReGa timeout of 900 s applies). It is set from the result
#                of Session.login and cleared after Session.logout.
# The sid is passed on to the privilege check (getupl.hms) as args(_session_id_); a request
# without a valid session is HTTP 401 (API_AUTH_STATE nosid), a session with too low a level 403.
##

##
# The value of a request header ("" if absent): v2_header X-Session-Id
##
proc v2_header { name } {
  global env
  set key HTTP_[string map {- _} [string toupper $name]]
  if { [info exists env($key)] } then { return [string trim $env($key)] }
  return ""
}

##
# The value of a cookie of the Cookie header ("" if absent)
##
proc v2_cookie { name } {
  global env
  if { ![info exists env(HTTP_COOKIE)] } then { return "" }
  foreach part [split $env(HTTP_COOKIE) ";"] {
    set part [string trim $part]
    set eq [string first "=" $part]
    if { $eq > 0 && $name eq [string range $part 0 [expr { $eq - 1 }]] } then {
      return [string trim [string range $part [expr { $eq + 1 }] end]]
    }
  }
  return ""
}

proc v2_log { text } {
  global JSONRPC
  set method ""
  if { [info exists JSONRPC(METHOD)] } then { set method $JSONRPC(METHOD) }
  api_syslog daemon.warning "cid=[api_cid] method=$method uid=- code=0 errorInfo=$text"
}

##
# Chooses the sid of the request (header, then params, then cookie) and stores it in
# args(_session_id_); logs a mismatch of the sources
##
proc v2_authApply { p_args } {
  upvar $p_args args

  set header [v2_header X-Session-Id]
  set param ""
  if { [info exists args(_session_id_)] } then { set param $args(_session_id_) }
  set cookie ""
  if { [string is true -strict [api_config cookie_mode false]] } then { set cookie [v2_cookie hm_sid] }

  set sid $header
  if { "" == $sid } then { set sid $param }
  if { "" == $sid } then { set sid $cookie }

  foreach other [list $param $cookie] {
    if { "" != $other && "" != $sid && $other ne $sid } then {
      v2_log "session id mismatch between the sources (header, parameter, cookie); the header wins"
      break
    }
  }

  if { "" != $sid } then {
    set args(_session_id_) $sid
  } else {
    global API_AUTH_STATE
    set API_AUTH_STATE nosid
  }
}

##
# A non-NONE method without a sid on /api/v2: 400 access denied (HTTP 401)
##
proc v2_noSid { } {
  global method API_AUTH_STATE
  if { ![jsonrpc_isV2] } then { return }
  set API_AUTH_STATE nosid
  jsonrpc_error 400 "access denied (\"$method(LEVEL)\" needed, session level 0)"
}

##
# IC002: is the session valid? session_isValid of security-session takes the sid with its '@'
# wrappers; the header carries the id as returned by Session.login (inner id), so both forms are
# tried. Without the library every sid is accepted here (the privilege check decides).
##
proc v2_sessionValid { sid } {
  global env
  if { "" == $sid } then { return false }
  # IC002: the session library of security-session (/www/tcl/eq3/session.tcl), loaded on demand
  if { 0 == [llength [info commands session_isValid]] } then {
    catch {
      uplevel #0 [list source [file join $env(DOCUMENT_ROOT) tcl/eq3/rega.tcl]]
      uplevel #0 [list source [file join $env(DOCUMENT_ROOT) tcl/eq3/session.tcl]]
    }
  }
  if { 0 == [llength [info commands session_isValid]] } then { return true }
  if { "true" == [session_isValid $sid] } then { return true }
  if { "@" != [string index $sid 0] && "true" == [session_isValid "@$sid@"] } then { return true }
  return false
}

##
# IC002 wiring: with the flag sid_shape_strict (EG-8 gate, default false) a /api/v2 request for a
# method above LEVEL NONE needs a session that session_isValid confirms; false is 'not
# authenticated' (HTTP 401) before the privilege lookup and the method script. Without the flag
# the privilege lookup alone decides.
##
proc v2_requireValidSession { } {
  global args
  if { ![jsonrpc_isV2] } then { return }
  if { ![string is true -strict [api_config sid_shape_strict false]] } then { return }
  set sid ""
  if { [info exists args(_session_id_)] } then { set sid $args(_session_id_) }
  if { "" == $sid || ![string is true -strict [v2_sessionValid $sid]] } then {
    set ::API_AUTH_STATE nosid
    jsonrpc_error 400 "access denied (session level 0)"
  }
}

proc v2_cookieAttributes { } {
  global env
  set attrs "HttpOnly; SameSite=Strict; Path=/api"
  if { [info exists env(HTTPS)] && "" != $env(HTTPS) && "off" ne [string tolower $env(HTTPS)] } then {
    append attrs "; Secure"
  }
  return $attrs
}

##
# Called by jsonrpc_response on /api/v2: sets the session cookie after Session.login (cookie_mode)
# and clears it after Session.logout
##
proc v2_beforeResponse { result } {
  global JSONRPC API_EXTRA_HEADERS
  if { ![string is true -strict [api_config cookie_mode false]] } then { return }
  if { "Session.login" eq $JSONRPC(METHOD) && [regexp {^\s*"([A-Za-z0-9@]+)"\s*$} $result -> sid] } then {
    lappend API_EXTRA_HEADERS "Set-Cookie: hm_sid=[string trim $sid @]; [v2_cookieAttributes]"
  } elseif { "Session.logout" eq $JSONRPC(METHOD) } then {
    lappend API_EXTRA_HEADERS "Set-Cookie: hm_sid=; [v2_cookieAttributes]; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  }
}
