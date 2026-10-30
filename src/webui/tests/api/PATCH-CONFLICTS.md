# OpenCCU rootfs patches vs. the API files

The OpenCCU packaging repository (`buildroot-external/package/openccu-base/rootfs-patches`) applies
patches with `patch -p1` to the Base rootfs. Thirteen of them change files below `www/api` or
`www/tcl`: 0001, 0031, 0038, 0044, 0054, 0057, 0104, 0109, 0131, 0163, 0164, 0203, 0205.
`schema-harness/tests/integration/patch-compat.test` applies exactly their `www/api` and `www/tcl`
sections to a copy of this tree and compares the result with the list below.

Result for this tree: eleven apply; two conflict. Behaviour is kept, the patches have to be
regenerated (OpenCCU's `update_patchfiles.sh`) when Base is bumped to a revision that contains the
API changes.

- patch 0001 must be regenerated at the next Base bump: `methods/ccu/downloadFirmware.tcl` is
  rewritten by the CCU.downloadFirmware hardening (no shell pipeline, token check, `timeout` around
  wget); patch 0001 replaces the very same lines (URL construction and wget call) with the OpenCCU
  download logic.
- patch 0164 must be regenerated at the next Base bump: `methods/user/{restart,start,stop}hmipserver.tcl`
  get the correlation-id audit call; the patch hunks cover the whole file and are anchored at its
  start and end, so no line can be added between the replaced lines and the context.

The patches 0038, 0044, 0057, 0109, 0131 and 0205 change `methods.conf`. They still apply because
`methods.conf` differs from the previous version in only seven entries (CCU.createFile,
Session.logout, Interface.setTeam, ReGa.getAllDatapoints, Channel.setName, Channel.setMode and
Session.setSessionVar) and keeps its ISO-8859-1 encoding and line endings. Keep it that way: edit
single entries with a byte-preserving tool.

Files the patches touch, and their status:

| File | Status |
|---|---|
| `api/methods.conf` | minimal edit (7 entries); patches 0038, 0044, 0057, 0109, 0131, 0205 apply |
| `api/methods/ccu/downloadFirmware.tcl` | conflict (0001) |
| `api/methods/ccu/removeFieldTestActive.tcl` | unchanged |
| `api/methods/device/{get,listalldetail,listprogramids}.tcl` | unchanged |
| `api/methods/interface/rssiinfo.tcl` | unchanged |
| `api/methods/room/getall.tcl`, `api/methods/subsection/getall.tcl` | unchanged |
| `api/methods/system/getpositiondata.tcl` | minimal edit (v2 branch inserted before `proc read_var`); patch 0054 applies |
| `api/methods/user/{restart,start,stop}hmipserver.tcl` | conflict (0164) |
| `tcl/extern/cgi.tcl` | unchanged |

Files added by the patches (for example `ccu/getaddonversions.tcl`, `ccu/getsystemlanguage.tcl`,
`interface/getdutycycle.tcl`) are not part of this tree and do not collide.
