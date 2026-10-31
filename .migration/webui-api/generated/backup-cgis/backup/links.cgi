#!/bin/tclsh

##
# links (rfd-config)
#
# Dumps all direct links of an interface as text/plain blocks (staged SP012, branch B of the
# EG-1 decision: ADMIN only, fail-closed session check; the interface name is resolved before
# anything is printed).
#
# args
#  sid        '@'-wrapped session id of an ADMIN session
#  interface  name of the interface (InterfacesList.xml)
#
# error tokens: INVALID_SESSION, UNKNOWN_INTERFACE
##

source common.tcl

proc put_link { linkstr } {
	array set link $linkstr
	puts "\[BEGIN LINK\]"
	puts "NAME=$link(NAME)"
	puts "DESCRIPTION=$link(DESCRIPTION)"
	puts "SENDER=$link(SENDER)"
	puts "RECEIVER=$link(RECEIVER)"
	puts "\[END LINK\]"
}

proc main { } {
	set sid       [getQueryArg sid]
	set interface [getQueryArg interface]

	backup_requireAdmin $sid
	set url [getInterfaceUrl $interface]

	puts "Content-Type: text/plain"
	puts ""

	set links [xmlrpc $url getLinks [list string {}] [list int 0]]
	foreach link $links {
		put_link $link
	}
}

startup
