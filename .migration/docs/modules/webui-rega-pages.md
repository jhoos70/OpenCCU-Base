# Module: webui-rega-pages (ReGa-served WebUI pages + ise static assets)

Scope: `src/webui/rega` (188 files) and `src/webui/www/ise` (260 files). Paths below are relative to `src/webui/` unless noted.
Method: grep-first plus targeted reads. Counts come from `find`/`wc`/`grep`. Items marked "not verified" were not opened.

## 1. Purpose and deployment

- `rega/www/` is the set of server-side-scripted pages that ReGa's built-in web server (the HomeMatic "ReGa" logic engine, a Homematic Script interpreter) evaluates. It is copied to `${ROOTFS}/www/rega` (`CMakeLists.txt:7`). EULA files are symlinked into it (`CMakeLists.txt:8-9`).
- `rega/bin/` holds Tcl helper scripts (`hm_startup`, `hm_autoconf`, `hm_deldev`). They call ReGa through `load tclrega.so` and `rega_script { ... }` (`rega/bin/hm_startup:13-14,23-30`). They are not UI.
- `www/ise/` is a plain static asset tree, copied verbatim by `CMakeLists.txt:6`. It is served as `/ise/...`.
- The browser-side framework (`/webui/webui.js`, `/webui/js/...`, `/webui/style.cgi`) is built from `www_source/` and is outside this module. It is the other half of every page here (section 7).
- Size of the ReGa part, by directory:
  - `rega/www/esp/`: 25 `.fn`/`.htm`/`.inc` files plus `controls/` with 55 `.fn` files.
  - `rega/www/pages/`: 1 `index.htm`, `msg/` with 41 dialogs, and `tabs/` with 38 files.
  - `rega/www/xml-api/`: 7 files.
  - `rega/www/xml/`: 2 files.
  - Top level: `index.htm`, `login.htm`, `logout.htm`, `help.htm`, `NoAjaxBrowser.htm`.
- About 46,979 lines in total across `rega`.
- Encoding is mixed. `index.htm` and `pages/index.htm` are ISO-8859-1 (`file` output, and `rega/www/index.htm:7,14`). Some `.fn` and tab files are UTF-8. German umlauts therefore appear in raw 8-bit form in some files (for example `pages/msg/delSysVariable.htm:14-20`). Any tool that rewrites these files must preserve or deliberately convert the encoding.

## 2. ReGa script and HTML/JS interleaving (core mechanism)

Files are HTML templates with `<% ... %>` blocks. ReGa evaluates each block on the server, and its `Write`/`WriteLine` output is spliced into the response (JS or HTML).

| Technique | Example | Evidence |
|---|---|---|
| Server value into a JS constant | `iufVisible = <% Write( iufVisible ); %>;` | `pages/index.htm:85-94` |
| Server value into a JS constant | `ul = <% Write( oUser.UserLevel()); %>;` and `userId = ...` | `pages/index.htm:99-100` |
| Server emits JS statements | `WriteLine('var userName = "' # sUserFullName # '";')` | `pages/index.htm:144-146` |
| Server emits a JS function body | `getUPL()` returns the integer UPL read from the session | `pages/index.htm:158-171` |
| Server emits a JS function body | `getSessionId()` returns `"<%Write(sessionId);%>"` | `pages/index.htm:181-183` |
| Server loops generate HTML rows, including `onclick` handlers and inline `<script>` blocks | device list: `foreach(tmp, obj.EnumEnabledIDs())` writes `<tr>`/`<td>` with `loadChannels(id)` and `new jsGraphics(...)` / `Draw(jg_0, label, 50, '-1')` | `pages/tabs/control/devices.htm:55-118` |
| Login user buttons built from `ID_USERS` | `Write('<div id="btn-user-'#uId#'" ... onclick=\'UserButtonClick("..."\')` | `login.htm:93-118` |
| Per-control widget code emitted by ReGa functions | `iseButtonsSwitch(...)` instantiated in generated `<script>` | `esp/controls/switch.fn:20-27` |
| i18n placeholders `${key}` inside HTML or ReGa strings | `${btnLogin}`, `${actionStatusControlLblOn}`. Resolved client-side by `translatePage()` / `translateKey()`, for example `login.htm:193` | `login.htm:126,144`, `esp/controls/switch.fn:13` |
| Hard-coded German beside i18n keys | commented-out German alongside `${...}` keys | `esp/rooms.fn:84-88` |

Language constructs seen:
- Types: `object`, `string`, `integer`, `boolean`, `var`.
- Strings: `#` concatenates, `.Length()`, `.Substr()`, `.StrValueByIndex(";", n)`, `.ToInteger()`.
- Control flow: `foreach(id, collection.EnumXxxIDs())`, `elseif`, `quit`, `return`.
- Output: `Write`, `WriteLine`, `WriteXML` (`xml-api/devicelist.xml:37-42`).
- Comments: `!` (single line).
- Includes: `Call("file.fn::Function()")`. This is a relative or absolute-from-`www` include that runs a named function in the same variable scope.
- Request parameters travel as ReGa globals. Examples are `action`, `sessionId`, `request` and `level`. `system.GetVar("id")` reads POST or GET variables, for example `esp/rooms.fn:2`.

Object-model entry points used throughout:
- `dom.GetObject(id)`, `dom.CreateObject(OT_*)`, `dom.DeleteObject`.
- Collections `ID_USERS`, `ID_DEVICES`, `ID_ROOMS`, `ID_FUNCTIONS`, `ID_FAVORITES`, `ID_SYSTEM_VARIABLES`, `ID_PRESENT`.
- `root.Devices().EnumUsedIDs()`.
- `dom.GetTimestamp/SetTimestamp` (`xml-api/cache.fn:31-32`).
- `web.SetRespHeaderItem`, `web.SetRespStatus`, `web.TryRespondFromCache` (`xml-api/cache.fn:33-45`).
- `system.LoginPage`, `system.IsVar/GetVar`, `system.GetSessionVar/SetSessionVar/GetSessionVarStr`, `system.Date`.
- About 495 `dom.GetObject` occurrences in `pages/` and `esp/` (grep count).
- Constants: `iul*` user levels, `iar*` access rights, `OT_*` object types, `et*`, `so*`/`st*` sort constants, `dwcPC`/`dwcPDA` (default-login clients).

## 3. Page inventory and routing

### 3.1 Entry and login flow (top-level pages)

1. `index.htm` (119 lines) is the root, ISO-8859-1.
   - `<% system.LoginPage("/login.htm"); %>` makes the ReGa web server redirect unauthenticated requests to `/login.htm` (`index.htm:9-12`). The comment at `:77-79` states this.
   - Its `onLoad()` JS does `top.window.location.href = "pages/index.htm" + ("?sid=" + SessionId)` (`:18-19,81-106`).
   - It appends `&client=<dwcPC>` when auto-login is configured. A ReGa block checks `system.IsVar("NoAutoLogin")` and `oUsers.UsersDefaultLogin(dwcPC)` (`:92-102`).
   - The fallback is `NoAjaxBrowser.htm` (`:18`) when `XMLHttpRequest` is unavailable (`:59-70`).
2. `login.htm` (197 lines) is the login form.
   - Users are enumerated from ReGa with `oUsers.EnumEnabledIDs()`. A user is shown when `uObj.Visible() && uObj.UserShowLogin()` (`:93-118`).
   - A `<form id="gwlogin" method="post">` has fields `tbUsernameShow`, `tbUsername` (hidden, spaces stripped), and `tbPassword` (`:123-148`, `FormSubmit` `:28-33`). It posts to itself. The ReGa web server handles authentication.
   - On failure it reads `system.GetVar("error") == "1"` and shows `${hintLoginInvalid}` (`:153-161`).
   - Help is loaded with `Ajax.Updater("content", "/config/help.cgi", {postBody:"from=login"})` (`:182-191`).
   - Dependencies: Prototype, jQuery, `/webui/style.cgi`, and `/webui/js/lang/{loadTextResource,translate}.js` (`:7-13`).
3. `logout.htm` (119 lines) is structurally the same page as `login.htm`, with the same header layout (`logout.htm:1-50`). Remaining lines not examined.
4. `help.htm` (76 lines) and `NoAjaxBrowser.htm` (28 lines) are small static or error pages.
5. `pages/index.htm` (222 lines) is the real application shell.
   - It starts with `Call("/esp/system.fn::CheckUserFavorite()")`, which creates the per-user favorites list `_USER<id>` (`:10`, `esp/system.fn:1-17`).
   - It loads about 30 third-party scripts. Examples: jQuery, jQuery UI, Prototype and scriptaculous, knockout, jqPlot and its renderers, spectrum, iro, wz_jsgraphics, powertip, blockUI, nfs_datepicker, and a Bootstrap bundle (`:26-63`).
   - It loads stylesheets `main.min.css`, `hmBootstrap.css` and `/webui/style.cgi` (`:69-71`).
   - It sets `PLATFORM="Central"` and `WEBUI_VERSION="$(VERSION)"` (`:79-80`). `$(VERSION)` is a build-time token.
   - It sets URL debug switches read from the query string: `preventInterfaceCheck`, `showInterfaces`, `debug`, `showDummyLicense`, `showAPITools`, `showRFAddress` (`:115-121`).
   - It blocks the Backspace key and the browser Back button with `history.pushState` + `popstate` (`:188-205`).
   - `<body onload="WebUI.start();">` hands over to `/webui/webui.js` (`:209,220`). The body contains only the loader splash, `#webuiloader_*` (`:210-219`).
   - The shell is a single-page app. All further navigation is client-side `WebUI.enter(<Page>)`.

### 3.2 Client-side page model and tab fragments

Pages are JS objects in `www_source/webui/js/pages/**` (for example `ControlDevicesPage`, `ControlPage`, `SystemControlPage`, `www_source/webui/js/pages/control/controldevicespage.js:1`). Each fetches an HTML fragment from `rega/www/pages/tabs/**` (for example `updateContent('/pages/tabs/user/userAdministrationUser.htm')`, `www_source/webui/js/pages/systemconfig/useradminpage_user.js:8`). The fragment is evaluated by ReGa and injected into `#content`. Every `WebUI.enter(...)` target appearing in fragments, with counts: `ControlPage` 13, `ControlFavoritePage` 3, `ProgramListPage` 2, `NewDeviceListPage` 2, `FavoriteListPage` 2, `ControlProtocolPage` 2, and singletons `UserAdminPageUser`, `UserAdminPageAdmin`, `SystemControlPage`, `SystemConfigPage`, `StartPage`, `RoomListPage`, `LinkListPage`, `FunctionListPage`, `DiagramListPage`, `DeviceListPage`, `DeviceFirmwareInformation`, `CreateGroupPage`, `CreateDiagramPage`, `ControlVariablesPage`, `ControlRoomsPage`, `ControlProgramsPage`, `ControlFunctionsPage`, `ControlFavoritesPage`, `ControlDevicesPage`.

Fragments under `rega/www/pages/tabs/` by section (privilege folder = who sees it):

| Section | Fragment files | Notes |
|---|---|---|
| Start page | `tabs/startpage.htm` (322 lines), `tabs/guest/startpageguest.htm` (120) | Favorites selector built from `ID_FAVORITES.Get("_USER"#userId)` (`startpage.htm:5-60`). Sets `sessionTAB="startpage"` (`:2`). |
| Status and control hub ("Status und Bedienung") | `tabs/control.htm` (133) | 8 tiles: Devices, Rooms, Functions, Diagrams, Favorites, Programs, System variables, System protocol (`control.htm:20-81`). |
| Control: devices, rooms, functions | `control/devices.htm`, `rooms.htm`, `functions.htm` (list), `hdevichannels.htm`, `hroomchannels.htm`, `hfuncchannels.htm` (channel pane), `control/function.fn` | Left pane lists the items. Right pane `#chnList` is filled via `Ajax.Updater("chnList", "/pages/tabs/control/hdevichannels.htm?sid=")`. The names `hdevichannels`/`hroomchannels`/`hfuncchannels` appear there. |
| Control: programs, system variables, protocol | `control/programs.htm`, `control/sysvars.htm`, `control/systemProtocol.htm`, `control/systemProtocolLoader.htm` | `iseSysProtoLoader` polls `systemProtocolLoader.htm?sid=` (`www_source/ise/js/iseSysProtoLoader.js:22`). |
| Favorites | `tabs/favorites.htm`, `tabs/favViewer.htm` (278), `tabs/user/favOverview.htm` (447), `tabs/user/newFav.htm` (1114) | Favorite lists are editable per user. |
| Status messages | `tabs/statusviews/alarmMessages.htm` (353), `tabs/statusviews/serviceMessages.htm` (481) | Alarm and service-message views. |
| Admin: settings hub | `tabs/admin/systemconfig.htm` (181) | Tiles route to: `NewDeviceListPage` (device inbox, `:18`), `DeviceListPage` (`:34`), `RoomListPage` (`:59`), `FunctionListPage` (`:70`), `CreateDiagramPage` (`:83`), `CreateGroupPage` (`:93`), `DeviceFirmwareInformation` (`:104`), `UserAdminPageAdmin` (`:124`), `FavoriteListPage` (`:146`), `SystemControlPage` (`:162`). Sets `sessionTAB="systemconfig"` (`:2`). |
| Admin: links and programs hub | `tabs/admin/linkprog.htm` (119) | `LinkListPage` (`:15`), `ProgramListPage` (`:59`). |
| Admin: system | `tabs/admin/systemvars.htm` (470), `userAdministration.htm` (216), `adminFirstStart.htm` | System variable table with sort via `sessionLS` (`systemvars.htm:72-74`). |
| Admin: dialogs | `tabs/admin/msg/newSysVar.htm` (389), `tabs/admin/msg/timemodule.htm` (1167) | Time-module popup. |
| Admin: views | `newdevices.htm` (2773 lines, the biggest file in the module), `newdevicechannels.htm`, `newdevicechannelsloader.htm`, `newDeviceLoader.htm`, `functions.htm` (831), `functionchannels.htm`, `rooms.htm` (855), `roomchannels.htm`, `programs.htm` (1161), `programlist.htm` (464) | Device inbox, room, function and program editors. |
| User-level (non-admin) | `tabs/user/systemConfigUser.htm`, `userAdministrationUser.htm`, `userFirstStart.htm` | |

Notes:
- `pages/tabs/statusviews/channelLoader.htm` and `channelBody.htm` are referenced by `www_source/ise/js/channelLoader.js:49` and `iseChannelLoader.js:22`. They do not exist under `rega/www/pages/tabs/statusviews/` (the directory holds only `alarmMessages.htm` and `serviceMessages.htm`). `find` of `/src/webui` returned no copy, so they may be provided by another module or be dead references. Not verified beyond that.
- `esp/exec.htm` and `xml-api/ispresent.txt` are zero-byte files (`wc -l` 0). They may be existence probes (not verified).

### 3.3 Modal dialogs: `pages/msg/*.htm` (41 files)

Loaded as popups (`CreatePopup(ID_...)`, for example `userLink = "CreatePopup(ID_USER_ACCOUNT_CONFIG_ADMIN, id)"`, `pages/index.htm:146`). Two kinds:

- **Generic editors**:
  - channel and system-variable pickers: `channelList`, `chnListBody`, `sysVarsSelection`, `sysVarsArray`, `sysVarsArrayAll`, `delSysVariable`, `programChooser`, `programChooserArray`
  - value editors: `insertValue` (454 lines), `insertString`, `setValueRange` (339)
  - script and property editors: `createScript`, `editScript`, `popupPropEditor`, `popupTransEditor`
  - user management: `userAccountConfigAdmin` (576), `userAccountConfigUser` (186), `autoLoginConfig`
  - device actions: `renameDevice`, `askRenameAllChannels`, `statusinfo`, `statusinfoWarning`, `controls`
- **Device-specific parameter dialogs** (about 25 files, `set*CombinedParam.htm`, `setOUCFMMode.htm` (1096 lines), `setRGBW*`, `setDimmerVirtualReceiverCombinedParam`, `setUniversalLightReceiver`, `setWindowDriveCombinedParam`, `setPartyMode`, `chooseOULED16` (456), `asir_setAlarm`, and others). Their values are written into program rules.
- **First-start security notice** per language: `securityFirstStart_de|en|tr.htm`. JS selects by `lang`: `"/pages/msg/securityFirstStart_"+lang+".htm"` (`www_source/webui/js/common/securityHint.js:10`).

## 4. `esp/` — the AJAX action endpoints (command pattern)

### 4.1 Dispatcher design

Each `esp/*.htm` file contains one `if (action == "X") { Call("file.fn::X()"); }` chain. The browser POSTs or GETs `/esp/<module>.htm?sid=<SessionId>&action=<X>[&param=...]`, and the ReGa function writes its response as text, HTML or JS. There is no REST routing and no JSON. Responses are plain text, HTML fragments, or `<script>` snippets evaluated by Prototype (`evalScripts:true`).

| Endpoint file | Backing `.fn` | Dispatch lines | Actions |
|---|---|---|---|
| `esp/devices.htm` | `devices.fn` (238 lines) | `devices.htm:1-13` | setReadyConfig, setHandling, setVisible, setProto |
| `esp/rooms.htm` | `rooms.fn` (96) | `rooms.htm:1-22` | changeRoomName, createRoomRetId, deleteRoom, changeRoomColor/Comment/Symbol, buildRoomOverlay |
| `esp/functions.htm` | `functions.fn` (1324) | `functions.htm:1-23` | ReceiptAlarm, change/create/delete Function*, buildFuncOverlay |
| `esp/system.htm` | `system.fn` (1616) | `system.htm:1-39` | UI refresh (`UpdateUI`), filters (`saveSFilter`, `saveModeFilter`, `saveIfaceFilter`, `checkFilter`, `clearFilter`), naming (`saveName`, `saveDesc`, `checkName`, `getChnNameById`), system variables (`saveSysVar`, `AddSysVarAndBuildTable`, `UserDeleteSysVarBuildTable`, `BuildUserSvTable`, `ShowInternalSystemVars`), datapoint flags (`saveDpProto`, `saveDpVisibility`, `saveDpInternal`, `setDpState`), time modules (`saveTimeModule`), users (`saveUser`, `saveUserPwd`, `deleteUser`, `setAutoLogin`), misc (`SyntaxCheck`, `DeleteObject`, `ClearHistoryData`, `SetScreenSize`, `AddToTempView1/2/3`, `buildPropTable`, `CreateDPSelectBox`, `getLastTimeOfChn`, `TestRunning`, `keepAlive`, `ShowInternalDeviceChannels`) |
| `esp/side.htm` | `side.fn` (220), `side.inc` (1031) | `side.htm:1-12` | SetDP, SetChannel, SetParam, SetValue, SetValueType, SetValueAndType, SetValueAndDP, SetValueParam, SetValueParamType, SetScript, ReloadSiDe |
| `esp/sico.htm` | `sico.fn` (310), `sico.inc` (446) | `sico.htm:1-11` | SetOperatorType, SetLeftValType, SetConditionType2, SetChannel, SetTimeModule, SetLeftValue, SetRightValue, SetLeftAndRightValue, SetValueRange, ReloadSiCo |
| `esp/channels.htm` | `channels.fn` (780) | `channels.htm:1-17` | Test, setReadyConfig/Handling/Visible/Proto/TransMode, chnToRoom, chnToFunc, showOverlay, addChnsToID, delChnFromID, delChnFromAllRooms/Functions, saveDisplayValues, dimmerOldVal, updateGroupTrans |
| `esp/favorites.htm` | `favorites.fn` (484) | `favorites.htm:1-16` | AddToStatus, RemoveFromStatus, FavColumnCount/Align, FavNamePosition, CopyToNew, AddSeparator, SaveFavoriteList, MovePosition, Add/Remove/Set/NewFavoriteList, AddToList, RemoveFromList |
| `esp/programs.htm` | `programs.fn` (1359) | `programs.htm:3-36` | SetBreakOnRestart, SetActive, SetVisible, SetOperate, ProgramUpdate, LoadProgramListXML, DeleteProgram, RestoreProgram, CopyToNewProgram, SetProgram, NewProgram, ShowNonVisiblePrograms, LoadRule, ReloadRule, Add/DeleteCondition, Add/DeleteSingleCondition, Add/DeleteSingleDestination, AddSubRule*, AddNewElseRule, DeleteSubRule, SetOperatorType, SetVisibility |
| `esp/datapointconfigurator.htm` | `datapointconfigurator.fn` (1935) | `datapointconfigurator.htm:1-2` | dcCreate |

Each `.htm` under `esp/` is only its own dispatch table. `esp/system.fn` has 45 functions.

Not in a dispatch table but present: `esp/TimeStamp.fn` (89 lines, timestamp formatting helpers, referenced 13 times), `esp/rule.inc` (167).

### 4.2 Typical call shapes (from the JS side)

- Periodic refresh: `iseRefresher` POSTs `/esp/system.htm?sid=<SID>&action=UpdateUI` with a ReGa-source body that defines `channels` and `timestamps` (`www_source/ise/js/iseRefresher.js:32-44`). `postBody: ReGa.encode(pb)` means the request body is itself ReGa source (for example `string channels = "..."; string timestamps = "...";`). ReGa executes it first and the dispatched function then reads those globals. The response is a `<script>` evaluated with `Ajax.Updater("dummy", url, ...)`.
- `UpdateUI` emits `setTime("HH:MM")`, `setDate(...)`, `resetReGaSaveButton()` and alarm lists (`esp/system.fn:293-340`). It guards on `oUser.UserLevel() != iulNone` (`:299`).
- Channel load: `Ajax.Updater("dummy", "/pages/tabs/statusviews/channelBody.htm?sid=" + SessionId, {postBody: ReGa.encode(pb)})` with `system.SetSessionVar('sessionIdx', ...)` inside the posted script (`www_source/ise/js/channelLoader.js:31-49,74-91`).
- Widget handlers post to `/esp/channels.htm?sid=` (`www_source/ise/js/iseButtonsDimmer.js:160-180`).
- Per-device popups: `/pages/msg/asir_setAlarm.htm?sid=` (`iseAlarmSirenHMIP.js:68-71`) and `/pages/msg/setRGBWController.htm` (`iseRGBWController.js:41-44`).
- The count of JS files in `www_source/ise/js` calling `ReGa.encode`: grep returned `channelPopupLoader.js`, `channelLoader.js`, `iseButtonsDimmer.js` and others in a head-limited listing. The definition of `ReGa.encode` was not located (see gaps).

### 4.3 Device-control widgets: `esp/controls/*.fn` (55 files)

One file per HM/HmIP channel type. They generate the status-and-control widget markup for a channel. Examples: `switch.fn`, `dimmer.fn` (407), `blind.fn` (942), `heating_control.fn` (732), `powermeter.fn` (2020), `universal_light_receiver.fn` (1062), `weather_sensor.fn` (658), `door_opener.fn` (513), `rgbw.fn`, `thermostat.fn`, `smokedetector.fn`, `climate_transceiver.fn`, `rc19_display.fn`, `hmipw_identification.fn`.
- Pattern: `function ::CreateXxx()` reads `chnId`/`cObj`/`iStatusOnly` globals and writes `<td>`/`<div class='ControlBtnOff CLASS0xxxx'>` plus a `<script>` that instantiates a client JS widget class (`iseButtonsSwitch`, and others) with datapoint IDs. See `esp/controls/switch.fn:1-31`.
- Dispatch by channel `HssType`/label happens in the status-view loader files (not read; `channelBody.htm` is missing from this module).
- Widget JS classes live in `www_source/ise/js/*.js` (outside this module).

### 4.4 `xml-api/` — external data API (XML)

Server-side XML endpoints, intended for third-party clients (no consumer was found in `www_source` JS by grep; used by external XML-API add-ons, not verified).

| File | Output | Min. level |
|---|---|---|
| `xml-api/devicelist.xml` (94) | `<deviceList><device name address ise_id interface device_type ready_config>` with channels and datapoints | `iulGuest` (`:12-14`) |
| `xml-api/functionlist.xml`, `roomlist.xml` (45 each) | functions and rooms | not read |
| `xml-api/newdevicelist.xml` (93) | device inbox | not read |
| `xml-api/session.fn` (71) | `GetUserId()`, `GetUPL()`, `checkRequest()` (uses globals `request`, `level`; returns an empty XML root and `quit` if `level > upl`) | `session.fn:20-72` |
| `xml-api/cache.fn` (153) | ETag and `If-None-Match` handling: `dom.GetTimestamp(key)` becomes the ETag, 304 on match, otherwise `web.TryRespondFromCache(key_cache, ver)`. Keys: `devlist`, `funclist`, `roomlist` with `*_cache`. Newdevice list is uncached | `cache.fn:1-46` |
| `xml-api/timestamp.fn` (60) | timestamp helper | not read |
| `xml/pda_update.xml`, `xml/test.xml` | static XML (14-15 lines) | not read |

`Invalidate{Room,Function,Device}List` is called after mutations (`esp/rooms.fn:5,22,38`), so cache invalidation is coupled to the writer functions.

## 5. Main UI sections (mapping to files)

- **Devices**
  - Control view: `pages/tabs/control/devices.htm`, `hdevichannels.htm`.
  - Admin view: `admin/views/newdevices.htm` (device inbox, 2773 lines), `newDeviceLoader.htm`, `newdevicechannels*.htm`.
  - Actions: `esp/devices.fn`, `esp/channels.fn`, `esp/controls/*.fn`.
  - The device list filters `devs.Visible() && devs.ReadyConfig() && devs.HssType()` and excludes `operateGroupOnly` and the gateway types `VIR-OL-GTW` and `VIR-HUE-GTW` (`control/devices.htm:81-87`).
- **Rooms**: `control/rooms.htm`, `hroomchannels.htm`, `admin/views/rooms.htm`, `roomchannels.htm`, `esp/rooms.fn`, `xml-api/roomlist.xml`. A room is an `OT_ENUM` of `etRoom` under `ID_ROOMS` (`esp/rooms.fn:14-25`).
- **Functions (Gewerke)**: `control/functions.htm`, `hfuncchannels.htm`, `control/function.fn`, `admin/views/functions.htm` (831), `functionchannels.htm`, `esp/functions.fn`, `xml-api/functionlist.xml`.
- **Programs**: `control/programs.htm`, `admin/views/programs.htm` (1161), `programlist.htm`, `admin/linkprog.htm`, `esp/programs.fn` and `esp/rule.inc` (rule builder), `esp/side.fn`/`sico.fn` (the "then"/"if" halves).
- **System variables**: `control/sysvars.htm`, `admin/systemvars.htm` (470), `admin/msg/newSysVar.htm`, dialogs `msg/sysVars*.htm` and `delSysVariable.htm`, and the system.fn actions listed above.
- **Favorites**: `startpage.htm`, `favorites.htm`, `favViewer.htm`, `user/favOverview.htm`, `user/newFav.htm`, `esp/favorites.fn`.
- **Settings / admin**: `admin/systemconfig.htm` (hub), `admin/userAdministration.htm`, `msg/userAccountConfigAdmin.htm`, `msg/autoLoginConfig.htm`, `msg/securityFirstStart_*.htm`, and the time module `admin/msg/timemodule.htm`.
- **System protocol and alarm / service messages**: `control/systemProtocol*.htm`, `statusviews/alarmMessages.htm`, `serviceMessages.htm`.

## 6. Session handling and authorization

- Authentication is done by the ReGa web server, not by these files. `system.LoginPage("/login.htm")` in `index.htm:11` redirects when no valid session exists. The `login.htm` form submits `tbUsername`/`tbPassword` to the same URL.
- The session id is passed on URLs as `?sid=<SessionId>`. `pages/index.htm` is entered as `pages/index.htm?sid=<id>[&client=<dwcPC>]` (`index.htm:87-90,99`). The JS global `SessionId` is used in every AJAX URL (examples in 4.2). Emitted into the page by `getSessionId()` (`pages/index.htm:181-183`). The ReGa global `sessionId` carries it for server code.
- Session record: `system.GetSessionVarStr(sessionId)` yields `"<userId>;<upl>"`, parsed with `StrValueByIndex(";", n)` (`xml-api/session.fn:23-27,45-50`, `pages/index.htm:162-168`).
- Session variables (counts from grep over `rega/www`): `sessionLS` 43 (list sort key), `sessionUserID` 53, `sessionTAB` 21 and `sessionTAB1` 22 (current tab / sub-selection, to restore the view after reload, for example `control/rooms.htm:3-6,82`), `sessionSISV` 8 (show internal system variables, toggled by `ShowInternalSystemVars`, `esp/system.fn:1561-1569`), `sessionCTV` 8, `sessionUiDataId` 5, `sessionSIDC` 5, `sessionORIGFAVID` 4, `sessionFAVID` 4, `sessionFAV` 3, `sessionSW` 1 (screen size, set by `SetScreenSize`, `esp/system.fn:29-36`), `sessionIdx` 1.
- Privilege model:
  - Server-side levels `iulNone`/`iulGuest`/`iulUser`/`iulAdmin`. Client constants `UPL_NONE=0`, `UPL_GUEST=1`, `UPL_USER=2`, `UPL_ADMIN=8` (`pages/index.htm:105-108`). `getUPL()`/`hasUPL()` are emitted at `:158-179`.
  - Per-channel access: `oCH.UserAccessRights(iulOtherThanAdmin) == iarFullAccess` (`control/devices.htm:70`).
  - XML API: `checkRequest()` (`xml-api/session.fn:60-72`).
  - Admin-only mutation example: `setAutoLogin` checks `oUser.UserLevel() == iulAdmin` (`esp/system.fn:1439-1448`). User ID 1004 is forced to admin (`:1135-1137`).
  - Many `esp/*.fn` actions do not appear to check privileges themselves. Enforcement is the UI hiding the controls (spot-checked in `rooms.fn` and `system.fn` heads; not an exhaustive audit).
- `keepAlive` is an empty function used as a session heartbeat (`esp/system.fn:1557-1559`).
- `NoAutoLogin` and `UsersDefaultLogin(dwcPC|dwcPDA)` implement auto-login per client type (`index.htm:93-100`, `esp/system.fn:1439-1448`).

## 7. Coupling: markup, JS and ReGa

- **Three-way coupling in one file.** ReGa emits HTML that includes inline `onclick` calls to global JS functions (`loadChannels`, `updateTable`, `setSFilter`, `picDivShow`, `InitGD`, `Draw`, `CreatePopup`) and inline `<script>` that mutates shared globals (`arItems`, `jg_0`, `Cursor`). Example: `control/devices.htm:44-115`.
- **Presentation class names are generated.** About 200 distinct `CLASS0nnnn` class names appear in `rega/www` (grep count 200). They are numbered per-file inline-style classes, resolved by `/webui/style.cgi` (built from `www_source/ise/style`). The numbers correspond to the file (for example `CLASS039xx` in `control/devices.htm`, `CLASS025xx` in `controls/switch.fn`) and are also hard-wired into ReGa-emitted strings.
- **Layout is table-based** (`<table class="StdTable">`, `<td class="StdTableBtn">`, `colgroup` percentages) and uses fixed pixel sizes (80px rows, 1024px viewport `<meta name="viewport" content="width=1024">`, `pages/index.htm:7`). JS computes heights (`$("content").style.height`, `recalcDivs`, `login.htm:48-67`).
- **DOM id conventions are an implicit contract**, for example `devices<id>`, `<id>name`, `<id>pic`, `picDiv<id>`, `chnList`, `contentLeft`, `dummy`, `idCss`, `statusRow1/2`, `btnChns`, `tblStatus` (and `#maintable`, `#content`, `#navbar`, `#footer` on login). The JS in `www_source` looks these up. IDs are partly duplicated in markup (for example `btnChns` is used twice in `control.htm:23,54`).
- **Dual JS libraries.** Prototype (`$()`, `Ajax.*`, `Class.create`) and jQuery coexist, plus knockout, jQuery UI, scriptaculous and Bootstrap 5 bundle. The Bootstrap 5 bundle and `hmBootstrap.css` were just added (see recent commits "webui: add the Bootstrap 5 framework"). `pages/index.htm:27,70` loads them, but the fragment markup still uses the legacy table/class idiom.
- **i18n coupling.** `${key}` tokens are replaced by `translatePage('#sel')`/`translateKey`/`translateAttribute` (`login.htm:193-195`). Some ReGa strings embed `${key}`, which means translation must run after fragment injection (class `j_translate` marks translatable containers, for example `control.htm:12`, `control/devices.htm:24`).
- **Server-side data to JS via string concatenation.** There is no encoding layer. Names are placed into JS strings with single or double quotes (`login.htm:110`, `control/devices.htm:95-112`). A device name containing quotes could break the emitted JS (observation about existing code).
- **Return-value protocol.** AJAX actions return bare strings that callers parse. For example `createRoomRetId` returns the new id or `-1` (`esp/rooms.fn:20-37`). Other actions return HTML or JS to eval. Callers depend on these contracts.
- **Business logic lives in views.** For example the device visibility filter (`control/devices.htm:81-87`), the favorites bootstrap (`pages/index.htm:10`), and `UpdateUI` collecting alarm state (`esp/system.fn:293+`).

## 8. `www/ise` — static asset tree

Totals: 260 files, with type counts 227 png, 17 gif, 9 jpg, 2 ico, 1 htm, 1 cgi, 1 db, 1 `.gi` and 1 `.j_`. Non-image files:

| File | Content |
|---|---|
| `www/ise/checkrega.cgi` | Tcl CGI. Loads `tclrega.so`, runs `rega_script {Write("OK");}`, returns text. It is a ReGa liveness probe (`checkrega.cgi:1-14`). |
| `www/ise/htm/header.htm` (about 60 lines) | HTML header table fragment: logo `homematic_logo_small.png`, `#UserName`, `#PagePath`, `#menuDbg` with `CLASS111xx` classes (`header.htm:1-20`). |
| `www/ise/js/functions.j_` | Stale copy of `functions.js`. Its header says "TODO Check if this file is still necessary - replaced by /www_source/ise/js/functions.js". Holds constants such as `iseDOM_BuildLabel="R1.00.0381.0100"`, `dbg=false`, `rfr=true`, `ID_ROOMS=101`, `ID_FUNCTIONS=151`, `ID_FAVORITES=201` (`functions.j_:1-30`). |
| `www/ise/img/anim_bargraph.gi` | Same name as the existing `.gif`, with a `.gi` extension (likely a typo copy). |
| `www/ise/img/color_picker_img/Thumbs.db` | Windows thumbnail cache, an artifact that should not ship. |

Image/icon inventory by category (counts from `find` per directory; names from `ls`):

| Directory | Files | Contents |
|---|---|---|
| `img/` (root) | 59 | Branding: `homematic_logo_small(.png/_gray/_red)`, `hm-logo.png`, `favicon.ico`, `_favicon.ico`, `homematic90Deg.png`, `homematicIP90Deg.png`, `homematicWired90Deg.png`. Underscore-prefixed `_hm-logo.png`, `_homematic_logo_small*.png/.jpg` look like originals or backups. UI chrome: `add/minus/plus/delete/enter/up/down.png`, `arrow_up/down.gif`, `btn_fav*.png`, `btn_press.png`, `btn_no_press.png`, `gradientButton25px/50px.png`, `help.png`, `cogs3.png`, `pinion_gears_32.png`, `notepad.png`, `mobile_device.png`, `loading.gif`, `ajaxload*.gif`, `tr50.gif`. Status: `dialog-error/information/warning/questionmark_80px.png`, `warning.png`, `usable.png`, `visible.png`, `logged.png`. Weather and air quality: `AQI_EU.png`, `AQI_US.png`, `cc_sun.png`, `cc_moon.png`, `cc_delete.png`. Device and promo images: `hm-sen-ep.png`, `hm-sen-wa-od.png`, `shutterCtrl.png`, `proglink1_small.jpg`, `proglink2_small.jpg`. |
| `img/char/24` | 10 | digits `0.png`..`9.png` (bitmap digits for displays) |
| `img/color_picker_img` | 10 | color picker assets plus `Thumbs.db` |
| `img/danger`, `door`, `window`, `lock`, `dot` | 2, 2, 4, 2, 4 | state icons: door `open/closed`, window `circle/closed/open_h/open_v`, status dots `green/grey/red/yellow`, danger and lock states |
| `img/slider` | 3 | slider handles |
| `img/rc19` | 12 | RC19 display icons: arrow, bell, clock, door, lamp, open, phone, scene, shutter, switch, `disp_enter` |
| `img/icons_hm_dis_wm55/24,32` | 12 + 12 | HM-Dis-WM55 display icons |
| `img/icons_hm_dis_ep_wm55/24` | 9 | HM-Dis-EP-WM55 display icons |
| `img/icons_hm_lc_dw` | 24 | LC-Dw dim/color icons |
| `img/icons_hmip_wrcd/24` | 31 | HmIP-WRCD display icons |
| `img/icons_hmipw_wgd` (+ `weather/`) | 10 + 34 | HmIPW-WGD display icons and weather glyphs |
| `img/icons_lan_gateways/48` | 5 | LAN gateway icons |
| `img/osramLightify`, `img/philipsHue` | 1 + 1 | third-party gateway icons |
| `img/lang/de`, `img/lang/en` | 5 + 5 | localized device images (`hm-sen-ep.png`, `hm-sen-sir-wm_800.png`, `hm-sen-wa-od.png`, `proglink1/2_small.jpg`) |

Image references use absolute paths `/ise/img/...` in ReGa pages (`login.htm:76,80`, `pages/index.htm:14,213`, `logout.htm:44,47`). Device-type pictures (`Draw(jg, label, size)`) are not in this tree. They are resolved by `InitGD`/`Draw` in `www_source` JS. The path of those images was not located.

## 9. Related external dependencies of these pages

- Other CGIs the pages call: `/config/help.cgi` (`login.htm:189`), `/config/ic_linkpeerlist.cgi` and others in `www/config` (outside scope). `/webui/style.cgi` produces the CSS (`login.htm:7`, `pages/index.htm:71`).
- Client script dependencies (all `/webui/js/...`): `lang/loadTextResource.js`, `lang/translate.js`, `common/viewmodels.js`, `webui.js`, plus `/ise/js` via the bundle (not individually loaded by these files).
- `$(VERSION)` token in `pages/index.htm:80` is substituted by the build.

## 10. What a UI renovation must preserve

1. **Entry contract**: `index.htm` must keep `system.LoginPage("/login.htm")` and the `?sid=` + `&client=` hand-off to `pages/index.htm`. The login form field names (`tbUsernameShow`, `tbUsername`, `tbPassword`) and POST-to-self are consumed by the ReGa web server (`login.htm:123-144`). `NoAutoLogin` / `UsersDefaultLogin` semantics too.
2. **Session handling**: `SessionId` on every request URL, plus the `sessionTAB`, `sessionTAB1`, `sessionLS` and other session variables used to restore state. `getUPL()`/`hasUPL()`/`userId`/`ul` must remain available to the JS.
3. **The action endpoint protocol**: URLs `/esp/<module>.htm?sid=&action=<name>`, the action names in section 4.1, ReGa-source POST bodies (`ReGa.encode`), and the response formats (bare string, `-1` sentinel, HTML fragment, `<script>` to eval). The `UpdateUI` polling response (`setTime`, `setDate`, alarm handling) is the live-update channel.
4. **The `xml-api/` contract** (`devicelist.xml`, `roomlist.xml`, `functionlist.xml`, `newdevicelist.xml`, ETag/304 caching, `iulGuest` gate). It is public API for add-ons and is independent of the UI.
5. **The ReGa object model access** (`dom.GetObject(ID_*)`, enums, `UserAccessRights`, `ReadyConfig`, `HssType`, `MetaData("operateGroupOnly")`). Visibility rules in `control/devices.htm:81-87` define which devices users can operate.
6. **Per-device-type behavior**: 55 `esp/controls/*.fn` widgets and 41 `msg/*.htm` parameter dialogs are keyed to `HssType`. They encode per-device semantics (datapoint control names like `SWITCH.STATE`, `esp/controls/switch.fn:14`). A renovation needs a full parity matrix for these.
7. **Rule/program editor chain**: `programs.fn` + `side.fn` + `sico.fn` + `rule.inc`, plus the stateful `sessionUiDataId`-style session state. This is the largest stateful server-driven UI.
8. **i18n keys** (`${...}`, `j_translate`, `translateKey`) and the DE/EN(/TR) variants (`securityFirstStart_*`).
9. **Id and class contracts** that `www_source` JS depends on (section 7), and `/ise/img/...` absolute asset paths, including the many device-specific icon sets (section 8).
10. **Encoding**: files are mixed ISO-8859-1 and UTF-8, and the served `Content-Type` meta says `iso-8859-1` (`index.htm:7,14`, `pages/index.htm:12`). Changes must account for this, or ReGa output will garble umlauts.
11. **Fixed viewport/layout assumptions** (`width=1024`, pixel heights, sub-pixel `jsGraphics` drawing for device images). Responsive redesign has to replace the JS-computed layouts in `recalcDivs` and similar.

Risk observations:
- Presentation, data and business logic are intermixed in single files. Replacing only the visuals requires either a template layer that keeps the ReGa output intact, or converting the `esp/` endpoints to structured JSON and rewriting the consumers.
- `esp/` endpoints mostly rely on UI hiding for authorization (see section 6). A new UI must not rely on server-side protection that is not there.
- There is no automated test suite in this module.

## 11. Gaps (not verified)

- Definition of `ReGa.encode` and `WebUI.enter`/`updateContent` internals were not read (they live in `www_source`).
- Missing referenced fragments `statusviews/channelLoader.htm` and `channelBody.htm`.
- Bodies of `programs.fn`, `functions.fn`, `favorites.fn`, `datapointconfigurator.fn`, `newdevices.htm`, `timemodule.htm` and most `msg/*.htm` were not read line by line. Sizes and dispatch names come from `wc` and the dispatcher files.
- `xml-api/{functionlist,roomlist,newdevicelist}.xml`, `timestamp.fn`, `help.htm` and `logout.htm` below line 50 not read.
- External consumers of `xml-api` were not found inside the repo by grep.
