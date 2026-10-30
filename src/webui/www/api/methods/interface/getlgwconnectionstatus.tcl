##
# Interface.getLGWConnectionStatus
# Returns the connection status file of a LAN gateway (staged SP023).
#
# Hardening: the serial has to match ^[A-Za-z0-9_-]{1,32}$ (error 403 "invalid argument (serial)",
# the file name is never built from anything else); a missing or unreadable status file is the
# generic error 200 "internal error (ref: <correlation id>)" (the path stays in the syslog).
#
# Parameters:
#   interface: [string] name of the interface (required by the dispatcher, unused)
#   serial   : [string] serial number of the gateway
#
# Return value: [object] {connstat, serial}
##

set serial $args(serial)

if { ![regexp {^[A-Za-z0-9_-]{1,32}$} $serial] } then {
  jsonrpc_error 403 "invalid argument (serial)"
}

set filename "/var/status/${serial}.connstat"
if { [catch {
  set fd [open "$filename" "r"]
  set filedata [read $fd]
  close $fd
} errorMessage] } then {
  set cid [api_cid]
  api_syslog daemon.err "cid=$cid method=Interface.getLGWConnectionStatus uid=- code=200 errorInfo=[string map [list "\n" {\n}] $errorMessage]"
  jsonrpc_error 200 "internal error (ref: $cid)"
}

jsonrpc_response "\{\"connstat\":[json_toString $filedata], \"serial\":[json_toString $serial]\}"
