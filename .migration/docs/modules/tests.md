# Module: tests

## Overview

| Item | Value |
|------|-------|
| Directory | `tests/` |
| Languages | Python 3 (`unittest`), Bash, XML fixtures |
| Files | 5 (1 `.py`, 1 `.sh`, 3 `.xml`), ~205 lines |
| Role | Regression tests for the CMake component/installation system and the `bidcos-devicetype-strip` build tool |
| Tier | large (partition is tiny) |

Note: the stack-analysis reference template was not available; this document uses the standard module layout.

## Structure

```
tests/
  test-components.py                              146 lines  Python unittest: CMake build/install selection tests
  build-tools/
    test-bidcos-devicetype-strip.sh                38 lines  Bash test for build-tools/bidcos-devicetype-strip (awk XML stripper)
    bidcos-devicetype-strip/
      input.xml                                    19 lines  fixture input (ISO-8859-1 device description)
      expected.xml                                  1 line   expected default output
      expected-ccu2.xml                             1 line   expected output with -ccu2
```

Note: `src/hss_led/tests/LedControllerTest.cpp` (registered at `src/hss_led/CMakeLists.txt:40-45`) lives outside this directory and is not part of this module.

## How the tests are wired

| Test | Entry point | Invoked by |
|---|---|---|
| `test-components.py` | `python3 tests/test-components.py -v` | CI: `.github/workflows/ci.yml:137` (only when `TARGET_PLATFORM = x86_64-linux-gnu`, line 136); documented in `cmake/README.md:108` |
| `test-bidcos-devicetype-strip.sh` | CTest test `bidcos-devicetype-strip` | `cmake/Components.cmake:188-190` under `if(BUILD_TESTING)`; `CMakeLists.txt:5` does `include(CTest)` |

`test-components.py` is not registered with CTest; the shell test is not run by CI directly (only via `ctest` where `BUILD_TESTING` is on).

## test-components.py

Module-level (`tests/test-components.py`):

- `SOURCE` = repo root (`parents[1]`), line 12.
- `TIMEOUT` from env `OPENCCU_TEST_TIMEOUT`, default `600` seconds, line 13.
- `run(*args, timeout, **kwargs)` (lines 16-28): `subprocess.Popen` in a new session, merged stdout/stderr; on timeout kills the whole process group (`os.killpg(..., SIGKILL)`) and raises `AssertionError` with the last 12000 chars of output; non-zero exit raises `AssertionError("Command failed ...")`.

`ComponentsTest(unittest.TestCase)` (line 31):

| Method | Line | Behaviour / assertion |
|---|---|---|
| `setUp` | 32 | Creates `tempfile.TemporaryDirectory(prefix="base-components-")`, cleaned via `addCleanup`; `self.root` |
| `build(*options, component="runtime", source=SOURCE)` | 38 | Runs `cmake -S <source> -B <root>/build -DBUILD_DEFAULT_COMPONENTS=OFF -DDEPLOY_TO_REPO=OFF <options>`, `cmake --build -j4`, then `cmake --install --prefix / --component <component>` with `DESTDIR=<root>/install-N`; returns the set of relative file/symlink paths installed |
| `fixture` | 50 | Builds a mini source tree in tmp: copies `CMakeLists.txt`, `CMakePresets.json`, `Makefile`; symlinks `cmake/` and every `src/*` entry except `src/ssdpd`, which is copied so tests can patch it |
| `test_no_components` | 65 | Empty selection installs `set()` |
| `test_ssdp_only_has_no_internal_libraries` | 69 | `-DBUILD_SSDPD=ON` installs exactly `{"bin/ssdpd"}` |
| `test_configuration_tool_closure_and_reselection` | 73 | `-DBUILD_EQ3CONFIGCMD=ON` installs `bin/eq3configcmd` plus `lib/libeq3config.so`, `libelvutils.so`, `libLanDeviceUtils.so`, `libUnifiedLanComm.so` (dependency closure); then re-configuring in the same build dir with `EQ3CONFIGCMD=OFF, SSDPD=ON` yields only `bin/ssdpd` (no stale staging) |
| `test_compatibility_libraries_only` | 81 | `-DBUILD_COMPAT_LIBRARIES=ON` installs `lib/libxmlparser.so`, ` lib/libXmlRpc.so` |
| `test_asset_only_default_build` | 86 | `-DBUILD_HMSERVER=ON`, component `assets`, expects `opt/HMServer/HMServer.jar` in the install |
| `test_runtime_alias` | 91 | Patches fixture `src/ssdpd/CMakeLists.txt` replacing `openccu_stage_target(ssdpd bin)` with a preceding `set_property(TARGET ssdpd PROPERTY OPENCCU_RUNTIME_ALIASES ssdp-alias)`; expects `bin/ssdpd`, ` bin/ssdp-alias`; alias is a relative symlink `ssdpd` in both the install tree and `build/rootfs`; `build/runtime-files.txt` lists `bin/ssdp-alias`; deleting the staged symlink and rebuilding recreates it; deselecting `BUILD_SSDPD` leaves `set()` |
| `test_make_install_reselection_preserves_sources` | 109 | Uses the top-level `Makefile` with `PLATFORMS=x86_64-linux-gnu` and `CMAKE_OPTIONS=-DBUILD_DEFAULT_COMPONENTS=OFF ...`. Creates "protected" sentinel files (`bin/x86_64-linux-gnu/ReGaHss`, `lib/keep`, `etc/keep`, `firmware/keep`, `www/keep`, `opt/keep`, `usr/keep`). `make install` stages `build/x86_64-linux-gnu/selected-install/bin/ssdpd` without writing `bin/x86_64-linux-gnu/ssdpd` to the source tree; re-running with `SSDPD=OFF` removes it from the image; `make deploy` (SSDPD=ON) copies `ssdpd` and relative symlink `ssdp-alias` into `bin/x86_64-linux-gnu/`; protected files remain unchanged throughout |
| `test_timeout_reports_output` | 138 | Self-test of `run()`: a child printing `still running` then sleeping 60s with `timeout=0.5` must raise `AssertionError` matching `Timed out.*still running` |

Entry: `unittest.main()` at line 146.

### Components/variables exercised (defined elsewhere)

- Options: `BUILD_DEFAULT_COMPONENTS`, `DEPLOY_TO_REPO` (`CMakeLists.txt:25-26`), `BUILD_SSDPD`, `BUILD_EQ3CONFIGCMD`, `BUILD_COMPAT_LIBRARIES`, `BUILD_HMSERVER` (generated per-component options in `cmake/Components.cmake:7,32`).
- Target property `OPENCCU_RUNTIME_ALIASES` and function `openccu_stage_target` (`cmake/Components.cmake:67-97`).
- Install components `runtime` and `assets` (`cmake/Components.cmake:175-186`).
- Makefile targets `install`, `deploy` (`Makefile:16-26`), output dir `build/<platform>/selected-install`.

### External requirements

`cmake`, a C/C++ toolchain, `make`, Python 3; building `eq3configcmd` and `HMServer` (jar) needs whatever those components require (CI installs `tcl`, `tcl-dev`, `pkg-config`, toolchain packages at `.github/workflows/ci.yml:120-128`). Tests perform full CMake builds in temp dirs and take noticeable time (timeout 600 s per step).

## test-bidcos-devicetype-strip.sh

Bash, `errexit/nounset/pipefail` (lines 3-5). Locates repo root two levels above the script (line 7), runs `build-tools/bidcos-devicetype-strip` (Bash wrapper around an `awk` XML filter; usage `<in.file> [-ccu2] [-o out.file]`) against fixtures:

| Step | Lines | Check |
|---|---|---|
| Default run | 13-16 | Output equals `expected.xml` minus its final newline (`head -c -1`), via `cmp`; output file mode is `644` |
| `-ccu2` run | 18-20 | Output equals `expected-ccu2.xml` (trailing newline stripped) |
| Malformed inputs | 22-33 | Each of `<device><docu>unfinished</device>`, `<device broken></device>`, `<device/><device/>`, `<device value="&broken;"/>` must make the tool fail and must not leave the output file |
| Directory as output | 35-38 | `-o <directory>` must fail |

Uses `mktemp -d` with `trap 'rm -rf ...' EXIT` (lines 10-11).

### Fixtures (`tests/build-tools/bidcos-devicetype-strip/`)

- `input.xml:1` ISO-8859-1 declaration; contains an `xml-stylesheet` PI (line 2), `version="1" paired="true"` attributes (line 3), a multi-line comment (4-5), `<docu>` elements with embedded markup (6-8, and inline at 13), an attribute containing `>` (6, 14), `&amp;`, numeric entities `&#34;&#38;&#60;&#62;` (14, 17).
- `expected.xml:1` single line, encoding normalized to `ISO-8859-1`; stylesheet PI, comments, `<docu>` and inter-element whitespace removed; `>` in attributes escaped to `&gt;`, numeric entities decoded to `&quot;`, `&amp;`, `&lt;`, `&gt;`; retains `version="1" paired="true"`; ends with a newline.
- `expected-ccu2.xml:1` same as above but the `<device>` tag has only `version="1"` (the `paired` attribute dropped), i.e. `-ccu2` mode differs in attribute stripping on the root element.

## Cross-module dependencies

- Tests the build system in `CMakeLists.txt`, `cmake/Components.cmake`, `Makefile`, `src/ssdpd/CMakeLists.txt` (text-patched at runtime, `tests/test-components.py:94-97`).
- Tests `build-tools/bidcos-devicetype-strip`, which is used by `src/devicetypes/GenerateDeviceTypes.cmake:15` and `src/devicetypes/CMakeLists.txt:8` to generate device type XMLs.
- Consumed by CI (`.github/workflows/ci.yml`) and documented in `cmake/README.md`.

## Observations

- Only two test suites exist; there are no tests for runtime content (Tcl, ReGa scripts, web UI, firmware) in this directory.
- `test_runtime_alias` and `test_make_install_reselection_preserves_sources` depend on the exact string `openccu_stage_target(ssdpd bin)` in `src/ssdpd/CMakeLists.txt`; a change to that line breaks the replacement silently (`str.replace` does not assert a match), and the alias assertions would then fail.
- `fixture()` symlinks `src/*` but the Makefile test writes into the fixture's `bin/`, `lib/`, etc. (real directories created in the temp tree), so the real repository is not modified.
- CI runs `test-components.py` only on the `x86_64-linux-gnu` platform job.
