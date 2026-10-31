# Module: WebUI shell, assets and build pipeline (src/webui)

Scope: `src/webui/www/webui`, `src/webui/www_source` (build generators, config, JS/CSS sources), `src/webui/bootstrap`, `src/webui/scripts`, `src/webui/CMakeLists.txt`, `src/webui/Makefile`, `src/webui/CfgTool`.
Out of scope but referenced as evidence: `src/webui/rega/www/*.htm` (the HTML page shell that loads everything), `src/webui/www/ise|config|api` (server side).

Line numbers cited are as read in the working tree on branch `main` (HEAD 030dba79). Source files are ISO-8859-1 encoded (see "Encoding"), so use `grep -a` on them.

## 1. Executive summary

- The WebUI is a 2008-era, single-page, hand-rolled "desktop in a browser" application. One monolithic bundle `webui.js` (built from ~210 source files) + one monolithic `style.css` (built from 28 files) is loaded by a single HTML shell (`rega/www/pages/index.htm:220`). There is no module system, no transpilation, no npm build for the app code.
- The UI is built mostly imperatively with DOM construction code, Prototype `Class.create` classes and `Singleton.create` singletons, jQuery 3.4.1 for DOM/AJAX, TrimPath `.jst` templates (inlined as strings), and Knockout 2.3.0 in a small number of group/diagram pages.
- Colours are not static CSS: `style.css` is a template with `$_(name)` placeholders, evaluated on every request by a Tcl CGI (`www/webui/style.cgi`) against `color.map`, so theme colours can be overridden per CCU (`/etc/config/color.map`).
- Bootstrap 5.3.8 (+ Popper 2.11.8) was added in the last commits (#155, #156) as an additive layer: full Bootstrap CSS in `main.min.css` plus a hand-written `hmBootstrap.css` that reverts Bootstrap's resets. It is loaded in the main shell page, but so far no application code uses Bootstrap components (only a Bootstrap-class-compatible use is claimed for DutyCycle/CarrierSense bars in `bootstrap/README.md:30`; see section 7).
- The frontend is tightly coupled to server-side Tcl/ReGa: HTML pages are ReGa-script `.htm` templates (`<% ... %>`), data comes via JSON-RPC (`/api/homematic.cgi`) and `.cgi` Tcl scripts, text is fetched with synchronous XHR, and part of the bundle (device descriptions, string tables) is generated from Tcl files at build time.

## 2. Directory inventory (in-scope)

| Path | Role | Evidence |
| --- | --- | --- |
| `src/webui/www/webui/` | Static, hand-maintained assets installed to `/www/webui` | `src/webui/CMakeLists.txt:5` |
| `www/webui/js/common/` | `viewmodels.js` (Knockout view models), `xmlhttprequest.js` | listing |
| `www/webui/js/lang/` | i18n loader (`loadTextResource.js`, `translate.js`) + `de/`, `en/` dictionaries (12 files each) | listing |
| `www/webui/js/mainmenu/` | `admin.js`, `user.js` menu definitions (JS object literals fetched as text and `eval`-ed) | `www_source/webui/js/mainmenu.js:32-33` |
| `www/webui/js/extern/` | Third-party JS (section 6) | listing |
| `www/webui/css/extern/` | Third-party CSS, `main.min.css`, `hmBootstrap.css` | listing |
| `www/webui/scss/main.scss` | Bootstrap SCSS entry point (compiled by `bootstrap/update.sh`) | `www/webui/scss/main.scss` |
| `www/webui/style.cgi`, `color.map` | Runtime CSS templating (theming) | section 5 |
| `www/webui/error/notready.html` | Standalone "CCU not ready" page, polls via `xmlhttprequest.js` | `www/webui/error/notready.html:5` |
| `src/webui/www_source/` | Source of the generated bundle (787 files) | `find` |
| `www_source/webui/{js,css,resource}` | Application JS (UI components, model, pages, dialogs), CSS, `.jst` templates | `jsfiles.txt`, `cssfiles.txt`, `resources.txt` |
| `www_source/ise/{js,style}` | Legacy "ise" helper code (device-specific controls, refresher, DutyCycle etc.) + `ise/style/style.css` | `jsfiles.txt:146+` |
| `www_source/config/{js,css,devdescr}` | Legacy eQ-3 configuration dialogs (`ic_*`), device description sources (one `.tcl` per device type) | `jsfiles.txt:200+` |
| `www_source/CfgTool/system.js` | Config-tool metadata helper bundled into webui.js | `jsfiles.txt` (last entry) |
| `src/webui/bootstrap/` | npm tooling to refresh Bootstrap files (not installed to image) | `bootstrap/README.md:11-13` |
| `src/webui/scripts/` | `libfirewall.tcl` (632 lines), `setfirewall.tcl` installed to `/lib` and `/bin` | `scripts/CMakeLists.txt:1-7` |
| `src/webui/CfgTool/` | Separate legacy "Konfigtool" web app (Tcl CGIs, own index.htm) | section 8 |

## 3. Frontend architecture

### 3.1 Page shell and script loading

Page loading is plain `<script>` tags in server-delivered `.htm` files (these live in `rega/www`, outside this module, but define the architecture):

- `rega/www/index.htm` -> checks browser capability, redirects to `pages/index.htm` (`STARTPAGE_PC`, `index.htm:15-16`). First lines contain a ReGa server-side script `<% system.LoginPage("/login.htm"); %>` (`index.htm:9-12`).
- `rega/www/pages/index.htm` is the real application shell:
  - `<meta name=viewport content="width=1024">` (lines 5-6) - fixed-width desktop layout.
  - Third-party CSS at lines 17-21 and 60-61, then `main.min.css` (line 69), `hmBootstrap.css` (line 70), and the dynamic theme `style.cgi` (line 71, `id="idCss"`).
  - Third-party JS in a fixed order, lines 26-55 and 62-63: jQuery, **bootstrap.bundle.min.js (line 27)**, URL plugin, powertip, blockUI, form, **prototype**, **scriptaculous (builder, effects, dragdrop, slider)**, wz_jsgraphics, TrimPath template, datepicker, jqPlot + renderers, msDropDown, `lang/loadTextResource.js`, `lang/translate.js`, **knockout**, `common/viewmodels.js`, json2, spectrum, iro, jQuery UI (+timepicker). Order matters; there is no dependency management.
  - Body: `<body id="body" onload="WebUI.start();">` with a loader overlay (lines ~210-218) and, last, `<script src="/webui/webui.js">` (line 220) - the generated bundle.
  - Inline script (lines 73-185, 187-206) defines globals such as `SessionId`, `PLATFORM`, `userId` that the bundle reads (e.g. `webui.js` uses `SessionId`, `PLATFORM`, `userId`); these are injected by server-side ReGa/Tcl templating.
- `rega/www/login.htm:7-13` and `logout.htm:5-15` load a smaller subset (jQuery, URL plugin, prototype, `lang/*`, `style.cgi`) and carry the comment "Required meta tags for bootstrap" but no Bootstrap assets.
- `CfgTool/index.htm:12-25` appends `?_version_=1.600pre1` cache-busting query strings; the commit history shows main WebUI moved to HTTP cache headers instead (commit 7d8dbddf).

Pages inside the SPA are not separate HTML files: `WebUI.enter(PageClass)` swaps the content of `#content`; some pages fetch HTML fragments from the server (e.g. `/pages/tabs/control/devices.htm`, `www/webui/js/common/viewmodels.js:~120` via `new Ajax.Request(url, ...)`; fragments live in `rega/www/pages/tabs/{admin,control,guest}`) and some from inlined `.jst` strings (section 4.2).

### 3.2 Global namespaces and object system

Everything is a global (implicit `window.X = ...`, no `var`, no IIFE/modules):

- Object system: Prototype's `Class.create({...})` (`www_source/webui/js/pages/page.js:8`) with an `__interfaces__: [IPage]` convention, and a home-grown `Singleton` helper in `www_source/webui/js/common/expand.js:6` (`Singleton = {...}` providing `Singleton.create({...})`).
- Application singletons: `WebUI = Singleton.create({...})` (`www_source/webui/js/webui.js:6`), `MainMenu` (`mainmenu.js:~8`), `ConfigData`, `DeviceList`, `HttpLoader`, `MessageBox`, page singletons (`StartPage`, `ControlDevicesPage`, `SystemConfigPage`, `DeviceListPage`, ...), dialogs.
- Free global functions: `homematic()` (JSON-RPC wrapper, `webui/js/homematic.js:7`), `jsonrpc()` (`common/jsonrpc.js`), `translateKey()` etc., `conInfo()` (`common/debug.js`), plus ~2,700 lines of legacy helpers in `ise/js/functions.js` (e.g. `showDutyCycle` at `functions.js:2582`, `showCarrierSense` at `functions.js:2686`).
- Constants/state in globals: `UPL_ADMIN`/`UPL_USER` (user power level; `getUPL()`), `SessionId`, `userId`, `PLATFORM`, `langJSON`, `HMIdentifier` (`js/lang/loadTextResource.js:1-2`), device DB `DEV_LIST`, `DEV_PATHS`, ... (generated, section 4.3).

### 3.3 Application layers (from `jsfiles.txt` ordering)

1. Generated data first: `resource.js` (inlined templates), `devdescr.js`, `st_values.js` (`jsfiles.txt:1-3`).
2. `webui/js/common/*` (expand/Singleton, xmlhttprequest, httploader, eq3, debug, jsonrpc, securityHint, drag), `configdata.js`, `webui.js`, `controlbtn.js`, `cursor.js`, filters.
3. Home-made widget toolkit `webui/js/ui/*` (frame, label, text, scrollpane, button, textedit, passwordedit, textarea, listbox, checkbox, image) - 12 files, DOM-built controls.
4. Data model `webui/js/model/*` (room, subsection, devicetype, channel, channelgroup, device and list classes) mirroring ReGa objects.
5. Popups/dialogs `webui/js/layer.js`, `dialog/*` (about 40 dialog classes, many device-specific, e.g. `rgbwcontrollerdialog.js`, `installWizard.js`).
6. `headerbar.js`, `mainmenu.js`.
7. Pages `webui/js/pages/**` (startpage, control/*, linksandprograms/*, systemconfig/*, help, alarm/service messages). Note `creatediagrampage.js` is listed twice in `jsfiles.txt` (duplicates are concatenated twice).
8. HomeMatic API / monitors: `homematic.js`, `regamonitor.js`, `interfacemonitor.js`, `homematic/event.js`, `homematic.com.js`.
9. `ise/js/*` (about 50 legacy helper/device-control files), `config/js/ic_*` (legacy eQ-3 configuration dialogs), `../www/config/easymodes/js/ic_functions.js` + `ic_translate.js` (pulled from `www/config`, i.e. cross-directory dependency), `webui/js/groups/deviceInboxGroupHandling.js`, `CfgTool/system.js`.

Concatenation order IS the dependency graph; reordering lines in `jsfiles.txt` can break the app.

### 3.4 View-model pattern (Knockout) and where it is used

- Knockout 2.3.0 (`www/webui/js/extern/knockout.js`, header line 1) is loaded globally (`pages/index.htm:51`) but used sparsely: `www/webui/js/common/viewmodels.js` defines `GroupDevice`, `Header`, `VirtualGroup` with `ko.observable`/`ko.computed` (e.g. `viewmodels.js` `self.isActive = ko.observable(false)`, `imagePath = ko.computed(...)`), used by the group/diagram pages (`creategrouppage.js`, `diagramcontrollistpage.js`, `devicefirmware*.js` in the page list). Bindings are declared in server-delivered HTML fragments/templates.
- Elsewhere there is NO view-model pattern: pages are classes (`Page`, `page.js:8`) with `enter(options)`, `leave()`, `resize()` callbacks (`IPage` in `pages/ipage.js`) that build DOM via jQuery/Prototype `Element`/`document.createElement`, or pull in HTML + `jQuery("#content").html(...)` and translate it post-hoc.
- Navigation state lives on the `WebUI` singleton: `currentPage`, `currentPageOptions`, `previousPage`, `previousPageOptions` (`webui.js:~20-24`), used by `WebUI.enter(Page)` and `WebUI.goBack()`.

### 3.5 Library roles

| Library | Role in the app |
| --- | --- |
| Prototype 1.6.0.2 | Class system, `$()`, `Element.setStyle`, `Event.observe`, `Ajax.Request`, `bindAsEventListener`; used in the core (`webui.js:27`), login page (`login.htm:25+`) |
| script.aculo.us 1.8.1 | Effects, drag&drop, slider (loaded via `scriptaculous.js?load=builder,effects,dragdrop,slider`) |
| jQuery 3.4.1 | DOM/AJAX/translation (`jQuery(...)` everywhere; `jQuery` not `$` because Prototype owns `$`) |
| jQuery UI 1.12.0, timepicker 0.3.1 | Date/time pickers, sliders, dialogs in config pages |
| Knockout 2.3.0 | Group/diagram view-models |
| TrimPath Template 1.1.2 | `.jst` templates (device lists, choosers, filters) via `resource.js` |
| jqPlot 1.0.8 | Diagrams |
| wz_jsgraphics 3.00 | Canvas-less drawing of device image highlights (`jg_250 = new jsGraphics("picDiv")`, `webui.js:~125`) |
| Bootstrap 5.3.8 | Added, nearly unused (section 7) |

Both `$` (Prototype) and `jQuery` coexist; many files call Prototype `$("id")` while mixing `jQuery("#id")`.

## 4. Build / generation pipeline

### 4.1 Entry points

Two parallel build systems exist:

- CMake (active): `src/webui/CMakeLists.txt:1-2` adds `www_source` and `scripts`; target `webui-assets` (`:4-34`) copies `src/webui/www` and `src/webui/rega/www` into `${ROOTFS_DIR}/www`, `www/rega`, and then creates symlinks to share Tcl helpers (`cgi.tcl`, `common.tcl`, `once.tcl`, `session.tcl`, `user.tcl`) from `/www/tcl/{extern,eq3_old,eq3}` into `/www`, `/www/config`, `/www/config/display`, `/www/tools`, `/www/api/eq3`, `/www/pda/eq3` (`CMakeLists.txt:9-31`). It also symlinks `/www/addons -> /etc/config/addons/www` and EULA files to `/tmp/EULA.{de,en}` (`:7-9`). Depends on `webui-www-source-assets` and `webui-scripts-assets` (`:33`).
- Legacy Makefiles (original eQ-3 romfs / AT91 build, 2008): `src/webui/Makefile:11-` (`romfs-inst.sh` symlinks, same set as CMake), `www_source/Makefile:11-20` (`install:` runs the same generator chain, then `cp` + `chmod 755`). Not used by CMake but still in the tree and a drift risk (the Makefile also installs the same `.tcl` links to `/www/pda/extern`, commented out).

### 4.2 `www_source/CMakeLists.txt` - target `webui-www-source-assets`

Sequence (`www_source/CMakeLists.txt:2-23`), executed with `chdir` into `www_source`, using `OPENCCU_TCLSH_EXECUTABLE` and `OPENCCU_PYTHON_EXECUTABLE`:

1. (disabled) `check_CheckOnlyFiles.tcl` - JSLint of `jsCheckOnlyFiles.txt` (`:2`, commented out; `jsl` not in toolchain).
2. `create_webui_js.tcl` -> `webui.js`; `utf82ansi.py webui.js`; `copy_if_different` to `${ROOTFS_DIR}/www/webui/webui.js`.
3. `create_style_css.tcl` -> `style.css`; `utf82ansi.py`; copy to `${ROOTFS_DIR}/www/webui/style.css`.
4. `create_devdb_tcl.tcl` -> `DEVDB.tcl`; `utf82ansi.py`; copy to `${ROOTFS_DIR}/www/config/devdescr/DEVDB.tcl`.
5. `rm -f` of all intermediate/output files in the source tree (`webui.js`, `style.css`, `DEVDB.tcl`, `*_tmp`, `devdescr.js`, `st_values.js`) (`:14-22`). Note `resource.js` is not in that cleanup list.

The built `webui.js`/`style.css` are NOT in `src/webui/www/webui` in git; they exist only in the image rootfs. `style.cgi` reads `$DOCUMENT_ROOT/webui/style.css` at request time (`style.cgi:17`).

### 4.3 Generators (`www_source/*.tcl`)

| Script | Input | Output | Notes |
| --- | --- | --- | --- |
| `create_webui_js.tcl` (51 lines) | `jsfiles.txt` | `webui.js` | `source`s the three generators below first (`:12-14`); strips `#` comments from the list with `regsub` (`:23`), reads each file as ISO-8859-1 (`:36`), appends, writes. JSLint and jsmin lines are commented out (`:32`, `:45`) - **bundle is not minified**. |
| `create_resource_js.tcl` (63 lines) | `resources.txt` | `resource.js` | Turns each `webui/resource/*.jst` template into a JS string assignment: `NAME = "...";` with escaping of `\r \n \t / \ " '` (`:35-45`); only type `STRING` is supported (`:25-31`). 9 templates (`resources.txt:6-14`). |
| `create_devdescr_js.tcl` (135 lines) | `config/devdescr/*.tcl` (hundreds of per-device files) + optional `config/js/jsDevDescr.js` | `devdescr.js` | Sources each device `.tcl` (`TYPE`, `DESCRIPTION`, `PATHLIST`, `P`) and emits `DEV_LIST`, `DEV_DESCRIPTION`, `DEV_PATHS`, `DEV_HIGHLIGHT` JS globals (`:99-135`). Appends the hand-written JS part up to the `//<.` marker (`:123-131`). Also defines Tcl `DEV_getImagePath` (`:38`). |
| `create_st_value_js.tcl` (68 lines) | `../www/config/stringtable_de.txt` (+ `../../devicetypes/st_values.js`, which does not exist in this tree) | `st_values.js` | Emits `elvST['ctx'] = 'value';` per tab-separated line, skipping untranslated `<...>` values (`:34-39`); contains a latent bug (`close $stfile` vs `$stFile`, `:57`). |
| `create_style_css.tcl` (35 lines) | `cssfiles.txt` | `style.css` | Plain concatenation (ISO-8859-1 in). |
| `create_devdb_tcl.tcl` (117 lines) | `config/devdescr/*.tcl` | `DEVDB.tcl` | Server-side Tcl device DB, installed to `/www/config/devdescr/DEVDB.tcl`. |
| `check_CheckOnlyFiles.tcl` (28 lines) | `jsCheckOnlyFiles.txt` | - | Lint-only list of the 24 translation files (`www/webui/js/lang/{de,en}/*.js`) that are NOT in `webui.js`; they are delivered separately. |
| `utf82ansi.py` | file | same file | Re-encodes in place from UTF-8 (errors ignored) to ISO-8859-1; **data loss for characters outside Latin-1** is silent (`errors="ignore"`). |

Important encoding facts:

- All sources are ISO-8859-1 (umlauts appear as `\xe4` etc. in the source; header comments in `.tcl` and `.js` files are mojibake when read as UTF-8). The Tcl generators set `encoding system utf-8` but convert input with `encoding convertfrom iso8859-1` and write with the system encoding; `utf82ansi.py` then fixes the output to ISO-8859-1. The `Content-Type` of the page is `charset=iso-8859-1` (`rega/www/index.htm:11`, `style.cgi:50`).
- Translation files are fetched with `contentType: "application/x-www-form-urlencoded;charset=ISO-8859-1"` (`loadTextResource.js:~118`).

### 4.4 Inputs of `webui.js`

`jsfiles.txt` (218 lines) is the single manifest (about 200 effective JS files, concatenated in order, section 3.3). `cssfiles.txt` (28 lines) lists `ise/style/style.css`, 6 `config/css/ic_*.css`, and 15 `webui/css/*.css` (last: `x_style.css`, 702 `$_()` placeholders - see 5.2). Two CSS files exist but are not in `cssfiles.txt`: `webui/css/menu.css`, `popup.css`, `table.css` (present in the directory, never bundled - candidates for dead code; verify before deleting).

### 4.5 Bootstrap build (`src/webui/bootstrap`)

Separate, manual, npm-based pipeline, intentionally not part of the image build (`bootstrap/README.md:11-13`):

- `package.json:8-14` pins exact versions: `@popperjs/core 2.11.8`, `bootstrap 5.3.8`, devDependency `sass 1.78.0` (matching Bootstrap's own Sass version to avoid deprecation warnings, `README.md:21-24`).
- `update.sh:19-45`: `npm install`; copies `bootstrap.bundle.min.js(.map)` unmodified to `www/webui/js/extern/`; compiles `www/webui/scss/main.scss` with `sass --style=compressed` in a temporary copy of the webui layout (so that relative `../node_modules` imports and source-map paths stay valid) and copies `main.min.css(.map)` to `www/webui/css/extern/`.
- Reproducible: `node_modules`/lockfile not committed; byte-identical output claimed for unchanged versions (`README.md:34-36`).

## 5. Theming and CSS structure

### 5.1 CSS layers (cascade order in `pages/index.htm`)

1. Extern widget CSS (datepicker, powertip, jqplot, msdropdown, spectrum, jQuery UI smoothness, timepicker) - `index.htm:17-21,60-61`.
2. `css/extern/main.min.css` - full Bootstrap 5.3.8 CSS (249 KB; `main.scss` ends with `@import ".../bootstrap"` = "Option A: all of Bootstrap", `main.scss:69`), with `$primary: #192c6e`, `$secondary: #89989b` (`main.scss:11-12`), `$line-height-base: 1.2`, `$hr-opacity: 1.0`, `$headings-font-weight: bold` (`main.scss:40-46`), and custom theme colours `webui-active/-attention/-background/-okSignal/-warnSignal/-borderColor` merged into `$theme-colors` (`main.scss:34-41`), with matching `*-text-emphasis/bg-subtle/border-subtle` entries for light and dark mode (`main.scss:55-65`).
3. `css/extern/hmBootstrap.css` (55 lines) - reverts Bootstrap defaults that would break the legacy layout: `box-sizing: revert` on `*` (:5-9), `margin: revert` on form controls (:11-17), heading `margin-top: revert` (:19-25), `line-height: initial` for `#header,.UIFrameContent` (:27-30), `.FooterButton {box-sizing: content-box}`, `border-collapse: separate` for `#header/#content/#messagebox` tables (`:36-41`), `.popupTable` border inheritance (:47+).
4. `/webui/style.cgi` - the concatenated legacy `style.css` after `$_()` substitution (loaded LAST so it overrides everything above).

Consequence: Bootstrap Reboot is active (global `*{box-sizing:border-box}` etc.), and `hmBootstrap.css` is a growing list of compensations. Any new Bootstrap usage competes with legacy selectors in `x_style.css` which use element/ID selectors (`* { font-family: Verdana...; font-size: 12px }` at `x_style.css:1-4` hard-sets all fonts).

### 5.2 Colour templating

- `style.cgi` (Tcl, 40 lines; `#!/bin/tclsh`): reads `color.map` (`SYSTEM_COLOR_FILE`, `style.cgi:30`), optionally overrides with `/etc/config/color.map` (`USER_COLOR_FILE`, `:33`), reads `style.css`, `subst -nobackslashes -nocommands` against the array `_`, responds `Content-Type: text/css; charset="iso-8859-1"` (`:48-50`). Runs on every page load (CGI -> Tcl interpreter), no caching logic of its own.
- `color.map` (`www/webui/color.map`): 17 named colours (`active #3678c9`, `background #192c6e`, `clickable #89989b`, `okSignal #00c300`, `warnSignal #ffff00`, `channelHighlight #cc6600`, ...). Duplicated conceptually in `main.scss` for Bootstrap (`webui-*` colours) - two sources of truth for the same palette.
- Placeholder usage: `$_(name)` appears about 940 times in `www_source` CSS (`x_style.css` 702; `mainmenu.css` 25; `channelchooser.css` 21 ...).
- Note: `JS` also reads colours via `WebUI.getColor("white")` (`webui.js:~120`), so colours leak into script as well.

### 5.3 Layout model

Fixed-size absolute layout driven by JS: `WebUI.onResize()` sets pixel `width/height` of `#body`, `#header`, `#menubar`, `#content`, `#footer` (`webui.js:31-52`) from constants `HEADER_HEIGHT 72`, `MENUBAR_HEIGHT 34`, `FOOTER_HEIGHT 47`, `BOTTOM_HEIGHT 27`, `MIN_WIDTH 750`, `MIN_HEIGHT 400` (`webui.js:7-12`). Viewport meta is fixed `width=1024`. No responsive design, tables are used heavily for layout (e.g. main menu generated as `<tr>/<td>` rows, `mainmenu.js:~40`).

## 6. Third-party libraries (versions verified from file headers)

Under `src/webui/www/webui/js/extern/` unless noted.

| Library | File | Version | Notes |
| --- | --- | --- | --- |
| jQuery | `jquery.js` | 3.4.1 (min) | Used by shell; has known CVEs (< 3.5.0, XSS in `htmlPrefilter`). |
| jQuery (old) | `jquery_lastVersion.js` | 1.8.2 | Not loaded in the shell pages inspected; legacy fallback. Verify use before removal. |
| jQuery UI | `jquery-ui.min.js` | 1.12.0 (2016-08-12) | CSS: `smoothness/jquery-ui.min.css` 1.12.0; further CSS copies 1.10.3 / 1.10.4 custom (unused duplicates). |
| jQuery UI Timepicker | `jquery.ui.timepicker.js` | 0.3.1 | CSS link says `?v=0.3.2` (`index.htm:61`). |
| Prototype | `prototype.js` | 1.6.0.2 (2008), locally modified ("Changes made b...", header) | Core object system. |
| script.aculo.us | `scriptaculous.js`, `builder.js`, `effects.js`, `dragdrop.js`, `slider.js` | 1.8.1 (2008) | |
| Knockout | `knockout.js` | 2.3.0 | Very old (current is 3.5.x). |
| Bootstrap (bundle incl. Popper) | `bootstrap.bundle.min.js` | 5.3.8 (Popper 2.11.8) | Via `bootstrap/package.json`. |
| jqPlot | `jquery.jqplot.min.js` + plugins | 1.0.8r1250 | Plugins: barRenderer, canvasAxisTickRenderer, canvasTextRenderer, categoryAxisRenderer, cursor, dateAxisRenderer, enhancedLegendRenderer, highlighter, markerRenderer. |
| excanvas | `excanvas.js` | (Google, 2006) | IE<9 fallback only (`index.htm:67`). |
| iro.js | `iro.js` | 5.5.2, modified by eQ-3 (Nov 2022) | Colour wheel, MPL-2.0. |
| Spectrum colour picker | `spectrum.js` | 1.7.0, modified by eQ-3 (05/2015) | CSS `spectrum.css`. |
| roundSlider | `css/extern/roundslider.css` | 1.6.1 | JS part not present in `extern/` (only CSS; check whether loaded elsewhere). |
| PowerTip | `jquery.powertip.js` | 1.1.0 | |
| BlockUI | `jquery.blockUI.js` | 2.66.0-2013.10.09 | |
| jQuery Form | `jquery.form.js` | 3.50.0-2014.02.05 | |
| MSDropDown | `jquery.dd.min.js` | 3.5.2 | `css/extern/msdropdown/` |
| Purl URL parser | `jqueryURLPlugin.js` | 2.3.1 | `jQuery.url().param('lang')` used by `getLang()` (`loadTextResource.js:68+`). |
| json2 | `json2min.js` | (Crockford) | Polyfill, unnecessary on modern browsers. |
| TrimPath Template | `template.js` | 1.1.2 | |
| wz_jsgraphics | `wz_jsgraphics.js` | 3.00 | |
| nfs_datepicker | `nfs_datepicker.js` | unversioned | |
| Tigra slider | `sliderControl.js` | 1.0 (2006) | |
| LESS | `less.js` | 1.3.3 | Contains `alert("lade less");`; not loaded in shell pages inspected. |
| jqPlot.cursor (non-min) | `jqplot.cursor.js` | non-min variant, also `.min.js` present | |

No `package.json`/lockfile covers the app libraries; they are vendored copies. Only Bootstrap/Popper/Sass are managed (`bootstrap/`).

## 7. Bootstrap 5 integration status and intended use

State:

- Added in commit b9ce345d (#155; `hmBootstrap.css`) and tooling in 94bb4ab3 (#156); "rely on HTTP cache headers" 7d8dbddf (#157); latest commit 030dba79 (ReGaHss binaries).
- Loaded only in `rega/www/pages/index.htm` (`main.min.css:69`, `hmBootstrap.css:70`, `bootstrap.bundle.min.js:27`). NOT loaded in `login.htm`, `logout.htm`, `CfgTool/index.htm`, `pda`, or `notready.html`, although `login.htm:15` / `index.htm:5-6` carry "Required meta tags for bootstrap" comments.
- No JS/HTML in the repo references `bootstrap.*`, `data-bs-*`, or `new bootstrap.X(...)` (`grep` over `src` finds only the index.htm links). The only declared consumer is documented in `bootstrap/README.md:30`: "the DutyCycle and CarrierSense bars" (`showDutyCycle` at `ise/js/functions.js:2582`, `showCarrierSense` at `:2686`, called from `WebUI.onResize` `webui.js:~46-50`). `webui.css:154` still has a `progress::-moz-progress-bar` rule with the legacy colour `#3678c9`.
- `main.scss` compiles ALL of Bootstrap (`@import ".../bootstrap"`, `main.scss:69`; "Option B" partial imports are commented out, `main.scss:18-32`), so the CSS payload is 249 KB (+ 56 KB map) while only a tiny part is used.

Intended usage (inferred from README/SCSS):

- Per README: Bootstrap is meant as an additive framework for NEW or modernised UI parts; `main.scss` is the single customization point (variables, colours from the WebUI palette -> `webui-*` theme colours and `.btn-webui-*`, `.bg-webui-*`, `.text-bg-webui-*` utility classes via `$theme-colors`).
- `hmBootstrap.css` is the compat layer: "Place all our bootstrap related style fixes into this file" (`hmBootstrap.css:1-3`). It neutralises Reboot for the legacy DOM (box-sizing, margins, line-height, table border-collapse).
- Because Bootstrap 5 does not need jQuery, the bundle can be used with the vanilla `bootstrap.Modal/Tooltip/...` APIs even though the page has jQuery 3.4.1; Bootstrap 5.3.8 JS requires modern browsers (no IE).
- Dark mode scaffolding exists (`$enable-dark-mode` branch, `main.scss:59-64`) but is not wired to any `data-bs-theme` attribute.

## 8. Other in-scope modules

### 8.1 `src/webui/scripts`
- `libfirewall.tcl` (632 lines) and `setfirewall.tcl` (16 lines): Tcl firewall configuration (reads `/etc/config/firewall.conf`, `libfirewall.tcl` header; `setfirewall.tcl:4-9` loads config and configures iptables, logs via `logger -t firewall`). Installed to `/lib/libfirewall.tcl` and `/bin/setfirewall.tcl` (`scripts/CMakeLists.txt:4-5`). Server-side only, used by the firewall configuration dialog (`dialog/firewallconfigdialog.js`) through the Tcl/JSON-RPC layer; no frontend relevance beyond that UI.

### 8.2 `src/webui/CfgTool`
- A separate legacy configuration web app: `index.htm` (158 lines, own `<script>` list at `:12-25` including `prototype`, `scriptaculous`, `wz_jsgraphics`, `template`, `nfs_datepicker`, `sliderControl`, `style.cgi?_version_=1.600pre1`), Tcl CGI runtime (`cgi.tcl` 2708 lines - a vendored Tcl CGI library, `common.tcl`, `session.tcl`, `user.tcl`), `serviceMessages.cgi`, `config/*.cgi` (popup editors), `configapp/*.cgi` (`metadata.cgi`, `deviceLoader.cgi`, `cp_settings.cgi`, `configfile.tcl`, ...). Uses Prototype `Ajax.Request` calls like `/configapp/metadata.cgi` (`www_source/CfgTool/system.js:~6-10`, bundled into `webui.js`). Does not use jQuery or Bootstrap; `style.cgi` shared with the WebUI.
- Note: `CfgTool/` is NOT referenced by `src/webui/CMakeLists.txt` in this tree; verify in the top-level CMake whether it is installed (outside scope).

## 9. Coupling to server-side Tcl / ReGa

| Coupling | Evidence |
| --- | --- |
| HTML shell pages are ReGa script templates (`<% ... %>`) evaluated by ReGaHss: `system.LoginPage(...)`, `Call("/esp/system.fn::CheckUserFavorite()")` | `rega/www/index.htm:9-12`, `rega/www/pages/index.htm:8` |
| Globals required by bundle (`SessionId`, `userId`, `PLATFORM`, UPL) are injected server-side into inline scripts | `pages/index.htm:73-206`; `homematic.js:13` uses `getSessionId()` |
| JSON-RPC over HTTP to `/api/homematic.cgi` (Tcl CGI + `www/api/methods`) with `_session_id_` param, sync or async | `webui/js/homematic.js:7-22,28`; `common/jsonrpc.js`; `www/api/homematic.cgi`, `www/api/methods.conf` |
| Many pages call ReGa-backed methods directly, e.g. `User.getUserFirstName`, `User.getLanguage`, `CCU.getStickyUnreachState`, `Interface.getParamset` | `webui.js:~78-88`, `viewmodels.js:~40` |
| Legacy `.cgi` Tcl endpoints returning HTML fragments (e.g. `/config/ic_deviceparameters.cgi?sid=...&iface=...&address=...`) are inserted into `#content` | `viewmodels.js` (commented block ~100-110), `www/config/ic_*.cgi` |
| HTML fragments from `rega/www/pages/tabs/**` (ReGa `.htm`) fetched via `Ajax.Request` and patched with `String.replace`/regex (e.g. rewriting `loadChannels(...)` calls) | `viewmodels.js` `operateVirtualDevice` |
| Menu definitions fetched as text and `eval`-ed per user power level | `mainmenu.js:32-33`, `js/mainmenu/{admin,user}.js` |
| Translation text via synchronous XHR from `/webui/js/lang/<lang>/*.js` (12 files per language, ~330 KB per language); the language is read from the DOM attribute `#header[lang]` (server-rendered), then browser language fallback | `loadTextResource.js:68-103,106-134` |
| `style.cgi` is a Tcl CGI on the critical rendering path | `style.cgi:17-50` |
| Device descriptions/string tables generated from Tcl at build time and embedded in the bundle; DEVDB.tcl installed for server | `create_devdescr_js.tcl`, `create_st_value_js.tcl`, `create_devdb_tcl.tcl` |
| Shared Tcl helper files are symlinked into several web roots (`cgi.tcl`, `common.tcl`, `session.tcl`, `once.tcl`, `user.tcl`) | `CMakeLists.txt:9-31` |
| Event refresh by polling (`iseRefresher`, cycle 3, `checkDutyCycleInterval = 60`) | `webui.js:~90-95` |

## 10. Internationalisation mechanism

- Languages: `de`, `en` (`getAvailableLang()` in `loadTextResource.js`, ~line 40-ish: `["de","en"]`; default `en`). Dictionary files: `www/webui/js/lang/{de,en}/translate.lang*.js` (12 each; `stringtable` and `extension` are the largest, ~100 KB and ~80 KB), populating the global `langJSON[lang][key]` and `HMIdentifier[lang]`. `loadTextResource.js:1-2` initialises the two globals; `:106-134` `loadTextResource()` loads all 12 files with synchronous `jQuery.ajax` (`async: false`) and is invoked immediately on script load (last statement of the file).
- Language selection `getLang()` (`loadTextResource.js:68-103`): URL param `lang=` (via Purl) -> `#header` `lang` attribute index into `["auto","de","en"]` -> browser language -> default.
- Markup uses placeholders `${key}`. `setTextContent()` in `translate.js` (top of file) walks all text nodes in `#header, #menubar, #content, #footer` (or a given container), replaces `${key}` occurrences in the parent's `innerHTML` (so it re-parses HTML and destroys event handlers on the element's children), and then shows `.j_translate` elements. It also treats text nodes matching `room[A-Z]`/`func[A-Z]` as keys.
- Helper API: `translateKey(key)`, `translateString`, `translatePage`, `translateButtons`, `translateAttribute`, `translateJSTemplate(container)` (translates `[name]` attributes because TrimPath uses the same `$` placeholder syntax), `translateAndSetImage` (images under `/ise/img/lang/<lang>/`), `showHelp`.
- Missing keys: the key itself is returned (`translateKey`), no logging.
- Legacy additional string sources: `elvST` from `stringtable_de.txt` (device string table), `www/config/easymodes/js/ic_translate.js`, German strings embedded in Tcl.
- Obstacles: global mutable dictionaries, loading blocks the main thread (12 sync XHR x language), no pluralisation/formatting, keys are free-form, translation relies on post-render DOM rewriting, dictionary files are ISO-8859-1 encoded.

## 11. Observations: risks and obstacles for renovation

1. Encoding: ISO-8859-1 throughout (sources, generated bundle, HTTP charset, `utf82ansi.py` with `errors="ignore"`). Any modern toolchain (Vite/webpack/esbuild, UTF-8 CSS/JS) needs a one-time transcoding of 700+ files and a change of `<meta>`/`Content-Type` headers, including `style.cgi` and translation XHR content type.
2. No module boundaries: everything is a global; concatenation order in `jsfiles.txt` is the dependency graph; Prototype and jQuery both own idioms; duplicated entry in `jsfiles.txt` (`creatediagrampage.js`); legacy `ise/js/functions.js` (>2,700 lines) is an implicit dependency of most pages.
3. Server-rendered shell: the shell pages are ReGa templates; the bundle depends on server-injected globals. A new frontend must either keep the ReGa-rendered `index.htm` or replace those globals with an explicit bootstrap JSON endpoint.
4. Synchronous XHR everywhere (`homematic()` without callback, `loadTextResource`, `HttpLoader.getText`, `eval` of menu files) - blocks UI, deprecated in browsers' main thread.
5. Runtime CSS templating via Tcl CGI on every load; palette also duplicated in `main.scss`. Replacing with CSS custom properties is feasible (Bootstrap 5.3 already emits `--bs-*` variables) but `style.cgi` also supports per-device user overrides (`/etc/config/color.map`) that must be preserved or migrated.
6. CSS: 8,717 lines of legacy CSS, ~940 `$_()` placeholders, global `* {font-size:12px}` (`x_style.css:1-4`), absolute pixel-based layout with JS-driven sizing (`webui.js:31-52`), fixed `width=1024` viewport, table layout. This conflicts directly with Bootstrap Reboot/grid; `hmBootstrap.css` already needs reverts. Unbundled CSS (`menu.css`, `popup.css`, `table.css`) suggests dead code.
7. Aged libraries with known weaknesses: jQuery 3.4.1 (XSS CVEs fixed in 3.5.0), jQuery UI 1.12.0, Prototype 1.6.0.2 / script.aculo.us 1.8.1 (2008), Knockout 2.3.0, jqPlot 1.0.8. Several libraries are locally modified (Prototype header "Changes made...", iro.js, spectrum.js) so they cannot be upgraded blindly.
8. Bootstrap is loaded but barely used; costs 249 KB CSS + 80 KB JS in every shell load and increases CSS conflicts. Reduce by switching `main.scss` to Option B partial imports (already templated in comments at `main.scss:18-32`).
9. Build uses Tcl + Python scripts executed inside the CMake image build; `webui.js` and `style.css` are not tracked in git, so the app cannot be run from the source tree without the generator step (and a ReGa/Tcl runtime). Legacy Makefiles (`src/webui/Makefile`, `www_source/Makefile`) duplicate CMake logic (drift risk). No tests, linter disabled (`jsl`).
10. Device-specific UI is spread across `dialog/*`, `ise/js/ise*.js`, `config/js/ic_*`, `www/config/easymodes` and Tcl-side device descriptions; adding or restyling a device UI touches several languages (JS, Tcl, `.htm`).
11. Menu definitions are JS expressions with function literals (not data), so they cannot be converted to JSON or generated without refactoring.
12. `CfgTool` is an independent second web app that shares `style.cgi`, Prototype, and part of `webui.js` code (`system.js`); renovation of the shared CSS affects it.

## 12. Renovation options (derived from the above, not from existing plans)

| Option | Fits with | Cost drivers |
| --- | --- | --- |
| A. Incremental: keep SPA shell and bundle, use Bootstrap 5 for new/restyled widgets (dialogs, buttons, forms, progress bars, tooltips replacing powertip), trim `main.scss` to needed Bootstrap parts, extend `hmBootstrap.css` | Already prepared (#155-#157); lowest risk | Legacy global CSS conflicts, no dark mode without wiring `data-bs-theme`, two class systems side by side |
| B. Replace theming first: turn `$_()`/`color.map` into CSS custom properties (generated by `style.cgi` or a static file), unify with Bootstrap `--bs-*` variables | Gives user-defined colours + Bootstrap theme from one source | `x_style.css` 702 placeholders, interplay with `/etc/config/color.map` |
| C. Modernise build: introduce a bundler (UTF-8 conversion, ES modules in dependency order of `jsfiles.txt`, minification, hashed assets) while keeping Tcl/ReGa endpoints | Removes `utf82ansi.py`, enables tree-shaking | Global-namespace code needs shims (`window.X = ...`), Prototype `$` vs jQuery |
| D. Page-by-page rewrite behind the existing menu/routing (`WebUI.enter`) using a modern framework mounted in `#content`, reusing the JSON-RPC `homematic()` API | Allows gradual replacement; page classes have a small interface (`IPage`: enter/leave/resize) | Needs an adapter for globals (`SessionId`, `ConfigData`, `DeviceList`), translation (`langJSON`), event refresher; fixed 1024px layout assumptions |
| E. New front end with a clean API layer (JSON instead of HTML fragments from `.cgi`/`.htm`, i18n via JSON/ICU, async only) | Best long-term | Largest scope; many ReGa-rendered HTML endpoints (`pages/tabs/**`, `config/ic_*.cgi`) and device-specific dialogs must be re-implemented |

Suggested preparatory steps independent of the option: (1) decide on UTF-8; (2) inventory which of `jquery_lastVersion.js`, `less.js`, `roundslider.css`, duplicate jQuery UI CSS copies, `menu.css`/`popup.css`/`table.css` are dead; (3) replace sync XHR in `loadTextResource`/`homematic` default path; (4) trim Bootstrap to used components; (5) confirm via runtime test which pages actually render Bootstrap classes.

## 13. Open items / not verified

- Whether `CfgTool/` and `www/webui/error/notready.html` are installed by the top-level CMake (only `src/webui/CMakeLists.txt` was read).
- Actual consumers of Bootstrap classes in DutyCycle/CarrierSense: `showDutyCycle` (`ise/js/functions.js:2582`) only manipulates existing elements (`#dutyCycleProgress`, `#dutyCycleProgressBar`, `#dutyCycleVal`, `#partingLine1`, lines ~2599-2603) and calls `homematic("Interface.listBidcosInterfaces", ...)`; the markup lives in server-delivered start page fragments (`rega/www/pages/tabs/startpage.htm`, not read). No `data-bs-` markup was found by grep in `rega`/`www`.
- `css/extern/roundslider.css` (v1.6.1) is referenced nowhere in `src/webui` (CSS only, no JS) - dead asset candidate.
- Exact line numbers marked with `~` were taken from short excerpts and may be off by a few lines.
- `www/webui/js/extern/jquery_lastVersion.js` and `less.js` references from pages other than `pages/index.htm` were not searched exhaustively.
