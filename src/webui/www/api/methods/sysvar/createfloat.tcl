##
# SysVar.createFloat (staged SP041)
# Creates a system variable of the type number.
#
# Parameters:
#   name: [string] name of the system variable.
#   minValue:  [number] minimum value
#   maxValue:  [number] maximum value
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
  jsonrpc_error 100 "Invalid name. Must match \[A-Za-z0-9_\-.:\]"
}
if {[catch { hmscript_assertFloat $args(minValue)} err]} {
  jsonrpc_error 101 $err
}
if {[catch { hmscript_assertFloat $args(maxValue)} err]} {
  jsonrpc_error 102 $err
}
if {[catch { hmscript_assertInteger $args(internal)} err]} {
  jsonrpc_error 103 $err
}
if {[catch { hmscript_assertInteger $args(chnID)} err]} {
  jsonrpc_error 104 $err
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
  sv.ValueType( ivtFloat );
  sv.Name(name);
  sv.ValueMin(minValue);
  sv.ValueMax(maxValue);
  sv.State(0);

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
