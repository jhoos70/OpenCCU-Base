##
# CCU.setSecurityHint
# Acknowledges the security hint: touches /etc/config/userAckSecurityHint (staged SP038,
# USER level; argument list with the '--' guard, inside catch).
#
# Return value: [bool] true
##

catch {exec touch -- /etc/config/userAckSecurityHint}

jsonrpc_response true
