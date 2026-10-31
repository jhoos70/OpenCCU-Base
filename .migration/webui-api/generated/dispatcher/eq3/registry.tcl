##
# registry.tcl - the methods.conf registry (staged SP002)
#
# methods.conf is a Tcl list text: name {LEVEL <NONE|GUEST|USER|ADMIN> SCRIPT_FILE <relpath>
# [METHOD_FILE <relpath>] INFO {<text>} ARGUMENTS {<names...>}}. registry_load fills the global
# array METHOD_LIST (name -> the entry list, as in v1).
#
# The registry is served from a cache (/var/tmp/api_registry.cache): the header of the cache file
# names the file, its mtime and its size, so an unchanged methods.conf is not read or parsed
# again after the first request; a newer methods.conf rebuilds the cache (write-then-rename).
# methods.conf may be UTF-8 (staged file) or ISO-8859-1 (v1 file); the encoding is detected.
# A missing file gives an empty registry (every call is then 401 as in v1); a malformed file
# raises an error after the parse error was written to the syslog with the correlation id (the
# dispatcher answers it as error 200 with the same id).
##

if { ![info exists REGISTRY_CACHE_FILE] } then {
  set REGISTRY_CACHE_FILE "/var/tmp/api_registry.cache"
}

##
# Reads methods.conf as text: UTF-8 if the bytes are valid UTF-8, otherwise ISO-8859-1
##
proc registry_readFile { file } {
  set fd [open $file r]
  fconfigure $fd -translation binary
  set raw [read $fd]
  close $fd

  set raw  [string map [list "\r\n" "\n"] $raw]
  set text [encoding convertfrom utf-8 $raw]
  if { [encoding convertto utf-8 $text] ne $raw } then {
    set text [encoding convertfrom iso8859-1 $raw]
  }
  return $text
}

##
# Loads the registry into METHOD_LIST, returns the number of entries
##
proc registry_load { {file methods.conf} } {
  global METHOD_LIST REGISTRY_CACHE_FILE

  array unset METHOD_LIST
  array set METHOD_LIST {}

  if { ![file exists $file] } then { return 0 }

  if { [catch { set header "# registry-cache $file [file mtime $file] [file size $file]" } ] } then { return 0 }

  # served from the cache if it belongs to the unchanged methods.conf
  if { [file exists $REGISTRY_CACHE_FILE] } then {
    if { ![catch {
      set fd [open $REGISTRY_CACHE_FILE r]
      fconfigure $fd -encoding utf-8
      set head [gets $fd]
      set body [read $fd]
      close $fd
    }] && $head eq $header } then {
      if { ![catch { array set METHOD_LIST $body }] } then {
        return [array size METHOD_LIST]
      }
      array unset METHOD_LIST
      array set METHOD_LIST {}
    }
  }

  # parse methods.conf
  if { [catch {
    array set METHOD_LIST [registry_readFile $file]
  } cause] } then {
    array unset METHOD_LIST
    array set METHOD_LIST {}
    if { 0 < [llength [info commands api_cid]] } then {
      set cid [api_cid]
    } else {
      set cid [format %016x [expr { int(rand() * 4294967296) * 4294967296 + int(rand() * 4294967296) }]]
    }
    set line "cid=$cid method=registry uid=- code=200 errorInfo=cannot parse $file: [string map [list "\r" "" "\n" {\n}] $cause]"
    if { 0 < [llength [info commands api_syslog]] } then {
      api_syslog daemon.err $line
    } else {
      catch { exec logger -t webui-api -p daemon.err $line }
    }
    error "registry could not be loaded"
  }

  # write the cache (write-then-rename, failures are ignored: the registry works without it)
  set tmp "$REGISTRY_CACHE_FILE.[pid].tmp"
  if { [catch {
    set fd [open $tmp w]
    fconfigure $fd -encoding utf-8
    puts $fd $header
    puts -nonewline $fd [array get METHOD_LIST]
    close $fd
    file rename -force -- $tmp $REGISTRY_CACHE_FILE
  }] } then {
    catch { file delete -force -- $tmp }
  }

  return [array size METHOD_LIST]
}
