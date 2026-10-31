# Module: build-tools

## Overview

| Attribute | Value |
|---|---|
| Stack | Bash + embedded awk (POSIX-ish, `LC_ALL=C`) |
| Directory | `build-tools/` |
| Files | 1 (`build-tools/bidcos-devicetype-strip`, 411 lines, mode 0755) |
| Role | Build-time XML minifier/validator for BidCoS/HS485 device-type descriptors |
| Origin | Replaced a Java stripper with Bash+awk in commit `3ed652a4` (#37); earlier Tcl implementation remains at `src/devicetypes/stripdocu.tcl:1` |
| Runtime? | No. Runs only during the CMake build; output goes into the rootfs `firmware/` tree |

The directory contains exactly one executable and nothing else (no build files, no config).

## Purpose

`bidcos-devicetype-strip` reads one device-type XML file and writes a normalized, minimal copy:

- Output is always prefixed with `<?xml version="1.0" encoding="ISO-8859-1"?>` (`build-tools/bidcos-devicetype-strip:313`).
- Removes comments (`:329-337`), processing instructions including `xml-stylesheet` (`:339-345`), and whole `<docu>` subtrees at any depth (`:297-301`, `:303`, `:71`, `:356`).
- Drops whitespace-only text nodes (`:68-72`), collapses whitespace inside tags (`normalized_tag`, `:147-189`).
- Converts CDATA to escaped text (`:347-359`).
- Collapses empty elements to self-closing form (`<a></a>` becomes `<a/>`) (`:274-277`).
- Decodes numeric character references (`&#34;`, `&#x26;`) to literal chars, re-escaping only `& < >` (and `"` in attributes) (`decoded_entities`, `:133-145`; `encoded_codepoint`, `:120-131`).
- Rewrites single-quoted attribute values to double-quoted (`:166-171`) and escapes `>` inside attribute values as `&gt;` (`:161-162`).
- With `-ccu2`, removes the `paired="..."` attribute from opening tags (`:186-187`).

It also performs strict well-formedness validation and fails (exit 2) on bad input (see Error Handling).

## Interface

Usage (`:7-11`): `bidcos-devicetype-strip <in.file> [-ccu2] [-o out.file]`

| Argument | Behavior | Evidence |
|---|---|---|
| `<in.file>` | Exactly one positional input; a second positional or unknown `-*` flag prints usage, exit 1 | `:16-36` |
| `-o <file>` | Output path; if omitted, input file is overwritten in place | `:19-22`, `:43` |
| `-ccu2` | Strip `paired` attributes (CCU2 compatibility variant) | `:23-26`, `:57`, `:186-187` |

Exit codes: 0 success; 1 usage / unreadable input / output is a directory / empty output (`:38-53`, `:405-408`); 2 awk-detected XML error (`:61-62`).

## Control Flow

1. Shell prologue: `errexit`, `nounset`, `pipefail` (`:3-5`); argument parsing (`:13-36`); input readability check (`:39-42`).
2. Atomic write: temp file created via `mktemp "${output_dir}/.${output_name}.XXXXXX"` in the output directory (`:54`); `trap ... EXIT` removes it on failure (`:55`, cleared at `:411`). Final `chmod 0644` then `mv -f` (`:409-410`).
3. Single `awk` program (`:57-403`), reading whole input into a `source` string in the main rule (`:316-318`), then tokenizing in the `END` block (`:320-402`):
   - Dispatch order at each position: comment `<!--`, PI `<?`, CDATA `<![CDATA[`, other `<!` (rejected: DOCTYPE etc., `:362-363`), element tag (quote-aware scan to closing `>`, `:365-385`), else text (`:387-391`).
   - `handle_tag` (`:245-310`) maintains an element stack (`push`/`pop`, `:191-203`), a `docu_depth` counter to suppress output inside `<docu>`, and a `root_seen` flag for single-root enforcement (`:288-292`).
   - Final checks: unclosed elements, unclosed docu, missing root (`:394-399`); then `printf "%s", result` (no trailing newline, `:401`).
4. Post-check that the temp file is non-empty (`:405`).

Performance note: `remaining = substr(source, position)` is recomputed each token (`:327`), which is quadratic in file size; the inputs are small device descriptors.

## Validation and Error Handling

Detected in awk via `error()` (`:58-63`), which prints `FILENAME: message` to stderr and `exit 2`:

| Check | Evidence |
|---|---|
| Unterminated comment / PI / CDATA / element | `:331`, `:341`, `:349`, `:380` |
| `--` inside comment | `:333` |
| Unsupported `<!...>` declaration (e.g. DOCTYPE) | `:362-363` |
| Mismatched/unclosed closing tags | `:200-201`, `:394-397` |
| Multiple document elements, missing root | `:289-290`, `:398-399` |
| Text or CDATA outside root | `:69-70`, `:354-355` |
| Attribute syntax: missing whitespace, invalid name, duplicate, missing `=`, unquoted, unterminated, `<` in value | `:205-243` |
| Entities: only `amp lt gt quot apos`, decimal, hex allowed; unterminated `&` rejected | `:88-105` |
| Numeric entities limited to tab, LF, CR, and 32..255 (ISO-8859-1 range) | `:81-86` |

Because output is built in a temp file and only moved on success, a failed run leaves the target untouched (verified by test, below).

Known limitations visible in code: no DTD/DOCTYPE support, no namespace handling, named entities other than the five XML ones are rejected, input bytes are passed through unchanged (no transcoding; relies on `LC_ALL=C` and ISO-8859-1 sources), entity `&apos;` is validated but not decoded (left as-is in output).

## Dependencies

| Dependency | Use | Evidence |
|---|---|---|
| bash (>= 4 style `[[ ]]`, `(( ))`, `${var##*/}`) | script host | `:1` |
| awk (uses `match`, `sprintf("%c")`, `toupper`, `delete arr`; `RSTART/RLENGTH`; `/dev/stderr`) | XML processing | `:57-403` |
| `mktemp`, `rm`, `chmod`, `mv` | atomic output | `:54`, `:55`, `:409-410` |

No other repository code is sourced or invoked. `sprintf("%c", n)` for 128..255 depends on the awk implementation emitting a single byte under `LC_ALL=C` (`:57`, `:130`).

## Integration Points (consumers)

| Consumer | How it is used | Evidence |
|---|---|---|
| CMake target `devicetypes-assets` | Passes `-DSTRIP_EXECUTABLE=${CMAKE_SOURCE_DIR}/build-tools/bidcos-devicetype-strip` to a `cmake -P` script | `src/devicetypes/CMakeLists.txt:8` |
| `GenerateDeviceTypes.cmake` | For families `rftypes` and `hs485types`, globs `*.xml`, runs the stripper to `<name>.tmp` (`-o`), fails the build on non-zero exit, missing, or empty output, then renames to `${ROOTFS_DIR}/firmware/<family>/<name>.xml`. Does not pass `-ccu2`. | `src/devicetypes/GenerateDeviceTypes.cmake:5-39` |
| CTest `bidcos-devicetype-strip` | Registered when `BUILD_TESTING` | `cmake/Components.cmake:188-190` |
| Test script | `tests/build-tools/test-bidcos-devicetype-strip.sh:1-` | see below |

Data volume processed: 130 XML files in `src/devicetypes/rftypes`, 18 in `src/devicetypes/hs485types` (the `-ccu2` flag is not exercised by the build, only by the test).

Legacy/parallel implementation: `src/devicetypes/stripdocu.tcl:1-20` (Tcl, regex-based; strips PIs, comments, `<docu>` tags and inter-tag whitespace). It is the behavioral predecessor; the Bash tool adds validation and normalization.

## Tests

`tests/build-tools/test-bidcos-devicetype-strip.sh` (outside this module's directory) with fixtures in `tests/build-tools/bidcos-devicetype-strip/input.xml`, `tests/build-tools/bidcos-devicetype-strip/expected.xml`, `tests/build-tools/bidcos-devicetype-strip/expected-ccu2.xml`:

- Golden-output comparison with `cmp` for normal and `-ccu2` modes (`test-bidcos-devicetype-strip.sh:13-19`).
- Output file mode must be 644 (`:15`).
- Four malformed inputs must fail and must leave no output file: unfinished `<docu>`, attribute without value, two root elements, bad entity (`:21-33`).
- Output path being a directory must fail (`:35-38`).
- Fixture `input.xml` exercises: multiline comment, `xml-stylesheet` PI, `docu` with `>` in attribute and nested markup, inline comment, inline docu, `>` in attribute value, numeric entities `&#34;&#38;&#60;&#62;`, expected output is a single line (`expected.xml`).

## Migration Considerations (facts only)

- Single-purpose, self-contained, stateless filter: input XML file in, minimized XML file out; no network, no environment variables, no config files read.
- Behavior to preserve in any port: ISO-8859-1 declaration in output, `<docu>` removal, entity normalization rules, empty-element self-closing, strict failure semantics, atomic write with mode 0644, optional in-place mode, `-ccu2` `paired` removal.
- The only coupling to the rest of the repo is the path `build-tools/bidcos-devicetype-strip` in `src/devicetypes/CMakeLists.txt:8` and `cmake/Components.cmake:189-190`.
