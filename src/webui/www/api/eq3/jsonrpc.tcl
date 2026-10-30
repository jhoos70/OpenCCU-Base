##
# jsonrpc.tcl
# JSON-RPC helper functions (staged SP004/SP005; source of record: src/webui/www/api/eq3/jsonrpc.tcl)
#
# v1 behaviour is kept (envelope, JSON text layout, the untyped parser of json.tcl, HTTP status
# 200 with the error in the JSON-RPC member). Changes:
#  - SP004: 102 "method not found in request" / 103 "params not found in request" (v1 had the
#    two messages swapped); the id is echoed with its JSON type; in strict mode and on /api/v2
#    text after the top-level request object is error 100
#  - SP005: an internal error (code 200) is answered as "internal error (ref: <cid>)", the full
#    text and the same correlation id go to the syslog; control characters in a result are
#    escaped; a non-integer error code is coerced to 200; on /api/v2 (global API_V2) the HTTP
#    status follows the locked mapping and an invalid JSON result is answered as HTTP 500
##

# correlation id and syslog logging
source [file join [file dirname [info script]] syslog.tcl]

##
# JSONRPC data.
##
array set JSONRPC    ""
set JSONRPC(METHOD)  ""
set JSONRPC(PARAMS)  ""
set JSONRPC(ID)     "\"error\""
set JSONRPC(ID_USED) 1

##
# The raw JSON token of the top-level member "id" of a request ("" if there is none or the
# text is not parseable). Uses the helper procs of json.tcl.
##
proc jsonrpc_rawId { request } {
  set text $request
  set found ""
  if { [catch {
    if { "\{" != [json_getc text -nospace] } then { error "\{ expected" }
    if { "\}" != [json_preview text -nospace] } then {
      set c ","
      while { "," == $c } {
        set name [json_parseString text]
        set c    [json_getc text -nospace]
        if { ":" == $c } then {
          set text   [string trimleft $text]
          set before $text
          json_parseValue text
          set token [string range $before 0 [expr { [string length $before] - [string length $text] - 1 }]]
          if { "id" == $name } then { set found $token }
          set c [json_getc text -nospace]
        }
      }
    }
  }] } then {
    return ""
  }
  return $found
}

##
# Parses a JSON-RPC request.
##
proc jsonrpc_parse {request} {
  global JSONRPC JSONRPC_ERROR

  if { [catch {
    set text $request
    set parsed [json_parseObject text]
    if { 0 < [llength [info commands api_isStrict]] && [api_isStrict] && "" != [string trim $text] } then {
      return -code error "unexpected text after the request object"
    }
    array set parsedRequest [encoding convertfrom utf-8 $parsed]
  } errMsg] } then {
     jsonrpc_error 100 "invalid request ($errMsg)"
  }

  if { [catch { set JSONRPC(ID) $parsedRequest(id)} ] } then {
    set JSONRPC(ID_USED) 0
  } else {
    # echo the id with its JSON type
    set rawId [jsonrpc_rawId $request]
    if { "" != $rawId } then { set JSONRPC(ID) [encoding convertfrom utf-8 $rawId] }
  }

  if { [catch { set JSONRPC(METHOD) $parsedRequest(method)} ] } then {
    jsonrpc_error 102 "method not found in request"
  }
  if { [catch { set JSONRPC(PARAMS) $parsedRequest(params)} ] } then {
    jsonrpc_error 103 "params not found in request"
  }
}

##
# Is the request served on /api/v2 ?
##
proc jsonrpc_isV2 { } {
  global API_V2
  return [expr { [info exists API_V2] && [string is true -strict $API_V2] }]
}

##
# The HTTP status of a JSON-RPC error code on /api/v2 (locked mapping BD-04, EG-12). The context
# is given by the message text and the globals API_AUTH_STATE ("nosid" for a request without a
# valid session) and API_405_REASON ("content_type" or "xrw").
##
proc jsonrpc_httpStatus { code message } {
  global JSONRPC API_AUTH_STATE API_405_REASON API_HTTP_STATUS
  # an explicit status of the route (e.g. 413 for a batch over the limit, 405 + Allow) wins
  if { [info exists API_HTTP_STATUS] } then { return $API_HTTP_STATUS }
  set method ""
  if { [info exists JSONRPC(METHOD)] } then { set method $JSONRPC(METHOD) }

  switch -exact -- $code {
    100 - 102 - 103 { return 400 }
    400 {
      if { [info exists API_AUTH_STATE] && "nosid" == $API_AUTH_STATE } then { return 401 }
      return 403
    }
    401 { return 404 }
    402 - 403 { return 422 }
    405 {
      if { [info exists API_405_REASON] && "content_type" == $API_405_REASON } then { return 415 }
      return 403
    }
    413 { return 413 }
    429 { return 429 }
    501 {
      if { "Session.login" == $method } then { return 401 }
      return 502
    }
    503 {
      if { "Session.login" == $method } then { return 503 }
      return 502
    }
    200 { return 500 }
    500 {
      if { "path not allowed" == $message } then { return 403 }
      if { [string match "name already exists*" $message] } then { return 409 }
      return 500
    }
  }
  if { ($code >= 501 && $code <= 507) || $code == 599 || ($code >= 601 && $code <= 604) } then { return 502 }
  return 500
}

##
# The headers every /api/v2 response carries: the correlation id (BD-05) and the extra headers
# collected in API_EXTRA_HEADERS (Allow, Set-Cookie)
##
proc jsonrpc_v2Headers { } {
  global API_EXTRA_HEADERS
  puts "X-Correlation-Id: [api_cid]"
  if { [info exists API_EXTRA_HEADERS] } then {
    foreach h $API_EXTRA_HEADERS { puts $h }
  }
}

##
# Sends a JSON-RPC error code and ends the script.
##
proc jsonrpc_error {errorCode errorText} {
  global JSONRPC

  # a programming error: the code has to be an integer
  if { ![string is integer -strict $errorCode] } then {
    api_logError 200 "invalid error code '$errorCode' for: $errorText"
    set errorCode 200
    set errorText "internal error"
  }

  # internal errors never carry errorInfo or paths: generic text + correlation id, the full text
  # goes to the syslog
  set cid ""
  if { 200 == $errorCode } then {
    if { ![regexp {^internal error \(ref: [0-9a-f]{16}\)$} $errorText] } then {
      api_logError 200 $errorText
      set errorText "internal error (ref: [api_cid])"
    }
    regexp {\(ref: ([0-9a-f]{16})\)} $errorText -> cid
  }

  set errorCode [encoding convertto utf-8 $errorCode]
  set errorText [encoding convertto utf-8 $errorText]
  set JSONRPC(ID) [encoding convertto utf-8 $JSONRPC(ID)]

  if { [jsonrpc_isV2] } then {
    puts "Status: [jsonrpc_httpStatus $errorCode $errorText]"
    jsonrpc_v2Headers
    if { 429 == $errorCode } then {
      global API_RETRY_AFTER
      if { [info exists API_RETRY_AFTER] } then { puts "Retry-After: $API_RETRY_AFTER" }
    }
  }
  puts "CONTENT-TYPE: application/json; charset=utf-8"
  puts ""
  puts "\{"

  if { $JSONRPC(ID_USED) } then {
    puts "  \"id\": $JSONRPC(ID),"
  }

  puts "  \"version\": \"1.1\","
  puts "  \"result\": null,"
  puts "  \"error\": \{"
  puts "    \"name\": \"JSONRPCError\","
  puts "    \"code\": $errorCode,"
  puts "    \"message\": [json_toString $errorText]"
  puts "  \}"

  puts "\}"

  exit
}

##
# Sends a JSON-RPC response. The script is NOT ended.
##
proc jsonrpc_response {result} {
  global JSONRPC

  # control characters would make the document invalid JSON
  set result [json_escapeControl $result]

  # v2 never emits an invalid document
  if { [jsonrpc_isV2] && "" != [string trim $result] && ![json_isValid $result] } then {
    jsonrpc_error 200 "internal error: the method produced an invalid JSON result"
  }

  if { [jsonrpc_isV2] } then {
    # v2 hooks: the session cookie (cookie_mode) is set from the result of Session.login
    if { 0 < [llength [info commands v2_beforeResponse]] } then { v2_beforeResponse $result }
    jsonrpc_v2Headers
  }

  set result      [encoding convertto utf-8 $result]
  set JSONRPC(ID) [encoding convertto utf-8 $JSONRPC(ID)]

  puts "CONTENT-TYPE: application/json; charset=utf-8"
  puts ""


  puts -nonewline "\{"
  if { $JSONRPC(ID_USED) } then {
    puts -nonewline "\"id\": $JSONRPC(ID),"
  }
  puts -nonewline "\"version\": \"1.1\","
  if { [string trim $result] != "" } {
    puts -nonewline "\"result\": $result,"
  } else {
    puts -nonewline "\"result\": null,"
  }
  puts -nonewline "\"error\": null"
  puts -nonewline "\}"
}
