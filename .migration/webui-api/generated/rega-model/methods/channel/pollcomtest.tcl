##
# Channel.pollComTest
# Checks the result of a function test (staged SP028).
#
# Hardening: testId has to match ^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$ (error 403
# "invalid argument (testId)" before any ReGa script runs).
#
# Parameters:
#   id    : [string] id of the channel
#   testId: [string] id of the function test
#
# Return value: [string/bool]
#   Time at which the test was passed, or false
##

if { ![regexp {^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$} $args(testId)] } then {
  jsonrpc_error 403 "invalid argument (testId)"
}

set script {
  var channel   = dom.GetObject(id);
  var timestamp = testId;
  if (channel)
  {
    if (channel.TestCompletedTime() >= timestamp)
    {
      Write(channel.TestCompletedTime());
    }
    else
    {
      Write("false");
    }
  }
}

set result [hmscript $script args]

switch -exact -- $result {
  ""      { jsonrpc_error 500 "homematic script error" }
  "false" { jsonrpc_response "false" }
  default { jsonrpc_response [json_toString $result] }
}
