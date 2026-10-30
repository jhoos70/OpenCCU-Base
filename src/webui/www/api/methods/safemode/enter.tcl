##
# SafeMode.enter
# Switches the CCU to safe mode and reboots (staged SP034, ADMIN only).
#
# Hardening: /etc/config/safemode is written to a temporary file and moved into place with
# rename; ReGa is persisted with "rega system.Save()" and the background reboot is launched
# only after the flag file is in place. An unwritable /etc/config raises a Tcl error (internal
# error 200), no reboot is triggered. The command lines are fixed (no request data) and one
# syslog line records correlation id, method and user id.
#
# Return value: [bool] true
##

# admin_audit is defined once in eq3/admin_audit.tcl (sourced by the dispatcher)

set FLAG_FILE "/etc/config/safemode"
set FLAG_TMP  "$FLAG_FILE.[pid].tmp"

admin_audit "enter safe mode"

# write-then-rename: an error here (e.g. /etc/config not writable) ends the request, no reboot
if { [catch {
  set fd [open $FLAG_TMP w]
  puts $fd 1
  close $fd
  file rename -force -- $FLAG_TMP $FLAG_FILE
} errorMessage] } then {
  catch { file delete -force -- $FLAG_TMP }
  error $errorMessage
}

rega system.Save()

exec /sbin/reboot -d 2 2>/dev/null >/dev/null &

jsonrpc_response true
