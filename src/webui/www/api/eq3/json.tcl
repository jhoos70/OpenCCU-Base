##
# json.tcl
# JSON parser and the single JSON serializer (staged SP005; source of record:
# src/webui/www/api/eq3/json.tcl).
#
# The v1 untyped parser is kept (numbers, true/false/null become literal strings, objects and
# arrays become untyped Tcl lists). Changes:
#  - json_parseUnicodeChar validates the four hex digits: the v1 version passed them to subst,
#    so a crafted escape such as "\u[cmd]" ran a Tcl command
#  - json_toString escapes every control character U+0000-U+001F (\b \f \n \r \t by name, all
#    others as \u00XX), so the document is always valid JSON
#  - json_escapeControl does the same for a pre-built result text
#  - json_isValid checks a complete JSON value (used by the v2 serializer)
##

##
# Reads the first character of a text
##
proc json_getc { p_text {mode 0} } {
  upvar $p_text text

  if { "-nospace" == $mode } then { set text [string trimleft $text] }
  if { ""         == $text } then { return -code error "unexpected end of text" }

  set c    [string index $text 0]
  set text [string range $text 1 end]

  return $c
}

##
# Returns the first character of a text without removing it
##
proc json_preview { p_text {mode 0} } {
  upvar $p_text text

  if { "-nospace" == $mode } then { set text [string trimleft $text] }
  if { ""         == $text } then { return -code error "unexpected end of text" }

  return [string index $text 0]
}

##
# Parses a JSON object into a flat key/value list
##
proc json_parse { text } {
  return [json_parseObject text]
}

##
# Parses a JSON object into a flat key/value list
##
proc json_parseObject { p_text } {
  upvar $p_text text

  set object ""
  set c      ","

  if { "\{" != [json_getc text -nospace] } then {
    return -code error "\"\{\" expected"
  }

  if { "\}" != [json_preview text -nospace] } then {
    while { "," == $c } {
      set name  [json_parseString text]
      set c     [json_getc text -nospace]
      set value ""

      if { ":" == $c } then {
        set value [json_parseValue text]
        set c     [json_getc text -nospace]
      }

      lappend object $name $value
    }
  } else {
    set c [json_getc text -nospace]
  }

  if { "\}" != $c } then {
    return -code error "\"\}\" expected"
  }

  return $object
}

##
# Parses a JSON array into a list
##
proc json_parseArray { p_text } {
  upvar $p_text text

  set values ""
  set c      ","

  if { "\[" != [json_getc text -nospace] } then {
    return -code error "\"\[\" expected"
  }

  if { "\]" != [json_preview text -nospace] } then {
    while { "," == $c } {
      lappend values [json_parseValue text]
      set c [json_getc text -nospace]
    }
  } else {
    set c [json_getc text -nospace]
  }

  if { "\]" != $c } then {
    return -code error "\"\]\" expected, but \"$c\" found"
  }

  return $values
}

##
# Parses a JSON value (recursion)
##
proc json_parseValue { p_text } {
  upvar $p_text text

  set value ""

  switch -exact -- [json_preview text -nospace] {
    "\""    { set value [json_parseString text] }
    "\{"    { set value [json_parseObject text] }
    "\["    { set value [json_parseArray  text] }
    "n"     { set value [json_parseConstant text null] }
    "t"     { set value [json_parseConstant text true] }
    "f"     { set value [json_parseConstant text false] }
    default { set value [json_parseNumber text] }
  }

  return $value
}

##
# Parses a string
##
proc json_parseString { p_text } {
  upvar $p_text text

  set str ""

  if { "\"" != [json_getc text -nospace]} then {
    return -code error "\" expected"
  }

  while { "\"" != [set c [json_getc text]] } {
    if { "\\" == $c } then {
      switch -exact -- [json_getc text] {
        "\"" { set c "\"" }
        "\\" { set c "\\" }
        "/"  { set c "/"  }
        "b"  { set c "\b" }
        "f"  { set c "\f" }
        "n"  { set c "\n" }
        "r"  { set c "\r" }
        "t"  { set c "\t" }
        "u"  { set c "[json_parseUnicodeChar text]" }
        default { return -code error "invaild escape code (\"\\$c\")" }
      }
    }
    append str $c
  }

  return $str
}

##
# Parses a JSON number
##
proc json_parseNumber { p_text } {
  upvar $p_text text

  set template {^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-][0-9]+)?}

  if { ![regexp -- $template $text number] } then {
    return -code error "number expected"
  }

  set text [string range $text [string length $number] end]
  return $number
}

##
# Parses a constant
##
proc json_parseConstant { p_text const } {
  upvar $p_text text

  set text [string trimleft $text]
  if { 0 == [string first $const $text] } then {
    set text [string range $text [string length $const] end]
  } else {
    return -code error "\"$const\" expected"
  }

  return $const
}

##
# Parses a unicode character given as \uXXXX. The four characters have to be hex digits
# (otherwise they would be handed to subst and could run code).
##
proc json_parseUnicodeChar { p_text } {
  upvar $p_text text

  set    c [json_getc text]
  append c [json_getc text]
  append c [json_getc text]
  append c [json_getc text]

  if { ![regexp {^[0-9A-Fa-f]{4}$} $c] } then {
    return -code error "invaild escape code (\"\\u$c\")"
  }
  return [format %c [scan $c %x]]
}

##
# True if the text is exactly one valid JSON value (no trailing text)
##
proc json_isValid { text } {
  set rest $text
  if { [catch { json_parseValue rest }] } then { return 0 }
  return [expr { "" == [string trim $rest] }]
}

# map of the control characters for json_toString / json_escapeControl
set JSON_CONTROL_MAP {}
for { set _i_ 0 } { $_i_ < 32 } { incr _i_ } {
  lappend JSON_CONTROL_MAP [format %c $_i_] [format {\u%04x} $_i_]
}
unset _i_

##
# Encodes a JSON string. Control characters are escaped, so the result is always valid JSON.
##
proc json_toString { str } {
  global JSON_CONTROL_MAP
  set map {
    "\"" "\\\""
    "\\" "\\\\"
    "/"  "\\/"
    "\b"  "\\b"
    "\f"  "\\f"
    "\n"  "\\n"
    "\r"  "\\r"
    "\t"  "\\t"
  }
  # named escapes first, every other control character as \u00XX
  set full [concat $map $JSON_CONTROL_MAP]
  return "\"[string map $full $str]\""
}

##
# Escapes control characters of a pre-built JSON text (U+0000-U+001F except TAB, LF, CR which
# are valid whitespace) as \u00XX
##
proc json_escapeControl { text } {
  global JSON_CONTROL_MAP
  set map {}
  foreach {c e} $JSON_CONTROL_MAP {
    if { $c in [list "\t" "\n" "\r"] } then { continue }
    lappend map $c $e
  }
  return [string map $map $text]
}
