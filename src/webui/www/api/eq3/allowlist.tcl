##
# allowlist.tcl - the unauthenticated surface of the JSON API (staged, SP015)
#
# The unauthenticated surface is exactly the 8 allow-listed LEVEL NONE methods below (Session.logout
# is no longer part of it) plus the reduced GET page of the dispatcher. A CI check
# (allowlist::registry_violations) fails when any other registry entry has LEVEL NONE.
##

namespace eval ::allowlist {
  variable methodList [list system.describe system.listMethods system.methodHelp system.getEnergyPrice \
    Interface.isPresent ReGa.isPresent Session.login WebUI.getColors]
}

##
# The allow-listed method names (read-only copy)
##
proc ::allowlist::methods { } {
  variable methodList
  return $methodList
}

##
# Registry CI check: every entry with LEVEL NONE that is not on the allow-list.
# registry: dict method name -> dict/list with a LEVEL key (the methods.conf entries)
##
proc ::allowlist::registry_violations { registry } {
  variable methodList
  set violations {}
  dict for {name entry} $registry {
    array unset e
    if { [catch { array set e $entry }] } then { continue }
    if { [info exists e(LEVEL)] && $e(LEVEL) eq "NONE" && [lsearch -exact $methodList $name] < 0 } then {
      lappend violations $name
    }
  }
  return [lsort $violations]
}

##
# HTML escaping for text the dispatcher renders into pages: '&' first, then '<'
##
proc ::allowlist::html_escape { text } {
  return [string map [list & &amp\; < &lt\;] $text]
}

##
# IC019: is the method an allow-listed unauthenticated method? Exact match only
# (no prefix, no case folding, no whitespace trimming). Returns 1 or 0.
##
proc unauthenticated_allow_list_check { methodName } {
  return [expr { [lsearch -exact [::allowlist::methods] $methodName] >= 0 }]
}
