# Migration Plan: Migrate src-feature--rfd (BidCoS-RF radio daemon)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: contract-preservation (retain / minimal-change; not a UI migration target)

---

## Recommendation (summary)

**RETAIN, with a thin WRAP at the UI boundary and a small set of MINIMAL-CHANGE hardening items.** Do not replace `rfd` for the nextGen UI. The only coupling between the UI and `rfd` is the XML-RPC protocol on TCP 2001 (about 50 methods), consumed through `tclrpc.so` by the JSON-RPC backend (`/api/homematic.cgi`) and by the closed-source ReGaHss. The nextGen UI must never speak XML-RPC to `rfd` directly; it talks to the JSON-RPC layer (`webui-api`), which is the wrap. The `rfd` wire contract is frozen for the lifetime of the UI renovation.

| Option | Verdict | Reason |
|--------|---------|--------|
| Retain unchanged | Acceptable baseline | Zero UI risk; leaves `exit(0)` and bind-all defaults |
| Wrap (JSON-RPC/Tcl facade, already exists) | **Recommended for UI access** | UI reaches rfd only via `webui-api`; new needs (events, batch, typed errors) are solved in the facade, not in rfd |
| Minimal-change in rfd | **Recommended, opt-in, low-risk** | Fix `exit(0)`, default bind to loopback, UDS permissions, key-file permissions; no protocol change |
| Replace (rewrite / other BidCoS stack) | Rejected | ~29.8k LOC native domain model, closed consumer (ReGaHss), no tests, high regression risk, zero UI benefit |

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--rfd | primary | index.json | BidCoS-RF daemon, `src/rfd` (135 files, ~29.8k LOC), version 2.6.2; XML-RPC on TCP 2001 plus optional Unix socket |
| 2 | webui-api | dependency | index.json | JSON-RPC CGI; 51 method scripts call rfd/hs485d via `tclrpc.so`; this is the UI-facing wrapper |
| 3 | bin-feature (ReGaHss, closed source) | dependency | index.json | Primary XML-RPC client; registers via `init` and `InterfacesList.xml`; receives events from rfd callbacks |
| 4 | src-feature--multimacd / eq3_char_loop | dependency | index.json | Radio coprocessor multiplexer; feeds rfd through `/dev/eq3loop` slave `mmd_bidcos` |
| 5 | src-feature--hss_led, SetInterfaceClock | affected | index.json | XML-RPC clients of rfd (`setRFLGWInfoLED`, `setInterfaceClock`); also rfd -> `hss_led` via UDP 8182 |
| 6 | libXmlRpc, libhsscomm, libelvutils, libxmlparser, libLanDeviceUtils, libUnifiedLanComm | dependency | index.json | Link-time dependencies of rfd |
| 7 | OpenCCU packaging repo (external) | affected | user | Remaps rfd port to 32001 in OCI/HA/Helm; hand-synchronised port contract |

---

## Context

### Summary

`rfd` is the HomeMatic BidCoS-RF central daemon. It owns the domain model of paired RF devices (devices, channels, paramsets, links, teams, AES keys, metadata, firmware updates) and talks to one or more BidCoS interfaces: the built-in radio module (`/dev/hss_rf` via multimacd), LAN gateways, USB interfaces (optional, `HAS_USB_SUPPORT`) and the CCU2-style coprocessor. It exposes the model over XML-RPC (TCP 2001, config `Listen Port`; optional Unix socket `UDS File`). The runtime is a single-threaded reactor (XmlRpc dispatcher `work(timeout)` plus `TimerQueue`, `rfd.cpp:~395`) with worker threads inside the interface classes. Configuration comes from `/etc/config/rfd.conf` (or `/etc/bidcos/bidcos.conf`, or `-f`). Interface types: CCU (built-in), LAN, USB, CCU2.

### Migration Drivers

- The nextGen UI renovation does not need a new rfd. The driver is to keep the rfd contract stable and to remove hazards that would surface once the UI exposes more functions (pairing, link editing, firmware update) to more users.
- Supervisor-hostile failure mode: fatal init errors and bind failures call `exit(0)` (8 occurrences in `rfd.cpp`; `rfd.cpp:342-345, 376-379`), so a failed start looks like success.
- Unauthenticated XML-RPC surface: bind address defaults to empty (all interfaces, `rfd.cpp:19, 338-345`), no auth in the daemon; UDS proxy has no explicit permissions (`rfd.cpp:352`).
- AES key material is persisted in plaintext when `Persist Keys=1` (`RFManager.cpp:1092`), and the sample `rfd.conf` enables it.
- No tests for rfd (only `tests/test-components.py`, devicetype-strip test and `LedControllerTest` exist), and partial documentation (device model, BidcosFrame decoding and LGW protocol were not analysed).
- Windows leftovers not built by CMake (`win32_service.*`, `hid/*`, `CCU2SerialPortWrapperWin32.*`, `rfd-nmake.mk`, `#ifdef WIN32` branches) and `run_rfd.sh` with non-existent paths.

### Current State

Native C++11 daemon (`cxx_std_11`, `-Wall`, `PRODUCTION=1`) built by CMake, staged to `bin`, running on embedded Linux (OpenCCU / CCU3-class) and in containers (OCI, Home Assistant, Helm) from the sibling packaging repo. Links `elvutils`, `hsscomm`, `xmlparser`, `XmlRpc`, `LanDeviceUtils`, `UnifiedLanComm`, `pthread`, `crypto`, `m`, plus libusb-1.0 when `HAS_USB_SUPPORT`. State on disk: per-device XML (`Device Files Dir`), key database (`Key File`), `Address File`, `/etc/config/central_peers`, firmware dirs, pid file, startup-complete marker in `StatusfileDir` (default `/var/status/`). No database. Also acts as XML-RPC client toward registered callback receivers (event delivery after `init`) and as UDP status producer to `hss_led` (127.0.0.1:8182, task id `RFD`) via `HSSManager` subclass `RFManager`.

### Cross-Cutting Findings

- Integration seam: XML-RPC TCP 2001 (about 50 methods) is the primary service API toward ReGaHss and the WebUI backend; param-level schemas are not documented (`api-contracts.md`, "Not covered").
- `tclrpc.so` `xmlrpc` command is latin-1 only; every UI-visible string passing through rfd (device names, metadata) inherits that limit (`integration-seams.md`).
- `webui-api`: 51 method scripts use XML-RPC to rfd/hs485d; JSON-RPC has no push events (Event.poll only init/delete) and no batch call, so the UI cannot observe rfd events without a facade change.
- Security: no auth on 2001, bind-all default, plaintext AES key persistence, UDS permissions unset; port contract 32001 in containers is hand-synchronised.
- Tech debt: `exit(0)` on fatal errors; `SetInterfaceClock` casts epoch to 32-bit int (2038); Windows leftovers; ISO-8859-1 German comments; partial docs for rfd.
- Testing: no unit, protocol or integration tests for rfd or its XML-RPC methods.
- Kernel/driver coupling: rfd reaches the radio through `/dev/hss_rf` or multimacd slave `mmd_bidcos` (eq3loop ioctl numbers hand-copied; replacing the kernel module requires changing slave consumers).
- External: packaging repo pins this repo by SHA; any rename of config keys, ports or pid/status files breaks its rootfs overlays and service scripts.

---

## Migration Goal

**Keep rfd as the stable BidCoS-RF back end of the nextGen UI: freeze and document its XML-RPC contract, harden start-up and exposure with minimal changes, and shield the UI behind the JSON-RPC facade.**

The UI renovation is delivered without modifying rfd behaviour visible to ReGaHss, hs485d-adjacent tooling or the packaging repo. The goal is (1) a contract test baseline for the 50 XML-RPC methods, (2) correct exit codes and safer defaults, (3) a documented mapping of which UI JSON-RPC methods reach which rfd methods, so UI phases can be planned without touching native code.

---

## Decision

### Approach: Retain with wrap (facade) and minimal-change hardening

Leave `src/rfd` functionally unchanged. UI access stays behind `/api/homematic.cgi` (Tcl scripts via `tclrpc.so`). Any new UI capability that needs rfd data (device events, link editing, service messages) is added as JSON-RPC methods or facade logic in `webui-api`, calling existing rfd methods (`listDevices`, `getParamset`, `putParamset`, `getLinks`, `addLink`, `getServiceMessages`, `listBidcosInterfaces`, `rssiInfo`, ...). Opt-in minimal-change patches to rfd: non-zero exit codes on fatal errors, loopback/UDS default, restrictive UDS and key-file permissions, 64-bit time at the `setInterfaceClock` boundary (client side), removal of unbuilt Windows code.

**Rationale**: Replacement is not justified by evidence: (1) the XML-RPC contract is consumed by closed-source ReGaHss (`integration-seams.md` section 4.3, `api-contracts.md`), so any protocol change is unverifiable and potentially breaks all devices; (2) the domain model (`RFDevice` 1876 lines, `RFChannel` 1870, `BidcosInterfaceConcentrator` 1077, `XmlRpcMethods.cpp` 1275) was not analysed in depth and has no tests; (3) the UI needs nothing from rfd that the facade cannot provide; (4) the real defects (`exit(0)`, bind-all, plaintext keys) are small, local, and fixable without redesign.

### Rejected Options

- **Replace rfd (rewrite in a memory-safe language or adopt a third-party BidCoS stack)**: ~29.8k LOC of hardware-specific behaviour (AES challenge/ack timing partly in multimacd, LGW reconnect logic, OTAU firmware), no tests, closed consumer; cost and regression risk far exceed UI benefit.
- **Expose rfd XML-RPC directly to the browser (or via a generic HTTP proxy)**: no auth, no CORS/CSRF story, latin-1 limits, ~50 methods with undocumented param schemas; would bypass the ADMIN/USER/GUEST privilege model enforced in the JSON-RPC layer.
- **Change the rfd wire protocol (JSON-RPC, gRPC, REST) in place**: breaks ReGaHss, `SetInterfaceClock`, `hss_led` and the packaging repo ports; no gain for the UI.
- **Retain strictly unchanged (no hardening)**: leaves supervisors blind to failed starts and widens the exposure as the UI promotes more admin functions.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C++11 (`cxx_std_11`), some C; Tcl clients | C++11 retained (optionally raise to C++17 only for touched files; not required) |
| Frameworks | libXmlRpc (in-tree), libelvutils, libhsscomm, libxmlparser (modified Frank Vanden Berghen V1.14, LGPL 2.1), OpenSSL libcrypto, optional libusb-1.0 | Unchanged |
| Build | CMake / Make, `PRODUCTION=1`, `HAS_USB_SUPPORT` option | Unchanged; add a contract-test target |
| Infrastructure | Embedded Linux (OpenCCU / CCU3-class), `/dev/hss_rf`, multimacd + `/dev/eq3loop`; OCI / Home Assistant / Helm via packaging repo; GitHub Actions CI (x86_64) | Preserved |
| Protocol | XML-RPC over TCP 2001 (32001 in containers), optional Unix socket | Unchanged |

---

## Scope

**Mode**: targeted

### Included Components

- `src/rfd/**` (135 files): `rfd.cpp`, `XmlRpcMethods.cpp`, `RFManager.*`, `RFController.*`, `BidcosInterface*`, `BidcosInterfaceConcentrator.*`, `BidcosLan*`, `hm2/*`, `rfd.conf` sample, `CMakeLists.txt`, `version.sh`
- Contract documentation and contract tests for the 50 XML-RPC methods (new artefacts, outside rfd sources)
- Minimal-change hardening items listed under Focus Areas

### Excluded Components

- `src/multimacd`, `src/eq3_char_loop`, `src/hs485d` (separate features; coupling noted only)
- Closed-source `bin/ReGaHss` (consumer, not modifiable)
- All UI features (webui-*, www) except as consumers of the facade
- Firmware, `opt`, `usr`, `etc` config generation (runtime `rfd.conf` is generated elsewhere)

### Critical Components

- `XmlRpcMethods.cpp` (method registry, ~50 methods)
- `BidcosInterfaceConcentrator` (multi-thread de-duplication, AES challenge routing, firmware frames)
- `RFManager` (config keys, key persistence, event delivery, UDP status)
- `rfd.cpp` (startup, bind, exit paths, init-done marker)

### Boundaries

- Network boundary: TCP 2001 and UDS are the only supported entry points; browsers never connect.
- Kernel boundary: `/dev/hss_rf`, `/dev/eq3loop` slave `mmd_bidcos`.
- Process boundary: callbacks to ReGaHss event receiver; UDP to `hss_led`.

---

## Dependencies

### Internal

- `src/libXmlRpc` (server and client), `src/libhsscomm` (`HSSManager`, UDP status feed), `src/libelvutils` (`PropertyMap`, config), `src/libxmlparser` (device description XML), `src/libLanDeviceUtils`, `src/libUnifiedLanComm` (LAN gateway; see weak crypto in UnifiedLanCommController.cpp:464-483), `src/libelvutils` AES helpers
- `src/multimacd` + `src/eq3_char_loop` (radio path, shared ioctl numbers)
- `src/hss_led` (consumes UDP 8182 status and `setRFLGWInfoLED` calls), `src/SetInterfaceClock`
- `src/webui` JSON-RPC method scripts and `tclrpc.so` (consumers)

### External

- ReGaHss (closed source): registers via `init`, reads `InterfacesList.xml`, receives event callbacks
- OpenSSL libcrypto; libusb-1.0 (optional)
- Radio hardware: built-in module, LAN gateways (HM-LGW), USB interface, CCU2 coprocessor
- OpenCCU packaging repo: remaps rfd to 32001, owns service scripts, `rfd.conf` generation, pid/status file expectations

---

## Constraints

### Unchanged

- XML-RPC method names, parameter types and fault semantics for all ~50 methods (listDevices, getDeviceDescription, getParamset, putParamset, getValue, setValue, addLink, removeLink, init, setInstallMode, changeKey, updateFirmware, listBidcosInterfaces, getServiceMessages, setInterfaceClock, setRFLGWInfoLED, ping, getVersion, ...)
- Default port 2001 and `/etc/rfd.port` convention (read by `SetInterfaceClock` and `hss_led`); container port 32001 mapping
- Config file locations and key names (`/etc/config/rfd.conf`, `/etc/bidcos/bidcos.conf`; `Listen Port`, `Listen IP`, `UDS File`, `PID File`, `Persist Keys`, `Key File`, `Device Files Dir`, interface section keys `Type`, `Port Type`, `Host`, `Port`, `Serial Number`, `IP Address`)
- On-disk persistence formats (per-device XML, key database, `central_peers`), so paired devices survive upgrades
- UDP status feed format `"<task_id>\n<KEY>=<value>\n"` to 127.0.0.1:8182 with sender `RFD`
- pid file and startup-complete marker semantics (consumed by hss_led liveness check and init scripts)
- Interface types CCU / LAN / USB / CCU2 and the `/dev/hss_rf` path

### Integration Systems

- ReGaHss (XML-RPC client and callback receiver)
- WebUI JSON-RPC backend via `tclrpc.so` (latin-1 `xmlrpc` command)
- `hss_led`, `SetInterfaceClock`
- multimacd / `/dev/eq3loop`
- OpenCCU packaging repo (ports, rootfs patches)

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|----------|
| high | XML-RPC contract is the single coupling to ReGaHss and the UI backend; param schemas undocumented; any change silently breaks closed-source consumers | Freeze the contract; record request/response fixtures from a live rfd; add contract tests; wrap, never alter | api-contracts.md "Not covered"; integration-seams.md 4.3 |
| high | No tests for rfd or its XML-RPC layer; regressions in minimal-change patches go undetected | Build a contract-test harness (XML-RPC client against rfd with a LAN/TCP mock interface) before any patch | testing.md; technical-debt.md |
| high | Unauthenticated XML-RPC bound to all interfaces by default; a more capable UI raises the value of the target (pairing, key change, firmware update) | Default `Listen IP` to loopback (or restrict via packaging repo); set UDS mode; keep UI access only via JSON-RPC with privilege levels | rfd.cpp:19, 338-345, 352; security.md |
| medium | `exit(0)` on fatal init/bind errors hides failures from supervisors and from the UI health view | Return non-zero from error paths; verify init scripts and Home Assistant/Helm health checks treat non-zero as restart | rfd.cpp:342-345, 376-379; technical-debt.md |
| medium | Plaintext AES key persistence with `Persist Keys=1` (sample enables it) | Restrict file mode (0600) and directory ownership; document; consider optional encryption at rest later | RFManager.cpp:1092; security.md |
| medium | Packaging repo and container port contract (2001 vs 32001) hand-synchronised; config key/path changes break rootfs patches | Treat paths, keys, ports as frozen; coordinate any change with the packaging repo by SHA bump | external-context/summary.md |
| medium | Only partially analysed: device model, `BidcosFrame*` decoding, `hm2/LGWPortWrapper`, firmware manager, XML-RPC client side (callbacks) | Re-run deep-explore on these before any code change beyond the listed hardening | src.md "NOT analyzed" list |
| medium | Multi-threaded interface layer (3 mutexes + condvar in concentrator, async reconnect in LGWPortWrapper) in a daemon with no tests; hardening patches near these areas risk deadlocks | Keep patches out of the concurrency paths; use ThreadSanitizer on the mock harness | src.md Concurrency section |
| low | Latin-1-only `xmlrpc` command in `tclrpc.so` truncates non-Latin-1 device names shown in the new UI | Handle in the facade (charset conversion) or fix in `tclrpc.so`; not an rfd change | integration-seams.md |
| low | Windows leftovers and `run_rfd.sh` stale paths confuse maintainers | Remove dead files after confirming no packaging use | technical-debt.md |

---

## Success Criteria

- No change to rfd XML-RPC behaviour observable by ReGaHss, `hss_led`, `SetInterfaceClock` or the JSON-RPC backend (contract tests green before and after every patch)
- A documented contract (method list with param/return types and fault codes) exists for all ~50 methods, plus a mapping JSON-RPC method -> rfd method for the 51 `webui-api` scripts
- Contract-test baseline covers at least the methods used by the UI backend and ReGaHss (device/paramset/link/install-mode/service-message/interface methods)
- Fatal init and bind errors exit non-zero; supervisor restarts verified on OCI, Home Assistant and Helm packaging
- Default exposure restricted (loopback or UDS) without breaking the packaging repo; key file and UDS permissions are restrictive
- The nextGen UI never opens a connection to port 2001/32001; all UI data from rfd flows through the JSON-RPC facade
- Existing paired devices, links and keys survive upgrade (persistence formats unchanged)
- All existing functionality retained; zero regression bugs in radio pairing, parameter read/write and firmware update

---

## Focus Areas

1. Freeze and document the XML-RPC contract (method list in `XmlRpcMethods.cpp`, param schemas, fault codes, init/callback handshake with ReGaHss)
2. Contract-test harness against a mock interface (LAN/TCP `Port Type`) in CI, runnable on x86_64
3. Minimal-change hardening: non-zero exit codes (8 `exit(0)` sites), loopback default for `Listen IP`, UDS and key-file permissions
4. UI-boundary design with `webui-api`: map JSON-RPC methods to rfd methods; define what the nextGen UI needs (events, service messages, link editing) and implement in the facade, not in rfd
5. Coordination with the packaging repo: port 32001, config generation, pid/status markers, service scripts, health checks
6. Complete the partial analysis of device model, frame decoding, LGW protocol and callback delivery before any deeper change
7. Dead-code cleanup (Windows leftovers, `run_rfd.sh`, unused `PIDFILE`/`UDS_PATH` constants) as low-priority hygiene

---

## Consequences

### Positive Outcomes

- UI renovation proceeds independently of native code; zero risk to radio pairing and device control
- Supervisors detect rfd start failures; smaller default attack surface
- First automated tests for the rfd contract; reusable for hs485d
- Clear contract documentation lowers the cost of later replacement if ever needed

### Negative Outcomes

- Technical debt in the device model, threading and C++11 style remains
- Latin-1 limitation and absence of push events must be solved in the facade, adding complexity to `webui-api`
- Loopback default may require packaging-repo changes for users who connect external clients to rfd

### Follow-Up Decisions

- Whether to default `Listen IP` to loopback in the repo or only in packaging
- Whether rfd should eventually offer a push/event channel (e.g. long-poll via facade versus native)
- Whether to keep USB (`HAS_USB_SUPPORT`) and CCU2 interface types in scope long term
- Whether to encrypt AES key storage at rest
- Joint decision with hs485d and multimacd features on a shared contract-test framework

---

## Source Documents

- `.migration/plan-context.md` - Shared planning context
- `.migration/docs/modules/src.md` - rfd and multimacd sections (parts 1 and 1b)
- `.migration/docs/cross-cutting/integration-seams.md` - XML-RPC, UDP status feed, eq3loop seams
- `.migration/docs/cross-cutting/api-contracts.md` - XML-RPC overview and gaps
- `.migration/docs/cross-cutting/technical-debt.md` - `exit(0)`, Windows leftovers, partial docs
- `.migration/docs/cross-cutting/security.md` - exposure and key-material findings
- `.migration/docs/cross-cutting/testing.md` - test coverage gaps
- `.migration/docs/external-context/summary.md` - port contract and packaging repo
- `.migration/plan/webui-api.plan.md` - UI-facing wrapper (consumer of rfd)

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

