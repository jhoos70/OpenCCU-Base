##
# Function.listProgramIds (Subsection.listProgramIds)
# Lists the ids of the programs that use channels of a function (staged SP027, v1 frozen).
#
# SP043: v1 called the undefined command "-lrmdups" (every call was an internal error 200);
# the ids are now de-duplicated in the order of first occurrence.
#
# Parameters:
#   id: [string] id of the function
#
# Return value: [array] the ids of the programs
##

set script {
  var func  = dom.GetObject(id);
  var first = true;

  string channelId;
  foreach(channelId, func.EnumUsedIDs())
  {
    var channel = dom.GetObject(channelId);
    if (false == channel.Internal())
    {
      string programId;
      foreach(programId, channel.ChnEnumDPUsagePrograms())
      {
        if (true != first) { Write(" "); } else { first = false; }
        Write("{" # programId # "}");
      }
    }
  }
}

# the ids of the programs without duplicates, in the order of first occurrence (SP043 replaces
# the undefined command "-lrmdups" of v1)
set ids {}
foreach programId [hmscript $script args] {
  if { $programId ni $ids } then { lappend ids $programId }
}

set result "\["
set first 1
foreach id $ids {
  if {$first != 1} then { append result ","} else { set first 0 }
  append result [json_toString $id ]
}
append result "\]"

jsonrpc_response $result
