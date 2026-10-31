##
# system.getTweak (staged SP045)
# Reads a key from the file /etc/config/tweaks
#
# Parameters:
# string key - the key
#
# Return value:
# The value of the key if it exists, otherwise false.
#
# Hardening [TARGET]: the key has to match ^[A-Za-z0-9_.-]{1,64}$ (error 403 "invalid argument
# (key)"), and it is regexp-escaped before it is embedded in the pattern ('.' matches only a dot).
# v1 (frozen): the value is placed in the answer verbatim (unquoted). On /api/v2 the answer is a
# JSON string or the JSON constant false.
##

# (without the staged dispatcher libraries there is no /api/v2)
if { 0 == [llength [info commands jsonrpc_isV2]] } then { proc jsonrpc_isV2 { } { return 0 } }

set _key $args(key)

if { ![regexp {^[A-Za-z0-9_.-]{1,64}$} $_key] } then {
  jsonrpc_error 403 "invalid argument (key)"
}

proc read_var { filename varname} {
    set var ""

    set fd -1
    catch { set fd [open $filename r] }
    if { $fd >=0 } {
        set pattern [string map {. \\.} $varname]
        while { [gets $fd buf] >=0 } {
          if [regexp "^ *$pattern *= *(.*)$" $buf dummy var] break
        }
      close $fd
    }

    return $var
}

set result ""
catch {set result [read_var /etc/config/tweaks $_key]}

if { [jsonrpc_isV2] } then {
  if {$result == ""} {
    jsonrpc_response false
  } else {
    jsonrpc_response [json_toString $result]
  }
} else {
  if {$result == ""} {set result false}

  jsonrpc_response $result
}
