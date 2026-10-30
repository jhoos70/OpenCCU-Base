 ##
 # ReGa.getAllDatapoints (staged SP044)
 #
 # Privilege level: ADMIN
 # Parameters:      none (the session id is declared: ARGUMENTS {_session_id_})
 #
 # Return value: [array of string]
 #   Lines '<id>--<type>--<name>[--<deviceName>][--<address>]' with the ids and names of the
 #   datapoints, channels and devices (and of the other ReGa objects of the collections below),
 #   in ascending id order, with the trailing empty element of v1.
 #
 # The v1 script probed all 65,535 ids with dom.GetObject; this script enumerates the object
 # collections instead (devices, their channels and datapoints, rooms, functions, programs,
 # system variables). The line format is unchanged. Objects outside these collections (EG-7: the
 # equivalence has to be verified on a real object model) are no longer reported.
 ##

 set script {

  string result = "";
  string dId;
  string cId;
  string pId;
  string oId;
  object dev;
  object chn;
  object dp;
  object o;

  foreach(dId, root.Devices().EnumIDs())
  {
    dev = dom.GetObject(dId);
    if (dev) {
      if (dev.Address() != "") {
        result = result #dev.ID()#"--DEVICE--"#dev.Name()#"--"#dev.Address()#"\n";
      } else {
        result = result #dev.ID()#"--DEVICE--"#dev.Name()#"--"#dev.Name()#"\n";
      }
      foreach(cId, dev.Channels())
      {
        chn = dom.GetObject(cId);
        if (chn) {
          if (dev.Address() != "") {
            result = result #chn.ID()#"--CHANNEL--"#chn.Name()#"--"#dev.Address()#"\n";
          } else {
            result = result #chn.ID()#"--CHANNEL--"#chn.Name()#"--"#dev.Name()#"\n";
          }
          foreach(pId, chn.DPs())
          {
            dp = dom.GetObject(pId);
            if (dp) {
              if (dev.Address() != "") {
                result = result #dp.ID()#"--HSSDP--"#dp.Name()#"--"#dev.Name()#"--"#dev.Address()#"\n";
              } else {
                result = result #dp.ID()#"--HSSDP--"#dp.Name()#"--"#dev.Name()#"\n";
              }
            }
          }
        }
      }
    }
  }

  foreach(oId, dom.GetObject(ID_ROOMS).EnumUsedIDs())
  {
    o = dom.GetObject(oId);
    if (o) { result = result #o.ID()#"--"#o.TypeName()#"--"#o.Name()#"\n"; }
  }
  foreach(oId, dom.GetObject(ID_FUNCTIONS).EnumUsedIDs())
  {
    o = dom.GetObject(oId);
    if (o) { result = result #o.ID()#"--"#o.TypeName()#"--"#o.Name()#"\n"; }
  }
  foreach(oId, dom.GetObject(ID_PROGRAMS).EnumIDs())
  {
    o = dom.GetObject(oId);
    if (o) { result = result #o.ID()#"--"#o.TypeName()#"--"#o.Name()#"\n"; }
  }
  foreach(oId, dom.GetObject(ID_SYSTEM_VARIABLES).EnumIDs())
  {
    o = dom.GetObject(oId);
    if (o) { result = result #o.ID()#"--"#o.TypeName()#"--"#o.Name()#"\n"; }
  }
  Write(result);
 }

 # the lines in ascending id order (the order of the v1 id scan)
 set entries {}
 foreach line [split [hmscript $script] "\n"] {
   if { "" == $line } then { continue }
   if { ![regexp {^([0-9]+)--} $line -> lineId] } then { set lineId 2147483647 }
   lappend entries [list $lineId $line]
 }

 set result "\["
 set first 1

 foreach entry [lsort -integer -index 0 $entries] {
   if {$first != 1} then { append result ","} else { set first 0 }
   append result [json_toString [lindex $entry 1]]
 }
 # the empty last element: the output of v1 ends with '\n'
 if {$first != 1} then { append result "," }
 append result [json_toString ""]

 append result "\]"

 jsonrpc_response $result
