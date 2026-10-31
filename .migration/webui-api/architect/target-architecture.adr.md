# Architecture Decision Record — webui-api

**Status**: approved  
**Date**: 2026-10-13

---

## Context

### Migration Goal

Harden, specify and extend the JSON-RPC API behind a stable compatibility contract so the nextGen UI can be built on it, without changing the device-facing bridges. Deliver a versioned API surface (v1 = today's `/api/homematic.cgi` contract, frozen and hardened; v2 = additive endpoints for push events, schema, batch, program/room editing and profile management), close the privilege and injection gaps found in the assessment, and make the contract testable. The Tcl implementation is retained as the executor of bridge logic; a thin gateway in front is an option evaluated in the Decision, not a prerequisite.

### Scope

Targeted; 6 include entries: dispatcher/registry/eq3 libs, 183 method scripts in 19 namespaces, backup CGIs, session and privilege aspects of `tcl/eq3` and `tcl/eq3_old`, removal of the stale `www/api` copy, and new contract tests / machine-readable schema / event producer / batch and edit endpoints. Boundaries: v1 stays default; stricter behaviour is opt-in; no change to ports and protocols towards rfd/hs485d/ReGa; `src/webui/www` is the source of record; classic and nextGen UIs coexist long-term.

### Constraints

Unchanged: JSON-RPC 1.1 envelope, method and parameter names; four-level privilege model (0/1/2/8) from the ReGa session string; session lifetime semantics (900 s); Interface.* resolution and XML-RPC fault mapping 501-507/599; config-tool mode (privilege bypass must become explicit opt-in). Legacy NFRs are satisfied or deliberately tightened on security grounds (see Consequences).

### Analysis Summary

- User stories extracted: 47 (SP001–SP047)
- Control flows identified: 18
- Entities identified: 24
- NFRs: 41; external systems: 18

### Focus Areas

- Privilege gaps and file/exec exposure
- Dispatcher hardening
- Contract capture and test harness
- Latent bug fixes
- Drift removal
- Gap closure for nextGen UI
- Decision gate for gateway

---

## Source Stack

### Languages

- Tcl (CGI, bridges), ISO-8859-1 sources
- HomeMatic script (.hms)

### Frameworks

- Custom JSON-RPC envelope (jsonrpc.tcl)
- Custom JSON parser (json.tcl)
- cgi.tcl (extern)
- tclrpc.so
- tclrega.so

### Infrastructure

- lighttpd CGI
- ReGaHss session store
- GitHub Actions CI (x86_64)
- CMake/Make
- OpenCCU Buildroot packaging

---

## Target Stack

### Languages

- Tcl retained for method scripts (UTF-8 for new/edited files; ISO-8859-1/CRLF kept for files patched downstream)
- Optional gateway in a language already in the build (C++ or Tcl), only if gated in
- JSON Schema / OpenAPI-style spec as data

### Frameworks

- Same bridges (tclrpc.so, tclrega.so)
- Single JSON serializer
- Schema-validated params
- JSON-RPC 1.1 retained as v1; tcltest-based contract tests

### Infrastructure

- Unchanged lighttpd, ReGaHss, CMake, OpenCCU packaging
- CI job running Tcl contract tests (tclsh + mock xmlrpc/rega_script)
- Optional FastCGI/reverse-proxy gateway (gated)

---

## Scope

**Mode**: targeted

### In Scope

- src/webui/www/api/homematic.cgi, methods.conf, eq3/* (jsonrpc, json, common, ipc, hmscript, event, .hms files)
- src/webui/www/api/methods/** (183 scripts, 19 namespaces)
- src/webui/www/api/backup/*.cgi and backup/common.tcl
- src/webui/www/tcl/eq3/{rega,session}.tcl, tcl/eq3_old/{session,user,common,once}.tcl (session and privilege aspects only)
- Removal of the stale www/api copy (or CI check that it equals src/webui/www/api)
- New: contract tests, machine-readable method schema, event producer, batch and edit endpoints

### Out Of Scope

- Closed-source ReGaHss, hs485d/rfd XML-RPC servers, tclrpc.so/tclrega.so internals
- eq3configd, crypttool, hss_led, kernel modules
- www/config/easymodes and ReGa-rendered pages (except calls into the API)
- lighttpd configuration and OpenCCU rootfs patches (external; coordinated only)
- JS client code (owned by webui-* features)

### Critical Components

- homematic.cgi dispatcher and checkPrivilegeLevel
- api/backup/binfile.cgi, textfile.cgi, tarfile.cgi, run-script.cgi
- methods/ccu/{createfile,existsfile,setsshpassword,setssh,downloadFirmware}.tcl, methods/rega/runscript.tcl
- api/eq3/hmscript.tcl and tcl/eq3/session.tcl
- methods/event/* and eq3/event.tcl

### Boundaries

- v1 envelope and names stay default; stricter behaviour opt-in
- No change to ports/protocols towards rfd/hs485d/ReGa
- Do not edit www/ directly
- Classic and nextGen UIs coexist; BFF/gateway decision owned here

---

## Constraints

### Unchanged

- POST /api/homematic.cgi JSON-RPC 1.1 envelope, method and parameter names
- Four-level privilege model NONE/GUEST/USER/ADMIN (0/1/2/8) and sid format
- Session lifetime semantics (900 s, renew via page hit)
- Interface.* resolution from InterfacesList.xml; fault mapping 501-507/599
- Config-tool mode kept (explicit opt-in)

### Integration Systems

- XML-RPC hs485d (TCP 2000) and rfd (TCP 2001; 32000/32001 in containers)
- ReGaHss script engine (HTTP 8181/8183, 1998)
- login.htm redirect login at 127.0.0.1
- /tmp/event/* file queue and /var/tmp/api_ipc.cache
- Sibling OpenCCU packaging repo (SHA pin, rootfs patches)

---

## Architectural Style

**Selected Option**: Keep current architecture (refactor in place)

### Rationale

The constraints freeze the API contract and device-facing bridges; the device is small and spawns a tclsh per request; both UIs coexist; and the plan defers any persistent gateway to a measurement gate. Refactor in place with explicit internal layers (modular monolith internals) meets the hardening and extension goals with the lowest risk and trivial rollback. A React-specific BFF is not adopted: v2 endpoints (batch, bulk model, schema, push) provide its function in-process, and an optional gateway for SSE and caching remains a gated follow-up.

### Rejected Options

- **Microservices**: Not viable on an embedded device; adds processes and deployment surface without benefit.
- **Modular monolith (as a rebuild)**: Same shape as the chosen approach, but implies restructuring rather than retaining the Tcl executors; its layering is adopted inside the in-place refactor.
- **Serverless / FaaS**: No infrastructure; not applicable on-device.
- **Event-driven architecture**: Applies only to the push slice; adopted there (Q3), not as the overall style.
- **React-specific BFF as the target**: Second backend shape for one UI, conflicts with long-term coexistence and v1 freeze; revisit only if Phase 6 measurements justify a gateway.

---

## Component Architecture

### Components

#### Dispatcher & Contract Core

**Responsibility**: Entry point `homematic.cgi`; parse, route (v1/v2), validate, execute, serialize; introspection; config-tool opt-in.

**Specifications Owned** (by `spec_id`): SP001, SP002, SP004, SP005, SP013, SP032

**API Surface**: POST /api/homematic.cgi (v1), POST /api/v2/rpc, POST /api/v2/batch, GET /api/v2/schema

**Dependencies**: Security & Session Layer, Method Schema & Contract Test Harness, method services

**Technology**: Tcl, single JSON serializer

#### Security & Session Layer

**Responsibility**: Privilege enforcement (fail-closed), hmscript injection guard, session library, unauthenticated-surface policy, strict mode, CSPRNG sid.

**Specifications Owned** (by `spec_id`): SP003, SP006, SP007, SP014, SP015, SP031

**API Surface**: Session.login/logout/renew/setSessionVar; strict-mode headers

**Dependencies**: Dispatcher & Contract Core, ReGaHss, ReGaHss web login

**Technology**: Tcl, /dev/urandom

#### Event & Push Service

**Responsibility**: Per-session queues, datapoint-change producers, long-poll (SSE via optional gateway), queue fixes.

**Specifications Owned** (by `spec_id`): SP008, SP029

**API Surface**: Event.subscribe/poll/unsubscribe; GET /api/v2/events

**Dependencies**: Security & Session Layer, /tmp/event queue

**Technology**: Tcl, atomic file operations

#### Interface Gateway Adapter

**Responsibility**: ACL for rfd/hs485d/HmIPServer; Interface.* passthrough, discovery, fault mapping.

**Specifications Owned** (by `spec_id`): SP009, SP016, SP017, SP018, SP019, SP020, SP021, SP022, SP023, SP024

**API Surface**: Interface.* (v1 frozen), batch reads

**Dependencies**: Dispatcher & Contract Core, Security & Session Layer, rfd/hs485d

**Technology**: Tcl + tclrpc.so

#### ReGa Object Model Services

**Responsibility**: Device, Channel, SysVar, Program, Room, Subsection and ReGa bridge methods; bulk read model; program and room editing.

**Specifications Owned** (by `spec_id`): SP025, SP026, SP027, SP028, SP040, SP041, SP042, SP043, SP044

**API Surface**: Device.*, Channel.*, SysVar.*, Program.*, Room.*, Subsection.*, ReGa.*; GET /api/v2/model; edit endpoints

**Dependencies**: Dispatcher & Contract Core, Security & Session Layer, Event & Push Service, ReGaHss

**Technology**: Tcl executors, fixed ReGa scripts

#### System Administration Services

**Responsibility**: Hardened exec/file operations: gateway config, lifecycle, createFile/existsFile, SSH, firmware, security config, identity flags, firewall.

**Specifications Owned** (by `spec_id`): SP030, SP034, SP035, SP036, SP037, SP038, SP039, SP047

**API Surface**: CCU.*, SafeMode.*, Firewall.*, BidCoS_RF.*, BidCoS_Wired.*

**Dependencies**: Dispatcher & Contract Core, Security & Session Layer, OS tools

**Technology**: Tcl with validators; atomic writes

#### Legacy Backup CGIs

**Responsibility**: Remove or restrict (ADMIN + allow-list) `api/backup/*.cgi`.

**Specifications Owned** (by `spec_id`): SP010, SP011, SP012

**API Surface**: GET /api/backup/*.cgi

**Dependencies**: Security & Session Layer

**Technology**: Tcl

#### User, Profile & UI Settings

**Responsibility**: User preferences, system info helpers, colour theme, v2 profile endpoints.

**Specifications Owned** (by `spec_id`): SP033, SP045, SP046

**API Surface**: User.*, system.*, WebUI.*; /api/v2/profile

**Dependencies**: Security & Session Layer, ReGa Object Model Services

**Technology**: Tcl

#### Method Schema & Contract Test Harness (new)

**Responsibility**: Machine-readable schema, central validation, golden fixtures, CI, drift check.

**Specifications Owned** (by `spec_id`): None (new; verifies SP001–SP047)

**API Surface**: Schema data, CI job

**Dependencies**: Dispatcher & Contract Core

**Technology**: tcltest, JSON Schema

#### Optional Gateway (new, gated)

**Responsibility**: Persistent process for SSE and UPL/session caching; wraps Tcl executors.

**Specifications Owned** (by `spec_id`): None (new, conditional)

**API Surface**: /api/v2/events (SSE)

**Dependencies**: Dispatcher & Contract Core, Event & Push Service

**Technology**: C++ or Tcl (decided at gate)

### Communication Patterns

- lighttpd → Dispatcher: CGI/1.1, synchronous
- Dispatcher → method services and Security & Session Layer: in-process Tcl, synchronous
- Interface Gateway Adapter → rfd/hs485d: XML-RPC, unchanged
- Security & Session / ReGa services → ReGaHss: rega_script, unchanged
- Event & Push Service → clients: long-poll (pub/sub), SSE only via optional gateway
- Frontend→backend: no row (frontend out of scope); recorded in AQ6

---

## Data Architecture

**Storage Strategy**: Keep current (unchanged). ReGaHss is system of record; config files, `/tmp/event` queue and `/var/tmp/api_ipc.cache` unchanged. No database.

**Schema Changes**: None.

**Migration Approach**: Not applicable (Q5 skipped). Config rewrites become write-then-rename.

**Consistency Model**: Per-ReGa-script consistency; best-effort per-session event queues with bounded overflow; atomic file updates.

---

## Integration Architecture

### External Systems

- XML-RPC hs485d (TCP 2000) and rfd (TCP 2001; 32000/32001 in containers)
- ReGaHss script engine (HTTP 8181/8183, 1998)
- login.htm redirect login at 127.0.0.1
- /tmp/event/* file queue and /var/tmp/api_ipc.cache
- Sibling OpenCCU packaging repo (SHA pin, rootfs patches)
- nextGen React UI (out of scope consumer)

### Integration Layer

Anti-corruption layer per integration (AQ5): one adapter per external system owning validation, escaping, error mapping and logging. Frontend connectivity (AQ6): same-origin via lighttpd reverse proxy; no CORS by default; AQ7 not applicable.

### Protocols

- JSON-RPC 1.1 over HTTP (v1), JSON over HTTP (v2), long-poll (SSE gated)
- XML-RPC (tclrpc.so)
- rega_script (tclrega.so, in-process)
- HTTP form POST to 127.0.0.1 login.htm
- POSIX file I/O

---

## Security Architecture

**Authentication**: Keep current ReGa session and sid format; harden with CSPRNG sid (~59.5 bits, max of the compatible format; 128-bit target relaxed), strict mode (Content-Type + X-Requested-With), optional HttpOnly SameSite cookie, fail-closed checks.

**Authorization**: Four-level model (0/1/2/8) enforced centrally per method; exec/file methods raised to ADMIN or replaced by fixed-purpose methods; config-tool bypass explicit opt-in.

**Data Protection**: Param whitelisting and schema validation before rega_script; allow-listed exec arguments; no errorInfo/paths in responses; secrets not returned or put in argv where avoidable.

---

## Cross-Cutting Concerns

### Logging / Observability

**Pattern**: Server-side structured logging with correlation id

**Technology**: syslog

### API Gateway / Rate Limiting

**Pattern**: lighttpd throttling (coordinated) + in-dispatcher per-sid and per-IP login limits (opt-in `rate_limit`, default off for v1; enforced on v2/strict); optional gateway

**Technology**: lighttpd (external config), optional C++/Tcl gateway

### Configuration Management

**Pattern**: Explicit opt-in flags with safe defaults preserving v1

**Technology**: Tcl-readable config in the API tree

---

## Deployment Architecture

**Model**: Same as current (lighttpd CGI on OpenCCU rootfs)

### Rationale

Constraints keep lighttpd, ReGaHss and packaging unchanged; the device offers no container or serverless runtime. An optional gateway would be an additional on-device daemon only if gated in.

### Infrastructure Requirements

- Existing lighttpd CGI mapping for `/api/` (v2 paths coordinated with the OpenCCU packaging repo)
- GitHub Actions job for Tcl contract tests (tclsh + mocks)
- Coordination of SHA pin and patch set with the OpenCCU packaging repo

---

## Migration Strategy

### Sequence

Phase 0 safety net and single source (harness, golden fixtures, drift removal) → Phase 1 exposure closure (backup CGIs, createFile/existsFile, exec audit, checksid fix) → Phase 2 dispatcher hardening → Phase 3 schema and central validation → Phase 4 v2 additive endpoints → Phase 5 event producers and push → Phase 6 gateway decision gate.

### Risk Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| File read / script exec via backup CGIs | High | Verify exposure; ADMIN + allow-list or remove |
| exec with request data | High | ADMIN, fixed-purpose methods, validators |
| Param injection into ReGa | High | Whitelist to ARGUMENTS, schema types, fuzz tests |
| No CSRF/CORS/Content-Type policy; weak sid | High | Strict mode, CSPRNG sid, same-origin |
| Hardening breaks 133 live call sites | High | Golden fixtures before change; CI |
| www/api drift | Medium | Single edited tree; CI equality check |
| ReGa mutation semantics undocumented | Medium | Prototype live; fixed scripts |
| Per-request cost / batch+poll load | Medium | Registry cache, UPL TTL cache, measure |
| Encoding ISO-8859-1 vs UTF-8 | Low | Keep encodings of patched files; round-trip tests |

### Rollback Strategy

Each phase is a revertible change to the Tcl tree; v1 default behaviour is preserved so reverting restores the prior contract. Strict mode and v2 are opt-in flags. Backup CGI removal follows an exposure/caller check and is a one-commit revert. A gateway, if adopted, sits beside the CGI path and can be disabled at the lighttpd route.

---

## Decision Log

| Decision ID | Category | Selected Option | Rejected Options |
|-------------|----------|----------------|------------------|
| Q1 | existing-patterns | No — recommend best practices | Same pattern as current; provided references; organizational standards |
| Q2 | service-architecture | Keep current architecture (refactor in place) | Microservices; Modular monolith (rebuild); Serverless; Event-driven (overall) |
| GQ1 | implementation-standards-gate | Use recommended best practices for refactor-in-place | Answer detailed questions |
| Q3 | service-architecture | REST (synchronous) + Event bus / pub-sub | gRPC; Message queue; Mixed |
| Q4 | data-architecture | Keep current (unchanged) | Shared database; Polyglot; Own DB per service; Event sourcing |
| Q5 | data-architecture | Skipped — not applicable (no database) | — |
| Q6 | security-cross-cutting | Keep current auth (hardened) | JWT; OAuth 2.0 / OIDC; API key; mTLS |
| Q7 | security-cross-cutting | Logging/observability; API gateway/rate limiting; Configuration management | Distributed tracing; Circuit breakers; Feature flags |
| Q8 | deployment-operations | Same as current | Kubernetes; Serverless; VM; PaaS |
| Q9 | deployment-operations | None — plan covers it | — |
| Q10 | implementation-standards | Keep current: CMake/Make + OpenCCU packaging (auto-filled) | Maven; Gradle; npm; Go; pip |
| Q11 | implementation-standards | Not applicable — no relational DB (auto-filled) | Flyway; Liquibase; Sqitch |
| Q12 | implementation-standards | Spec-first schema for v2 and v1 schema derived from methods.conf (auto-filled) | Code-first; Manual; Hybrid |
| Q13 | implementation-standards | Keep current via ACL adapters, modernized incrementally (auto-filled) | ORM; Query builder; Micro-ORM |
| Q14 | implementation-standards | Unit + integration/contract (golden fixtures, mocks, GitHub Actions) (auto-filled) | E2E; Performance (deferred to Phase 6 measurement) |
| Q15 | implementation-standards | Structured syslog logging with correlation id (auto-filled) | APM; Distributed tracing; Metrics stack |
| CQ1 | confirmation | Accept all recommendations | Customize Q10–Q15 |
| AQ1 | adaptive | Skipped — trigger not met (performance not in focus_areas) | — |
| AQ2 | adaptive | Skipped — trigger not met (data_integrity not in focus_areas) | — |
| AQ3 | adaptive | Single deployable (modular monolith) | Separate services; Grouped services; Per module |
| AQ4 | adaptive | Skipped — trigger not met (no >10 business-rule set in analysis) | — |
| AQ5 | adaptive | Anti-corruption layer per integration | API gateway; ESB; Direct point-to-point |
| AQ6 | adaptive | Same-origin via reverse proxy | CORS; BFF; Same as current |
| AQ7 | adaptive | Skipped — frontend not in scope.include; same-origin means relative paths | — |

### Decision Details

#### Q1: Do you have existing architecture patterns or templates to follow?

**Selected Option**: No — recommend best practices

**Rationale**: The plan constraints and analysis evidence define the design; no organizational template was supplied.

**Rejected Options**:
- **Use the same pattern as the current system**: Preserved structurally, but best practice calls for new internal layers.
- **Reference files / organizational standards**: None provided.

#### Q2: What architectural style should the target use?

**Selected Option**: Keep current architecture (refactor in place)

**Rationale**: Frozen contract and bridges, small device, coexisting UIs, gateway deferred to a measurement gate. The user asked whether React with a BFF should be the target; the conclusion is a same-origin React SPA calling v1+v2, with v2 acting in-process as BFF and a gated optional gateway.

**Rejected Options**:
- **Microservices**: Not viable on-device.
- **Modular monolith (rebuild)**: Layering adopted, rebuild rejected.
- **Serverless**: Not applicable.
- **Event-driven (overall)**: Used for the push slice only.

#### GQ1: Implementation standards decision mode

**Selected Option**: Use recommended best practices for refactor-in-place

**Rationale**: Catalog defaults for Refactor in Place, adapted to this stack (Maven/Flyway/Micrometer do not apply).

**Rejected Options**:
- **Answer detailed questions**: Not needed; confirmed via CQ1.

#### Q3: Communication patterns

**Selected Option**: REST (synchronous) + Event bus / pub-sub

**Rationale**: HTTP JSON-RPC is the contract; push requires pub/sub semantics via the event queue.

**Rejected Options**:
- **gRPC**: Not compatible with browser/classic clients.
- **Message queue**: No fit on-device.
- **Mixed**: XML-RPC and rega_script stay as unchanged bridges, not a new decision.

#### Q4: Data storage strategy

**Selected Option**: Keep current (unchanged)

**Rationale**: ReGa is system of record; no database exists.

**Rejected Options**:
- **Shared DB / polyglot / DB-per-service / event sourcing**: Not applicable or add stores to a small device.

#### Q5: Data migration approach

**Selected Option**: Skipped — not applicable (no database; data stays in place).

**Rationale**: Skip condition satisfied in substance: no schema or data to migrate.

**Rejected Options**:
- None documented

#### Q6: Authentication / authorization

**Selected Option**: Keep current auth (hardened)

**Rationale**: Session model and privilege levels are in `constraints.unchanged`; the plan hardens rather than replaces them.

**Rejected Options**:
- **JWT / OAuth 2.0 / API key / mTLS**: Conflict with unchanged session model or need infrastructure unavailable locally.

#### Q7: Cross-cutting concerns

**Selected Option**: Logging/observability; API gateway/rate limiting; Configuration management

**Rationale**: Correlation-id logging replaces errorInfo leakage; throttling protects the device; explicit config makes opt-in modes safe.

**Rejected Options**:
- **Distributed tracing**: Single process.
- **Circuit breakers**: No remote service calls beyond loopback bridges.
- **Feature flags**: Covered by explicit config flags.

#### Q8: Deployment model

**Selected Option**: Same as current

**Rationale**: lighttpd CGI on OpenCCU rootfs is fixed.

**Rejected Options**:
- **Kubernetes / serverless / VM / PaaS**: Not applicable on-device.

#### Q9: Additional requirements

**Selected Option**: None — plan covers it

**Rationale**: No requirements beyond plan.downstream.json.

**Rejected Options**:
- None documented

#### Q10: Build & dependency management (auto-filled, pattern: Refactor in Place)

**Selected Option**: Keep current — CMake/Make + OpenCCU packaging

**Rationale**: Minimizes disruption.

**Rejected Options**:
- **Maven / Gradle / npm / Go / pip**: Not used by this stack.

#### Q11: Database schema versioning (auto-filled)

**Selected Option**: Not applicable

**Rationale**: Q4 keeps current; no relational DB.

**Rejected Options**:
- **Flyway / Liquibase / Sqitch**: No database.

#### Q12: API development approach (auto-filled)

**Selected Option**: Spec-first schema for v2 and v1 schema derived from `methods.conf`; v1 behaviour unchanged

**Rationale**: Plan requires a machine-readable schema used for central validation.

**Rejected Options**:
- **Code-first / Manual / Hybrid**: Would not give a validated contract.

#### Q13: Data access strategy (auto-filled)

**Selected Option**: Keep current via ACL adapters, modernized incrementally

**Rationale**: rega_script and tclrpc are the only data paths.

**Rejected Options**:
- **ORM / query builder / micro-ORM**: No SQL layer.

#### Q14: Testing strategy (auto-filled)

**Selected Option**: Unit + integration/contract testing (golden fixtures with mock bridges, fuzz, round-trip) in GitHub Actions

**Rationale**: No tests exist; fixtures guard the 133 client-used methods.

**Rejected Options**:
- **E2E / performance suites**: Performance measured at the Phase 6 gate; E2E belongs to webui-* features.

#### Q15: Logging & observability (auto-filled)

**Selected Option**: Structured syslog logging with correlation id

**Rationale**: Minimal footprint for the device.

**Rejected Options**:
- **APM / tracing / metrics stacks**: Too heavy for the device.

#### CQ1: Confirm auto-selected standards

**Selected Option**: Accept all recommendations

**Rationale**: User accepted the auto-selected Q10–Q15 values.

**Rejected Options**:
- **Customize**: Not chosen.

#### AQ1 / AQ2 / AQ4: Skipped

**Selected Option**: Skipped

**Rationale**: AQ1 trigger (`performance` in focus_areas) and AQ2 trigger (`data_integrity`) not met; AQ4 no business-rule set above 10 in analysis. Performance and integrity concerns are handled via risks and Phase 6.

**Rejected Options**:
- None documented

#### AQ3: Module decomposition

**Selected Option**: Single deployable (modular monolith)

**Rationale**: Multiple path groups, one on-device deployable with explicit internal layers.

**Rejected Options**:
- **Separate / grouped services**: Extra daemons on a small device; push gateway remains a gated option.

#### AQ5: Integration layer approach

**Selected Option**: Anti-corruption layer per integration

**Rationale**: Five external systems with inconsistent error contracts; adapters centralize escaping, validation and mapping.

**Rejected Options**:
- **API gateway / ESB / direct point-to-point**: Gateway tied to the gate; ESB overkill; direct is today's weakness.

#### AQ6: Frontend-to-backend connectivity

**Selected Option**: Same-origin via reverse proxy (lighttpd serves SPA and /api/*, no CORS)

**Rationale**: Matches the plan's same-origin-only stance. Only the API side is in `scope.include`; the React app is built by webui-* features, so this is recorded in Section 5, not as a Section 2.3 row.

**Rejected Options**:
- **Separate origins with CORS**: Opt-in later if needed.
- **BFF**: Deferred to the gateway gate.
- **Same as current**: Same practical result, but resolved explicitly to same-origin.

#### AQ7: Frontend API base URL resolution

**Selected Option**: Skipped — frontend not in `scope.include`

**Rationale**: Same-origin implies relative paths; no `base_url_config` defined by this feature.

**Rejected Options**:
- None documented

---

## Consequences

### Positive

- Contract frozen and test-guarded; hardening is safe to ship
- Privilege and injection gaps closed; error leakage removed
- nextGen UI gets batch, bulk read, schema, push, editing and profiles without a new process
- Trivial rollback; no new infrastructure

### Negative

- Tcl and per-request tclsh cost remain; push is long-poll until a gateway is justified
- Some v1 behaviour deliberately tightens (createFile privilege, existsFile path allow-list, backup CGIs, logout without session, help page, error text), departing from legacy NFR-004/006/025
- v2 needs lighttpd route changes coordinated with the external OpenCCU repo

### Architectural Debt

- Mixed encodings (ISO-8859-1/CRLF for patched files, UTF-8 for new)
- v1 quirks preserved (HTTP 200 errors, JS-expression responses, inconsistent error codes)

### Follow-Up Decisions

- Phase 6 gateway adoption (SSE, caching), based on measured latency and load
- Backup CGI removal versus restriction after exposure/caller check
- Deprecation path for the 47 methods with no in-repo client
- Allowed origins if CORS is ever required

---

## Success Criteria

- All 133 client-used methods keep name, parameter set and result shape (golden fixtures); remaining 47 kept, deprecated with a removal path, or removed after confirming no consumer
- binfile/textfile/tarfile.cgi and run-script.cgi removed or ADMIN with path allow-list; CCU.createFile ADMIN-only and CCU.existsFile limited to an exact allow-list (level unchanged for classic UI); no request-controlled path reaches exec unvalidated
- Session.logout requires a valid session; unauthenticated surface limited to an allow-list; GET help page authenticated or reduced
- No response contains errorInfo or filesystem paths; correlation id logged
- Strict mode enforces Content-Type and anti-CSRF header; CSPRNG sid at the maximum of the compatible format (~59.5 bits; 128-bit target relaxed, EG-17) plus opt-in rate limiting (`rate_limit`, default off for v1; enforced on v2/strict)
- Event.subscribe uses the correct checksid script; a real datapoint-change producer or SSE/long-poll is delivered
- Machine-readable schema for every method, used for central validation; batch/multicall available
- Program and room editing and profile endpoints available with ADMIN/USER gating and tests
- www/api no longer drifts
- CI runs Tcl API tests on every PR; dispatcher and every one of the 133 used methods invoked at least once
- Security model equivalent or stronger; zero regression in OpenCCU packaging build

---

## Diagrams

- **diagrams/component-diagram.md**: Target components, external systems and the gated gateway
- **diagrams/sequence-diagram.md**: Hardened strict-mode v2 request and event long-poll
- **diagrams/entity-diagram.md**: Domain model including new schema and fixture entities

---

## Source Documents

- **.migration/webui-api/plan.downstream.json**: migration goal, scope, constraints, risks, success criteria
- **.migration/webui-api/analysis/analysis.json**: user stories SP001–SP047, NFRs, external systems, entities, control flows
- **references/architecture-questions.md, adr-markdown-template.md, output-template.md, pattern-catalog.md, sample-target-architecture.md, sample-adr.md**: questionnaire and document structure

---

## Approval

**Approved by**: claude@hooos.de

**Approved at**: 2026-10-13T20:40:03Z

**Review iterations**: 0

**Notes**: Post-approval amendment 2026-10-14 (SDD specify, EG-3): CCU.existsFile keeps GUEST level with an exact allow-list instead of ADMIN-only, to keep classic UI callers working; CCU.createFile is ADMIN-only. Rate limiting (analyze audit, 2026-10-14): per-IP login and per-sid request limits are an opt-in `rate_limit` config flag, default off for v1 (v1 default behaviour unchanged), and are active in strict/v2 mode or when enabled; the EG-17 brute-force mitigation therefore depends on that. EG-17: the plan's 128-bit sid criterion is relaxed because ReGa mints ids in a 12-char format (option 1; optional v2 128-bit cookie token left as a follow-up). Q1/Q2 were clarified in-session (React + BFF discussion) before the answers were recorded.

**Amendment 2026-10-20 (re-baseline)**: The legacy API tree moved upstream (#193 remove ReGa version selection, #194 recovery mode, #202). The user decided to stay on branch fix/hm-cc-vg-set-temperature-limits and the SDD artifacts were re-baselined to HEAD 1651075b: the registry now has 179 methods (20 namespaces, 182 method scripts; the counts of 183 scripts / 19 namespaces above describe the original baseline). `User.getReGaVersion` and `User.setReGaVersion` were removed upstream, so the unauthenticated allow-list is 8 methods and the v2 profile has no `reGaVersion`. The new ADMIN method `RecoveryMode.enter` is covered under SP034 (System Administration Services, lifecycle control) with the same hardening as SafeMode.enter; `backup/version.cgi` reads /VERSION and `tcl/eq3_old/common.tcl` gained `get_platform`. No architecture decision was changed.

**Amendment 2026-10-20 (user decisions A, B, C; SDD artifacts only)**: (A, EG-3 corrected) The earlier caller search was incomplete; verified classic-UI callers require `CCU.existsFile` (GUEST) exact paths /etc/config/userAckSecurityHint, /etc/config/firewallConfigured, /etc/config/fieldTestActive, /etc/config/showDiagramDatapoints, /media/sd-mmcblk0/measurement, /etc/config/legacyAPIMigrationAccepted plus two anchored patterns for per-user ack files (^/etc/config/userprofiles/userAckInstallWizardId_[0-9]{1,10}$ and ^/etc/config/userprofiles/userAckInstallWizard_[^/\x00]{1,200}$; fixed prefix, '/' excluded, no traversal); `CCU.createFile` (ADMIN) exact paths /etc/config/userAckSecurityHint, /etc/config/firewallConfigured, /etc/config/fieldTestActive, /etc/config/legacyAPIMigrationAccepted. The allow-list principle (exact match, configuration only, level unchanged) is kept. (B, EG-1) The backup CGIs stay at ADMIN + empty path allow-list + fail-closed and are not removed now; deprecation is announced and removal follows in a later release (they are reachable through lighttpd; no callers were found). (C) OpenCCU packaging patches stay downstream: unchanged staged files are verbatim legacy copies (CRLF, ISO-8859-1), changed files are minimal edits with shared helpers in one eq3 library, the 13 rootfs patches touching www/api and www/tcl must keep applying except documented conflicts ("patch N must be regenerated at the next Base bump" in COPY-PLAN.md), enforced by a schema-harness patch-apply gate. No component, protocol or layering decision was changed.
