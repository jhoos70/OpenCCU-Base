# Module: licenses

## Overview

- Path: `licenses/` (4 files, 935 lines total)
- Language: plain text / Markdown (documentation only; no code, no build logic)
- Role: legal reference material. Declares the default license of the repository (HMSL 2.0), lists path-level exceptions, and bundles the full texts of the license documents that the exceptions refer to.
- Not part of any build target: no CMake, Makefile or script references `licenses/` (grep for `licenses/`, `HMSL2`, `licenses.md` outside `.git` and `.migration` only hits `README.md:46-47` and unrelated third-party license URLs in headers).
- Git history touching `licenses`: `aa1a8abc` (Add license information), `8772ccb3` (update eq3_char_loop to version 1.5 including kernel v6 compatibility (#22)).

## File inventory

| File | Lines | Encoding | License / content | Purpose |
|---|---|---|---|---|
| `licenses/licenses.md` | 20 | UTF-8 | Overview + exceptions table (bilingual EN/DE) | Index of which license applies to which path |
| `licenses/HMSL2.txt` | 76 (64 non-empty) | UTF-8 with BOM, very long lines (up to 957 chars) | Homematic Software License 2.0 (German legal text, eQ-3 AG) | Default license of the repository |
| `licenses/gpl-2.0.txt` | 338 | ASCII | GNU GPL v2, June 1991 (verbatim FSF text) | Applies to kernel-driver sources |
| `licenses/lgpl-2.1.txt` | 501 | ASCII | GNU LGPL v2.1, February 1999 (verbatim FSF text) | Applies to the XML-RPC / XML-parser libraries |

## licenses.md (`licenses/licenses.md`)

- Statement (`:3`, English; `:5` German): content of OpenCCU-Base is published under different licenses; unless stated otherwise all files fall under "Homematic Software License" v2.0 (HMSL 2.0). The English sentence contains the typo "alls".
- Exceptions table (`:10-20`), columns `Path | License`:

| Path (as written) | License | Verified in repo |
|---|---|---|
| the installed libXmlRpc shared library | LGPL-2.1 | Exists only as per-arch binaries: `lib/aarch64-linux-gnu/libXmlRpc.so`, `lib/arm-linux-gnueabihf/libXmlRpc.so`, `lib/i686-linux-gnu/libXmlRpc.so`, `lib/x86_64-linux-gnu/libXmlRpc.so`; the literal path the installed libXmlRpc shared library does not exist |
| `lib/libxmlparser.so` | LGPL-2.1 | Same, per-arch directories under `lib/` |
| `src/bcm2835_raw_uart/bcm2835_raw_uart.c` | GPL-2.0 | File header carries eQ-3 copyright 2015 and GPL (`src/bcm2835_raw_uart/bcm2835_raw_uart.c:6-12`) |
| `src/eq3_char_loop/eq3_char_loop.c` | GPL-2.0+ | Header: "version 2 of the License, or (at your option) any later version" (`src/eq3_char_loop/eq3_char_loop.c:6-10`) |
| `src/eq3_char_loop/mxs_raw_auart.c` | GPL-2.0+ | Same wording (`src/eq3_char_loop/mxs_raw_auart.c:6-10`) |
| `src/libxmlrpc` | LGPL-2.1 | Actual directory is `src/libXmlRpc` (case differs); contains `COPYING` = LGPL 2.1 text (`src/libXmlRpc/COPYING:1-2`) |
| `src/libxmlparser` | LGPL-2.1 | `src/libxmlparser/LICENSE:1-3` states LGPL v2.1 |
| `src/webui` | Apache 2.0 if not stated otherwise | Directory exists; e.g. `src/webui/www/webui/js/extern/template.js:6,21` and `excanvas.js:7` reference Apache 2.0 |
| `webui` | Apache 2.0 if not stated otherwise | No top-level `webui/` directory exists in the repo (only `src/webui`) |

Observations:
- Table header separator row is `|----|-------|` directly followed by data rows without leading pipes (`licenses/licenses.md:12-20`: rows start with the path, no leading `|`); renders as a table in most Markdown engines but is inconsistent with the header row.
- The heading `# Exceptions` is level 1, same as `# License overview`.
- Two rows (the installed libXmlRpc shared library, `src/libxmlrpc`) do not match actual path casing/layout; `webui` matches nothing at the repo root.
- Third-party code embedded in the web UI carries its own licenses that are not in the table (e.g. jqPlot MIT/GPL-2.0 dual headers `src/webui/www/webui/js/extern/jqplot.barRenderer.min.js:9-10`, jquery.blockUI MIT/GPL `src/webui/www/webui/js/extern/jquery.blockUI.js:9-10`, knockout MIT `src/webui/www/webui/js/extern/knockout.js:3`). A bundled third-party notice page exists at `www/rega/licenseinfo.htm`.

## HMSL2.txt (`licenses/HMSL2.txt`)

German-language license between the user and eQ-3 AG (Maiburger Strasse 29, 26789 Leer). Structure (section numbers as in the file):

| Section | Line | Topic |
|---|---|---|
| Preamble ("WICHTIGER HINWEIS") | 1-6 | Acceptance by clicking, downloading, using or distributing; non-acceptance means do not use |
| Intro | 8-13 | Applies to eQ-3 software for Linux delivered with/for OpenCCU or other HomeMatic products; free of charge as long as terms are kept; applies to updates/upgrades; contract only available where EU/Switzerland/Norway law applies or section 9 applies |
| 1. Begriffsbestimmungen | 15 | Definitions: eQ-3, HomeMatic software (RFD, RS485D, program/script engine, web UI, Java HMServer/HMIPServer; excludes Linux OS and Java platform parts), documentation, updates/upgrades, update service |
| 2. Eigentumsrechte | 24 | eQ-3 retains all rights; other bundled software governed by separate terms, referenced as `HM-ThirdParty-Software-Licenses.txt` (`:26`) -- that file does not exist anywhere in this repo |
| 3. Nutzungsbestimmungen | 28 | 3.1 use on eQ-3 or other hardware, third-party use if bound to HMSL; 3.2 modifications allowed if published as source, free of charge, under HMSL; 3.3 redistribution of copies if recipients are bound and notices are retained; 3.4 no decompiling/reverse engineering of binaries except per Sec. 69e UrhG; 3.5 no trademark/patent rights; 3.6 not for high-risk use; 3.7 must not be adapted to run on competing manufacturers' hardware; 3.8 no use harming eQ-3/Homematic IP reputation; 3.9 eQ-3 reserves enforcement rights; 3.10 user responsible for environment and backups; 3.11 terms apply to manuals |
| 4. Technischer Support | 45-46 | Discretionary, no warranty |
| 5. Beschraenkte Gewaehrleistung | 48-51 | Provided "as is"; user must notify IP infringement claims |
| 6. HAFTUNGSBESCHRAENKUNG | 53-59 | Liability limited to gross negligence/intent, life/body/health, essential contractual duties; data loss limited; strict liability under Sec. 536a(1) BGB excluded |
| 7. Erhebung bestimmter Systeminformationen | 61 | eQ-3 may collect system information for support; states no personal data used |
| 8. Kuendigung oder Ablauf der Lizenz | 63-64 | eQ-3 terminates only if it may not provide components free of charge; notice via eQ-3 homepage, effective end of the sixth calendar month after announcement |
| 9. Geltendes Recht und Gerichtsstand | 66-67 | German law; venue Leer for merchants / public bodies |
| 10. Sonstige Vereinbarungen | 69-76 | Entire agreement, written waivers, severability, German version prevails over translations, reserved rights, assignment restrictions |

(Line numbers are approximate to section starts in the 76-line file; long paragraphs are single lines.)

Notable constraints relevant to migration/redistribution:
- Source-publication and same-license requirement for modifications (3.2) and notice retention for copies (3.3).
- Field-of-use restrictions: no competitor-hardware adaptation (3.7), no reputation-damaging use (3.8), no high-risk use (3.6). These are restrictions beyond OSI-style open source terms.
- Scope is limited to eQ-3 HomeMatic software components (definition in 1.2); Linux/Java parts are excluded.

## gpl-2.0.txt and lgpl-2.1.txt

- `licenses/gpl-2.0.txt:1-2`: "GNU GENERAL PUBLIC LICENSE Version 2, June 1991"; ends with the standard "How to Apply These Terms" appendix; contains FSF URL `https://www.gnu.org/licenses/` at `:307`.
- `licenses/lgpl-2.1.txt:1-2`: "GNU LESSER GENERAL PUBLIC LICENSE Version 2.1, February 1999"; same appendix style; URL at `:487`.
- Both are unmodified canonical texts (no repo-specific edits detected by inspection of headers/footers). They are duplicated by `src/libXmlRpc/COPYING` (LGPL 2.1) and presumably equivalent to what the kernel-driver sources reference.

## Cross-references

- `README.md:42-47` ("License information"): points to `licenses/licenses.md` as the main license reference and lists `gpl-2.0.txt`, `lgpl-2.1.txt`, `HMSL2.txt` as bundled texts.
- Source file headers declaring GPL: `src/bcm2835_raw_uart/bcm2835_raw_uart.c:6-12`, `src/eq3_char_loop/eq3_char_loop.c:6-10`, `src/eq3_char_loop/mxs_raw_auart.c:6-10`.
- Library license files: `src/libXmlRpc/COPYING`, `src/libxmlparser/LICENSE`.
- Runtime third-party notice page: `www/rega/licenseinfo.htm` (contains BSD, GPL, LGPL/Libidn text).
- No top-level `LICENSE` file exists in the repo root.

## Packaging / build integration

- None. No CMake install rule, script or test references the files in `licenses/`; the directory is not staged into the rootfs by the build (no match in `CMakeLists.txt`, `cmake/*.cmake`, `src/webui/CMakeLists.txt`).

## Migration notes (facts only)

- Nothing to port: pure documentation. Carry the directory over verbatim to preserve legal obligations.
- Items that a migration should keep consistent with the exceptions table: per-architecture prebuilt `lib/*/libXmlRpc.so` and `libxmlparser.so` (LGPL, must keep corresponding source `src/libXmlRpc`, `src/libxmlparser`), the three GPL kernel-driver sources, and the Apache-licensed `src/webui`.
- Documentation inconsistencies listed above (path casing `src/libxmlrpc`, nonexistent `webui` and `lib/*.so` paths, missing `HM-ThirdParty-Software-Licenses.txt`) exist in the current state.
