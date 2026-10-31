# Module: opt (HMServer / HmIP runtime assets)

## Overview

- Path: `opt/` (25 files; 2 subdirectories: `opt/HMServer/`, `opt/HmIP/`)
- Language: mixed. Mostly prebuilt Java binaries (4 `.jar`, ~68 MB total), plus Freemarker templates (17 `.ftl`, 6586 lines), XML/JSON-like config, and Java-properties config.
- Role: runtime payload of the Java-based CCU backend. It holds the HomeMatic (BidCoS) server (`HMServer.jar`), the HomeMatic IP server (`HMIPServer.jar`), the ESH/third-party coupling bridge, the HmIP coprocessor firmware updater, and the server-side rendered web UI fragments and definitions these servers consume. There is no build step for any of it in this repo: everything is copied as-is into the rootfs.
- No Java/other source is present. The only analyzable human-readable artefacts are the `.ftl`, `.xml`, `.dit`, `.config` and `.fwfix` files. Jar internals below come from `unzip -l`/manifest inspection only (no decompilation).
- Git history: `opt` was last touched by `8be251da` ("Update HMIPServer.jar") and `790e48ab` ("webui: fix group editing while group devices are in the inbox (#101)").

## File inventory

| File | Size | Kind |
|---|---|---|
| `opt/HMServer/HMServer.jar` | 18.2 MB | Fat jar, BidCoS/HomeMatic server, 12258 entries |
| `opt/HMServer/HMIPServer.jar` | 39.9 MB | Fat jar, HmIP server, 26371 entries |
| `opt/HMServer/coupling/ESHBridge.jar` | 8.3 MB | Fat jar, ESH/Lightify/Hue coupling, 5713 entries |
| `opt/HmIP/hmip-copro-update.jar` | 1.5 MB | Fat jar, coprocessor updater, 686 entries |
| `opt/HMServer/groups/groupdefinitions.xml` | 359 KB, 8116 lines | XML group (virtual device) definition |
| `opt/HMServer/measurement/templates.dit` | 9 KB, 565 lines | JSON-ish diagram templates (jqPlot options) |
| `opt/HMServer/pages/*.ftl` (17 files) | 6586 lines total | Freemarker HTML/JS page fragments |
| `opt/HmIP/legacy-parameter-definition.config` | 71 KB, 1092 lines | Java-properties style parameter mapping |
| `opt/HmIP/crrfd.fwfix` | 915 B | JSON, divergent device-type definition |

## Build and packaging integration

- `cmake/Components.cmake:146` `openccu_asset_directory(HMSERVER opt/HMServer opt/HMServer)` and `:147` `openccu_asset_directory(HMIP_TOOLS opt/HmIP opt/HmIP)`.
- The function (`cmake/Components.cmake:136-145`) creates a custom target `<COMPONENT>-assets` that does `cmake -E copy_directory ${CMAKE_SOURCE_DIR}/opt/<dir> ${ROOTFS_DIR}/opt/<dir>`, adds it as a dependency of `core`, and installs `${ROOTFS_DIR}/opt/<dir>/` to `opt/<dir>` in install component `assets`. Both are gated by `BUILD_HMSERVER` / `BUILD_HMIP_TOOLS`.
- Tests: `tests/test-components.py:87-89` builds with `-DBUILD_HMSERVER=ON` and asserts `opt/HMServer/HMServer.jar` is in the `assets` install set.
- CI: `.github/workflows/ci.yml:188` requires `opt/HMServer/HMServer.jar` to be non-empty in the staged rootfs (`test -s`).
- Only `HMServer.jar` is verified by CI/tests; the other three jars and the config files have no repo-level verification.
- Jars are committed binaries (no `.gitattributes`/LFS found). Updated by binary replacement commits (e.g. `8be251da`).

## Jars

Manifest data (`META-INF/MANIFEST.MF`):

| Jar | Main-Class | Build info |
|---|---|---|
| `HMServer.jar` | `de.eq3.ccu.server.HMServer` | Maven, JDK 1.8.0_252, built by "niclaus" |
| `HMIPServer.jar` | `de.eq3.ccu.server.ip.HMIPServer` | Maven, JDK 21 (Temurin 21.0.12), Jenkins job `HM-CCU2-HmIP-Server` #5936, `Build-Version: 1.5.1-SNAPSHOT`, timestamp 2026-10-08 |
| `ESHBridge.jar` | none in manifest (bare `Manifest-Version`) | n/a |
| `hmip-copro-update.jar` | `de.eq3.cbcs.tools.copro.update.hmip.HmipCoproUpdater` | v1.0.10, JDK 1.8 target |

Internal composition (class counts per package, from the jar listings):

- `HMServer.jar`: `de.eq3.cbcs.server` (354), `de.eq3.cbcs.devicedescription` (145), `de.eq3.cbcs.lib` (119), `de.eq3.cbcs.protocol` (112), `de.eq3.cbcs.legacy` (97), `de.eq3.cbcs.vertx` (72), `de.eq3.ccu.virtualdevice` (65), `de.eq3.ccu.bidcos` (14), `de.eq3.ccu.groupdevice` (25), `de.eq3.lib.groupadministration` (20), `de.eq3.lib.measurement` (17), `de.eq3.lib.webui` (3), `de.eq3.ccu.http` (7), `de.eq3.ccu.measurement` (8), `de.eq3.ccu.system` (9). Maven artefacts embedded include `server-base`, `http-service`, `measurement-http-service`, `groupadministration-http-service`, `virtualdevice-service`, `bidcos-dispatcher`, `bidcos-rpc`, `communication-rpc`, `datalogging-rrd`, `devicemanagement`, `devicedescription`, `transaction`, `transaction.hmip`, `protocol/hmip`. Third-party libs bundled: Vert.x core + dropwizard-metrics, Netty (handler, codec-http/http2, dns, socks), Jackson, Guice (`com.google.inject`, 565 classes), Apache HttpClient/commons, Log4j2/slf4j, rrd4j, opencsv, Freemarker, jctools.
- `HMIPServer.jar` has the same `de.eq3.*` layout plus `de.eq3.ccu.hmip` (17 classes), a larger `de.eq3.ccu.groupdevice` (47), and extra libs: BouncyCastle (jcajce, pqc, crypto), Prometheus metrics (`io.prometheus.metrics`, 1060), Woodstox (`com.ctc.wstx`), multi-release `META-INF/versions/9`.
- `ESHBridge.jar`: Eclipse SmartHome (`org.eclipse.smarthome`, 336), jUPnP, JmDNS, Jetty (621), Guava; own code in `de.eq3.eshlight` (39 classes). Licensing note: `www/rega/licenseinfo.htm:13889-13893` states ESHBridge itself is not open source.
- `hmip-copro-update.jar`: `de.eq3.cbcs` (128), `gnu.io.rfc2217` (serial-over-network), slf4j, commons.
- Both servers carry embedded `log4j2.xml`, and `HMServer.jar` also embeds `log4j.xml`, and device description XMLs under `de/eq3/cbcs/devicedescription/devicespecification/{eQ-3,HunterDouglas,...}/device_*.xml`.
- Freemarker (`freemarker/*`) is bundled in the servers, which is what renders the `opt/HMServer/pages/*.ftl` files.

Observation: `etc/config_templates/log4j2.xml` (see `.migration/docs/modules/etc.md`) provides the runtime logging override, since the jars embed their own default.

## Freemarker pages (`opt/HMServer/pages/`)

17 server-rendered HTML+JS fragments, 6586 lines. They are loaded into the legacy web UI (`src/webui`/`www`) via Ajax from endpoints under `/pages/jpages/...` and receive `sid=` (session id) on every call (57 `sid=` occurrences). Freemarker usage: `<#if>` (28), `<#list>` (22), `<#assign>` (10), `${...}` interpolation of model objects (`accessPoint.*`, `dataSource.*`, `diagram.*`, `group.*`, `object.*`, `template.*`, `TableId`, `initialized`, `SDCardStatus`). Client side: jQuery, Prototype (`Class.create(YesNoDialog, ...)`, `AccessPointManagementListPage.ftl:7`), Knockout (`ko.observableArray`, `GroupChooseDialog.ftl:2-10`), jqPlot (`DiagramControlListPage.ftl:185,670,879`), WebUI helpers (`translateKey`, `setPath`, `dlgPopup`, `WebUI.enter`, `WebUI.goBack`).

| Template | Lines (approx. size) | Feature | Backend endpoints called |
|---|---|---|---|
| `AccessPointManagementListPage.ftl` | 14.7 KB | HmIP access point management list, rescue/update/reset | `jpages/hmip/AccessPoint/show`, `jpages/hmip/AccessPoint/searchAccessPoints`, `jpages/hmip/AccessPoint/updateAccessPoint`, `jpages/hmip/AccessPoint/waitForUpdateCompleted`, `jpages/hmip/AccessPoint/waitInitDone`, `jpages/hmip/AccessPoint/rescueAccessPoint`, `jpages/hmip/AccessPoint/reset` |
| `AccessPointSettingsListPage.ftl` | 6.3 KB | Access point settings list | `jpages/hmip/AccessPointSettings/showAddableList`, `jpages/hmip/AccessPointSettings/showEdit`, `jpages/hmip/AccessPointSettings/showDelete`, `jpages/hmip/AccessPointSettings/startSearchAddable` |
| `AddableAccessPointSettingsListPage.ftl` | 2.8 KB | Addable access points | `AccessPointSettings/showAdd` |
| `NewAccessPointDialog.ftl` | 9.4 KB | Assign new access point | `AccessPointSettings/assignAccessPoint`, `AccessPointSettings/isAssignmentDone` |
| `EditAccessPointSettingsDialog.ftl` | 17.3 KB | Edit AP name, DRAP bus config, update | `AccessPointSettings/getDRAPConfiguration`, `AccessPointSettings/setDRAPConfiguration`, `AccessPointSettings/setAccessPointName`, `AccessPointSettings/startAccessPointUpdate` |
| `DeleteAccessPointDialog.ftl` | 7.1 KB | Delete (optionally forced) AP | `AccessPointSettings/deleteAccessPoint`, `AccessPointSettings/isDeletionDone` |
| `AvailableFirmware.ftl` | 10.3 KB | Device firmware list | `jpages/system/DeviceFirmware/addFirmware`, `jpages/system/DeviceFirmware/deleteFirmware`, `jpages/system/DeviceFirmware/showChangelog` |
| `CouplingDialog.ftl` | 16.3 KB | Add third-party gateways (`lightify`, `hue`, `CouplingDialog.ftl:6-9`) | `jpages/system/Coupling/scanGateway`, `jpages/system/Coupling/addGateway`, `jpages/system/Coupling/getGatewayIP`, `jpages/system/Coupling/isScanning` (`:11,136,192`) |
| `StorageSettingsDialog.ftl` | 13.4 KB | Storage settings (SD card) and energy price (electricity/gas per kWh) | `jpages/system/StorageSettings/show`, `jpages/system/EnergyPriceController/readPricePerKWh`, `jpages/system/EnergyPriceController/savePricePerKWh` |
| `DiagramControlListPage.ftl` | 51.4 KB (largest) | Diagram viewer (jqPlot, consolidation function, time period, export) | `jpages/diagram/control/show`, `jpages/diagram/control/export`, `jpages/diagram/control/settings` (`:831,906,1269`) |
| `DiagramSettingsDetailPage.ftl` | 25.4 KB | Edit a diagram, add/remove data sources | `jpages/diagram/settings/addDataSource`, `jpages/diagram/settings/removeDataSource`, `jpages/diagram/settings/save` |
| `DiagramSettingsListPage.ftl` | 8.3 KB | Diagram list, active/visible/operable toggles | `jpages/diagram/settings/active`, `jpages/diagram/settings/visible`, `jpages/diagram/settings/operable`, `jpages/diagram/settings/delete`, `jpages/diagram/settings/showEdit`, `jpages/diagram/settings/showDiagramType` |
| `NewDiagramDialog.ftl` | 1.9 KB | New diagram dialog | `jpages/diagram/settings/showAdd` |
| `GroupListPage.ftl` | 15.5 KB | Group (virtual device) list | `jpages/group/create`, `jpages/group/edit`, `jpages/group/delete`, `jpages/group/configureDevices`, `jpages/group/listPossibleGroups` |
| `GroupEditPage.ftl` | 28.1 KB | Edit a group | `jpages/group/list`, `jpages/group/save`, `jpages/group/suitableGroupMembers` |
| `GroupChooseDialog.ftl` | 4.7 KB | Choose group type (Knockout view model from `possibleGroupsList`, `:2-10`) | `jpages/group/addDevice` |
| `GroupConfigureDialog.ftl` | 4.9 KB | Configure group devices | (Knockout view model, `:1-6`) |

Feature groups: HmIP access point management (6 files), diagrams / measurement (4 files + `templates.dit`), groups (4 files + `groupdefinitions.xml`), system settings (coupling, firmware, storage).

Notes and debt markers:
- TODOs: `AccessPointManagementListPage.ftl:78`, `CouplingDialog.ftl:237` ("TODO Binding"), `DiagramSettingsDetailPage.ftl:60` ("translate the unit values"), `DeleteAccessPointDialog.ftl:48` ("make a correct message box").
- Session id is passed as a URL query parameter (`sid=`), including from the JS `SessionId` global. Freemarker interpolations of names are used in JS string literals (e.g. `GroupChooseDialog.ftl:7`, `${group.getName()}`) without an obvious escaping built-in in the sampled lines; a grep for `?html`/`?js_string`/`?json_string` found no matches in any file. Treat as unverified XSS-relevant surface in a migration.
- Pages hard-code absolute URLs (`/pages/jpages/...`) that the Java servers must continue to serve.

## `groupdefinitions.xml` (`opt/HMServer/groups/groupdefinitions.xml`)

- Root `group_definitions` (`:2`) with a single `group` (`:3-8115`).
- `allowed_member_types` (`:4-48`): 14 allowed device types, e.g. `HM-CC-RT-DN`, `HM-Sec-SC`, `HM-Sec-SC-2`, `HM-Sec-SCo`, `HM-Sec-RHS`, `HM-Sec-RHS-2`, `HM-Sec-xx`, `HM-TC-IT-WM-W-EU` (`max_count` 1), `HM-PB-2-WM`, `HM-PB-2-WM55(-2)`, `HM-PB-2-FM`, `HM-RC-2-PBU-FM`, `ZEL STG RM FFK`.
- `group_type` (`:49-53`): id `HomeMatic.heating`, label `Heating_Control` (an i18n key), version 3. Only this group type is defined.
- `ignore_link_roles` (`:54-60`): ignores `WEATHER_TH` link role for `HM-TC-IT-WM-W-EU`.
- `channels` (`:61` onward): channel 0 `MAINTENANCE` (`:61`), channel 1 `CLIMATECONTROL_RT_TRANSCEIVER` (`:433`), channel 2 `SHUTTER_CONTACT` (`:762`), 3 in total. Each declares `config_params` / `status_params` containing `status_parameter` / `config_parameter` elements (attributes `aggregation`, `default`, `min`, `max`, `name`, `operations`, `tab_order`, `type`, `unit`) with `mappings` to member `device_type` / `channel_index` / `parameter_name` / `priority`.
- Status parameters in the maintenance channel: `UPDATE_PENDING`, `RSSI_DEVICE`, `AES_KEY`, `DEVICE_IN_BOOTLOADER`, `UNREACH`, `STICKY_UNREACH`, `CONFIG_PENDING`, `LOWBAT`, `INHIBIT`, `RSSI_PEER`, `PARTY_MODE_SUBMIT`.
- Config parameters: heating profile scheduling (`P1_ENDTIME_<WEEKDAY>_<1..13>` and temperature counterparts), `BOOST_*`, `DECALCIFICATION_*`, `BUTTON_LOCK`, `GLOBAL_BUTTON_LOCK`, `MODUS_BUTTON_LOCK`, `DAYLIGHT_SAVING_TIME`, `BACKLIGHT_ON_TIME`, `DISPLAY_INFORMATION`, `LOCAL_RESET_DISABLE`. Parameter types: INTEGER (288), FLOAT (284), BOOL (16), ENUM (7), ACTION (4), STRING (1).
- Highly repetitive generated-looking data (592 `HM-TC-IT-WM-W-EU` and 229 `HM-CC-RT-DN` references). Consumed by `de.eq3.lib.groupadministration` / `de.eq3.ccu.groupdevice` classes in the jars (inferred from package names; no repo reference to the path was found, see Dependencies).

## `templates.dit` (`opt/HMServer/measurement/templates.dit`)

- JSON-like array (unquoted keys, single-quoted strings, so not strict JSON) of 8 diagram templates, ids "1".."8" (`:3,73,143,213,283,353,425,496`).
- Each has `name` and `description` as i18n placeholders `${diagramTemplateN}`, `${diagramTemplateDescriptionN}`, and a `seriesTemplate` holding jqPlot options: `grid` (background colour per template, e.g. `#e6edff`, `#fff6ed`), `axes.xaxis.tickOptions.formatString '%d.%m.%y %H:%M'`, `cursor`, `legend`, `seriesDefaults`, `series`.
- Consumed by the diagram pages (jqPlot) via the measurement service (`de.eq3.ccu.measurement`); the `${...}` placeholders are resolved server side.

## `legacy-parameter-definition.config` (`opt/HmIP/legacy-parameter-definition.config`)

- Referenced from `etc/config_templates/crRFD.conf:18` as `Legacy.Parameter.Definition.File`. Used by the HmIP server's legacy (XML-RPC) API layer to present HmIP devices to legacy clients (ReGaHss/WebUI).
- Properties format, 1092 lines, three sections:
  1. Maintenance channel mapping (`:1-6`): `MAINTENANCE_BAT_BL|CL|EL`, `MAINTENANCE_SD`, `MAINTENANCE_HAP` map to `MAINTENANCE`.
  2. Paramset id mapping (`:8` onward, `# Mapping of the paramset id`): device type to legacy paramset id, e.g. `HmIP-eTRV-*=hmip-etrv`, `HmIP-PSM-*=hmip-psm`, `HmIP-FSM16=hmip-fsm`, `HmIP-BWTH24=hmip-bwth`, `HmIP-SMO-A=hmip-smo`, `HmIP-SWDO-I=hmip-swdo`, `ALPHA-IP-RBG=hmip-wth-2`, `Contact AA_1=sc_ch` (about 25 mappings to `hmip-*` ids; duplicate `HmIP-eTRV-2` key in different case, e.g. `HMIP-eTRV-2` and `HmIP-eTRV-2`).
  3. Per-parameter attributes `<CHANNELTYPE>.<PARAMETER>.<Attribute>`: `Unit` (476 entries), `Control` (464), `Disabled` (15), `TabOrder` (1). Example: `ACCELERATION_TRANSCEIVER.ABSOLUTE_ANGLE.Unit=` + degree sign.
- Encoding caveat: the file contains non-UTF-8 bytes (ISO-8859-1 degree/micro signs) shown as replacement characters in UTF-8 readers; `crRFD.conf` sets `Legacy.Encoding=ISO-8859-1`, so editing tools must preserve the byte encoding.

## `crrfd.fwfix` (`opt/HmIP/crrfd.fwfix`)

- JSON with a single key `divergentDeviceTypes` listing 6 entries (`:2-45`): `deviceTypeId` 277, 278, 279, 280, 283, 261, each with `manufacturerCode: 1`, `companyPrefix: 4047986`, `oemPrefix: "MO"`, `virtualManufacturerCode: 65535`.
- Purpose (from key name in config): the config key FirmwareUpdate.BG.OTAU.divergent.device.type.definition.file (value points to the crrfd fwfix file under the HmIP install dir) (`etc/config_templates/crRFD.conf:11`) - divergent device types for background OTAU firmware updates. The "MO" OEM prefix semantic is not documented in the repo.

## Dependencies and coupling

- Inbound (repo files that reference this module):
  - `cmake/Components.cmake:146-147` (packaging), `tests/test-components.py:89`, `.github/workflows/ci.yml:188`.
  - `etc/config_templates/crRFD.conf:11,18` (absolute runtime paths `/opt/HmIP/crrfd.fwfix`, `/opt/HmIP/legacy-parameter-definition.config`).
  - `www/rega/licenseinfo.htm:13889-13893` (ESHBridge license note).
- No repo script (`bin/`, `src/`, init scripts) references `/opt/HMServer/*.jar` or launches the jars; the launch command line (JVM flags, classpath, which path the `.ftl`/`groupdefinitions.xml`/`templates.dit` are read from) lives outside this repo (likely the OS-level/OpenCCU build). Paths are therefore unverified from within this repo.
- Runtime peers (outside `opt/`): legacy WebUI (`src/webui`, `www/`) loads the `/pages/jpages/*` endpoints; `crRFD`/`etc/config_templates/crRFD.conf` configures the HmIP server; `/dev/mmd_hmip` (multimacd) for the radio; Rega/Tcl scripts talk XML-RPC to the servers (port `32010` legacy API per `crRFD.conf`).
- External services: key server `secgtw.homematic.com:8443` (from `crRFD.conf`), third-party gateways Hue and Lightify via ESHBridge.

## Migration-relevant observations

- Opaque binaries dominate (about 68 MB of jars, no source); behaviour of the HTTP endpoints, device handling and persistence cannot be derived from this repo. Re-implementing requires either the upstream (eQ-3) source or black-box contract capture of the `/pages/jpages/*` HTTP endpoints, the XML-RPC legacy API, and the config formats documented above.
- Mixed JDK baselines: `HMServer.jar` targets Java 8 (built with 1.8.0_252), `HMIPServer.jar` Java 21, `hmip-copro-update.jar` Java 8. Two Java servers coexist.
- `HMIPServer.jar` is a SNAPSHOT build (`1.5.1-SNAPSHOT`) from CI (Jenkins #5936), so builds are not reproducible from this repo.
- Freemarker templates mix server-side templating with large inline JS (jQuery, Prototype, Knockout, jqPlot); front-end and back-end are tightly coupled via session-id query parameters and hard-coded endpoint paths.
- i18n keys (`translateKey(...)`, `${diagramTemplateN}`, `Heating_Control`) are resolved outside this module (translation tables are not in `opt/`).
- Only the `HMServer.jar` presence is asserted in CI; `HMIPServer.jar` and others are not.
