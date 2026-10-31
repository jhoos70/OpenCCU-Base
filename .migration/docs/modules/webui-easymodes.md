# Module: webui/www/config/easymodes (EasyMode profile engine)

Scope: `src/webui/www/config/easymodes` (2,561 files). Analysis is evidence-based from grep and sampling. Counts were measured with find, grep and wc.
The caller-side code (`ic_setprofiles.cgi`, `ic_common.tcl`, `ic_ifacecmd.cgi`, `ic_deviceparameters.cgi`) is outside this directory. It is cited only to explain the loading and rendering contract.

Note on tooling: many files are ISO-8859-1 encoded, so a plain `grep -I` skips them as binary. Use `grep -a`. The relative path prefix below is `src/webui/www/config/` unless stated otherwise.

## 1. What it is

EasyMode is the "profile" UI of the legacy CCU WebUI. It is used on the direct-link configuration screen and on the device and channel parameter screens. For a (sender channel, receiver channel) link, or for a single channel's MASTER paramset, the user picks a named preset such as "Switch - on/off". Each preset is a set of paramset values (`LONG_JT_ON=3`, `SHORT_ON_TIME=...`). The page renders a few extra widgets: delay and time combo boxes, thresholds, and so on.

Each profile file is server-side Tcl. Tcl is executed inside a CGI interpreter. It fills global arrays and emits HTML strings. There is no JSON, no schema and no template engine. A profile file is simultaneously data (the preset values), view (hand-built HTML) and logic (matching and visibility).

## 2. Inventory and counts

| Item | Count | Evidence |
|---|---|---|
| Total files | 2,561 | `find . -type f` |
| `.txt` (localization) | 1,441 | 720 `de` + 720 `en` + 1 other |
| `.tcl` | 1,083 | about 311k lines in total |
| `.js` | 37 | 16 in `MASTER_LANG/`, 16 in `js/`, 5 elsewhere |
| `localization/` dirs | 65 | one per receiver-type dir (plus `etc/`) |
| `mapping/` files (`*_map.tcl`) | 36 | legacy firmware-1.4 profile mapping |
| Top-level `*.tcl` | 117 | channel and device master and link profiles for HM |
| `.tcl` in receiver-type dirs | 793 | excludes `etc/`, `hmip/`, `js/` |
| `hmip/*.tcl` | 142 | 8,086 lines, no `.txt` |
| `etc/*.tcl` | 38 files (67 files in `etc/` in total) | 19,795 `.tcl` lines in `etc/` |
| `js/*.js` | 16 | 10,250 lines in total, of which `ic_functions.js` is 2,481 |
| `MASTER_LANG/*.js` | 16 | 2,962 lines |
| Files containing `proc set_htmlParams` | 886 | grep |
| Files with `set PROFILES_MAP(` | 731 | 7 of them in `hmip/` |
| `set PROFILE_<n>(...)` lines | 89,279 | grep sum |
| `append HTML_PARAMS(...)` lines | 57,669 | grep sum |
| Profile textarea wrappers hard-coded in `.tcl` | 3,497 | grep sum |
| `get_ComboBox` calls | 5,009 | grep sum |
| `EnterTime_h_m_s` calls | 1,449 | grep sum |
| Files emitting `getLangInfo(...)` | 721 | grep |
| Files with `set multilingual 1` | 70 | grep |

### File counts per receiver-type subdirectory (all file types)

Each directory is named after the receiver channel type, in HM or HmIP spelling.

HmIP-style, virtual and transceiver receivers:
- `SWITCH_VIRTUAL_RECEIVER` 141
- `WATER_SWITCH_VIRTUAL_RECEIVER` 140
- `DIMMER_VIRTUAL_RECEIVER` 104
- `UNIVERSAL_LIGHT_RECEIVER_PWM` 104
- `BLIND_VIRTUAL_RECEIVER` 97
- `UNIVERSAL_ACTOR` 95
- `SHUTTER_VIRTUAL_RECEIVER` 94
- `ACOUSTIC_SIGNAL_VIRTUAL_RECEIVER` 88
- `STATUS_INDICATOR` 59
- `ALARM_SWITCH_VIRTUAL_RECEIVER` 54
- `SIMPLE_SWITCH_RECEIVER` 39
- `UNIVERSAL_LIGHT_RECEIVER_LSC` 38
- `DOOR_LOCK_TRANSCEIVER` 37
- `DOOR_RECEIVER` 33
- `UNIVERSAL_LIGHT_RECEIVER_RGBW_DALI` 31
- `AUTO_RELOCK_TRANSCEIVER` 31
- `UNIVERSAL_LIGHT_RECEIVER_RGB(W)` 30
- `UNIVERSAL_LIGHT_RECEIVER_TW` 29
- `ACCESS_RECEIVER` 27
- `STATE_RESET_RECEIVER` 21
- `HEATING_KEY_RECEIVER` 18
- `ALARM_COND_SWITCH_RECEIVER` 14
- `WINDOW_DRIVE_RECEIVER` 11
- `HEATING_CLIMATECONTROL_RECEIVER` 11
- `SERVO_VIRTUAL_RECEIVER` 11
- `WEATHER_RECEIVER` 8
- `REMOTECONTROL_RECEIVER` 8
- `CLIMATECONTROL_RECEIVER` 8
- `CLIMATECONTROL_*` (FLOOR_PUMP, FLOOR, INPUT, RT) 5 each
- `CLIMATECONTROL_VENT_DRIVE` 1
- `HEATING_CLIMATECONTROL_CL_RECEIVER` 5
- `HEATING_ROOM_TH_RECEIVER` 5

Classic HM (BidCoS) receivers:
- `SWITCH` 80
- `DIMMER` 71
- `BLIND` 45
- `JALOUSIE` 41
- `ALARMACTUATOR` 49
- `SIGNAL_CHIME`, `SIGNAL_CHIMEM`, `SIGNAL_LED`, `SIGNAL_LEDM` 43 each
- `WINMATIC` 30
- `KEYMATIC` 18
- `ACTOR_WINDOW` 32
- `ACTOR_SECURITY` 20
- `ARMING` 11
- `WINDOW_SWITCH_RECEIVER` 23
- `SWITCH_PANIC` 17
- `SWITCH_SENSOR` 17
- `DUAL_WHITE_COLOR` 23
- `VIRTUAL_DUAL_WHITE_COLOR` 23
- `DUAL_WHITE_BRIGHTNESS` 7
- `RGBW_COLOR` 8
- `RGBW_AUTOMATIC` 8
- `DIMMER_woLongKeyPress` 5
- `VIRTUAL_DIMMER` 5
- `DDC` 5
- `WEATHER` 1
- `WS_TH` 1

Wired HM (HMW):
- `HMW_SWITCH` 23
- `HMW_DIMMER` 21
- `HMW_BLIND` 18
- `HMW_INPUT_OUTPUT` 17

Support directories:
- `hmip` 142: channel and device MASTER config pages, not link profiles (see 4.3)
- `etc` 67
- `js` 16
- `MASTER_LANG` 16

(The numbers are the output of `find <dir> -type f | wc -l`, including `localization/` and `mapping/` subtrees.)

## 3. Directory and filename convention

Link profiles follow one rule: `easymodes/<RECEIVER_CHANNEL_TYPE>/<SENDER_CHANNEL_TYPE>.tcl`. Examples:
- `SWITCH/KEY.tcl` is for a classic key sender driving a classic switch actuator.
- `SWITCH_VIRTUAL_RECEIVER/KEY_TRANSCEIVER.tcl` is for an HmIP key driving an HmIP switch.
- Sender file names seen across receivers include `KEY`, `KEY_TRANSCEIVER`, `VIRTUAL_KEY`, `SHUTTER_CONTACT`, `MOTION_DETECTOR`, `RAINDETECTOR`, `WATERDETECTIONSENSOR`, `MULTI_MODE_INPUT_TRANSMITTER*`, `COND_SWITCH_TRANSMITTER_*`, `DISPLAY_INPUT_TRANSMITTER`, `GENERIC_INPUT_TRANSMITER`.
- `template_ch_link.tcl:13-24` is the generic dispatcher. It sources `config/easymodes/$ACTOR/$x.tcl`, where `$ACTOR` is `dev_descr_receiver(TYPE)` and `x` is `dev_descr_sender(TYPE)`. If that file is missing it falls back to `NO_PROFILE.tcl`.
- `<type>_ch_link.tcl` files at the top level, such as `switch_ch_link.tcl`, `blind_ch_link.tcl` and `dimmer_ch_link.tcl`, are the "ParamsetId" entry points for classic HM devices. The device reports a LINK paramset id and the file of that name is sourced. They typically use the `template_ch_link.tcl` pattern.
- `<type>_ch_master.tcl` and `<type>_dev_master.tcl` files at the top level, for example `switch_ch_master.tcl`, `md_ch_master.tcl` and `cc_rt_dev_master.tcl`, are MASTER (channel or device configuration) profiles. They are not link profiles.
- `linkHmIP_<RECEIVER_TYPE>.tcl` are 23 top-level fallback entry points for HmIP receivers whose LINK paramset id has no file of its own. For example `linkHmIP_SWITCH_VIRTUAL_RECEIVER.tcl:5-30` picks the sender-specific file and special-cases `HmIP-MOD-RC8` KEY_TRANSCEIVER modes, remapping the sender type to `SWITCH_TRANSCEIVER` or `SHUTTER_CONTACT`.
- Variant suffixes include `_le_v1_5` and `_le_v1_9` (legacy firmware), `_intkey` (internal device key), `_virt` (virtual) and `Params` (`dimmer_virt_ch_masterParams.tcl`).
- `<RECEIVER>/<n>.tcl` or `<RECEIVER>/profiles*.tcl` hold shared profile data. Examples are `UNIVERSAL_LIGHT_RECEIVER_LSC/profiles.tcl` (2,212 lines) and `profiles_shutter.tcl` (2,569 lines).
- `<RECEIVER>/mapping/<SENDER>_map.tcl` is the firmware-1.4 profile number mapping. `get_cur_profile2` reads `PROFILE(UI_MAP)` (`ic_common.tcl:834-870`). The template `SWITCH/mapping/TEMPLATE_map.tcl:1-7` is just a placeholder. There are 36 map files.
- `<RECEIVER>/localization/{de,en}/<SENDER>.txt` holds the translations (section 7).
- `<RECEIVER>/function.js` (only in `SWITCH`, `ALARMACTUATOR`, `WATER_SWITCH_VIRTUAL_RECEIVER` and `DIMMER/dimmer_virt.js`) holds receiver-specific client JS.

## 4. Who loads and calls the profiles

### 4.1 Link profiles: `ic_setprofiles.cgi` and `ic_common.tcl`

1. `ic_setprofiles.cgi:6` runs `sourceOnce ic_common.tcl` and `:10-11` source `EnterFreeValue.tcl` and `etc/getStatusDisplayHelp.tcl`.
2. In `put_page` (around `:860-890`) it fetches the sender and receiver descriptions by XML-RPC (`getDeviceDescription`, `getParamsetDescription LINK`, `getParamsetId LINK`). Then `getExistingParamId` (`ic_common.tcl:1907-1927`) tests `easymodes/$id.tcl` and `easymodes/hmip/$id.tcl` and returns the first id that exists.
3. For HmIP, if no id matches it falls back to `linkHmIP_<TYPE>` (`ic_setprofiles.cgi:870-873` for the sender, `:885-888` for the receiver).
4. `put_profile_body` (`:289-...`) does the following:
   - It sources the user-profile file (`$USERPROFILESPATH/...`, `:314`), then `easymodes/$sender_paramid.tcl` (`:318`) or `easymodes/$receiver_paramid.tcl` (`:444`).
   - It calls `add_expertprofile` to inject PROFILE_0 (`:328`).
   - It calls `get_cur_profile2` (`:332`) and then `set_htmlParams` (`:333`, `:459`, `:485`).
   - It calls `recycle_easymodes` (`:334`, `:461`) to clone HTML for user-defined profiles ("n.m" numbers) by regex-replacing element ids (`:216-275`).
   - It applies the whitelist and blacklist, a regexp on the peer channel type (`:277-288`, `:389-390`, `:541-546`).
5. It concatenates `HTML_PARAMS(separate_$pnr)` for each `pnr` into the page. The profile selector is a combo box built by `get_ComboBox2` (`:473-478`, `ic_common.tcl:1583`). It then emits `translate('$pnr','$group')` and `translate_map(...)` script calls when `multilingual` is set (`:474-480`, `:500-520`).
6. `ic_common.tcl:459-561` (`base_put_page`) is the accordion variant. It prints `$PROFILES_MAP($pnr) $HTML_PARAMS(active_$pnr)` for each profile (`:529-534`).

### 4.2 Saving: `ic_ifacecmd.cgi`

- `cmd_set_profile` (`ic_ifacecmd.cgi:637-690`) imports `iface address peer ps_type paramid pnr new_profilepath`. It sources `easymodes/$new_profilepath.tcl` (`:665-667`), then the user-profile file `$USERPROFILESPATH/$new_profilepath-$sender_ad.tcl` (`:670-671`), and calls `base_put_profile` (`ic_common.tcl:643-726`).
- `base_put_profile` copies `PROFILE_<n>` into `PROFILE_TMP`. It runs `modify_easymode_ui` (`:580-643`), which merges the posted URL and form values and SUBSETs into the preset. Then `set_profiles` (`:247`) writes it with XML-RPC `putParamset` through `xmlrpc`.
- `ic_ifacecmd.cgi:630-635` also writes `UI_HINT` (the active profile number) as a paramset field. That is how the current profile is remembered on the device.
- `cmd_determineParameter` (`:735-...`) is a helper for "measure now" buttons.

### 4.3 MASTER (channel and device) profiles: `ic_deviceparameters.cgi`

- `ic_deviceparameters.cgi:846-872` calls `getParamsetId <ch> MASTER`, `getExistingParamId`, then sources `easymodes/$ch_paramid.tcl`. For HmIP it prefers `easymodes/hmip/$ch_paramid.tcl` and then `easymodes/hmip/<channel TYPE>.tcl` (`:859-866`). That is why `hmip/` is named after channel types.
- It also sources `<id>Params.tcl` (`:893-894`) and `<id>_intkey.tcl` (`:684`) for the internal key.
- It calls `recycle_easymodes` (`:698`, `:989`).
- `ic_deviceparameters.cgi:136` sources `easymodes/$dev_paramid.tcl` for device-level master pages.

### 4.4 Other callers

- `ic_neweasymode.cgi` creates and edits user profiles. It sources `easymodes/$actor/$sensor.tcl` (`:191`), writes a stub that sources `em_common.tcl` (`:102`), and shows the saved profile.
- No JS builds profiles. The only JS-side loaders are `getLangInfo` and `translate()` (section 7).
- `www_source/jsfiles.txt:211-212` bundles `easymodes/js/ic_functions.js` and `ic_translate.js` into the main webui JS bundle. The remaining `js/*.js` files (`HmIP.js`, `CC.js` and others) are loaded on demand via `load_JSFunc('/config/easymodes/MASTER_LANG/...')` (`ic_common.tcl:1154`).
- Source `www_source/config/js/ic_setprofiles.js` and `css/ic_setprofiles.css` drive the client side of the page. `ShowEasyMode` is the onchange handler of the selector.

## 5. Profile file anatomy

Example: `SWITCH/KEY.tcl` (292 lines, classic HM switch driven by a key).

```
source em_common.tcl / EnterFreeValue.tcl / etc/options.tcl         :3-5
set PROFILES_MAP(n) "\${i18n_key}"                                  :7-11
set PROFILE_n(PARAM) value ...    # full preset of LINK params      :13-170ish
set PROFILE_n(UI_DESCRIPTION|UI_TEMPLATE|UI_HINT) ...              :52-54 etc.
proc set_htmlParams {iface address pps pps_descr special_input_id peer_type}
constructor                                                         :292
```

1. `PROFILES_MAP(n)` maps profile number to a label. The label is a `${key}` placeholder that is translated later, for example `"\${switch_on}"` (`SWITCH/KEY.tcl:8-11`). Profile 0 is always the "expert" profile (`NO_PROFILE.tcl:10-11`). User profiles use numbers of the form `n.m`.
2. `PROFILE_n(...)` arrays hold one full set of LINK or MASTER paramset values per profile. They also hold the special keys `UI_DESCRIPTION`, `UI_TEMPLATE`, `UI_HINT` (the profile number written back to the device), `UI_MAP` (legacy mapping), `UI_VIRTUAL`, `UI_WHITELIST` and `UI_BLACKLIST`. A value can be a plain literal or a `{default range lo - hi}` list (`SWITCH/KEY.tcl:29,33`). There are 89,279 `set PROFILE_n(...)` lines in the tree. That is the bulk of the code and is pure data.
3. `proc set_htmlParams {iface address pps pps_descr special_input_id peer_type}` is the render hook called by `ic_setprofiles.cgi`. It does the following:
   - It links the arrays into scope with `upvar` (`SWITCH/KEY.tcl:175-183`).
   - It calls `get_cur_profile2` to find the matching profile (`:185`).
   - It emits `<script>getLangInfo(sender,receiver)</script>` (`:188`). `NO_PROFILE.tcl:39` uses `getLangInfo_Special('SPECIAL.txt')`.
   - It builds `HTML_PARAMS(separate_$prn)` strings. Profile 0 holds the generic expert form from `cmd_link_paramset2` (`SWITCH/KEY.tcl:189-192`, `ic_common.tcl:1042`). Profiles 1-n hold a description (`\${description_$prn}`) and a `<table class="ProfileTbl">` with the per-profile widgets (`:193-250`).
   - The widgets come from `get_ComboBox`, `EnterTime_h_m_s` and `option <TYPE>`. `option` fills a global `options` list. It is redefined with the same name in `etc/options*.tcl` (7 variants), so callers choose behaviour by which file they source.
4. `constructor` (`em_common.tcl:10-37`) is called at the end. It creates `HTML_PARAMS(separate_$pnr)`, `descriptionTemplate_$pnr`, `whitelist_$pnr` and `blacklist_$pnr` from `PROFILE_n(UI_TEMPLATE|UI_WHITELIST|UI_BLACKLIST)`. `destructor` (`:39-65`) clears the arrays.
5. Everything is shared global state: `PROFILES_MAP`, `HTML_PARAMS`, `PROFILE_n`, `PROFILE_TMP`, `SUBSET_n`, `prn`, `cur_profile`. Files are sourced into the CGI's global scope, so one request has exactly one active profile set.

### Generated HTML shape

```html
<div id="param_<prn>"><textarea id="profile_<prn>" style="display:none">
  ${description_<prn>}                        <!-- i18n placeholder -->
  <table class="ProfileTbl">
    <tr><td>${ONDELAY_TIME}</td><td>
      <select ... name="SHORT_ONDELAY_TIME|LONG_ONDELAY_TIME"
              onchange="ActivateFreeTime($('sender_profiles'),1)">...</select>
      <!-- EnterTime_h_m_s: free-value h/m/s inputs -->
    </td></tr>
  </table>
</textarea></div>
```

Evidence: `SWITCH/KEY.tcl:196-203`, `NO_PROFILE.tcl:41-43,46-48`.

- The HTML for each profile is stored inside a hidden `<textarea>` (3,497 hard-coded wrapper lines). The client JS later fills the visible profile area from the textarea, after substituting the translations. Hence `translate(pnr, group)` and `translate_map(...)` calls are emitted per profile (`ic_setprofiles.cgi:474-480,515-520`).
- `${placeholder}` strings are left unexpanded by Tcl, because they are backslash-escaped (`"\${expert}"`). The browser expands them from the `localized` table.
- Control ids encode position: `separate_<special_input_id>_<prn>_<pref>`, where `pref` is the index of the widget inside the profile. `replace_ids` (`ic_setprofiles.cgi:269-275`) rewrites ids in cloned HTML for user profiles. Everything is coupled by id-string conventions.

## 6. Shared helper libraries (`etc/` and root)

| File | Lines | Role |
|---|---|---|
| `em_common.tcl` | 65 | `array_clear`, `constructor`, `destructor` |
| `EnterFreeValue.tcl` | 388 | `EnterTime_h_m_s` and other free-value inputs (`:38`) |
| `etc/options.tcl` | 571 | `proc option {type}`: option lists (DELAY, LENGTH_OF_STAY, ...) |
| `etc/options_{md,hmw,internalKey,alarmactuator,alarmsiren,hmip}.tcl` | 289, 116, 153, 52, 58, 77 | Alternative `option` implementations with the same proc name per device family |
| `etc/uiElements.tcl` | 1,975 | `getTextField`, `getMinValue`, `getMaxValue`, `getUnit`, unit and min/max text (`:3-264`) |
| `etc/hmip_helper.tcl` | 3,247 | HmIP profile helpers, sourced by HmIP link profiles (`SWITCH_VIRTUAL_RECEIVER/KEY_TRANSCEIVER.tcl:6`) |
| `etc/hmipChannelConfigDialogs.tcl` | 8,311 | 61 procs: all HmIP channel config dialogs (`getMaintenance` at `:8`) |
| `etc/hmipWGDConfigDialog*.tcl`, `hmipWeatherSensor.tcl`, `hmipUniversalLight*.tcl`, `hmipClimateControlFloorHeatingConfigDialog.tcl`, `hmipHeatingClimateControlTransceiverEffect.tcl`, `hmipDSTPanel.tcl`, `hmipMOD-RC8.tcl`, `hmipAlarmPanel.tcl`, `hmipWeeklyProgram*.tcl`, `hmipDRAP_HAPMaintenance.tcl` | 750, 632, 668, 532, 390, 459, 269, 237, 202, 61, 71, 50, 95 | Device-specific panels |
| `etc/profile_pname*.tcl`, `profile_cond_x_ch_master.tcl` | 24, 13, 9, 4, 171 | Profile name and condition-transmitter shared logic |
| `etc/getRemoteModEM8HTML.tcl`, `getStatusDisplayHelp.tcl`, `motionDetectorOnTimeHint.tcl` | 241, 21, 47 | One-off HTML |
| `js/ic_functions.js` | 2,481 | `ShowEasyMode`, `ActivateFreeTime`, `UpdateSpecialInputs`, free-time logic |
| `js/ic_translate.js` | 203 | Localization loader (section 7) |
| `js/HmIP*.js`, `CC.js`, `WGD.js`, `RGBW_Controller.js`, ... | up to 10,250 in total | Device-specific client logic |
| `MASTER_LANG/*.js` | 2,962 in total | Per-device label tables via `jQuery.extend(true, langJSON, {"de": {...}, "en": {...}})` (`MASTER_LANG/KEY_4Dis.js:1-22`) |

The server-side engine (`get_cur_profile2`, `cmd_link_paramset2`, `get_ComboBox*`, `subset2combobox`, `getExistingParamId`, ...) does not live here. It is in `config/ic_common.tcl` (lines 459, 580, 643, 834, 1042, 1583-1619, 1732, 1795, 1907). The profile files therefore only work together with that 1,931-line library.

## 7. Localization

- Profile text is the placeholder `"\${key}"`, not a language string. Tcl emits the placeholder as-is.
- Language files are JSON-fragment `.txt` files, `"key" : "translation",` per line. They are not valid JSON on their own. Per receiver dir: `<RECEIVER>/localization/{de,en}/<SENDER>.txt` and `GENERIC.txt`. Example: `SWITCH/localization/de/KEY.txt:1-4` holds `description_1..4` with `<span class="translated">` and HTML entities. `SWITCH/localization/en/GENERIC.txt` holds labels such as `"switch_on_off" : "Switch - on/off"`.
- Shared texts are in `etc/localization/{de,en}/` (`GENERIC.txt`, `PNAME.txt`, `PNAME_TipTronic.txt`, `NEWPROFILE.txt`, `SPECIAL.txt`, `MOTION_DETECTOR*.txt`, `HmIP_DEVICES.txt`, `ALARM_PANEL.txt`, `DaylightSavingTime.txt`, ...).
- Loader: `js/ic_translate.js:30-100` (`getLangInfo(sender, actor)`):
  - It issues four synchronous (`asynchronous:false`) Prototype `Ajax.Request` GETs: the sender txt, `PNAME.txt`, the local `GENERIC.txt` and the global `GENERIC.txt`.
  - It concatenates the text pieces (`"[{" + ...`) and runs `eval` on the result to build the global `localized` table.
  - `getLangInfo_Special(file)` (`:102-125`) loads a single shared file. `getPathPNAME` (`:22`) picks PNAME or the TipTronic variant.
- `translate(pnr, group)` and `translate_map(...)` then replace `${key}` in the hidden textarea content and in the selector.
- Language switching: `setLanguage` (`ic_translate.js:3`). 0 means de, 1 means en.
- Legacy exception: `MASTER_LANG/*.js` use `langJSON` (the main WebUI i18n table) instead of the txt files.
- Duplication: 720 de + 720 en txt files. 217 groups of byte-identical txt files cover 611 files (`md5sum` grouping). `GENERIC.txt` exists 128 times. This is copy-per-receiver.

## 8. Code duplication

Measured:
- 390 of 1,083 `.tcl` files are byte-identical copies in 126 groups.
- 611 of 1,441 `.txt` files are byte-identical copies in 217 groups.
- The same sender file name recurs across receiver dirs: `SHUTTER_CONTACT.tcl` 32 times, `KEY_TRANSCEIVER.tcl` 24, `KEY.tcl` 24, `VIRTUAL_KEY.tcl` 22, `DISPLAY_LEVEL_INPUT_TRANSMITTER.tcl` 22, `MULTI_MODE_INPUT_TRANSMITTER.tcl` 21.
- Boilerplate per profile: `set PROFILE_n(...)` lines are 89,279 in total, with about 36 keys per profile. In `SWITCH/KEY.tcl` profiles 1 and 2 differ in only 4 `*_JT_*` values and the description (`:17-93`).
- `SWITCH/KEY.tcl:196-250` repeats the same 5-line "combo + free-time input" block for each of 4 profiles, differing only in the parameter name. The tree has 5,009 `get_ComboBox` and 1,449 `EnterTime_h_m_s` calls, all following this pattern.
- 3,497 hand-written `<textarea id="profile_..."` wrappers.
- Same-named procs are redefined in different files (`option` in 7 `etc/options*.tcl`; `getMaintenance` in 3 `etc/hmipWGD*`/`hmipChannelConfigDialogs.tcl` files; `getMaintenanceFloorHeating`). The one that wins depends on source order.
- Huge variants: `UNIVERSAL_LIGHT_RECEIVER_LSC/profiles_shutter.tcl` (2,569 lines), `profiles.tcl` (2,212), `.../MULTI_MODE_INPUT_TRANSMITTER_3.tcl` (2,122), `UNIVERSAL_LIGHT_RECEIVER_RGBW_DALI/profiles.tcl` (2,566).

## 9. Device families (HM vs HmIP)

| | Classic HM / HMW | HmIP |
|---|---|---|
| Receiver dirs | `SWITCH`, `DIMMER`, `BLIND`, `JALOUSIE`, `KEYMATIC`, `WINMATIC`, `SIGNAL_*`, `HMW_*`, `ALARMACTUATOR`, `ACTOR_*`, `DUAL_WHITE_*`, `RGBW_*`, ... | `*_VIRTUAL_RECEIVER`, `*_TRANSCEIVER`, `*_RECEIVER` (HmIP channel types), `UNIVERSAL_*`, `STATUS_INDICATOR`, `HEATING_*`, `CLIMATECONTROL_*` |
| Sender names | `KEY`, `MOTION_DETECTOR`, `SHUTTER_CONTACT`, ... | `KEY_TRANSCEIVER`, `MULTI_MODE_INPUT_TRANSMITTER*`, `COND_SWITCH_TRANSMITTER_*`, ... |
| Entry | `<type>_ch_link.tcl` via the paramset id (`template_ch_link.tcl`) | `linkHmIP_<TYPE>.tcl` fallback (`ic_setprofiles.cgi:870-888`), or `easymodes/hmip/<TYPE>.tcl` |
| Config pages | `*_ch_master.tcl`, `*_dev_master.tcl` | `hmip/*.tcl` (142 files) and `etc/hmip*.tcl` |
| Shared libs | `etc/options*.tcl`, `EnterFreeValue.tcl` | `etc/hmip_helper.tcl`, `uiElements.tcl`, `hmipChannelConfigDialogs.tcl` |
| Transfer | XML-RPC `putParamset`, ConfigPending | the same call, but no "error" progress bar (`ic_ifacecmd.cgi:677-683` treats `HmIP-RF` and `HmIP-Wired` specially) |

HmIP profile files have a different generator style. `SWITCH_VIRTUAL_RECEIVER/KEY_TRANSCEIVER.tcl` has `getDescription` (`:162`), longer `set_htmlParams` (`:170-326`) and uses the `hmip_helper.tcl` / `uiElements.tcl` builders. The MASTER side (`hmip/*.tcl`, for example `hmip/SWITCH_VIRTUAL_RECEIVER.tcl:52-105`) has a single `set_htmlParams` (not 4 profiles) and builds a config dialog from `hmipChannelConfigDialogs.tcl`. Only 7 files under `hmip/` define `PROFILES_MAP`, which shows that these are config pages rather than preset lists.

## 10. Observations and risks relevant to renovation

- The coupling is bidirectional and implicit. Profile files read and write globals defined in `ic_common.tcl`, `ic_setprofiles.cgi` and `ic_deviceparameters.cgi`. They also assume server cwd (`easymodes/...` relative `file exists`, `ic_common.tcl:1920`) and `env(DOCUMENT_ROOT)`. One file even hardcodes `/www/config/easymodes/em_common.tcl` (`hmip/SWITCH_VIRTUAL_RECEIVER.tcl:4`).
- Business knowledge is embedded in numeric enums. `JT_*` values and `ACTION_TYPE` are bare integers in the data (`SWITCH/KEY.tcl:17-93`). Their meaning is only in the device paramset descriptions from the rfd/hmipserver.
- The tree contains an implicit profile-matching algorithm. `get_cur_profile2` (`ic_common.tcl:834-...`) compares the current paramset to each `PROFILE_n`, honouring `{value range ...}`, `UI_VIRTUAL` and `UI_MAP`. This must be preserved or reimplemented.
- User profiles (`$USERPROFILESPATH/...tcl`) are Tcl source files that override or extend `PROFILE_n`. They are written by `ic_neweasymode.cgi` and sourced with `catch {source ...}` (`ic_setprofiles.cgi:314`, `ic_ifacecmd.cgi:670-671`). A renovation must migrate or keep reading them.
- Per-request cost is high. Four synchronous XHRs plus an `eval` per profile page. Each page sources dozens of large Tcl files.
- Mixed encodings (ISO-8859-1 `.cgi`/`.tcl`, German comments, HTML entities in `.txt`). `grep -I` skips these.
- The legacy "firmware 1.4 mapping" path (`mapping/*_map.tcl`, 36 files, `UI_MAP`) is probably dead. Its template is just a placeholder, but no usage analysis was done.

## 11. What a data-driven or component-based replacement would need

1. A neutral profile schema, for example JSON per `(receiverType, senderType)`:
   - `{ id, labelKey, descKey, params: {NAME: value | {default, min, max}}, widgets: [{param, kind: delay|duration|percent|temp, ...}], visibleIf: {whitelist, blacklist}, legacyMap }`.
   - A one-time generator can extract the 89,279 `set PROFILE_n(...)` lines. It could `source` each file under a stub Tcl interpreter and dump `PROFILES_MAP` and `PROFILE_*`, which avoids a parser. The widget lists need either manual lifting or a trace of `append HTML_PARAMS` calls.
   - Deduplicate on the way. The 126 identical-file groups and many near-identical files collapse into shared schemas keyed by sender family. The 5,009 `get_ComboBox` calls fall into a few widget kinds.
2. A small set of generic components that replace the helper libs:
   - Profile selector.
   - Delay, duration and value inputs (`EnterTime_h_m_s`, `get_ComboBox`, `get_InputElem`, `subset2combobox`). The unit and min/max rules in `uiElements.tcl` (`getMinValue`, `getMaxValue`, `getUnit`) become schema fields.
   - Device-specific panels (the `hmip*.tcl` dialogs, about 15,000 lines in `etc/`), which would have to be ported individually.
3. A server API that replaces the HTML-producing Tcl:
   - Needed endpoints: list the profiles for a pair, read the current paramset, write a profile.
   - The matching algorithm (`get_cur_profile2`), `modify_easymode_ui`, `set_profiles` and the user-profile storage have to move behind it, or stay in Tcl behind a JSON endpoint.
   - Preserve the `UI_HINT` write-back (`ic_ifacecmd.cgi:630-635`) and the XML-RPC calls `getParamsetId`, `getParamsetDescription`, `getParamset` and `putParamset`.
4. Localization:
   - Replace the sync-XHR + `eval` of partial JSON with one real JSON catalogue per language, loaded once with the existing i18n mechanism.
   - The key sets are 720 de + 720 en files plus the `langJSON` blocks in `MASTER_LANG/*.js`. Because 611 txt files are byte-identical copies, a merge by key is straightforward. The remaining unique keys (`description_n` etc.) can be namespaced by profile id.
5. A migration inventory of user profiles under `USERPROFILESPATH` (Tcl format) and of the callers (`ic_setprofiles.cgi`, `ic_deviceparameters.cgi`, `ic_neweasymode.cgi`, `ic_ifacecmd.cgi`).
6. Verification against devices. This is hard because there are no tests in this directory. Golden-file tests should snapshot the rendered HTML (or the data) per `(receiver, sender)` pair before and after the migration. The pair count is bounded by the file count (about 790 receiver-dir `.tcl` files plus 142 `hmip/` files plus about 117 top-level files).

## 12. Gaps

- The reference docs (`skills/deep-explore/references/*.md`) were not present in the repo, so the standard module template was approximated.
- `ic_ifacecmd.cgi` and `ic_setprofiles.cgi` were read only at the cited ranges. The exact meaning of `special_input_id` and the full set of `HTML_PARAMS` keys (`before_profiles`, `after_profiles`, `active_$pnr`) was inferred from usage.
- Counts of `set PROFILE_n(` are line-based (including duplicates across files). They are not unique profiles.
- `translate()` and `translate_map()` live in `ic_translate.js` after line 100. Their bodies were not read.
