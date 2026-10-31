# Migration Plan: Retire the committed deployed web root `www/` (single source of truth `src/webui`)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: repository-consolidation (remove a stale generated copy; no runtime technology change)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | www | primary | index.json | Root `www/`: 4,051 tracked entries (24 symlinks), 49 MB working copy; a stale deployed snapshot of the WebUI |
| 2 | webui-shell-build | affected | index.json | Owns the real source `src/webui/www/webui`, `www_source/` generators (webui.js, style.css, DEVDB.tcl) and the Bootstrap 5 assets |
| 3 | webui-config-pages | affected | index.json | Source of record for `www/config` (excluding easymodes), `pda`, `error`, `tools`, `upnp` |
| 4 | webui-api | affected | index.json | Source of record for `www/api` and `www/tcl` |
| 5 | webui-rega-pages | affected | index.json | Source of record for `www/rega` (`src/webui/rega/www`) and `www/ise` |
| 6 | webui-easymodes | affected | index.json | Source of record for `www/config/easymodes` (2,561 files, duplicated in `www/`) |
| 7 | root (CMake/Makefile/README/CI) | affected | index.json | `make deploy` is the only in-repo path that writes `www/`; README documents `www/` |

---

## Context

### Summary

`www/` is a committed copy of the CCU web root (Tcl CGIs, ReGa pages, JSON-RPC API, `webui.js`, vendored JS/CSS, device images). The real source is `src/webui/www` plus `src/webui/rega/www`, with generated assets produced by `src/webui/www_source`. The build never reads `www/`: `src/webui/CMakeLists.txt:5-6` copies `src/webui/www` and `src/webui/rega/www` into `${ROOTFS_DIR}/www`, creates the symlinks (`:9-31`), and the `webui-www-source-assets` target in `src/webui/www_source/CMakeLists.txt:1-23` generates `webui.js`, `style.css` and `DEVDB.tcl` into the same staging tree. Root `www/` is therefore a leftover from the pre-restructuring layout (its last upstream-style commit is 5ad0af6c, 2026-06-03, "Updated to version 3.89.2"), while `src/webui/www` receives all current work (e.g. 7d8dbddf, b9ce345d, 94bb4ab3 on 2026-10-09).

### Migration Drivers

- Two diverging copies of the web root create a "which is authoritative" trap for the nextGen UI work: Bootstrap 5 assets, the HTTP-cache-header change and the time-zone fix exist only in `src/webui/www`.
- Measured drift (`diff -rq www src/webui/www`, re-run for this plan): 52 files differ outside `config` (api 28, webui 13, pda 3, tools 3, error 2, tcl 2, ise 1), 38 differ plus 11 exist only in `www/config` (49 total), 6 Bootstrap entries exist only in the source tree. The deep-explore doc reported 0 differences for `rega`, but it compared against the wrong directory: against the correct source `src/webui/rega/www`, 49 files differ (for example `esp/functions.fn`, `esp/datapointconfigurator.fn`, `esp/controls/blind.fn`, `dimmer.fn`, `rgbw.fn`).
- Generated artifacts are tracked: `www/webui/webui.js` (1.9 MB, 53,123 lines, ISO-8859-1), `www/webui/style.css`, `www/config/devdescr/DEVDB.tcl` (even though `www/config/devdescr/.gitignore` ignores `*`), `st_values.js`, `licenseinfo.htm`. `src/webui/www_source/.gitignore` already ignores the generator outputs, confirming they are not meant to be committed.
- 24 tracked symlinks point at absolute `/opt/hm/www/...`, `/opt/hm/etc/config/addons/www` and `/var/EULA.*` and are dangling in any checkout; the CMake step creates different (relative or `/tmp`) targets, so the committed links are wrong for every consumer, and break on Windows checkouts.
- Repo weight: 49 MB of working tree, 511 MiB pack in total, roughly 3,000 files duplicated verbatim (easymodes, images).
- Historical edits already have to be made twice (commit 1ba5c642 deleted the same three files in `www/` and `src/webui/www`).

### Current State

C/C++/Tcl monorepo built with CMake presets and a `Makefile` wrapper; GitHub Actions CI builds 4 platforms with `-DDEPLOY_TO_REPO=OFF` and verifies the staged tree (`.github/workflows/ci.yml:199-201` checks `${stage}/www/webui/webui.js`, `style.css` and `www/config/devdescr/DEVDB.tcl`, i.e. the generated copies, not the committed ones). The sibling Buildroot repo `/home/standard/dev/OpenCCU` pins this repo at `OPENCCU_BASE_VERSION = 7d8dbddf1d5a...` (`buildroot-external/package/openccu-base/openccu-base.mk:7`), configures with `-DBUILD_WEBUI_AND_DEVICETYPES=OFF -DDEPLOY_TO_REPO=OFF` (`:42-47`) and builds the web root itself through `rootfs-patches/stage_validation_rootfs.sh`, which `add_subdirectory`s `src/webui` (not `www/`) and runs `webui-assets`; it then applies its 64 rootfs patches to that staged `asset-rootfs` and copies `asset-rootfs/www` into the target (`:106-114`).

### Cross-Cutting Findings

- Consumers of `www/` (evidence): none found in the build. Searched CMake files, `cmake/Components.cmake`, `Makefile`, `CMakePresets.json`, `.github/workflows/*`, `tests/*.py` (only `www/keep` placeholder at `tests/test-components.py:117`), `src/webui/Makefile` and the sibling repo (`grep` for `OpenCCU-Base/www` and `base/www` returned nothing; all sibling `www` references are to the target rootfs or staged tree). The only documentation reference is `README.md:30` ("`www/` - WebUI and Tcl-based runtime resources").
- The only in-repo writer of `www/` is `make deploy-%` (`Makefile:25-33`, copies `selected-install/www` back into `./www`). CMake `DEPLOY_TO_REPO` does not copy WebUI assets (`openccu_stage_target` only covers `bin/` and `lib/`; `webui-assets` has no deploy step), which contradicts the deep-explore statement that `DEPLOY_TO_REPO` explains the drift. The drift is explained by the manual `make deploy` path and by the pre-June upstream snapshot workflow.
- Sibling constraint: the 64 rootfs patches (41 on `webui.js`) rely on the exact output of the `src/webui` generators and on CRLF in `www/tcl/eq3/rega.tcl`; because they are applied to the generated staging tree, deleting `www/` does not change their input.
- Security items present in the copy are identical in the source tree (default admin creds `www/tcl/eq3_old/user.tcl:8-9`, `cp_software.cgi:493` request-driven exec, `homematic.cgi:155` errorInfo leak). Deleting `www/` removes duplicate findings but does not remediate them; remediation belongs to the webui-* features.
- Testing: no test reads `www/`; CI only validates the staged output. There is no automated guard against re-introducing a second copy.
- `www/rega/licenseinfo.htm` (18,244 lines) exists only in `www/`; the sibling regenerates it at build time (`openccu-base.mk:210-212`), so it is not a dependency.

---

## Migration Goal

**Make `src/webui` the single source of truth and remove the committed, drifted `www/` tree without changing the shipped rootfs.**

The staged web root produced by `webui-assets` must remain byte-identical before and after the change (modulo already-merged source changes), the sibling OpenCCU build must keep passing, and nobody should be able to edit a stale copy again. This unblocks the nextGen UI work, which would otherwise be developed against Bootstrap-less, stale files in `www/`.

---

## Decision

### Approach: Remove the tracked tree in a guarded, staged cutover (verify, guard, snapshot, delete)

Delete `www/` from the working tree in a single commit after (1) proving by build that nothing consumes it, (2) tagging the last state for archaeology, and (3) adding guards so it cannot return as a tracked directory. Keep `make deploy` available for local experiments but redirect its web root output to `build/` (or exclude `www`).

**Rationale**: (1) Build evidence: `src/webui/CMakeLists.txt:5-6` and `www_source/CMakeLists.txt:1-23` regenerate every file that `www/` contributes, including the generated ones; (2) the sibling consumes `src/webui` through `stage_validation_rootfs.sh` and pins by SHA, so existing pins keep working and new pins validate through its `make check-openccu-base`; (3) 52+49(+49 rega) files already differ, so `www/` cannot be a faithful deployment of the current source and nothing can depend on it being correct; (4) the symlinks in it are dangling by construction; (5) git history retains the full content.

### Rejected Options

- **Keep `www/`, resync it by hand/CI bot (commit generated output on each change)**: perpetuates 49 MB of generated duplicates, noisy diffs, and the CRLF/ISO-8859-1 hazards; adds a CI job whose only purpose is to mirror the build.
- **Make `www/` a symlink or submodule to `src/webui/www`**: the source tree lacks generated files (`webui.js`, `style.css`, `DEVDB.tcl`) and `rega/www`, so the layout would still be incomplete; absolute symlinks already fail on Windows checkouts.
- **Untrack but keep ignored locally (`git rm --cached` + `.gitignore`)**: acceptable fallback if a maintainer wants local dev convenience, but leaves stale files in existing clones; chosen only as the rollback variant (see Risks).
- **Do nothing / document that `src/webui/www` is authoritative**: leaves the trap in place during the very UI rewrite that makes the divergence expensive.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | Tcl (CGI, ISO-8859-1), HomeMatic Script (ReGa pages), JavaScript (webui.js bundle), CSS | Unchanged (no code is rewritten by this feature) |
| Frameworks | Tcl `cgi.tcl`, Prototype/jQuery/knockout/jqPlot in the copy; Bootstrap 5 only in `src/webui` | Unchanged; Bootstrap 5 stays in `src/webui/www/webui` only |
| Infrastructure | CMake 3.20+ presets, Makefile wrapper, GitHub Actions (4 platforms), Buildroot sibling pinning by SHA | Unchanged; `make deploy` no longer writes `./www`; add a CI guard step |

---

## Scope

**Mode**: targeted

### Included Components

- `www/` (all 4,051 tracked entries, including `www/config`, `www/webui/webui.js`, `www/webui/style.css`, `www/config/devdescr/DEVDB.tcl`, `www/rega`, 24 symlinks)
- `Makefile` target `deploy-%` (lines 25-33)
- `README.md:30` repository layout text
- CI guard (new step in `.github/workflows/ci.yml`) and a short note in `cmake/README.md` / `src/webui` docs

### Excluded Components

- `src/webui/**` content changes (owned by webui-shell-build, webui-config-pages, webui-api, webui-rega-pages, webui-easymodes)
- Any fix of the findings reproduced in both trees (default credentials, exec from request, errorInfo leak, hard-coded key)
- Sibling repo changes other than bumping its `OPENCCU_BASE_VERSION` pin after the cutover
- `bin/`, `lib/`, `etc/`, `opt/`, `usr/`, `firmware/` (also deployed-artifact directories, assessed in their own features)

### Critical Components

- `src/webui/CMakeLists.txt` (`webui-assets`) and `src/webui/www_source/CMakeLists.txt`: the only producers of the shipped web root
- `/home/standard/dev/OpenCCU/.../rootfs-patches/stage_validation_rootfs.sh`: the sibling's consumer of this repo
- `.github/workflows/ci.yml:161-212` staged-output checks

### Boundaries

- No change to the staged rootfs content or layout.
- No change to `src/webui/www_source/webui.js` line structure or `src/webui/www/tcl/eq3/rega.tcl` CRLF (sibling patch contract).
- History is not rewritten; the deletion is an ordinary commit and a tag preserves the last state.

---

## Dependencies

### Internal

- `src/webui` (webui-assets and webui-www-source-assets targets) as the replacement producer
- `Makefile` (`deploy-%`), `README.md`, `.github/workflows/ci.yml`, `cmake/README.md`
- webui-* features: they must continue to edit only `src/webui/...`; they gain a clean tree to work on
- `cmake/Components.cmake:155-157` installs `${ROOTFS_DIR}/www/` (staging, not the repo `www/`)

### External

- Sibling Buildroot repo `/home/standard/dev/OpenCCU`: pins by SHA (`openccu-base.mk:7`, `scripts/update-openccu-base.sh`), runs `make check-openccu-base`, applies 64 rootfs patches to the generated tree, overlay `WebUI-openccu` adds branding under `www/ise/img` and CodeMirror 6 into the staged tree
- Unknown third parties that might fetch `www/` from GitHub raw/archives (not verifiable from the repos; see Risks)
- Downstream packagers that build older tags of this repository (unaffected; tags retain `www/`)

---

## Constraints

### Unchanged

- The staged and installed web root layout: `/www/config`, `/www/api`, `/www/rega`, `/www/webui`, `/www/pda`, `/www/tools`, `/www/upnp`, `/www/ise`, `/www/tcl`, `/www/error`, and the top-level symlinks created at `src/webui/CMakeLists.txt:9-31`
- `webui.js` generation order and line structure, `style.css`, `DEVDB.tcl` generation and `utf82ansi.py` re-encoding (sibling patches depend on them)
- CRLF in `www/tcl/eq3/rega.tcl` in the staged output
- URL surface: `/api/homematic.cgi` JSON-RPC, `/config/*.cgi`, `/rega/*`, `/pda/*`, `/webui/*`, `/ise/*`
- Port contract hs485d 32000 / rfd 32001 / ReGa 8183, 1998 (not touched, but must not regress)

### Integration Systems

- OpenCCU Buildroot package `openccu-base` (consumer by SHA)
- ReGaHss (closed source) serving `/rega` and evaluating `<% %>` pages from the installed `/www/rega`
- CCU runtime paths `/opt/hm/www` (target of the committed absolute symlinks), `/etc/config/addons/www`, `/var/EULA.*`

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | An undiscovered consumer of the committed `www/` (third-party packagers, scripts, forks building from the repo tree, docs pointing at raw GitHub paths) breaks on deletion | Phase 0 external-consumer check (GitHub code search, ask OpenCCU maintainers), tag `www-snapshot-3.89.2-pre-removal`, announce in release notes, keep the rollback variant (`git revert` or untrack-only) ready | No in-repo or sibling consumer found: `Makefile`, `CMakeLists.txt`, `cmake/Components.cmake`, `.github/workflows/*`, `tests/*.py`, sibling `openccu-base.mk` and `stage_validation_rootfs.sh`; absence outside these repos cannot be proven |
| high | Staged web root changes accidentally (e.g. a generated file relied on being present in `www/` or a source file only exists in `www/`) | Before deletion, build the staged tree at HEAD with the sibling script and `webui-assets`, record a file-list plus sha256 manifest, delete, rebuild and diff the manifests (must be identical); review the "only in `www/`" list: symlinks, `st_values.cgi`, `st_values.js` (generated/handled by `www_source`), `webui.js`, `style.css`, `DEVDB.tcl`, `rega/EULA.*`, `rega/licenseinfo.htm` | `diff -rq www src/webui/www` reports 28 "Only in www" entries, all symlinks or generated files; `st_values.cgi` presence in the source tree must be confirmed in the manifest check |
| medium | Sibling rootfs patches (64, 41 on `webui.js`) were authored against a tree that includes a `www/`-derived file | Run the sibling `make check-openccu-base` and `validate_patches.sh` against the post-deletion SHA before moving its pin; patches are applied to the generated `asset-rootfs`, not to `www/` | `openccu-base.mk:91-95`, `stage_validation_rootfs.sh` adds `src/webui` only |
| medium | Contributors with local `make deploy` workflows or ongoing branches (feature/nextgen-ui) touching `www/` hit conflicts | Rebase guidance: re-apply edits to `src/webui/www`; `git rm` conflicts resolved by taking deletion; publish a one-paragraph note in README/CONTRIBUTING | Commit 1ba5c642 already forced double edits; 4,051 tracked paths affected |
| medium | The 49 `rega` differences (`esp/functions.fn`, `datapointconfigurator.fn`, controls) and 52 non-config differences hide intentional hot-fixes made only in `www/` that never reached `src/webui` | Diff each differing file once with `git log -- www/<path>` vs `src/...`; confirm that `www/` side is older (last `www/` commit 2026-06-03 vs source 2026-10); port anything newer, otherwise drop | `git log -- www` shows only the 5ad0af6c and 1ba5c642 edits since February; `git log -- src/webui/www` newest 2026-10-09 |
| low | History size does not shrink after deletion (511 MiB pack) | Out of scope; optional later `git filter-repo` decision for the maintainers, not part of this plan | `git count-objects -vH` |
| low | A CI guard is mis-specified and blocks legitimate `www/keep` placeholders used by `tests/test-components.py:117` | Guard only the tracked-file check (`git ls-files www | grep .`), not the local directory | `tests/test-components.py:117` creates `www/keep` inside a temp rootfs |

---

## Success Criteria

- `git ls-files www` returns nothing at the target commit; `git grep -n "^www/"` finds no build or CI consumer.
- The staged web root (`webui-assets` plus `webui-www-source-assets`) has an identical file manifest and sha256 sums before and after the cutover commit, excluding already-merged source changes.
- CI passes on all 4 platforms, including the staged-output checks at `ci.yml:199-201`, and `tests/test-components.py` passes.
- The sibling repo passes `make check-openccu-base` and its rootfs patch validation with its pin set to the post-cutover SHA.
- A CI guard fails any PR that re-adds tracked files under top-level `www/`.
- `README.md` and `cmake/README.md` state that `src/webui` is the only source and that `make deploy` output goes to `build/`.
- Pre-removal state is retrievable via a git tag; the rollback runbook is documented and tested once (`git revert` dry run).
- Zero regressions in the shipped web UI (smoke: login via `/login.htm`, `/api/homematic.cgi` GET, one `cp_*.cgi`, one `ic_*.cgi`, `/webui/webui.js` loads) on a container built by the sibling.

---

## Focus Areas

1. Evidence-based consumer check: repeat the grep matrix on the sibling at its current HEAD and ask maintainers about external users (Phase 0).
2. Manifest-equivalence proof of the staged web root before/after (sha256 list, including generated files and symlink targets).
3. Review of the "only in `www/`" and differing files for hot-fixes that never reached `src/webui` (rega 49, non-config 52, config 49).
4. Guard rails: CI check against re-adding `www/`, `make deploy` redirect, README and docs update.
5. Sibling coordination: pin bump sequencing and keeping the webui.js line structure and CRLF contract intact.
6. Communication to the nextGen UI branch: all UI work targets `src/webui/www` and `src/webui/rega/www` only.

### Phased Cutover Plan

| Phase | Action | Exit gate |
|-------|--------|-----------|
| 0 Verify | Build staged tree at HEAD (`stage_validation_rootfs.sh` or `cmake --build --target webui-assets`), save manifest. Re-run consumer grep on both repos. Triage "only in `www/`" and differing files; port any `www/`-only fix into `src/webui`. Ask maintainers about third-party consumers. | Written triage list is empty or ported; manifest saved |
| 1 Guard (no deletion) | Add CI step failing on tracked `www/` additions; change `deploy-%` to skip `www` (or write to `build/<platform>/deploy-www`); update README line 30 and docs. Merge. | CI green; guard proven to fail on a test PR |
| 2 Snapshot | Tag the commit before deletion (`www-snapshot-<date>`). | Tag pushed |
| 3 Delete | `git rm -r www` in one commit (no mixed changes). CI rebuilds and compares manifest with Phase 0. | Manifest identical; CI green on 4 platforms |
| 4 Sibling bump | In `/home/standard/dev/OpenCCU` run `scripts/update-openccu-base.sh` to the Phase 3 SHA; run `make check-openccu-base`, patch validation, and a container smoke test. | Sibling checks and smoke test pass |
| 5 Rollback (if needed) | `git revert` of Phase 3 commit (restores files), or untrack-only variant; the sibling pin stays on the previous SHA until fixed. | Documented, dry-run tested in Phase 2 |

---

## Consequences

### Positive Outcomes

- One authoritative location for all web assets; the nextGen UI (Bootstrap 5, cache-header work) cannot be accidentally edited in a stale copy.
- About 4,000 fewer tracked files and 49 MB less working tree; faster clones/greps/reviews, no duplicated findings in static analysis.
- Removal of 24 dangling absolute symlinks and of generated files tracked by mistake (`webui.js`, `style.css`, `DEVDB.tcl`).
- CI gains a guard that encodes the rule "generated/deployed output is never committed".

### Negative Outcomes

- Anyone using the repository tree directly as a deployable web root (without running CMake) loses that shortcut; they must build `webui-assets` or use a tag.
- Short-term merge friction for open branches that touched `www/`.
- Git history stays large unless maintainers separately decide to rewrite it.

### Follow-Up Decisions

- Whether to also stop tracking other deployed-output directories (`bin/<platform>`, `lib/<platform>`, `firmware/`, `etc/config_templates`) and use release artifacts instead.
- Whether to rewrite history to reclaim space (`git filter-repo`), which would invalidate the sibling's SHA pins.
- Whether the nextGen UI strangler work should stage new assets under `src/webui/www/webui` (Bootstrap already there) with `webui.js` untouched, to preserve the sibling patch contract.
- Whether `make deploy` should be retained at all.

---

## Source Documents

- `.migration/plan-context.md` - engagement goal, stack, external constraint
- `.migration/docs/modules/www.md` - module documentation (parts 1 and 2; correction applied to the `rega` drift row)
- `.migration/docs/external-context/summary.md` - sibling OpenCCU repo summary
- `.migration/docs/cross-cutting/technical-debt.md`, `infrastructure.md`, `testing.md`, `security.md` - drivers, CI, test gaps (via plan-context)
- Verified directly in source: `src/webui/CMakeLists.txt`, `src/webui/www_source/CMakeLists.txt`, `src/webui/www_source/.gitignore`, `CMakeLists.txt:22-86`, `cmake/Components.cmake:95-160`, `Makefile:20-35`, `README.md:30`, `.github/workflows/ci.yml:150-212`, `tests/test-components.py:117`, `git log -- www`, `git ls-files www`
- Verified in sibling repo: `buildroot-external/package/openccu-base/openccu-base.mk`, `rootfs-patches/stage_validation_rootfs.sh`

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

