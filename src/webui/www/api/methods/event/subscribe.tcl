##
# Event.subscribe (staged SP029)
# Subscribes to event notifications
#
# Parameters:
#   _session_id_: [string] session id
#
# Return value: [boolean]
#   true if the subscription was successful
#   false if it was not (e.g. the lock could not be obtained)
#
# Changes against v1 (acceptance[5], [6]):
#  - the other subscribers are checked with eq3/checksid.hms (v1 called the non-existing
#    common/checksid.hms, so every other subscriber was dropped); only subscribers whose answer
#    is not 'true' are removed together with their queue file
#  - the result is exactly true or false (v1 could answer a quoted debug string "<id> a")
#  - 'init' is fired after the lock was released (event_fire takes the exclusive lock itself)
#  - the session id has to be a valid queue name (403 "invalid argument (_session_id_)")
##

####################
# Helper procedures #
####################

##
# Checks whether a session id is valid
##
proc isValid { id } {
	array set args ""
	set args(_session_id_) $id

	return [string trim [hmscript_runFromFile "eq3/checksid.hms" args]]
}

##################
# Entry point    #
##################

set id     $args(_session_id_)
set result false

set queuePath [event_queue_path $id]
if { "" == $queuePath } then {
  jsonrpc_error 403 "invalid argument (_session_id_)"
}

if { [lock_tryget $EVENT_LOCK_FILE] } then {
	catch {
		file_clear $queuePath

		array set subscriberList [file_load $EVENT_SUBSCRIBER_LIST_FILE]

		foreach _id [array names subscriberList] {
			if { "true" != [isValid $_id] } then {
				unset subscriberList($_id)
				set _path [event_queue_path $_id]
				if { "" != $_path } then { file delete -force -- $_path }
			}
		}

		set subscriberList($id) [list EVENT_COUNT 0]
		event_save_atomic $EVENT_SUBSCRIBER_LIST_FILE [array get subscriberList]

		set result true
	}
	lock_release $EVENT_LOCK_FILE
	if { $result } then { event_fire init null }
}

jsonrpc_response $result
