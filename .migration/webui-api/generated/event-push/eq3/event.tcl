##
# event.tcl
# Event handling: per-session event queues (staged SP008)
#
# Files below /tmp/event:
#   subscriber.list   Tcl array text  id -> {EVENT_COUNT <int>}
#   lock              exclusive lock file (content = pid of the owner)
#   <sessionId>       the queue of a subscriber, one '{TYPE <t> DATA <m>}' list per line
#
# v1 behaviour kept (event_fire, file layout, EVENT_LIMIT 64). Hardening:
#  - lock_tryget really is exclusive (the v1 procedure always answered 1); a fresh lock gives 0,
#    a stale lock (older than event_lock_stale_seconds, default 10, BD-09/EG-10) is reclaimed;
#    lock_release removes only a lock created by the same process
#  - subscriber.list is rewritten write-then-rename
#  - event_reset_count lets Event.poll reset the counter after clearing the queue, so a
#    subscriber that reached the limit is not stalled for good
#  - queue file names are validated (^@?[A-Za-z0-9]{1,12}@?$, provisional shape, EG-8) so no path
#    outside /tmp/event can be built, also in config-tool mode
#  - event_fire_string builds DATA with JSON string escaping (hm_deldev)
#  - an internal error in event_fire is written to the syslog with the correlation id and the
#    lock is released
##

##############
# Constants  #
##############

set EVENT_DIRECTORY            "/tmp/event"
set EVENT_SUBSCRIBER_LIST_FILE "/tmp/event/subscriber.list"
set EVENT_LOCK_FILE            "/tmp/event/lock"
set EVENT_LIMIT                64

##############
# Procedures #
##############

##
# Configuration value (api/apiconfig.conf, array API_CONFIG); the default when absent
##
proc event_config { key default } {
  global API_CONFIG
  if { [array exists API_CONFIG] && [info exists API_CONFIG($key)] } then { return $API_CONFIG($key) }
  return $default
}

##
# One syslog line with the correlation id
##
proc event_syslog_error { method cause } {
  if { 0 < [llength [info commands api_cid]] } then {
    set cid [api_cid]
  } else {
    set cid [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
  }
  set line "cid=$cid method=$method uid=- code=0 errorInfo=[string map [list "\r" "" "\n" {\n}] $cause]"
  if { 0 < [llength [info commands api_syslog]] } then {
    api_syslog daemon.err $line
  } else {
    catch { exec logger -t webui-api -p daemon.err $line }
  }
}

##
# Exclusive lock: 1 if the lock was created by this call, 0 if a fresh lock exists
##
proc lock_tryget { filename } {
  set stale [event_config event_lock_stale_seconds 10]
  if { ![string is integer -strict $stale] || $stale < 1 } then { set stale 10 }

  for { set attempt 0 } { $attempt < 2 } { incr attempt } {
    if { ![catch {
      set fd [open $filename {WRONLY CREAT EXCL}]
      puts -nonewline $fd [pid]
      close $fd
    }] } then {
      return 1
    }
    # the lock exists: reclaim it only if it is stale
    if { [catch { expr { [clock seconds] - [file mtime $filename] } } age] || $age <= $stale } then {
      return 0
    }
    catch { file delete -force -- $filename }
  }
  return 0
}

##
# Releases a lock that was created by this process
##
proc lock_release { filename } {
  if { [file exists $filename] } then {
    if { ![catch { set fd [open $filename r]; set owner [string trim [read $fd]]; close $fd }] && $owner eq [pid] } then {
      catch { file delete -force -- $filename }
    }
  }
}

##
# The queue file of a session id, '' for anything that is not ^@?[A-Za-z0-9]{1,12}@?$
##
proc event_queue_path { id } {
  global EVENT_DIRECTORY
  if { [regexp {^@?[A-Za-z0-9]{1,12}@?$} $id] } then { return [file join $EVENT_DIRECTORY $id] }
  return ""
}

##
# Writes a file via a temporary file and rename
##
proc event_save_atomic { filename content } {
  set tmp "$filename.[pid].tmp"
  if { [catch {
    set fd [open $tmp w]
    puts -nonewline $fd $content
    close $fd
    file rename -force -- $tmp $filename
  } cause] } then {
    catch { file delete -force -- $tmp }
    error $cause
  }
}

##
# Resets the pending counter of a subscriber (called by Event.poll after the queue was cleared,
# the caller holds the lock)
##
proc event_reset_count { id } {
  global EVENT_SUBSCRIBER_LIST_FILE
  array set subscriberList [file_load $EVENT_SUBSCRIBER_LIST_FILE]
  if { [info exists subscriberList($id)] } then {
    set subscriberList($id) [list EVENT_COUNT 0]
    event_save_atomic $EVENT_SUBSCRIBER_LIST_FILE [array get subscriberList]
  }
}

##
# Minimal JSON string (the producers run without json.tcl)
##
proc event_json_string { s } {
  set map [list "\\" "\\\\" "\"" "\\\"" "\n" "\\n" "\r" "\\r" "\t" "\\t" "\b" "\\b" "\f" "\\f"]
  return "\"[string map $map $s]\""
}

##
# Fires an event whose DATA is the JSON string of 'value'
##
proc event_fire_string { type value } {
  event_fire $type [event_json_string $value]
}

##
# Fires an event
##
proc event_fire { type message } {
	global EVENT_DIRECTORY EVENT_SUBSCRIBER_LIST_FILE EVENT_LIMIT EVENT_LOCK_FILE

	if { [lock_tryget $EVENT_LOCK_FILE] } then {
		if { [catch {
			array set subscriberList [file_load $EVENT_SUBSCRIBER_LIST_FILE]

			foreach id [array names subscriberList] {
				set path [event_queue_path $id]
				if { "" == $path } then { continue }
				array set subscriber $subscriberList($id)
				if { ![info exists subscriber(EVENT_COUNT)] } then { set subscriber(EVENT_COUNT) 0 }

				if {$EVENT_LIMIT > $subscriber(EVENT_COUNT)} then {
					catch { file_append $path "[list [list TYPE $type DATA $message]]\n" }
					incr subscriber(EVENT_COUNT)
					set subscriberList($id) [array get subscriber]
				}
				array_clear subscriber
			}

			event_save_atomic $EVENT_SUBSCRIBER_LIST_FILE [array get subscriberList]
		} cause] } then {
			event_syslog_error event_fire $cause
		}
		lock_release $EVENT_LOCK_FILE
	}
}

##################
# Entry point    #
##################

if { ![file exists $EVENT_SUBSCRIBER_LIST_FILE] } then {
	catch {
		file mkdir $EVENT_DIRECTORY
		file_clear $EVENT_SUBSCRIBER_LIST_FILE
	}
}
