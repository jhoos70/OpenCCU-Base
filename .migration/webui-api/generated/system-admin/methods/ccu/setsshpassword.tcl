##
# CCU.setSSHPassword
# Changes the password of the SSH access, i.e. the root hash in /etc/config/shadow
# (staged SP036, ADMIN only).
#
# Parameters:
#   passwd: [string] the new password
#
# Return value: {"msg":"noError"}, or {"msg":"shadow update failed"} (generic text, no path)
# when /etc/config/shadow is missing or has no "root:" line (nothing is written).
#
# Hardening: the password is handed to "mkpasswd -m sha512 -s" on stdin (never on a command
# line, no echo, no shell pipeline); the root password field is replaced by Tcl file
# rewriting, written to a temporary file and moved over the shadow file with rename. A failing
# mkpasswd or a hash that is not a plain crypt string leaves the shadow file unchanged and ends
# with the generic error 200 "internal error (ref: <correlation id>)"; the password is never
# logged.
##

set SHADOW_FILE /etc/config/shadow
set passwd $args(passwd)

# Step 1: the shadow file has to exist and contain a root entry (nothing is written otherwise)
set lines {}
set rootIndex -1
if { ![catch {
  set fd [open $SHADOW_FILE r]
  fconfigure $fd -translation binary
  set shadowContent [read $fd]
  close $fd
}] } then {
  set lines [split $shadowContent "\n"]
  set i 0
  foreach line $lines {
    if { [regexp {^root:([^:]*):} $line] } then { set rootIndex $i; break }
    incr i
  }
}
if { $rootIndex < 0 } then {
  jsonrpc_response "\{\"msg\":\"shadow update failed\"\}"
  return
}

# Step 2: hash the password (stdin only)
if { [catch { exec mkpasswd -m sha512 -s << $passwd } digest] || ![regexp {^\$[A-Za-z0-9]+\$[./A-Za-z0-9$,=_+-]+$} [string trim $digest]] } then {
  set cause "mkpasswd failed"
  if { [info exists digest] && [catch {set digest}] == 0 } then { set cause "unusable mkpasswd result" }
  if { 0 < [llength [info commands api_cid]] } then { set cid [api_cid] } else { set cid [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]] }
  set line "cid=$cid method=CCU.setSSHPassword uid=- code=200 errorInfo=$cause"
  if { 0 < [llength [info commands api_syslog]] } then {
    api_syslog daemon.err $line
  } else {
    catch { exec logger -t webui-api -p daemon.err $line }
  }
  jsonrpc_error 200 "internal error (ref: $cid)"
}
set digest [string trim $digest]

# Step 3: replace the root password field and write-then-rename
set old [lindex $lines $rootIndex]
regexp {^root:[^:]*:(.*)$} $old -> rest
set lines [lreplace $lines $rootIndex $rootIndex "root:${digest}:$rest"]
set tmp "$SHADOW_FILE.[pid].tmp"
if { [catch {
  set fd [open $tmp w]
  fconfigure $fd -translation binary
  puts -nonewline $fd [join $lines "\n"]
  close $fd
  catch { file attributes $tmp -permissions [file attributes $SHADOW_FILE -permissions] }
  file rename -force -- $tmp $SHADOW_FILE
}] } then {
  catch { file delete -force -- $tmp }
  jsonrpc_response "\{\"msg\":\"shadow update failed\"\}"
} else {
  jsonrpc_response "\{\"msg\":\"noError\"\}"
}
