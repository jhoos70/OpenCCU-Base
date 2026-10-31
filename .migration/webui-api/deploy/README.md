# Trying the webui-api changes on a test CCU

**Test systems only.** The code has been tested against mocks (1,247 tests), never on a real
ReGaHss, `rfd`, `hs485d` or lighttpd. Do not install this on a CCU you rely on.

What you get: `out/webui-api-bundle.tar.gz` (the 99 files that differ from upstream `5b8179c4`) and
`smoke.py` (a read-only test you run from your computer). Rebuild the bundle after changes with
`.migration/webui-api/deploy/make-bundle.sh` from the repository root.

## Why not just copy the files

On an OpenCCU image the API files are patched by OpenCCU (13 rootfs patches touch `www/api` and
`www/tcl`, six of them `methods.conf`). Overwriting a patched file with the upstream-based version
silently drops OpenCCU's changes. `install.sh` compares every file with its upstream checksum:

| Device file | What the installer does |
|---|---|
| equals upstream | replaces it |
| equals the new version | leaves it |
| differs (patched on the device) | skips it and says so; with `--patch` applies only our difference as a patch, if it applies cleanly |
| new file | adds it |

Expect, on an OpenCCU image: 74 replaced, 19 added, 2 patched (`methods.conf`, `getpositiondata.tcl`)
and 4 skipped (`downloadFirmware.tcl`, `{restart,start,stop}hmipserver.tcl`; the known conflicts
with OpenCCU patches 0001 and 0164, see `src/webui/tests/api/PATCH-CONFLICTS.md`).

## Steps

```sh
# 1. copy and look (changes nothing)
scp out/webui-api-bundle.tar.gz root@CCU:/tmp/
ssh root@CCU 'cd /tmp && tar xzf webui-api-bundle.tar.gz && cd webui-api-bundle && ./install.sh check --patch'

# 2. install (backs up every touched file first; refuses if /www is read-only)
ssh root@CCU 'cd /tmp/webui-api-bundle && ./install.sh install --patch'

# 3. smoke test from your computer (logs in, reads, probes; changes nothing)
CCU_PASS='...' python3 -I smoke.py --host http://CCU --user Admin

# 4. click through the classic UI: login, device list, programs, system variables, rooms,
#    the settings pages, the security hint / install wizard dialogs

# 5. undo (the exact command is printed by the installer)
ssh root@CCU '/tmp/webui-api-bundle/install.sh restore /usr/local/webui-api-backup-YYYYMMDD-HHMMSS.tar'
```

If `/www` is read-only the installer stops before changing anything. Use a container or VM, or make
the file system writable yourself; the installer never remounts anything.

## What the smoke test tells you

`PASS` is the hardened behaviour, `FAIL` the legacy behaviour (or a break), `INFO` a fact. Run it
before and after the install: before, the probes should FAIL (arbitrary file read through
`textfile.cgi`, `CCU.existsFile` answering for `/etc/passwd`, Tcl stack traces in errors); after,
they should PASS. The `INFO session key format` line answers EG-8: whether the session id is the
10-character inner id or the `@`-wrapped 12-character form. Send me that line.

Optional checks:

- `--strict`: first set `strict_mode true` in `/www/api/apiconfig.conf` on the CCU (Tcl syntax,
  inside the `array set API_CONFIG {...}` block). Requests without `X-Requested-With` must then be refused.
- `--v2`: checks both `/api/v2/*` and `/api/homematic.cgi/v2/*`. The first needs a lighttpd route that does not exist yet (INFO). The second reaches the CGI through PATH_INFO and needs only `v2_enabled true` in `apiconfig.conf` (PASS when the v2 router answers, INFO when the v1 dispatcher does).

## Not covered

No UI exists for v2; program/room editing and datapoint-change push events are not implemented
(they need a live CCU); lighttpd is not changed.

## Trying it on the data of a real CCU, without touching it: `isolated-ccu.sh`

A restored backup of your real CCU in a Docker container that cannot reach the internet, your LAN or the real CCU. It
shows the real devices, rooms, programs, system variables and history in the new UI; it has no radio, so nothing is
switched. `isolated-ccu.sh up | check | install | restore FILE.sbk | down` (the header of the script explains the isolation).

- Create the backup on the real CCU (Settings, Control panel, Security: create a backup; the exact tab name varies by
  version) and keep the `.sbk` **outside the repository**. It contains passwords and keys.
- `restore` validates the file (`restoreBackup.sh -c`), applies it, restarts the container and checks the isolation again.
- The instance is at `http://127.0.0.1:18090` on this host only (use an SSH tunnel from another machine). Log in with the
  user names and passwords of the **real** CCU.
- Never attach a radio module to it while the real CCU runs: both would claim the same devices.
- `down` removes the containers, the network and the volume with the restored data.
- Do not run the write tests of `src/webui/tests/e2e` against restored data (they create temporary objects and
  `next_log.py` clears the log); a read-only comparison with the classic UI is the test for real data.
