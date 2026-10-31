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
- `--v2`: `/api/v2/*` is not routed to `homematic.cgi` by lighttpd yet, so it reports 404 (INFO).

## Not covered

No UI exists for v2; program/room editing and datapoint-change push events are not implemented
(they need a live CCU); lighttpd is not changed.
