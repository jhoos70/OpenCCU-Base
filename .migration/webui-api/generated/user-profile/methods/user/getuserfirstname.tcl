##
# User.getUserFirstName (staged SP033)
# Returns the first name of a user.
#
# Parameters:
#   userID: [string] id of the user
#
# Return value: [string]
#   v1 (frozen, the classic client eval()s it): the JavaScript expression text
#   {"UserName" : "<first name>"}.UserName ; on /api/v2: the plain JSON string
##

# (without the staged dispatcher libraries there is no /api/v2: v1 output)
if { 0 == [llength [info commands jsonrpc_isV2]] } then { proc jsonrpc_isV2 { } { return 0 } }

set script {
  var user = dom.GetObject(userID);
  if (user)
  {
          Write("NAME {" # user.UserFirstName() # "}");
  }
  else
  {
          Write(false);
  }
}

array set user [hmscript $script args]

if { [jsonrpc_isV2] } then {
  jsonrpc_response [json_toString $user(NAME)]
} else {
  set result "\{"
  append result "\"UserName\" : [json_toString $user(NAME)]"
  append result "\}"

  jsonrpc_response $result.UserName
}
