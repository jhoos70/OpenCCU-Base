##
# Firewall.getConfiguration
# Returns the firewall configuration (staged SP047, ADMIN only).
#
# Return value: [object]
#   services : [array]  {id, access, ports[]} (the order follows 'array names', not stable)
#   ips      : [array]  IP addresses / CIDR
#   userports: [array]  user defined ports
#   mode     : [string] MOST_OPEN or RESTRICTIVE
#
# v1 behaviour kept, including that loading may migrate firewall.conf (missing default ports).
# That rewrite goes through the write-then-rename wrapper of Firewall_saveConfiguration.
##

source /lib/libfirewall.tcl

# write-then-rename around the library's Firewall_saveConfiguration (migration rewrites)
if { 0 == [llength [info commands ::Firewall_saveConfiguration_v1]] } then {
  rename ::Firewall_saveConfiguration ::Firewall_saveConfiguration_v1
  proc ::Firewall_saveConfiguration { } {
    global Firewall_CONFIG_FILE
    set target $Firewall_CONFIG_FILE
    set tmp "$target.[pid].tmp"
    set Firewall_CONFIG_FILE $tmp
    set rc [catch { Firewall_saveConfiguration_v1 } msg opts]
    set Firewall_CONFIG_FILE $target
    if { 0 == $rc } then { set rc [catch { file rename -force -- $tmp $target } msg opts] }
    if { 0 != $rc } then {
      catch { file delete -force -- $tmp }
      return -options $opts $msg
    }
  }
}

Firewall_loadConfiguration

set result "\{"
set first 1

append result "\"services\": \["
foreach id [array names Firewall_SERVICES] {
  array set service $Firewall_SERVICES($id)
  if { 0 == $first } then { append result "," } else { set first 0 }
  append result "\{"
  append result "\"id\": [json_toString $id],"
  append result "\"access\": [json_toString $service(ACCESS)],"
  set _first 1
  append result "\"ports\": \["
  foreach port $service(PORTS) {
    if { 0 == $_first } then { append result "," } else { set _first 0 }
    append result $port
  }
  append result "\]"
  append result "\}"
  array_clear service
}
append result "\],"

set first 1
append result "\"ips\": \["
foreach ip $Firewall_IPS {
  if { 0 == $first } then { append result "," } else { set first 0 }
  append result [json_toString $ip]
}
append result "\],"

set first 1
append result "\"userports\": \["
foreach uport $Firewall_USER_PORTS {
  if { 0 == $first } then { append result "," } else { set first 0 }
  append result [json_toString $uport]
}
append result "\],"

append result "\"mode\":\"$Firewall_MODE\""
append result "\}"

jsonrpc_response $result
