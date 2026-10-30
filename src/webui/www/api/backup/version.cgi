#!/bin/tclsh

##
# version (rfd-config)
#
# Returns the content of /VERSION as text/plain without a newline (or '' if the file is missing).
# No session is required; nothing else is added (v1 frozen, staged SP011; the file moved from
# /boot/VERSION to /VERSION upstream, BD-15).
##

source common.tcl

proc main { } {
	puts "Content-Type: text/plain"
	puts ""
	puts -nonewline [loadFile /VERSION]
}

startup
