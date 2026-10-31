# Folder Structure
Repository: OpenCCU-Base (9,793 files, ~1.06M LOC, tier: large, monorepo). Related repository hint (not merged, not analyzed): `/home/standard/dev/OpenCCU` [src-001].

| Dir | Files | LOC | Dominant | Purpose |
|---|---|---|---|---|
| `.` | 5 | 77 | Make/CMake | Root `CMakeLists.txt`, `Makefile`, README |
| `.github` | 2 | 331 | YAML | CI workflows |
| `bin` | 47 | - | prebuilt binaries | ReGaHss, hs485d, eq3configd, crypttool etc. (excluded from globs) |
| `build-tools` | 1 | - | script | bidcos-devicetype-strip |
| `cmake` | 7 | - | CMake | Shared CMake modules |
| `etc` | 3 | 27 | conf/xml | Runtime configuration |
| `firmware` | 166 | - | XML/hex/eq3 | Device firmware images and maps |
| `licenses` | 4 | - | txt | License texts |
| `opt` | 21 | 8,116 | FTL | Templates, fwfix, config |
| `src` | 5,519 | 669,582 | C/C++, Tcl, JS | Native daemons/libs (rfd, multimacd, hs485d, hss_led, libs), `webui` source, `devicetypes` |
| `tests` | 5 | 205 | XML/sh/py | Tests |
| `usr` | 2 | 121 | Tcl | Userland Tcl |
| `www` | 4,011 | 386,054 | Tcl/JS/HTM | Deployed web UI, API, config pages |

`src` subdirs: SetInterfaceClock, bcm2835_raw_uart, crypttool, devicetypes, eq3_char_loop, eq3configcmd, eq3configd, hs485d, hs485dLoader, hss_led, libLanDeviceUtils, libUnifiedLanComm, libXmlRpc, libelvutils, libeq3config, libhsscomm, libxmlparser, multimacd, rfd, ssdpd, tcl_homematic, tclrega, tclrpc, tclticks, webui.
