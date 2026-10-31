##
# Program.get (staged SP042)
# Returns detail information about one program.
#
# Parameters:
#   id: [string] id of the program
#
# Return value: [object]
#  Fields:
#    id             : [string] id of the program
#    name           : [string] name of the program
#    isActive       : [bool]   true if the program is active
#    isInternal     : [bool]   true if it is a system-internal program
#    lastExecuteTime: [string] time of the last execution
#                              (YYYY-MM-DD HH:MM::SS)
#
# v1 (frozen, the classic client eval()s it): the object keeps its trailing comma after
# lastExecuteTime. On /api/v2 the object is strict JSON.
##

# (without the staged dispatcher libraries there is no /api/v2)
if { 0 == [llength [info commands jsonrpc_isV2]] } then { proc jsonrpc_isV2 { } { return 0 } }

set script {
  var program = dom.GetObject(id);
  if (program)
  {
    WriteLine("ID {" # program.ID() # "}");
    WriteLine("NAME {" # program.Name() # "}");
    WriteLine("TIME {" # program.ProgramLastExecuteTime() # "}");
    WriteLine("ACTIVE {" # program.Active() # "}");
    WriteLine("INTERNAL {" # program.Internal() # "}");
  }
}

array set _program_ [hmscript $script args]

set    result "\{"
append result "\"id\":[json_toString $_program_(ID)],"
append result "\"name\":[json_toString $_program_(NAME)],"
append result "\"isActive\":$_program_(ACTIVE),"
append result "\"isInternal\":$_program_(INTERNAL),"
if { [jsonrpc_isV2] } then {
  append result "\"lastExecuteTime\":[json_toString $_program_(TIME)]"
} else {
  append result "\"lastExecuteTime\":[json_toString $_program_(TIME)],"
}
append result "\}"

jsonrpc_response $result