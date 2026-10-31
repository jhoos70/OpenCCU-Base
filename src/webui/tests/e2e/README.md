# Classic WebUI end-to-end smoke test

Playwright test that logs in to a classic WebUI, walks 23 menu pages and records for each the
visible text, failed HTTP requests, JSON-RPC errors and console errors. It is the safety net for
changes that must not alter the classic UI (API hardening, build and tooling work); the new UI
gets its own tests. It only reads, handles first-run dialogs and always logs out (the CCU limits
concurrent sessions, and a leaked session shows "Zuviele gleichzeitige Verbindungen").

```sh
CCU_PASS=Admin ./run.sh http://127.0.0.1:18081 stock.json      # reference (stock image)
CCU_PASS=Admin ./run.sh http://127.0.0.1:18080 patched.json    # candidate
python3 compare_reports.py stock.json patched.json             # exit 1 on any difference
```

`run.sh` builds a local `ccu-e2e:local` image (Playwright 1.63.0 browsers plus the pinned Python
package, see `Dockerfile`) and runs the test with host networking. Nothing is installed on the host.

## What it compares

Per page: reachable, normalised text (session ids, dates, times and load averages masked), failed
requests, JSON-RPC errors, console errors. The "help" page is system state (uptime, IP, memory), so
only its status is compared. Known browser noise (synchronous XHR warning, `file:///`) is ignored.
A CCU without `rfd` reports `unknown interface (BidCos-RF)` on the device pages; it does so on
the reference too, so it is not a difference.

Both instances must be in the same state (admin password set, first-run dialogs done); the test
does not set a password.

## Byte-equivalence of the build

`staged-manifest.sh` prints a hash manifest of the staged web root. Build before and after a change
and `diff` the two; a change that must not alter the shipped files (build tooling, repository
clean-up) must produce an empty diff. This is how the removal of the committed `www/` copy was
checked.

## Checks this test makes visible (examples)

- `strict_mode true` in `www/api/apiconfig.conf` breaks all 23 pages: the classic UI does not send
  `X-Requested-With`, so its first API call is refused (405). Keep `strict_mode false` while the
  classic UI is used, or make the shell send the header.
