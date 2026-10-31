# Testing
Source: `modules/tests.md`.
- `tests/test-components.py` (146 lines, Python `unittest`): CMake component selection/install closure tests; run in CI only for `x86_64-linux-gnu` (`.github/workflows/ci.yml:136-137`); not registered with CTest.
- `tests/build-tools/test-bidcos-devicetype-strip.sh` (38 lines): CTest test registered at `cmake/Components.cmake:188-190` under `BUILD_TESTING`; fixtures `input.xml`, `expected.xml`, `expected-ccu2.xml`.
- `src/hss_led/tests/LedControllerTest.cpp`, registered at `src/hss_led/CMakeLists.txt:40-45`.
- `libUnifiedLanComm` tests exist but are not built by CMake; `MultithreadTest.cpp` in multimacd is compiled into the production binary via `GLOB_RECURSE`.
- Gaps: no tests for Tcl/ReGa scripts, web UI, firmware descriptors, or the XML-RPC daemons.
- Two tests depend on the exact string `openccu_stage_target(ssdpd bin)` in `src/ssdpd/CMakeLists.txt`.
