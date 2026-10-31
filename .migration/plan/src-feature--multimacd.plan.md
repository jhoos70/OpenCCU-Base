# Migration Plan: Assess multimacd (radio coprocessor multiplexer daemon)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: native-daemon-assessment (retain / minimal-change; no modernization of the daemon is required for the nextGen UI)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--multimacd | primary | index.json | `src/multimacd` (200 files, ~15.6k LOC, C++11, version 2.6.2). Owns `/dev/mxs_auart_raw.0` and multiplexes it to rfd (BidCoS) and HMIPServer (HmIP) |
| 2 | src-feature (eq3_char_loop kernel module, `src/eq3_char_loop`) | dependency | index.json | Master/slave loopback driver; ioctl numbers `_IOW('L',1,uint32_t)` / `_IOR('L',2,uint32_t)` hand-copied into `UpstreamCharConnection.cpp:33-36` |
| 3 | src-feature--rfd | dependency | index.json | BidCoS consumer of slave `mmd_bidcos`; multimacd runs the BidCoS MAC layer (AES challenge/ack, TX queue, peers) on its behalf |
| 4 | src-feature (libelvutils) | dependency | index.json | Only linked project library (`PropertyMap`, `Logger`, `OSCompat`) |
| 5 | src-feature (hss_led InfoLed) | affected | index.json | Reads `/var/run/multimacd.pid` and `/proc/<pid>/cmdline` for LED state (`InfoLed.cpp:212-220`) |
| 6 | OpenCCU packaging repo (external) | affected | user | Pins this repo by SHA, ships `multimacd.conf`, init scripts and the port/device contract (slave names `mmd_bidcos`, `ttyS0`/`mmd_hmip`) |

---

## Context

### Summary

multimacd is a native C++11 daemon that opens the radio coprocessor serial device (`/dev/mxs_auart_raw.0`, default from `multimacd.cpp:28`), parses and builds the coprocessor frame protocol (start `0xFD`, escape `0xFC`, CRC-16 polynomial `0x8005`; `SerialFrame.h:112-124`, `SerialFrame.cpp:78-208`) and fans it out to two consumer stacks through the `/dev/eq3loop` loopback driver. It creates the slave nodes `mmd_bidcos` (rfd) and `ttyS0` (HMIPServer, per `multimacd.conf`; `etc/config_templates/crRFD.conf` refers to `/dev/mmd_hmip`) via `EQ3LOOP_IOCSCREATESLAVE`. Internally it runs `FastMacResponder` (port reader), `MacController` (coprocessor state machine, 709 lines), `SubsystemManager` (dispatch thread at SCHED_RR, priority max-3, `SubsystemManager.cpp:118`) and one thread each per subsystem and `UpstreamCharConnection`. Threads use the vendored TinyThread++ (`tthread`). `BidcosMacController` (1366 lines) implements the time-critical BidCoS MAC for rfd.

The daemon has no network, HTTP, XML-RPC or JSON interface and no dependency on Tcl, JavaScript or the web UI. Its only UI-visible surfaces are indirect: whether the radio stack works at all (rfd/HMIPServer data flows through it), the status file `/var/status/multimacd.status`, the pid file `/var/run/multimacd.pid`, and the LED/liveness checks in hss_led.

### Migration Drivers

- The nextGen UI does not require any change to multimacd. The driver here is risk containment: keep the daemon stable while the UI and its Tcl/JSON-RPC backend are renovated.
- Latent defects that are cheap to fix and are visible in the production binary: undefined behaviour in a LOG call (`UpstreamCharConnection.cpp:121`), a stress-test class linked into production, dead configuration keys, and a build rule that silently absorbs stray `.cpp` files.
- No automated tests and no hardware-free way to exercise the frame layer; any future change (including the above fixes) is unverifiable without a regression harness.
- Documentation gap: this daemon was only partially read in deep-explore (see Source Documents); `BidcosMacController.cpp`, `SubsystemHmIp.cpp`, `FastMacResponder`, `MultithreadTest` and the roughly 100 `SerialFrame/` classes are unanalyzed.

### Current State

Linux ARM daemon (RaspberryMatic/OpenCCU family), built by CMake (`src/multimacd/CMakeLists.txt`, `GLOB_RECURSE CONFIGURE_DEPENDS` over `*.cpp`, C++11, `-Wall`, links `pthread rt m crypto elvutils`), staged to `bin`. Configuration via `/etc/config/multimacd.conf` (or `-f`); options `-f -c -l -p -d`. Signals SIGTERM/INT/QUIT/USR1 trigger `MultimacManager::Exit()`. Windows code paths (`#ifdef WIN32`) are present but not built. Source licence header is eQ-3 HMSL 2. Packaged and started by the external OpenCCU Buildroot repository.

### Cross-Cutting Findings

- Dead configuration: `HmIP/Bidcos/Transparent Cmdline Pattern` defaults are commented out in `multimacd.cpp:32-34` and no consumer exists; `Default Subsystem` is set at `multimacd.cpp:36` with no consumer found in sampled code (technical-debt.md; src.md).
- `MultithreadTest.cpp/.h` (hardware stress test taking a device path) is compiled into the production binary through `GLOB_RECURSE` (`CMakeLists.txt:1-3`); no caller in `multimacd.cpp` (testing.md; src.md).
- LOG format bug: `UpstreamCharConnection.cpp:121` has two `%s` conversions but passes only `_slaveDevice.c_str()`, which is undefined behaviour (reads a garbage vararg) on the "buffer overflow during write" path. Related: `%d` used for `syscall(SYS_gettid)` (long) in `SubsystemManager.cpp:115` and `Subsystem.cpp:155`.
- ioctl numbers for `/dev/eq3loop` are hand-copied between kernel module and daemon with no shared header (dependencies.md, integration-seams.md); out-of-tree kernel module is a per-kernel build, risk HIGH if the module must change.
- Replacing `eq3loop` with a pty/socketpair is not possible without changing the slave consumers (rfd, Java HMIPServer via RXTX), which expect a tty device path and termios ioctls (integration-seams.md).
- Short-write handling in `UpstreamCharConnection::OnUpstreamFrame` (:104-130) spins on a non-blocking fd; a zero write is only logged and the frame is dropped.
- Manual frame ownership (`delete frame`, `Clone()`) across threads and queues; unlocked-data and lifetime errors are plausible but unverified.
- OpenSSL `crypto` is linked but no `EVP_*` call sites were found in multimacd; AES challenge randomness comes from `/dev/urandom` (`BidcosMacController.cpp:1338`, fd handling not read).
- No unit or integration tests exist for any part of the daemon (testing.md).

---

## Migration Goal

**Retain multimacd as a native daemon behind its existing eq3loop contract and apply only minimal hygiene changes; do not couple it to the nextGen UI.**

The renovated UI reaches the radio stack only through the XML-RPC interface of rfd (TCP 2001) and HMIPServer, never through multimacd. The goal is therefore to keep multimacd's external contracts byte-for-byte stable (coprocessor framing, ioctl numbers, slave node names, config keys that are consumed, pid and status files) while removing the identified defects (LOG UB, test code in production, dead config) in a small, reviewable change set that can be done independently of, and after, the UI phases.

---

## Decision

### Approach: Retain with minimal-change hygiene (no wrap, no replace)

Leave the architecture, threading model and kernel interface untouched. Apply a short list of low-risk fixes (see Focus Areas), add a hardware-free build check, and document the unanalyzed parts so that the daemon can be assessed properly if it is ever scheduled for change.

**Rationale**: (1) the UI has zero coupling to the daemon: no API, no shared file other than pid/status flags consumed by hss_led and init scripts; (2) timing-critical radio MAC code (BidCoS AES challenge/ack, retry limits 3/32, duty-cycle handling) is certified-product behaviour with no tests, so a rewrite carries high regression risk for no UI benefit; (3) the kernel/user contract (`eq3_char_loop`, tty semantics of slaves) pins the process model and cannot be replaced without touching rfd and the Java HMIPServer; (4) the defects found are localised and fixable without behaviour change.

### Rejected Options

- **Replace (rewrite in Rust/Go or modern C++)**: high regression risk on radio timing and AES handling, no tests to prove parity, no UI benefit, eQ-3 HMSL 2 licence and upstream tracking make a fork costly.
- **Wrap (expose multimacd state via a new HTTP/JSON or XML-RPC endpoint for the UI)**: possible later (for example coprocessor state, firmware version, SGTIN, RF address, which `MacController` already queries), but the same data is available through rfd XML-RPC (`getVersion`, `getServiceMessages`, interface info). A wrapper adds a new network and security surface for no confirmed requirement. Defer until a UI feature demonstrates a gap.
- **Replace eq3loop with pty or UNIX sockets**: breaks the tty expectations of rfd and HMIPServer; requires coordinated changes in three components plus the OpenCCU packaging.
- **Modernize in place (C++17/20, smart pointers, std::thread replacing tinythread)**: attractive for maintainability but not justified without tests; consider only as an opportunistic follow-up after a test harness exists.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C++11 (`cxx_std_11`) | C++11 retained (optionally raise to C++14/17 after a harness exists; not required) |
| Frameworks | TinyThread++ (vendored `tinythread.cpp/.h`), pthread, OpenSSL libcrypto (linked, call sites not found), libelvutils | Unchanged. Candidate cleanup: drop `crypto` link if truly unused (verify first) |
| Infrastructure | CMake (`GLOB_RECURSE CONFIGURE_DEPENDS`), GitHub Actions CI (x86_64 only), Linux kernel char driver `eq3_char_loop`, `/dev/mxs_auart_raw.0`, Buildroot packaging in sibling repo | Unchanged. Replace `GLOB_RECURSE` with an explicit source list; add CI build with `-Wall -Wformat=2 -Werror=format-security` |

---

## Scope

**Mode**: targeted

### Included Components

- `src/multimacd/**` (daemon sources, `CMakeLists.txt`, `multimacd.conf`, `version.sh`)
- Minimal touch points outside the tree if needed: a shared ioctl header or a compile-time consistency check against `src/eq3_char_loop/eq3_char_loop.c`

### Excluded Components

- `src/eq3_char_loop`, `src/bcm2835_raw_uart` (kernel modules, per-kernel build)
- `src/rfd`, `src/hs485d`, `src/libhsscomm`, `src/libXmlRpc` (separate features)
- All `webui-*` features and `www/` (no coupling)
- Closed-source `bin/ReGaHss`, Java HMIPServer, OpenCCU packaging repo (contract-only; not edited here)

### Critical Components

- `SerialFrame/SerialFrame.cpp` framing and CRC-16 (`0x8005`)
- `BidcosMacController.cpp` (AES challenge/ack, retry and TX queue timing)
- `UpstreamCharConnection.cpp` (eq3loop master, ioctl, poll loop, write path)
- `SubsystemManager.cpp` (SCHED_RR dispatch thread) and `FastMacResponder.cpp` (time-critical read path)

### Boundaries

- Wire contract to the coprocessor is fixed by firmware and must not change.
- The slave names and tty semantics seen by rfd and HMIPServer must not change.
- Any behavioural change (as opposed to hygiene) requires on-device regression testing on real radio hardware (CCU3/RPi RPI-RF-MOD).

---

## Dependencies

### Internal

- `src/libelvutils` (`PropertyMap`, `Logger`, `OSCompat`)
- `src/eq3_char_loop` kernel module (runtime coupling, shared ioctl numbers, no link dependency)
- `src/rfd` (consumer of slave `mmd_bidcos`)
- `src/hss_led` (`InfoLed` reads pid file and `/proc/<pid>/cmdline`)
- `cmake/WriteVersionHeader.cmake` (version header generation)

### External

- Radio coprocessor firmware (frame protocol, bootloader identification, SGTIN/serial/RF address queries)
- Java HMIPServer / crRFD (consumer of slave `ttyS0` or `/dev/mmd_hmip`, RXTX serial access)
- OpenSSL libcrypto (linked)
- Linux kernel headers and device nodes `/dev/mxs_auart_raw.0`, `/dev/eq3loop`, `/dev/urandom`
- OpenCCU Buildroot repository (init scripts, config templates, kernel module build)

---

## Constraints

### Unchanged

- Coprocessor serial protocol: start `0xFD`, escape `0xFC`, byte stuffing (`& 0x7F` / `| 0x80`), CRC-16 poly `0x8005`
- eq3loop ioctl interface: `EQ3LOOP_IOC_MAGIC 'L'`, `IOCSCREATESLAVE=_IOW('L',1,uint32_t)`, `IOCGEVENTS=_IOR('L',2,uint32_t)`
- Slave node names `mmd_bidcos` and `ttyS0` / `mmd_hmip`, and open/close event semantics used to connect and disconnect subsystems
- Config file location `/etc/config/multimacd.conf` and the consumed keys (`Coprocessor Device Path`, `Log *`, `Loop Master Device`, `Loop Slave Device Bidcos`, `Loop Slave Device HmIP`, `StatusfileDir`); CLI options `-f -c -l -p -d`
- Status/pid files `/var/status/multimacd.status`, `/var/run/multimacd.pid` (consumed by init scripts and hss_led)
- Signal behaviour (SIGTERM/INT/QUIT/USR1 lead to clean exit)
- BidCoS MAC timing behaviour (retry limits, AES challenge flow)

### Integration Systems

- Radio coprocessor (RPI-RF-MOD / CCU3 module) over UART
- `eq3_char_loop` kernel module
- rfd (BidCoS, XML-RPC TCP 2001, port contract 32001 in the packaging repo)
- HMIPServer (Java)
- hss_led / init scripts in the OpenCCU packaging repo

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | Radio-path regression: any change to MAC/AES/framing code can silently break pairing or message delivery; no automated tests exist | Restrict this plan to hygiene changes; add frame-layer unit tests (framing, CRC, escaping) that run on x86_64 CI before touching logic; hardware smoke test on RPI-RF-MOD for every release | testing.md; src.md (no tests found) |
| high | Kernel/user ABI drift: ioctl numbers are hand-copied between `eq3_char_loop.c` and `UpstreamCharConnection.cpp`; a kernel-module change breaks the daemon without a compile error | Introduce a single shared header or static check (`static_assert` on `_IOW('L',1,uint32_t)` values); keep `test/eq3loop_restart_test.c` and wire it into CI where possible | dependencies.md; integration-seams.md |
| medium | Undefined behaviour in LOG call (`UpstreamCharConnection.cpp:121`): missing `%s` argument on the write-overflow path can crash or leak stack data exactly when the system is under load | Add the missing argument (or drop the second `%s`); enable `-Wformat=2 -Werror=format-security`; fix `%d` vs `long` for gettid at `SubsystemManager.cpp:115`, `Subsystem.cpp:155` | src.md technical-debt section; verified at `UpstreamCharConnection.cpp:121` |
| medium | `MultithreadTest` compiled into production binary through `GLOB_RECURSE`: dead hardware-test code ships on device and any stray `.cpp` is silently added | Exclude it from the production target (separate `multimacd-stress` target behind an option) and use an explicit source list | `CMakeLists.txt:1-3`; no caller in `multimacd.cpp` |
| medium | Dead configuration keys (`*Cmdline Pattern`, `Default Subsystem`) mislead operators and the packaging repo; users may believe they control routing | Remove from code defaults and sample config or implement/deprecate explicitly; coordinate with OpenCCU config templates before removal (keep parser tolerant of unknown keys) | `multimacd.cpp:32-36`; `multimacd.conf`; technical-debt.md |
| medium | Threading and ownership risk: manual `delete`/`Clone()` across queues and SCHED_RR dispatch thread, 5 s queue timeouts, spin on non-blocking write; races or leaks are plausible and unverified | Do not refactor now; run under ThreadSanitizer/ASan with a mock serial port in a later hardening step | src.md (concurrency section); `UpstreamCharConnection.cpp:104-130` |
| medium | Unanalyzed code (about 60% of LOC: `BidcosMacController.cpp`, `SubsystemHmIp.cpp`, `FastMacResponder`, `SerialFrame/*`) means this assessment may miss defects | Schedule a focused deep-read before any logic change; treat conclusions on those files as provisional | src.md scope notes |
| low | Upstream/packaging coupling: OpenCCU repo pins this repo by SHA and hand-synchronises port and device names | Keep all external names unchanged; announce any config-key removal to the packaging repo first | external-context/summary.md |

---

## Success Criteria

- Zero change to the on-wire coprocessor protocol, the eq3loop ioctl numbers, slave node names and consumed config keys (verified by diff and a static_assert/shared-header check).
- `UpstreamCharConnection.cpp:121` LOG format fixed; build passes with `-Wformat=2 -Werror=format-security` for `src/multimacd`.
- `MultithreadTest` no longer part of the production `multimacd` binary; sources listed explicitly in CMake.
- Dead config keys removed or documented as deprecated; the sample config only contains keys that have consumers.
- Frame-layer unit tests (escape/unescape, CRC-16, round-trip of representative frames) run in CI on x86_64.
- On-device smoke test passes after changes: coprocessor identified, `multimacd.status` written, rfd and HMIPServer connect to their slaves, one BidCoS and one HmIP device exchange telegrams, restart of rfd does not hang multimacd.
- No new network interfaces or privileges introduced by multimacd; nextGen UI requires no multimacd change.
- All existing functionality retained; zero regression in radio operation in production.

---

## Focus Areas

1. Fix undefined behaviour in `UpstreamCharConnection.cpp:121` and the `long`/`%d` gettid logs.
2. Remove `MultithreadTest` from the production binary; replace `GLOB_RECURSE` by an explicit list.
3. Remove or document dead config keys (`*Cmdline Pattern`, `Default Subsystem`) together with the packaging repo's config templates.
4. Eliminate ioctl number duplication with `eq3_char_loop` (shared header or compile-time check).
5. Add a hardware-free test harness for `SerialFrame` and CRC, then consider sanitizer runs with a mock port.
6. Complete the documentation gap: read `BidcosMacController`, `SubsystemHmIp`, `FastMacResponder` and the `SerialFrame/` families before any logic change.
7. Verify and drop unused `crypto` link and Windows-only leftovers (`#ifdef WIN32`) if confirmed dead.
8. Decide, only if the UI later needs it, whether to expose coprocessor state via rfd rather than a new multimacd endpoint.

---

## Consequences

### Positive Outcomes

- The daemon remains stable and certified-behaviour-preserving while the UI is renovated; no coordination needed with UI phases.
- Removes a latent crash path and dead code from the production image; tighter, warning-clean build.
- Creates the first test coverage for the coprocessor frame layer and a documented ABI check against the kernel module.

### Negative Outcomes

- Structural debt remains: manual memory ownership, TinyThread++, C++11, dual-protocol coupling to a kernel module.
- Hygiene changes still require on-device validation on real radio hardware, which is costly and not available in CI.
- Config-key cleanup needs coordination with the external OpenCCU repository to avoid breaking its templates.

### Follow-Up Decisions

- Whether to schedule a deeper modernization (C++17, std::thread, RAII frame ownership) once a test harness exists.
- Whether eq3loop should be retained long term or replaced (requires joint decision with rfd, HMIPServer and packaging).
- Whether a UI feature needs radio-coprocessor diagnostics, and if so whether to source them from rfd XML-RPC or a thin wrapper.
- Whether the Windows code paths and the unused `crypto` link are removed.

---

## Source Documents

- `.migration/docs/modules/src.md` (multimacd sections: scope notes, "multimacd - architecture", configuration, concurrency, technical debt)
- `.migration/docs/cross-cutting/technical-debt.md` (dead config keys, partial reads)
- `.migration/docs/cross-cutting/integration-seams.md` (eq3loop seam, risk rating)
- `.migration/docs/cross-cutting/dependencies.md` (runtime coupling, OpenSSL, tinythread)
- `.migration/docs/cross-cutting/data-flow.md` (coprocessor to multimacd to eq3loop flow, status files)
- `.migration/docs/cross-cutting/testing.md` (no tests; MultithreadTest in production)
- `.migration/plan-context.md` (engagement goal, external constraints)
- Source spot-checks: `src/multimacd/CMakeLists.txt`, `src/multimacd/multimacd.cpp:28-36`, `src/multimacd/UpstreamCharConnection.cpp:121`

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

