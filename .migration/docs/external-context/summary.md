# External Context Summary
Source [src-001]: sibling repository `/home/standard/dev/OpenCCU` and its existing deep-explore output (`.migration/docs`, index quality 100, verification 100%/98%, audit 10/10 PASS). Summaries only; not source-code evidence for this repository.

## What it is
Buildroot `BR2_EXTERNAL` layer for OpenCCU: packages, board configs, Buildroot patches, OCI Dockerfile, Home Assistant add-ons, Helm chart, release tooling. It consumes OpenCCU-Base (this repo) as a pinned dependency through the `openccu-base` package (version set by `scripts/update-openccu-base.sh`, release or 40-char SHA mode). Maintainer docs there: `docs/OPENCCU_BASE_MIGRATION.md`, `docs/base-patch-migration.md`, `docs/openccu-base-components.md` (`BR2_PACKAGE_OPENCCU_BASE_*`).

## Relevant to this repository
- **Rootfs patches against Base output:** 64 generated patches (about 391 `.orig` files), 41 of them touching `webui.js`. They depend on exact generated output of this repo: `webui.js` line splitting in the first 10 lines (helper scripts split and re-join it) and CRLF in `www/tcl/eq3/rega.tcl`. Any restructuring of `src/webui` output (bundle layout, line structure, `rega.tcl` line endings) will break these patches until they are migrated into this repo (the documented direction of travel, `docs/base-patch-migration.md`).
- **Branding overlay** `overlay/WebUI-openccu`: OpenCCU favicons, logos, menu icons under `www/ise/img`, vendored JS libs (prototype, scriptaculous, spectrum), CodeMirror 6 bundle at `www/webui/js/extern/codemirror6/`. A nextGen UI must either absorb or keep this overlay.
- **Ports contract** (hand-synchronized across OCI, Home Assistant, Helm): hs485d 32000, rfd 32001, ReGa 8183 / 1998. WebUI `login.htm` is used as the container HEALTHCHECK.
- Full ReGa/XML-RPC contracts, HMServer, device type XML schemas are explicitly out of scope there and belong to this repository.
- Its `make check` runs `check-openccu-base`, including `test_devicetypes_assets.py` and `test_version_headers.py`.
- Risks it records: transitional rootfs patch series, permissive Home Assistant AppArmor/privileged settings, unvalidated inputs in `hapdrap`.
- Not covered there: `scripts/`, `release/`, `home-assistant-addon-proxy/`, repo root.

## User-provided
- No critical flows, constraints, or gotchas provided.
