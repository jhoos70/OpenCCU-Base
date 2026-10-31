##
# system.listMethods (staged SP032)
# Lists all methods of the registry (sorted by name).
#
# Privilege level: NONE
#
# Parameters: none
#
# Return value: array of objects
#   name : [string] method name
#   level: [string] privilege level (NONE, GUEST, USER, ADMIN)
#   info : [string] short description of the method
#
# v1 behaviour is kept; the entry array is cleared for every method.
##

set result "\["
set first 1

foreach name [lsort [array name METHOD_LIST]] {
  array unset method
  array set method $METHOD_LIST($name)

  if { 1 != $first } then { append result "," } else { set first 0 }
  append result "\{"
  append result "\"name\": [json_toString $name],"
  append result "\"level\": [json_toString $method(LEVEL)],"
  append result "\"info\": [json_toString $method(INFO)]"
  append result "\}"
}

append result "\]"

jsonrpc_response $result
