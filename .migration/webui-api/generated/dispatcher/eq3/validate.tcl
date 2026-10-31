##
# validate.tcl - central validation of the request parameters (staged SP032 acceptance[8], BD-10)
#
# validate_request is called by the executor after the privilege check and the argument-presence
# check, before the method script is sourced; a violation ends the request with
#   403 "invalid argument (<name>)"      (v1: HTTP 200, v2: HTTP 422)
# Rules:
#  - every string parameter is free of control characters U+0000-U+001F except TAB, LF and CR
#  - the parameters that carry a "pattern" in the schema data (schema/methods.json, one entry per
#    method under params.properties.<argument>, one method entry per line) match it: dataId, testId, serial, serialNumber,
#    lgwserial (the locked patterns of BD-10; the method scripts check the same patterns again)
# Types are not enforced centrally: the v1 parser delivers every value as an untyped string and
# the classic UI sends numbers, booleans and lists in many spellings (NFR-045).
#
# The patterns are read from the schema data file once and kept in a cache file
# (/var/tmp/api_validate.cache, header = file name, mtime, size; replaced by write-then-rename).
# Without the schema data file only the control-character rule applies.
##

if { ![info exists VALIDATE_CACHE_FILE] } then {
  set VALIDATE_CACHE_FILE "/var/tmp/api_validate.cache"
}

##
# The validation patterns: dict method -> dict argument -> pattern
##
proc validate_patterns { } {
  global DOCUMENT_API_DIR VALIDATE_CACHE_FILE VALIDATE_PATTERNS

  if { [info exists VALIDATE_PATTERNS] } then { return $VALIDATE_PATTERNS }
  set VALIDATE_PATTERNS [dict create]

  if { ![info exists DOCUMENT_API_DIR] } then { return $VALIDATE_PATTERNS }
  set file [file join $DOCUMENT_API_DIR schema methods.json]
  if { ![file exists $file] } then { return $VALIDATE_PATTERNS }

  set header "# validate-cache $file [file mtime $file] [file size $file]"
  if { [file exists $VALIDATE_CACHE_FILE] } then {
    if { ![catch {
      set fd [open $VALIDATE_CACHE_FILE r]
      fconfigure $fd -encoding utf-8
      set head [gets $fd]
      set body [read $fd]
      close $fd
    }] && $head eq $header && ![catch { dict size $body }] } then {
      set VALIDATE_PATTERNS $body
      return $VALIDATE_PATTERNS
    }
  }

  # parse the schema data (once; the result is cached)
  if { [catch {
    set fd [open $file r]
    fconfigure $fd -encoding utf-8
    set text [read $fd]
    close $fd
    # The schema data has one method entry per line; the patterns are read with regular
    # expressions (the general JSON parser of json.tcl needs seconds for the 50 KB file).
    set patterns [dict create]
    foreach line [split $text "\n"] {
      if { ![regexp {^\{"name":"([^"]+)"} $line -> methodName] } then { continue }
      foreach {all arg kind pattern} [regexp -all -inline {"([A-Za-z0-9_]+)":\{"type":"string","(pattern|patternV2)":"((?:[^"\\]|\\.)*)"\}} $line] {
        # "patternV2" applies on /api/v2 only (v1 is frozen); it is stored as <argument>@v2
        if { "patternV2" eq $kind } then { append arg "@v2" }
        dict set patterns $methodName $arg [string map [list "\\\\" "\\" "\\\"" "\"" "\\/" "/"] $pattern]
      }
    }
    set VALIDATE_PATTERNS $patterns
  } cause] } then {
    catch { close $fd }
    set VALIDATE_PATTERNS [dict create]
    api_syslog daemon.warning "cid=[api_cid] method=validate uid=- code=0 errorInfo=schema data not used ([string map [list "\n" { }] $cause])"
    return $VALIDATE_PATTERNS
  }

  set tmp "$VALIDATE_CACHE_FILE.[pid].tmp"
  if { [catch {
    set fd [open $tmp w]
    fconfigure $fd -encoding utf-8
    puts $fd $header
    puts -nonewline $fd $VALIDATE_PATTERNS
    close $fd
    file rename -force -- $tmp $VALIDATE_CACHE_FILE
  }] } then {
    catch { file delete -force -- $tmp }
  }
  return $VALIDATE_PATTERNS
}

proc validate_label { name } {
  return [string range [regsub -all {[^A-Za-z0-9_.-]} $name _] 0 39]
}

##
# Validates the parameters of the current request (arrays method and args of the caller)
##
proc validate_request { p_method p_args } {
  global JSONRPC
  upvar $p_method method
  upvar $p_args   args

  foreach name [array names args] {
    if { [regexp {[\x00-\x08\x0b\x0c\x0e-\x1f]} $args($name)] } then {
      jsonrpc_error 403 "invalid argument ([validate_label $name])"
    }
  }

  set patterns [validate_patterns]
  if { [dict exists $patterns $JSONRPC(METHOD)] } then {
    dict for {arg pattern} [dict get $patterns $JSONRPC(METHOD)] {
      if { [string match *@v2 $arg] } then {
        if { 0 == [llength [info commands jsonrpc_isV2]] || ![jsonrpc_isV2] } then { continue }
        set arg [string range $arg 0 end-3]
      }
      if { [info exists args($arg)] && ![regexp -- $pattern $args($arg)] } then {
        jsonrpc_error 403 "invalid argument ($arg)"
      }
    }
  }
}
