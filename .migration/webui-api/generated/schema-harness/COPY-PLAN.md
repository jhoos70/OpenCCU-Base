# Copy plan: staged webui-api files -> repository paths

Documentation only. Nothing is copied by the SDD implement phase. Baseline: HEAD 1651075b (BD-15);
179 methods in `methods.conf`. All staged paths are relative to `.migration/webui-api/generated/<component>/`.
Every file is staged next to the same relative path it has below `src/webui/www/api/` unless the table says otherwise.

| Staged | Target repo path | Notes |
|---|---|---|
| `dispatcher/homematic.cgi` | `src/webui/www/api/homematic.cgi` | minimal edit of the v1 file; ISO-8859-1 and the legacy line endings kept (NFR-056) |
| `dispatcher/methods.conf` | `src/webui/www/api/methods.conf` | byte-identical to the legacy file except 7 entries (ISO-8859-1 and LF kept, NFR-056): CCU.createFile LEVEL ADMIN, Session.logout LEVEL GUEST, ARGUMENTS of Interface.setTeam, ReGa.getAllDatapoints, Channel.setName, Channel.setMode and Session.setSessionVar (SP002); `RecoveryMode.enter` is already in the legacy file at 1651075b |
| `dispatcher/apiconfig.conf` | `src/webui/www/api/apiconfig.conf` | all flags default false (v1 behaviour) |
| `dispatcher/eq3/{apiconfig,common,executor,json,jsonrpc,registry,sidlimit,syslog,validate}.tcl` | `src/webui/www/api/eq3/` | replaces common.tcl, json.tcl, jsonrpc.tcl; the others are new |
| `dispatcher/methods/system/{describe,listmethods,methodhelp}.tcl` | `src/webui/www/api/methods/system/` | |
| `dispatcher/v2/{auth,router,rpc,schema}.tcl` | `src/webui/www/api/v2/` | new; lighttpd must route `/api/v2/*` to `homematic.cgi` (flag `v2_enabled` documents this) |
| `security-session/eq3/{allowlist,hmscript,privilege,ratelimit}.tcl`, `eq3/{checksid,getupl}.hms` | `src/webui/www/api/eq3/` | `hmscript.tcl` replaces the v1 file |
| `security-session/eq3/{session,rega}.tcl` | `src/webui/www/tcl/eq3/{session,rega}.tcl` | note the `www/tcl` prefix; the dispatcher loads them on demand from `$DOCUMENT_ROOT/tcl/eq3/` |
| `security-session/eq3_old/{session,common,once,user}.tcl` | `src/webui/www/tcl/eq3_old/` | classic UI libraries (only `session_generatesid` changed; `get_platform` of HEAD 1651075b kept); `common`, `once`, `user` are byte-identical copies; `session.tcl` is a minimal edit of the ISO-8859-1 original (umlauts kept) |
| `security-session/methods/session/*` | `src/webui/www/api/methods/session/` | |
| `event-push/eq3/event.tcl` | `src/webui/www/api/eq3/event.tcl` | |
| `event-push/methods/event/*` | `src/webui/www/api/methods/event/` | |
| `event-push/v2/events.tcl` | `src/webui/www/api/v2/events.tcl` | |
| `event-push/rega/bin/hm_deldev` | `src/webui/rega/bin/hm_deldev` | path added to T107 during implementation |
| `interface-gateway/eq3/ipc.tcl` | `src/webui/www/api/eq3/ipc.tcl` | |
| `interface-gateway/methods/interface/*` | `src/webui/www/api/methods/interface/` | |
| `rega-model/methods/{device,channel,sysvar,program,room,subsection,rega}/*` | `src/webui/www/api/methods/<same>/` | Room/Subsection.listProgramIds now de-duplicate (SP043) |
| `rega-model/v2/model.tcl` | `src/webui/www/api/v2/model.tcl` | `programs.tcl` / `rooms.tcl` do not exist (EG-6 gate) |
| `system-admin/methods/{ccu,bidcos,bidcosrf,bidcoswired,firewall,user,safemode,recoverymode}/*` | `src/webui/www/api/methods/<same>/` | includes `recoverymode/enter.tcl` (BD-15) |
| `backup-cgis/backup/*` | `src/webui/www/api/backup/` | `version.cgi` reads `/VERSION` (BD-15); EG-1 removal branch is not delivered (gated) |
| `user-profile/methods/{user,system,webui}/*` | `src/webui/www/api/methods/<same>/` | no `getregaversion.tcl` / `setregaversion.tcl` (removed upstream) |
| `user-profile/v2/profile.tcl` | `src/webui/www/api/v2/profile.tcl` | |
| `schema-harness/schema/methods.json` | `src/webui/www/api/schema/methods.json` | 179 entries, one per line (validate.tcl reads the patterns line by line) |
| `schema-harness/tests/**` and every `<component>/tests/**` | `src/webui/tests/api/<component>/` | tcltest files, runners `tests/all.tcl` |
| `schema-harness/.github/workflows/ci.yml` | `.github/workflows/ci.yml` | merge, do not overwrite |
| `optional-gateway/**` | `src/webui/gateway/` | only if the PHASE6 gate approves (nothing delivered) |

Never edit the stale root `www/api` copy (removed, or byte-equal through the drift check `schema-harness/tests/helpers/drift.tcl`).

Install notes
- `/var/tmp/api_registry.cache`, `/var/tmp/api_validate.cache` and `/var/tmp/api_ipc.cache` are rebuilt from `methods.conf`, `schema/methods.json` and `InterfacesList.xml` when these are newer.
- The rate limiter keeps its counters in `/tmp/webui-ratelimit/` (only when `rate_limit` is true, `strict_mode` is true or on `/api/v2`).
- The `www/tcl/eq3_old/*` files are loaded by the classic UI pages through the existing symlinks of `src/webui/CMakeLists.txt`.

## Patch compatibility (OpenCCU rootfs patches)

The OpenCCU packaging patches (buildroot-external/package/openccu-base/rootfs-patches) stay downstream and are applied with `patch -p1` to the Base rootfs (NFR-056, BD-18). The gate `tests/integration/patch-compat.test` (helper `tests/helpers/patchapply.tcl`) applies the www/api and www/tcl sections of the 13 patches 0001, 0031, 0038, 0044, 0054, 0057, 0104, 0109, 0131, 0163, 0164, 0203, 0205 in filename order to a temporary copy; `OPENCCU_PATCH_DIR` selects the directory (default `~/dev/OpenCCU/buildroot-external/package/openccu-base/rootfs-patches`, the gate is skipped when it is absent). `tests/integration/verbatim-legacy.test` proves the byte rules: 129 staged files are byte-identical to the legacy source, the 79 files with an intentional behaviour change are minimal edits that keep the legacy encoding (ISO-8859-1) and line endings, and the shared helper `admin_audit` lives once in `security-session/eq3/admin_audit.tcl`.

Result against the patch directory (legacy tree: 13 OK; staged tree):

| Patch | Result |
|---|---|
| 0001 | FAIL (documented below) |
| 0031, 0038, 0044, 0054, 0057, 0104, 0109, 0131, 0163, 0203, 0205 | OK |
| 0164 | FAIL (documented below) |

Conflicts that cannot be avoided (behaviour is kept, the patch has to be regenerated):
- patch 0001 must be regenerated at the next Base bump: `methods/ccu/downloadFirmware.tcl` is rewritten by CCU.downloadFirmware hardening (SP037: no shell pipeline, token check, `timeout` around wget); patch 0001 replaces the very same lines (URL construction and wget call) with the OpenCCU download logic.
- patch 0164 must be regenerated at the next Base bump: `methods/user/{restart,start,stop}hmipserver.tcl` get the correlation-id audit call (SP034); the patch hunks cover the whole file and are anchored at the start and the end of it, so no line can be added between the replaced lines and the context.

The 14 patch-touched files and their verdict:

| File | Verdict |
|---|---|
| `api/methods.conf` | minimal edit (7 entries); patches 0038, 0044, 0057, 0109, 0131, 0205 apply |
| `api/methods/ccu/downloadFirmware.tcl` | conflict (0001) |
| `api/methods/ccu/removeFieldTestActive.tcl` | verbatim |
| `api/methods/device/{get,listalldetail,listprogramids}.tcl` | verbatim |
| `api/methods/interface/rssiinfo.tcl` | verbatim |
| `api/methods/room/getall.tcl`, `api/methods/subsection/getall.tcl` | verbatim |
| `api/methods/system/getpositiondata.tcl` | minimal edit (the v2 branch is inserted before `proc read_var`, the v1 code stays untouched); patch 0054 applies |
| `api/methods/user/{restart,start,stop}hmipserver.tcl` | conflict (0164) |
| `tcl/extern/cgi.tcl` | not staged (legacy file, unchanged) |

Files added by the patches (for example `ccu/getaddonversions.tcl`, `ccu/getsystemlanguage.tcl`, `interface/getdutycycle.tcl`) are not part of the staged tree and do not collide.
