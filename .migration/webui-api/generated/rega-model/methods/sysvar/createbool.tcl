##
# SysVar.createBool (staged SP041)
# Creates a system variable of the type boolean.
#
# Parameters:
#   name: [string] name of the system variable.
#   init_val: [bool] initial state
#   internal: [integer]  variable visible / variable internal
#   chnID: [integer] id of the channel the variable is bound to; -1 for no channel
# Return value: [string]
#   Object of the system variable with name, id, value.
#
# v1 behaviour is frozen (a second variable with the same name is created). On /api/v2 an
# existing name is refused: error 500 "name already exists (<name>)" (HTTP 409), nothing is created.
##

# (without the staged dispatcher libraries there is no /api/v2)
if { 0 == [llength [info commands jsonrpc_isV2]] } then { proc jsonrpc_isV2 { } { return 0 } }

if { ![regexp {^[A-Za-z0-9_\-\.:]+$} $args(name)] } then {
  jsonrpc_error 1 "Invalid name. Must match \[A-Za-z0-9_\-.:\]"
}
if {[catch { hmscript_assertBoolean $args(init_val)} err]} {
  jsonrpc_error 2 $err
}
if {[catch { hmscript_assertInteger $args(internal)} err]} {
  jsonrpc_error 3 $err
}
if {[catch { hmscript_assertInteger $args(chnID)} err]} {
  jsonrpc_error 4 $err
}

if { [jsonrpc_isV2] } then {
  set existsScript {
    var existing = dom.GetObject(ID_SYSTEM_VARIABLES).Get(name);
    if (existing) { Write("exists"); }
  }
  if { "exists" eq [string trim [hmscript $existsScript args]] } then {
    jsonrpc_error 500 "name already exists ($args(name))"
  }
}

set script {
  if (chnID != -1) {
   object channel = dom.GetObject(chnID);
  }

  object oSysVars = dom.GetObject( ID_SYSTEM_VARIABLES );
  object sv = dom.CreateObject(OT_VARDP);

  sv.ValueType( ivtBinary );
  sv.ValueSubType( istBool );
  sv.Name(name);
  sv.ValueName0("false");
  sv.ValueName1("true");
  sv.State(init_val);

  if((internal == "true") || (internal == 1)) {
    sv.Internal(true);
  } else {
    sv.Internal(false);
  }

  if (channel) {
    sv.Channel(chnID);
    channel.DPs().Add(sv.ID());
  }

  oSysVars.Add(sv.ID());

  Write('{"name":"'#sv.Name()#'","id":"'#sv.ID()#'","value":"'#sv.Value()#'" }');
  }

jsonrpc_response [hmscript $script args]
