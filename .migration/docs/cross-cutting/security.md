# Security Overview
Sources: `modules/www.md`, `modules/src.md`, `modules/usr.md`, `integration-seams.md`. Items marked (module doc) were not re-verified against source unless noted.

## Authentication Architecture
- Three coexisting surfaces (`modules/www.md`, "Authentication surfaces"): (a) ReGa session ids `@XXXXXXXXXX@` validated by ReGa script calls from Tcl (`www/api/eq3/checksid.hms`); (b) legacy file-based sessions `/var/SESSIONS.dat` (`www/tcl/eq3_old/session.tcl:9`, timeout 900 s `:14`, `MAX_SESSIONS 10` `:17`) and users `/etc/config/USERS.dat` (`www/tcl/eq3_old/user.tcl:6`); (c) new-style `www/tcl/eq3/session.tcl` login via HTTP POST to the local login.htm page on 127.0.0.1 (`:35-52`).
- `::HomeMatic::Session` in `usr/` is stubbed (`error "not implemented"`, the `session.tcl` source part under `usr/` module `usr.md`).
- Session id travels as the `sid` request parameter and is injected into forms/JS URLs (`www/config/ic_common.tcl:480`, `cp_software.cgi:508-520`).

## Authorization Model
- `cp_*.cgi` require session level 8 (admin), dispatching on the `action` parameter to `action_<name>` (e.g. `cp_security.cgi`). `ic_*` pages require level 0; `ic_md.cgi` write path requires 8 (`modules/www.md`).
- JSON-RPC API: per-method levels in `www/api/methods.conf`, enforced in `homematic.cgi:77-90` via `checkPrivilegeLevel`; in configuration-tool mode (`DOCUMENT_ROOT != /www/`) privilege checks are skipped.

## Secrets Management / Concerns
- Default admin credentials in the legacy user store: `ADMIN_NAME admin`, `ADMIN_PWD elv` (`www/tcl/eq3_old/user.tcl:8-9`); `user_verify` compares plaintext (`:136-152`) (module doc).
- Hard-coded default AES/sign key `"Markus is awesome"` in `src/crypttool/crypttool.cpp:26` and `src/eq3configd/main.cpp:50`.
- Keys are stored as MD5 hex in `/etc/config/crypttool.cfg` (`crypttoolconfig.cpp:30-56`).

## Data Protection
- `crypttool sign`: MD5 of data, then AES-128-CBC with an all-zero IV (`crypttool.cpp:178-187`). The encrypt/decrypt path is a stub.
- `libUnifiedLanComm` `createIV()` uses `srand(time*3/2)` + `rand()` (predictable IV, `UnifiedLanCommController.cpp:464-483`).
- `eq3configd` identify/config protocol over UDP is unauthenticated unless `CRYPT=1`; `EVP_DecryptUpdate` length unchecked (`main.cpp:334`).
- `hss_led` control socket uses `SO_PEERCRED` authorisation on `/run/hss_led/control`.
- Transport TLS: not evidenced in the analysed modules (unknown).

## Vulnerabilities / Risks Found
- **Request-driven command execution** (High, verified): `www/config/cp_software.cgi:493` runs `exec $script $op` with both values imported from the request; for `uninstall` it then runs `exec rm -rf $script` (`:496-497`). Reachable only with admin session (level 8).
- `www/api/methods/ccu/setsshpassword.tcl:11-13`: password interpolated into a shell pipeline (`mkpasswd`, `sed -i` on `/etc/config/shadow`) (module doc).
- `www/api/methods/ccu/createfile.tcl:15`: `exec touch $args(file)` with caller-supplied path; privilege level per `methods.conf` not checked (module doc).
- `api/backup/binfile.cgi`, `api/backup/textfile.cgi`, `api/backup/tarfile.cgi` read caller-selected paths with only a session check (module doc).
- `eq3configd` runs `system("/etc/init.d/S40network restart")` after config change (`main.cpp:449`).
- Process execution via `exec` in ~48 lines of `www/api/methods/` (module doc).
- `cp_*` assumption: if unified-LAN key is missing, `handleSetInitVectorMessage` logs fatal but continues (`UnifiedLanCommController.cpp:327-329`).

## Audit Trail
- Not systematically evidenced; pid and status files under `/var/status`, `/var/run` only.

## Update (verified in source)
- `src/webui/www/api/backup/binfile.cgi` opens a caller-supplied `file` query argument after only `session_isValid`, i.e. any valid session level can read arbitrary files readable by the CGI user; `textfile.cgi` and `tarfile.cgi` have the same size and pattern (only binfile read in full). `run-script.cgi` runs the POST body as ReGa script for any valid session, bypassing the ADMIN gate on `ReGa.runScript`. `CCU.createFile` (GUEST, `methods.conf:1102`) runs `exec touch` on a caller path. Whether lighttpd exposes `/api/backup/` is outside this repo and unverified.
