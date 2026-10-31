##
# RecoveryMode.enter
# Starts the HomeMatic central in recovery mode (staged SP034 acceptance[9]-[15], ADMIN only).
#
# Parameters: none (the script reads no request parameter, the command lines are fixed)
#
# Return value: [bool] true
#
# Errors (v1 messages are frozen; on /api/v2 the messages carry neither file paths nor error text):
#   500 could not determine the platform [from /VERSION]
#   501 recovery mode is not supported on platform oci|lxc
#   500 could not save the settings[: err]
#   500 could not create the recovery mode flag[: err]
#   500 could not restart[: err]
##

set FLAG_FILE "/usr/local/.recoveryMode"

# v2: no paths or error texts in the messages
proc recovery_message { text detail } {
  if { 0 < [llength [info commands jsonrpc_isV2]] && [jsonrpc_isV2] } then { return $text }
  return $detail
}

# platform: oci and lxc have no recovery system
set platform ""
catch {
  set fd [open /VERSION r]
  while { [gets $fd line] >= 0 } {
    if { [regexp {^ *PLATFORM *= *(.*)$} $line dummy platform] } { break }
  }
  close $fd
}
if { $platform == "" } {
  jsonrpc_error 500 [recovery_message "could not determine the platform" "could not determine the platform from /VERSION"]
}
if { $platform == "oci" || $platform == "lxc" } {
  jsonrpc_error 501 "recovery mode is not supported on platform $platform"
}

# persist the settings before the flag file is created
if { [catch {rega system.Save()} err] } {
  jsonrpc_error 500 [recovery_message "could not save the settings" "could not save the settings: $err"]
}

# create the flag file
if { [catch {
  set fd [open $FLAG_FILE w]
  puts $fd 1
  close $fd
} err] } {
  file delete -force $FLAG_FILE
  jsonrpc_error 500 [recovery_message "could not create the recovery mode flag" "could not create the recovery mode flag: $err"]
}

# reboot; on a failure the flag file is removed again
if { [catch {exec /sbin/reboot -d 2 2>/dev/null >/dev/null &} err] } {
  file delete -force $FLAG_FILE
  jsonrpc_error 500 [recovery_message "could not restart" "could not restart: $err"]
}

jsonrpc_response true
