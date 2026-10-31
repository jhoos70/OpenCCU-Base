# Migration Plan: Assess src-feature--kernel-drivers (eq3loop and bcm2835 raw UART kernel drivers)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: retain-untouched (no migration; contract and licence documentation only)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--kernel-drivers | primary | index.json | `src/eq3_char_loop` (eq3loop master/slave loopback `eq3_char_loop.c`, legacy `mxs_raw_auart.c`, `test/eq3loop_restart_test.c`) and `src/bcm2835_raw_uart` (Pi PL011 raw UART, DT overlay, Buildroot `.mk`). Sub-feature of `src-feature`; GPL-2.0-or-later kernel code |
| 2 | src-feature--multimacd | dependency | index.json | Master side of eq3loop: `src/multimacd/UpstreamCharConnection.cpp:33-36` holds a hand-copied copy of the ioctl numbers. Not analysed in depth by deep-explore |
| 3 | src-feature--rfd / HMIPServer (crRFD) | dependency | index.json | Slave consumers of the eq3loop nodes; expect a tty-like device with termios ioctls |
| 4 | OpenCCU packaging repo (external) | affected | user | Buildroot builds the modules (`bcm2835_raw_uart.mk`, `BR2_EXTERNAL_EQ3_PATH`) and pins this repo by SHA; kernel version and DT overlay are owned there |
| 5 | webui-*, www (nextGen UI) | affected (indirect) | user | No direct coupling. The UI reaches the radio only through rfd/hs485d XML-RPC (ports 2001/2000), never through the kernel drivers |

---

## Context

### Summary

Two out-of-tree Linux kernel character-driver trees that connect the radio coprocessor (RPI-RF-MOD, HM/HmIP dual protocol) to the userspace stack. `eq3_char_loop.c` (1157 lines, v1.6) is a loopback driver: `multimacd` opens the master node `/dev/eq3loop`, creates up to 4 slave nodes (for example `mmd_bidcos`, `mmd_hmip` or `ttyS0`) with `EQ3LOOP_IOCSCREATESLAVE`, and `rfd` and HMIPServer open those slaves as if they were serial ports. `bcm2835_raw_uart.c` (1318 lines) exposes the Raspberry Pi PL011 UART as `/dev/raw-uart` with a per-connection priority and preemption model. `mxs_raw_auart.c` (1047 lines) is the equivalent driver for the legacy i.MX28 CCU2 and builds only on the old CCU2 kernel. The drivers have no web UI surface and are out of the nextGen UI scope.

### Migration Drivers

- None originate in the UI renovation. The recommendation is retain/untouched.
- Only incidental drivers exist: old kernel API forms (`access_ok(VERIFY_WRITE, ...)`, `class_create(THIS_MODULE, ...)`, in-kernel `struct termios`, `__devinit` in the mxs driver) limit the supported kernel range. Shims exist only in `eq3_char_loop.c` (`access_ok` <5.0, `class_create` >=6.4).
- Hand-duplicated ioctl numbers are a latent drift hazard for any future change, not for the UI work.

### Current State

Out-of-tree GPL kernel modules, written in C against Linux 4.x to 6.x APIs. They are not built by the userspace CMake pipeline. `cmake/Components.cmake:55-61` adds the subdirectories behind `BUILD_BCM2835_RAW_UART` and `BUILD_EQ3_CHAR_LOOP`, but each `CMakeLists.txt` only defines a custom target that prints "not built by this CMake userspace pipeline". The bcm2835 module and its `.dtbo` are built by Buildroot (`bcm2835_raw_uart.mk`) in the sibling packaging repo. `eq3_char_loop/Makefile` is the single line `obj-m += eq3_char_loop.o` (the mxs driver is not included). The only test is a manual, root-only userspace regression program `test/eq3loop_restart_test.c` that is not wired into any build or CI. The repo has no automated test for either driver. The CI (`tests/test-components.py`) checks only the userspace install closure on x86_64.

### Cross-Cutting Findings

- Integration seam 2.1 (`cross-cutting/integration-seams.md`): the eq3loop contract is rated HIGH migration risk if the module has to be kept (per-kernel out-of-tree build, tty semantics) and MEDIUM if replaced by a pty or socketpair. Replacement is not possible without changing the slave consumers.
- The ioctl numbers and event bits are duplicated by hand in `src/multimacd/UpstreamCharConnection.cpp:33-36` and `src/eq3_char_loop/test/eq3loop_restart_test.c:28-30`. There is no shared header, and any change must be mirrored manually.
- Version mismatch: bcm2835 `MODULE_VERSION("1.12")` (`bcm2835_raw_uart.c:1318`) against `.mk` `1.2`.
- Memory-safety debt in bcm2835: unchecked `kmalloc` in `open` (:373) and in `probe` for `rxbuf.buf` (:1155).
- The sample `multimacd.conf` names the HmIP slave `ttyS0`, while `etc/config_templates/crRFD.conf` references `/dev/mmd_hmip`. The slave names are config-driven and must stay consistent across the Buildroot overlay, OCI and Home Assistant images.
- `Dual_Protocol_Linux_Drivers.pdf` is duplicated in both driver directories and was not read by deep-explore.
- Security: the drivers are root-only device nodes. No finding in `security.md` concerns them. Kernel code is not covered by any tooling (no static analysis, no fuzzing).
- Testing: no UI, API, daemon or driver tests exist (`testing.md`).

---

## Migration Goal

**Retain the kernel drivers untouched and formally document the eq3loop and raw-UART contracts and licence constraints, so the nextGen UI work can proceed with no change to this feature.**

The goal is to keep the radio data path (coprocessor UART, bcm2835 or mxs driver, eq3loop, multimacd, rfd/HMIPServer) bit-for-bit compatible. The only deliverables are documentation and guard rails (contract record, licence boundary, optional drift check). No driver code change and no kernel ABI change is planned.

---

## Decision

### Approach: Retain (untouched), with documentation-only follow-ups

The UI renovation (strangler approach via the existing shell, working hypothesis) is entirely above the XML-RPC and JSON-RPC layers. The kernel drivers are two layers below the first daemon the UI can reach, so they need no wrapping, adapter or rewrite for the UI work.

**Rationale**: (1) The UI has no path to `/dev/eq3loop` or `/dev/raw-uart` and gains nothing from a driver change. (2) The eq3loop contract is HIGH risk: the master ioctls `IOCSCREATESLAVE` (`_IOW('L',1,uint32_t)`) and `IOCGEVENTS` (`_IOR('L',2,uint32_t)`), the generation/hang-up semantics, the single-slave `-EBUSY` rule and the slave-side tty emulation are all depended on by multimacd, rfd and the Java HMIPServer (integration-seams 2.1). (3) There are no automated driver tests, so any change would be unverifiable in CI. (4) The code is GPL, so any change brings licence-handling obligations (see Constraints). (5) The kernel build and deployment are owned by the external Buildroot repo, which pins this repo by SHA.

### Rejected Options

- **Replace eq3loop with a pty pair or UNIX socketpair in multimacd (MEDIUM)**: rfd and HMIPServer (RXTX, Java) expect a tty device path and termios ioctls, so all slave consumers would have to change. Out of UI scope and has no UI benefit.
- **Rewrite or modernise the drivers (new kernel APIs, remove shims, unify with a shared uapi header)**: no UI benefit, no test safety net, risk of breaking radio timing (see the mxs latency analysis comment at `mxs_raw_auart.c:93-99`). Deferred to a separate radio-stack decision.
- **Wrap the drivers with a userspace service for the UI**: the UI already has the XML-RPC and JSON-RPC layers for device interaction. Direct UI access to the radio UART would also bypass multimacd's MAC-layer timing responsibilities and the BidCoS/HmIP multiplexing.
- **Minimal-change option (extract a shared `eq3loop_ioctl.h` uapi header and use it from multimacd and the test)**: sound and low-risk, but not required by the UI. Recorded as an optional follow-up, not part of this plan.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C (Linux kernel module), Device Tree source (`bcm2835-raw-uart.dts`) | Unchanged |
| Frameworks | Linux char-device API, platform driver (`brcm,bcm2835-raw-uart`), kernel 4.x-6.x via version shims (eq3loop only) | Unchanged. Version support is controlled by the Buildroot kernel, not by this plan |
| Infrastructure | Out-of-tree modules (Kbuild `obj-m`), built by Buildroot (`bcm2835_raw_uart.mk`) and not by CMake; GitHub Actions CI covers userspace only | Unchanged |

---

## Scope

**Mode**: targeted

### Included Components

- `src/eq3_char_loop/` (`eq3_char_loop.c`, `mxs_raw_auart.c`, `test/eq3loop_restart_test.c`, `Makefile`, `CMakeLists.txt`, PDF)
- `src/bcm2835_raw_uart/` (`bcm2835_raw_uart.c`, `bcm2835-raw-uart.dts`, `bcm2835_raw_uart.mk`, `Config.in`, `CMakeLists.txt`, PDF)

### Excluded Components

- All UI features (`webui-*`, `www`, `src/webui`), `bin-feature` (ReGaHss), firmware, `opt`, `usr`
- Other `src-feature--*` userspace components (multimacd, rfd, hs485d and the libraries); their eq3loop-facing code is a dependency, not part of this plan
- Buildroot packaging in the sibling OpenCCU repo

### Critical Components

- `eq3_char_loop.c` ioctl definitions (:50-57) and the master/slave ioctl handlers (:453-515)
- Generation/hang-up logic (:113-125, :708+) that protects against stale slave connections after a multimacd restart
- Slave tty emulation (`eq3loop_ioctl_slave` :521-653)
- `bcm2835_raw_uart.c` priority ioctls (`IOCTL_IOCSPRIORITY/IOCGPRIORITY`, magic `'u'`, :88-93) and the `acquire_sender`/`send_completed` preemption (:758, :793)
- Module parameters `uart0_base` and `uart0_irq`, and DT compatible `brcm,bcm2835-raw-uart`

### Boundaries

- No file under the two driver directories changes as part of the nextGen UI work.
- Allowed changes are documentation-only (this plan, a contract record under `.migration/docs`) and, if separately approved, a read-only drift check.
- The UI boundary ends at XML-RPC (hs485d 2000, rfd 2001) and JSON-RPC (`/api/homematic.cgi`). Nothing below `rfd` is exposed to the UI.

---

## Dependencies

### Internal

- `src/multimacd` (`UpstreamCharConnection.cpp:33-36`, `:84-100`): opens `/dev/eq3loop` O_RDWR|O_NONBLOCK, creates slaves, polls POLLIN|POLLPRI|POLLERR|POLLHUP at 5000 ms, and reads events through `IOCGEVENTS`. It also uses `Loop Master Device`, `Loop Slave Device Bidcos` and `Loop Slave Device HmIP` from `multimacd.conf`.
- `src/rfd` (BidCoS, slave `mmd_bidcos`) and HMIPServer/crRFD (slave `ttyS0` or `mmd_hmip`): consume the slave nodes as tty devices.
- `src/eq3_char_loop/test/eq3loop_restart_test.c`: second hand-copied definition of the ioctl numbers.
- `cmake/Components.cmake:55-61`: option wiring for the message-only targets.
- No dependency on any UI module in either direction.

### External

- Linux kernel headers and Kbuild for the target kernel (Buildroot-selected); the `access_ok`, `class_create`, `no_llseek` and `.ioctl` shims in `eq3_char_loop.c` cover part of the range.
- Buildroot external tree `BR2_EXTERNAL_EQ3_PATH`, `host-dtc` (for the `.dtbo`), and the Raspberry Pi kernel with the PL011 `uart0` node (`bcm2835_raw_uart.mk:10,13,17-28`).
- Hardware: RPI-RF-MOD radio coprocessor (HM/HmIP dual protocol); legacy CCU2 i.MX28 AUART for `mxs_raw_auart.c`.
- OpenCCU packaging repo (`/home/standard/dev/OpenCCU`), which pins this repo by SHA.

---

## Constraints

### Unchanged

- eq3loop ioctl ABI: magic `'L'`, `EQ3LOOP_IOCSCREATESLAVE = _IOW('L',1,uint32_t)` and `EQ3LOOP_IOCGEVENTS = _IOR('L',2,uint32_t)`, with the event bits `SLAVE_OPENED` (bit 0), `SLAVE_CLOSED` (bit 1) and the slave-open state bit (bit 15).
- Behavioural contract: 4 channels; 1024-byte circular buffers in each direction; a second open of a slave returns `-EBUSY`; master close hangs up all slave connections with `-ENODEV` and the slave must reopen (generation counter); slave side emulates termios/termios2, `TIOCINQ/OUTQ/MGET/SERGETLSR/GICOUNT`, `TCFLSH` and `TIOCEXCL`, with faked modem lines (DSR|CD|CTS); unhandled ioctls return `-ENOTTY`.
- bcm2835 contract: node `/dev/raw-uart`, `/proc/raw-uart`, 115200 baud, `MAX_CONNECTIONS 3`, priority ioctls with magic `'u'` (set = nr 1, get = nr 2, `unsigned long`), TX preemption semantics, platform driver and DT names, and module params `uart0_base` (default 0x3f201000) and `uart0_irq` (87).
- Licence constraint: kernel sources carry the GNU GPL, version 2 or (at your option) later, header, and `MODULE_LICENSE("GPL")` (`eq3_char_loop.c:1156`, `mxs_raw_auart.c:1047`, `bcm2835_raw_uart.c:1316`). The repo mixes licences (`README.md` "License information", `licenses/`: GPL-2.0, LGPL-2.1, HMSL2). GPL kernel code must stay in its own tree, keep its headers and be offered as source in any binary distribution. Do not move it, merge it with HMSL2 userspace code, or copy it into UI or userspace trees. The ioctl numbers copied into multimacd (HMSL2 userspace) are numeric interface constants, and any extraction of a shared header needs a licence review (a uapi header under GPL-2.0 WITH Linux-syscall-note is the usual form). Do not relicense or strip headers, and do not add proprietary or closed-source (for example ReGaHss) code to these trees.
- Node and slave names (`mmd_bidcos`, `mmd_hmip`, `ttyS0`) stay config-driven and unchanged.
- Build ownership: the modules remain out of the CMake pipeline and are built by Buildroot, which pins this repo by SHA.

### Integration Systems

- `multimacd` master over `/dev/eq3loop` and `/dev/mmd_*`
- `rfd` (XML-RPC 2001) and HMIPServer/crRFD as slave consumers
- Radio coprocessor UART (`/dev/raw-uart`, `/dev/mxs_auart_raw.0`)
- Buildroot/OpenCCU packaging (kernel, DT overlay, port contract hs485d 32000 / rfd 32001 / ReGa 8183,1998)

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | Any change to the eq3loop ioctl numbers, event bits or generation/hang-up semantics breaks multimacd, rfd and HMIPServer. The contract is hand-copied in two places with no shared header and no CI check, and no automated driver tests exist. | Freeze the contract (this plan); keep driver files untouched; require a mirrored change in `UpstreamCharConnection.cpp:33-36` and the test file for any future ioctl change; optionally add a drift check (grep or compile-time `static_assert`) as a separate task. | integration-seams.md 2.1; `modules/src.md` eq3_char_loop and multimacd sections |
| high | Replacement of eq3loop by pty/socketpair is not drop-in, because the slave consumers (RXTX Java, rfd) require a tty path and termios ioctls. | Treat replacement as a separate radio-stack decision, outside the UI scope; do not fold it into the UI migration. | integration-seams.md 2.1 migration-risk note |
| medium | Licence contamination or violation: GPL-2.0(+) kernel code next to HMSL2 and LGPL userspace in a mixed-licence monorepo; a shared header or moved code could create unclear licence boundaries. | Keep the trees separate and headers intact; legal review before extracting a shared uapi header; document the boundary here and in `licenses/licenses.md`. | `modules/src.md` license headers; `README.md` licence section; `MODULE_LICENSE("GPL")` lines |
| medium | The kernel-version window is narrow: deprecated API forms in bcm2835 (`access_ok(VERIFY_WRITE,...)` :526-532, `class_create(THIS_MODULE,...)` :1128, in-kernel `struct termios`) and no shims there; the mxs driver builds only on the old CCU2 kernel. A Buildroot kernel bump can break the build while this repo's CI cannot detect it. | Keep the kernel pinned in the packaging repo; add a kernel-build check there when the kernel is upgraded. Do not touch the drivers for the UI. | `modules/src.md` bcm2835 and mxs sections |
| medium | Radio timing and exclusivity: multimacd answers within radio timing limits; the preemption logic (`acquire_sender`/`send_completed`) and 11-byte TX chunking are timing-sensitive. Untested. | No change to the data path; any UI feature that triggers more radio traffic must go via rfd/hs485d only. | `bcm2835_raw_uart.c:83-91,758,793`; `mxs_raw_auart.c:93-99` |
| low | Latent memory-safety defects: unchecked `kmalloc` in `open` (:373) and `probe` (`rxbuf.buf` :1155). | Track as a separate maintenance item; not a UI blocker. | `modules/src.md` Security / Technical Debt |
| low | Documentation and version drift: bcm2835 module 1.12 against `.mk` 1.2; duplicated vendor PDF; sample-config slave name `ttyS0` against `mmd_hmip`; mxs driver not in the `Makefile`. | Record in the contract document; align when a driver change is separately approved. | `modules/src.md` Technical Debt; `multimacd.conf:18-20` |

---

## Success Criteria

- No file under `src/eq3_char_loop/` or `src/bcm2835_raw_uart/` is changed by the nextGen UI work (verified by diff).
- The eq3loop and raw-UART contracts (ioctl numbers, event bits, device names, behavioural rules) are recorded in this plan and remain consistent with `UpstreamCharConnection.cpp:33-36` and `eq3loop_restart_test.c:28-30`.
- The licence boundary (GPL-2.0(+) kernel code against HMSL2 and LGPL userspace) is documented and unchanged; headers and `MODULE_LICENSE` lines are intact.
- The userspace CMake build and install closure (`tests/test-components.py`) is unaffected; the message-only kernel targets still configure.
- The Buildroot packaging build of the kernel modules and the radio path (multimacd, rfd, HMIPServer) behave unchanged on the existing target kernels.
- All UI-facing API contracts (XML-RPC 2000/2001, JSON-RPC) are unaffected; no UI component references the kernel device nodes.
- Zero regression in radio communication.

---

## Focus Areas

1. Freeze and record the eq3loop ioctl/behaviour contract (high risk, hand-duplicated numbers).
2. Record the licence boundary and the rules for touching GPL code in the mixed-licence monorepo.
3. Keep the UI boundary at XML-RPC/JSON-RPC; no UI code or test may open `/dev/eq3loop`, `/dev/mmd_*` or `/dev/raw-uart`.
4. Record the external build ownership (Buildroot, kernel pinning, DT overlay) so repo restructuring (for example the `www/` de-duplication) does not touch the driver paths.
5. Optional, separate follow-up: contract drift guard (shared uapi header or static check) and a wired-up eq3loop restart test.
6. Optional, separate follow-up: kernel API modernisation and the memory-safety fixes.

---

## Consequences

### Positive Outcomes

- Zero risk to the radio data path from the UI renovation.
- The HIGH-risk eq3loop contract and the licence constraints are made explicit once, so later work on multimacd, rfd or packaging can rely on them.
- UI planning is decoupled from kernel and hardware concerns.

### Negative Outcomes

- The known debt remains: duplicated ioctl numbers, narrow kernel-API range, unchecked allocations, no driver CI, and version/document drift.
- The drivers stay un-testable in CI, and kernel upgrades remain a manual, packaging-side risk.
- The mxs driver and eq3loop `Makefile` inconsistencies remain.

### Follow-Up Decisions

- Whether to extract a shared eq3loop uapi header (needs a licence decision) or add a drift check between the driver, `UpstreamCharConnection.cpp` and the test.
- Whether to wire `eq3loop_restart_test` into a QEMU or VM-based test, and add a kernel-build CI job for the supported kernel range.
- Whether to replace eq3loop (pty/socketpair) as part of any future radio-stack modernisation (separate decision, not UI).
- Whether to drop `mxs_raw_auart.c` once CCU2 is no longer supported.
- Re-run deep-explore on `multimacd`, `rfd` and `hs485d`; they were not analysed, so the slave-consumer side of the contract rests on partial evidence. The PDFs `Dual_Protocol_Linux_Drivers.pdf` were not read either.

---

## Source Documents

- `.migration/plan-context.md` - shared planning context, engagement goal, integration and external constraints
- `.migration/docs/modules/src.md` - bcm2835_raw_uart, eq3_char_loop, multimacd sections; licence headers, tech debt, testing
- `.migration/docs/cross-cutting/integration-seams.md` - section 2.1 eq3loop contract and migration risk
- Direct source checks: `src/eq3_char_loop/eq3_char_loop.c` (:50-57, GPL header, `MODULE_LICENSE`), `src/eq3_char_loop/test/eq3loop_restart_test.c:28-30`, `src/bcm2835_raw_uart/bcm2835_raw_uart.c` (:88-93, GPL header), `src/*/CMakeLists.txt`, `cmake/Components.cmake:55-61`, `README.md` licence section
- `skills/plan-migration/references/plan-adr-template.md` and `adr-workflow.md` ("Draft Complete ADR")

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

