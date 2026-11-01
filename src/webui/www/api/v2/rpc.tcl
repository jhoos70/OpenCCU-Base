##
# v2/rpc.tcl - POST /api/v2/rpc and POST /api/v2/batch (staged SP001, T137, T137f)
#
#  /api/v2/rpc    the v1 pipeline (executor_request) with a real HTTP status (BD-04, jsonrpc.tcl),
#                 the sid from the header X-Session-Id, Content-Type application/json and
#                 X-Requested-With required (executor_checkTransport via api_isStrict)
#  /api/v2/batch  a JSON array of 1..batch_limit (default 20) request objects; the response is
#                 an array of the response envelopes in request order; a failing element does
#                 not abort the others; a batch over the limit is rejected before anything is
#                 executed with HTTP 413 and error 403 "invalid argument (batch)"
# The per-sid limiter counts a batch ONCE (EG-26). Limiter outcome (T137f): v2 answers HTTP 429
# with Retry-After and the error body 429 "rate limit exceeded" (jsonrpc_error, v1: HTTP 200).
#
# Isolation of the batch elements: the output of an element is captured (puts / exit are wrapped
# while the batch runs), so jsonrpc_error ends only its element. A method script that catches the
# end of its own element would run on (limitation of the wrapper; no v1 method does that).
##

##
# The body of the request
##
proc v2_readBody { } {
  global env
  # a request without a usable Content-Length has no body for us (the handler then answers "invalid request")
  if { ![info exists env(CONTENT_LENGTH)] || ![regexp {^[0-9]{1,9}$} $env(CONTENT_LENGTH)] } then { return "" }
  scan $env(CONTENT_LENGTH) %d n
  return [read stdin $n]
}

##
# The raw JSON texts of the elements of a top-level JSON array; an invalid document is error 100
##
proc v2_splitBatch { request } {
  set text $request
  set elements {}
  if { [catch {
    if { "\[" != [json_getc text -nospace] } then { error "array expected" }
    if { "\]" == [json_preview text -nospace] } then {
      json_getc text -nospace
    } else {
      set c ","
      while { "," == $c } {
        set text   [string trimleft $text]
        set before $text
        json_parseValue text
        lappend elements [string range $before 0 [expr { [string length $before] - [string length $text] - 1 }]]
        set c [json_getc text -nospace]
      }
      if { "\]" != $c } then { error "\] expected" }
    }
    if { "" != [string trim $text] } then { error "text after the array" }
  } cause] } then {
    global JSONRPC
    set JSONRPC(ID_USED) 0
    jsonrpc_error 100 "invalid request ($cause)"
  }
  return $elements
}

##
# Output capture for the elements of a batch
##
proc v2_captureStart { } {
  global V2_CAPTURE
  set V2_CAPTURE ""
  if { 0 == [llength [info commands ::__v2_puts]] } then {
    rename ::puts ::__v2_puts
    proc ::puts { args } {
      global V2_CAPTURE
      if { [info exists V2_CAPTURE] } then {
        set a $args
        set newline 1
        if { "-nonewline" == [lindex $a 0] } then { set newline 0; set a [lrange $a 1 end] }
        if { 1 == [llength $a] || (2 == [llength $a] && "stdout" == [lindex $a 0]) } then {
          append V2_CAPTURE [lindex $a end] [expr { $newline ? "\n" : "" }]
          return
        }
      }
      uplevel 1 [list ::__v2_puts {*}$args]
    }
    rename ::exit ::__v2_exit
    proc ::exit { {code 0} } {
      global V2_CAPTURE
      if { [info exists V2_CAPTURE] } then {
        return -code error -errorcode {V2 ELEMENT END} "element ended"
      }
      ::__v2_exit $code
    }
  }
}

proc v2_captureStop { } {
  global V2_CAPTURE
  unset -nocomplain V2_CAPTURE
  if { 0 < [llength [info commands ::__v2_puts]] } then {
    rename ::puts {}
    rename ::__v2_puts ::puts
    rename ::exit {}
    rename ::__v2_exit ::exit
  }
}

##
# Runs one element and returns its response document
##
proc v2_batchElement { element } {
  global JSONRPC V2_CAPTURE API_AUTH_STATE API_HTTP_STATUS API_RETRY_AFTER

  array unset JSONRPC
  set JSONRPC(METHOD)  ""
  set JSONRPC(PARAMS)  ""
  set JSONRPC(ID)      "\"error\""
  set JSONRPC(ID_USED) 1
  unset -nocomplain API_AUTH_STATE API_HTTP_STATUS API_RETRY_AFTER

  set V2_CAPTURE ""
  set rc [catch { executor_request $element 0 } message opts]
  if { $rc && [dict get $opts -errorcode] ne {V2 ELEMENT END} } then {
    catch { jsonrpc_error 200 "internal error:\n[dict get $opts -errorinfo]" }
  }
  set out $V2_CAPTURE
  set V2_CAPTURE ""

  # strip the header block
  set i [string first "\n\n" $out]
  if { $i >= 0 } then { set out [string range $out [expr { $i + 2 }] end] }
  set out [string trim $out]
  if { "" == $out } then {
    # the method produced no document: a null result (jsonrpc_response "")
    set id ""
    if { $JSONRPC(ID_USED) } then { set id "\"id\": $JSONRPC(ID)," }
    set out "\{${id}\"version\": \"1.1\",\"result\": null,\"error\": null\}"
  }
  return $out
}

##
# The sid that counts for the per-sid limiter of a batch: header, cookie, else the first element
##
proc v2_batchSid { elements } {
  set sid [v2_header X-Session-Id]
  if { "" == $sid && [string is true -strict [api_config cookie_mode false]] } then { set sid [v2_cookie hm_sid] }
  if { "" == $sid && 0 < [llength $elements] } then {
    catch {
      array set first [json_parse [lindex $elements 0]]
      array set p $first(params)
      set sid $p(_session_id_)
    }
  }
  return $sid
}

proc v2_rpc_handle { } {
  executor_request [v2_readBody]
}

proc v2_batch_handle { } {
  global JSONRPC API_HTTP_STATUS

  set elements [v2_splitBatch [v2_readBody]]
  set JSONRPC(ID_USED) 0

  set limit [api_config batch_limit 20]
  if { ![string is integer -strict $limit] || $limit < 1 } then { set limit 20 }
  set n [llength $elements]
  if { $n > $limit } then {
    set API_HTTP_STATUS 413
    jsonrpc_error 403 "invalid argument (batch)"
  }
  if { 0 == $n } then {
    jsonrpc_error 403 "invalid argument (batch)"
  }

  executor_limit [v2_batchSid $elements]

  v2_captureStart
  set docs {}
  foreach el $elements { lappend docs [v2_batchElement $el] }
  v2_captureStop

  jsonrpc_v2Headers
  puts "CONTENT-TYPE: application/json; charset=utf-8"
  puts ""
  puts -nonewline "\[[join $docs ,]\]"
}
