##
# v2/profile.tcl - GET|PUT /api/v2/profile (staged SP033, IC012, T156; BD-11 re-baselined by BD-15)
#
#   GET  [?userId=<id>]  strict JSON {"userId","userName","firstName","hasPassword","isNoExpert","language"}
#                        GUEST or higher reads the own profile, ?userId= of another user needs ADMIN
#   PUT  [?userId=<id>]  body {"language":"<xx>"} (^[a-z]{2}$) replaces /etc/config/userprofiles/
#                        <UserFirstName>.lang atomically and answers {"language":"<xx>"}; USER or
#                        higher, another user's profile needs ADMIN
# Errors (HTTP status by BD-04): no/unknown session 401, too low a level 403, malformed userId or
# language 422 (error 403 "invalid argument (<name>)"), unknown user 404, write error 500.
# No JavaScript expression text is ever returned; there is no ReGa-version attribute.
##

set PROFILE_DIR "/etc/config/userprofiles"

proc profile_userId { } {
  global V2_QUERY
  if { [regexp {(?:^|&)userId=([^&]*)} $V2_QUERY -> v] } then {
    if { ![regexp {^[0-9]{1,10}$} $v] } then { jsonrpc_error 403 "invalid argument (userId)" }
    return $v
  }
  return ""
}

##
# The ReGa data of a user: dict name firstName hasPassword isNoExpert (404 if there is none)
##
proc profile_read { userId } {
  set script {
    var user = dom.GetObject(userId);
    if (user)
    {
      Write("NAME {" # user.Name() # "} FIRST {" # user.UserFirstName() # "} PWD {" # (user.UserPwd() != "") # "} NOEXPERT {" # user.UserEasyLinkMode() # "}");
    }
  }
  array set a [list userId $userId]
  set out [hmscript $script a]
  if { [catch { array set u $out }] || ![info exists u(NAME)] } then {
    global API_HTTP_STATUS
    set API_HTTP_STATUS 404
    jsonrpc_error 501 "user not found"
  }
  foreach k {FIRST PWD NOEXPERT} { if { ![info exists u($k)] } then { set u($k) "" } }
  return [dict create name $u(NAME) firstName $u(FIRST) hasPassword [expr { "true" eq $u(PWD) }] isNoExpert [expr { "true" eq $u(NOEXPERT) }]]
}

proc profile_langFile { firstName } {
  global PROFILE_DIR
  # only the file name of the first name is used, a path component can never leave the directory
  set tail [file tail $firstName]
  if { "" == $tail || "." == $tail || ".." == $tail } then { return "" }
  return [file join $PROFILE_DIR $tail.lang]
}

proc profile_language { firstName } {
  set f [profile_langFile $firstName]
  if { "" == $f || [catch { set fp [open $f r] }] } then { return "" }
  set data [read $fp]
  close $fp
  return [lindex [split $data "\n"] 0]
}

proc v2_profile_handle { } {
  global env V2_SID

  set verb $env(REQUEST_METHOD)
  v2_requireLevel [expr { "PUT" eq $verb ? "USER" : "GUEST" }]

  set own [v2_sessionUid]
  set target [profile_userId]
  if { "" == $target } then { set target $own }
  if { "" == $target } then {
    set ::API_AUTH_STATE nosid
    jsonrpc_error 400 "access denied (session level 0)"
  }
  if { $target ne $own } then {
    set upl [v2_sessionLevel]
    if { $upl < 8 } then { jsonrpc_error 400 "access denied (\"ADMIN\" needed, session level $upl)" }
  }

  set profile [profile_read $target]
  set first [dict get $profile firstName]

  if { "GET" eq $verb } then {
    set json "\{\"userId\":[json_toString $target]"
    append json ",\"userName\":[json_toString [dict get $profile name]]"
    append json ",\"firstName\":[json_toString $first]"
    append json ",\"hasPassword\":[expr { [dict get $profile hasPassword] ? "true" : "false" }]"
    append json ",\"isNoExpert\":[expr { [dict get $profile isNoExpert] ? "true" : "false" }]"
    append json ",\"language\":[json_toString [profile_language $first]]\}"
    v2_respondJson $json
    return
  }

  # PUT
  set text [v2_body]
  if { [catch { array set body [json_parseObject text] } cause] } then {
    jsonrpc_error 100 "invalid request ($cause)"
  }
  foreach key [array names body] {
    if { "language" ne $key } then { jsonrpc_error 403 "invalid argument ([regsub -all {[^A-Za-z0-9_.-]} [string range $key 0 39] _])" }
  }
  if { ![info exists body(language)] || ![regexp {^[a-z]{2}$} $body(language)] } then {
    jsonrpc_error 403 "invalid argument (language)"
  }

  set f [profile_langFile $first]
  if { "" == $f } then { jsonrpc_error 500 "could not write user profile" }
  set tmp "$f.[pid].tmp"
  if { [catch {
    set fh [open $tmp w]
    puts -nonewline $fh $body(language)
    close $fh
    file rename -force -- $tmp $f
  }] } then {
    catch { file delete -force -- $tmp }
    jsonrpc_error 500 "could not write user profile"
  }
  v2_respondJson "\{\"language\":[json_toString $body(language)]\}"
}
