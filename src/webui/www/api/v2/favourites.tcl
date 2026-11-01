##
# v2/favourites.tcl - GET, POST and DELETE /api/v2/favourites: the favourite lists of the signed-in user (the classic
# "Favorites") and creating, editing and deleting a list
#
# GET     USER or higher. The lists are the ones the classic page shows for the user: the enabled and visible children
#         of the user's own container "_USER<id>" below ID_FAVORITES, without the editing copies, in the order ReGa
#         keeps them. Every user, an administrator too, sees only their own lists, as in the classic UI. The answer is
#         strict JSON
#           {"lists":[{"id","name","info","items":[{"id","type","name"}]}]}
#         where type is CHANNEL, SYSVAR, PROGRAM or SEPARATOR (the empty line the classic list can hold); other kinds
#         of members are left out. The members are only named here: the values of the channels come from
#         GET /api/v2/values?channels=, the system variables and programs from the model.
# POST    USER or higher. Creates a new favourite list for the signed-in user (when "id" is omitted) or updates an
#         existing list of the signed-in user (when "id" is given):
#           {"id"?:"1587","name":"Heizung","info"?:"...","items":[{"type":"CHANNEL"|"SYSVAR"|"PROGRAM"|"SEPARATOR","id"?:"4477"}]}
#         A new list is added to ID_FAVORITES, to the PC end-device container (202) and to the signed-in user's
#         "_USER<id>" container (created if needed), as in the classic editor. Updating replaces the name, description
#         and members in order, deleting any old OT_OBJECT separators so they do not leak. Every CHANNEL, SYSVAR and
#         PROGRAM member is checked against its ReGa collection before anything is written (internal, hidden or copy
#         objects and other ReGa IDs are rejected with HTTP 422). A user who is not an administrator cannot edit a list
#         that is also assigned to another user (HTTP 403, as in the classic favOverview.htm). Answers the saved list
#         {"id","name","info","items":[...]}.
# DELETE  USER or higher. DELETE /api/v2/favourites?id=<id> deletes a list of the signed-in user (removing its
#         OT_OBJECT separators, removing it from the user and end-device containers and deleting the OT_FAVORITE
#         object) and answers {"id","deleted":true}. Unerasable lists and lists shared with another user (when the
#         caller is not an administrator) are refused with HTTP 403; an unknown list is HTTP 404.
#
# The scripts are fixed text; the user id is the session's own (never a parameter), and all inputs reach ReGa as string
# variables. Every create, update and delete writes one line to the syslog.
##

set FAVOURITES_NAME_MAX 200
set FAVOURITES_INFO_MAX 1000
set FAVOURITES_ITEMS_MAX 200

##
# Formats the LIST and ITEM records of a ReGa output into a list of JSON list objects; stores the first list's id in
# p_firstId when given
##
proc favourites_formatLists { out {p_firstId ""} } {
  if { "" != $p_firstId } then { upvar $p_firstId firstId; set firstId "" }
  set lists {}
  set order {}
  foreach rec [v2_records $out] {
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
    if { "" != $p_firstId && "" == $firstId } then { set firstId $id }
    lappend lists "\{\"id\":[json_toString $id],\"name\":[json_toString $name($id)],\"info\":[json_toString $info($id)],\"items\":\[[join $items($id) ,]\]\}"
  }
  return $lists
}

##
# Checks whether listId is a favourite list of user uid and whether it is unerasable or shared with another user
##
proc favourites_checkList { uid listId } {
  set script {
    string i;
    string u;
    string f;
    boolean found = false;
    boolean unerasable = false;
    boolean shared = false;
    var favs = dom.GetObject(ID_FAVORITES);
    var user = dom.GetObject("_USER" # uid);
    if (favs)
    {
      if (user)
      {
        foreach(i, user.EnumEnabledVisibleIDs())
        {
          if (i == listId)
          {
            var list = dom.GetObject(i);
            if (list)
            {
              boolean ok = true;
              if (list.Name().Substr(0, 5) == "_USER") { ok = false; }
              if (list.EnCopyID() != ID_ERROR) { ok = false; }
              if (ok)
              {
                found = true;
                unerasable = list.Unerasable();
              }
            }
          }
        }
      }
      if (found)
      {
        var users = dom.GetObject(ID_USERS);
        if (users)
        {
          foreach(u, users.EnumEnabledVisibleIDs())
          {
            if (u != uid)
            {
              var other = favs.Get("_USER" # u);
              if (other)
              {
                foreach(f, other.EnumIDs())
                {
                  if (f == listId) { shared = true; }
                }
              }
            }
          }
        }
      }
    }
    Write("FOUND {" # found # "} UNERASABLE {" # unerasable # "} SHARED {" # shared # "}");
  }
  array set a [list uid $uid listId $listId]
  array set r {FOUND false UNERASABLE false SHARED false}
  catch { array set r [hmscript $script a] }
  if { ![string is true -strict $r(FOUND)] } then { return "" }
  return [array get r]
}

##
# Verifies that every non-SEPARATOR item in spec ("TYPE:ID,...") exists in its ReGa collection and is not internal
##
proc favourites_checkMembers { spec } {
  set need 0
  foreach entry [split $spec ,] {
    if { "" != $entry && ![string match SEPARATOR:* $entry] } then { incr need }
  }
  if { 0 == $need } then { return 1 }
  set script {
    string entry;
    string dId;
    string sId;
    string pId;
    boolean allOk = true;
    foreach(entry, itemSpec.Split(","))
    {
      string kind = entry.StrValueByIndex(":", 0);
      string id = entry.StrValueByIndex(":", 1);
      boolean ok = false;
      if (kind == "SEPARATOR") { ok = true; }
      if (kind == "CHANNEL")
      {
        var ch = dom.GetObject(id);
        if (ch)
        {
          if (ch.TypeName() == "CHANNEL")
          {
            if (false == ch.Internal())
            {
              var dev = dom.GetObject(ch.Device());
              if (dev)
              {
                if (dev.ReadyConfig())
                {
                  if (dom.GetObject(dev.Interface()))
                  {
                    foreach(dId, root.Devices().EnumIDs())
                    {
                      if (dId == dev.ID()) { ok = true; }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (kind == "SYSVAR")
      {
        foreach(sId, dom.GetObject(ID_SYSTEM_VARIABLES).EnumIDs())
        {
          if (sId == id)
          {
            var sv = dom.GetObject(sId);
            if (sv)
            {
              boolean isSv = false;
              if (sv.TypeName() == "VARDP") { isSv = true; }
              if (sv.TypeName() == "ALARMDP") { isSv = true; }
              if (isSv)
              {
                if (sv.Visible())
                {
                  if (false == sv.Internal()) { ok = true; }
                }
              }
            }
          }
        }
      }
      if (kind == "PROGRAM")
      {
        foreach(pId, dom.GetObject(ID_PROGRAMS).EnumIDs())
        {
          if (pId == id)
          {
            var p = dom.GetObject(pId);
            if (p)
            {
              if (p.TypeName() == "PROGRAM")
              {
                if (false == p.Internal())
                {
                  if (p.ProgramCopyID() == ID_ERROR) { ok = true; }
                }
              }
            }
          }
        }
      }
      if (false == ok) { allOk = false; }
    }
    Write("OK {" # allOk # "}");
  }
  array set a [list itemSpec $spec]
  array set r {}
  catch { array set r [hmscript $script a] }
  if { ![info exists r(OK)] } then { return -1 }
  return [expr { [string is true -strict $r(OK)] ? 1 : 0 }]
}

##
# Creates (listId == "") or updates (listId != "") a favourite list for uid and outputs its LIST and ITEM records
##
proc favourites_save { uid listId name info spec } {
  set script {
    string c;
    string entry;
    var favs = dom.GetObject(ID_FAVORITES);
    if (favs)
    {
      var user = favs.Get("_USER" # uid);
      if (!user)
      {
        user = dom.CreateObject(OT_FAVORITE, "_USER" # uid);
        if (user) { favs.Add(user.ID()); }
      }
      var list;
      if (listId == "")
      {
        if (user)
        {
          list = dom.CreateObject(OT_FAVORITE);
          if (list)
          {
            list.EnumType(etFavorite);
            favs.Add(list.ID());
            var pc = dom.GetObject(202);
            if (pc) { pc.Add(list.ID()); }
            user.Add(list.ID());
          }
        }
      }
      else
      {
        list = dom.GetObject(listId);
      }
      if (list)
      {
        list.Name(listName);
        list.EnumInfo(listInfo);
        foreach(c, list.EnumIDs())
        {
          var old = dom.GetObject(c);
          if (old)
          {
            if (old.TypeName() == "OBJECT") { dom.DeleteObject(old.ID()); }
          }
        }
        list.RemoveAll();
        foreach(entry, itemSpec.Split(","))
        {
          string kind = entry.StrValueByIndex(":", 0);
          string id = entry.StrValueByIndex(":", 1);
          if (kind == "SEPARATOR")
          {
            var sep = dom.CreateObject(OT_OBJECT);
            if (sep) { list.Add(sep.ID()); }
          }
          else
          {
            if (id != "") { list.Add(id.ToInteger()); }
          }
        }
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
            if (o.TypeName() == "ALARMDP") { t = "SYSVAR"; }
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
  array set a [list uid $uid listId $listId listName $name listInfo $info itemSpec $spec]
  return [hmscript $script a]
}

##
# Deletes listId and its OT_OBJECT separators and removes it from the user and end-device containers
##
proc favourites_delete { listId } {
  set script {
    string c;
    string u;
    boolean deleted = false;
    var favs = dom.GetObject(ID_FAVORITES);
    var list = dom.GetObject(listId);
    if (favs)
    {
      if (list)
      {
        foreach(c, list.EnumIDs())
        {
          var old = dom.GetObject(c);
          if (old)
          {
            if (old.TypeName() == "OBJECT") { dom.DeleteObject(old.ID()); }
          }
        }
        list.RemoveAll();
        var pc = dom.GetObject(202);
        if (pc) { pc.Remove(list.ID()); }
        var pda = dom.GetObject(203);
        if (pda) { pda.Remove(list.ID()); }
        var central = dom.GetObject(204);
        if (central) { central.Remove(list.ID()); }
        var users = dom.GetObject(ID_USERS);
        if (users)
        {
          foreach(u, users.EnumEnabledVisibleIDs())
          {
            var uList = favs.Get("_USER" # u);
            if (uList) { uList.Remove(list.ID()); }
          }
        }
        favs.Remove(list.ID());
        deleted = dom.DeleteObject(list.ID());
      }
    }
    Write("DELETED {" # deleted # "}");
  }
  array set a [list listId $listId]
  array set r {}
  catch { array set r [hmscript $script a] }
  return [expr { [info exists r(DELETED)] && [string is true -strict $r(DELETED)] }]
}

proc v2_favourites_handle { } {
  global env V2_QUERY API_HTTP_STATUS FAVOURITES_NAME_MAX FAVOURITES_INFO_MAX FAVOURITES_ITEMS_MAX
  v2_requireLevel USER

  set uid [v2_sessionUid]
  if { "" == $uid } then { jsonrpc_error 400 "access denied (session)" }
  set verb $env(REQUEST_METHOD)

  if { "DELETE" eq $verb } then {
    if { ![regexp {^id=([0-9]{1,10})$} $V2_QUERY -> listId] } then {
      jsonrpc_error 403 "invalid argument (id)"
    }
    set check [favourites_checkList $uid $listId]
    if { "" == $check } then {
      set API_HTTP_STATUS 404
      jsonrpc_error 501 "favourite list not found"
    }
    array set c $check
    if { [string is true -strict $c(UNERASABLE)] || ([v2_sessionLevel] < 8 && [string is true -strict $c(SHARED)]) } then {
      jsonrpc_error 400 "access denied (favourite list)"
    }
    if { ![favourites_delete $listId] } then {
      api_syslog daemon.warning "cid=[api_cid] method=DELETE /api/v2/favourites uid=$uid action=delete favourite list $listId failed: the CCU did not take the change"
      jsonrpc_error 501 "the CCU did not take the change"
    }
    api_syslog daemon.notice "cid=[api_cid] method=DELETE /api/v2/favourites uid=$uid action=delete favourite list $listId"
    v2_respondJson "\{\"id\":[json_toString $listId],\"deleted\":true\}"
    return
  }

  if { "POST" eq $verb } then {
    set raw [v2_body]
    set text $raw
    if { [catch { array set body [json_parseObject text] } cause] || "" != [string trim $text] } then {
      jsonrpc_error 100 "invalid request ($cause)"
    }
    foreach key [array names body] {
      if { $key ni {id name info items} } then {
        jsonrpc_error 403 "invalid argument ([regsub -all {[^A-Za-z0-9_.-]} [string range $key 0 39] _])"
      }
    }
    set listId ""
    if { [info exists body(id)] && "" != $body(id) } then {
      if { ![regexp {^[0-9]{1,10}$} $body(id)] } then { jsonrpc_error 403 "invalid argument (id)" }
      set listId $body(id)
    }
    if { ![info exists body(name)] } then { jsonrpc_error 403 "invalid argument (name)" }
    set name [string trim $body(name)]
    if { "" == $name || [string length $name] > $FAVOURITES_NAME_MAX || [regexp {[\u0000-\u001f\u007f]} $name] || [string match _USER* $name] } then {
      jsonrpc_error 403 "invalid argument (name)"
    }
    set info ""
    if { [info exists body(info)] } then { set info $body(info) }
    if { [string length $info] > $FAVOURITES_INFO_MAX || [regexp {[\u0000-\u001f\u007f]} $info] } then {
      jsonrpc_error 403 "invalid argument (info)"
    }
    if { ![info exists body(items)] || ![regexp {"items"\s*:\s*\[} $raw] || [llength $body(items)] > $FAVOURITES_ITEMS_MAX } then {
      jsonrpc_error 403 "invalid argument (items)"
    }
    set specList {}
    foreach el $body(items) {
      if { [catch { llength $el } n] || 0 == $n || 1 == ($n % 2) } then { jsonrpc_error 403 "invalid argument (items)" }
      array unset item
      array set item $el
      foreach k [array names item] {
        if { $k ni {type id} } then { jsonrpc_error 403 "invalid argument (items)" }
      }
      if { ![info exists item(type)] || $item(type) ni {CHANNEL SYSVAR PROGRAM SEPARATOR} } then {
        jsonrpc_error 403 "invalid argument (items)"
      }
      if { "SEPARATOR" eq $item(type) } then {
        if { [info exists item(id)] && "" != $item(id) && ![regexp {^[0-9]{1,10}$} $item(id)] } then {
          jsonrpc_error 403 "invalid argument (items)"
        }
        lappend specList "SEPARATOR:0"
      } else {
        if { ![info exists item(id)] || ![regexp {^[0-9]{1,10}$} $item(id)] } then {
          jsonrpc_error 403 "invalid argument (items)"
        }
        lappend specList "$item(type):$item(id)"
      }
    }
    set spec [join $specList ,]

    if { "" != $listId } then {
      set check [favourites_checkList $uid $listId]
      if { "" == $check } then {
        set API_HTTP_STATUS 404
        jsonrpc_error 501 "favourite list not found"
      }
      array set c $check
      if { [string is true -strict $c(UNERASABLE)] || ([v2_sessionLevel] < 8 && [string is true -strict $c(SHARED)]) } then {
        jsonrpc_error 400 "access denied (favourite list)"
      }
    }

    set mCheck [favourites_checkMembers $spec]
    if { 0 == $mCheck } then { jsonrpc_error 403 "invalid argument (items)" }
    if { $mCheck < 0 } then {
      api_syslog daemon.warning "cid=[api_cid] method=POST /api/v2/favourites uid=$uid action=validate favourite list members failed: the CCU did not answer"
      jsonrpc_error 501 "the CCU did not take the change"
    }

    set saved [favourites_formatLists [favourites_save $uid $listId $name $info $spec] savedId]
    if { 0 == [llength $saved] } then {
      api_syslog daemon.warning "cid=[api_cid] method=POST /api/v2/favourites uid=$uid action=[expr { "" == $listId ? "create" : "update" }] favourite list failed: the CCU did not take the change"
      jsonrpc_error 501 "the CCU did not take the change"
    }
    api_syslog daemon.notice "cid=[api_cid] method=POST /api/v2/favourites uid=$uid action=[expr { "" == $listId ? "create" : "update" }] favourite list $savedId"
    v2_respondJson [lindex $saved 0]
    return
  }

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
                if (o.TypeName() == "ALARMDP") { t = "SYSVAR"; }
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
  set lists [favourites_formatLists [hmscript $script a]]
  v2_respondJson "\{\"lists\":\[[join $lists ,]\]\}"
}
