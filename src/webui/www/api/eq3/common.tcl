##
# General helper functions (staged SP004; source of record: src/webui/www/api/eq3/common.tcl)
#
# v1 procedures are kept as they are. New: api_config / api_isStrict, the configuration access
# of the dispatcher (strict mode and the /api/v2 routes).
##

##########
# Arrays #
##########

##
# Removes all elements of an array
##
proc array_clear {name} {
    upvar $name arr
    foreach key [array names arr] {
		unset arr($key)
    }
}

##
# Returns a value of an array, {} if it does not exist
##
proc array_getValue { pArray name } {
  upvar $pArray arr

  set value {}
  catch { set value $arr($name) }

  return $value
}

###########
# Files   #
###########

##
# Saves the content of a variable in a file
##
proc file_save { filename content } {
  if { ![catch { set fd [open $filename w] }] } then {
    puts -nonewline $fd $content
    close $fd
  }
}

##
# Appends data to an existing file
##
proc file_append {filename content} {
	if { ![catch { set fd [open $filename a] }] } then {
		puts -nonewline $fd $content
		close $fd
	}
}

##
# Reads a complete file
##
proc file_load {filename} {
  set content ""
  set fd -1

  catch { set fd [open $filename r] }
  if { 0 <= $fd } then {
    set content [read $fd]
    close $fd
  }
  return $content
}

##
# Clears the content of a file
##
proc file_clear {filename} {

		set fd [open $filename w]
		close $fd

}

#########
# Locks #
#########

##
# Tries to get a lock (v1: always succeeds; the event queue library has its own exclusive lock)
##
proc lock_tryget {filename} {
	set result 0

	catch {
		set fd [open $filename {WRONLY CREAT EXCL}]
		if { 0 <= $fd } then {
			close $fd
			set result true
		}
	}

	return 1
}

##
# Releases a lock
##
proc lock_release {filename} {
  if {[file exists $filename]} {
    catch {file delete -force -- $filename}
  }
}

#################
# Configuration #
#################

##
# Reads a value of the API configuration (api/apiconfig.conf, "array set API_CONFIG {key value ...}").
# The file is read once per request; a missing file or key gives the default (defaults preserve v1).
##
proc api_config { key {default {}} } {
  global API_CONFIG
  if { ![info exists ::API_CONFIG_LOADED] } then {
    set ::API_CONFIG_LOADED 1
    if { ![array exists API_CONFIG] && [file exists apiconfig.conf] } then {
      catch { uplevel #0 [list source apiconfig.conf] }
    }
  }
  if { [array exists API_CONFIG] && [info exists API_CONFIG($key)] } then { return $API_CONFIG($key) }
  return $default
}

##
# Strict mode applies when the flag strict_mode is true or the request is served on /api/v2
# (global API_V2).
##
proc api_isStrict { } {
  global API_V2
  if { [info exists API_V2] && [string is true -strict $API_V2] } then { return 1 }
  return [string is true -strict [api_config strict_mode false]]
}

############################
# Miscellaneous functions  #
############################

##
# Removes duplicates from a list (the list is sorted)
##
proc _lrmdups { _list_ } {
  if {[llength _list_] == 0} then { return "" }

  set _list_ [lsort $_list_]
  set value  [lindex $_list_ 0]
  set result $value

  foreach item $_list_ {
    if {$item > $value} then {
      set value $item
      lappend result $item
    }
  }

  return $result;
}

##
# Removes duplicate program ids
##
proc rmDoublePrgIds { _list_ } {
  if {[llength _list_] == 0} then { return "" }
  set t {}
  foreach i $_list_ {
    if {[lsearch $t $i] == -1} {
      lappend t $i
    }
  }
  return $t;
}
