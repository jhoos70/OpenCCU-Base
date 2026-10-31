# Architecture Decision Record — www

**Status**: approved  
**Date**: 2026-10-10

---

## Context

### Migration Goal

Make `src/webui` the single source of truth and remove the committed, drifted `www/` tree without changing the shipped rootfs. The staged web root must stay byte-identical, the sibling OpenCCU build must keep passing, and nobody should be able to edit a stale copy again. This unblocks the nextGen UI work.

### Scope

Mode: targeted. 4 included areas (`www/`, `Makefile` target `deploy-%`, `README.md:30`, CI guard and docs), 7 modules.

### Constraints

Staged web root layout and URL surface unchanged; `webui.js` line structure, `style.css`, `DEVDB.tcl` generation and `utf82ansi.py` re-encoding unchanged (sibling patches); staged `rega.tcl` byte-identical; ports unchanged. The classic and the nextGen UI must coexist for a long time.

### Analysis Summary

- User stories extracted: 9
- Control flows identified: 7
- Entities identified: 5

### Focus Areas

- Evidence-based consumer check
- Manifest-equivalence proof of the staged web root
- Review of only-in-`www/` and differing files for unported hot-fixes
- Guard rails (CI check, `make deploy`, docs)
- Sibling coordination (pin bump)
- Communication to the nextGen UI branch

---

## Source Stack

### Languages
- Tcl (CGI, ISO-8859-1), HomeMatic Script, JavaScript, CSS

### Frameworks
- Tcl cgi.tcl; Prototype/jQuery/knockout/jqPlot in the copy

### Infrastructure
- CMake 3.20+ presets, Makefile, GitHub Actions (4 platforms), Buildroot sibling pinning by SHA

---

## Target Stack

### Languages
- Unchanged; React/TypeScript reserved for the nextGen slot (no build defined here)

### Frameworks
- Unchanged; Bootstrap 5 stays in `src/webui/www`

### Infrastructure
- Unchanged, plus a `www-guard` CI step and a staged-tree manifest check

---

## Scope

**Mode**: targeted

### In Scope
- `www/` (4,051 tracked entries), `Makefile` `deploy-%`, `README.md:30`, `cmake/README.md`, CI guard

### Out Of Scope
- `src/webui/**` content changes, fixes of findings present in both trees, sibling repo changes other than the pin bump, `bin/ lib/ etc/ opt/ usr/ firmware/`

### Critical Components
- `src/webui/CMakeLists.txt`, `src/webui/www_source/CMakeLists.txt`, `src/devicetypes/CMakeLists.txt`, sibling `stage_validation_rootfs.sh`, `ci.yml` staged checks

### Boundaries
- No change to the staged rootfs; no history rewrite; classic UI paths untouched

---

## Constraints

### Unchanged
- Staged web root layout and symlinks; `webui.js` generation; URL surface; port contract

### Integration Systems
- OpenCCU Buildroot package `openccu-base`; ReGaHss; CCU runtime paths

---

## Architectural Style

**Selected**: Keep current architecture (refactor in place)

**Rationale**: The build already ignores `www/`; the change removes a dead copy and adds guard rails. A new runtime component would not serve the goal and would endanger the sibling's 64 patches.

**Rejected**:
- Modular monolith: no modules are introduced; classic and nextGen share the existing staging.
- Microservices, event-driven, serverless: not applicable to a repository consolidation.

---

## Architecture

### Components
- C1 Web Root Staging (SP001, SP003, SP004)
- C2 Generated Asset Pipeline (SP002)
- C3 Devicetype Asset Staging (SP009)
- C4 Repository Deploy Workflow, modified (SP005)
- C5 Source Hygiene and CI Verification (SP006, SP007)
- C6 Repo Guard and Documentation, new (SP008)

### Data Architecture
No database. Git sources and the CMake staging tree. No schema changes. Invariant: staged-tree manifest equivalence across all three producers.

### Integration Architecture
Build-time copies and git SHA pinning. Sibling pin bumped after proof. ReGaHss and CCU runtime paths unchanged.

### Security Architecture
Auth unchanged (ReGa sessions, 4-level privileges). Removal drops duplicate findings but remediates none; they remain in `webui-*` features.

### Cross-Cutting Concerns
Repository guard rails (CI check), build reproducibility evidence (manifest diff), documentation of `make deploy`.

### Deployment Architecture
Same as current: OpenCCU Buildroot image and containers; CI builds 4 platforms.

---

## Migration Strategy

1. Verify and triage drift (manifest baseline)
2. Prepare: `make deploy` skips `www`; docs updated
3. Snapshot tag `www-snapshot-<date>`
4. Delete `www/` and add `www-guard` in one commit; CI manifest comparison
5. Bump sibling pin; run its checks

Rollback: `git revert` of the removal commit; sibling pin stays on the previous SHA until Phase 4 passes.

---

## Decision Log

| ID | Category | Selected | Rationale |
|----|----------|----------|-----------|
| Q1 | existing-patterns | Same pattern as current system; React FE planned, BFF undecided | Consolidation reuses existing CMake staging; BFF belongs to `webui-api` (user asked to reserve a slot only) |
| Q2 | architectural_style | Keep current (refactor in place) | No runtime change needed |
| Q3 | communication | Skipped: unchanged | Build-time only |
| Q4 | data-storage | Skipped: no database | Not applicable |
| Q5 | data-migration | Skipped | No database |
| Q6 | auth | Skipped: keep current | Hardening owned by `webui-api` |
| Q8 | deployment | Skipped: same as current | OpenCCU image and containers |
| GQ1 / Q10–Q15 | implementation-standards | Skipped: not applicable | Questionnaire reduced to feature-relevant questions at user request (option 2) |
| Q-DEPLOY | make-deploy | Skip `www`, keep the rest | Keeps local refresh of bin/lib/etc/firmware/opt/usr; rejected: redirect web root to build/ (extra path to maintain), remove target (loses workflow) |
| Q-GUARD | guard | CI step on every PR | Enforces the rule cheaply; rejected: CI plus `.gitignore` (hides accidents rather than failing), docs only (no enforcement) |
| Q-REACT | frontend-slot | `src/webui/www/ngui` staged to `/www/ngui` | Reuses `copy_directory` with no CMake change; rejected: separate `src/webui-ng` project (premature build design), decide later (leaves slot ambiguous) |
| AQ6 / AQ7 | frontend-backend | Not asked | No new cross-process call is defined by this feature; BFF decision deferred to `webui-api` |

---

## Consequences

### Positive
- One authoritative tree for the classic and nextGen UIs; about 4,000 fewer tracked files and 49 MB less working tree; 24 dangling symlinks and tracked generated files removed; CI guard encodes the rule.

### Negative
- Anyone using the repo tree as a deployable web root must build `webui-assets` or use the tag; merge friction for open branches; history size unchanged.

### Architectural Debt
- Git history stays large unless later rewritten (would invalidate sibling SHA pins).

### Follow-Up Decisions
- BFF or gateway in front of the Tcl API (owned by `webui-api`)
- React build pipeline for `src/webui/www/ngui`
- Whether other deployed-output directories (`bin/`, `lib/`, `firmware/`, `etc/`) should also stop being tracked
- Whether `make deploy` should exist at all

---

## Success Criteria

- `git ls-files www` returns nothing; no build or CI consumer references it.
- Staged web root manifest and sha256 identical before and after, across `webui-assets`, `webui-www-source-assets` and `devicetypes-assets`.
- CI green on 4 platforms; `tests/test-components.py` passes.
- Sibling `make check-openccu-base` and patch validation pass with the new pin.
- `www-guard` fails a PR that re-adds tracked files under `www/`.
- README and `cmake/README.md` state `src/webui` is the only source and `make deploy` no longer writes `./www`.
- Pre-removal state retrievable via tag; rollback dry-run documented.

---

## Diagrams

- `diagrams/component-diagram.md`: components and staged-root producers
- `diagrams/sequence-diagram.md`: cutover sequence with rollback
- `diagrams/entity-diagram.md`: entities in the consolidation

---

## Source Documents

- `.migration/www/plan.downstream.json`
- `.migration/www/analysis/analysis.json`
- `architect/references/*` (question bank, output template, ADR template)

---

## Approval

- **Approved by**: jhoos70 (joern.hoos@gmail.com)
- **Approved at**: 2026-10-10
- **Review iterations**: 1
- **Notes**: Questionnaire reduced to feature-relevant questions at user request.
