##
# CCU.setSSH
# Enables or disables the SSH access of the CCU (staged SP036, ADMIN only).
#
# Parameters:
#   mode: [bool] enable (the exact string "true") or disable (anything else)
#
# Return value: none (null)
#
# v1 semantics kept: the flag file /etc/config/sshEnabled is created (touch) or removed (rm)
# inside catch, then /bin/setfirewall.tcl is sourced to apply the firewall; an error in the
# firewall script propagates as an internal error after the flag already changed. The commands
# are fixed argument lists ('--' guard, no request data).
##

set activate $args(mode);

if {$activate == "true"} {
  catch {exec touch -- /etc/config/sshEnabled}
} else {
  catch {exec rm -- /etc/config/sshEnabled}
}

source "/bin/setfirewall.tcl"

jsonrpc_response ""
