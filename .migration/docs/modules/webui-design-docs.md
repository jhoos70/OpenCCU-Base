# Module: webui design assets and documentation tooling

Scope: `src/webui/design` (166 files, 13 MB) and `src/webui/documentation` (104 files, 1.4 MB).
Both directories are archival, not shipped. Neither is referenced from any build file or from the UI sources (evidence below). Both were added in a single import commit ("Add webinterface source", 2025-05-09, `git log -- src/webui/design src/webui/documentation`); `design` was last touched 2026-06-19 (marker clean-up commit f4814340).

## 1. Summary

| Directory | Files | Nature | Consumed by build/UI? |
|---|---|---|---|
| `src/webui/design` | 166 | 2009-era designer source files (Photoshop PSD, GIMP XCF), colour-scheme Word documents, mockup JPGs, legacy PNG/GIF icon drafts, two 7z archives of the original artwork delivery | No. Source artwork only. Final images were copied by hand into `src/webui/www/**/img`. |
| `src/webui/documentation` | 104 | Vendored JsDoc Toolkit 2.1.0 (Rhino/Java based JavaScript API doc generator) plus a Tcl driver script | No. Manual developer tool; output is not committed. |

There is no end-user documentation and no help text in either directory (no Markdown, HTML manuals, i18n string files). The only human-readable prose is German-language design briefs inside binary `.doc`/`.pdf` files.

## 2. Evidence that nothing consumes these directories

- `grep -nE "design|documentation|jsdoc"` over `/home/standard/dev/OpenCCU-Base/CMakeLists.txt`, `Makefile`, `src/webui/CMakeLists.txt`, `src/webui/Makefile` returned only unrelated hits (`src/webui/www/pda/CMakeLists.txt:18`, `src/webui/www/pda/Makefile:32-35` mention `www/pda` Tcl symlinks, not `design`). `src/webui/www_source/CMakeLists.txt` and `Makefile` were also checked (no hit).
- Repo-wide grep (excluding .git, bin, devdescr, documentation) for `farbschema|HomeMatic_Icons|jsdoc-toolkit|createdocu|webui/design` found no references in any build, script or source file.
- `src/webui/www_source/cssfiles.txt` and `jsfiles.txt` list only `ise/`, `config/`, `webui/` sources; no path into `design/`.
- No image files exist in `www_source/` (outside devdescr); images ship from `src/webui/www/**/img` (copied verbatim, not generated from design).

## 3. src/webui/design

### 3.1 Layout and formats

| Path | Files | Formats | Content |
|---|---|---|---|
| `design/` (root) | 24 | 12 PSD, 4 XCF, 5 GIF, 1 JPG, 2 7z | Photoshop/GIMP sources for UI elements (see 3.2) |
| `design/farbschema/` | 7 | 2 DOC, 5 JPG | Colour-scheme specification and colour-applied screen mockups |
| `design/farbschema/veraltet/` ("obsolete") | 5 | 1 PDF, 4 JPG | Earlier colour-scheme variants S1/S2, sketches 1 and 2 |
| `design/old/` | 37 | 26 PNG, 10 JPG, 1 XCF | First-generation ise icons: door, lock, window, arrows, buttons yes/no, cog, play, warning, up/down; dimmer glyphs `d0_{0,25,50,75,100}` and `d1_*` in PNG and JPG pairs (20 files) |
| `design/old/pda/` | 70 | 58 PNG, 8 JPG, 4 GIF | Small icons for the PDA/mobile UI (see 3.3) |
| `design/pda/` | 2 | 2 DOC | PDA design proposals (`hm_webui_pda.doc` 1.5 MB, `hm_webui_pda_design.doc` 2.3 MB), "HomeMatic WebUI PDA Designvorschlag", written by eQ-3 Entwicklung GmbH, Leer (contact in letterhead) |
| `design/pda/img/` | 7 | PNG | Screenshots/mockups of PDA pages: `startseite`, `login`, `logout`, `fehler`, `geraete_dimmer`, `favoriten_uebersicht`, `systemvariable` |
| `design/pda/img/large/`, `small/` | 7 each | 6 PNG + 1 XCF each | PDA chrome slices: `button`, `title`, `status_top`, `status_bottom`, `status_line`, `system_button`; XCF masters `webui_pda_big.xcf` (363 KB) and `webui_pda_small.xcf` (42 KB) |

Totals: PNG 103, JPG 28, PSD 12, GIF 9, XCF 7, DOC 4, 7z 2, PDF 1 = 166.

### 3.2 Root artwork (`design/*`)

- Photoshop sources: `Bedienbuttons.psd` (868 KB), `big_uncertain.psd`, `btn_fav_up.psd`, `btns_gray.psd`, `button_Vorlage_1.psd`, `button_Vorlage_2.psd`, `hm-logo.psd`, `loading.psd`, `percentinput.psd`, `slider_bg.psd`, `slider_bg_old.psd`, `smallbuttons.psd`.
- GIMP sources: `HomeMatic_Icons.xcf`, `ajaxload.xcf`, `button.xcf`, `dots.xcf` (plus `old/HomeMatic_Icons.xcf` older revision, `pda/img/*/*.xcf`).
- Bitmaps: `ajaxload.gif`, `loading.gif` (spinners), `logged.gif`, `usable.gif`, `visible.gif` (status indicators), `homematic_logo_small_gray.jpg`.
- Archives (need `7z`): `Neue Bilddaten WebUI.7z` (874 KB, 164 files, 6 folders, dated 2009-03..05; contains `ise img neu/` and `config img neu/`, e.g. `window_open_h.png`, `window_open_v.png`, `wnd_closed0.png`, `wnd_closed1.png`, `wnd_openh0.png`, `wnd_openh1.png`, `wnd_openv0.png`, `wnd_openv1.png`, `working.png`, `loading.psd`) and `weitere.7z` (38 KB, 10 files dated 2009-06-05: `dot_gray/green/red/yellow.gif`, `loading.gif`, `ajaxload.png`, `homematic_logo_small{,_red}.jpg`, `loading.psd`, a light-grey-background variant). These are the raw delivery from the graphic designer; contained names match files now in `www/ise/img` (`dot/`, `window/`, `ajaxload.gif`).

### 3.3 old/pda icon inventory (70 files, by group)

winmatic 8; smallbutton 6; shutterctrl 6; keymatic 5; slider 4 (GIF left/right, normal and green); shuttercontact 4; uncertain 2; biguncertain 2; openh 2; openv 2; locked 2; closed 2; check on/off 2; danger on/off 2; coloured status dots 4 (red/green/yellow, favorite-box); single icons: bell, door, enter, disp_enter, lamp, open, phone, scene, shutter, stop, switch, program-active / program-not-active / program-start, long-press / short-press (JPG), event_interface (JPG). Suffix `0`/`1` denotes two visual variants. All files are tiny (230 B to 1.9 KB) raster icons.

### 3.4 Colour-scheme documents (`design/farbschema`)

German Word 97 documents, author ELV AG / eQ-3 (document metadata):
- `HomeMatic Farbtabelle.doc` (42 KB): table of named colours with RGB and hex. Values extracted via `strings`:

| Name | Hex | Role |
|---|---|---|
| Hintergrund | `#182863` | complete page background (rgb 24,44,110) |
| Feste Elemente | `#ffffff` | non-clickable elements, device pictures, wide borders |
| Anklickbare Bereiche | `#5d6373` | clickable areas |
| Aktive Bereiche | `#3678c9` | currently active clickable areas |
| Hintergrund aktiv | `#f0f0f0` | edit-layer background when elements (dim bar, buttons) are editable |
| Hintergrund inaktiv | `#9ba6bf` | edit-layer background when text is editable |
| Dimmer dunkel | `#000000` | 0 % in dim triangle and frame |
| Dimmer hell | `#fcf304` | 100 % in dim triangle, active-button frame while dimming |
| Signal OK | `#00c300` | OK / active-button frame for all non-dim actions |
| Signal Achtung | `#ffff00` | warning |
| Signal Alarm | `#c70022` | alarm |

- `Master Farbuebersicht Web UI.doc` (942 KB): "HomeMatic Web UI - Farbuebersicht (nach Aenderung vom 23.03.2009)", Word doc with embedded Photoshop Elements 5.0 images.
- JPG mockups: `Bedienung_Geraete._neu.jpg` (device operation), `Programme_neu.jpg` (programs page), `Schalter.jpg` (switch), `Tasten.jpg` (buttons), `neuer Slider.jpg`.
- `veraltet/`: `Master Farbuebersicht Web UI.pdf`, `Master_WebUI Farbschema S2.jpg`, `WebUI Farbschema S1.jpg`, `Skizze 1.jpg`, `Skizze 2.jpg` (superseded).

Binary content; only sampled with `strings`, not rendered.

### 3.5 Relationship to shipped assets

- MD5 comparison of all design PNG/GIF/JPG against `src/webui/www/**` raster files: 16 byte-identical matches: `old/door_{open,closed}.png` -> `www/ise/img/door/`, `old/lock_{open,closed}.png` -> `www/ise/img/lock/`, `old/window_{closed,open_h,open_v}.png` -> `www/ise/img/window/`, `homematic_logo_small_gray.jpg` -> `www/ise/img/_homematic_logo_small_gray.jpg`, and the 8 PDA chrome slices `pda/img/{large,small}/{status_top,status_bottom,status_line,title}.png` -> `www/pda/img/{large,small}/`.
- Everything else under design (all PSD/XCF masters, dimmer glyphs `d0_*`/`d1_*`, `old/pda/*`) has no byte-identical shipped copy. Shipped `www/ise/img` holds a different, larger, newer icon population (3.6).
- Shipped colour tokens in `src/webui/www/webui/color.map` (`background #192c6e`, `active #3678c9`, `activeBackground #f0f0f0`, `okSignal #00c300`, `warnSignal #ffff00`, `contentBackground #ffffff`, `clickable #89989b`, `inactiveBackground #bcc7cb`, `inactiveButton #c0c0c0`, `channelHighlight #cc6600`, `channelBackground #ffffff`, `channelBorder #5c7287`, `backgroundStart #89989b`, `backgroundEnd #ffffff`) descend from, but deviate from, the Farbtabelle (background `#182863` vs `#192c6e`; clickable `#5d6373` vs `#89989b`; inactive `#9ba6bf` vs `#bcc7cb`). `src/webui/www/webui/scss/main.scss:38` ("Create our own color.map") relates to it. `src/webui/www_source/cssfiles.txt` lists the shipped CSS sources (`ise/style/style.css`, `config/css/*`, `webui/css/*`).

### 3.6 Context: shipped icon/image inventory (outside strict scope, for renovation planning)

Raster images under `src/webui` (png/gif/jpg/ico, excluding devdescr):

| Category | Path | Count |
|---|---|---|
| Device pictures (large) | `www/config/img/devices/250` | 285 |
| Device pictures (small) | `www/config/img/devices/50` | 280 |
| Coupling glyphs | `www/config/img/devices/{50,250}/coupling` | 12 + 12 |
| ise general UI images | `www/ise/img` (top level) | 58 |
| Weather icons (HmIP-WGD) | `www/ise/img/icons_hmipw_wgd/weather` (+10 top level) | 34 + 10 |
| HmIP-WRCD display icons | `www/ise/img/icons_hmip_wrcd/24` | 31 |
| HM-LC-DW crossfade charts | `www/ise/img/icons_hm_lc_dw` | 24 |
| HM-Dis-WM55 display icons | `www/ise/img/icons_hm_dis_wm55/{24,32}` | 12 + 12 |
| HM-Dis-EP-WM55 | `www/ise/img/icons_hm_dis_ep_wm55/24` | 9 |
| Remote control RC19 | `www/ise/img/rc19` | 12 |
| Characters | `www/ise/img/char/24` | 10 |
| Colour picker | `www/ise/img/color_picker_img` | 9 |
| LAN gateway icons | `www/ise/img/icons_lan_gateways/48` | 5 |
| Language images | `www/ise/img/lang/{de,en}` | 5 + 5 |
| PDA chrome | `www/pda/img/{small,large}` | 6 + 6 |
| jQuery UI "smoothness" theme | `www/webui/css/extern/smoothness/images` | 20 |
| msdropdown | `www/webui/css/extern/msdropdown/{icons,images}` | 14 + 2 |
| window / dot / slider / lock / door / danger / philipsHue | `www/ise/img/<name>` | 4 / 4 / 3 / 2 / 2 / 2 / 1 |

No SVG and no web font (woff/ttf/otf/eot) was found under `src/webui/www*`. All icons are bitmap.

## 4. src/webui/documentation

### 4.1 Layout (104 files)

All under `documentation/js/jsdoc-toolkit/` (one tool; no other doc content):

| Path | Content |
|---|---|
| `README.txt`, `changes.txt` | Upstream readme; changelog top entry "2.1.0" |
| `jsrun.jar`, `jsdebug.jar`, `java/classes/js.jar` | Launcher jars and Mozilla Rhino JS engine (binary) |
| `java/src/{JsRun,JsDebugRun}.java`, `java/build.xml`, `java/build_1.4.xml` | Launcher sources and Ant builds |
| `app/` (run.js, `lib/JSDOC` 15, `frame` 9, `handlers` FOODOC + XMLDOC, `plugins` 7, `t` 2, `test` 40 files) | The JsDoc Toolkit engine, handlers, plugins (`commentSrcJson`, `symbolLink`, `publishSrcHilite`, ...) and the tool's own tests |
| `templates/jsdoc/` | `allclasses.tmpl`, `allfiles.tmpl`, `class.tmpl`, `index.tmpl`, `symbol.tmpl`, `publish.js`, `static/{default.css,header.html,index.html}`: default HTML output template |
| `conf/sample.conf`, `jsdoc.conf` | Config; `jsdoc.conf` is a generated file list |
| `createdocu.tcl` | Project-specific driver |

By extension: js 84, tmpl 5, jar 3, xml 2, txt 2, java 2, html 2, conf 2, tcl 1, css 1.

### 4.2 Project-specific part

`documentation/js/jsdoc-toolkit/createdocu.tcl` (`#!/usr/bin/tclsh`):
- recursively globs `*.js` under `../../../www` (i.e. `src/webui/www`), skipping `../../../www/webui/js/extern`;
- writes `jsdoc.conf` listing those files with options `a: true` (document uncommented functions) and private symbols included; the generated header comment gives the run command `java -jar jsrun.jar app/run.js -c=...`.
The scanned root `src/webui/www` now holds mostly generated/minified output; real JS sources live in `src/webui/www_source` (see `jsfiles.txt`). The script is therefore stale relative to the current layout. No generated HTML output is checked in. No user manual or help text exists here.

### 4.3 Licensing

- `documentation/js/jsdoc-toolkit/README.txt:87-136`: JsDoc Toolkit code is X11/MIT, Copyright (c) 2009 Michael Mathews; bundled Rhino is MPL 1.1 / GPL 2.0 or later.
- Repo-level: `licenses/licenses.md:4` states default HMSL 2.0 (`licenses/HMSL2.txt`); `licenses/licenses.md:19-20` list `src/webui` and `webui` as "Apache 2.0 if not stated otherwise". The vendored jsdoc-toolkit is third-party under its own terms (grep "jsdoc|Rhino" in `licenses/` found nothing).
- Design assets carry no licence header (binary). Under the repo rule they fall under Apache 2.0 / HMSL 2.0. The DOC files originate from eQ-3 / ELV AG (metadata), and the HomeMatic logo (`hm-logo.psd`, `homematic_logo_small_gray.jpg`) is an eQ-3 brand asset; reuse in a renovation warrants a trademark check (hint only).

## 5. Renovation reuse assessment

Reusable:
- Colour tokens: the table in 3.4 plus `www/webui/color.map` give a semantic palette (background, active, clickable, signal ok/warn/alarm, dimmer yellow). Convertible to CSS custom properties / Bootstrap 5 variables (Bootstrap 5 was added in commits b9ce345d, 94bb4ab3).
- Colour semantics: yellow `#fcf304` frame while dimming, green `#00c300` frame for other active actions, red `#c70022` alarm.
- PSD/XCF masters (12 PSD, 7 XCF): the only editable sources for buttons (`Bedienbuttons.psd`, `button_Vorlage_*.psd`, `smallbuttons.psd`, `btns_gray.psd`), sliders (`slider_bg*.psd`, `percentinput.psd`), logo (`hm-logo.psd`), spinners (`loading.psd`, `ajaxload.xcf`). Useful for re-export at higher resolution or redrawing as SVG/CSS; require Photoshop/GIMP.
- Icon drafts `old/*.png` (door, lock, window, arrows, cog, play, warning) and `old/pda/*` show the semantic vocabulary (open/closed, locked/unlocked, shutter 0/100/per, uncertain, danger, program active/start); low resolution, so templates for redrawing rather than direct reuse.
- Mockup JPGs in `farbschema/` and `pda/img/` document intended page layouts (device operation, programs, switch, buttons, PDA start/login/error/dimmer/favorites/system variables).

Not reusable / caution:
- No vector sources, no icon font, no tokens file, no typography spec; the design dirs define no fonts. A renovation must choose fonts and an SVG icon set fresh.
- `design/old/` and `design/farbschema/veraltet/` are explicitly obsolete.
- `documentation/` is a 2009 Rhino-era tool, irrelevant to a renovation (could be replaced by modern JSDoc/TypeDoc or dropped); `createdocu.tcl` path assumption is stale.
- DOC/PDF/7z need external tools (LibreOffice, 7z); 7z content mostly duplicates 2009-vintage shipped `www/ise/img` files.
- The PDA .doc letterheads contain personal contact and company bank details of eQ-3; do not republish verbatim.

## 6. Open points

- Whether shipped images beyond the 16 byte-identical files derive from these PSD/XCF sources was not determined.
- Text of `Master Farbuebersicht Web UI.doc` and `hm_webui_pda*.doc` was only sampled with `strings`; full layout descriptions need a Word-capable reader.
