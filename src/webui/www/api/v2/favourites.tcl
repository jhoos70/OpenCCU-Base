##
# v2/favourites.tcl - GET /api/v2/favourites: the favourite lists of the signed-in user (the classic "Favorites")
#
# USER or higher. The lists are the ones the classic page shows for the user: the enabled and visible children of
# the user's own container "_USER<id>" below ID_FAVORITES, without the editing copies, in the order ReGa keeps them. Every
# user, an administrator too, sees only their own lists, as in the classic UI. The answer is strict JSON
#   {"lists":[{"id","name","info","items":[{"id","type","name"}]}]}
# where type is CHANNEL, SYSVAR, PROGRAM or SEPARATOR (the empty line the classic list can hold); other kinds of
# members are left out. The members are only named here: the values of the channels come from GET /api/v2/values?channels=,
# the system variables and programs from the model. The scripts are fixed text and read only; the user id is the
# session's own (never a parameter), and reaches ReGa as a string variable.
##

proc v2_favourites_handle { } {
  v2_requireLevel USER

  set uid [v2_sessionUid]
  if { "" == $uid } then { jsonrpc_error 400 "access denied (session)" }
  set script {
    string i;
    string c;
    var user = dom.GetObject("_USER" # uid);
    if (user)
    {
      foreach(i, user.EnumEnabledVisibleIDs())
      {
        var list = dom.GetObject(i);
        if (list)
        {
          boolean show = true;
          if (list.Name().Substr(0, 5) == "_USER") { show = false; }
          if (list.EnCopyID() != ID_ERROR) { show = false; }
          if (show)
          {
            WriteLine("{");
            WriteLine("LIST {" # list.ID() # "}");
            WriteLine("NAME {" # list.Name() # "}");
            WriteLine("INFO {" # list.EnumInfo() # "}");
            WriteLine("}");
            foreach(c, list.EnumIDs())
            {
              var o = dom.GetObject(c);
              if (o)
              {
                string t = "";
                if (o.TypeName() == "CHANNEL") { t = "CHANNEL"; }
                if (o.TypeName() == "VARDP") { t = "SYSVAR"; }
                if (o.TypeName() == "PROGRAM") { t = "PROGRAM"; }
                if (o.TypeName() == "OBJECT") { t = "SEPARATOR"; }
                if (t != "")
                {
                  WriteLine("{");
                  WriteLine("ITEM {" # list.ID() # "}");
                  WriteLine("ID {" # o.ID() # "}");
                  WriteLine("TYPE {" # t # "}");
                  WriteLine("NAME {" # o.Name() # "}");
                  WriteLine("}");
                }
              }
            }
          }
        }
      }
    }
  }
  array set a [list uid $uid]
  set lists {}
  set order {}
  foreach rec [hmscript $script a] {
    array unset p
    if { [catch { array set p $rec }] } then { continue }
    if { [info exists p(LIST)] } then {
      lappend order $p(LIST)
      set name($p(LIST)) $p(NAME)
      set info($p(LIST)) [expr { [info exists p(INFO)] ? $p(INFO) : "" }]
      set items($p(LIST)) {}
    } elseif { [info exists p(ITEM)] && [info exists items($p(ITEM))] } then {
      lappend items($p(ITEM)) "\{\"id\":[json_toString $p(ID)],\"type\":[json_toString $p(TYPE)],\"name\":[json_toString $p(NAME)]\}"
    }
  }
  foreach id $order {
    lappend lists "\{\"id\":[json_toString $id],\"name\":[json_toString $name($id)],\"info\":[json_toString $info($id)],\"items\":\[[join $items($id) ,]\]\}"
  }
  v2_respondJson "\{\"lists\":\[[join $lists ,]\]\}"
}
