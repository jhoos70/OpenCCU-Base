##
# system.methodHelp (staged SP032)
# Returns the short description of a method.
#
# Privilege level: NONE
#
# Parameters:
#   name: [string] name of the method
#
# Return value: [string] short description of the method; error 500 "unknown method (<name>)"
# for a name that is not in the registry (v1 behaviour, unchanged)
##

set methodName $args(name)

array unset method
if { [catch { array set method $METHOD_LIST($methodName) }] } then {
  jsonrpc_error 500 "unknown method ($methodName)"
}

jsonrpc_response [json_toString $method(INFO)]
