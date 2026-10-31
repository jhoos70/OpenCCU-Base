##
# v2/schema.tcl - GET /api/v2/schema (staged SP032 acceptance[7], T147)
#
# Serves the method schema data file api/schema/methods.json as it is:
#   {"version":"<string>","methods":[{"name","level","info","params":<JSON Schema>,"result":<JSON Schema>}]}
# with one entry per registry method. A session with level GUEST or higher is required (HTTP 401
# without a valid sid, 403 for a session level 0 is the same case, see v2_requireLevel).
# This is the only full documentation of the API that is served (the unauthenticated GET page of
# homematic.cgi lists no methods).
##

proc v2_schema_handle { } {
  global DOCUMENT_API_DIR

  v2_requireLevel GUEST

  set file [file join $DOCUMENT_API_DIR schema methods.json]
  if { ![file exists $file] } then { router_error 404 401 "route not found" }

  set fd [open $file r]
  fconfigure $fd -translation binary
  set content [read $fd]
  close $fd

  jsonrpc_v2Headers
  puts "CONTENT-TYPE: application/json; charset=utf-8"
  puts ""
  puts -nonewline $content
}
