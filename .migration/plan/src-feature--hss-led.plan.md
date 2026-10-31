# Migration Plan: Retain hss_led (LED controller) and decouple it from the nextGen UI

**Status**: assessed | **Date**: 2026-10-09 | **Type**: coupling-assessment (retain native daemon; minimal change at the UI seam, no runtime technology change)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--hss-led | primary | index.json | `src/hss_led` (36 files, ~3,021 LOC C++): LED controller daemon plus `hss_ledctl` client; sub-feature of `src-feature` |
| 2 | webui-api | affected | index.json | Owns `ccu/getinfoledconfig.tcl` and `ccu/setinfoledconfig.tcl` JSON-RPC methods that read/write `/etc/config/hss_led_info.conf` |
| 3 | webui-config-pages | affected | index.json | Owns `config/cp_security.cgi` (line 572: `exec killall hss_led` during backup restore) |
| 4 | src-feature--libhsscomm (sibling, in src-feature) | dependency | index.json | `HSSManager::SendUDPInfo` is the producer side of the UDP 8182 status feed (rfd, hs485d) |
| 5 | src-feature--rfd (sibling, in src-feature) | dependency | index.json | hss_led is an XML-RPC client of rfd (`setRFLGWInfoLED`); rfd is also a UDP producer and a liveness-checked process |

---

## Context

### Summary

`hss_led` is the OpenCCU status/LED daemon. It is a C++ program (C++11 tests, CMake, `PLATFORM_CCU3` define) that does two jobs. First, a single-threaded controller (`LedController.cpp`, 686 lines) runs a `signalfd` + `timerfd` loop with an `AF_UNIX SOCK_SEQPACKET` control socket at `/run/hss_led/control`. It accepts at most 32 clients with a 1 s deadline each and authenticates peers with `SO_PEERCRED`. Second, a status monitor thread binds UDP `127.0.0.1:8182`, parses datagrams from `RFD POWER LIGHTTPD HS485D REGAHSS HMIP`, combines them with network state flag files under `/var/status` (`hasLink`, `hasIP`, `hasInternet`, `startupFinished`, `hssLedReady`) and pid-file liveness checks, and drives the RGB info LED through `/sys/class/leds`. The same binary is installed as `hss_ledctl` (CLI client, version 2.3). A recovery build (`HSS_LED_STATUS_MONITOR=OFF`) compiles only `LedOnlyMain.cpp + LedController.cpp`. The code uses current hardening techniques (`SO_PEERCRED`, `O_NOFOLLOW`, 512 byte message cap, 0600 atomically-renamed state file, `posix_spawn` with clean signal mask) and has Apache-2.0 SPDX headers, unlike most of the legacy eQ-3 code in `src/`.

For the nextGen UI the daemon is not a migration target. The UI touches it only at two narrow seams: a restart by process name from a Tcl CGI, and a small key=value config file edited through two JSON-RPC methods.

### Migration Drivers

- The UI renovation must not break the two UI-to-daemon seams (`cp_security.cgi` restart, Info-LED config methods); both are implicit contracts with no tests.
- Implicit coupling to other daemons (port 8182, pid files, `/var/status` flag files) must be documented so that platform or UI-side restarts do not silently change LED behavior.
- Low hardening debt compared to the rest of `src/`: the control socket is already authenticated, so no security-driven rewrite is needed.
- Residual debt worth cleaning only opportunistically: `system("wget ...")` in `UpdateAvailable.cpp:88-95` (non-CCU3 branch only), boilerplate TODO stubs (`UdpCannel.cpp`, `MessageParser.cpp`), unauthenticated UDP feed, unused legacy `led.cpp`.

### Current State

Native C++ daemon running inside the OpenCCU rootfs (Buildroot image built from the sibling OpenCCU repo, which pins this repo by SHA), started by the init system as a root process, with XML-RPC client dependencies on `libXmlRpc`, `libelvutils`, `libxmlparser` and `pthread` (status build). It is built by CMake via `openccu_stage_target(hss_led bin)` and deployed on CCU3, RPi and generic targets (OCI/HA/Helm variants have no LED hardware). Tests: one self-contained unit test `LedControllerTest.cpp` (250 lines, target `hss_led_state_test`, registered at `src/hss_led/CMakeLists.txt:40-45`, behind `HSS_LED_BUILD_TESTS`, default OFF, so it is not run by default CI).

### Cross-Cutting Findings

- Integration seam 2.2 (`integration-seams.md`): control socket, UDP 8182 feed, pid-file liveness, flag files and rfd XML-RPC call are all implicit contracts; migration risk rated MEDIUM, mainly because the 8182 and pid-file coupling to other daemons is implicit.
- Security (`security.md`): the `hss_led` control socket uses `SO_PEERCRED`; `report` is allowed for root or user `hssled`, everything else is root only. Socket mode 0660 with group `status`. The UDP feed is loopback, lossy and unauthenticated (any local process can spoof a sender).
- Request-driven process control from the UI: `cp_security.cgi:572` runs `exec killall hss_led` inside a `catch` block, followed by `killall java`, `run-parts -a stop /etc/config/rc.d` and `killall crond`. The restart is by name, relies on the init system to respawn (or not), and is wrapped in `catch`, so failures are silent.
- Testing (`testing.md`): the `LedControllerTest` is one of only three tests in the repo; it is OFF by default and the UDP monitor, `InfoLed`, `Network` and the CLI are untested. No test covers the Tcl seams.
- API contracts (`api-contracts.md`): control socket and UDP 8182 are listed as non-HTTP contracts; the two JSON-RPC methods are part of the 180-method `homematic.cgi` surface.
- Config naming trap: the daemon reads keys `IgnoreServiceMessages` and `IgnoreAlarmMessages` from `/etc/config/hss_led_info.conf` (`Info.cpp:15-16`); the Tcl methods parse the same keys with a regexp (`^ *key *= *(.*)$`) and expose booleans `serviceLedOn`/`alarmLedOn` (inverted semantics). Any UI rewrite must preserve the inversion.
- Port contract: the sibling OpenCCU repo hand-synchronises ports across OCI/HA/Helm; UDP 8182 is loopback-only and not part of that contract, but the rootfs init scripts that start `hss_led` live in the sibling repo.

---

## Migration Goal

**Retain `hss_led` unchanged as a native daemon; harden and document the two UI seams so the nextGen UI can replace the Tcl callers without touching the daemon.**

The nextGen UI work (strangler approach via the existing shell, working hypothesis) will eventually replace `cp_security.cgi` and the `ccu/{get,set}infoledconfig.tcl` methods. The goal for this feature is to make sure their replacements honor the same contracts: restart semantics for the daemon, config file format and key names, and the control socket for any future "LED test" or status display in the UI. No functional change to LED behavior is intended.

---

## Decision

### Approach: Retain (minimal change at the seams)

Keep the daemon, protocol, port and file contracts as they are. Make only seam-level changes: (1) replace `exec killall hss_led` in the UI path with a documented, tested restart contract (for example, `hss_ledctl` command or init-script restart) in the same change that replaces `cp_security.cgi`; (2) pin the config-file format by adding a contract test (Tcl read/write round trip against the C++ `Info::readConfig` expectations); (3) enable `HSS_LED_BUILD_TESTS` in CI so the existing unit test actually runs.

**Rationale**: Migration is limited because: (1) the daemon is the best-hardened native component in `src/` (SO_PEERCRED, 0600 state, O_NOFOLLOW; `security.md`), (2) it has no web or HTTP surface and so no technical dependence on the UI stack, (3) the only UI coupling is two small seams (`cp_security.cgi:572`, `ccu/{get,set}infoledconfig.tcl`) that can be fixed in the UI layer, (4) a rewrite in another language would add risk on hardware-facing sysfs paths (`/sys/class/leds/rpi_rf_mod:*`) with no user-visible gain, and (5) integration-seam risk is rated MEDIUM only because of implicit coupling, which documentation and a contract test address.

### Rejected Options

- **Replace (rewrite in Rust/Go or merge into a new supervisor)**: no UI benefit, loses a working hardened implementation, and would need hardware validation on CCU3 and RPi-RF-MOD; the closed-source and Buildroot packaging constraints add cost.
- **Wrap (HTTP/JSON gateway exposing the control socket to the browser)**: adds a new network-facing attack surface in front of a root-only protocol (`report`/`override` require root or `hssled`) without a requirement from the UI; the existing JSON-RPC info-LED methods already cover the only user-facing setting.
- **Replace UDP 8182 feed with the control socket for all producers**: would force synchronized changes in `libhsscomm`, rfd, hs485d and the closed-source ReGaHss (`REGAHSS` and `HMIP` sender IDs); out of scope for the UI engagement.
- **Do nothing (no tests or seam hardening)**: leaves silent-failure restart and an untested config format that the new UI will be required to reproduce.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C++ (daemon; C++11 test), Tcl (UI seams) | C++ (unchanged); Tcl seams replaced together with the UI rewrite |
| Frameworks | None (libXmlRpc, libelvutils, libxmlparser, pthread, POSIX signalfd/timerfd) | Unchanged |
| Build | CMake (`HSS_LED_STATUS_MONITOR` default ON, `HSS_LED_BUILD_TESTS` default OFF) | CMake; tests enabled in CI |
| Infrastructure | Buildroot rootfs (sibling OpenCCU repo), init-started root daemon, GitHub Actions CI (x86_64) | Unchanged |

---

## Scope

**Mode**: targeted

### Included Components

- `src/hss_led/CMakeLists.txt` (test registration, lines 40-45)
- `src/hss_led/LedController.cpp`, `LedProtocol.h`, `LedCli.h` (control socket and CLI contract)
- `src/hss_led/Info.cpp` (config keys), `UdpCannel.cpp`, `MessageParser.cpp`, `defines.h` (UDP 8182 feed)
- `src/hss_led/tests/LedControllerTest.cpp`, `StatusProducer.cpp`
- Seam files in other features, for coordination only: `src/webui/www/config/cp_security.cgi` (line 572), `src/webui/www/api/methods/ccu/getinfoledconfig.tcl`, `setinfoledconfig.tcl`

### Excluded Components

- `libhsscomm`, `rfd`, `hs485d`, `libXmlRpc` internals (separate src-feature sub-features)
- ReGaHss binary (closed source) and its `REGAHSS` status sender
- `HMIPServer` (Java) and `multimacd` beyond pid-file liveness reads
- Sibling OpenCCU Buildroot packaging and init scripts
- Legacy `led.cpp` removal and `UpdateAvailable.cpp` wget cleanup (optional follow-up, not required by the UI)

### Critical Components

- Control socket protocol (`"1 <verb> ..."`, `OK`/`ERR`, <512 bytes) and `SO_PEERCRED` authorization
- Config file `/etc/config/hss_led_info.conf` keys `IgnoreServiceMessages`, `IgnoreAlarmMessages`
- Process name `hss_led` (killed by name) and pid file `/var/run/*.pid` liveness list

### Boundaries

- Daemon code stays outside the UI migration; changes are limited to tests and CMake wiring.
- UI-side replacements may talk to the daemon only through the config file, the existing control socket (root-owned processes), or an init-script restart. No new network listener.

---

## Dependencies

### Internal

- `libhsscomm` (`HSSManager::SendUDPInfo`, producer of UDP 8182) via rfd and hs485d managers
- `libXmlRpc` (client call to rfd `setRFLGWInfoLED`, `RFLGWInfoLED.cpp:48-75`, port from `/etc/rfd.port`, fallback 2001)
- `libelvutils`, `libxmlparser` (status build), `pthread`
- webui-api methods `CCU.getInfoLedConfig` / `CCU.setInfoLedConfig`; webui-config-pages `cp_security.cgi`
- Processes watched via pid files: eq3configd, ReGaHss, ssdpd, HMIPServer, multimacd, rfd

### External

- Linux kernel interfaces: `/sys/class/leds/rpi_rf_mod:*` and other LED-class devices (udev permission timing), `/sys/module/dummy_rx8130` or `rtc_rx8130` for radio module detection
- `update.homematic.com` firmware check via `wget` (non-CCU3 branch only, `UpdateAvailable.cpp:88`)
- `/bin/checkInternet` helper script (`Network.cpp:60`) and flag files under `/var/status`
- Init system from the sibling OpenCCU repo (starts the daemon, writes `startupFinished` and `hssLedReady`)

---

## Constraints

### Unchanged

- Control socket path `/run/hss_led/control`, `AF_UNIX SOCK_SEQPACKET`, protocol version prefix `"1 "`, verbs `status report system override release auto led list`, reply prefixes `OK`/`ERR`
- Socket permissions (mode 0660, group `status`), `SO_PEERCRED` authorization (root, plus user `hssled` for `report`), 32 client cap, 1 s deadline
- UDP `127.0.0.1:8182` datagram format `"<SENDER>\nKEY=VAL\n"`, accepted senders `RFD POWER LIGHTTPD HS485D REGAHSS HMIP`, keys `SERVICE=<int>` and `ALERT|ALARM=<bool>`
- `/etc/config/hss_led_info.conf` format and key names; JSON-RPC response shape `{"serviceLedOn":bool,"alarmLedOn":bool}` of the Info-LED methods (part of `homematic.cgi` contract)
- State and flag files: `/run/hss_led/state`, `/run/hss_led/lock`, `/var/status/{startupFinished,hssLedReady,hasLink,hasIP,hasInternet}`, `/etc/config/disableLED`
- CLI behavior of `hss_ledctl` (including `slow=500 ms`, `fast=100 ms`, max 86400000 ms) because init scripts in the sibling repo call it

### Integration Systems

- rfd (XML-RPC TCP 2001), hs485d, ReGaHss, HMIPServer, multimacd, eq3configd, ssdpd (liveness and status producers)
- WebUI JSON-RPC `/api/homematic.cgi` (Info-LED methods; ADMIN/USER level semantics set by the API layer)
- Sibling OpenCCU Buildroot repo (SHA pin, init scripts, rootfs patches)

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|----------|
| medium | UI rewrite drops or alters `exec killall hss_led` during backup restore, leaving LED daemon with stale config or not restarted | Specify the restart as a requirement of the replacement of `cp_security.cgi`; use init-script restart or `hss_ledctl` instead of name-based kill; add an on-device smoke check | `cp_security.cgi:572`; `integration-seams.md` 2.2 |
| medium | Info-LED config semantics break (inverted booleans, key names `IgnoreServiceMessages`/`IgnoreAlarmMessages`, regexp parser) when the JSON-RPC methods are re-implemented | Contract test for the file format and response shape; keep methods in webui-api unchanged until the new UI is cut over | `getinfoledconfig.tcl`; `Info.cpp:15-16` |
| medium | Implicit coupling: UDP 8182 senders, pid-file list and flag files can change in other daemons without any compile-time or test signal | Document the contract in the plan; add a loopback integration test using `StatusProducer.cpp`; list hss_led in the cross-feature change checklist | `integration-seams.md` 2.2; `InfoLed.cpp:212-220` |
| medium | Test coverage is thin: only `LedControllerTest` exists, it is OFF by default and not run in CI; monitor, CLI and UDP parsing are untested | Turn on `HSS_LED_BUILD_TESTS` in CI; add tests for `MessageParser` and CLI parsing | `testing.md`; `CMakeLists.txt:40-45` |
| low | Unauthenticated, lossy UDP feed lets any local process spoof service/alarm state | Accept (loopback, LED only); optionally restrict via socket credentials in a later phase | `security.md`; `UdpCannel.cpp:45-61` |
| low | `system("wget ...")` with serial from `/var/ids` in the non-CCU3 branch (shell string composition) | Out of scope for UI work; remove or replace with `posix_spawn` if that branch is ever built | `UpdateAvailable.cpp:88-95` |
| low | Sibling repo pins this repo by SHA and its init scripts call `hss_ledctl`; CLI changes would break packaging | Treat the CLI as frozen; coordinate any change with the OpenCCU repo | `external-context/summary.md` |

---

## Success Criteria

- No functional change to LED behavior on CCU3 and RPi-RF-MOD (priority order of `effective()`, patterns and timings unchanged)
- Control socket protocol, UDP 8182 format and `hss_ledctl` CLI remain backward compatible (verified by test)
- `hss_led_state_test` runs in CI (`HSS_LED_BUILD_TESTS=ON`) and passes; at least one test added for `MessageParser` and one for the config-file round trip
- The nextGen UI replacement for `cp_security.cgi` restarts the daemon through a documented mechanism, not `killall` by name
- `CCU.getInfoLedConfig` / `CCU.setInfoLedConfig` responses are identical before and after the UI cutover
- No new network-facing listener introduced for hss_led; security model equivalent or stronger
- All existing functionality retained; zero regression in LED states observed on target hardware

---

## Focus Areas

1. UI seam 1: `cp_security.cgi:572` restart-by-name; define and test the replacement restart contract
2. UI seam 2: Info-LED config file and JSON-RPC methods (key names, inverted booleans, file path)
3. Enable and extend tests (`HSS_LED_BUILD_TESTS` in CI; MessageParser, CLI, UDP loopback)
4. Document implicit coupling (UDP 8182 senders, pid-file list, `/var/status` flag files) in one contract note
5. Verify the recovery build (`HSS_LED_STATUS_MONITOR=OFF`) still compiles after any change
6. Optional cleanup: remove TODO stubs, legacy `led.cpp`, `system("wget")`

---

## Consequences

### Positive Outcomes

- The daemon stays stable and hardware-proven; the UI renovation carries no native-code risk
- Two previously implicit UI-to-daemon contracts become explicit and tested
- CI gains a second running native test

### Negative Outcomes

- The restart-by-name pattern and untested UDP feed remain until a dedicated cleanup phase
- Hardware behavior still cannot be verified in CI (no LED sysfs on x86_64 runners)
- Seam coordination across three features (webui-api, webui-config-pages, src-feature) adds planning overhead

### Follow-Up Decisions

- Which restart mechanism replaces `killall hss_led` (init-script, `hss_ledctl` verb, or supervisor), to be decided with the sibling OpenCCU init scripts
- Whether the nextGen UI should expose an LED status or test view via a root-side helper (needs a security decision; not proposed here)
- Whether to authenticate or retire the UDP 8182 feed in a later native-hardening phase
- Whether to delete the legacy non-CCU3 branch (`led.cpp`, `UpdateAvailable.cpp`)

---

## Source Documents

- `.migration/plan-context.md` - shared planning context
- `.migration/docs/modules/src.md` - hss_led section (lines 118-140), dependencies, protocols, tests
- `.migration/docs/cross-cutting/integration-seams.md` - section 2.2 hss_led control socket and status feed
- `.migration/docs/cross-cutting/security.md`, `testing.md`, `api-contracts.md`, `data-flow.md`, `dependencies.md`
- `.migration/docs/external-context/summary.md` - sibling OpenCCU packaging constraints
- Source verified directly: `src/hss_led/CMakeLists.txt:36-47`, `src/hss_led/Info.cpp:15-16`, `src/webui/www/config/cp_security.cgi:570-576`, `src/webui/www/api/methods/ccu/{get,set}infoledconfig.tcl`

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

