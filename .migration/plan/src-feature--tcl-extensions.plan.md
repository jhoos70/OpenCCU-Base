# Migration Plan: Migrate src-feature--tcl-extensions (tclrega, tclrpc, tclticks, ::HomeMatic package)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: framework-upgrade (retain-and-wrap; native bridge layer)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--tcl-extensions | primary | index.json | `src/tclrega` (518 LOC), `src/tclrpc` (420 LOC), `src/tclticks` (100 LOC), `src/tcl_homematic` (7 fragments, about 140 LOC), plus generated `usr/lib/tcl8.2/homematic/` (2 files, 121 LOC) |
| 2 | webui-api | affected | index.json | 71 method scripts use `rega_script` (via `hmscript.tcl`), 51 use `xmlrpc`; the JSON-RPC contract is the only in-repo consumer that a nextGen UI will use |
| 3 | webui-config-pages / webui-easymodes / webui-rega-pages | affected | index.json | `cp_*.cgi`, `ic_*.cgi`, easymodes and `rega/bin/hm_*` load the extensions directly (`load tclrega.so`, `package require HomeMatic`) |
| 4 | src-feature--rfd / hs485d (XML-RPC 2001/2000) | dependency | index.json | tclrpc is a client of these daemons; wire protocol must not change |
| 5 | bin-feature (ReGaHss, closed source) | dependency | index.json | tclrega talks to its HTTP endpoint `127.0.0.1:8183/tclrega.exe`; protocol is fixed by the closed binary |
| 6 | src libs (libXmlRpc, libxmlparser) | dependency | index.json | Linked statically into tclrpc / tclrega |
| 7 | OpenCCU packaging repo (external) | affected | user | Patches `www/tcl/eq3/rega.tcl` (CRLF) which wraps `rega_script`; add-ons rely on `package require HomeMatic` and `hm_addons.cfg` |

---

## Context

### Summary

Three small C++ Tcl extensions and one pure-Tcl package form the bridge between every CGI / JSON-RPC method and the two back-ends: ReGaHss (logic, sessions, users, programs) and the XML-RPC interface daemons (rfd, hs485d, HmIP server).

- `tclrega.so` (package `rega` 1.4) registers `rega`, `rega_script`, `rega_url`, `rega_sid`, `rega_post` (`tclrega.cpp:138-148`). It uses a hand-written HTTP/1.0 POST over a raw socket (`SendRequest`, `:207`) to `http://127.0.0.1:<port>/tclrega.exe`. The port defaults to 8183 and can be overridden by `/etc/rega_http.port`. Strings are transcoded to ISO-8859-1 because ReGa only handles Latin-1. State is global and mutable (`dest_addr`, `uri`, `sid`, `portRega`).
- `tclrpc.so` (package `xmlrpc` 1.4) provides `xmlrpc url method ?args?` with typed argument lists (`{string x}`, `{int 1}`, arrays, structs, base64). It keeps one cached client and returns the XML-RPC fault code as the Tcl return code (`:394-405`) so `dispatch.tcl` can see codes such as -10 (TransmissionPending). Latin-1 only in both directions.
- `tclticks.so` (package `ticks` 1.0) provides `ticks_seconds` (monotonic clock). `src/tclticks` is not added by any root CMake file (`cmake/Components.cmake:39` loops over `tclrega tclrpc` only) and no file in the repo references `ticks_seconds` or `tclticks`: it is dead code, apart from its own CMakeLists.
- `::HomeMatic` 1.0 (`src/tcl_homematic`, generated into `/usr/lib/tcl8.2/homematic`): `tclload.tcl` auto-loads the two `.so` files so CGIs only need `package require HomeMatic`. Real functions: `GetSerialNumber` (`/etc/config/ids`), `Util::LoadFile/SaveFile`, `Addon::GetAll/AddConfigPage/RemoveConfigPage` (`/etc/config/hm_addons.cfg`). `Session::login/logout/renew` and `Script::eval` are `error "not implemented"` stubs, `Session::isValid` is empty; no callers other than `Addon::GetAll` (`control_panel.cgi:231`).

Measured during this assessment: about 23 Tcl files under `src/webui/www` call `rega_script` / `rega_exec` / `hmscript_*`, 255 Tcl/CGI files mention `xmlrpc`, and 15 files `load` the extensions or `package require HomeMatic`.

### Migration Drivers

- The nextGen UI depends on the Tcl backend. Whatever API shape it uses (JSON-RPC today, a new gateway later) ultimately reaches ReGa and the daemons through these extensions, so their contract must be pinned before any UI work depends on them.
- Build fragility: `TCL_INCLUDE_PATH` / `TCL_LIBRARY` are undefined in the root CMake and only supplied by CI (`.github/workflows/ci.yml:151-153`); `find_package(TCL)` otherwise `FATAL_ERROR`s when `BUILD_TCL_MODULES=ON`. Local developers cannot build the extensions without knowing the CI flags.
- `src/tclticks` is orphaned (not built, no callers); `usr/` holds a stale generated snapshot of the package (drift below).
- Latent correctness problems: unimplemented `Session`/`Script` stubs that look like an API; Latin-1-only transcoding (non-Latin-1 characters in user names, program names, device names or sysvars are lossy); global state; hand-written HTTP/1.0 client; `SaveFile` always returns 0; unlocked read-modify-write of `hm_addons.cfg`.
- No tests of any kind for the extensions (no Tcl, no unit tests, no mock ReGa).
- Old Tcl API: string-based `Tcl_CreateCommand` with a `CONST84` shim; package is installed under a `tcl8.2` path (convention only, but it signals the target interpreter era).

### Current State

Native shared objects built with CMake `MODULE` libraries (`-fPIC -O2`, guarded by `BUILD_TCL_MODULES`), staged via `openccu_stage_target(<name> lib)`; the Tcl package is generated by `tcl-homematic-assets` (`src/tcl_homematic/CMakeLists.txt`) by concatenating fragments listed in `files.txt`, stripping comments and installing to `${ROOTFS_DIR}/usr/lib/tcl8.2/homematic`. They run inside `tclsh` CGI processes (one process per request) under lighttpd on an embedded Linux (OpenCCU / CCU3-class device, plus OCI / HA / Helm images). Because each CGI is a short-lived process, global state in the extensions is harmless today; it would become a hazard if they were embedded in a long-running or threaded host.

### Cross-Cutting Findings

- **Drift in the committed `usr/` copy** (usr.md): `src/tcl_homematic/src/addon.tcl:4,24-34` has `RemoveConfigPage`, the committed `usr/.../homematic.tcl` does not; `tclload.tcl:4` guards with `info commands ::rega_script`, `usr/` with `![info exists rega_script]`. The build regenerates into `ROOTFS_DIR`, so the committed copy is a stale, unused snapshot (an editing trap).
- **Stubs**: `Session::*` and `Script::eval` are not implemented; `Session::isValid` returns empty (any caller treating empty as false would reject, treating non-error as true would accept). Real login goes through `api/methods/session/login.tcl` POSTing to `127.0.0.1/login.htm`.
- **Build gaps**: Tcl paths undefined in root CMake; `tclticks` not wired in; CI builds extensions only for the CI matrix, `tests/test-components.py` only checks the install closure on x86_64.
- **Injection surface above the bridge**: `hmscript` injects request params as ReGa variables (`hmscript.tcl:96-107`) and `rega_escape` (`tcl/eq3/rega.tcl:14-24`) and `hmscript_escapeString` use different escape tables. tclrega itself provides no escaping or parameter binding, so every caller carries the injection risk (see webui-api plan).
- **Trust boundary**: tclrega posts to 127.0.0.1 without authentication; any local process or any CGI can run arbitrary ReGa scripts. Privilege checking is done by callers (`getupl.hms`), not the bridge.
- **Add-on XSS**: add-on description text from `hm_addons.cfg` is emitted unescaped into inline JS in `control_panel.cgi:~245` (usr.md); trust boundary is the add-on installer.
- **Hard external contract**: CRLF in `www/tcl/eq3/rega.tcl` and the name `package require HomeMatic` are relied on by Buildroot patches and add-ons (external-context summary).
- **Closed endpoint**: the `tclrega.exe` request format and the `<__tcl_result_N>` response framing are fixed by the closed-source ReGaHss binary; the prebuilt binary is updated independently (recent commit "ReGaHss: update binaries").
- **Testing**: no tests for any of this (testing.md).

---

## Migration Goal

**Keep the Tcl bridge as the stable compatibility layer, fix its build and hygiene issues, and define a narrow, documented contract for it so the nextGen UI (and any later replacement) depends on a wrapped API rather than on the extensions directly.**

The nextGen UI should never call `tclrega`/`tclrpc` semantics directly. Outcomes: (1) the extensions build reproducibly from a clean checkout, (2) dead and stubbed surface is removed or documented, (3) the `rega_script` / `xmlrpc` call semantics (encoding, error codes, escaping) are specified and covered by tests, and (4) a decision gate for replacing the bridge with a native gateway is prepared but not executed.

---

## Decision

### Approach: Retain and wrap (incremental, minimal change to the native code)

Keep `tclrega.so`, `tclrpc.so` and the `::HomeMatic` package as they are on the wire, behind the JSON-RPC API (webui-api). Clean up around them (build, dead code, drift, stubs, tests), and add a single wrapper layer in Tcl (the existing `hmscript` / `rega.tcl` helpers, hardened) as the only place the new UI's backend reaches the bridge. Replacement is evaluated later as a gate decision once the wrapped contract exists.

**Rationale**: Migration scope is justified by: (1) the extensions are the single choke point for 71 ReGa-calling and 51 XML-RPC-calling method scripts plus about 15 direct loaders, so changing their behaviour has an extremely wide blast radius (webui-api, easymodes, `rega/bin`); (2) the wire protocols they speak are fixed by closed-source ReGaHss and the rfd/hs485d daemons, so there is nothing to gain on the device side by replacing them; (3) the Latin-1 transcoding and `-10` fault-code behaviour are deliberate contracts that downstream Tcl depends on; (4) there are zero tests, so any rewrite lacks a regression net; (5) the external Buildroot repo patches `rega.tcl` (CRLF) and add-ons require the `HomeMatic` package name; (6) the problems found (build flags, orphaned `tclticks`, stale `usr/`, stubs) are hygiene issues solvable without touching the runtime path.

### Options assessed

| Option | Summary | Effort | Risk | Verdict |
|--------|---------|--------|------|---------|
| A. Retain as is | No change; nextGen UI uses JSON-RPC and, where needed, Tcl CGI fragments | none | build fragility and stubs persist | Reject as end state; fine as the starting position |
| **B. Retain and wrap (recommended)** | Fix build/hygiene, add tests and a documented contract, route nextGen access through the JSON-RPC API / a thin Tcl wrapper only | low to medium | low | Select |
| C. Minimal modernization of the C++ | Port to Tcl_Obj API, drop `CONST84`, add UTF-8 option, replace HTTP/1.0 by libcurl or a shared client, make state per-interp | medium | medium (behaviour change in Latin-1 / error codes without tests) | Defer; do after tests exist |
| D. Replace with a native gateway | New service (e.g. C++ or Rust, speaking to ReGa :8183 and XML-RPC) exposing a modern API; CGIs retired over time | high | high (rewrites 180 methods plus legacy CGIs; ReGa contract is undocumented) | Reject for now; revisit when the legacy CGI surface is mostly gone |

### Rejected Options

- **Full replacement (D)**: rewrites a contract with no tests, no spec of the ReGa wire format, and 255 Tcl files of consumers; would also break the external Buildroot patches and add-ons that `package require HomeMatic`.
- **Implement the `Session`/`Script` stubs**: no callers; login and sessions are handled by `api/methods/session/*` and ReGa. Implementing them would add a second, divergent auth path. Remove or mark deprecated instead.
- **Port to Python/Node as an in-process library**: the Tcl CGIs are the host, so a non-Tcl port cannot be loaded without moving the callers first.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C++ (Tcl C API, string-based commands, `CONST84` shim), Tcl 8.2-era scripts | C++ (same sources, Tcl_Obj API as optional phase 3), Tcl 8.6 compatible scripts; no new language |
| Frameworks | Tcl 8.x C API; vendored `libXmlRpc`, `libxmlparser`; hand-written HTTP/1.0 over raw socket | Unchanged in phases 1-2; optional shared HTTP/XML helper in phase 3 |
| Build | CMake `MODULE` libs, `find_package(TCL)`, Tcl paths supplied only by CI | CMake with a documented fallback that resolves Tcl from `pkg-config` / `find_package(TCL)` when `TCL_INCLUDE_PATH` is unset; `tclticks` either removed or wired in |
| Infrastructure | lighttpd + tclsh CGI, GitHub Actions CI (matrix), embedded Linux / OCI / HA / Helm | Unchanged |
| Tests | none | Tcl-level contract tests with a fake ReGa HTTP endpoint and a fake XML-RPC server; run in CI |

---

## Scope

**Mode**: targeted

### Included Components

- `src/tclrega/` (`tclrega.cpp`, `CMakeLists.txt`)
- `src/tclrpc/` (`tclrpc.cpp`, `CMakeLists.txt`)
- `src/tclticks/` (decide: remove or wire in)
- `src/tcl_homematic/` (fragments, `files.txt`, generator, `pkgIndex.tcl`)
- `usr/lib/tcl8.2/homematic/` (generated copy; resolve drift by removing or regenerating)
- `cmake/Components.cmake` (module wiring), root `CMakeLists.txt` Tcl path handling, CI Tcl steps
- New: bridge contract document and Tcl-level contract tests

### Excluded Components

- `src/libXmlRpc`, `src/libxmlparser` (shared libraries; only consumed)
- `src/webui/**` API and page code (covered by webui-api, webui-config-pages, webui-easymodes, webui-rega-pages)
- `bin/ReGaHss` and its HTTP protocol (closed-source, not changeable)
- rfd / hs485d / HmIP server XML-RPC implementations
- Buildroot packaging repo (external; coordinate only)

### Critical Components

- `tclrega.cpp` `SendRequest` / `Tclrega_Cmd` / `rega_script` result framing
- `tclrpc.cpp` fault-to-return-code mapping (`:394-405`) and typed-argument conversion (`StringToXmlRpcValue`, `StringFromXmlRpcValue`)
- `tclload.tcl` auto-load behaviour (so existing CGIs keep working with only `package require HomeMatic`)
- `addon.tcl` and `/etc/config/hm_addons.cfg` format

### Boundaries

- No change to the Tcl command names, argument forms, return forms, encoding semantics or return codes in phases 1-2.
- No new auth mechanism inside the bridge; authorization remains with the JSON-RPC layer and ReGa.
- Any new UI backend talks to the bridge only through the webui-api layer or a single wrapper module.

---

## Dependencies

### Internal

- `src/libXmlRpc` (statically linked into tclrpc) and `src/libxmlparser` (tclrega)
- `cmake/Components.cmake`, `openccu_stage_target`, root `CMakeLists.txt` options `BUILD_TCL_MODULES`, `BUILD_TCL_HOMEMATIC`
- `src/webui/www/api/eq3/hmscript.tcl`, `src/webui/www/tcl/eq3/rega.tcl` (primary wrapper callers), `api/methods/interface/*.tcl` (`dispatch.tcl`, `checkXmlRpcStatus`), `api/eq3/ipc.tcl`
- `src/webui/rega/bin/hm_startup`, `hm_autoconf`, `hm_deldev` (direct `load`)
- `www/config/control_panel.cgi` (`::HomeMatic::Addon::GetAll`)

### External

- Tcl 8.x development headers and `libtcl` (supplied by CI via `pkg-config`; not detected by root CMake)
- ReGaHss HTTP endpoint `127.0.0.1:8183/tclrega.exe` (closed source); `/etc/rega_http.port`
- rfd (TCP 2001), hs485d (TCP 2000), HmIP/other interface URLs from `/etc/config/InterfacesList.xml`
- Files: `/etc/config/ids`, `/etc/config/hm_addons.cfg`, `/etc/rega_http.port`
- OpenCCU Buildroot repo and third-party add-ons that `package require HomeMatic`

---

## Constraints

### Unchanged

- Tcl command surface: `rega`, `rega_script`, `rega_url`, `rega_sid`, `rega_post`, `xmlrpc`, and package names/versions (`rega` 1.4, `xmlrpc` 1.4, `HomeMatic` 1.0)
- `rega_script` returns a dict with a `STDOUT` key; `rega` returns string for one argument and list for several
- `xmlrpc` returns the XML-RPC fault code as the Tcl return code and appends the fault text to the result
- ISO-8859-1 transcoding in both directions
- Default ReGa endpoint and `/etc/rega_http.port` override
- Package auto-loads the extensions so CGIs only `package require HomeMatic`
- `hm_addons.cfg` format (Tcl `array get`) and `GetSerialNumber` result (`INVALID` on failure)
- CRLF line endings in `www/tcl/eq3/rega.tcl` (external patches)
- Port contract hs485d 32000 / rfd 32001 / ReGa 8183, 1998 (externally hand-synchronised)

### Integration Systems

- ReGaHss (HTTP), rfd / hs485d / HmIP server (XML-RPC), lighttpd + tclsh CGI, GitHub Actions CI, Buildroot packaging repo

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|----------|
| high | Wide blast radius: any behavioural change in `rega_script`/`xmlrpc` (encoding, return codes, result framing) breaks 71 + 51 API method scripts plus about 15 direct loaders | Freeze semantics; write contract tests first; only then change code; keep old and new side by side behind a flag if a change is needed | tclrega.cpp:138-148, tclrpc.cpp:394-405; webui-api plan; grep counts in this assessment |
| high | No tests for the bridge or its consumers; regressions would only appear on devices | Add Tcl contract tests with fake ReGa HTTP and fake XML-RPC servers; run in CI on x86_64 first | testing.md; tests/ contains no Tcl or extension tests |
| high | Injection through the bridge: tclrega provides no escaping or binding, callers use two different escape tables; a new UI backend inherits this | Provide one hardened `rega_escape`-style wrapper (parameter-binding API) and route all new code through it; deprecate the other table | `tcl/eq3/rega.tcl:14-24`, `hmscript.tcl:96-107` |
| medium | Latin-1-only transcoding silently loses non-Latin-1 characters (user, device, sysvar and program names), a limitation a modern UI will expose | Document it; reject or escape unsupported characters at the API boundary; evaluate an opt-in UTF-8 path only after ReGa capability is confirmed | `tclrega.cpp:48`, `tclrpc.cpp:71-72` |
| medium | Build reproducibility: Tcl paths exist only in CI; local builds fail with `FATAL_ERROR`; extensions are not built when the flag is off, hiding breakage | Add pkg-config fallback and docs in `cmake/README.md`; add CI job that builds with defaults | root CMakeLists.txt (no TCL_* handling); `.github/workflows/ci.yml:151-153` |
| medium | Drift and stale generated artefacts: `usr/` snapshot lacks `RemoveConfigPage`, uses a different load guard; risk that someone edits `usr/` | Remove `usr/lib/tcl8.2/homematic` from git (it is regenerated) or add a CI diff check | usr.md "Build provenance"; `src/tcl_homematic/src/addon.tcl:4,24-34` |
| medium | Global mutable state and raw-socket HTTP/1.0 client are unsafe if the extensions are ever embedded in a long-running or threaded host (e.g. a new gateway reusing them) | Do not reuse them in a daemon; if needed, port to per-interpreter state in phase 3 | `tclrega.cpp` globals `dest_addr`, `uri`, `sid`, `portRega` |
| medium | External contract: Buildroot patches (CRLF in `rega.tcl`) and add-ons depending on `HomeMatic`; unannounced renames break them | Treat names, package versions and file formats as frozen; coordinate with the packaging repo before any change | external-context/summary.md |
| low | Unimplemented stubs (`Session::*`, `Script::eval`, empty `isValid`) mislead new code into a non-existent API | Remove from the package or make them raise a clear deprecation error; document in the contract | `src/tcl_homematic/src/session.tcl`, `script.tcl`; usr.md |
| low | `Addon` helpers: unlocked read-modify-write and unescaped add-on text in inline JS | Add file locking or atomic rename; escape on output in `control_panel.cgi` | usr.md "Observations / risks" |

---

## Success Criteria

- `tclrega.so` and `tclrpc.so` build from a clean checkout with documented, minimal CMake invocation (no undocumented CI-only flags); `tclticks` is either removed or built and used.
- No behavioural change in the bridge: contract tests assert `rega_script` STDOUT dict, `rega` string/list returns, `xmlrpc` fault-code returns (including -10), Latin-1 round trips, `/etc/rega_http.port` override; all green in CI.
- All existing CGIs and API method scripts continue to work unchanged (smoke test: JSON-RPC calls that exercise one `rega_script` and one `xmlrpc` path).
- The committed `usr/lib/tcl8.2/homematic` no longer drifts from `src/tcl_homematic` (removed or CI-verified).
- Stub APIs removed or explicitly deprecated; a bridge contract document exists and is referenced from the webui-api plan.
- nextGen UI code reaches ReGa and the daemons only through the JSON-RPC layer / a single wrapper module; no new direct `load tclrega.so`.
- Security: the new wrapper offers a parameter-binding call for ReGa scripts and no new code uses string concatenation for ReGa scripts.
- All existing functionality migrated, zero regression bugs in production, and the external Buildroot patches still apply to the generated output.

---

## Focus Areas

1. Contract freeze and tests for `rega_script`, `rega` and `xmlrpc` (fake ReGa and XML-RPC endpoints; Latin-1 and fault-code cases).
2. Build reproducibility: Tcl path discovery in CMake, `tclticks` decision, CI job with default configuration.
3. Safe call surface: one hardened escaping / parameter-binding wrapper for ReGa scripts, consolidating `rega_escape` and `hmscript_escapeString`.
4. `::HomeMatic` hygiene: remove stubs, resolve `usr/` drift, keep `Addon` and `GetSerialNumber` stable, fix `SaveFile` return and file locking.
5. Latin-1 policy at the API boundary (what the new UI can safely send); document and enforce.
6. Replacement decision gate (option D): revisit once legacy CGI usage is reduced and the contract tests exist.
7. Coordination with the Buildroot packaging repo for any rename or file change (CRLF, package names).

---

## Consequences

### Positive Outcomes

- The nextGen UI gets a stable, documented path to ReGa and the daemons without depending on undocumented Tcl behaviour.
- Reproducible local builds and a CI regression net for a layer that currently has none.
- Removal of dead code (`tclticks`, stubs, `usr/` snapshot) reduces confusion and editing mistakes.
- Option D stays open with a tested contract that a replacement gateway can be validated against.

### Negative Outcomes

- Latin-1, Tcl 8.x and per-request `tclsh` start-up cost remain until the legacy CGI layer is retired.
- The bridge remains a Tcl-only dependency; the new UI backend cannot embed it outside a `tclsh` process.
- Some effort goes into tests and wrappers for code that may eventually be replaced.

### Follow-Up Decisions

- Whether to move the extensions to the Tcl_Obj API and drop `CONST84` (option C) after tests exist.
- Whether to add an opt-in UTF-8 path to tclrega/ReGa, which depends on ReGaHss capability.
- Whether to build a native gateway (option D) and retire the Tcl CGIs; gate on API coverage in webui-api.
- Whether to remove `src/tclticks` or wire it in (and where `ticks_seconds` would be used).
- Whether to delete the committed `usr/` overlay or keep it with a CI check.
- How `HomeMatic` package compatibility is announced to add-on authors.

---

## Source Documents

- `.migration/plan-context.md` - shared engagement context
- `.migration/docs/modules/src.md` - sections 1-2 (Tcl extensions, `tcl_homematic`), WebUI API sections
- `.migration/docs/modules/usr.md` - generated `HomeMatic` package, drift observations
- `.migration/docs/cross-cutting/technical-debt.md`, `security.md`, `testing.md`, `api-contracts.md`, `dependencies.md`, `infrastructure.md` - via shared context
- `.migration/docs/external-context/summary.md` - Buildroot patch and port contract
- `.migration/plan/webui-api.plan.md` - consumer-side findings (hmscript, escape tables)
- Source verified: `src/tclrega/CMakeLists.txt`, `src/tclrpc/CMakeLists.txt`, `src/tclticks/CMakeLists.txt`, `cmake/Components.cmake:39`, `.github/workflows/ci.yml:135-165`, `git ls-files usr src/tcl*`

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

