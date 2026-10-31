# Tech Stack
Source LOC: Tcl 72% (658,860), JavaScript 16% (144,291), C++ 8% (74,825), C/C++ 3% (27,387), C 0.3%, Python/Shell/Java negligible.
- Build: CMake (`CMakeLists.txt`, `cmake/*.cmake`), GNU Make (`Makefile`, `src/eq3_char_loop/Makefile`).
- CI: GitHub Actions (`.github/workflows`).
- Native: C++ daemons (rfd, multimacd, hs485d, hss_led, eq3configd) with in-tree libs (libXmlRpc, libhsscomm, libeq3config...). Tcl extensions (tclrega, tclrpc, tclticks).
- Web: Tcl CGI/ReGa scripts under `www`, JavaScript UI, FTL templates in `opt`.
- Unverified: Bootstrap 5 integration (recent commits mention it) - needs source confirmation.
