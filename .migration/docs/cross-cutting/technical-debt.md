# Technical Debt
## Duplication / Drift
- `www/` (committed, deployed snapshot) vs `src/webui/www` (source of record): 49 differences in `www/config`, 52 in the other `www` subdirs; `www/config` last updated in commit 5ad0af6c (2026-06-03); `devdescr/DEVDB.tcl` is generated but tracked despite a `*` `.gitignore`.
- `networkconfig.cpp` duplicated in `eq3configd` and `libeq3config`.
- Windows leftovers (`win32_service`, HID headers, `rfd-nmake.mk`) not built.
## Bugs / Latent Issues (from module docs; not all re-verified)
- `hs485dLoader`: usage says `-ilf` but code parses `-ilp`; `find_last_of("</interfaces>")` is a char-set search; EACCES/ENOEXEC exit condition looks unreachable because `retVal` is reset each iteration.
- `UpstreamCharConnection.cpp:121`: LOG format has two `%s`, one argument.
- `HS485_RESPONSE_TIMEOUT` comment says 10 ms, value is 200.
- `SetInterfaceClock` casts epoch time to 32-bit int (2038).
- `rfd` fatal init errors call `exit(0)`.
- multimacd: dead config keys (`*Cmdline Pattern`, `Default Subsystem`).
- `::HomeMatic::Session` and `Script` APIs are unimplemented stubs.
## Build
- `DEPLOY_TO_REPO` defaults ON in presets, OFF in Makefile and CI; kernel modules and some tests not built by CMake; `src/tclticks` not wired in.
## Legacy
- Hard-coded absolute paths and product branching (`getProduct < 3`, `isOldCCU`) throughout `www/config`; commented-out debug blocks; 2008 author headers (`file_io.tcl:1-12`).
- Hand-synchronised ioctl numbers between kernel module and userspace.
## Coverage limits of this documentation
- Partial reads: rfd, multimacd, hs485d, libhsscomm, libeq3config, libXmlRpc, `src/webui`, `www/config/easymodes`; related repository `/home/standard/dev/OpenCCU` not analyzed.
