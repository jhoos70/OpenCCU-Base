##
# v2/programs.tcl - POST /api/v2/programs {"id","execute":true}: runs a program
#
# The "Action" of the classic status page. USER or higher (GUEST is HTTP 403). The answer is strict JSON
#   {"id":"1053","executed":true,"lastExecuteTime":"2026-10-31 21:10:00"}
# with the time of the last run as ReGa reports it after the run. (Activating and deactivating a program, the other
# planned use of this route, belongs to the editor and is not built: "isActive" is an unknown key for now.)
#
# Only a program can be run: the id is looked up in the collection of the programs in both scripts, never as any ReGa
# object. A program that is internal is refused (HTTP 403), a program copy is not found (404), and a user who is not
# an administrator needs the full access right of the program (as the classic status page, which lists only those).
# Errors (HTTP status by BD-04): no or unknown session 401, a guest, an internal program or no right 403, unknown id
# 404, a malformed body, id or key 422 (error 403 "invalid argument (<name>)"), a body that is not JSON 400. Every run
# is one line in the syslog (who, which program).
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

proc v2_programs_handle { } {
  v2_requireLevel USER

  set text [v2_body]
  if { [catch { array set body [json_parseObject text] } cause] } then {
    jsonrpc_error 100 "invalid request ($cause)"
  }
  foreach key [array names body] {
    if { $key ni {id execute} } then { jsonrpc_error 403 "invalid argument ([regsub -all {[^A-Za-z0-9_.-]} [string range $key 0 39] _])" }
  }
  if { ![info exists body(id)] || ![regexp {^[0-9]{1,10}$} $body(id)] } then { jsonrpc_error 403 "invalid argument (id)" }
  if { ![info exists body(execute)] || "true" ne $body(execute) } then { jsonrpc_error 403 "invalid argument (execute)" }

  set p [programs_read $body(id)]
  array set s [expr { "" == $p ? {COPY false} : $p }]
  if { "" == $p || [string is true -strict $s(COPY)] } then {
    global API_HTTP_STATUS
    set API_HTTP_STATUS 404
    jsonrpc_error 501 "program not found"
  }
  if { [string is true -strict $s(INTERNAL)] } then { jsonrpc_error 400 "access denied (program)" }
  if { [v2_sessionLevel] < 8 && ![string is true -strict $s(FULL)] } then { jsonrpc_error 400 "access denied (program)" }

  array set r [programs_execute $body(id)]
  api_syslog daemon.notice "cid=[api_cid] method=POST /api/v2/programs uid=[v2_sessionUid] action=execute program $body(id)"
  v2_respondJson "\{\"id\":[json_toString $body(id)],\"executed\":[expr { [string is true -strict $r(OK)] ? "true" : "false" }],\"lastExecuteTime\":[json_toString $r(TIME)]\}"
}
