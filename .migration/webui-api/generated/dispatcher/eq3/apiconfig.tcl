##
# apiconfig.tcl - the API configuration and the central / config-tool decision (staged SP013)
#
# The configuration file api/apiconfig.conf is a Tcl file that only sets the array API_CONFIG
# ("array set API_CONFIG {key value ...}"). It is evaluated in a SAFE interpreter, so it can set
# values but not run commands; a missing, unreadable or malformed file gives the defaults (which
# preserve v1: every flag false) and one syslog line with the correlation id.
#
# Config-tool (non-central) mode is selected only by the explicit flag config_tool_mode = true,
# never inferred from DOCUMENT_ROOT (v1 compared DOCUMENT_ROOT with "/www/").
##

##
# The defaults (flag names locked in BD-08, limits in BD-09)
##
proc apiconfig_defaults { } {
  return {
    strict_mode false config_tool_mode false v2_enabled false cookie_mode false
    rate_limit false sid_shape_strict false
    batch_limit 20 per_sid_limit 60 per_sid_window_seconds 10
    login_ip_limit 10 login_ip_window_seconds 60
  }
}

proc apiconfig_log { cause } {
  set cause [string map [list "\r" "" "\n" {\n}] $cause]
  if { 0 < [llength [info commands api_cid]] } then {
    set cid [api_cid]
  } else {
    set cid [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
  }
  set line "cid=$cid method=apiconfig uid=- code=0 errorInfo=configuration not used, defaults apply ($cause)"
  if { 0 < [llength [info commands api_syslog]] } then {
    api_syslog daemon.warning $line
  } else {
    catch { exec logger -t webui-api -p daemon.warning $line }
  }
}

##
# Loads the configuration: defaults first, then the file. Returns 1 if the file was applied,
# 0 if the defaults are used.
##
proc apiconfig_load { {file apiconfig.conf} } {
  global API_CONFIG API_CONFIG_LOADED

  array unset API_CONFIG
  array set API_CONFIG [apiconfig_defaults]
  set API_CONFIG_LOADED 1

  if { ![file exists $file] } then { return 0 }

  set i ""
  if { [catch {
    set fd [open $file r]
    fconfigure $fd -translation binary
    set content [encoding convertfrom utf-8 [read $fd]]
    close $fd

    set i [interp create -safe]
    $i eval { array set API_CONFIG {} }
    $i eval $content
    array set API_CONFIG [$i eval { array get API_CONFIG }]
  } cause] } then {
    catch { close $fd }
    catch { interp delete $i }
    array unset API_CONFIG
    array set API_CONFIG [apiconfig_defaults]
    apiconfig_log $cause
    return 0
  }
  catch { interp delete $i }
  return 1
}

##
# Is the flag set? Only the literal value true (any case) counts.
##
proc apiconfig_flag { key } {
  global API_CONFIG
  if { ![info exists API_CONFIG($key)] } then { return 0 }
  return [expr { "true" eq [string tolower [string trim $API_CONFIG($key)]] }]
}

##
# The value of the Tcl variable "central": false only for config_tool_mode = true
##
proc apiconfig_central { } {
  if { [apiconfig_flag config_tool_mode] } then { return false }
  return true
}
