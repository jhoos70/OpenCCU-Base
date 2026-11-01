##
# v2/values.tcl - GET /api/v2/values?device=ID and POST /api/v2/values {"id","value"}: the live values of a
# device and the operation of its datapoints (the classic "Status and control" of devices, rooms and functions)
#
# GET   the datapoints of ONE device (the channels of a device are small enough to read in one script; the whole
#       installation is not read at once), or of a set of channels (?channels=1,2,3: up to 100 ids, as the members of a
#       favourite list; a channel that is unknown, internal or of a device that is not ready is simply not in the
#       answer). GUEST or higher. The answer is strict JSON
#         {"device":"2650","items":[{"id","name","channelId","channel","param","type","value","unit","min","max",
#           "valueList","timestamp","integer","readable","writable"}]}
#       type is LOGIC, ACTION (a button: only true can be sent), LIST (value is the index into the ";" separated
#       valueList), NUMBER (integer tells whole numbers) or STRING; value is what ReGa holds ("" if the device never
#       reported one, timestamp is then the epoch). The system's own (internal) datapoints and channels are left out,
#       like the classic status page. writable: the datapoint can be written (the operation flag) and the user may
#       operate the channel (a user who is not an administrator needs its full access right, as in the classic UI).
# POST  USER or higher; sets one datapoint with ReGa's State (as the classic UI does), answers the same item after
#       the change. A device acknowledges a command later: the value ReGa holds can still be the old one for a moment,
#       so the client says "sent" and re-reads. If the interface does not take the command at all (ReGa's State answers
#       false: the interface daemon is down or refuses) the answer is error 501, HTTP 502, and a syslog warning. That
#       State answers true when it works is not proven here (no interface worked on the test systems), so only an
#       explicit false is an error.
#
# Only a datapoint of a channel of a device can be changed: the id is checked against the collection of the devices,
# never used as any ReGa object, so a system variable, a program or a user cannot be reached with it. The value is
# validated by the type and the limits of the datapoint before anything runs on ReGa, and the scripts are fixed text:
# the value reaches ReGa as a string variable (hmscript escapes it), never as part of the code. Errors (HTTP status
# by BD-04): no or unknown session 401, a guest or no right 403, unknown device or datapoint 404, a malformed or
# invalid query, body, id or value 422 (error 403 "invalid argument (<name>)"), a body that is not JSON 400. Every
# change is one line in the syslog (who, which datapoint; not the value).
##

set VALUES_STRING_MAX 1000
set VALUES_CHANNELS_MAX 100

proc values_param { name } {
  global V2_QUERY
  if { [regexp "(?:^|&)${name}=(\[^&\]*)" $V2_QUERY -> v] } then { return [list 1 $v] }
  return [list 0 ""]
}

##
# The script text that describes one datapoint into the records of the output; the loop around it supplies dp, channel
# (the datapoint's channel), isAdmin and the filter; shared by the read and the write so both see the same item
##
set VALUES_DESCRIBE {
  string t = "UNKNOWN";
  if (dp.ValueType() == ivtBinary) { t = "LOGIC"; }
  if (dp.ValueType() == ivtBinary) { if (dp.ValueSubType() == 28) { t = "ACTION"; } }
  if (dp.ValueType() == ivtInteger) { t = "NUMBER"; }
  if (dp.ValueType() == ivtInteger) { if (dp.ValueSubType() == istEnum) { t = "LIST"; } }
  if (dp.ValueType() == ivtFloat) { t = "NUMBER"; }
  if (dp.ValueType() == ivtString) { t = "STRING"; }
  boolean isInt = false;
  if (dp.ValueType() == ivtInteger) { isInt = true; }
  boolean usable = false;
  if (channel.UserAccessRights(iulOtherThanAdmin) == iarFullAccess) { usable = true; }
  if (isAdmin == "true") { usable = true; }
  boolean w = false;
  if (OPERATION_WRITE & dp.Operations()) { if (usable) { w = true; } }
  boolean r = false;
  if (OPERATION_READ & dp.Operations()) { r = true; }
  WriteLine("{");
  WriteLine("ID {" # dp.ID() # "}");
  WriteLine("NAME {" # dp.Name() # "}");
  WriteLine("CHANNEL_ID {" # channel.ID() # "}");
  WriteLine("CHANNEL {" # channel.Name() # "}");
  WriteLine("PARAM {" # dp.HSSID() # "}");
  WriteLine("TYPE {" # t # "}");
  WriteLine("VALUE {" # dp.Value() # "}");
  WriteLine("UNIT {" # dp.ValueUnit() # "}");
  WriteLine("MIN {" # dp.ValueMin() # "}");
  WriteLine("MAX {" # dp.ValueMax() # "}");
  WriteLine("LIST {" # dp.ValueList() # "}");
  WriteLine("TS {" # dp.Timestamp() # "}");
  WriteLine("INT {" # isInt # "}");
  WriteLine("READ {" # r # "}");
  WriteLine("WRITE {" # w # "}");
  WriteLine("}");
}

proc values_isAdmin { } {
  return [expr { [v2_sessionLevel] >= 8 ? "true" : "false" }]
}

##
# The datapoints of one device as the records of one script; the script is fixed text
##
proc values_readDevice { deviceId channelFilter } {
  global VALUES_DESCRIBE
  set script {
    string dId;
    string cId;
    string pId;
    foreach(dId, root.Devices().EnumIDs())
    {
      boolean takeDevice = false;
      if (deviceId == "") { takeDevice = true; }
      if (dId == deviceId) { takeDevice = true; }
      if (takeDevice)
      {
        var dev = dom.GetObject(dId);
        if (dev)
        {
          if (dev.ReadyConfig())
          {
            if (dom.GetObject(dev.Interface()))
            {
              boolean wantHealth = false;
              if (channelFilter != "")
              {
                foreach(cId, dev.Channels())
                {
                  if (channelFilter.Find("," # cId # ",") >= 0) { wantHealth = true; }
                }
              }
              foreach(cId, dev.Channels())
              {
                var channel = dom.GetObject(cId);
                if (channel)
                {
                  boolean takeChannel = true;
                  if (channelFilter != "")
                  {
                    takeChannel = false;
                    if (channelFilter.Find("," # cId # ",") >= 0) { takeChannel = true; }
                  }
                  if (channel.Internal())
                  {
                    if (wantHealth)
                    {
                      if (channel.ChnNumber() == 0)
                      {
                        foreach(pId, channel.DPs())
                        {
                          var dp = dom.GetObject(pId);
                          if (dp)
                          {
                            if (dp.TypeName() == "HSSDP")
                            {
                              boolean health = false;
                              if (dp.HSSID() == "UNREACH") { health = true; }
                              if (dp.HSSID() == "LOWBAT") { health = true; }
                              if (dp.HSSID() == "LOW_BAT") { health = true; }
                              if (health)
                              {
                                DESCRIBE
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                  if (takeChannel)
                  {
                    if (false == channel.Internal())
                    {
                      foreach(pId, channel.DPs())
                      {
                        var dp = dom.GetObject(pId);
                        if (dp)
                        {
                          if (dp.TypeName() == "HSSDP")
                          {
                            if (false == dp.Internal())
                            {
                              DESCRIBE
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  set script [string map [list DESCRIBE $VALUES_DESCRIBE] $script]
  array set a [list deviceId $deviceId channelFilter $channelFilter isAdmin [values_isAdmin]]
  return [hmscript $script a]
}

proc values_item { rec } {
  array set p {ID "" NAME "" CHANNEL_ID "" CHANNEL "" PARAM "" TYPE UNKNOWN VALUE "" UNIT "" MIN "" MAX "" LIST "" TS "" INT false READ false WRITE false}
  if { [catch { array set p $rec }] || "" == $p(ID) } then { return "" }
  set value $p(VALUE)
  if { $p(TYPE) eq "LOGIC" || $p(TYPE) eq "ACTION" } then {
    set v [string tolower [string trim $value]]
    if { $v eq "1" || $v eq "true" } then { set value true } elseif { $v eq "0" || $v eq "false" } then { set value false }
  }
  set writable [expr { [string is true -strict $p(WRITE)] && $p(TYPE) ne "UNKNOWN" ? "true" : "false" }]
  set integer [expr { [string is true -strict $p(INT)] ? "true" : "false" }]
  set readable [expr { [string is true -strict $p(READ)] ? "true" : "false" }]
  return "\{\"id\":[json_toString $p(ID)],\"name\":[json_toString $p(NAME)],\"channelId\":[json_toString $p(CHANNEL_ID)],\"channel\":[json_toString $p(CHANNEL)],\"param\":[json_toString $p(PARAM)],\"type\":[json_toString $p(TYPE)],\"value\":[json_toString $value],\"unit\":[json_toString $p(UNIT)],\"min\":[json_toString $p(MIN)],\"max\":[json_toString $p(MAX)],\"valueList\":[json_toString $p(LIST)],\"timestamp\":[json_toString $p(TS)],\"integer\":$integer,\"readable\":$readable,\"writable\":$writable\}"
}

##
# The fixed script that finds one datapoint through the devices and describes it; "" if it is not a datapoint of a channel
# of a device that is ready (a channel's DPs() can also hold other objects, e.g. a program that uses the channel: only
# real datapoints are described, or the script stops half way through a record)
##
proc values_readOne { dpId } {
  global VALUES_DESCRIBE
  set script {
    string dId;
    var dp = dom.GetObject(dpId);
    if (dp)
    {
      if (dp.TypeName() == "HSSDP")
      {
        var channel = dom.GetObject(dp.Channel());
        if (channel)
        {
          var dev = dom.GetObject(channel.Device());
          if (dev)
          {
            foreach(dId, root.Devices().EnumIDs())
            {
              if (dId == dev.ID())
              {
                if (dev.ReadyConfig())
                {
                  if (dom.GetObject(dev.Interface()))
                  {
                    if (false == channel.Internal())
                    {
                      if (false == dp.Internal())
                      {
                        DESCRIBE
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  set script [string map [list DESCRIBE $VALUES_DESCRIBE] $script]
  array set a [list dpId $dpId isAdmin [values_isAdmin]]
  foreach rec [hmscript $script a] { return [list $rec] }
  return ""
}

##
# The reason ("value") if the value is not valid for the datapoint item (the array of values_item as a dict), else ""
##
proc values_validate { type integer min max valueList value } {
  global VALUES_STRING_MAX
  switch -- $type {
    LOGIC {
      if { $value ne "true" && $value ne "false" } then { return value }
    }
    ACTION {
      if { $value ne "true" } then { return value }
    }
    LIST {
      set count [llength [split $valueList ";"]]
      if { ![regexp {^[0-9]{1,4}$} $value] || [scan $value %d n] != 1 || $n >= $count } then { return value }
    }
    NUMBER {
      set re [expr { $integer ? {^-?[0-9]{1,15}$} : {^-?[0-9]{1,15}(\.[0-9]{1,15})?$} }]
      if { ![regexp $re $value] } then { return value }
      if { [string is double -strict $min] && $value < $min } then { return value }
      if { [string is double -strict $max] && $value > $max } then { return value }
    }
    STRING {
      if { [string length $value] > $VALUES_STRING_MAX || [regexp {[\u0000-\u001f\u007f]} $value] } then { return value }
    }
    default { return id }
  }
  return ""
}

##
# Sets the datapoint; true unless ReGa says the interface did not take the command (State answers false then, as seen
# when the interface daemon is down: ReGa logs the failed XML-RPC setValue and State returns false, with no error)
##
proc values_write { dpId type value } {
  set script {
    var ok = true;
    var dp = dom.GetObject(dpId);
    if (dp)
    {
      if (kind == "LOGIC")  { if (newValue == "true") { ok = dp.State(true); } else { ok = dp.State(false); } }
      if (kind == "ACTION") { ok = dp.State(true); }
      if (kind == "LIST")   { ok = dp.State(newValue.ToInteger()); }
      if (kind == "NUMBER")
      {
        if (dp.ValueType() == ivtInteger) { ok = dp.State(newValue.ToInteger()); } else { ok = dp.State(newValue.ToFloat()); }
      }
      if (kind == "STRING") { ok = dp.State(newValue); }
    }
    Write("RESULT {" # ok # "}");
  }
  array set a [list dpId $dpId kind $type newValue $value]
  array set r {RESULT true}
  catch { array set r [hmscript $script a] }
  return [expr { ![string is false -strict [string trim $r(RESULT)]] }]
}

proc v2_values_handle { } {
  global env API_HTTP_STATUS VALUES_CHANNELS_MAX
  if { "POST" eq $env(REQUEST_METHOD) } then {
    v2_requireLevel USER

    set text [v2_body]
    if { [catch { array set body [json_parseObject text] } cause] } then {
      jsonrpc_error 100 "invalid request ($cause)"
    }
    foreach key [array names body] {
      if { $key ni {id value} } then { jsonrpc_error 403 "invalid argument ([regsub -all {[^A-Za-z0-9_.-]} [string range $key 0 39] _])" }
    }
    if { ![info exists body(id)] || ![regexp {^[0-9]{1,10}$} $body(id)] } then { jsonrpc_error 403 "invalid argument (id)" }
    if { ![info exists body(value)] } then { jsonrpc_error 403 "invalid argument (value)" }

    set found [values_readOne $body(id)]
    if { "" == $found } then {
      set API_HTTP_STATUS 404
      jsonrpc_error 501 "datapoint not found"
    }
    array set p {TYPE UNKNOWN INT false MIN "" MAX "" LIST "" WRITE false}
    array set p [lindex $found 0]
    if { ![string is true -strict $p(WRITE)] } then { jsonrpc_error 400 "access denied (datapoint)" }
    set reason [values_validate $p(TYPE) [string is true -strict $p(INT)] $p(MIN) $p(MAX) $p(LIST) $body(value)]
    if { "" != $reason } then { jsonrpc_error 403 "invalid argument ($reason)" }

    set sent [values_write $body(id) $p(TYPE) $body(value)]
    if { !$sent } then {
      api_syslog daemon.warning "cid=[api_cid] method=POST /api/v2/values uid=[v2_sessionUid] action=set datapoint $body(id) failed: the interface did not take the command"
      jsonrpc_error 501 "the device interface did not take the command"
    }
    api_syslog daemon.notice "cid=[api_cid] method=POST /api/v2/values uid=[v2_sessionUid] action=set datapoint $body(id)"
    set after [values_readOne $body(id)]
    if { "" == $after } then { set after $found }
    v2_respondJson [values_item [lindex $after 0]]
    return
  }

  v2_requireLevel GUEST
  lassign [values_param device] has deviceId
  lassign [values_param channels] hasChannels channels
  if { $has && $hasChannels } then { jsonrpc_error 403 "invalid argument (device)" }
  if { $hasChannels } then {
    # a set of channels: up to 100 ids, each digits; the answer is the datapoints of those that exist (maybe none)
    set ids [split $channels ,]
    if { 0 == [llength $ids] || [llength $ids] > $VALUES_CHANNELS_MAX } then { jsonrpc_error 403 "invalid argument (channels)" }
    foreach id $ids {
      if { ![regexp {^[0-9]{1,10}$} $id] } then { jsonrpc_error 403 "invalid argument (channels)" }
    }
    set items {}
    foreach rec [values_readDevice "" ",[join $ids ,],"] {
      set item [values_item $rec]
      if { "" != $item } then { lappend items $item }
    }
    v2_respondJson "\{\"channels\":[json_toString [join $ids ,]],\"items\":\[[join $items ,]\]\}"
    return
  }
  if { !$has || ![regexp {^[0-9]{1,10}$} $deviceId] } then { jsonrpc_error 403 "invalid argument (device)" }
  set items {}
  foreach rec [values_readDevice $deviceId ""] {
    set item [values_item $rec]
    if { "" != $item } then { lappend items $item }
  }
  if { 0 == [llength $items] } then {
    # a device without a visible datapoint is as good as unknown: the model does not list it either
    set API_HTTP_STATUS 404
    jsonrpc_error 501 "device not found"
  }
  v2_respondJson "\{\"device\":[json_toString $deviceId],\"items\":\[[join $items ,]\]\}"
}
