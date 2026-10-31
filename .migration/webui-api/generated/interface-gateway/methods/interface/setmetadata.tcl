##
# Interface.setMetadata
# Writes metadata on a ReGa object (staged SP024).
#
# Hardening: dataId has to match ^[A-Za-z0-9_.-]{1,64}$ (error 403 "invalid argument (dataId)"
# before any ReGa script runs). objectId, dataId and value are injected by hmscript, which
# escapes every value exactly once.
# v1 side effect kept: an unknown objectId creates a new ReGa object with that name.
#
# Parameters:
#   objectId: [string] ReGa object id or name
#   dataId  : [string] metadata key
#   value   : [string] metadata value
#
# Return value: [string] "<dataId>: <value>"
##

if { ![regexp {^[A-Za-z0-9_.-]{1,64}$} $args(dataId)] } then {
  jsonrpc_error 403 "invalid argument (dataId)"
}

set script {
  var o = dom.GetObject(objectId);
  if (o)
  {
    o.RemoveMetaData(dataId);
    o.AddMetaData(dataId, value);
    Write(dataId#": "#o.MetaData(dataId));
  } else {
    ! Write("Not able to set the metadata");
    object o = dom.CreateObject(OT_OBJECT);
    o.Name(objectId);
    o.AddMetaData(dataId, value);
    Write(dataId#": "#o.MetaData(dataId));
  }
}

jsonrpc_response [json_toString [hmscript $script args]]
