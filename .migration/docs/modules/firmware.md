# Module: firmware

## 1. Overview

| Item | Value |
|---|---|
| Path | `firmware/` |
| Size | 7.0 MB on disk, 166 tracked files (`git ls-files firmware`) |
| Nature | Data/asset module. Contains no executable source code. |
| File mix | 143 `.xml`, 10 `.hex`, 9 `.eq3`, 2 `.zip`, 4 `fwmap` text files |
| Role | Runtime asset tree staged to `/firmware` on the target image. It holds (a) the BidCoS RF and HS485 (HomeMatic Wired) device-type descriptors, (b) firmware images for Wired modules, LAN gateways and radio coprocessors, and (c) `fwmap` index files that tell the daemons which image applies to which device or coprocessor. |
| Consumers | C++ daemons `rfd`, `hs485d`, the `eq3config` tools (`update-coprocessor`, `update-lgw-firmware`) and the WebUI (Tcl/CGI). See section 6. |

The module is passive. Behaviour is defined entirely by the consumers that parse it.

## 2. Directory layout

```
firmware/
  fwmap                      main index (HS485 .hex, CCU2 coprocessor, LAN gateways)
  hmw_*_hw0.hex   (10)       HS485 module firmware, Intel HEX, AVR code
  coprocessor_update.eq3             dual coprocessor (CCU2)            75,088 B
  coprocessor_update_hm_only.eq3     HM-only coprocessor                59,608 B
  hmw-lgw-o-dr-gs-eu_update.eq3      HMW wired LAN gateway             146,872 B
  hm-lgw-o-tw-w-eu_update.eq3        HM RF LAN gateway                 125,920 B
  HM-MOD-UART/    fwmap + coprocessor_update.eq3 + dualcopro_si1002_update_blhm.eq3
  HmIP-RFUSB/     fwmap + dualcopro_update_blhmip-4.4.18.eq3 + hmip_coprocessor_update-2.8.6.eq3
  RPI-RF-MOD/     fwmap + dualcopro_update_blhmip-4.4.22.eq3
  access-controller/  HMIP_HAP_update_V2_2_6_2020_08_11.zip, HmIPW-DRAP_update_V2_2_6_2020_08_11.zip
  rftypes/        127 BidCoS-RF device descriptors rf_*.xml + replaceMap/rfReplaceMap.xml
  hs485types/     15 HS485 (Wired) device descriptors hmw_*.xml
```

Note: `rftypes/` has 128 entries, which are the 127 `rf_*.xml` files plus the `replaceMap/` directory.

## 3. Sub-areas

### 3.1 `fwmap` index files

All four `fwmap` files are whitespace-separated text. Columns are `Type Filename Version`, and `#` starts a comment (`firmware/fwmap:1`).

| File | Content |
|---|---|
| `firmware/fwmap` (33 lines) | Three sections: HS485 hardware types, coprocessor, gateways. |
| `firmware/HM-MOD-UART/fwmap` (7 lines) | `CCU2 dualcopro_si1002_update_blhm.eq3 2.8.6` (`HM-MOD-UART/fwmap:6`) |
| `firmware/HmIP-RFUSB/fwmap` (5 lines) | `CCU2 dualcopro_update_blhmip-4.4.18.eq3 4.4.18`. The `hmip_coprocessor_update.eq3 2.8.6` line is commented out (`HmIP-RFUSB/fwmap:4-5`). |
| `firmware/RPI-RF-MOD/fwmap` (6 lines) | `CCU2 dualcopro_update_blhmip-4.4.22.eq3 4.4.22` (`RPI-RF-MOD/fwmap:5`) |

Note that the filename shipped for HmIP-RFUSB is the 4.4.18 image, while the commented line names `hmip_coprocessor_update.eq3`. The directory contains `hmip_coprocessor_update-2.8.6.eq3`, a different filename. The commented line is therefore stale.

Entries in the main `fwmap` (`firmware/fwmap`):

- HS485 (Wired) entries, `fwmap:7-16`. The key is a bootloader hardware type (`H<nn>V0`), and the version column is `@0x77F0`. This is a memory address inside the HEX file where the 16-bit firmware version is stored, not a literal version.

  | Key | File | Device |
  |---|---|---|
  | H16V0 | hmw_io_4_fm_hw0.hex | HMW-IO-4-FM |
  | H17V0 | hmw_lc_sw2_dr_hw0.hex | HMW-LC-Sw2-DR |
  | H18V0 | hmw_io12_sw7_dr_hw0.hex | HMW-IO-12-Sw7-DR |
  | H20V0 | hmw_lc_dim1l_dr_hw0.hex | HMW-LC-Dim1L-DR |
  | H21V0 | hmw_lc_bl1_dr_hw0.hex | HMW-LC-Bl1-DR |
  | H22V0 | hmw_io_sr_fm_hw0_unstable.hex | HMW-IO-SR-FM, marked UNSTABLE |
  | H25V0 | hmw_sen_sc_12_dr_hw0.hex | HMW-Sen-SC-12-DR |
  | H26V0 | hmw_sen_sc_12_fm_hw0.hex | HMW-Sen-SC-12-FM |
  | H27V0 | hmw_io_12_fm_hw0.hex | HMW-IO-12-FM |
  | H28V0 | hmw_io12_sw14_dr_hw0.hex | HMW-IO-12-SW14-DR |

- Coprocessor entries, `fwmap:18-22`:
  - `ARM7 hss_comm.enc 0.056`. The file `hss_comm.enc` is not present in `firmware/`.
  - `CCU2 coprocessor_update.eq3 2.8.6`.
  - `CCU2-RFLGW coprocessor_update_hm_only.eq3 1.4.1`.
  - The `CCU2 ... coprocessor_update_hm_only.eq3 1.4.1` line is commented out.
- Gateway entries, `fwmap:24-26`:
  - `HMW-LGW-O-DR-GS-EU hmw-lgw-o-dr-gs-eu_update.eq3 1.0.5`
  - `HM-LGW-O-TW-W-EU hm-lgw-o-tw-w-eu_update.eq3 1.1.5`
- HomeMatic RF entries, `fwmap:28-32`: no entries. Only a comment says that RF device firmware files are available from www.homematic.com. The commented template is `# 100 hm-xx-yy-zz_update.eq3 1.0`.

### 3.2 Firmware image files

| Format | Count | Notes |
|---|---|---|
| `.hex` | 10 | Intel HEX records (`:10000000 0C94...`, AVR `jmp` vector table, `hmw_io_4_fm_hw0.hex:1`). Every file is 86,413 bytes. Eight of the ten have distinct md5 checksums and two are identical (`md5sum *.hex` shows one hash twice), so several variants share image content. These are HS485 module firmware images loaded by `hs485d`. |
| `.eq3` | 9 | Proprietary eQ-3 update container. The content is ASCII hex text. `update-coprocessor.cpp` reads it as a sequence of frames, each starting with a 2-byte length (4 hex chars, big-endian) followed by data (`src/libeq3config/update-coprocessor/update-coprocessor.cpp:910-935`). The payload appears opaque or encrypted (`00F21FE31E0E...`) and was not analysed. |
| `.zip` | 2 | Each holds 5 files: `*-application_update.eq3`, `*-available_versions.txt`, `*-coprocessor.eq3`, `*-local_bootloader_update.eq3`, `*-web_bootloader_update.eq3`. Version V2_2_6, dated 2020-08-11. |

The `.eq3` files by location:

| Location | Files | Target |
|---|---|---|
| `firmware/` | `coprocessor_update.eq3`, `coprocessor_update_hm_only.eq3` | CCU2 coprocessor (dual HM+HmIP, or HM-only) |
| `firmware/` | `hmw-lgw-o-dr-gs-eu_update.eq3`, `hm-lgw-o-tw-w-eu_update.eq3` | LAN gateways |
| `firmware/HM-MOD-UART/` | `coprocessor_update.eq3`, `dualcopro_si1002_update_blhm.eq3` | HM-MOD-UART radio module |
| `firmware/HmIP-RFUSB/` | `dualcopro_update_blhmip-4.4.18.eq3`, `hmip_coprocessor_update-2.8.6.eq3` | HmIP-RFUSB stick |
| `firmware/RPI-RF-MOD/` | `dualcopro_update_blhmip-4.4.22.eq3` | RPI-RF-MOD |

The zips under `access-controller/` target the HmIP Access Point (HAP) and HmIPW-DRAP. No file outside `firmware/` references these zip names. The only hits for `HMIP_HAP`/`HmIPW-DRAP` outside `firmware/` are WebUI and `hm_autoconf` references to device type names, not to these zips. Git history records "remove obsolete /firmware/access-controller firmware files" (commit `206e44a9`), but `git ls-files` still lists both zips. Their consumption status is unclear.

### 3.3 `rftypes/` : BidCoS-RF device descriptors

- 127 `rf_*.xml` files, 3.09 MB in total. Each file is minified onto a single line with ISO-8859-1 encoding (`rftypes/rf_sc.xml:1`, `wc -l` reports 0 lines).
- Root element is `<device version="N" [rx_modes=...] [supports_aes="true"] [cyclic_timeout=...]>`. Observed `rx_modes` values: `CONFIG`, `WAKEUP`, `LAZY_CONFIG`, `BURST`. Also seen: `peering_sysinfo_expect_channel`, `class="central"`, `ui_flags="dontdelete"`.
- Typical child elements, as in `rftypes/rf_sc.xml:1`:
  - `<supported_types>` holds one or more `<type name id priority>` entries. Each carries `<parameter index="9.0" size="1.0" cond_op="GE" const_value="0x18"/>` and `index="10.0"` conditions. These match firmware version (byte 9) and model ID (bytes 10-11) of the device's type announcement. This is how a physical device is bound to a descriptor.
  - `<paramset type="MASTER|VALUES|LINK">`. Across all rf files there are 482 MASTER, 360 VALUES and 199 LINK paramsets.
  - `<parameter id=...>` with `<logical>` (type, min, max, default, unit) and `<physical>` (interface `config`/`internal`, list, index, size), plus `<enforce>` and `<conversion>`.
  - `<frames>` with `<frame id direction type channel_field>` (BidCoS frame layouts such as `EVENT` type `0x41`, `INFO_LEVEL` type `0x10`), plus `<channels>` and `<link_roles>`.
- Total of 346 `<type name=` supported type entries across the rf files.
- 130 maintenance channels (`class="maintenance"`) and one central (`rf_central.xml`: virtual remote "CENTRAL"/"HM-RCV-50", `rftypes/rf_central.xml:1`).
- Versioned variants are encoded in the filename (36 files match `_le_`, `_ge_` or `_vN_`). Examples: `rf_sc.xml`, `rf_sc_le_v1_6.xml`, `rf_sc_e_v1_7.xml`, `rf_dim_1l_644.xml` and `rf_dim_1l_644_le_v2_4.xml`. Selection between variants happens through the `cond_op` firmware-version conditions in `supported_types`.
- Device families by prefix, from the file listing: `rf_sc*` (shutter contacts), `rf_s*` (switches), `rf_dim_*`, `rf_bl*` (blinds), `rf_rc*` (remotes), `rf_sec_*` (security: smoke, motion, siren), `rf_sen_*` (sensors), `rf_cc_*` (climate/thermostat), `rf_wds*` (weather), `rf_es_*` (energy), `rf_tis*`, `rf_keymatic`, `rf_winmatic`, `rf_rgbw`, plus vendor devices (Roto, Schueco, Oligo).

#### `rftypes/replaceMap/rfReplaceMap.xml`

- 17,819 lines, pretty-printed (`rfReplaceMap.xml:1-40`).
- Structure: `<rf_replace_map>` contains `<replace>` entries (307 counted). Each has one `<new_type name id priority>` with parameter conditions, and a `<replaceable_types>` list of `<type>` entries with their own conditions.
- It declares which old device types a new device type may replace in the WebUI device-exchange workflow. Parsed by `src/rfd/RFReplaceMap.cpp`, loaded from `src/rfd/RFManager.cpp`.

### 3.4 `hs485types/` : HomeMatic Wired descriptors

- 15 files, 234 KB total, minified, ISO-8859-1 (`hs485types/hmw_io_4_fm.xml:1`). They are `hmw_central.xml`, `hmw_generic.xml`, nine device files such as `hmw_io_4_fm.xml`, `hmw_lc_sw2_dr.xml`, `hmw_sen_sc_12_dr.xml`, and four `*_V3_02.xml` variants.
- Same schema family as rftypes, but wired-specific:
  - Root `<device version="11" eep_size="1024">`.
  - `<supported_types>` match by `index="0"` (hardware type, for example `16`), `index="1"` (hw version) and `index="2"` firmware (`cond_op="GE" const_value="0x0303"`), so the `_V3_02` files cover newer firmware.
  - Parameters use `interface="eeprom"` with `<address index="0x0001"/>`, rather than the RF `config` interface list/index.
  - Frame types are single characters (`type="#x"`, `"#S"`, `"#i"`) in the HS485 protocol.
- 17 `<type name=` entries in total.
- Hardware-type numbers in `supported_types` line up with the `H<nn>V0` keys in `fwmap` (for example `HMW-IO-4-FM` is hardware type 16 and key `H16V0`).

## 4. Build and staging integration

Two sources feed `/firmware` in the final rootfs.

1. Verbatim copy of `firmware/` : `cmake/Components.cmake:148` `openccu_asset_directory(FIRMWARE firmware firmware)` copies the tree to `${ROOTFS_DIR}/firmware` (function at `Components.cmake:136-146`). The option `BUILD_FIRMWARE` defaults to `BUILD_DEFAULT_COMPONENTS` (`Components.cmake:7-9`).
2. Regenerated device descriptors from `src/devicetypes/`:
   - `src/devicetypes/CMakeLists.txt:1-9` creates `firmware/hs485types` and `firmware/rftypes/replaceMap`, copies `replaceMap/rfReplaceMap.xml`, and runs `GenerateDeviceTypes.cmake`.
   - `GenerateDeviceTypes.cmake` runs `build-tools/bidcos-devicetype-strip` on every `src/devicetypes/rftypes/*.xml`, `src/devicetypes/hs485types/*.xml` and writes the result to `${ROOTFS_DIR}/firmware/<family>/`. It uses a temp file and rename, and fails the build on empty or failed output.
   - `Components.cmake:149-151` makes `devicetypes-assets` depend on `FIRMWARE-assets`, so the generated, stripped descriptors overwrite the files copied from `firmware/` (as the generator comment says, a pre-staged file must never stand in for a missing generator output).
   - If `BUILD_DEVICETYPES` is on and `BUILD_FIRMWARE` is off, only the generated files are installed (`Components.cmake:152-154`).

Relationship to `src/devicetypes/`:
- The checked-in `firmware/rftypes/*.xml` are the already-stripped/minified form. For example `firmware/rftypes/rf_sc.xml` is 7,943 bytes and `src/devicetypes/rftypes/rf_sc.xml` is 10,964 bytes. They differ from byte 31 of line 1 on. `src/devicetypes/rftypes` has 130 entries and `firmware/rftypes` has 128, so the contents are not 1:1.
- `src/devicetypes/replaceMap/rfReplaceMap.xml` is copied, not stripped.
- CI check `.github/workflows/ci.yml:205-212` compares the number of `*.xml` files in `src/devicetypes/rftypes` and `src/devicetypes/hs485types` with the staged `firmware/rftypes` and `firmware/hs485types` counts. The staged `firmware/` is therefore expected to be regenerated from `src/devicetypes/`, and the checked-in descriptor copies appear redundant or legacy. This was not verified by diffing every file.

## 5. Runtime lookup paths

| Consumer | Config key / constant | Default | Evidence |
|---|---|---|---|
| `rfd` (RF) | `Firmware Dir`, `Device Description Dir` | set in rfd config | `src/rfd/RFManager.cpp:205`, `:266` |
| `rfd` user firmware | `userFirmwarePath` | `/etc/config/firmware/` | `src/rfd/RFFirmwareManager.cpp:22` |
| `rfd` fwmap file name | `MAPFILENAME` | `fwmap` | `src/rfd/RFFirmwareManager.cpp:19` |
| `hs485d` | `Device Description Dir` | `/firmware/hs485types` | `src/hs485d/HS485Manager.cpp:231` |
| `hs485d` | extra descriptors | `/etc/config/hs485types` (comment: "special device descriptions used by special persons, don't remove this") | `HS485Manager.cpp:238` |
| `hs485d` | `Firmware Dir` | `/firmware` | `HS485Manager.cpp:246` |
| `update-coprocessor` | `firmwareDir` | `/firmware/` (override with `-d`) | `src/libeq3config/update-coprocessor/update-coprocessor.cpp:49,76` |
| `update-lgw-firmware` | `-m <fwmap>`; image path prefixed with `/firmware/` | none | `src/libeq3config/update-lgw-firmware/update-lgw-firmware.cpp:174,245-247` |

## 6. Consumer parsing logic for `fwmap`

Each consumer applies its own filter to the same format. Changes to `fwmap` columns or key prefixes affect them differently.

- **`rfd`**: `RFFirmwareManager::InitFilenameMap` (`src/rfd/RFFirmwareManager.cpp:103-135`).
  - Skips comment lines, empty lines, and any line whose first character is `H`, `A` or `C`. This is how the HS485 (`H...`), `ARM7`, `CCU2*` and gateway lines (`HMW-`, `HM-LGW`) are ignored.
  - Keeps only entries whose filename contains `.enc` or `.eq3`.
  - The type column is parsed with `atoi` into a numeric RF device type code (the commented template is `100 hm-xx-yy-zz_update.eq3 1.0`).
  - Since the shipped `fwmap` has no numeric lines, rfd has no built-in RF device firmware. All RF device firmware comes from the user directory.
  - `RefreshUserFirmwareMap` (`:138-181`) merges user firmware. Each subdirectory of `/etc/config/firmware/` holds an `info` file with `TypeCode=` and `FirmwareVersion=` plus one `*.eq3` file (`:184-224`). A user version replaces the built-in entry only if its version is higher. Otherwise it is ignored (the log text says "Higher version available").
- **`hs485d`**: `HS485FirmwareManager::InitFilenameMap` (`src/hs485d/HS485FirmwareManager.cpp:84-110`).
  - Only entries whose filename contains `.hex` are kept. The key is a string such as `H16V0`.
  - `version_is_address` mode: for `@0x...` the 16-bit version is read from the HEX buffer at that address, minus the HEX start address (`:59-73`). It is formatted as `%d.%02d` (`:76`).
- **`update-coprocessor`**: `CoprocessorUpdate::readFilenameMap` (`src/libeq3config/update-coprocessor/update-coprocessor.cpp:834-902`).
  - Only lines starting with `C` are considered, `.eq3` filenames only. The type string must match exactly: `CCU2`, `HM-MOD-UART` or `CCU2-RFLGW`.
  - The first match wins.
  - This is why the per-board directories (`HM-MOD-UART/`, `HmIP-RFUSB/`, `RPI-RF-MOD/`) carry their own `fwmap` with a `CCU2` key, and are selected by pointing `-d` at the sub-directory.
  - A likely bug exists in the arg parsing: `typeStr.compare("HM-MOD-UART")` (`update-coprocessor.cpp:165`) returns non-zero on mismatch, so the branch is taken when the type is NOT `HM-MOD-UART`. Not verified further.
- **`update-lgw-firmware` / `lgwallocation`**: gateway type names in `fwmap` (`HMW-LGW-O-DR-GS-EU`, `HM-LGW-O-TW-W-EU`) are mapped to BidCoS types `HMWLGW` and `HMLGW2` in `src/libeq3config/lgwallocation/lgwallocation.cpp:16-24`. A source comment marks the second as "TODO Not released".

## 7. Other consumers (WebUI / Tcl / CGI)

- `src/webui/www/config/ic_deviceFirmwareOverview.cgi` : the device firmware overview page, which shows firmware availability on the CCU and has an update button.
- `src/webui/www/config/cp_maintenance.cgi`, `cp_security.cgi`, `backup.tcl`, and `src/webui/www/api/methods/ccu/downloadFirmware.tcl` contain `firmware` matches. These concern CCU system firmware (`firmware_upload`, `/usr/local/.firmwareUpdate`, update.homematic.com), not the `firmware/` tree. They were only keyword-matched, not analysed in detail.
- `src/hss_led/UpdateAvailable.cpp:88` fetches a version check from `update.homematic.com` using `wget`. It does not read `firmware/`.
- External services: `ccu3-update.homematic.com` and `update.homematic.com` appear in `downloadFirmware.tcl:15-18` and `cp_maintenance.cgi:42-44`.

## 8. Data dependencies and invariants

1. A `fwmap` HS485 key `H<nn>V0` must correspond to a hardware type in an `hs485types/*.xml` `supported_types` entry. It must also name an existing `.hex` file.
2. `.hex` file names listed in `fwmap` all exist (10 of 10). `fwmap` entries for the gateways and the two CCU2 coprocessors (`coprocessor_update*.eq3`, `hmw-lgw-*`, `hm-lgw-*`) also exist. The ARM7 entry `hss_comm.enc` has no file in `firmware/`.
3. Descriptor XML must be well-formed ISO-8859-1. The strip tool in `build-tools/bidcos-devicetype-strip` is a required build input. It is not in the `firmware/` module.
4. `src/devicetypes/device.xsd` is the schema the descriptors follow (neighbouring module, not examined in detail).
5. `.hex` and `.eq3` binaries are opaque to this analysis. They are version-controlled blobs updated by upstream drops (for example commit `7d7a6d14` "Update HmIP-RFUSB dualcopro firmware to 4.4.18", and `d0d6966c` "fix HmIP-RFUSB fwmap by defining firmware 4.4.18 the default").

## 9. Migration notes (observed facts only)

- No code, no tests. Migration is a data move, accompanied by an equivalent of the `fwmap` parsers in `rfd`, `hs485d` and `eq3config`.
- Directory layout, `fwmap` format and the `/firmware` mount path are hard-coded defaults in four C++ programs (section 5).
- Three firmware image families (`.hex`, `.eq3`, `.zip` bundles) use three different loaders. There is no shared manifest format beyond `fwmap`.
- The descriptor files in `firmware/` duplicate and are likely overwritten by generated output from `src/devicetypes/` (section 4). Any target design needs one source of truth.
- Stale or unreferenced content: the commented-out lines in three `fwmap` files, `hss_comm.enc` without a file, `hmip_coprocessor_update-2.8.6.eq3`, `coprocessor_update.eq3` in `HM-MOD-UART/` (listed only as a comment in its `fwmap`), and the two `access-controller/*.zip` archives (no reference found outside `firmware/`).
- Unresolved: the contents of `.eq3` (encryption/signature scheme) and the HmIP bootloader/application split inside the zips were not analysed.

## 10. Key evidence index

| Topic | Location |
|---|---|
| Main fwmap | `firmware/fwmap:1-33` |
| HS485 fwmap entries | `firmware/fwmap:7-16` |
| Coprocessor/gateway entries | `firmware/fwmap:19-26` |
| Per-board fwmap | `firmware/HM-MOD-UART/fwmap:6`, `firmware/HmIP-RFUSB/fwmap:5`, `firmware/RPI-RF-MOD/fwmap:5` |
| RF descriptor sample | `firmware/rftypes/rf_sc.xml:1` |
| Wired descriptor sample | `firmware/hs485types/hmw_io_4_fm.xml:1` |
| Replace map | `firmware/rftypes/replaceMap/rfReplaceMap.xml:1-40` |
| Staging | `cmake/Components.cmake:136-154`, `src/devicetypes/CMakeLists.txt:1-9`, `src/devicetypes/GenerateDeviceTypes.cmake` |
| CI count check | `.github/workflows/ci.yml:205-212` |
| rfd fwmap parser | `src/rfd/RFFirmwareManager.cpp:103-224` |
| hs485d fwmap parser | `src/hs485d/HS485FirmwareManager.cpp:54-110` |
| Coprocessor fwmap parser | `src/libeq3config/update-coprocessor/update-coprocessor.cpp:834-902` |
| Gateway type mapping | `src/libeq3config/lgwallocation/lgwallocation.cpp:16-24` |
