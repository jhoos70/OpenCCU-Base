# Module: bin (prebuilt binaries and runtime scripts)

## Overview

- Path: `bin/` (47 files: 44 ELF binaries in 4 per-architecture subdirectories, 3 Tcl scripts at the top level)
- Language: compiled binaries (ELF, built from C++ in `src/`) plus three `#!/bin/tclsh` scripts
- Role: repository-resident runtime payload for the CCU rootfs. `bin/<platform>/` holds the deployed output of the `src/` native build (written by `make deploy` / `DEPLOY_TO_REPO`), plus the closed-source `ReGaHss` ReGa engine that has no source in this repo. The `hm_*` scripts are staged verbatim into the rootfs `bin/`.
- Binaries were not opened or disassembled; this document is based on `ls`, `file(1)` header output, `sha256sum`, CMake files, git metadata and the three readable Tcl scripts.
- Evidence level: file metadata plus build files. Binary-internal behavior (symbols, linked libs, strings) is not documented and is unknown from this analysis.

## Directory layout

| Path | Content |
|---|---|
| `bin/hm_autoconf` | Tcl script, 638 lines, 22470 B, mode 755 |
| `bin/hm_deldev` | Tcl script, 25 lines, 419 B, mode 755 |
| `bin/hm_startup` | Tcl script, 81 lines, 2693 B, mode 755 |
| `bin/x86_64-linux-gnu/` | 11 ELF binaries, 64-bit x86-64 PIE, interpreter `/lib64/ld-linux-x86-64.so.2` |
| `bin/aarch64-linux-gnu/` | 11 ELF binaries, 64-bit ARM aarch64 PIE, interpreter `/lib/ld-linux-aarch64.so.1` |
| `bin/arm-linux-gnueabihf/` | 11 ELF binaries, 32-bit ARM EABI5 hard-float PIE, interpreter `/lib/ld-linux-armhf.so.3` |
| `bin/i686-linux-gnu/` | 11 ELF binaries, 32-bit Intel i386 PIE, interpreter `/lib/ld-linux.so.2` |

Platform set is the same as `SUPPORTED_PLATFORMS` (`CMakeLists.txt:5-10`), the `PLATFORMS` default (`Makefile:1`) and the presets in `CMakePresets.json` (toolchain files `cmake/toolchains/aarch64-linux-gnu.cmake`, `cmake/toolchains/arm-linux-gnueabihf.cmake`, `cmake/toolchains/i686-linux-gnu.cmake`; x86_64 is native).

No symlinks are committed. The runtime alias `hss_ledctl` -> `hss_led` is created only by the build (`src/hss_led/CMakeLists.txt:46`, `cmake/Components.cmake:97-117`) and does not exist under `bin/`. There is no `bin/ReGaHss` at top level, only per-platform copies (the older doc line `entry-points.md:4` writing `bin/ReGaHss` is shorthand).

## Binary inventory and size per architecture

Size in bytes (from `ls -l`). Mode is the file mode as checked out.

| Binary | Mode | x86_64 | aarch64 | armhf | i686 |
|---|---|---|---|---|---|
| `ReGaHss` | 644 | 1950968 | 1806440 | 1172428 | 2155668 |
| `rfd` | 755 | 865048 | 807472 | 504556 | 910216 |
| `hs485d` | 755 | 420184 | 391288 | 243216 | 431736 |
| `multimacd` | 755 | 338344 | 330000 | 185952 | 349876 |
| `eq3configcmd` | 755 | 100656 | 84048 | 58880 | 95844 |
| `hss_led` | 644 | 92472 | 84056 | 58880 | 91752 |
| `eq3configd` | 644 | 68184 | 63848 | 42764 | 63352 |
| `crypttool` | 755 | 43320 | 34904 | 22020 | 38504 |
| `ssdpd` | 644 | 35120 | 26632 | 21960 | 30256 |
| `hs485dLoader` | 755 | 35120 | 26632 | 17864 | 30256 |
| `SetInterfaceClock` | 755 | 22832 | 18440 | 13768 | 22064 |
| Directory total (`ls` blocks, KiB) | | 3900 | 3596 | 2316 | 4148 |

Observations (metadata only):

- Four binaries are checked in without the executable bit: `ReGaHss`, `hss_led`, `eq3configd`, `ssdpd` (mode 644 in all four architectures). The others are 755. These four are the files most recently rewritten in git (see Provenance); the staging step for `ReGaHss` uses `install(PROGRAMS ...)` (`cmake/Components.cmake:175`), which sets exec permission on install, but the checked-in file itself is not executable.
- Within one architecture, `ssdpd` and `hs485dLoader` have identical sizes on x86_64 (35120), aarch64 (26632) and i686 (30256) but different SHA-256 values on x86_64 (`ssdpd` 4608830c..., `hs485dLoader` 471ac3e9...), so they are not duplicates. On armhf they differ in size (21960 vs 17864). Likewise `eq3configcmd` and `hss_led` are both 58880 B on armhf (hashes not compared there).
- `ReGaHss` is the largest binary on every architecture (about 1.2 to 2.2 MB); `rfd` is second.
- Binary counts match `src/` program targets exactly: 10 programs built from source plus `ReGaHss`.

## Mapping binaries to `src/` components

Program list in `cmake/Components.cmake:29-30`; each is added through `add_subdirectory(src/<program>)` when `BUILD_<NAME>` is ON (default `BUILD_DEFAULT_COMPONENTS=ON`, `CMakeLists.txt:27`). Every program calls `openccu_stage_target(<name> bin)` (`CMakeLists.txt:47-75`), which copies the output to `${ROOTFS_DIR}/bin` and, if `DEPLOY_TO_REPO`, to `bin/<TARGET_PLATFORM>/` (`CMakeLists.txt:49-51,62-66`). That is how the files in this module are produced.

| Binary | Source dir | Entry source | Notable link libs (from CMake) | Role (from source/CMake names, not from binary) |
|---|---|---|---|---|
| `rfd` | `src/rfd` | `rfd.cpp` (`src/rfd/CMakeLists.txt:20-`) | version header via `version.sh` (`:1-16`); `HAS_USB_SUPPORT` option (`CMakeLists.txt:30`) | BidCoS/HomeMatic RF daemon; sources `Bidcos*.cpp`, `RF*.cpp`, `hm2/*Port*.cpp`, `XmlRpcMethods.cpp` |
| `hs485d` | `src/hs485d` | `hs485d.cpp` (`src/hs485d/CMakeLists.txt:17-`) | version header via `version.sh` (`:1-14`) | HomeMatic Wired (HS485) daemon, CCU1 and LAN-gateway controllers (`HS485ControllerCCU1/LGW`, `HMWLGW*`) |
| `hs485dLoader` | `src/hs485dLoader` | `hs485dLoader.cpp` | `pthread m c elvutils xmlparser` (`src/hs485dLoader/CMakeLists.txt:12`) | helper for hs485d |
| `multimacd` | `src/multimacd` | all `*.cpp` via `GLOB_RECURSE` (`src/multimacd/CMakeLists.txt:1-3`) | `pthread rt m crypto elvutils` (`:30`) | multi-MAC daemon (name only); `etc.md` documents `crRFD.conf` `Adapter.1.Port=/dev/mmd_hmip` as the related device node |
| `eq3configd` | `src/eq3configd` | `main.cpp`, `src/networkconfig.cpp`, `src/udpframe.cpp` | `pthread crypto elvutils` | UDP network configuration daemon |
| `eq3configcmd` | `src/eq3configcmd` | `eq3configcmd.cpp` | `eq3config pthread crypto rt` (`src/eq3configcmd/CMakeLists.txt:6`) -> `lib/<platform>/libeq3config.so` | command-line client for eq3config |
| `crypttool` | `src/crypttool` | `crypttool.cpp`, `crypttoolconfig.cpp` | `crypto pthread elvutils` (`src/crypttool/CMakeLists.txt:10`) | crypto/key tool; also stages `config.txt` as `etc/config_templates/crypttool.cfg` (`:12-29`) |
| `hss_led` | `src/hss_led` | `hss_led.cpp` + LED/alarm/network sources | `XmlRpc elvutils xmlparser pthread` (`src/hss_led/CMakeLists.txt:38`); `PLATFORM_CCU3` define (`:30`); status-monitor variant gated by `HSS_LED_STATUS_MONITOR` (default ON) | LED/status control; build-time alias `hss_ledctl`; `src/hss_led/InfoLed.cpp:213` checks `/var/run/ReGaHss.pid` |
| `ssdpd` | `src/ssdpd` | `ssdpd.cpp` | `pthread` only (`src/ssdpd/CMakeLists.txt:9`) | SSDP discovery daemon (test alias `ssdp-alias` used in `tests/test-components.py:94-117`) |
| `SetInterfaceClock` | `src/SetInterfaceClock` | `SetInterfaceClock.cpp` | `XmlRpc hsscomm xmlparser elvutils pthread crypto` (`src/SetInterfaceClock/CMakeLists.txt:10`) | name suggests interface clock setting; links XmlRpc and hsscomm (not verified in source) |
| `ReGaHss` | none in repo | n/a | n/a | ReGa (HomeMatic logic/script engine) server; binary-only component |

Common compile settings in all program CMake files: `cxx_std_11` and `_TIME_BITS=64 _FILE_OFFSET_BITS=64` (e.g. `src/ssdpd/CMakeLists.txt:4-5`).

Shared libraries consumed by these programs are built from `src/lib*` (`cmake/Components.cmake:23-25`) and are deployed under `lib/<platform>/` (outside this module), currently `libelvutils.so libeq3config.so libhsscomm.so libLanDeviceUtils.so libUnifiedLanComm.so libxmlparser.so libXmlRpc.so tclrega.so tclrpc.so tclticks.so` for x86_64 (`ls lib/x86_64-linux-gnu`). `tclrega.so` and `tclrpc.so` are what the `bin/hm_*` scripts `load` (`bin/hm_startup:19-20`, `bin/hm_deldev:9-10`, `bin/hm_autoconf:42-43`).

### ReGaHss (closed-source, no `src/` component)

- No directory `src/ReGaHss` exists and nothing in CMake builds it. `cmake/Components.cmake:1-2` states "Prebuilt ReGaHss and Java archives are staged as assets; they are not advertised as source builds."
- Option `BUILD_REGAHSS` (default ON; forced ON by `BUILD_WEBUI`, `cmake/Components.cmake:12-14`) adds `${TARGET_PLATFORM}/ReGaHss` to the `scripts` list (`:165-167`), which is copied with `copy_if_different` from `bin/<platform>/ReGaHss` to `${ROOTFS_DIR}/bin/ReGaHss` (`:168-176`) and installed with `install(PROGRAMS ... DESTINATION bin COMPONENT assets)`. `BUILD_REGAHSS` also turns on `BUILD_TCLREGA` (`:17-19`), i.e. the `tclrega.so` Tcl extension that talks to it.
- Consumers elsewhere in the repo: restart through monit `catch {exec /usr/bin/monit restart ReGaHss}` (`src/webui/www/api/methods/ccu/restartReGa.tcl:10`); version selector file `/etc/config/ReGaHssVersion` (`src/webui/www/api/methods/user/setregaversion.tcl:11`); pid file `/var/run/ReGaHss.pid` (`src/hss_led/InfoLed.cpp:213`).
- Test guard: `tests/test-components.py:116` lists `bin/x86_64-linux-gnu/ReGaHss` among "protected" repository inputs that `make install` must not overwrite (only `make deploy` may).

## Shell scripts (readable Tcl)

All three start with `#!/bin/tclsh`, load the Tcl extensions `tclrega.so` and `tclrpc.so`, and talk to ReGa (`rega`/`rega_script`) and to rfd/hmserver (`xmlrpc`). `hm_deldev` and `hm_startup` are ISO-8859 encoded (German comments), `hm_autoconf` is UTF-8.

### `bin/hm_startup` (81 lines)

- Header (`:4-13`): run when ReGa starts (author Falk Werner, 2008). Marks configured devices' channels as configured.
- `checkDevices` (`:30-39`): `rega_script` loops `root.Devices().EnumUsedIDs()` and for each device with `ReadyConfig()` calls `ReadyConfigChns(true)`.
- `checkFalmotActive` (`:41-59`): finds channels labelled `HmIP-FALMOT-C8`/`HmIP-FALMOT-C12` with `HssType() == CLIMATECONTROL_FLOOR_TRANSCEIVER` whose metadata `chnActive` is not `"true"`, writes their addresses to stdout (added in commit `b65d70da`, SPHM-1417).
- Entry point (`:66-80`): runs `checkDevices`, collects the FALMOT addresses and for each calls XML-RPC `suppressServiceMessages(address, "", true)` at hard-coded `xmlrpc://127.0.0.1:32010` (`:72,77`). Port 32010 is the HmIP legacy port in `etc/config_templates/crRFD.conf` (`Legacy.Port=32010`). Errors are swallowed with `catch`; debug logging lines are commented out (`:76,78`).

### `bin/hm_deldev` (25 lines)

- Run when a device is deleted; `$argv` is the device address (`:15`).
- Sources `/www/api/eq3/common.tcl` and `/www/api/eq3/event.tcl` (`:12-13`, runtime paths, files live in `src/webui/www/api/eq3/`), calls `event_fire delete "\"$device\""` (`:17`) and logs via `logger -t hm_deldev` (`:19`). On any error it logs `error (device: ...)` (`:23`).

### `bin/hm_autoconf` (638 lines)

- Purpose: one-time automatic configuration of newly paired devices and defaults in ReGa.
- Locking: lock file `/var/hm_autoconf.lock` (`:3`), `get_lock` retries 20 times, 5 s apart (`:13-32`), `release_lock` at end (`:34-37,637`). Unless the argument `debug` is given, stdout is closed and re-opened onto `/tmp/hm_autoconf_<pid>.log` (`:5-9`).
- Default data: `FUNCTIONLIST` of 10 functions, keyed by name with i18n identifiers like `funcLight` (`:46-57`); `ROOMLIST` of 11 rooms (`:60-72`); `CHANNEL_FUNCTIONS` channel type -> function map (`:75-98`); `DEVICE_FUNCTIONS` (`HM-CCU-1 -> CENTRAL`, `:101-103`).
- Per-type hook procs, chosen dynamically by name: `conf_device_<TYPE>` (HM-RCV-50, HMW-RCV-50, HmIP-RCV-50, RPI-RF-MOD, HmIP-CCU3, HM-CCU-1: `:112-140`), `conf_channel_<TYPE>` (`POWER`, `SABOTAGE`: `:142-150`), `conf_value_<CH>.<PARAM>` (`WEATHER.RAIN_COUNTER`, `DISPLAY.SERVICE_COUNT`, `DISPLAY.ALARM_COUNT`: `:152-163`).
- Object creation helpers: `create_objects`/`create_functions`/`create_rooms` (`:165-210`), `create_sysvars` (alarm zone, presence, alarm and service message counters via `rega_script`, `:212-246`), `create_sysvar_to_value_prg` (`:249-`), `create_rain_calculation` with nested procs creating rain-today/yesterday system variables and reset/update programs (`:294-510`).
- Main flow: one `rega_script` enumerates interfaces, devices (those with `dev.MetaData("AUTOCONF")==null`, valid interface and address, `CreatingCompleted()`), functions, rooms and sysvars (`:512-537`); creates default functions/rooms/sysvars when none exist (`:543-556`); maps function names to IDs (`:559-563`); for each pending device queries `getDeviceDescription` / `getParamsetDescription(…,"VALUES")` via XML-RPC to the owning interface URL (`:582,593,617`), dispatches hooks and assigns channels to functions (`:594-607`, special case `PARENT_TYPE == HmIP-RCV-50` -> `CENTRAL` at `:604-607`); finally sets metadata `AUTOCONF` on the device (`:629`). The whole body is in a `catch` that prints `Error: ...` (`:633-635`).
- Quirk documented in-file: OSRAM Lightify devices produce an odd-length list and are guarded by a `catch` (`:565-570`).
- Quirk: logging calls inside the rain-calculation procs use tag `hm_deldev` (`:502,506`), apparently copy-pasted.
- Hard-coded values: lock/log paths above, German labels `Zentralennetzteil`, `Sabotagekontakt` (`:144,149`).

### Duplicate copies in `src/webui/rega/bin/`

- `src/webui/rega/bin/hm_autoconf`, `src/webui/rega/bin/hm_deldev`, `src/webui/rega/bin/hm_startup` contain the same scripts (`cmp` identical for `hm_startup`, `hm_deldev`; `hm_autoconf` differs by a single whitespace-only line, `:131`, tab vs empty). The copies under `src/webui/rega/bin` are mode 644 and not referenced by `src/webui/CMakeLists.txt` (it copies only `rega/www`, `src/webui/CMakeLists.txt:7`). The build uses the `bin/` versions (`cmake/Components.cmake:163,173-175`). History for the `src/webui/rega/bin` copy: `5f616267` (2025-05-15 "Add missing rega related scripts"), `b65d70da` (2025-06-20).
- Nothing in this repo invokes `hm_startup`, `hm_deldev` or `hm_autoconf`; the triggers (ReGa startup, device deletion event, autoconf trigger) are outside the repository (monit/init and ReGaHss).

## Build and deployment integration

- Build: `cmake --preset <platform>` + `--build ... --target package` (`cmake/README.md:19-40`). `DEPLOY_TO_REPO` defaults ON (`CMakeLists.txt:25`), so a plain build overwrites `bin/<platform>/` and `lib/<platform>/` in the working tree via `copy_if_different` (`CMakeLists.txt:62-66`).
- `make build` sets `-DDEPLOY_TO_REPO=OFF -DHAS_USB_SUPPORT=ON` (`Makefile:13`); `make install` makes a fresh image under `build/<platform>/selected-install`; `make deploy` copies `bin/ lib/ etc firmware www opt usr` back into the repository (`Makefile:23-32`). `make deploy` therefore is the sanctioned path for refreshing `bin/<platform>/`.
- Install: runtime binaries to `bin` in component `runtime` (`cmake/Components.cmake:118-120`); scripts and `ReGaHss` to `bin` in component `assets` (`:175`). Alias symlinks created at build and install time (`:97-117`); list of staged runtime files is written to `build/runtime-files.txt` (`:122`).
- Reproducibility: `rfd`, `hs485d`, `multimacd` embed a version header generated by `version.sh` + `cmake/WriteVersionHeader.cmake` (`src/rfd/CMakeLists.txt:1-16`, `src/hs485d/CMakeLists.txt:1-14`, `src/multimacd/CMakeLists.txt:5-20`); `src/hs485d/generated-hs485d-version.h` is checked into the source dir.
- Test coverage: `tests/test-components.py` checks staging/aliases/deploy semantics on a fixture (`:94-117`); no test inspects the binary contents.

## Provenance and history

- `git log -- bin` lists 478 commits touching this directory.
- Latest five commits on `bin`: `030dba79`, `355c0530`, `1c18ae59`, `826a662b`, `f4ffc21a` are all "ReGaHss: update binaries to R1.00.0388.025x" (versions `.0259` down to `.0255`; PRs #159, #154, #152, #142, #139). `030dba79` (2026-10-09, Jens Maus) changed only the four `ReGaHss` binaries (aarch64 1806376 -> 1806440, armhf 1172376 -> 1172428, i686 2155588 -> 2155668, x86_64 1946800 -> 1950968 bytes). Current ReGaHss version is therefore R1.00.0388.0259 per the commit message; the version is not stated in the file tree.
- Earlier history for other binaries: `c70e246c` 2026-06-03 "Updated to version 3.89.2 (3.89.X RC 1)", `3dd0b4c3` 2026-04-10 "Updated Beta Binaries based on hmapps-64bb828", `6b0cc92a` 2026-03-17 "Updated Beta Binaries based on hmapps-dfb3b05". These are bulk binary refreshes.
- ELF `BuildID`s are present per binary in `file` output (x86_64 ReGaHss `d84448c1...`, ssdpd `97dcb774...`, rfd `7089adc8...`, etc.), usable to match deployed binaries to builds.
- `.gitignore` contains only `/build`; the binaries are tracked.

## Dependencies and coupling

- Inbound: CMake staging/packaging (`cmake/Components.cmake`, `Makefile`, `CMakeLists.txt`); `tests/test-components.py`; runtime consumers listed under ReGaHss; the WebUI Tcl API (`src/webui/www/api/...`) which restarts ReGa and shells into the same rootfs.
- Outbound at runtime (from scripts): `tclrega.so`, `tclrpc.so` (`lib/<platform>/`); `/www/api/eq3/common.tcl`, `event.tcl`; XML-RPC endpoint `127.0.0.1:32010`; `logger`; `/var`, `/tmp` lock/log paths; `/bin/tclsh` interpreter at a fixed path.
- Cross-module: `etc.md` (config templates for hmserver, crypttool), `usr.md` (Tcl/runtime tree), `src/lib*` shared libs, `src/webui`.

## Migration-relevant risks

1. Four target architectures x 11 binaries must each be rebuilt or re-sourced; `ReGaHss` cannot be rebuilt from this repo (no source), so any re-platforming depends on the upstream vendor binary and its R1.00.0388.xxxx series, with its `tclrega.so` interface contract (`src/tclrega`) and monit service name `ReGaHss`.
2. Checked-in 644 mode on `ReGaHss`, `hss_led`, `eq3configd`, `ssdpd` is inconsistent with the other 755 binaries; direct use from `bin/` (without `install(PROGRAMS)`) would not run them.
3. Default `DEPLOY_TO_REPO=ON` makes ordinary builds rewrite tracked binaries; the `make` wrapper turns this off (`Makefile:13`).
4. Script duplication: `bin/hm_*` vs `src/webui/rega/bin/hm_*` can drift (already differ by one whitespace line in `hm_autoconf`).
5. Scripts encode ReGa DOM API calls (`dom.GetObject`, `ReadyConfig`, `EnumUsedIDs`, metadata keys `AUTOCONF`, `chnActive`) and fixed local ports; they are the only readable specification of that ReGa-facing behavior in the repo.
6. Not determined by this analysis: shared-library dependencies (`NEEDED`), exported symbols, embedded version strings and runtime flags of any binary; these would need binary inspection tooling outside the scope given.
