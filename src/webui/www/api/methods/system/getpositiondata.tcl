##
# system.getPositionData
# Gibt die gespreicherten Positionsdaten Longitude und Latitude zurück
#
# Parameter:
#   keine
#
# Rückgabewert: [array]
#  Die einzelnen Elemente sind Zeichenketten, welche die Longitude, Latitude, TimeZone enthalten
#
##

# staged (SP045): on /api/v2 the answer is a strict JSON array with double quotes. This block
# comes before the v1 code, which stays unchanged (v1 keeps the JavaScript array).
if { 0 < [llength [info commands jsonrpc_isV2]] && [jsonrpc_isV2] } then {
  set timeZone CET/CEST
  catch {
    set _fd_ [open /etc/config/time.conf r]
    while { [gets $_fd_ _buf_] >= 0 } {
      if [regexp {^ *TIMEZONE *= *(.*)$} $_buf_ _dummy_ _tz_] { set timeZone $_tz_; break }
    }
    close $_fd_
  }
  set _script_ {
    Write("['Longitude:"#system.Longitude()#"','Latitude:"#system.Latitude()#"'");
  }
  set _pos_ [hmscript $_script_]
  set longitude ""
  set latitude ""
  regexp {'Longitude:([^']*)'} $_pos_ -> longitude
  regexp {'Latitude:([^']*)'} $_pos_ -> latitude
  jsonrpc_response "\[[json_toString Longitude:$longitude],[json_toString Latitude:$latitude],[json_toString TimeZone:$timeZone]\]"
  return
}

proc read_var {filename varname} {
    set fd [open $filename r]
    set var ""
    if { $fd >=0 } {
        while { [gets $fd buf] >=0 } {
          if [regexp "^ *$varname *= *(.*)$" $buf dummy var] break
        }
      close $fd
    }
    return $var
}

# Default timeZone
set timeZone CET/CEST

catch {set timeZone [read_var /etc/config/time.conf TIMEZONE]}

set script {
  ! system.TimeZoneOffset() doesn't contain the DST offset
  ! Write("['Longitude:"#system.Longitude()#"','Latitude:"#system.Latitude()#"','TimeZone:"#system.TimeZoneOffset()#"' ]");
  Write("['Longitude:"#system.Longitude()#"','Latitude:"#system.Latitude()#"'");
}

set posData [hmscript $script]
append posData ",'TimeZone:$timeZone']"

jsonrpc_response $posData