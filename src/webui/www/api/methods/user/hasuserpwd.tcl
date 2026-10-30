##
# User.hasUserPWD (staged SP033)
# Tells whether a user has set a password.
#
# Parameters:
#   userID: [string] id of the user
#
# Return value:
#   v1 (frozen, the classic client eval()s it): the JavaScript expression text
#   {"UserPWD" :  true|false }.UserPWD ; on /api/v2: the plain JSON boolean
##

# (without the staged dispatcher libraries there is no /api/v2: v1 output)
if { 0 == [llength [info commands jsonrpc_isV2]] } then { proc jsonrpc_isV2 { } { return 0 } }

set script {
  var user = dom.GetObject(userID);
  if ( user )
  {
    if ( user.UserPwd() == "" )
    {
      Write("VAL { false } ");
    }
    else
    {
      Write("VAL { true } ");
    }
  }
  else
  {
    Write(false);
  }
}


array set user [hmscript $script args]

if { [jsonrpc_isV2] } then {
  jsonrpc_response [expr { "true" eq [string trim $user(VAL)] ? "true" : "false" }]
} else {
  set result "\{"
  append result "\"UserPWD\" : $user(VAL)"
  append result "\}"

  jsonrpc_response $result.UserPWD
}
