# legacymap.tcl - mapping of staged files to their legacy sources (T253e, NFR-056, BD-18).
#
# Staged files live below .migration/webui-api/generated/<component>/. Their legacy counterpart is
#   src/webui/www/tcl/<relpath>   for security-session eq3/session.tcl, eq3/rega.tcl and eq3_old/*
#   src/webui/www/api/<relpath>   for everything else
# A staged file with a legacy counterpart is either in the behaviour-change list (intentional v1
# change, minimal edit of the legacy bytes) or byte-identical to the legacy source (verbatim).
#
# API
#   legacymap::legacy_path COMPONENT RELPATH   absolute legacy path (may not exist)
#   legacymap::staged_path COMPONENT RELPATH
#   legacymap::staged_files                    flat list {component relpath ...} of all staged files
#   legacymap::behaviour_change_files          flat list {component relpath ...}, 79 entries
#   legacymap::behaviour_change_list           dict component -> relpaths
#   legacymap::verbatim_files                  staged files with a legacy counterpart outside the list
#   legacymap::new_files                       staged files without a legacy counterpart

namespace eval ::legacymap {
  variable here [file dirname [file normalize [info script]]]
  if {![info exists ::mock::generated]} { source [file join $here mocks.tcl] }
  # staged files: the per-component tree of mocks.tcl; legacy files: the pinned legacy snapshot
  variable generated $::mock::generated
  variable repo $::mock::repo
  variable www [file join $::mock::legacy_root src webui www]
  variable components {dispatcher security-session event-push interface-gateway rega-model system-admin backup-cgis user-profile}
  variable skip_top {tests schema v2 rega .github COPY-PLAN.md}
  variable tcl_files {eq3/session.tcl eq3/rega.tcl}
}

proc ::legacymap::legacy_path {component relpath} {
  variable www; variable tcl_files
  if {$component eq "security-session" && ($relpath in $tcl_files || [string match eq3_old/* $relpath])} {
    return [file join $www tcl {*}[split $relpath /]]
  }
  return [file join $www api {*}[split $relpath /]]
}

proc ::legacymap::staged_path {component relpath} {
  variable generated
  return [file join $generated $component {*}[split $relpath /]]
}

proc ::legacymap::walk {dir prefix} {
  set out {}
  foreach f [lsort [glob -nocomplain -directory $dir -types f *]] { lappend out $prefix[file tail $f] }
  foreach d [lsort [glob -nocomplain -directory $dir -types d *]] {
    lappend out {*}[walk $d $prefix[file tail $d]/]
  }
  return $out
}

proc ::legacymap::staged_files {} {
  variable generated; variable components; variable skip_top
  set out {}
  foreach c $components {
    set cdir [file join $generated $c]
    foreach e [lsort [glob -nocomplain -directory $cdir *]] {
      set t [file tail $e]
      if {$t in $skip_top} continue
      if {[file isdirectory $e]} {
        foreach r [walk $e $t/] { lappend out $c $r }
      } else {
        lappend out $c $t
      }
    }
  }
  return $out
}

# The files with an intentional v1 behaviour change (79 entries); the SP of the change is the
# comment above each group.
proc ::legacymap::behaviour_change_list {} {
  return [dict create \
    dispatcher {
      methods.conf
      homematic.cgi
      eq3/common.tcl eq3/json.tcl eq3/jsonrpc.tcl
      methods/system/describe.tcl methods/system/listmethods.tcl methods/system/methodhelp.tcl
    } \
    system-admin {
      methods/ccu/downloadFirmware.tcl
      methods/user/restarthmipserver.tcl methods/user/starthmipserver.tcl methods/user/stophmipserver.tcl
      methods/firewall/setconfiguration.tcl methods/firewall/getconfiguration.tcl
      methods/recoverymode/enter.tcl
      methods/bidcosrf/setconfiguration-rf.tcl methods/bidcoswired/setconfiguration-wired.tcl
      methods/bidcos/changeLanGatewayKey.tcl
      methods/user/restartlighttpd.tcl methods/user/deletecertificate.tcl
      methods/ccu/restartReGa.tcl methods/ccu/restartsshdaemon.tcl
      methods/ccu/createfile.tcl methods/ccu/existsfile.tcl
      methods/ccu/setssh.tcl methods/ccu/setsshpassword.tcl methods/ccu/setsecuritylevel.tcl
      methods/ccu/getauthenabled.tcl methods/ccu/setauthenabled.tcl
      methods/ccu/setfirewallconfigured.tcl methods/ccu/setsecurityhint.tcl
      methods/ccu/sethttpsredirectenabled.tcl methods/ccu/setinfoledconfig.tcl
      methods/safemode/enter.tcl
    } \
    user-profile {
      methods/user/getusername.tcl methods/user/getuserfirstname.tcl methods/user/hasuserpwd.tcl
      methods/system/getenergyprice.tcl methods/system/getpositiondata.tcl methods/system/gettweak.tcl
      methods/webui/setwebuicolor.tcl
    } \
    security-session {
      eq3/hmscript.tcl eq3/session.tcl eq3/checksid.hms eq3/getupl.hms
      eq3_old/session.tcl
      methods/session/logout.tcl methods/session/login.tcl
    } \
    rega-model {
      methods/channel/pollcomtest.tcl methods/device/haslinksorprograms.tcl methods/device/pollcomtest.tcl
      methods/room/listprogramids.tcl methods/subsection/listprogramids.tcl
      methods/sysvar/createbool.tcl methods/sysvar/createfloat.tcl methods/sysvar/createenum.tcl
      methods/program/get.tcl methods/rega/getalldatapoints.tcl
    } \
    interface-gateway {
      eq3/ipc.tcl
      methods/interface/dispatch.tcl methods/interface/searchdalidevices.tcl methods/interface/setteam.tcl
      methods/interface/setinstallmodehmip.tcl methods/interface/getsuppressedservicemessages.tcl
      methods/interface/getlgwconnectionstatus.tcl methods/interface/setmetadata.tcl
    } \
    event-push {
      eq3/event.tcl methods/event/subscribe.tcl methods/event/poll.tcl methods/event/unsubscribe.tcl
    } \
    backup-cgis {
      backup/logout.cgi backup/binfile.cgi backup/textfile.cgi backup/tarfile.cgi backup/common.tcl
      backup/run-script.cgi backup/links.cgi backup/paramset.cgi backup/version.cgi
    }]
}

proc ::legacymap::behaviour_change_files {} {
  set out {}
  dict for {c rels} [behaviour_change_list] {
    foreach r $rels { lappend out $c $r }
  }
  return $out
}

proc ::legacymap::verbatim_files {} {
  set change [behaviour_change_files]
  set out {}
  foreach {c r} [staged_files] {
    if {![file exists [legacy_path $c $r]]} continue
    set listed 0
    foreach {cc rr} $change { if {$cc eq $c && $rr eq $r} { set listed 1; break } }
    if {!$listed} { lappend out $c $r }
  }
  return $out
}

proc ::legacymap::new_files {} {
  set out {}
  foreach {c r} [staged_files] {
    if {![file exists [legacy_path $c $r]]} { lappend out $c $r }
  }
  return $out
}
