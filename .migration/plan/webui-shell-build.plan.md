# Migration Plan: Renovate WebUI shell, assets and build pipeline (webui-shell-build)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: frontend-modernization (incremental, strangler via the existing shell)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | webui-shell-build | primary | index.json | App shell, `webui.js`/`style.css` generators, `style.cgi` theming, Bootstrap tooling, i18n loader, `CfgTool`, `scripts` (`src/webui/{www/webui,www_source,bootstrap,scripts,CfgTool,CMakeLists.txt,Makefile}`) |
| 2 | webui-rega-pages | dependency | index.json | Owns `rega/www/pages/index.htm` (the shell HTML), `login.htm`, `logout.htm` and the `pages/tabs/**` fragments loaded into `#content`; server-injected globals (`SessionId`, `userId`, `PLATFORM`) |
| 3 | webui-api | dependency | index.json | JSON-RPC `/api/homematic.cgi` consumed by `homematic()`; any async/bootstrap-JSON replacement of injected globals lands here |
| 4 | webui-config-pages | affected | index.json | `ic_*` CGIs return HTML fragments inserted into the shell; legacy `config/js/ic_*` is bundled into `webui.js` |
| 5 | webui-easymodes | affected | index.json | `ic_functions.js` and `ic_translate.js` are pulled from `www/config/easymodes/js` into the bundle (cross-directory dependency) |
| 6 | www | affected | index.json | Drifted committed copy of `src/webui/www`; installed tree and symlink layout shared with the shell |
| 7 | cmake | affected | index.json | Top-level CMake decides whether `CfgTool` and `error/notready.html` are installed (unverified) |

---

## Context

### Summary

The WebUI shell is a 2008-era single-page "desktop in a browser". One generated bundle `webui.js` (about 200 JS files, unminified, concatenated in the order of `jsfiles.txt`) and one generated `style.css` (28 files, about 940 `$_(name)` colour placeholders, evaluated per request by the Tcl CGI `style.cgi` against `color.map`) are loaded by a single ReGa-templated HTML page (`rega/www/pages/index.htm`, fixed `width=1024` viewport). Everything is a global: Prototype 1.6.0.2 `Class.create`, a home-made `Singleton`, jQuery 3.4.1, Knockout 2.3.0 (a few group/diagram pages), TrimPath `.jst` templates inlined as strings. Layout is JS-driven pixel sizing (`WebUI.onResize`) and table-based. The i18n loader fetches 12 dictionary files per language with synchronous XHR at script load. Bootstrap 5.3.8 + Popper 2.11.8 was added in commits #155-#157 as an additive layer (249 KB CSS, about 80 KB JS, `hmBootstrap.css` compat reverts) but no application code uses it yet.

### Migration Drivers

- Renovation of the web UI ("nextGen UI", branch `feature/nextgen-ui`); this feature is the foundation every UI page depends on.
- Aged and partly vulnerable client libraries: jQuery 3.4.1 (XSS CVEs fixed in 3.5.0), jQuery UI 1.12.0, Prototype/script.aculo.us (2008), Knockout 2.3.0, jqPlot 1.0.8; Prototype, iro.js and spectrum.js are locally modified so cannot be upgraded blindly.
- No module system, no minification, no tests, linter disabled (`jsl`); concatenation order is the dependency graph.
- ISO-8859-1 pipeline (sources, `utf82ansi.py` with `errors="ignore"` silently drops non-Latin-1 characters, HTTP charset) blocks any modern toolchain.
- Fixed 1024px, table-based, JS-sized layout is incompatible with responsive design and with Bootstrap Reboot (`hmBootstrap.css` is a growing compensation list).
- Synchronous XHR (i18n, `homematic()` default path, menu `eval`) blocks the main thread.
- Dead/duplicated assets and drift: unbundled CSS (`menu.css`, `popup.css`, `table.css`), `jquery_lastVersion.js`, `less.js`, `roundslider.css`, duplicate jQuery UI CSS, duplicate legacy Makefiles, `www/` committed copy drift.

### Current State

Tcl/Python generators run inside the CMake image build (`www_source/CMakeLists.txt`, target `webui-www-source-assets`): `create_webui_js.tcl`, `create_style_css.tcl`, `create_devdb_tcl.tcl` plus helper generators for resources, device descriptions and the string table. Outputs are copied to the rootfs only (not tracked in git), so the app cannot be run from the source tree without the generator step and a ReGa/Tcl runtime. Bootstrap assets are refreshed manually via `bootstrap/update.sh` (npm, sass 1.78.0). Static vendored libraries have no package manager. Runtime is the closed-source ReGaHss web server serving ReGa `.htm` pages plus Tcl CGIs on the OpenCCU/CCU image (Buildroot packaging in the sibling repo, which patches `webui.js` structurally).

### Cross-Cutting Findings

- Sibling repo OpenCCU carries 64 rootfs patches, 41 of them on `webui.js`, depending on exact bundle structure (first-10-line template-string splitting) and on CRLF in `www/tcl/eq3/rega.tcl`; the overlay WebUI-openccu adds branding (`www/ise/img`) and CodeMirror 6. Bundle format changes are a breaking change for the packaging repo.
- Security: JSON-RPC has no CORS/CSRF protection, session id in the JSON body, HTTP 200 always, `errorInfo` leaked at `homematic.cgi:155`; jQuery 3.4.1 XSS CVEs; `setTextContent()` re-parses `innerHTML` (injection and event-handler loss); menu files `eval`-ed.
- Testing: no UI, API or Tcl tests exist (only `tests/test-components.py`, build-tools devicetype-strip test and LedControllerTest). There is no regression net for a shell or bundler change.
- Tech debt: `www/` is a drifted committed copy of `src/webui/www` (source of truth) with dangling absolute symlinks; dead assets and Windows leftovers.
- `cp_*`/`ic_*` CGIs and `pages/tabs/**` return HTML fragments loaded into the shell; a new frontend must keep or replace each of them.
- `CfgTool` is a second independent web app sharing `style.cgi`, Prototype and `system.js` (bundled into `webui.js`); CSS/theming changes affect it.
- Port contract and deployment (hs485d 32000, rfd 32001, ReGa 8183/1998) is hand-synchronised across OCI/HA/Helm, outside this feature but unaffected by it.
- Infrastructure: GitHub Actions CI with x86_64 only component test; CMake/Make build; no database.

---

## Migration Goal

**Establish a modern, UTF-8, testable and themeable front-end foundation inside the existing WebUI shell, enabling page-by-page replacement (strangler) without breaking the ReGa/Tcl server contract.**

The shell keeps `WebUI.enter(Page)` / `IPage` (enter/leave/resize) as the seam. Preparatory work (UTF-8 decision, dead-asset cleanup, async i18n, trimmed Bootstrap, CSS custom-property theming) is done first; a bundler, hashed assets and a mount point for modern components in `#content` follow. Legacy pages continue to run unchanged until individually replaced.

---

## Decision

### Approach: Incremental migration (strangler via the existing shell), ordered B -> A -> C -> D

Recommended option combination from the module renovation options:

- Phase 0 (preparation, no behaviour change): add a safety net (Playwright smoke tests against a stubbed or real ReGa instance, golden check of generated `webui.js`/`style.css` byte-equivalence), inventory and remove dead assets (`menu.css`, `popup.css`, `table.css`, `jquery_lastVersion.js`, `less.js`, `roundslider.css`, duplicate jQuery UI CSS, duplicate `creatediagrampage.js` entry), remove or reconcile the legacy Makefiles, fix the `create_st_value_js.tcl` `close` bug, decide on UTF-8.
- Phase 1 (theming, option B): replace `$_()` substitution with CSS custom properties (`:root{--hm-active:...}`) generated by `style.cgi` from `color.map` + `/etc/config/color.map` (keeps per-device overrides), mapped onto Bootstrap `--bs-*`/`webui-*` theme colours so there is one palette source. Keep `style.cgi` as the output endpoint initially; enables later dark mode via `data-bs-theme`.
- Phase 2 (Bootstrap adoption, option A): trim `main.scss` to the used partials (Option B imports already templated at `main.scss:18-32`), extend `hmBootstrap.css`, wire first real consumers (DutyCycle/CarrierSense progress bars, dialogs/tooltips replacing powertip/blockUI), scope Bootstrap Reboot to new components where possible.
- Phase 3 (build modernisation, option C): introduce a bundler (esbuild/Vite) that emits classic-script, order-preserving output from `jsfiles.txt`, with minification and hashed names, while keeping `webui.js` as the stable public entry point (a compatibility shim) for the OpenCCU patches; one-time UTF-8 transcoding of the 700+ source files and change of `<meta>`/`Content-Type`/XHR content type; remove `utf82ansi.py`.
- Phase 4 (page-by-page rewrite, option D): mount modern components in `#content` behind `WebUI.enter`, with an adapter exposing `SessionId`, `ConfigData`, `DeviceList`, `langJSON`, async i18n (JSON dictionaries), and a bootstrap JSON endpoint replacing server-injected inline globals. Retire Prototype/Knockout/jQuery incrementally as pages are replaced.

**Rationale**: Migration is necessary due to: (1) an unmaintainable global-namespace bundle with no modules, tests or minification (module doc sections 3.2-3.3, 11.2, 11.9); (2) known-vulnerable and 2008-era libraries (jQuery 3.4.1 XSS, Prototype 1.6.0.2; module doc section 6); (3) the ISO-8859-1 pipeline with silent data loss (`utf82ansi.py errors="ignore"`) that blocks modern tooling (section 4.3, 11.1); (4) Bootstrap 5.3.8 already added as additive layer (#155-#157), so the lowest-risk path is finishing that integration rather than replacing the stack; (5) the closed-source ReGaHss, 64+41 downstream patches and the hs485d/rfd/ReGa port contract make a big-bang rewrite (option E) unsafe. The page-class interface `IPage` and `WebUI.enter` provide a natural strangler seam. This is a working hypothesis for the engagement, not a final decision.

### Rejected Options

- **E. Full new front end with a clean JSON API layer**: largest scope; requires re-implementing many ReGa-rendered HTML endpoints (`pages/tabs/**`, `config/ic_*.cgi`) and ~40 device-specific dialogs, and the JSON-RPC API has no endpoints for program/room editing. Revisit as the long-term target after phase 4.
- **Big-bang bundler swap with ES-module conversion of all 200 files first**: global-namespace code with order-as-dependency-graph needs shims; high regression risk with no test net.
- **Keep status quo and only add Bootstrap on top**: leaves ISO-8859-1, sync XHR, vulnerable libraries and the dual palette in place.
- **Replace the shell `index.htm` with a static SPA entry now**: shell is a ReGa template with server-injected globals; needs the bootstrap JSON endpoint first (phase 4).

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | JavaScript (ES5, global scripts), Tcl (generators, CGIs), Python (`utf82ansi.py`), SCSS, ISO-8859-1 text | JavaScript (ES2020+ ESM for new code, classic-script output for legacy), TypeScript optional for new components, Tcl retained server-side, UTF-8 everywhere, CSS custom properties; Python generator step removed |
| Frameworks | Prototype 1.6.0.2, script.aculo.us 1.8.1, jQuery 3.4.1 / UI 1.12.0, Knockout 2.3.0, TrimPath 1.1.2, jqPlot 1.0.8, Bootstrap 5.3.8 (unused) | Bootstrap 5.3.x (trimmed, actively used), jQuery upgraded to latest 3.x patch (>= 3.7.1) as interim, vanilla/Web Components or a light framework (to be decided in architecture) mounted in `#content`; legacy libraries retired page by page |
| Infrastructure | CMake + Tcl/Python generators in image build, GitHub Actions, Buildroot packaging in sibling repo, ReGaHss web server, Tcl CGIs, manual npm only for Bootstrap | Preserved: CMake image build and ReGaHss/Tcl CGI serving; Node (22 LTS) bundler step added for frontend build (esbuild/Vite) plus Playwright smoke tests in GitHub Actions; hashed assets served with HTTP cache headers |

---

## Scope

**Mode**: targeted

### Included Components

- `src/webui/www/webui/` (js/common, js/lang, js/mainmenu, js/extern, css/extern, scss, `style.cgi`, `color.map`, `error/notready.html`)
- `src/webui/www_source/` (generators `create_*.tcl`, `utf82ansi.py`, `jsfiles.txt`, `cssfiles.txt`, `resources.txt`, `webui/{js,css,resource}`, `ise/{js,style}`, `config/{js,css,devdescr}`, `CfgTool/system.js`)
- `src/webui/bootstrap/` (npm/sass tooling)
- `src/webui/CMakeLists.txt`, `src/webui/www_source/CMakeLists.txt`, `src/webui/Makefile`, `src/webui/www_source/Makefile`
- `src/webui/scripts/` (`libfirewall.tcl`, `setfirewall.tcl`; retain, no frontend change)
- `src/webui/CfgTool/` (assess; minimal-change: keep working while shared `style.cgi` and Prototype evolve)

### Excluded Components

- `src/webui/rega/www/**` page templates (owned by webui-rega-pages; touched only for script/CSS tags and injected-global bootstrap)
- `src/webui/www/{ise,config,api}` server-side Tcl and `easymodes` (owned by webui-api, webui-config-pages, webui-easymodes)
- Native daemons and back-end features (`src/hss_led`, `eq3configd`, firmware, `bin/ReGaHss`)
- Sibling repo OpenCCU packaging (only coordinated, not modified)

### Critical Components

- `www_source/jsfiles.txt` ordering and `create_webui_js.tcl` (bundle structure that 41 downstream patches depend on)
- `www/webui/style.cgi` + `color.map` + `/etc/config/color.map` (per-device theming on the critical rendering path)
- `www/webui/js/lang/loadTextResource.js` + `translate.js` (global i18n, sync XHR, `innerHTML` rewriting)
- `rega/www/pages/index.htm` inline globals contract (`SessionId`, `userId`, `PLATFORM`, UPL)
- `ise/js/functions.js` (2,700 lines of implicit shared helpers)
- `www_source/webui/js/webui.js` (`WebUI.enter`, `onResize`, layout constants) and `pages/ipage.js` seam

### Boundaries

- Output contract of `webui.js` and `style.css` filenames/locations (`/webui/webui.js`, `/webui/style.cgi`) stays stable until the OpenCCU patch set is rebased.
- ReGa `.htm` templates and Tcl CGIs remain server-side; only the shell/asset layer changes in this feature.
- Source of truth stays `src/webui/www`; the drifted committed `www/` copy is not synchronised by this feature.

---

## Dependencies

### Internal

- webui-rega-pages: shell HTML (`pages/index.htm`, `login.htm`, `logout.htm`), `pages/tabs/**` fragments, server-injected globals.
- webui-api: `/api/homematic.cgi` JSON-RPC consumed through `homematic()`/`jsonrpc()`; session handling.
- webui-config-pages and webui-easymodes: `config/js/ic_*`, `ic_functions.js`, `ic_translate.js`, `stringtable_de.txt` and `config/devdescr/*.tcl` are inputs to the generators.
- Top-level CMake / `ROOTFS_DIR`, `OPENCCU_TCLSH_EXECUTABLE`, `OPENCCU_PYTHON_EXECUTABLE`, and the symlink layout for shared Tcl helpers (`cgi.tcl`, `common.tcl`, `session.tcl`, `once.tcl`, `user.tcl`).
- `CfgTool` shares `style.cgi`, Prototype and `system.js`.

### External

- Third-party vendored libraries (jQuery, jQuery UI, Prototype, script.aculo.us, Knockout, jqPlot, TrimPath, iro.js, spectrum.js, PowerTip, BlockUI, MSDropDown, Purl, json2, wz_jsgraphics).
- npm: bootstrap 5.3.8, @popperjs/core 2.11.8, sass 1.78.0; future Node 22 LTS toolchain (esbuild/Vite, Playwright).
- Closed-source `bin/ReGaHss` (renders `.htm` templates, serves static files) and tclsh/tclrpc.so/tclrega.so extensions.
- Sibling repo `/home/standard/dev/OpenCCU` (Buildroot, pins this repo by SHA, patches `webui.js` and `rega.tcl`; overlay WebUI-openccu).
- Browsers: modern evergreen (Bootstrap 5.3 JS requires no IE).

---

## Constraints

### Unchanged

- JSON-RPC `/api/homematic.cgi` method names, parameters and `_session_id_` handling; user levels NONE/GUEST/USER/ADMIN (0/1/2/8).
- Session/login flow through ReGa `system.LoginPage("/login.htm")` and server-injected `SessionId`/`userId`/`PLATFORM` until an explicit replacement endpoint exists.
- Installed URL layout (`/webui/webui.js`, `/webui/style.cgi`, `/webui/js/lang/<lang>/*`, `/config/*.cgi`, `/pages/tabs/**`) and the shared-Tcl symlink layout in `CMakeLists.txt:9-31`.
- Per-device theme override via `/etc/config/color.map` and add-on mount `/www/addons -> /etc/config/addons/www`.
- Languages de/en and existing translation keys (`${key}` placeholders, `langJSON`, `HMIdentifier`).
- `webui.js` structure used by OpenCCU rootfs patches (first-10-line template-string splitting) and CRLF in `www/tcl/eq3/rega.tcl` until patches are rebased.
- Compatibility of CfgTool with `style.cgi`.

### Integration Systems

- ReGaHss script engine / web server (ports 8183, 1998), Tcl CGIs under `/www/*`
- JSON-RPC API and cp_*/ic_* HTML-fragment CGIs
- OpenCCU Buildroot packaging, OCI/Home Assistant/Helm deployments (port contract hs485d 32000, rfd 32001)
- GitHub Actions CI (x86_64 component test)

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | Downstream OpenCCU patch set (41 on `webui.js`, 64 total) breaks when bundle structure, line layout or `rega.tcl` CRLF change | Keep `webui.js` as stable entry/compat output through phases 0-3; publish a patch-compat checklist; rebase patches in OpenCCU in lock-step; golden-diff test of generated bundle | external-context/summary.md; webui-shell-build.md sections 4.2, 11.9 |
| high | No UI/API/Tcl tests; bundler, UTF-8 or theming changes can silently regress any of ~200 pages and 40 dialogs | Phase 0 Playwright smoke suite plus screenshot baseline on key pages; byte/semantic diff of generated `webui.js`/`style.css` | testing.md; webui-shell-build.md section 11.9 |
| high | ISO-8859-1 to UTF-8 transcoding of 700+ files and charset headers (`index.htm:11`, `style.cgi:50`, XHR content type) can corrupt umlauts/dictionaries; `utf82ansi.py` already drops characters silently | One-time scripted transcode with round-trip verification; change charset in all entry points (shell, login, logout, CfgTool, notready) in one release; remove `errors="ignore"` now and fail the build on unmappable characters | webui-shell-build.md sections 4.3, 11.1 |
| high | Server-injected globals and ReGa-templated shell couple the bundle to ReGaHss (closed source); replacing them needs an API endpoint | Keep ReGa-rendered `index.htm` through phase 3; define explicit bootstrap JSON in webui-api before phase 4 | webui-shell-build.md section 9, 11.3 |
| medium | Runtime CSS templating: converting 940 `$_()` placeholders to custom properties may break per-device `color.map` overrides and `WebUI.getColor()` JS reads | Generate `:root` variables from `color.map` in `style.cgi`; keep `getColor` backed by `getComputedStyle`; visual regression on non-default palettes | webui-shell-build.md sections 5.2, 11.5 |
| medium | Bootstrap Reboot vs legacy element/ID selectors (`* {font-size:12px}`, table layout, fixed `width=1024`) produce conflicts that grow `hmBootstrap.css` | Trim Bootstrap to required partials; scope new components in a namespace container; stop adding global rules | webui-shell-build.md sections 5.1, 11.6, 11.8 |
| medium | Locally modified libraries (Prototype, iro.js, spectrum.js) and known-CVE jQuery 3.4.1 cannot be bumped blindly | Diff against upstream to extract local patches; upgrade jQuery to latest 3.x first behind smoke tests; retire Prototype/Knockout last | webui-shell-build.md section 6, 11.7 |
| medium | Synchronous XHR in i18n loader and `homematic()` default path; making them async changes initialisation order for all pages | Introduce async `ready` promise and keep sync fallback behind flag; migrate callers incrementally | webui-shell-build.md sections 10, 11.4 |
| medium | Drift between `src/webui/www` and committed `www/`, legacy Makefiles and unverified install of `CfgTool` and `notready.html` | Confirm in top-level CMake; delete or generate legacy Makefiles; document `src/webui/www` as the sole source | technical-debt.md; webui-shell-build.md sections 4.1, 13 |
| low | Node toolchain added to a Tcl/Python image build increases build complexity and reproducibility burden (cross-arch CI covers x86_64 only) | Pin versions and lockfile; commit built artefacts or cache npm; run bundler in a pre-step container | webui-shell-build.md section 4.5 |

---

## Success Criteria

- All existing functionality migrated: every page reachable through the main menu renders and operates identically (smoke suite green for admin, user and guest levels, de and en).
- Zero regression bugs in production; JSON-RPC, login/session and `style.cgi` override contracts maintained with backward compatibility.
- Security model equivalent or stronger: jQuery at latest 3.x (no known XSS CVEs), no `eval` of menu files, charset handling explicit and loss-free.
- Source tree is UTF-8 end to end; `utf82ansi.py` removed; build fails on unmappable characters.
- Generated `webui.js`/`style.css` are minified and content-hashed or cache-header controlled; initial transfer size measurably below baseline (record baseline in phase 0).
- Palette defined once (CSS custom properties) shared by legacy CSS and Bootstrap; `/etc/config/color.map` overrides still work.
- Bootstrap bundle trimmed to used components and used by at least one production consumer; `hmBootstrap.css` does not grow.
- No synchronous XHR on the main thread in the shell start path (i18n, menu, session).
- Dead assets removed (list verified by grep and runtime test); legacy Makefile duplicates removed.
- Automated UI smoke tests and generated-bundle checks run in CI; OpenCCU patch set rebases with documented effort.
- UI is usable without the fixed 1024px viewport on the new/renovated pages.

---

## Focus Areas

1. Safety net first: Playwright smoke and visual baseline, generated-bundle golden checks, CI wiring (no tests exist today).
2. Encoding decision and UTF-8 transcode (removes `utf82ansi.py`, unlocks modern toolchain).
3. Compatibility contract with the OpenCCU packaging repo (`webui.js` structure, `rega.tcl` CRLF).
4. Theming: `$_()`/`color.map` to CSS custom properties unified with Bootstrap variables, preserving user overrides.
5. Bootstrap trimming and first real adoption; reduce `hmBootstrap.css` compensation.
6. Security hygiene of client libraries (jQuery upgrade, `innerHTML` translation rewriting, menu `eval`) and async i18n/`homematic()`.
7. Bundler introduction with order-preserving classic-script output and later `IPage`-based mount point for modern components.
8. Dead-asset and duplicate cleanup (Makefiles, unbundled CSS, unused libs); `CfgTool` impact check.

---

## Consequences

### Positive Outcomes

- A testable, minified, UTF-8 front-end build with a documented seam for page-by-page replacement.
- Single palette source, dark-mode readiness and consistent Bootstrap-based components.
- Removal of known-vulnerable and obsolete libraries over time; smaller initial payload.
- Less drift and fewer duplicated build paths.

### Negative Outcomes

- Two UI stacks (legacy globals and modern components) coexist for a long period, with CSS interplay and extra maintenance.
- Node toolchain added to the image build; build and CI time increase.
- Coordinated releases with the OpenCCU packaging repo are required for bundle-format and charset changes.
- One-time large transcoding diff hurts blame/history and complicates parallel branches.

### Follow-Up Decisions

- UTF-8 migration timing and rollout (single release vs staged).
- Target framework for new components (vanilla/Web Components vs a light framework) and TypeScript use, to be decided in /architect.
- Whether and when to introduce a bootstrap JSON endpoint replacing server-injected globals (with webui-api).
- Fate of `CfgTool` (keep, fold into the shell, or retire) and installation status of `notready.html`.
- Whether to keep `style.cgi` or serve a static theme file with a small variable-generation CGI.
- Deprecation schedule for Prototype, script.aculo.us, Knockout and TrimPath templates.
- Coordination protocol and versioning of the OpenCCU patch set.

---

## Source Documents

- `.migration/plan-context.md` - shared engagement context
- `.migration/docs/modules/webui-shell-build.md` - primary module documentation
- `.migration/docs/index.json` - feature discovery and technology stack identification
- `.migration/docs/cross-cutting/technical-debt.md` - risk assessment and migration drivers (as summarised in the shared context)
- `.migration/docs/cross-cutting/security.md`, `testing.md`, `api-contracts.md` - as summarised in the shared context
- `.migration/docs/external-context/summary.md` - OpenCCU packaging constraints (as summarised in the shared context)

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

