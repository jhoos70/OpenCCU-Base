##
# sidlimit.tcl - the per-sid request limiter of the dispatcher (staged SP001, T137e, NFR-055,
# BD-09/BD-14)
#
#   sidlimit::check SID  ->  {0 0}      the request may proceed
#                            {1 RETRY}  the request is limited; RETRY is the Retry-After in seconds
#                                       (1..per_sid_window_seconds)
#
# Active only when API_CONFIG rate_limit or strict_mode is true or the request is on /api/v2
# (global API_V2); otherwise sidlimit::check returns {0 0} without any file access (v1 default
# behaviour is byte-identical, NFR-045). A request without a sid is not counted. One HTTP request
# counts once (a v2 batch is one request, EG-26).
#
# Counter store: one file per sid, /tmp/webui-ratelimit/sid-<sid with characters outside
# [A-Za-z0-9._-] mapped to '_', at most 64 characters>, holding the request timestamps of the last
# per_sid_window_seconds (default 10); limit per_sid_limit (default 60). The file is replaced by
# write-to-temp-then-rename. The primitive is deliberately a copy of ratelimit::login_ip_check
# (security-session, T102d) so no new internal contract is needed; both are pinned by the same
# test vectors. If the store is unavailable the request proceeds (fail-open by design) and one
# syslog line 'rate limiter unavailable' with the correlation id is written.
##

namespace eval ::sidlimit {
  variable store /tmp/webui-ratelimit
}

proc ::sidlimit::config { key default } {
  if { 0 < [llength [info commands api_config]] } then { return [api_config $key $default] }
  global API_CONFIG
  if { [array exists API_CONFIG] && [info exists API_CONFIG($key)] } then { return $API_CONFIG($key) }
  return $default
}

##
# Is the limiter active for this request?
##
proc ::sidlimit::enabled { } {
  global API_V2
  if { [info exists API_V2] && [string is true -strict $API_V2] } then { return 1 }
  if { [string is true -strict [config rate_limit false]] } then { return 1 }
  if { [string is true -strict [config strict_mode false]] } then { return 1 }
  return 0
}

proc ::sidlimit::sanitize { sid } {
  return [string range [regsub -all {[^A-Za-z0-9._-]} $sid _] 0 63]
}

proc ::sidlimit::unavailable { reason } {
  if { 0 < [llength [info commands api_cid]] } then {
    set cid [api_cid]
  } else {
    set cid [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
  }
  set line "cid=$cid method=- uid=- code=0 errorInfo=rate limiter unavailable ([string map [list "\r" "" "\n" { }] $reason])"
  if { 0 < [llength [info commands api_syslog]] } then {
    api_syslog daemon.warning $line
  } else {
    catch { exec logger -t webui-api -p daemon.warning $line }
  }
}

proc ::sidlimit::check { sid } {
  variable store

  if { ![enabled] } then { return {0 0} }
  if { $sid eq "" } then { return {0 0} }

  set limit [config per_sid_limit 60]
  set window [config per_sid_window_seconds 10]
  if { ![string is integer -strict $limit] || $limit < 1 } then { set limit 60 }
  if { ![string is integer -strict $window] || $window < 1 } then { set window 10 }

  set file [file join $store sid-[sanitize $sid]]
  set now [clock seconds]

  set stamps {}
  if { [catch {
    file mkdir $store
    if { [file exists $file] } then {
      set fd [open $file r]
      set content [read $fd]
      close $fd
      foreach t [split $content "\n"] {
        set t [string trim $t]
        if { [string is integer -strict $t] && $t > $now - $window } then { lappend stamps $t }
      }
    }
  } reason] } then {
    unavailable $reason
    return {0 0}
  }

  if { [llength $stamps] >= $limit } then {
    set oldest [lindex [lsort -integer $stamps] 0]
    set retry [expr { $oldest + $window - $now }]
    if { $retry < 1 } then { set retry 1 }
    if { $retry > $window } then { set retry $window }
    return [list 1 $retry]
  }

  lappend stamps $now
  set tmp "$file.[pid].tmp"
  if { [catch {
    set fd [open $tmp w]
    puts $fd [join $stamps "\n"]
    close $fd
    file rename -force -- $tmp $file
  } reason] } then {
    catch { file delete -force -- $tmp }
    unavailable $reason
  }
  return {0 0}
}
