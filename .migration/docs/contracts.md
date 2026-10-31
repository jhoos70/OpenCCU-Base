# Contracts

## API Contracts
- JSON-RPC: `www/api/homematic.cgi` POST; methods declared in `www/api/methods.conf` (namespaces: CCU 29, Interface 53, Device 15, User 14, Channel 12, SysVar 11, system 7, Room 6, Subsection 6, BidCoS_RF 5, Session 4, Program 4, ...), script files under `www/api/methods/`. See `modules/www.md`.
- XML-API: ReGa scripts under `www/rega/pages/xml-api/` (ISO-8859-1 XML).
- XML-RPC servers: `hs485d` TCP 2000 (25 methods plus `init` callback), `rfd` TCP 2001 (~50 methods, e.g. `setInterfaceClock`). Method lists with line numbers: `modules/src.md`.

## Internal Service Interfaces
`/dev/eq3loop` ioctls (`IOCSCREATESLAVE`, `IOCGEVENTS`, priority ioctls magic 'u'); `hss_led` control protocol (`LedProtocol.h`); `tclrpc` `xmlrpc` command; `tclrega` `rega_script`. See `cross-cutting/integration-seams.md`.

## Event Contracts
UDP 8182 status datagrams (HSSManager -> hss_led). XML-RPC `init` callback registration (`xmlrpc_bin://127.0.0.1:<port>` in `InterfacesList.xml`).

## File and Batch Contracts
`/etc/config/InterfacesList.xml`, `rfd.conf`, `bidcos.conf`, `crypttool.cfg`, `USERS.dat`; status/pid files in `/var/status`, `/var/run`; firmware descriptors in `firmware/`.

## External Systems
Closed `ReGaHss`; HMIPServer (Java, slave `ttyS0`); HomeMatic LAN gateway (unified LAN protocol); related repository `/home/standard/dev/OpenCCU` (not analyzed).

## Authentication and Error Behavior
See `cross-cutting/security.md`. API errors: HTTP 400 text from `common.tcl`; JSON-RPC error objects (details in `modules/www.md`).

## Shared DTOs and Payloads
`XmlRpcValue` is used as the domain model in HS485 channel/central code. Device descriptions in `src/devicetypes/*.xml`.

## Missing or Unclear Contracts
ReGaHss <-> WebUI contract (binary only); eq3configd/HMW-LGW frame formats (files not read); full XML-RPC param schemas for rfd.
