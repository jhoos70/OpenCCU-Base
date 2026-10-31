##
# hmscript.tcl
# Running HomeMatic Script (staged SP006).
#
# v1 behaviour is kept (same procedures, same generated prefix, same results). Hardening:
#  - hmscript and hmscript_runFromFile delegate to ONE injection routine (hmscript_inject), so the
#    generated 'var' prefix is byte-identical for the same arguments
#  - hmscript_whitelist reduces the client parameters to the names declared in the method's
#    ARGUMENTS and rejects declared string values with NUL or another control character other than
#    TAB, LF, CR (403 "invalid argument (<name>)") - IC003; backslash, quotes, LF, CR and TAB stay
#    escaped by the one escape routine
#  - a failing rega_script is logged to the syslog with the correlation id; the empty string is
#    still returned (callers that need fail-closed semantics treat '' as denied)
##

package require HomeMatic

##
# The one injection routine: 'var <name> = "<escaped value>";' for every element of the array
# (p_args is the name of an array in the caller of the calling procedure, '-' for none)
##
proc hmscript_inject { p_args } {
  set prefix ""

  if { "-" != $p_args } then {
    upvar 1 $p_args args

    foreach name [array names args] {
      set varname [hmscript_sanitizeIdentifier $name]
      append prefix "var $varname = \"[hmscript_escapeString $args($name)]\";\n"
    }
  }

  return $prefix
}

proc hmscript {script {p_args -}} {
  if { "-" != $p_args } then { upvar $p_args args }
  set _script_ [hmscript_inject [expr { "-" != $p_args ? "args" : "-" }]]

  append _script_ $script

  return [hmscript_run _script_]
}

##
# Logs a failing ReGa script with the correlation id (never raises)
##
proc hmscript_logFailure { cause } {
  if { 0 < [llength [info commands api_cid]] } then {
    set cid [api_cid]
  } else {
    set cid [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
  }
  set line "cid=$cid method=hmscript uid=- code=0 errorInfo=rega_script failed: [string map [list "\r" "" "\n" {\n}] $cause]"
  if { 0 < [llength [info commands api_syslog]] } then {
    catch { api_syslog daemon.err $line }
  } else {
    catch { exec logger -t webui-api -p daemon.err $line }
  }
}

##
# Runs a HomeMatic Script and returns the result ('' when the execution failed)
##
proc hmscript_run { p_script } {
  upvar $p_script script

  if { ![catch {array set result [rega_script $script]} cause] } then {
    return $result(STDOUT)
  }
  hmscript_logFailure $cause
  return ""
}

proc hmscript_runInline { script } {
  if { ![catch {array set result [rega_script $script]} cause] } then {
    return $result(STDOUT)
  }
  hmscript_logFailure $cause
  return ""
}

proc hmscript_runFromFile { filename {p_args -}} {
  if { "-" != $p_args } then { upvar $p_args args }
  set script [hmscript_inject [expr { "-" != $p_args ? "args" : "-" }]]

  append script [file_load $filename]

  return [hmscript_run script]
}

##
# Escapes a string value for the use inside a HomeMatic Script string literal (exactly once)
##
proc hmscript_escapeString { str } {
  return [string map {
    "\\" "\\\\"
    "\'" "\\\'"
    "\"" "\\\""
    "\n" "\\n"
    "\r" "\\r"
    "\t" "\\t"
  } $str]
}

proc hmscript_assertFloat { value } {
  if { ![string is double -strict $value] } then {
    error "Value '$value' is not a valid float"
  }
}

proc hmscript_assertInteger { value } {
  if { ![string is integer -strict $value] } then {
    error "Value '$value' is not a valid integer"
  }
}

proc hmscript_assertBoolean { value } {
  if { ![string is boolean -strict $value] } then {
    error "Value '$value' is not a valid boolean"
  }
}

# Strips characters not matched by sanitizeIdentifiers regex and fixes an invalid leading character.
proc hmscript_sanitizeIdentifier { name } {
  set replacements [regsub -all {[^A-Za-z0-9_]} $name {} newname ]
  if { ![regexp {^[A-Za-z_]} $newname] } then {
    set newname "_$newname"
  }
  return [string range $newname 0 63]
}

##
# IC003: reduces the array to the declared parameter names. A declared value with NUL or another
# control character U+0000-U+001F except TAB, LF, CR is rejected with 403 "invalid argument
# (<name>)" (the call ends with the JSON-RPC error). Returns the names that were kept.
##
proc hmscript_whitelist { declared p_args } {
  upvar 1 $p_args args

  foreach name [array names args] {
    if { [lsearch -exact $declared $name] < 0 } then { unset args($name) }
  }

  foreach name [lsort [array names args]] {
    if { [regexp {[\x00-\x08\x0b\x0c\x0e-\x1f]} $args($name)] } then {
      jsonrpc_error 403 "invalid argument ($name)"
    }
  }

  return [array names args]
}
