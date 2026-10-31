##
# CCU.setSecurityLevel
# Sets the security level of the CCU (staged SP038, ADMIN only).
#
# Parameters:
#   level: [string] LOW, MEDIUM or HIGH (case-sensitive)
#
# Return value: [bool] true if SEC_setsecuritylevel succeeded, false for it failing or any
# other level string (nothing is changed).
#
# Note: v1 had the inner "else" on a line of its own, so a successful call answered true and then
# failed with "invalid command name else" (two documents). One document is sent now.
##

set lvl $args(level)

source "/lib/libsecuritylevel.tcl"

if { [string compare $lvl "LOW"] == 0 || [string compare $lvl "MEDIUM"] == 0 || [string compare $lvl "HIGH"] == 0 } {
	if { [ SEC_setsecuritylevel $lvl ]  } {
		jsonrpc_response true
	} else {
		jsonrpc_response false
	}
} else {
	jsonrpc_response false
}
