##
# Interface.searchDaliDevices
# Starts the DALI device search (setValue without checkXmlRpcStatus, v1 semantics:
# on failure the error text is logged and the script ends without a JSON response).
# Hardening (staged SP019): the log line is appended with Tcl file I/O; no request
# data reaches a command line (the v1 version used "exec echo ... >> /tmp/searchDali.log").
#
# Parameters:
#   interface: [string] name of the interface
#   address  : [string] address of the logical device
#   valueKey : [string] id of the parameter
#   type     : [string] XML-RPC type
#   value    : [string] the value
#
# Return value: [bool] true
##

set address  $args(address)
set valueKey $args(valueKey)
set type     $args(type)
set value    $args(value)

catch { xmlrpc $interface(URL) setValue [list string $address] [list string $valueKey] [list $type $value] } errorMessage

if {$errorMessage != ""} {
  set systemTime [clock seconds]
  catch {
    set logFd [open /tmp/searchDali.log a]
    puts $logFd "[clock format $systemTime -format %D] - [clock format $systemTime -format %H:%M:%S] setValue errorMessage: $errorMessage"
    close $logFd
  }
  exit
}

jsonrpc_response true
