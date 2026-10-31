# WebUI JSON-RPC API and shared Tcl libraries (src/webui/www/api, src/webui/www/tcl)

Scope: the CGI JSON-RPC backend `/api/homematic.cgi`, its method registry `methods.conf`, helper libraries in `api/eq3/`, the 183 method scripts in `api/methods/**`, the legacy `api/backup/*.cgi` scripts, and the shared Tcl libraries in `www/tcl/`. All paths are relative to `src/webui/` unless noted. Source files are ISO-8859-1 encoded (German comments), so use `grep -a` / `iconv -f latin1`.

## 1. Inventory

| Path | Files | Role |
|---|---|---|
| `www/api/homematic.cgi` | 1 (215 lines) | Single JSON-RPC entry point (POST) plus HTML method list (GET) |
| `www/api/methods.conf` | 1 (1292 lines) | Method registry: `LEVEL`, `SCRIPT_FILE`, `METHOD_FILE`, `INFO`, `ARGUMENTS` per method (180 entries) |
| `www/api/eq3/` | 8 | `jsonrpc.tcl` (envelope), `json.tcl` (parser/serializer), `common.tcl` (file/lock helpers), `ipc.tcl` (interface list), `hmscript.tcl` (ReGa bridge), `event.tcl` (event queue), `checksid.hms`, `getupl.hms` |
| `www/api/methods/<ns>/*.tcl` | 183 | One Tcl script per method (`system`, `interface`, `device`, `channel`, `ccu`, `sysvar`, `program`, `room`, `subsection`, `user`, `session`, `event`, `rega`, `bidcos*`, `firewall`, `webui`, `safemode`) |
| `www/api/backup/` | 10 | Legacy CGI endpoints (`login.cgi`, `logout.cgi`, `run-script.cgi`, `links.cgi`, `paramset.cgi`, `common.tcl`; the binfile, tarfile, textfile and version CGIs are small but active (150-567 bytes; binfile.cgi opens a caller-supplied file after only a session_isValid check)) |
| `www/tcl/eq3/` | 2 | New shared libs: `rega.tcl` (40 lines), `session.tcl` (134 lines) |
| `www/tcl/eq3_old/` | 4 | Legacy page-server libs: `common.tcl` (230), `once.tcl` (78), `session.tcl` (912), `user.tcl` (302) |
| `www/tcl/extern/` | 2 | Third-party `cgi.tcl` (2714, Don Libes cgi.tcl) and `tmpl_parser.tcl` (74) |

Deployment symlinks (build time): `CMakeLists.txt:12-25` links `tcl/eq3_old/{common,once,session,user}.tcl` into `/www/` and `/www/config/`, and `tcl/eq3/{rega,session}.tcl` into `/www/api/eq3/` and `/www/pda/eq3/` (CMakeLists.txt:16-19). So the same `session.tcl` is shared by the API and the PDA UI.

JS clients live in `www_source/webui/js`, `www_source/ise/js`, `www_source/config/js` (build scripts such as `www_source/create_webui_js.tcl` exist; the checked-in `www/webui/js` only holds `common`, `extern`, `lang`). The ReGa-served pages are under `rega/www` (`*.htm`, `*.fn`, `esp/`).

## 2. Dispatcher flow (`www/api/homematic.cgi`)

Run as `#!/bin/tclsh` CGI (homematic.cgi:1). Sequence:

1. `central` flag: `true` unless `DOCUMENT_ROOT != "/www/"` (the CfgTool variant) (homematic.cgi:25-30). When not central, `tclrega.so` is not loaded (:37-39) and the privilege check is skipped (:147-149).
2. Load `tclrpc.so` (XML-RPC) (:35), source `eq3/{common,ipc,json,jsonrpc,hmscript,event}.tcl` (:41-46).
3. Build `INTERFACE_LIST` from `ipc_getInterfaces` (:53) and `METHOD_LIST` by loading `methods.conf` as a Tcl array via `file_load` (:55-56). The whole registry is re-read on every request (CGI, no persistence).
4. Level map: `NONE=0, GUEST=1, USER=2, ADMIN=8` (:58-66).
5. POST (:139-157), inside a single `catch`:
   - `jsonrpc_parse [read stdin $env(CONTENT_LENGTH)]` (:141; jsonrpc.tcl:20-36) fills `JSONRPC(METHOD|PARAMS|ID)`.
   - `getMethod` linear-scans the registry; unknown name gives error 401 (:87-95).
   - `array set args $JSONRPC(PARAMS)` (:144) - params must be a JSON object (flattened to a Tcl dict).
   - If central: `checkPrivilegeLevel` (:103-118). If `LEVEL != NONE` it reads `args(_session_id_)`, runs `eq3/getupl.hms` in ReGa (:113) and compares `USER_LEVEL($level) > upl`, else error 400 `access denied ("ADMIN" needed <upl>)` (:114-116). Note the message prints the user's current level number, not the required one's.
   - `checkArguments` (:123-132): every name in `ARGUMENTS` must exist in `args`, else 402 `missing argument (<name>)`. Only presence is checked - no types, no validation.
   - `source api/methods/$method(SCRIPT_FILE)` (:153). The script runs in the CGI's global scope with `args`, `method`, `INTERFACE_LIST`, `central` visible, and ends by calling `jsonrpc_response <json>` (jsonrpc.tcl:72-94) or `jsonrpc_error` (:41-67, calls `exit`).
   - Any uncaught Tcl error: `jsonrpc_error 200 "internal error:\n$errorInfo"` (:155) - leaks Tcl stack traces/paths to the client.
6. GET (:160-215): HTML (iso-8859-1) table of all methods from the registry plus an error-code table. No authentication, so the full method list and argument names are public.

### 2.1 Interface sub-dispatcher (`methods/interface/dispatch.tcl`)

49 of the 53 `Interface.*` methods (the only users of `dispatch.tcl` in methods.conf) set `SCRIPT_FILE interface/dispatch.tcl` plus `METHOD_FILE interface/<name>.tcl` (e.g. methods.conf:34-40). `dispatch.tcl`:
- resolves `args(interface)` through `INTERFACE_LIST`; unknown gives error 500 `unknown interface (<name>)` (dispatch.tcl:158-160), then `source "methods/$method(METHOD_FILE)"` (dispatch.tcl:162; relative path, relies on cwd = `/www/api`).
- `getDeviceDescription` (dispatch.tcl:66) converts XML-RPC device structs to JSON; `checkXmlRpcStatus` (dispatch.tcl:132-148) maps statuses to JSON-RPC errors (see section 4).
- 51 method scripts call `xmlrpc $interface(URL) <method> [list <type> <value>]...` (e.g. interface/deletedevice.tcl:20, interface/adddevice.tcl:15) wrapped as `checkXmlRpcStatus [catch {...}]`.

Interface names come from `/etc/config/InterfacesList.xml` (`ipc_loadInterfacesFromFile`, eq3/ipc.tcl:40-73; result cached in `/var/tmp/api_ipc.cache`, ipc.tcl:20-35); each entry has `PORT URL INFO`. Typical names: `BidCos-RF`, `BidCos-Wired`, `HmIP-RF`, `VirtualDevices`, `CUxD` (names are runtime data, not in repo).

## 3. Request/response contract

Request (`jsonrpc_async`, www_source/webui/js/common/jsonrpc.js:56-76): `POST /api/homematic.cgi`, `Content-Type: application/json`, body `{"version":"1.1","method":"<ns.name>","params":{...}}`. `id` is optional (jsonrpc.tcl:27-29); the response omits `id` when the request had none (:52, :83). `params` must be present as an object (even `{}`), and nearly every non-NONE method needs `_session_id_` inside `params` (not a header or cookie).

Success: `{"id":..,"version":"1.1","result":<json|null>,"error":null}` (jsonrpc.tcl:82-93). Content-Type is `application/json; charset=utf-8`; HTTP status is always 200 (even for errors - the CGI never emits a `Status:` header). Many results are hand-concatenated JSON strings (`append result ",\"firmware\":..."`), so shape is only discoverable from the Tcl.

Error: `{"id":..,"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":<int>,"message":"<text>"}}` (jsonrpc.tcl:56-63).

JSON parser (`eq3/json.tcl:36-215`) is custom Tcl; `json_toString` (:203) escapes strings for output.

## 4. Error codes (homematic.cgi:195-211 and sources)

| Code | Source | Meaning |
|---|---|---|
| 100 | jsonrpc.tcl:25 | invalid request (JSON parse failed) |
| 102 | jsonrpc.tcl:31 | `method` missing. Message text says "params not found in request" (messages for 102/103 are swapped in the code) |
| 103 | jsonrpc.tcl:34 | `params` missing. Message says "method not found in request" |
| 101 | documented (homematic.cgi:199) | `id` missing - never raised (id is optional) |
| 200 | homematic.cgi:155 | internal error, message contains `errorInfo` (documented as "invalid response") |
| 400 | homematic.cgi:115 | privilege level insufficient |
| 401 | homematic.cgi:94 | method not found |
| 402 | homematic.cgi:129 | missing argument |
| 500 | dispatch.tcl:159 | unknown interface |
| 501-507, 599 | dispatch.tcl:140-147 | XML-RPC faults: -1 general, -2 unknown device/channel, -3 unknown paramset, -4 address expected, -5 unknown argument/value, -6 operation not supported, -10 transmission pending (HmIP legacy API); other = 599 |
| 601-604 | dispatch.tcl:136-139 | Tcl catch codes (error/return/break/continue) |
| 501, 503 | session/login.tcl:51,55 | reused with a different meaning: 503 "service not available", 501 "invalid credentials or too many sessions" |
| other 5xx | per method | application specific (documented as `5xx`, homematic.cgi:210) |

The 5xx space is overloaded (login uses 501/503 for credential/service problems while the Interface dispatcher uses them for XML-RPC faults), so a client must key on method + code.

Client handling: `homematic()` (www_source/webui/js/homematic.js:9-27) injects `_session_id_ = getSessionId()` into every call (:13), and `_checkResponse` returns `response.result` or `null` on error with a `// handle errors` stub (:36-47) - errors are effectively swallowed; callers receive `(result, error)` in async mode (:19). Responses are parsed with `eval("(" + text + ")")` (jsonrpc.js:78-90).

## 5. Session / authentication model

- Session id: string of the form `@<10 chars>@` (12 chars total; validated in tcl/eq3/session.tcl:77-79). Generated by `session_generatesid` using Tcl `rand()` with `int(r*61)` over a 62-char alphabet (eq3_old/session.tcl:448-470), i.e. non-cryptographic and 'z' can never occur.
- Login (`Session.login`, methods.conf:783, methods/session/login.tcl): the CGI does a server-side `http::geturl http://127.0.0.1/login.htm` POST with `tbUsername`/`tbPassword` (login.tcl:15,45) and extracts `sid=@...@` from the `Location` redirect header (:54). Returned as a JSON string; the browser stores it itself (no cookie). Same logic in `tcl/eq3/session.tcl:46-65` (`session_login`).
- The standard WebUI does NOT use `Session.login`: it receives the sid from the ReGa-served `login.htm` redirect (`?sid=@..@` in URLs, `eq3_old/session.tcl:123-345`) and `getSessionId()` reads it from the page. `Session.login`/`renew`/`setSessionVar` have no JS caller in the repo (section 8).
- Validation: `eq3/checksid.hms` (`system.GetSessionVarStr(id)` truthy gives `true`) and `eq3/getupl.hms` (user level = field index 1 of the session string `"<uid>;<upl>"`, getupl.hms:24). `checkPrivilegeLevel` calls getupl.hms through ReGa on every protected request (homematic.cgi:113); `Event.subscribe` uses a different path `common/checksid.hms` (event/subscribe.tcl:25, see 6.3).
- Privilege levels (homematic.cgi:58-66): NONE (no session needed), GUEST=1, USER=2, ADMIN=8. Counts in registry: ADMIN 91, GUEST 48, USER 31, NONE 10. A request with a missing/invalid sid gets `upl = 0`, so any LEVEL>=GUEST fails with 400. If `LEVEL != NONE` but `_session_id_` is not listed in `ARGUMENTS` and not sent, `$args(_session_id_)` raises a Tcl error that surfaces as 200 `internal error` (homematic.cgi:110).
- Timeout: `session_timeout 900` seconds (eq3_old/session.tcl:13), reset by hitting `http://127.0.0.1/pages/index.htm?sid=@..@` (`Session.renew`, session/renew.tcl:87; `session_renew`, tcl/eq3/session.tcl:117-121). Most JSON-RPC calls do not themselves extend the session (privilege check only reads the session variable).
- Logout: `Session.logout` (hmscript `system.ClearSessionID`, session/logout.tcl:70). Registry says `NONE` level with arg `_session_id_` (methods.conf:790).
- Sessions are held in ReGa (`system.GetSessionVarStr`) and, for the legacy page server, in a file (`read_sessions/write_sessions`, eq3_old/session.tcl:57-120).
- Non-central (CfgTool) mode: no privilege check at all (homematic.cgi:147).

## 6. Bridges

### 6.1 ReGa bridge (`api/eq3/hmscript.tcl`, `tcl/eq3/rega.tcl`)
- `tclrega.so` supplies `rega_script <hms>` returning a dict containing `STDOUT` (used at hmscript.tcl:119, rega.tcl:35). On any failure the bridge returns `""` silently (hmscript.tcl:119-122, rega.tcl:34-39), so ReGa down is indistinguishable from empty output.
- `hmscript script ?argsVar?` (hmscript.tcl:96-111): prepends `var <name> = "<escaped value>";` for every entry of the `args` array, then runs the script. Argument names are sanitized (`hmscript_sanitizeIdentifier`, :178-184) and values are escaped (`hmscript_escapeString`, :148-157, backslash, quotes, \n \r \t). Type asserts `hmscript_assertFloat/Integer/Boolean` (:159-175) are used by methods that need numeric values. Because every `args` entry (including attacker-supplied extra params) is injected as a script variable, methods that interpolate those into script bodies without asserts are injection-sensitive; `rega.tcl` `rega_escape` (rega.tcl:14-24) has a different escape table (escapes \f \t \r \n as backslash + the raw control char).
- `hmscript_runFromFile` (:132-146) reads `.hms` files relative to cwd (`eq3/getupl.hms`, `eq3/checksid.hms`).
- 71 method scripts use `hmscript`/`rega_script`; they cover SysVar, Program, Room, Subsection, Channel, Device name/visibility, User, WebUI, CCU settings.
- `ReGa.runScript` (methods.conf:476, rega/runscript.tcl:87-89) executes arbitrary HomeMatic script from `params.script` and returns STDOUT as a JSON string (ADMIN). `ReGa.isPresent` (NONE, rega/ispresent.tcl:70) tests `Write('OK')`. `ReGa.getAllDatapoints` returns `["id--type--name--..."]` strings for IDs 0..65534 (rega/getalldatapoints.tcl:18-58) - O(65535) ReGa object lookups per call, no `_session_id_` in its ARGUMENTS.

### 6.2 XML-RPC bridge (`tclrpc.so`, `api/eq3/ipc.tcl`)
- `xmlrpc <url> <method> {type value} ...` is a command from `tclrpc.so`, loaded at homematic.cgi:35. Typed args use `[list string $x]`, `[list int $n]`, `[list bool ..]`, `[list double ..]`.
- URL comes from the `InterfacesList.xml` entry (`PORT URL INFO` list per interface name, ipc.tcl:66). Returns the decoded value; failures are Tcl errors converted by `checkXmlRpcStatus` (dispatch.tcl:132).
- 51 scripts call `xmlrpc` directly. Result shaping is manual Tcl-to-JSON string building.

### 6.3 Event queue (`eq3/event.tcl`, `methods/event/*`)
File-based fan-out, not a socket: `Event.subscribe` creates `/tmp/event/<sid>` and a subscriber record (`EVENT_COUNT`) in `/tmp/event/subscriber.list` under lock `/tmp/event/lock` (event.tcl:10-16; event/subscribe.tcl:32-58, unsubscribe.tcl:13-27). `event_fire type message` appends `{TYPE DATA}` to every subscriber file up to `EVENT_LIMIT=64` queued events each (event.tcl:21-42). Producers in repo: only `event_fire init null` (subscribe.tcl:54) and `event_fire delete "<dev>"` in `rega/bin/hm_deldev:17`; device value changes are NOT delivered here. `Event.poll` returns and clears the file as `[{"type":..,"data":..}]` (poll.tcl:12-34) - non-blocking short poll; JS client: www_source/webui/js/homematic/event.js:24,33,50. Gaps: `event/subscribe.tcl:20-25` checks sid validity via `common/checksid.hms`, but only `api/eq3/checksid.hms` exists on disk (`find` shows only `www/api/eq3/checksid.hms`), so the cleanup of stale subscribers may be a no-op/failure (hmscript returns `""` on failure, which never equals `"true"` and thus unsets every other subscriber - verify at runtime).

## 7. Shared Tcl libraries (`www/tcl`)

| File | Lines | Key procs / purpose |
|---|---|---|
| tcl/eq3/rega.tcl | 40 | `rega_escape` (:14), `rega_exec` (:32) - run ReGa script, return STDOUT or "" |
| tcl/eq3/session.tcl | 134 | `session_login` (:46), `session_isValid` (:74, requires 12-char `@..@` sid), `session_getUserId` (:101), `session_renew` (:117), `session_logout` (:130); talks to `http://127.0.0.1/login.htm` and `/pages/index.htm` (:8-9) |
| tcl/eq3_old/session.tcl | 912 | Legacy page-server session state: sid generation (:448), timeout (:13, :370-420), url/sid redirect helpers (:123-345), `session_requestisvalid(_ise)` (:701, :869), `session_upl` (:683) |
| tcl/eq3_old/user.tcl | 302 | User/permission table helpers (`user_upl`) used by session.tcl |
| tcl/eq3_old/common.tcl, once.tcl | 230, 78 | Shared page helpers for `/www/*.htm` and `/www/config` |
| tcl/extern/cgi.tcl | 2714 | Third-party cgi.tcl (form/cookie/HTML generation) used by CGIs (`cgi_cookie_encode`, CfgTool/cgi.tcl is another copy) |
| tcl/extern/tmpl_parser.tcl | 74 | Template parser for `.htm`/`.fn` pages |
| api/eq3/common.tcl | 150 | `file_load/file_save/file_append` (:59,:39,:49), `lock_tryget/lock_release` (:89,:106), array helpers |
| api/backup/common.tcl | 106 | Duplicate of the helpers for the legacy `.cgi` endpoints (`getInterfaceUrl`, `parseQueryString` :11-60; sources `/www/tcl/eq3/session.tcl` and `rega.tcl` at :4-5) |

Legacy `api/backup/{login,logout,run-script,links,paramset}.cgi` use query-string parameters (`parseQueryString`, backup/common.tcl:48-60) and the same session helpers. They are not referenced by methods.conf; confirm with the web server config whether they are still reachable (not in scope here).

## 8. Method catalogue (all 180 methods, generated from methods.conf)

Columns: `Level` = required privilege (NONE/GUEST/USER/ADMIN); `Params` = `ARGUMENTS` list with `_session_id_` abbreviated to `sid` (the JS wrapper adds it automatically); `Script` = method script under `methods/<namespace-dir>/` (for `Interface.*` etc. the `METHOD_FILE` dispatched via `interface/dispatch.tcl`); `conf` = line in `methods.conf`; `JS use` = number of `homematic("X.y", ...)` call sites and number of distinct client files (www_source, rega/www) quoting the method name (`-` = no client in this repo).

Summary by namespace: Interface 53, CCU 29, User 14, Device 15, Channel 12, SysVar 11, system 7, Room 6, Subsection 6, BidCoS_RF 5, Program 4, Session 4, Event 3, ReGa 3, BidCoS_Wired 2, Firewall 2, WebUI 2, BidCoS 1, SafeMode 1. 133 are referenced by at least one JS client, 47 are not.

| Method | Level | Params | Script | conf | JS use |
|---|---|---|---|---|---|
| `system.describe` | NONE | - | describe.tcl | 1 | - |
| `system.listMethods` | NONE | - | listmethods.tcl | 8 | - |
| `system.methodHelp` | NONE | name | methodhelp.tcl | 15 | - |
| `system.saveObjectModel` | USER | sid | saveobjectmodel.tcl | 21 | 3 calls, 3 files |
| `system.getPositionData` | USER | sid | getpositiondata.tcl | 28 | 1 calls, 1 files |
| `system.getEnergyPrice` | NONE | - | getenergyprice.tcl | 35 | 2 calls, 2 files |
| `system.getTweak` | USER | sid key | gettweak.tcl | 42 | - |
| `Interface.activateLinkParamset` | ADMIN | sid interface address peerAddress longPress | interface/activatelinkparamset.tcl | 49 | - |
| `Interface.addDevice` | ADMIN | sid interface serialNumber | interface/adddevice.tcl | 57 | - |
| `Interface.addLink` | ADMIN | sid interface sender receiver name description | interface/addlink.tcl | 65 | - |
| `Interface.changeKey` | ADMIN | sid interface passphrase | interface/changekey.tcl | 73 | - |
| `Interface.clearConfigCache` | ADMIN | sid interface address | interface/clearconfigcache.tcl | 81 | - |
| `Interface.deleteDevice` | ADMIN | sid interface address flags | interface/deletedevice.tcl | 89 | 2 calls, 2 files |
| `Interface.determineParameter` | ADMIN | sid interface address paramsetKey parameterId | interface/determineparameter.tcl | 97 | - |
| `Interface.getDeviceDescription` | GUEST | sid interface address | interface/getdevicedescription.tcl | 105 | 8 calls, 7 files |
| `Interface.getInstallMode` | ADMIN | sid interface | interface/getinstallmode.tcl | 113 | 1 files |
| `Interface.getKeyMissmatchDevice` | ADMIN | sid interface reset | interface/getkeymissmatchdevice.tcl | 121 | - |
| `Interface.getLinkInfo` | GUEST | sid interface senderAddress receiverAddress | interface/getlinkinfo.tcl | 129 | - |
| `Interface.getLinkPeers` | GUEST | sid interface address | interface/getlinkpeers.tcl | 137 | 2 calls, 2 files |
| `Interface.getLinks` | GUEST | sid interface address flags | interface/getlinks.tcl | 145 | 1 calls, 1 files |
| `Interface.getLogLevel` | GUEST | sid interface | interface/getloglevel.tcl | 153 | - |
| `Interface.getParamset` | GUEST | sid interface address paramsetKey | interface/getparamset.tcl | 161 | 26 calls, 18 files |
| `Interface.getParamsetDescription` | GUEST | sid interface address paramsetKey | interface/getparamsetdescription.tcl | 169 | 2 calls, 2 files |
| `Interface.getParamsetId` | GUEST | sid interface address paramsetType | interface/getparamsetid.tcl | 177 | - |
| `Interface.getMasterValue` | GUEST | sid interface address valueKey | interface/getmastervalue.tcl | 185 | 10 calls, 9 files |
| `Interface.getServiceMessageCount` | GUEST | sid interface | interface/getservicemessagecount.tcl | 193 | 1 calls, 1 files |
| `Interface.getSuppressedServiceMessages` | USER | sid interface channelAddress | interface/getsuppressedservicemessages.tcl | 201 | - |
| `Interface.getValue` | GUEST | sid interface address valueKey | interface/getvalue.tcl | 209 | 17 calls, 7 files |
| `Interface.init` | ADMIN | sid interface url interfaceId | interface/init.tcl | 217 | - |
| `Interface.isPresent` | NONE | interface | interface/ispresent.tcl | 225 | 3 calls, 3 files |
| `Interface.listDevices` | GUEST | sid interface | interface/listdevices.tcl | 233 | 4 calls, 2 files |
| `Interface.listInterfaces` | GUEST | sid | listinterfaces.tcl | 241 | 1 calls, 1 files |
| `Interface.getLGWStatus` | GUEST | sid interface | interface/getlgwstatus.tcl | 248 | 1 calls, 1 files |
| `Interface.getLGWConnectionStatus` | GUEST | sid interface serial | interface/getlgwconnectionstatus.tcl | 256 | 2 calls, 1 files |
| `Interface.listTeams` | GUEST | sid interface | interface/listteams.tcl | 264 | - |
| `Interface.putParamset` | USER | sid interface address paramsetKey set | interface/putparamset.tcl | 272 | 42 calls, 17 files |
| `Interface.putThermParamset` | USER | sid interface address set | interface/putthermparamset.tcl | 280 | 1 calls, 1 files |
| `Interface.refreshDeployedDeviceFirmwareList` | ADMIN | sid interface | interface/refreshDeployedDeviceFirmwareList.tcl | 288 | - |
| `Interface.removeLink` | ADMIN | sid interface sender receiver | interface/removelink.tcl | 296 | - |
| `Interface.reportValueUsage` | ADMIN | sid interface address valueId refCounter | interface/reportvalueusage.tcl | 304 | - |
| `Interface.restoreConfigToDevice` | ADMIN | sid interface address | interface/restoreconfigtodevice.tcl | 312 | - |
| `Interface.rssiInfo` | GUEST | sid interface | interface/rssiinfo.tcl | 320 | - |
| `Interface.searchDevices` | ADMIN | sid interface | interface/searchdevices.tcl | 328 | - |
| `Interface.setInstallModeHMIP` | ADMIN | sid installMode interface on time address key keymode | interface/setinstallmodehmip.tcl | 336 | 4 calls, 1 files |
| `Interface.setLinkInfo` | ADMIN | sid interface sender receiver name description | interface/setlinkinfo.tcl | 344 | - |
| `Interface.setLogLevel` | ADMIN | sid interface level | interface/setloglevel.tcl | 352 | - |
| `Interface.setTeam` | ADMIN | sid inteface channelAddress teamAddress | interface/setteam.tcl | 360 | - |
| `Interface.setTempKey` | ADMIN | sid interface passphrase | interface/settempkey.tcl | 368 | - |
| `Interface.setValue` | GUEST | sid interface address valueKey type value | interface/setvalue.tcl | 376 | 5 calls, 1 files |
| `Interface.searchDaliDevices` | GUEST | sid interface address valueKey type value | interface/searchdalidevices.tcl | 384 | 1 calls, 1 files |
| `Interface.suppressServiceMessages` | ADMIN | sid interface channelAddress parameterId suppress | interface/suppressservicemessages.tcl | 392 | 3 calls, 3 files |
| `Interface.updateFirmware` | ADMIN | sid interface device | interface/updatefirmware.tcl | 400 | - |
| `Interface.changeDevice` | ADMIN | sid interface addressNewDevice addressOldDevice | interface/changedevice.tcl | 408 | 1 calls, 1 files |
| `Interface.listBidcosInterfaces` | USER | sid interface | interface/listbidcosinterfaces.tcl | 416 | 8 calls, 3 files |
| `Interface.setBidcosInterface` | ADMIN | sid interface deviceId interfaceId roaming | interface/setbidcosinterface.tcl | 424 | 1 calls, 1 files |
| `Interface.setMetadata` | ADMIN | sid objectId dataId value | setmetadata.tcl | 432 | 154 calls, 54 files |
| `Interface.getMetadata` | GUEST | sid objectId dataId | getmetadata.tcl | 439 | 45 calls, 19 files |
| `Interface.setMetadata_crRFD` | ADMIN | sid interface objectId dataId value | interface/setmetadata_crRFD.tcl | 446 | 6 calls, 4 files |
| `Interface.getMetadata_crRFD` | GUEST | sid interface objectId dataId | interface/getmetadata_crRFD.tcl | 454 | 2 calls, 1 files |
| `Interface.removeMetadata` | ADMIN | sid objectId dataId | removemetadata.tcl | 462 | 1 calls, 1 files |
| `ReGa.isPresent` | NONE | - | ispresent.tcl | 469 | 2 calls, 2 files |
| `ReGa.runScript` | ADMIN | sid script | runscript.tcl | 476 | 15 calls, 2 files |
| `ReGa.getAllDatapoints` | ADMIN | - | getalldatapoints.tcl | 483 | 1 calls, 1 files |
| `Device.getNewDeviceCount` | GUEST | sid | getnewdevicecount.tcl | 490 | - |
| `Device.listAll` | GUEST | sid | listall.tcl | 497 | 1 calls, 1 files |
| `Device.listAllDetail` | GUEST | sid | listalldetail.tcl | 503 | 1 calls, 1 files |
| `Device.get` | GUEST | sid id | get.tcl | 510 | 9 calls, 9 files |
| `Device.setName` | ADMIN | sid id name | setname.tcl | 517 | 2 calls, 2 files |
| `Device.getReGaIDByAddress` | ADMIN | sid address | getregaidbyaddress.tcl | 524 | 1 calls, 1 files |
| `Device.getRFAddressByAddress` | ADMIN | sid address | getrfaddressbyaddress.tcl | 531 | 2 calls, 2 files |
| `Device.getRFAddressOfAllDevices` | ADMIN | sid | getrfaddressofalldevices.tcl | 538 | 1 calls, 1 files |
| `Device.hasLinksOrPrograms` | ADMIN | sid id | haslinksorprograms.tcl | 545 | 1 calls, 1 files |
| `Device.hasPrograms` | ADMIN | sid id | hasprograms.tcl | 553 | 3 calls, 2 files |
| `Device.listProgramIds` | GUEST | sid id | listprogramids.tcl | 560 | 1 calls, 1 files |
| `Device.setOperateGroupOnly` | ADMIN | sid id mode | setoperategrouponly.tcl | 567 | - |
| `Device.startComTest` | GUEST | sid id | startcomtest.tcl | 574 | 1 calls, 1 files |
| `Device.pollComTest` | GUEST | sid id testId | pollcomtest.tcl | 581 | 1 files |
| `Device.setVisibility` | ADMIN | sid id isVisible | setvisibility.tcl | 588 | 2 calls, 2 files |
| `Event.subscribe` | GUEST | sid | subscribe.tcl | 595 | 1 calls, 1 files |
| `Event.unsubscribe` | GUEST | sid | unsubscribe.tcl | 602 | 1 calls, 1 files |
| `Event.poll` | GUEST | sid | poll.tcl | 609 | 1 calls, 1 files |
| `Room.listAll` | GUEST | sid | listall.tcl | 616 | - |
| `Room.getAll` | GUEST | sid | getall.tcl | 623 | 1 calls, 1 files |
| `Room.get` | GUEST | sid  id | get.tcl | 630 | 1 calls, 1 files |
| `Room.listProgramIds` | GUEST | sid id | listprogramids.tcl | 637 | 1 calls, 1 files |
| `Room.addChannel` | ADMIN | sid id channelId | addchannel.tcl | 644 | 1 calls, 1 files |
| `Room.removeChannel` | ADMIN | sid id channelId | removechannel.tcl | 651 | 1 calls, 1 files |
| `Subsection.listAll` | GUEST | sid | listall.tcl | 658 | - |
| `Subsection.getAll` | GUEST | sid | getall.tcl | 665 | 1 calls, 1 files |
| `Subsection.get` | GUEST | sid id | get.tcl | 672 | 1 calls, 1 files |
| `Subsection.listProgramIds` | GUEST | sid id | listprogramids.tcl | 679 | 1 calls, 1 files |
| `Subsection.addChannel` | ADMIN | sid id channelId | addchannel.tcl | 686 | 1 calls, 1 files |
| `Subsection.removeChannel` | ADMIN | sid id channelId | removechannel.tcl | 693 | 1 calls, 1 files |
| `Channel.listProgramIds` | GUEST | sid id | listprogramids.tcl | 700 | 3 calls, 3 files |
| `Channel.hasProgramIds` | GUEST | sid id | hasprogramids.tcl | 707 | 2 calls, 2 files |
| `Channel.setName` | ADMIN | sid id | setname.tcl | 714 | 2 calls, 2 files |
| `Channel.getName` | ADMIN | sid address | getname.tcl | 721 | - |
| `Channel.getValue` | ADMIN | sid id | getvalue.tcl | 727 | 1 calls, 1 files |
| `Channel.getChannelType` | ADMIN | sid id | getchanneltype.tcl | 734 | 2 calls, 1 files |
| `Channel.setUsability` | ADMIN | sid id isUsable | setusability.tcl | 741 | 1 calls, 1 files |
| `Channel.setVisibility` | ADMIN | sid id isVisible | setvisibility.tcl | 748 | 1 calls, 1 files |
| `Channel.setLogging` | ADMIN | sid id isLogged | setlogging.tcl | 755 | 1 calls, 1 files |
| `Channel.setMode` | ADMIN | sid id | setmode.tcl | 762 | 1 calls, 1 files |
| `Channel.startComTest` | GUEST | sid id | startcomtest.tcl | 769 | 1 calls, 1 files |
| `Channel.pollComTest` | GUEST | sid id testId | pollcomtest.tcl | 776 | 1 files |
| `Session.login` | NONE | username password | login.tcl | 783 | - |
| `Session.logout` | NONE | sid | logout.tcl | 790 | 1 calls, 1 files |
| `Session.renew` | GUEST | sid | renew.tcl | 797 | - |
| `Session.setSessionVar` | GUEST | var val | setsessionvar.tcl | 804 | - |
| `Program.getAll` | USER | sid | getall.tcl | 811 | - |
| `Program.get` | USER | sid id | get.tcl | 818 | - |
| `Program.execute` | USER | sid id | execute.tcl | 825 | - |
| `Program.deleteProgramByName` | USER | sid name | deleteprogrambyname.tcl | 832 | 14 calls, 1 files |
| `SysVar.getAll` | USER | sid | getall.tcl | 839 | 2 calls, 1 files |
| `SysVar.get` | USER | sid id | get.tcl | 846 | 8 calls, 1 files |
| `SysVar.getValue` | USER | sid id | getvalue.tcl | 853 | 3 calls, 2 files |
| `SysVar.getValueByName` | USER | sid name | getvaluebyname.tcl | 859 | 1 calls, 1 files |
| `SysVar.createBool` | USER | sid name init_val internal chnID | createbool.tcl | 865 | 1 calls, 1 files |
| `SysVar.setBool` | USER | sid name value | setbool.tcl | 871 | 1 calls, 1 files |
| `SysVar.createFloat` | USER | sid name minValue maxValue internal chnID | createfloat.tcl | 877 | 2 calls, 2 files |
| `SysVar.setFloat` | USER | sid name value | setfloat.tcl | 883 | 12 calls, 9 files |
| `SysVar.createEnum` | USER | sid name valList internal chnID | createenum.tcl | 890 | 1 calls, 1 files |
| `SysVar.setEnum` | USER | sid name valueList | setenum.tcl | 897 | 1 calls, 1 files |
| `SysVar.deleteSysVarByName` | USER | sid name | deletesysvarbyname.tcl | 904 | 34 calls, 2 files |
| `BidCoS_RF.getConfigurationRF` | ADMIN | sid | getconfiguration-rf.tcl | 910 | 1 calls, 1 files |
| `BidCoS_RF.setConfigurationRF` | ADMIN | sid interfaces | setconfiguration-rf.tcl | 917 | 1 calls, 1 files |
| `BidCoS_RF.createKeyFile` | ADMIN | sid key | createkeyfile.tcl | 924 | 1 calls, 1 files |
| `BidCoS_RF.isKeySet` | ADMIN | sid | iskeyset.tcl | 931 | 1 calls, 1 files |
| `BidCoS_RF.validateKey` | ADMIN | sid key | validatekey.tcl | 938 | 1 calls, 1 files |
| `Firewall.getConfiguration` | ADMIN | sid | getconfiguration.tcl | 945 | 2 calls, 1 files |
| `Firewall.setConfiguration` | ADMIN | sid services ips userports mode | setconfiguration.tcl | 952 | 2 calls, 1 files |
| `WebUI.getColors` | NONE | - | getcolors.tcl | 959 | - |
| `WebUI.setWebUIColors` | USER | sid key color cpFile | setwebuicolor.tcl | 966 | 1 calls, 1 files |
| `SafeMode.enter` | ADMIN | sid | enter.tcl | 973 | 1 calls, 1 files |
| `CCU.getSecurityLevel` | ADMIN | sid | getsecuritylevel.tcl | 980 | 1 calls, 1 files |
| `CCU.setSecurityLevel` | ADMIN | sid level | setsecuritylevel.tcl | 987 | 1 calls, 1 files |
| `CCU.getSerial` | ADMIN | sid | getserial.tcl | 994 | 4 calls, 3 files |
| `CCU.getHeatingGroupList` | ADMIN | sid | getheatinggrouplist.tcl | 1001 | 1 calls, 1 files |
| `CCU.getAddress` | ADMIN | sid | getaddress.tcl | 1008 | - |
| `CCU.getHmIPAddress` | ADMIN | sid | gethmipaddress.tcl | 1015 | 1 calls, 1 files |
| `CCU.getVersion` | ADMIN | sid | getversion.tcl | 1022 | - |
| `CCU.setSSH` | ADMIN | sid mode | setssh.tcl | 1028 | 2 calls, 1 files |
| `CCU.getSSHState` | ADMIN | sid | getsshstate.tcl | 1034 | 1 calls, 1 files |
| `CCU.setSSHPassword` | ADMIN | sid passwd | setsshpassword.tcl | 1040 | 1 calls, 1 files |
| `CCU.downloadFirmware` | ADMIN | sid | downloadFirmware.tcl | 1047 | 1 calls, 1 files |
| `CCU.setSecurityHint` | USER | sid | setsecurityhint.tcl | 1054 | 3 calls, 3 files |
| `CCU.setUserAckInstallWizard` | GUEST | sid | setuserackinstallwizard.tcl | 1061 | 4 calls, 2 files |
| `CCU.setFirewallConfigured` | ADMIN | sid | setfirewallconfigured.tcl | 1068 | 4 calls, 2 files |
| `CCU.restartSSHDaemon` | ADMIN | sid | restartsshdaemon.tcl | 1075 | 1 calls, 1 files |
| `CCU.restartReGa` | ADMIN | sid | restartReGa.tcl | 1082 | 1 calls, 1 files |
| `CCU.hideStickyUnreach` | ADMIN | sid mode | setstickyunreach.tcl | 1089 | 1 calls, 1 files |
| `CCU.getStickyUnreachState` | ADMIN | sid | getstickyunreachstate.tcl | 1095 | 1 calls, 1 files |
| `CCU.createFile` | GUEST | sid file | createfile.tcl | 1102 | 1 calls, 1 files |
| `CCU.existsFile` | GUEST | sid file | existsfile.tcl | 1109 | 6 calls, 5 files |
| `CCU.removeFieldTestActive` | ADMIN | sid | removeFieldTestActive.tcl | 1116 | 1 calls, 1 files |
| `CCU.getAuthEnabled` | ADMIN | sid | getauthenabled.tcl | 1123 | 1 calls, 1 files |
| `CCU.setAuthEnabled` | ADMIN | sid enabled | setauthenabled.tcl | 1130 | 1 calls, 1 files |
| `CCU.getHttpsRedirectEnabled` | ADMIN | sid | gethttpsredirectenabled.tcl | 1137 | 1 calls, 1 files |
| `CCU.setHttpsRedirectEnabled` | ADMIN | sid enabled | sethttpsredirectenabled.tcl | 1144 | 1 calls, 1 files |
| `CCU.getInfoLedConfig` | ADMIN | sid | getinfoledconfig.tcl | 1151 | - |
| `CCU.setInfoLedConfig` | ADMIN | sid serviceLedOn alarmLedOn | setinfoledconfig.tcl | 1158 | - |
| `CCU.getSNMPEnabled` | ADMIN | sid | getsnmpenabled.tcl | 1165 | 1 calls, 1 files |
| `CCU.setSNMPEnabled` | ADMIN | sid enabled usr pass | setsnmpenabled.tcl | 1172 | 1 calls, 1 files |
| `BidCoS_Wired.getConfigurationWired` | ADMIN | sid | getconfiguration-wired.tcl | 1179 | 1 calls, 1 files |
| `BidCoS_Wired.setConfigurationWired` | ADMIN | sid interfaces | setconfiguration-wired.tcl | 1186 | 1 calls, 1 files |
| `BidCoS.changeLanGatewayKey` | ADMIN | sid lgwclass lgwserial lgwip newkey curkey | changeLanGatewayKey.tcl | 1192 | 1 calls, 1 files |
| `User.getUserFirstName` | USER | sid userID | getuserfirstname.tcl | 1198 | - |
| `User.getUserName` | USER | sid userID | getusername.tcl | 1205 | - |
| `User.hasUserPWD` | USER | sid userID | hasuserpwd.tcl | 1212 | 1 calls, 1 files |
| `User.isNoExpert` | USER | sid id | isnoexpert.tcl | 1219 | - |
| `User.getLanguage` | USER | sid userID | getlanguage.tcl | 1225 | 1 calls, 1 files |
| `User.setLanguage` | USER | sid userName userLang | setlanguage.tcl | 1231 | 1 calls, 1 files |
| `User.getReGaVersion` | NONE | - | getregaversion.tcl | 1238 | 1 calls, 1 files |
| `User.setReGaVersion` | USER | sid ReGaVersion | setregaversion.tcl | 1245 | 1 calls, 1 files |
| `User.existsCertificate` | ADMIN | sid | existscertificate.tcl | 1252 | 1 calls, 1 files |
| `User.deleteCertificate` | ADMIN | sid | deletecertificate.tcl | 1259 | 1 calls, 1 files |
| `User.restartLighttpd` | ADMIN | sid | restartlighttpd.tcl | 1266 | 4 calls, 3 files |
| `User.restartHmIPServer` | ADMIN | sid | restarthmipserver.tcl | 1273 | 2 calls, 1 files |
| `User.stopHmIPServer` | ADMIN | sid | stophmipserver.tcl | 1280 | 1 calls, 1 files |
| `User.startHmIPServer` | ADMIN | sid | starthmipserver.tcl | 1287 | 1 calls, 1 files |

NONE-level (unauthenticated) methods: `system.describe`, `system.listMethods`, `system.methodHelp`, `system.getEnergyPrice`, `Interface.isPresent`, `ReGa.isPresent`, `Session.login`, `Session.logout`, `WebUI.getColors`, `User.getReGaVersion`.

Notable ADMIN-only system-changing methods: `ReGa.runScript` (arbitrary HomeMatic script), `CCU.setSSH`, `CCU.setSSHPassword`, `CCU.restartSSHDaemon`, `CCU.restartReGa`, `CCU.setSecurityLevel`, `CCU.setAuthEnabled`, `CCU.setHttpsRedirectEnabled`, `CCU.downloadFirmware`, `Firewall.get/setConfiguration`, `SafeMode.enter`, `User.restartLighttpd`, `User.{start,stop,restart}HmIPServer`, `User.deleteCertificate`.

Methods whose `ARGUMENTS` omit `_session_id_` although `LEVEL != NONE`: `ReGa.getAllDatapoints` (ADMIN, methods.conf:483) and `Session.setSessionVar` (GUEST, methods.conf:804). The dispatcher reads `args(_session_id_)` regardless (homematic.cgi:110), so a client must still send it; `checkArguments` will not complain if it is missing but `checkPrivilegeLevel` will fail with a 200 internal error.

## 9. Which JS client uses which method

Client plumbing: every call goes through `homematic(method, params, callback)` (www_source/webui/js/homematic.js:9) to `jsonrpc()` (www_source/webui/js/common/jsonrpc.js:43). About 131 distinct `homematic("X.y", ...)` names are found in `www_source/**` and `rega/www/**`. A second client copy exists in `www_source/CfgTool/system.js` (CfgTool, non-central mode). Per-method counts are in the table's `JS use` column; heaviest users (callers were identified by file name from grep, not read in depth):

| Method | Call sites | Main callers (examples) |
|---|---|---|
| `Interface.setMetadata` | 154 (+38 files quoting) | `www_source/ise/js/ise*.js` (iseThermostat, iseBlindShutter, iseHmIPWeeklyProgram, PowerMeter, ...), `www_source/config/js/ic_*.js` |
| `Interface.getMetadata` | 45 | same widget scripts |
| `Interface.putParamset` | 42 | `ise/js/*`, `config/js/ic_deviceparameters.js`, `ic_setprofiles.js` |
| `Interface.getParamset` / `getValue` / `getMasterValue` / `setValue` | 26 / 17 / 10 / 5 | `ise/js/*`, `config/js/ic_common.js`, `webui/js/model/device.js` |
| `SysVar.deleteSysVarByName` | 34 | (callers not inspected) |
| `ReGa.runScript` | 15 | `webui/js/dialog/*`, `pages/startpage/startpage.js`, `webui/js/model/*` |
| `Program.deleteProgramByName` | 14 | (callers not inspected) |
| `SysVar.setFloat`, `SysVar.get`, `Device.get` | 12 / 8 / 9 | `webui/js/model/*`, `ise/js/*` |
| `Event.subscribe/poll/unsubscribe` | 1 each | `webui/js/homematic/event.js:24,33,50` |
| `Firewall.get/setConfiguration`, `CCU.setFirewallConfigured` | 2 / 2 / 4 | `webui/js/dialog/firewallconfigdialog.js`, `firstsecuritydialog.js`, `installWizard.js` |
| `Interface.deleteDevice` | 2 | `webui/js/dialog/deletedevicedialog.js` |
| `Room.*`, `Subsection.*` | 1 each | `webui/js/model/roomlist.js`, `model/subsection.js`, `dialog/channelchooser.js` |
| `system.saveObjectModel` | 3 (+2 files) | `ise/js/functions.js`, `config/js/ic_replacedevice.js` |
| `Session.logout` | 1 | one JS caller |

Methods with NO client in this repo (47): `system.{describe,listMethods,methodHelp,getTweak}`, `Interface.{activateLinkParamset,addDevice,addLink,changeKey,clearConfigCache,determineParameter,getKeyMissmatchDevice,getLinkInfo,getLogLevel,getParamsetId,getSuppressedServiceMessages,init,listTeams,refreshDeployedDeviceFirmwareList,removeLink,reportValueUsage,restoreConfigToDevice,rssiInfo,searchDevices,setLinkInfo,setLogLevel,setTeam,setTempKey,updateFirmware}`, `Device.{getNewDeviceCount,setOperateGroupOnly}`, `Room.listAll`, `Subsection.listAll`, `Channel.getName`, `Session.{login,renew,setSessionVar}`, `Program.{getAll,get,execute}`, `WebUI.getColors`, `CCU.{getAddress,getVersion,getInfoLedConfig,setInfoLedConfig}`, `User.{getUserFirstName,getUserName,isNoExpert}`. Caveat: detection greps quoted literal names; callers that build method names dynamically are invisible. Much of the legacy UI (programs, rooms, devices lists) is also served as server-rendered ReGa pages (`rega/www/esp/*.htm|*.fn`, e.g. `programs.htm`, `rooms.htm`, `devices.htm`) and Tcl-rendered `www/config/*` pages, not through JSON-RPC.

## 10. Gaps and risks for a new SPA frontend

Coverage gaps:
1. No generic read model: there is no "list all devices with channels, values, names, rooms, functions" call. Closest are `Device.get`, `Channel.*`, `Interface.listDevices` and `ReGa.getAllDatapoints` (loops IDs 0..65534, returns strings `id--TYPE--name`, rega/getalldatapoints.tcl:18-58). Otherwise an SPA must use `ReGa.runScript` (ADMIN only) with hand-written HomeMatic script.
2. Programs: only `Program.getAll/get/execute/deleteProgramByName`; no create/edit. Rooms and functions have only `get/getAll/listAll/addChannel/removeChannel/listProgramIds` (no create/rename/delete). Those flows live in server-rendered ReGa pages.
3. Push: `Event.subscribe/poll` only carries `init` and `delete` events (6.3); datapoint changes are not pushed. Polling is non-blocking (no long-poll/SSE/WebSocket), per-subscriber queue limited to 64 events (event.tcl:21).
4. Few or no endpoints for backup/restore, firmware upload, logs, certificate upload. `api/backup/*.cgi` are legacy (login/logout/run-script/links/paramset) or small active file-serving CGIs (the binfile, tarfile, textfile and version CGIs are 150-567 bytes; binfile.cgi serves any caller-named file after only a session check).
5. No batch/multicall: one JSON-RPC call per HTTP request, each spawning a `tclsh` CGI that re-parses the 1292-line `methods.conf` (homematic.cgi:55-56) and, for non-NONE methods, runs a ReGa script to resolve the user level (:113). Chatty UIs will be slow; the legacy client relies on synchronous XHR (`jsonrpc_sync`, jsonrpc.js:90-104).
6. Responses are hand-built strings with undocumented, inconsistent shapes (e.g. `ReGa.getAllDatapoints` returns delimited strings; `ReGa.runScript` returns script STDOUT as one JSON string). Errors are signalled only by code; HTTP status is always 200.
7. Introspection (`system.listMethods/describe/methodHelp`, methods.conf:1-19) exists but the public HTML at `GET /api/homematic.cgi` is the only complete reference (German free text). There is no machine-readable schema for results.

Auth model:
8. The session id is a JSON body param `_session_id_`; no cookie, no `Authorization` header. A SPA must obtain the sid via `Session.login` (credentials relayed through an internal HTTP hop to `127.0.0.1/login.htm`, login.tcl:45). It cannot distinguish "too many sessions" from "invalid credentials" (login.tcl:55), the 900 s timeout (eq3_old/session.tcl:13) is only extended by `Session.renew` (a fake page hit, renew.tcl:87), so the SPA needs its own keep-alive. `Session.login`/`renew` are not used by any current JS client; the legacy UI takes the sid from the `login.htm` redirect.
9. Session ids are short (10 random alnum chars) from Tcl `rand()` (eq3_old/session.tcl:448-470) and the legacy UI carries them in URLs (`?sid=@..@`), so they can leak through logs/referrers.
10. Privilege model is a coarse four-level scale from the ReGa session string `"<uid>;<upl>"` (getupl.hms:24). Non-central (CfgTool) deployments skip authorization entirely (homematic.cgi:147).
11. `GET /api/homematic.cgi` and all NONE methods are unauthenticated, including `Session.logout` (any known sid can be invalidated), `ReGa.isPresent`, `Interface.isPresent`, `system.getEnergyPrice`, `WebUI.getColors`, `User.getReGaVersion`.

CSRF / CORS / transport:
12. CSRF: no token, no `Origin`/`Referer` check, no custom-header requirement. The only barrier is that the sid is in the JSON body. The CGI does not check `Content-Type` (it reads `CONTENT_LENGTH` bytes from stdin, homematic.cgi:141), so a cross-origin "simple" POST (`text/plain`) is accepted if the attacker knows the sid; sids in URLs (legacy UI) weaken this.
13. CORS: no `Access-Control-*` header is emitted anywhere in `src/webui` (grep for `Access-Control`, `csrf`, `SameSite`, `X-Frame` found only the CfgTool `Set-Cookie` helper, CfgTool/cgi.tcl:2366); the CGI emits only `CONTENT-TYPE` (jsonrpc.tcl:48,78). There is no `OPTIONS` handling (a non-POST/GET request produces no output). A SPA on another origin (e.g. a dev server) needs a proxy or web-server changes; the lighttpd config is outside this scope.
14. No `Cache-Control` headers from the CGI; `GET /api/homematic.cgi` (help page) is served without cache directives.
15. A missing `CONTENT_LENGTH` (e.g. chunked request bodies) makes `read stdin $env(CONTENT_LENGTH)` fail; the error is reported as 200 "internal error" or a CGI failure (homematic.cgi:141).
16. Error leakage: any uncaught Tcl error returns `errorInfo` including script paths (homematic.cgi:155).
17. Encoding: requests are converted from utf-8 (jsonrpc.tcl:24) and responses emitted as utf-8 (:48,78), while the source files and the GET help page are ISO-8859-1 (homematic.cgi:161). Round-trip of non-Latin-1 text through ReGa strings is unverified here.
18. Injection surface: `hmscript` injects every request param as a ReGa script variable (hmscript.tcl:96-107) and many scripts use them directly (e.g. `dom.GetObject(name)`, sysvar/deletesysvarbyname.tcl:15). Only `hmscript_escapeString` guards strings; numeric validation exists only where `hmscript_assert*` is called. 26 method scripts use `exec`/pipes (e.g. ccu/createfile.tcl:15 `exec touch $args(file)`, ccu/downloadFirmware.tcl:24 `exec wget ... $url`), so the ADMIN level is the real security boundary. A new API layer should not replicate these patterns.
19. Registry quirks: `Session.logout` is NONE but takes `_session_id_` (methods.conf:790); naming is inconsistent (`system.*` lowercase vs `Interface.*`, `BidCoS_RF.*`); the 400 message prints the user's current level rather than the required one (homematic.cgi:115); documented codes 101/201-203/300 are never raised; messages for 102/103 are swapped (jsonrpc.tcl:31,34).

Minimal client contract derived from the above: `Session.login` gives `sid`; include `_session_id_` in every `params` object (also for `ReGa.getAllDatapoints` and `Session.setSessionVar`); call `Session.renew` at under 900 s intervals; treat HTTP 200 plus `error.code` as the failure channel; use `Event.subscribe`/`Event.poll` only for init/device-deletion events; use `Interface.*` for device data, where the `interface` param selects the XML-RPC backend name from `InterfacesList.xml`.
