##
# CCU.setInfoLedConfig
# Writes the LED configuration /etc/config/hss_led_info.conf (staged SP039, ADMIN only).
#
# Parameters:
#   serviceLedOn: [string] the exact string "false" switches the service LED off
#   alarmLedOn  : [string] the exact string "false" switches the alarm LED off
#
# Return value: [bool] true
#
# The content is unchanged from v1 (IgnoreServiceMessages=..., IgnoreAlarmMessages=...). It is
# written to a temporary file in /etc/config and moved into place with rename, so a failure
# (unwritable directory) is the internal error 200 and never leaves a truncated file.
##

set ignoreService "false"
set ignoreAlarm "false"

if { $args(serviceLedOn) == "false" } {
    set ignoreService "true"
}
if { $args(alarmLedOn) == "false" } {
    set ignoreAlarm "true"
}

set ledFile "/etc/config/hss_led_info.conf"
set tmp "$ledFile.[pid].tmp"

if { [catch {
  set fd [open $tmp w]
  puts $fd "IgnoreServiceMessages=$ignoreService"
  puts $fd "IgnoreAlarmMessages=$ignoreAlarm"
  close $fd
  file rename -force -- $tmp $ledFile
} errorMessage] } then {
  catch { file delete -force -- $tmp }
  error $errorMessage
}

jsonrpc_response true