#!/bin/tclsh

##
# paramset (rfd-config)
#
# Dumps a paramset as '<id>:<TYPE>=<value>' lines (staged SP012, branch B of the EG-1
# decision: ADMIN only, fail-closed session check; the interface name is resolved before
# anything is printed).
#
# args
#  sid        '@'-wrapped session id of an ADMIN session
#  interface  name of the interface (InterfacesList.xml)
#  address    address of the device or channel
#  key        name of the paramset (MASTER, VALUES, <peer>)
#
# error tokens: INVALID_SESSION, UNKNOWN_INTERFACE
##

source common.tcl

proc getType { _descr } {
	array set descr $_descr
	return $descr(TYPE)
}

proc main { } {
	set sid       [getQueryArg sid]
	set interface [getQueryArg interface]
	set address   [getQueryArg address]
	set key       [getQueryArg key]

	backup_requireAdmin $sid
	set url [getInterfaceUrl $interface]

	puts "Content-Type: text/plain"
	puts ""

	set descr [xmlrpc $url getParamsetDescription [list string $address] [list string $key]]
	array set types {}
	foreach { id paramDescr } $descr {
		set types($id) [getType $paramDescr]
	}

	set paramset [xmlrpc $url getParamset [list string $address] [list string $key]]
	foreach { id value } $paramset {
		puts "$id:$types($id)=$value"
	}
}

startup
