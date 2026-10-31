---
title: Target Architecture — www
feature: www
generated_at: 2026-10-10
architectural_style: Keep current architecture (refactor in place)
sources:
  - plan.downstream.json
  - analysis.json
  - diagrams (component, sequence, entity)
  - user decisions from interactive session
---

# Target Architecture: www

> **Note**: For full decision rationale, alternatives considered, and approval tracking, see `target-architecture.adr.md`.

## 1. Executive Summary

**Migration Goal:** Make `src/webui` the single source of truth and remove the committed, drifted `www/` tree without changing the shipped rootfs. The staged web root must stay byte-identical, the sibling OpenCCU build must keep passing, and nobody can edit a stale copy again.

**Architectural Style:** Keep current architecture (refactor in place). The web root is already assembled by CMake from `src/webui` (SP001, SP002, SP003, SP009) and installed from the staging tree (SP004); nothing in the build reads the repository-level `www/`. The change removes a dead copy and adds guard rails; it introduces no new runtime component.

**Key Decisions:**

- **Style**: Keep current; no runtime change (Q2).
- **make deploy**: stops writing `./www`; still refreshes `bin/ lib/ etc/ firmware/ opt/ usr/` (Q-DEPLOY).
- **Guard**: a CI step on every PR fails if `git ls-files www` is non-empty (Q-GUARD).
- **Coexistence**: classic UI and the nextGen React UI are served side by side from the same staged root. A React slot is reserved at `src/webui/www/ngui`, staged to `/www/ngui` by the existing `copy_directory` step (Q-REACT). The BFF question stays open and is owned by `webui-api` (Q1).
- **Auth, data, deployment**: unchanged (Q6, Q4, Q8).

**Scope:** targeted covering 7 modules (`www` primary; `webui-shell-build`, `webui-config-pages`, `webui-api`, `webui-rega-pages`, `webui-easymodes`, root CMake/Makefile/README/CI affected).

---

## 2. Architecture Overview

### 2.1 Chosen Style & Justification

Refactor in place. The repository contains two copies of the web root: the authoritative sources under `src/webui` and a stale snapshot under `www/` (4,051 tracked entries, 24 dangling absolute symlinks, 90 files differing from `src/webui/www`, 49 from `src/webui/rega/www`). The end state has exactly one source tree for both UIs.

**Why this style:**
- The build never reads `www/` (analysis CF001, CF002, CF007); the shipped output is already independent of it.
- The sibling OpenCCU repo pins this repo by SHA and builds through `src/webui` (CF006); a redesign would break its 64 rootfs patches.
- The classic and nextGen UIs must coexist for a long time; this change must not alter any classic path or URL.

### 2.2 High-Level Component Structure

Six components. Four exist today and keep their behavior (C1–C3 producers of the staged root, C5 CI), one is modified (C4 `make deploy`), one is added (C6 repo guard). Sources: `src/webui/www` (+ `ngui` slot), `src/webui/rega/www`, `src/webui/www_source`, `src/devicetypes`.

> See: [Target Component Diagram](diagrams/component-diagram.md)

### 2.3 Communication Patterns

| From | To | Protocol | Pattern | Notes |
|------|----|----------|---------|-------|
| C1 Web Root Staging | Staged web root | filesystem copy (CMake `copy_directory`, `create_symlink`) | build-time | Sources → `${ROOTFS_DIR}/www` |
| C2 Generated Asset Pipeline | Staged web root | tclsh + python3 generators, `copy_if_different` | build-time | `webui.js`, `style.css`, `DEVDB.tcl` (ISO-8859-1) |
| C3 Devicetype Asset Staging | Staged web root | `copy_if_different` | build-time | `st_values.cgi`, `st_values.js` into `www/config` |
| Staged web root | OpenCCU Buildroot repo | git SHA pin + CMake | pull at build | Sibling stages via `src/webui`, never from `www/` |
| C5 CI verification | Staged web root | shell `test -s` | per PR | Existing checks plus manifest comparison |
| C6 Repo guard | git index | `git ls-files www` | per PR | Fails when tracked files exist under top-level `www/` |

No frontend→backend row is added: AQ6 is not asked because this feature defines no new cross-process call; the React UI and the BFF decision are out of scope here (see Section 5).

---

## 3. Component Design

### 3.1. C1 Web Root Staging

**Responsibility:** Assemble the web root in the staging tree from `src/webui/www` and `src/webui/rega/www`, create the runtime symlinks, and install the tree as the assets component.

**Specifications Owned:**
- `SP001`: Build the shipped web root exclusively from src/webui sources, never from the committed www/
- `SP003`: Create runtime symlinks in the staged web root with relative or /tmp targets
- `SP004`: Install the staged web root as the assets component

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| CMake target | `webui-assets` | Copies sources, creates 24 links |
| CMake install | `install(DIRECTORY ROOTFS_DIR/www/)` | Installs component `assets` |

**Dependencies:**
- Internal: C2, C3 (target dependency `webui-www-source-assets`)
- External: CMake 3.20+

**Technology Recommendation:** Unchanged CMake. The React slot `src/webui/www/ngui` is picked up by the existing `copy_directory` with no CMake change; staged as `/www/ngui`.

### 3.2. C2 Generated Asset Pipeline

**Responsibility:** Generate `webui.js`, `style.css`, `DEVDB.tcl` at build time and stage them in ISO-8859-1.

**Specifications Owned:**
- `SP002`: Generate webui.js, style.css and DEVDB.tcl at build time and stage them in ISO-8859-1

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| CMake target | `webui-www-source-assets` | Runs `create_*.tcl`, `utf82ansi.py`, copies, removes outputs |

**Dependencies:**
- Internal: `src/webui/www_source`
- External: tclsh, python3

**Technology Recommendation:** Unchanged. Line structure and encoding of `webui.js` are frozen (sibling patches). Any nextGen build step must not touch this pipeline.

### 3.3. C3 Devicetype Asset Staging

**Responsibility:** Stage `st_values.cgi` and `st_values.js` from `src/devicetypes` into `www/config`.

**Specifications Owned:**
- `SP009`: Stage st_values.cgi and st_values.js into the web root from src/devicetypes

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| CMake target | `devicetypes-assets` | Forced on when `BUILD_WEBUI` is ON |

**Dependencies:**
- Internal: `cmake/Components.cmake`
- External: none

**Technology Recommendation:** Unchanged. Included in the before/after manifest (NFR-001) because it is the third producer of the staged root.

### 3.4. C4 Repository Deploy Workflow (modified)

**Responsibility:** Refresh deployed-artifact directories from a local build without writing the web root.

**Specifications Owned:**
- `SP005`: Persist generated web root assets in the repository only through the deploy path, which has drifted

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| make target | `deploy-%` | Loop becomes `for d in etc firmware opt usr` (no `www`); `mkdir` drops `www` |

**Dependencies:**
- Internal: `install-%`
- External: cmake

**Technology Recommendation:** Edit `Makefile:25-32` only; the staged root remains available under `build/<platform>/selected-install/www` for local experiments.

### 3.5. C5 Source Hygiene and CI Verification

**Responsibility:** Keep generated output out of git and verify staged output in CI.

**Specifications Owned:**
- `SP006`: Keep generated outputs out of version control
- `SP007`: Verify the staged package output in CI without reading repository www/

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| `.gitignore` | `src/webui/www_source/.gitignore` | Unchanged ignore list |
| CI step | `Verify staged package` (`ci.yml:199-201`) | Unchanged `test -s` checks; add manifest artifact for the cutover |

**Dependencies:**
- Internal: C1–C3
- External: GitHub Actions

**Technology Recommendation:** Add a `www-guard` step in the same job (C6), enabled in the removal commit. Add an optional `sha256` manifest of the staged tree uploaded as a CI artifact, used once for the before/after proof.

### 3.6. C6 Repo Guard and Documentation (new)

**Responsibility:** Prevent a second tracked web root from returning and document the layout.

**Specifications Owned:**
- `SP008`: Document the repository layout, currently describing www/ as WebUI resources

**API Surface:**

| Method | Endpoint / Message | Description |
|--------|--------------------|-------------|
| CI step | `www-guard` | `test -z "$(git ls-files www)"`; local untracked `www/keep` placeholders allowed (`tests/test-components.py:117`) |
| Docs | `README.md:30`, `cmake/README.md:33,100` | State `src/webui` is the only source; `make deploy` no longer writes `./www` |

**Dependencies:**
- Internal: C4, C5
- External: none

**Technology Recommendation:** Plain shell CI step; no `.gitignore` entry (decision Q-GUARD).

---

## 4. Data Architecture

### 4.1 Storage Strategy
No database. The relevant stores are git (sources) and the CMake staging tree (`build/<platform>/rootfs/www`). Both unchanged.

### 4.2 Schema Changes
No schema changes — database schema preserved per plan constraints.

### 4.3 Data Migration Approach
Not applicable to data. The "migration" is the removal of 4,051 tracked paths in one commit, with a git tag of the pre-removal state.

### 4.4 Consistency Model
The single invariant is manifest equivalence: file list, sha256 and symlink targets of the staged root (all three producers) are identical before and after the removal commit, excluding already-merged source changes (NFR-001).

---

## 5. Integration Design

### 5.1 External System Connections

| External System | Protocol | Direction | Contract | Preservation Strategy |
|----------------|----------|-----------|----------|-----------------------|
| OpenCCU Buildroot packaging repo | git SHA pin + CMake | consumes this repo | stages via `src/webui`; 64 patches (41 on `webui.js`) applied to the staged root | Keep `webui.js` line structure and generator output; bump `OPENCCU_BASE_VERSION` after cutover and run `make check-openccu-base` |
| ReGaHss (closed source) | HTTP 8181/8183, ReGa script | consumes staged `/www/rega` | pages and `/licenseinfo.htm` | Staged `www/rega` unchanged; `licenseinfo.htm` regenerated by the sibling (`openccu-base.mk:210-212`) |
| CCU runtime paths | symlinks | staged links resolve on device | `/opt/hm/www`, `/etc/config/addons/www`, `/var/EULA.*` | CMake-created links (SP003) unchanged; dangling committed links disappear |
| GitHub Actions CI | workflow | this repo → CI | staged-output checks | Keep existing checks; add guard |
| CMake / Tcl / Python | build tools | this repo | generators | Unchanged |

### 5.2 Communication Protocols
Build-time file copies and git SHA pinning only. No runtime protocol changes. HTTP surface (`/api/homematic.cgi`, `/config/*.cgi`, `/rega/*`, `/pda/*`, `/webui/*`, `/ise/*`) is untouched.

### 5.3 Contract Preservation
The nextGen React UI is additive: it lives at `/www/ngui` and calls the existing JSON-RPC contract. Whether a BFF is added in front of `/api/homematic.cgi` is **not decided here**; it is owned by `webui-api` (its plan defers a gateway until the contract and tests exist). The classic UI keeps every existing path and URL.

---

## 6. Security Architecture

### 6.1 Authentication & Authorization
Unchanged: ReGa sessions and the four-level privilege model (Q6 = keep current). Hardening belongs to `webui-api`.

### 6.2 Service-to-Service Security
Not applicable.

### 6.3 Data Protection
Removing `www/` removes duplicate copies of known findings (default admin credentials in `tcl/eq3_old/user.tcl:8-9`, request-driven exec in `cp_software.cgi:493`, `errorInfo` leak at `homematic.cgi:155`) but does not remediate them (NFR-004); they stay tracked in the `webui-*` features.

---

## 7. Cross-Cutting Concerns

### 7.1. Repository guard rails
Prevent regression of the single-source rule. **Pattern:** CI policy check. **Technology:** shell step in GitHub Actions.

### 7.2. Build reproducibility evidence
Prove the cutover changes nothing shipped. **Pattern:** manifest diff. **Technology:** `find` + `sha256sum` over the staged tree, symlink targets via `readlink`.

### 7.3. Configuration management
`make deploy` behavior documented in README and `cmake/README.md`; no runtime configuration.

---

## 8. Migration Path

### 8.1 Recommended Migration Sequence

1. **Verify (Phase 0)**: build staged root at HEAD, save manifest; triage the 90 + 49 differing files and the 30 only-in-`www/` entries for fixes never ported to `src/webui`; ask maintainers about third-party consumers.
   - Components: C1, C2, C3
   - Duration estimate: 1–2 days
   - Dependencies: none
2. **Prepare (Phase 1)**: edit `Makefile` deploy so it no longer writes `./www`, update README and `cmake/README.md`. The `www-guard` step is added with the removal commit, because it would fail while `www/` is still tracked.
   - Components: C4, C6
   - Duration estimate: 0.5 day
   - Dependencies: Phase 0 triage empty or ported
3. **Snapshot (Phase 2)**: tag `www-snapshot-<date>`.
   - Components: git
   - Duration estimate: minutes
   - Dependencies: Phase 1 merged
4. **Delete and guard (Phase 3)**: single commit `git rm -r www` that also adds the `www-guard` CI step; CI rebuilds on 4 platforms and compares the manifest.
   - Components: C1–C6
   - Duration estimate: 0.5 day
   - Dependencies: snapshot tag
5. **Sibling bump (Phase 4)**: run `scripts/update-openccu-base.sh` in the OpenCCU repo, `make check-openccu-base`, patch validation, container smoke test.
   - Components: OpenCCU repo
   - Duration estimate: 1 day
   - Dependencies: Phase 3 SHA

Ordering reason: lowest-coupling changes (docs, Makefile, guard) first; the irreversible-in-practice removal last; the external pin bump only after CI proof.

### 8.2 Risk Areas

| Risk | Source | Mitigation | Priority |
|------|--------|------------|----------|
| Undiscovered external consumer of `www/` | plan risk (high) | Maintainer check, snapshot tag, revert path | High |
| Staged root changes accidentally | plan risk (high) | Three-producer manifest before/after | High |
| Sibling patches break | plan risk (medium) | Run sibling checks on post-cutover SHA before bumping pin | Medium |
| Open branches (feature/nextgen-ui) conflict | plan risk (medium) | Take deletion; re-apply edits to `src/webui/www`; note in README | Medium |
| Hidden hot-fixes only in `www/` | plan risk (medium) | Per-file triage, port newer changes | Medium |
| Guard blocks `www/keep` placeholders | plan risk (low) | Guard checks tracked files only | Low |

### 8.3 Rollback Strategy
Phases 0–2 are additive. Phase 3 is one commit: `git revert` restores `www/`. The sibling pin stays on the previous SHA until Phase 4 passes. A dry-run revert is tested once during Phase 2.

---

## 9. Decision Summary

Key architectural decisions are documented in the ADR. See `target-architecture.adr.md` for full details.

**Quick Reference**:

| Decision ID | Decision | Chosen |
|-------------|----------|--------|
| Q1 | Existing patterns | Same pattern as current system; React FE planned, BFF undecided (owned by webui-api) |
| Q2 | Architectural style | Keep current architecture (refactor in place) |
| Q3 | Communication patterns | Skipped: unchanged (build-time only) |
| Q4 | Data storage strategy | Skipped: no database |
| Q6 | Authentication/authorization | Skipped: keep current, owned by webui-api |
| Q8 | Deployment model | Skipped: same as current (OpenCCU Buildroot image and containers) |
| Q-DEPLOY | make deploy | Skip `www`, keep the rest |
| Q-GUARD | Re-add prevention | CI step on every PR |
| Q-REACT | React slot | `src/webui/www/ngui` → `/www/ngui` |
| AQ6 / AQ7 | Frontend-to-backend connectivity | Not applicable — no new cross-process call defined by this feature |

(Additional decisions: see ADR Section "Decision Log")

---

## 10. Target Diagrams

### Component Diagram
> [component-diagram.md](diagrams/component-diagram.md)

### Sequence Diagram
> [sequence-diagram.md](diagrams/sequence-diagram.md)

### Entity Diagram
> [entity-diagram.md](diagrams/entity-diagram.md)
