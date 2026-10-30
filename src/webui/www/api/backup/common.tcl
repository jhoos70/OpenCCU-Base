##
# common.tcl - framework of the backup CGIs (staged SP010, branch B of the EG-1 decision)
#
# Kept from v1: query string parsing, URL decoding, loadFile, getInterfaceUrl, the 400 text
# response and the session library at /www/tcl/eq3 (the CGIs 'source common.tcl' relative to
# their own directory).
# Hardening:
#  - the output is buffered: nothing reaches the client before main finished, so an error after
#    the Content-Type header yields only the '400 Bad Request' response
#  - the 400 body is one of a fixed set of tokens; any other error text (raw Tcl messages, paths)
#    is replaced by INTERNAL_ERROR and logged with a correlation id
##

load tclrega.so
load tclrpc.so

source /www/tcl/eq3/session.tcl
source /www/tcl/eq3/rega.tcl

set IPC_INTERFACES_FILE "/etc/config/InterfacesList.xml"

array set _query_args_ {}

# error tokens a backup CGI may answer (everything else is INTERNAL_ERROR)
set BACKUP_ERROR_TOKENS {
  TOO_MANY_SESSIONS INVALID_CREDENTIALS LOGIN_ERROR LOGOUT INVALID_SESSION
  UNKNOWN_INTERFACE ACCESS_DENIED PATH_NOT_ALLOWED MISSING_BODY INTERNAL_ERROR
}

##
# Output buffering: puts to stdout is collected in BACKUP_OUT and written by startup
##
set BACKUP_OUT ""
if { 0 == [llength [info commands ::__backup_puts]] } then {
  rename ::puts ::__backup_puts
  proc ::puts { args } {
    global BACKUP_OUT
    set newline 1
    set a $args
    if { [lindex $a 0] eq "-nonewline" } then { set newline 0; set a [lrange $a 1 end] }
    if { 2 == [llength $a] } then {
      lassign $a channel text
    } else {
      set channel stdout
      set text [lindex $a 0]
    }
    if { $channel ne "stdout" } then {
      return [uplevel 1 [concat [list ::__backup_puts] $args]]
    }
    append BACKUP_OUT $text
    if { $newline } then { append BACKUP_OUT "\n" }
    return
  }
}

##
# Correlation id (16 lowercase hex chars from 8 bytes of /dev/urandom)
##
proc backup_cid { } {
  set hex ""
  if { [catch {
    set fd [open /dev/urandom r]
    fconfigure $fd -translation binary
    binary scan [read $fd 8] H* hex
    close $fd
  }] || ![regexp {^[0-9a-f]{16}$} $hex] } then {
    set hex [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
  }
  return $hex
}

proc getInterfaceUrl { interfaceName } {
	global IPC_INTERFACES_FILE

	set content [loadFile $IPC_INTERFACES_FILE]

	set node_start [string first "<ipc"  $content]
	set node_end	 [string first "</ipc" $content $node_start]
	while { (0 < $node_start) && (0 < $node_end) } {
		set node [string range $content $node_start $node_end]
		if {
				[regexp {<name[^>]*>(.+)</name[^>]*>} $node dummy name] &&
				[regexp {<url[^>]*>(.+)</url[^>]*>}   $node dummy url] &&
				[regexp {<info[^>]*>(.+)</info[^>]*>} $node dummy info]
		} {
			set interfaces($name) $url
		}
		set node_start [string first "<ipc" $content $node_end]
		set node_end   [string first "</ipc" $content $node_start]
	}

	if {[info exists interfaces($interfaceName)]} {
		return $interfaces($interfaceName)
	} else {
		error UNKNOWN_INTERFACE
	}
}

proc getQueryArg { name } {
	global _query_args_

	if { [info exists _query_args_($name)] } {
		return $_query_args_($name)
	} else {
		return {}
	}
}

proc parseQueryString { } {
	global _query_args_ env

	if { [info exists env(QUERY_STRING)] } {
		foreach item [split $env(QUERY_STRING) &] {
			if { [regexp {([^=]+)=(.+)} $item dummy key value] } {
				set key   [decodeUrl $key]
				set value [decodeUrl $value]

				set _query_args_($key) $value
			}
		}
	}
}

proc getPostData { } {
	global env

	if { [info exists env(CONTENT_LENGTH)] } {
		set contentLength $env(CONTENT_LENGTH)
		set script [read stdin $contentLength]
	}

}

proc decodeUrl { url } {
	set url [string map -nocase [list + { } "\\" "\\\\" %0d%0a \n] $url]
	regsub -all -nocase {%([a-f0-9][a-f0-9])} $url {\\u00\1} url
	set url [encoding convertfrom [subst -novar -nocommand $url]]

	return $url
}

proc loadFile { name } {
	if [catch {
		set fd [open $name r]
		set content [read $fd]
		close $fd
	}] {
		set content ""
	}

	return $content
}

##
# Configuration: api/apiconfig.conf ("array set API_CONFIG {key value ...}"), read once per
# request. Missing file or key means the default (the path allow-list is EMPTY = deny all).
##
proc backup_config { key {default {}} } {
	global API_CONFIG
	if { ![info exists ::backup_config_loaded] } then {
		set ::backup_config_loaded 1
		set file [file join [file dirname [pwd]] apiconfig.conf]
		if { [file exists $file] } then { catch { uplevel #0 [list source $file] } }
	}
	if { [info exists API_CONFIG($key)] } then { return $API_CONFIG($key) }
	return $default
}

##
# Fail-closed ADMIN check of the session (query argument sid, '@'-wrapped): the session has
# to be valid (session_isValid returns exactly "true") and its privilege level has to be 8.
# Anything else, including a failing ReGa, is INVALID_SESSION.
##
proc backup_requireAdmin { sid } {
	if { [regexp {["'\\[:cntrl:]]} $sid] } then { error INVALID_SESSION }
	if { [catch { session_isValid $sid } valid] || $valid != "true" } then { error INVALID_SESSION }

	set script "var _session_id_ = \"$sid\";"
	append script {
		var upl = 0;
		var s = system.GetSessionVarStr(_session_id_);
		if (s) { upl = s.StrValueByIndex(";", 1); }
		Write(upl);
	}
	if { [catch { rega_exec $script } upl] || [string trim $upl] != "8" } then { error INVALID_SESSION }
}

##
# Exact-match path allow-list (no normalisation, no globbing, no prefix match; default empty)
##
proc backup_requirePath { file } {
	if { $file == "" } then { error PATH_NOT_ALLOWED }
	set allowed [backup_config path_allow_list.backup_files {}]
	if { [lsearch -exact $allowed $file] < 0 } then { error PATH_NOT_ALLOWED }
}

##
# 400 text response with a fixed error token
##
proc put_error { errorMsg } {
	global BACKUP_ERROR_TOKENS
	if { [lsearch -exact $BACKUP_ERROR_TOKENS $errorMsg] < 0 } then {
		set cid [backup_cid]
		set cause [string map [list "\r" "" "\n" {\n}] $errorMsg]
		catch { exec logger -t webui-api -p daemon.err "cid=$cid method=backup uid=- code=400 errorInfo=$cause" }
		set errorMsg INTERNAL_ERROR
	}
	::__backup_puts "HTTP/1.0 400 Bad Request"
	::__backup_puts "Content-Type: text/plain"
	::__backup_puts ""
	::__backup_puts -nonewline "$errorMsg"
}

proc startup { } {
	global BACKUP_OUT
	set BACKUP_OUT ""
	if [catch {
		parseQueryString
		main
	} errorMsg] {
		put_error $errorMsg
	} else {
		::__backup_puts -nonewline $BACKUP_OUT
	}
}