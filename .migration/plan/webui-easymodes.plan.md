# Migration Plan: Migrate webui-easymodes (EasyMode profile engine)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: ui-modernization (data extraction + component re-platform, strangler)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | webui-easymodes | primary | index.json | `src/webui/www/config/easymodes`: 2,561 files (1,083 tcl ~311k lines, 1,441 txt, 37 js) of link/MASTER profile definitions |
| 2 | webui-config-pages | dependency | index.json | Hosts the callers (`ic_setprofiles.cgi`, `ic_ifacecmd.cgi`, `ic_deviceparameters.cgi`, `ic_neweasymode.cgi`) and the engine `config/ic_common.tcl`; the engine procs are NOT in the easymodes directory |
| 3 | webui-shell-build | dependency | index.json | Bundles `easymodes/js/ic_functions.js` and `ic_translate.js` into the webui JS bundle (`www_source/jsfiles.txt:211-212`); owns the shell the new components mount into |
| 4 | webui-api | affected | index.json | Candidate home for the new JSON endpoints (profile list, current match, save); JSON-RPC `homematic.cgi` has no profile methods today |
| 5 | www | affected | index.json | Drifted committed copy of `src/webui/www`; must not become a second source of truth for generated profile JSON |

---

## Context

### Summary

EasyMode is the "profile" UI of the legacy CCU WebUI. For a (sender channel, receiver channel) direct link, or for a single channel's MASTER paramset, the user selects a named preset (for example "Switch - on/off"). Each preset is a set of paramset values (`LONG_JT_ON=3`, `SHORT_ON_TIME=...`) plus a few widgets (delay and time combo boxes, thresholds). Every profile file is server-side Tcl that is simultaneously data (89,279 `set PROFILE_n(...)` lines), view (57,669 `append HTML_PARAMS(...)` lines, 3,497 hand-written hidden `<textarea>` wrappers) and logic (matching, visibility, whitelist/blacklist). Profile text uses `${key}` placeholders translated in the browser by synchronous Ajax plus `eval`. The OpenCCU-Base repo is part of the OpenCCU WebUI renovation ("nextGen UI", branch `feature/nextgen-ui`, Bootstrap 5 already added).

### Migration Drivers

- The directory is the largest single block of the legacy UI (2,561 of 9,793 files; about 311k Tcl lines of a 659k Tcl total) and cannot be restyled or componentised without a decoupling step: HTML is generated in Tcl strings.
- Duplication: 390 of 1,083 `.tcl` files (126 groups) and 611 of 1,441 `.txt` files (217 groups; `GENERIC.txt` 128 times) are byte-identical copies (technical-debt.md).
- Performance and UX: four synchronous XHRs plus `eval` per profile page; dozens of large Tcl files sourced per request.
- Maintainability and safety: shared global state (`PROFILES_MAP`, `HTML_PARAMS`, `PROFILE_n`, `PROFILE_TMP`), same-named procs redefined by source order (`option` in 7 files, `getMaintenance` in 3), id-string coupling (`separate_<id>_<prn>_<pref>`), mixed ISO-8859-1 encodings.
- No tests exist for UI, API or Tcl (testing.md); any change today is unverifiable. Creating a golden-file harness is itself a deliverable.
- Business knowledge (bare `JT_*` and `ACTION_TYPE` enums) exists only as magic numbers; extracted data is an opportunity to document it.

### Current State

Tcl CGI on the closed-source `ReGaHss`/lighttpd-era web stack, running on the CCU (embedded Linux, Buildroot packaging in the sibling repo). Request flow: `ic_setprofiles.cgi` fetches sender/receiver descriptions over XML-RPC (rfd 2001 / hs485d 2000 / HmIP), resolves the profile file (`getExistingParamId`, `ic_common.tcl:1907-1927`; fallback `linkHmIP_<TYPE>`), sources it with the user-profile file, calls `set_htmlParams`, runs `get_cur_profile2` to match the current paramset (`ic_common.tcl:834-870`), concatenates `HTML_PARAMS` and sends an HTML fragment loaded by the SPA shell. Saving goes through `ic_ifacecmd.cgi:637-690` (`cmd_set_profile` -> `base_put_profile` -> `modify_easymode_ui` -> `set_profiles` -> XML-RPC `putParamset`, plus `UI_HINT` write-back). User profiles are Tcl files under `$USERPROFILESPATH`, written by `ic_neweasymode.cgi` and sourced with `catch {source ...}`.

### Cross-Cutting Findings

- Tech debt: easymodes 2,561 files with 390 duplicate tcl and 611 duplicate txt; `www/` is a drifted copy of `src/webui/www` (52+49 files differ, dangling absolute symlinks), so generated artefacts must be built only from `src/webui/www`.
- Testing: only `tests/test-components.py`, a devicetype-strip test and a LED controller test exist; no Tcl/UI/API tests. `tclsh` is available on build hosts, so a Tcl-based characterisation harness is feasible.
- API: JSON-RPC `/api/homematic.cgi` (180 methods; levels 0/1/2/8; HTTP 200 always; no CORS/CSRF; `errorInfo` leaked at homematic.cgi:155) has no profile endpoints. `cp_*`/`ic_*` CGIs return HTML fragments loaded by the shell. New endpoints must follow the existing session/level model and must not copy the error-leak pattern.
- Security: user-profile files are executable Tcl sourced inside the CGI interpreter (code execution surface for anyone who can write `USERPROFILESPATH`); request parameters (`new_profilepath`, `iface`, `address`) are concatenated into file names (`ic_ifacecmd.cgi:665-671`) and need traversal checks in any rewrite; config-tool mode skips privilege checks (homematic.cgi:147-148).
- External: sibling OpenCCU repo pins this repo by SHA and patches 64 rootfs files (41 on `webui.js`, structure-dependent); hard-coded `/www/config/easymodes/em_common.tcl` in `hmip/SWITCH_VIRTUAL_RECEIVER.tcl:4`. Verify no OpenCCU patch targets easymodes files before any move or delete.
- Integration contract: XML-RPC `getParamsetId`, `getParamsetDescription`, `getParamset`, `putParamset` and `UI_HINT` write-back are device-facing and must stay byte-identical.
- Docs gaps: `translate()`/`translate_map()` bodies, `special_input_id` semantics and the complete `HTML_PARAMS` key set (`before_profiles`, `after_profiles`, `active_$pnr`) were inferred; usage of the firmware-1.4 `mapping/` path (36 files, `UI_MAP`) is unverified.

---

## Migration Goal

**Replace Tcl-generated profile HTML with schema-validated JSON profile data, a small set of generic UI widgets and a JSON API, without changing the paramsets written to devices.**

Outcome: profile definitions become reviewable data (one JSON document per receiver/sender family), the UI renders profiles with generic Bootstrap 5 components in the nextGen shell, translations come from one catalogue per language, and the Tcl engine shrinks to a thin matching/saving back end behind JSON. The paramsets produced by every (receiver, sender, profile, input) combination remain provably identical to the legacy output, verified by golden files. Device-specific MASTER dialogs (`etc/hmip*.tcl`, about 15k lines) are ported one by one behind the same API.

---

## Decision

### Approach: Strangler, data-first (hybrid: extract data, keep the Tcl matching/saving engine behind a JSON API, replace the view)

Phased delivery in the order below. Each phase ships behind a switch (per-pair or per-family feature flag, legacy HTML path remains the default until a family is signed off) so the old and the new pages coexist in the shell.

| Phase | Content | Exit gate |
|-------|---------|-----------|
| 0. Characterisation harness | Build a `tclsh` harness with stubbed XML-RPC/CGI environment (`DOCUMENT_ROOT`, cwd, `env`, `xmlrpc`, `tclrpc`) that sources each profile file, calls `set_htmlParams`, `get_cur_profile2`, `modify_easymode_ui`, `base_put_profile`, and records (a) the `putParamset` payload, (b) the matched profile number, (c) normalised HTML. Pin existing behaviour as golden files. Add a one-off usage analysis of `mapping/*_map.tcl` and `UI_MAP`. | Harness runs over all ~790 receiver-dir files, 142 `hmip/` files and ~117 top-level files in CI (Linux x86_64); non-deterministic output understood and normalised. |
| 1. Profile data extraction | Source each file under a stub interpreter; dump `PROFILES_MAP`, `PROFILE_n(*)` (including `UI_DESCRIPTION/TEMPLATE/HINT/MAP/VIRTUAL/WHITELIST/BLACKLIST` and `{default range lo - hi}` values) to JSON. Recover widget lists by running `set_htmlParams` with recording stubs for `get_ComboBox*`, `EnterTime_h_m_s`, `option`, `subset2combobox`. Deduplicate (126 identical groups, near-identical families). Validate with a JSON Schema. Generated JSON committed under a new `src/webui/www/config/easymodes-data/` (or equivalent) and produced only from `src/webui/www`. | JSON round-trips: regenerated `PROFILE_n` arrays from JSON equal the sourced ones for every file (exact key/value diff); schema validates all documents. |
| 2. One i18n catalogue | Merge 720 de + 720 en txt fragments and the `langJSON` blocks in `MASTER_LANG/*.js` into one real JSON catalogue per language, keys namespaced by profile family (`description_n` per receiver/sender). Load once with the shell's i18n mechanism; drop `getLangInfo` sync XHR + `eval`. Compatibility shim keeps legacy `${key}` pages working until Phase 4. | Key-set parity (every `${key}` used by a rendered page resolves to the same string as the legacy `localized` table, per page, for de and en). |
| 3. JSON API | Endpoints (new CGI or additional JSON-RPC methods, session level USER/ADMIN as today): list profiles for a pair (matched profile, labels, widgets, white/blacklist applied), read current paramset + match, write profile (`modify_easymode_ui` semantics, SUBSETs, `UI_HINT` write-back), user-profile CRUD. Tcl matching (`get_cur_profile2`) and `set_profiles` stay in Tcl initially, fed by the extracted JSON; rewriting them is optional later. Strict input validation of `iface/address/new_profilepath`; no error-detail leakage; request-scoped state (no global arrays). | API responses equal the Phase 0 goldens (paramset payload and match result) for all pairs; negative tests for path traversal and privilege levels. |
| 4. Generic widgets + new view | Bootstrap 5 components in the nextGen shell: profile selector, delay/duration/value inputs (time h/m/s, combo with free-value escape), unit/min/max from schema (replaces `uiElements.tcl` `getUnit/getMinValue/getMaxValue`), description panel. Roll out family by family, simplest first: classic `SWITCH`, `DIMMER`, `BLIND`, `JALOUSIE`, `SIGNAL_*`, then HmIP `*_VIRTUAL_RECEIVER`, then the long tail. Device-specific panels (`hmipChannelConfigDialogs.tcl` 8,311 lines/61 procs, WGD, weather, universal light, climate, DST, alarm panel, weekly programs) are ported individually, each with its own golden test; those not ported stay on the legacy path via the shell. | Per family: golden equivalence green, accessibility/visual review, no console errors, users can still set expert profile 0. |
| 5. User-profile migration | One-time and on-read import of `$USERPROFILESPATH/*.tcl` (n.m profiles) by sourcing under the stub interpreter into JSON user-profile storage (sandboxed; never source user files in the new request path). Keep reading legacy files read-only for one release; export/backup compatibility check (user profiles are part of the CCU backup). | Imported user profiles produce identical paramsets and appear in the same selector position; failures degrade to "expert profile" with a notice, never to data loss. |
| 6. Retirement | Delete converted families, `mapping/` (if dead per Phase 0 analysis), duplicate txt/tcl, `ic_translate.js` sync loader, `recycle_easymodes`/`replace_ids`. Removal is per family after one release with the flag defaulted on. | OpenCCU downstream patch check passes; size/LOC reduction measured against baseline. |

**Rationale**: Migration is warranted by (1) the 311k-line, 2,561-file duplicate-heavy profile tree that blocks any nextGen UI work, (2) zero existing tests, (3) per-request sync XHR + `eval` i18n, and (4) executable user profiles as a security surface (technical-debt.md; security.md). A data-first strangler is chosen because the vast majority of volume (89,279 `PROFILE_n` lines, ~36 keys per profile) is pure data that can be extracted mechanically by sourcing under a stub interpreter (no Tcl parser needed), the Tcl engine can keep running unchanged behind JSON during rollout, and the device-facing contract (paramsets) can be verified automatically with golden files. It fits the working hypothesis of a strangler approach through the existing shell. Evaluation of the doc section 11 proposal: its building blocks (JSON schema, generic widgets, JSON API, one catalogue, user-profile migration, golden tests) are all kept, but resequenced: tests first, API before widgets, engine rewrite deferred, device-specific dialogs treated as a separate long tail.

### Rejected Options

- **Big-bang rewrite of schema, engine and UI (literal section 11 in one step)**: highest risk; ~790+142+117 profile files, 7 `option` variants and 61 HmIP dialog procs cannot be verified at once; no tests to catch regressions; would block the nextGen UI release.
- **Hand-translate profiles to JSON/TypeScript**: error-prone for 89k data lines and 5,009 `get_ComboBox` calls; mechanical extraction plus golden diff is cheaper and verifiable.
- **Retain as is and only reskin (CSS over generated HTML)**: cheapest, but the HTML is embedded in Tcl strings and hidden textareas with id-coupled JS; Bootstrap 5 restyling is only partially possible and none of the debt (duplication, sync XHR, global state, executable user profiles) is addressed. Acceptable as a fallback for the long-tail dialogs that are never ported.
- **Parse Tcl statically (own parser)**: Tcl's dynamic evaluation (`upvar`, `append`, same-named procs, source order) makes a static parser unreliable; executing under a stub interpreter is simpler and faithful.
- **Replace the matching/saving engine in another language immediately**: engine semantics (`{default range}` values, `UI_VIRTUAL`, `UI_MAP`, SUBSETs, `modify_easymode_ui`) are undocumented; keep Tcl behind the API until goldens pin the behaviour.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | Tcl (CGI profile files and helpers, ~311k lines), JavaScript (Prototype/jQuery era, 37 files, ~13k lines), HTML in Tcl strings, JSON-fragment `.txt` | Generated JSON data + JSON Schema, ES modules (vanilla JS/Web Components or the nextGen shell's framework), thin Tcl JSON endpoints, `tclsh` test tooling |
| Frameworks | Prototype `Ajax.Request`, jQuery `extend`, hand-built widgets (`get_ComboBox`, `EnterTime_h_m_s`) | Bootstrap 5 (already added to the repo) + generic widget components; existing shell i18n mechanism |
| Infrastructure | Embedded CCU (lighttpd/ReGaHss web stack, Tcl CGI, XML-RPC to rfd/hs485d), CMake/Make build, GitHub Actions CI; consumed by Buildroot packaging in sibling OpenCCU repo | Unchanged; add a CI job for the Tcl golden harness and JSON validation; generated JSON built in the repo build (`webui-shell-build`) |

---

## Scope

**Mode**: targeted

### Included Components

- `src/webui/www/config/easymodes/**` (receiver-type dirs, `hmip/`, `etc/`, `js/`, `MASTER_LANG/`, top-level `*_ch_link/_ch_master/_dev_master/linkHmIP_*.tcl`, `localization/`, `mapping/`)
- Engine procs in `src/webui/www/config/ic_common.tcl` that the profiles call (`get_cur_profile2`, `cmd_link_paramset2`, `get_ComboBox*`, `subset2combobox`, `modify_easymode_ui`, `base_put_profile`, `getExistingParamId`, `recycle_easymodes`) - behaviour is in scope, location is in `webui-config-pages`
- Callers' profile-related code paths: `ic_setprofiles.cgi`, `ic_ifacecmd.cgi` (`cmd_set_profile`), `ic_deviceparameters.cgi` (profile loading), `ic_neweasymode.cgi`
- `www_source/config/js/ic_setprofiles.js`, `css/ic_setprofiles.css`, `www_source/jsfiles.txt` entries for `ic_functions.js`/`ic_translate.js`

### Excluded Components

- Device firmware, rfd/hs485d/multimacd daemons and XML-RPC protocol definitions
- Unrelated config pages and the SPA shell itself (owned by `webui-config-pages`, `webui-shell-build`)
- `www/` committed copy (follow-up: resolve drift/symlinks separately; do not edit)
- ReGa script pages and JSON-RPC methods unrelated to profiles
- Sibling OpenCCU repo (consulted for patch conflicts only)

### Critical Components

- Matching algorithm `get_cur_profile2` (`ic_common.tcl:834-870`) and `modify_easymode_ui` (`:580-643`): implicit, must be reproduced exactly
- `UI_HINT` write-back (`ic_ifacecmd.cgi:630-635`)
- HmIP-specific `etc/hmip_helper.tcl` (3,247), `hmipChannelConfigDialogs.tcl` (8,311), `uiElements.tcl` (1,975)
- Large profile families: `UNIVERSAL_LIGHT_RECEIVER_LSC/profiles*.tcl` (2,212/2,569), `UNIVERSAL_LIGHT_RECEIVER_RGBW_DALI/profiles.tcl` (2,566), `MULTI_MODE_INPUT_TRANSMITTER_3.tcl` (2,122)
- User-profile storage under `USERPROFILESPATH`

### Boundaries

- The device-facing contract (paramset names/values written, XML-RPC call sequence, `UI_HINT`) is frozen.
- New code never executes user-supplied Tcl in the request path.
- Generated data is built from `src/webui/www` only.
- Legacy and new pages may coexist per family; no flag-day.

---

## Dependencies

### Internal

- `webui-config-pages`: callers and `ic_common.tcl` engine (bidirectional, via globals and cwd/`DOCUMENT_ROOT` assumptions)
- `webui-shell-build`: JS bundle list (`jsfiles.txt`), asset pipeline, Bootstrap 5 assets, i18n mechanism and the page mount points
- `webui-api`: location and conventions for new JSON endpoints, session levels, error handling
- `tests` / CI: new Tcl harness and JSON validation jobs
- Tcl extensions `tclrpc.so`/`tclrega.so` (stub or run natively in the harness)

### External

- rfd/hs485d/HmIP XML-RPC (`getParamsetId`, `getParamsetDescription`, `getParamset`, `putParamset`) - device paramset descriptions define the meaning of `JT_*`/`ACTION_TYPE` enums
- Closed-source `bin/ReGaHss` hosting the web stack (cannot be changed)
- Sibling OpenCCU repo (Buildroot rootfs patches, SHA pin; check that none touch easymodes; `webui.js` patches depend on bundle structure)
- Browser baseline of the nextGen UI (ES modules, fetch)

---

## Constraints

### Unchanged

- Values written to the device for every (receiver, sender, profile, inputs) combination
- Profile numbering and `UI_HINT` semantics (profile 0 = expert; `n.m` user profiles)
- Profile file naming that devices reference through paramset ids until the data has been regenerated with the same ids
- Existing user profiles must keep working (and be included in backups)
- JSON-RPC authentication levels (NONE/GUEST/USER/ADMIN = 0/1/2/8) and session-id model
- Bilingual UI (de, en) with identical texts, including HTML entities and `<span class="translated">`

### Integration Systems

- XML-RPC hs485d (2000), rfd (2001), HmIP services
- JSON-RPC `/api/homematic.cgi`
- SPA shell / `ic_*` CGI fragment loading
- Buildroot packaging in sibling OpenCCU repo; CI GitHub Actions
- CCU backup/restore of user data

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | Behavioural regression writes wrong paramset values to devices (silent misconfiguration of actuators, locks, heating) | Golden equivalence of `putParamset` payloads for every pair and profile; legacy path remains default until sign-off; feature flag per family | easymodes.md sec. 4.2, 11.6; testing.md (no tests) |
| high | Hidden/implicit engine semantics (`get_cur_profile2` range matching, `UI_VIRTUAL`, `UI_MAP`, `modify_easymode_ui` SUBSET merge) are reimplemented differently | Keep Tcl engine behind the API in phases 1-4; characterise via mutation corpus (each profile's own values, perturbations, ranges); compare match results | easymodes.md sec. 10; ic_common.tcl:580-643, 834-870 |
| high | Stub-interpreter extraction misses behaviour: profile files rely on globals, cwd, `env(DOCUMENT_ROOT)`, hard-coded `/www/config/easymodes/em_common.tcl`, source order of redefined procs (`option`, `getMaintenance`) | Run extraction in an emulated docroot; per-family variant of the stub that mirrors the production source order; fail the build on any unrecognised proc call; JSON round-trip diff | easymodes.md sec. 8, 10; hmip/SWITCH_VIRTUAL_RECEIVER.tcl:4 |
| high | Device-specific dialogs (about 15k lines in `etc/hmip*.tcl`, 61 procs, ~10k lines of client JS) do not fit generic widgets and are effort-heavy | Treat as a separate long tail with per-device ports; leave on legacy path via shell until ported; track coverage percentage | easymodes.md sec. 6, 9 |
| high | User-profile Tcl files are executable code (security) and have an unknown number of variations in the field; migration may lose or change user data | Sandboxed import under stub interpreter; dry-run report; keep originals untouched; fall back to expert mode; include in backup check | easymodes.md sec. 10; security.md |
| medium | Request-parameter-to-path concatenation (`new_profilepath`, `address`) enabling traversal in the new API if copied | Whitelist-based resolver against the generated index; never build file paths from input; add negative tests | ic_ifacecmd.cgi:665-671; security.md |
| medium | Translation drift while merging 720+720 txt fragments and `langJSON` blocks (key collisions across receivers; mixed ISO-8859-1/entities) | Merge by key with collision report; encoding normalisation to UTF-8 only in the generated catalogue; per-page key parity check | easymodes.md sec. 7, 8 |
| medium | Downstream OpenCCU patches/packaging break on moved or generated files (SHA pin, 41 patches on `webui.js`) | Pre-check patches against easymodes paths; add new files rather than moving old ones until the final retirement phase; coordinate with the sibling repo | plan-context.md external constraint |
| medium | `www/` drift: generated JSON or removed files diverge between `www` and `src/webui/www` | Declare `src/webui/www` the sole source; CI check that `www/` is not edited by this work | technical-debt.md |
| low | `mapping/` (36 files, firmware 1.4) removed while still needed | Usage analysis in Phase 0 and telemetry-free check against the device-description corpus before deletion | easymodes.md sec. 10 |

---

## Success Criteria

- For every enumerated (receiver type, sender type, profile number, representative input set) the paramset sent via `putParamset` by the new path is identical to the legacy path (0 differences in golden diff), including `UI_HINT`.
- For every profile, feeding its own values into the matching logic returns that profile (and the mutation corpus gives the same result in legacy and new engine).
- 100% of the `set PROFILE_n(...)` data (89,279 lines) round-trips through the JSON extraction without loss; schema validation passes for all documents.
- All `${key}` placeholders used by migrated pages resolve identically in de and en; no synchronous XHR or `eval` remains on migrated pages.
- Duplicate byte-identical profile/text files (390 tcl, 611 txt) are eliminated for migrated families.
- User profiles from a sample corpus import with identical resulting paramsets; no user profile is lost.
- New endpoints enforce current session levels, validate inputs and do not leak `errorInfo`; negative tests pass.
- Golden harness runs in CI (a first automated Tcl/UI test in the repo) and gates every phase.
- Rollout per family is reversible via a flag; legacy pages remain functional until retirement.
- Page load time for profile pages not worse than legacy (target: fewer requests, no sync XHR).

---

## Focus Areas

1. Phase 0 characterisation harness and golden files (blocking everything else)
2. Matching and save semantics (`get_cur_profile2`, `modify_easymode_ui`, `UI_HINT`)
3. Stub-interpreter extraction and JSON schema design (incl. recording of widget lists, `{default range}` values)
4. User-profile safety and migration (executable Tcl, backup compatibility)
5. i18n catalogue merge and `${key}` parity
6. JSON API with input validation and session levels
7. Generic widget set, then family-by-family rollout; device-specific HmIP dialogs as the long tail
8. Downstream (OpenCCU) patch compatibility and `www/` drift

---

## Consequences

### Positive Outcomes

- Profile definitions become reviewable, validated data; large reduction in files and lines via deduplication.
- First automated tests for the WebUI configuration path.
- Removes sync XHR + `eval`, hidden-textarea HTML and id-string coupling; enables the nextGen UI (Bootstrap 5) on the most complex screens.
- Removes the executable-user-profile surface from the request path.
- Documents the enum semantics (`JT_*`, `ACTION_TYPE`) as schema annotations.

### Negative Outcomes

- Large effort; dual maintenance (legacy + new) during rollout; the long tail of device-specific dialogs may remain on the legacy path for a long time.
- Build must now produce and ship generated JSON; contributors must know the extraction pipeline.
- Tcl engine remains (behind JSON) until a later decision; stub-interpreter harness is itself new code to maintain.
- Behaviour-preserving constraint intentionally carries over legacy quirks.

### Follow-Up Decisions

- Final home of matching/saving logic: keep in Tcl behind JSON, or reimplement in the client/another runtime after goldens exist.
- Schema ownership and whether profile JSON is hand-maintained after cut-over or stays generated from Tcl until retirement.
- JSON API placement: new CGI vs JSON-RPC methods in `homematic.cgi` (coordinate with `webui-api`).
- Policy for the firmware-1.4 `mapping/` path (delete vs retain) after usage analysis.
- Timing of retiring legacy families and the compatibility window for user-profile Tcl files.
- Whether to propose the shared `tests`/CI infrastructure to the sibling OpenCCU repo.

---

## Source Documents

- `.migration/plan-context.md` - shared engagement goal, stack, security, testing, tech debt, external constraint
- `.migration/docs/modules/webui-easymodes.md` - module documentation (inventory, loading contract, anatomy, i18n, duplication, section 11 replacement proposal)
- `.migration/docs/index.json` - feature and module list
- `.migration/docs/cross-cutting/technical-debt.md`, `security.md`, `testing.md`, `api-contracts.md`, `integration-seams.md` - cross-cutting context (as summarised in plan-context.md)
- `/home/standard/.claude/local-marketplace/one-modernizer/skills/plan-migration/references/plan-adr-template.md`, `adr-workflow.md` - plan structure and field strategy

---

## Approvals

- **Approved by**: pending (autonomous assessment, not yet reviewed)
- **Approved at**: n/a
- **Review iterations**: 0

---

