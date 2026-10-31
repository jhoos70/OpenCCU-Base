# Infrastructure
Sources: `modules/.github.md`, `modules/root.md`, `modules/cmake.md`, `modules/etc.md`.

## CI/CD (`.github/workflows`)
- `ci.yml` ("CI Build", 212 lines): triggers on push to `main`, any `pull_request`, `workflow_dispatch` (`ci.yml:6-11`). Job `build` (`:22-159`) runs on `ubuntu-24.04`, 90 min timeout, 4-platform matrix (x86_64, aarch64, arm-linux-gnueabihf, i686), builds inside a `debian:bookworm-slim` container via `docker run` (cross toolchains per platform, `:75-106`). Least-privilege `permissions: contents: read` (`:14-15`), concurrency cancel-in-progress (`:17-19`), actions pinned by SHA (`:49-53`). `tests/test-components.py` runs only on `x86_64-linux-gnu` (`:136-137`).
- `update-prebuilt-libraries.yml` (119 lines): regenerates prebuilt `libXmlRpc.so` / `libxmlparser.so` on `workflow_dispatch` or pushes touching their sources.
- Absent: CODEOWNERS, PR templates, dependabot, release/deploy workflows.

## Build and packaging
- CMake components (`BUILD_<COMPONENT>` options, `cmake/Components.cmake`), install to a staged rootfs; `Makefile` targets `install`, `deploy` (output `build/<platform>/selected-install`). `DEPLOY_TO_REPO` defaults ON in presets, OFF in Makefile and CI.
- Prebuilt binaries per architecture are committed in `bin/` and `lib/` (see `modules/bin.md`).

## Runtime layout
- Config under `/etc/config`, state under `/var/status` and `/var/run`, init scripts invoked by name (e.g. `/etc/init.d/S40network`). Runtime pid and status files are listed in `data-flow.md`.
- No containers, Kubernetes manifests, systemd units or Dockerfile were found in this repository (the related repository `/home/standard/dev/OpenCCU`, which has Buildroot, Helm and Home Assistant add-on directories, was not analyzed).
