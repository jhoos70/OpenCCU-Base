#!/bin/tclsh

##
# binfile (rfd-config)
#
# Streams a file as application/octet-stream (staged SP011, branch B of the EG-1 decision).
#
# args
#  sid   '@'-wrapped session id of an ADMIN session
#  file  exact entry of the configured path allow-list (EMPTY by default = deny all)
#
# error tokens: INVALID_SESSION, PATH_NOT_ALLOWED
# No file is opened before the session, the level and the allow-list checks passed.
##

source common.tcl

proc main { } {
	set BUFFER_SIZE [expr 32 * 1024]

	set sid  [getQueryArg sid]
	set file [getQueryArg file]

	backup_requireAdmin $sid
	backup_requirePath $file

	set fd [open $file r]
	catch {fconfigure $fd -translation binary}
	catch {fconfigure $fd -encoding binary}

	puts "Content-Type: application/octet-stream"
	puts ""

	catch {fconfigure stdout -translation binary}
	catch {fconfigure stdout -encoding binary}

	while { ! [eof $fd]} {
			puts -nonewline [read $fd $BUFFER_SIZE]
	}
	close $fd
}

startup
