##
# dispatch.tcl
# Dispatcher of the Interface.* methods (staged, SP016).
#
# v1 behaviour is frozen: same interface resolution, same status mapping
# (1..4 -> 601..604, -1..-6 -> 501..506, -10 -> 507, other -> 599) and the same
# helper procs. Hardening: the XML-RPC fault text is written to the syslog with the
# correlation id of the request and is never returned to the client.
##

###################
# Helper procs    #
###################

##
# Correlation id of the request: 16 lowercase hex chars from 8 bytes of /dev/urandom
# (shared with the dispatcher through the global API_CID)
##
if { 0 == [llength [info commands api_cid]] } then {
  proc api_cid { } {
    global API_CID
    if { ![info exists API_CID] || ![regexp {^[0-9a-f]{16}$} $API_CID] } then {
      set hex ""
      if { ![catch {
        set fd [open /dev/urandom r]
        fconfigure $fd -translation binary
        binary scan [read $fd 8] H* hex
        close $fd
      }] && [regexp {^[0-9a-f]{16}$} $hex] } then {
        set API_CID $hex
      } else {
        set API_CID [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
      }
    }
    return $API_CID
  }
}

##
# Writes one line to the syslog, never raises
##
if { 0 == [llength [info commands api_syslog]] } then {
  proc api_syslog { priority message } {
    catch { exec logger -t webui-api -p $priority $message }
  }
}

##
# Remember the text of the last XML-RPC fault. xmlrpc is wrapped once so that every
# method script keeps its "checkXmlRpcStatus [catch {xmlrpc ...}]" form unchanged.
##
set API_XMLRPC_FAULT ""
if { 0 < [llength [info commands ::xmlrpc]] && 0 == [llength [info commands ::xmlrpc_raw]] } then {
  rename ::xmlrpc ::xmlrpc_raw
  proc ::xmlrpc { args } {
    global API_XMLRPC_FAULT
    set rc [catch { ::xmlrpc_raw {*}$args } res opts]
    if { 0 != $rc } then { set API_XMLRPC_FAULT $res }
    return -options $opts $res
  }
}

##
# Creates a JSON string array
##
proc toJSONArray { p_array } {
  upvar $p_array arrayList
  set result "\["
  set first 1

  foreach item $arrayList {
    if { 1 != $first } then { append result "," } else { set first 0 }
    append result [json_toString $item]
  }

  append result "\]"
  return $result
}

##
# Creates a JSON boolean value
##
proc toJSONBoolean { value } {
  if { 1 == $value } then {
    return true
  } else {
    return false
  }
}

##
# Returns the device description as JSON
#
#   General fields:
#     type      [string]  device type
#     address   [string]  serial number of the device
#     paramsets [array]   names of the available paramsets
#     version   [integer] version of the description
#     flags     [integer] display flags
#
#   Devices only:
#     children          [array]  serial numbers of the channels
#     firmware          [string] optional, current firmware version
#     availableFirmware [string] optional, available firmware version
#
#   Channels only:
#     parent          [string]  serial number of the parent device
#     parentType      [string]  device type of the parent device
#     index           [integer] channel number
#     aesActive       [bool]    whether AES is active
#     linkSourceRoles [array]   roles of the channel as sender of a link
#     linkTargetRoles [array]   roles of the channel as receiver of a link
#     direction       [integer] category of the channel (sender, receiver, not linkable)
#     group           [string]  optional, partner in a channel group
#     team            [string]  optional, team channel
#     teamTag         [string]  optional
#     teamChannels    [array]   optional, channels of the team
##
proc getDeviceDescription { deviceString } {
  array set device $deviceString

  set result "\{"

  # general fields
  append result "\"type\":[json_toString $device(TYPE)]"
  append result ",\"address\":[json_toString $device(ADDRESS)]"
  append result ",\"paramsets\":[toJSONArray device(PARAMSETS)]"
  append result ",\"version\":$device(VERSION)"
  append result ",\"flags\":$device(FLAGS)"

  if  { [info exists device(CHILDREN)] } then {
    # device fields
    append result ",\"children\":[toJSONArray device(CHILDREN)]"
    if { [info exists device(FIRMWARE)] } then {
      append result ",\"firmware\":[json_toString $device(FIRMWARE)]"
    }
    if { [info exists device(AVAILABLE_FIRMWARE)] } then {
      append result ",\"availableFirmware\":[json_toString $device(AVAILABLE_FIRMWARE)]"
    }
    if { [info exists device(UPDATABLE)] } then {
      append result ",\"updatable\":[json_toString $device(UPDATABLE)]"
    }
    if { [info exists device(FIRMWARE_UPDATE_STATE)] } then {
      append result ",\"firmwareUpdateState\":[json_toString $device(FIRMWARE_UPDATE_STATE)]"
    }
  } else {
    # channel fields
    append result ",\"parent\":[json_toString $device(PARENT)]"
    append result ",\"parentType\":[json_toString $device(PARENT_TYPE)]"
    append result ",\"index\":$device(INDEX)"
    append result ",\"aesActive\":[toJSONBoolean $device(AES_ACTIVE)]"
    append result ",\"linkSourceRoles\":[toJSONArray device(LINK_SOURCE_ROLES)]"
    append result ",\"linkTargetRoles\":[toJSONArray device(LINK_TARGET_ROLES)]"
    append result ",\"direction\":$device(DIRECTION)"
    if { [info exists device(GROUP)] } then {
      append result ",\"group\":[json_toString $device(GROUP)]"
    }
    if { [info exists device(TEAM)] } then {
      append result ",\"team\":[json_toString $device(TEAM)]"
    }
    if { [info exists device(TEAM_TAG)] } then {
      append result ",\"teamTag\":[json_toString $device(TEAM_TAG)]"
    }
    if { [info exists device(TEAM_CHANNELD)] } then {
      append result ",\"teamChannels\":[toJSONArray device(TEAM_CHANNELS)]"
    }
  }

  # BidCoS-RF
  if { [info exists device(INTERFACE)] } then {
    append result ",\"interface\": [json_toString $device(INTERFACE)]"
  }
  if { [info exists device(ROAMING)] } then {
    append result ",\"roaming\": [toJSONBoolean $device(ROAMING)]"
  }

  append result "\}"

  return $result
}

##
# Maps a catch status of an XML-RPC call to {code message}
##
proc mapXmlRpcStatus { status } {
  switch -exact -- $status {
     1      { return [list 601 "TCL error"] }
     2      { return [list 602 "TCL return"] }
     3      { return [list 603 "TCL break"] }
     4      { return [list 604 "TCL continue"] }
    -1      { return [list 501 "XML-RPC: general error"] }
    -2      { return [list 502 "XML-RPC: unknown device or channel"] }
    -3      { return [list 503 "XML-RPC: unknown paramset"] }
    -4      { return [list 504 "XML-RPC: device address expected"] }
    -5      { return [list 505 "XML-RPC: unknown argument or value"] }
    -6      { return [list 506 "XML-RPC: operation not supported"] }
    -10     { return [list 507 "Transmission pending in HmIP Legacy API"] }
    default { return [list 599 "unknown error ($status)"] }
  }
}

##
# Checks the result of an XML-RPC call. A non-zero status ends the request with the
# mapped JSON-RPC error; the fault text only goes to the syslog (with the correlation id).
##
proc checkXmlRpcStatus { status } {
  global API_XMLRPC_FAULT JSONRPC
  if { 0 != $status } then {
    lassign [mapXmlRpcStatus $status] code message

    set fault ""
    if { [info exists API_XMLRPC_FAULT] } then { set fault $API_XMLRPC_FAULT }
    set method ""
    if { [info exists JSONRPC(METHOD)] } then { set method $JSONRPC(METHOD) }
    set fault [string map [list "\r" "" "\n" "\\n"] $fault]
    api_syslog daemon.err "cid=[api_cid] method=$method uid=- code=$code errorInfo=$fault"

    jsonrpc_error $code $message
  }
}

###################
# ENTRY POINT     #
###################

set interfaceName $args(interface)

if { [catch { array set interface $INTERFACE_LIST($interfaceName) }] } then {
  jsonrpc_error 500 "unknown interface ($interfaceName)"
}

source "methods/$method(METHOD_FILE)"
