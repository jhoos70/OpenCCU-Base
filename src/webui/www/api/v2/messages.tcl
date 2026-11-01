##
# v2/messages.tcl - POST /api/v2/messages {"id"}: acknowledges an alarm or service message (the classic "Confirm")
#
# USER or higher. The answer is strict JSON {"id":"18385","acknowledged":true}: acknowledged says the message is no longer
# triggered-and-unacknowledged (a device that still reports the condition can raise it again, then it is back in the list).
#
# Only an alarm system variable or a service message can be acknowledged: the id is looked up in those two collections
# (ID_SYSTEM_VARIABLES, ID_SERVICES), never as any ReGa object, and it must be an alarm that is triggered now. The rule is
# the classic ReceiptAlarm: the message has no trigger datapoint, or its trigger datapoint can be written (a message
# whose trigger is read-only, for example an "unreachable" report, cannot be confirmed: HTTP 403). A user who is not an
# administrator needs the full access right of an alarm variable (as for any system variable). Errors (HTTP status by
# BD-04): no or unknown session 401, a guest or no right 403, an id that is no alarm, or one that is not triggered
# (any more) 404, a malformed or invalid body or id 422 (error 403 "invalid argument (<name>)"), a body that is not
# JSON 400. Every acknowledgement is one line in the syslog (who, which message).
##

set MESSAGES_COLLECTIONS {ID_SYSTEM_VARIABLES SYSVAR ID_SERVICES SERVICE}

##
# The fixed script text that looks the message up in ONE collection; %COLLECTION% and %KIND% are replaced by constants
# of this file, the id reaches ReGa as the string variable msgId
##
set MESSAGES_FIND {
  foreach(i, dom.GetObject(%COLLECTION%).EnumIDs())
  {
    if (i == msgId)
    {
      var m = dom.GetObject(i);
      if (m)
      {
        if (m.IsTypeOf(OT_ALARMDP))
        {
          boolean canAck = true;
          var trig = dom.GetObject(m.AlTriggerDP());
          if (trig) { canAck = false; if (OPERATION_WRITE & trig.Operations()) { canAck = true; } }
          boolean full = true;
          if ("%KIND%" == "SYSVAR") { full = false; if (m.UserAccessRights(iulOtherThanAdmin) == iarFullAccess) { full = true; } }
          boolean isOn = false;
          if (m.AlState() == asOncoming) { isOn = true; }
          if (doReceipt == "true") { if (isOn) { if (canAck) { if (full || (isAdmin == "true")) { m.AlReceipt(); } } } }
          boolean stillOn = false;
          if (m.AlState() == asOncoming) { stillOn = true; }
          Write("KIND {%KIND%} ON {" # isOn # "} CAN {" # canAck # "} FULL {" # full # "} STILL {" # stillOn # "}");
        }
      }
    }
  }
}

proc messages_script { } {
  global MESSAGES_COLLECTIONS MESSAGES_FIND
  set body ""
  foreach {collection kind} $MESSAGES_COLLECTIONS {
    append body [string map [list %COLLECTION% $collection %KIND% $kind] $MESSAGES_FIND]
  }
  return "string i;\n$body"
}

##
# Looks the message up (and, with receipt true, acknowledges it if the rules allow it); returns the fields of the first
# collection that has it, or "" if there is none
##
proc messages_run { id receipt } {
  set script [messages_script]
  array set a [list msgId $id doReceipt [expr { $receipt ? "true" : "false" }] isAdmin [expr { [v2_sessionLevel] >= 8 ? "true" : "false" }]]
  array set r {KIND "" ON false CAN false FULL false STILL false}
  if { [catch { array set r [hmscript $script a] }] } then { return "" }
  if { "" == $r(KIND) } then { return "" }
  return [array get r]
}

proc v2_messages_handle { } {
  global API_HTTP_STATUS
  v2_requireLevel USER

  set text [v2_body]
  if { [catch { array set body [json_parseObject text] } cause] } then {
    jsonrpc_error 100 "invalid request ($cause)"
  }
  foreach key [array names body] {
    if { $key ne "id" } then { jsonrpc_error 403 "invalid argument ([regsub -all {[^A-Za-z0-9_.-]} [string range $key 0 39] _])" }
  }
  if { ![info exists body(id)] || ![regexp {^[0-9]{1,10}$} $body(id)] } then { jsonrpc_error 403 "invalid argument (id)" }

  # first look only (nothing is acknowledged), so the rules can be checked and refused before ReGa changes anything
  set found [messages_run $body(id) 0]
  if { "" == $found } then {
    set API_HTTP_STATUS 404
    jsonrpc_error 501 "message not found"
  }
  array set m $found
  if { ![string is true -strict $m(ON)] } then {
    set API_HTTP_STATUS 404
    jsonrpc_error 501 "message not found"
  }
  if { ![string is true -strict $m(CAN)] } then { jsonrpc_error 400 "access denied (message)" }
  if { [v2_sessionLevel] < 8 && ![string is true -strict $m(FULL)] } then { jsonrpc_error 400 "access denied (message)" }

  set after [messages_run $body(id) 1]
  api_syslog daemon.notice "cid=[api_cid] method=POST /api/v2/messages uid=[v2_sessionUid] action=acknowledge message $body(id)"
  set acknowledged "true"
  if { "" != $after } then {
    array set r $after
    if { [string is true -strict $r(STILL)] } then { set acknowledged "false" }
  }
  v2_respondJson "\{\"id\":[json_toString $body(id)],\"acknowledged\":$acknowledged\}"
}
