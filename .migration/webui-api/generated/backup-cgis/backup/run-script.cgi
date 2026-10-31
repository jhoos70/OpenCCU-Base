#!/bin/tclsh

##
# run-script (rfd-config)
#
# Executes the POST body as HomeMatic script and prints the UTF-8 decoded STDOUT as text/plain
# (staged SP012, branch B of the EG-1 decision; equivalent to ReGa.runScript: ADMIN only).
#
# args
#  sid  '@'-wrapped session id of an ADMIN session
#  body HomeMatic script text (CONTENT_LENGTH characters)
#
# error tokens: INVALID_SESSION, MISSING_BODY
# Nothing is executed before the session and the level checks passed; a missing or empty
# body executes nothing.
##

source common.tcl

proc main { } {
	global env

	set sid [getQueryArg sid]
	backup_requireAdmin $sid

	if { ![info exists env(CONTENT_LENGTH)] || ![string is integer -strict $env(CONTENT_LENGTH)] || $env(CONTENT_LENGTH) < 1 } then {
		error MISSING_BODY
	}
	set script [getPostData]

	puts "Content-Type: text/plain"
	puts ""
	puts [encoding convertfrom utf-8 [rega_exec $script]]
}

startup
