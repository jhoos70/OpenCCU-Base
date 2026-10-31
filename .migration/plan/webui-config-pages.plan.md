# Migration Plan: Migrate webui-config-pages

**Status**: assessed | **Date**: 2026-10-09 | **Type**: framework-upgrade (UI renovation of server-rendered Tcl CGI fragments; strangler hypothesis, not decided)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | webui-config-pages | primary | index.json | `src/webui/www/config` (excl. `easymodes/`), `www/pda`, `www/error`, `www/tools`, `www/upnp`, plus client JS/CSS in `src/webui/www_source/config/{js,css}`. cp_* (admin level 8) and ic_* (level 0) CGIs |
| 2 | webui-easymodes | dependency | index.json | Per-device-type dialogs in `config/easymodes/**`, incl. `hmipChannelConfigDialogs.tcl` (8,311 lines). Excluded from this plan, but the ic_* pages call into it and the shared widget helpers (`get_ComboBox2`, `uiElements.tcl`) are the seam for injecting new markup |
| 3 | webui-shell-build | dependency | index.json | Single-page shell (`updateContent`, `CreateCPPopup`, `translatePage`, `setPath`/`setFooter`) and the build generators (`create_webui_js.tcl`, `create_style_css.tcl`) that load and package these fragments |
| 4 | webui-api | dependency | index.json | JSON-RPC `/api/homematic.cgi` (`homematic()` calls), the target for moving cp_* endpoints off `Success`/`Failure` text |
| 5 | webui-rega-pages | affected | index.json | Sibling UI pages; they share the Bootstrap 5 assets and the shell visual conventions. Consistency affected |

---

## Context

### Summary

The module is the "config" half of the OpenCCU WebUI: Tcl CGIs (`#!/bin/tclsh`) that emit HTML *fragments* by `puts`/string concatenation (no `<html>`/`<head>`). The SPA shell loads them via AJAX into `#content` or into popups. Two generations coexist. Legacy `ic_*` (internal configuration, access level 0) pages build HTML as strings with inline JS. `cp_*` (control panel, access level 8) pages use the `cgi.tcl` HTML DSL. The directory also holds `control_panel.cgi`, `help.cgi`, the `tools/devconfig.cgi` developer tool (1,481 lines), a 2009 PDA mobile app (the only part with a real template engine, `tmpl_parser.tcl`), static error pages, and the UPnP presentation CGIs. About 16.5k lines of Tcl are involved. `hmipChannelConfigDialogs.tcl` (8,311 lines, in the easymodes tree) is the main downstream renderer.

### Migration Drivers

- HTML, data access (XML-RPC), business rules (device-type string compares) and inline JS with Tcl-interpolated data are co-located in the same procs. This blocks any visual or behavioural renovation of the nextGen UI (branch `feature/nextgen-ui`, Bootstrap 5 assets already added in #155/#156).
- Four incompatible post-back patterns: Prototype `Ajax.Request` with `Success`/`Failure` text, JSON-RPC `homematic()`, `SendRequest('ic_ifacecmd.cgi')` that evals returned HTML/JS, and multipart upload via hidden iframe. Mixed client libraries (Prototype + jQuery).
- Security: request-driven exec at `cp_software.cgi:493`; manual and inconsistent HTML escaping (for example names embedded in `onmouseover` at `ic_selchannel.cgi:290`, so XSS and quoting hazards); `sid` as the only CSRF-like token; missing `session_requestisvalid` guard on `control_panel.cgi` and `ic_neweasymode.cgi` (the latter writes user profile files).
- Duplication: `ic_seldevice` and `ic_selchannel` share ~70% of their table, filter and sort code; `isHmIP` is defined in three files.
- Known defects: `cp_display.cgi:54` uses the Brightness label for the Contrast row; `cp_functions.js:26` points to the missing `cp_cert.cgi`.
- Hard-coded German strings in Tcl and the PDA, and mixed ISO-8859-1/CRLF and UTF-8 files, hinder internationalisation.

### Current State

Server-rendered Tcl CGI fragments running on the closed-source prebuilt `bin/ReGaHss` plus lighttpd/tclsh on an embedded Linux image. Packaged by the sibling Buildroot repo OpenCCU, which pins this repo by SHA. The authoritative sources are `src/webui/www` and `src/webui/www_source`; `www/` is a drifted committed copy (52+49 files differ). Server dependencies outside the module (`once.tcl`, `cgi.tcl`, `session.tcl`, `user.tcl`, `tclrpc.so`, `tclrega.so`) come from the base image (OCCU). No UI, API or Tcl tests exist.

### Cross-Cutting Findings

- Tech debt: `www/` is a drifted copy of `src/webui/www` with dangling absolute symlinks; dead assets; Windows leftovers. Source of truth for this module is `src/webui/www`.
- Security: request-driven exec (`cp_software.cgi:493`, admin); default admin credentials (`www/tcl/eq3_old/user.tcl:8-9`, plaintext compare); `homematic.cgi:155` leaks `errorInfo`; no CORS/CSRF protection; config-tool mode skips privilege checks (`homematic.cgi:147-148`). Backup CGIs read caller-supplied paths.
- API: JSON-RPC (180 methods, sid in body, HTTP 200 always) is already used by cp_network, cp_security, cp_maintenance and cp_add_device for system operations. There are no endpoints for program or room editing.
- Testing: only `tests/test-components.py`, a devicetype-strip test and `LedControllerTest` exist. No UI, API or Tcl tests, so every renovation step needs new characterization tests.
- External constraint: OpenCCU's 64 rootfs patches (41 on `webui.js`) depend on exact `webui.js` structure and on CRLF in `www/tcl/eq3/rega.tcl`. OpenCCU also adds a branding overlay.
- Infrastructure: legacy CCU2 LCD (`hss_lcd`, `config/display/*` HSSML, `cp_display.cgi`) is hardware-specific; `isOldCCU` gating in `control_panel.cgi:88`.
- Dependencies: Prototype, jQuery, jQuery powerTip, TrimPath (tools only) and wz_jsgraphics are legacy client libraries.

---

## Migration Goal

**Renovate the config and control-panel pages incrementally onto the nextGen UI (Bootstrap 5, one client API) by separating view from endpoint, easiest pages first.**

Each page moves to a static HTML/JS view plus a thin Tcl or JSON-RPC endpoint. The four post-back patterns collapse to one (JSON-RPC `homematic()` or a small JSON CGI contract). Known defects and security issues in the touched pages are fixed on the way. Device and channel configuration (ic_common / ic_deviceparameters / ic_setprofiles / HmIP dialogs) is deliberately deferred until a data-driven paramset-description to form generator exists. In the meantime it is only re-skinned through shared widget helpers.

---

## Decision

### Approach: Strangler pattern (page-by-page behind the existing shell), working hypothesis

Keep the shell's `updateContent`/`CreateCPPopup` loading contract and the CGI URLs. Replace one fragment at a time with a static Bootstrap 5 view plus JS, backed by an endpoint that returns JSON (or by existing `homematic()` methods). The old Tcl CGI stays available until the replacement is verified. Renovation order, easiest first:

1. `cp_display` (255 lines; fix the label defect; retire together with `config/display/*` if the legacy LCD is out of scope), `control_panel` (365), `help` (150), `upnp/*`, `error/*.html`, and removal of the dead `cp_cert.cgi` reference in `cp_functions.js:26`.
2. `cp_time` (817), `cp_software` (566; also remove or guard the exec at :493), `cp_network` (735; replace the certificate-upload iframe).
3. Split `cp_security` (1,615 lines) per section (passwords/auth, SSH, SNMP, backup/restore) and `cp_maintenance` (1,403) per section (firmware, ReGa version, safe mode, HmIP server, LAN gateway, reboot/reset). `cp_add_device` (998) follows in this step.
4. `ic_deviceFirmwareOverview` (361) and `ic_linkpeerlist` (715), client-rendered from JSON.
5. Merge `ic_seldevice` and `ic_selchannel` into one client-rendered table; move the HmIP exceptions (`ic_selchannel.cgi:703-740`) into data.
6. PDA: re-skin (replace XHTML Basic tables with a responsive layout, keep the per-datapoint control seam, add i18n keys) or retire in favour of the responsive main UI.
7. `tools/devconfig.cgi` (1,481 lines), last; keep as is or hide behind expert mode.

Avoid early: `ic_common.tcl` (1,931 lines, profile engine, `cmd_link_paramset2`), `ic_setprofiles.cgi`, `ic_deviceparameters.cgi`, and the HmIP dialog library. For these, only inject Bootstrap 5 markup through the shared widget helpers (`get_ComboBox2`, `getCheckBox`, `getTextField`, `uiElements.tcl`) and the `CLASS2xxxx` stylesheet generator.

**Rationale**: Migration is justified because (1) markup/logic entanglement across ~16.5k Tcl lines blocks nextGen UI work (webui-config-pages.md s.9); (2) the security and defect findings listed under Migration Drivers sit in these CGIs; (3) there are no tests, so large-bang rewrites are unsafe, and the sibling OpenCCU patch set constrains structural change to `webui.js`/`rega.tcl`; (4) the pages are independent fragments with a stable loading contract, which gives a natural strangler seam and an easy-first order that lets the team build tooling and tests on low-risk pages.

### Rejected Options

- **Full rewrite of all config pages as a new SPA**: no tests, 8.3k-line HmIP dialog library and profile engine would have to be reproduced at once; high regression risk for device configuration.
- **CSS-only restyling of everything**: cheap but leaves XSS-prone string building, four post-back patterns and the security issues in place. Retained only for the deferred ic_* core and HmIP dialogs.
- **Big-bang replacement of the ic_* device configuration first**: highest value but hardest; needs a data-driven generator that does not exist.
- **Keep everything as is**: leaves the known defects and the nextGen UI blocked.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | Tcl (CGIs, `puts` HTML), ES5 JavaScript | Tcl retained for thin endpoints; ES2015+ modules for views (built by the existing `www_source` generators). Tcl 72% of the repo, so no language switch |
| Frameworks | Prototype.js, jQuery, jQuery powerTip, TrimPath (tools), `cgi.tcl` DSL, `tmpl_parser.tcl` (PDA) | Bootstrap 5 (already added in #155/#156), a single small fetch/JSON-RPC client; drop Prototype for migrated pages |
| Infrastructure | lighttpd + tclsh CGI, `bin/ReGaHss` (closed source), Buildroot packaging (OpenCCU), GitHub Actions, CMake/Make | Unchanged (no Java/Spring/Node runtime involved; Node only if a build step needs it) |

---

## Scope

**Mode**: targeted

### Included Components

- `src/webui/www/config/` (cp_*.cgi, ic_*.cgi, ic_common.tcl, ic_metadata.tcl, control_panel.cgi, help.cgi, virtualHelp.tcl, backup.tcl, file_io.tcl, stringtable_de.txt), excluding `easymodes/`
- `src/webui/www/config/display/` (assess for retirement)
- `src/webui/www/pda/` (templates, `eq3/`, `eq3/controls/`, styles, images)
- `src/webui/www/tools/` (`devconfig.cgi`, `devicetypes.html`, `designer.html`, `HomeMatic-API.html`, `tools/js`, `jsDevDescr.cgi`)
- `src/webui/www/upnp/`, `src/webui/www/error/`
- Client assets in `src/webui/www_source/config/{js,css}` (ic_common.js 1,183 lines, cp_functions.js and the others)

### Excluded Components

- `src/webui/www/config/easymodes/**` (webui-easymodes) except the shared widget helper seam
- Generated `config/devdescr` (542 files, build output)
- Shell, menu, session handling and language tables (`www/webui`, `www/ise`; webui-shell-build)
- JSON-RPC API implementation (webui-api), ReGa pages (webui-rega-pages)
- Out-of-repo OCCU base files (`session.tcl`, `cgi.tcl`, `once.tcl`)
- Back-end daemons (hs485d, rfd, hss_led, eq3configd) and `www/` drifted copy (to be treated as generated or removed separately)

### Critical Components

- `ic_common.tcl`, `ic_setprofiles.cgi`, `ic_deviceparameters.cgi`, `ic_ifacecmd.cgi` (eval of returned JS/HTML)
- `cp_security.cgi`, `cp_maintenance.cgi`, `cp_software.cgi` (privileged operations, request-driven exec)
- `hmipChannelConfigDialogs.tcl` (8,311 lines; downstream, out of scope)

### Boundaries

- Keep fragment URLs and the shell loading contract stable until a page is replaced and verified.
- Access levels (8 for cp_*, 0 for ic_*) must be preserved; the missing guards on `control_panel.cgi` and `ic_neweasymode.cgi` are to be closed as a deliberate, tested change.
- Per-file encodings (ISO-8859-1/CRLF vs UTF-8) must be preserved or converted deliberately; do not run blind reformatting.
- Do not alter `webui.js` first-10-line structure or CRLF in `www/tcl/eq3/rega.tcl` without coordinating with the OpenCCU patch set.

---

## Dependencies

### Internal

- `webui-shell-build`: `updateContent`, `CreateCPPopup`, `translatePage`/`translateKey`, `setPath`/`setFooter`, `viewmodels.js`, page classes (`deviceconfigpage.js`, `linklistpage.js`) and the `create_webui_js.tcl` / `create_style_css.tcl` generators.
- `webui-api`: JSON-RPC methods (`User.restartLighttpd`, `CCU.setSSH`, `CCU.getSSHState`, `Interface.setInstallModeHMIP`, `SafeMode.enter`, `Interface.getMetadata_crRFD`, ...).
- `webui-easymodes`: per-device dialog Tcl and `easymodes/etc/{uiElements,options*,hmip_helper}.tcl`; `MASTER_LANG` help JS.
- Language tables `www/webui/js/lang/{de,en}` and `stringtable_de.txt`.
- `www/tcl/eq3/{session,rega}.tcl` used by the PDA.

### External

- OCCU base image Tcl libraries (`once.tcl`, `cgi.tcl`, `session.tcl`, `user.tcl`, `common.tcl`, `package HomeMatic`) and the Tcl extensions `tclrpc.so`/`tclrega.so`.
- XML-RPC daemons hs485d (TCP 2000) and rfd (TCP 2001) reached from `ic_common.tcl` (`xmlrpc $iface_url`), `/etc/config/InterfacesList.xml`.
- Closed-source `bin/ReGaHss` (script engine; PDA `rega_exec`).
- System hooks: `/etc/config/hss_lcd.conf` with `killall -SIGUSR1`, `crypttool`, lighttpd restart, certificate and firmware upload paths.
- Sibling repo OpenCCU (Buildroot packaging, rootfs patches, branding overlay, CodeMirror 6); Bootstrap 5 assets from the webui tooling.

---

## Constraints

### Unchanged

- Fragment URLs and parameters (`action=put_page|apply`, `sid`, `iface`, `address`, `redirect_url`, `with_group`, `call_js`) as used by the shell, until the matching page is replaced.
- Admin (level 8) and user (level 0) access semantics; session model stays in OCCU `session.tcl`.
- Config file formats written by these pages: `/etc/config/hss_lcd.conf`, `/etc/config/ic_settings.dat`, user profile files (Tcl source `PROFILES_MAP`), backup `.sbk` format.
- XML-RPC `putParamset` / paramset semantics and CONFIG_PENDING reporting after save.
- `${key}` placeholder translation convention (`translate.js`) and the de/en language tables.
- Tile contract for add-ons (`$addon(CONFIG_URL)`) in `control_panel.cgi`.
- Legacy CCU2 LCD behaviour (HSSML) if that hardware stays supported.

### Integration Systems

- hs485d / rfd XML-RPC, ReGa script engine, JSON-RPC `homematic.cgi`, lighttpd, OpenCCU packaging repo, `/etc/config` persisted state.

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | No automated UI, API or Tcl tests; regressions in device configuration or system settings would go unnoticed | Add characterization tests per migrated page (HTTP-level golden fragments, endpoint contract tests) before replacing it; migrate easy pages first | testing.md; no tests under `src/webui` |
| high | Security-sensitive admin pages (request-driven exec `cp_software.cgi:493`; backup/restore, SSH, password handling in `cp_security`) are touched during split | Fix exec path and input validation during the page move; security review per page; keep level 8 check | security.md; cp_software.cgi:493 |
| high | Entanglement of HTML, Tcl data access, business rules and Tcl-interpolated JS makes `ic_common.tcl`, `ic_deviceparameters.cgi` and `ic_setprofiles.cgi` hard to restructure | Defer; build a data-driven paramset-description to form generator first; until then restyle only via shared widget helpers | webui-config-pages.md s.9, s.10 |
| high | Downstream dependency on the 8,311-line `hmipChannelConfigDialogs.tcl` and 69+ channel-type files: helper signature changes break hundreds of dialogs | Keep helper signatures stable; inject markup changes in `uiElements.tcl` only; coordinate with webui-easymodes plan | webui-config-pages.md s.7 |
| medium | Sibling repo OpenCCU pins by SHA and patches `webui.js` structure and CRLF files; structural changes break its 64 rootfs patches | Do not touch those files here; coordinate patch rebase with each phase | external-context/summary.md |
| medium | Mixed encodings (ISO-8859-1/CRLF vs UTF-8, already double-encoded text in `ic_md.cgi`, `ic_ifacecmd.cgi:311`) corrupt umlauts when tooling rewrites files | Per-file encoding detection in tooling; byte-level diffs in CI | webui-config-pages.md s.1 |
| medium | Inconsistent HTML escaping and eval of server-returned JS (`SendRequest` / `ic_ifacecmd.cgi`) give XSS and quoting hazards while pages are partially migrated | Escape by default in new views; remove eval pattern as pages move; CSP evaluation later | `ic_selchannel.cgi:290`; ic_deviceparameters.js:70 |
| medium | Drifted `www/` copy vs `src/webui/www` leads to editing or shipping the wrong file | Edit only `src/webui/www`; resolve drift as separate task | technical-debt.md |
| low | Legacy hardware paths (CCU2 LCD `cp_display`, `config/display/*`, `isOldCCU`) hard to test; retiring them may break old devices | Decide product support for the legacy LCD first; retire or keep behind feature flag | cp_display.cgi:200-203; control_panel.cgi:88 |
| low | PDA has own login and German-only text; re-skin or retirement may disrupt users of old mobile browsers | Usage check before retirement; if kept, add i18n keys and responsive CSS | webui-config-pages.md s.8 |

---

## Success Criteria

- All migrated pages keep functional parity: same settings written, same config files and XML-RPC calls, same access levels.
- Known defects fixed: `cp_display.cgi:54` label; `cp_functions.js:26` dead `cp_cert.cgi` reference removed or target restored.
- The four post-back patterns are reduced to one client API for every migrated page; no Prototype `Ajax.Request` or eval of server-returned JS in migrated pages.
- `control_panel.cgi` and `ic_neweasymode.cgi` enforce a session check; request-driven exec in `cp_software.cgi` removed or constrained; no unescaped user data in new views.
- Every migrated page has automated tests (endpoint contract and fragment smoke test) running in CI; baseline is zero today.
- `ic_seldevice` / `ic_selchannel` duplication removed (one table implementation); HmIP exceptions held as data.
- `cp_security` and `cp_maintenance` split into section modules with no file above ~500 lines.
- Shared widget helpers emit Bootstrap 5 markup without changing signatures used by the easymodes tree.
- OpenCCU packaging repo builds against the new SHA with no additional patch breakage.
- Zero regressions reported in device configuration and link profile editing.

---

## Focus Areas

1. Security-relevant admin pages: `cp_software.cgi:493` exec, `cp_security`, missing session guards (`control_panel.cgi`, `ic_neweasymode.cgi`).
2. Test harness for CGI fragments and endpoints (precondition for everything else).
3. Easy-first pilots: `cp_display`, `control_panel`, `help`, `upnp`, `error` pages; establishes the view/endpoint pattern and Bootstrap 5 usage.
4. Single client API contract replacing the four post-back patterns (JSON-RPC `homematic()` first).
5. Splitting `cp_security` (1,615) and `cp_maintenance` (1,403) per section.
6. Shared widget helper seam (`get_ComboBox2`, `uiElements.tcl`) for the HmIP dialog and ic_* re-skin.
7. Table-view dedupe (`ic_seldevice`/`ic_selchannel`, `ic_linkpeerlist`, `ic_deviceFirmwareOverview`).
8. Encoding, i18n of hard-coded German strings, and decision on PDA / legacy LCD / `tools/devconfig.cgi`.

---

## Consequences

### Positive Outcomes

- Unblocks nextGen UI work with a repeatable, low-risk page-by-page pattern.
- Removes known defects and several security weaknesses in admin pages.
- Less duplicated code; consistent look and one client API; testable endpoints.
- Clear boundary for the later data-driven device configuration generator.

### Negative Outcomes

- Two UI generations coexist for a long time; the device/link configuration core stays legacy until a generator exists.
- Extra maintenance of both old and new endpoints during the strangler phase.
- Coordination cost with the OpenCCU packaging repo and its patch set.
- Encoding handling and the lack of tests slow each step.

### Follow-Up Decisions

- Decide the long-term fate of the PDA (re-skin or retire) and of the legacy LCD pages (`cp_display`, `config/display/*`).
- Decide endpoint contract: extend JSON-RPC `homematic()` methods vs small JSON CGIs.
- Decide on a data-driven paramset-description to form generator (ties to webui-easymodes plan) and when to start it.
- Decide whether `tools/devconfig.cgi` is kept, hidden behind expert mode, or retired.
- Confirm the strangler approach with the shell plan (webui-shell-build) before execution.
- Define the treatment of the drifted `www/` copy.

---

## Source Documents

- `.migration/plan-context.md` — Shared cross-cutting context and engagement goal
- `.migration/docs/modules/webui-config-pages.md` — Module analysis (inventory, post-back patterns, renovation ranking)
- `.migration/docs/cross-cutting/technical-debt.md` — Risk assessment and migration drivers (via shared context)
- `.migration/docs/cross-cutting/security.md` — Security findings (via shared context)
- `.migration/docs/cross-cutting/api-contracts.md` — JSON-RPC and XML-RPC contracts (via shared context)
- `.migration/docs/cross-cutting/testing.md` — Test gaps (via shared context)
- `.migration/docs/cross-cutting/infrastructure.md`, `dependencies.md` — Deployment and dependency context (via shared context)
- `.migration/docs/external-context/summary.md` — OpenCCU packaging constraints (via shared context)

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

