# Migration Plan: Migrate src-feature--devicetypes (device type descriptions and their generation)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: contract-preservation with additive modernization (retain / wrap; add a JSON device catalogue; not a UI migration target)

---

## Recommendation (summary)

**RETAIN the source XML and the strip/generate pipeline unchanged; WRAP it by adding one new, additive build artefact (a machine-readable JSON device catalogue) generated from the same XML; apply MINIMAL-CHANGE hygiene to the generated-but-tracked `DEVDB.tcl`.** Do not rewrite or reformat `src/devicetypes/*.xml`, and do not change the contract of the `devicetypes-assets` CMake target.

| Option | Verdict | Reason |
|--------|---------|--------|
| Retain unchanged | Baseline for the XML, XSD, strip step | 148 XML files are consumed by closed-source ReGaHss, rfd and hs485d via `firmware/`; format must stay byte-compatible (ISO-8859-1, `<?xml ...?>` prefix) |
| Wrap: new JSON catalogue generator (separate target) | **Recommended** | Gives the nextGen UI a typed catalogue without touching the XML contract or the legacy `DEVDB.tcl`/`stringtable` mechanics |
| Minimal-change: stop tracking generated `DEVDB.tcl`, drop dead XSL/Tcl helpers | **Recommended, opt-in** | Removes drift (`www/` copy vs. source), no runtime effect if the generator keeps running in the build |
| Replace (convert XML to JSON as the new source of truth, drop XML) | Rejected | Closed consumers need XML; 6.8 MB of German-documented, hardware-specific descriptions; no tests that would catch semantic loss |

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--devicetypes | primary | index.json | `src/devicetypes`: `rftypes/` (130 XML entries, 365 `<type>` entries), `hs485types/` (18 XML), 4 XSL (`device.xsl`, `dp.xsl` in each family), `device.xsd` (1,541 lines), `replaceMap/rfReplaceMap.xml`, `list_values.tcl` (191 lines), `stripdocu.tcl` (66 lines), `st_values.cgi`/`st_values.js`, `GenerateDeviceTypes.cmake`, `CMakeLists.txt` (6.8 MB total) |
| 2 | build-tools (`bidcos-devicetype-strip`) | dependency | index.json | 411-line Bash+awk stripper invoked per file by `GenerateDeviceTypes.cmake`; golden test in `tests/build-tools` |
| 3 | firmware | dependency | index.json | Receives generated descriptors in `${ROOTFS_DIR}/firmware/{rftypes,hs485types}`; `devicetypes-assets` depends on `FIRMWARE-assets` (`Components.cmake:149-151`); checked-in `firmware/rftypes` (128 files) duplicates/overlaps generated output |
| 4 | src-feature (webui) `www_source` | dependency | index.json | `create_devdb_tcl.tcl` builds `DEVDB.tcl` from `www_source/config/devdescr/*.tcl` (device images, UI descriptions); `st_values.cgi`/`st_values.js` and `stringtable_de.txt` supply translations |
| 5 | webui-config-pages / webui-api | affected | index.json | Device configuration pages and easymodes key on the device `type` id and paramset names defined in these XML files; nextGen UI is the new consumer of the catalogue |
| 6 | src-feature--rfd, src-feature--hs485d | affected | index.json | Daemons parse the generated descriptors at runtime (device pairing/paramsets); format regression would break pairing and configuration |
| 7 | OpenCCU packaging repo (external) | affected | user | Patches the `devicetypes-assets` target and runs `scripts/testcases/build/test_devicetypes_assets.py` against it |

---

## Context

### Summary

`src/devicetypes` holds the HomeMatic device description database: one XML per device family (`<device version=... supports_aes=...>` with `<supported_types>` matching on pairing-frame firmware/type bytes, `<paramset type="MASTER|VALUES|LINK">`, `<channels>`, `<frames>`, `<parameter>` with `<logical>`, `<physical>`, `<conversion>`), described by `device.xsd`. A CMake script (`GenerateDeviceTypes.cmake`, run through the `devicetypes-assets` target) strips docu tags, comments and whitespace via `build-tools/bidcos-devicetype-strip` and writes the result to `${ROOTFS_DIR}/firmware/<family>/`, failing the build on any non-zero exit or missing/empty output. These descriptors are the runtime source for rfd, hs485d and ReGaHss. The WebUI additionally uses a second, separate artefact: `DEVDB.tcl` (device images, UI descriptions, highlight coordinates), produced by `src/webui/www_source/create_devdb_tcl.tcl` from `www_source/config/devdescr/*.tcl`, and translation tables via `st_values.cgi`. HmIP devices are not described here (no XML for them).

### Migration Drivers

- The nextGen UI has no machine-readable device catalogue. Today it must scrape Tcl (`DEVDB.tcl`, easymodes), the stripped XML or ReGa. A JSON catalogue (type id, name, family, channels, paramset schema, image paths, German/English labels) is the single new capability the UI needs from this feature.
- Generated artefacts are tracked in git: `www/config/devdescr/DEVDB.tcl` (148,190 bytes) is produced by the build yet committed (`.gitignore` has a `*` rule), and the committed `www/` tree has drifted from `src/webui/www` (49 differing files in `www/config`, 52 elsewhere).
- Two generation paths exist for the same logic: the legacy Tcl `stripdocu.tcl` (regex) and the Bash/awk `bidcos-devicetype-strip` (replaced a Java stripper in #37). The Tcl tool and `list_values.tcl` (needs `tdom`, dev only) are not part of the build.
- Documentation and translations are German, ISO-8859-1, with inconsistent encodings in source (`<docu brief="Funk- T?r-/Fensterkontakt">` shows mojibake in `rf_sc.xml`), which blocks naive UTF-8 JSON conversion.
- Test coverage is thin: only one golden-file test for the stripper (`tests/build-tools/test-bidcos-devicetype-strip.sh`) and, externally, a CMake failure-handling test; nothing validates the XML against `device.xsd` or checks DEVDB consistency.

### Current State

Static data plus a small CMake/Bash/Tcl build pipeline; no runtime code in this feature. Build: CMake target `devicetypes-assets` -> `cmake -P GenerateDeviceTypes.cmake` with `DEVICE_SOURCE_DIR`, `DEVICE_OUTPUT_DIR`, `STRIP_EXECUTABLE`; also copies `rfReplaceMap.xml` (unstripped) and `st_values.cgi/js` to `/www/config`. The `-ccu2` stripper flag is never used by the build. `device.xsl` and `dp.xsl` (browser stylesheets referenced by `<?xml-stylesheet?>`) are not installed. Output counts: source has 130 rftypes entries vs 128 in checked-in `firmware/rftypes`; CI (`.github/workflows/ci.yml:205-212`) compares file counts between source and staged firmware. DEVDB is built in `webui-www-source-assets`, converted from UTF-8 to ISO-8859-1 with `utf82ansi.py` and installed to `/www/config/devdescr/DEVDB.tcl`. GitHub Actions CI on x86_64 only.

### Cross-Cutting Findings

- Integration: descriptors are consumed as files by rfd/hs485d/ReGaHss (closed source); no network API. The UI sees them only indirectly (paramset names via JSON-RPC `Interface.getParamsetDescription` and easymodes).
- Tech debt: generated `DEVDB.tcl` tracked despite ignore rule; `www/` snapshot drift; dead helpers (`stripdocu.tcl`, `list_values.tcl`, unbuilt XSL); easymodes duplication (390 duplicate tcl, 611 duplicate txt) keyed by device type.
- Encoding: ISO-8859-1 end to end (XML prolog, `utf82ansi.py`, `st_values.cgi` Latin-1 output), `tclrpc.so` `xmlrpc` is latin-1 only.
- Build dependencies: Tcl (`OPENCCU_TCLSH_EXECUTABLE`), Python (`OPENCCU_PYTHON_EXECUTABLE`), Bash/awk; `tdom` dev only.
- Testing: only the stripper golden test exists; the UI and API have no tests.
- External: the packaging repo copies `CMakeLists.txt` and `GenerateDeviceTypes.cmake` out of this tree into a temp project and exercises them with a stub stripper (`-o` as argument 3 of the stripper, tolerant of a legacy `-jar` form).

---

## Migration Goal

**Publish a stable, machine-readable device catalogue (JSON) from the existing device-type XML for the nextGen UI, while keeping the XML sources, the stripped firmware output and the `devicetypes-assets` target contract unchanged.**

The goal is (1) a new additive build step that emits `devices.json` (and optionally per-family files) from `src/devicetypes` plus `www_source/config/devdescr`, UTF-8 encoded, with a versioned schema; (2) a validation test suite (XSD validation, catalogue schema, count and id uniqueness checks) so the pipeline is no longer untested; (3) removal of generated-file tracking and dead helpers without changing runtime behaviour.

---

## Decision

### Approach: Retain and wrap (additive generator), minimal-change hygiene

Keep `src/devicetypes/{rftypes,hs485types,replaceMap}/*.xml`, `device.xsd` and `GenerateDeviceTypes.cmake` as is. Add a new, independent generator (Python 3 using `xml.etree.ElementTree` with explicit ISO-8859-1 decoding; Python is already a mandatory build dependency via `utf82ansi.py`) invoked by a new CMake target (for example `devicetypes-catalogue`) that writes `${ROOTFS_DIR}/www/config/devdescr/devices.json` (final path to be agreed with the nextGen UI shell). The JSON merges: type ids and names from `<supported_types>`, channel structure and paramset parameter schemas (logical type, min/max/default/unit, options) from the XML, device image paths/descriptions from the `devdescr/*.tcl` sources, and translated labels from `stringtable_de.txt` and the easymode `localization` files where a key exists. Existing artefacts (`DEVDB.tcl`, `st_values.*`, stripped firmware XML) keep being produced for the legacy UI.

**Rationale**: (1) Closed-source ReGaHss and the C++ daemons require the XML as is (`firmware.md` section 4, `build-tools.md`), so replacing or reformatting the source is unverifiable; (2) the nextGen UI only needs read access to a derived catalogue, and a derived artefact keeps XML the single source of truth (`firmware.md` flags duplicated descriptors between `firmware/` and `src/devicetypes/` as an existing risk); (3) the sibling packaging repo tests the target's failure handling by copying only `CMakeLists.txt` and `GenerateDeviceTypes.cmake`, so changes must be additive and live in a separate target/file; (4) Python avoids the extra `tdom` dependency of the legacy Tcl helper and handles Latin-1 to UTF-8 reliably; (5) DEVDB is generated from tracked sources, so removing the tracked copy is safe once CI verifies the build regenerates it.

### Rejected Options

- **Replace XML with JSON as the source of truth**: breaks rfd/hs485d/ReGaHss consumption, requires a reverse converter to keep the firmware format, and loses German `docu` text semantics without tests.
- **Extend `bidcos-devicetype-strip` with a `--json` mode**: the stripper is a line-oriented awk tool (411 lines) that intentionally preserves XML structure; embedding a parser and schema logic would complicate its golden test and risk regressions in the firmware path.
- **Parse XML in the browser at runtime (fetch stripped firmware XML)**: stripped files lack `docu` and are ISO-8859-1; paths under `/firmware` are not meant to be served by the web server; each client would duplicate the parsing and DEVDB merge.
- **Extend `list_values.tcl` / `tdom`**: `tdom` is not available in the target build, the tool is dev-only, and Tcl 8.x JSON handling adds more legacy surface.
- **Generate the catalogue on the device at runtime (Tcl CGI)**: adds CPU and memory load on embedded hardware and a new request-driven file reader (cf. the CGI path-read findings), where a build-time artefact is static and cacheable.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | XML data (ISO-8859-1), Bash+awk stripper, Tcl helpers (`stripdocu.tcl`, `list_values.tcl`, `st_values.cgi`), CMake script | XML unchanged; add Python 3 generator (stdlib only) and JSON output (UTF-8, versioned schema); CMake script unchanged |
| Frameworks | `device.xsd` (XML Schema), `tdom` (dev only), `utf82ansi.py` | Add JSON Schema for the catalogue; XSD validation in CI (`xmllint --schema` or lxml, CI-only) |
| Build | CMake (`devicetypes-assets`, `cmake -P`), `webui-www-source-assets` for DEVDB | Add independent target `devicetypes-catalogue`; existing targets untouched |
| Infrastructure | Embedded Linux rootfs staging (`${ROOTFS_DIR}`), OCI/HA/Helm via packaging repo, GitHub Actions (x86_64) | Preserved; CI adds catalogue generation and validation steps |
| Runtime consumers | rfd, hs485d, ReGaHss read stripped XML from `/firmware`; WebUI reads `DEVDB.tcl`, `stringtable` | Unchanged; nextGen UI reads `devices.json` through the existing web server |

---

## Scope

**Mode**: targeted

### Included Components

- `src/devicetypes/**`: `rftypes/*.xml`, `hs485types/*.xml`, `replaceMap/rfReplaceMap.xml`, `device.xsd`, `GenerateDeviceTypes.cmake`, `CMakeLists.txt`, `st_values.cgi`, `st_values.js`, `list_values.tcl`, `stripdocu.tcl`, XSL files
- New artefacts: catalogue generator script, JSON Schema, tests (XSD validation, catalogue golden/shape tests), CMake target `devicetypes-catalogue`
- Generation seam in `src/webui/www_source/create_devdb_tcl.tcl` and `www_source/config/devdescr/*.tcl` (read as input to the catalogue; DEVDB behaviour not changed)
- Hygiene: untrack generated `www/config/devdescr/DEVDB.tcl`; document or delete dead XSL/Tcl helpers

### Excluded Components

- `build-tools/bidcos-devicetype-strip` internals (separate module; interface must stay `<in> [-ccu2] -o <out>`)
- `firmware/` binaries and the 128 checked-in descriptor copies (separate feature; coordinate de-duplication later)
- Daemon parsers in `src/rfd`, `src/hs485d`, closed-source ReGaHss
- easymodes (`config/easymodes/**`, 2,561 files) and the device configuration pages (separate webui features)
- HmIP device definitions (not in this directory; delivered by the HmIP server)
- The nextGen UI client code

### Critical Components

- `GenerateDeviceTypes.cmake` (failure semantics: nonzero, missing and empty output are fatal; temp file and rename)
- `rftypes/*.xml` `<supported_types>` blocks (type id to firmware/type-byte matching)
- `device.xsd` (the only formal contract)
- `create_devdb_tcl.tcl` and the `devdescr/*.tcl` sources (image and description mapping)

### Boundaries

- Build boundary: `devicetypes-assets` output is `${ROOTFS_DIR}/firmware/<family>/<name>.xml`; the catalogue is a new, separate file under `www/`.
- Encoding boundary: XML in ISO-8859-1; catalogue in UTF-8; legacy DEVDB and stringtable stay Latin-1 after `utf82ansi.py`.
- Repository boundary: the packaging repo pins this repo by SHA and patches the target; path and argument contracts are shared.

---

## Dependencies

### Internal

- `build-tools/bidcos-devicetype-strip` (Bash/awk stripper; golden test in `tests/build-tools`, CTest registered at `cmake/Components.cmake:188-190`)
- `cmake/Components.cmake` (`devicetypes-assets` depends on `FIRMWARE-assets`, lines 149-154; `BUILD_DEVICETYPES` / `BUILD_FIRMWARE` options)
- `src/webui/www_source` (`create_devdb_tcl.tcl`, `utf82ansi.py`, `config/devdescr/*.tcl`, `webui-www-source-assets` target)
- `config/stringtable_de.txt` and easymode localization files (translations)
- `firmware/` module (staging destination and duplicate descriptors)

### External

- CMake >= 3.20 (the packaging test uses `cmake_minimum_required(3.20)`)
- Bash, awk, coreutils (stripper); Python 3 (`OPENCCU_PYTHON_EXECUTABLE`); Tcl shell (`OPENCCU_TCLSH_EXECUTABLE`); `tdom` for the dev-only `list_values.tcl`
- OpenCCU packaging repo (Buildroot): `scripts/testcases/build/test_devicetypes_assets.py` copies `src/devicetypes/CMakeLists.txt` and `GenerateDeviceTypes.cmake` into a temp project and checks failure handling (modes fail/partial/empty/missing) with a stub stripper
- Closed-source ReGaHss and daemons as consumers of the stripped XML

---

## Constraints

### Unchanged

- Format and encoding of the stripped firmware XML (ISO-8859-1, `<?xml version="1.0" encoding="ISO-8859-1"?>` prolog, same element structure) and output location `${ROOTFS_DIR}/firmware/{rftypes,hs485types}/<name>.xml`.
- `devicetypes-assets` target contract: arguments `DEVICE_SOURCE_DIR`, `DEVICE_OUTPUT_DIR`, `STRIP_EXECUTABLE`; stripper invoked as `<strip> <in> -o <tmp>`; fail-fast on non-zero, missing or empty output; write-to-temp then rename; file layout of `src/devicetypes/CMakeLists.txt` and `GenerateDeviceTypes.cmake` must remain self-contained (no references to other new files inside those two, because the external test copies only them).
- `rfReplaceMap.xml` copied unmodified to `firmware/rftypes/replaceMap/`.
- `st_values.cgi` and `st_values.js` served from `/www/config` for the legacy UI and the easymode translation tables.
- `DEVDB.tcl` content and install path `/www/config/devdescr/DEVDB.tcl` for the legacy UI until its retirement.
- Device `type` ids and paramset names (keys used by easymodes, ReGa scripts, and the JSON-RPC layer).

### Integration Systems

- rfd XML-RPC (TCP 2001) and hs485d (TCP 2000): descriptors loaded from `/firmware` at start
- ReGaHss (closed source): reads descriptors and `rfReplaceMap.xml`
- JSON-RPC `/api/homematic.cgi` and Tcl CGI (consumers of DEVDB, stringtable)
- Packaging repo patches (64 rootfs patches; relevant here: the `devicetypes-assets` patch and `test_devicetypes_assets.py`)
- GitHub Actions CI (`ci.yml:205-212` descriptor count check)

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | Changing `CMakeLists.txt` / `GenerateDeviceTypes.cmake` breaks the packaging repo's `test_devicetypes_assets.py` (it copies only those two files and a stub stripper) or its Buildroot patch | Put the catalogue into a separate CMake file/target; add no new file dependency to the two existing files; run the sibling test as a CI job (or vendor its fixture) before merging | `/home/standard/dev/OpenCCU/scripts/testcases/build/test_devicetypes_assets.py`; `external-context/summary.md` |
| high | Encoding corruption: ISO-8859-1 sources with already-mojibake docu text (for example `rf_sc.xml` brief) produce wrong UTF-8 labels or crash the generator | Decode explicitly as ISO-8859-1 (or per prolog), never guess; treat `docu` text as non-authoritative; labels come from stringtable where present; add round-trip tests on all 148 files | `src/devicetypes/rftypes/rf_sc.xml:1-9`; `build-tools.md` (ISO-8859-1 prefix) |
| high | Regression of the firmware descriptor output (any change to the stripper path or CMake script) breaks pairing and configuration in closed-source consumers with no test coverage | Freeze the path; add a checksum or golden diff of generated firmware output for all 148 files in CI before/after any change | `firmware.md` section 4; `testing.md` (only a single stripper golden test) |
| medium | Catalogue and legacy sources diverge (XML types without DEVDB entry, DEVDB entries without XML, easymode keys not in XML) | Generator reports orphan/missing mappings as a build warning list and a CI check; keep XML as primary key | `src.md` section 4; `technical-debt.md` (easymodes duplicates, DEVDB tracking) |
| medium | Tracked generated `DEVDB.tcl` and drifted `www/` copy mask real state; untracking may break consumers that expect the committed file (packaging overlays, dangling symlinks) | Verify no consumer reads the tracked path outside the build; untrack in a separate commit with CI proof that the build regenerates it | `technical-debt.md` (`DEVDB.tcl` tracked despite `*` ignore; 49+52 differing files) |
| medium | Catalogue schema becomes a de facto API for the nextGen UI and cannot change cheaply | Version the schema (`schemaVersion`), publish JSON Schema, add shape tests; keep additive-only changes | Design decision of this plan |
| low | Count mismatch of descriptors (source 130 rftypes vs 128 in checked-in firmware; XSL and `ccu1/`, `development/` subfolders) leads to wrong totals in the catalogue | Define explicitly which files are device descriptors (exclude `*.xsl`, `development/`, `ccu1/` unless required); assert counts in tests | `firmware.md` section 4; `src.md` section 4 |
| low | Dead tooling (`stripdocu.tcl`, `list_values.tcl`, XSL not installed) misleads maintainers or is revived by mistake | Mark deprecated in a README or delete after confirming no references | `build-tools.md`; `src.md` section 4 |

---

## Success Criteria

- `devicetypes-assets` output (stripped XML for all 148 inputs) is byte-identical before and after the change, verified in CI.
- The packaging repo's `test_devicetypes_assets.py` passes unmodified against the branch (all four failure modes).
- A `devices.json` catalogue is generated in the normal build, UTF-8, validates against a published JSON Schema, and covers all 365 rftypes `<type>` entries and the hs485 types with unique ids.
- All 148 source XML files validate against `device.xsd` in CI (or known exceptions are listed explicitly).
- Catalogue generation is deterministic (identical output on repeated builds) and reports orphan mappings to DEVDB and stringtable.
- `DEVDB.tcl` is no longer tracked in git and is regenerated by the build; the legacy UI still renders device images.
- Test coverage for this feature goes from 1 golden test to at least: stripper golden test, XSD validation, catalogue shape/count tests, and encoding round-trip test.
- All existing functionality preserved; no behavioural change in rfd, hs485d or ReGaHss.

---

## Focus Areas

1. Contract preservation of the generation target (`devicetypes-assets`, `GenerateDeviceTypes.cmake`) and the sibling-repo test.
2. Catalogue schema design with the nextGen UI team: identifiers, channel and paramset model, localisation, image references; JSON Schema versioning.
3. Encoding handling (ISO-8859-1 to UTF-8) and mojibake in source `docu` text.
4. Merge logic with `devdescr/*.tcl` (images, descriptions) and `stringtable_de.txt` / easymode localization for labels.
5. Test baseline: XSD validation of 148 files, firmware-output golden checksums, catalogue tests; run in GitHub Actions.
6. Generated-artefact hygiene: untrack `DEVDB.tcl`, resolve `www/` drift for the config/devdescr paths, de-duplicate with `firmware/` descriptors (coordinate with the firmware feature).
7. Dead tooling cleanup (`stripdocu.tcl`, `list_values.tcl`, unused XSL) after reference check.

---

## Consequences

### Positive Outcomes

- The nextGen UI gets a typed, cacheable device catalogue without scraping Tcl or XML.
- XML remains the single source of truth; no change in the closed-source consumers.
- First real test coverage for the device-description pipeline (XSD validation, catalogue checks).
- Less repository drift: generated `DEVDB.tcl` no longer tracked.
- Pipeline failures stay loud (fail-fast semantics preserved).

### Negative Outcomes

- Another generated artefact and a schema to maintain; one more build step in a Python-dependent pipeline.
- Legacy and new device metadata coexist (DEVDB, stringtable, JSON) until the legacy UI is retired.
- Mapping XML types to DEVDB images and labels relies on naming conventions and may need manual overrides.
- Catalogue size on the device (6.8 MB source; JSON size must be measured and possibly split per family or compressed).

### Follow-Up Decisions

- Final location, name and sharding of the catalogue (single `devices.json` vs per-family files) and its HTTP caching (cache-header approach already adopted for webui assets in #157).
- Whether the catalogue should also include paramset value descriptions already available at runtime via `Interface.getParamsetDescription`, or stay a static design-time schema.
- Whether to remove the checked-in `firmware/*types` copies in favour of generated output only (firmware feature).
- Whether HmIP device data (not in this directory) should be merged into the same catalogue.
- Retirement plan for `DEVDB.tcl`, `st_values.*` and `stringtable_de.txt` once the legacy UI is gone.
- Whether to keep a CI job that runs the sibling repo's test or vendor its fixture into this repo.

---

## Source Documents

- `.migration/plan-context.md` - Shared engagement context
- `.migration/docs/modules/src.md` - sections 3-4 (webui build, device types)
- `.migration/docs/modules/firmware.md` - section 4 (generated descriptors, CI count check, duplication)
- `.migration/docs/modules/build-tools.md` - `bidcos-devicetype-strip` behaviour and test
- `.migration/docs/cross-cutting/technical-debt.md` - `DEVDB.tcl` tracking, `www/` drift
- `.migration/docs/cross-cutting/testing.md` - existing tests
- `.migration/docs/cross-cutting/integration-seams.md` - `list_values.tcl` is not a runtime seam
- `.migration/docs/cross-cutting/dependencies.md` - Tcl/tdom, build dependencies
- `.migration/docs/cross-cutting/data-flow.md` - device description flow
- Source inspected: `src/devicetypes/CMakeLists.txt`, `src/devicetypes/GenerateDeviceTypes.cmake`, `src/devicetypes/rftypes/rf_sc.xml`, `src/webui/www_source/CMakeLists.txt`, `src/webui/www_source/create_devdb_tcl.tcl`
- Sibling repo: `/home/standard/dev/OpenCCU/scripts/testcases/build/test_devicetypes_assets.py`

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

