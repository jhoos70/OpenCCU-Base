# Module: root (build orchestration and repository metadata)

## Overview

- Path: `.` (root files only, non-recursive) plus the build support directories that are driven from the root: `cmake/`, `build-tools/`, `tests/`, `.github/workflows/`, `licenses/`.
- Language: build files (CMake 3.20+, GNU Make, CMake presets JSON, Bash/Python test glue, GitHub Actions YAML, Markdown).
- Role: top-level build and packaging orchestration for OpenCCU-Base. It selects components, cross-compiles the native C/C++ modules under `src/` for four Linux targets, stages them into a rootfs layout, and installs or deploys them next to the prebuilt runtime content (`bin/`, `lib/`, `www/`, `etc/`, `firmware/`, `opt/`, `usr/`). No application logic lives here.
- Root files: `CMakeLists.txt` (125 lines), `CMakePresets.json` (76 lines), `Makefile` (36 lines), `README.md`, `.gitignore` (`/build`, `.gitignore:1`).
- Project declaration: `project(OpenCCUBase LANGUAGES C CXX)` (`CMakeLists.txt:3`), `cmake_minimum_required(VERSION 3.20)` (`CMakeLists.txt:1`), `include(CTest)` (`CMakeLists.txt:5`).
- Out of scope here (other module docs): `src/*`, `www/`, `etc/`, `usr/`, `bin/` contents.

## File inventory

| File | Lines | Purpose |
|---|---|---|
| `CMakeLists.txt` | 125 | Platform validation, options, staging helper `openccu_stage_target`, includes `cmake/Components.cmake` |
| `cmake/Components.cmake` | 191 | Component selection graph, subdirectory wiring, runtime manifest, install rules, CTest registration |
| `cmake/WriteVersionHeader.cmake` | 7 | Script mode helper that writes `#define <MACRO> "<version text>"` header from a version file |
| `cmake/toolchains/*.cmake` (aarch64-linux-gnu, arm-linux-gnueabihf, i686-linux-gnu, x86_64-linux-gnu) | ~11 each | Cross toolchain files (compilers and find-root modes) |
| `cmake/README.md` | 127 | Build documentation (presets, options, targets, install semantics) |
| `CMakePresets.json` | 201 | Configure and build presets per platform |
| `Makefile` | 36 | GNU Make wrapper that loops over platforms |
| `build-tools/bidcos-devicetype-strip` | 411 | Bash+awk tool used while generating device type XML |
| `tests/test-components.py` | 146 | Python unittest for component selection and install closure |
| `tests/build-tools/test-bidcos-devicetype-strip.sh` | 38 | Shell test of the strip tool with XML fixtures |
| `.github/workflows/ci.yml` | 213 | CI build matrix and staged package verification |
| `.github/workflows/update-prebuilt-libraries.yml` | 119 | Regenerates prebuilt `libXmlRpc.so`/`libxmlparser.so` and opens a PR |
| `licenses/licenses.md`, `gpl-2.0.txt`, `lgpl-2.1.txt`, `HMSL2.txt` | | License texts and exception table |
| `README.md` | 49 | Project description and repository layout |
| `.claude/settings.json` | | Claude Code attribution settings only (not part of build) |

## Build entry points

### GNU Make wrapper (`Makefile`)

- Variables: `PLATFORMS ?= x86_64-linux-gnu aarch64-linux-gnu arm-linux-gnueabihf i686-linux-gnu` (`Makefile:1`), `CMAKE`, `CMAKE_OPTIONS`, `BUILD_TARGET ?= package` (`Makefile:1-4`).
- `all` -> `build` (`Makefile:8-10`).
- `build-%` (`Makefile:12-14`): `cmake --preset $*` with `-DDEPLOY_TO_REPO=OFF -DHAS_USB_SUPPORT=ON $(CMAKE_OPTIONS)`, then `cmake --build --preset $* --target $(BUILD_TARGET)`.
- `install-%` (`Makefile:18-21`): removes and recreates `build/<platform>/selected-install` through `cmake --install ... --prefix`.
- `deploy-%` (`Makefile:25-32`): copies the selected install image back into the source tree: `bin/<platform>/`, `lib/<platform>/` (platform-specific) and `etc firmware www opt usr` (shared) using `cp -a`. This overwrites repository content in place and keeps unrelated files (verified by `tests/test-components.py:109-136`).
- `clean` (`Makefile:34-35`): `rm -rf build/<platform>`.
- Note: the wrapper forces `DEPLOY_TO_REPO=OFF`, while presets default it to `ON` (see below).

### CMake presets (`CMakePresets.json`)

- Schema version 6, CMake >= 3.20 (`CMakePresets.json:2-6`).
- Hidden preset `base` (`:9-17`): generator `Unix Makefiles`, `binaryDir` `${sourceDir}/build/${presetName}`, `CMAKE_BUILD_TYPE=Release`, `DEPLOY_TO_REPO=ON`.
- Four configure presets with matching build presets (target `package`): `x86_64-linux-gnu` (no toolchain file, empty `CROSS_PREFIX`), `aarch64-linux-gnu`, `arm-linux-gnueabihf`, `i686-linux-gnu` (each with `toolchainFile` `cmake/toolchains/<triple>.cmake`, `CROSS_PREFIX=<triple>-`) (`:18-52`, `:54-75`).

### Toolchain files (`cmake/toolchains/*.cmake`)

- Set `CMAKE_SYSTEM_NAME Linux`, `CMAKE_SYSTEM_PROCESSOR` (`aarch64`, `x86`, `x86_64`, ...), C/C++/ASM compilers `<triple>-gcc`/`-g++` (e.g. `cmake/toolchains/aarch64-linux-gnu.cmake:1-5`).
- Find-root modes: programs `NEVER`, libraries/includes/packages `ONLY` (`cmake/toolchains/aarch64-linux-gnu.cmake:7-10`).
- `x86_64-linux-gnu.cmake` exists but the x86_64 preset does not reference it (`CMakePresets.json:20-25`).

## Top-level CMake logic (`CMakeLists.txt`)

- Supported platforms list (`:7-12`); `TARGET_PLATFORM` cache string default `x86_64-linux-gnu`, validated with `FATAL_ERROR` otherwise (`:14-20`).
- Cache variables: `CROSS_PREFIX`, `ROOTFS_DIR` (`${CMAKE_BINARY_DIR}/rootfs`), `DEPLOY_ROOT` (`${CMAKE_SOURCE_DIR}`) (`:22-24`).
- Options (`:25-29`): `DEPLOY_TO_REPO` (ON), `BUILD_DEFAULT_COMPONENTS` (ON), `BUILD_TCL_MODULES`, `BUILD_WEBUI_AND_DEVICETYPES` (both default to `BUILD_DEFAULT_COMPONENTS`), `HAS_USB_SUPPORT` (OFF, consumed by rfd).
- Tool paths (`:31-34`): `OPENCCU_TCLSH_EXECUTABLE` (`tclsh`) to generate WebUI assets, `OPENCCU_PYTHON_EXECUTABLE` (`python3`) to convert them.
- `prepare-stage` custom target creates `${ROOTFS_DIR}/{bin,lib,www,etc,firmware,opt,usr}` (`:36-45`).
- `openccu_stage_target(target dest_subdir)` (`:47-83`): shared function called by each native module's `CMakeLists.txt` (about 20 call sites under `src/`). It records `OPENCCU_STAGE_DIR` on the target, depends on `prepare-stage`, and POST_BUILD copies the output into `${ROOTFS_DIR}/<dest>`. If `DEPLOY_TO_REPO`, it also copies to `${DEPLOY_ROOT}/bin|lib/<TARGET_PLATFORM>` (arch-specific for bin/lib, flat otherwise). Handles `OPENCCU_RUNTIME_ALIASES` target property by creating relative symlinks in both locations (`:69-81`).
- Includes `cmake/Components.cmake` (`:85`) and prints status lines (`:87-89`).
- Not defined at root: `TCL_INCLUDE_PATH` and `TCL_LIBRARY` are consumed by `src/tclrega`, `src/tclrpc`, `src/tclticks` (`src/tclticks/CMakeLists.txt:9-10`, `src/tclrega/CMakeLists.txt:10,13`) but only supplied externally (CI passes them, `.github/workflows/ci.yml:151-153`). Note: there is no `find_package(TCL)` in the root files.

## Component graph (`cmake/Components.cmake`)

- Asset components (default from `BUILD_WEBUI_AND_DEVICETYPES`): `WEBUI`, `DEVICETYPES`, `TCL_HOMEMATIC` (`:3-5`). Staged-asset components (default from `BUILD_DEFAULT_COMPONENTS`): `HMSERVER`, `HMIP_TOOLS`, `FIRMWARE`, `HM_SCRIPTS`, `REGAHSS` (`:6-8`).
- Implicit dependencies: `BUILD_WEBUI` forces `DEVICETYPES`, `TCL_HOMEMATIC`, `REGAHSS`, `TCLRPC` (`:9-15`); `BUILD_REGAHSS` forces `TCLREGA` (`:17-19`).
- Internal libraries configured once with `EXCLUDE_FROM_ALL`: `elvutils xmlparser XmlRpc hsscomm LanDeviceUtils UnifiedLanComm eq3config` from `src/lib<name>` (`:23-25`). Actual build/installation follows the link graph.
- Native programs, each with `BUILD_<UPPERCASE>` option (`:29-37`): `SetInterfaceClock crypttool eq3configcmd eq3configd hs485d hs485dLoader hss_led multimacd rfd ssdpd`.
- Tcl modules `tclrega`, `tclrpc` (`BUILD_TCLREGA`, `BUILD_TCLRPC`, default `BUILD_TCL_MODULES`) (`:39-46`).
- Compat libraries `xmlparser`/`XmlRpc`: `BUILD_COMPAT_LIBRARIES` (OFF) and target `compat-libraries` (`:48-52`).
- Kernel modules `bcm2835_raw_uart`, `eq3_char_loop`: configured as explicit non-ALL targets (`:55-61`).
- `openccu_collect_runtime` (`:66-80`) walks `LINK_LIBRARIES` of the selected roots recursively to find all staged targets (those with `OPENCCU_STAGE_DIR`). The result drives:
  - POST_BUILD re-staging on the `core` target (`:91-95`),
  - alias symlinks (build tree, optional repo deploy, and an `install(CODE ...)` link with DESTDIR support) (`:97-117`),
  - `install(TARGETS ... COMPONENT runtime)` to `bin`/`lib` (`:118-120`),
  - generated manifest `${CMAKE_BINARY_DIR}/runtime-files.txt` (`:86-89`, `:122`).
- Generated asset subprojects (`:124-134`): `src/webui`, `src/devicetypes`, `src/tcl_homematic` added when their option is on; they define `webui-assets`, `devicetypes-assets`, `tcl-homematic-assets` targets and are added as dependencies of `core`.
- `openccu_asset_directory(component source destination)` (`:136-145`) copies a directory to the rootfs and installs it under component `assets`; used for `HMSERVER -> opt/HMServer`, `HMIP_TOOLS -> opt/HmIP`, `FIRMWARE -> firmware` (`:146-148`). `devicetypes-assets` depends on `FIRMWARE-assets` when both are on (`:149-151`); firmware fallback install when devicetypes are on without FIRMWARE (`:152-154`). `www/` and `usr/` rootfs trees are installed for `WEBUI` and `TCL_HOMEMATIC` (`:155-160`).
- Scripts copied from `bin/` (`:161-176`): `hm_autoconf hm_deldev hm_startup` (`BUILD_HM_SCRIPTS`) and the prebuilt `bin/<platform>/ReGaHss` binary (`BUILD_REGAHSS`). ReGaHss is binary only, not built from source.
- Config templates (`:178-185`): `src/crypttool/config.txt` installed as `etc/config_templates/crypttool.cfg`; `etc/config_templates/crRFD.conf` and `log4j2.xml` installed when `BUILD_HMSERVER`.
- Final targets: `package` depends on `core` (`:187`); with `BUILD_TESTING` registers CTest `bidcos-devicetype-strip` (`:188-191`).
- Install components: `runtime` (native programs, libraries) and `assets` (runtime data) as documented in `cmake/README.md:92-95`.

### Observations

- `src/tclticks` has its own `CMakeLists.txt` (`src/tclticks/CMakeLists.txt:6`) but is not added by any root or `cmake/` file (grep over `*.cmake` and `CMakeLists.txt` finds only its own).
- Kernel module targets (`bcm2835_raw_uart`, `eq3_char_loop`) are not part of `core`/`package` roots.
- `DEPLOY_TO_REPO` is ON via presets (writes into `bin/<platform>`, `lib/<platform>`, tracked directories), but OFF in `make` and CI.

## Helper scripts

### `cmake/WriteVersionHeader.cmake`

- Script mode (`cmake -P`). Requires `MACRO_NAME`, `INPUT`, `OUTPUT`; strips the input file text and writes `#define ${MACRO_NAME} "<text>"` (`cmake/WriteVersionHeader.cmake:1-7`).
- Used by `src/hs485d/CMakeLists.txt:9-11` (`HS485D_VERSION`), `src/multimacd/CMakeLists.txt:13-15` (`MULTIMACD_VERSION`), `src/rfd/CMakeLists.txt:9-11` (`RFD_VERSION`).

### `build-tools/bidcos-devicetype-strip`

- Bash script embedding a large `awk` program (411 lines). Usage `bidcos-devicetype-strip <in.file> [-ccu2] [-o out.file]` (`build-tools/bidcos-devicetype-strip:8`, argument loop `:15-33`).
- Writes to a temp file in the output directory and atomically replaces the target (`:51-53`); refuses directories as output (`:46-50`).
- The awk part validates XML entities and numeric character references (restricted to ISO-8859-1 range, `validate_codepoint`), normalizes tags, drops `docu` content and, with `-ccu2`, applies CCU2-specific filtering. Malformed input fails with a non-zero exit.
- Invoked from `src/devicetypes/GenerateDeviceTypes.cmake` through `-DSTRIP_EXECUTABLE=${CMAKE_SOURCE_DIR}/build-tools/bidcos-devicetype-strip` (`src/devicetypes/CMakeLists.txt:8`). The script itself requires only `bash`, `awk` and `mktemp`.

## Tests

- `tests/test-components.py` (unittest, Python 3): builds temporary CMake trees with `BUILD_DEFAULT_COMPONENTS=OFF` and checks `DESTDIR` install file sets (`tests/test-components.py:38-48`). Cases: no components -> empty (`:65-67`), `ssdpd` only (`:69-71`), `eq3configcmd` library closure and reselection (`:73-79`), compat libraries (`:81-84`), `HMSERVER` assets (`:86-89`), relocatable relative alias symlinks via a fixture copy (`:91-107`), `make install` vs `make deploy` preserving repo inputs (`:109-136`), timeout reporting (`:138-142`). Timeout `OPENCCU_TEST_TIMEOUT` default 600 s, kills the process group (`:13-28`).
- `tests/build-tools/test-bidcos-devicetype-strip.sh`: compares output with `expected.xml` and `expected-ccu2.xml` fixtures, checks file mode 644, and verifies that four malformed inputs and a directory output path fail (`tests/build-tools/test-bidcos-devicetype-strip.sh:13-38`). Registered as CTest (`cmake/Components.cmake:188-191`).

## CI / automation (`.github/workflows/`)

- `ci.yml` "CI Build": triggers push to `main`, pull_request, workflow_dispatch (`:6-11`); `contents: read` (`:14-15`); concurrency cancel-in-progress. Matrix of 4 platforms on `ubuntu-24.04` with a `debian:bookworm-slim` amd64 container (`:27-47`, `:61-68`). Installs `build-essential` or `gcc-<triple>` cross packages, `cmake`, `default-jre-headless`, `libssl-dev`, `libusb-1.0-0-dev`, `python3`, `tcl`, `tcl-dev`, `pkg-config` (`:113-126`). Runs `python3 tests/test-components.py -v` on x86_64 only (`:136-138`), configures with `-DDEPLOY_TO_REPO=OFF -DBUILD_TCL_MODULES=ON -DTCL_INCLUDE_PATH -DTCL_LIBRARY -DHAS_USB_SUPPORT=ON -DBUILD_WEBUI_AND_DEVICETYPES=ON` (`:149-155`) and builds `package`. A second step checks the staged outputs exist and are non-empty, verifies ELF architecture of `bin/rfd` and `lib/tclrega.so` with `file`, and compares device XML counts between `src/devicetypes/rftypes`, `src/devicetypes/hs485types` and `firmware/` (`:161-212`). The action is pinned by commit SHA (`:51`).
- `update-prebuilt-libraries.yml`: on push to `main` touching `src/libXmlRpc/**`, `src/libxmlparser/**` or the workflow, or on dispatch (`:22-30`). Builds `compat-libraries` for all four platforms in the bookworm container with `DEPLOY_TO_REPO=ON`, strips with `--strip-unneeded`, sets mode 0644 (`:51-98`), then opens a PR from `ci/regenerate-prebuilt-libs-<run id>` if `lib/` differs (`:103-130`). Needs `contents: write` and `pull-requests: write` (`:32-34`). Rationale in header comment: keep prebuilt glibc compatibility with runtime (`:1-5`).

## External dependencies

- Host tools: CMake >= 3.20, GNU Make, C/C++ compiler or cross GCC (`gcc-<triple>`), `bash`, `awk`, `python3` (tests, WebUI asset conversion), `tclsh` (WebUI asset generation), `file`, `pkg-config`, Java runtime in CI (`default-jre-headless`).
- Libraries supplied by system/toolchain: OpenSSL (`libssl-dev`), libusb-1.0 (`HAS_USB_SUPPORT`), Tcl (`tcl-dev`).
- CI: `actions/checkout` (SHA-pinned), Docker `debian:bookworm-slim`, `gh` CLI in the update workflow.

## Prebuilt / non-source assets controlled by the root build

- `bin/<platform>/ReGaHss` (prebuilt, staged only), `opt/HMServer`, `opt/HmIP` (Java archives), `lib/<platform>/libXmlRpc.so` and `libxmlparser.so` (prebuilt LGPL libraries refreshed by the CI workflow).
- Latest commit in this checkout updates the ReGaHss binaries (`030dba79`).

## Licensing (`licenses/licenses.md`)

- Default license is HMSL 2.0 (`licenses/licenses.md:4`). Exceptions: the installed XmlRpc and xmlparser shared libraries, `src/libxmlrpc`, `src/libxmlparser` LGPL-2.1; `src/bcm2835_raw_uart/bcm2835_raw_uart.c` GPL-2.0; `src/eq3_char_loop/*.c` GPL-2.0+; `src/webui` and `webui` Apache 2.0 (`:12-20`). Note: the table says `src/libxmlrpc` but the directory is `src/libXmlRpc` (case mismatch on case-sensitive filesystems); `webui` top-level path does not exist (only `www/` and `src/webui`).

## Coupling and migration notes

- Every native module depends on the root only through `openccu_stage_target`, `ROOTFS_DIR`, `DEPLOY_ROOT`, `TARGET_PLATFORM`, `HAS_USB_SUPPORT`, `OPENCCU_TCLSH_EXECUTABLE`/`OPENCCU_PYTHON_EXECUTABLE` and `cmake/WriteVersionHeader.cmake`.
- Tcl location variables `TCL_INCLUDE_PATH` / `TCL_LIBRARY` are an implicit contract with the caller.
- The output layout (`bin/<triple>`, `lib/<triple>`, shared `etc firmware www opt usr`) is what the downstream OpenCCU repository (`/home/standard/dev/OpenCCU`) consumes; it is used as a scope hint only and was not analyzed.
