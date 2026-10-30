#!/bin/tclsh

##
# homematic.cgi
# HomeMatic JSON API (staged: SP001 dispatcher, SP013 central/config-tool flag, SP015 reduced GET page)
#
# Original: Falk Werner. The pipeline of a POST is: strict-mode check, parse, per-sid limiter (opt-in),
# lookup, privilege check, argument check, script sourcing (eq3/executor.tcl). /api/v2/... requests
# (REQUEST_URI) are served by v2/router.tcl.
#
# This file is UTF-8 (methods.conf is UTF-8 in the staged tree); the CGI output stays ISO-8859-1 /
# UTF-8 exactly as before: the JSON documents are encoded by eq3/jsonrpc.tcl.
##

# the request method is read first, as in v1 (an unset REQUEST_METHOD is a Tcl error before any output)
set REQUEST_METHOD $env(REQUEST_METHOD)

# the api tree: DOCUMENT_ROOT/api as in v1; the directory of this file if DOCUMENT_ROOT is not set
# (the request is then answered with error 200, SP013 acceptance[3])
if { [info exists env(DOCUMENT_ROOT)] } then {
  set API_DIR [file join $env(DOCUMENT_ROOT) api]
} else {
  set API_DIR [file dirname [file normalize [info script]]]
}
set DOCUMENT_API_DIR $API_DIR

# the libraries that are needed to answer any error
foreach lib {common json jsonrpc registry apiconfig} {
  source [file join $API_DIR eq3 $lib.tcl]
}

##
# The reduced GET page: the envelope description and the error codes only (no method names, no
# INFO texts, no ARGUMENTS, no privilege labels - SP015 acceptance[1]); the full documentation is
# available through the authenticated GET /api/v2/schema.
##
proc api_putGetPage { } {
  puts "CONTENT-TYPE: text/html; charset=iso-8859-1"
  puts {}
  puts {
<html>
<head>
  <title>HomeMatic JSON API</title>
  <style type='text/css'>
    .odd {
      background-color: #cccccc;
    }
  </style>
</head>
<body>
  <h1>HomeMatic JSON API</h1>
  <p>
    Die HomeMatic JSON API vereinheitlicht Zugriff auf die verschiedenen
    Teile der HomeMatic Zentrale unter einer einheitlichen Schnittstelle.
    Diese Schnittstelle basiert auf
    <a href='http://json-rpc.org/wiki/specification'>JSON-RPC</a>,
    einer Form des entfernen Prozeduraufrufs, der auf
    <a href='http://json.org/'>JSON</a> aufsetzt.
  </p>
  <p>
    Anfragen werden per HTTP-POST als JSON-Objekt mit den Elementen
    <i>method</i>, <i>params</i> und <i>id</i> gesendet. Die Antwort enth&auml;lt
    die Elemente <i>id</i>, <i>version</i>, <i>result</i> und <i>error</i>.
    Die Methoden&uuml;bersicht steht angemeldeten Benutzern zur Verf&uuml;gung.
  </p>
  <h2>Fehlercodes</h2>
  <table border='1' cellspacing='0' cellpadding='5px'>
    <tr><th>Fehlercode</th><th>Kurzbeschreibung</th></tr>
    <tr><td>100</td><td>Ung&uuml;ltige Anfrage</td></tr>
    <tr><td>101</td><td>Das Element <i>id</i> fehlt in der Anfrage</td></tr>
    <tr><td>102</td><td>Das Element <i>method</i> fehlt in der Anfrage</td></tr>
    <tr><td>103</td><td>Das Element <i>params</i> fehlt in der Anfrage</td></tr>
    <tr><td>200</td><td>Interner Fehler (mit Referenz-ID)</td></tr>
    <tr><td>400</td><td>Zugriff verweigert</td></tr>
    <tr><td>401</td><td>Methode nicht gefunden</td></tr>
    <tr><td>402</td><td>Argument nicht gefunden</td></tr>
    <tr><td>403</td><td>Ung&uuml;ltiges Argument</td></tr>
    <tr><td>405</td><td>Anfrage nicht zul&auml;ssig</td></tr>
    <tr><td>429</td><td>Zu viele Anfragen</td></tr>
    <tr><td>5xx</td><td>Anwendungsspezifische Fehler</td></tr>
  </table>
</body>
</html>
  }
}

##
# Read trace of INTERFACE_LIST: loads the interface list on the first access
##
proc api_loadInterfaces { name1 name2 op } {
  trace remove variable ::INTERFACE_LIST {read array} api_loadInterfaces
  array set ::INTERFACE_LIST [ipc_getInterfaces]
}

##
# The request of one CGI call
##
proc api_main { } {
  global env central REQUEST_METHOD API_DIR METHOD_LIST INTERFACE_LIST API_V2 USER_LEVEL USER_LEVEL_NAME

  # a missing DOCUMENT_ROOT is an internal error (answered as error 200 with a correlation id)
  if { ![info exists env(DOCUMENT_ROOT)] } then {
    error "the environment variable DOCUMENT_ROOT is not set"
  }

  # configuration: config-tool mode only through the explicit flag config_tool_mode (SP013)
  apiconfig_load [file join $API_DIR apiconfig.conf]
  set central [apiconfig_central]

  #####################
  # Verwendete Module #
  #####################
  load tclrpc.so
  if { [string is true -strict $central] } then {
    load tclrega.so
  }

  foreach lib {ipc hmscript event} {
    uplevel #0 [list source [file join $API_DIR eq3 $lib.tcl]]
  }
  # optional staged libraries (the privilege check of security-session, the sid limiter)
  foreach lib {privilege allowlist sidlimit validate executor admin_audit} {
    set f [file join $API_DIR eq3 $lib.tcl]
    if { [file exists $f] } then { uplevel #0 [list source $f] }
  }
  foreach lib {auth rpc router} {
    uplevel #0 [list source [file join $API_DIR v2 $lib.tcl]]
  }

  ##############
  # Konstanten #
  ##############
  # INTERFACE_LIST is resolved lazily (SP009 NFR5): InterfacesList.xml is only read when a method
  # script reads the array (Interface.*, Device.hasLinksOrPrograms, backup links/paramset)
  array set INTERFACE_LIST {}
  trace add variable INTERFACE_LIST {read array} api_loadInterfaces

  registry_load [file join $API_DIR methods.conf]

  array set USER_LEVEL ""
  set       USER_LEVEL(NONE)  0
  set       USER_LEVEL(GUEST) 1
  set       USER_LEVEL(USER)  2
  set       USER_LEVEL(ADMIN) 8
  set       USER_LEVEL(0)     NONE
  set       USER_LEVEL(1)     GUEST
  set       USER_LEVEL(2)     USER
  set       USER_LEVEL(8)     ADMIN

  ##################
  # Einsprungpunkt #
  ##################
  set v2Path [router_v2Path]
  if { $v2Path ne "-1" } then {
    # /api/v2/...: real HTTP status codes, header X-Session-Id, limiter always on
    set API_V2 1
    router_serve $v2Path
    return
  }

  # HTTP-POST: Methode ausführen
  if { $REQUEST_METHOD == "POST" } then {
    executor_checkTransport
    executor_request [read stdin $env(CONTENT_LENGTH)]
  }

  # HTTP-GET: Schnittstellenbeschreibung ausgeben
  if { $REQUEST_METHOD == "GET" } then {
    api_putGetPage
  }
}

if { [catch { api_main } message options] } then {
  jsonrpc_error 200 "internal error:\n[dict get $options -errorinfo]"
}
