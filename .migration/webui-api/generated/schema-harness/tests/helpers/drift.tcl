# drift.tcl - www/api drift check (schema-harness, T016).
#
# The root www/api tree is a stale copy of src/webui/www/api. It must be byte-equal to the
# source tree or removed. Used as library (drift::compare / drift::verdict) and as CLI:
#   tclsh8.6 drift.tcl ?STALE_DIR SOURCE_DIR?      (default: repo www/api vs src/webui/www/api)
# Exit status 0 = pass (equal or removed), 1 = drift (one line per difference on stdout).

namespace eval ::drift {
  variable here [file dirname [file normalize [info script]]]
}

proc ::drift::files {root} {
  set out {}
  set stack [list $root]
  while {[llength $stack]} {
    set d [lindex $stack end]; set stack [lrange $stack 0 end-1]
    foreach f [glob -nocomplain -directory $d -types {f hidden} *] { lappend out [string range $f [string length $root]+1 end] }
    foreach f [glob -nocomplain -directory $d -types f *] { lappend out [string range $f [string length $root]+1 end] }
    foreach s [glob -nocomplain -directory $d -types d *] { lappend stack $s }
  }
  return [lsort -unique $out]
}

proc ::drift::slurp {f} {
  set fd [open $f r]
  fconfigure $fd -translation binary
  set c [read $fd]
  close $fd
  return $c
}

# compare STALE SOURCE -> list of {differs rel} {only-in-stale rel} {only-in-source rel}
proc ::drift::compare {stale source} {
  set fs [expr {[file isdirectory $stale] ? [files $stale] : {}}]
  set fo [expr {[file isdirectory $source] ? [files $source] : {}}]
  set out {}
  foreach r $fs {
    if {$r ni $fo} { lappend out [list only-in-stale $r]; continue }
    if {[slurp [file join $stale $r]] ne [slurp [file join $source $r]]} { lappend out [list differs $r] }
  }
  foreach r $fo { if {$r ni $fs} { lappend out [list only-in-source $r] } }
  return [lsort $out]
}

# verdict STALE SOURCE -> {pass removed} | {pass equal} | {fail N}
proc ::drift::verdict {stale source} {
  if {![file isdirectory $stale]} { return {pass removed} }
  set d [compare $stale $source]
  if {[llength $d] == 0} { return {pass equal} }
  return [list fail [llength $d]]
}

proc ::drift::repo_paths {} {
  variable here
  # helpers -> tests -> schema-harness -> generated -> webui-api -> .migration -> repo
  set repo $here
  for {set i 0} {$i < 6} {incr i} { set repo [file dirname $repo] }
  return [list [file join $repo www api] [file join $repo src webui www api]]
}

proc ::drift::main {argv} {
  if {[llength $argv] == 2} { lassign $argv stale source } else { lassign [repo_paths] stale source }
  set v [verdict $stale $source]
  if {[lindex $v 0] eq "pass"} { puts "drift: pass ([lindex $v 1])"; return 0 }
  foreach d [compare $stale $source] { puts "[lindex $d 0] [lindex $d 1]" }
  puts "drift: [lindex $v 1] file(s) differ"
  return 1
}

if {[info exists ::argv0] && [file normalize $::argv0] eq [file normalize [info script]]} {
  exit [::drift::main $::argv]
}
