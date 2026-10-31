# Migration Plan: Retain ssdpd and SetInterfaceClock with small fixes (network-tools)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: coupling-assessment (retain native binaries; minimal change, no runtime technology change)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--network-tools | primary | index.json | `src/ssdpd` (483 LOC C++, single file) and `src/SetInterfaceClock` (112 LOC C++); sub-feature of `src-feature` |
| 2 | www/upnp CGIs (`src/webui/www/upnp/basic_dev.cgi`, `index.cgi`) | affected | index.json (webui) | Serve the UPnP device description at the `LOCATION` URL that ssdpd announces; Tcl CGIs shelling out to `ifconfig eth0` |
| 3 | src-feature--rfd | dependency | index.json | SetInterfaceClock is an XML-RPC client of rfd method `setInterfaceClock` (rfd.cpp:1075) |
| 4 | src-feature--hss-led | affected | index.json | hss_led treats `ssdpd` as a liveness-checked process (`/var/run/ssdpd.pid`); missing ssdpd turns the info LED solid red on CCU3 |
| 5 | libXmlRpc, libhsscomm, libxmlparser, libelvutils (in src-feature) | dependency | index.json | Link dependencies of SetInterfaceClock only (`XmlRpc hsscomm xmlparser elvutils pthread crypto`); ssdpd links `pthread` only |

---

## Context

### Summary

Two small, independent native tools from the `src/` C/C++ runtime. `ssdpd` is the SSDP/UPnP announcer: it joins `239.255.255.250:1900` on the first non-loopback, up, running IPv4 interface, sends `NOTIFY ssdp:alive` at start and every 1800 s, and answers `M-SEARCH` for `upnp:rootdevice`, its own UUID or `ssdp:all` with `LOCATION: http://<ip>/upnp/basic_dev.cgi`, `SERVER: HomeMatic` and a serial-based USN read from `/var/board_sgtin`, `/var/board_serial` or `/sys/module/plat_eq3ccu2/parameters/board_serial`. Replies are spread by a random delay below `MX`. `SetInterfaceClock` is a one-shot CLI: it reads the rfd port from `/etc/rfd.port` (default 2001) or argv `IP:Port`, and calls the XML-RPC method `setInterfaceClock(int utcSeconds, int utcOffsetMinutes)` on rfd. Exit codes: 0 success, 1 wrong usage, 2 RPC error.

For the nextGen UI renovation neither tool is a migration target. The only UI relevance is that ssdpd advertises the URL of the Tcl CGI `www/upnp/basic_dev.cgi`, which is part of the web tree that the UI work will touch. The more important role of ssdpd in this repo is as the fixture of the install-closure test `tests/test-components.py`, which copies `src/ssdpd` and text-patches `src/ssdpd/CMakeLists.txt` (it replaces the literal string `openccu_stage_target(ssdpd bin)`).

### Migration Drivers

- Latent 2038 defect: `SetInterfaceClock.cpp:58` casts `time(NULL)` (64-bit `time_t`, the build uses `_TIME_BITS=64`) to `int` for the XML-RPC `i4` parameter, and the log line at :64 prints `time_t` with `%d`. The cast wraps on 2038-01-19; the interface clock on rfd would be set to a negative or wrong value. The protocol type is the real limit (see Risks).
- Test-fixture coupling: `tests/test-components.py` (lines 59-127) depends on the exact text `openccu_stage_target(ssdpd bin)` in `src/ssdpd/CMakeLists.txt` and on `BUILD_SSDPD`. It is the only automated test touching this feature, so the CMake file must be kept stable or the test updated in the same change.
- Dead and fragile code in ssdpd: `#if 0` blocks at `ssdpd.cpp:45-176` (`InterfaceByTargetAddress`, `ParseURL`, `GetHTTP`), a `select` loop that continues on EINVAL, an unauthenticated UDP responder that parses attacker-controlled `MX` with `atoi` (bounded only by the reply delay logic).
- UI-side fragility of the advertised target: `www/upnp/basic_dev.cgi` and `index.cgi` parse the output of `/sbin/ifconfig eth0` (`HWaddr`, `inet addr:` formats of old net-tools) and so break on images without net-tools or with predictable interface names. This affects discovery results, not ssdpd itself.
- Minor duplication and style debt in SetInterfaceClock: `trim`/`readPortFromFile` duplicated in `hs485dLoader`, manual 256 byte heap buffer (:88), digit set `"01234567890"` with duplicated `0`, ISO-8859 encoded comment (:9).

### Current State

Native C++11 binaries built with CMake (`_TIME_BITS=64 _FILE_OFFSET_BITS=64`, staged via `openccu_stage_target(<target> bin)`), shipped in the OpenCCU rootfs (Buildroot packaging in the sibling repo `/home/standard/dev/OpenCCU`, which pins this repo by SHA). `ssdpd` is started at boot and kept alive by the init system, writing `/var/run/ssdpd.pid`. `SetInterfaceClock` is called as a helper after rfd is up (callers live in init and rootfs scripts of the sibling repo, not in this repo; no caller found here by grep, so this is unverified). No runtime tests exist for either tool; the CMake install closure test is the only coverage (CI is x86_64 only).

### Cross-Cutting Findings

- Testing: only `tests/test-components.py` covers the repo; for this feature it covers build and install staging of ssdpd (options `BUILD_SSDPD`, runtime aliases via `OPENCCU_RUNTIME_ALIASES`, uninstalled-closure check), not behavior.
- Technical debt: dead `#if 0` code in ssdpd, `(int)time(NULL)` truncation, `%d` for `time_t`, duplicated `trim`/`readPortFromFile`, mixed German/English comments, ISO-8859 source (src.md, "Latent bugs", "Duplicate code").
- Security: ssdpd is an unauthenticated multicast/UDP responder on port 1900 that discloses model string, IP and serial (SGTIN); this is inherent to UPnP discovery and low severity. SetInterfaceClock connects to an unauthenticated rfd XML-RPC port (127.0.0.1 by default, arbitrary `IP:Port` via argv).
- Integration: SetInterfaceClock is the only client of rfd `setInterfaceClock`; hss_led is the second rfd client in the same family (`setRFLGWInfoLED`). The port contract (rfd 2001 locally, 32001 in OCI/HA/Helm variants) is hand-synchronised externally.
- External constraint: the packaging repo may reference binary names `ssdpd` and `SetInterfaceClock` and the `/upnp/basic_dev.cgi` path; keep all names and paths stable.

---

## Migration Goal

**Retain ssdpd and SetInterfaceClock unchanged in architecture; apply small, isolated fixes and protect the test fixture.**

Recommendation: **retain with small fixes**. No rewrite, no wrapper. Fix the 32-bit time handling in SetInterfaceClock as far as the rfd protocol allows, remove dead code from ssdpd, keep the CMake text the install test relies on, and decouple the advertised UPnP description CGI from `ifconfig` as part of the (separate) UI/www renovation. Both tools stay invisible to the nextGen UI.

---

## Decision

### Approach: Retain with small fixes (incremental, in place)

Keep both binaries as C++11/CMake native tools. Apply four small changes, each shippable on its own:

1. SetInterfaceClock: compute `utcSeconds` as `time_t`, guard the conversion explicitly (check the value fits the wire type, log and exit 2 with a clear message instead of silently wrapping), print with `%lld`/`PRId64`. Decide separately whether the rfd method can accept a wider type (see Follow-Up Decisions); the rfd side (`rfd.cpp:1075`, closed to this sub-feature) must be inspected first.
2. ssdpd: delete the `#if 0` blocks (`ssdpd.cpp:45-176`), clamp the parsed `MX` value to a sane range (for example 1..5 s per UPnP, with a default when `atoi` returns 0), and fix the `select` EINVAL path to continue deliberately rather than by accident. No protocol change.
3. Keep `src/ssdpd/CMakeLists.txt` structure and the literal `openccu_stage_target(ssdpd bin)` line; if it must change, change `tests/test-components.py` in the same commit.
4. UI-side: when the www renovation touches `src/webui/www/upnp/basic_dev.cgi` and `index.cgi`, replace the `ifconfig eth0` parsing with a neutral method (for example `ip -o addr` or reading from `/sys/class/net`), and keep the CGI path stable because ssdpd announces it.

**Rationale**: Migration is not necessary for these tools. Evidence: ssdpd (483 LOC, `pthread` only) and SetInterfaceClock (112 LOC) are small, stable and have no dependency on the web UI stack. The only defect with a hard deadline is the 2038 truncation (SetInterfaceClock.cpp:58). A rewrite in another language would add risk (SSDP USN/LOCATION format and serial discovery are consumed by client apps; rfd method signature is fixed) with no UI benefit.

### Rejected Options

- **Rewrite in Go/Rust/Tcl**: no UI benefit, adds a toolchain to a C++/CMake native build, and recreates protocol behavior that has no tests.
- **Fold SSDP into the web server or a Tcl daemon**: ReGaHss is closed source and the Tcl runtime is a poor fit for a multicast responder; would also change the process model that hss_led liveness checks rely on (`/var/run/ssdpd.pid`).
- **Wrap SetInterfaceClock behind the JSON-RPC API**: no UI need exists to set the interface clock from the browser; it would widen the admin attack surface (`homematic.cgi` has no CSRF protection).
- **Replace by avahi/mDNS or systemd-timesyncd hooks**: changes discovery behavior visible to existing client apps and tools; deferred as an optional later decision.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C++11 (`cxx_std_11`); Tcl for the www/upnp CGIs | C++11 retained (C++17 optional later); Tcl CGIs retained |
| Frameworks | libXmlRpc (in-tree), libhsscomm, libxmlparser, libelvutils (SetInterfaceClock); POSIX sockets and `pthread` (ssdpd) | Unchanged |
| Infrastructure | CMake, Buildroot packaging in sibling repo, GitHub Actions CI (x86_64 only), OpenCCU rootfs (CCU3, RPi, generic, OCI/HA/Helm variants) | Unchanged; optionally add an aarch64/32-bit-`time_t` build check for the 2038 fix |

---

## Scope

**Mode**: targeted

### Included Components

- `src/ssdpd/ssdpd.cpp`, `src/ssdpd/CMakeLists.txt`
- `src/SetInterfaceClock/SetInterfaceClock.cpp`, `src/SetInterfaceClock/CMakeLists.txt`
- Interface file with the UI: `src/webui/www/upnp/basic_dev.cgi` and `index.cgi` (only the `ifconfig` parsing; coordinate with the webui features)
- `tests/test-components.py` (ssdpd fixture sections) when the CMake file changes

### Excluded Components

- rfd internals and its `setInterfaceClock` implementation (sibling src-feature--rfd)
- hss_led, hs485d, multimacd, eq3configd, crypttool, kernel drivers (sibling sub-features)
- libXmlRpc, libhsscomm, libxmlparser, libelvutils (shared libraries; only consumed here)
- All UI features (webui-*, www) beyond the two upnp CGIs
- Sibling packaging repo (`/home/standard/dev/OpenCCU`), including init scripts that start ssdpd and call SetInterfaceClock

### Critical Components

- `ssdpd.cpp` M-SEARCH handling and response format (`ssdpd.cpp:292-315`, :465-474): client apps match on ST, USN and LOCATION
- `SetInterfaceClock.cpp:55-61`: the XML-RPC argument types and the `setInterfaceClock` method name
- `src/ssdpd/CMakeLists.txt` line `openccu_stage_target(ssdpd bin)`: textual dependency of the install-closure test

### Boundaries

- Do not change the SSDP wire format, port 1900, USN scheme, the `/upnp/basic_dev.cgi` path or the binary names.
- Do not change the rfd XML-RPC method name or argument order; any wider time type needs a coordinated rfd change and a fallback.
- Do not introduce new link dependencies into ssdpd (it currently needs `pthread` only).

---

## Dependencies

### Internal

- rfd XML-RPC server, method `setInterfaceClock` (`rfd.cpp:1075`), port from `/etc/rfd.port`
- libXmlRpc, libhsscomm, libxmlparser, libelvutils, `crypto` (link line of SetInterfaceClock), `TimeZoneInfo` in libelvutils/hsscomm
- `src/webui/www/upnp/basic_dev.cgi` and `index.cgi` (target of the announced LOCATION)
- hss_led liveness check of `/var/run/ssdpd.pid` (`InfoLed::updateLedState`, PLATFORM_CCU3)
- `tests/test-components.py` and the top-level CMake `openccu_stage_target` / `BUILD_SSDPD` option machinery

### External

- Linux kernel and libc: multicast sockets, `getifaddrs`, `_TIME_BITS=64` (needs glibc 2.34+ / musl for 32-bit targets)
- Board serial sources: `/var/board_sgtin`, `/var/board_serial`, `/sys/module/plat_eq3ccu2/parameters/board_serial`
- UPnP/SSDP client apps and discovery tools on the LAN (consumers of the announcement)
- Sibling OpenCCU Buildroot repo (starts ssdpd, calls SetInterfaceClock, pins this repo by SHA)

---

## Constraints

### Unchanged

- SSDP announcement and response format (`NOTIFY ssdp:alive`, repeat interval 1800 s, `SERVER: HomeMatic`, `USN: uuid:upnp-BasicDevice-1_0-<serial>::upnp:rootdevice`, `LOCATION: http://<ip>/upnp/basic_dev.cgi`)
- SetInterfaceClock command line (`[IP:Port]`), default port 2001 and exit codes 0/1/2
- rfd XML-RPC method `setInterfaceClock(int, int)` until a coordinated wider-type decision is made
- Binary names, install location (`bin`) and the `BUILD_SSDPD` CMake option
- Pid file `/var/run/ssdpd.pid` semantics used by hss_led and init

### Integration Systems

- rfd (XML-RPC 2001; 32001 in container variants)
- LAN multicast group 239.255.255.250:1900
- Web server (lighttpd/ReGa) serving `/upnp/basic_dev.cgi`
- hss_led info-LED status logic
- OpenCCU Buildroot packaging repo (rootfs init scripts and patches)

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| medium | 2038 truncation: `(int)time(NULL)` at SetInterfaceClock.cpp:58 wraps in January 2038; fixing the cast alone does not help if the rfd wire type is 32-bit signed | Add an explicit range guard and log; inspect `rfd.cpp:1075` for an unsigned or `i8` option; decide between wire extension and documented 2038 limit | src.md latent bugs; SetInterfaceClock.cpp:58-64 |
| medium | `tests/test-components.py` text-patches `src/ssdpd/CMakeLists.txt` (`openccu_stage_target(ssdpd bin)`); a harmless CMake refactor breaks the only automated test | Keep the literal line, or update the test in the same commit; run the test in CI for any change under `src/ssdpd` | tests/test-components.py:59-127 |
| low | Behavior of ssdpd is untested; edits to M-SEARCH handling can silently break discovery by client apps | Add a small black-box test (send M-SEARCH on a loopback-multicast socket, assert ST/USN/LOCATION) before touching parsing code | testing.md (no daemon tests) |
| low | `www/upnp` CGIs parse `ifconfig eth0` output; on images without net-tools or with other interface names the announced LOCATION page shows empty IP/MAC | Replace with `/sys/class/net` or `ip -o` parsing during the www renovation; keep the CGI path | basic_dev.cgi, index.cgi |
| low | Unauthenticated UDP responder discloses model, IP and serial; unbounded `MX` from `atoi` | Clamp MX; accept the disclosure as inherent to UPnP; optionally add a build/config switch to disable ssdpd | ssdpd.cpp:292-315, :465-474 |
| low | Silent coupling: hss_led shows solid red on CCU3 if ssdpd is not running, so removing or renaming ssdpd has a visible hardware effect | Keep the pid-file contract; document in hss_led and ssdpd plans | src.md (InfoLed `isProcessRunning`) |
| low | Hand-synchronised rfd port (2001 vs 32001 in container variants) may make the default port path wrong outside the rootfs | Keep the `/etc/rfd.port` lookup and `IP:Port` argv override; do not hard-code ports | external-context summary |

---

## Success Criteria

- SetInterfaceClock no longer silently wraps the epoch value: values that do not fit the wire type are detected, logged and reported with exit code 2; log output uses a correct format for `time_t`
- The 2038 decision (wire extension vs documented limit) is recorded and checked against the rfd implementation
- ssdpd has no `#if 0` dead code and `MX` is bounded; SSDP responses are byte-compatible with the current format for ST `upnp:rootdevice`, own UUID and `ssdp:all`
- `tests/test-components.py` passes unchanged (or is updated in the same commit) and runs for every change under `src/ssdpd`
- A new minimal test covers ssdpd response format and SetInterfaceClock argument handling (usage exit code 1, RPC fault exit code 2, port file parsing)
- `/upnp/basic_dev.cgi` and `/upnp/index.cgi` work without `ifconfig` and keep their paths
- No regression in the hss_led liveness behavior and no change to binary names, pid file path or CMake option names
- Zero regression bugs in production; all existing functionality retained

---

## Focus Areas

1. Fix the 32-bit epoch handling in SetInterfaceClock and settle the rfd wire-type question (highest priority, hard deadline in 2038)
2. Protect the `tests/test-components.py` ssdpd fixture: keep the CMake text stable, run the test whenever `src/ssdpd` changes
3. Remove ssdpd dead code and bound `MX`; add a black-box SSDP response test
4. Replace `ifconfig eth0` parsing in `www/upnp` CGIs as part of the www renovation, keep the CGI path
5. Deduplicate `trim`/`readPortFromFile` with `hs485dLoader` only if a shared helper is introduced for other reasons (opportunistic)

---

## Consequences

### Positive Outcomes

- The only time-bomb in this feature (2038) is removed or consciously documented
- The test fixture and discovery format stay stable, so the nextGen UI work and the sibling packaging repo are unaffected
- Small dead-code and hardening cleanups reduce review burden at near-zero risk
- A first behavioral test for a native daemon in a repo that has none

### Negative Outcomes

- A true 2038 fix may require a coordinated change in rfd (outside this sub-feature) and a compatibility path for older rfd binaries
- Retaining the tools keeps the legacy eQ-3 code style (mixed German/English comments, ISO-8859 encoding) and the unauthenticated discovery responder
- Test additions need a multicast-capable CI environment or a loopback shim

### Follow-Up Decisions

- Wire type for `setInterfaceClock`: keep `i4` with documented 2038 limit, or add an extended method/`i8` variant in rfd (decide with the src-feature--rfd assessment)
- Whether ssdpd should be made optional or disabled by default in container variants (OCI/HA/Helm), where multicast discovery rarely works
- Whether `www/upnp` CGIs move into the nextGen UI shell or stay as standalone Tcl CGIs
- Whether discovery should later also announce a modern endpoint (HTTPS or the new UI URL), which would change the `LOCATION` contract

---

## Source Documents

- `.migration/plan-context.md` — Shared engagement context (UI renovation goal, security, testing, external constraint)
- `.migration/docs/modules/src.md` — Module documentation: ssdpd, SetInterfaceClock, hss_led liveness, latent bugs and duplicate code
- `.migration/docs/index.json` — Feature discovery and technology stack identification
- `.migration/docs/cross-cutting/technical-debt.md` — Risk assessment and migration drivers
- `.migration/docs/external-context/summary.md` — Sibling OpenCCU packaging repo and port contract
- Source read directly: `src/ssdpd/ssdpd.cpp`, `src/ssdpd/CMakeLists.txt`, `src/SetInterfaceClock/SetInterfaceClock.cpp`, `src/webui/www/upnp/basic_dev.cgi`, `src/webui/www/upnp/index.cgi`, `tests/test-components.py`

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

