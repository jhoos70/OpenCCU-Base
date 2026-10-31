##
# CCU.setAuthEnabled
# Enables or disables the service authentication (v1 frozen, staged SP038, ADMIN only).
#
# Parameters:
#   enabled: [string] "true" or "false" (exact strings, anything else answers false)
#
# Return value: [bool]
##

set enabled $args(enabled)

source "/lib/libsecuritylevel.tcl"

if { $enabled == "true" } {
	if { [SEC_setAuthEnabled true]  } {
		jsonrpc_response true
	} else {
		jsonrpc_response false
	}
} elseif { $enabled == "false" } {
	if { [SEC_setAuthEnabled false] } {
		jsonrpc_response true
	} else {
		jsonrpc_response false
	}
} else {
	jsonrpc_response false
}
