##
# BidCoS.changeLanGatewayKey
# Prepares the key change of a LAN gateway (staged SP030).
#
# Parameters:
#   lgwclass : [string] RF or Wired
#   lgwserial: [string] serial number of the gateway ('' = nothing to do, answers false)
#   lgwip    : [string] IP address of the gateway
#   newkey   : [string] the new key
#   curkey   : [string] the current hex AES key
#
# Return value: [bool]
#
# Hardening: a non-empty lgwserial has to match ^[A-Za-z0-9_-]{1,32}$ (403 "invalid argument
# (lgwserial)"; '/' and '..' can never reach the file name), the other values must not contain
# CR/LF (403), and /etc/config/<lgwserial>.keychange (single slash) is written to a temporary
# file and moved with rename. The key is stored as given (no hashing, as in v1).
##

set LGWKEY_FILE_PATH "/etc/config"

if { $args(lgwserial) != "" } then {
  if { ![regexp {^[A-Za-z0-9_-]{1,32}$} $args(lgwserial)] } then {
    jsonrpc_error 403 "invalid argument (lgwserial)"
  }
  foreach field {lgwclass lgwip newkey curkey} {
    if { [regexp {[\r\n]} $args($field)] } then {
      jsonrpc_error 403 "invalid argument ($field)"
    }
  }

  set LGWKEY_FILE "$LGWKEY_FILE_PATH/$args(lgwserial).keychange"
  set tmp "$LGWKEY_FILE.[pid].tmp"
  set fd [open $tmp w]
  puts $fd "Class=$args(lgwclass)"
  puts $fd "Serial=$args(lgwserial)"
  puts $fd "IP=$args(lgwip)"
  puts $fd "KEY=$args(newkey)"
  puts $fd "CURKEY=$args(curkey)"
  close $fd
  file rename -force -- $tmp $LGWKEY_FILE

  jsonrpc_response true
} else {
  jsonrpc_response false
}
