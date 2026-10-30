# tcltest runner: every tests/*.test, tests/integration/*.test and tests/flows/*.test
# runs in its own tclsh (tcltest::runAllTests semantics), exit status 1 on any failure.
package require tcltest
tcltest::configure -testdir [file dirname [file normalize [info script]]]
set here [file dirname [file normalize [info script]]]
set files {}
foreach d [list $here [file join $here integration] [file join $here flows]] {
  foreach f [lsort [glob -nocomplain -directory $d *.test]] { lappend files $f }
}
set total 0; set passed 0; set skipped 0; set failed 0
foreach f $files {
  set rc [catch {exec [info nameofexecutable] $f 2>@1} out]
  puts $out
  if {[regexp {Total\t(\d+)\tPassed\t(\d+)\tSkipped\t(\d+)\tFailed\t(\d+)} $out -> t p s fl]} {
    incr total $t; incr passed $p; incr skipped $s; incr failed $fl
  } elseif {$rc} {
    puts "ERROR: $f aborted"
    incr failed
  }
}
puts "all.tcl:\tTotal\t$total\tPassed\t$passed\tSkipped\t$skipped\tFailed\t$failed"
exit [expr {$failed > 0}]
