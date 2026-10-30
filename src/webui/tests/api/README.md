# WebUI API contract tests

Tcl tests for the JSON-RPC API in `src/webui/www/api`. They run with `tclsh8.6` and mock every
bridge (`tclrpc.so`, `tclrega.so`, `login.htm`, the event queue, the file system), so no CCU is
needed. Nothing here touches the real system.

## Run

```sh
cd src/webui/tests/api/<component>      # e.g. dispatcher
tclsh8.6 tests/all.tcl                  # every tests/*.test, tests/integration/*.test, tests/flows/*.test
tclsh8.6 tests/sp001.test               # a single file
```

Components: `schema-harness` (mocks, golden runner, schema, drift and patch checks), `dispatcher`,
`security-session`, `event-push`, `interface-gateway`, `rega-model`, `system-admin`, `backup-cgis`,
`user-profile`, `optional-gateway`. Each prints `Total / Passed / Skipped / Failed` and exits 1 on
any failure. CI runs them in `.github/workflows/webui-api-tests.yml`.

## How it is laid out

The tests were written against one directory per component. In the repository the API code is a
single merged tree, so the harness rebuilds the per-component view for each test process:

- `<component>/tests/` holds the tests of that component.
- `manifest.tsv` assigns every changed or new file below `src/webui/www/{api,tcl}` (and
  `src/webui/rega/bin/hm_deldev`) to a component (`component <TAB> path in component <TAB> repo path`).
  `mocks.tcl` copies those files into a temp tree (`::mock::generated`) and removes it at exit.
  `schema-harness/tests/manifest.test` fails when a changed file is missing from the manifest, so
  **add a row when you add a file**.
- `LEGACY_REV` pins the revision whose `src/webui/www/{api,tcl}` is the frozen v1 reference for the
  golden and byte-compare tests. It is read with `git archive` (needs the full git history, e.g.
  `fetch-depth: 0` in CI) or taken from the directory in `WEBUI_API_LEGACY_TREE`, which must hold
  `src/webui/www/api` and `src/webui/www/tcl`.

## Environment

| Variable | Meaning |
|---|---|
| `WEBUI_API_LEGACY_TREE` | use this directory instead of `git archive` of `LEGACY_REV` |
| `OPENCCU_PATCH_DIR` | directory with the OpenCCU rootfs patches for the patch-apply gate (default `~/dev/OpenCCU/buildroot-external/package/openccu-base/rootfs-patches`; the gate is skipped when it does not exist) |
| `TMPDIR` | where temp trees and the cached legacy snapshot go |

## The byte rules

Most legacy API files are ISO-8859-1 and many use CRLF. The OpenCCU packaging repository applies
its patches to these files with `patch -p1`, so:

- a file whose v1 behaviour is unchanged stays byte-identical to the legacy source,
- a file with an intentional change is a minimal edit that keeps its encoding and line endings,
- `schema-harness/tests/integration/verbatim-legacy.test` and `patch-compat.test` enforce this.

Edit such files with a byte-preserving tool; editors that normalise the encoding break the patches.
Known conflicts (patches 0001 and 0164 must be regenerated at the next Base bump) are listed in
[PATCH-CONFLICTS.md](PATCH-CONFLICTS.md); the patch gate compares its result with that list.
