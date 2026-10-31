# Module: etc (config_templates)

## Overview

- Path: `etc/` (3 files, 27 LOC per fingerprint; ~90 lines incl. blank lines)
- Language: configuration (properties-style `.conf`, empty `.cfg`, Log4j2 `.xml`)
- Role: default configuration templates shipped into the CCU rootfs under `/etc/config_templates/`. Nothing executable; no code.
- Only subdirectory: `etc/config_templates/`.
- Last git history touching `etc`: `e1fce779` ([SPHM-1542] hmip validation on backup-restore), `45377689` (CMake build), `c0f63b93` (v3.83.3).

## File inventory

| File | Size | Format | Purpose |
|---|---|---|---|
| `etc/config_templates/crRFD.conf` | 2059 B, 63 lines | Java-style `key=value` properties | Config template for the HmIP radio/gateway service (HmIP server, `crRFD`), USB HM/IP TRX adapter |
| `etc/config_templates/log4j2.xml` | 892 B, 28 lines | Log4j2 XML | Logging config for the Java HmIP server (`hmserver`) |
| `etc/config_templates/crypttool.cfg` | 0 B (empty) | whitespace-separated `<index> <key>` lines (per consumer) | Empty placeholder key file; actually staged from `src/crypttool/config.txt` (also 0 B) |

## crRFD.conf (`etc/config_templates/crRFD.conf`)

Sections (comment-delimited):
- Adapter (`:1-3`): `Adapter.1.Type=HMIP_CCU2`, `Adapter.1.Port=/dev/mmd_hmip` (device node provided by multimacd/mmd driver).
- Directories (`:5-11`): `Config.Dir=/etc/config/crRFD`, `Config.Include=hmip_user.conf` (user-override file, not in repo), `Persistence.Home=/etc/config/crRFD/data`, `FirmwareUpdate.BG.OTAU.Home=/etc/config/firmware`, fwfix `/opt/HmIP/crrfd.fwfix`.
- Legacy API (`:13-32`): `API.1.Type=XML-RPC`, `Legacy.Port=32010`, `Legacy.Encoding=ISO-8859-1`, `Legacy.ResponseTimeout=20`, `Legacy.ReplacementURL=127.0.0.1`, parameter definition `/opt/HmIP/legacy-parameter-definition.config`, `Legacy.AddressPrefix=3014F711A0`, handlers file `/var/LegacyService.handlers`, UDP service messages, duty-cycle event discard, virtual remote control + migration gate file `/var/tmp/vrcMigrationGate`, client connection/socket timeouts 600000 ms, `Legacy.Valve.Auto.Adaption=true`. `Legacy.RemoveUnreachableClients` is commented out (`:19`).
- HmIP routing (`:35-42`): `Adapter.Remote.Enabled=false`, `Adapter.Local.Device.Enabled=true`, `Adapter.Local.Listener.Mode=RADIO`, `Lan.Routing.Enabled=true`, AccessPoint update server URLs with literal `SGTIN` placeholder (`:40-41`, ports 9293/9294) and HawkBit token `local-update` (`:42`).
- Misc (`:45-49`): cyclic timeout (`TimerStartMaxDelay=90`, `TimerCycleTime=600`), enum-to-ordinal replacement, state restore enabled with 15000 ms delay.
- Key server (`:52-57`): `KeyServer.Mode=KEYSERVER_LOCAL`, gateway `secgtw.homematic.com:8443` with SSL, request timeout 15000 ms.
- Other: `Vertx.WorkerPoolSize=5` (`:59`), transaction manager TTL check / discard-if-unreachable (`:61-63`).

Observations:
- Contains hardcoded runtime paths (`/etc/config`, `/opt/HmIP`, `/var`, `/dev/mmd_hmip`) and an external hostname (`secgtw.homematic.com`) - relevant for portability/migration.
- `SGTIN` in the AccessPoint URLs is a placeholder; no substitution mechanism is present in this repo (no references to `crRFD.conf` outside `etc/` and CMake).

## log4j2.xml (`etc/config_templates/log4j2.xml`)

- `Configuration status="info"` (`:2`).
- Appenders (`:3-16`): `RollingFile` "File" -> `/var/log/hmserver.log`, rollover pattern `hmserver.log.%i`, `SizeBasedTriggeringPolicy size="2MB"`, `DefaultRolloverStrategy max="1"`; `Syslog` "SYSLOG" -> UDP 127.0.0.1:514, facility LOCAL0, appName `HmIPServer`, RFC5424.
- Loggers (`:17-24`): `de.eq3` info, `org` error, `com` error, Root info bound to appender `File` only. The SYSLOG appender is defined but not referenced by any logger (`:21-23`).
- Log file is consumed by the web UI maintenance page: `www/config/cp_maintenance.cgi:1381` lists `hmserver.log.1 hmserver.log`.

## crypttool.cfg (`etc/config_templates/crypttool.cfg`)

- Empty file (0 bytes) in `etc/`; the build installs a different source instead: `src/crypttool/config.txt` (also 0 B) renamed to `crypttool.cfg` (`cmake/Components.cmake:179-180`, `src/crypttool/CMakeLists.txt:12-29`). The `etc/` copy is not referenced by the build.
- Runtime path is `/etc/config/crypttool.cfg` (`src/crypttool/crypttoolconfig.cpp:21`, `src/crypttool/crypttool.cpp:274`).
- Format as parsed: lines of `<int index> <key>`; `getCurrentKey` returns the last line's key (`src/crypttool/crypttoolconfig.cpp:30-56`).
- Other readers: `src/eq3configd/src/networkconfig.cpp:17`, `src/libeq3config/netconfigcmd/src/networkconfig.cpp:17` (`keyFileName`), `src/webui/www/config/cp_security.cgi:710,760` (backup/restore copy and read) and mirror `www/config/cp_security.cgi`.

## Build / packaging integration

- `cmake/Components.cmake:182-185`: `if(BUILD_HMSERVER)` installs `etc/config_templates/crRFD.conf` and `log4j2.xml` to `etc/config_templates` in component `assets`.
- `cmake/Components.cmake:178-181`: `if(BUILD_CRYPTTOOL)` installs `src/crypttool/config.txt` as `crypttool.cfg`.
- `src/crypttool/CMakeLists.txt:14-29`: post-build copy into `${ROOTFS_DIR}/etc/config_templates` and, if `DEPLOY_TO_REPO`, into `${DEPLOY_ROOT}/etc/config_templates`.
- The templates are copied to `/etc/config_templates/`; the mechanism that copies them to `/etc/config/` at first boot lives outside this repo (no references found in `bin/` scripts or `src/`).

## Dependencies and coupling

- Upstream consumers: HmIP Java server (`crRFD` / `hmserver`, binaries under `/opt/HmIP`, not in this module), `crypttool`, `eq3configd`, `libeq3config`, web UI security/maintenance CGIs.
- Runtime data/paths: `/etc/config/crRFD/`, `/etc/config/firmware`, `/var/log/hmserver.log`, `/dev/mmd_hmip`.
- External: `secgtw.homematic.com:8443` (key server), local firmware/HawkBit servers on `SGTIN` host.

## Migration notes (facts only)

- Properties and Log4j2 XML are portable as-is; absolute paths and the `SGTIN` placeholder need mapping in any target environment.
- Only one source of truth for `crypttool.cfg` is used (`src/crypttool/config.txt`); `etc/config_templates/crypttool.cfg` is an unreferenced empty duplicate.
- No secrets besides the non-sensitive HawkBit token string `local-update` (`crRFD.conf:42`).
