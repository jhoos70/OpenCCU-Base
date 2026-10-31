# Module: cmake (build orchestration)

## Overview

- Path: `cmake/` (7 files, 325 lines: 191 `Components.cmake`, 127 `README.md`, 7 `WriteVersionHeader.cmake`, 4 x 11 toolchain files)
- Language: CMake script (`.cmake`, min version 3.20 set in `CMakeLists.txt:1`) + Markdown
- Role: build-orchestration layer for `src/`. The root `CMakeLists.txt` defines cache variables and the staging helper; `cmake/Components.cmake` selects components, collects the runtime install set and installs assets; `cmake/toolchains/*.cmake` provide cross-compiler definitions; `cmake/WriteVersionHeader.cmake` is a `-P` script that emits version headers.
- Not standalone: `cmake/` is only meaningful together with root `CMakeLists.txt` (89 lines), `CMakePresets.json` (77 lines) and `Makefile` (35 lines), which are documented here as entry points.

## File inventory

| File | Lines | Purpose |
|---|---|---|
| `cmake/Components.cmake` | 191 | Included from `CMakeLists.txt:85`. Component options, subdirectory wiring, runtime-target collection, install rules, `core`/`package` targets |
| `cmake/WriteVersionHeader.cmake` | 7 | Script mode (`cmake -P`): turns a version text file into `#define <MACRO_NAME> "<text>"` |
| `cmake/toolchains/aarch64-linux-gnu.cmake` | 11 | Toolchain file, `CMAKE_SYSTEM_PROCESSOR aarch64` |
| `cmake/toolchains/arm-linux-gnueabihf.cmake` | 11 | Toolchain file, `CMAKE_SYSTEM_PROCESSOR arm` |
| `cmake/toolchains/i686-linux-gnu.cmake` | 11 | Toolchain file, `CMAKE_SYSTEM_PROCESSOR x86` |
| `cmake/toolchains/x86_64-linux-gnu.cmake` | 11 | Toolchain file, `CMAKE_SYSTEM_PROCESSOR x86_64` (no preset references it, see Observations) |
| `cmake/README.md` | 127 | User-facing build documentation (presets, options, targets, install semantics, cache variables) |

## Entry points and build flow

1. Top-level `Makefile` wrapper (`Makefile:1-35`):
   - `PLATFORMS ?= x86_64-linux-gnu aarch64-linux-gnu arm-linux-gnueabihf i686-linux-gnu` (`:1`); `CMAKE_OPTIONS`, `BUILD_TARGET ?= package` overridable (`:3-4`).
   - `build-%` (`:12-14`): `cmake --preset $* -DDEPLOY_TO_REPO=OFF -DHAS_USB_SUPPORT=ON $(CMAKE_OPTIONS)` then `cmake --build --preset $* --target $(BUILD_TARGET)`.
   - `install-%` (`:18-21`): wipes `build/$*/selected-install`, then `cmake --install build/$* --prefix <abs>/selected-install`.
   - `deploy-%` (`:25-32`): copies `bin/`, `lib/` into `bin/$*`, `lib/$*` and `etc firmware www opt usr` into repo root with `cp -a` (non-destructive merge).
   - `clean` (`:34-35`): removes `build/<platform>`.
2. `CMakePresets.json` (version 6): hidden `base` preset (Unix Makefiles, `binaryDir ${sourceDir}/build/${presetName}`, `CMAKE_BUILD_TYPE=Release`, `DEPLOY_TO_REPO=ON`, `:9-18`); one configure and one build preset per platform; build presets target `package` (`:57-76`). Toolchain files referenced at `CMakePresets.json:30,39,48` (aarch64, arm, i686). The `x86_64-linux-gnu` preset (`:20-27`) has no `toolchainFile` and sets `CROSS_PREFIX=""`.
3. Root `CMakeLists.txt`:
   - Project `OpenCCUBase`, languages `C CXX` (`:3`); `include(CTest)` (`:5`).
   - `SUPPORTED_PLATFORMS` list (`:7-12`); `TARGET_PLATFORM` cache string default `x86_64-linux-gnu` (`:14`); `FATAL_ERROR` on unsupported value (`:17-20`).
   - Cache/option variables (`:22-34`), see table below.
   - `prepare-stage` custom target creating `${ROOTFS_DIR}/{bin,lib,www,etc,firmware,opt,usr}` (`:36-45`).
   - `openccu_stage_target(target dest_subdir)` function (`:47-83`): sets `OPENCCU_STAGE_DIR` property (`:54`), depends on `prepare-stage`, POST_BUILD `copy_if_different` into `${ROOTFS_DIR}/<dest>` (`:56-60`); if `DEPLOY_TO_REPO`, also copies to `${DEPLOY_ROOT}/<dest>/${TARGET_PLATFORM}` for `bin`/`lib` (`:48-52,62-68`); creates alias symlinks from `OPENCCU_RUNTIME_ALIASES` (`:69-81`).
   - `include(cmake/Components.cmake)` (`:85`) and three status messages (`:87-89`).
4. `cmake/Components.cmake` does the component selection (below). Final aggregate targets: `core` (ALL, `Components.cmake:27`) and `package` (`:187`).
5. CI: `.github/workflows/ci.yml:149,156` runs `cmake --preset "${TARGET_PLATFORM}"` and `cmake --build --preset "${TARGET_PLATFORM}"`.

## Cache variables and options

| Variable | Defined | Default | Meaning |
|---|---|---|---|
| `TARGET_PLATFORM` | `CMakeLists.txt:14` | `x86_64-linux-gnu` | Platform triple, validated against `SUPPORTED_PLATFORMS` |
| `CROSS_PREFIX` | `CMakeLists.txt:22` | `${TARGET_PLATFORM}-` | Cache string; set by presets (`""` for x86_64). Not referenced inside `cmake/` toolchain files (they hardcode compiler names) |
| `ROOTFS_DIR` | `CMakeLists.txt:23` | `${CMAKE_BINARY_DIR}/rootfs` | Staging directory |
| `DEPLOY_ROOT` | `CMakeLists.txt:24` | `${CMAKE_SOURCE_DIR}` | Repo root for deployed artifacts |
| `DEPLOY_TO_REPO` | `CMakeLists.txt:25` | `ON` | Copy outputs to `bin/<platform>`, `lib/<platform>`; the `Makefile` forces `OFF` |
| `BUILD_DEFAULT_COMPONENTS` | `CMakeLists.txt:26` | `ON` | Master default for per-component options |
| `BUILD_TCL_MODULES` | `CMakeLists.txt:27` | `${BUILD_DEFAULT_COMPONENTS}` | Default for `BUILD_TCLREGA`/`BUILD_TCLRPC` |
| `BUILD_WEBUI_AND_DEVICETYPES` | `CMakeLists.txt:28` | `${BUILD_DEFAULT_COMPONENTS}` | Default for `BUILD_WEBUI`/`DEVICETYPES`/`TCL_HOMEMATIC` |
| `HAS_USB_SUPPORT` | `CMakeLists.txt:29` | `OFF` | Enables USB support in rfd (`Makefile:13` turns it `ON`) |
| `OPENCCU_TCLSH_EXECUTABLE` | `CMakeLists.txt:31` | `tclsh` | Tcl interpreter for WebUI asset generation |
| `OPENCCU_PYTHON_EXECUTABLE` | `CMakeLists.txt:33` | `python3` | Python used to convert generated WebUI assets |
| `BUILD_<PROGRAM>` | `Components.cmake:29-37` | `${BUILD_DEFAULT_COMPONENTS}` | Per native program |
| `BUILD_TCLREGA`, `BUILD_TCLRPC` | `Components.cmake:39-46` | `${BUILD_TCL_MODULES}` | Tcl extensions |
| `BUILD_COMPAT_LIBRARIES` | `Components.cmake:48` | `OFF` | Include legacy xmlparser/XmlRpc in `core` |
| `BUILD_BCM2835_RAW_UART`, `BUILD_EQ3_CHAR_LOOP` | `Components.cmake:55-61` | `${BUILD_DEFAULT_COMPONENTS}` | Kernel module targets (configured, not in ALL/core) |
| `BUILD_WEBUI`, `BUILD_DEVICETYPES`, `BUILD_TCL_HOMEMATIC` | `Components.cmake:3-5` | `${BUILD_WEBUI_AND_DEVICETYPES}` | Generated asset components |
| `BUILD_HMSERVER`, `BUILD_HMIP_TOOLS`, `BUILD_FIRMWARE`, `BUILD_HM_SCRIPTS`, `BUILD_REGAHSS` | `Components.cmake:6-8` | `${BUILD_DEFAULT_COMPONENTS}` | Prebuilt runtime assets |
| `MACRO_NAME`, `INPUT`, `OUTPUT` | `WriteVersionHeader.cmake:1-6` | none (MACRO_NAME mandatory) | `-D` parameters for the version script |
| `OPENCCU_TEST_TIMEOUT` | `README.md:125-127` | 600 s | Timeout for component tests in `tests/test-components.py` |

## cmake/Components.cmake in detail

- Asset component options (`:3-8`): two `foreach` loops define `BUILD_<X>` options. Comment at `:1-2`: ReGaHss and Java archives are prebuilt and staged as assets, not compiled.
- Implicit dependency rules (`:9-15`): `BUILD_WEBUI` forces `BUILD_DEVICETYPES`, `BUILD_TCL_HOMEMATIC`, `BUILD_REGAHSS`, `BUILD_TCLRPC` ON; `BUILD_REGAHSS` forces `BUILD_TCLREGA` ON. These `set()` calls run before the later `option()` calls for `TCLRPC`/`TCLREGA` (`:41`), so the normal variable wins (relies on policy CMP0077, NEW under min version 3.20).
- Internal libraries (`:23-25`): `elvutils xmlparser XmlRpc hsscomm LanDeviceUtils UnifiedLanComm eq3config` added as `src/lib<name>` with `EXCLUDE_FROM_ALL`; only libraries reachable via the link graph are built.
- Native programs (`:27-37`): `SetInterfaceClock crypttool eq3configcmd eq3configd hs485d hs485dLoader hss_led multimacd rfd ssdpd`; option name is `BUILD_` + `string(TOUPPER)` of the directory name; enabled ones are `add_subdirectory(src/<name>)` and appended to `openccu_roots`.
- Tcl modules (`:39-46`): `tclrega`, `tclrpc`.
- Compat libraries (`:48-52`): target `compat-libraries` (depends on `xmlparser XmlRpc`), added to roots only if `BUILD_COMPAT_LIBRARIES`.
- Kernel modules (`:54-61`): `bcm2835_raw_uart`, `eq3_char_loop` subdirectories (explicit build only).
- `openccu_collect_runtime(target)` (`:66-80`): recursive walk over `LINK_LIBRARIES`; keeps only targets that have the `OPENCCU_STAGE_DIR` property (set by `openccu_stage_target`), so system/imported libs are skipped; result in global property `OPENCCU_RUNTIME_TARGETS`.
- Runtime loop (`:87-121`): for each collected target builds `runtime-files.txt` manifest lines, adds POST_BUILD re-staging to `core` (`:91-95`), creates alias symlinks in rootfs and (if `DEPLOY_TO_REPO`) in `${DEPLOY_ROOT}/<dest>/${TARGET_PLATFORM}` (`:98-117`), installs aliases via `install(CODE ...)` with DESTDIR support (`:112-116`), and `install(TARGETS ... RUNTIME DESTINATION bin LIBRARY DESTINATION lib COMPONENT runtime)` (`:118-120`). Manifest written with `file(GENERATE OUTPUT "${CMAKE_BINARY_DIR}/runtime-files.txt")` (`:122`).
- Generated assets (`:124-134`): table of `OPTION|dir|target` triples `WEBUI|webui|webui-assets`, `DEVICETYPES|devicetypes|devicetypes-assets`, `TCL_HOMEMATIC|tcl_homematic|tcl-homematic-assets`; adds `src/<dir>` and makes `core` depend on the target.
- `openccu_asset_directory(component source destination)` (`:136-145`): custom target `<COMPONENT>-assets` copying `${CMAKE_SOURCE_DIR}/<source>` to `${ROOTFS_DIR}/<destination>`; installs it in component `assets`. Calls (`:146-148`): `HMSERVER opt/HMServer`, `HMIP_TOOLS opt/HmIP`, `FIRMWARE firmware`.
- Cross-asset wiring (`:149-160`): `devicetypes-assets` depends on `FIRMWARE-assets` when both are on; if devicetypes without firmware, installs `${ROOTFS_DIR}/firmware/`; WebUI installs `${ROOTFS_DIR}/www/` to `www`; Tcl-homematic installs `${ROOTFS_DIR}/usr/` to `usr` (all component `assets`).
- Scripts and prebuilt binaries (`:161-176`): `hm_autoconf hm_deldev hm_startup` (`BUILD_HM_SCRIPTS`) and `${TARGET_PLATFORM}/ReGaHss` (`BUILD_REGAHSS`) are copied from `${CMAKE_SOURCE_DIR}/bin/` into `${ROOTFS_DIR}/bin` and installed with `install(PROGRAMS ...)`.
- Config templates (`:178-185`): `src/crypttool/config.txt` installed as `etc/config_templates/crypttool.cfg` (`BUILD_CRYPTTOOL`); `etc/config_templates/crRFD.conf` and `log4j2.xml` installed (`BUILD_HMSERVER`).
- Tail (`:187-191`): `package` target depends on `core`; if `BUILD_TESTING`, registers CTest `bidcos-devicetype-strip` running `tests/build-tools/test-bidcos-devicetype-strip.sh`.

Install components: `runtime` (native programs, libraries, alias symlinks) and `assets` (data directories, scripts, ReGaHss, config templates).

## cmake/WriteVersionHeader.cmake

Whole file (`:1-7`): requires `MACRO_NAME` (`FATAL_ERROR` if undefined, `:1-3`), reads `${INPUT}`, strips whitespace, writes `#define ${MACRO_NAME} "<text>"` to `${OUTPUT}`. Consumers (each runs the module's `version.sh`, redirects to a txt file, then invokes this script):
- `src/hs485d/CMakeLists.txt:1-13` (`HS485D_VERSION`)
- `src/multimacd/CMakeLists.txt:13-15` (`MULTIMACD_VERSION`)
- `src/rfd/CMakeLists.txt:9-11` (`RFD_VERSION`)

## Toolchain files

All four share an identical structure (`cmake/toolchains/<triple>.cmake:1-11`):
- `CMAKE_SYSTEM_NAME Linux`; `CMAKE_SYSTEM_PROCESSOR` set to `aarch64`, `arm`, `x86` or `x86_64`.
- `CMAKE_C_COMPILER`, `CMAKE_CXX_COMPILER`, `CMAKE_ASM_COMPILER` = `<triple>-gcc` / `-g++` / `-gcc` (`:4-6`).
- Find-root modes: PROGRAM `NEVER`, LIBRARY/INCLUDE/PACKAGE `ONLY` (`:8-11`). No `CMAKE_SYSROOT` or `CMAKE_FIND_ROOT_PATH` is set, so `ONLY` modes restrict lookups to an externally supplied root path.
- Referenced from presets: aarch64 `CMakePresets.json:30`, arm `:39`, i686 `:48`.

## README.md summary (`cmake/README.md`)

Documents: presets and `make`/`make install`/`make deploy` (`:14-47`), `BUILD_<NAME>` component options and dependency implications (`:49-84`), targets `core`, `package`, `compat-libraries` and install components (`:86-103`), regression tests `python3 tests/test-components.py -v` (`:105-109`), key cache variables (`:111-123`), `OPENCCU_RUNTIME_ALIASES` semantics with `hss_ledctl` example (`:118-123`, set at `src/hss_led/CMakeLists.txt:35`), test timeout (`:125-127`).

## Dependencies and coupling

- Consumers of `openccu_stage_target` (defined in root, relied on by `cmake/Components.cmake` via `OPENCCU_STAGE_DIR`): 20 call sites under `src/` (e.g. `src/ssdpd/CMakeLists.txt:10`, `src/rfd/CMakeLists.txt:138`, `src/libhsscomm/CMakeLists.txt:67`, `src/tclrega/CMakeLists.txt:14`).
- Directory conventions required by `Components.cmake`: `src/lib<name>`, `src/<program>`, `src/webui`, `src/devicetypes`, `src/tcl_homematic`, `src/bcm2835_raw_uart`, `src/eq3_char_loop`; repo directories `opt/HMServer`, `opt/HmIP`, `firmware`, `bin/hm_*`, `bin/<platform>/ReGaHss`, `etc/config_templates/`.
- Tests: `tests/test-components.py` copies `CMakeLists.txt`, `CMakePresets.json`, `Makefile` and symlinks `cmake/` into a fixture tree (`:52-56`), configures with `-DBUILD_DEFAULT_COMPONENTS=OFF -DDEPLOY_TO_REPO=OFF` (`:39-45`) and installs component `runtime` under `DESTDIR`; `tests/build-tools/test-bidcos-devicetype-strip.sh` via CTest.
- External tools needed at build time: cross GCC toolchains (`<triple>-gcc/g++`), `tclsh`, `python3`, `sh` (version scripts), Tcl and OpenSSL development packages (README `:77-79`).
- Related module docs: `etc.md` (config templates installed here), `usr.md`.

## Observations

- `cmake/toolchains/x86_64-linux-gnu.cmake` is not referenced by any preset (the x86_64 preset uses the host compiler, `CMakePresets.json:20-27`).
- `CROSS_PREFIX` is defined (`CMakeLists.txt:22`) and set by presets but not read by any file in `cmake/`; toolchain files hardcode compiler names.
- `src/tclticks/CMakeLists.txt` exists (builds module `tclticks`, `:6-11`) but no `add_subdirectory` for it appears in `Components.cmake`, root `CMakeLists.txt` or other CMake files, so it is not part of the build.
- `DEPLOY_TO_REPO` defaults to `ON` in both the root and presets, so a plain `cmake --build --preset` writes into the checkout (`bin/<platform>`, `lib/<platform>`); the `Makefile` explicitly passes `OFF`.
- Asset directories are copied verbatim with `copy_directory` (`Components.cmake:141`); staged content can persist across selections (acknowledged in `README.md:96-103`), hence install rules are the supported path.
- The Makefile `deploy` target merges into the repo without removing stale files (`Makefile:25-32`; `README.md:100-103`).
- No `CMAKE_SYSROOT`/`CMAKE_FIND_ROOT_PATH` in toolchains (see above): cross builds depend on environment/package-manager multiarch layout for finding libraries.
