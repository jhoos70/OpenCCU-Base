# Entry Points
- Build: `CMakeLists.txt`, `Makefile`, per-component `src/*/CMakeLists.txt`.
- CLI/daemon: `src/eq3configd/main.cpp`; daemons `hs485d`, `rfd`, `multimacd`, `hss_led`, `ssdpd`, `eq3configcmd`, `crypttool`, `SetInterfaceClock`.
- Prebuilt binary: `bin/ReGaHss` (ReGa script engine, binary only, not in source).
- Web: `www/` CGI/Tcl and `src/webui`.
No user-provided critical flows.
