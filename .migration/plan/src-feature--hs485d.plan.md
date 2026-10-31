# Migration Plan: Assess hs485d (BidCoS-Wired daemon) and hs485dLoader

**Status**: assessed | **Date**: 2026-10-09 | **Type**: native-backend-retention-assessment (no UI migration; coupling and risk assessment toward the nextGen UI)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--hs485d | primary | index.json | `src/hs485d` (68 files, ~11.2k LOC C++11) and `src/hs485dLoader` (2 files, 338 LOC): HomeMatic Wired daemon plus launcher/supervisor |
| 2 | src-feature (libhsscomm, libXmlRpc, libUnifiedLanComm, libLanDeviceUtils, libelvutils, libxmlparser) | dependency | index.json | Link-time dependencies of hs485d (`src/hs485d/CMakeLists.txt`); assessed in sibling src-feature plans, not here |
| 3 | src-feature (hss_led, eq3configd / libeq3config) | affected | index.json | hss_led receives UDP status from hs485d (127.0.0.1:8182); libeq3config `update-lgw-firmware` / `setlgwkey` act on the same LGW |
| 4 | webui-api, webui-config-pages | affected | index.json | Consume hs485d through `Interface.*` JSON-RPC wrappers, `cp_maintenance.cgi`, `cp_add_device.cgi`, `ic_deviceFirmwareOverview.cgi`; assessed in their own plans |

---

## Context

### Summary

hs485d is the native daemon for HomeMatic Wired (BidCoS-Wired / HS485). It exposes an XML-RPC server on TCP 2000 (configurable through `Listen IP` / `Listen Port`) with 25 registered methods plus the `init` event-callback mechanism. It talks to wired bus devices either through the local RS-485 UART (`/dev/hss_rs485`, "CCU1 mode") or, as the only mode reachable through the config path, through an encrypted HMW-LGW LAN gateway (TCP 1000). hs485dLoader is a small supervisor. It parses `hs485d.conf` and adds or removes a `BidCos-Wired` `<ipc>` entry (`xmlrpc_bin://127.0.0.1:<port>`) in `/etc/config/InterfacesList.xml`, which is how the closed-source ReGaHss binary learns of the interface. It then forks and execs `/bin/hs485d -g -i <id> -f <conf>` in a restart loop.

The daemon is not a UI component and is not a target of the nextGen UI renovation. It matters to the UI project only as a contract boundary: the WebUI reaches it indirectly (JSON-RPC `Interface.*` Tcl wrappers over XML-RPC, and direct `xmlrpc` calls from `cp_maintenance.cgi` / `cp_add_device.cgi`), and ReGaHss reaches it directly.

### Migration Drivers

- No driver forces a change to hs485d for the UI renovation. The UI work only needs the XML-RPC surface and the `InterfacesList.xml` registration to stay stable.
- Latent defects in the loader and the daemon (see Risks) are worth fixing opportunistically, since a regression-free fix is cheap and the code is touched rarely.
- Security: the LGW key is hard-coded elsewhere in the stack ("Markus is awesome", crypttool.cpp / eq3configd main.cpp) and the IV is predictable in libUnifiedLanComm (`UnifiedLanCommController.cpp:464-483`). hs485d reaches the LGW through this library, so the weakness is inherited. The XML-RPC listener is unauthenticated plain HTTP on TCP 2000.
- Documentation and test gaps: there are no tests for hs485d or hs485dLoader (the repository's only tests are `tests/test-components.py`, the build-tools strip test and the `hss_led` LedControllerTest).

### Current State

Native C++11 daemon built with CMake (`openccu_stage_target`), shipped inside the OpenCCU root file system. Runs under `hs485dLoader` on the CCU (arm/x86_64 Buildroot images, built in the sibling repo `/home/standard/dev/OpenCCU`, which pins this repo by SHA). Containers (OCI, Home Assistant, Helm) use the hand-synchronised port contract hs485d 32000 / rfd 32001 / ReGa 8183,1998. The daemon runs a single-threaded loop that combines XML-RPC sockets, the comm controller (as a `ReadableEvent` source) and the timer queue (`hs485d.cpp:423-431`). The RX thread hands messages to that loop through an in-process `CommMessageQueue` plus a self-pipe wake-up (`HS485Controller.cpp:61-71`).

### Cross-Cutting Findings

- Integration seam "msmq" was a false positive. It is the in-process `CommMessageQueue` (mutex and condvar, priority list) with a self-pipe, not an IPC queue (integration-seams.md section 1). The risk is LOW; the HS485 sequence-counter logic (`CheckRxCounter`, `UpdateControlChar`) is the hard part.
- hs485dLoader usage text says `-ilf` but the code parses `-ilp` (`hs485dLoader.cpp:332` vs `:84`) (technical-debt.md).
- `find_last_of("</interfaces>")` (`hs485dLoader.cpp:236`) is a character-set search, not a substring search, so the insertion point in `InterfacesList.xml` can be wrong for unusual file contents.
- The loader's stop condition (EACCES/ENOEXEC) checks `retVal`, which is reset each iteration, so it is effectively unreachable. The loader also never reads the child's exit status, although hs485d documents exit code 2 as "hs485dLoader checks that" (`hs485d.cpp:277`).
- `HS485_RESPONSE_TIMEOUT` comment says 10 ms, value is 200 (`HS485ControllerCCU1.cpp:22`).
- `SIGTERM` / `SIGINT` handlers are commented out (`hs485d.cpp:148-149`), so shutdown relies on external kill and the pid file is not removed cleanly. `activateLinkParamset` is implemented but unregistered (`XmlRpcMethods.cpp:635`). The UDS server is commented out (`hs485d.cpp:405-409`).
- The LGW TCP port 1000 and the XML-RPC port 2000 default are hard-coded. Windows leftovers (`win_pipe.*`, `.vcproj`, `Makefile.bindist`) are not part of the CMake build.
- Unread: the class bodies and the LGW files (`HMWLGWCommand`, `HMWLGWTransportFrame`, `HS485CommMessageLGW`, `HS485ControllerLGW.cpp`), `eq3configd` UDP discovery framing, and the `libhsscomm` converter bodies. This plan rests on headers, entry points and grep evidence, not on full code reading.
- XML-RPC types (`XmlRpcValue`, `XmlRpcException`) are used as the in-memory data model in the channel, central and controller classes (integration-seams.md 4.5). The daemon's core is therefore tightly bound to libXmlRpc, which makes a piecemeal rewrite expensive.

---

## Migration Goal

**Retain hs485d and hs485dLoader unchanged as a stable native backend, pin the contracts the nextGen UI depends on, and apply only minimal, low-risk defect fixes.**

The nextGen UI should treat hs485d as a fixed service behind the existing `Interface.*` JSON-RPC wrappers. Success is defined as: the UI renovation needs zero source changes in `src/hs485d` or `src/hs485dLoader`, and the contracts (XML-RPC method set and semantics, `InterfacesList.xml` registration, config file keys, status files) are written down and regression-checked so that they stay unchanged.

---

## Decision

### Approach: Retain with minimal change (contract pinning plus opportunistic loader fixes)

The recommendation is **retain / minimal-change**, with an optional thin **wrap** later at the JSON-RPC layer, not in the daemon:

1. Retain the hs485d binary, its XML-RPC server and its LGW transport as is.
2. Minimal-change only the loader defects that are clearly bugs and can be verified in isolation: the `-ilf` / `-ilp` mismatch, the `find_last_of` character-set search (use `rfind("</interfaces>")`), the unreachable EACCES/ENOEXEC exit (evaluate `WEXITSTATUS` of the child, or remove the dead condition), and the misleading `HS485_RESPONSE_TIMEOUT` comment. These stay behaviour-compatible, with one possible exception: the termination behaviour must be decided explicitly first (see Follow-Up Decisions).
3. Add no UI-facing capability to the daemon. Any new UI need (for example a modern event feed) belongs in the JSON-RPC / Tcl layer (`webui-api`), which wraps XML-RPC.

**Rationale**: Migration is not necessary for the UI goal. (1) hs485d has a stable public contract of 25 XML-RPC methods, shared with ReGaHss, which is closed source and cannot be modified. (2) The daemon is ~11k LOC with device and converter semantics (EEPROM cache, frame sequence counters, firmware update) that cannot be exercised without hardware, and the repository has no tests for it. (3) The in-memory model is built on `XmlRpcValue`, so a rewrite would touch almost every class. (4) The sibling OpenCCU repo and the three container targets pin the port and file-layout contracts by hand. (5) Wired devices are a legacy product line, so the investment value of a rewrite is low. The risk-weighted best option is therefore to leave the code alone, protect the interfaces and fix only provable defects.

### Rejected Options

- **Replace (rewrite in Rust/Go/modern C++)**: high risk and no UI benefit. It is not testable without hardware, and it would need to replicate undocumented HS485 frame, sequence-counter, EEPROM-cache and LGW protocol behaviour. The LGW and class bodies have not even been read yet.
- **Wrap (new gateway process in front of hs485d)**: adds a hop and a new failure mode. ReGaHss registers directly against the hs485d port through `InterfacesList.xml`, so a wrapper would have to impersonate that endpoint. If a UI-friendly API is needed, wrap in the Tcl/JSON-RPC layer instead.
- **Refactor in place (remove the XmlRpcValue data model, add threads, signal handling)**: valuable for maintainability but out of scope for the UI renovation and untestable today. Defer until a hardware-in-the-loop or simulated-LGW test harness exists.
- **Fold hs485dLoader into hs485d or into the init system**: possible, but it changes the process model that the Buildroot overlay relies on (pid file, restart loop). Not justified now.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C++11 (`cxx_std_11`), 33 `.cpp` in hs485d; C++ loader | Unchanged (C++11). Optional bump to C++17 only if the whole native toolchain moves |
| Frameworks | In-repo libs: libhsscomm, libXmlRpc (XmlRpc++ derivative, plain HTTP, no TLS), libUnifiedLanComm, libLanDeviceUtils, libelvutils, libxmlparser (Vanden Berghen V1.14); pthread; OpenSSL libcrypto | Unchanged. libcrypto update follows the OS/Buildroot cadence |
| Infrastructure | CMake, GitHub Actions CI (x86_64 only), Buildroot packaging in the sibling repo; OCI / Home Assistant / Helm containers with ports 32000/32001 | Unchanged |

---

## Scope

**Mode**: targeted

### Included Components

- `src/hs485d` (daemon, XML-RPC method table `XmlRpcMethods.cpp`, controllers CCU1/LGW, LGW transport, `HS485Manager` and the device model)
- `src/hs485dLoader` (`hs485dLoader.cpp`, `CMakeLists.txt`)
- The interface contract documents to be produced: method list, `InterfacesList.xml` entry format, `hs485d.conf` keys, status and pid files

### Excluded Components

- `src/rfd`, `src/multimacd`, the HmIP server (other interface daemons)
- The shared libraries as migration subjects (libhsscomm, libXmlRpc, libUnifiedLanComm, libLanDeviceUtils); they are noted as dependencies only
- `src/eq3configd`, `libeq3config` and `hss_led` (separate sub-features)
- All `webui-*` and `www` features (UI migration targets with their own plans)
- ReGaHss (closed binary), the kernel drivers (`eq3_char_loop`, `bcm2835_raw_uart`), and the Buildroot repo

### Critical Components

- `src/hs485d/XmlRpcMethods.cpp` (public API of the daemon)
- `src/hs485d/hs485d.cpp` (startup, config, event loop)
- `src/hs485dLoader/hs485dLoader.cpp` (`updateInterfacesXML` :213-269 edits a system config file shared with rfd and the HmIP server)
- `src/hs485d/HS485Controller.cpp` (frame sequence counters)
- `src/hs485d/LGWPortWrapper.cpp` (reconnect, connstat status files)

### Boundaries

- The north boundary is XML-RPC on TCP 2000 (and the `init` callbacks pushed to registered clients through `system.multicall` of `event`). It must not change for the UI or ReGaHss.
- The south boundary is `/dev/hss_rs485` or HMW-LGW TCP 1000.
- The file boundary is `/etc/config/hs485d.conf`, `/etc/config/InterfacesList.xml`, `/etc/hs485d.port`, `/var/status/<serial>.connstat`, `/var/hs485d.pid`, `/var/run/hs485dLoader.pid`.
- The UDP status feed to hss_led on 127.0.0.1:8182 (sender id `HS485D`) is part of the boundary.

---

## Dependencies

### Internal

- libhsscomm (CommController, CommMessageQueue, HSSManager event fan-out, device model, type converters), libXmlRpc (server and client), libUnifiedLanComm and libLanDeviceUtils (LGW transport and discovery), libelvutils (TimerQueue, PropertyMap, logging), libxmlparser (device type XML)
- hs485dLoader depends on elvutils and xmlparser, and duplicates `trim` / `readPortFromFile` from `SetInterfaceClock`
- Consumers: ReGaHss (closed binary, via `InterfacesList.xml`), the Tcl layer `api/eq3/ipc.tcl` and the `Interface.*` JSON-RPC wrappers (`setvalue`, `putparamset`, `getlinks`, `updatefirmware`, `getLGWStatus`), `cp_maintenance.cgi` (direct `logLevel` call, `HS485D_URL` built from `EQ3_SERVICE_HS485D_PORT`), `cp_add_device.cgi`, `ic_deviceFirmwareOverview.cgi` (interface id `BidCos-Wired`), `libeq3config` LGW firmware/key commands

### External

- HMW-LGW LAN gateway (TCP 1000, encrypted; discovery by serial through UDP broadcast)
- Wired bus devices via RS-485 UART `/dev/hss_rs485` (CCU1 mode, kernel driver outside this feature)
- Device description XML in `/firmware/hs485types`, user types in `/etc/config/hs485types`, device files in `/etc/config/hs485d`
- ReGaHss (closed binary, registers via `xmlrpc_bin://127.0.0.1:<port>`; how it selects the protocol is unverified)
- OpenSSL libcrypto; the sibling repo `/home/standard/dev/OpenCCU` (Buildroot packaging and port contract)

---

## Constraints

### Unchanged

- The 25 registered XML-RPC methods, their parameters, return shapes and fault codes (for example -3 "Unknown paramset"), including the `init(url, id[, no_callback])` handshake and the `newDevices` / `deleteDevices` / `replaceDevice` / `event` callbacks
- The `InterfacesList.xml` entry written by the loader: `<ipc><name>BidCos-Wired</name><url>xmlrpc_bin://127.0.0.1:<port></url><info>BidCoS-Wired</info></ipc>`, and the 2000 default port from `/etc/hs485d.port`
- The `hs485d.conf` keys: `Log Destination`, `Log Filename`, `Log Level`, `Listen IP`, `Listen Port`, `[Interface N]` with `Type=HMWLGW`, `Serial Number`, `Encryption Key`, `IP Address`
- The status and pid files that other components check (`/var/status/<serial>.connstat`, existence checked by the WebUI; `/var/hs485d.pid`; `/var/run/hs485dLoader.pid`)
- Exit code 2 meaning "mandatory config missing", and the loader invocation `hs485d -g -i <id> -f <conf>`
- The container port contract hs485d 32000 and the CLI flags used by the Buildroot packaging

### Integration Systems

- ReGaHss (closed source), the Tcl-side `xmlrpc` client (tclrpc.so) and the JSON-RPC `Interface.*` methods
- rfd and the HmIP server, which share `InterfacesList.xml` with the loader
- hss_led (UDP 8182), eq3configd and libeq3config (LGW firmware update, key setting)
- Sibling OpenCCU Buildroot repo, with OCI / Home Assistant / Helm ports

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|----------|
| high | Unauthenticated, plain-HTTP XML-RPC listener on TCP 2000 (configurable `Listen IP`); any local or, if bound externally, network client can call `putParamset`, `setValue`, `updateFirmware`, `deleteDevice` | Keep the default bind on loopback and document it; if containers expose 32000, restrict at the network layer. Do not widen exposure in the UI work. A later hardening step belongs in a separate security feature | integration-seams.md 4.1; src.md part 1c (libXmlRpc has no TLS) |
| high | No automated tests for hs485d, hs485dLoader or the LGW protocol, and no hardware-free harness. Any change risks silent regression on wired installations | Limit changes to the four named loader/comment defects; add a unit test for `updateInterfacesXML` on sample XML files (it is a pure file function) and an XML-RPC method-list contract check against the introspection output | testing.md; technical-debt.md |
| medium | Loader defect `find_last_of("</interfaces>")` can insert the `<ipc>` entry at a wrong position in `InterfacesList.xml`, a file shared with rfd and HmIP and read by ReGaHss | Replace with `rfind`, add fixtures with and without trailing newline, no entries, and an existing BidCos-Wired entry; keep the `.new`/`.bak`/fsync/rename write pattern | hs485dLoader.cpp:236, 213-298 (technical-debt.md) |
| medium | The loader restart loop never ends because the EACCES/ENOEXEC check is unreachable, and the child exit status is ignored. A misconfigured or missing `/bin/hs485d` leads to a tight fork-exec loop | Evaluate `WEXITSTATUS` and add a restart back-off; decide explicitly whether exit 2 should stop restarts. This changes runtime behaviour, so gate it behind a decision | hs485dLoader.cpp:134-170; hs485d.cpp:277 |
| medium | The contract with the closed ReGaHss (`xmlrpc_bin://` scheme against an XML-RPC server) is unverified. Any change to URL or port handling can break event delivery | Do not touch URL format or port logic; treat `xmlrpc_bin://127.0.0.1:<port>` as frozen; verify on a real CCU or container before any release that touches the loader | integration-seams.md 2.3 |
| medium | Weak LGW link crypto (predictable IV, MD5-of-password key, hard-coded default key elsewhere) is inherited through libUnifiedLanComm | Out of scope for hs485d source; track under the security / library features and avoid changing the wire format without LGW firmware checks | security.md; `UnifiedLanCommController.cpp:464-483` |
| medium | Port and file-path contracts are hand-synchronised in the sibling repo and across OCI / Home Assistant / Helm. A change in default ports, `Listen Port` handling or config paths would break packaging silently | Freeze the defaults; record the contract in the plan's success criteria; coordinate any change with `/home/standard/dev/OpenCCU` | external-context/summary.md |
| low | No clean shutdown (signal handlers commented out), hard-coded LGW port 1000, and the single-threaded loop mixes XML-RPC, controller and timers, so a slow RPC or LGW stall blocks event handling | Leave as is; record as known behaviour; revisit only when a test harness exists | hs485d.cpp:148-149, 423-431 |
| low | The documentation is partial: LGW files and class bodies are unread, so the assessment may miss undocumented behaviour (for example reconnect in `LGWPortWrapper` is commented out in `ReadData/SendData`, lines 62, 87-88) | Read `HS485ControllerLGW.cpp`, `HMWLGW*`, `HS485CommMessageLGW` and `HS485EEpromCache` before any non-trivial change | integration-seams.md section "NOT READ" |

---

## Success Criteria

- Zero required source changes in `src/hs485d` and `src/hs485dLoader` for the nextGen UI renovation; the UI consumes hs485d only through the existing `Interface.*` JSON-RPC wrappers and direct XML-RPC calls that already exist.
- The XML-RPC method list (25 methods plus introspection) and `init` / callback semantics are unchanged; a contract check against `system.listMethods` passes.
- `InterfacesList.xml` entry format, `/etc/hs485d.port` default (2000) and the `hs485d.conf` keys are unchanged; the loader's generated file is byte-identical for the existing fixtures.
- If the loader fixes are applied: `-ilf` / `-ilp` usage text and parser agree, `rfind` is used for `</interfaces>`, the termination condition is reachable or removed, and the timeout comment matches the value (200 ms); each has a unit test or a documented manual check.
- The build (CMake, GitHub Actions) and `tests/test-components.py` still pass for hs485d and hs485dLoader on all targets, and no change is made to ports or paths used by the OCI / Home Assistant / Helm packaging.
- Security posture not weakened: the default XML-RPC bind is not widened and no new unauthenticated endpoint is added.
- Documentation gaps closed: the contract summary (methods, files, ports, status flags) exists, and the unread LGW and controller files are reviewed or explicitly recorded as unread.

---

## Focus Areas

1. Freeze and document the hs485d interface contract (XML-RPC methods and callbacks, `InterfacesList.xml` entry, config keys, status and pid files, ports) as the UI-facing boundary.
2. Loader defects in `hs485dLoader.cpp`: `find_last_of`, unreachable exit condition and child-status handling, `-ilf` / `-ilp` mismatch. Add fixture tests for `updateInterfacesXML`.
3. Review the unread parts (LGW transport, `HS485ControllerLGW`, `HS485CommMessageLGW`, `HS485EEpromCache`, `HS485FirmwareManager`) before any change beyond the loader fixes.
4. Exposure of the unauthenticated XML-RPC port: confirm bind defaults and what the containers publish.
5. Cross-repo coordination with `/home/standard/dev/OpenCCU` for any change to ports, paths or loader invocation.
6. A hardware-free test seam (simulated LGW or recorded frames) as a prerequisite for any larger refactor or replace decision.

---

## Consequences

### Positive Outcomes

- The UI renovation proceeds without touching safety- and hardware-critical native code, and without risk to wired-device installations.
- The loader's latent bugs are fixed cheaply, and the shared `InterfacesList.xml` editing becomes testable.
- The contract between UI, ReGaHss and the daemon is documented once and can be reused by the rfd and multimacd assessments.

### Negative Outcomes

- Known weaknesses remain: plain-HTTP unauthenticated XML-RPC, inherited LGW crypto weaknesses, single-threaded loop, no clean shutdown, hard-coded values.
- The native code stays untested at the daemon level; only the loader's pure functions gain tests.
- The XML-RPC-bound data model keeps the daemon costly to evolve, and a future rewrite stays expensive.

### Follow-Up Decisions

- Should the loader stop restarting on exit code 2 (missing config) or keep restarting forever? This needs an owner decision, since it changes runtime behaviour on misconfigured wired setups.
- Does the nextGen UI need any capability that the existing `Interface.*` wrappers do not expose (for example live events instead of the `Event.poll` init/delete limitation)? If so, add it in the Tcl/JSON-RPC layer, not in hs485d.
- Whether to harden the XML-RPC listener (loopback-only enforcement, token) as a separate security feature across hs485d, rfd and the HmIP server.
- Whether to invest in a simulated-LGW test harness, and when to re-assess the replace option (for example if wired devices are dropped or ReGaHss is replaced).
- Confirm with a real or containerised setup how ReGaHss interprets `xmlrpc_bin://` against hs485d's XML-RPC server.

---

## Source Documents

- `.migration/plan-context.md`: shared engagement, security, testing and integration context
- `.migration/docs/modules/src.md`: hs485dLoader section (part 1), "NOT ANALYZED" note, and hs485d / libhsscomm / libXmlRpc supplement (part 1c)
- `.migration/docs/cross-cutting/integration-seams.md`: sections 1 (in-process HS485 queue, "msmq" false positive), 2.3 (loader to hs485d), 2.4 (LGW link), 4.1 (XML-RPC server), 4.5
- `.migration/docs/cross-cutting/technical-debt.md`: loader and timeout findings, partial-read list
- `.migration/docs/cross-cutting/security.md`, `testing.md`, `infrastructure.md`, `api-contracts.md`: consulted via the shared context and grep
- `.migration/docs/external-context/summary.md`: port contract and sibling repo constraints
- Spot-checked source: `src/webui/www/config/cp_maintenance.cgi`, `cp_add_device.cgi`, `ic_deviceFirmwareOverview.cgi` (UI consumers of hs485d)
- `.migration/docs/index.json` was not re-read; feature metadata came from the assignment

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

