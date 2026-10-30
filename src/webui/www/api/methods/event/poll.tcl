##
# Event.poll (staged SP029)
# Asks for the pending events
#
# Parameters:
#   _session_id_: [string] session id
#
# Return value: [array] [{type, data}]; [] if there are no events or the lock was not obtained
#
# Change against v1 (acceptance[7]): after the queue was cleared the pending counter of the
# subscriber is reset, so a subscriber that reached the limit of 64 events receives the next ones.
##

set id     $args(_session_id_)
set events ""

set queuePath [event_queue_path $id]

if { "" != $queuePath && [lock_tryget $EVENT_LOCK_FILE] } then {
	catch {
		set events [file_load $queuePath]
		file_clear $queuePath
		event_reset_count $id
	}
	lock_release $EVENT_LOCK_FILE
}

set result "\["
set first  1

foreach _event $events {
	array set event $_event

	if { 1 != $first } then { append result "," } else { set first 0 }
	append result "\{"
	append result "\"type\":[json_toString $event(TYPE)]"
	append result " ,\"data\":$event(DATA)"
	append result "\}"

	array_clear event
}
append result "\]"

jsonrpc_response $result
