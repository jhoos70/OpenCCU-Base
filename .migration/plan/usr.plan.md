# Migration Plan: Migrate usr (generated ::HomeMatic Tcl package snapshot)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: modernization (minimal-change: remove stale generated copy, keep Addon contract; stub clean-up in source of truth)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | usr | primary | index.json | `usr/lib/tcl8.2/homematic/{homematic.tcl,pkgIndex.tcl}`, 2 files, 121 LOC; committed, generated output of `src/tcl_homematic` |
| 2 | src-feature--tcl-extensions | dependency | index.json | Owns the source of truth `src/tcl_homematic/src/*.tcl` (7 fragments) and the `tclrega.so` / `tclrpc.so` that the package loads; changes to `usr` are really changes there |
| 3 | webui-config-pages | affected | index.json | Only real in-repo caller: `src/webui/www/config/control_panel.cgi:3` (`package require HomeMatic`) and `:231` (`::HomeMatic::Addon::GetAll`) |
| 4 | www | affected | index.json | Drifted committed copy `www/config/control_panel.cgi` also requires the package |
| 5 | OpenCCU packaging repo and third-party add-ons (external) | affected | user | Add-on installers call `Addon::AddConfigPage` / `RemoveConfigPage` and own the `hm_addons.cfg` writes; they are not in this repo |

---

## Context

### Summary

`usr/` is a pre-generated rootfs overlay holding the pure-Tcl package `HomeMatic 1.0` for the Tcl 8.2 interpreter on the CCU. It is not hand-maintained: `src/tcl_homematic/CMakeLists.txt:1-9` concatenates the fragments listed in `files.txt` (`tclload serial util session script addon trailer`), strips comments, and writes the result to `${ROOTFS_DIR}/usr/lib/tcl8.2/homematic/`. The committed copy is therefore a stale snapshot that the build does not read. Note that `cmake/Components.cmake:159` installs `${ROOTFS_DIR}/usr/` as the `assets` component, so the generated tree, not the committed one, is what ships.

Contents of the package:
- `tclload`: auto-loads `tclrega.so` and `tclrpc.so`, so CGIs need only `package require HomeMatic`.
- `GetSerialNumber` (reads `/etc/config/ids`), `Util::LoadFile` / `SaveFile`.
- `Addon::GetAll` / `AddConfigPage` (and `RemoveConfigPage` in source only) over `/etc/config/hm_addons.cfg`.
- `Session::login/logout/renew` and `Script::eval` are `error "not implemented"` stubs, `Session::isValid` is empty. No caller in the repo.

Relevance to the nextGen UI: the add-on registry is how third-party add-ons appear in the System Control "additional software" area. The only consumer is `control_panel.cgi:231`, which renders add-on buttons from `CONFIG_URL`, `CONFIG_NAME` and `CONFIG_DESCRIPTION` (a nested language -> text list). Correction to the feature brief: `cp_software.cgi` contains no reference to `Addon`/`hm_addons`; the add-on list lives in `control_panel.cgi`. A new UI that wants to list add-on config pages has no JSON-RPC method for it (no `hm_addons` reference anywhere in `webui-api`), so it must either keep embedding the legacy `control_panel.cgi` fragment or get a small new read method that calls `Addon::GetAll`.

### Migration Drivers

- Drift: committed `usr/.../homematic.tcl` lacks `Addon::RemoveConfigPage` and uses `![info exists rega_script]` (lines 5, 9) while the source uses `![llength [info commands ::rega_script]]`. Two different load guards mean two different behaviours; the `info exists` form tests for a variable, not a command, and is therefore always true on first load (it still works because loading twice is harmless, but it is not the intended guard).
- Dead API surface: `Session` and `Script` stubs look like a supported API but always raise; no callers.
- Add-on registry quality: unlocked read-modify-write of `hm_addons.cfg`, `SaveFile` returns 0 regardless of failure, and add-on descriptions are emitted unescaped into inline JavaScript in `control_panel.cgi` (single quotes), so add-on supplied text can break out of the string (XSS in an admin page).
- The nextGen UI needs the add-on list as data (JSON) rather than as inline-JS-in-HTML.

### Current State

Tcl 8.2-era pure-Tcl library (121 LOC committed, about 140 LOC in source) deployed into the CCU rootfs. Built by CMake with a host `tclsh`. No tests. Consumers are CGI scripts running under the HTTP server in the CCU firmware image. State lives in `/etc/config/ids` (read-only) and `/etc/config/hm_addons.cfg` (Tcl `array get` serialisation, no locking).

### Cross-Cutting Findings

- Tech debt: `www/` is a drifted committed copy of `src/webui/www` (52+49 files differ); `usr/` is the same pattern for generated output. Source of truth must be named explicitly and the copies removed or generated.
- Security: `control_panel.cgi` interpolates add-on supplied strings into JavaScript without escaping; related `cp_software.cgi:493` request-driven exec (admin) is a neighbouring page and shares the add-on installation trust boundary.
- Testing: no Tcl, API or UI tests; the package has no unit tests and no fixture for `hm_addons.cfg`.
- External constraint: the sibling Buildroot repo and add-on installers depend on `package require HomeMatic`, the `Addon::*` procedure names/signatures, and the `hm_addons.cfg` format; OpenCCU patches `www/tcl/eq3/rega.tcl` which wraps `rega_script`.
- Integration: tclrega.so / tclrpc.so are loaded here; their contracts are owned by src-feature--tcl-extensions.

---

## Migration Goal

**Retain the ::HomeMatic Addon contract unchanged, delete the stale committed `usr/` snapshot, and remove the unimplemented Session/Script stubs in `src/tcl_homematic`.**

The package is small, correct for its only real use, and bound to external add-ons by contract. The goal is to make `src/tcl_homematic/src` the single source of truth, eliminate the drifted generated copy, drop dead stubs, harden `hm_addons.cfg` handling, and expose the add-on list to the new UI as data without changing the file format or procedure signatures.

---

## Decision

### Approach: Incremental migration (minimal change, retain + wrap)

1. Remove `usr/lib/tcl8.2/homematic/*` from git (add `usr/` to `.gitignore` or generate it into the build tree only) so there is one source of truth. Verify first that nothing outside the CMake `assets` component reads the committed copy (none found in the repo).
2. In `src/tcl_homematic/src`, delete `Session` and `Script` fragments (and their `files.txt` entries) after a final grep of the sibling OpenCCU repo and known add-ons; keep `GetSerialNumber`, `Util`, `Addon::GetAll/AddConfigPage/RemoveConfigPage` as is.
3. Wrap: add a read-only JSON-RPC method (for example `Addon.getAll`, owned by webui-api) that calls `::HomeMatic::Addon::GetAll` and returns a structured list, so the new UI does not parse Tcl list text or inline JS. Escape output at the JSON boundary.
4. Fix `Util::SaveFile` to return the real result, and write `hm_addons.cfg` atomically (temp file + rename), with a simple lock for read-modify-write in `AddConfigPage` / `RemoveConfigPage`.
5. Do not port to another language: Tcl 8.2 and the CGI model remain the runtime, and a rewrite would break external add-on installers.

**Rationale**: Migration is limited because (1) the committed `usr/` copy is unused by the build and already diverges from source (missing `RemoveConfigPage`, different load guard); (2) the stubs have no callers, so removal has no functional effect on the repo; (3) the Addon file format and procedure names are an external contract used by add-on installers and the OpenCCU packaging repo; (4) the nextGen UI only needs the list as data, which a thin JSON-RPC wrapper provides without touching the package.

### Rejected Options

- **Replace with a new add-on registry (JSON file or service)**: breaks external add-on installers that call `AddConfigPage` and read `hm_addons.cfg`; no UI benefit that a read wrapper does not already give.
- **Re-sync `usr/` by regenerating and committing it**: perpetuates a generated artefact in git that will drift again; the build already regenerates it.
- **Implement Session/Script instead of deleting**: login/session handling already lives in ReGa and `webui-api` (`Session.login`); a second implementation would duplicate the security-critical path.
- **Leave as is**: keeps a stale copy that can mislead readers (it shows a package without `RemoveConfigPage`) and an API surface that always errors.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | Tcl 8.2-era (pure Tcl, 121 LOC committed) | Tcl 8.2-compatible (unchanged; runtime pinned by `usr/lib/tcl8.2`); JSON-RPC wrapper in the existing Tcl method scripts |
| Frameworks | `package require HomeMatic`, tclrega.so, tclrpc.so | Unchanged |
| Infrastructure | CMake generation via `tclsh` (`tcl-homematic-assets`), rootfs overlay installed as CMake `assets` component, GitHub Actions CI | Unchanged; generated output no longer committed |

---

## Scope

**Mode**: targeted

### Included Components

- `usr/lib/tcl8.2/homematic/homematic.tcl` and `pkgIndex.tcl` (removal from git)
- `src/tcl_homematic/src/{session,script}.tcl`, `files.txt` (stub removal), `util.tcl`, `addon.tcl` (hardening)
- `src/webui/www/config/control_panel.cgi:225-260` (output escaping; or retire once the new UI lists add-ons)
- A new read-only `Addon` method in webui-api (handoff to that feature)

### Excluded Components

- `tclrega`, `tclrpc`, `tclticks` C++ sources (src-feature--tcl-extensions)
- `www/` drifted copy (owned by the www feature)
- ReGaHss and daemons
- External add-ons and the OpenCCU Buildroot repo

### Critical Components

- `Addon::AddConfigPage`, `RemoveConfigPage`, `GetAll` and the `hm_addons.cfg` format
- `package require HomeMatic` auto-loading the two native extensions

### Boundaries

- No change to procedure names, arguments or the `array get` file format in the first phase.
- Edit `src/tcl_homematic/src/*`, never `usr/`.
- Tcl 8.2 syntax only.

---

## Dependencies

### Internal

- `src/tcl_homematic/src/*.tcl` and `files.txt` (source), `create_homematic_tcl.tcl`, `stripcomments.tcl` (generators)
- `src/tclrega`, `src/tclrpc` (native libs loaded by `tclload.tcl`)
- `src/webui/www/config/control_panel.cgi` (consumer), webui-api (future wrapper)
- `cmake/Components.cmake:159` (installs `${ROOTFS_DIR}/usr/`)

### External

- Host `tclsh` (`OPENCCU_TCLSH_EXECUTABLE`) at build time; Tcl 8.2 interpreter at runtime
- `/etc/config/ids`, `/etc/config/hm_addons.cfg` on the device
- Third-party add-on installers calling `Addon::AddConfigPage` / `RemoveConfigPage`
- OpenCCU Buildroot repo (pins this repo by SHA)

---

## Constraints

### Unchanged

- `package require HomeMatic` version 1.0 and the `::HomeMatic::Addon::{GetAll,AddConfigPage,RemoveConfigPage}`, `::HomeMatic::GetSerialNumber`, `::HomeMatic::Util::{LoadFile,SaveFile}` signatures
- `hm_addons.cfg` serialisation (`array get` with `ID`, `CONFIG_URL`, `CONFIG_NAME`, `CONFIG_DESCRIPTION`) and path
- Special case: add-on id `mediola` hidden when `/etc/config/neoDisabled` exists (`control_panel.cgi:233`)
- Auto-loading of `tclrega.so` / `tclrpc.so` so existing CGIs keep working

### Integration Systems

- CGI scripts under the CCU HTTP server
- JSON-RPC `/api/homematic.cgi` (new read method must respect the access-level model NONE/GUEST/USER/ADMIN; add-on listing at least USER)
- Sibling OpenCCU Buildroot packaging repo and add-on installers

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|----------|
| medium | Removing Session/Script stubs or the committed `usr/` copy breaks an unseen external caller (add-on or packaging patch) | Grep sibling OpenCCU repo and known add-ons first; deprecate in one release (keep stubs but log) before deletion | usr.md "no callers found in the repo beyond GetAll"; external-context summary |
| medium | Unescaped add-on strings in inline JavaScript (stored XSS in an admin page) | Escape in `control_panel.cgi`, return add-on data via JSON in the new method | usr.md Observations; `control_panel.cgi:~245` |
| medium | Unlocked read-modify-write of `hm_addons.cfg` and `SaveFile` always returning 0 can lose or corrupt add-on registrations during parallel installs | Atomic write + lock; return real status; add a fixture-based test | `homematic.tcl:41,49,103-105` |
| low | Drift between generated `usr/` and `src/tcl_homematic` misleads developers and reviewers (missing `RemoveConfigPage`, different load guard) | Delete committed copy; document source of truth | usr.md "Drift observed" |
| low | Load-guard semantic change (`info exists` vs `info commands`) alters behaviour when extensions are already loaded | Verify the source guard on a device or emulator before release; the build already ships the source form | `tclload.tcl:4` vs `homematic.tcl:5` |
| low | No tests exist for the package | Add a tclsh test with a temp `hm_addons.cfg` for Add/Remove/GetAll round trips | plan-context Testing |

---

## Success Criteria

- A single source of truth: `usr/lib/tcl8.2/homematic/` is no longer tracked, and the built rootfs still contains the generated package.
- `Addon::GetAll/AddConfigPage/RemoveConfigPage` and `hm_addons.cfg` remain backward compatible (round-trip test against a fixture written by the old code).
- No procedure in the package always raises "not implemented".
- The nextGen UI can list add-on config pages from a JSON-RPC method with access-level enforcement; no inline-JS interpolation of add-on text.
- `SaveFile` reports failure; concurrent `AddConfigPage` calls do not lose entries.
- All existing functionality preserved; zero regression for add-on installers.

---

## Focus Areas

1. Name `src/tcl_homematic` as the source of truth and stop committing `usr/` output.
2. Verify external callers (sibling Buildroot repo, add-ons) before deleting stubs.
3. Escape add-on text in `control_panel.cgi` and provide a JSON wrapper for the new UI.
4. Harden `hm_addons.cfg` writes (atomic, locked, real status).
5. Add a minimal Tcl round-trip test for the Addon API.

---

## Consequences

### Positive Outcomes

- One authoritative source; no stale generated copy; a smaller, honest API.
- New UI gets structured add-on data without a rewrite of the add-on mechanism.
- Fixes a stored-XSS vector and a data-loss race in the add-on registry.

### Negative Outcomes

- Stub removal and untracking `usr/` need a coordinated check with the external packaging repo.
- The add-on registry stays on a Tcl-serialised flat file and Tcl 8.2.

### Follow-Up Decisions

- Whether to retire `control_panel.cgi` add-on rendering entirely once the new UI consumes the JSON method.
- Whether `usr/` should be removed or replaced by a README pointer, depending on how the Buildroot repo consumes the tree.
- Long-term replacement of `hm_addons.cfg` (only if the add-on ecosystem agrees on a new contract).
- Ownership of the `Addon` JSON-RPC method (webui-api) and the `src/tclticks` orphan (src-feature--tcl-extensions).

---

## Source Documents

- `.migration/plan-context.md` - Shared engagement, security, testing and debt context
- `.migration/docs/modules/usr.md` - Module documentation (package, drift, consumers)
- `.migration/plan/src-feature--tcl-extensions.plan.md` - Sibling plan owning the source and native extensions
- `src/tcl_homematic/CMakeLists.txt`, `src/tcl_homematic/src/{tclload,addon,util,session,script}.tcl` - Verified source of truth and drift
- `usr/lib/tcl8.2/homematic/homematic.tcl` - Committed snapshot
- `src/webui/www/config/control_panel.cgi` (lines 3, 231) - Only caller; `cp_software.cgi` checked, no Addon reference
- `cmake/Components.cmake:159` - Installs the generated `usr/` tree
- `/home/standard/.claude/local-marketplace/one-modernizer/skills/plan-migration/references/{plan-adr-template.md,adr-workflow.md}` - Template and field strategy

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

