##
# Event.unsubscribe (staged SP029)
# Cancels the subscription of event notifications.
#
# Parameters:
#  _session_id_: [string] session id
#
# Return value [boolean]
#   true if the unsubscription was successful
#   false if an error occurred (e.g. the lock was not obtained, or the session is not subscribed:
#   the list is then not rewritten)
##

set id     $args(_session_id_)
set result false

set queuePath [event_queue_path $id]

if { "" != $queuePath && [lock_tryget $EVENT_LOCK_FILE] } then {
	catch {
		array set subscriberList [file_load $EVENT_SUBSCRIBER_LIST_FILE]
		file delete -force -- $queuePath
		unset subscriberList($id)
		event_save_atomic $EVENT_SUBSCRIBER_LIST_FILE [array get subscriberList]
		set result true
	}
	lock_release $EVENT_LOCK_FILE
}

jsonrpc_response $result
