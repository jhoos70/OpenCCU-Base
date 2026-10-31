# Module: webui-config-pages (src/webui/www/config except easymodes/, plus pda, error, tools, upnp)

Scope: `/home/standard/dev/OpenCCU-Base/src/webui/www/{config (no easymodes/), pda, error, tools, upnp}` and the client JS/CSS that serves them in `src/webui/www_source/config/{js,css}`.
Language: Tcl (CGI scripts, `#!/bin/tclsh`) emitting HTML by `puts`, plus ES5 JavaScript (Prototype.js + jQuery).
All paths below are relative to `src/webui/` unless noted. Line numbers refer to the repo state at commit 030dba79.

## 1. Summary

- The "config" CGIs are NOT full pages. They are HTML *fragments* (no `<html>/<head>`) that the single-page WebUI shell loads via AJAX (`updateContent(...)`, `CreateCPPopup(...)`) into `#content` or into a popup (`www_source/webui/js/pages/systemconfig/deviceconfigpage.js:26`, `www_source/webui/js/pages/linksandprograms/linklistpage.js:17`, `www_source/config/js/cp_functions.js:15-23`). The shell, menu, header/footer and session handling live outside this module (`www/webui`, `www/ise`).
- Two generations of UI coexist:
  1. Legacy "ic_*" (Interne Konfiguration) pages: Tcl `puts` of HTML strings + inline JS, with inline `<script>` that calls `setPath(...)`/`setFooter(...)` of the shell (e.g. `config/ic_deviceparameters.cgi:41-97`). Some ic_* procs still build a full XHTML document (`ic_common.tcl:459-560`) – dead/legacy skeleton from the pre-SPA UI.
  2. "cp_*" (Control Panel) popups: use the `cgi.tcl` HTML DSL (`division {...}`, `table_row`, `cgi_select`) – see `config/cp_display.cgi:22-120`.
- Server-side dependencies that are NOT in this module (provided by the base image, e.g. OCCU): `once.tcl`, `cgi.tcl`, `session.tcl`, `user.tcl`, `common.tcl`, `tclrpc.so`, `tclrega.so`, `package HomeMatic` (`config/ic_common.tcl:2-8`, `config/control_panel.cgi:3`). `www/tcl/extern/cgi.tcl` and `tmpl_parser.tcl` exist only for the PDA (`www/tcl`).
- Encoding trap: most files are ISO-8859-1 with CRLF (`file config/ic_common.tcl` -> "ISO-8859 text ... CRLF"; e.g. `config/ic_common.tcl:15` "Flags f\xfcr"), `ic_md.cgi`, `ic_ifacecmd.cgi:311` already contain mixed/double-encoded UTF-8 ("auslï¿½st"). Any renovation tooling must treat encodings per file.
- HTML/Tcl entanglement is very high: ~16.5k lines of Tcl in `config/*.cgi|tcl`, with HTML built by string concatenation, inline `onclick=` handlers and `<script>` blocks emitted from Tcl with Tcl variables interpolated into JS (e.g. `config/ic_selchannel.cgi:290`, `config/ic_deviceparameters.cgi:1257`).

## 2. Common skeleton

### 2.1 Typical CGI shape (all cp_*, ic_*)
```
#!/bin/tclsh
source once.tcl; sourceOnce cgi.tcl session.tcl common.tcl ...
proc action_put_page {} {...}     ;# cp_* : HTML
proc action_apply {} {...}        ;# cp_* : plain text "Success"/"Failure"
cgi_eval { cgi_input; http_head; catch {import action}; if {[session_requestisvalid 8] > 0} then action_$action }
```
Evidence: `config/cp_display.cgi:1-4,238-255` (dispatch `action_$action`, default `put_page`; POST sets `action=apply`), identical pattern at `cp_add_device.cgi:996`, `cp_maintenance.cgi:1400`, `cp_network.cgi:732`, `cp_security.cgi:1613`, `cp_software.cgi:565`, `cp_time.cgi:814`.
ic_* pages use `cgi_eval { cgi_input; http_head; if {[session_requestisvalid 0] > 0} { import iface/address/...; put_page } }` (`ic_deviceparameters.cgi:1376-1462`, `ic_selchannel.cgi:1251`, `ic_seldevice.cgi:715`, `ic_linkpeerlist.cgi:706`, `ic_setprofiles.cgi:765`, `ic_ifacecmd.cgi:814`, `ic_deviceFirmwareOverview.cgi:262`).

### 2.2 Access levels
`session_requestisvalid <level>` (implemented outside this module, in OCCU `session.tcl`):
- level 8 (admin-only): all `cp_*.cgi`, `ic_md.cgi:60` (the putParamset path).
- level 0 (any logged in user): all `ic_*.cgi`, `tools/devconfig.cgi:1475`.
- no check at all: `control_panel.cgi`, `help.cgi`, `ic_neweasymode.cgi`, `display/*`, `pda/*` (PDA does its own `session_isValid`, `pda/main.cgi:47`), `upnp/*`.
Observation: `control_panel.cgi` and `ic_neweasymode.cgi` (writes user profile files, `ic_neweasymode.cgi:37-111`) have no `session_requestisvalid` guard in this module.

### 2.3 ic_common.tcl (1931 lines) – shared library for all ic_* pages
Sourced at the top by every ic_* CGI. Contents (by proc, `config/ic_common.tcl`):
- Globals: link flags `GL_FLAG_*` (:15-24), `HTMLTITLE` "HomeMatic Interne Konfiguration" (:26), settings file `IC_SETTINGS_CONF_FILE` `/etc/config/ic_settings.dat` with `EXPERTMODE` default off (:44-48; read/write :63-71), user profiles dir `userprofiles` (:35-36).
- Navigation breadcrumb tables: `append2nav`, `appenduser2nav`, `appenddev2nav`, ... (:73-154), rendered by `put_header` (:156-175) as a `<table border=1>` + `<hr>` and `put_footer` (:177-181) with `javascript:history.back()`.
- Interface discovery: `read_interfaces` (:183-227) parses `/etc/config/InterfacesList.xml` by regex into `iface_url/iface_descr`.
- XML-RPC to the HM daemons: `set_value` (:229), `set_profiles` (:247-337), `cmd_add_link` (:446), `cmd_delete_link` (:453), `activate_link_paramset` (:562), all via `xmlrpc $iface_url($iface) ...`.
- Profile page: `base_put_page` (:459-560) builds a full XHTML doc with collapsible profile tables, `onclick="ToggleVisibility('profile$pnr')"`, hidden `<form>` fields (`global_1..7`, `profile`) that JS `SubmitProfile` reads. `base_put_profile` (:643-722) handles save and answers with a small HTML snippet "Das Profil ... wurde gespeichert" + `<script>SwitchActiveProfile(n)`. Error pages `put_error404`, `put_error_profilenotfound` (:724-756).
- Parameter UI generator: `cmd_link_paramset2` (:1042-1479, ~440 lines) turns a paramset description into form rows; value converters `ConvTime/ConvFreeValue/ConvPercent/ConvTemp` (:1499-1581); widget helpers `get_ComboBox2`, `get_Pulse2`, `get_InputElem`, `subset2combobox` (:1583-1825) that return HTML strings; link counting helpers (:1826-1930).
- `modify_easymode_ui` (:580-641) mutates the stored easymode profile from POSTed WebUI fields.
- Easymode glue: sources `config/easymodes/EnterFreeValue.tcl` and `easymodes/etc/getStatusDisplayHelp.tcl` (:9-10). The per-device-type HTML comes from `config/easymodes/**` (out of scope here) – see 6.

### 2.4 ic_metadata.tcl (591 lines)
Metadata (named device/channel metadata like firmware-update state, "smoke test" etc.) helpers sourced by ic_common (:7). `ic_md.cgi` (118 lines) is a tiny AJAX endpoint (`commando` = setEasymode | set ...) that returns *JavaScript text* to be evaluated by the page, and calls `xmlrpc putParamset` after a regex check of the target URL (`ic_md.cgi:11-70`).

### 2.5 display_commons.tcl (59 lines) – NOT the web display
`config/display/display_commons.tcl` reads `/etc/config/InterfacesList.xml` and counts devices (`count_devices`, :34-59) for the *HSSML* pages of the legacy CCU2 hardware LCD (`config/display/display.cgi:25-68` emits `<hssml pagetype="DISPLAY">` with `<div name="DP_01">` pages for 4-key navigation). The directory `config/display/` (7 files, 33-224 lines each) is therefore not web UI at all; it only matters for devices with `hss_lcd` (old CCU). `cp_display.cgi` is the web-UI setter for the same `/etc/config/hss_lcd.conf` and signals `hss_lcd` with `killall -SIGUSR1` (`cp_display.cgi:200-203`).

Note on the task statement: `config/help/`, `config/js/`, `config/hmip/` do not exist as directories. Help is `config/help.cgi`; JS is in `www_source/config/js` (copied/minified into `/config/js/ic_common.js` etc. at build, `www_source/create_webui_js.tcl`); HmIP dialogs are in `config/easymodes/hmip/` + `easymodes/etc/hmip*.tcl`.

## 3. Per-page inventory

Size = lines of the file (`wc -l`). HTML generation: `puts` = Tcl string/`puts`; DSL = `cgi.tcl` DSL (`division`, `table_row`, `cgi_select`); JS-in-Tcl = `<script>` text emitted by Tcl with interpolation.

### 3.1 Control panel (config/)
| File | Lines | Access | Purpose | HTML generation / JS |
|---|---|---|---|---|
| control_panel.cgi | 365 | none | Settings > "System control" tile grid: Maintenance, Security, Time, Display (old CCU only, `isOldCCU` :88), Network, Software, DevConfig link, add-on tiles from `$addon(CONFIG_URL)` | `puts {...}` braces blocks with `${key}` placeholders translated client-side by `translatePage("#content")` (:293). Add-on tooltips: Tcl emits per-language JS arrays (:230-247). Tooltips via jQuery powerTip (:301-330). |
| cp_display.cgi | 255 | 8 | Central LCD brightness/contrast/backlight/date/time format | DSL (:22-120). Inline JS `OnApply` builds POST body, `new Ajax.Request(url, {postBody})` expects text starting "Success" (:140-170). Reads/writes `/etc/config/hss_lcd.conf` (:175-215). Bug: contrast row uses `dialogSettingsCentralDisplayLblBrightness` label (:54). |
| cp_time.cgi | 817 | 8 | Time zone, NTP servers, lat/long, manual time | Tcl-built HTML + JS; Ajax.Request (:495) |
| cp_network.cgi | 735 | 8 | Network settings (IP/DHCP/DNS), HTTPS certificate upload via hidden iframe (:356-360), restart lighttpd via JSON-RPC (:67, :581) | Tcl DSL + inline JS; `homematic("User....")` JSON-RPC calls |
| cp_security.cgi | 1615 | 8 | Largest cp page: passwords/users auth, HTTPS redirect, SSH (+password), SNMP, config backup/restore upload (:1036-1040), HmIP server restart | Tcl DSL + large inline JS; calls `homematic("CCU.setSSH"...)` etc. (:1359-1506), `Ajax.Request` (:368, :854) |
| cp_maintenance.cgi | 1403 | 8 | Central maintenance: firmware update upload + online check (:370, :427-432), ReGa version switch (:592-603), safe mode (:795), HmIP server start/stop (:830-836), LAN-gateway status (:924), reboot/factory reset | Tcl DSL + JS; `jQuery.ajax` (:55), `Ajax.Request` (:772, :994, :1187, :1272), JSON-RPC `homematic(...)` |
| cp_software.cgi | 566 | 8 | Additional software (add-ons) install/uninstall upload | Tcl + JS |
| cp_add_device.cgi | 998 | 8 | Teach-in / install mode for HM RF/wired/HmIP (+ HmIP key/SGTIN entry); `rf_install_mode(true)` called via `call_js=` param (cp_functions.js:10) | Tcl + JS; `homematic('Interface.setInstallModeHMIP',...)` (:560-620), `Ajax.Request` (:471-863) |
| help.cgi | 150 | none | Help page: links to online help, product info; `read_var` of `/var/ids`, `/boot/VERSION` | `puts` tables with CLASS ids, `${dialogHelp...}` placeholders |
| virtualHelp.tcl | 42 | n/a | Static German help blob built with `append help_txt` for virtual dimmer link rules | pure HTML string; not localized |
| backup.tcl | 38 | n/a | `create_backup`: `rega system.Save()`, `tar czf usr/local`, signs with `crypttool`, streams `*.sbk` download | server only |
| file_io.tcl | 104 | n/a | tiny file read/write helpers | server only |
| stringtable_de.txt | 2340 | n/a | key -> `${stringTable...}` mapping for device paramset names/values (`ACCELERATION_TRANSCEIVER|CHANNEL_OPERATION_MODE=OFF`) :1-20 | data; actual texts in `webui/js/lang/{de,en}` |

### 3.2 Device / link configuration (ic_*)
| File | Lines | Access | Purpose | HTML generation |
|---|---|---|---|---|
| ic_deviceparameters.cgi | 1462 | 0 | Device + channel MASTER paramset editor (modes DEVICEPARAMETERS / CHANNELPARAMETERS / CHANNELGROUPPARAMETERS, :1376-1462); header with firmware-update state (:1173-1355); internal-key handling; links to peers | Tcl `puts` of `<table>`; per-channel HTML delegated to easymodes via `put_channel_parameters` (:747-1171); inline firmware/smoke-test JS with `homematic("Interface.getMetadata_crRFD")` (:1257). Footer buttons injected by JS `setFooter(...)` (:56-90). |
| ic_setprofiles.cgi | 925 | 0 | Link (sender->receiver) profile chooser/editor ("easymode" vs expert), uses `put_profile_body`(:289-634) + `put_profile_head`(:636-753) | Tcl `puts`; JS `ic_setprofiles.js` (610 lines) |
| ic_linkpeerlist.cgi | 715 | 0 | List of link partners of a channel (table with sorting, edit/delete) | `put_tablebody` (:192-631) string concat |
| ic_seldevice.cgi | 791 | 0 | Link wizard step 1: choose device; filterable/sortable table | `put_tableheader`, `put_FilterControl`, `put_tablebody` (:565-709) |
| ic_selchannel.cgi | 1321 | 0 | Link wizard step 2: choose channel (same table machinery, ~70% duplicated from ic_seldevice, cf. `LinkExists` :658 vs :547, `put_FilterControl` :569 vs :457); HmIP exceptions hard-coded by device type (:703-740) | same; JS `ic_selchannel.js` (545) |
| ic_ifacecmd.cgi | 826 | 0 | AJAX command endpoint: removeLink, addLink, setLinkInfo, activateLinkParamset, firmware_update, set_profile, set_internalKeys, show config-pending msg (:13-690). Returns JS/HTML snippets executed by caller (`ConfigPendingFrm.ShowConfigPending(...)` :279) | `puts` of `<script>`; firmware update state machine in JS-in-Tcl (:406-560) |
| ic_deviceFirmwareOverview.cgi | 361 | 0 | Table of all devices with firmware versions + action panel, filter widgets (:64-73) | `getHTML`, `put_table_row` string concat |
| ic_neweasymode.cgi | 329 | none | Create/delete user-defined "easymode" profiles, persisted as Tcl source `set PROFILES_MAP(n) ...` files (`StoreFile` :88-111) | Tcl + `ic_neweasymode.js` |
| ic_md.cgi | 118 | 8 (partial) | Motion-detector brightness helper (see 2.4) | emits JS |
| ic_common.tcl / ic_metadata.tcl | 1931 / 591 | | libraries (2.3, 2.4) | |

### 3.3 Other directories
| Path | Lines | Access | Purpose |
|---|---|---|---|
| config/display/*.cgi | 33-224 | none | HSSML for the CCU2 LCD (see 2.5) – not browser UI; `network.cgi` 224 lines |
| tools/devconfig.cgi | 1481 | 0 | Developer/diagnostic UI ("DevConfig", opened via `window.open('/tools/devconfig.cgi?sid=..')` from control_panel.cgi, ~line 215 (search 'DevConfig')): list devices/channels/links, RSSI table & graphs (`cmd_show_rssi` :382, `cmd_rssi_graph` :524), edit paramsets (:832), interface cmds, service messages. Self-contained multi-command CGI with `cmd_*` dispatch, full documents rendered via `html {head{} body{}}`. |
| tools/devicetypes.html, designer.html, HomeMatic-API.html | HomeMatic-API.html 69 (others not measured) | static | Static pages; devicetypes.html uses TrimPath template + Prototype (`tools/devicetypes.html:1-30`) with `tools/js/**` (`jsDevDescr.cgi` 75 lines generates the device description JS) |
| upnp/index.cgi, basic_dev.cgi | 24 / 187 | none | UPnP presentation redirect (parses `ifconfig eth0` for IP, :1-24) and device XML (hostname-dependent title CCU2/CCU3/RaspberryMatic, serial via `/var/board_sgtin`, :20-57) |
| error/error-500.html, error-503.html | ~114 | static | lighttpd error pages |

## 4. Client JS / CSS per page (www_source/config)

Built into `/config/js/*.js` and `/config/css/*` by the CMake/Tcl generators in `www_source/` (`create_webui_js.tcl`, `create_style_css.tcl`; `CMakeLists.txt`). Class names such as `CLASS21600..CLASS22000` in the Tcl are placeholders for inline styles collected into a generated stylesheet (`webui/css/x_style.css`); counts: cp_security 96, cp_maintenance 92, cp_add_device 61, cp_network 35 occurrences (`grep -c CLASS2`).
| JS | Lines | Used by |
|---|---|---|
| ic_common.js | 1183 | all ic_* (Profile toggle `ToggleVisibility`, `SwitchActiveProfile`, `SubmitProfile`, `SendRequest`, `picDiv` device pictures) |
| ic_deviceparameters.js | 493 | ic_deviceparameters.cgi; save via `SendRequest('ic_ifacecmd.cgi')` (:70, :412, :431, :460) |
| ic_setprofiles.js | 610 | ic_setprofiles.cgi |
| ic_selchannel.js | 545 | ic_selchannel/ic_seldevice (sort, filter, `SizeTable`) |
| ic_neweasymode.js | 62 | ic_neweasymode.cgi |
| ic_configpendingmsg.js 390, ic_msgbox.js 217, ic_infomsgbox.js 86, ic_progressbar.js 179, ic_timeout.js 690, ic_partyendtime.js 94, ic_replacedevice.js 103 | | dialogs/messages used by ic_ifacecmd results and device config |
| cp_functions.js | 394 | `showXxxCP()` openers: `CreateCPPopup(url, params)`; popup width for add device 925 (:3-14). References missing `cp_cert.cgi` (:26) – dead entry |
| ic_gd.js / jsDevDescr.js | 172 / 112 | device-description lookup (also copied to tools/js) |
CSS: ic_deviceparameters.css, ic_linkpeerlist.css, ic_messagebox.css, ic_neweasymode.css, ic_selchannel.css, ic_setprofiles.css (www_source/config/css).
Libraries used: Prototype (`/webui/js/extern/prototype.js`, referenced in `ic_common.tcl` `base_put_page`, ~:476), jQuery, jQuery powerTip, TrimPath templates (tools only), wz_jsgraphics (device picture overlay, `put_picDiv` ic_common.tcl:763-821).

## 5. Forms, AJAX and post-back mechanics

Patterns found (mixed; no single client API):
1. Prototype `new Ajax.Request(url, {postBody: "action=apply&...", onSuccess: t => t.responseText.match(/^Success/)})` – the classic cp_* convention (`cp_display.cgi:140-170`; also `cp_add_device.cgi:471,523,671,703,726,863`, `cp_maintenance.cgi:772,994,1187,1272`, `cp_network.cgi:470`, `cp_security.cgi:368,854`, `cp_time.cgi:495`). Server answers `Success`/`Failure` plain text or an error string.
2. JSON-RPC `homematic("Method", {params}, callback)` to the central API (`www/api`), used for system operations: `User.restartLighttpd`, `CCU.setSSH`, `Interface.setInstallModeHMIP`, `SafeMode.enter`, `Interface.getDeviceDescription`, `Interface.setMetadata_crRFD` (examples `cp_network.cgi:67,579`, `cp_maintenance.cgi:592-603,795-890`, `cp_security.cgi:1359-1506`, `ic_ifacecmd.cgi:381-578`). Synchronous calls are also used (return value: `homematic("CCU.getSSHState", {})`, `cp_security.cgi:1359`).
3. `SendRequest('ic_ifacecmd.cgi')` – ic_* convention: collect hidden `global_*` fields + dynamically named paramset inputs, POST, and *eval the returned HTML/JS* (`ic_deviceparameters.js:70`; server side `ic_ifacecmd.cgi:13-690`, e.g. `cmd_set_profile` :638).
4. `jQuery.get("/config/ic_deviceparameters.cgi?...")` and `updateContent(url, postData)` to load a fragment into the shell (`www/webui/js/common/viewmodels.js:156`, `deviceconfigpage.js:26`).
5. Multipart file upload (firmware, certificate, config backup, add-on) via classic `<form target=hidden_iframe enctype=multipart/form-data>` (`cp_maintenance.cgi:427-432`, `cp_network.cgi:356-360`, `cp_security.cgi:1036-1040`).
6. Paramset field naming: dynamically built ids like `separate_<n>_<ch>_<idx>`; profiles are Tcl arrays `PROFILE_<n>` / `PROFILES_MAP` (`ic_common.tcl:643-700`); `modify_easymode_ui` maps posted fields to xmlrpc `putParamset` (`:580-641`, `set_profiles` :247).
No CSRF token other than `sid` in URL/body (`$sidname`/`$sid` hidden fields `ic_common.tcl:499-505`, `?sid=` query on actions e.g. `cp_display.cgi:141`).

## 6. Internationalization / localization

- Placeholder strategy: Tcl emits literal `${key}` (escaped `\${key}` inside quoted strings) and the browser replaces them: `translatePage(container)` -> `setTextContent` walks text nodes matching `/\${\w+}/` and replaces from `langJSON[lang][key]` (`www/webui/js/lang/translate.js:1-69`). `translateKey("key")` for JS strings (:71-78), `translateButtons(name)` for `<input type=button name=key>`. Elements with `class="j_translate"` are hidden until translated (translate.js:46 `.j_translate`.show; `ic_deviceparameters.cgi:80`).
- Language tables: `www/webui/js/lang/{de,en}` (outside this module) loaded by `loadTextResource.js`; per-device-type help JS in `config/easymodes/MASTER_LANG/*.js` and `easymodes/etc/localization/{de,en}`.
- Tcl side is partly still hard-coded German: `ic_common.tcl:156-181` ("Navigation", "Zur\xfcck"), `459-560` ("Bitte w\xe4hlen Sie ein Profil."), profile save messages (:688-720), `ic_selchannel.cgi:471` ("Es stehen nur virtuelle Kan\xe4le zur Verf\xfcgung."), `virtualHelp.tcl:1-42`, PDA (`pda/fav.cgi:21-30` "Aktiv", "Letzte Ausf\xfchrung", `pda/eq3/controls/switch.tcl:22-26` "Ein/Aus"), `cp_display.cgi:164` alert text, tools/devconfig. Legacy comments keep the German original beside the placeholder (`cp_display.cgi:26-27`) showing a migration to keys was done piecemeal.
- Param-name/value tooltips: `stringtable_de.txt` (2340 lines, tab-separated `PARAM|NAME=VALUE <TAB> ${stringTableKey}`) feeds a server-side lookup so device paramset labels become `${...}` too.
- Because translation happens by regex on rendered HTML text nodes, `${..}` must not appear in TrimPath templates (see translate.js:88-95).

## 7. How device/channel config dialogs are produced

Flow for "Settings > Devices > Configure" (ic_deviceparameters) and link profiles (ic_setprofiles):
1. Shell calls `ic_deviceparameters.cgi` (`deviceconfigpage.js:26`) with iface+address (+`redirect_url`, `with_group`). CGI picks MODE by `getDeviceDescription` PARENT empty or not (`ic_deviceparameters.cgi:1405-1456`), reads MASTER paramset + `getParamsetId` and `getParamset` via XML-RPC (`:1417-1432`).
2. `put_channel_parameters` (`:747-1171`) iterates channels, gets the paramset *description* (`getParamsetDescription`) and for each channel type looks up a handler in `config/easymodes/<DEVICE_FAMILY>/<CHANNEL_TYPE>.tcl` (hm/hmw/hmip trees). `recycle_easymodes` (:185-241) reuses existing HTML per profile.
3. HmIP channel dialogs: `config/easymodes/hmip/<CHANNEL_TYPE>.tcl` (69 files source `hmipChannelConfigDialogs.tcl`, e.g. `easymodes/hmip/MAINTENANCE.tcl:4`) call procs of `config/easymodes/etc/hmipChannelConfigDialogs.tcl` (8311 lines): one `get<ChannelKind> {chn p descr [address]}` proc per kind, `getMaintenance` (:8), `getKeyTransceiver` (:669), `getGenericInputTransmitter` (:849), `getMultiModeInputTransmitter` (:975), `getAnalogInputTransmitter` (:1238), `getSwitchTransmitter` (:1285), `getBlindTransmitter` (:1497), `getShutterTransmitter` (:1794), `getDimmerTransmitter` (:2102) ... Signature `{chn p descr}`: `chn` channel number, `p` upvar paramset values, `descr` upvar paramset description. Each builds `<tr><td>${label}</td><td>[getCheckBox/getTextField/getOptionBox ...]</td></tr>` by `append html`, with `incr prn` to number parameter rows; and emits `<script>` for dynamic show/hide and loads help JS via `load_JSFunc('/config/easymodes/MASTER_LANG/HmIP-ParamHelp.js')` (:35). Helper widgets come from `easymodes/etc/uiElements.tcl`, `options*.tcl`, `hmip_helper.tcl` (sourced :1-6), while special composite panels live in `hmipDSTPanel.tcl`, `hmipWeeklyProgramHeating.tcl`, `hmipUniversalLightEffectPanel.tcl`, `hmipWGDConfigDialog.tcl`, etc.
4. Readout/validation: value ranges and conversions in JS (`ic_deviceparameters.js`, ic_common.js) and in Tcl (`ConvTime`, `ConvPercent`, ic_common.tcl:1499-1581); expert-only channels filtered by `isExpertChannel` (`ic_deviceparameters.cgi:583`) and `EXPERTMODE` setting.
5. Save: footer buttons call `SaveDeviceParameters()` -> collects fields -> `SendRequest('ic_ifacecmd.cgi')` (`ic_deviceparameters.js:70,412-460`) -> `cmd_set_profile`/`set_internalKeys` (`ic_ifacecmd.cgi:621-690`) -> `xmlrpc putParamset`, then `cmd_ShowConfigPendingMsg` (:182-295) reports CONFIG_PENDING to user.
Device-type-specific decisions are hard-coded as string compares on type names (`ic_selchannel.cgi:703-740`, `ic_linkpeerlist.cgi:309-311`, `ic_deviceparameters.cgi:612-650`), i.e. business rules live inside the presentation code.

## 8. PDA (mobile) UI – www/pda

Standalone mini-app (no JS framework, no AJAX), by eQ-3 2009. ~1,800 lines in total.
- Entry: `index.cgi` (25 lines) renders `templates/index.tmpl` (login form); `main.cgi` (67) creates session by `session_login $login $password` (:21-38), shows favourite lists (`Favorite_getLists $userId`); `favlist.cgi` (44) lists favourites; `fav.cgi` (180) shows one favourite (channel / program / sysvar) with status+controls; `logout.cgi` (34).
- Templating: real templates. `extern/tmpl_parser.tcl` evaluates `<% tcl %>` and `<%= [expr] %>` in `templates/*.tmpl` (e.g. `templates/main.tmpl:21-30`), wrapper `eq3/template.tcl:1-41` (`template_parseFile`, `include`). This is the only part of the module with a template engine.
- Server helpers (`eq3/`): `ui.tcl` (75; style selection `getUIStyle` by User-Agent: iPhone/iPod -> `large`, else `small` :4-21; CSS inlined into `<style>` via `includeStyle`; `button`, `changeViewButton`, `systemButton`, `status_separator`), `rega.tcl`/`session.tcl` (sourced as `eq3/...` from `www/tcl/eq3/`; ReGa scripts executed with `rega_exec`), `favorite.tcl`, `program.tcl`, `sysvar.tcl`, `channel.tcl`, `dpcontrols.tcl` (45) dispatching by datapoint id to control modules.
- `eq3/controls/*.tcl` (13 files, 16-155 lines): per datapoint type renderers: `SwitchControl_getStatus`/`getControls` (switch.tcl), blind, dimmer, lock, temp, window, rhs, button, door_sensor, danger, event_interface, generic, sysvar. Register via `DPControls_GETSTATUS(SWITCH.STATE)` and `COMMANDS(switch_on)` arrays (`controls/switch.tcl:3-11`); actions are plain GET links `fav.cgi?sid=..&cmd=switch_on` (full page reload, `fav.cgi:45-70`).
- Look & feel: XHTML Basic 1.1 table layout, 2 CSS files (`style/large.css` 113, `style/small.css` 114), sprite-like PNGs in `img/{large,small}`. Session `sid` is carried in every URL. All user-visible text is hard-coded German; no i18n hook.
- Authentication model: own login (no `session_requestisvalid`); uses `session_isValid` from `www/tcl/eq3/session.tcl`.

## 9. Entanglement assessment

- Server logic <-> markup: complete. Data reads (xmlrpc), business rules (device-type string compares), HTML (`puts`/`append html`), inline JS with Tcl-interpolated data, and event wiring (`onclick="..."` attributes) are co-located in the same procs (`ic_deviceparameters.cgi:354-534` `put_orig_channel_parameter`; `ic_common.tcl:1042-1479`).
- Output encoding/escaping: manual `cgi_quote_html` in places, string interpolation in others (e.g. `ic_selchannel.cgi:290` embeds names inside `onmouseover` handlers) -> XSS risk and quoting hazards when restructuring.
- Duplication: ic_seldevice vs ic_selchannel (table/filter/sort ~600 lines each); `isHmIP` defined in several files (`ic_deviceparameters.cgi:612`, `ic_linkpeerlist.cgi:46`, `ic_setprofiles.cgi:14`).
- Mixed client libs: Prototype + jQuery + JSON-RPC + eval of server-returned JS.
- Encoding: ISO-8859-1/CRLF files mixed with UTF-8 files; bytes in literals must be preserved.
- Global state: heavy use of Tcl globals/`upvar` (`global dev_descr iface prn special_input_id` in easymode procs) means individual widget procs cannot be reused without the page context.
- Out-of-module dependency: all authorization, session, `homematic()` JSON-RPC and translation tables live elsewhere (OCCU / `www/api` / `www/webui`).

## 10. Renovation candidates (ranked, ease x value)

1. `cp_display.cgi` (255) – small, self-contained, DSL-built, admin-only, one text-protocol endpoint; also relevant only for devices with LCD. Easy pilot: replace with static HTML fragment + JSON endpoint (or `homematic()` method). Possibly retire with `config/display/*` if legacy LCD hardware is out of scope.
2. `control_panel.cgi` (365) – pure tile grid; markup is static except `isOldCCU` and add-on loop (:88, :110-170). Easy to convert to a template/Bootstrap grid; translation placeholders are already key-based.
3. `help.cgi` (150), `upnp/*`, `error/*.html` – trivial, low risk. Error pages can be re-themed with the new Bootstrap assets without any Tcl change.
4. `cp_time.cgi`, `cp_software.cgi`, `cp_network.cgi` (817/566/735) – form pages with `action_apply` endpoints; separating the endpoint (Tcl, returning JSON) from view (static HTML + JS) is mechanical. cp_network needs the certificate upload iframe pattern replaced.
5. `cp_security.cgi` (1615) and `cp_maintenance.cgi` (1403) – high value (frequently used, security relevant) but largest; mostly already migrated to `homematic()` JSON-RPC calls so the Tcl portion is shrinking – good to split per section (password, SSH, SNMP, backup; firmware, ReGa version, safe mode).
6. `ic_deviceFirmwareOverview.cgi` (361) and `ic_linkpeerlist.cgi` (715) – table views with filter/sort; could become client-rendered from JSON (xmlrpc results via a small API) – the Tcl is mainly data gathering.
7. `ic_seldevice.cgi` + `ic_selchannel.cgi` (791 + 1321) – deduplicate into one client-rendered table; hard-coded HmIP exceptions (`ic_selchannel.cgi:703-740`) must be moved into data.
8. `pda/` – isolated and already template-based; cheapest full re-skin would be dropping XHTML-Basic tables for a responsive layout; or replace by the main responsive UI and retire. Controls are separate per datapoint (good seam). German strings need keys.
9. `tools/devconfig.cgi` (1481) – expert tool, own monolith; low priority, keep as is or hide behind expert mode.
Hard / avoid early: `ic_common.tcl` (`cmd_link_paramset2`, profile engine), `ic_setprofiles.cgi`, `ic_deviceparameters.cgi` + `easymodes/etc/hmipChannelConfigDialogs.tcl` (8.3k lines, 69+ channel-type files, hundreds of dialogs). A renovation needs a data-driven (paramset description -> form) generator first; piecemeal restyling should be limited to CSS (`CLASS2xxxx` classes) and the shared widget helpers (`get_ComboBox2`, `getCheckBox`, `getTextField`, `uiElements.tcl`), which are the natural seam to inject new markup (Bootstrap 5 classes) across all dialogs at once.

## 11. Gaps / notes
- Not read in depth: bodies of cp_time/cp_software/cp_add_device/ic_selchannel/ic_setprofiles; their purposes are inferred from headers, grep hits and JS callers.
- Session semantics of level 8 vs 0 are defined outside this repo path (OCCU `session.tcl`); the 8=admin interpretation is inferred from usage on admin-only pages.
- `config/img/devices` is empty here; `config/devdescr` is generated at build (`www_source/config/devdescr/*.tcl`, 542 files; CMakeLists:12-13) and was excluded as requested.
