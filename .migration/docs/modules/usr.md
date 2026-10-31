# Module: usr

## Overview

| Item | Value |
|------|-------|
| Directory | `usr/` |
| Language | Tcl (target interpreter: Tcl 8.2, per path `usr/lib/tcl8.2`) |
| Files | 2 (`.tcl`), 121 lines total |
| Role | Pre-generated rootfs overlay holding the `HomeMatic` Tcl package used by CGI scripts on the CCU |
| Tier | large (partition is tiny: single package) |

Note: the stack-analysis reference template was not available; this document uses the standard module layout.

## Structure

```
usr/lib/tcl8.2/homematic/
  homematic.tcl   (119 lines)  package implementation
  pkgIndex.tcl    (2 lines)    Tcl package index
```

Both files are tracked in git (`git ls-files usr`).

## Package definition

- `usr/lib/tcl8.2/homematic/pkgIndex.tcl:2` - `package ifneeded HomeMatic 1.0 [list source [file join $dir homematic.tcl]]`
- `usr/lib/tcl8.2/homematic/homematic.tcl:118` - `package provide HomeMatic 1.0`

## Namespaces and procedures (`homematic.tcl`)

| Namespace / proc | Line | Behaviour |
|---|---|---|
| `::HomeMatic` (exports `Addon Script Session Util GetSerialNumber`) | 2-13 | Loads native extensions `tclrega.so` (if var `rega_script` is unset, line 6) and `tclrpc.so` (if var `xmlrpc` is unset, line 10) |
| `::HomeMatic::GetSerialNumber` | 15-23 | Reads `/etc/config/ids`, regexp `SerialNumber=(.*)`; returns the serial or `INVALID` |
| `::HomeMatic::Util::LoadFile filename` | 28-38 | Reads whole file; errors swallowed via `catch`; returns `{}` on failure |
| `::HomeMatic::Util::SaveFile filename content` | 40-50 | Overwrites file with `puts -nonewline`; errors swallowed; always returns `0` |
| `::HomeMatic::Session::LOGIN_URL` / `RENEW_URL` | 59-60 | Constants the local login.htm page on 127.0.0.1, the local pages/index.htm page on 127.0.0.1 |
| `::HomeMatic::Session::login/logout/renew` | 62-72 | Stubs: `error "not implemented"` |
| `::HomeMatic::Session::isValid` | 74-75 | Empty stub (returns empty string) |
| `::HomeMatic::Script::eval` | 82-84 | Stub: `error "not implemented"` |
| `::HomeMatic::Addon::AddConfigPage id url name description` | 93-106 | Loads `/etc/config/hm_addons.cfg` as Tcl array list, sets `addons($id)` to array of `ID`, `CONFIG_URL`, `CONFIG_NAME`, `CONFIG_DESCRIPTION`, writes back |
| `::HomeMatic::Addon::GetAll` | 108-113 | Returns raw content of `/etc/config/hm_addons.cfg` |

`::HomeMatic::Addon` is exported with `GetAll AddConfigPage` only (line 88); `Session` exports `login logout renew` but `LOGIN_URL RENEW_URL` are exported names that are variables (line 56).

## Data / persistence

- `/etc/config/ids` (read-only; key `SerialNumber=`) - `homematic.tcl:16`
- `/etc/config/hm_addons.cfg` - add-on registry; Tcl `array get` serialization, one entry per add-on id, each value itself an `array get` list - `homematic.tcl:90,103-105`
- No locking on read-modify-write of `hm_addons.cfg` (`homematic.tcl:103-105`).

## Native dependencies

- `tclrega.so` (ReGa script bridge) - `homematic.tcl:6`
- `tclrpc.so` (XML-RPC client) - `homematic.tcl:10`
These are not in `usr/`; they are loaded from the interpreter's library path at runtime.

## Build provenance (this directory is generated output)

`usr/lib/tcl8.2/homematic/` is the installed form of `src/tcl_homematic/`:
- `src/tcl_homematic/CMakeLists.txt:1-9` - target `tcl-homematic-assets`: concatenates `src/*.tcl` listed in `src/tcl_homematic/files.txt` via `create_homematic_tcl.tcl`, strips comments with `stripcomments.tcl` into `homematic_nocomments.tcl`, copies it to `${ROOTFS_DIR}/usr/lib/tcl8.2/homematic/homematic.tcl`, and copies `pkgIndex.tcl`.
- Source parts (`files.txt`): `tclload.tcl serial.tcl util.tcl session.tcl script.tcl addon.tcl trailer.tcl`.

Drift observed between committed `usr/` copy and `src/tcl_homematic/src`:
- `src/tcl_homematic/src/addon.tcl:4,24-34` exports and defines `::HomeMatic::Addon::RemoveConfigPage`; the committed the generated `homematic.tcl` has no such proc (export list at line 88 is `GetAll AddConfigPage`).
- `src/tcl_homematic/src/tclload.tcl:4` guards loading with `[llength [info commands ::rega_script]]`, whereas `usr/.../homematic.tcl:5` uses `![info exists rega_script]`.
So the `usr/` file is an older snapshot; the build regenerates it into `ROOTFS_DIR` and does not use this committed copy.

## Consumers

- `src/webui/www/config/control_panel.cgi:3` - `package require HomeMatic`; `:231` calls `::HomeMatic::Addon::GetAll`, iterates add-ons, renders buttons using `CONFIG_URL`, `CONFIG_NAME`, `CONFIG_DESCRIPTION` (a nested array of language -> text; used in inline JS, lines 235-260). Special case: add-on id `mediola` is hidden if `/etc/config/neoDisabled` exists (line 233).
- `www/config/control_panel.cgi` (a second copy) also requires the package.

## Observations / risks (evidence only)

- Add-on description values are emitted into inline JavaScript with single quotes unescaped (`control_panel.cgi:~245`), so add-on-supplied text could break out of the string.
- `SaveFile` always returns 0 regardless of failure (`homematic.tcl:41,49`).
- Session and Script APIs are unimplemented stubs; no callers found in the repo beyond `GetAll`.
- Tcl 8.2 constraint: code uses only 8.2-era constructs (`array set`, `regexp -line`, `namespace export`).

## Migration notes

- Functional surface that matters: `GetSerialNumber`, `Util::LoadFile/SaveFile`, `Addon::GetAll/AddConfigPage` (and `RemoveConfigPage` in source), plus the `hm_addons.cfg` file format.
- Edit `src/tcl_homematic/src/*`, not `usr/`, when changing behaviour.
