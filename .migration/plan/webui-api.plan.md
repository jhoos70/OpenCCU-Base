# Migration Plan: Migrate webui-api (JSON-RPC backend and shared Tcl libraries)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: api-modernization

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | webui-api | primary | index.json | JSON-RPC CGI `/api/homematic.cgi`, `methods.conf` (180 methods), 183 method scripts, legacy `api/backup/*.cgi`, shared Tcl libs in `www/tcl` |
| 2 | webui-* (SPA shell, ise/config/webui JS) | affected | index.json | Sole in-repo clients: 133 of 180 methods have a JS caller (`www_source/**`, `rega/www/**`); nextGen UI will consume the contract defined here |
| 3 | www | affected | index.json | Drifted committed copy `www/api` (28 files differ from `src/webui/www/api`); `www/tcl/eq3_old` serves legacy page sessions |
| 4 | src-feature--rfd / hs485d (XML-RPC 2001/2000) | dependency | index.json | 51 method scripts call `xmlrpc` via `tclrpc.so`; protocol must stay unchanged |
| 5 | bin-feature (ReGaHss, closed source) | dependency | index.json | 71 method scripts depend on `tclrega.so` / `rega_script`; session store and privilege level live in ReGa |
| 6 | OpenCCU packaging repo (external) | affected | user | Pins this repo by SHA, patches `webui.js` and `www/tcl/eq3/rega.tcl` (CRLF); API URL and method names are an external contract |

---

## Context

### Summary

The WebUI backend is a single Tcl CGI (`/api/homematic.cgi`, 215 lines) that dispatches JSON-RPC 1.1 calls from a flat registry (`methods.conf`, 1,292 lines, 180 methods: ADMIN 91, GUEST 48, USER 31, NONE 10) to one Tcl script per method (183 scripts). Method scripts reach the system through three bridges: XML-RPC to rfd/hs485d (`tclrpc.so`, 51 scripts), ReGa script execution (`tclrega.so`, 71 scripts) and direct `exec` (about 26 scripts). Sessions and user levels are held in ReGa; the session id travels in the JSON body (`_session_id_`). 133 methods have a JS client in the repo, 47 have none. Large parts of the legacy UI are not served via JSON-RPC at all (ReGa `esp/*.htm`, Tcl `www/config/*` HTML fragments), and the API has no endpoints for program or room editing, no push events and no batch call.

### Migration Drivers

- Security: privilege gaps, unauthenticated surface, error leakage, no CSRF/CORS/Content-Type policy, weak session ids (see Cross-Cutting Findings).
- The nextGen UI (branch feature/nextgen-ui) needs a stable, documented, predictable contract: HTTP status codes, schema, push events, batch, missing edit endpoints.
- Performance: every call spawns `tclsh`, re-parses the 1,292-line registry and runs a ReGa script for the privilege check.
- Maintainability: no API tests at all, duplicated helper code (`api/eq3/common.tcl` vs `api/backup/common.tcl`), `www/api` drift from the source of truth.
- Latent bugs that silently break behaviour (Event.subscribe sid check, swapped error messages).

### Current State

Tcl CGI (`#!/bin/tclsh`) behind lighttpd on an embedded Linux (OpenCCU / CCU3-class device), no database, state in `/tmp/event`, `/var/tmp/api_ipc.cache` and ReGa session variables. Request flow: parse JSON (custom Tcl parser) -> linear scan of registry -> `getupl.hms` through ReGa -> presence-only argument check -> `source` method script in CGI global scope -> hand-concatenated JSON string. HTTP status is always 200; errors travel as `error.code` (overloaded 5xx range). No Access-Control headers, no CSRF protection, no Content-Type check. Deployment builds symlink `tcl/eq3{,_old}/*.tcl` into `/www`, `/www/config`, `/www/api/eq3`, `/www/pda/eq3` (CMakeLists.txt:12-25).

### Cross-Cutting Findings

Verified in source during this assessment (file:line):

- **Event.subscribe latent bug confirmed**: `src/webui/www/api/methods/event/subscribe.tcl:25` runs `hmscript_runFromFile "common/checksid.hms"`; the only copies on disk are `src/webui/www/api/eq3/checksid.hms` and `www/api/eq3/checksid.hms`. `hmscript` returns `""` on failure, so `isValid` is never `"true"` and stale-subscriber cleanup treats every other subscriber as invalid (cleanup is destructive for other live subscribers - verify at runtime). Fix: use `eq3/checksid.hms`.
- **Backup CGIs are live and not empty** (correction to the module doc, which called binfile/tarfile/textfile/version "0-byte"): `src/webui/www/api/backup/binfile.cgi` is 567 bytes and does `open $file r` on a caller-supplied `file` query parameter, guarded only by `session_isValid` (valid sid of any level, including GUEST) - arbitrary file read as the web-server user (e.g. `/etc/config/shadow`, key files). `textfile.cgi` and `tarfile.cgi` have the same size and pattern. `run-script.cgi` executes the POST body as a ReGa script for any valid session (no ADMIN check), bypassing `ReGa.runScript` ADMIN gating. Whether lighttpd still exposes `/api/backup/` must be verified (not in repo scope).
- **createfile.tcl**: `CCU.createFile` is GUEST (methods.conf:1102), `exec touch $args(file)` with a caller-chosen path (createfile.tcl:15); any guest can create files or update timestamps anywhere writable and can pass option-like arguments (`-r`, `-d`). `CCU.existsFile` (GUEST) is a filesystem oracle.
- **Session.logout is NONE** (methods.conf:790): any party who knows or guesses a sid can terminate it; the method simultaneously requires `_session_id_`. Unauthenticated: `GET /api/homematic.cgi` (full method list), `system.describe/listMethods/methodHelp`, `Interface.isPresent`, `ReGa.isPresent`, `User.getReGaVersion`, `WebUI.getColors`, `system.getEnergyPrice`.
- **Error leakage**: `homematic.cgi:155` returns `internal error:\n$errorInfo` (stack trace, script paths) in the response body.
- **Config-tool mode** skips authorization entirely (`homematic.cgi:147-148`, keyed on `DOCUMENT_ROOT != /www/`).
- **Session ids**: `@` + 10 chars from Tcl `rand()` over a 61-symbol alphabet (`eq3_old/session.tcl:448-470`), carried in URLs by the legacy UI (log and referrer leakage); not cryptographic. Default admin credentials with plaintext compare in `www/tcl/eq3_old/user.tcl:8-9`.
- **CSRF/CORS/transport**: no CSRF token, no Origin/Referer check, no Content-Type enforcement (a cross-origin `text/plain` POST is accepted when the sid is known), no CORS handling or OPTIONS, no Cache-Control, chunked bodies crash on missing `CONTENT_LENGTH` (`homematic.cgi:141`).
- **Injection surface**: `hmscript` injects every request param (including unexpected extras) as a ReGa variable (`hmscript.tcl:96-107`); `rega_escape` (`tcl/eq3/rega.tcl:14-24`) and `hmscript_escapeString` use different escape tables; type asserts are used in only some methods. `CCU.setSSHPassword` interpolates the password into a shell pipeline (`setsshpassword.tcl:11-13`); `cp_software.cgi:493` request-driven exec (outside this module, same trust boundary).
- **Contract defects**: HTTP 200 always; overloaded 5xx codes (login 501/503 vs XML-RPC fault mapping); swapped 102/103 messages; 400 message prints current level not required level; documented 101/201-203/300 never raised; `ReGa.getAllDatapoints` (ADMIN) iterates IDs 0..65534 per call and omits `_session_id_` from ARGUMENTS (as does `Session.setSessionVar`).
- **Drift**: `www/api` differs from `src/webui/www/api` in 28 files (plus `eq3/rega.tcl` and `eq3/session.tcl` present only in `www/api`, which are build-time symlink targets), including `methods.conf`, `eq3/jsonrpc.tcl`, `eq3/hmscript.tcl`, `session/login.tcl`, `session/renew.tcl`, `system/describe.tcl` and 12 sysvar scripts. `src/webui/www` is the source of truth; `www` is a stale deployed copy.
- **Testing**: no API, Tcl or contract tests exist (only tests/test-components.py install-closure check).

---

## Migration Goal

**Harden, specify and extend the JSON-RPC API behind a stable compatibility contract so the nextGen UI can be built on it, without changing the device-facing bridges.**

Deliver a versioned API surface (v1 = today's `/api/homematic.cgi` contract, frozen and hardened; v2 = additive endpoints for push events, schema, batch, program/room editing and profile management), close the privilege and injection gaps found in the assessment, and make the contract testable. The Tcl implementation is retained as the executor of bridge logic (`tclrpc.so`, `tclrega.so`, `/dev/eq3loop`-adjacent scripts); a thin gateway in front is an option evaluated in the Decision, not a prerequisite.

---

## Decision

### Approach: Retain and harden the Tcl backend, add a thin gateway layer incrementally (strangler)

Phase 0 (stabilise): fix bugs and close privilege gaps in place, add contract tests, remove drift. Phase 1 (harden): enforce Content-Type and an anti-CSRF header, error sanitisation, correct HTTP status mapping on an opt-in basis, stronger session ids. Phase 2 (extend): add the missing capabilities (push events, schema, batch, program/room editing, profile endpoints) as new methods/namespaces in Tcl first (they all sit on ReGa and XML-RPC bridges that exist only in Tcl). Phase 3 (optional, decide on evidence): put a gateway in front of `homematic.cgi` (candidate: a small persistent process behind lighttpd FastCGI/reverse proxy, e.g. Go or Rust static binary, or a long-running Tcl `tclhttpd`-style worker) that terminates sessions, caches the registry, validates against a schema, provides batch, SSE/WebSocket push and a CORS/CSRF policy, and forwards method execution to the existing Tcl scripts.

**Rationale**: Migration necessary due to: (1) arbitrary file read by any session through `api/backup/binfile.cgi` and unauthorised ReGa script execution via `run-script.cgi`, plus GUEST-level `CCU.createFile` (`createfile.tcl:15`, methods.conf:1102); (2) stack-trace leakage at `homematic.cgi:155`; (3) no CSRF/CORS/Content-Type policy and short non-cryptographic sids (`eq3_old/session.tcl:448-470`); (4) functional gaps that block nextGen UI (no push, no program/room editing, no batch, no schema); (5) zero automated tests; (6) per-call tclsh spawn and registry re-parse. A full rewrite is rejected because the semantics live in 183 scripts coupled to closed-source ReGa and to `tclrpc.so`/`tclrega.so`, there are no tests to prove equivalence, and the sibling OpenCCU repo patches and pins this tree by SHA. A gateway is deferred until Phases 0-2 produce a contract and tests, because a gateway without a validated contract would merely move the problem.

### Rejected Options

- **Full rewrite of the API in a new language/runtime**: no tests, closed-source ReGa, XML-RPC and ReGa bridges only available as Tcl extensions, high regression risk, breaks the OpenCCU patch set.
- **Gateway now, Tcl removed progressively**: premature; contract and tests absent; gateway would still need to shell out to the Tcl scripts for 71 ReGa-based and 51 XML-RPC-based methods; adds an extra daemon on a resource-constrained device.
- **Keep as is, only fix individual bugs**: leaves CSRF/CORS/session weaknesses and the missing capabilities unaddressed; does not enable the nextGen UI.
- **Replace JSON-RPC by REST/GraphQL immediately**: loses compatibility with the 133 in-repo call sites and with third-party tooling (CCU-Jack-style clients, add-ons) that rely on the method names; revisit as a v2 facade after schema work.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | Tcl (CGI, bridges), ISO-8859-1 sources; HomeMatic script (`.hms`) | Tcl retained for method scripts (UTF-8 conversion for new/edited files); optional gateway in a language already available in the build (C++ per repo toolchain, or Tcl); JSON Schema / OpenAPI-style spec as data |
| Frameworks | Custom JSON-RPC envelope (`jsonrpc.tcl`), custom JSON parser (`json.tcl`), cgi.tcl (extern), `tclrpc.so`, `tclrega.so` | Same bridges; replace hand-built JSON strings with a single serializer; schema-validated params; retain JSON-RPC 1.1 as v1 |
| Infrastructure | lighttpd CGI, ReGaHss session store, GitHub Actions CI (x86_64), CMake/Make, OpenCCU Buildroot packaging | Unchanged; add CI job running Tcl contract tests (tclsh + mock `xmlrpc`/`rega_script`); optional FastCGI/reverse-proxy gateway |

---

## Scope

**Mode**: targeted

### Included Components

- `src/webui/www/api/homematic.cgi`, `methods.conf`, `eq3/*` (jsonrpc, json, common, ipc, hmscript, event, `.hms` files)
- `src/webui/www/api/methods/**` (183 scripts, 19 namespaces)
- `src/webui/www/api/backup/*.cgi` and `backup/common.tcl`
- `src/webui/www/tcl/eq3/{rega,session}.tcl`, `tcl/eq3_old/{session,user,common,once}.tcl` (session and privilege aspects only)
- Removal of the stale `www/api` copy (or CI check that it equals `src/webui/www/api`)
- New: contract tests, machine-readable method schema, event producer, batch and edit endpoints

### Excluded Components

- Closed-source `bin/ReGaHss`, hs485d/rfd XML-RPC servers and `tclrpc.so`/`tclrega.so` internals (consumed as-is)
- eq3configd, crypttool, hss_led, kernel modules (own features; their findings are tracked there)
- `www/config/easymodes` and ReGa-rendered pages (`rega/www`), except where they call into the API
- lighttpd configuration and OpenCCU rootfs patches (external repository; only coordinated)
- JS client code (owned by webui-* features), other than adapting `homematic.js`/`jsonrpc.js` error handling in coordination

### Critical Components

- `homematic.cgi` dispatcher and `checkPrivilegeLevel` (single enforcement point for 180 methods)
- `api/backup/binfile.cgi`, `textfile.cgi`, `tarfile.cgi`, `run-script.cgi`
- `methods/ccu/{createfile,existsfile,setsshpassword,setssh,downloadFirmware}.tcl`, `methods/rega/runscript.tcl`
- `api/eq3/hmscript.tcl` (variable injection) and `tcl/eq3/session.tcl`
- `methods/event/*` and `eq3/event.tcl` (basis for push)

### Boundaries

- Method names, parameter names, `_session_id_` in body, JSON-RPC 1.1 envelope and HTTP 200 + `error.code` stay the v1 default; stricter behaviour (real HTTP status codes, header-based sid) is opt-in via `Accept`/header or a v2 path.
- No change to ports and protocols towards rfd/hs485d/ReGa.
- Do not edit `www/` directly; `src/webui/www` is the source of record.

---

## Dependencies

### Internal

- webui SPA shell and JS clients (`www_source/webui/js/homematic.js`, `common/jsonrpc.js`, `homematic/event.js`): consumers whose error handling (`// handle errors` stub, `eval` parsing) must be adapted in step.
- PDA UI (`www/pda`) shares `tcl/eq3/session.tcl` and `rega.tcl` via build symlinks (CMakeLists.txt:16-19).
- `www/tcl/eq3_old/session.tcl` and `user.tcl` (legacy session and user tables, default admin credentials).
- `src/webui/CMakeLists.txt` symlink deployment of Tcl libs; `/etc/config/InterfacesList.xml` for interface names.
- Other features reaching the same trust boundary: `cp_software.cgi`, eq3configd, rfd/hs485d XML-RPC (ports 2000/2001).

### External

- ReGaHss (closed-source) via `tclrega.so`: session variables, user level, object model; ReGa script language semantics.
- rfd / hs485d / HmIP server via XML-RPC (`tclrpc.so`).
- lighttpd (CGI execution, URL routing, TLS and HTTPS redirect).
- OpenCCU packaging repo (`/home/standard/dev/OpenCCU`): pins this repo by SHA, applies 64 rootfs patches including `www/tcl/eq3/rega.tcl` (CRLF) and `webui.js`; any change to file layout or line endings needs coordination.
- Third-party consumers of `/api/homematic.cgi` (add-ons, scripts) outside the repo; unknown, assumed to exist.

---

## Constraints

### Unchanged

- `POST /api/homematic.cgi` JSON-RPC 1.1 request/response envelope, method names and parameter names of the 133 methods with in-repo clients (and, by default, all 180).
- Four-level privilege model NONE/GUEST/USER/ADMIN (0/1/2/8) sourced from the ReGa session string `"<uid>;<upl>"`; sid format `@...@` accepted by the legacy UI (tcl/eq3/session.tcl:77-79 requires 12 chars).
- Session lifetime semantics (900 s timeout, renew via page hit).
- `Interface.*` parameter `interface` resolved from `InterfacesList.xml`; XML-RPC fault to error code mapping 501-507/599.
- Config-tool (non-central) mode keeps working for CfgTool until that feature is assessed; privilege bypass there must be made explicit (opt-in flag) rather than inferred from `DOCUMENT_ROOT`.

### Integration Systems

- XML-RPC hs485d (TCP 2000) and rfd (TCP 2001; 32000/32001 in container deployments)
- ReGaHss script engine (HTTP 8181/8183, 1998)
- `login.htm` redirect login at 127.0.0.1 (basis of `Session.login`)
- `/tmp/event/*` file queue and `/var/tmp/api_ipc.cache`
- Sibling OpenCCU packaging repo (SHA pin, rootfs patches)

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | Arbitrary file read and unauthorised ReGa script execution by any valid session through legacy backup CGIs; if lighttpd still maps `/api/backup/` a GUEST user can read credential files | Verify exposure; require ADMIN (`session_upl >= 8`) and an allow-list of paths, or remove the CGIs (confirm no caller in repo, `www_source`, OpenCCU patches) | `api/backup/binfile.cgi`, `run-script.cgi` (read in this assessment); security.md |
| high | `CCU.createFile` (GUEST) `exec touch` on caller path; `CCU.existsFile` filesystem oracle; ~26 scripts use `exec` with request data (`setsshpassword.tcl:11-13`, `downloadFirmware.tcl:24`) | Raise to ADMIN or replace by fixed-purpose methods (path allow-list, `--` guard, no shell pipelines); audit all `exec` scripts and add argument validators | methods.conf:1102-1109; createfile.tcl:15; api module doc 10.18 |
| high | Unsanitised param injection into ReGa scripts (`hmscript` defines a variable for every request param; inconsistent escaping and asserts) | Whitelist params to the method's declared ARGUMENTS before `hmscript`; central type validation from schema; unify escape routines; add fuzz tests | `hmscript.tcl:96-107`; `tcl/eq3/rega.tcl:14-24` |
| high | No CSRF/Content-Type/CORS policy, sid in JSON body and in URLs (legacy UI), predictable-class session ids | Require `Content-Type: application/json` plus custom header (e.g. `X-Requested-With`) in v1 strict mode; HttpOnly SameSite cookie option; CSPRNG sid from `/dev/urandom`; same-origin only (no `Access-Control-*`) unless explicitly configured | api module doc 10.9, 10.12-10.13; eq3_old/session.tcl:448-470 |
| high | No tests; `methods.conf` is the only specification, shapes are hand-built strings, so hardening can silently break the 133 live client call sites and OpenCCU patches | Characterisation tests per method (mock bridges) before any change; golden JSON fixtures for the 133 used methods; CI job in GitHub Actions | testing.md; api module doc 3, 8 |
| medium | Event.subscribe uses non-existent `common/checksid.hms`; stale-subscriber cleanup likely drops other subscribers' queues | One-line fix to `eq3/checksid.hms`; add regression test; verify at runtime before and after | `event/subscribe.tcl:25` |
| medium | Error leakage of `errorInfo` and internal paths; HTTP 200 for every error hampers clients and proxies | Log `errorInfo` server-side (syslog) and return generic message plus correlation id; add opt-in real HTTP status codes | `homematic.cgi:155` |
| medium | Source of truth drift: `www/api` differs from `src/webui/www/api` in 28 files and both are tracked; a fix applied to one tree does not reach the other | Make `src/webui/www` the single edited tree; delete or generate `www/api`; CI diff check; coordinate with OpenCCU SHA pin | api module doc inventory; diff run in this assessment |
| medium | Gaps (push, program/room editing, batch) require ReGa script writing for object-model mutations; ReGa semantics are closed-source and undocumented | Prototype each new method against a live ReGa; reuse `ReGa.runScript` patterns behind fixed scripts, never client-supplied script text; start with read-only schema and batch | api module doc 10.1-10.7 |
| medium | Performance: tclsh spawn, registry parse, ReGa privilege lookup on every request; batch and polling would multiply load on a small device | Cache registry (precompiled array), cache user level per sid for short TTL, batch endpoint, long-poll/SSE via gateway if a persistent process is accepted | `homematic.cgi:55-56,113` |
| low | Encoding: ISO-8859-1 sources versus UTF-8 JSON; CRLF dependency of `rega.tcl` in OpenCCU patches | Keep encodings of patched files; convert only files not patched downstream; add round-trip tests with non-Latin-1 text | api module doc 10.17; plan-context external constraint |

---

## Success Criteria

- All 133 client-used methods keep name, parameter set and result shape (verified by golden-fixture tests); the remaining 47 are either kept, deprecated with a documented removal path, or removed after confirming no consumer.
- `binfile/textfile/tarfile.cgi` and `run-script.cgi` either removed or restricted to ADMIN with path allow-list; `CCU.createFile`/`existsFile` no longer GUEST-accessible with arbitrary paths; no request-controlled path reaches `exec` without validation.
- `Session.logout` requires a valid session; no unauthenticated method discloses internals beyond an explicit allow-list; `GET /api/homematic.cgi` help page is authenticated or reduced.
- No response contains `errorInfo` or filesystem paths; correlation id logged instead.
- Strict mode enforces Content-Type and anti-CSRF header; session ids are generated from a CSPRNG with at least 128 bits (or a documented compatible scheme).
- Event.subscribe uses the correct checksid script (regression test in CI); at least one real event producer for datapoint changes (push) exists, or SSE/long-poll is delivered.
- Machine-readable schema (params and results) published for every method and used for central validation; batch/multicall available.
- Program and room editing and profile endpoints available with ADMIN/USER gating and tests.
- `www/api` no longer drifts (single source or enforced equality in CI).
- CI runs Tcl API tests on every PR; test coverage of the dispatcher and the 133 used methods at 100% of methods invoked at least once.
- Security model equivalent or stronger; all existing functionality migrated; zero regression in OpenCCU packaging build (patch set still applies).

---

## Focus Areas

1. Privilege gaps and file/exec exposure: backup CGIs, `run-script.cgi`, `createfile.tcl`, `existsfile.tcl`, `setsshpassword.tcl`, `downloadFirmware.tcl`, `Session.logout`, config-tool bypass.
2. Dispatcher hardening: Content-Type, CSRF header, error sanitisation, param whitelisting, sid generation, CORS stance, `Cache-Control`, chunked body handling.
3. Contract capture and test harness: characterisation/golden tests with mocked `xmlrpc` and `rega_script`; schema for params and results; fix swapped 102/103 messages and overloaded 5xx handling.
4. Latent bug fixes: Event.subscribe `common/checksid.hms` path, `_session_id_` missing from ARGUMENTS (`ReGa.getAllDatapoints`, `Session.setSessionVar`), 400 message text.
5. Drift removal: make `src/webui/www/api` authoritative, eliminate or auto-generate `www/api`; sync with OpenCCU SHA pin.
6. Gap closure for nextGen UI: push events (datapoint change producers, SSE/long-poll), batch, program and room/function editing, profile endpoints, a bulk read model replacing `ReGa.getAllDatapoints` loop.
7. Decision gate for gateway: after phases 0-2, measure request latency and device load; adopt a persistent gateway only if cost/benefit supports it (retain / wrap / minimal-change recommendation: **wrap incrementally, retain Tcl executors**).

---

## Consequences

### Positive Outcomes

- Closes high-severity file-read, script-execution and exec exposure without touching device protocols.
- Gives the nextGen UI a documented, tested, schema-validated contract and the missing capabilities.
- Compatibility with existing UI and add-ons is preserved by freezing v1.
- Removes drift and establishes the first automated tests for the Tcl layer.

### Negative Outcomes

- Tcl remains a dependency (ISO-8859-1 sources, custom JSON parser) until a gateway/executor replacement is justified.
- Dual contract (v1 strict/non-strict, v2) increases maintenance surface for a period.
- Strict mode may break undocumented third-party clients that send `text/plain` or omit headers; needs a transition flag.
- Changes to files patched by the OpenCCU packaging repo require coordinated releases.

### Follow-Up Decisions

- Gateway or not: technology (FastCGI vs reverse proxy vs persistent Tcl), process model on the device, and push transport (SSE vs WebSocket).
- Session model: cookie-based sessions with CSRF token versus sid-in-body; whether to retire URL-carried sids in the legacy UI.
- Fate of the 47 unused methods and of `api/backup/*.cgi` (remove versus restrict).
- Whether to publish v2 as REST/OpenAPI facade over the same executors.
- Policy for config-tool (non-central) mode in the CfgTool feature.
- Unification of the three auth surfaces (ReGa sids, `/var/SESSIONS.dat`, `tcl/eq3/session.tcl`).

---

## Source Documents

- `.migration/plan-context.md` - shared engagement, stack, integration, security and testing context
- `.migration/docs/modules/webui-api.md` - full method table, dispatcher flow, error codes, auth model, gaps (note: its statement that binfile/tarfile/textfile/version CGIs are 0-byte is incorrect; files are 150-567 bytes and active)
- `.migration/docs/cross-cutting/technical-debt.md` - drift (49/52 differing files), latent bugs
- `.migration/docs/cross-cutting/security.md` - authentication surfaces, exec patterns, backup CGI exposure
- `.migration/docs/cross-cutting/api-contracts.md`, `testing.md`, `dependencies.md`, `infrastructure.md` - via plan-context summary
- Source verified: `src/webui/www/api/methods/event/subscribe.tcl`, `methods/ccu/createfile.tcl`, `methods/session/logout.tcl`, `api/backup/binfile.cgi`, `api/backup/run-script.cgi`, `api/eq3/checksid.hms` (location), diff of `src/webui/www/api` against `www/api`
- `/home/standard/.claude/local-marketplace/one-modernizer/skills/plan-migration/references/plan-adr-template.md` and `adr-workflow.md` - template and field strategy

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

