---
title: Target Architecture — webui-api
feature: webui-api
generated_at: "2026-10-13T00:00:00Z"
architectural_style: refactor-in-place (modular monolith internals)
sources:
  - plan.downstream.json
  - analysis.json
  - diagrams (component, sequence, ERD available)
  - user decisions from interactive session
---

<!-- markdownlint-disable MD025 -->
# Target Architecture: webui-api

> **Note**: For full decision rationale, alternatives considered, and approval tracking, see `target-architecture.adr.md`.

## 1. Executive Summary

**Migration Goal:** Harden, specify and extend the JSON-RPC API behind a stable compatibility contract so the nextGen UI can be built on it, without changing the device-facing bridges — v1 (today's `/api/homematic.cgi` contract) is frozen and hardened; v2 adds push events, schema, batch, program/room editing and profile management.

**Architectural Style:** Refactor in place — keep the lighttpd CGI dispatcher plus per-method Tcl executors as a single deployable with explicit internal layers (modular monolith internals). The device is small (tclsh spawn per request, closed-source ReGaHss), the classic and nextGen UIs coexist long-term, and the plan makes a persistent gateway an evidence-gated option rather than a prerequisite.

**Key Decisions:**

- **Style**: Keep the CGI architecture; add internal layers (contract core, security/session, ACL adapters per integration) — Q2, AQ3
- **React/BFF stance**: React SPA reaches the API same-origin through lighttpd; v2 endpoints (batch, bulk read, schema, push) play the BFF role in-process; an optional persistent gateway is adopted only after the phase-0–2 measurement gate — AQ6, Q2
- **Auth**: Keep the ReGa session and the 0/1/2/8 privilege model; harden (CSPRNG sid, strict mode, fail-closed, ADMIN gating for exec/file methods) — Q6
- **Integration**: Anti-corruption adapter per external system (rega_script, tclrpc, login.htm, event queue) — AQ5
- **Data**: No new store; ReGa remains system of record — Q4
- **Verification**: Golden-fixture characterisation tests for the 133 client-used methods, run in GitHub Actions — Q14 (auto-selected)

**Scope:** Targeted covering 6 include entries (dispatcher/registry/eq3 libs, 183 method scripts in 19 namespaces, backup CGIs, session/privilege aspects, www/api drift removal, new tests/schema/events/batch/edit endpoints)

---

## 2. Architecture Overview

### 2.1 Chosen Style & Justification

Refactor in place: a single deployable (lighttpd CGI → `homematic.cgi` → sourced Tcl method scripts → tclrega/tclrpc bridges) with new internal layer boundaries and additive v2 surface.

**Why this style:**
The plan's constraints freeze the JSON-RPC 1.1 envelope, method/parameter names, the four-level privilege model, session semantics, and the Interface.* resolution and fault mapping. The bridges to ReGaHss, rfd and hs485d are closed-source and unchanged. Microservices or serverless have no footing on an embedded OpenCCU device. A modular monolith with explicit layers delivers the hardening and extension goals with the least risk, and keeps rollback trivial (revert the Tcl tree). A persistent gateway (BFF-lite) is retained as a gated option for push/SSE and caching, decided after measurement (Section 8, Phase 6).

### 2.2 High-Level Component Structure

Ten components inside one deployable (plus one optional, gated process):

- **Dispatcher & Contract Core** — envelope, registry, parse/serialize, introspection, config-tool mode
- **Security & Session Layer** — privilege check, hmscript injection guard, session library, unauthenticated-surface policy
- **Event & Push Service** — per-session queue, producers, long-poll/SSE endpoint
- **Interface Gateway Adapter** — `Interface.*` XML-RPC passthrough (ACL for rfd/hs485d/HmIPServer)
- **ReGa Object Model Services** — Device, Channel, SysVar, Program, Room, Subsection, ReGa bridge methods
- **System Administration Services** — hardened exec/file/firewall/SSH/firmware/lifecycle methods
- **Legacy Backup CGIs** — `api/backup/*.cgi` (restrict to ADMIN + allow-list, or remove)
- **User, Profile & UI Settings** — User.*, system info helpers, WebUI colours, profile endpoints
- **Method Schema & Contract Test Harness** (new) — machine-readable schema, central validation, golden fixtures, CI
- **Optional Gateway** (new, gated) — persistent FastCGI/reverse-proxy process; wraps, never replaces, the Tcl executors

> See: [Target Component Diagram](diagrams/component-diagram.md)

### 2.3 Communication Patterns

| From | To | Protocol | Pattern | Notes |
|------|----|----------|---------|-------|
| lighttpd | Dispatcher & Contract Core | CGI/1.1 | Synchronous | One tclsh per request; POST `/api/homematic.cgi` (v1) and v2 paths |
| Dispatcher & Contract Core | Security & Session Layer | In-process Tcl call | Synchronous | Privilege check precedes argument check and script sourcing |
| Dispatcher & Contract Core | Method services (Interface, ReGa Object Model, System Admin, User/Profile, Event) | In-process Tcl `source` of `methods/<ns>/<method>.tcl` | Synchronous | Params validated against the Method Schema before execution |
| Interface Gateway Adapter | rfd / hs485d / HmIPServer | XML-RPC via tclrpc.so | Synchronous | Unchanged ports (2000/2001; 32000/32001 containers); fault→error mapping 501-507/599 preserved |
| ReGa Object Model Services, Security & Session Layer | ReGaHss | `rega_script` via tclrega.so | Synchronous | Params whitelisted to declared ARGUMENTS before `hmscript` |
| Security & Session Layer | ReGaHss web login | HTTP 127.0.0.1 `login.htm` | Synchronous | Basis of `Session.login`; unchanged |
| Event & Push Service | `/tmp/event/*` file queue | POSIX file I/O | Event queue → client poll (v1) / long-poll or SSE (v2) | Real producers for datapoint changes added; lock bug (NFR-009/018) fixed |
| Event & Push Service | Clients | HTTP long-poll; SSE only via optional gateway | Pub/sub (push) | Pub/sub per Q3; CGI long-poll first, SSE gated |
| System Administration Services | OS files and binaries (monit, init scripts, shadow, wget) | exec / file I/O | Synchronous | Allow-listed fixed-purpose commands only; no request-controlled path to exec |

No frontend→backend row: the React nextGen UI is built by webui-* features (excluded from `scope.include`), so AQ6 is recorded in Section 5.1/5.3 instead.

---

## 3. Component Design

### 3.1. Dispatcher & Contract Core

**Responsibility:** Single entry point `homematic.cgi`. Parses the JSON-RPC 1.1 request, looks up the method in the registry, orchestrates privilege → argument validation → script execution, serializes responses and errors through one JSON serializer, and exposes introspection. Owns v1/v2 routing and strict-mode switching. Config-tool (non-central) mode becomes an explicit opt-in flag instead of being inferred from `DOCUMENT_ROOT`.

**Specifications Owned:**
- `SP001`: Dispatch a POSTed JSON-RPC 1.1 request through parse, lookup, privilege check, argument check, source script
- `SP002`: Load and interpret the `methods.conf` registry (180 entries); precompiled/cached in target
- `SP004`: Parse the JSON-RPC request body into a structured form and validate envelope fields
- `SP005`: Serialize JSON-RPC responses and errors; map failures to numeric codes; remove `errorInfo` leakage
- `SP013`: Config-tool (non-central) mode — explicit opt-in flag instead of `DOCUMENT_ROOT` inference
- `SP032`: Method registry introspection (`system.describe`, `system.listMethods`, `system.methodHelp`)

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| POST | /api/homematic.cgi | v1 JSON-RPC 1.1 (frozen; HTTP 200 + `error.code`) |
| POST | /api/v2/rpc (path/Accept opt-in) | v2: strict mode, real HTTP status codes, header-based sid |
| POST | /api/v2/batch | Batch/multicall |
| GET | /api/v2/schema | Machine-readable method schema (authenticated) |
| GET | /api/homematic.cgi | Method help page — authenticated or reduced |

**Dependencies:**
- Internal: Security & Session Layer, Method Schema & Contract Test Harness, all method services
- External: lighttpd CGI environment, Tcl runtime

**Technology Recommendation:** Tcl (retained); single JSON serializer replacing hand-built strings; UTF-8 for new/edited files, ISO-8859-1/CRLF kept for files patched downstream (e.g. `rega.tcl`).

### 3.2. Security & Session Layer

**Responsibility:** Enforce the per-method privilege level (fail-closed), guard ReGa script injection, own session creation/validation/renewal/logout, and define the allow-list of the unauthenticated surface. Adds strict mode (Content-Type + custom CSRF header), CSPRNG session ids (≥128 bits or documented compatible scheme), HttpOnly/SameSite cookie option, and same-origin-only stance (no `Access-Control-*` unless configured).

**Specifications Owned:**
- `SP003`: Enforce per-method privilege by comparing ReGa UPL numerically (0/1/2/8)
- `SP006`: Inject params into HomeMatic Script — whitelist to declared ARGUMENTS, unified escaping
- `SP007`: Shared session library (login via `login.htm`, validate, renew, logout); fail-closed on ReGa failure
- `SP014`: Legacy classic-UI session/privilege layer (`/var/SESSIONS.dat`, USERS.dat mirror) — kept for classic UI
- `SP015`: Unauthenticated surface — explicit allow-list, no internals disclosure
- `SP031`: `Session.login/logout/renew/setSessionVar` (logout requires a valid session)

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| JSON-RPC | Session.login / logout / renew / setSessionVar | v1 contract unchanged; logout now needs a valid session |
| Header | X-Requested-With (strict mode) | Anti-CSRF header with required `Content-Type: application/json` |
| Cookie (opt-in) | HttpOnly SameSite session cookie | v2 alternative to `_session_id_` in body |

**Dependencies:**
- Internal: Dispatcher & Contract Core
- External: ReGaHss (rega_script), ReGaHss web login, `/dev/urandom`

**Technology Recommendation:** Tcl; `hmscript` rewritten around schema-declared parameters; fuzz tests for session id and param injection.

### 3.3. Event & Push Service

**Responsibility:** Per-session event queues for subscribe/poll/unsubscribe, a real producer for datapoint changes, and delivery via CGI long-poll (SSE only through the optional gateway). Fixes `Event.subscribe` to use `eq3/checksid.hms`, the ineffective lock (`lock_tryget`) and the 64-event stall.

**Specifications Owned:**
- `SP008`: Per-session event queue for `Event.subscribe/poll/unsubscribe` (file queue under `/tmp/event`, lock file)
- `SP029`: Per-session queue lifecycle and producers (`event_fire`, `hm_deldev`), subscriber cleanup

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| JSON-RPC | Event.subscribe / poll / unsubscribe | v1 unchanged |
| GET | /api/v2/events (long-poll; SSE if gateway) | Push stream of datapoint changes |
| Event | datapoint.changed | Produced from ReGa/interface callbacks into the queue |

**Dependencies:**
- Internal: Security & Session Layer
- External: `/tmp/event/*` queue, `hm_deldev` producer, ReGaHss

**Technology Recommendation:** Tcl with atomic file operations (rename-based append/locks); persistent gateway only if the Phase 6 gate approves.

### 3.4. Interface Gateway Adapter

**Responsibility:** Anti-corruption layer for the device-facing XML-RPC interfaces. Routes all `Interface.*` calls through `dispatch.tcl`, resolves the interface from `InterfacesList.xml`, and maps XML-RPC faults to JSON-RPC errors (501-507/599 unchanged). Includes device description, paramsets, links, install mode, firmware refresh, gateway/RSSI/key plumbing and metadata.

**Specifications Owned:**
- `SP009`: Interface discovery from `InterfacesList.xml` (cached `INTERFACE_LIST`; `/var/tmp/api_ipc.cache`)
- `SP016`: Interface.* passthrough through `dispatch.tcl`; fault→error mapping
- `SP017`: Device description/list (getDeviceDescription, listDevices, listTeams, addDevice)
- `SP018`: Paramset reads (getParamset, getParamsetDescription, getValue, …)
- `SP019`: Paramset writes (putParamset, setValue, …)
- `SP020`: Direct link management (addLink, removeLink, getLinks, …)
- `SP021`: Inclusion and device lifecycle (install mode, search, delete/replace)
- `SP022`: Firmware refresh/update, service-message counting, interface log level
- `SP023`: Gateway status/assignment/RSSI/AES key plumbing
- `SP024`: Metadata on ReGa objects and interface-stored objects

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| JSON-RPC | Interface.* (≈ 60 methods) | v1 frozen names/params; schema-validated centrally |
| Batch | /api/v2/batch | Multiple Interface.* reads in one round trip |

**Dependencies:**
- Internal: Dispatcher & Contract Core, Security & Session Layer
- External: rfd (TCP 2001), hs485d (TCP 2000), HmIPServer/crRFD via tclrpc.so

**Technology Recommendation:** Tcl + tclrpc.so (unchanged); interface URL resolution cached (precompiled array); fix `Interface.setTeam`-style ARGUMENTS mismatches under schema (NFR-022).

### 3.5. ReGa Object Model Services

**Responsibility:** Read and mutate the ReGa object model (devices, channels, system variables, programs, rooms, subsections) and bridge methods. Adds a bulk read model replacing the `ReGa.getAllDatapoints` loop (65,535 lookups) and v2 program and room/function editing with ADMIN/USER gating.

**Specifications Owned:**
- `SP025`: ReGa device model reads (Device.listAll, listAllDetail, get, address lookups)
- `SP026`: Device/channel attribute mutation (names, visibility, usability, logging, AES)
- `SP027`: Program/link usage reports and channel facts
- `SP028`: Communication tests (start/poll) for devices and channels
- `SP040`: SysVar reads
- `SP041`: SysVar create/set/delete (name uniqueness enforced in v2)
- `SP042`: Program operations (getAll, get, execute, deleteProgramByName)
- `SP043`: Room and Subsection queries and membership edits (shared implementation; fix `-lrmdup`)
- `SP044`: ReGa bridge methods (runScript ADMIN-only, isPresent, getAllDatapoints → bulk read model)

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| JSON-RPC | Device.*, Channel.*, SysVar.*, Program.*, Room.*, Subsection.*, ReGa.* | v1 frozen |
| GET | /api/v2/model | Bulk read model (devices, channels, rooms, functions, sysvars, programs) with pagination |
| POST | /api/v2/programs, /api/v2/rooms | Program and room/function editing via fixed server-side ReGa scripts (ADMIN/USER) |

**Dependencies:**
- Internal: Dispatcher & Contract Core, Security & Session Layer, Event & Push Service
- External: ReGaHss via tclrega.so

**Technology Recommendation:** Tcl executors retained; new mutations prototyped against a live ReGa and implemented as fixed scripts — never client-supplied script text.

### 3.6. System Administration Services

**Responsibility:** Privileged system operations: gateway config files, service/cert lifecycle, SSH, firmware download, security configuration, CCU identity flags, firewall, `createFile`/`existsFile`. All `exec` use is replaced by fixed-purpose, allow-listed operations with argument validators; GUEST-level arbitrary-path methods are raised to ADMIN or replaced.

**Specifications Owned:**
- `SP030`: BidCoS-RF/Wired gateway config (rfd.conf/hs485d.conf) and key file; atomic rewrites
- `SP034`: Lifecycle and certificate control (service restarts, SafeMode.enter)
- `SP035`: `CCU.createFile` (ADMIN-only) / `CCU.existsFile` (stays GUEST for classic-UI coexistence) — both restricted to exact-match path allow-lists (createFile 4 paths; existsFile 6 paths plus 2 anchored per-user ack-file patterns; corrected 2026-10-20, see ADR Approval Notes)
- `SP036`: SSH management (setSSH, getSSHState, setSSHPassword) without shell pipelines
- `SP037`: `CCU.downloadFirmware` — bounded duration, single response document
- `SP038`: Security configuration (level, auth, HTTPS redirect, SNMP, flag files; fix `setHttpsRedirectEnabled`)
- `SP039`: CCU identity and device-state reads/flags
- `SP047`: Firewall configuration (get/set; stdout leak fixed)

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| JSON-RPC | CCU.*, SafeMode.*, Firewall.*, BidCoS_RF.*, BidCoS_Wired.* | v1 names/params kept; privilege raised where plan requires |

**Dependencies:**
- Internal: Dispatcher & Contract Core, Security & Session Layer
- External: OS files and tools (monit, S62HMServer, mkpasswd, wget, `/lib/libfirewall.tcl`), Homematic update servers

**Technology Recommendation:** Tcl; central argument validators; atomic write-then-rename for config files (NFR-019/038).

### 3.7. Legacy Backup CGIs

**Responsibility:** `api/backup/*.cgi` are first verified for exposure (lighttpd mapping, repo and OpenCCU-patch callers). If unused, they are removed; otherwise they are restricted to ADMIN with a path allow-list and fail-closed session checks.

**Specifications Owned:**
- `SP010`: Backup CGI framework (query parsing, error rendering, login/logout endpoints)
- `SP011`: File transfer endpoints (binfile/textfile/tarfile/version)
- `SP012`: Data endpoints (links.cgi, paramset.cgi, run-script.cgi)

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| GET | /api/backup/*.cgi | Removed or ADMIN + allow-list; `version.cgi` stays minimal |

**Dependencies:**
- Internal: Security & Session Layer
- External: Local filesystem, `tar`

**Technology Recommendation:** Tcl; removal preferred when no caller exists.

### 3.8. User, Profile & UI Settings

**Responsibility:** User preference reads/writes, system info helpers, WebUI colour theme, and the new v2 profile endpoints for the nextGen UI.

**Specifications Owned:**
- `SP033`: User profile and preference queries
- `SP045`: System info helpers (energy price, position data, tweak, saveObjectModel)
- `SP046`: WebUI colour theme (getColors, setWebUIColors; atomic write)

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| JSON-RPC | User.*, system.*, WebUI.* | v1 unchanged (JS-expression responses preserved in v1) |
| GET/PUT | /api/v2/profile | Profile endpoints (strict JSON) |

**Dependencies:**
- Internal: Security & Session Layer, ReGa Object Model Services
- External: ReGaHss, per-user/profile files

**Technology Recommendation:** Tcl; v2 returns strict JSON (v1 keeps NFR-030 quirks).

### 3.9. Method Schema & Contract Test Harness (new)

**Responsibility:** Publish a machine-readable schema (params and results) for every method, drive central validation from it, and provide the characterisation test suite: golden JSON fixtures for the 133 client-used methods with mock `xmlrpc`/`rega_script`, dispatcher and privilege tests, fuzz tests, round-trip encoding tests, and a CI check that `www/api` equals `src/webui/www/api` (or is removed).

**Specifications Owned:** None (new capability; verifies all `SP001`–`SP047`).

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| Data | method schema (JSON Schema / OpenAPI-style) | Source for validation, `system.describe`, docs |
| CI | GitHub Actions job | Runs Tcl contract tests (tclsh + mocks) on every PR |

**Dependencies:**
- Internal: Dispatcher & Contract Core
- External: GitHub Actions, tclsh

**Technology Recommendation:** Tcl test harness (tcltest) with mock bridges; schema as data files.

### 3.10. Optional Gateway (new, gated)

**Responsibility:** A persistent FastCGI/reverse-proxy process for SSE/long-lived connections and short-TTL session/privilege caching. Adopted only if Phase 6 measurements show it helps; wraps the Tcl executors incrementally and never replaces them. Explicitly **not** a React-specific BFF — the classic UI keeps using v1 directly.

**Specifications Owned:** None (new, conditional).

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| GET | /api/v2/events (SSE) | Server-sent events |
| — | Cache layer | UPL cache per sid with short TTL |

**Dependencies:**
- Internal: Dispatcher & Contract Core, Event & Push Service
- External: lighttpd (reverse-proxy/FastCGI)

**Technology Recommendation:** C++ per repo toolchain or Tcl; decided at the gate.

---

## 4. Data Architecture

### 4.1 Storage Strategy

Keep current (unchanged). There is no relational database. ReGaHss remains the system of record (users, sessions, object model, system variables, programs, rooms); configuration lives in existing config files; transient state in `/tmp/event/*` and `/var/tmp/api_ipc.cache`. No new store is introduced.

### 4.2 Schema Changes

No schema changes — no database schema is introduced or altered. The only data-shape additions are the machine-readable method schema and the v2 resource shapes. v1 request/response shapes stay frozen per plan constraints.

### 4.3 Data Migration Approach

Not applicable (Q5 skipped: no database, data stays in place). Config-file rewrites change from truncate-then-write to write-then-rename without changing formats.

### 4.4 Consistency Model

ReGa-owned data is consistent per ReGa script execution; the API adds no cross-store transactions. Event delivery is at-least-once best-effort with per-session queues (bounded; overflow policy defined, fixing the 64-event stall). File updates are atomic via write-then-rename.

---

## 5. Integration Design

### 5.1 External System Connections

| External System | Protocol | Direction | Contract | Preservation Strategy |
|----------------|----------|-----------|----------|-----------------------|
| XML-RPC hs485d (TCP 2000) and rfd (TCP 2001; 32000/32001 in containers) | XML-RPC via tclrpc.so | Outbound | Interface paramset/link/device methods; fault codes 501-507/599 | Interface Gateway Adapter (ACL); no port/protocol change |
| ReGaHss script engine (HTTP 8181/8183, 1998) | `rega_script` via tclrega.so | Outbound | ReGa script text, STDOUT result | ACL adapter with whitelisted params and fixed scripts; fail-closed on error |
| login.htm redirect login at 127.0.0.1 | HTTP form POST | Outbound | `sid=@<id>@` in Location; 503 = too many sessions | Wrapped in Session adapter; error mapping 501/503 unchanged |
| `/tmp/event/*` file queue and `/var/tmp/api_ipc.cache` | POSIX file I/O | Internal/Outbound | Per-session queue files; interface cache | Event adapter with atomic ops; cache invalidation defined |
| Sibling OpenCCU packaging repo (SHA pin, rootfs patches) | Build/packaging | Inbound | Patch set against `src/webui/www`; CRLF/ISO-8859-1 in patched files | Keep encodings of patched files; single edited tree; coordinate SHA pin; verify patch set still applies in CI (2026-10-20: unchanged staged files are verbatim copies, changed files are minimal edits, documented conflicts are listed in COPY-PLAN.md; see ADR Approval Notes) |
| Frontend: nextGen React UI (webui-* features, **out of scope**) | HTTP same-origin | Inbound | v1 + v2 API | See 5.3 (AQ6) |

### 5.2 Communication Protocols

- **Client → API:** HTTPS/HTTP through lighttpd, JSON-RPC 1.1 (v1) and JSON v2 paths; push via long-poll (SSE via optional gateway)
- **API → interface daemons:** XML-RPC (tclrpc.so), unchanged
- **API → ReGaHss:** `rega_script` in-process (tclrega.so), unchanged; loopback HTTP only for `login.htm`
- **Integration layer approach (AQ5):** Anti-corruption layer per integration — one adapter module per external system that owns validation, escaping, error mapping and logging

### 5.3 Contract Preservation

- **v1 frozen:** POST `/api/homematic.cgi` envelope, method names, parameter names, `_session_id_` in body, HTTP 200 + `error.code` stay default for all 180 methods (133 client-used methods guarded by golden fixtures). Stricter behaviour is opt-in via header or v2 path.
- **Deliberate v1 changes (documented in the ADR):** `CCU.createFile` raised to ADMIN and `CCU.existsFile` restricted to an exact allow-list while keeping its v1 level (classic UI callers, incl. ReGa-rendered `.ftl` pages), backup CGIs, `Session.logout` without session, no `errorInfo` in errors, unauthenticated GET help page reduced. These depart from legacy NFR-004/006/025 behaviour on security grounds.
- **Frontend-to-backend (AQ6): Same-origin via reverse proxy.** lighttpd serves the SPA and `/api/*` under one origin; **no CORS headers** by default (no `Access-Control-*`). The React app is built outside this feature, so no Section 2.3 row is added and no `internal_contracts[]` entry is expected. The out-of-scope counterpart is the nextGen React UI (webui-* features). If an explicit allowed origin is later configured, it goes in Section 6.1 as opt-in config.
- **AQ7 (base URL):** Not applicable — the frontend is out of scope, and same-origin implies relative paths; no `base_url_config` is defined here.

---

## 6. Security Architecture

### 6.1 Authentication & Authorization

**Keep current auth (preserve integration):** ReGa session string `<uid>;<upl>`, four levels NONE/GUEST/USER/ADMIN (0/1/2/8), sid `@…@` accepted by the classic UI, 900 s timeout with renew by page hit. Hardening:

- Privilege check stays the single enforcement point for all methods; ReGa errors/unknown sessions deny (fail-closed, including backup CGIs — NFR-003)
- CSPRNG sid from `/dev/urandom` at the maximum the compatible 12-character format allows (~59.5 bits; ≥128 bits relaxed, see ADR amendment); ReGa-issued ids unchanged; brute force mitigated by per-sid/per-IP rate limiting (opt-in `rate_limit` flag, default off for v1; active in strict/v2 mode)
- Strict mode: require `Content-Type: application/json` plus `X-Requested-With`; optional HttpOnly SameSite cookie
- Config-tool privilege bypass is an explicit opt-in flag, not inferred from `DOCUMENT_ROOT`
- Same-origin only; no `Access-Control-*` unless explicitly configured

### 6.2 Service-to-Service Security

No inter-service network traffic inside the monolith. The optional gateway (if adopted) communicates over a local socket only; rfd/hs485d/ReGa stay on loopback with unchanged ports.

### 6.3 Data Protection

- Param whitelisting to declared ARGUMENTS and schema type validation before any `rega_script`; unified escaping; session ids escaped/validated in session scripts (NFR-005)
- No request-controlled path reaches `exec` without validation (allow-lists, `--` guard, no shell pipelines)
- Responses never contain `errorInfo` or filesystem paths; correlation id logged to syslog instead
- Secrets (LAN gateway key, passwords) not returned or passed via argv where avoidable (NFR-014/027)

---

## 7. Cross-Cutting Concerns

### 7.1. Logging / Observability

Structured syslog entries with a per-request correlation id; the same id is returned in generic error messages. `errorInfo` is logged server-side only.

**Pattern:** Server-side structured logging, correlation id in error response
**Technology:** syslog; no APM (Q15)

### 7.2. API Gateway / Rate Limiting

Request throttling and per-sid limits protect the small device (batch and polling multiply load). Lighttpd-level limits are coordinated with the OpenCCU packaging repo (external); the dispatcher adds per-sid and per-IP login limits (opt-in `rate_limit` flag, default off for v1; always enforced on v2/strict mode). The persistent gateway is an evidence-gated option (Phase 6).

**Pattern:** Throttling at lighttpd + in-dispatcher limits; optional gateway
**Technology:** lighttpd (external config, coordination only); optional C++/Tcl gateway

### 7.3. Configuration Management

Strict mode, CORS stance, config-tool mode, v2 enablement and limits are explicit, documented configuration with safe defaults (v1 default behaviour preserved).

**Pattern:** Explicit opt-in flags in a single config file
**Technology:** Tcl-readable config in the API tree; defaults preserve v1 behaviour

---

## 8. Migration Path

### 8.1 Recommended Migration Sequence

1. **Phase 0 — Safety net and single source of truth**: remove or CI-check the stale `www/api`; build the Tcl harness, golden fixtures for the 133 used methods, GitHub Actions job; verify OpenCCU patch set applies
   - Components: Method Schema & Contract Test Harness
   - Duration estimate: 3 weeks
   - Dependencies: None
2. **Phase 1 — Exposure closure**: verify, then remove/restrict backup CGIs; `CCU.createFile` to ADMIN + allow-list, `CCU.existsFile` allow-list (level unchanged); audit and validate the ~26 `exec` scripts; `Session.logout` and GET help page; fix `Event.subscribe` `checksid` path
   - Components: Legacy Backup CGIs, System Administration Services, Security & Session Layer, Event & Push Service (fix only)
   - Duration estimate: 2 weeks
   - Dependencies: Phase 0 fixtures
3. **Phase 2 — Dispatcher hardening**: single serializer, error sanitisation + correlation id, param whitelisting, strict mode (Content-Type + CSRF header), CSPRNG sid, explicit config-tool flag, registry cache
   - Components: Dispatcher & Contract Core, Security & Session Layer
   - Duration estimate: 3 weeks
   - Dependencies: Phases 0–1
4. **Phase 3 — Machine-readable schema and central validation**: schema for all 180 methods, `system.describe` v2, fix ARGUMENTS gaps (`_session_id_`, `Interface.setTeam`)
   - Components: Method Schema & Contract Test Harness, Dispatcher & Contract Core
   - Duration estimate: 3 weeks
   - Dependencies: Phase 2
5. **Phase 4 — v2 additive endpoints**: batch/multicall, bulk read model (replaces `ReGa.getAllDatapoints` loop), program and room/function editing, profile endpoints
   - Components: ReGa Object Model Services, User/Profile & UI Settings, Dispatcher & Contract Core
   - Duration estimate: 5 weeks
   - Dependencies: Phase 3
6. **Phase 5 — Event producers and push**: real datapoint-change producer, queue fixes (lock, overflow), long-poll
   - Components: Event & Push Service
   - Duration estimate: 3 weeks
   - Dependencies: Phases 2, 4
7. **Phase 6 — Gateway decision gate**: measure request latency and device load after Phases 0–5; adopt a persistent gateway (SSE, caching) only if cost/benefit supports it
   - Components: Optional Gateway
   - Duration estimate: 1 week to decide; 3+ weeks if adopted
   - Dependencies: Phases 0–5

### 8.2 Risk Areas

| Risk | Source | Mitigation | Priority |
|------|--------|------------|----------|
| Arbitrary file read / ReGa script exec via backup CGIs | focus: privilege and file/exec exposure | Verify exposure; ADMIN + allow-list or remove | High |
| `exec` with request data (createFile, setsshpassword, downloadFirmware) | focus: privilege gaps | ADMIN, fixed-purpose methods, validators | High |
| Param injection into ReGa scripts | focus: dispatcher hardening | Whitelist to ARGUMENTS, schema types, fuzz tests | High |
| No CSRF/CORS/Content-Type policy; predictable sid | focus: dispatcher hardening | Strict mode, CSPRNG sid, same-origin | High |
| Hardening breaks the 133 live call sites | focus: contract capture | Golden fixtures before any change; CI | High |
| `www/api` vs `src/webui/www/api` drift | focus: drift removal | Single edited tree; CI equality check | Medium |
| ReGa mutation semantics undocumented | focus: gap closure | Prototype on live ReGa; fixed scripts; start read-only | Medium |
| Per-request cost / batch+poll load on small device | focus: decision gate | Registry cache, UPL TTL cache, batch, measure before gateway | Medium |
| Encoding ISO-8859-1 vs UTF-8; CRLF in patched files | constraints | Keep encodings of patched files; round-trip tests | Low |

### 8.3 Rollback Strategy

Each phase ships as a revertible change to the Tcl tree; v1 remains the default behaviour, so reverting returns the exact prior contract. Strict mode and v2 are opt-in flags and can be switched off without redeploying. Backup CGI removal is preceded by an exposure/caller check and kept as a one-commit revert. The gateway, if adopted, sits beside the CGI path; disabling the lighttpd route falls back to long-poll via CGI.

---

## 9. Decision Summary

Key architectural decisions are documented in the Architecture Decision Record (ADR). See `target-architecture.adr.md` for full details including alternatives considered, rationale, and approval history.

**Quick Reference**:

| Decision ID | Decision | Chosen |
|-------------|----------|--------|
| Q1 | Existing patterns | None — best practices |
| Q2 | Architectural style | Keep current architecture (refactor in place) |
| GQ1 / CQ1 | Implementation standards | Auto-selected best practices, accepted |
| Q3 | Communication patterns | REST (synchronous) + Event bus / pub-sub |
| Q4 | Data storage strategy | Keep current (unchanged) |
| Q5 | Data migration approach | Skipped — not applicable |
| Q6 | Authentication/authorization | Keep current auth (hardened) |
| Q7 | Cross-cutting concerns | Logging/observability, API gateway/rate limiting, configuration management |
| Q8 | Deployment model | Same as current |
| Q9 | Additional requirements | None |
| Q10–Q15 | Implementation standards | CMake/Make; DB versioning N/A; spec-first schema; keep data access via ACL adapters; unit+contract testing; syslog structured logging |
| AQ3 | Module decomposition | Single deployable (modular monolith) |
| AQ5 | Integration layer | Anti-corruption layer per integration |
| AQ6 | Frontend-to-backend connectivity | Same-origin via reverse proxy (frontend out of scope) |
| AQ7 | Frontend API base URL resolution | Not applicable — frontend not in `scope.include`; same-origin uses relative paths |

(Additional decisions: see ADR Section "Decision Log")

---

## 10. Target Diagrams

Three diagram types are provided in the `diagrams/` subdirectory (always generated):

### Component Diagram

> [component-diagram.md](diagrams/component-diagram.md)

### Sequence Diagram

> [sequence-diagram.md](diagrams/sequence-diagram.md)

### Entity Diagram

> [entity-diagram.md](diagrams/entity-diagram.md)
