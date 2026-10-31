# Migration Plan: Migrate webui-rega-pages

**Status**: assessed | **Date**: 2026-10-09 | **Type**: ui-modernization (strangler-style framework replacement of a server-rendered UI)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | webui-rega-pages | primary | index.json | ReGa-served pages (`src/webui/rega`, 188 files, about 47k lines) and `src/webui/www/ise` static assets (260 files). Pages run inside the closed-source ReGaHss. |
| 2 | webui-shell-build | dependency | index.json | `www_source` JS, `webui.js`, `style.cgi`. It is the browser-side half of every page here: page objects, `ReGa.encode`, `WebUI.enter`, widget classes, the `CLASS0nnnn` styles. |
| 3 | webui-api | dependency | index.json | JSON-RPC `/api/homematic.cgi` (180 methods). It is the intended replacement transport for the `/esp/*.htm` actions. It has no endpoints for program or room editing. |
| 4 | webui-config-pages | affected | index.json | `cp_*`/`ic_*` CGIs return HTML fragments that the same SPA shell loads next to the ReGa fragments. |
| 5 | www | affected | index.json | Drifted committed copy of `src/webui/www`. `www/ise` is part of that drift. |
| 6 | bin-feature (ReGaHss) | affected | index.json | Closed-source script engine and web server that executes these pages. It cannot be changed. |

---

## Context

### Summary

OpenCCU-Base is the Tcl/JS/C++ monorepo of the Homematic CCU3 userland. `webui-rega-pages` is the part of the web UI that the ReGa logic engine renders server-side.

- **Pages.** `.htm` and `.fn` files with `<% ... %>` Homematic Script blocks interleaved with HTML and JS.
- **Routing.** Login and entry (`index.htm`, `login.htm`, `logout.htm`, `pages/index.htm`), 38 tab fragments in `pages/tabs/**`, and 41 modal dialogs in `pages/msg/*.htm`.
- **Action endpoints.** Nine dispatcher files in `esp/*.htm` (`devices`, `rooms`, `functions`, `system`, `side`, `sico`, `channels`, `favorites`, `programs`, plus `datapointconfigurator`) on top of `.fn` libraries. 55 per-channel-type widget generators live in `esp/controls/*.fn`.
- **xml-api.** Seven files under `xml-api/` plus two under `xml/`. They are a public XML API for add-ons. No consumer exists in the repo.
- **Assets.** `www/ise` is a static tree of 260 files (227 png, 17 gif, 9 jpg) with device and display icon sets.
- **Page shell.** `pages/index.htm` is a single-page shell that hands over to `/webui/webui.js` (`WebUI.start()`), so all further navigation is client-side.
- **Data flow.** Server values reach JS through string concatenation inside `<% %>` blocks. Responses are bare strings, HTML or `<script>` snippets. There is no JSON layer.
- **Unresolved references.** `statusviews/channelLoader.htm` and `channelBody.htm` are referenced by `www_source/ise/js/channelLoader.js:49` and `iseChannelLoader.js:22`, but they do not exist in this module (`webui-rega-pages.md` section 3.2).

### Migration Drivers

- **Layout.** The layout is table-based with a fixed 1024px viewport (`pages/index.htm:7`), JS-computed heights (`recalcDivs`), and about 200 generated `CLASS0nnnn` style classes. It cannot be made responsive without replacing the markup.
- **Duplicate libraries.** Prototype, jQuery, knockout, jQuery UI and scriptaculous coexist. The Bootstrap 5 bundle and `hmBootstrap.css` were added recently (commits b9ce345d, 94bb4ab3, 7d8dbddf) but the fragment markup still uses the legacy table idiom.
- **Mixed concerns.** Presentation, data and business logic are intermixed in single files. Examples are the device visibility filter in `control/devices.htm:81-87` and alarm collection in `esp/system.fn:293+`. This blocks any visual-only reskin.
- **Injection risk.** There is no output encoding when server data goes into JS strings (`login.htm:110`, `control/devices.htm:95-112`). A device name containing quotes can break the page or inject script.
- **Authorization.** Many `esp/*.fn` actions do not appear to check privileges and rely on the UI hiding controls (`webui-rega-pages.md` section 6, spot-checked only). The JSON-RPC level model is the more reviewable alternative.
- **Encoding.** Files are mixed ISO-8859-1 and UTF-8, and `Content-Type` is `iso-8859-1`. German umlauts appear as raw 8-bit bytes.
- **No tests.** The repo has no UI, API or Tcl tests (testing finding).
- **Repository hygiene.** The `www/` tree is a drifted committed copy of `src/webui/www`, and `www/ise` carries dead assets (`functions.j_`, `anim_bargraph.gi`, `Thumbs.db`, `_`-prefixed backups).

### Current State

The pages are Homematic Script templates evaluated at request time by the prebuilt `bin/ReGaHss`. It is closed source, so the interpreter semantics and any server-side extension points are fixed.

- **Packaging.** CMake copies `rega/www/` to `${ROOTFS}/www/rega` and `www/ise` verbatim to `/ise/` (`src/webui/CMakeLists.txt:6-9`). The packaging repo (`/home/standard/dev/OpenCCU`) pins this repo by SHA.
- **Session model.** ReGa performs authentication (`system.LoginPage("/login.htm")`). The session id travels as `?sid=` on every request URL. User level is reconstructed from `system.GetSessionVarStr(sessionId)`. Tab and sort state live in ReGa session variables (`sessionTAB`, `sessionTAB1`, `sessionLS`, `sessionUiDataId` and others).
- **Live updates.** `UpdateUI` polling, via `iseRefresher` posting a ReGa-source body, is the only live-update channel.
- **Sibling pages.** The `cp_*`/`ic_*` CGIs in `www/config` (outside this module) return HTML fragments that the same SPA shell loads.

### Cross-Cutting Findings

- **Closed engine.** The `bin/ReGaHss` binary is closed source (ReGa script engine plus web server). Replacing the pages needs equivalent JSON-RPC or ReGa-script endpoints. The old server-side object model cannot be extended.
- **API gaps.** The JSON-RPC API has 180 methods but no endpoints for program or room editing, and `Event.poll` only supports init and delete (integration findings). The program editor (`programs.fn`, `side.fn`, `sico.fn`, `rule.inc`) and the room and function editors therefore have no JSON equivalent today.
- **API security.** JSON-RPC returns HTTP 200 always, has no CORS or CSRF protection, carries the sid in the JSON body, and leaks `errorInfo` at `homematic.cgi:155`. Config-tool mode skips privilege checks (`homematic.cgi:147-148`). A new UI built on this API inherits these weaknesses unless they are fixed.
- **Default credentials.** Default admin credentials with a plaintext compare exist in `www/tcl/eq3_old/user.tcl:8-9`. User management in the ReGa dialogs (`msg/userAccountConfigAdmin.htm`, `esp/system.fn` `saveUser`/`saveUserPwd`) sits on the same trust model.
- **External patches.** The sibling Buildroot repo carries 64 rootfs patches, 41 of them on `webui.js`, which depend on the exact `webui.js` structure. They also depend on CRLF in `www/tcl/eq3/rega.tcl`. The overlay `WebUI-openccu` adds branding into `www/ise/img` and a CodeMirror 6 editor. Any rename or restructure of `www/ise/img` breaks that overlay.
- **Ports.** The port contract (ReGa 8183 and 1998) is hand-synchronised across OCI, HA and Helm.
- **Tests.** `tests/test-components.py` only checks the CMake install closure on x86_64 CI. No UI, API or Tcl tests exist. This module has none.
- **Drift.** `www/` is a drifted copy of `src/webui/www` (52+49 files differ, dangling absolute symlinks). The source of truth for `www/ise` must be confirmed before any asset move.

---

## Migration Goal

**Replace the ReGa-rendered UI pages with a responsive, data-driven front end, one section at a time, without breaking login, the `xml-api` contract or the packaging overlay.**

The target UI is a Bootstrap 5 shell. It renders from structured JSON instead of ReGa-emitted HTML and JS, and it reaches the ReGa object model only through JSON-RPC or thin ReGa-script-backed JSON endpoints.

Outcomes:
- **Session and routing.** One session and one routing model replace the `?sid=` URL plus ReGa session-variable state.
- **No generated styles.** The `CLASS0nnnn` classes and the ReGa-to-JS string concatenation are gone.
- **Library consolidation.** One JS library stack replaces the duplicates.
- **Asset consolidation.** The `www/ise` assets are pruned and have a single source of truth.
- **Compatibility.** The legacy pages keep working for every section not yet migrated, and the public `xml-api` is untouched.

---

## Decision

### Approach: Strangler pattern (section-by-section replacement behind the existing shell)

Keep ReGaHss, `login.htm`/`index.htm` and the `xml-api` as they are. Add a new Bootstrap 5 front end that is mounted from the existing shell (`pages/index.htm` and `WebUI.enter`), and move sections from the legacy fragments to it one at a time, backed by JSON endpoints.

Phasing (working hypothesis, not yet decided):

1. **Phase 0 – Safety net and inventory.**
   - Write characterization tests for the `esp/*` action protocol and the `xml-api` outputs against a running ReGa.
   - Resolve the missing `channelLoader.htm` and `channelBody.htm`.
   - Pick the single source of truth for `www/ise` and prune dead assets.
   - Pin the encoding policy.
2. **Phase 1 – Data layer.** Add JSON endpoints (ReGa-script-backed, exposed through JSON-RPC or a Tcl CGI via `tclrega.so`). They must apply server-side authorization and output encoding. Cover first the read paths used by the start page, devices, rooms, functions, system variables and favorites.
3. **Phase 2 – Read-mostly sections.**
   - Replace start page, status and control hub, device, room and function lists, system protocol, and alarm and service messages with new components.
   - Replace `UpdateUI` polling with a JSON poll.
4. **Phase 3 – Simple editors.** Replace rooms, functions, favorites, system variables and user administration. Replace the generic `msg/*.htm` dialogs with a shared modal component.
5. **Phase 4 – Device-specific widgets.** Replace the 55 `esp/controls/*.fn` generators and about 25 device parameter dialogs through a per-`HssType` parity matrix, driven by the device description rather than hard-coded markup.
6. **Phase 5 – Program and rule editor, device inbox.**
   - This covers `programs.fn`, `side.fn`, `sico.fn`, `rule.inc`, `newdevices.htm` (2,773 lines) and the time module.
   - It is the highest-risk phase and is deferred until the JSON API has program and room editing endpoints.
7. **Phase 6 – Retire legacy.** Remove migrated fragments once nothing references them, and keep the entry and login contract.

**Rationale**: Migration is necessary and incremental replacement is the safest route, for these reasons.
1. The engine is closed. `bin/ReGaHss` cannot be changed, so the page-execution model is fixed and a big-bang rewrite would have to rebuild all server-side behaviour at once (`webui-rega-pages.md` section 10 item 5).
2. The editors are large, stateful and untested. The program editor chain has the largest stateful server-driven UI and no test coverage, so each section needs a parity check before its legacy page is removed.
3. The sibling Buildroot repo's 64 patches (41 on `webui.js`) and the `www/ise/img` overlay constrain structural change.
4. The API cannot yet cover everything. JSON-RPC lacks program and room editing endpoints.
5. The Bootstrap 5 foundation is already committed on this branch (`feature/nextgen-ui`), which fits an incremental mount.

### Rejected Options

- **Reskin only (CSS and template layer over the existing ReGa output)**: It keeps the table markup, the generated `CLASS0nnnn` coupling, the 1024px assumptions and the unencoded string concatenation. It would also have to preserve every DOM id contract used by `www_source`. It is acceptable only as a short-term fallback for sections that stay on legacy pages.
- **Big-bang rewrite of all pages and replacement of ReGa-served pages**: This needs full JSON equivalents for all 9 `esp` modules and the program-editor chain, which the API does not offer. It leaves no working UI while in progress, and has no tests to verify parity.
- **Replace the ReGa script engine or web server**: ReGaHss is closed-source and holds the object model and the user and session handling. Out of scope.
- **Convert `esp/*` to JSON in place and keep the legacy front end**: This double-works every consumer in `www_source`, and the front-end pages are replaced anyway. Use only for endpoints that the strangler phases need.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | Homematic Script (ReGa, `<% %>` blocks), HTML, JavaScript (Prototype style), Tcl (CGIs and helper scripts) | Modern JavaScript (ES modules) in the browser. Thin ReGa-script and Tcl endpoints that return JSON. HM Script is retained only for data access in these endpoints. |
| Frameworks | Prototype, scriptaculous, jQuery, jQuery UI, knockout, jqPlot, wz_jsgraphics, Bootstrap 5 (added, unused by fragments) | Bootstrap 5 plus one view layer (to be chosen in the architect phase). Remove Prototype, scriptaculous and `jsGraphics` drawing. |
| Infrastructure | CMake install into the ROOTFS, closed `bin/ReGaHss` web server (ports 8183 and 1998), Buildroot packaging with SHA pin, GitHub Actions CI | Unchanged. Add UI and API characterization tests to CI. |

---

## Scope

**Mode**: targeted

### Included Components

- `src/webui/rega/www/` (esp, pages, xml-api, xml, top-level `.htm` files)
- `src/webui/rega/bin/` (`hm_startup`, `hm_autoconf`, `hm_deldev`). These are non-UI and only checked for coupling.
- `src/webui/www/ise/` (static assets, `checkrega.cgi`, `htm/header.htm`)

### Excluded Components

- `src/webui/www_source/**` (webui-shell-build). It is the paired half of the migration and is planned in its own feature, but every change here must be coordinated with it.
- `src/webui/www/config`, `cp_*`/`ic_*` CGIs (webui-config-pages)
- `src/webui/www/api` JSON-RPC (webui-api). It is the target transport, and API gaps are handled there.
- `src/webui/www/easymodes` (webui-easymodes)
- Native daemons and `bin/ReGaHss`

### Critical Components

- `pages/index.htm` (shell, session globals `getUPL`/`getSessionId`)
- `login.htm`, `index.htm` (ReGa login contract)
- `esp/system.fn` (1,616 lines, 45 functions, including `UpdateUI`)
- `esp/programs.fn` (1,359), `esp/functions.fn` (1,324), `esp/datapointconfigurator.fn` (1,935)
- `esp/side.*` and `esp/sico.*`
- `pages/tabs/admin/views/newdevices.htm` (2,773)
- `xml-api/*`
- `www/ise/img/**`, which the overlay brands

### Boundaries

- **Contract.** Page replacement stops at the HTTP contract of ReGa: `system.LoginPage`, the `?sid=` hand-off and the login form fields.
- **Engine.** The closed-source engine cannot be modified. The new back-end code is limited to ReGa scripts, Tcl CGIs and JSON-RPC.
- **Parity.** Each replaced section needs a parity checklist before its legacy fragment is deleted.

---

## Dependencies

### Internal

- **webui-shell-build.**
  - `www_source/webui/js/pages/**` loads the `pages/tabs/**` fragments.
  - It defines `ReGa.encode`, `WebUI.enter`, `updateContent` and `/webui/style.cgi`.
  - `www_source/ise/js/*` widget classes are instantiated from `esp/controls/*.fn`.
  - It owns the DOM id and class contracts.
- **webui-api (`/api/homematic.cgi`).** Target transport. It lacks program and room editing and has Event.poll limitations.
- **webui-config-pages.** The `cp_*`/`ic_*` CGIs (for example `help.cgi`) are loaded from these pages.
- **www vs `src/webui/www`.** Drifted copy. `www/ise` source of truth must be agreed.
- **Tcl extensions.** `tclrega.so` and `tclrpc.so` are used by `rega/bin/*` and `ise/checkrega.cgi`.
- **Packaging.** `CMakeLists.txt` install rules, including the EULA symlinks at `CMakeLists.txt:8-9`.

### External

- **ReGaHss.** Closed-source script engine and web server (R1.00.0388.0259 binaries). It provides the object model, sessions, `web.*` functions and `system.*` functions.
- **OpenCCU packaging repo.** `/home/standard/dev/OpenCCU` pins this repo by SHA and applies 64 rootfs patches. 41 target `webui.js`. The overlay adds `www/ise/img` branding and CodeMirror 6.
- **XML-API add-ons.** Third-party consumers of `xml-api/*.xml` (not verifiable in this repo).
- **Browser libraries.** jQuery, jQuery UI, Prototype, scriptaculous, knockout, jqPlot, spectrum, iro, wz_jsgraphics, powertip, blockUI, nfs_datepicker, Bootstrap 5.
- **Interface daemons.** hs485d (XML-RPC 2000), rfd (XML-RPC 2001) behind ReGa.

---

## Constraints

### Unchanged

- **Entry contract.** `index.htm` keeps `system.LoginPage("/login.htm")` and the `?sid=` plus `&client=` hand-off. The login form keeps the field names `tbUsernameShow`, `tbUsername` and `tbPassword` and the POST-to-self behaviour. `NoAutoLogin` and `UsersDefaultLogin(dwcPC|dwcPDA)` semantics stay.
- **User levels.** None, Guest, User and Admin (0, 1, 2, 8) and the per-channel `UserAccessRights` checks.
- **xml-api.** `devicelist.xml`, `roomlist.xml`, `functionlist.xml` and `newdevicelist.xml` keep their output format, ETag/304 caching and the Guest minimum level.
- **Device visibility.** Visibility and operability rules are preserved: `Visible()`, `ReadyConfig()`, `HssType()`, `operateGroupOnly`, and the gateway exclusions `VIR-OL-GTW` and `VIR-HUE-GTW`.
- **Per-device behaviour.** The datapoint semantics of the 55 control widgets and 41 dialogs stay, including values written into program rules.
- **Program and rule model.** The semantic content produced by the editor chain is unchanged.
- **Assets.** `/ise/img/...` absolute asset paths and `www/ise/img` branding files stay readable until the overlay is updated.
- **i18n.** The `${key}` keys and the DE, EN and TR variants (including `securityFirstStart_*`).
- **Encoding.** Output stays decodable with the served charset until the whole chain is converted to UTF-8 in one step.
- **ReGa liveness probe.** `ise/checkrega.cgi` stays.

### Integration Systems

- ReGaHss (script engine and web server, ports 8183 and 1998)
- JSON-RPC `/api/homematic.cgi`
- hs485d XML-RPC (TCP 2000) and rfd XML-RPC (TCP 2001), reached through ReGa
- `/webui/webui.js`, `/webui/style.cgi` and `/config/*.cgi` fragments
- OpenCCU Buildroot packaging, OCI, HA and Helm port contract
- Third-party XML-API clients

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | The ReGa engine is closed. Any replacement of server-rendered behaviour needs equivalent JSON-RPC or ReGa-script endpoints, and the engine's behaviour (quirks, encoding, session functions) cannot be inspected. | Build characterization tests against a running ReGa first. Wrap ReGa behaviour rather than reimplementing it. Keep legacy pages as fallback. | webui-rega-pages.md sections 2 and 10 |
| high | No automated tests exist for this module, the API or the UI. Parity of 55 widgets, 41 dialogs and the program editor cannot be proven. | Phase 0 characterization tests (HTTP-level for `esp` and `xml-api`). Per-`HssType` parity matrix. Manual checklists for editors until covered. | testing.md; webui-rega-pages.md section 10 |
| high | The JSON-RPC API has no endpoints for program or room editing, and Event.poll supports only init and delete. The editor sections cannot be moved off ReGa pages until these exist. | Defer Phase 5. Add endpoints in webui-api as ReGa-script wrappers, with server-side level checks. Track as a follow-up decision. | integration findings; webui-rega-pages.md section 4.1 |
| high | Authorization is mostly enforced by hiding controls in the UI, not in `esp/*.fn` actions (spot-checked). A new UI cannot assume server-side protection that does not exist, and the JSON-RPC API has its own gaps (no CSRF, sid in body, `errorInfo` leak at `homematic.cgi:155`, config-tool mode skips privilege checks). | Require an explicit per-endpoint level check in every new endpoint. Audit `esp` actions exhaustively before porting. Fix the `errorInfo` leak and the CSRF gap in the API. | webui-rega-pages.md section 6; security findings |
| high | The sibling Buildroot repo's 64 rootfs patches (41 on `webui.js`) and the overlay's `www/ise/img` branding depend on exact file structure and CRLF. Restructuring files or assets breaks the build of downstream images. | Agree a compatibility window with the packaging repo. Do not move or rename `www/ise/img` files or touch the `webui.js` layout until patches are ported. Update the SHA pin together with patches. | external-context/summary.md |
| medium | Mixed ISO-8859-1 and UTF-8 files and an `iso-8859-1` Content-Type. A tool or editor that rewrites files can garble umlauts. | Fix the encoding policy in Phase 0. Add a check to CI. Convert files in one controlled step with golden-output comparison. | webui-rega-pages.md sections 1 and 10 item 10 |
| medium | Missing `statusviews/channelLoader.htm` and `channelBody.htm` are referenced by JS. The status-view dispatch by `HssType` is not visible in this module. The reference may be dead or provided elsewhere. | Verify against a running system and the packaging repo in Phase 0. Remove the dead JS if unused. | webui-rega-pages.md sections 3.2 and 11 |
| medium | Hidden DOM id and class contracts shared with `www_source`, including about 200 generated `CLASS0nnnn` names and duplicated ids. The new UI and legacy fragments share one document during the migration. | Scope the new UI in its own container or namespace. Do not reuse legacy ids. Plan the retirement of the classes together with webui-shell-build. | webui-rega-pages.md section 7 |
| medium | The unencoded server-to-JS string concatenation means names with quotes can break or inject script (`login.htm:110`, `control/devices.htm:95-112`). | Make JSON endpoints the only data path for the new UI. Escape output in ReGa wrappers. Fix in legacy pages only where cheap. | webui-rega-pages.md section 7 |
| medium | The public `xml-api` has no in-repo consumer, so its use is unknown. A cleanup could break third-party add-ons. | Treat it as a frozen contract. Add golden-file tests. Do not remove it without a deprecation decision. | webui-rega-pages.md sections 4.4 and 10 item 4 |
| low | `www/ise` drift and dead assets (`functions.j_`, `anim_bargraph.gi`, `Thumbs.db`, `_`-prefixed backups). It is unclear which copy ships. | Resolve the source of truth and prune with a reference scan, taking the overlay's branding into account. | technical-debt.md; webui-rega-pages.md section 8 |

---

## Success Criteria

- All existing functionality is migrated (or deliberately retired with a decision record), with no regression in the legacy fallback pages while migration is in progress.
- The login and entry contract is unchanged: `system.LoginPage("/login.htm")`, `?sid=` hand-off, form field names, auto-login behaviour.
- The `xml-api` outputs are byte-compatible (or semantically identical) with golden files captured before the change, including ETag/304 behaviour.
- The user-level model is preserved: Guest, User and Admin see and can do the same as before, verified by an authorization test matrix. Every new endpoint enforces its level server-side.
- The new UI works at phone, tablet and desktop widths, with no fixed 1024px viewport.
- New pages consume server data only through JSON, with no ReGa-to-JS string concatenation and no generated `CLASS0nnnn` classes. Names with quotes and umlauts render correctly.
- Per-`HssType` parity matrix (55 widgets, 41 dialogs) is complete, reviewed and signed off before the corresponding legacy file is deleted.
- The program and rule editor produces rules that ReGa accepts and that behave identically (regression-tested on exported programs).
- Prototype, scriptaculous and `jsGraphics` are no longer required by migrated sections.
- CI runs the new characterization tests (HTTP-level for `esp` and `xml-api`, UI smoke tests) in addition to the install-closure test. Test coverage is at least the current baseline of none, and strictly higher for migrated sections.
- Downstream packaging (Buildroot patches and overlay) still builds against the migrated SHA, with patches ported where necessary.
- The `www/ise` asset tree has a single source of truth and contains no known dead or Windows-artifact files.

---

## Focus Areas

1. Characterization tests and a safety net for `esp/*` actions and `xml-api` (no tests exist today).
2. Authorization audit of all `esp/*.fn` actions, and per-endpoint level checks in the new JSON layer.
3. JSON data layer over ReGa, including the missing program and room editing endpoints, and the `UpdateUI` replacement for live updates.
4. Coordination with webui-shell-build: the page objects, `ReGa.encode`, `WebUI.enter`, widget classes, and the DOM id and class contracts.
5. Per-device-type parity: 55 `esp/controls/*.fn` widgets and 41 `msg/*.htm` dialogs.
6. The program and rule editor chain (`programs.fn`, `side.*`, `sico.*`, `rule.inc`) and the device inbox (`newdevices.htm`).
7. Encoding policy (ISO-8859-1 versus UTF-8) and output encoding for names.
8. Downstream compatibility: Buildroot patches, the overlay's `www/ise/img` branding, and the port contract. Also `www/ise` asset pruning and source of truth.

---

## Consequences

### Positive Outcomes

- A responsive, maintainable UI on one library stack, built on the Bootstrap 5 foundation already committed.
- An explicit and testable authorization boundary, replacing UI-hiding.
- Removal of the injection-prone string concatenation and the generated-style coupling.
- A characterization test suite for the ReGa-served surface, which does not exist today.
- A smaller, cleaner `www/ise` asset tree.
- The `xml-api` contract is kept and gains regression protection.

### Negative Outcomes

- A long period in which two UI generations coexist, with two sets of ids and styles in one document and doubled maintenance.
- New back-end code (JSON endpoints in ReGa script and Tcl) must be written and secured, and it still depends on the closed ReGaHss.
- High effort for the device-specific widgets and the rule editor, where parity is hard to prove.
- Coordinated releases and patch porting with the Buildroot packaging repo.
- No ability to fix engine-level issues (ReGa behaviour, session handling) inside this repo.

### Follow-Up Decisions

- Choice of the front-end view layer and build tooling (architect phase), and whether it replaces `webui-shell-build`.
- Mounting approach: iframe, shared document with a namespaced container, or full takeover of `pages/index.htm`.
- Whether to extend JSON-RPC (webui-api) with program and room editing, or add dedicated ReGa-script endpoints.
- Replacement of `UpdateUI` polling: extend `Event.poll` or use polling of timestamps.
- Whether and when to deprecate the `xml-api`, and how to find its consumers.
- Moving the session from `?sid=` URLs to a header or cookie, and moving view state out of ReGa session variables.
- Charset policy: convert all files to UTF-8, with the Content-Type meta change.
- Source of truth for `www/ise` and the cleanup of `www/`, and the coordination of the overlay's branding assets with the packaging repo.
- Fate of the unresolved `channelLoader.htm`/`channelBody.htm` references.

---

## Source Documents

- `.migration/plan-context.md` – shared cross-cutting context (stack, integration, security, testing, technical debt, external constraint)
- `.migration/docs/modules/webui-rega-pages.md` – primary module documentation
- `.migration/docs/external-context/summary.md` – packaging repo constraints (as cited in the shared context)
- `.migration/docs/cross-cutting/` – technical debt, security, testing and integration findings (as summarised in the shared context)
- `/home/standard/.claude/local-marketplace/one-modernizer/skills/plan-migration/references/plan-adr-template.md` – plan structure
- `/home/standard/.claude/local-marketplace/one-modernizer/skills/plan-migration/references/adr-workflow.md` – field population strategy

---

## Approvals

- **Approved by**: (pending)
- **Approved at**: (pending)
- **Review iterations**: 0

---

