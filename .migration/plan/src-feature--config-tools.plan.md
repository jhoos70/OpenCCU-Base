# Migration Plan: Migrate src-feature--config-tools (eq3configd, eq3configcmd, crypttool, libeq3config, libLanDeviceUtils, libUnifiedLanComm)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: security-hardening (minimal-change, retain native C++; wrap behind a stable CLI contract for the nextGen UI)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--config-tools | primary | index.json | `src/eq3configd` (UDP/43439 identify and network-config daemon, 1,276 LOC), `src/eq3configcmd` (multi-call CLI, 80 LOC), `src/crypttool` (MD5 and AES-128-CBC signing and key store, 623 LOC), `src/libeq3config` (69 files, 9,490 LOC), `src/libLanDeviceUtils` (39 files, 4,406 LOC), `src/libUnifiedLanComm` (20 files, 1,786 LOC) |
| 2 | webui-config-pages | affected | index.json | `cp_security.cgi` calls `crypttool` (`-g`, `-S -k -i`, `-v -t 0/3 -k`, `-s -t 0`, `-r`; lines 34, 64, 174, 204, 275, 286, 391, 528-532) and `exec eq3configcmd rfd-interface-copy` (:790); `config/backup.tcl:23-25` signs the backup with `crypttool -s -t 1` and reads `-g`; `cp_network.cgi` edits the same `/etc/config/netconfig` that `eq3configd` serves over UDP |
| 3 | www | affected | index.json | Drifted committed copies of `cp_security.cgi` and `backup.tcl` under `www/config` (crypttool callers exist twice) |
| 4 | webui-api | affected | index.json | Backup/restore endpoints and `/etc/config/crypttool.cfg` readers sit behind the JSON-RPC and legacy CGI surface |
| 5 | src-feature--rfd / hs485d / multimacd | dependency | index.json | `rfd` links `LanDeviceUtils`, `UnifiedLanComm` (`BidcosLanInterface`); `hs485d` uses them for the HMW-LGW TCP/1000 encrypted transport (`LGWPortWrapper`); an IV or handshake change is a wire change for these daemons |
| 6 | src-feature--hss_led | dependency | index.json | LED supervisor treats a dead `eq3configd` (pid file `/var/run/eq3configd.pid`) as a red-LED fault (`InfoLed.cpp:212-220`) |
| 7 | OpenCCU packaging repo (external) | affected | user | Buildroot repo pins this repo by SHA and ships `bin/` prebuilt copies (`eq3configd`, `eq3configcmd`, `crypttool` in four architectures; `eq3configd` is committed with mode 644) |

---

## Context

### Summary

This sub-feature is the native "configuration tooling" layer of the CCU base system. `eq3configd` is a UDP daemon on port 43439 that answers device identify requests (opcode `I`), reports and stores network settings in `/etc/config/netconfig` (`n`, `c`, `C`) and, after a successful `C`, runs `system("/etc/init.d/S40network restart")` (`main.cpp:449`). `eq3configcmd` is a multi-call dispatcher (`eq3configcmd.cpp:19-63`) into `libeq3config`, whose commands include `netconfigcmd`, `setlgwkey`, `rfd-interface-copy`, `update-coprocessor`, `update-lgw-firmware`, `wait-for-file` and `md5`. `crypttool` is the key store (`/etc/config/crypttool.cfg`, `<index> <md5hex>`) and signer used by the web UI to sign and verify backups (MD5 of the data, then AES-128-CBC with a zero IV over the digest). `libLanDeviceUtils` and `libUnifiedLanComm` are the LAN-gateway discovery and encrypted TCP client libraries shared with `rfd` and `hs485d`. The web UI touches this layer only through `exec` of `crypttool` and `eq3configcmd` in `cp_security.cgi` and `backup.tcl`, and through the shared files `/etc/config/netconfig` and `/etc/config/crypttool.cfg`.

### Migration Drivers

- Security compliance: hard-coded default key `"Markus is awesome"` in two places (`crypttool.cpp:26`, `eq3configd/main.cpp:50`); predictable time-seeded IV (`UnifiedLanCommController.cpp:464-483`); zero-IV signing (`crypttool.cpp:178-187`); unauthenticated network reconfiguration over UDP unless `CRYPT=1`.
- Memory-safety defects reachable from unauthenticated network input in `eq3configd` (variable-length stack array sized from the datagram, `main.cpp:324`; unchecked `EVP_DecryptUpdate` length, `main.cpp:334`).
- Duplicate code: `networkconfig.cpp` exists in `eq3configd/src` and `libeq3config/netconfigcmd/src` (527 lines each, 24 diff lines, so already drifting); `defaultKey` constant duplicated.
- The nextGen UI needs a stable, narrow contract for key management and backup signing instead of `exec crypttool -k <key>` from Tcl CGIs with the key visible in the process list.
- No tests for any of the six components; `libUnifiedLanComm/test` is not wired into CMake.

### Current State

Native C++11 (`cxx_std_11`) daemon, CLI and shared libraries built with CMake and staged via `openccu_stage_target`, running on the CCU3/OpenCCU Linux image (BusyBox init, `/etc/init.d/S40network`), cross-built for armhf, aarch64, i686 and x86_64, with prebuilt copies under `bin/`. The module docs read `eq3configd`, `eq3configcmd`, `crypttool`, `libUnifiedLanComm` in detail; `libLanDeviceUtils` (headers only) and `libeq3config` (command registry only; `netconfigcmd`, `CCU2CommControllerMod`, coprocessor and LGW update bodies) are partially analysed and must be read before any change there.

### Cross-Cutting Findings

- Hard-coded key `"Markus is awesome"` (`crypttool.cpp:26`, `eq3configd/main.cpp:50`); keys stored as MD5 hex (`crypttoolconfig.cpp:30-56`), file permissions unknown. [security.md]
- Predictable IV: `srand(time*3/2)` + `rand()` in `createIV()` (`UnifiedLanCommController.cpp:464-483`); missing key only logs fatal and continues (`:327-329`). [security.md]
- `eq3configd` UDP protocol unauthenticated unless `CRYPT=1`; the initial IV is `0..15` until a plaintext `C` makes the daemon issue a random IV (`main.cpp:229-234`, `:422-428`). [security.md, src.md]
- `crypttool` encrypt/decrypt path is a stub (`crypttool.cpp:94-101`); keys passed via `-k` appear in `ps`, and keys are logged at debug level (`:61,96,105`). [src.md]
- `system()` call to restart networking inside a network-input handler (`main.cpp:449`, also `:369-374`). [security.md]
- Duplicated `networkconfig.cpp` (eq3configd vs `libeq3config/netconfigcmd`). [technical-debt.md, src.md]
- Dead artefacts: Code::Blocks files `ccu2udp.*` in `eq3configd`, Windows serial wrapper in `libeq3config`, ISO-8859 sources with replacement characters. [technical-debt.md]
- Testing: no unit, integration or protocol tests for any component; CI only exercises the CMake install closure on x86_64. [testing.md]
- Binary hygiene: `bin/eq3configd` committed as mode 644 while `eq3configcmd` and `crypttool` are 755. [bin.md]

---

## Migration Goal

**Harden and retain the native config tools; fix or explicitly document every known cryptographic and input-handling weakness, and give the nextGen UI a narrow, versioned CLI contract.**

Keep `eq3configd`, `eq3configcmd` and `crypttool` as C++ (no rewrite). Remove the single-point secrets and unsafe primitives (default key, `rand()` IV, zero IV, unchecked buffer handling), de-duplicate `networkconfig.cpp` into one shared source, and freeze the externally visible behaviour (UDP frame format, `crypttool` CLI flags and output format, `crypttool.cfg` format, backup `.sbk` signature) behind a compatibility layer so that the UI shell, backup files created by older CCUs, `rfd` and `hs485d` keep working. Where a weakness cannot be removed without breaking field compatibility (for example the default key used by existing devices and old backups), document it as an accepted risk with a migration path.

---

## Decision

### Approach: Incremental hardening in place (retain, minimal-change) with a UI-facing wrapper contract

Recommendation per component:

| Component | Recommendation | Reason |
|-----------|----------------|--------|
| `eq3configd` | minimal-change plus hardening | Fix memory-safety defects, replace `system()` by a controlled restart helper, rate-limit and validate `C`; keep UDP frame format and port 43439 (discovery tools such as the eQ-3 setup utilities depend on it) |
| `eq3configcmd` / `libeq3config` | retain; remove duplicate `networkconfig.cpp` | Self-registering command table works; only the duplicate and the dead Windows wrapper need cleanup |
| `crypttool` | wrap | Keep the existing flags for compatibility; add a stdin or file-descriptor key input (`-K -` style) so callers stop passing keys with `-k`; UI calls it through one Tcl wrapper |
| `libUnifiedLanComm` | minimal-change | Replace `createIV()` with an OS CSPRNG (`RAND_bytes` or `getrandom`); fail the handshake when no key is configured |
| `libLanDeviceUtils` | retain; analyse before touching | `.cpp` bodies were not read; only audit for IV or key handling |

**Rationale**: Migration is necessary because of (1) hard-coded and published key material in two binaries (security.md "Secrets Management"), (2) predictable IV generation in a library shared by `rfd` and `hs485d` (security.md "Data Protection"), (3) remotely reachable parsing defects in an unauthenticated UDP daemon that can restart networking (src.md "eq3configd" security notes), (4) duplicated and already drifting `networkconfig.cpp` (technical-debt.md). A rewrite is rejected because the code is small (about 4k LOC in the three binaries and libs actually in scope for changes), the wire formats are a field contract with devices and external tools, and the nextGen UI does not depend on the implementation language, only on the CLI and file contracts. Because the surrounding stack is the same language and platform, in-place incremental fixes are the lowest-risk path.

### Rejected Options

- **Rewrite in Rust or Go**: no test baseline to prove parity, cross-compilation to four architectures plus Buildroot packaging cost, and wire formats are fixed by deployed devices.
- **Replace `crypttool` with a JSON-RPC endpoint (`CCU.signBackup` and similar) now**: pulls security logic into the Tcl layer that is itself the weakest part (see webui-api plan); revisit after the API contract is defined (follow-up).
- **Remove `eq3configd` and rely on SSDP (`ssdpd`) plus the web UI for network setup**: breaks discovery and recovery by external setup tools, and breaks the LED supervisor expectation of a live `eq3configd`.
- **Do nothing and only document**: leaves an unauthenticated UDP path to a root-run network restart and a published default key; acceptable only for the parts listed as "documented, not fixed" below.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C++11 (`cxx_std_11`), POSIX C; Tcl callers in the UI | C++17 for new or touched code only if all four toolchains support it; otherwise stay on C++11. Tcl callers unchanged apart from a thin wrapper |
| Frameworks | None; OpenSSL libcrypto (EVP MD5, AES-128-CBC), pthread | Same; add authenticated or constant-time comparison primitives from libcrypto; consider AES-GCM or HMAC-SHA-256 for new signature versions behind a version marker |
| Infrastructure | CMake and Make, GitHub Actions CI (x86_64 only), BusyBox init (`S40network`), Buildroot packaging in sibling repo, prebuilt `bin/` copies | Unchanged; add CI jobs for unit tests and sanitizers (ASan/UBSan) on x86_64; keep cross-arch build matrix |

---

## Scope

**Mode**: targeted

### Included Components

- `src/eq3configd` (including `src/networkconfig.cpp`, `src/udpframe.cpp`, `main.cpp`, `include/`)
- `src/eq3configcmd`
- `src/crypttool` (including `crypttoolconfig.*`, `config.txt`)
- `src/libeq3config` (command framework, `netconfigcmd`, `setlgwkey`, `rfd-interface-copy`; update commands for audit only)
- `src/libLanDeviceUtils` (audit of IV/key handling and `TCPEncryption`)
- `src/libUnifiedLanComm` (IV generation, key-missing handling, handshake)
- UI coupling points: `cp_security.cgi`, `backup.tcl` crypttool and eq3configcmd calls, and the `/etc/config/netconfig` and `/etc/config/crypttool.cfg` file contracts (interface only; page redesign belongs to webui-config-pages)

### Excluded Components

- `src/rfd`, `src/hs485d`, `src/multimacd`, `src/libhsscomm`, `src/libXmlRpc`, `src/hss_led`, `src/ssdpd`, `src/hs485dLoader`, `src/SetInterfaceClock`, kernel modules (consumers only; regression-test against them)
- Closed-source `bin/ReGaHss` and HmIP Java server (they read `crypttool.cfg` per `etc.md` but are not changeable here)
- Redesign of `cp_*` pages and the nextGen UI shell (other plans)
- Buildroot packaging in the sibling OpenCCU repo (coordination only)

### Critical Components

- `eq3configd/main.cpp` frame parsing (:289-437) and restart path (:369-374, :449)
- `crypttool.cpp` `sign()` (:103-215), `validate()` (:59-92) and `crypttoolconfig.cpp` key store
- `UnifiedLanCommController.cpp` `createIV()` (:464-483) and `handleSetInitVectorMessage` (:320-365)
- `networkconfig.cpp` (both copies) as owner of `/etc/config/netconfig` and `crypttool.cfg` reads

### Boundaries

- Do not change the UDP frame layout, the default port 43439, opcodes (`I n c C * >`) or the `eQ-3__UDP-Crypt` signature prefix without a compatibility mode.
- Do not change the `crypttool` flag set, key types (0 default, 1 current, 2 previous, 3 temporary) or the 32-hex signature output of `-s` for existing callers; new behaviour is additive and versioned.
- Any change to IV or handshake in `libUnifiedLanComm` must be validated against the real HMW-LGW and BidCoS LAN gateway behaviour before release (peer expects the exchanged IVs, not a particular generator).

---

## Dependencies

### Internal

- `crypttool`, `eq3configd` -> `elvutils` (including `md5.cpp`), OpenSSL `crypto`
- `eq3configcmd` -> `eq3config` -> `LanDeviceUtils`, `UnifiedLanComm`, `elvutils`, `crypto`, `rt`, `pthread`
- `UnifiedLanComm` -> `LanDeviceUtils`, `elvutils`; `LanDeviceUtils` -> `elvutils`, `crypto`
- Consumers of the libraries: `rfd` (`BidcosLanInterface`), `hs485d` (`LGWPortWrapper`, `HS485ControllerLGW`), `eq3config` commands
- Shared files: `/etc/config/netconfig`, `/etc/config/crypttool.cfg`, `/var/board_sgtin`, `/var/board_serial`, `/VERSION`, `/var/run/eq3configd.pid`
- Web UI: `src/webui/www/config/cp_security.cgi`, `backup.tcl` (and the drifted `www/config` copies), `cp_network.cgi` (netconfig file)
- `src/hss_led` (pid-file liveness of `eq3configd`)

### External

- OpenSSL libcrypto (EVP MD5, AES-128-CBC) from the Buildroot toolchain
- Linux networking init script `/etc/init.d/S40network` (restarted by `eq3configd`)
- HomeMatic LAN gateways (HMW-LGW TCP/1000, BidCoS LAN gateway) speaking the unified LAN protocol
- eQ-3 and third-party discovery or setup tools using UDP/43439 (not in repo, behaviour unverified)
- OpenCCU Buildroot repo (SHA pin, prebuilt `bin/` consumption)

---

## Constraints

### Unchanged

- UDP/43439 identify and config protocol and its encrypted wrapper (field-deployed clients)
- `crypttool` CLI flags, key indices and the signature format used by existing `.sbk` backups (backups created on older CCUs, including with the default key, must still verify and restore)
- `/etc/config/crypttool.cfg` line format `<index> <md5hex>` read by `crypttool`, `eq3configd`, `libeq3config`, `cp_security.cgi` and the HmIP Java server
- `/etc/config/netconfig` key names (`HOSTNAME MODE CRYPT IP NETMASK GATEWAY NAMESERVER1/2 CURRENT_*`)
- `eq3configcmd` multi-call behaviour (symlink dispatch by `argv[0]`) and the command names used by init scripts and CGIs (`rfd-interface-copy`, `setlgwkey`, `wait-for-file`, `md5`, `update-*`)
- Unified LAN handshake sequence (`H`, `V`, `S`, `>`) as seen by gateways

### Integration Systems

- `rfd` and `hs485d` (library consumers), `hss_led` (liveness), `lighttpd` and Tcl CGIs (exec callers), Buildroot packaging, LAN gateways, setup tools using UDP/43439

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | `eq3configd` accepts unauthenticated network-config changes (`CRYPT` off by default) and then runs `system("/etc/init.d/S40network restart")`; with the published default key, encrypted frames are also forgeable | Default `CRYPT` to on for new installs or require an explicit user key; replace `system()` with `fork/execv` of a fixed path; document the LAN-trust assumption and add a firewall note; keep legacy mode behind an explicit opt-in | security.md; src.md eq3configd (`main.cpp:449`, :229-234) |
| high | Memory-safety defects on network input: VLA `newdata[newDataLength]` sized from the datagram (cap `BUFSIZE 2048`), unchecked `EVP_DecryptUpdate` length (`main.cpp:324,334`) | Replace the VLA with a bounded buffer and check all `EVP_*` return values and lengths; fuzz the frame parser; build with ASan/UBSan in CI | src.md Security and Technical Debt |
| high | Hard-coded default key `"Markus is awesome"` (`crypttool.cpp:26`, `main.cpp:50`) and MD5 key derivation; cannot simply be removed because old backups and devices rely on it | Document as accepted legacy risk; add a versioned signature (HMAC-SHA-256 over data with a per-device random key) used for new backups while the verifier still accepts old signatures; force key creation at first boot or setup | security.md Secrets Management |
| high | Predictable IV in `UnifiedLanCommController::createIV()` (`srand(time*3/2)` + `rand()`); the library is shared with `rfd` and `hs485d` | Use `RAND_bytes`; fail the handshake instead of continuing when the key is missing (`:327-329`); validate against real gateways | security.md Data Protection; src.md libUnifiedLanComm |
| medium | `crypttool` signing uses AES-CBC with a zero IV over an MD5 digest, effectively a deterministic MAC of weak strength | Add the new versioned MAC (above); keep the old output for verification only | `crypttool.cpp:178-187` |
| medium | Keys passed via `-k` appear in the process list and are logged at debug level (`crypttool.cpp:61,96,105`); the UI calls `exec crypttool -S -k $key` (`cp_security.cgi:64`) | Add stdin or fd key input and stop logging key material; change the Tcl callers in both `src/webui/www` and the `www` copy | src.md Security; `cp_security.cgi:64,174,275` |
| medium | Duplicate and already diverging `networkconfig.cpp` (24 diff lines) in eq3configd and libeq3config | Move to one shared source file or static library and diff-review the 24 lines first | technical-debt.md; src.md Technical Debt |
| medium | No tests for any component; a hardening change can break field compatibility silently | Add golden-frame tests for UDP parsing, `crypttool -s` known-answer tests, and an IV-handshake loopback test; wire `libUnifiedLanComm/test` into CMake | testing.md |
| medium | Library change ripples into `rfd`/`hs485d`, which were only partially analysed; `libLanDeviceUtils` and `libeq3config` bodies unread | Complete the analysis of `libLanDeviceUtils/src/*.cpp` and `libeq3config/netconfigcmd` before changing; run radio and LGW smoke tests | src.md "NOT analyzed" gaps |
| low | Prebuilt `bin/` binaries (`eq3configd` mode 644) and ISO-8859 sources; packaging pins by SHA | Rebuild binaries in CI, fix modes in `install(PROGRAMS)`, convert sources to UTF-8 in a separate commit | bin.md; src.md Technical Debt |

---

## Success Criteria

- No hard-coded key in new installs: a per-device key is generated or required before `CRYPT` can be disabled; the legacy default key remains only in a documented compatibility path.
- `createIV()` uses a CSPRNG and a missing key aborts the handshake; verified against HMW-LGW and BidCoS LAN gateway.
- `eq3configd` has no VLA from network input, checks all `EVP_*` results, no `system()`, and survives a fuzzing run of the frame parser without ASan/UBSan findings.
- A single `networkconfig.cpp` source is used by `eq3configd` and `libeq3config`.
- Existing `.sbk` backups and `crypttool -s` output still verify (known-answer test); `cp_security.cgi` and `backup.tcl` work unchanged apart from key input via stdin.
- UDP/43439 frame format, `crypttool.cfg` and `netconfig` formats unchanged and covered by tests.
- Unit and known-answer tests for `eq3configd`, `crypttool` and `libUnifiedLanComm` exist and run in CI; sanitizer build is green.
- All security weaknesses that are not fixed are listed in a security note with rationale and owner.
- All existing functionality retained; zero regressions in discovery, network configuration, backup/restore and LAN-gateway connectivity.

---

## Focus Areas

1. `eq3configd` unauthenticated config path and `system()` restart (`main.cpp:449`, `CRYPT` default).
2. Memory safety of the UDP frame parser (`main.cpp:289-437`, `udpframe.cpp`), plus fuzzing.
3. Key management: default key, MD5-derived keys, `crypttool.cfg` permissions, `-k` exposure, versioned signature scheme with backward compatibility.
4. IV generation and handshake failure handling in `libUnifiedLanComm` (shared with `rfd`/`hs485d`).
5. De-duplication of `networkconfig.cpp` and cleanup of dead artefacts (Code::Blocks files, Win32 wrapper, encoding).
6. Test harness: known-answer tests, golden frames, loopback handshake, CI sanitizers.
7. UI coupling: one Tcl wrapper for `crypttool` and `eq3configcmd` calls in `cp_security.cgi` and `backup.tcl`, applied to both `src/webui/www` and the drifted `www` copy.
8. Finish analysis of `libLanDeviceUtils` and `libeq3config` command bodies.

---

## Consequences

### Positive Outcomes

- Removes the most visible cryptographic weaknesses without breaking deployed devices or backups.
- The nextGen UI gets a stable, key-safe CLI contract and can treat these tools as a black box.
- Smaller attack surface on the unauthenticated UDP port and a testable parser.
- One code path for network configuration instead of two diverging copies.

### Negative Outcomes

- Backward compatibility forces a legacy-key path to remain; the default-key weakness cannot be eliminated for old backups and devices.
- Changing `CRYPT` defaults may affect users who rely on plain UDP configuration from setup tools.
- Work requires rebuilding and republishing `bin/` artefacts across four architectures and coordinating a SHA bump in the OpenCCU packaging repo.
- Hardware validation (LGW, radio gateways) is needed and is not available in CI.

### Follow-Up Decisions

- Whether to expose signing and key management as JSON-RPC methods in the new UI API instead of `exec crypttool`.
- Choice of the new signature primitive (HMAC-SHA-256 vs AES-GCM) and key-rotation UX.
- Policy for `CRYPT` default and migration of existing installations.
- Whether to keep or retire `update-coprocessor` and `update-lgw-firmware` once their consumers are re-analysed.
- Whether to remove committed `bin/` binaries in favour of CI-built artefacts.

---

## Source Documents

- `.migration/plan-context.md` - shared engagement context
- `.migration/docs/modules/src.md` - eq3configd, eq3configcmd, crypttool, libUnifiedLanComm, libLanDeviceUtils, libeq3config sections (parts 1 and 1c)
- `.migration/docs/cross-cutting/security.md` - secrets, data protection, vulnerabilities
- `.migration/docs/cross-cutting/technical-debt.md` - duplicate `networkconfig.cpp`
- `.migration/docs/cross-cutting/integration-seams.md` - pid-file liveness, LGW discovery
- `.migration/docs/modules/etc.md` - `crypttool.cfg` readers
- `.migration/docs/modules/bin.md` - prebuilt binaries and modes
- `.migration/docs/modules/webui-config-pages.md` - cp_* conventions
- Source spot checks: `src/webui/www/config/cp_security.cgi`, `src/webui/www/config/backup.tcl`, diff of the two `networkconfig.cpp` copies

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

