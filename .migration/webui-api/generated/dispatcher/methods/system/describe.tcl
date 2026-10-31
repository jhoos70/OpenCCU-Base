##
# system.describe (staged SP032)
# Describes the API and lists all methods of the registry (sorted by name).
#
# Privilege level: NONE
#
# Parameters: none
#
# Return value: object {name, id, summary, help, procs: [{name, level, summary}]}
#
# v1 behaviour is kept. Hardening: the entry array is cleared for every method, so an entry that
# misses a key can never inherit the value of the previous one.
##

set result "\{"

append result "\"name\": \"HomeMatic JSON API\","
append result "\"id\": \"urn:www-homematic-com:homematic-jsonrpc-api\","
append result "\"summary\": \"Zugriff auf HomeMatic Zentrale\","
append result "\"help\": \"/api/homematic.cgi\","
append result "\"procs\": \["

set first 1
foreach name [lsort [array name METHOD_LIST]] {
  array unset method
  array set method $METHOD_LIST($name)

  if { 1 != $first } then { append result "," } else { set first 0 }
  append result "\{"
  append result "\"name\": [json_toString $name],"
  append result "\"level\": [json_toString $method(LEVEL)],"
  append result "\"summary\": [json_toString $method(INFO)]"
  append result "\}"
}

append result "\]"

append result "\}"

jsonrpc_response $result
