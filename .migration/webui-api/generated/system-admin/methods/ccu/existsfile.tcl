##
# CCU.existsFile
# Reports whether a flag file or directory exists (staged SP035, EG-3 resolved).
#
# The method stays at its v1 level GUEST so the classic UI callers keep working. The path has
# to be an exact member of the allow-list from the configuration (api/apiconfig.conf key
# path_allow_list.CCU.existsFile, default /etc/config/userAckSecurityHint,
# /etc/config/firewallConfigured, /etc/config/fieldTestActive,
# /etc/config/showDiagramDatapoints, /media/sd-mmcblk0/measurement,
# /etc/config/legacyAPIMigrationAccepted) or match one of two anchored patterns for the per-user
# installation wizard acknowledgement files (userAckInstallWizardId_<1-10 digits>,
# userAckInstallWizard_<1-200 characters without '/' and NUL> below /etc/config/userprofiles);
# no normalisation, no globbing, never extended by request values. Anything else is 500 "path not allowed" (no
# existence oracle for other files).
#
# Parameters:
#   file: [string] absolute path
#
# Return value: [bool]
##

# configuration (the dispatcher loads API_CONFIG; stand-alone the file next to the CGI is used)
if { ![array exists API_CONFIG] } then { catch { source apiconfig.conf } }
if { [info exists API_CONFIG(path_allow_list.CCU.existsFile)] } then {
  set allowList $API_CONFIG(path_allow_list.CCU.existsFile)
} else {
  set allowList {/etc/config/userAckSecurityHint /etc/config/firewallConfigured /etc/config/fieldTestActive /etc/config/showDiagramDatapoints /media/sd-mmcblk0/measurement /etc/config/legacyAPIMigrationAccepted}
}
# anchored patterns for the per-user acknowledgement files (key path_allow_pattern.CCU.existsFile);
# matched with regexp against the whole request string, no normalisation, no request entries
if { [info exists API_CONFIG(path_allow_pattern.CCU.existsFile)] } then {
  set allowPatterns $API_CONFIG(path_allow_pattern.CCU.existsFile)
} else {
  set allowPatterns {{^/etc/config/userprofiles/userAckInstallWizardId_[0-9]{1,10}$} {^/etc/config/userprofiles/userAckInstallWizard_[^/\x00]{1,200}$}}
}
set allowed [expr { [lsearch -exact $allowList $args(file)] >= 0 }]
if { !$allowed } then {
  foreach pat $allowPatterns {
    if { [regexp -- $pat $args(file)] } then { set allowed 1; break }
  }
}

if { !$allowed } then {
  jsonrpc_error 500 "path not allowed"
}

set result false;

if {[file exists $args(file)] == 1} {
  set result true;
}

jsonrpc_response $result
