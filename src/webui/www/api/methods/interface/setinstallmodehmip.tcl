##
# Interface.setInstallModeHMIP
# Enables or disables the install mode of the HmIP interface (staged SP021).
#
# Parameters:
#   on:          [boolean] enable (true/1) or disable the install mode
#   time:        [int]     seconds until the install mode ends, default 30
#   address:     SGTIN or id of the device (LOCAL mode)
#   installMode: LOCAL (key from the caller), ALL (key from the key server), anything else = STOP
#   key:         device key (LOCAL mode)
#   keymode:     inclusion type, LOCAL (MASTER and DEFAULT are not supported yet)
#
# Return value: true
#
# v1 behaviour is frozen (EG-15): for a STOP request "set $on 0" assigns a variable named
# after the value of $on, so STOP with on=true keeps the install mode switched ON.
# On the v2 route (global API_V2 set by the dispatcher) STOP forces on to 0.
##

set on $args(on)
set address $args(address)
set key $args(key)
set keymode $args(keymode)
set installMode $args(installMode)

if { ($on != "") && (($on == "true") || ($on == 1) || ($on == "1"))} {
  set on 1
} else {
  set on 0
}

if {$args(time) != ""} {
  set time $args(time)
} else {
  set time 30
}

proc array2xmlrpcstruct { array_name } {
  upvar $array_name arr
  set struct ""
  foreach key [array names arr] {
    set struct_entry $key
    lappend struct_entry $arr($key)
    lappend struct $struct_entry
  }
  return $struct
}

if {[string equal $installMode LOCAL]} {
  # local inclusion without key server: the key has to be provided

  array set whitelistDev {}
  set whitelistDev(ADDRESS) $address
  set whitelistDev(KEY) $key
  set whitelistDev(KEY_MODE) $keymode

  lappend whitelist [list struct [array2xmlrpcstruct whitelistDev]]

  checkXmlRpcStatus [catch {xmlrpc $interface(URL) setInstallModeWithWhitelist [list bool $on] [list int $time] [list array $whitelist]}]
} elseif {[string equal $installMode ALL]} {
  # key from the key server
  checkXmlRpcStatus [catch {xmlrpc $interface(URL) setInstallMode [list bool $on] [list int $time]}]
} else {
  # STOP
  if { [info exists ::API_V2] && $::API_V2 } then {
    set on 0
  } else {
    set $on 0
  }
  checkXmlRpcStatus [catch {xmlrpc $interface(URL) setInstallMode [list bool $on]}]
}

jsonrpc_response true
