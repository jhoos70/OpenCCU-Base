##
# v2/sysvars.tcl - POST /api/v2/sysvars {"id","value"}: changes the value of a system variable
#
# The first mutation route. USER or higher (GUEST is HTTP 403). The answer is strict JSON
#   {"id":"950","value":"true","lastModified":"2026-10-31 21:00:00"}
# with the value and the time as ReGa reports them after the change (the client can check that it took).
#
# Only a system variable can be changed: the id is looked up in the collection of the system variables, never as
# any ReGa object, so a device, a program or a user cannot be reached with it. The value is validated by the type
# of the variable before anything runs on ReGa, and the scripts are fixed text: the value reaches ReGa as a string
# variable (hmscript injects 'var newValue = "<escaped>";': quotes, backslashes and line breaks are escaped), never
# as part of the code.
#   LOGIC   true or false
#   LIST    the index of an entry of the value list (0 ...)
#   NUMBER  a decimal number within the limits of the variable (if it has any)
#   STRING  text of up to 1000 characters without control characters
#   ALARM   not changeable here (HTTP 422)
# A variable that is internal or not visible (the system's own) is refused (HTTP 403), and a user who is not an
# administrator needs the full access right of the variable (as the classic UI). Errors (HTTP status by BD-04):
# no or unknown session 401, a guest or no right 403, unknown id 404, a malformed or invalid body, id or value
# 422 (error 403 "invalid argument (<name>)"), a body that is not JSON 400. Every change is one line in the syslog
# (who, which variable; not the value).
##

set SYSVAR_STRING_MAX 1000

##
# The fixed script that finds a variable in the system variables and describes it
##
proc sysvars_read { id } {
  set script {
    string i;
    foreach(i, dom.GetObject(ID_SYSTEM_VARIABLES).EnumIDs())
    {
      if (i == varId)
      {
        var sv = dom.GetObject(i);
        if (sv)
        {
          string t = "UNKNOWN";
          if (sv.ValueSubType() == istAlarm   ) { t = "ALARM";  }
          if (sv.ValueSubType() == istBool    ) { t = "LOGIC";  }
          if (sv.ValueSubType() == istEnum    ) { t = "LIST";   }
          if (sv.ValueSubType() == istGeneric ) { t = "NUMBER"; }
          if (sv.ValueSubType() == istChar8859) { t = "STRING"; }
          Write("TYPE {" # t # "} MIN {" # sv.ValueMin() # "} MAX {" # sv.ValueMax() # "} LIST {" # sv.ValueList() # "}");
          Write(" VISIBLE {" # sv.Visible() # "} INTERNAL {" # sv.Internal() # "} FULL {" # (sv.UserAccessRights(iulOtherThanAdmin) == iarFullAccess) # "}");
        }
      }
    }
  }
  array set a [list varId $id]
  array set s {TYPE "" MIN "" MAX "" LIST "" VISIBLE false INTERNAL false FULL false}
  if { [catch { array set s [hmscript $script a] }] } then { return "" }
  if { "" == $s(TYPE) } then { return "" }
  return [array get s]
}

##
# The value as text if it is valid for the variable, else "" and the reason in the variable named by the 2nd argument
##
proc sysvars_validate { sv value p_reason } {
  global SYSVAR_STRING_MAX
  upvar $p_reason reason
  array set s $sv
  set reason ""
  switch -- $s(TYPE) {
    LOGIC {
      if { $value ne "true" && $value ne "false" } then { set reason "value" }
    }
    LIST {
      set count [llength [split $s(LIST) ";"]]
      if { ![regexp {^[0-9]{1,4}$} $value] || [scan $value %d n] != 1 || $n >= $count } then { set reason "value" }
    }
    NUMBER {
      if { ![regexp {^-?[0-9]{1,15}(\.[0-9]{1,15})?$} $value] } then {
        set reason "value"
      } else {
        if { $s(MIN) ne "" && [string is double -strict $s(MIN)] && $value < $s(MIN) } then { set reason "value" }
        if { $s(MAX) ne "" && [string is double -strict $s(MAX)] && $value > $s(MAX) } then { set reason "value" }
      }
    }
    STRING {
      if { [string length $value] > $SYSVAR_STRING_MAX || [regexp {[\u0000-\u001f\u007f]} $value] } then { set reason "value" }
    }
    default { set reason "id" }
  }
}

##
# The fixed script that sets the value (by type) and reads it back; the value comes as the variable newValue
##
proc sysvars_write { id type value } {
  set script {
    string i;
    foreach(i, dom.GetObject(ID_SYSTEM_VARIABLES).EnumIDs())
    {
      if (i == varId)
      {
        var sv = dom.GetObject(i);
        if (sv)
        {
          if (kind == "LOGIC")
          {
            if (newValue == "true") { sv.State(true); } else { sv.State(false); }
          }
          if (kind == "LIST")   { sv.State(newValue.ToInteger()); }
          if (kind == "NUMBER") { sv.State(newValue.ToFloat()); }
          if (kind == "STRING") { sv.State(newValue); }
          Write("VALUE {" # sv.Value() # "} TIME {" # sv.Timestamp() # "}");
        }
      }
    }
  }
  array set a [list varId $id kind $type newValue $value]
  array set r {VALUE "" TIME ""}
  catch { array set r [hmscript $script a] }
  return [array get r]
}

proc v2_sysvars_handle { } {
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

  set sv [sysvars_read $body(id)]
  if { "" == $sv } then {
    global API_HTTP_STATUS
    set API_HTTP_STATUS 404
    jsonrpc_error 501 "system variable not found"
  }
  array set s $sv
  # the system's own variables and the ones that are hidden are not for a client to change
  if { [string is true -strict $s(INTERNAL)] || ![string is true -strict $s(VISIBLE)] } then {
    jsonrpc_error 400 "access denied (system variable)"
  }
  if { [v2_sessionLevel] < 8 && ![string is true -strict $s(FULL)] } then {
    jsonrpc_error 400 "access denied (system variable)"
  }
  sysvars_validate $sv $body(value) reason
  if { "" != $reason } then { jsonrpc_error 403 "invalid argument ($reason)" }

  array set r [sysvars_write $body(id) $s(TYPE) $body(value)]
  api_syslog daemon.notice "cid=[api_cid] method=POST /api/v2/sysvars uid=[v2_sessionUid] action=set system variable $body(id)"
  v2_respondJson "\{\"id\":[json_toString $body(id)],\"value\":[json_toString $r(VALUE)],\"lastModified\":[json_toString $r(TIME)]\}"
}
