##
# Interface.setTeam
# Adds a channel to a team (staged SP020).
#
# Hardening: v1 passed the literal strings "channelAddress" and "teamAddress" to the
# interface instead of the caller values; the caller values are sent now.
#
# Parameters:
#   interface     : [string] name of the interface
#   channelAddress: [string] address of the channel
#   teamAddress   : [string] address of the team
#
# Return value: [bool] true
##

set channelAddress $args(channelAddress)
set teamAddress $args(teamAddress)

checkXmlRpcStatus [catch {xmlrpc $interface(URL) setTeam [list string $channelAddress] [list string $teamAddress] }]

jsonrpc_response true
