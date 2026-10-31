# Migration Plan: Migrate src-feature--native-libs (libhsscomm, libXmlRpc, libxmlparser, libelvutils)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: framework-upgrade (retain / untouched; hygiene-only changes)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | src-feature--native-libs | primary | index.json | `src/libhsscomm` (115 files, ~11.7k LOC), `src/libXmlRpc` (29 files, ~5.5k LOC), `src/libxmlparser` (6 files, ~2.5k LOC, vendored V1.14), `src/libelvutils` (45 files, ~3.1k LOC) |
| 2 | src-feature--tcl-extensions | affected | index.json | `tclrpc.so` links `XmlRpc` (`src/tclrpc/CMakeLists.txt:13`), `tclrega.so` links `xmlparser` (`src/tclrega/CMakeLists.txt:13`); this is the only path by which the Tcl/CGI layer (and therefore the UI) touches these libraries |
| 3 | src-feature--rfd / hs485d / multimacd | affected | index.json | Daemons consume `hsscomm`, `XmlRpc`, `xmlparser`, `elvutils` (multimacd only `elvutils`); any ABI or behaviour change ripples into all of them |
| 4 | src-feature--config-tools / hss-led | affected | index.json | `SetInterfaceClock`, `hss_led`, `hs485dLoader`, `eq3config` link `XmlRpc`, `hsscomm`, `xmlparser`, `elvutils` |
| 5 | .github (update-prebuilt-libraries.yml) and licenses | dependency | index.json | CI regenerates the prebuilt `.so` files; `licenses/licenses.md` documents the LGPL status |
| 6 | OpenCCU packaging repo (external) | affected | user | Pins this repo by SHA; consumes `lib/<arch>/*.so` and/or builds from source (see external-context summary) |

---

## Context

### Summary

Four shared C++ libraries form the common base of every HomeMatic interface daemon and of the two Tcl XML-RPC/XML bridges. They contain no web UI code.

- `libhsscomm` (`hsscomm`, C++11, `-fPIC`): comm-controller and message-queue framework, device/channel/paramset model, logical and physical types, about 20 `HSSTypeConversion*` value converters, and `HSSManager` with `HSSXmlRpcEventDispatcher`, which fans events out as `system.multicall` batches to clients registered through `init`. Links `pthread elvutils xmlparser XmlRpc` (PRIVATE).
- `libXmlRpc`: vendored and modified XmlRpc++ 1.x (Chris Morley, LGPL 2.1+). Client, server, `select` dispatcher, `XmlRpcValue`. Plain HTTP/1.x over TCP, no TLS. 10 `.cpp` are built.
- `libxmlparser`: vendored Frank Vanden Berghen XML parser V1.14 (modified by eQ-3 2006-2007, LGPL 2.1). `openFileHelper` terminates the process on a parse error. Used for device-description XML (rfd, hs485d) and by `tclrega` for ReGa responses.
- `libelvutils`: Logger, Actor, TimerQueue, PropertyMap, MD5 (OpenSSL EVP), CRC16, Hexfile, MulticastSender, OSCompat, TimeZoneInfo, utils.

For the nextGen UI these libraries matter only indirectly: the XML-RPC wire format that `libXmlRpc` speaks (client side in `tclrpc.so`, server side in rfd/hs485d) is the contract between the Tcl backend and the daemons. The UI never links or loads them.

Depth caveat: the existing docs analysed `libelvutils` and `libxmlparser` in detail but only sampled `libhsscomm` (type conversion bodies not read) and `libXmlRpc` (only client and headers read). The assessment of those two rests on inventory, headers and build facts.

### Migration Drivers

- No functional driver from the UI renovation: the libraries are below the API boundary. The driver is to freeze their contract (XML-RPC wire format, `hsscomm` event semantics) so UI and API work cannot break the daemons.
- Prebuilt binary hygiene: the four `lib/<arch>/` directories track 40 binaries in git (10 per architecture: `libXmlRpc`, `libxmlparser`, `libelvutils`, `libhsscomm`, `libeq3config`, `libLanDeviceUtils`, `libUnifiedLanComm`, `tclrega`, `tclrpc`, `tclticks`), but `update-prebuilt-libraries.yml` only regenerates `libXmlRpc.so` and `libxmlparser.so` (target `compat-libraries` = `xmlparser XmlRpc`, `cmake/Components.cmake:49`). The other eight per architecture have no visible regeneration path and can silently drift from source.
- Documentation consistency: licensing and CI docs refer to `src/libxmlrpc` and `lib/libxmlparser.so`, which do not exist as written.
- Dead cross-platform leftovers add noise (Windows project files, `win_pipe.*`, `Makefile.bindist`).

### Current State

Native C++ shared libraries built by CMake presets for four architectures (x86_64, i686, aarch64, armhf) in a Debian bookworm container; GitHub Actions `ci.yml` builds and verifies the install closure on one architecture only; `update-prebuilt-libraries.yml` (workflow_dispatch plus push to `main` touching `src/libXmlRpc/**` or `src/libxmlparser/**`) rebuilds the two compat libraries, strips them and opens a PR from a branch `ci/regenerate-prebuilt-libs-<run id>` under a hard-coded personal git identity. Deployed in-process on embedded Linux (CCU3-class, plus OCI / Home Assistant / Helm images). No unit tests exist for any of the four libraries; `tests/test-components.py` only checks the install closure.

### Cross-Cutting Findings

- **Prebuilt tracking asymmetry**: 40 binaries tracked, 8 of 10 per architecture not covered by the regeneration workflow (verified with `git ls-files lib`). Source of truth is ambiguous for those.
- **Workflow doc vs reality**: `.github.md` states the `lib/` tree holds only `libXmlRpc.so` and `libxmlparser.so`; the working tree holds ten files per architecture.
- **Licenses path mismatch**: `licenses/licenses.md` lists `src/libxmlrpc` (actual: `src/libXmlRpc`; breaks on case-sensitive tooling) and `lib/libxmlparser.so` and an unnamed "installed libXmlRpc shared library" (actual: `lib/<arch>/...`). LGPL 2.1 obligations (corresponding source for the shipped `.so`) are satisfied by the repo layout, but the document does not say so correctly.
- **Workflow supply chain**: personal committer identity, Docker base image tag not digest-pinned, apt packages unpinned, PRs opened with `GITHUB_TOKEN` do not trigger `CI Build` by default (technical-debt, `.github.md`).
- **Windows leftovers**: `src/libXmlRpc/xmlrpc.vc9.vcproj`, `Doxyfile`, `README.html`; `src/libxmlparser/xmlparser.vc9*.vcproj`; `src/libelvutils/OSCompatWin32.cpp`, `TimestampWin32.cpp`, `dllexport.h`; `src/libhsscomm/win_pipe.*`, `Makefile.bindist`, and `HSSTypeConversionIntegerList.*` present on disk but not in the CMake source list.
- **Robustness**: `XMLNode::openFileHelper` exits the process on a parse error; `XmlRpcClient::setTimeout` default is -1 (no timeout); `TimerQueue` global with no visible locking; `libelvutils::Logger` fixed 1024-byte buffer; C++11 only.
- **Crypto**: `libelvutils` MD5 uses OpenSSL EVP (`md5.cpp:10-55`); MD5 is only a checksum use here, not evaluated as a security control. The security findings in the global list (hard-coded key, predictable IV) are in `crypttool`, `eq3configd` and `libUnifiedLanComm`, not in these four libraries.
- **No transport security**: libXmlRpc has no TLS; the daemons rely on binding to localhost / trusted LAN. Do not expose without a wrapper.
- **No tests**: testing.md lists none for these libraries.

---

## Migration Goal

**Retain the native base libraries untouched for the nextGen UI; apply only provenance, documentation and CI hygiene.**

The UI renovation must not change C++ behaviour. The goal is to pin the interfaces the UI side depends on, make every tracked binary reproducibly derived from source, and correct the licensing and CI documentation. A rewrite of the libraries (for example to a modern XML-RPC or XML library) is explicitly out of scope and is judged high cost / no UI benefit.

---

## Decision

### Approach: Incremental migration (retain; hygiene-only changes)

Recommendation: **retain / untouched** for code. Optional low-risk follow-up changes: licensing path fix, prebuilt provenance, removal of Windows leftovers. No wrapping layer is needed because consumers already reach these libraries only via `tclrpc` / `tclrega` or the daemons.

**Rationale**: (1) The libraries are not on any UI code path; the UI-visible contract is the XML-RPC wire format (rfd 2001, hs485d 2000), which must remain byte-compatible for tclrpc, add-ons and the sibling OpenCCU repo. (2) There are no tests, so any code change in 115-file `libhsscomm` or the vendored parsers carries regression risk that cannot be measured. (3) The vendored parsers are LGPL and mature; replacing them offers no UI benefit. (4) The sibling packaging repo pins this repo by SHA and depends on the existing layout and port contracts (external-context summary).

### Rejected Options

- **Rewrite XML-RPC / XML layers with maintained third-party libraries (for example xmlrpc-c, pugixml)**: large regression surface, no tests, altered fault-code and Latin-1 behaviour that `dispatch.tcl` and add-ons rely on; no UI benefit.
- **Replace the XML-RPC protocol with a gateway or JSON/WebSocket layer inside these libraries**: belongs to the API-modernisation plan (webui-api, a new gateway process), not to the shared C++ libraries. Keep libraries as the legacy-protocol implementation behind that gateway.
- **Stop shipping prebuilt `.so` and build only from source**: would be cleaner but changes the contract with the packaging repo and CI; defer to a follow-up decision.
- **Delete `libhsscomm` converters judged unused**: unused-ness cannot be proven without tests and device coverage; XML device descriptions select converters by name at runtime.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | C++11 (`cxx_std_11`), some C | Unchanged (optional bump to C++17 is a separate decision, not required) |
| Frameworks | None (own Actor / TimerQueue; vendored XmlRpc++ 1.x and xmlParser V1.14) | Unchanged |
| Infrastructure | CMake presets for 4 architectures, Debian bookworm cross-build container, GitHub Actions (CI plus update-prebuilt-libraries), OpenSSL libcrypto | Unchanged; pin container digest, use a bot identity, extend the provenance of the tracked `lib/` binaries |

---

## Scope

**Mode**: targeted

### Included Components

- `src/libhsscomm`, `src/libXmlRpc`, `src/libxmlparser`, `src/libelvutils`
- `lib/<arch>/libXmlRpc.so`, `libxmlparser.so`, `libelvutils.so`, `libhsscomm.so` (tracked prebuilt binaries of these libraries)
- `.github/workflows/update-prebuilt-libraries.yml` (hygiene only)
- `licenses/licenses.md` rows for these libraries (documentation fix only)

### Excluded Components

- `src/webui`, `src/webui/www`, `www/` (UI targets, covered by webui-* plans)
- `src/tclrega`, `src/tclrpc`, `src/tclticks` (tcl-extensions plan)
- `src/rfd`, `src/hs485d`, `src/multimacd`, `src/libeq3config`, `src/libUnifiedLanComm`, `src/libLanDeviceUtils`, `src/eq3configd`, `src/crypttool` (separate features; the security findings sit there)
- Closed-source `bin/ReGaHss`

### Critical Components

- `libXmlRpc` `XmlRpcClient` / `XmlRpcValue` serialisation (wire format shared with tclrpc and both daemons)
- `libhsscomm` `HSSManager` / `HSSXmlRpcEventDispatcher` (event fan-out, `init` registration, persisted handler list under `/var/`)
- `libxmlparser` `XMLNode` (device-description XML and ReGa responses)
- Tracked `lib/<arch>/*.so` binaries and their regeneration workflow

### Boundaries

- No change to exported symbols, class layouts or `DLLEXPORT` surface; consumers (daemons, SetInterfaceClock, hss_led, tclrpc, tclrega) must continue to link without recompilation changes.
- The XML-RPC wire format is the boundary to the UI-side stack; the UI must not depend on these libraries directly.
- Any behavioural fix (timeouts, parse-error handling) is a separate, tested change and not part of this plan.

---

## Dependencies

### Internal

- `libhsscomm` -> `libelvutils`, `libxmlparser`, `libXmlRpc`
- `libXmlRpc` -> no internal dependency; `libxmlparser` -> none; `libelvutils` -> OpenSSL `crypto`
- Consumers: `rfd`, `hs485d`, `multimacd` (elvutils only), `SetInterfaceClock`, `hs485dLoader`, `hss_led`, `libeq3config`, `libUnifiedLanComm`, `libLanDeviceUtils`, `tclrpc` (XmlRpc), `tclrega` (xmlparser)
- `cmake/Components.cmake` (`compat-libraries`, `openccu_stage_target`), `CMakePresets.json`

### External

- OpenSSL libcrypto (EVP MD5 in `libelvutils`)
- LGPL 2.1 upstream projects: XmlRpc++ (Chris Morley), xmlParser (Frank Vanden Berghen), both vendored and modified
- Debian bookworm toolchain and cross compilers (i686, aarch64, armhf) used by the regeneration workflow
- Sibling Buildroot repo `/home/standard/dev/OpenCCU` pinning this repo by SHA

---

## Constraints

### Unchanged

- XML-RPC wire format and fault-code semantics (including -10 TransmissionPending) as used by `tclrpc`, `dispatch.tcl`, add-ons and external clients on rfd 2001 / hs485d 2000
- `HSSManager` event delivery format (`system.multicall` of `event` calls) and `init` callback registration
- Device-description XML parsing behaviour (`XMLNode`), including Latin-1 handling
- Library names, soname and install layout (`lib/<arch>/lib*.so`, `ROOTFS_DIR` staging), because the packaging repo and `tests/test-components.py` rely on them
- LGPL 2.1 licensing and the availability of the corresponding source in `src/libXmlRpc` and `src/libxmlparser`

### Integration Systems

- rfd (TCP 2001), hs485d (TCP 2000), HmIP server via `tclrpc`
- ReGaHss via `tclrega` (xmlparser)
- GitHub Actions (`ci.yml`, `update-prebuilt-libraries.yml`)
- OpenCCU Buildroot packaging repo (external)

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | Eight of ten tracked prebuilt binaries per architecture (libhsscomm, libelvutils, libeq3config, libLanDeviceUtils, libUnifiedLanComm, tclrega, tclrpc, tclticks) have no regeneration workflow and can drift from source; a consumer may then run a binary that does not match the repository | Decide per binary whether it is source-built or prebuilt; extend `compat-libraries` or the workflow, or stop tracking; add a CI check that rebuilds and compares symbol lists | `git ls-files lib` (40 files); `update-prebuilt-libraries.yml` builds only `compat-libraries` (`cmake/Components.cmake:49`) |
| high | No automated tests: any change to libhsscomm converters, XmlRpcValue serialisation or XMLNode parsing has no regression net | Treat the libraries as frozen; add golden-file tests for XML-RPC request/response encoding and for the converters before any change | testing.md; `src/libhsscomm`, `src/libXmlRpc` have no test directories |
| medium | Wire-format drift between tclrpc (client built from `libXmlRpc`) and daemons if only some prebuilt `.so` files are regenerated or rebuilt with a different compiler | Rebuild all consumers from the same revision; contract test against a real or mocked rfd | tcl-extensions plan; `src/tclrpc/CMakeLists.txt:13` |
| medium | LGPL compliance documentation is wrong (`src/libxmlrpc`, `lib/libxmlparser.so` do not exist as written); case-sensitive checkers or auditors will report missing files | Correct the rows to `src/libXmlRpc` and `lib/<arch>/libXmlRpc.so`, `lib/<arch>/libxmlparser.so`; state that corresponding source is in-repo | `licenses/licenses.md` rows; `licenses.md` doc observations |
| medium | Regeneration workflow supply chain: hard-coded personal git identity, unpinned apt packages, un-digested `debian:bookworm-slim`, PR from `GITHUB_TOKEN` that does not trigger `CI Build` | Use a bot identity, pin the image digest, add a workflow that verifies the PR (or a PAT/GitHub App) | `.github.md` workflow notes; `update-prebuilt-libraries.yml:98-99` |
| medium | Robustness defects in vendored code: `openFileHelper` exits the process on parse error; `XmlRpcClient` default timeout -1; unlocked global `TimerQueue`; fixed 1024-byte log buffer | Do not change under this plan; document as known behaviours; fix only with tests (follow-up) | `src.md` libxmlparser, libelvutils, libXmlRpc sections |
| medium | `libhsscomm` and `libXmlRpc` were only sampled in the deep-explore pass; unknown behaviours and dependencies may exist | Re-run a deep analysis of the type-conversion and dispatcher code before any decision beyond retain | `src.md` part 1c scope note |
| low | Windows leftovers and dead files (`vcproj`, `win_pipe.*`, `Makefile.bindist`, off-list `HSSTypeConversionIntegerList.*`) confuse readers and tooling | Remove in a hygiene-only commit after confirming that nothing in CMake or the packaging repo references them | `src.md` Windows leftovers; `src/libhsscomm/CMakeLists.txt` source list |
| low | Plain-text XML-RPC without TLS or authentication on TCP 2000/2001 | Keep bound to localhost / trusted LAN; address in the API gateway design, not in the library | `src.md` libXmlRpc (no SSL references) |

---

## Success Criteria

- No change in the XML-RPC request/response bytes produced by `tclrpc` against rfd and hs485d (verified by a recorded-exchange or golden-file test)
- Library names, sonames and install layout unchanged; `tests/test-components.py` passes for all four architectures where CI supports them
- Every tracked `lib/<arch>/*.so` is either regenerated by CI from the current sources or removed from tracking, with a documented decision per file
- `licenses/licenses.md` references only paths that exist (`src/libXmlRpc`, `src/libxmlparser`, `lib/<arch>/...`)
- Windows/VS leftovers removed or explicitly documented as retained, with no build break in the packaging repo
- Zero change to daemon behaviour (rfd, hs485d, multimacd) attributable to this feature
- Test coverage not below current baseline (none); at least a smoke test for `XmlRpcValue` round-trip and `XMLNode` parsing added if any code is touched

---

## Focus Areas

1. Provenance of the 40 tracked prebuilt binaries and extent of the regeneration workflow
2. Freeze and document the XML-RPC wire contract shared by tclrpc, rfd and hs485d
3. Licensing documentation fix (path case and prebuilt locations)
4. Hardening the regeneration workflow (identity, digest pinning, CI on generated PRs)
5. Deeper analysis of the unanalysed parts (`libhsscomm` converters and dispatcher, `libXmlRpc` server side)
6. Removal of Windows and other dead leftovers once references are ruled out
7. Add minimal golden-file tests before touching any behaviour

---

## Consequences

### Positive Outcomes

- UI and API work proceed without risk to the daemon base libraries
- Reproducible, auditable binaries and correct LGPL documentation
- Smaller repository noise (dead files) and a clearer CI story

### Negative Outcomes

- Known defects in vendored code (process exit on parse error, no client timeout, no TLS) remain until a tested follow-up
- C++11 and the vendored libraries stay a long-term maintenance burden
- Tracking prebuilt binaries in git continues unless the follow-up decision removes them

### Follow-Up Decisions

- Keep, regenerate or stop tracking each of the eight non-compat prebuilt binaries per architecture
- Whether a future API gateway should talk XML-RPC through `libXmlRpc` or via a new client library
- Whether to replace `libxmlparser` / `libXmlRpc` with maintained libraries once golden tests exist
- Whether to raise the C++ standard and add unit tests for `libhsscomm`

---

## Source Documents

- `.migration/plan-context.md` (shared context)
- `.migration/docs/modules/src.md` (parts 1, 1c: libelvutils, libxmlparser, libhsscomm, libXmlRpc sections)
- `.migration/docs/modules/licenses.md` (exceptions table, path mismatches)
- `.migration/docs/modules/.github.md` (update-prebuilt-libraries.yml)
- `.migration/docs/cross-cutting/technical-debt.md`, `testing.md`, `security.md` (via shared context)
- `.migration/docs/external-context/summary.md` (via shared context)
- `.migration/plan/src-feature--tcl-extensions.plan.md` (consumer view)
- Direct verification: `git ls-files lib`, `src/tclrpc/CMakeLists.txt`, `src/tclrega/CMakeLists.txt`, `.github/workflows/update-prebuilt-libraries.yml`, `src/libelvutils/md5.cpp`

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

