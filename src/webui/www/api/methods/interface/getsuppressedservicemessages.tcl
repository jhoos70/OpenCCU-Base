##
# Interface.getSuppressedServiceMessages
# Returns the suppressed service parameter ids of a channel (staged SP022).
#
# v1: the serialised array is passed through json_toString again (a quoted string that
# contains JSON). On the v2 route (global API_V2 set by the dispatcher) the real JSON
# array of strings is returned.
#
# Parameters:
#   interface     : [string] name of the interface
#   channelAddress: [string] address of the channel
##

set channel $args(channelAddress)

checkXmlRpcStatus [catch { set params [xmlrpc $interface(URL) getSuppressedServiceMessages [list string $channel]] }]


set result "\["
set first  1

foreach param $params {
	if { 1 != $first } then { append result "," } else { set first 0 }
	append result [json_toString $param]
}

append result "\]"

if { [info exists ::API_V2] && $::API_V2 } then {
  jsonrpc_response $result
} else {
  jsonrpc_response [json_toString $result]
}
