# System Dependencies
## External Dependencies
- OpenSSL libcrypto (EVP MD5, AES-128-CBC): `libelvutils/md5.cpp`, `crypttool`, `eq3configd`, `TCPEncryption`; linked by rfd and multimacd (no call sites found, see technical-debt).
- Tcl (headers/library via `TCL_INCLUDE_PATH`, `TCL_LIBRARY`, not defined in root CMake, passed by caller/CI): `tclrega`, `tclrpc`, `tclticks`; Tcl package `tdom` used by `devicetypes/list_values.tcl`.
- tinythread (threads in multimacd); Linux kernel headers for `eq3_char_loop` / `bcm2835_raw_uart` (not built by CMake).
- Third-party in tree: `libxmlparser` (Frank Vanden Berghen XML parser V1.14, LGPL 2.1), `libXmlRpc` (XmlRpc++ derivative).
- Web: jQuery, prototype, scriptaculous, jqPlot, knockout, spectrum, iro, jquery-ui under `/webui/js/extern`; Bootstrap 5 in `src/webui` (not in `www/webui`).
- Prebuilt closed-source binaries: `bin/ReGaHss`, `hs485d`, `eq3configd`, `crypttool` etc. (see `modules/bin.md`).
- Licensing: see `modules/licenses.md`; its exceptions table has a path mismatch (`src/libxmlrpc` vs `src/libXmlRpc`) and lists a non-existent top-level `webui` path.

## Internal Dependencies (link level)
- `crypttool`, `eq3configd` -> `libelvutils`, OpenSSL.
- `eq3configcmd` -> `libeq3config` -> `libelvutils`, `libLanDeviceUtils`, `libUnifiedLanComm` (confirmed by `tests/test-components.py:73`).
- `hs485d`, `rfd`, `hss_led` -> `libhsscomm`, `libXmlRpc`, `libelvutils` (see `modules/src.md` per-module sections).
- Runtime coupling without link dependency: `multimacd` <-> `eq3_char_loop` kernel module (hand-copied ioctl numbers); `multimacd` -> `rfd`, HMIPServer.
- Components built via `cmake/Components.cmake` options `BUILD_<COMPONENT>`; `src/tclticks/CMakeLists.txt` is not added by any root file.
- Web: `www/` symlinks (`cgi.tcl`, `common.tcl`, `once.tcl`, `session.tcl`, `user.tcl`) point to absolute `/opt/hm/www/tcl/...`.

## Dependency Graph
See `overview/dependency-graph.md`.
