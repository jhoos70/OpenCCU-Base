##
# admin_audit.tcl - shared audit helper of the JSON API (SP034, BD-06)
#
# One syslog line per administrative action:
#   cid=<16 hex> method=<name> uid=<uid|-> action=<text>
# written through api_syslog (fallback: logger -t webui-api -p daemon.notice). The proc is
# defined once here; the system-admin method scripts only call it. An already existing proc of
# the same name is kept.
#
# admin_audit action
#   action: short text, e.g. "restart ReGaHss"
##
if { 0 == [llength [info commands admin_audit]] } then {
  proc admin_audit { action } {
    global JSONRPC
    upvar #0 args callArgs
    set uid -
    catch {
      set idScript {var s = system.GetSessionVarStr(_session_id_); if (s) { Write(s.StrValueByIndex(";", 0)); }}
      set out [string trim [hmscript $idScript callArgs]]
      if { [regexp {^[0-9]+$} $out] } then { set uid $out }
    }
    if { 0 < [llength [info commands api_cid]] } then {
      set cid [api_cid]
    } else {
      set cid [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
    }
    set method ""
    catch { set method $JSONRPC(METHOD) }
    set line "cid=$cid method=$method uid=$uid action=$action"
    if { 0 < [llength [info commands api_syslog]] } then {
      api_syslog daemon.notice $line
    } else {
      catch { exec logger -t webui-api -p daemon.notice $line }
    }
  }
}
