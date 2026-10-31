##
# CCU.getAuthEnabled
# Reports whether the service authentication is enabled (v1 frozen, staged SP038, ADMIN only).
#
# Return value: 1 or 0 from SEC_getAuthEnabled
##

source "/lib/libsecuritylevel.tcl"

if { [SEC_getAuthEnabled] } {
	jsonrpc_response 1
} else {
	jsonrpc_response 0
}
