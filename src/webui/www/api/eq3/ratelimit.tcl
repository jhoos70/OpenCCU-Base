##
# ratelimit.tcl - request limiters of the JSON API (staged, SP031 / NFR-055, BD-08/BD-09/BD-14)
#
# Per-IP limiter for Session.login: ratelimit::login_ip_check ADDR
#   returns {0 0}       the attempt may proceed
#           {1 RETRY}   the attempt is limited; RETRY is the Retry-After in seconds (1..window)
#
# The limiter is opt-in: it only runs when API_CONFIG(rate_limit) or API_CONFIG(strict_mode) is
# true, or on the /api/v2 route (global API_V2). In the default configuration the code path is
# skipped entirely - no file access, no 429, identical v1 behaviour (NFR-045).
#
# Counter store: one file per client IP, /tmp/webui-ratelimit/login-<REMOTE_ADDR with characters
# outside [A-Za-z0-9._-] mapped to '_'>, holding the attempt timestamps of the last window
# (login_ip_window_seconds, default 60). It is replaced by write-to-temp-then-rename so a reader
# never sees a partial file; two concurrent requests may lose at most one increment (accepted).
# The client IP is REMOTE_ADDR only (X-Forwarded-For is ignored); an empty REMOTE_ADDR is not
# limited per IP (EG-26). If the store is unavailable the request proceeds unthrottled (fail-open
# by design, availability over throttling) and one syslog line 'rate limiter unavailable' with
# the correlation id is written.
#
# Configuration: api/apiconfig.conf ("array set API_CONFIG {...}", loaded by the dispatcher,
# or here when the library is used stand-alone).
##

namespace eval ::ratelimit {
  variable store /tmp/webui-ratelimit
}

##
# Reads a configuration value (default when the key or the file is absent)
##
proc ::ratelimit::config { key default } {
  global API_CONFIG
  if { ![array exists API_CONFIG] } then {
    catch { uplevel #0 [list source apiconfig.conf] }
  }
  if { [array exists API_CONFIG] && [info exists API_CONFIG($key)] } then { return $API_CONFIG($key) }
  return $default
}

##
# Is the limiter active for this request?
##
proc ::ratelimit::enabled { } {
  global API_V2
  if { [info exists API_V2] && [string is true -strict $API_V2] } then { return 1 }
  if { [string is true -strict [config rate_limit false]] } then { return 1 }
  if { [string is true -strict [config strict_mode false]] } then { return 1 }
  return 0
}

proc ::ratelimit::sanitize { s } {
  return [regsub -all {[^A-Za-z0-9._-]} $s _]
}

##
# One syslog line 'rate limiter unavailable' with the correlation id
##
proc ::ratelimit::unavailable { reason } {
  if { 0 < [llength [info commands api_cid]] } then {
    set cid [api_cid]
  } else {
    set cid [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
  }
  set line "cid=$cid method=Session.login uid=- code=0 errorInfo=rate limiter unavailable ([string map [list "\r" "" "\n" { }] $reason])"
  if { 0 < [llength [info commands api_syslog]] } then {
    api_syslog daemon.warning $line
  } else {
    catch { exec logger -t webui-api -p daemon.warning $line }
  }
}

##
# Per-IP limiter for Session.login
##
proc ::ratelimit::login_ip_check { addr } {
  variable store

  if { ![enabled] } then { return {0 0} }
  if { $addr eq "" } then { return {0 0} }

  set limit [config login_ip_limit 10]
  set window [config login_ip_window_seconds 60]
  if { ![string is integer -strict $limit] || $limit < 1 } then { set limit 10 }
  if { ![string is integer -strict $window] || $window < 1 } then { set window 60 }

  set file [file join $store login-[sanitize $addr]]
  set now [clock seconds]

  # read the attempts of the current window
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

  # record this attempt (write-to-temp-then-rename)
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
