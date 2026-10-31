# Technology Stack

## Source Stack Summary
Tcl (CGI/ReGa web layer, libraries), JavaScript (web UI), C++ (daemons/libs), C (kernel/UART), CMake/Make, GitHub Actions. Details in `overview/tech-stack.md`.

## Languages and Runtimes
Tcl 72%, JavaScript 16%, C++ 8%, C/C++ 3%, C <1%, Python (tests), Shell, ReGa HomeMatic Script (`.fn`, `.htm`, `.hms`, executed by closed `ReGaHss`), FTL templates (`opt/`).

## Frameworks and Libraries
OpenSSL libcrypto, tinythread, in-tree libXmlRpc and libxmlparser, Tcl `tdom`; JS: jQuery, prototype, scriptaculous, jqPlot, knockout, spectrum, iro, jquery-ui; Bootstrap 5 in `src/webui`.

## Data Stores
No database. File-based: `/etc/config/*`, `/var/SESSIONS.dat`, `/etc/config/USERS.dat`, `/var/status/*`. ReGa internal store is in the closed binary (unknown).

## Messaging and Integration
XML-RPC, JSON-RPC, UDP, AF_UNIX SEQPACKET, char-device ioctls. In-process `CommMessageQueue` (hs485d); no external message broker.

## Build, Test, and Deployment
CMake + Makefile (`cmake/Components.cmake`, `BUILD_<COMPONENT>` options, `DEPLOY_TO_REPO`); CI `.github/workflows/ci.yml`; tests: `tests/test-components.py`, `tests/build-tools/*.sh`, `src/hss_led/tests`. See `cross-cutting/testing.md`.

## Version Evidence
`ReGaHss` binary R1.00.0388.0259 (git history); `libxmlparser` V1.14; other versions: Unknown.

## Unconfirmed Technologies
Bootstrap 5 wiring in deployed `www/`; OpenSSL use in rfd/multimacd (linked, no call site found); Windows build files.
