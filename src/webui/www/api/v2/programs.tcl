##
# v2/programs.tcl - POST /api/v2/programs: runs a program, or switches it on or off
#
#   {"id","execute":true}     runs the program: the "Action" of the classic status page. USER or higher (GUEST is HTTP 403).
#                             The answer is strict JSON {"id":"1053","executed":true,"lastExecuteTime":"2026-10-31 21:10:00"}
#                             with the time of the last run as ReGa reports it after the run.
#   {"id","active":true|false}  activates or deactivates the program: what the classic "Programs and connections" editor
#                             does (the status page only SHOWS the flag). ADMINISTRATORS only (HTTP 403 for anyone else).
#                             The answer is {"id":"1053","isActive":false}, the flag as ReGa holds it after the change.
#                             NOTE: activating a program makes ReGa check its conditions and the program can RUN AT ONCE (seen
#                             on a restored real CCU: activating "Abwesenheit" ran it and four programs that depend on it);
#                             deactivating runs nothing. A client should ask before it activates.
# Exactly one of "execute" and "active" is given.
#
# Only a program can be run: the id is looked up in the collection of the programs in both scripts, never as any ReGa
# object. A program that is internal is refused (HTTP 403), a program copy is not found (404), and a user who is not
# an administrator needs the full access right of the program (as the classic status page, which lists only those); a
# program that is internal (the system's own) is neither run nor switched.
# Errors (HTTP status by BD-04): no or unknown session 401, a guest, an internal program or no right 403, unknown id
# 404, a malformed body, id or key 422 (error 403 "invalid argument (<name>)"), a body that is not JSON 400. Every run
# and every switch is one line in the syslog (who, which program).
##

##
# The fixed script that finds a program in the program collection and describes it
##
proc programs_read { id } {
  set script {
    string i;
    foreach(i, dom.GetObject(ID_PROGRAMS).EnumIDs())
    {
      if (i == progId)
      {
        var p = dom.GetObject(i);
        if (p)
        {
          if (p.IsTypeOf(OT_PROGRAM))
          {
            Write("FOUND {true} INTERNAL {" # p.Internal() # "} COPY {" # (p.ProgramCopyID() != ID_ERROR) # "} FULL {" # (p.UserAccessRights(iulOtherThanAdmin) == iarFullAccess) # "}");
          }
        }
      }
    }
  }
  array set a [list progId $id]
  array set s {FOUND false INTERNAL false COPY false FULL false}
  catch { array set s [hmscript $script a] }
  if { ![string is true -strict $s(FOUND)] } then { return "" }
  return [array get s]
}

##
# The fixed script that runs the program and reads the time of its last run back
##
proc programs_execute { id } {
  set script {
    string i;
    foreach(i, dom.GetObject(ID_PROGRAMS).EnumIDs())
    {
      if (i == progId)
      {
        var p = dom.GetObject(i);
        if (p)
        {
          boolean ok = p.ProgramExecute();
          Write("OK {" # ok # "} TIME {" # p.ProgramLastExecuteTime() # "}");
        }
      }
    }
  }
  array set a [list progId $id]
  array set r {OK false TIME ""}
  catch { array set r [hmscript $script a] }
  return [array get r]
}

##
# The fixed script that sets the active flag of the program and reads it back; the value comes as the variable newActive
##
proc programs_setActive { id active } {
  set script {
    string i;
    foreach(i, dom.GetObject(ID_PROGRAMS).EnumIDs())
    {
      if (i == progId)
      {
        var p = dom.GetObject(i);
        if (p)
        {
          if (newActive == "true") { p.Active(true); } else { p.Active(false); }
          Write("ACTIVE {" # p.Active() # "}");
        }
      }
    }
  }
  array set a [list progId $id newActive $active]
  array set r {ACTIVE ""}
  catch { array set r [hmscript $script a] }
  return [array get r]
}

proc v2_programs_handle { } {
  v2_requireLevel USER

  set text [v2_body]
  if { [catch { array set body [json_parseObject text] } cause] } then {
    jsonrpc_error 100 "invalid request ($cause)"
  }
  foreach key [array names body] {
    if { $key ni {id execute active} } then { jsonrpc_error 403 "invalid argument ([regsub -all {[^A-Za-z0-9_.-]} [string range $key 0 39] _])" }
  }
  if { ![info exists body(id)] || ![regexp {^[0-9]{1,10}$} $body(id)] } then { jsonrpc_error 403 "invalid argument (id)" }
  set switching [info exists body(active)]
  if { $switching && [info exists body(execute)] } then { jsonrpc_error 403 "invalid argument (execute)" }
  if { $switching } then {
    if { $body(active) ne "true" && $body(active) ne "false" } then { jsonrpc_error 403 "invalid argument (active)" }
    # switching a program on or off is the editor's job: administrators only (the status page only shows the flag)
    v2_requireLevel ADMIN
  } elseif { ![info exists body(execute)] || "true" ne $body(execute) } then {
    jsonrpc_error 403 "invalid argument (execute)"
  }

  set p [programs_read $body(id)]
  array set s [expr { "" == $p ? {COPY false} : $p }]
  if { "" == $p || [string is true -strict $s(COPY)] } then {
    global API_HTTP_STATUS
    set API_HTTP_STATUS 404
    jsonrpc_error 501 "program not found"
  }
  if { [string is true -strict $s(INTERNAL)] } then { jsonrpc_error 400 "access denied (program)" }
  if { [v2_sessionLevel] < 8 && ![string is true -strict $s(FULL)] } then { jsonrpc_error 400 "access denied (program)" }

  if { $switching } then {
    array set r [programs_setActive $body(id) $body(active)]
    api_syslog daemon.notice "cid=[api_cid] method=POST /api/v2/programs uid=[v2_sessionUid] action=[expr { $body(active) ? "activate" : "deactivate" }] program $body(id)"
    v2_respondJson "\{\"id\":[json_toString $body(id)],\"isActive\":[expr { [string is true -strict $r(ACTIVE)] ? "true" : "false" }]\}"
    return
  }

  array set r [programs_execute $body(id)]
  api_syslog daemon.notice "cid=[api_cid] method=POST /api/v2/programs uid=[v2_sessionUid] action=execute program $body(id)"
  v2_respondJson "\{\"id\":[json_toString $body(id)],\"executed\":[expr { [string is true -strict $r(OK)] ? "true" : "false" }],\"lastExecuteTime\":[json_toString $r(TIME)]\}"
}
