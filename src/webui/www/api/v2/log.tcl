##
# v2/log.tcl - GET and DELETE /api/v2/log: the system log (the classic "System log", the history of the logged
# datapoints and system variables) and clearing it
#
#   GET /api/v2/log?limit=<1..1000, default 200>&offset=<n newest records to skip, default 0>
#     {"total":<records in the log>,"offset":<n>,"limit":<n>,"items":[<newest first>]}
#     item {"time":"2026-10-31 21:30:35","name":"Anwesenheit","kind":"SYSVAR"|"CHANNEL","datapoint":"STATE",
#           "values":[{"value","type","unit","valueList","valueName0","valueName1"}]}
#   The records of one event (the same group number, one channel with several datapoints) are one item, as in the
#   classic list. name is the name of the system variable or of the channel; datapoint is the datapoint of a channel
#   ("" for a system variable). value is the recorded value as text ("true"/"false" for a logic or alarm value, the
#   index of a list entry); type is LOGIC, ALARM, LIST, NUMBER or STRING, the rest describes how to write it.
#   total counts records, not items; limit and offset count records.
#   Only the names and the raw values are given: the classic page writes the values with a page function that
#   uses the string tables of the WebUI (value texts of channels), which a script cannot call.
#   DELETE /api/v2/log   clears the whole log (it cannot be undone) and answers {"cleared":true,"total":0}
# USER or higher for both (the classic UI gives a guest neither). Errors (HTTP status by BD-04): no or unknown session
# 401, a guest 403, a malformed limit or offset 422 (error 403 "invalid argument (<name>)"), another method 405 with
# Allow: GET, DELETE. Clearing is one line in the syslog (who).
##

set LOG_DEFAULT_LIMIT 200
set LOG_MAX_LIMIT 1000

proc log_param { name } {
  global V2_QUERY
  if { [regexp "(?:^|&)${name}=(\[^&\]*)" $V2_QUERY -> v] } then { return [list 1 $v] }
  return [list 0 ""]
}

##
# The number of records in the log
##
proc log_count { } {
  set script {
    integer rc;
    string s;
    integer n = 0;
    foreach(s, dom.GetHistoryData(0, 1000000, &rc)) { n = n + 1; }
    Write(n);
  }
  set n [string trim [hmscript $script]]
  # hmscript answers "" when the script failed: that is no empty log (and must never read as "cleared")
  if { ![regexp {^[0-9]{1,9}$} $n] } then { jsonrpc_error 501 "the system log could not be read" }
  scan $n %d n
  return $n
}

##
# The records start ... start+count-1 (oldest first) with the name and the kind of the datapoint behind each
##
proc log_records { start count } {
  set script {
    integer rc;
    string s;
    foreach(s, dom.GetHistoryData(logStart.ToInteger(), logCount.ToInteger(), &rc))
    {
      string hid = s.StrValueByIndex(";", 1);
      var h = dom.GetObject(hid);
      if (h)
      {
        var d = dom.GetObject(h.ArchiveDP());
        if (d)
        {
          string kind = "SYSVAR";
          string name = d.Name();
          string dp = "";
          boolean sysv = (d.IsTypeOf(OT_VARDP) || d.IsTypeOf(OT_ALARMDP));
          if (!sysv)
          {
            kind = "CHANNEL";
            dp = d.HSSID();
            var c = dom.GetObject(d.Channel());
            if (c) { name = c.Name(); }
          }
          string t = "UNKNOWN";
          if (d.ValueType() == ivtBinary) { t = "LOGIC"; }
          if (d.ValueType() == ivtBinary) { if (d.ValueSubType() == istAlarm) { t = "ALARM"; } }
          if (d.ValueType() == ivtInteger) { t = "NUMBER"; }
          if (d.ValueType() == ivtInteger) { if (d.ValueSubType() == istEnum) { t = "LIST"; } }
          if (d.ValueType() == ivtFloat) { t = "NUMBER"; }
          if (d.ValueType() == ivtString) { t = "STRING"; }
          WriteLine("{");
          WriteLine("GROUP {" # s.StrValueByIndex(";", 0) # "}");
          WriteLine("VALUE {" # s.StrValueByIndex(";", 2) # "}");
          WriteLine("TIME {" # s.StrValueByIndex(";", 3) # "}");
          WriteLine("KIND {" # kind # "}");
          WriteLine("NAME {" # name # "}");
          WriteLine("DP {" # dp # "}");
          WriteLine("TYPE {" # t # "}");
          WriteLine("UNIT {" # d.ValueUnit() # "}");
          WriteLine("LIST {" # d.ValueList() # "}");
          WriteLine("V0 {" # d.ValueName0() # "}");
          WriteLine("V1 {" # d.ValueName1() # "}");
          WriteLine("}");
        }
      }
    }
  }
  array set a [list logStart $start logCount $count]
  return [v2_records [hmscript $script a]]
}

##
# The value as the client should read it: a logic or alarm value is true or false (the archive holds 0 and 1)
##
proc log_value { type raw } {
  if { $type eq "LOGIC" || $type eq "ALARM" } then {
    set v [string tolower [string trim $raw]]
    if { $v eq "1" || $v eq "true" } then { return true }
    if { $v eq "0" || $v eq "false" } then { return false }
  }
  return $raw
}

proc v2_log_handle { } {
  global env LOG_DEFAULT_LIMIT LOG_MAX_LIMIT
  set verb $env(REQUEST_METHOD)
  v2_requireLevel USER

  if { "DELETE" eq $verb } then {
    set script { Write(dom.ClearHistoryData()); }
    hmscript $script
    api_syslog daemon.notice "cid=[api_cid] method=DELETE /api/v2/log uid=[v2_sessionUid] action=clear system log"
    set total [log_count]
    v2_respondJson "\{\"cleared\":[expr { 0 == $total ? "true" : "false" }],\"total\":$total\}"
    return
  }

  lassign [log_param limit] hasLimit limit
  if { !$hasLimit } then { set limit $LOG_DEFAULT_LIMIT }
  if { ![regexp {^[0-9]{1,6}$} $limit] || [scan $limit %d l] < 1 || $l < 1 || $l > $LOG_MAX_LIMIT } then { jsonrpc_error 403 "invalid argument (limit)" }
  scan $limit %d limit
  lassign [log_param offset] hasOffset offset
  if { !$hasOffset } then { set offset 0 }
  if { ![regexp {^[0-9]{1,9}$} $offset] } then { jsonrpc_error 403 "invalid argument (offset)" }
  scan $offset %d offset

  set total [log_count]
  # the newest records: skip offset from the end, take limit before them
  set end [expr { $total - $offset }]
  if { $end < 0 } then { set end 0 }
  set start [expr { $end - $limit }]
  if { $start < 0 } then { set start 0 }
  set count [expr { $end - $start }]

  set items {}
  if { $count > 0 } then {
    # group the records of one event (consecutive records with the same group number) into one item
    set groups {}
    set last ""
    foreach rec [log_records $start $count] {
      if { [catch { array set r $rec }] || ![info exists r(GROUP)] } then { array unset r; continue }
      foreach k {VALUE TIME KIND NAME DP TYPE UNIT LIST V0 V1} { if { ![info exists r($k)] } then { set r($k) "" } }
      set v "\{\"value\":[json_toString [log_value $r(TYPE) $r(VALUE)]],\"type\":[json_toString $r(TYPE)],\"unit\":[json_toString $r(UNIT)],\"valueList\":[json_toString $r(LIST)],\"valueName0\":[json_toString $r(V0)],\"valueName1\":[json_toString $r(V1)]\}"
      if { $r(GROUP) eq $last && [llength $groups] > 0 } then {
        lset groups end 3 [concat [lindex $groups end 3] [list $v]]
        # the classic list shows the time and the name of the last record of a group
        lset groups end 0 $r(TIME)
        lset groups end 1 $r(NAME)
      } else {
        lappend groups [list $r(TIME) $r(NAME) [list $r(KIND) $r(DP)] [list $v]]
        set last $r(GROUP)
      }
      array unset r
    }
    # newest first
    foreach g [lreverse $groups] {
      lassign $g time name kd values
      lassign $kd kind dp
      lappend items "\{\"time\":[json_toString $time],\"name\":[json_toString $name],\"kind\":[json_toString $kind],\"datapoint\":[json_toString $dp],\"values\":\[[join $values ,]\]\}"
    }
  }
  v2_respondJson "\{\"total\":$total,\"offset\":$offset,\"limit\":$limit,\"items\":\[[join $items ,]\]\}"
}
