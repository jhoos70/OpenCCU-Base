# API Contracts
Sources: `modules/webui-api.md` (full method table, all 180 methods), `modules/www.md`, `modules/src.md`, `cross-cutting/integration-seams.md`.

## JSON-RPC (WebUI backend) - `src/webui/www/api/homematic.cgi`
- Transport: `POST /api/homematic.cgi`, `Content-Type: application/json`, body `{"version":"1.1","method":"<ns.name>","params":{...}}` (client: `www_source/webui/js/common/jsonrpc.js:56-76`). GET returns an HTML method overview (`homematic.cgi:160-215`).
- Dispatch: `jsonrpc_parse` (`:141`) -> `checkPrivilegeLevel` (`:103-118`, called `:148`) -> argument check -> `source api/methods/<SCRIPT_FILE>` (`:153`). Uncaught Tcl errors return the full `errorInfo` to the client (`:155`).
- Registry: `methods.conf`, 180 methods; levels NONE=0, GUEST=1, USER=2, ADMIN=8 (ADMIN 91, GUEST 48, USER 31, NONE 10). Namespaces: CCU, Interface, Device, User, Channel, SysVar, system, Room, Subsection, BidCoS_RF, Session, Program, Event, ReGa, Firewall, WebUI and others.
- Auth: session id passed as `_session_id_` inside the JSON params (no cookie or header). Privilege is resolved by running `eq3/getupl.hms` in ReGa.
- Errors: HTTP status always 200; error in body (`error.code`, `error.message`): 100-103 request, 200-203 response, 400 privilege, 401 unknown method, 402 missing argument, 5xx application.
- Gaps for a new frontend (from `modules/webui-api.md`): no CORS or CSRF handling, Content-Type not checked, no batch call, no machine-readable schema, no endpoints to create/edit programs or rooms, datapoint changes are not pushed (`Event.poll` carries only `init`/`delete`), `Session.logout` is NONE-level.
- Full per-method table (level, params, script, JS callers): `modules/webui-api.md` section 8.

## XML-RPC (device daemons)
- `hs485d`: TCP 2000, 25 methods plus `init` callback handshake; `rfd`: TCP 2001 (optional Unix socket), about 50 methods (method list with line numbers in `modules/src.md`). Consumers: `tclrpc.so` `xmlrpc` command (latin-1 only), `SetInterfaceClock`, `hss_led` (`setRFLGWInfoLED`), `HSSManager`, `ReGaHss` via `InterfacesList.xml` registration.

## ReGa-served interfaces
- WebUI pages and `xml-api/*` (ISO-8859-1 XML) are served by the closed `ReGaHss` binary; no consumer of `xml-api` was found in the repo (`modules/webui-rega-pages.md`). `run-script.cgi` executes POSTed ReGa script after `session_isValid`.

## Local IPC
- `/dev/eq3loop` ioctls, `/run/hss_led/control` (AF_UNIX SEQPACKET), UDP 8182. See `integration-seams.md`.

## Not covered
- Param-level schemas of the rfd/hs485d XML-RPC methods and the ReGaHss-internal contract.
