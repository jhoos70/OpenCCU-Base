# Migration Plan: Assess firmware (device firmware images and device descriptors)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: data-asset-retention-assessment (no UI migration; coupling and risk assessment toward the nextGen UI)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | firmware | primary | index.json | `firmware/`: 166 tracked files per the module doc (168 by a later `git ls-files` count), 7.0 MB. 143 XML descriptors (127 `rftypes/rf_*.xml`, `rfReplaceMap.xml`, 15 `hs485types/hmw_*.xml`), 10 `.hex`, 9 `.eq3`, 2 `.zip`, 4 `fwmap`. Passive data, no executable code |
| 2 | src-feature--rfd | dependency | index.json | Reads `rftypes/`, `rfReplaceMap.xml` and `fwmap` (`RFFirmwareManager.cpp:103-224`, `RFManager.cpp:205,266`) |
| 3 | src-feature--hs485d | dependency | index.json | Reads `hs485types/`, `*.hex` and `fwmap` (`HS485FirmwareManager.cpp:84-110`, `HS485Manager.cpp:231-246`) |
| 4 | src-feature--config-tools | dependency | index.json | `update-coprocessor` and `update-lgw-firmware` parse `fwmap` and load `.eq3` (`update-coprocessor.cpp:834-902`, `update-lgw-firmware.cpp:174,245-247`) |
| 5 | src/devicetypes + build-tools/bidcos-devicetype-strip | dependency | index.json | Source of truth for the descriptors; `GenerateDeviceTypes.cmake` regenerates `firmware/{rftypes,hs485types}` at staging |
| 6 | webui-config-pages | affected | index.json | `ic_deviceFirmwareOverview.cgi` (firmware overview and update button), `cp_maintenance.cgi`; assessed in its own plan |

---

## Context

### Summary

`firmware/` is a runtime asset tree staged verbatim to `/firmware` on the target image (`cmake/Components.cmake:148`, option `BUILD_FIRMWARE`). It holds (a) BidCoS-RF and HS485 (Wired) device-type descriptors, (b) firmware images for Wired modules (`.hex`, AVR), LAN gateways and radio coprocessors (`.eq3`, a proprietary eQ-3 container), and HmIP Access Point update bundles (`.zip`), and (c) `fwmap` index files (`Type Filename Version`) that tell the daemons which image applies to which device or coprocessor. The module is not UI code. The nextGen UI touches it only indirectly: the WebUI shows firmware overview and update pages, while the actual descriptor and image consumers are the C++ daemons `rfd` and `hs485d` and the `eq3config` update tools. The UI never parses `fwmap` or the descriptor XML directly; it sees their effect through `Interface.*` JSON-RPC wrappers over XML-RPC (device descriptions, `FIRMWARE`, `AVAILABLE_FIRMWARE`).

### Migration Drivers

- Single source of truth is unclear: checked-in `firmware/rftypes` and `firmware/hs485types` are minified copies that are overwritten at staging by output generated from `src/devicetypes/` through `bidcos-devicetype-strip`. They are redundant or legacy (module doc section 4). `src/devicetypes/rftypes` has 130 entries and `firmware/rftypes` 128, so they are not 1:1.
- Provenance and licence of the binary blobs are undocumented. `licenses/licenses.md` states that files are under HMSL 2.0 unless noted and lists no entry for `.hex`, `.eq3` or `.zip` images. The blobs are opaque, vendor-produced (eQ-3) artifacts.
- No integrity data: there are no hashes or signatures in the repository for the blobs, and no tests cover them. The only check is the CI file-count comparison for descriptors (`.github/workflows/ci.yml:205-212`).
- Stale and unreferenced content: commented-out `fwmap` lines in three files, `hss_comm.enc` listed but absent, `hmip_coprocessor_update-2.8.6.eq3`, `HM-MOD-UART/coprocessor_update.eq3` (only in a comment), and the two `access-controller/*.zip` archives that nothing outside `firmware/` references (commit `206e44a9` says they were removed, yet they are still tracked).
- Three image families use three different loaders with no shared manifest beyond `fwmap`, and each consumer applies its own filter to the same file (`rfd` skips lines starting `H`/`A`/`C`; `hs485d` takes `.hex` only; `update-coprocessor` takes lines starting `C`, `.eq3` only).

### Current State

Static data tree consumed at runtime by four native programs, packaged into the rootfs by CMake (`openccu_asset_directory(FIRMWARE firmware firmware)`, then `devicetypes-assets` overwriting descriptors). No code, no tests in this module. Runtime paths are hard-coded defaults: `/firmware`, `/firmware/hs485types`, `/etc/config/firmware/` (user firmware, with `info` file `TypeCode=`/`FirmwareVersion=`), `/etc/config/hs485types`. Two images are byte-identical among the ten `.hex` files (md5 duplicate pair observed), so some variants share content. Build and CI are CMake/Make and GitHub Actions, and a sibling Buildroot repo pins this repo by SHA.

### Cross-Cutting Findings

- Testing: only `tests/test-components.py` (CMake install closure, with `firmware/keep` as a protected input), the `tests/build-tools` devicetype-strip test, and in the sibling repo `scripts/testcases/build/test_devicetypes_assets.py`. There is no test of `fwmap` parsing, hash integrity, or descriptor-to-hardware-type consistency (`fwmap` key `H<nn>V0` vs `hs485types` hardware type).
- Tech debt: `www/` is a drifted committed copy of `src/webui/www`, and `firmware/` shows the same pattern of a committed derived copy next to a generator source.
- Likely bug in `update-coprocessor.cpp:165`: `typeStr.compare("HM-MOD-UART")` branch is taken on mismatch (unverified; belongs to config-tools plan).
- Security: eq3configd UDP unauthenticated unless CRYPT=1, `cp_software.cgi:493` request-driven exec (admin). Firmware update paths run through privileged tooling and `.eq3` frames are written to coprocessors without any repository-side signature check; the `.eq3` encryption or signature scheme was not analysed.
- External constraint: sibling OpenCCU repo depends on this tree's layout via the SHA pin, and its `test_devicetypes_assets.py` checks the generated descriptor flow.
- WebUI firmware matches in `downloadFirmware.tcl`, `cp_maintenance.cgi`, `cp_security.cgi`, `backup.tcl` concern CCU system firmware (`update.homematic.com`, `ccu3-update.homematic.com`), not this tree.

---

## Migration Goal

**Retain firmware/ as a data asset; fix provenance, integrity and source-of-truth gaps, and keep the UI decoupled from its internal format**

The nextGen UI renovation does not require any change to the image files, descriptors or `fwmap` format. The goal is to leave the tree and its consumers untouched, document and verify the blobs (origin, licence, hashes), settle which tree is the descriptor source of truth, and ensure the nextGen UI continues to consume firmware information only through the existing RPC and CGI contracts and never reads `/firmware` directly.

---

## Decision

### Approach: Retain with checks (no migration)

Keep `firmware/` and the `fwmap` format as is. Add a small set of non-invasive checks and documentation: a provenance and licence manifest, SHA-256 checksums verified in CI, a `fwmap` consistency lint, and a removal decision for stale files. Treat `src/devicetypes/` as the only source for descriptors. The nextGen UI shell keeps using `ic_deviceFirmwareOverview.cgi` and the `Interface.*` wrappers (strangler: wrap that fragment, do not reimplement the loaders).

**Rationale**: (1) The module is passive data with no UI code; its consumers are four native programs outside the UI scope. (2) The sibling Buildroot repo, the hard-coded paths in `rfd`, `hs485d` and `eq3config`, and the three loader behaviours form a tight external contract, so reformatting `fwmap` or relocating `/firmware` has high regression risk and no UI benefit. (3) The real risks are non-functional: unknown blob provenance and licence, no integrity checks, redundant descriptor copies, stale entries. These are fixed by checks and documentation, not by migration. (4) `.eq3` content is proprietary and opaque, so it cannot be converted or re-signed.

### Rejected Options

- **Replace with a new unified manifest format (JSON) and a firmware service**: breaks the four hard-coded `fwmap` parsers and the pinned sibling repo for no UI gain; the `.eq3` scheme is not understood.
- **Wrap behind a new UI-facing firmware API reading `fwmap` directly**: duplicates three divergent parsers and couples the new UI to the on-disk format. If a UI API is needed, expose existing daemon data through the JSON-RPC layer instead.
- **Move blobs to external storage or a release download (Git LFS or artifact fetch)**: possible later (see follow-ups), but changes the build and the sibling repo's pin model; defer until provenance and licence are settled.
- **Minimal-change (touch descriptors in place)**: committed `firmware/rftypes` and `hs485types` are overwritten at staging, so edits there are lost; changes belong in `src/devicetypes/`.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | None (data: XML ISO-8859-1, Intel HEX, proprietary `.eq3`, zip, plain-text `fwmap`); Tcl/CGI in the UI consumer | Unchanged; optional Python or shell check scripts for CI |
| Frameworks | None; consumers are C++ daemons (rfd, hs485d, eq3config) and Tcl CGI | Unchanged |
| Infrastructure | CMake/Make staging (`Components.cmake`, `src/devicetypes/CMakeLists.txt`), GitHub Actions CI, Buildroot sibling repo, target path `/firmware` | Unchanged; add checksum and `fwmap` lint steps to the existing CI |

---

## Scope

**Mode**: targeted

### Included Components

- `firmware/fwmap` and the three per-board `fwmap` files
- `firmware/*.hex`, `firmware/*.eq3`, `firmware/{HM-MOD-UART,HmIP-RFUSB,RPI-RF-MOD}/`, `firmware/access-controller/*.zip`
- `firmware/rftypes/`, `firmware/rftypes/replaceMap/rfReplaceMap.xml`, `firmware/hs485types/` (checked-in stripped copies)
- Staging glue: `cmake/Components.cmake:136-154`, `src/devicetypes/CMakeLists.txt`, `src/devicetypes/GenerateDeviceTypes.cmake`, CI check `ci.yml:205-212`

### Excluded Components

- Consumer code (rfd, hs485d, libeq3config): assessed in their own plans
- `src/devicetypes/` source descriptors and `device.xsd` content (neighbouring module)
- CCU system firmware update flow (`cp_software.cgi`, `downloadFirmware.tcl`, `update.homematic.com`)
- UI pages: `ic_deviceFirmwareOverview.cgi`, `cp_maintenance.cgi` (webui-config-pages)

### Critical Components

- `firmware/fwmap` (shared by three parsers with different filters)
- `.eq3` coprocessor images (a wrong image can brick a radio module)
- `rfReplaceMap.xml` (17.8k lines, drives the WebUI device-exchange workflow via `RFReplaceMap.cpp`)

### Boundaries

- No format change to `fwmap`, descriptors or image containers.
- The nextGen UI must not read `/firmware` directly and must not duplicate `fwmap` parsing.
- Any future change to descriptors is made in `src/devicetypes/` and flows through `bidcos-devicetype-strip`.

---

## Dependencies

### Internal

- `src/rfd` (RFFirmwareManager, RFManager, RFReplaceMap)
- `src/hs485d` (HS485FirmwareManager, HS485Manager)
- `src/libeq3config` (update-coprocessor, update-lgw-firmware, lgwallocation: gateway names mapped to `HMWLGW` / `HMLGW2`)
- `src/devicetypes` and `build-tools/bidcos-devicetype-strip` (generator and strip tool, required build input)
- `src/webui/www/config/ic_deviceFirmwareOverview.cgi`, `cp_maintenance.cgi`
- `cmake/Components.cmake` (`BUILD_FIRMWARE`, `BUILD_DEVICETYPES`)

### External

- eQ-3 / Homematic vendor firmware drops (origin of the blobs; for example commits `7d7a6d14`, `d0d6966c` for HmIP-RFUSB 4.4.18)
- `update.homematic.com` and `ccu3-update.homematic.com` (system firmware and RF device firmware downloads; not this tree)
- Sibling repo `/home/standard/dev/OpenCCU` (Buildroot packaging, pins this repo by SHA; `test_devicetypes_assets.py`)
- Homematic Software License 2.0 (HMSL) as the stated default licence (`licenses/licenses.md`, `licenses/HMSL2.txt`)

---

## Constraints

### Unchanged

- `fwmap` column format (`Type Filename Version`, `#` comments, `@0x77F0` version-address form for HS485) and key conventions (`H<nn>V0`, `CCU2`, `CCU2-RFLGW`, `HM-MOD-UART`, gateway type names)
- Directory layout and `/firmware`, `/firmware/hs485types`, `/etc/config/firmware/`, `/etc/config/hs485types` paths
- Per-board sub-directory selection through `update-coprocessor -d`, each with its own `fwmap`
- Descriptor schema (`src/devicetypes/device.xsd`), ISO-8859-1 encoding, `supported_types` matching conditions
- Binary content of `.hex`, `.eq3`, `.zip` (do not recompress, reformat or re-encode)
- User firmware override semantics (higher version in `/etc/config/firmware/<dir>/info` wins)

### Integration Systems

- XML-RPC hs485d (TCP 2000) and rfd (TCP 2001), through which the UI sees device FIRMWARE and AVAILABLE_FIRMWARE
- JSON-RPC `/api/homematic.cgi` `Interface.*` wrappers
- Sibling Buildroot repo (SHA pin, 64 rootfs patches) and the OCI/HA/Helm port contract
- `/dev/eq3loop`, `eq3configd` for coprocessor and gateway updates

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | Unknown provenance and licence of the binary firmware blobs (`.hex`, `.eq3`, `.zip`); redistribution terms are not recorded, and `licenses.md` has no per-file entry | Write a `firmware/PROVENANCE.md` (source, version, date, licence, redistribution basis) for every blob; clarify with the maintainers/eQ-3 where unknown; remove blobs without a basis | `licenses/licenses.md:4-6`; module doc sections 3.2, 8.5 |
| high | No integrity verification: no checksums or signatures committed and no tests, so a corrupted or tampered image could reach a coprocessor or HS485 module unnoticed; `.eq3` signature scheme not analysed | Commit `SHA256SUMS` for all blobs; verify in CI and at staging; document the `.eq3` verification done by the coprocessor | module doc section 9; `update-coprocessor.cpp:910-935`; testing.md |
| high | Contract breakage with the four `fwmap` consumers and the sibling pinned repo if layout or format changes (each parser filters differently) | Declare the format frozen; add a `fwmap` lint that emulates the three filters; run the sibling tests before moving the pin | `RFFirmwareManager.cpp:103-135`, `HS485FirmwareManager.cpp:84-110`, `update-coprocessor.cpp:834-902` |
| medium | Two copies of descriptors (checked-in `firmware/` vs generated from `src/devicetypes/`); entry counts differ (128 vs 130); edits in `firmware/` are silently lost | Decide on `src/devicetypes/` as the single source; stop tracking the derived copy or add a CI diff of generated versus checked-in output | `Components.cmake:149-151`; `ci.yml:205-212`; module doc section 4 |
| medium | Stale and unreferenced content (`hss_comm.enc` entry without file, commented `fwmap` lines, `hmip_coprocessor_update-2.8.6.eq3`, `access-controller/*.zip` contradicting commit `206e44a9`) | Verify reachability with maintainers, then delete or document; a `fwmap` lint reports missing and unreferenced files | module doc section 9 |
| medium | The UI firmware pages depend on daemon behaviour; a new UI could re-implement firmware logic and drift from the daemons | Keep the UI on RPC and CGI contracts only; wrap `ic_deviceFirmwareOverview.cgi` fragment in the shell | `ic_deviceFirmwareOverview.cgi`; webui-config-pages plan |
| medium | No automated test of descriptor-to-fwmap consistency (HS485 `H<nn>V0` against `hs485types` hardware type, `.hex` existence) | Add a CI consistency check (Python or CMake script) | module doc section 8.1-8.2 |
| low | Likely argument-parsing bug in `update-coprocessor.cpp:165` (`compare` inverted) | Verify and fix in the config-tools plan, not here | module doc section 6 |

---

## Success Criteria

- `firmware/` content and `fwmap` formats are byte-identical after the work, except for explicitly approved removals of stale files.
- Every blob has a recorded origin, version and licence basis in a provenance manifest; blobs without a basis are removed or flagged for resolution.
- `SHA256SUMS` exists and is verified in CI; any blob change requires a matching checksum change.
- A `fwmap` lint runs in CI: all referenced files exist, all blobs are referenced or declared unused, HS485 keys match `hs485types` hardware types, and the three consumer filters parse the shipped maps as expected.
- One documented source of truth for `rftypes` and `hs485types`; CI proves the generated output matches what is staged.
- Sibling repo `test_devicetypes_assets.py` and `tests/test-components.py` pass unchanged.
- nextGen UI contains no direct reads of `/firmware` and no `fwmap` parser; firmware pages use the existing CGI and RPC contracts.
- Zero regression in device firmware update flows (HS485, LAN gateway, coprocessor, user firmware override).

---

## Focus Areas

1. Provenance and licence of the binary blobs (legal gate for any redistribution in the renovated repo or image)
2. Integrity: checksum manifest and CI verification, analysis of the `.eq3` verification scheme
3. `fwmap` contract freeze plus consistency lint across the three divergent parsers
4. Descriptor source of truth: `src/devicetypes/` plus `bidcos-devicetype-strip` flow versus checked-in copies
5. Stale file cleanup (`access-controller/*.zip`, orphaned `.eq3`, dangling `hss_comm.enc`)
6. UI coupling boundary: keep `ic_deviceFirmwareOverview.cgi` and `cp_maintenance` behind RPC and CGI contracts during the strangler migration
7. Coordination with the sibling repo's SHA pin and tests

---

## Consequences

### Positive Outcomes

- Legal and supply-chain clarity for the blobs without touching runtime behaviour.
- Detectable corruption and drift in firmware assets and `fwmap`.
- Removes ambiguity over where to edit descriptors, and shrinks the tracked tree if derived copies are dropped.
- The nextGen UI work proceeds without any dependency on this module.

### Negative Outcomes

- The proprietary blob problem remains (opaque `.eq3`, vendor-controlled); the repository still carries 7 MB of binaries.
- The inconsistent `fwmap` filters of the three parsers stay, so every new entry needs care.
- Some effort goes into process work (provenance research, CI checks) with no user-visible feature.

### Follow-Up Decisions

- Keep blobs in-repo versus fetch them at build time from a verified release location (after provenance is clear).
- Whether to stop tracking `firmware/rftypes` and `firmware/hs485types` and generate them only at staging (requires a sibling repo check).
- Whether to unify `fwmap` handling in one shared parser library in a later native-code phase.
- Whether the UI needs a read-only "firmware available" JSON-RPC method rather than an HTML fragment (decide in webui-api and webui-config-pages plans).
- Disposition of `access-controller/*.zip` and other unreferenced files.

---

## Source Documents

- `.migration/plan-context.md` — Shared engagement goal, stack, integration, security, testing, tech debt, external constraint
- `.migration/docs/modules/firmware.md` — Module documentation for `firmware/`
- `.migration/docs/cross-cutting/technical-debt.md`, `security.md`, `testing.md` — consulted through the shared context summary
- `.migration/docs/external-context/summary.md` — Sibling repo constraints (via shared context)
- `licenses/licenses.md` — Licence statement (HMSL 2.0 default)
- `.migration/plan/src-feature--hs485d.plan.md` — Sibling plan, for consumer boundaries
- `/home/standard/.claude/local-marketplace/one-modernizer/skills/plan-migration/references/plan-adr-template.md` and `adr-workflow.md` — Template and field strategy

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

