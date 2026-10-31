# Migration Plan: Retire legacy design sources and JsDoc Toolkit; establish design-token and SVG icon pipeline (webui-design-docs)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: asset-modernization (retire + replace with design-token / SVG pipeline)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | webui-design-docs | primary | index.json | `src/webui/design` (166 files, 13 MB) and `src/webui/documentation` (104 files, 1.4 MB). Archival, consumed by nothing. |
| 2 | webui-shell-build | dependency | module docs | Owns `www_source/{cssfiles,jsfiles}.txt`, `www/webui/color.map` and `scss/main.scss:38`. Natural home for a token build step. |
| 3 | www (shipped assets under `src/webui/www/**/img`) | affected | module docs | Source of the 285 + 280 device bitmaps and the ~400 ise/UI icons. Target of the SVG pipeline. Also the drifted `www/` copy. |
| 4 | webui-config-pages | affected | module docs | Consumes `www/config/img/devices/{50,250}`. Device pictures are a later icon-pipeline candidate. |
| 5 | webui-rega-pages | affected | module docs | Consumes `www/ise/img` icons via the ReGa-served pages. |

---

## Context

### Summary

`src/webui/design` holds 2009-era designer source files: 12 PSD, 7 XCF, 103 PNG, 28 JPG, 9 GIF, 4 Word DOC (German, from ELV AG / eQ-3), 1 PDF and 2 7z archives of the original artwork delivery. `src/webui/documentation` holds a vendored JsDoc Toolkit 2.1.0 (104 files: Rhino JS engine jars, 84 JS files, templates) and one project driver, `createdocu.tcl`. Both were imported in a single commit ("Add webinterface source", 2025-05-09). No build file, script or UI source references either directory. The repository-wide grep for `farbschema|HomeMatic_Icons|jsdoc-toolkit|createdocu|webui/design` found nothing.

Shipped images are bitmaps only. The sets are 285 large and 280 small device pictures, about 58 general ise images, several device-specific icon sets (weather, WRCD, Dis-WM55 and others), the PDA chrome and third-party jQuery UI / msdropdown images. There is no SVG and there are no web fonts under `src/webui/www*`. Only 16 design files are byte-identical to shipped files (door, lock, window, logo, 8 PDA chrome slices). The rest of the design tree has no shipped counterpart. The only reusable intellectual content is therefore:

- the colour semantics in `farbschema/HomeMatic Farbtabelle.doc`;
- the icon vocabulary in `old/` and `old/pda/`;
- the editable masters (PSD/XCF) for buttons, sliders, spinners and the logo.

### Migration Drivers

- The nextGen UI needs a maintainable visual foundation. Bootstrap 5 is already present (commits b9ce345d, 94bb4ab3, 7d8dbddf), but there are no design tokens, no vector icons and no typography spec.
- Colour values have drifted. The shipped `www/webui/color.map` deviates from the designer's Farbtabelle (background `#192c6e` vs `#182863`, clickable `#89989b` vs `#5d6373`, inactive `#bcc7cb` vs `#9ba6bf`). Nothing records which values are authoritative.
- All icons are low-resolution bitmaps (many 230 B to 1.9 KB), which blocks HiDPI rendering, theming (dark mode, recolouring) and the accessibility work needed for a renovated UI.
- 270 dead files (13 MB + 1.4 MB) increase repository weight and audit scope. They include a vendored Rhino/MPL-GPL engine and personal/company data in the PDA .doc letterheads.
- Licence and brand ambiguity. The assets carry no headers, the repo default is HMSL 2.0, `src/webui` is Apache-2.0, and the logo is an eQ-3 brand asset.
- The related technical-debt items on `www/` drift, dead assets and Windows leftovers (technical-debt.md "Duplication / Drift", "Legacy") apply to this area.

### Current State

Archival, non-shipped directories inside the `src/webui` source tree of a Tcl/JS/C++ monorepo. The UI is a Tcl/ReGa-served SPA shell with a CSS build described by `www_source/cssfiles.txt`, built with CMake/Make and GitHub Actions. Images are copied by hand from the designers' delivery into `src/webui/www/**/img`. There is no image build step and no tokens file. `createdocu.tcl` scans `../../../www`, which now holds mostly generated or minified output, so it is stale relative to the `www_source` layout. No generated HTML documentation is committed.

### Cross-Cutting Findings

- technical-debt.md "Duplication / Drift": `www/` is a drifted committed copy of `src/webui/www` (52 + 49 differing files). Any icon pipeline must write to the source of truth (`src/webui/www*`) and never to `www/`.
- technical-debt.md "Legacy": 2008-2009 author headers and hard-coded paths. The design assets are of the same vintage.
- External constraint (summary.md): the sibling OpenCCU repo carries 64 rootfs patches, 41 of them on `webui.js`. The overlay `WebUI-openccu` adds branding in `www/ise/img`. Changing shipped image paths or names under `www/ise/img` breaks that overlay. The pipeline must keep output names and paths stable or be coordinated with that repo.
- testing.md: there are no UI tests. Visual regression of icon and colour changes has no safety net, so the pipeline needs its own checks (token diff, SVG lint, rendered-size checks).
- security.md: no direct security relevance. Removing the vendored Rhino jars (js.jar, jsrun.jar, jsdebug.jar) removes unmaintained binary blobs from the supply chain.
- licenses/licenses.md: the third-party jsdoc-toolkit and Rhino are not listed in `licenses/`. Retiring them closes that gap.

---

## Migration Goal

**Retire the unused 2009 design and JsDoc sources, and replace them with a versioned design-token set and an SVG icon pipeline for the nextGen UI.**

Preserve the knowledge worth keeping (colour semantics, icon vocabulary, a record of what the masters contained) in small, text-based, licence-clear form. Remove everything else from the working tree. Introduce:

1. one authoritative tokens file (the designer's palette reconciled against `color.map`), emitted as CSS custom properties and Bootstrap 5 Sass variables;
2. an SVG icon source folder with an optimisation and sprite or per-icon build step that outputs into the shipped image tree without changing existing bitmap paths;
3. documented provenance and brand/licence status for each retained asset.

---

## Decision

### Approach: Retire-and-replace in four phases (archive, extract, build pipeline, retire)

Phase 0, safety archive and inventory. Before deleting anything, tag the current commit (for example `archive/webui-design-2009`) and, if the maintainers want a binary copy, store one `design-sources-2009.tar.zst` as a release asset or in the Git LFS / external archive, not in the working tree. Record the manifest (file, format, shipped-twin MD5, licence/brand status) as a text file. Do not republish the PDA .doc letterheads (personal contact and bank details of eQ-3).

Phase 1, extract the reusable content.

- Create `tokens/` (location to be decided with webui-shell-build; for example `src/webui/www_source/tokens/tokens.json`). Seed it with the 11 Farbtabelle colours and the 14 `color.map` entries, each with a semantic name, the designer value and the shipped value. For every drifted value the maintainers pick an authoritative one. Record the decision in the file, because the drift is not explained anywhere (open point).
- Emit with Style Dictionary (or an equivalent small script): `:root { --ccu-… }` custom properties and a `_variables.scss` that overrides Bootstrap 5 variables (`$primary` from active `#3678c9`, `$success` `#00c300`, `$warning` `#ffff00`, `$danger` `#c70022`, body background `#182863`/`#192c6e`). Keep `color.map` generated from the same source until the legacy CSS no longer reads it.
- Add the dimmer yellow `#fcf304` and the "active frame" semantics as named tokens.
- Add contrast checks (WCAG AA). Several legacy pairs, such as yellow `#ffff00` on white and `#00c300` on white, will fail and must be handled in the design.

Phase 2, SVG icon pipeline.

- Redraw (not auto-trace) the semantic vocabulary as SVG: open/closed, locked/unlocked, window h/v, door, shutter 0/100/per, uncertain, danger, program active/start, dimmer steps, status dots, spinner, arrows, cog, play, warning. Use `old/` and `old/pda/` and the mockups as templates.
- Where a maintained open-licence set (for example Bootstrap Icons, MIT) covers a generic glyph, prefer it. Redraw only the domain-specific ones (shutter, window states, dimmer, keymatic, winmatic).
- Pipeline: `icons/src/*.svg` -> SVGO (lint and optimise) -> `currentColor`-based per-icon files plus an optional sprite -> `src/webui/www/ise/img/svg/`. Run it from the existing CMake/Make build or a documented npm script so CI can run it. Add a CI check that fails on non-optimised or non-token-coloured SVGs.
- Do not touch the 565 device pictures, the language images or the third-party jQuery UI / msdropdown images in this feature. Device pictures are product photos and are better handled as a separate, optional step (WebP/AVIF re-encode).
- Keep existing bitmap paths in place until the consuming pages migrate (strangler approach). New UI code uses SVG. Legacy pages keep PNG/GIF.
- Hand logo handling to an eQ-3 / OpenCCU branding decision. The logo is not redrawn without written permission.

Phase 3, retire.

- `git rm -r src/webui/documentation` after Phase 0. Nothing references it. Replace it, only if wanted, with a modern generator against `www_source` (TypeDoc/JSDoc via npm devDependency), not vendored files. The default is to drop, since the renovated UI will define its own documentation approach.
- Remove from `src/webui/design`: `old/`, `farbschema/veraltet/`, the `*.7z` archives (duplicates of shipped images, per the open point to confirm), `pda/` (the PDA UI is a legacy target). Keep only the small extracted artefacts from Phases 1-2 (token provenance note, mockup JPGs worth keeping as reference, if licensing allows) under `docs/design/`. PSD/XCF masters move to the archive tag or external storage, since they are large binaries with no diff value.
- Add provenance and brand notes to `licenses/licenses.md`.

**Rationale**: Migration is warranted because: (1) the 270 files are unreferenced, so keeping them has no benefit and costs repo weight, audit scope and a vendored MPL/GPL engine with no entry in `licenses/`; (2) colour values have already drifted between the designer's table and the shipped `color.map`, and the nextGen UI (Bootstrap 5) needs a single authoritative token source; (3) no vector icons or fonts exist, so HiDPI, theming and accessibility cannot be met by the current bitmap-only assets; (4) the sibling repo's overlay and rootfs patches depend on the existing `www/ise/img` paths, which rules out a path-changing big-bang replacement and favours an additive pipeline plus staged retirement.

### Rejected Options

- **Leave as is**: zero risk, but keeps licensing gaps, personal data in binary docs and 14 MB of dead weight, and leaves the palette drift unresolved.
- **Delete without extracting**: loses the only record of colour semantics and the icon vocabulary. The Farbtabelle roles (clickable, active, edit-layer, dimmer, signal) are not documented anywhere else.
- **Auto-trace the old bitmaps to SVG (potrace and similar)**: the sources are 16-48 px icons from 2009. The result is poor quality and inherits unclear provenance.
- **Icon font or web font**: worse accessibility and rendering control than inline/`<use>` SVG, and it adds an extra font licence surface. There is no existing font to preserve.
- **Keep JsDoc Toolkit 2.1.0 and fix `createdocu.tcl`**: the tool predates ES6, is unmaintained, needs a Rhino JVM and is unlikely to parse the new code.
- **Move design/ to a separate repository**: viable fallback if maintainers want the masters kept alive. It adds repo-management overhead for assets with no active use. Prefer an archive tag plus release asset.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | Tcl (driver `createdocu.tcl`), JavaScript (vendored JsDoc), Java (Rhino launcher) | JSON tokens, SCSS/CSS custom properties, SVG; small Node script for the build step |
| Frameworks | None (static binaries: PSD, XCF, DOC, PNG/GIF/JPG); JsDoc Toolkit 2.1.0 + Rhino | Bootstrap 5 (already added), Style Dictionary (or equivalent), SVGO |
| Infrastructure | Hand-copied images; CMake/Make and GitHub Actions without an asset step | Same CMake/Make + GitHub Actions, with one added token/icon build and lint step; no new runtime services |

Notes: the on-device build must not require Node. Generated tokens and SVGs are committed (or built in CI and packaged) so that the Buildroot packaging (sibling repo, pinned by SHA) needs no new host tooling.

---

## Scope

**Mode**: targeted

### Included Components

- `src/webui/design/**` (166 files): extract, archive, retire.
- `src/webui/documentation/**` (104 files): archive-by-tag, retire.
- `src/webui/www/webui/color.map` and `src/webui/www/webui/scss/main.scss` (line 38, "Create our own color.map"): reconcile with the token set.
- New: tokens source and the SVG icon source/build folder, `licenses/licenses.md` provenance entries.

### Excluded Components

- Device pictures (`www/config/img/devices/{50,250}`, 565 files) and `coupling` glyphs.
- Third-party CSS images (jQuery UI smoothness, msdropdown).
- The drifted `www/` copy (handled by webui-shell-build).
- All Tcl/JS functional code, API and back-end modules.
- The sibling OpenCCU repo and its overlay (coordination only).

### Critical Components

- `www/ise/img/**` paths and names (consumed by the OpenCCU `WebUI-openccu` overlay and by 41 patches' surroundings).
- `src/webui/www_source/cssfiles.txt` / `jsfiles.txt` (build input lists that any new token CSS must join).
- eQ-3 logo assets (`hm-logo.psd`, `homematic_logo_small_gray.jpg`, `_homematic_logo_small_gray.jpg`).

### Boundaries

- No change to the runtime behaviour of the existing pages. Retirement affects only unreferenced files.
- No new asset may be added with unknown provenance. Every retained or new asset gets a provenance and licence line.
- Colour changes to existing screens only through the tokens, in the nextGen UI; legacy CSS keeps current values until a page migrates.

---

## Dependencies

### Internal

- webui-shell-build: build lists, `color.map`, SCSS entry (`main.scss`), the place for the token build step.
- webui-config-pages and webui-rega-pages: the consumers of the icons and images that will gradually switch to SVG.
- `licenses/licenses.md`, `licenses/HMSL2.txt`: licence declarations (HMSL 2.0 default; `src/webui` Apache-2.0).
- Bootstrap 5 tooling in `src/webui` (commits b9ce345d, 94bb4ab3), which overrides variables from the tokens.

### External

- Sibling repo `/home/standard/dev/OpenCCU` (Buildroot): pins this repo by SHA; overlay `WebUI-openccu` replaces/adds branding under `www/ise/img`; rootfs patches.
- eQ-3 AG / ELV AG: rights holder of the brand assets and of the design documents (written permission may be needed for the logo and for redistributing .doc contents).
- Third-party licences being removed: JsDoc Toolkit (X11/MIT, Michael Mathews 2009), Mozilla Rhino (MPL 1.1 / GPL 2.0+).
- Candidate build-time tools (dev only): Style Dictionary, SVGO, Bootstrap Icons (MIT) if used for generic glyphs.
- Optional tooling for reading the binary sources during Phase 0: LibreOffice, 7z, GIMP, a Photoshop-compatible reader.

---

## Constraints

### Unchanged

- Existing image paths and file names under `src/webui/www/**/img` stay valid for the OpenCCU overlay and the legacy pages until each consumer is migrated.
- Existing colour values on shipped screens do not change until the corresponding page is migrated. There is no silent re-theme.
- The Apache-2.0 / HMSL 2.0 licence boundaries declared in `licenses/licenses.md`.
- Brand marks stay with eQ-3 / their current owner. No redrawn or modified logo ships without permission.
- No on-device toolchain change. The target firmware build needs no new host tools to package existing sources.

### Integration Systems

- OpenCCU Buildroot packaging (pins the SHA, applies the rootfs patches, adds the overlay).
- GitHub Actions CI in this repo (only `tests/test-components.py` and a few unit tests exist today).
- Bootstrap 5 SCSS compilation in the webui build.

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | Brand and trademark exposure. The HomeMatic logo (`hm-logo.psd`, `homematic_logo_small_gray.jpg`) and eQ-3-authored documents carry brand/copyright claims. A renovation that reuses or redraws them without permission risks infringement. The assets carry no licence headers. | Do not redistribute logo derivatives until eQ-3 confirms in writing. Keep the logo unchanged in shipped paths. Record provenance for each asset. | webui-design-docs.md section 4.3; licenses/licenses.md:4,19-20 |
| high | Overlay and patch breakage. The OpenCCU overlay adds branding under `www/ise/img`, and 64 rootfs patches depend on exact structures. Renaming or moving images, or changing CSS structure, can break downstream builds. | Additive pipeline only. Keep existing names and paths. Announce path changes to the OpenCCU repo and bump its pinned SHA deliberately. | plan-context.md External constraint |
| medium | Personal and company data (contact, bank details) is embedded in the PDA .doc letterheads and in git history. Deleting the files does not remove them from history. | Do not republish. Do not rewrite shared history without a maintainer decision. Mention it in the archive manifest. | webui-design-docs.md section 5 |
| medium | Loss of the only editable masters. PSD/XCF are the only editable sources for buttons, sliders, spinners and the logo. Deleting them removes the ability to re-export. | Phase 0 archive tag plus an external release asset. Delete only after an owner-confirmed archive exists. | webui-design-docs.md sections 3.2, 5 |
| medium | Authoritative-palette ambiguity. The designer's table and the shipped `color.map` disagree on at least 3 values (background, clickable, inactive). Choosing the wrong one changes the look and the tests cannot detect it. | Maintainers record a decision per token. Keep both values in the tokens file during transition. Make the nextGen UI use tokens only. | webui-design-docs.md section 3.5 |
| medium | Accessibility. Legacy signal colours (`#ffff00` warn, `#00c300` ok) and the dark-blue background are likely to fail WCAG contrast in a Bootstrap 5 context. | Contrast checks in the token build. Define text-safe variants. Keep the legacy colours only for non-text indicators. | webui-design-docs.md section 3.4 |
| low | Licence documentation gap. Vendored JsDoc/Rhino is third party and unlisted in `licenses/`. | Removal in Phase 3 closes this. If it is kept for any reason, add NOTICE entries. | webui-design-docs.md section 4.3 |
| low | No UI or visual regression tests. Icon swaps are not caught automatically. | Add SVG lint and token-diff checks in CI. Use manual screenshot review per migrated page. | plan-context.md Testing |
| low | Unverified assumption that the 7z archives and `old/` contents are fully superseded by shipped assets. | Verify in Phase 0 by extracting the archives and comparing hashes before deleting. | webui-design-docs.md section 6 |

---

## Success Criteria

- `src/webui/documentation` is removed. No build file, script or documentation references it. CI is green.
- `src/webui/design` is reduced to the extracted artefacts only (or removed), with an archive tag and a manifest recording the origin, shipped twins and licence status of every file.
- A single tokens source exists. It covers all 11 Farbtabelle roles and all 14 `color.map` entries, and records the authoritative-value decision for every drifted token. CSS custom properties, the Bootstrap 5 Sass overrides and `color.map` are generated from it with no manual edits.
- The icon pipeline produces optimised, `currentColor`-capable SVGs for the vocabulary listed in Phase 2. A CI check enforces lint and optimisation. Output paths do not collide with existing bitmap paths.
- Existing shipped image paths and names are unchanged, and the OpenCCU overlay builds against the new SHA without modification (verified in the sibling repo).
- Token pairs for text meet WCAG AA contrast, or a documented exception exists.
- `licenses/licenses.md` lists the provenance and licence for every retained design asset. The eQ-3 brand assets are explicitly marked.
- All existing functionality is unchanged and there are no visual regressions on pages that have not been migrated.

---

## Focus Areas

1. Brand, licence and provenance clearance (logo, eQ-3 documents, third-party JsDoc/Rhino).
2. Phase 0 archive and manifest (including verifying that 7z contents are duplicates), before any deletion.
3. Reconcile the designer palette and `color.map`. Build the token source and generators (CSS variables, Bootstrap 5 Sass, `color.map`).
4. SVG icon set for the domain vocabulary and the build/lint step, with output paths that do not clash with existing images.
5. Coordination with the OpenCCU overlay and pinned-SHA workflow (path and name stability).
6. Retire `documentation/` and the obsolete design folders. Decide whether to introduce a modern doc generator.
7. Accessibility (contrast, focus states, reduced-motion spinner replacement for `loading.gif`/`ajaxload.gif`).

---

## Consequences

### Positive Outcomes

- A single, versioned source for colours and icons for the nextGen UI, usable from CSS, Sass and JS.
- Resolution-independent and themeable icons (HiDPI, dark mode, recolouring).
- About 14 MB and 270 unreferenced files fewer in the working tree. Binary blobs (Rhino jars, PSD/XCF, 7z) leave the supply chain.
- Clear licence and brand status, and removal of the unlisted MPL/GPL component.
- Preserved design intent: the colour semantics and icon vocabulary are recorded in text form.

### Negative Outcomes

- Design effort to redraw icons. There is no vector source and no auto-conversion path.
- A new (dev-only) Node toolchain in a Tcl/C++ repo, with the committed-output policy to maintain.
- Temporary dual state: bitmap icons for legacy pages and SVG for the nextGen UI.
- Personal data in the history stays, unless history is rewritten, which is not proposed.
- If the masters are archived outside the repo, they become harder to find.

### Follow-Up Decisions

- Where tokens and icon sources live (`src/webui/www_source` vs a new `src/webui/design-system` folder) and whether they ship in the on-device tree.
- Authoritative value per drifted colour (designer table vs shipped `color.map`), and whether a dark theme is in scope.
- Whether to keep the masters in a separate repository, a release asset or Git LFS.
- Logo and branding policy with eQ-3 / OpenCCU, and whether the overlay branding is moved into the tokens.
- Treatment of the 565 device pictures (retain as bitmaps, or re-encode to WebP/AVIF) and the retirement date of the PDA UI assets.
- Whether to adopt a modern JS documentation tool (TypeDoc/JSDoc) for the new sources.
- Whether to purge the PDA letterhead data from git history.

---

## Source Documents

- `.migration/plan-context.md` - shared engagement context, source stack, integration, security, testing, tech debt, external constraint
- `.migration/docs/modules/webui-design-docs.md` - module documentation (layout, evidence of non-use, colour tables, licensing, reuse assessment, open points)
- `.migration/docs/cross-cutting/technical-debt.md` - drift, legacy and coverage-limit findings
- `.migration/docs/external-context/summary.md` - OpenCCU packaging constraint (referenced via plan-context.md; not re-read)
- `skills/plan-migration/references/plan-adr-template.md` and `adr-workflow.md` ("Draft Complete ADR") - structure and field strategy

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

