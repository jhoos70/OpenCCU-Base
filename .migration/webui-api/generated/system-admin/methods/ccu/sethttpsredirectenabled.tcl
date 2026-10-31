##
# CCU.setHttpsRedirectEnabled
# Enables or disables the HTTPS redirect (staged SP038, ADMIN only).
#
# Parameters:
#   enabled: [string] "true" creates /etc/config/httpsRedirectEnabled, "false" removes it,
#            anything else answers false and touches nothing
#
# Return value: [bool]
#
# Fix: v1 used the (empty) output of touch/rm as a boolean condition, so every request ended
# with "expected boolean value but got ''" (error 200). The outcome of the command is the
# condition now: true on success, false on a failure (read-only /etc/config), which is logged
# to the syslog with a correlation id.
##

set enabled $args(enabled)
set file "/etc/config/httpsRedirectEnabled"

proc hr_fail { message } {
  global JSONRPC
  if { 0 < [llength [info commands api_cid]] } then {
    set cid [api_cid]
  } else {
    set cid [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
  }
  set method ""
  catch { set method $JSONRPC(METHOD) }
  set line "cid=$cid method=$method uid=- code=0 errorInfo=[string map [list "\r" "" "\n" {\n}] $message]"
  if { 0 < [llength [info commands api_syslog]] } then {
    api_syslog daemon.err $line
  } else {
    catch { exec logger -t webui-api -p daemon.err $line }
  }
}

if { $enabled == "true" } {
	if { [catch { exec touch -- $file } message] } {
		hr_fail $message
		jsonrpc_response false
	} else {
		jsonrpc_response true
	}
} elseif { $enabled == "false" } {
	if { [catch { exec rm -- $file } message] } {
		hr_fail $message
		jsonrpc_response false
	} else {
		jsonrpc_response true
	}
} else {
	jsonrpc_response false
}
