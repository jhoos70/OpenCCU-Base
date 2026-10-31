# Flow Model: webui-api

Components (project_structure keys): `dispatcher`, `security-session`, `event-push`, `interface-gateway`,
`rega-model`, `system-admin`, `backup-cgis`, `user-profile`, `schema-harness`, `optional-gateway`.
A step annotated `[A->B]` crosses components; each such pair has an `internal_contracts[]` entry (IC id in brackets)
in `contracts/integration-contracts.json`. All paths are relative to `src/webui/www/api` unless they start with `src/`.
Legend: **as-is** = frozen v1 behaviour with source line; **target** = behaviour after migration (default configuration
keeps v1 shapes, NFR-045). Locked literals refer to blueprint decisions BD-01..BD-14 in `research.md`.

All 18 control flows of `analysis.json` are listed. Flows CF004, CF005, CF012, CF013 and CF015 are flagged
`affected_by_migration: false` in the analysis, but spec.json carries target acceptance for them (SP010-SP012, SP014,
SP036, SP038, SP034), so they are modelled as affected here.

---

## CF001: POST JSON-RPC lifecycle (lighttpd CGI to homematic.cgi)

**Entry**: dispatcher.homematic.cgi top-level POST block at src/webui/www/api/homematic.cgi:139-157
**Affected by migration**: yes
**Related Specs**: SP001, SP002, SP003, SP004, SP005, SP006, SP007, SP013

### Steps

1. lighttpd starts one tclsh per request, CGI env set -> dispatcher.homematic.cgi
   - Spec: SP001 (REQUEST_METHOD must be POST or GET; else empty body, lines 139/160)
2. Decide central vs config-tool mode -> dispatcher.homematic.cgi:25-30
   - as-is: `central=false` when `env(DOCUMENT_ROOT) != "/www/"`; target: `central` is true unless `API_CONFIG(config_tool_mode)=="true"` (SP013, NFR-002)
3. Load bridges and libs: `load tclrpc.so`, `load tclrega.so` (central), source `eq3/{common,ipc,json,jsonrpc,hmscript,event}.tcl` -> dispatcher.homematic.cgi:35-46
4. Build `INTERFACE_LIST` -> interface-gateway.ipc_getInterfaces (eq3/ipc.tcl:25-35) and `METHOD_LIST` -> dispatcher.file_load/methods registry (homematic.cgi:55-56)
   - Spec: SP002 (179 entries; target: parse once per mtime change, NFR-010), SP009 [dispatcher->interface-gateway] (IC004)
5. Target only: read `apiconfig.conf`, generate correlation id (BD-06), apply strict-mode check (Content-Type `application/json` + non-empty `X-Requested-With`; BD-01) before the body is read -> dispatcher.strict_check
   - Decision: strict_mode=false (default) -> skip; strict violation -> error 405 with HTTP 200 (v1)
6. Read exactly `CONTENT_LENGTH` characters and parse -> dispatcher.jsonrpc_parse (eq3/jsonrpc.tcl:20-36)
   - Spec: SP004 (invalid JSON -> 100; `method` missing -> 102 and `params` missing -> 103; message texts swapped in as-is lines 31/34, fixed in target)
7. Look up method -> dispatcher.getMethod (homematic.cgi:87-95); unknown -> `jsonrpc_error 401 "method not found (<name>)"`
8. `array set args $JSONRPC(PARAMS)`; target: whitelist to declared ARGUMENTS and schema-validate types (403 `invalid argument (<name>)`) [dispatcher->security-session] (IC003)
   - Spec: SP006 (NFR-029)
9. If `central`: privilege check -> security-session.checkPrivilegeLevel (homematic.cgi:103-118) [dispatcher->security-session] (IC001)
   - Decision: LEVEL NONE -> skip; else run `eq3/getupl.hms` via `hmscript_runFromFile`; `USER_LEVEL(LEVEL) > upl` -> error 400 `access denied ("<LEVEL>" needed, session level <upl>)` (BD-07)
   - Spec: SP003 (fail-closed: empty/non-integer upl, invalid sid shape -> 400 without calling rega_script)
10. Per-sid throttle (target, OPT-IN: runs only when rate_limit=true, strict_mode=true or on /api/v2; default configuration skips this step) -> dispatcher (SP001 acceptance[13]-[17]: 61st request with one sid within 10 s -> error 429, v1 HTTP 200, v2 HTTP 429 + Retry-After); runs before the privilege lookup (SP003 acceptance[6])
11. Check required arguments -> dispatcher.checkArguments (homematic.cgi:123-132); first missing name -> `402 "missing argument (<name>)"`
12. `source api/methods/<SCRIPT_FILE>` in global scope -> one of interface-gateway, rega-model, system-admin, user-profile, event-push method scripts [dispatcher->interface-gateway] (IC004), [dispatcher->rega-model] (IC005), [dispatcher->system-admin] (IC006), [dispatcher->user-profile] (IC007), [dispatcher->event-push] (IC008)
13. Method script emits the response -> dispatcher.jsonrpc_response (eq3/jsonrpc.tcl:72-94); target: single JSON serializer (SP005)

### Error paths

- Step 6 failure: error 100 `invalid request (...)`, HTTP 200 (v1).
- Step 7 failure: 401; step 9: 400; step 11: 402; step 8 (target): 403 / 402 for `_session_id_` now declared in ARGUMENTS of every non-NONE method.
- Step 12 failure: any Tcl error is caught at homematic.cgi:154-156 and becomes error 200 `internal error (ref: <cid>)`; `errorInfo` goes to syslog only (BD-06). `exit` inside `jsonrpc_error` is not catchable (as-is NFR).
- Timeout: the CGI has no internal timeout; lighttpd/CGI timeout is external (EG-21). Long-running calls: `CCU.downloadFirmware` is bounded to 300 s + 5 s (CF014).

---

## CF002: Authentication and session creation (Session.login, login.htm)

**Entry**: security-session.session_login at src/webui/www/tcl/eq3/session.tcl:46-65 and methods/session/login.tcl:40-58
**Affected by migration**: yes
**Related Specs**: SP031, SP007, SP015, SP014

### Steps

1. Client POSTs `Session.login {username,password}` (LEVEL NONE; no privilege lookup) -> dispatcher (CF001 steps 1-8, 11)
   - Spec: SP015 (one of the 8 unauthenticated methods)
2. Target: per-IP limit for logins (10 per 60 s per REMOTE_ADDR, BD-09; OPT-IN: only when rate_limit=true, strict_mode=true or on /api/v2, default configuration skips it; the 11th Session.login within 60 s -> error 429, SP031 acceptance[10]) -> security-session [dispatcher->security-session] (IC016)
3. `::http::geturl http://127.0.0.1/login.htm -query tbUsername,tbPassword` -> security-session -> ReGaHss web login (methods/session/login.tcl:45)
4. Read `Location` header and status code (lines 46-47)
   - Decision: code contains `503` -> `jsonrpc_error 503 "service not available"` (line 50-52)
   - Decision: no `sid=@([^@]*)@` match -> `jsonrpc_error 501 "invalid credentials or too many sessions"` (lines 54-56)
5. `jsonrpc_response [json_toString $sid]` -> inner id without `@` (line 58); v2 with `cookie_mode=true` also sets cookie `hm_sid` (BD-05)
6. Later calls pass the id in `params._session_id_` (v1) or `X-Session-Id` (v2); validation delegates to ReGa `system.GetSessionVarStr` (CF001 step 9)
   - Spec: SP007 (backup CGIs require `@`+10+`@`, 12 chars; JSON API uses inner id: EG-8 pins this by a contract test)

### Error paths

- login.htm unreachable / HTTP exception at step 3: Tcl error -> error 200 `internal error (ref: <cid>)`.
- v2 mapping: 501 -> HTTP 401, 503 -> HTTP 503 (BD-04). Credentials are never logged.

---

## CF003: Event queue (Event.subscribe / poll / unsubscribe, producers)

**Entry**: event-push.event_fire at src/webui/www/api/eq3/event.tcl:25-43 and methods/event/{subscribe,poll,unsubscribe}.tcl
**Affected by migration**: yes
**Related Specs**: SP008, SP029, SP007

### Steps

1. `Event.subscribe {_session_id_}` passes CF001 -> event-push (methods/event/subscribe.tcl:32)
2. Validate sid shape `^@?[A-Za-z0-9]{1,12}@?$` before building `/tmp/event/<sid>` (SP008, EG-8 gated)
3. `lock_tryget $EVENT_LOCK_FILE` (/tmp/event/lock) -> event-push (subscribe.tcl:35)
   - as-is: lock never effective (returns 1); target: O_EXCL create, stale after `event_lock_stale_seconds`=10, release only by owner (NFR-009)
4. Truncate own queue `file_clear /tmp/event/<id>` (line 37); load `subscriber.list` (line 39)
5. For every other subscriber, validate its sid with `isValid` -> `hmscript_runFromFile "common/checksid.hms"` (subscribe.tcl:25, file does not exist: as-is bug); target path `eq3/checksid.hms` [event-push->security-session] (IC015)
   - Decision: `"true" != isValid` -> drop subscriber and delete its queue file (lines 43-46); as-is every one is dropped
6. Register `subscriberList($id) = {EVENT_COUNT 0}` and `file_save` (lines 49-52); fire `init` -> event-push.event_fire (line 54)
7. `event_fire type data`: for each subscriber with `EVENT_COUNT < 64` append `{TYPE <t> DATA <json>}` to `/tmp/event/<id>`, increment, rewrite the list (event.tcl:25-41) -> producers: `hm_deldev` (src/webui/rega/bin/hm_deldev:17), `init`, target `datapoint.changed` (BD-12, gated by EG-2)
8. `Event.poll` reads and clears `/tmp/event/<id>` (poll.tcl:11-13), target resets `EVENT_COUNT` to 0 (removes the 64-event stall), builds `[{"type":..,"data":..}]` (poll.tcl:18-32)
9. `Event.unsubscribe` deletes the queue file and the list entry
10. v2 `GET /api/v2/events?timeout=25`: long-poll loop in event-push; returns queued events or `[]` after timeout (max 55 s) [dispatcher->event-push] (IC008)

### Error paths

- Lock not obtained at step 3: subscribe returns `false`; poll returns `[]`.
- Invalid sid shape: refuse (`false` / `[]`), no path outside `/tmp/event` is ever built (also in config-tool mode).
- Overflow at 64 pending events: further events are dropped until poll resets the counter (best-effort, NFR-018).
- v2 without valid sid: HTTP 401, queue untouched.

---

## CF004: Backup CGI lifecycle (api/backup/*.cgi)

**Entry**: backup-cgis.startup at src/webui/www/api/backup/common.tcl:100-107
**Affected by migration**: yes (the analysis marks it unaffected; spec SP010-SP012 define the target)
**Related Specs**: SP010, SP011, SP012, SP007

### Steps

1. `<name>.cgi` sources `common.tcl` (loads tclrega.so, tclrpc.so, sources tcl/eq3/session.tcl and rega.tcl; lines 1-5) -> backup-cgis
2. `startup`: `parseQueryString` (lines 48-61; keys/values `decodeUrl`) then `main` (lines 100-105)
3. `main` validates `sid` with `session_isValid` -> security-session.session_isValid (session.tcl:74-92) [backup-cgis->security-session] (IC014)
   - as-is: fail-open check `== "false"` in the CGIs; target: only literal `true` passes (NFR-003)
4. Target (EG-1 resolved 2026-10-20, safe default): require session `upl >= 8` and an exact-match path allow-list (default empty) for binfile/textfile/tarfile; `run-script.cgi` and `login.cgi` credentials in query are the removal candidates for a later release
   - Decision (user, 2026-10-20): the CGIs are reachable via lighttpd (.cgi mapped to tclsh, /api/backup/ not denied) and no callers were found, but they are NOT removed now; restricted mode above is the delivered state, deprecation is announced, removal (404) follows in a later release
5. Endpoint body: `binfile.cgi`/`textfile.cgi` stream a file, `tarfile.cgi` runs `tar` with an argument list and `--`, `links.cgi`/`paramset.cgi` call XML-RPC `getLinks`/`getParamsetDescription`/`getParamset`, `run-script.cgi` posts script text to `rega_exec` (run-script.cgi:15)
6. Errors: `put_error` prints `HTTP/1.0 400 Bad Request` + `text/plain` + message (common.tcl:93-98)

### Error paths

- Invalid session: `error INVALID_SESSION` -> step 6, HTTP 400 text, no data read.
- Path not in allow-list: 400 with generic text (no file existence oracle); no filesystem access happens.
- `session_isValid` internal failure (rega_exec raises): fail-closed, treated as invalid.

---

## CF005: Classic UI per-page authorization (eq3_old/session.tcl)

**Entry**: security-session.session_requestisvalid at src/webui/www/tcl/eq3_old/session.tcl:701-754
**Affected by migration**: yes (analysis: no; only SP014 sid generation changes)
**Related Specs**: SP014, SP007

### Steps

1. Page script sources `tcl/eq3_old/session.tcl` -> `read_sessions` loads `/var/SESSIONS.dat` -> security-session
2. Detect mode: `sid` (ReGa-mirrored) or `icsessionid` (file session)
3. `session_requestisvalid(needed_upl)` -> ReGa path: `session_getsessiondata_ise`, `GetSessionVarStr`, mirror into SESSIONS.dat; file path: 900 s timeout, 10 sessions (SP014, NFR-012)
4. Target change (only one): newly minted file-session ids come from `/dev/urandom`, 10 symbols over 62 characters (~59.5 bits, NFR-043, EG-17); length/format unchanged; USERS.dat plaintext and the mode logic stay (EG-25)
5. Failure renders the stub page and returns a negative code (unchanged)

### Error paths

- Unreadable `/dev/urandom`: session creation fails closed (no fallback to a time-seeded generator); page shows the stub.
- Classic UI must keep working unchanged: no new header, no cookie, no strict mode on this path.

---

## CF006: GET /api/homematic.cgi method help page

**Entry**: dispatcher.homematic.cgi GET block at src/webui/www/api/homematic.cgi:160-215
**Affected by migration**: yes
**Related Specs**: SP015, SP032, SP001

### Steps

1. `REQUEST_METHOD == GET` -> dispatcher.homematic.cgi:160
2. as-is: print HTML table built from `METHOD_LIST` (name, `USER_LEVEL_NAME`, INFO, ARGUMENTS; lines 188-192) and the error-code table (lines 195-211), unauthenticated
3. Target: reduced page without method names (0 method names listed; NFR-044) unless a valid sid is supplied via `sid` query -> [dispatcher->security-session] (IC001 pattern via `session_isValid`, IC002)
4. Full authenticated documentation is `GET /api/v2/schema` (SP032): requires valid sid (GUEST+) and `X-Requested-With`; 401 otherwise; 179 entries `{name, level, info, params, result}`
5. HTML-escape INFO and ARGUMENTS when rendered (SP032)

### Error paths

- Non-GET/POST verb: empty body (line 139/160).
- v2 `/api/v2/schema` with PUT/OPTIONS/HEAD: HTTP 405 `Allow: GET`.

---

## CF007: Interface.* passthrough (dispatch.tcl to rfd/hs485d/HmIPServer)

**Entry**: interface-gateway at src/webui/www/api/methods/interface/dispatch.tcl:156-162 (via homematic.cgi:139-157)
**Affected by migration**: yes
**Related Specs**: SP016, SP009, SP017, SP018, SP019, SP020, SP021, SP022, SP023, SP024

### Steps

1. CF001 steps 1-11 run; registry entry has `SCRIPT_FILE interface/dispatch.tcl` and `METHOD_FILE interface/<name>.tcl` -> dispatcher [dispatcher->interface-gateway] (IC004)
2. `dispatch.tcl` reads `args(interface)` (line 156); `array set interface $INTERFACE_LIST($interfaceName)` (line 158)
   - Decision: unknown name -> `jsonrpc_error 500 "unknown interface (<name>)"` (lines 158-160)
3. `INTERFACE_LIST` comes from `/etc/config/InterfacesList.xml`, cached in `/var/tmp/api_ipc.cache`; target invalidates when the XML mtime is newer (ipc.tcl:25-35, NFR-010)
4. `source methods/$method(METHOD_FILE)` (line 162) builds XML-RPC params and calls `xmlrpc $interface(URL) <name> ...` via tclrpc.so
5. `checkXmlRpcStatus` maps status: 1..4 -> 601..604, -1..-6 -> 501..506, -10 -> 507, other -> 599 (dispatch.tcl:132-150; fault text logged with correlation id, never returned)
6. Result is assembled (`getDeviceDescription` dispatch.tcl:66-127, `toJSONBoolean`, `toJSONArray`) and returned through `jsonrpc_response`; target v2: result validated as JSON (SP005)
7. v2 `POST /api/v2/batch` fans out several Interface.* reads in one round trip, each element isolated (max 20 elements) [dispatcher->interface-gateway] (IC004)

### Error paths

- Misspelled argument names (`inteface`, `Interface.setTeam`) are corrected in ARGUMENTS under the schema (NFR-022).
- XML-RPC exceptions: mapped by step 5; connection failure raises Tcl error -> 200 `internal error (ref: <cid>)`.
- Timeout: tclrpc.so has no timeout parameter (EG-24); the CGI budget of 60 s applies.

---

## CF008: ReGa-script methods (hmscript parameter injection)

**Entry**: security-session.hmscript at src/webui/www/api/eq3/hmscript.tcl:5-17 and 28-47 (`hmscript_run`) used by device/*, channel/*, sysvar/*, program/*, room/*, subsection/*, user/*, interface/{get,set,remove}Metadata
**Affected by migration**: yes
**Related Specs**: SP006, SP025, SP026, SP024, SP040, SP041, SP042, SP043, SP044

### Steps

1. Method script builds a HomeMatic script text and calls `hmscript <script> args` [rega-model->security-session] (IC017)
2. as-is: for every `args` entry append `var <sanitized-name> = "<escaped value>";` (hmscript.tcl:9-12); `hmscript_sanitizeIdentifier` keeps `[A-Za-z0-9_]`, max 64 chars (lines 238-244); `hmscript_escapeString` escapes `\ ' " LF CR TAB` (lines 208-217)
3. Target: only declared ARGUMENTS become variables; control chars U+0000-U+001F (except tab, LF, CR) rejected with 403 `invalid argument (<name>)` before the call (NFR-029)
4. `rega_script $script` through tclrega.so -> ReGaHss; STDOUT is returned (hmscript_run, lines 31-36); a raised error returns `""` (fail-closed for privilege callers)
5. Method parses the Tcl-list-style output and builds JSON (null / `""` / 500 `homematic script error`, per method)
6. v2 bulk read: `GET /api/v2/model` runs one bulk script per section page, not one per device (NFR-040) [dispatcher->rega-model] (IC009)
7. v2 mutations (`POST /api/v2/programs`, `/rooms`, `/functions`): fixed server-side scripts only, never client script text [dispatcher->rega-model] (IC010, IC011); gated by EG-6

### Error paths

- Empty STDOUT: mapped per method (EG-24 lists the unverified closed-source semantics).
- Unknown id in v2 edit: HTTP 404; extra body keys (for example `script`): HTTP 422, key never forwarded.
- Name collision on `SysVar.create*` on v2: 500 `name already exists (<name>)`, HTTP 409.

---

## CF009: Device.hasLinksOrPrograms

**Entry**: rega-model at src/webui/www/api/methods/device/haslinksorprograms.tcl:88-145
**Affected by migration**: yes
**Related Specs**: SP027, SP016, SP006

### Steps

1. ReGa script checks program usage of the device channels -> rega-model [rega-model->security-session] (IC017)
   - Decision: usage > 0 -> result true, stop
2. Else ReGa check for links (`ChnDPUsageCount` style); if none -> false
3. Resolve interface URL by name from the hard-coded table (4 names; others fail, as-is) -> rega-model, XML-RPC [rega-model->interface-gateway] (IC013)
4. For each channel > 0: `xmlrpc getLinks` and `getDeviceDescription` per link peer (N+1, NFR-020)
5. Peer on a different parent device -> true; else false

### Error paths

- Interface outside the 4 known names: Tcl error -> 200 `internal error (ref: <cid>)` (frozen v1 quirk, EG-15).
- ReGa script error: empty STDOUT -> method result per mapping above.

---

## CF010: Install mode (Interface.setInstallModeHMIP)

**Entry**: interface-gateway at src/webui/www/api/methods/interface/setinstallmodehmip.tcl:26-76
**Affected by migration**: yes
**Related Specs**: SP021, SP016

### Steps

1. Passes CF007 steps 1-3 [dispatcher->interface-gateway] (IC004)
2. Convert `on`: `"true"`, `1`, `"1"` -> 1, else 0 (lines 32-36); `time` default 30 (lines 38-42)
3. Branch on `installMode`
   - `LOCAL` (lines 55-65): whitelist struct `{ADDRESS, KEY, KEY_MODE}` -> `setInstallModeWithWhitelist(bool on, int time, array whitelist)`
   - `ALL` (lines 66-68): `setInstallMode(bool on, int time)`
   - otherwise STOP (lines 69-74): `set $on 0` is a bug (assigns variable named by the value of `on`), `setInstallMode(bool on)` runs with the original `on`
4. `checkXmlRpcStatus`, then `jsonrpc_response true`
5. v1 stays frozen (EG-15); on `/api/v2/rpc` `on` is forced to 0 for any installMode other than LOCAL/ALL; v2 validates `key` against `^[0-9A-Fa-f]{32}$`

### Error paths

- XML-RPC fault: 501-507/599 per CF007 step 5.
- Non-hex `key` on v1: forwarded unvalidated (frozen); v2: 403 `invalid argument (key)`.

---

## CF011: Gateway configuration rewrite (BidCoS-RF / BidCoS-Wired)

**Entry**: system-admin at src/webui/www/api/methods/bidcosrf/setconfiguration-rf.tcl:15-69 and methods/bidcoswired/setconfiguration-wired.tcl
**Affected by migration**: yes
**Related Specs**: SP030

### Steps

1. ADMIN call passes CF001 [dispatcher->system-admin] (IC006)
2. Read existing `rfd.conf`/`hs485d.conf`, keep the header up to the first interface section
3. Validate each `interfaces[]` element: CR/LF in `userName`, `serialNumber`, `encryptionKey`, `ipAddress` -> 403 `invalid argument (interfaces)`; file untouched
4. Build new content in a temporary file next to the target; section numbering: RF from 1, Wired from 0
5. `rename` temp file over the target (target; as-is truncates with `open w`, then writes: partial file on failure; NFR-019)
6. Key file and `<serial>.keychange` handled with the same write-then-rename

### Error paths

- Failure inside the loop (as-is: `result=false`, truncated file): target leaves the previous file byte-identical and returns false.
- Serial or lgwserial not matching `^[A-Za-z0-9_-]{1,32}$`: 403 before any path is built.

---

## CF012: SSH enable / disable

**Entry**: system-admin at src/webui/www/api/methods/ccu/setssh.tcl:11-21
**Affected by migration**: yes (analysis: no; SP036 hardening)
**Related Specs**: SP036

### Steps

1. ADMIN `CCU.setSSH {mode}` passes CF001 [dispatcher->system-admin] (IC006)
2. `mode == "true"` -> `touch /etc/config/sshEnabled` else `rm /etc/config/sshEnabled` (lines 13-17; run as argument lists, no shell)
3. `source /bin/setfirewall.tcl` loads and applies the firewall configuration (line 19)
4. `jsonrpc_response ""` (line 21)
5. Related: `CCU.setSSHPassword` hashes via `mkpasswd -m sha512` reading the password from stdin (no argv, NFR-027) and rewrites `/etc/config/shadow` through write-then-rename (NFR-038)

### Error paths

- `catch` swallows touch/rm errors (as-is); target logs to syslog with correlation id.
- Non-ADMIN session: 400 `access denied ("ADMIN" needed, session level <upl>)`.

---

## CF013: SNMP enable / disable

**Entry**: system-admin at src/webui/www/api/methods/ccu/setsnmpenabled.tcl:13-40
**Affected by migration**: yes (analysis: no; SP038)
**Related Specs**: SP038

### Steps

1. ADMIN call passes CF001 [dispatcher->system-admin] (IC006)
2. `source /lib/libfirewall.tcl`; `Firewall_setLoggingEnabled 1`; `Firewall_loadConfiguration` (lines 13-21)
3. `enable` true -> `exec -- /bin/setSNMPUser.sh $user $pass` and `Firewall_set_service_access SNMP full`; else `unsetSNMPUser.sh` and `SNMP none` (lines 24-30); credentials stay in argv (documented residual, EG-16)
4. If rc == 0: `Firewall_saveConfiguration` (write-then-rename), `Firewall_configureFirewall`, `msg = "noError"` (lines 32-36)
5. Response `{"msg": "<text>"}` (line 38-40)

### Error paths

- Helper exit != 0: `msg` carries the helper output, firewall not saved.
- `Firewall_setMode` invalid mode: logged to syslog, never written to stdout (NFR-037).

---

## CF014: Firmware download

**Entry**: system-admin at src/webui/www/api/methods/ccu/downloadFirmware.tcl:11-33
**Affected by migration**: yes
**Related Specs**: SP037

### Steps

1. ADMIN call passes CF001 [dispatcher->system-admin] (IC006)
2. Read version and major from `/VERSION` (lines 11-12) without shell pipelines (target)
3. `major == 3` -> read `/var/board_serial`, URL `https://ccu3-update.homematic.com/firmware/download?cmd=download&version=<v>&serial=<s>&lang=de&product=HM-CCU3`; `major == 2` -> board serial from `/sys/module/plat_eq3ccu2/parameters/board_serial`, host `update.homematic.com`, product `HM-CCU2` (lines 13-18)
4. Other major: respond `false` exactly once and stop (as-is emits `false` then continues, NFR-036)
5. `wget -q --https-only -O /tmp/fup.tgz <url>` (line 24) with timeout 300 s; on timeout terminate wget, write `timeout` to `/tmp/dwnld.error`
6. Exit 0 -> `true`, else write error text to `/tmp/dwnld.error` (line 26) and respond `false` (lines 29-33)

### Error paths

- wget exit != 0 or timeout: `false` plus error file; CGI never blocks longer than 305 s.
- `/var/board_serial` unreadable: serial empty, request still sent (frozen) - flagged in the fixture.

---

## CF015: SafeMode.enter

**Entry**: system-admin at src/webui/www/api/methods/safemode/enter.tcl:12-23
**Affected by migration**: yes (analysis: no; SP034 atomic flag write)
**Related Specs**: SP034

### Steps

1. ADMIN call passes CF001 [dispatcher->system-admin] (IC006)
2. Write `1` to `/etc/config/safemode` (lines 12-17); target write-then-rename (NFR-038)
3. Persist ReGa objects: `rega system.Save()` (line 20) [system-admin->security-session] ReGa bridge through `rega_script` (IC018)
4. Schedule `/sbin/reboot -d 2` in the background (line 21)
5. `jsonrpc_response true` (line 23)

### Error paths

- Flag file write failure raises a Tcl error -> 200 `internal error (ref: <cid>)`, no reboot is scheduled.
- Reboot is fire-and-forget: success is reported before the device restarts.

### Re-baseline addition (HEAD 1651075b): RecoveryMode.enter (SP034)

`RecoveryMode.enter` (ADMIN, ARGUMENTS {_session_id_}, src/webui/www/api/methods/recoverymode/enter.tcl:11-50) follows the same lifecycle pattern:

1. ADMIN call passes CF001 [dispatcher->system-admin] (IC006)
2. Read `PLATFORM` from `/VERSION` (lines 14-21); empty -> error 500 "could not determine the platform from /VERSION"; `oci` or `lxc` -> error 501 "recovery mode is not supported on platform <p>" (lines 22-27)
3. Persist ReGa objects: `rega system.Save()` (line 30) [system-admin->security-session] (IC018); failure -> error 500
4. Write flag file `/usr/local/.recoveryMode` containing `1` (lines 35-38); failure -> flag removed, error 500
5. Schedule `/sbin/reboot -d 2` in the background (line 45); failure -> flag removed, error 500
6. `jsonrpc_response true` (line 50)

No request parameter is read, so no request data reaches exec. v2 error messages carry neither errorInfo nor paths; v1 messages stay as-is (frozen).

---

## CF016: Firewall.setConfiguration

**Entry**: system-admin at src/webui/www/api/methods/firewall/setconfiguration.tcl:20-53
**Affected by migration**: yes
**Related Specs**: SP047

### Steps

1. ADMIN call passes CF001 [dispatcher->system-admin] (IC006)
2. `source /lib/libfirewall.tcl`; read `services`, `ips`, `userports`, `mode` (lines 20-25)
3. `Firewall_loadConfiguration` (line 27); set `Firewall_IPS`, `Firewall_USER_PORTS` (lines 29-30)
4. `Firewall_setMode $mode` (line 32): invalid mode is validated first (target) and rejected with 403 `invalid argument (mode)`; v2 HTTP 422
5. For each service element read `name` and `access` (the get method uses `id`; asymmetry preserved, lines 34-48); `access` must be `full|restricted|none`
6. `Firewall_saveConfiguration` (write-then-rename), `Firewall_configureFirewall` (lines 50-51)
7. `jsonrpc_response true` (line 53)

### Error paths

- Unknown service name is ignored silently (as-is line 40); invalid access value: 403 before any change.
- firewall.conf is unchanged after any validation failure.

---

## CF017: WebUI.getColors / setWebUIColors

**Entry**: user-profile at src/webui/www/api/methods/webui/getcolors.tcl:14-45
**Affected by migration**: yes
**Related Specs**: SP046

### Steps

1. `WebUI.getColors` (LEVEL NONE) passes CF001 steps 1-8, 11 [dispatcher->user-profile] (IC007)
2. Load system map `webui/color.map` under DOCUMENT_ROOT (line 14, 29)
3. If `central`: overlay `/etc/config/color.map` (lines 32-34); `central` comes from CF001 step 2 (SP013)
4. Build `{"id":"value",...}` via `json_toString` (lines 36-44) and respond (line 45)
5. `WebUI.setWebUIColors` (ADMIN) writes the user map through temp file plus `rename` (target; as-is seeds, truncates and rewrites line by line, NFR-038)

### Error paths

- Missing/unreadable file: `loadFromFile` returns `""` (lines 20-26), result is an empty object.
- Write failure on set: previous `color.map` stays byte-identical, method returns false.

---

## CF018: Generic Tcl failure path

**Entry**: dispatcher.homematic.cgi catch at src/webui/www/api/homematic.cgi:154-156
**Affected by migration**: yes
**Related Specs**: SP005, SP001

### Steps

1. Any uncaught Tcl error inside parse, lookup, privilege, argument check or method script (missing sysvar, null user, unreadable file) reaches the `catch` -> dispatcher.homematic.cgi:140-156
2. as-is: `jsonrpc_error 200 "internal error:\n$errorInfo"` leaks the stack and paths
3. Target: generate/reuse the correlation id (BD-06); write `errorInfo` plus id to syslog [dispatcher->security-session] logging helper shares the correlation id (IC003); respond error 200 `internal error (ref: <cid>)`; header `X-Correlation-Id: <cid>`
4. v1 stays HTTP 200; v2 maps code 200 -> HTTP 500 (BD-04) with the envelope in the body
5. Not-found cases that are errors in v1 (`SysVar.get` unknown id, `Program.get`, `User.*` unknown id, `setBool` unknown name) keep code 200 with generic text (NFR-028)

### Error paths

- `exit` calls inside `jsonrpc_error` cannot be intercepted: a second error after `jsonrpc_error` is impossible, a method script that has printed with `puts` before the error leaves text before the envelope (as-is NFR, kept in v1).
- No substring `errorInfo`, `while executing`, `.tcl`, `/www/` may appear in any body (NFR-006, checked across the fixture suite).
