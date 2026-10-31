# Data Model

## Data Structures
No relational schema. Structures are: device/channel/paramset descriptions (XML in `src/devicetypes`, `firmware/`), C++ classes in `hs485d` (`HS485Channel`, `HS485ChannelDescription`, ...), `libhsscomm` (`HSSTypeConversion*`, `HSSLogicalType*`, `HSSPhysicalType*`), and BidCoS frame classes in `multimacd` (~100 per-command frame classes, `SerialFrame/`).

## Fields and Types
Config formats: `crypttool.cfg` lines `<int index> <md5-hex-key>`; `USERS.dat` / `SESSIONS.dat` (legacy Tcl stores); easymode profile files define `PROFILES_MAP` / `PROFILE_n` (`www/config/easymodes`). Per-field detail: Unknown (not read exhaustively).

## Relationships
Device -> channels -> paramsets (MASTER/VALUES/LINK) as exposed via XML-RPC `getParamsetDescription`/`putParamset`; links between sender and receiver channels (`ic_*` pages, `_ch_link` profiles).

## Database Mapping
No database in this repository (no `.sql`/DDL in inventory).

## Data Flow Usage
See `cross-cutting/data-flow.md`.

## Type Mapping Hints
`XmlRpcValue` <-> Tcl lists via `tclrpc` (latin-1 only). Serial frames: start 0xFD, escape 0xFC, CRC16 0x8005. ReGa strings are ISO-8859-1.

## Unknowns
Field-level schemas of HmIP/BidCoS paramsets, ReGa object model (in closed binary), full `libhsscomm` type implementations (~35 not read).
