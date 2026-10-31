# Migration Plan: Retain prebuilt bin/ payload, treat ReGaHss as a black box, wrap it behind a gateway for the nextGen UI

**Status**: assessed | **Date**: 2026-10-09 | **Type**: coupling-assessment (retain closed-source binary; wrap at the UI seam; make binary provenance and refresh reproducible; no runtime technology change)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | bin-feature | primary | index.json | `bin/`: 47 files = 44 ELF binaries (11 programs x 4 architectures) + 3 Tcl scripts (`hm_autoconf`, `hm_deldev`, `hm_startup`). Includes closed-source `ReGaHss` (R1.00.0388.0259) |
| 2 | webui-api | affected | index.json | JSON-RPC methods under `src/webui/www/api` are the only UI path to ReGaHss (`rega_script` via `tclrega.so`); `ccu/restartReGa.tcl:10` restarts it through monit; `user/setregaversion.tcl:11` writes `/etc/config/ReGaHssVersion` |
| 3 | webui-rega-pages | affected | index.json | ReGa pages (`.htm` with embedded ReGa script) are executed by ReGaHss's own web server (port 8183 / 1998 per external contract). Not renderable without the black box |
| 4 | src-feature--tcl-extensions | dependency | index.json | `tclrega.so`, `tclrpc.so` are the Tcl-side client contract to ReGaHss; the three `bin/hm_*` scripts `load` them |
| 5 | src-feature--rfd / src-feature--hs485d | dependency | index.json | XML-RPC servers that ReGaHss registers with (`init`, callbacks). Wire behaviour is the compatibility contract with the closed binary |
| 6 | src-feature--hss-led | affected | index.json | Liveness check of `/var/run/ReGaHss.pid` (`InfoLed.cpp:213`) and UDP 8182 status feed tagged `REGAHSS` |
| 7 | src-feature--config-tools | dependency | index.json | Source of `eq3configd`, `eq3configcmd`, `crypttool` binaries in `bin/`; carries the hard-coded key and unauthenticated UDP findings |
| 8 | src-feature--multimacd | dependency | index.json | Source of the `multimacd` binary in `bin/` |

---

## Context

### Summary

`bin/` is the repository-resident runtime payload for the CCU root filesystem. It contains, for each of four architectures (x86_64, aarch64, armhf, i686), the same 11 ELF programs: `ReGaHss`, `rfd`, `hs485d`, `multimacd`, `eq3configcmd`, `hss_led`, `eq3configd`, `crypttool`, `ssdpd`, `hs485dLoader`, `SetInterfaceClock`. Ten of the 11 are built from C++ in `src/` (CMake, `cxx_std_11`) and written back to `bin/<platform>/` by `make deploy` or by a build with `DEPLOY_TO_REPO=ON`. The eleventh, `ReGaHss`, has no source in this repository (`cmake/Components.cmake:1-2`: "Prebuilt ReGaHss ... are staged as assets"). It is the HomeMatic script and logic engine and also the web server for ReGa pages. Three readable Tcl scripts (`hm_startup`, `hm_deldev`, `hm_autoconf`) sit at the top level and are run by triggers outside this repo (ReGa start, device deletion event, autoconf).

For the nextGen UI, `bin/` is not a migration target. It is the hard runtime dependency underneath it. ReGaHss executes ReGa pages and serves `rega_script` calls that the JSON-RPC layer (`/api/homematic.cgi`, 180 methods) relays. The UI renovation therefore has to treat ReGaHss as a versioned black box with a defined contract (ReGa script language and DOM, `tclrega.so` client, XML-RPC registration, ports 8183 and 1998, monit service name `ReGaHss`, pid file, `/etc/config/ReGaHssVersion`) and must not depend on its internals.

### Migration Drivers

- The UI renovation cannot replace what it cannot see: ReGaHss is the only runtime component without source, and ReGa pages, program and room editing (no JSON-RPC endpoints exist for those) depend on it.
- Provenance and licence of the closed binary are not documented in the repo: no version file, no checksum manifest, no source reference, no record of where the vendor binary comes from. The version (R1.00.0388.0259) is known only from the git commit message of `030dba79`.
- Update process is manual and frequent: five ReGaHss refresh commits in the recent history (`.0255` to `.0259`, PRs #139, #142, #152, #154, #159), each a full binary replacement x 4 architectures. Binary blobs make the git history heavy (`.git` is about 514 MB, 478 commits touch `bin/`).
- Binaries and sources are out of step: the committed x86_64 `rfd`, `hs485d`, `multimacd` and `hss_led` binaries date from 2026-06-03, while their `src/` directories changed on 2026-10-03 (rfd), 2026-09-06 (hs485d, multimacd) and 2026-09-27 (hss_led). `eq3configd` binary is from 2026-02-26, its source from 2026-07-13. Nothing in CI proves that `bin/` corresponds to `src/`.
- Security findings sit in the binaries' sources (hard-coded key `"Markus is awesome"` in `crypttool.cpp:26` and `eq3configd/main.cpp:50`, predictable IV, unauthenticated `eq3configd` UDP unless `CRYPT=1`) and no patch can reach ReGaHss itself; its security patching depends entirely on the upstream vendor.
- Quality hygiene: four binaries per architecture (`ReGaHss`, `hss_led`, `eq3configd`, `ssdpd`) are committed with mode 644 while the other seven are 755 (16 of 47 tracked files).

### Current State

Monorepo (Tcl 72%, JavaScript 16%, C++ 8%, C/C++ 3%; CMake/Make; GitHub Actions) that is consumed by the sibling Buildroot repository `/home/standard/dev/OpenCCU` by SHA pin. Binaries are tracked in git (`.gitignore` only ignores `/build`). CI (`.github/workflows/ci.yml`) builds from source with `DEPLOY_TO_REPO=OFF`, matrix over four platforms, and checks the staged output formats. Only the `update-prebuilt-libraries.yml` workflow regenerates committed artifacts automatically (libXmlRpc, libxmlparser, built in a `debian:bookworm-slim` container so the glibc baseline matches the target); there is no equivalent for the program binaries in `bin/`. `tests/test-components.py` treats `bin/x86_64-linux-gnu/ReGaHss` as a protected input that `make install` must not overwrite; no test inspects binary contents. Licence: repository default is HMSL 2.0 (eQ-3 AG), whose definition of "HomeMatic software" explicitly includes the program/script engine; section 3.4 forbids decompiling and reverse engineering beyond Sec. 69e UrhG, 3.7 forbids adapting to competitors' hardware, 3.2 requires modifications to be published as source under HMSL.

### Cross-Cutting Findings

- Closed-source `ReGaHss` has no source, no recorded origin, no checksum manifest; version only inferable from commit messages (bin.md, provenance section). Binary-internal data (NEEDED libs, symbols, flags) was not analysed in the docs; here only `strings` confirmed `R1.00.0388.0259` in the x86_64 binary.
- `licenses/licenses.md` exceptions table has path mismatches and references `HM-ThirdParty-Software-Licenses.txt`, which does not exist in the repo (HMSL 2.0 section 2). Third-party notices for what is linked into ReGaHss cannot be verified.
- Security: hard-coded key and predictable IV in `crypttool` / `eq3configd` / `UnifiedLanCommController` (security.md); config-tool mode in `homematic.cgi:147-148` skips privilege checks; request-driven exec at `cp_software.cgi:493`. All are in or reach binaries shipped from `bin/`.
- Integration: `hs485dLoader` edits `/etc/config/InterfacesList.xml` and registers `xmlrpc_bin://127.0.0.1:<port>`; this registration format is the contract with ReGaHss and is rated MEDIUM risk in integration-seams.md. XML-RPC surface of rfd/hs485d (`init`, callbacks, `system.multicall`) is rated HIGH compatibility risk for any reimplementation.
- Testing: only `tests/test-components.py` (staging, aliases, deploy semantics on a fixture; CI x86_64 only), `hss_led` LedControllerTest and the devicetype-strip test. No smoke test starts ReGaHss, rfd or hs485d; none checks `bin/` against `src/`.
- Duplication: `bin/hm_*` vs `src/webui/rega/bin/hm_*` already differ by one whitespace-only line in `hm_autoconf`; the `src/webui/rega/bin` copy is unreferenced by the build. Also `www/` is a drifted committed copy of `src/webui/www` (tech debt), the same pattern as `bin/` vs `src/`.
- The three Tcl scripts are the only readable specification of ReGa-facing behaviour in the repo (`dom.GetObject`, `EnumUsedIDs`, `ReadyConfig`, metadata keys `AUTOCONF`, `chnActive`), with hard-coded `xmlrpc://127.0.0.1:32010`, `/bin/tclsh`, lock file `/var/hm_autoconf.lock`.
- Deploy default hazard: `DEPLOY_TO_REPO=ON` (`CMakeLists.txt:25`) makes an ordinary build rewrite tracked binaries; only the `make` wrapper turns it off (`Makefile:13`).

---

## Migration Goal

**Keep the prebuilt payload stable, make ReGaHss a contract-bounded black box behind a UI gateway, and make the provenance and refresh of every binary in `bin/` verifiable.**

The UI renovation must not require any change inside ReGaHss. Goals for this feature: (1) document and freeze the ReGaHss contract so the nextGen UI talks to it only through a narrow gateway (JSON-RPC methods and a thin new adapter), never by embedding ReGa pages or private behaviour; (2) record version, origin, checksum and licence basis for each ReGaHss release in a manifest and verify it in CI; (3) prove that the committed `bin/<platform>/` ELF files correspond to the `src/` revision they claim, or stop committing them; (4) leave the option of a later reimplementation of ReGa open, but do not start it inside the UI migration.

---

## Decision

### Approach: Retain and wrap (keep ReGaHss as is; gateway at the UI seam; hygiene fixes on bin/)

Keep all 44 ELF files and 3 scripts in place. Place the nextGen UI on top of ReGaHss through a small, explicit gateway layer (the existing JSON-RPC `homematic.cgi` and later a typed adapter in front of `rega_script`), so the UI sees only operations, not ReGa scripts or pages. In parallel, introduce a manifest (`bin/MANIFEST` or equivalent: file, architecture, version, sha256, ELF BuildID, source commit or upstream origin, licence), fix file modes, and add a CI check. Phase it:

1. Inventory and freeze (low effort, no behaviour change): manifest, modes (755 for all programs), checksum verification in CI, record R1.00.0388.0259 and its origin, add `NEEDED`/symbol inspection (`readelf`, `ldd` equivalent for all four architectures) to establish the real ABI baseline.
2. Provenance and licence confirmation: obtain from eQ-3 / the OpenCCU maintainers written statement of origin and redistribution basis for ReGaHss under HMSL 2.0 section 3; complete `HM-ThirdParty-Software-Licenses.txt` or the equivalent notice.
3. Rebuild proof: build the ten programs from `src/` in the same pinned Debian bookworm container that `update-prebuilt-libraries.yml` uses, compare to committed binaries (BuildID or section-level diff, accepting non-reproducible timestamps), and either automate `bin/` regeneration (like the libraries workflow) or remove program ELFs from git and publish them as release artifacts with checksums.
4. ReGa contract capture: derive a contract test suite (ReGa script smoke tests via `tclrega.so`, XML-RPC registration handshake against rfd/hs485d, startup of the three `hm_*` scripts) that runs against any new ReGaHss drop; refuse upgrades that fail it.
5. Optional, deferred: reimplementation or replacement of ReGaHss only after the contract tests exist; behaviour is documented from outside only (black box), because HMSL 3.4 forbids decompiling.

**Rationale**: Migration necessary due to: (1) ReGaHss is a closed binary with no source and no recorded provenance (bin.md "ReGaHss" section; cmake/Components.cmake:1-2), so it cannot be modernised, only wrapped or replaced; (2) the UI depends on it for ReGa pages and `rega_script`, and the sibling OpenCCU repo plus OCI, Home Assistant and Helm packaging hand-synchronise ports 8183 and 1998 and the monit service name, so a drop-in replacement would break them (external-context/summary.md); (3) the ten source-built programs are already C++/CMake with CI builds and need no technology change, but their committed binaries are older than the current sources (rfd binary 2026-06-03 vs src 2026-10-03), so hygiene and reproducibility are the real risks; (4) HMSL 2.0 section 3.4 prohibits reverse engineering, which rules out a source-informed reimplementation; (5) there are no tests for daemon behaviour, so any deeper change is unverifiable today.

### Rejected Options

- **Keep with no changes (status quo)**: leaves the unverifiable provenance, stale-binary and mode issues; the UI renovation would add more implicit dependencies on a black box. Acceptable only as a fallback if the gateway phase is dropped.
- **Reimplement ReGaHss now (clean room)**: the ReGa script language, DOM objects, XML-RPC registration and ReGa page semantics are not specified anywhere in the repo, and HMSL 3.4 forbids reverse engineering; effort and compatibility risk are very high and the benefit for the UI is indirect. Keep as a later option after contract tests exist.
- **Embed or expose ReGa pages directly in the new UI**: couples the nextGen UI to ReGaHss internals and its HTML-fragment page model; rejected in favour of a gateway.
- **Rebuild and replace ReGaHss from upstream source**: no source available.
- **Remove binaries from git immediately and fetch on build**: attractive for repo size, but the sibling Buildroot repo pins this repo by SHA and expects `bin/<platform>/` to exist; only viable after the consumer side is migrated (follow-up decision).

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C++ (cxx_std_11) for 10 programs; closed-source native binary for ReGaHss; Tcl for `hm_*` scripts | Unchanged for programs (C++11 retained; evaluate C++17 only when the sources are touched for other reasons); ReGaHss unchanged (black box); Tcl scripts unchanged |
| Frameworks | CMake + Makefile wrapper, libXmlRpc / libxmlparser (LGPL-2.1), libelvutils, libhsscomm, `tclrega.so` / `tclrpc.so` | Unchanged; add manifest + checksum verification and pinned-container rebuild check |
| Infrastructure | Monorepo with tracked binaries for 4 architectures (x86_64, aarch64, armhf, i686), GitHub Actions (CI on x86_64 checks only), consumed by Buildroot sibling by SHA pin, OCI / Home Assistant / Helm packaging | Preserve; add per-architecture CI verification and a release-artifact path for binaries as a later option |

---

## Scope

**Mode**: targeted

### Included Components

- `bin/x86_64-linux-gnu/`, `bin/aarch64-linux-gnu/`, `bin/arm-linux-gnueabihf/`, `bin/i686-linux-gnu/` (44 ELF files)
- `bin/hm_autoconf`, `bin/hm_deldev`, `bin/hm_startup`
- Staging and deploy logic that writes them: `cmake/Components.cmake` (lines 29-30, 97-122, 163-176), `CMakeLists.txt:25,47-75`, `Makefile:13,23-32`
- New: binary manifest, CI verification, ReGaHss contract test suite
- Duplicate script copies in `src/webui/rega/bin/` (to be resolved)

### Excluded Components

- `src/rfd`, `src/hs485d`, `src/multimacd`, `src/hss_led`, `src/config-tools` and library sources (covered by their own feature plans)
- `src/webui` UI code, `www/`, easymodes (covered by webui-* plans); only the gateway seam is in scope here
- `lib/<platform>/` shared libraries, `firmware`, `opt`, `usr`, `etc`
- Any change to ReGaHss internals (no source, reverse engineering not permitted)

### Critical Components

- `bin/<platform>/ReGaHss` (black box; ReGa pages, `rega_script`, registration with rfd/hs485d)
- `bin/hm_autoconf`, `bin/hm_startup` (only readable spec of ReGa DOM usage and autoconfiguration)
- `bin/<platform>/crypttool`, `eq3configd`, `eq3configcmd` (hard-coded key, predictable IV, unauthenticated UDP)

### Boundaries

- The nextGen UI reaches ReGaHss only through the gateway (JSON-RPC methods or a typed adapter); it does not parse ReGa page output or invoke ReGaHss binaries directly.
- Replacement of any binary is a separate decision with a contract test as entry criterion.
- ReGaHss release acceptance is gated by the contract tests and the manifest check.

---

## Dependencies

### Internal

- `tclrega.so`, `tclrpc.so` (`src/tclrega`, `src/tclrpc`): client of ReGaHss; loaded by `hm_*`
- `libelvutils`, `libeq3config`, `libhsscomm`, `libLanDeviceUtils`, `libUnifiedLanComm`, `libxmlparser`, `libXmlRpc` under `lib/<platform>/`
- `src/webui/www/api` (JSON-RPC methods `ccu/restartReGa.tcl`, `user/setregaversion.tcl`, `rega_script`-backed methods, `/www/api/eq3/common.tcl`, `event.tcl`)
- `src/hss_led` (pid file and UDP 8182 liveness), `src/rfd`, `src/hs485d` (XML-RPC peers of ReGaHss)
- `cmake/Components.cmake`, `Makefile`, `tests/test-components.py`, `.github/workflows/ci.yml`, `update-prebuilt-libraries.yml`

### External

- Closed-source ReGaHss binary supplied by upstream (eQ-3 / OpenCCU maintainers; version series R1.00.0388.xxxx; refreshed by Jens Maus via PRs). No documented source URL or checksum.
- Homematic Software License 2.0 (eQ-3 AG): redistribution, no-decompile and no-competitor-hardware terms
- Sibling repo `/home/standard/dev/OpenCCU` (Buildroot packaging, pins this repo by SHA, applies 64 rootfs patches)
- Debian bookworm toolchains and cross compilers (aarch64, armhf, i686) used by CI
- monit (service name `ReGaHss`), `/bin/tclsh`, `logger`, XML-RPC endpoint 127.0.0.1:32010 (HmIP legacy port), ports 8183 / 1998 (ReGa), 32000 / 32001 (hs485d / rfd)

---

## Constraints

### Unchanged

- Directory layout `bin/<platform>/<program>` and the four platform triplets (consumed by CMake, Buildroot sibling, container images)
- File and service names: `ReGaHss`, `rfd`, `hs485d`, `multimacd`, `hss_led` (alias `hss_ledctl`), `eq3configd`, `eq3configcmd`, `crypttool`, `ssdpd`, `hs485dLoader`, `SetInterfaceClock`, `hm_autoconf`, `hm_deldev`, `hm_startup`
- ReGaHss contract: ReGa script language and DOM, `tclrega.so` interface, `xmlrpc_bin://` registration via `InterfacesList.xml`, pid file `/var/run/ReGaHss.pid`, `/etc/config/ReGaHssVersion`, ports 8183 and 1998
- Port contract hs485d 32000, rfd 32001 hand-synchronised across OCI, Home Assistant and Helm
- JSON-RPC `/api/homematic.cgi` semantics used by the UI and third parties (levels NONE/GUEST/USER/ADMIN = 0/1/2/8, sid in JSON body, HTTP 200 always)
- CRLF in `www/tcl/eq3/rega.tcl` and `webui.js` first-10-line structure (rootfs patches in the sibling repo)
- Licence terms of HMSL 2.0 for ReGaHss; no reverse engineering

### Integration Systems

- ReGaHss script engine and web server (closed)
- rfd (XML-RPC 2001 / 32001), hs485d (XML-RPC 2000 / 32000), multimacd, HMIPServer
- monit supervision and pid-file based liveness (hss_led)
- Buildroot sibling repository and OCI / Home Assistant / Helm packaging
- `/dev/eq3loop` ioctls, hss_led AF_UNIX socket `/run/hss_led/control` and UDP 8182

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | ReGaHss is closed source with undocumented provenance; security fixes, bugs and licence status depend wholly on upstream and cannot be verified | Manifest with origin, sha256, BuildID, licence basis; written confirmation from eQ-3 / maintainers; subscribe to upstream release notes; keep a rollback copy of the previous release | bin.md "ReGaHss" and "Provenance"; licenses.md (HMSL 2.0 s.2, s.3.4); cmake/Components.cmake:1-2 |
| high | UI renovation couples to ReGa internals (ReGa pages, `rega_script`, program and room editing without JSON-RPC endpoints) and breaks when ReGaHss is updated or replaced | Gateway layer and contract tests; no UI code may depend on ReGaHss output formats outside the contract; version-gate the UI on ReGaHss version | bin.md risks 1 and 5; integration-seams.md; plan-context (no endpoints for program/room editing) |
| high | Committed binaries are older than their sources (rfd 2026-06-03 vs src 2026-10-03; hs485d, multimacd, hss_led, eq3configd likewise), so fixes in `src/` may not be shipped, or the reverse | Pinned-container rebuild comparison per architecture; CI check or auto-regeneration workflow like `update-prebuilt-libraries.yml`; or move ELF files to release artifacts | git log of `bin/x86_64-linux-gnu/*` vs `src/*`; update-prebuilt-libraries.yml covers libraries only |
| high | Security defects shipped in binaries: hard-coded key, predictable IV, unauthenticated `eq3configd` UDP unless `CRYPT=1`, config-tool mode privilege bypass | Owned by src-feature--config-tools plan; bin side: key rotation compatibility test, rebuild and re-deploy after fix, record in manifest | security.md; crypttool.cpp:26; eq3configd main.cpp:50; UnifiedLanCommController.cpp:464-483 |
| medium | No tests of daemon behaviour; `tests/test-components.py` runs on x86_64 only and does not inspect binaries; armhf, aarch64, i686 binaries are never executed in CI | Add QEMU user-mode smoke tests (`--version`, startup, XML-RPC introspection) per architecture; ReGaHss start test | testing.md; bin.md "Test coverage" |
| medium | Mode inconsistency: `ReGaHss`, `hss_led`, `eq3configd`, `ssdpd` are 644 in all four architectures (16 files); direct use from `bin/` would fail | Normalise modes to 755 in git; add CI assertion | `git ls-files -s bin` (16 x 100644, 31 x 100755); bin.md risk 2 |
| medium | Default `DEPLOY_TO_REPO=ON` silently rewrites tracked binaries on an ordinary build; binary blobs bloat history (.git about 514 MB, 478 commits on `bin/`) | Default to OFF; require explicit `make deploy`; consider Git LFS or release artifacts after the consumer repo is ready | CMakeLists.txt:25,62-66; Makefile:13 |
| medium | Script duplication `bin/hm_*` vs `src/webui/rega/bin/hm_*` (already drifted by one line) and hard-coded paths and ports (`xmlrpc://127.0.0.1:32010`, `/bin/tclsh`) | Single source of truth in `bin/`; delete or symlink the webui copy; unit-test the scripts with a stubbed `tclrega` | bin.md "Duplicate copies" and risk 4 |
| medium | Four architectures x 11 binaries must all be re-sourced or rebuilt for any platform or glibc change; glibc baseline mismatch makes prebuilt binaries unloadable (documented for libraries) | Build in the pinned bookworm container; record glibc baseline and `NEEDED` in the manifest | update-prebuilt-libraries.yml header; bin.md risk 1 |

---

## Success Criteria

- All 47 files in `bin/` are listed in a manifest with architecture, version, sha256, ELF BuildID, source commit or upstream origin and licence; a CI job fails on mismatch.
- ReGaHss release R1.00.0388.0259 (and each later release) has a documented origin and a recorded redistribution basis under HMSL 2.0.
- For each of the 10 source-built programs and 4 architectures, the committed binary is either reproduced from the recorded `src/` commit in the pinned container (BuildID or documented diff) or replaced by a CI-published artifact; no committed binary is older than the last functional source change without being flagged.
- File modes of all programs are 755; `DEPLOY_TO_REPO` defaults to OFF.
- A ReGaHss contract test suite (ReGa script smoke tests, XML-RPC registration handshake with rfd/hs485d, `hm_startup`/`hm_deldev`/`hm_autoconf` execution against stubs) runs in CI and gates ReGaHss updates.
- The nextGen UI uses ReGaHss only through the gateway; no UI code parses private ReGa output or calls the binary directly.
- All existing contracts are maintained: ports 8183 / 1998 / 32000 / 32001, monit service name `ReGaHss`, `/etc/config/ReGaHssVersion`, JSON-RPC semantics, `bin/<platform>/` layout consumed by the Buildroot sibling and OCI / Home Assistant / Helm.
- Security model equivalent or stronger; hard-coded key and predictable IV remediation tracked in src-feature--config-tools and reflected in refreshed binaries.
- Zero regressions in the sibling repo's rootfs patch set (64 patches) caused by changes in `bin/`.

---

## Focus Areas

1. ReGaHss provenance, licence basis and manifest (checksum, version, BuildID, origin)
2. Gateway definition and ReGaHss contract capture (ReGa script/DOM usage, `tclrega.so`, XML-RPC registration, ports, monit, pid file)
3. Binary-to-source consistency and reproducible rebuild in the pinned bookworm container for all four architectures
4. Security fixes reaching the shipped binaries (crypttool / eq3configd key and IV, eq3configd UDP authentication)
5. Smoke and contract tests per architecture (QEMU) and for the `hm_*` scripts
6. Repository hygiene: file modes, `DEPLOY_TO_REPO` default, `hm_*` duplication, history size
7. ReGaHss update process: PR template with release notes, version, checksum, rollback and contract test results
8. Long-term option analysis for replacing ReGaHss (deferred, documented from external behaviour only)

---

## Consequences

### Positive Outcomes

- The UI renovation proceeds without touching the black box; ReGaHss upgrades become a controlled, tested operation.
- Binary provenance and licence status become auditable; security-relevant updates can be traced to a version and checksum.
- Stale-binary risk is removed and CI covers all four architectures, not only x86_64.
- Cleaner repository (modes, no accidental binary rewrites, single copy of the `hm_*` scripts).

### Negative Outcomes

- ReGaHss remains closed: no ability to fix or audit it, continued upstream dependency, and the contract is only as good as the black-box tests.
- Added CI effort (QEMU, pinned container rebuilds) and manifest maintenance on every ReGaHss refresh.
- Reproducible bit-identical rebuilds may not be achievable (timestamps, toolchain); a documented tolerance policy is needed.
- Gateway adds a layer between UI and ReGa; some ReGa-only functions (program and room editing) have no JSON-RPC endpoints until the gateway adds them.

### Follow-Up Decisions

- Obtain a written licence and redistribution statement for ReGaHss from eQ-3 / OpenCCU maintainers.
- Choose binary storage: keep in git, Git LFS, or release artifacts (requires coordinating with the Buildroot sibling pinned by SHA).
- Choose gateway form: extend `homematic.cgi` JSON-RPC, or a new typed adapter in front of `rega_script`.
- Decide whether and when a ReGaHss replacement is worth pursuing, and under which legal constraint (HMSL 3.4).
- Decide the future of `src/webui/rega/bin/hm_*` duplicates and whether `hm_*` should move to `src/` with a build step.
- Determine real ELF dependencies (`NEEDED`, symbols, glibc baseline) with binary inspection tools, which the source documents did not cover.

---

## Source Documents

- `.migration/docs/modules/bin.md` — binary inventory, mapping to `src/`, provenance, scripts, risks
- `.migration/docs/modules/licenses.md` — HMSL 2.0 terms (sections 2, 3.2, 3.4, 3.7) and exceptions table
- `.migration/docs/cross-cutting/integration-seams.md` — ReGaHss registration, XML-RPC contract, pid-file liveness
- `.migration/docs/cross-cutting/security.md` and `technical-debt.md` — key, IV, UDP, privilege findings; drifted copies
- `.migration/docs/cross-cutting/testing.md` — test coverage gaps
- `.migration/docs/cross-cutting/dependencies.md` — closed-source binaries and licensing pointers
- `.migration/docs/external-context/summary.md` — sibling Buildroot repo, port contract, rootfs patches
- `.migration/plan-context.md` — shared planning context
- Repository checks (this assessment): `git log` dates of `bin/x86_64-linux-gnu/*` vs `src/*`, `git ls-files -s bin` (modes), `strings` on x86_64 `ReGaHss` (version `R1.00.0388.0259`), `.github/workflows/update-prebuilt-libraries.yml`, `.github/workflows/ci.yml`

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

