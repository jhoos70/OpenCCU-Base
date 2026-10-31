##
# WebUI.setWebUIColors (staged SP046)
# Sets the colours of the WebUI
#
# Parameters:
# key   - key of www/webui/color.map, e.g. background
# color - in the form #192c6e (not validated, as in v1)
# cpFile - unused, still required
#
# Return value: true
#
# /etc/config/color.map is seeded by copying the system map when absent. The new content is built
# in memory, written to a temporary file and moved over color.map with rename, so a failure leaves
# the original unchanged (v1 truncated the file and appended line by line with 'exec echo').
# A line is replaced when its first token equals the key (split by space, or by tab and '?').
##

set webuiKey $args(key)
set color $args(color)
set cpFile $args(cpFile)

set pathOrigColorMap [file join $env(DOCUMENT_ROOT) "webui/color.map"]
set pathUserColorMap "/etc/config/color.map"

# seed the user map with the original color.map
if {[file exists $pathUserColorMap] != 1} {
  file copy -- $pathOrigColorMap $pathUserColorMap
}

# Read the lines into a Tcl list
set f [open $pathUserColorMap]
set lines [split [read $f] "\n"]
close $f

# Make the replacement of the changed color keys
set newLines {}
foreach line $lines {
  if {([string equal [lindex [split $line " "]  0] $webuiKey] == 1) || ([string equal [lindex [split $line "\t\?"]  0] $webuiKey] == 1)} {
    lappend newLines "$webuiKey  $color"
  } else {
    lappend newLines $line
  }
}

set tmp "$pathUserColorMap.[pid].tmp"
if {[catch {
  set fd [open $tmp w]
  puts -nonewline $fd [join $newLines "\n"]
  close $fd
  file rename -force -- $tmp $pathUserColorMap
} err opts]} {
  catch { file delete -force -- $tmp }
  return -options $opts $err
}

set result true

jsonrpc_response $result
