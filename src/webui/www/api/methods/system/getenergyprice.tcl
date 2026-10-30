##
# system.getEnergyPrice (staged SP045)
# Returns the price per kWh stored in /etc/config/energyPrice.
#
# Parameters: none
#
# Return value:
#   With a valid configuration file: {"Price" : "0.28", "Currency":"EUR"}
#   otherwise {"Price" : "unknown", "Currency":"unknown"}
#
# v1 (frozen): a file with any other number of lines (new format: currency, price current, price
# gas, gas heating value, gas condition number) is concatenated raw, each line being a ready-made
# JSON member; an empty file gives the invalid '{,,,,}'. On /api/v2 the result is strict JSON
# {"Price":..,"Currency":..} (old format) resp. the object of the raw members; a content that is
# not valid JSON is answered as unknown/unknown.
##

# (without the staged dispatcher libraries there is no /api/v2)
if { 0 == [llength [info commands jsonrpc_isV2]] } then { proc jsonrpc_isV2 { } { return 0 } }

set data {}

if {[catch {set fp [open "/etc/config/energyPrice" r]}] == 0} {
  while {[gets $fp line] >= 0} {
    lappend data $line
  }
  close $fp
} else {
  lappend data "unknown"
  lappend data "unknown"
}

if { [jsonrpc_isV2] } then {
  if {[llength $data] == 2} {
    set result "\{\"Price\":[json_toString [lindex $data 0]],\"Currency\":[json_toString [lindex $data 1]]\}"
  } else {
    set result "\{[lindex $data 0],[lindex $data 1],[lindex $data 2],[lindex $data 3],[lindex $data 4]\}"
    if { ![json_isValid $result] } then {
      set result "\{\"Price\":\"unknown\",\"Currency\":\"unknown\"\}"
    }
  }
  jsonrpc_response $result
} else {
  set result "\{"
  if {[llength $data] == 2} {
    # This is necessary for the old version of the config file
    append result "\"Price\" : [json_toString [lindex $data 0]],"
    append result "\"Currency\" : [json_toString [lindex $data 1]]"
  } else {
    # This is for the new version of the config file
    # Values: 0=Currency, 1=Price Current, 2=Price Gas, 3=GasHeatingValue, 4=GasConditionNumber
    append result "[lindex $data 0],"
    append result "[lindex $data 1],"
    append result "[lindex $data 2],"
    append result "[lindex $data 3],"
    append result "[lindex $data 4]"
  }
  append result "\}"
  jsonrpc_response $result
}
