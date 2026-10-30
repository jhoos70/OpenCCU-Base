#!/bin/tclsh

##
# ipc.tcl
# Access to the interface processes (staged, SP009)
#
# v1 behaviour is kept (same procs, same INTERFACE_LIST shape). Hardening:
#  - a cache older than /etc/config/InterfacesList.xml is discarded and rebuilt
#    (write to a temp file, then rename)
#  - an empty interface list is never cached and logs one syslog line
#
# @author: Falk Werner (original)
##

##
# Interface file: XML file that contains the available interfaces
##
set IPC_INTERFACES_FILE "/etc/config/InterfacesList.xml"

##
# Cache file: stores the interface list once it has been read
##
set IPC_CACHE_FILE "/var/tmp/api_ipc.cache"

##
# Writes one line to the syslog (never raises)
##
proc ipc_log { message } {
	catch { exec logger -t webui-api -p daemon.warning $message }
}

##
# Returns the list of available interfaces
##
proc ipc_getInterfaces { } {
	global IPC_INTERFACES_FILE IPC_CACHE_FILE

	set interfaces ""
	if { [ipc_cacheIsFresh $IPC_CACHE_FILE $IPC_INTERFACES_FILE] } {
		set interfaces [file_load $IPC_CACHE_FILE]
	}
	if { "" == $interfaces } {
		set interfaces [ipc_loadInterfacesFromFile $IPC_INTERFACES_FILE]
		if { "" == $interfaces } {
			ipc_log "interface list empty"
		} else {
			ipc_saveCache $IPC_CACHE_FILE $interfaces
		}
	}

	return $interfaces
}

##
# The cache is usable if it exists and is not older than the interface file
# (an interface file that does not exist cannot invalidate the cache)
##
proc ipc_cacheIsFresh { cacheFile interfacesFile } {
	if { ![file exists $cacheFile] } { return 0 }
	if { [file exists $interfacesFile] } {
		if { [catch { expr { [file mtime $interfacesFile] > [file mtime $cacheFile] } } newer] } { return 1 }
		if { $newer } { return 0 }
	}
	return 1
}

##
# Writes the cache via a temp file and an atomic rename
##
proc ipc_saveCache { cacheFile content } {
	set tmp "$cacheFile.[pid].tmp"
	if { [catch {
		file_save $tmp $content
		file rename -force -- $tmp $cacheFile
	}] } {
		catch { file delete -force -- $tmp }
	}
}

##
# Reads the available interfaces from the interface file
##
proc ipc_loadInterfacesFromFile { filename } {
	global env
	array set interfaces ""

	# HomeMatic PC configuration tool
	if { [info exist env(BIDCOS_SERVICE)] } {
		set name default
		set url "$env(BIDCOS_SERVICE)"
		set port [ipc_getPort $url]
		set info {Allgemeine BidCoS-Schnittstelle}
		set interfaces($name) [list PORT $port URL $url INFO $info]
	}

	# HomeMatic central
	set content [file_load $filename]

	set node_start [string first "<ipc"  $content]
	set node_end	 [string first "</ipc" $content $node_start]
	while { (0 < $node_start) && (0 < $node_end) } {
		set node [string range $content $node_start $node_end]
		if {
				[regexp {<name[^>]*>(.+)</name[^>]*>} $node dummy name] &&
				[regexp {<url[^>]*>(.+)</url[^>]*>}   $node dummy url] &&
				[regexp {<info[^>]*>(.+)</info[^>]*>} $node dummy info]
		} {
			set port [ipc_getPort $url]
			set interfaces($name) [list PORT $port URL $url INFO $info]
		}
		set node_start [string first "<ipc" $content $node_end]
		set node_end   [string first "</ipc" $content $node_start]
	}

	return [array get interfaces]
}

##
# Determines the port of a service from its URL
##
proc ipc_getPort { url } {
	if { ![regexp {:([0-9]+)} $url dummy port] } {
		set port 0
	}

	return $port
}
