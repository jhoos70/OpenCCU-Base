##
# CCU.setFirewallConfigured
# Marks the firewall as configured: touches /etc/config/firewallConfigured (staged SP038,
# ADMIN only; argument list with the '--' guard, inside catch).
#
# Return value: [bool] true
##

catch {exec touch -- /etc/config/firewallConfigured}

jsonrpc_response true
