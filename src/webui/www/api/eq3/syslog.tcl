##
# syslog.tcl - correlation id and syslog logging of the JSON API (staged SP005, T124)
#
# The correlation id of a request is 16 lowercase hex characters from 8 bytes of /dev/urandom
# (^[0-9a-f]{16}$); it is created on first use and stays the same for the whole request. It is
# written to the syslog next to the full error text and returned to the client in the generic
# message "internal error (ref: <id>)" (v2 additionally as the header X-Correlation-Id).
# Syslog line (BD-06):
#   logger -t webui-api -p daemon.err "cid=<id> method=<name> uid=<uid|-> code=<code> errorInfo=<single line>"
##

##
# The correlation id of the current request
##
proc api_cid { } {
  global API_CID
  if { ![info exists API_CID] || ![regexp {^[0-9a-f]{16}$} $API_CID] } then {
    set hex ""
    if { ![catch {
      set fd [open /dev/urandom r]
      fconfigure $fd -translation binary
      binary scan [read $fd 8] H* hex
      close $fd
    }] && [regexp {^[0-9a-f]{16}$} $hex] } then {
      set API_CID $hex
    } else {
      set API_CID [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
    }
  }
  return $API_CID
}

##
# Writes one line to the syslog (never raises)
##
proc api_syslog { priority message } {
  catch { exec logger -t webui-api -p $priority $message }
}

##
# The log line of an error: cid, method, user id, code and the error text on ONE line
# (newlines as \n)
##
proc api_logError { code info } {
  global JSONRPC API_UID
  set method ""
  if { [info exists JSONRPC(METHOD)] } then { set method $JSONRPC(METHOD) }
  set uid "-"
  if { [info exists API_UID] && "" != $API_UID } then { set uid $API_UID }
  set info [string map [list "\r" "" "\n" {\n}] $info]
  api_syslog daemon.err "cid=[api_cid] method=$method uid=$uid code=$code errorInfo=$info"
}
