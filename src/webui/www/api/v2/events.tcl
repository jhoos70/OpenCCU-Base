##
# v2/events.tcl - GET /api/v2/events?timeout=<1..55> (staged SP029, IC008, T186; BD-09, BD-12)
#
# Long poll on the per-session event queue (eq3/event.tcl): the CGI holds the connection until an
# event is queued or the timeout (default 25 s, maximum long_poll_max_seconds 55 s) is over and
# then answers HTTP 200 with the array of the queued events [{type,data}] (empty on timeout).
# GUEST or higher; no valid sid is HTTP 401 before anything is read; timeout outside 1..55 or
# malformed is HTTP 422 with error 403 "invalid argument (timeout)". A client that has not
# subscribed is registered as subscriber on its first request (its queue is not truncated).
# The wait is counted in steps of 500 ms (the loop never exceeds the timeout, also when the clock
# is frozen). SSE is only available through the gated gateway.
##

set EVENTS_DEFAULT_TIMEOUT 25
set EVENTS_MAX_TIMEOUT 55

##
# Registers the session as subscriber if it is missing (queue file and list entry); true if the
# lock could be obtained
##
proc events_ensureSubscriber { id } {
  global EVENT_LOCK_FILE EVENT_SUBSCRIBER_LIST_FILE
  if { ![lock_tryget $EVENT_LOCK_FILE] } then { return 0 }
  set ok 1
  if { [catch {
    array set subscriberList [file_load $EVENT_SUBSCRIBER_LIST_FILE]
    if { ![info exists subscriberList($id)] } then {
      set subscriberList($id) [list EVENT_COUNT 0]
      event_save_atomic $EVENT_SUBSCRIBER_LIST_FILE [array get subscriberList]
    }
  }] } then { set ok 0 }
  lock_release $EVENT_LOCK_FILE
  return $ok
}

##
# Takes the queued events of the session (list of events, {} if none or the lock is busy)
##
proc events_take { id } {
  global EVENT_LOCK_FILE
  set path [event_queue_path $id]
  set events {}
  if { "" != $path && [lock_tryget $EVENT_LOCK_FILE] } then {
    catch {
      set events [file_load $path]
      file_clear $path
      event_reset_count $id
    }
    lock_release $EVENT_LOCK_FILE
  }
  return $events
}

proc events_json { events } {
  set parts {}
  foreach _event $events {
    array set event $_event
    lappend parts "\{\"type\":[json_toString $event(TYPE)],\"data\":$event(DATA)\}"
    array unset event
  }
  return "\[[join $parts ,]\]"
}

proc v2_events_handle { } {
  global V2_SID V2_QUERY EVENTS_DEFAULT_TIMEOUT EVENTS_MAX_TIMEOUT

  v2_requireLevel GUEST

  set timeout $EVENTS_DEFAULT_TIMEOUT
  if { [regexp {(?:^|&)timeout=([^&]*)} $V2_QUERY -> t] } then {
    if { ![regexp {^[0-9]{1,3}$} $t] || [scan $t %d n] < 1 || $n < 1 || $n > $EVENTS_MAX_TIMEOUT } then {
      jsonrpc_error 403 "invalid argument (timeout)"
    }
    set timeout $n
  }

  if { "" == [event_queue_path $V2_SID] } then { jsonrpc_error 403 "invalid argument (sid)" }
  events_ensureSubscriber $V2_SID

  set steps [expr { $timeout * 2 }]
  set events {}
  for { set i 0 } { $i < $steps } { incr i } {
    set events [events_take $V2_SID]
    if { [llength $events] > 0 } then { break }
    after 500
  }
  v2_respondJson [events_json $events]
}
