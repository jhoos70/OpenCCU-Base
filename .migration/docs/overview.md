# Migration Overview

## System Summary
OpenCCU-Base is the base system of the OpenCCU smart-home central (HomeMatic CCU): native C/C++ radio and wired-bus daemons (`rfd`, `multimacd`, `hs485d`, `hss_led`, `eq3configd`), a kernel UART loopback driver (`eq3_char_loop`), Tcl extensions (`tclrega`, `tclrpc`, `tclticks`), and a Tcl/JavaScript/ReGa web UI. A closed-source `bin/ReGaHss` binary (script engine, web server for ReGa pages) is shipped prebuilt. Build is CMake with component options. Related repository (not analyzed): `/home/standard/dev/OpenCCU` [src-001].

## Codebase Statistics
9,793 files, ~1.06M LOC, tier large, monorepo. Source LOC: Tcl 72% (658,860), JavaScript 16%, C++ 8%, C/C++ 3%. Biggest trees: `src` (5,519 files; `src/webui` 4,545), `www` (4,011).

## Entry Points
`CMakeLists.txt`, `Makefile`, per-component `src/*/CMakeLists.txt`; daemons `rfd` (`rfd.cpp`), `multimacd` (`multimacd.cpp`), `hs485d` (`hs485d.cpp`), `hs485dLoader`, `hss_led`, `eq3configd` (`main.cpp`); web: `www/api/homematic.cgi`, `www/config/*.cgi`, `www/rega/pages/index.htm`. See `overview/entry-points.md`.

## Module Map
`modules/`: root, .github, bin, build-tools, cmake, etc, firmware, licenses, opt, src (native + webui), tests, usr, www (config + rest).

## External Interfaces
XML-RPC (hs485d :2000, rfd :2001), JSON-RPC (`/api/homematic.cgi`), UDP 8182 (hss_led), AF_UNIX `/run/hss_led/control`, `/dev/eq3loop` ioctls, unified LAN protocol (TCP), eq3configd UDP. See `cross-cutting/integration-seams.md`.

## Key Dependencies
OpenSSL, Tcl (+tdom), tinythread, in-tree libXmlRpc/libxmlparser; web JS libs. See `cross-cutting/dependencies.md`.

## Risk Areas
Kernel/ioctl contract (`eq3loop`) and XML-RPC surface (high per integration analysis); weak crypto and default keys; request-driven `exec` in `cp_software.cgi:493`; drift between `www/` and `src/webui/www`; closed-source `ReGaHss`. See `cross-cutting/security.md`, `technical-debt.md`.

## Graph Navigation
No code graph produced; see `overview/dependency-graph.md` for the stack graph.

## Source Documents
`overview/*`, `modules/*`, `cross-cutting/*`, `external-context/summary.md`.
