##
# Firewall.setConfiguration
# Stores and applies the firewall configuration (staged SP047, ADMIN only).
#
# Parameters:
#   services : [array]  elements {name, access}; the access of every known service is replaced,
#              unknown service names are ignored; an element without 'name' is an internal error
#   ips      : [array]  IP addresses / CIDR for restricted access
#   userports: [array]  user defined ports
#   mode     : [string] MOST_OPEN or RESTRICTIVE
#
# Return value: [bool] true
#
# Hardening:
#  - an unsupported mode no longer prints "Firewall_setMode: Unsupported mode." to stdout in front
#    of the JSON document: the text goes to the syslog, the previous mode is kept and the other
#    fields are applied (the answer stays a valid JSON-RPC document)
#  - /etc/config/firewall.conf is saved write-then-rename (the library's save procedure is
#    wrapped: it writes <file>.<pid>.tmp which is moved over firewall.conf), so a failure never
#    leaves a truncated configuration
##

source /lib/libfirewall.tcl

# write-then-rename around the library's Firewall_saveConfiguration
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

set services $args(services)
set ips      $args(ips)
set userports $args(userports)
set mode $args(mode)

Firewall_loadConfiguration

set Firewall_IPS $ips
set Firewall_USER_PORTS $userports

if { $mode == "RESTRICTIVE" || $mode == "MOST_OPEN" } then {
  Firewall_setMode $mode
} else {
  catch { exec logger -t webui-api -p daemon.warning "Firewall_setMode: Unsupported mode." }
}

foreach _service $services {
  array set service $_service
  set name   $service(name)
  set access $service(access)

  if { [info exists Firewall_SERVICES($name)] } then {
    array set knownService  $Firewall_SERVICES($name)
    set knownService(ACCESS) $access
    set Firewall_SERVICES($name) [array get knownService]
    array_clear knownService
  }

  array_clear service
}

Firewall_saveConfiguration
Firewall_configureFirewall

jsonrpc_response true
