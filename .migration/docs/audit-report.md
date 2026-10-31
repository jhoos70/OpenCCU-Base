# Audit Report

Verdict: PASS_WITH_WARNINGS
Target: explore
Artifact: .migration/docs/index.json (+ 34 output_files, 4 root deliverables, verification/)
Checks passed: 8/10
Critical issues: 0
Warnings: 2

## Summary

Re-audit run on 2026-10-09 after the producer's fixes. Everything was checked again from the artifacts and the source. The previous findings were not taken on trust. The earlier critical issues are resolved:

- `cross-cutting/api-contracts.md` and `cross-cutting/infrastructure.md` now exist, are listed in `output_files`, and contain line references to the source.
- The `metadata.coverage` bookkeeping matches the artifacts: 19/19 modules and 8/8 cross-cutting docs.
- The recalculated `quality_score` is 100, the same as the declared value.
- The `homematic.cgi` line references are correct.
- The scripted verification passes (coverage 100.0, accuracy 96.0).

Two warning-level issues remain:

- **Check 7:** dead-code claims are not consolidated in `technical-debt.md`, and none of them has a confidence label.
- **Check 9:** 18 of 19 module docs do not follow the module template headings.

## Check Results

### Check 1: Structural Validation - PASS

- Severity: none
- Evidence:
  - `index.json` parses.
  - Every field the schema requires is present (`skills/deep-explore/references/schema.json`): `repository.path`/`name`, `scan.timestamp`/`filesScanned` (9793)/`directoriesScanned` (769), `stacks`, and `output_files` (34 entries, each with `path` and `description`).
  - A recursive check of the required fields reported nothing missing.
- Principles applied: none

### Check 2: File Existence - PASS

- Severity: none
- Evidence: All 34 `output_files` paths exist under `.migration/docs/`. This includes the new `cross-cutting/api-contracts.md`, `cross-cutting/infrastructure.md` and the six `modules/webui-*.md`.
- Principles applied: none

### Check 3: Directory Compliance - PASS

- Severity: none
- Evidence:
  - The root holds only `index.json`, `overview.md` (2149 B), `contracts.md` (1871 B), `data-model.md` (1328 B), `tech-stack.md` (1493 B), `audit-report.md`, and the folders `overview/`, `modules/`, `cross-cutting/`, `external-context/` and `verification/`.
  - The four root deliverables are non-empty and are not listed in `output_files`.
- Principles applied: none

### Check 4: file_index Completeness - PASS

- Severity: OBS
- Evidence:
  - `file_index` has 19 patterns.
  - A walk of the repository with the fingerprint skip rules (`.git`, `.claude`, `bin`, `src/webui/www_source/config/devdescr`) found exactly 40 unmatched files. All 40 are under `lib/<arch>/*.so`: prebuilt shared libraries with no source.
  - Every top-level directory that contains source or scripts (`src`, `www`, `usr`, `tests`, `build-tools`, `cmake`, `.github`, root) is covered, as is every extension category in the checklist. Coverage is above 99%.
- OBS:
  - `lib/**` is not indexed, although the www Tcl layer loads `tclrega.so`/`tclrpc.so` from it at runtime.
  - `src/webui/**` is mapped to module `src`, not to the six `webui-*` modules, so file-to-doc routing for the web UI goes to `modules/src.md`.
- Remediation (optional): add `"lib/**": {"module": "bin", "type": "binary"}`. Also map `src/webui/rega/**`, `src/webui/www/api/**`, `src/webui/www/config/easymodes/**`, etc. to their `webui-*` module names.
- Principles applied: GP-PROJ-002 (candidate, no verdict effect)

### Check 5: Quality Score Recalculation - PASS

- Severity: none
- Evidence:
  - files 9793/9793 × 25 = 25
  - modules 19/19 × 25 = 25
  - apis 255/255 × 20 = 20
  - models 6/6 × 15 = 15
  - xcut 8/8 × 15 = 15
  - Total: 100. The declared `quality_score` is 100 (delta 0).
- Principles applied: none

### Check 6: Scripted Verification Summary - PASS

- Severity: OBS
- Evidence:
  - `verification/verification-summary.json` (generated 2026-10-09T16:42:03Z, after the fixes) has `passed: true`.
  - Coverage 100.0 >= 95.0, and accuracy 96.0 (48/50) >= 95.0.
  - `index.json` `metadata.verification` matches the summary on coverage_percent, accuracy_percent, both thresholds and passed.
- OBS: the summary has no `iterations` field, so index `iterations: 3` cannot be cross-checked.
- OBS: both failed accuracy claims are verifier false positives:
  - `modules/webui-shell-build.md:75` names `../www/config/easymodes/js/ic_functions.js`. This path is relative to `src/webui/www_source/`, and `src/webui/www/config/easymodes/js/ic_functions.js` exists.
  - `modules/webui-design-docs.md:77` names `old/lock_{open,closed}.png`. This is shell brace expansion, and both `src/webui/design/old/lock_open.png` and `lock_closed.png` exist.
- OBS: the verifier's `total_files` is 4779, while the index's `files_total` is 9793. The two use different denominators.
- Principles applied: GP-PROJ-003 (candidate, proposed now, no verdict effect)

### Check 7: Cross-Cutting Coverage - FAIL

- Severity: warning
- Evidence, rows that pass:
  - APIs → `cross-cutting/api-contracts.md`. Line references verified: `homematic.cgi:103-118` (`proc checkPrivilegeLevel`), `:141` (`jsonrpc_parse`), `:148`, `:153` (`source ... SCRIPT_FILE`), `:155` (`errorInfo`), `:160` (GET branch), and `jsonrpc.js:56-76` (POST, `Content-Type: application/json`). The 180-method count matches the 180 catalogue rows in `modules/webui-api.md` §8.
  - Infrastructure/CI → `cross-cutting/infrastructure.md`. Line references verified: `ci.yml:6-11` (triggers) and `:136-137` (test-components.py on x86_64 only).
  - Security → `security.md`.
  - Testing → `testing.md`. `cmake/Components.cmake:188-190` verified.
  - Integration seams → `integration-seams.md`.
  - Database: no DDL present, so `database-schema.md` is not needed (GP-008).
  - Runtime descriptors: no init.d, systemd or Dockerfile files are in the repository. `infrastructure.md` states this.
- Evidence, the row that fails (dead-code claims): the module docs make dead or unused claims that `cross-cutting/technical-debt.md` does not consolidate. Its only entry is `technical-debt.md:12`, "multimacd: dead config keys", and it has no confidence label. `grep -c confidence technical-debt.md` returns 0. Claims missing from it:
  - `modules/src.md:108` and `:291`: ssdpd `#if 0` block at `ssdpd.cpp:45-176`. Verified.
  - `modules/src.md:539`: `PIDFILE`/`UDS_PATH` at `rfd.cpp:13-14` are unused. Lines verified.
  - `modules/src.md:469`: `MultithreadTest` has no caller but is compiled into multimacd.
  - `modules/usr.md:79`: Session/Script stubs have "no callers".
  - `modules/webui-easymodes.md:284`: `mapping/*_map.tcl` (36 files) is "probably dead ... no usage analysis was done".
  - `modules/webui-shell-build.md:291`: `roundslider.css` is a "dead asset candidate".
  - `modules/webui-config-pages.md:111`: `cp_cert.cgi` is a "dead entry".
  - `modules/webui-design-docs.md:15-18`: `design/` and `documentation/` are unconsumed.
  - `modules/etc.md:64`: `crypttool.cfg` is an unreferenced empty duplicate.
- Remediation: add a "Dead / unused code" section to `cross-cutting/technical-debt.md`. Give one row per claim with `path:line` evidence, the method used (grep scope or build-graph check), and a confidence of `confirmed`, `likely` or `unverified`. For example, mark ssdpd `#if 0` as confirmed and `mapping/*_map.tcl` as unverified.
- Principles applied: GP-008 (database row only)

### Check 8: Evidence Spot-Check - PASS

- Severity: none
- Evidence: 3 docs were sampled, with 2 or more references each. All files exist, all line numbers are in range, and all content matches:
  - `modules/www.md`: `api/homematic.cgi:147-148`, the privilege check called at 148. The earlier wrong references (77-90, 121, 37-42) are gone.
  - `modules/src.md`: `rfd.cpp:13-14` (`PIDFILE = "/var/rfd.pid"`, `UDS_PATH = "/var/socket_rfd"`) and `ssdpd.cpp:45` `#if 0` / `:176` `#endif`.
  - `cross-cutting/testing.md` and `infrastructure.md`: `ci.yml:136-137`, `Components.cmake:188-190`.
  - `modules/webui-api.md:59`: error codes at `homematic.cgi:195-211`. The table rows for 100-402 are at lines 198-209.
- Principles applied: none

### Check 9: Module Template Adherence - FAIL

- Severity: warning
- Evidence: 18 of 19 module docs in `output_files` lack the required headings. Only `modules/src.md` has all three: `## Overview` at :13, `## Components` at :58, plus Dependencies.

| Module doc | Missing headings |
| --- | --- |
| `modules/.github.md` | `## Components` |
| `modules/bin.md` | `## Components` |
| `modules/build-tools.md` | `## Components` |
| `modules/cmake.md` | `## Components` |
| `modules/etc.md` | `## Components` |
| `modules/opt.md` | `## Components` |
| `modules/root.md` | `## Components`, `## Dependencies` |
| `modules/licenses.md` | `## Components`, `## Dependencies` |
| `modules/tests.md` | `## Components`, `## Dependencies` |
| `modules/usr.md` | `## Components`, `## Dependencies` |
| `modules/www.md` | `## Components`, `## Dependencies` |
| `modules/firmware.md` | All three. It uses numbered `## 1. Overview`. |
| `modules/webui-shell-build.md` | All three |
| `modules/webui-rega-pages.md` | All three |
| `modules/webui-config-pages.md` | All three |
| `modules/webui-easymodes.md` | All three |
| `modules/webui-api.md` | All three |
| `modules/webui-design-docs.md` | All three |

- Context: the six new `webui-*` docs use numbered sections (`## 1. Summary`, `## 1. Inventory`, ...). The producer already acknowledges this gap in `index.json` `metadata.verification.remaining_gaps`.
- Remediation:
  - Add `## Overview`, `## Components` and `## Dependencies` headings to each listed doc. Existing content can be regrouped under them: inventory and per-component sections under Components, "Dependencies and coupling" under Dependencies.
  - Remove the numeric prefixes from the Overview headings, or add the plain headings next to them.
- Principles applied: none

### Check 10: Coverage Accuracy - PASS

- Severity: OBS
- Evidence:
  - `files_total` 9793 equals `scan.filesScanned` 9793.
  - `files_documented` 9793 includes the 40 unindexed `lib/*.so` files, an overcount of 0.4%. This is within the 10% tolerance.
  - `modules_documented` 19 = 19 `modules/*.md` in `output_files`, and `modules_detected` 19 = 19 `modules[]` entries.
  - `cross_cutting_produced` 8 = 8 `cross-cutting/*.md` in `output_files`, which equals the 8 `cross_cutting` keys.
  - APIs 255 = 180 JSON-RPC methods (180 rows recounted in `webui-api.md` §8) + 25 hs485d + about 50 rfd XML-RPC methods. This is plausible.
  - Models: 6 is plausible against `data-model.md`, but that file does not enumerate the 6 models, so the count cannot be recounted exactly.
- Remediation (optional): set `files_documented` to the count actually matched by `file_index` (9753), or index `lib/**`. List the 6 counted models explicitly in `data-model.md`.
- Principles applied: GP-004

## Project Memory Updates

- Findings appended: 5
- Golden dataset examples appended: 2
- Project decisions proposed or reinforced: 2 (GP-PROJ-002 reinforced, GP-PROJ-003 proposed)
