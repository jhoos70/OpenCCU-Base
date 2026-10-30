##
# v2/model.tcl - GET /api/v2/model (staged SP044/SP025/SP040/SP042/SP043, IC009, T176; BD-13)
#
# The bulk read model: devices, channels, rooms, functions, sysvars, programs and (opt-in)
# datapoints, each section as {"total","offset","limit","items":[...]}.
#   query  sections  comma list (default: devices,channels,rooms,functions,sysvars,programs)
#          limit     1..500, default 100 (model_default_limit / model_max_limit of BD-09)
#          offset    >= 0, default 0
# GUEST or higher; without a valid session HTTP 401 before any ReGa script runs; a malformed
# parameter is HTTP 422 with error 403 "invalid argument (<name>)". The devices and the channels
# come from ONE bulk ReGa script (not one script per device); the scripts are fixed and read
# only (they never write metadata, unlike Device.listAllDetail of v1). The items use real JSON
# booleans.
##

set MODEL_SECTIONS {devices channels rooms functions sysvars programs datapoints}
set MODEL_DEFAULT_SECTIONS {devices channels rooms functions sysvars programs}
set MODEL_DEFAULT_LIMIT 100
set MODEL_MAX_LIMIT 500

proc model_param { name } {
  global V2_QUERY
  if { [regexp "(?:^|&)${name}=(\[^&\]*)" $V2_QUERY -> v] } then { return [list 1 $v] }
  return [list 0 ""]
}

proc model_bool { token } {
  return [expr { "true" eq [string trim $token] ? "true" : "false" }]
}

proc model_page { items offset limit } {
  return [lrange $items $offset [expr { $offset + $limit - 1 }]]
}

proc model_section { name items offset limit } {
  return "[json_toString $name]:\{\"total\":[llength $items],\"offset\":$offset,\"limit\":$limit,\"items\":\[[join [model_page $items $offset $limit] ,]\]\}"
}

##
# devices and channels: one bulk script
##
proc model_devicesScript { } {
  set script {
    string dId;
    string cId;
    string pId;
    foreach(dId, root.Devices().EnumIDs())
    {
      var dev = dom.GetObject(dId);
      if (dev && dev.ReadyConfig() && dom.GetObject(dev.Interface()))
      {
        var interface = dom.GetObject(dev.Interface());
        WriteLine("{");
        WriteLine("ID {" # dev.ID() # "}");
        WriteLine("NAME {" # dev.Name() # "}");
        WriteLine("ADDRESS {" # dev.Address() # "}");
        WriteLine("INTERFACE {" # interface.Name() # "}");
        WriteLine("DEVICE_TYPE {" # dev.Label() # "}");
        WriteLine("READY_CONFIG {" # dev.ReadyConfig() # "}");
        WriteLine("GROUP_ONLY {" # dev.MetaData("operateGroupOnly") # "}");
        Write("CHANNELS {");
        foreach(cId, dev.Channels())
        {
          var channel = dom.GetObject(cId);
          if (channel && (false == channel.Internal()))
          {
            var readable = false; var writable = false; var eventable = false; var logable = false;
            foreach(pId, channel.DPs())
            {
              var dp = dom.GetObject(pId);
              if (!dp.Internal())
              {
                logable = true;
                if (OPERATION_READ  & dp.Operations()) { readable  = true; }
                if (OPERATION_WRITE & dp.Operations()) { writable  = true; }
                if (OPERATION_EVENT & dp.Operations()) { eventable = true; }
              }
            }
            var isUsable = false;
            if (channel.UserAccessRights(iulOtherThanAdmin) == iarFullAccess) { isUsable = true; }
            var category = "CATEGORY_NONE";
            if (channel.ChnDirection() == 1) { category = "CATEGORY_SENDER"; }
            if (channel.ChnDirection() == 2) { category = "CATEGORY_RECEIVER"; }
            var mode = "MODE_DEFAULT";
            if (channel.ChnAESActive()) { mode = "MODE_AES"; }
            var isAesAvailable = false;
            if (channel.ChnAESOperation() > 0) { isAesAvailable = true; }
            var isVirtual = false;
            if ((channel.ChannelType() == 29) || (channel.Label() == "HmIP-RCV-50")) { isVirtual = true; }
            Write("{");
            Write("ID {" # cId # "}");
            Write(" NAME {" # channel.Name() # "}");
            Write(" ADDRESS {" # channel.Address() # "}");
            Write(" DEVICE {" # channel.Device() # "}");
            Write(" INDEX {" # channel.ChnNumber() # "}");
            Write(" GROUP_PARTNER_ID {" # channel.ChnGroupPartnerId() # "}");
            Write(" READY_CONFIG {" # channel.ReadyConfig() # "}");
            Write(" MODE {" # mode # "}");
            Write(" CATEGORY {" # category # "}");
            Write(" USABLE {" # isUsable # "}");
            Write(" LOGGED {" # channel.ChnArchive() # "}");
            Write(" VISIBLE {" # channel.Visible() # "}");
            Write(" LOGABLE {" # logable # "}");
            Write(" READABLE {" # readable # "}");
            Write(" WRITABLE {" # writable # "}");
            Write(" EVENTABLE {" # eventable # "}");
            Write(" AES_AVAILABLE {" # isAesAvailable # "}");
            Write(" VIRTUAL {" # isVirtual # "}");
            Write(" CHANNEL_TYPE {" # channel.HssType() # "}");
            Write("} ");
          }
        }
        WriteLine("}");
        WriteLine("}");
      }
    }
  }
  return $script
}

proc model_channelJson { c } {
  array set ch $c
  set partnerId $ch(GROUP_PARTNER_ID)
  if { "65535" == $partnerId } then { set partnerId "" }
  set index $ch(INDEX)
  if { ![string is integer -strict $index] } then { set index 0 }
  set j "\{\"id\":[json_toString $ch(ID)],\"name\":[json_toString $ch(NAME)],\"address\":[json_toString $ch(ADDRESS)]"
  append j ",\"deviceId\":[json_toString $ch(DEVICE)],\"index\":$index,\"partnerId\":[json_toString $partnerId]"
  append j ",\"mode\":[json_toString $ch(MODE)],\"category\":[json_toString $ch(CATEGORY)]"
  append j ",\"isReady\":[model_bool $ch(READY_CONFIG)],\"isUsable\":[model_bool $ch(USABLE)],\"isVisible\":[model_bool $ch(VISIBLE)]"
  append j ",\"isLogged\":[model_bool $ch(LOGGED)],\"isLogable\":[model_bool $ch(LOGABLE)],\"isReadable\":[model_bool $ch(READABLE)]"
  append j ",\"isWritable\":[model_bool $ch(WRITABLE)],\"isEventable\":[model_bool $ch(EVENTABLE)],\"isAesAvailable\":[model_bool $ch(AES_AVAILABLE)]"
  append j ",\"isVirtual\":[model_bool $ch(VIRTUAL)],\"channelType\":[json_toString $ch(CHANNEL_TYPE)]\}"
  return $j
}

##
# Reads devices and channels with one script; returns {deviceItems channelItems}
##
proc model_readDevices { } {
  set devices {}
  set channels {}
  set output [hmscript [model_devicesScript]]
  foreach rec $output {
    if { [catch { array set d $rec }] || ![info exists d(ID)] } then { array unset d; continue }
    set groupOnly [string trim $d(GROUP_ONLY)]
    if { "" == $groupOnly } then { set groupOnly false }
    set cj {}
    foreach c $d(CHANNELS) {
      if { [catch { lappend cj [model_channelJson $c] }] } then { continue }
      lappend channels [lindex $cj end]
    }
    lappend devices "\{\"id\":[json_toString $d(ID)],\"name\":[json_toString $d(NAME)],\"address\":[json_toString $d(ADDRESS)],\"interface\":[json_toString $d(INTERFACE)],\"type\":[json_toString $d(DEVICE_TYPE)],\"operateGroupOnly\":[json_toString $groupOnly],\"isReady\":[model_bool $d(READY_CONFIG)],\"channels\":\[[join $cj ,]\]\}"
    array unset d
  }
  return [list $devices $channels]
}

proc model_readGroups { idObject } {
  set script "
    string id;
    foreach(id, dom.GetObject($idObject).EnumUsedIDs())
    {
      var group = dom.GetObject(id);
      if (group)
      {
        WriteLine(\"{\");
        WriteLine(\"ID {\" # group.ID() # \"}\");
        WriteLine(\"NAME {\" # group.Name() # \"}\");
        WriteLine(\"DESCRIPTION {\" # group.EnumInfo() # \"}\");
        Write(\"CHANNELS {\");
        string channelId;
        foreach(channelId, group.EnumUsedIDs())
        {
          Write(\"{\" # channelId # \"} \");
        }
        WriteLine(\"}\");
        WriteLine(\"}\");
      }
    }
  "
  set items {}
  foreach rec [hmscript $script] {
    if { [catch { array set g $rec }] || ![info exists g(ID)] } then { array unset g; continue }
    set ids {}
    foreach c $g(CHANNELS) { lappend ids [json_toString $c] }
    lappend items "\{\"id\":[json_toString $g(ID)],\"name\":[json_toString $g(NAME)],\"description\":[json_toString $g(DESCRIPTION)],\"channelIds\":\[[join $ids ,]\]\}"
    array unset g
  }
  return $items
}

proc model_readSysvars { } {
  set script {
    var svList = dom.GetObject(ID_SYSTEM_VARIABLES);
    string id;
    foreach(id, svList.EnumIDs())
    {
      var sv = dom.GetObject(id);
      if (sv)
      {
        var sv_type = "UNKNOWN";
        if (sv.ValueSubType() == istAlarm   ) { sv_type = "ALARM";  }
        if (sv.ValueSubType() == istBool    ) { sv_type = "LOGIC";  }
        if (sv.ValueSubType() == istEnum    ) { sv_type = "LIST";   }
        if (sv.ValueSubType() == istGeneric ) { sv_type = "NUMBER"; }
        if (sv.ValueSubType() == istChar8859) { sv_type = "STRING"; }
        WriteLine("{");
        WriteLine("ID {" # sv.ID() # "}");
        WriteLine("NAME {" # sv.Name() # "}");
        WriteLine("TYPE {" # sv_type # "}");
        WriteLine("UNIT {" # sv.ValueUnit() # "}");
        WriteLine("VALUE {" # sv.Value() # "}");
        WriteLine("LOGGED {" # sv.DPArchive() # "}");
        WriteLine("VISIBLE {" # sv.Visible() # "}");
        WriteLine("INTERNAL {" # sv.Internal() # "}");
        WriteLine("CHANNEL_ID {" # sv.Channel() # "}");
        WriteLine("VALUE_MIN {" # sv.ValueMin() # "}");
        WriteLine("VALUE_MAX {" # sv.ValueMax() # "}");
        WriteLine("VALUE_LIST {" # sv.ValueList() # "}");
        WriteLine("VALUE_NAME_0 {" # sv.ValueName0() # "}");
        WriteLine("VALUE_NAME_1 {" # sv.ValueName1() # "}");
        WriteLine("}");
      }
    }
  }
  set items {}
  foreach rec [hmscript $script] {
    if { [catch { array set s $rec }] || ![info exists s(ID)] } then { array unset s; continue }
    set type $s(TYPE)
    set j "\{\"id\":[json_toString $s(ID)],\"name\":[json_toString $s(NAME)],\"type\":[json_toString $type],\"unit\":[json_toString $s(UNIT)],\"value\":[json_toString $s(VALUE)],\"channelId\":[json_toString $s(CHANNEL_ID)]"
    if { "ALARM" == $type || "LOGIC" == $type } then {
      append j ",\"valueName0\":[json_toString $s(VALUE_NAME_0)],\"valueName1\":[json_toString $s(VALUE_NAME_1)]"
    }
    if { "LIST" == $type } then { append j ",\"valueList\":[json_toString $s(VALUE_LIST)]" }
    if { "NUMBER" == $type } then { append j ",\"minValue\":[json_toString $s(VALUE_MIN)],\"maxValue\":[json_toString $s(VALUE_MAX)]" }
    append j ",\"isLogged\":[model_bool $s(LOGGED)],\"isVisible\":[model_bool $s(VISIBLE)],\"isInternal\":[model_bool $s(INTERNAL)]\}"
    lappend items $j
    array unset s
  }
  return $items
}

proc model_readPrograms { } {
  set script {
    string id;
    foreach(id, dom.GetObject(ID_PROGRAMS).EnumIDs())
    {
      var program = dom.GetObject(id);
      if (program)
      {
        WriteLine("{");
        WriteLine("ID {" # program.ID() # "}");
        WriteLine("NAME {" # program.Name() # "}");
        WriteLine("TIME {" # program.ProgramLastExecuteTime() # "}");
        WriteLine("ACTIVE {" # program.Active() # "}");
        WriteLine("INTERNAL {" # program.Internal() # "}");
        WriteLine("}");
      }
    }
  }
  set items {}
  foreach rec [hmscript $script] {
    if { [catch { array set p $rec }] || ![info exists p(ID)] } then { array unset p; continue }
    lappend items "\{\"id\":[json_toString $p(ID)],\"name\":[json_toString $p(NAME)],\"isActive\":[model_bool $p(ACTIVE)],\"isInternal\":[model_bool $p(INTERNAL)],\"lastExecuteTime\":[json_toString $p(TIME)]\}"
    array unset p
  }
  return $items
}

proc model_readDatapoints { } {
  set script {
    string dId;
    string cId;
    string pId;
    foreach(dId, root.Devices().EnumIDs())
    {
      var dev = dom.GetObject(dId);
      if (dev)
      {
        foreach(cId, dev.Channels())
        {
          var channel = dom.GetObject(cId);
          if (channel)
          {
            foreach(pId, channel.DPs())
            {
              var dp = dom.GetObject(pId);
              if (dp && (!dp.Internal()))
              {
                WriteLine("{");
                WriteLine("ID {" # dp.ID() # "}");
                WriteLine("NAME {" # dp.Name() # "}");
                WriteLine("TYPE {HSSDP}");
                WriteLine("CHANNEL {" # channel.ID() # "}");
                WriteLine("}");
              }
            }
          }
        }
      }
    }
  }
  set items {}
  foreach rec [hmscript $script] {
    if { [catch { array set p $rec }] || ![info exists p(ID)] } then { array unset p; continue }
    set channelId ""
    if { [info exists p(CHANNEL)] } then { set channelId $p(CHANNEL) }
    lappend items "\{\"id\":[json_toString $p(ID)],\"name\":[json_toString $p(NAME)],\"type\":\"HSSDP\",\"channelId\":[json_toString $channelId]\}"
    array unset p
  }
  return $items
}

proc v2_model_handle { } {
  global MODEL_SECTIONS MODEL_DEFAULT_SECTIONS MODEL_DEFAULT_LIMIT MODEL_MAX_LIMIT

  # the session decides first (401 before any ReGa script)
  v2_requireLevel GUEST

  lassign [model_param sections] hasSections sectionText
  if { $hasSections } then {
    set sections [split $sectionText ,]
    if { "" == $sectionText } then { jsonrpc_error 403 "invalid argument (sections)" }
    foreach s $sections { if { $s ni $MODEL_SECTIONS } then { jsonrpc_error 403 "invalid argument (sections)" } }
  } else {
    set sections $MODEL_DEFAULT_SECTIONS
  }

  lassign [model_param limit] hasLimit limit
  if { !$hasLimit } then { set limit $MODEL_DEFAULT_LIMIT }
  if { ![regexp {^[0-9]{1,6}$} $limit] || [scan $limit %d l] < 1 || $l < 1 || $l > $MODEL_MAX_LIMIT } then {
    jsonrpc_error 403 "invalid argument (limit)"
  }
  scan $limit %d limit

  lassign [model_param offset] hasOffset offset
  if { !$hasOffset } then { set offset 0 }
  if { ![regexp {^[0-9]{1,9}$} $offset] } then { jsonrpc_error 403 "invalid argument (offset)" }
  scan $offset %d offset

  # devices and channels come from one bulk script
  if { "devices" in $sections || "channels" in $sections } then {
    lassign [model_readDevices] deviceItems channelItems
  }

  set parts {}
  foreach s $MODEL_SECTIONS {
    if { $s ni $sections } then { continue }
    switch -- $s {
      devices   { set items $deviceItems }
      channels  { set items $channelItems }
      rooms     { set items [model_readGroups ID_ROOMS] }
      functions { set items [model_readGroups ID_FUNCTIONS] }
      sysvars   { set items [model_readSysvars] }
      programs  { set items [model_readPrograms] }
      datapoints { set items [model_readDatapoints] }
    }
    lappend parts [model_section $s $items $offset $limit]
  }
  v2_respondJson "\{[join $parts ,]\}"
}
