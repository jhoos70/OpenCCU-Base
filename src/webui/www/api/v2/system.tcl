##
# v2/system.tcl - GET /api/v2/system
#
# The system information the classic start page shows: the time of the CCU, the times of sunrise and
# sunset, and the firmware version. Strict JSON
#   {"time":"2026-10-31 19:05:12","sunrise":"07:08","sunset":"16:32","firmwareVersion":"3.89.11.20261019"}
# GUEST or higher; without a valid session HTTP 401 before any ReGa script runs. A value that cannot be
# read is an empty text (never a guess): the time and the astro times come from ReGa (system.Date,
# system.SunriseTime, system.SunsetTime: the same clock and time zone as the classic UpdateUI), the version
# from the line VERSION= of /VERSION. The firmware version is no secret and needs no admin (CCU.getVersion does).
##

proc system_firmwareVersion { } {
  set version ""
  if { ![catch { set fp [open /VERSION r] }] } then {
    while { [gets $fp line] >= 0 } {
      if { [regexp {^\s*VERSION\s*=\s*([^\s]+)} $line -> v] } then { set version $v; break }
    }
    close $fp
  }
  return $version
}

proc v2_system_handle { } {
  v2_requireLevel GUEST

  set script {
    Write("TIME {" # system.Date("%Y-%m-%d %H:%M:%S") # "} SUNRISE {" # system.SunriseTime("%H:%M") # "} SUNSET {" # system.SunsetTime("%H:%M") # "}");
  }
  array set s {TIME "" SUNRISE "" SUNSET ""}
  catch { array set s [hmscript $script] }

  set json "\{\"time\":[json_toString $s(TIME)],\"sunrise\":[json_toString $s(SUNRISE)],\"sunset\":[json_toString $s(SUNSET)]"
  append json ",\"firmwareVersion\":[json_toString [system_firmwareVersion]]\}"
  v2_respondJson $json
}
