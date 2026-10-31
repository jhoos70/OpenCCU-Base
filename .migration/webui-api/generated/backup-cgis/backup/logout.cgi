#!/bin/tclsh

##
# logout
#
# args
#  sid  the '@'-wrapped session id
#
# Hardening (staged SP010): an invalid session id answers INVALID_SESSION (400) instead of a
# silent OK; session_logout is only called for a valid session.
##

source common.tcl

proc main { } {
	set sid [getQueryArg sid]

	if { [session_isValid $sid] != "true" } { error INVALID_SESSION }
	if [catch { session_logout $sid }] { error LOGOUT }

	puts "Content-Type: text/plain"
	puts ""
	puts "OK"
}

startup
