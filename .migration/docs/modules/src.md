# src


<!-- from _parts/src-part-1.md -->
# Module: src (part 1 of 2) - daemons, kernel drivers and shared C/C++ libraries

> Scope: `src/SetInterfaceClock`, `src/bcm2835_raw_uart`, `src/crypttool`, `src/eq3_char_loop`, `src/eq3configcmd`, `src/eq3configd`, `src/hs485d`, `src/hs485dLoader`, `src/hss_led`, `src/libLanDeviceUtils`, `src/libUnifiedLanComm`, `src/libXmlRpc`, `src/libelvutils`, `src/libeq3config`, `src/libhsscomm`, `src/libxmlparser`, `src/multimacd`, `src/rfd`, `src/ssdpd`.
>
> Analysis depth (the analysis was cut short by a turn limit):
> - **Read in detail**: SetInterfaceClock, eq3configcmd, crypttool, eq3configd, hs485dLoader, ssdpd, bcm2835_raw_uart (structure and key paths), eq3_char_loop (structure and key paths), hss_led, libelvutils (headers, key sources), libxmlparser (header), libUnifiedLanComm, libLanDeviceUtils (public and protocol headers only; `.cpp` bodies not read).
> - **NOT analyzed (inventory by size only)**: `hs485d`, `libXmlRpc`, `libeq3config`, `libhsscomm`, `multimacd`, `rfd`. Sections below for these list only size and build facts taken from file counts, and where they are consumed from analysed code. They must be treated as gaps and re-run if needed.

## Overview

- **Purpose**: Native (C/C++) runtime of the OpenCCU/HomeMatic CCU base system: radio/wired interface daemons (`rfd`, `hs485d`, `multimacd`), kernel char drivers for the radio UART, network discovery and configuration daemons (`eq3configd`, `ssdpd`), LED/status control (`hss_led`), small CLI tools, and the shared libraries they use.
- **Technology**: C++11 (`cxx_std_11`, e.g. `src/crypttool/CMakeLists.txt:6`), plain C for Linux kernel modules. Built with CMake; every target uses `_TIME_BITS=64 _FILE_OFFSET_BITS=64` and is staged with `openccu_stage_target(<target> bin|lib)` (e.g. `src/SetInterfaceClock/CMakeLists.txt:11`). Kernel modules are *not* built by CMake (`src/bcm2835_raw_uart/CMakeLists.txt:1-4`, `src/eq3_char_loop/CMakeLists.txt:1-4` only print a message); the bcm2835 module is built by Buildroot (`bcm2835_raw_uart.mk`).
- **License headers**: eQ-3 AG "HMSL 2" for userspace (`src/SetInterfaceClock/SetInterfaceClock.cpp:1-7`), GPL for kernel modules (`src/eq3_char_loop/eq3_char_loop.c:1156`), LGPL 2.1 for libxmlparser (`src/libxmlparser/LICENSE`), Apache-2.0 SPDX for newer `hss_led` code (`src/hss_led/LedController.cpp:1`).

### Size inventory (files / C-C++ LOC, from `find` + `wc`)

| Directory | Files | LOC | Kind |
|---|---|---|---|
| `rfd` | 135 | 29833 | daemon (BidCoS-RF), not analyzed |
| `multimacd` | 200 | 15647 | daemon (multi-MAC / radio mux), not analyzed |
| `libhsscomm` | 115 | 11719 | library, not analyzed |
| `hs485d` | 68 | 11215 | daemon (BidCoS-Wired), not analyzed |
| `libeq3config` | 69 | 9490 | library + `netconfigcmd`, not analyzed |
| `libXmlRpc` | 29 | 5508 | library, not analyzed |
| `libLanDeviceUtils` | 39 | 4406 | library |
| `libelvutils` | 45 | 3126 | library |
| `hss_led` | 36 | 3021 | daemon + CLI |
| `libxmlparser` | 6 | 2511 | library (3rd party) |
| `eq3_char_loop` | 6 | 2355 | kernel module(s) |
| `libUnifiedLanComm` | 20 | 1786 | library |
| `bcm2835_raw_uart` | 6 | 1318 | kernel module + DT overlay |
| `eq3configd` | 9 | 1276 | daemon |
| `crypttool` | 5 | 623 | CLI |
| `ssdpd` | 2 | 483 | daemon |
| `hs485dLoader` | 2 | 338 | launcher |
| `SetInterfaceClock` | 2 | 112 | CLI |
| `eq3configcmd` | 2 | 80 | CLI |

### Executables (entry points)

| Binary | Source | Entry | Role |
|---|---|---|---|
| `SetInterfaceClock` | `src/SetInterfaceClock/SetInterfaceClock.cpp` | `main` :26 | one-shot XML-RPC client, pushes UTC time + offset to `rfd` |
| `eq3configcmd` | `src/eq3configcmd/eq3configcmd.cpp` | `main` :19 | dispatcher for commands in `libeq3config` (`CommandManager`) |
| `crypttool` | `src/crypttool/crypttool.cpp` | `main` :266 | key management and signing helper for the web UI security CGI |
| `eq3configd` | `src/eq3configd/main.cpp` | `main` :70 | UDP/43439 discovery + network config daemon |
| `ssdpd` | `src/ssdpd/ssdpd.cpp` | `main` :340 | SSDP/UPnP announcer |
| `hs485dLoader` | `src/hs485dLoader/hs485dLoader.cpp` | `main` :47 | supervises `hs485d`, maintains `InterfacesList.xml` |
| `hss_led` (+ alias `hss_ledctl`) | `src/hss_led/hss_led.cpp` | `main` :~55 | LED controller daemon / client |
| `rfd`, `hs485d`, `multimacd` | `src/rfd`, `src/hs485d`, `src/multimacd` | not analyzed | daemons |

---

## Components

### SetInterfaceClock

**Location**: `src/SetInterfaceClock/SetInterfaceClock.cpp:26-72`

- Creates `SyslogLogger("SetInterfaceClock")` (:28), builds an `XmlRpc::XmlRpcClient` to `127.0.0.1:<port>`; port from `/etc/rfd.port` (`readPortFromFile` :85-101), default `2001` (:39), or argv[1] `IP:Port` (:33-35).
- Calls XML-RPC method `setInterfaceClock(int utcSeconds, int utcOffsetMinutes)` (:58-61); offset comes from `TimeZoneInfo::GetUTCOffset()/60` (:55).
- Exit codes: 0 success, 1 wrong usage, 2 RPC error (:44-70).
- Notes: `(int)time(NULL)` truncation (:58); `readPortFromFile` allocates a 256-byte heap buffer manually (:88).
- Links: `XmlRpc hsscomm xmlparser elvutils pthread crypto` (`CMakeLists.txt:11`).

### eq3configcmd

**Location**: `src/eq3configcmd/eq3configcmd.cpp:19-63`

- Multi-call binary: if `argv[0]` contains `eq3configcmd` the command is `argv[1]`, otherwise `basename(argv[0])` is the command (symlink dispatch, :25-39). Looks up `CommandManager::getInstance()->getCommand(name)` (:42), `setParams(argc, argsOffset, argv)` (:53), `execute()` (:56). Unknown command prints the supported list and returns -3 (:43-51). Command implementations live in `libeq3config` (not analyzed).

### crypttool

**Location**: `src/crypttool/crypttool.cpp`, `crypttoolconfig.cpp`, `crypttoolconfig.h`

- `crypttoolconfig` (`crypttoolconfig.h:13-34`): file-backed key store, default `/etc/config/crypttool.cfg`; format `<int index> <md5-hex-key>` per line; `getCurrentKey`/`getCurrentKeyIndex` read until the last parsable line (`crypttoolconfig.cpp:30-70`), `setCurrentKey` appends (`:73-90`), `resetConfig` truncates (`:93-107`).
- Actions (`main` :354-465): validate `-v`, encrypt/decrypt `-e/-d` (stubbed: `crypt()` logs "not implemented" and returns -1, :94-101), sign `-s`, set key `-S -i <idx> -k <key>`, reset `-r`, get indices `-g`. Key types: 0 default, 1 current user key, 2 previous, 3 temporary (:41-46).
- `sign()` (:103-215): reads stdin, MD5 of the data, then AES-128-CBC (zero IV, `:178-187`) encrypts the 16-byte digest with the key (hex-decoded MD5 of the key string), printing 32 hex chars for the web UI (comment :204).
- `validate()` (:59-92): compares MD5 of the supplied key against the last stored key.
- Default key is the hard-coded string `"Markus is awesome"` (:26), also in `eq3configd` (`main.cpp:50`).
- Build installs the empty `src/crypttool/config.txt` as `/etc/config_templates/crypttool.cfg` (`CMakeLists.txt:14-29`).

### eq3configd

**Location**: `src/eq3configd/main.cpp:70-460`, `include/networkconfig.h`, `src/networkconfig.cpp`, `include/udpframe.h`, `src/udpframe.cpp`

- UDP daemon on port **43439** (`main.cpp:37`) with `IP_PKTINFO` to learn the destination address (:40-42, :250-271); replies by broadcast if the datagram was not addressed to the unicast IP (:257-263).
- Flags: `-t <devtype>`, `-c` console log, `-l <level>` (:88-110). Serial from `/var/board_sgtin`, `/var/board_serial` or `/sys/module/plat_eq3ccu2/parameters/board_serial` (:159-163); firmware version from `/VERSION` or `/boot/VERSION` (:184-186). Device type defaults to `eQ3-HM-CCU2-App`, `eQ3-HmIP-CCU3-App` or `eQ3-HmIP-CCU3-RS` (rescue, version contains `-`) depending on version (:51-53, :212-224).
- `udpframe` (`src/udpframe.cpp:13-60`): parses version byte, 3-byte sender id (version > 1), counter, devtype and serial strings, opcode, payload; `IsTarget` (:103) matches type/serial with wildcard; `GetResponseHeader` (:135) builds the reply header.
- Opcodes (switch :380-437): `I` identify (version string, wildcard serial => random delay up to 1.3 s :391-397), `n` current IP config, `c` stored config, `C` set config (only when `CRYPT` flag off or frame was encrypted), `*` encrypted wrapper, `>` response (ignored). Unknown opcode => NAK byte 0x00 (:435).
- Encrypted frames (`*`): AES-128-CBC decrypt, no padding, key = last key in `/etc/config/crypttool.cfg` (via `networkconfig::GetCurrentAesKey`) else MD5 of default key (:289-337); a 16-byte random + 16-byte signature `"eQ-3__UDP-Crypt"` (:56-58) prefix is verified (:341). Initial IV is `0..15` until a `C` request without encryption makes the daemon hand out a fresh random IV (:229-234, :422-428).
- `networkconfig` (`src/networkconfig.cpp`): reads/writes `/etc/config/netconfig` (:18) with keys `HOSTNAME MODE CRYPT IP NETMASK GATEWAY NAMESERVER1/2 CURRENT_*` (:20-32); `LoadConfigFile` :208, `WriteConfigFile` :320, `AppendCurrentConfigToResponse` :373, `AppendConfigToResponse` :411, `SetConfigAndAppendResultResponse` :458.
- Side effect: after a successful `C`, `system("/etc/init.d/S40network restart")` (:449). Also restarts the network when `CURRENT_IP` is `0.0.0.0` (:369-374).
- Security notes: the identify/config protocol is unauthenticated unless `CRYPT=1`; the default key is a published constant; `EVP_DecryptUpdate` result length unchecked (:334); `newdata[newDataLength]` is a variable-length stack array sized from network input, capped only by `BUFSIZE 2048` (:324).
- Build: `eq3configd/CMakeLists.txt:1-16`; also contains Code::Blocks leftovers `ccu2udp.cbp/.depend/.layout` (dead project files, name `ccu2udp`).

### ssdpd

**Location**: `src/ssdpd/ssdpd.cpp`

- UDP multicast SSDP responder: group `239.255.255.250:1900` (`:28-29`), `SO_REUSEADDR`/`SO_REUSEPORT` (:365-382), multicast TTL 4 (:347), joins group on the first non-loopback, up, running IPv4 interface (`getIPAddress` :258-288).
- Sends `NOTIFY ssdp:alive` at start and every `REPEAT_AFTER = 1800` s (:26, :428, :477-479) and answers `M-SEARCH` with `MAN: ssdp:discover` and ST `upnp:rootdevice`, own UUID or `ssdp:all` (:465-474). Response `LOCATION: http://<ip>/upnp/basic_dev.cgi`, `SERVER: HomeMatic`, `USN: uuid:upnp-BasicDevice-1_0-<serial>::upnp:rootdevice` (:292-315). Replies are spread by random delay below `MX` seconds (`send_udp` :213-256).
- Serial from `/var/board_sgtin`, `/var/board_serial`, `/sys/module/plat_eq3ccu2/parameters/board_serial` (:317-338).
- Dead code in `#if 0` blocks (:45-176: `InterfaceByTargetAddress`, `ParseURL`, `GetHTTP`). No loop break on `select` EINVAL handling is odd (:447-450). Only links `pthread`.

### hs485dLoader

**Location**: `src/hs485dLoader/hs485dLoader.cpp`

- Wrapper that (1) parses the `hs485d.conf` property file (`parseHS485dConf` :172-210) looking for a section `Interface N` with `Type=HMWLGW` (:199), restoring from a `.xml` backup via `rename` if the read fails (:178-186); (2) adds or removes a `BidCos-Wired` `<ipc>` entry (`xmlrpc_bin://127.0.0.1:<port>`) in `/etc/config/InterfacesList.xml` (`updateInterfacesXML` :213-269), port from `/etc/hs485d.port` default 2000 (:300-317); (3) writes via `.new`/`.bak` + fsync + rename (:272-298); (4) forks and `execl("/bin/hs485d", ... "-g" "-i" <id> "-f" <conf>)` in a restart loop that only stops on `EACCES`/`ENOEXEC` (:134-170), pid file `/var/run/hs485dLoader.pid` (:151).
- Flags: `-l`, `-ds`, `-dw`, `-dd`, `-ilp` (:62-93); usage text says `-ilf` (:332) while code parses `-ilp` (:84).
- Notes: `xmlstring.find_last_of("</interfaces>")` (:236) is a character-set search, not a substring search (latent bug); `index -= 13` is a magic offset (:241); `retrieveXmlRpcPort` digit set `"01234567890"` has a duplicated `0` (:309).

### hss_led (and hss_ledctl)

**Location**: `src/hss_led/`

Two source sets selected by CMake option `HSS_LED_STATUS_MONITOR` (default ON, `CMakeLists.txt:1`): full status monitor, or recovery build `LedOnlyMain.cpp + LedController.cpp` (:2-6). Binary also installed under runtime alias `hss_ledctl` (`:34`). Test target `hss_led_state_test` (OFF by default, `tests/LedControllerTest.cpp`, 250 lines, prints "PASS: N assertions" :243).

**LedController** (`LedController.cpp`, 686 lines, namespace `LedController` in `LedController.h`)
- `run(startStatus)` -> `serve()` (:444): single-threaded epoll-less loop using `signalfd`, `timerfd` and a UNIX `SOCK_SEQPACKET` listener at `/run/hss_led/control` (`LedProtocol.h`); max 32 clients, 1 s deadline each, peer credentials checked via `SO_PEERCRED` (:560-565).
- State (`struct State` :374): three `Pattern`s (system, report, manual) + flags `automatic`, `overrideActive`; `effective()` priority: `/etc/config/disableLED` => off; automatic and `/var/status/startupFinished` missing => system pattern; override => manual; automatic => report; else system (:386-393). Persisted atomically to `/run/hss_led/state` via tmp + rename, mode 0600 (`save` :398-410).
- Wire protocol `"1 <verb> ..."`, replies `OK ...`/`ERR ...` (`dispatch` :412-441). Verbs: `status`, `report` (admin or the registered reporter uid), `system`, `override`, `release`, `auto`, `led <name> ...`, `list`. Non-root is rejected with `ERR permission denied`.
- Backends: `Backend` (:282) = radio RGB module LEDs under `/sys/class/leds/rpi_rf_mod:*` (`rpi_rf_mod:rgb:status`, per-colour components), `BoardLeds` (:158) = other LED-class devices (brightness, timer trigger with `delay_on/off` retry through udev permission delay).
- `LedController::report(first, second, period)` (:103) is the in-process mailbox (`ReportMailbox` :84, mutex) used by `RgbLed` (`RgbLed.h`).
- CLI (`client` :655, `makeRequest` :606, usage :575+) e.g. `hss_ledctl --led rpi-rf-mod alternate blue red slow`; `slow=500 ms`, `fast=100 ms` (`LedCli.h`), max 86400000 ms (:31). Version string `2.3` (`LedCli.h`).

**Status monitor** (only when not `/usr/local/HMLGW`; `hss_led.cpp:12-35`)
- `monitorStatus` thread waits for `/var/status/hssLedReady`, then `UdpCannel` (`UdpCannel.cpp`) binds UDP `127.0.0.1:8182` (`defines.h` ERR_PORT) and loops: `ReceiveMessage` (5 s select) -> `InfoLed::checkMessage` -> `MessageParser::parsMessage`; accepted senders `RFD POWER LIGHTTPD HS485D REGAHSS HMIP`, body `SERVICE=<int>` or `ALERT|ALARM=<bool>` (`MessageParser.cpp:23-55`).
- `InfoLed::updateLedState` (`InfoLed.cpp`, PLATFORM_CCU3 branch): maps `Network` state (`Network.cpp`: `/var/status/hasLink`, `hasIP`, `hasInternet`, `runStatusCommand("/bin/checkInternet")` :60) x service x alarm to RGB states; any of `eq3configd`, `ReGaHss`, `ssdpd` (and on full CCU `HMIPServer`(java), `multimacd`, `rfd`) not alive per pid file + `/proc/<pid>/cmdline` => solid red (`isProcessRunning`). Radio-module presence detected by `/sys/module/dummy_rx8130` or `rtc_rx8130`. Also drives the LAN-gateway info LED through XML-RPC `setRFLGWInfoLED` on rfd (`RFLGWInfoLED.cpp:52-80`, port from `/etc/rfd.port` :169).
- `Info::readConfig()` reads `/etc/config/hss_led_info.conf` (`Info.cpp:29`) for IgnoreServiceMessages / IgnoreAlarmMessages.
- `UpdateAvailable.cpp:88-95`: `system("wget -T 3 -q -O /tmp/avilableversion.html \"http://update.homematic.com/firmware/download?cmd=check_version&serial=...")` with serial from `/var/ids` (:48); only compiled into the non-CCU3 branch of `InfoLed`.
- `StatusCommand.h`: `runStatusCommand` uses `posix_spawn` with an empty signal mask instead of `system()` (documented rationale in header).
- Legacy `led.cpp` (sysfs `/sys/class/leds/` :31) kept for non-CCU3 builds.

### bcm2835_raw_uart (kernel module)

**Location**: `src/bcm2835_raw_uart/bcm2835_raw_uart.c` (1318 lines), `bcm2835-raw-uart.dts`, `bcm2835_raw_uart.mk`, `Config.in`, `Dual_Protocol_Linux_Drivers.pdf` (vendor doc, 4471 lines of PDF)

- Raw character-device driver for the Raspberry Pi PL011 UART used by the RPI-RF-MOD (HM/HmIP dual protocol). Exposes `/dev/raw-uart` (`DRVNAME` :82, `device_create` in `probe` :1072+), `cdev` with `read/write/open/release/poll/unlocked_ioctl` (`m_bcm2835_raw_uart_fops` :179-190), `/proc/raw-uart` stats (:1032-1057, `PROC_DEBUG`).
- Constants: 115200 baud, `CIRCBUF_SIZE 1024`, `CON_DATA_TX_BUF_SIZE 4096`, `MAX_CONNECTIONS 3`, `TX_CHUNK_SIZE 11`, `UART0_CLK_RATE 48000000` (:83-91). Module params `uart0_base` (default 0x3f201000, Pi2/3) and `uart0_irq` (87) (:70-76). Platform driver name `bcm2835-raw-uart`, DT compatible `brcm,bcm2835-raw-uart` (:1306-1311); overlay `bcm2835-raw-uart.dts` retargets `uart0` (`.dts:5-9`); `.mk` compiles it to `.dtbo` and installs to `BINARIES_DIR` (`.mk:17-28`).
- Priority arbitration: each open connection has a `priority` (ioctls `IOCTL_IOCSPRIORITY`/`IOCGPRIORITY`, magic `'u'`, :88-93); `acquire_sender` (:758) lets a higher-priority writer take over TX from a lower one under `lock_tx` spinlock; `send_completed` (:793) tells the lower writer it was preempted. Emulates TTY ioctls (`TCGETS`, `TCSETS`, `FIONREAD`, flush, modem lines, :566-675).
- Structures: `bcm2835_raw_uart_port_s` (:132-158), `per_connection_data` (:160-166). IRQ handler `bcm2835_raw_uart_irq_handle` (:882), RX into circ buffer (:812-880), counters for brk/parity/frame/overrun (:152-158).
- Version `MODULE_VERSION("1.12")` (:1318) while `.mk` says `1.2` (`.mk:7`). Uses deprecated kernel API forms (`access_ok(VERIFY_WRITE, ...)` :526-532, `class_create(THIS_MODULE, ...)` :1128, `struct termios` in kernel) so it targets older kernels; `bcm2709_raw_uart_device` platform device registered when not DT-probed (:1213-1296). `probe` allocation of `rxbuf.buf` unchecked (:1155) and `open` ignores `kmalloc` failure (:373).

### eq3_char_loop (kernel modules)

**Location**: `src/eq3_char_loop/`

- `eq3_char_loop.c` (1157 lines, `MODULE_VERSION("1.6")` :1157): "eq3loop" loopback char driver pairing a *master* (multimacd) with up to `EQ3LOOP_NUMBER_OF_CHANNELS = 4` *slave* nodes (rfd, HMIPServer). Control node `/dev/eq3loop`; master opens it and issues `EQ3LOOP_IOCSCREATESLAVE` (`_IOW('L',1,uint32_t)`) with a name, which creates a slave device node (e.g. `mmd_bidcos`, `mmd_hmip`) via `eq3loop_create_slave_dev` (:867-961). `EQ3LOOP_IOCGEVENTS` returns bits `SLAVE_OPENED/SLAVE_CLOSED` (:52-57).
- Per-channel data `eq3loop_channel_data` (:72-90): two 1024-byte circular buffers (master->slave, slave->master), wait queues, semaphore, `generation` counter. Generation scheme (:121-125) hangs up stale slave connections after a master restart (comment :113-120); master close increments generation (:708+). Operations vtable per connection (`eq3loop_connection_data` :100-110: read/write/ioctl/close/poll).
- Slave side emulates TTY ioctls (`eq3loop_ioctl_slave` :521-653); unhandled ioctl logs at notice (:650). Kernel version shims for `access_ok` (<5.0, :66-70) and `class_create` (>=6.4, :1081-1086).
- `mxs_raw_auart.c` (1047 lines): equivalent raw UART driver for the legacy CCU2 Freescale i.MX28 AUART (`MXS_AUART_PORTS 5`, 115200 baud, `rxto` module param 31 bit-times :90-91), same priority/preemption model and ioctl magic (`MXS_AUART_IOCSPRIORITY` :61-62). Uses old APIs (`__devinit`, `__devexit_p`, `read_procmem`, `ioctl` with inode) so it only builds on the old CCU2 kernel. Latency analysis comment at :93-99.
- `test/eq3loop_restart_test.c` (151 lines): userspace regression test (not wired into CMake) simulating a multimacd restart; uses `/dev/eq3loop`, slave `mmd_test`, macro `CHECK` printing PASS/FAIL. Warning in header: unpatched driver leaves an unkillable spinning process.
- `Makefile` is a single line `obj-m += eq3_char_loop.o` (mxs driver not included).

### libelvutils (shared library `libelvutils.so`)

**Location**: `src/libelvutils/` (CMake `CMakeLists.txt:1-28`, links `crypto`, `-fPIC`). Headers are used via `-I src/libelvutils` throughout.

| Class / file | Role |
|---|---|
| `Logger` (`Logger.h:~22-58`, `Logger.cpp`) | Singleton logger via `Logger::s_logger`, macro `#define logger Logger::s_logger` (`Logger.h:48`); `LOG(level, fmt, ...)` macro, optional `LOGGING_REALM`; levels `LOG_ALL..LOG_FATAL_ERROR`; 1024-byte buffer guarded by a pthread mutex (`Logger.cpp:44-58`). Subclasses `ConsoleLogger`, `FileLogger`, `SyslogLogger` (`openlog(id,0,LOG_USER)`, `SyslogLogger.cpp:29`). |
| `Actor` / `ActorMessage` (`Actor.h`) | Actor-model helper: own pthread, message list protected by mutex + condvar, `operator<<` enqueues a `Clone()` of the message, subclass overrides `Handle(list<ActorMessage*>)` (`Actor.cpp:19-136`). |
| `TimerQueue` / `TimerTarget` | Monotonic-clock timer queue (`CLOCK_MONOTONIC`, `TimerQueue.cpp:24,34,76`), `RequestTimer(timeout, cookie)`, `OnTimer(cookie)` pure virtual; global `TimerTarget::s_timerQueue`; `BackwarpAdjust` for clock steps (:99). Used by rfd/hs485d device state machines (consumers not analyzed). |
| `PropertyMap` | INI-like sections `[Section]`/`key=value` store with dirty flag, `ReadFromFile/WriteToFile`, int/float/binary(hex) getters (`PropertyMap.h`, `.cpp:100-206`); used for `hs485d.conf` etc. |
| `md5` | OpenSSL EVP wrapper (`md5.cpp:10-55`), `MD5String`, `MD5File`. |
| `Crc16`, `Hexfile`, `UpdateFile` | CRC16 (poly 0x8005, init 0xffff), Intel-hex reader, firmware update frame splitter (`UpdateFile.h`). |
| `MulticastSender` | UDP multicast/broadcast request with response collection (`MulticastSender.h:11-30`). |
| `OSCompat` | `DirectoryLister`, `FixPath`, `MakeDirectory`, `RaiseThreadPriority` (`OSCompatLinux.cpp`; `OSCompatWin32.cpp` not built). |
| `TimeZoneInfo` | local UTC offset and next DST change calculation (`TimeZoneInfo.h`). |
| `utils` | `time_millis`, `StrToInt/Bool/Double`, `SplitString`, `string_trim`, `number_running_processes`. |
| `PThreadCondition`, `LocalPointerGuard<T>`, `Timestamp`, `unsigned_char_traits` | small helpers. |

Windows leftovers: `dllexport.h`, `OSCompatWin32.cpp`, `TimestampWin32.cpp` (not in CMake).

### libxmlparser (shared library `libxmlparser.so`)

**Location**: `src/libxmlparser/xmlParser.cpp` (2219 lines), `xmlParser.h` (292)

- Third-party "Frank Vanden Berghen" XML parser V1.14, modified by eQ-3 2006-2007 (`xmlParser.cpp:1-12`), LGPL 2.1. Reference-counted `XMLNode` with shallow copy (`xmlParser.h:139-160`), API `parseString/parseFile/openFileHelper` (:171-173), `getChildNode`, `getAttribute`, `getText`, `createXMLString`, node creation helpers. `openFileHelper` terminates the process on parse error (header note :177). Consumers include `rfd`, `hs485d`, `hss_led`, `hs485dLoader`, `SetInterfaceClock` (grep of `XMLNode::`). Two `.vcproj` Visual Studio files are unused leftovers.

### libUnifiedLanComm (shared library)

**Location**: `src/libUnifiedLanComm/` (public headers `include/`, private `src/`)

- `ulc::UnifiedLanCommController` (`include/UnifiedLanCommController.h`): client for the HomeMatic LAN gateway "unified LAN protocol" over TCP. Handshake state machine `NOT_CONNECTED -> CONNECTED -> RECEIVED_HELLO -> RECEIVED_IV -> RECEIVED_SWITCHING_PROTOCOL -> READY` (header :53-60). `connect()` (`UnifiedLanCommController.cpp:89`) waits up to ~2 s for READY (`waitForState` :172-179, polling with `usleep(timeoutMillis*100)` x10). A receive thread (:184-256) dispatches `H`ello (`handleHelloMessage` :278, optional desired-serial check, case-insensitive match with warning), `V` init-vector (`:320`: derives AES via `ldu::TCPEncryption::init(key, ivLGW, ivOwn)`, sends own IV), `S` switch-protocol (`:367`: answers `>` with `0000`, state READY).
- Errors: enum `ConnectError NOT_CONNECTED`, `ConnectError  NO_CONNECT_ERROR`, `ConnectError  CONNECT_FAILED`, `ConnectError  WRONG_KEY`, `ConnectError  UNKNOWN_INITIALIZATION_ERROR`.
- `LanConnection` (`LanConnection.cpp`): blocking TCP socket wrapper (`socket/connect` :100-106, `select`-based `waitForData` :269, `MSG_NOSIGNAL`), 4096-byte receive buffer, listener callback `onDisconnect`.
- `UnifiedLanProtocolMessage`: hex-encoded frame with command char, counter and parameters terminated by CRLF (`UnifiedLanProtocolMessage.h:12-88`). `UnifiedLanProtocolTypeConverter`, `CommonConversion`: hex/binary helpers.
- Test sources under `test/src` (`TestSuiteUnifiedLanComm.cpp` etc., header-only test cases) and `test/runTestUnifiedLanComm.sh`; not referenced from CMake (CMakeLists builds only the library).
- Security/debt: `createIV()` (:464-483) generates the IV with `srand(time*3/2)` + `rand()` (predictable); `handleSetInitVectorMessage` logs `LOG_FATAL_ERROR` when no key is configured but continues (:327-329 region); commented-out hard-coded test key `BF27AEB3...` at :324-327; `pthread_mutex_t` casts from non-const (`(pthread_mutex_t*)&pRxTxMutex`).

### libLanDeviceUtils (shared library)

**Location**: `src/libLanDeviceUtils/` (public `include/`, private `src/`; 17 .cpp). Only headers and the file inventory were read; `.cpp` bodies not analyzed.

- `LDU::LanDeviceUtils` (`include/LanDeviceUtils.h`): high-level API: `searchDevicesByType`, `searchDeviceBySerial`, `searchDeviceByTypeAndSerial`, `readRuntimeNetworkConfiguration`, `readNetworkConfiguration`, `writeNetworkConfiguration`, `readTestStatus/writeTestStatus`, `rebootDevice`, `resetDevice`, `sendUserData`, `enterBootloader/enterApplication`, `keyExchange`, `doFirmwareUpdate`, `getLastResponse`.
- `LDU::LanDevice` (`include/LanDevice.h`): serial, type, firmware version, service protocols (id/port), protocol, IP/runtime/test configs, `Status ERROR`, `Status  UNKNOWN`, `Status  OFFLINE`, `Status  ONLINE`, `Status  BOOTLOADER`, `Status  REBOOT`, AES key/IV (16 bytes) and `encryptMessage(opcode, data, len)`.
- Protocol abstraction `LDU::Protocol` (`src/Protocol.h`) with two implementations: `EQ3ConfigProtocol` (the same frame format served by `eq3configd`, default port per `getProtocolDefaultPort`, static packet counter + sender-id bytes) and `LanifCfgProtocol` (LAN-interface config protocol); `ProtocolEnum UNKNOWN`, `ProtocolEnum  EQ3LANIFCFG=1`, `ProtocolEnum  EQ3CONFIG=2` and `RoutingSchemeEnum UNICAST=1`, `RoutingSchemeEnum  MULTICAST=2`, `RoutingSchemeEnum  BROADCAST=4` (`LanDeviceUtilsTypes.h`). Multicast address 224.0.0.1 and broadcast 255.255.255.255 (`Constants.h`).
- Transport `UDPDatagramSender` (`src/UDPDatagramSender.h`, 391 lines in .cpp): per-call send + receiver thread collecting up to `maxResponseCount` replies within a timeout.
- Utility command classes: `UtilitySearchDevices`, `UtilitySendCommand`, `UtilityNetworkConfiguration`, `UtilityDeviceConfiguration`, `UtilityFirmwareUpdate`, plus data classes `IPConfiguration`, `RuntimeIPConfiguration`, `TestStatusConfiguration`, `NetworkInterfaceHelper`.
- `ldu::TCPEncryption` (`include/TCPEncryption.h`): AES-CBC stream with separate encrypt/decrypt `EVP_CIPHER_CTX` and distinct IVs, copyable (`copy`); used by `libUnifiedLanComm`.

### NOT ANALYZED: rfd, hs485d, multimacd, libhsscomm, libeq3config, libXmlRpc

Facts known only from analysed code and file counts:

- `rfd` (135 files, ~29.8k LOC): BidCoS-RF daemon. XML-RPC server default port 2001 (`/etc/rfd.port`, `SetInterfaceClock.cpp:37-39`), config `/etc/config/rfd.conf` (`hss_led/RFLGWInfoLED.cpp:92`), method `setInterfaceClock`, `setRFLGWInfoLED` called by clients. Uses `RFManager`, `RFDevice`, `RFReplaceMap`, `RFSystemDescription` with `XMLNode` (grep).
- `hs485d` (68 files, ~11.2k LOC): BidCoS-Wired daemon for HMW LAN gateway; started by `hs485dLoader` as `/bin/hs485d -l <lvl> -g -i <id> -f <conf>` (`hs485dLoader.cpp:141`), XML-RPC port `/etc/hs485d.port` default 2000; uses `HS485Device`, `HS485Manager`, `HS485SystemDescription`.
- `multimacd` (200 files, ~15.6k LOC): multiplexes the radio module UART to rfd/HMIPServer via `/dev/eq3loop` slave nodes (`mmd_bidcos`, `mmd_hmip`; from `eq3_char_loop.c` master/slave design and `etc/config_templates/crRFD.conf` `/dev/mmd_hmip`).
- `libXmlRpc` (29 files): XML-RPC client/server (`XmlRpc.h`, `XmlRpcClient`, `XmlRpcValue`, used with `execute()` and `isFault()` in `SetInterfaceClock.cpp:50-62`); `xmlrpc_bin://` binary variant referenced in `hs485dLoader.cpp:238`.
- `libhsscomm` (115 files): linked by `SetInterfaceClock` (`CMakeLists.txt:11`); contents unknown.
- `libeq3config` (69 files, includes `netconfigcmd/` with its own copy of `networkconfig.cpp`, referenced as `src/libeq3config/netconfigcmd/src/networkconfig.cpp:17` in `.migration/docs/modules/etc.md`): provides `CommandManager`/`Command` used by `eq3configcmd`.

---

## Dependencies

### Internal module graph (from `target_link_libraries`, analysed targets)

- `SetInterfaceClock` -> `XmlRpc`, `hsscomm`, `xmlparser`, `elvutils`
- `eq3configcmd` -> `eq3config`
- `crypttool`, `eq3configd` -> `elvutils`, OpenSSL `crypto`
- `hs485dLoader` -> `elvutils`, `xmlparser`
- `hss_led` -> `XmlRpc`, `elvutils`, `xmlparser`, `pthread` (status build); only `pthread` (recovery build)
- `ssdpd` -> `pthread` only
- `UnifiedLanComm` -> `LanDeviceUtils`, `elvutils`
- `LanDeviceUtils` -> `elvutils`, `crypto`
- `elvutils` -> `crypto`; `xmlparser` -> none

### External

- OpenSSL libcrypto (EVP MD5, AES-128-CBC) in `libelvutils/md5.cpp`, `crypttool`, `eq3configd`, `TCPEncryption`.
- Linux kernel headers for the two driver trees; Buildroot external tree `BR2_EXTERNAL_EQ3_PATH` and `host-dtc` (`bcm2835_raw_uart.mk:10,13`).
- External services: `update.homematic.com` (HTTP firmware check, `hss_led/UpdateAvailable.cpp:88`).

## Data Models / Wire Formats

- **eq3configd UDP frame** (`udpframe.cpp:13-60`, `main.cpp:56-58`): `[version][senderid(3) if version>1][counter]<devtype>\0<serial>\0<opcode><payload>`; encrypted wrapper payload: 16 random bytes + `"eQ-3__UDP-Crypt"` + opcode + payload.
- **netconfig file** `/etc/config/netconfig`: `KEY=VALUE` lines (`networkconfig.cpp:20-32`).
- **crypttool.cfg**: `<index> <md5hex>` lines (`crypttoolconfig.cpp:30-56`).
- **hss_led control protocol**: see hss_led section; **status UDP**: `SENDER\nKEY=VAL` on `127.0.0.1:8182`.
- **Unified LAN protocol**: hex string, command byte `H|S|V|>`, counter byte, parameters, CRLF (`UnifiedLanProtocolMessage.h:12-30`).
- **InterfacesList.xml**: `<interfaces><ipc><name/><url/><info/></ipc>...` (edited textually by hs485dLoader).

## Security

- Key handling is weak by design: default key `"Markus is awesome"` in `crypttool.cpp:26` and `eq3configd/main.cpp:50`; keys stored as MD5 hex in `/etc/config/crypttool.cfg` (world-readable status unknown); AES-CBC with static all-zero IV in `crypttool` signing (`crypttool.cpp:178-179`) and IV `0..15` initially in `eq3configd` (`main.cpp:229-234`).
- `crypttool` accepts the key on the command line (`-k`), visible in process lists, and logs keys at debug level (`crypttool.cpp:61,96,105`).
- `eq3configd` runs `system("/etc/init.d/S40network restart")` after config change (:449); payload parsing from unauthenticated UDP (see eq3configd notes).
- `hss_led` hardened relative to the legacy code: SO_PEERCRED, `O_NOFOLLOW`, message length cap 512 bytes (`LedController.cpp:~418`), 0600 state file, `posix_spawn` with clean signal mask.
- `libUnifiedLanComm` weak IV generation (see above).
- Kernel drivers: `kmalloc` result not checked in `bcm2835_raw_uart_open` (:373), user pointers validated with `access_ok` + `__get_user/__put_user`.

## Concurrency

- `libelvutils::Actor`: one pthread per actor, mutex + condvar (`Actor.h:36-41`). `Logger` serialises with a mutex. `TimerQueue` is a single global queue (`TimerTarget::s_timerQueue`) with no locking visible in the header (callers must serialise).
- `UnifiedLanCommController`: receive thread + `pRxTxMutex` + `connectionMutex`; state variable is `volatile` (not atomic) (`UnifiedLanCommController.h`).
- `UDPDatagramSender`: per-request receiver thread (`ReceiverThreadInfo`).
- `hss_led`: one controller thread (signalfd/timerfd) + one detached status thread; shared via mutex-protected mailbox and `std::atomic<bool> statusEnabled` (`LedController.cpp:30,84-100`). Exits with `std::_Exit` to avoid destructing globals under the status thread (`hss_led.cpp` main end).
- Kernel drivers: `spinlock_t lock_tx` + semaphores + wait queues (`bcm2835_raw_uart.c:132-147`); `eq3loop` per-channel semaphore + generation counter with `READ_ONCE`/`smp_mb` (`eq3_char_loop.c:121-125,950`).

## Events and Messaging / IPC

- XML-RPC: `setInterfaceClock`, `setRFLGWInfoLED` (clients: SetInterfaceClock, hss_led) to `rfd`.
- UDP: eq3configd on 43439; SSDP on 239.255.255.250:1900; hss_led status listener on 127.0.0.1:8182 (producers `RFD POWER LIGHTTPD HS485D REGAHSS HMIP`).
- UNIX SEQPACKET `/run/hss_led/control`.
- Char devices: `/dev/raw-uart`, `/dev/eq3loop`, `/dev/mmd_*`, `/proc/raw-uart`.
- Files as status flags: `/var/status/startupFinished`, `/var/status/hssLedReady`, `/var/status/hasLink`, `/var/status/hasIP`, `/var/status/hasInternet`, `/etc/config/disableLED`, pid files `/var/run/eq3configd.pid`, `/var/run/ReGaHss.pid`, `/var/run/ssdpd.pid`, `/var/run/HMIPServer.pid`, `/var/run/multimacd.pid`, `/var/run/rfd.pid`, `/var/run/hs485dLoader.pid`.

## Configuration

- `/etc/config/netconfig`, `/etc/config/crypttool.cfg`, `/etc/config/InterfacesList.xml`, `/etc/config/hss_led_info.conf`, `/etc/config/rfd.conf`, `/etc/rfd.port` (default 2001), `/etc/hs485d.port` (default 2000), `/VERSION` (or `/boot/VERSION`), `/var/board_sgtin`, `/var/board_serial`, `/var/ids`.
- CMake: `HSS_LED_STATUS_MONITOR` (ON), `HSS_LED_BUILD_TESTS` (OFF), compile definition `PLATFORM_CCU3` for `hss_led` (`CMakeLists.txt:24`).
- Kernel module parameters: `uart0_base`, `uart0_irq` (bcm2835), `rxto` (mxs).

## Testing

- `src/hss_led/tests/LedControllerTest.cpp` (+ `StatusProducer.cpp`): ctest `hss_led_state` when `HSS_LED_BUILD_TESTS=ON` (`CMakeLists.txt:40-47`).
- `src/libUnifiedLanComm/test/` header-style tests and shell runner, not built by CMake.
- `src/eq3_char_loop/test/eq3loop_restart_test.c`: manual root-only kernel test.
- No tests found in the other analysed directories (rfd/hs485d/multimacd test dirs not inspected).

## Technical Debt

- Dead / non-building artefacts: `#if 0` blocks in `ssdpd.cpp:45-176`; Windows/VS files in `libelvutils` and `libxmlparser`; Code::Blocks files in `eq3configd`; PDF duplicated in `bcm2835_raw_uart/` and `eq3_char_loop/`.
- Stubbed feature: `crypttool` encrypt/decrypt not implemented (`crypttool.cpp:94-101`).
- Documentation mismatch: `hs485dLoader` `-ilf` vs `-ilp` (:332 vs :84); bcm2835 version 1.12 vs 1.2.
- Latent bugs: `find_last_of("</interfaces>")` (`hs485dLoader.cpp:236`); `(int)time(NULL)` truncation (`SetInterfaceClock.cpp:58`); unchecked `EVP_*` return values (`crypttool.cpp:187-199`, `eq3configd/main.cpp:334-336`); `LOG` format using `%d` for `time_t` (`SetInterfaceClock.cpp:64`).
- Boilerplate TODO stubs in `hss_led/UdpCannel.cpp`, `MessageParser.cpp` ("TODO Automatisch generierter Konstruktorstub").
- Duplicate code: `networkconfig.cpp` exists in both `eq3configd/src` and `libeq3config/netconfigcmd/src`; `trim`/`readPortFromFile` duplicated in `SetInterfaceClock` and `hs485dLoader`; `defaultKey` constant duplicated.
- Mixed German/English comments and ISO-8859 encoded source (replacement characters in `SetInterfaceClock.cpp:9`, `crypttool.cpp:9`).
- Kernel code written against old APIs (see bcm2835/mxs sections) with version shims only in `eq3_char_loop.c`.
- Not covered: debt in `rfd`, `hs485d`, `multimacd`, `libhsscomm`, `libeq3config`, `libXmlRpc`.

<!-- from _parts/src-part-1b.md -->
# Module: src (part 1b) - rfd (BidCoS-RF daemon) and multimacd (radio-module multiplexer)

> Scope: `src/rfd` (135 files, ~29.8k LOC incl. headers) and `src/multimacd` (200 files, ~15.6k LOC). This file supplements `.migration/docs/modules/_parts/src-part-1.md`, where both were listed as "NOT ANALYZED".
>
> Analysis depth (budgeted run of ~25 tool calls, grep-first):
> - **Read in detail**: `src/rfd/rfd.cpp` (main loop, config, startup), `src/rfd/CMakeLists.txt`, `src/multimacd/CMakeLists.txt`, `src/multimacd/multimacd.cpp`, `src/multimacd/MultimacManager.cpp`, `src/multimacd/UpstreamCharConnection.cpp` (setup/poll loop), `src/multimacd/SubsystemManager.cpp` (dispatch loop).
> - **Sampled by grep only**: `rfd/XmlRpcMethods.cpp` (method list), `rfd/RFController.cpp` (`Init`), `rfd/BidcosInterface.cpp` (type factory), `rfd/RFManager.*` (config keys, AES key persistence), `rfd/hm2/*` (thread/mutex declarations), `multimacd/MacController.*`, `BidcosMacController.h`, `SubsystemBidcos.h`, `SerialFrame/SerialFrame.*`.
> - **NOT analyzed**: bodies of `RFDevice`, `RFChannel`, `RFParamset`, `RFConfigData`, `RFDeviceDescription` (XML device-description model); `BidcosFrame*` decoding; `JSONObject`; `RFFirmwareManager`; `hm2/LGWPortWrapper` protocol; `hid*`/`BidcosUsb*` (not built unless `HAS_USB_SUPPORT`); `multimacd/BidcosMacController.cpp` (1366 lines), `SubsystemHmIp.cpp`, `FastMacResponder`, `MultithreadTest`, `tinythread`, the ~100 per-command frame classes under `SerialFrame/`.

## Overview

- **Purpose**
  - `rfd` is the HomeMatic BidCoS-RF central daemon. It serves an XML-RPC interface (default TCP port 2001) to clients such as ReGaHss. It manages paired RF devices, their paramsets, links, teams and AES keys, and talks to one or more BidCoS interfaces: the built-in radio module, LAN gateways, USB interfaces, and the CCU2-style coprocessor.
  - `multimacd` is a "multi MAC" daemon. It owns the radio coprocessor serial port exclusively and multiplexes it to two consumers: the legacy BidCoS stack (`rfd`) and the HmIP stack (`crRFD`/HMIPServer). It does this via the `eq3_char_loop` kernel driver. It also runs the BidCoS MAC layer itself (AES challenge/ack, TX queue, peer table) so the radio can answer inside timing limits.
- **Technology**: C++11 (`cxx_std_11`, `src/rfd/CMakeLists.txt:79`, `src/multimacd/CMakeLists.txt:24`), `-Wall`, definitions `_TIME_BITS=64 _FILE_OFFSET_BITS=64`. `rfd` additionally defines `PRODUCTION=1`.
- **Origin / portability**: both trees still carry Windows code (`win32_service.*`, `hid/*` Windows HID headers, `CCU2SerialPortWrapperWin32.*`, `rfd-nmake.mk`). `#ifdef WIN32` branches are pervasive in `rfd.cpp` and `multimacd/*.cpp`. None of this is built by CMake.
- **Version**: `version.sh` in each tree echoes `MAJOR.MINOR.PATCH`. rfd = `2.6.2` (`src/rfd/version.sh:3-5`), multimacd = `2.6.2` (`src/multimacd/version.sh`). CMake turns it into `generated-rfd-version.h` / `generated-multimacd-version.h` (macro `RFD_VERSION` / `MULTIMACD_VERSION`) using `cmake/WriteVersionHeader.cmake` (`rfd/CMakeLists.txt:1-15`, `multimacd/CMakeLists.txt:5-17`).
- **License headers**: eQ-3 AG "HMSL 2" (`src/multimacd/Enums.h:1-7`).
- **Language mix**: German and English comments, ISO-8859-1 encoded German comments (`rfd.cpp:75` shows replacement characters).

## Executables (entry points)

| Binary | Source | Entry | Role |
|---|---|---|---|
| `rfd` | `src/rfd/rfd.cpp` | `main()` `rfd.cpp:177` | BidCoS-RF daemon; XML-RPC server; staged to `bin` (`rfd/CMakeLists.txt:138` `openccu_stage_target(rfd bin)`) |
| `multimacd` | `src/multimacd/multimacd.cpp` | `main()` `multimacd.cpp:158` | Radio coprocessor multiplexer; staged to `bin` (`multimacd/CMakeLists.txt:28`) |

CLI options:

- `rfd` (`rfd.cpp:130-150, 200-235`):
  - `-f <config>`: alternate config file.
  - `-l <loglevel>`: log level.
  - `-c`: log to console.
  - `-s [addr...]`: sniffing mode with an optional address filter. This uses `RFLoggingManager`.
  - `-e <event>`: Windows startup event.
  - `-i` / `-u`: Windows service install/uninstall.
  - `-d`: daemonize.
- `multimacd` (`multimacd.cpp:91-96, 170-184`): `-f <config>`, `-c` (console log), `-l <loglevel>`, `-p <devnode>` (overrides `Coprocessor Device Path`), `-d` (daemonize).

## Components

### rfd - startup and main loop (`src/rfd/rfd.cpp`)

- **Constants and globals**
  - the PIDFILE variable (value: the rfd pid file under /var), `UDS_PATH=/var/socket_rfd` (`rfd.cpp:13-14`). Both are defined but appear unused in the paths read; the real values come from config keys `PID File` and `UDS File` (`rfd.cpp:268, ~335`).
  - Global `XmlRpcServer s` (TCP) and `XmlRpcServerProxy serverProxy(&s)` (Unix domain socket) (`rfd.cpp:64-68`).
- **Config defaults** (`rfd.cpp:106-115`): `Listen Port=2001`, `Log Level=3`, `Log Identifier=bidcos`, `Persist Keys=0`, `Log Destination=Syslog`.
- **Config search order** (`rfd.cpp:121-126`): `/etc/bidcos/bidcos.conf`, then `/etc/config/rfd.conf`; or the `-f` file.
- **Startup sequence** (`rfd.cpp:177-370`)
  1. `signal(SIGCHLD, SIG_IGN)` (:194).
  2. Parse CLI.
  3. Read config and fill defaults.
  4. Optionally write the `PID File`.
  5. `daemon(0,0)` if `-d` or `Daemonize` is set.
  6. Set up the logger: Console, Syslog, File or None.
  7. `InitXmlRpcMethods(s)` (:335).
  8. `s.bindAndListen(Listen IP, Listen Port, BACKLOG)` (:338-345). The bind address is `Listen IP`, with default `DEFAULT_LISTEN_IP=""` (`rfd.cpp:19`). A bind failure logs an error and calls `exit(0)`.
  9. If `UDS File` is set, `serverProxy.bindAndListen(path, 100)` (:352).
  10. `s.enableIntrospection(true)`.
  11. Create `RFManager`, or `RFLoggingManager` in sniffing mode, and call `mgr->Init(config_filename)`. On failure the process exits with status 0.
  12. `s.getDispatcher()->addSource(mgr->GetInterfaceConcentrator(), ReadableEvent)` (:383).
  13. `writeInitDoneFile` (:157-170) writes the PID into `<StatusfileDir default /var/status/>/...` as a startup-complete marker.
- **Main loop** (`rfd.cpp:~395-405`): single-threaded reactor. It runs the global `TimerTarget::s_timerQueue` until nothing is due, then calls `s.work(timeout)` (the XmlRpc dispatcher/select loop). The `run` flag is cleared by the XML-RPC method `exit` (`XmlRpcMethodExit`, `rfd.cpp:78-89`).
- **Note**: all error exits use `exit(0)`, so a failed init looks like success to a supervisor (`rfd.cpp:342-345, 376-379`).

### rfd - core classes (inventory; bodies mostly not read)

| Class / file | Lines | Role (from names, headers, grep) |
|---|---|---|
| `RFManager` (`RFManager.cpp` 1583) | large | Central brain: `HSSManager` + `TimerTarget` (`RFManager.h:45`). Holds the system description, device and address maps, teams, install mode, AES key DB, links and metadata. `Init(configfile)` reads `Persist Keys` (:206), `Firmware Dir`/`User Firmware Dir` (:205), `Device Description Dir` (:266), device files dir (:827, `Device Files Dir`), key file (`Key File`, :1092) and address file (`Address File`, :1225-1243). |
| `RFLoggingManager` | small | Sniffer subclass that only logs telegrams (`-s` / `Sniffing Mode`). |
| `BidcosInterfaceConcentrator` (1077) | | An `XmlRpcSource`, so it is registered directly in the XML-RPC dispatcher (`rfd.cpp:383`). Aggregates all `BidcosInterface` instances, de-duplicates frames received on several interfaces, tracks per-device data (`DeviceData`, `BidcosInterfaceConcentrator.h:207`), and handles AES challenge/solution routing (:243-267) and firmware-update frames (:512, :566). |
| `BidcosInterface` (factory `CreateFromType`, `BidcosInterface.cpp:23-30`) | | Abstract interface. Types: `CCU` -> `RFController`; `Lan Interface` -> `BidcosLanInterface`; `USB Interface` -> `BidcosUsbInterface` (only `#ifdef HAS_USB_SUPPORT`); `CCU2` -> `HM2::CCU2BidcosRemoteInterface`. |
| `RFController` | 485 | Built-in radio module interface. `CCU_RFD_DEVICE="/dev/hss_rf"` (`RFController.cpp:29`). `Init()` (:436-478) chooses `Port Type`: `TCP` (needs `Host` and `Port`, `SocketPortWrapper`) or `CCU`/empty (`UnixSerialPortWrapper` on `/dev/hss_rf`). Reads the serial number from the `Address File` key `SerialNumber`, default `"CCU"` (:436). |
| `BidcosLanInterface` / `BidcosLanConnection` (423) | | LAN gateway connection. Mutexes `mutex_socket`, `mutex_remote_address`, `mutex_send` (`BidcosLanConnection.h:80-84`). Uses `libLanDeviceUtils` / `libUnifiedLanComm`, linked in `rfd/CMakeLists.txt:~137`. |
| `hm2/CCU2*` | | CCU2 coprocessor link. `CCU2CommController` (pthread receive thread plus startCoprocessorApp thread; separate mutex and condvar per class of request: system, bidcos, bidcos-telegram; `CCU2CommController.h:153-196`). Subclasses `CCU2SerialPortCommController` (serial / `/dev/mmd_bidcos` path, see `CCU2SerialPortWrapperLinux.cpp:95,164`) and `CCU2LGWCommController` (LAN gateway, `LGWPortWrapper` with async reconnect and `mutexReconnect`, `LGWPortWrapper.cpp:52-64,200-300`). Writes status files under `/var/status/` (`CCU2LGWCommController.cpp:48`, `LGWPortWrapper.cpp:794`). |
| `BidcosRemoteInterface` | 762 | Base class for remote interfaces (also reached via `CCU2BidcosRemoteInterface`, which pushes device/AES-policy changes to the coprocessor: `AddDeviceRemote`, `SetDeviceAesPolicy`, `AddDeviceWakeupRequest`). |
| `RFDevice` (1876), `RFChannel` (1870), `RFParamset`, `RFConfigData`, `RFDeviceDescription`, `RFChannelDescription`, `RFSystemDescription`, `RFReplaceMap`, `RFTeam`, `RFCentral`, `RFMaintenanceChannel`, `RFLogicalInstance` | | Domain model of HomeMatic devices. Device and paramset descriptions are XML (`XMLNode` from `libxmlparser`; `RFConfigData::SaveToXml`, `RFConfigData.cpp:330,409`). `RFCentral` reads `/etc/config/central_peers` (`RFCentral.cpp:223`). |
| `RFFirmwareManager` | 300 | OTAU firmware handling; user firmware path default `/etc/config/firmware/` (`RFFirmwareManager.cpp:22`). |
| `RFPhysicalDataInterface*` (Command, CentralCommand, Config, ConfigString, Store, MultiframeCommand) | | Abstraction of how a parameter is read or written physically via frames. |
| `BidcosFrame*`, `RFCommMessage*`, `BidcosInterfaceMessage` | | BidCoS frame model, decoder (`BidcosFrameDecoder.cpp` 497) and message encode/decode, including AES key messages. |
| `JSONObject` (354) | | Small hand-written JSON helper. Its consumer was not examined. |
| `hid_linux/*`, `BidcosUsb*` | | USB HID access for the USB interface. Compiled only when `HAS_USB_SUPPORT` is on and libusb-1.0 is found (`rfd/CMakeLists.txt:74-80, 98-135`). The `hid/` directory holds Windows-only headers. |

### rfd - XML-RPC server API (`src/rfd/XmlRpcMethods.cpp`, 1275 lines)

One class per method, each derived from `XmlRpcServerMethod`. Registered by `InitXmlRpcMethods(s)`. Methods found (class declaration lines):

- **Device and paramset**
  - `listDevices` (:59), `listTeams` (:78), `getDeviceDescription` (:98)
  - `deleteDevice` (:124), `abortDeleteDevice` (:149)
  - `getParamsetDescription` (:172), `putParamset` (:198), `getParamset` (:228)
  - `determineParameter` (:262), `getParamsetId` (:690)
  - `getValue` (:285), `setValue` (:318), `reportValueUsage` (:718)
  - `addDevice` (:737), `replaceDevice` (:1106), `listReplaceableDevices` (:1139), `addVirtualDeviceInstance` (:1120), `setTeam` (:824)
- **Links**
  - `getLinkPeers` (:348), `getLinks` (:395), `addLink` (:417), `removeLink` (:490)
  - `setLinkInfo` (:444), `getLinkInfo` (:466), `activateLinkParamset` (:552)
- **Config cache**: `clearConfigCache` (:509), `restoreConfigToDevice` (:528)
- **Session and mode**: `init` (:581), `setInstallMode` (:602), `getInstallMode` (:648), `getKeyMismatchDevice` (:668), `logLevel` (:803), `ping` (:1206), `getVersion` (:1064)
- **Keys**: `changeKey` (:765), `setTempKey` (:784)
- **Interfaces**: `rssiInfo` (:846), `setBidcosInterface` (:869), `listBidcosInterfaces` (:895), `getServiceMessages` (:921)
- **Metadata**: `getMetadata` (:943), `setMetadata` (:968), `getAllMetadata` (:991), `getVolatileMetadata` (:1004), `hasVolatileMetadata` (:1019), `setVolatileMetadata` (:1033), `deleteVolatileMetadata` (:1049)
- **Clock and LED**: `setInterfaceClock` (:1075), `setRFLGWInfoLED` (:1171). Clients are `SetInterfaceClock` and `hss_led` (see part 1).
- **Firmware**: `updateFirmware` (:1092), `refreshDeployedDeviceFirmwareList` (:1190)
- **Debug and control**: `XmlRpcDebugMethod` (:29), `exit` (`rfd.cpp:78`)

### rfd - persistence and files

| Path | Source | Use |
|---|---|---|
| `/etc/config/rfd.conf`, `/etc/bidcos/bidcos.conf` | `rfd.cpp:121-126` | Config. |
| config key `Device Files Dir` | `RFManager.cpp:1284` | Persisted per-device XML (`RFDevice::Save()` / `RequestSave()`; loaded in `RFManager.cpp:827-832`). |
| config key `Key File` (when `Persist Keys=1`) | `RFManager.cpp:206, 1092, 1126` | AES key database with `Current Index` and `Last Index`. |
| config key `Address File` | `RFManager.cpp:1225-1243` | Persists the BidCoS address and `SerialNumber`. |
| `/etc/config/central_peers` | `RFCentral.cpp:223` | Central's peers. |
| `/etc/config/firmware/` | `RFFirmwareManager.cpp:22` | User firmware directory (config key `User Firmware Dir`). |
| `/var/status/` (key `StatusfileDir`) | `rfd.cpp:160` | Startup-complete marker containing the PID. |
| `/dev/hss_rf` | `RFController.cpp:29` | Radio module character device for the built-in interface. |
| `/var/rfd.pid`, `/var/socket_rfd` | `rfd.cpp:13-14` | Default constants; effective values are config keys `PID File` and `UDS File`. |

### rfd - config keys seen in code (`GetStringValue` / `GetIntValue`)

`Listen Port`, `Listen IP`, `UDS File`, `PID File`, `Daemonize`, `Log Level`, `Log Identifier`, `Log Destination`, `Log Filename`, `Sniffing Mode`, `Persist Keys`, `Key File`, `Address File`, `Device Files Dir`, `Device Description Dir`, `Firmware Dir`, `User Firmware Dir`, `StatusfileDir`, `Virtual RC`, `Improved Coprocessor Initialization`, `Fire NACK Error Events`, `Call UpdateDevice On OTAU Device Rebuild`. Per-interface section keys: `Type`, `Port Type`, `Host`, `Port`, `Serial Number`, `Description`, `IP Address`.

The repo's `src/rfd/rfd.conf` is a sample, not the device config. It sets `Listen Port=2001`, `Persist Keys=1`, and a single `[Interface 0]` of `Type = Lan Interface` with `Serial Number = REE0000001` and `IP Address = 192.168.1.195` (`rfd.conf:1-35`). The `[Interface 1]` `CCU Builtin/*` section is commented out. The runtime config is generated elsewhere (see `etc/` docs).

### multimacd - architecture (`src/multimacd`)

Pipeline wired in `MultimacManager::Run` (`MultimacManager.cpp:49-90`):

```
coprocessor serial port (/dev/mxs_auart_raw.0)
   ^ write fd (O_WRONLY)  <- MacController            (MacController.cpp:114)
   v read fd (O_RDWR)     -> FastMacResponder (thread, reads port, FastMacResponder.cpp:88,124)
        -> MacController::OnUpstreamFrame -> SubsystemManager (thread, SCHED_RR prio max-3)
              -> SubsystemBidcos  --UpstreamCharConnection--> /dev/eq3loop slave "mmd_bidcos" -> rfd
              -> SubsystemHmIp    --UpstreamCharConnection--> /dev/eq3loop slave "ttyS0"      -> HMIPServer (crRFD)
```

- **`multimacd.cpp`**
  - Config defaults (`multimacd.cpp:28-39`): `Coprocessor Device Path=/dev/mxs_auart_raw.0`, `Bidcos Exe Pattern=*/bin/rfd`, `Default Subsystem=HmIP`. The `Loop *` and `*Cmdline Pattern` defaults are commented out in code.
  - Default config file is `/etc/config/multimacd.conf` (`multimacd.cpp:43`).
  - Signal handlers for SIGTERM, SIGINT, SIGQUIT and SIGUSR1 call `MultimacManager::Instance().Exit()` (`multimacd.cpp:48-84`).
  - Optional `daemon(0,0)`.
  - `read_config` -> `setup_logging` (Console / Syslog / File / None) -> `MultimacManager::Instance().Run(config)`.
- **Sample config** `src/multimacd/multimacd.conf`: the key Coprocessor Device Path (value: the mxs_auart_raw.0 device node), `Log Level = 3`, `Log Identifier = multimac`, `Log Destination = Syslog`, `HmIP Cmdline Pattern = */crRFD*`, `Bidcos Cmdline Pattern = *rfd -c*`, `Transparent Cmdline Pattern = *update*`, `Bidcos Exe Pattern = */bin/rfd`, `Default Subsystem = HmIP`, `Loop Master Device = /dev/eq3loop`, `Loop Slave Device Bidcos = mmd_bidcos`, `Loop Slave Device HmIP = ttyS0`.
- **`MultimacManager`** (singleton, `Instance()` `MultimacManager.cpp:19`): `Run()` starts `FastMacResponder`, `MacController` and `SubsystemManager`. It then waits on a condvar, 1 s until `MacController::IsInitializationDone()` and 5 s afterwards (:70-85). At that point it writes the status file `multimacd.status` inside the configured StatusfileDir (default /var/status/) containing the PID (`writeInitDoneFile`, :99-122). `Exit()` flips `_run` and notifies. The empty `Coprocessor Device Path` makes `Run` return false and `main` ends silently.
- **`SubsystemManager`**
  - Registers `SubsystemBidcos` and `SubsystemHmIp` (`SubsystemManager.cpp:23-24`). `MacSubsystemType` in `Enums.h:11-18` also lists `Bootloader` and `Transparent`. `SubsystemTransparent.h` exists, but no registration of it was found.
  - Own thread: `Sysutils::ThreadSetSchedulingPriority(3)` sets `SCHED_RR` at max-3 (`SubsystemManager.cpp:118`, `Sysutils.cpp:52-57`). It pops upstream frames from `_incomingQueue` (5 s timeout) and offers each frame to the subsystems in turn. `Internal`-type frames are cloned to every subsystem.
  - Unhandled non-internal frames are logged as "Upstream frame not handled by any subsystem" and deleted.
- **`Subsystem`** (base): one `tthread::thread` per subsystem with mutex/condvar (`Subsystem.cpp:101-206`). On start, if `Loop Master Device` is configured it reads `"Loop Slave Device " + <name>` (names `Bidcos` / `HmIP`) and creates an `UpstreamCharConnection` (`Subsystem.cpp:90-96`).
- **`UpstreamCharConnection`** (`UpstreamCharConnection.cpp`)
  - Opens the master `/dev/eq3loop` with `O_RDWR|O_NONBLOCK` and issues `ioctl(EQ3LOOP_IOCSCREATESLAVE, slavedev)` to create the slave node (:84-100). It uses `EQ3LOOP_IOC_MAGIC 'L'`, `IOCSCREATESLAVE=_IOW('L',1,uint32_t)`, `IOCGEVENTS=_IOR('L',2,uint32_t)` (:33-36), which must match `src/eq3_char_loop/eq3_char_loop.c`.
  - Thread loop (:~135-235): `poll(POLLIN|POLLPRI|POLLERR|POLLHUP, 5000 ms)`. On POLLPRI/ERR/HUP it reads slave events via `IOCGEVENTS` and calls `Subsystem::UpstreamConnect` / `UpstreamDisconnect` when the slave node is opened or closed by the user process (rfd or crRFD). With the slave open, it reads frames from the master fd into a 1024-byte buffer and parses them.
  - Writes (`OnUpstreamFrame`, :104-130) are a blocking-style loop on the non-blocking fd. A short write is retried, and a zero write is logged as "buffer overflow". The frame is then deleted. `Stop()` kicks the thread with `pthread_kill(SIGUSR1)`.
- **`MacController`** (709 lines): coprocessor state machine `CoproState_Unknown`, `CoproState_ Identify`, `CoproState_ IdentifyLegacyBootloader`, `CoproState_ Bootloader`, `CoproState_ StartApplication`, `CoproState_ GetVersion`, `CoproState_ GetSgtin`, `CoproState_ GetSerialNumber`, `CoproState_ GetRfAddress`, `CoproState_ GetTimer`, `CoproState_ Application`, `CoproState_ WaitExit` (`MacController.h:39-52`). It detects bootloader or application, starts the application, and queries version, SGTIN, serial, RF address and timer. It tracks open request frames and matches responses (`MacController.cpp:159, 478`). `TrxSubsystemState` handles duty-cycle responses. `SendResult` is {Success, Failed, TryAgain}.
- **`FastMacResponder`**: a separate thread that reads the coprocessor port and forwards frames upstream. It exists so time-critical MAC replies are not delayed by the main controller (inferred from the structure; the logic was not read).
- **`SubsystemBidcos` + `BidcosMacController`** (632 and 1366 lines)
  - Implements the BidCoS MAC on behalf of `rfd`:
    - TX queue, max 5 entries (`SubsystemBidcos.h:37`).
    - Retry limits `MaxSendAttemptsFastRetry=3`, `MaxSendAttemptsSlowRetry=32`, `CoproBusySlowRetryDelay=16` (`BidcosMacController.h:106-108`).
    - AES: `OnRxAesChallenge`, `SendAesChallenge`, `CheckAesSolutionAndSendAesAck`, `AesChallengeInfo` map keyed by peer address, and TX states `WaitAesAck` / `WaitAesSolution`.
    - Peer, RF-address and AES-key handling frames.
  - Randomness for AES challenges comes from `/dev/urandom` (`BidcosMacController.cpp:1338`).
- **`SerialFrame` hierarchy** (`SerialFrame/`): framing is `StartChar=0xFD`, `EscapeChar=0xFC` with byte stuffing (escaped byte is `b & 0x7F`; unescape ORs 0x80), `Crc16Poly=0x8005` (`SerialFrame.h:112-124`, `SerialFrame.cpp:78-142`). A frame carries a subsystem type and a command. Families: `CommonCommandFrame` (Identify, GetSgtin, StartApplication, StartBootloader), `HmLegacyFrameBidcos`, `HmLegacyFrameSystem` (peer add/remove, AES keys, RF address, duty cycle, TX rate, set time), `HmIpStackFrame`, `LowLevelMacFrame` (Tx, RxTelegram, RxMode, timestamp), `TrxAdapterFrame` (carrier sense, duty cycle), `RouterFrame`, `BackboneFrame`, `InternalFrame`.
- **`MultithreadTest`**: a stress-test class for the serial port (`MultithreadTest.h`). It is compiled into the binary by the `GLOB_RECURSE` in `CMakeLists.txt:1-3`, and no caller was found in `multimacd.cpp`.
- **`tinythread`** (`tinythread.cpp/.h`): vendored TinyThread++ (`tthread::thread`, `mutex`, `condition_variable`, `lock_guard`).

## Dependencies

### Internal module graph (from `target_link_libraries` and includes)

- `rfd` -> `elvutils`, `hsscomm`, `xmlparser`, `XmlRpc`, `LanDeviceUtils`, `UnifiedLanComm`, `pthread`, `crypto`, `m` (`rfd/CMakeLists.txt:~141`), plus libusb-1.0 when `HAS_USB_SUPPORT` (pkg-config, else `find_library usb-1.0`, otherwise `FATAL_ERROR`; `CMakeLists.txt:98-135`).
- `multimacd` -> `pthread`, `rt`, `m`, `crypto`, `elvutils` (`multimacd/CMakeLists.txt:29`). It does not use `XmlRpc`, `hsscomm` or `xmlparser`. It uses `libelvutils` for `PropertyMap`, `Logger` and `OSCompat`.
- Runtime coupling (no link dependency): `multimacd` <-> `eq3_char_loop` kernel module (shared ioctl numbers); `multimacd` -> `rfd` (BidCoS, slave `mmd_bidcos`) and -> HMIPServer (slave `ttyS0` per sample config; `etc/config_templates/crRFD.conf` references `/dev/mmd_hmip` per part 1); `rfd` -> `hss_led` and `SetInterfaceClock` as XML-RPC clients; ReGaHss and others -> `rfd` over XML-RPC.

### External

- OpenSSL libcrypto: linked into both targets. Actual `EVP_*` calls were not located in `rfd` or `multimacd` sources in the grep done; AES for BidCoS is probably in `libelvutils` / `libhsscomm`.
- libusb-1.0 (optional, rfd only).
- Kernel: `/dev/mxs_auart_raw.0` (i.MX28 auart raw driver, config default), `/dev/hss_rf`, `/dev/eq3loop`, `/dev/urandom`.

## Data Models / Wire Formats

- **Coprocessor serial frame** (multimacd): `0xFD` start, escaped bytes (`0xFC` escape, escaped byte value `& 0x7F`, restored `| 0x80`), header with subsystem type, length and command, payload, CRC-16 (poly `0x8005`) (`SerialFrame.cpp:78-208`). Subsystem and frame types are listed in the multimacd section above.
- **BidCoS frames / telegram**: `BidcosTelegram` (multimacd), `BidcosFrame` and `RFCommMessage` (rfd). Layouts were not read.
- **Device description XML**: `RFDeviceDescription` / `RFChannelDescription` / `RFParamset` parse XML via `libxmlparser` from `Device Description Dir`.
- **XML-RPC**: standard XML-RPC over TCP (the `xmlrpc_bin` variant lives in `libXmlRpc`, not analysed here). The method list is above.
- **Persistent config**: INI-style `Key = Value` files with `[Interface N]` sections (`rfd.conf`). `PropertyMap` comes from `libelvutils`.

## Security

- `rfd` XML-RPC server binds to `Listen IP` (`DEFAULT_LISTEN_IP` is an empty string, `rfd.cpp:19`, so it likely binds all interfaces) on `Listen Port`, with no authentication visible in `rfd.cpp`. Reachability depends on firewall and bind address (`rfd.cpp:338-345`).
- The optional UDS proxy (`UDS File`, backlog 100) has no explicit permission setting in `rfd.cpp`.
- AES key material for BidCoS: persisted by `RFManager` when `Persist Keys=1` (`Key File`), with plaintext storage assumed since `ReadFromFile`/`PropertyMap` is used (`RFManager.cpp:1092`). The sample `rfd.conf` enables `Persist Keys = 1`.
- `multimacd` AES challenge randomness from `/dev/urandom` (`BidcosMacController.cpp:1338`). The file descriptor handling there was not read.
- Process-matching patterns in `multimacd.conf` (`*/crRFD*`, `*rfd -c*`, `*update*`, `*/bin/rfd`) suggest cmdline/exe matching of the process that opens a slave device. In the code grepped, the pattern keys are only commented-out defaults in `multimacd.cpp:32-35` and no consumer was found. They may be dead configuration.
- `exit(0)` on error paths hides failures (see Technical Debt).

## Concurrency

- **rfd**: single-threaded main reactor (XmlRpc dispatcher `work(timeout)` + `TimerQueue`) (`rfd.cpp:~395`). Worker threads exist in the interface classes:
  - `BidcosInterfaceConcentrator` is called from multiple threads and guarded by `mutex_rx_frame_queue`, `mutex_devices`, `mutex_cur_tx_frame` plus `cond_cur_tx_frame` (`BidcosInterfaceConcentrator.h:308-315`).
  - `CCU2CommController` has a receive thread, a "start coprocessor app" thread and 3 request mutexes/condvars (`CCU2CommController.h:153-196`).
  - `LGWPortWrapper` has async reconnect with `reconnectPending` / `connectPending` flags and `mutexReconnect` / `conditionReconnectIdle` (`LGWPortWrapper.cpp:52-300`).
  - `BidcosLanConnection` has 3 mutexes (`BidcosLanConnection.h:80-84`).
  - `RFController` and the serial wrappers have receive threads (not read).
- **multimacd**: `tthread`-based threads: main thread (Run loop waiting on a condvar), `FastMacResponder`, `MacController`, `SubsystemManager` (SCHED_RR), one per `Subsystem` (Bidcos, HmIP), and one per `UpstreamCharConnection`. Each class guards state with its own `tthread::mutex` and `lock_guard`; frames cross threads through `TelegramQueue.h`-style queues (`_incomingQueue.GetNextElement(5000)`). Frame ownership is manual: `delete frame` after sinks, `Clone()` for internal frames.
- SCHED_RR priority is set only for the `SubsystemManager` thread, with a warning if that fails (`Sysutils.cpp:50-60`).

## Events and Messaging / IPC

- **XML-RPC** server on TCP 2001 (config `Listen Port`) plus an optional UDS. The method list is above. rfd also acts as an XML-RPC client toward registered callback receivers (`init`, `RFManager` event delivery). The client side was not read.
- **Char devices**
  - `/dev/hss_rf` (rfd built-in interface).
  - `/dev/mxs_auart_raw.0` (multimacd -> coprocessor).
  - `/dev/eq3loop` master with slave nodes created by ioctl: `mmd_bidcos`, `ttyS0` (HmIP).
- **Files as flags**: `/var/status/multimacd.status` (multimacd init done, PID inside), rfd init-done file in `StatusfileDir` (`rfd.cpp:157-170`), `/var/status/` files from the LGW controllers.
- **Signals**: multimacd SIGTERM/INT/QUIT/USR1 -> `Exit()`; rfd ignores SIGCHLD.
- **Process lifecycle events** for HmIP/BidCoS clients: `UpstreamConnect` / `UpstreamDisconnect` triggered by slave open/close via `EQ3LOOP_IOCGEVENTS`.

## Configuration

- `rfd`: `/etc/config/rfd.conf` (or `/etc/bidcos/bidcos.conf`, or `-f`). Keys listed above. Sample in `src/rfd/rfd.conf`.
- `multimacd`: `/etc/config/multimacd.conf` (or `-f`). Keys: `Coprocessor Device Path`, `Log Level`, `Log Identifier`, `Log Destination`, `Log Filename`, `HmIP/Bidcos/Transparent Cmdline Pattern`, `Bidcos Exe Pattern`, `Default Subsystem`, `Loop Master Device`, `Loop Slave Device Bidcos`, `Loop Slave Device HmIP`, `StatusfileDir`. Sample in `src/multimacd/multimacd.conf`. `Default Subsystem` has no consumer in the sampled code.
- CMake options: `HAS_USB_SUPPORT` (rfd USB interface and libusb). `PRODUCTION=1` for rfd.
- `src/rfd/run_rfd.sh`: legacy development launcher that sets `LD_LIBRARY_PATH` to `../base/libs/...` paths that do not exist in this repo (`run_rfd.sh:1-11`).

## Testing

- No unit tests found in either tree. `MultithreadTest.cpp/.h` (multimacd) is a hardware stress test that is compiled into the production binary but has no invoking code in `multimacd.cpp`.

## Technical Debt

- `exit(0)` after fatal init errors (`rfd.cpp:342-345, 376-379`): supervisors cannot detect failure.
- `PIDFILE` and `UDS_PATH` constants in `rfd.cpp:13-14` are defined but unused (config keys are used instead).
- Windows legacy: `win32_service.*`, `hid/*` (Windows HID headers), `CCU2SerialPortWrapperWin32.*`, `rfd-nmake.mk`, `#ifdef WIN32` throughout. None of it is built.
- `XMLRPC_DEBUG` and `LOG` patterns: logging uses `%d` for `syscall(SYS_gettid)` (long) in multimacd (`SubsystemManager.cpp:115`, `Subsystem.cpp:155`), a potential format mismatch on 64-bit. The "buffer overflow" log in `UpstreamCharConnection.cpp:121` has a missing `%s` argument, which is undefined behaviour (the format string has two `%s` but only `_slaveDevice.c_str()` is passed, `UpstreamCharConnection.cpp:121`).
- `UpstreamCharConnection::SetupDevices` treats `fd <= 0` as failure (:84-86), so a valid fd 0 would be rejected without being closed (edge case only).
- `MultithreadTest` compiled into production via `GLOB_RECURSE` (`multimacd/CMakeLists.txt:1-3`), as are `tinythread` and every `.cpp` under `SerialFrame/`. Adding a stray `.cpp` breaks or bloats the build silently (`CONFIGURE_DEPENDS`).
- Unused/unwired config: `Default Subsystem`, `*Cmdline Pattern`, `Transparent` subsystem (no registration found).
- Duplicate TinyThread and `LockGuard` typedef per class; manual `delete frame` ownership transfer across threads with no smart pointers.
- Mixed German/English comments; ISO-8859-1 sources (`rfd.cpp:75`).
- `rfd.conf` sample in repo points at a hard-coded LAN gateway IP (`192.168.1.195`) and a test serial; it is easy to mistake for production config.
- Not covered by this pass: `RFDevice` / `RFChannel` / `RFManager` internals, the frame decoders, the XML-RPC client (callback) path, `BidcosMacController` timing logic and `SubsystemHmIp`.

<!-- from _parts/src-part-1c.md -->
# Module: src (part 1c) - hs485d, libhsscomm, libeq3config, libXmlRpc (supplement to src-part-1)

> Scope: `src/hs485d`, `src/libhsscomm`, `src/libeq3config`, `src/libXmlRpc`. These four were listed as "NOT analyzed" in `src-part-1.md:7`; this file fills those gaps.
>
> Analysis depth (budget-limited, grep-first):
> - **Read/grepped**: all four `CMakeLists.txt`; `hs485d/hs485d.cpp` (main, config parsing); `hs485d/XmlRpcMethods.cpp` (method registry); `hs485d/HS485Frame.h`, `HMWLGWCommand.h`, headers of `HS485Controller`, `HS485ControllerLGW`, `LGWPortWrapper`; `HS485Controller.cpp` (control-byte handling only); `libhsscomm/HSSManager.h`, `HSSXmlRpcEventDispatcher.cpp`, `AsyncXmlRpcSender.h`; `libeq3config/Commands.cpp`, `Command.h`, per-command constructors; `libXmlRpc/src/XmlRpc.h`, `XmlRpcClient.h/.cpp` (selected lines).
> - **NOT read in depth (inventory only)**: bodies of the `HS485*` device/channel/paramset classes, `HS485FirmwareManager`, `HS485EEpromCache`, `HMWLGWTransportFrame.cpp`, `LGWPortWrapper.cpp`; the ~35 `HSSTypeConversion*` / `HSSLogicalType*` / `HSSPhysicalType*` implementations in `libhsscomm`; `libeq3config/CCU2CommControllerMod/*` (serial/LGW communication for firmware update), `netconfigcmd/src/*`, `update-coprocessor`, `update-lgw-firmware`; `libXmlRpc` `.cpp` bodies other than the client. Treat these as sampled gaps.

## Overview

- **Purpose**:
  - `hs485d`: BidCoS-Wired (HomeMatic Wired, "HS485") daemon. Exposes an XML-RPC server (default port 2000) with the same method family as `rfd`, talks to wired bus devices either through the local RS-485 UART (`/dev/hss_rs485`, "CCU1 mode") or over the network through a HomeMatic Wired LAN Gateway (HMW-LGW, "HM2 LGW" mode).
  - `libhsscomm`: shared base library of all HomeMatic interface daemons (`hs485d`, `rfd`, `multimacd` consumers): comm-controller/message-queue framework, device/channel/paramset/parameter model with logical/physical types and value converters, XML-RPC event fan-out to registered clients (`init` callbacks), service messages, metadata store.
  - `libeq3config`: shared library holding all subcommands of the multi-call `eq3configcmd` binary (see `src/eq3configcmd` in part 1) plus a copy of the serial comm stack ("CCU2CommControllerMod") for coprocessor/LGW firmware updates.
  - `libXmlRpc`: vendored/modified XmlRpc++ 1.x (Chris Morley, LGPL 2.1+; `libXmlRpc/src/XmlRpc.h:4-8`): XML-RPC client + server + `select`-style dispatcher.
- **Technology**: C++11 (`cxx_std_11`), CMake; each target uses `_TIME_BITS=64 _FILE_OFFSET_BITS=64` and `openccu_stage_target(...)` (`src/hs485d/CMakeLists.txt`, `src/libhsscomm/CMakeLists.txt`, `src/libeq3config/CMakeLists.txt`, `src/libXmlRpc/CMakeLists.txt`). `hsscomm`, `eq3config`, `XmlRpc` are `SHARED` libraries compiled with `-fPIC`; `hs485d` is an executable.
- **Version**: `hs485d` version string generated at build time from `src/hs485d/version.sh` (`MAJOR.MINOR.PATCH`) into `generated-hs485d-version.h` (macro `HS485D_VERSION`), via `cmake/WriteVersionHeader.cmake` (`src/hs485d/CMakeLists.txt`, add_custom_command block).
- **Tests**: none found (no test sources; only `libeq3config/test-coprocessor`, a runtime hardware-test command, and `HSSTypeConversionBlindTest`, a blind-actor converter, not a test).

### Size inventory

| Directory | Files | Notes |
|---|---|---|
| `hs485d` | 68 | 33 `.cpp` listed in `CMakeLists.txt`; plus `Makefile.bindist` (legacy), `version.sh` |
| `libhsscomm` | 115 | 52 `.cpp` in `CMakeLists.txt`; also `win_pipe.*`, `HSSTypeConversionIntegerList.*` (present on disk, not in CMake source list), `Makefile.bindist` |
| `libeq3config` | 69 | 10 subcommand folders + `CCU2CommControllerMod` (14 files) |
| `libXmlRpc` | 29 | 10 `.cpp` built; `xmlrpc.vc9.vcproj`, `Doxyfile`, `README.html`, `COPYING` are legacy artifacts |

### Executables

| Binary | Source | Entry | Role |
|---|---|---|---|
| `hs485d` | `src/hs485d/hs485d.cpp` | `main` :129 | BidCoS-Wired daemon, XML-RPC server |

Libraries: `libhsscomm.so`, `libeq3config.so`, `libXmlRpc.so`.

---

## Components

### hs485d

**Location**: `src/hs485d/hs485d.cpp` (519 lines), `XmlRpcMethods.cpp`, `HS485*.h`, `HS485*.cpp`, `HMWLGW*.h`, `HMWLGW*.cpp`, `LGWPortWrapper.h`, `LGWPortWrapper.cpp`

**Startup flow (`main` :129-436)**
- Constants: `DEV="/dev/hss_rs485"` (:13), `PIDFILE="/var/hs485d.pid"` (:16), `UDS_PATH="/var/socket_hs485d"` (:17; UDS server code is commented out :405-409), `LISTEN_PORT_XML=2000` (:19).
- CLI (`usage` :90-110): `[-f config file] [-h host -p port] [-c] [-l loglevel] [-g] [-s LGWSerialNumber] [-i InterfaceNr] [-k MYPASSWORD]`; default config `/etc/config/hs485d.conf` (:137). `-g` selects HM2 LGW mode (`useHM2LGW` :131, :184). Logger: `SyslogLogger("hs485d")` initially (:145), `ConsoleLogger` with `-c` (:180), or per config `FileLogger`/`SyslogLogger`/`ConsoleLogger` (:249-262).
- `SIGCHLD` is ignored (:151); `SIGTERM`/`SIGINT` handlers are commented out (:148-149), `run` flag loop at :418.
- Port selection:
  - explicit `-h/-p` with LGW: `LGWPortWrapper::connect(host, port, key, "")` (:214-226); without LGW: raw TCP `SocketPortWrapper::Open(host,port)` (:229-230);
  - config-driven LGW: `readHS485dConfig(...)` (:249), then `connect(lgwIPAddress, 1000, encryptionKey, lgwSerialNumber)` (:304,:316,:335) - LGW TCP port is hard-coded 1000; writes status files below `/var/status/` (:287);
  - otherwise `UnixSerialPortWrapper` on `DEV` (:355-357).
- Controller: `HS485ControllerCCU1` (serial) or `HS485ControllerLGW` (LGW) subclass of `HS485Controller` (`hs485d.cpp:52-53`, `HS485Controller.h:24`); `SetPortWrapper(pw)` (:378). Exit code 2 when mandatory config is missing - "hs485dLoader checks that" (:277; consumer in part 1 `hs485dLoader`).
- Server: `XmlRpcServer s`; `InitXmlRpcMethods(s)` (:388); `bindAndListen(port,100)` or `bindAndListen(ip, port, 100)` (:392-397); introspection enabled (:402); the controller is registered as an additional dispatcher source (`addSource(pController, ReadableEvent)` :408); `HS485Manager mgr; mgr.Init(cfgFilePath)` (:420); main loop alternates `TimerTarget::s_timerQueue.Execute()` and `s.work(timeout)` (:423-431) - single-threaded event loop.

**Config file `/etc/config/hs485d.conf`** (`readHS485dConfig` :436-519): global keys `Log Destination`, `Log Filename` (default `/var/log/hs485d.log`), `Log Level`, `Listen IP`, `Listen Port`; per-interface section `[Interface <n>]` with `Type` (only LGW type accepted, else FATAL "Interface type %s not supported" :490), `Serial Number`, `Encryption Key`, optional `IP Address`. Missing section logs "Cannot find ... in /etc/config/hs485d.conf" (:495).
`HS485Manager::Init` reads further keys: `Device Description Dir` (default `/firmware/hs485types`), `Device Files Dir` (default `/etc/config/hs485d`), `Firmware Dir` (default `/firmware`), and reads user types from `/etc/config/hs485types` (`HS485Manager.cpp:231-246`).

**XML-RPC API served** (registered `XmlRpcMethods.cpp:618-645`, classes :20-610): `listDevices`, `searchDevices`, `getDeviceDescription`, `getParamsetDescription`, `getParamsetId`, `putParamset`, `getParamset`, `getValue`, `setValue`, `getLinkPeers`, `getLinks`, `addLink`, `setLinkInfo`, `getLinkInfo`, `removeLink`, `init`, `updateFirmware`, `deleteDevice`, `reportValueUsage`, `clearConfigCache`, `logLevel`, `replaceDevice`, `listReplaceableDevices`, `getLGWStatus`, `ping`. `activateLinkParamset` is implemented (:437) but its registration is commented out (:635). An `XmlRpcDebugMethod` helper class exists (:20). Introspection (`system.listMethods` etc.) enabled in `main`.

**Wire protocols**
- *Serial / CCU1 (HS485 frame)*: `HS485Frame` (`HS485Frame.h:14-48`) - control byte values `CTRL_IFRAME=0x18`, `CTRL_BOOT_IFRAME=0x10`, `CTRL_SYN=0x80`, `CTRL_ACK=0x19`; fields: receiver address (4 bytes at offset 0), control (offset 4), sender address (4 bytes, offset 5); address announcement frame type `'A'` with description/serial fields (:25-29). Per-peer sliding window with 2-bit tx/rx counters is maintained in `HS485Controller::CheckRxCounter`/`UpdateControlChar` (`HS485Controller.cpp:160-210`: tx counter `(cc>>1)&3`, rx counter `(cc>>5)&3`, `0xffffffff` = broadcast). Messages are `HS485CommMessage` / `HS485CommMessageCCU1` / `HS485CommMessageLGW`, decoded by `HS485CommMessageDecoder`. Bootloader messages sent through `SendBootloaderMessage`; bus commands via `SendMessage(receiver, "u"/"g"/"z"/"Z", ...)` (`HS485Controller.cpp:134`, `hs485d.cpp:412-416` comments).
- *HMW-LGW (TCP/1000, encrypted)*: `HMWLGWCommand` types (`HMWLGWCommand.h:14-24`): `'K'` keep-alive (every 30 s), `'S'` send, `'D'` discovery, `'r'` response, `'a'` answer (0 ok / 1 timeout / 2 undefined error), `'d'` discovery result, `'c'` discovery end, `'e'` event, `'L'` set log level. Framed by `HMWLGWTransportFrame`; transport uses `UnifiedLanComm`/`LanDeviceUtils` (`LGWPortWrapper.h:19-24` forward declares `UnifiedLanCommController`, `LanConnection`, `TCPEncryption`) with key from config (`Encryption Key`). `getLGWStatus` RPC returns serial + connected flag (`HS485ControllerLGW::getLGWStatus`).

**Domain classes** (headers/inventory only): `HS485Manager : HSSManager` (`HS485Manager.h:30`), `HS485Central`, `HS485Device`, `HS485Channel`, `HS485MaintenanceChannel`, `HS485LogicalInstance`, `HS485Paramset`, `HS485DeviceDescription`, `HS485ChannelDescription`, `HS485SystemDescription` (reads XML device type files), `HS485EEpromCache` (config cache cleared by `clearConfigCache`), `HS485FirmwareManager` (`updateFirmware`), `HS485PhysicalDataInterfaceCommand`, `HS485PhysicalDataInterfaceCentralCommand`, `HS485PhysicalDataInterfaceEEprom`, `HS485PhysicalDataInterfaceStore`, `HS485PhysicalAddress`, `HS485LogicalTypeAddress`, `HS485TypeConversionAddressArray`.

**Links**: `pthread UnifiedLanComm LanDeviceUtils elvutils hsscomm xmlparser XmlRpc crypto m` (`CMakeLists.txt`, target_link_libraries).

**Notes**
- Encryption key for LGW is accepted on the CLI (`-k`) and stored in `/etc/config/hs485d.conf`; the HM2 LGW interface type is the only one the config path supports (:490), so the plain serial path is only reachable without `-g`/config.
- `DEV` has a commented alternative `/dev/hss_power` (:11).
- `Makefile.bindist` is a legacy build file in `hs485d` and `libhsscomm`.

### libhsscomm

**Location**: `src/libhsscomm/*` (shared library `hsscomm`, `CMakeLists.txt`)

Groups (from file names and `CMakeLists.txt`; implementations sampled only where noted):
- **Comm framework**: `CommController` (+`CommMessage`, `CommMessageQueue`) - base for `HS485Controller`; `PortWrapper` with `SocketPortWrapper` (TCP) and `UnixSerialPortWrapper` (UART); `StructuredFrame` (macro-defined field layouts, e.g. `STRUCTURED_FRAME_FIELD_INT(offset, bit, len, ...)` used by `HS485Frame.h:17-30`); `win_pipe.*` (Windows remnant).
- **Device model**: `LogicalInstance`, `HSSDescription`, `HSSParamset`, `HSSParameter`, `HSSIntegerValueMap`, `FrameDescription`, `ValueStore`, `MetadataStore`, `type_registry` (namespace `type_registry`, `type_registry.h:9`).
- **Type system**: `HSSLogicalTypeAction`, `HSSLogicalTypeBoolean`, `HSSLogicalTypeFloat`, `HSSLogicalTypeInteger`, `HSSLogicalTypeOption`, `HSSLogicalTypeString`; `HSSPhysicalTypeArray`, `HSSPhysicalTypeBoolean`, `HSSPhysicalTypeInteger`, `HSSPhysicalTypeString`; `HSSPhysicalDataInterface[Internal]`.
- **Value converters** (`HSSTypeConversion*`, ~22): `ActionInteger`, `AnyKeyCounter`, `SameKeyCounter`, `BlindTest`, `BooleanInteger`, `CCRTDNParty`, `Cfm`, `FloatConfigtime`, `FloatInteger`, `FloatUInt8String`, `HexStringToByteArray`, `Identity`, `Int4ToSignedIntX`, `IntegerIntegerMap`, `IntegerIntegerScale`, `IntegerList`, `IntegerTinyfloat`, `Rc19Display`, `StringUnsignedInteger`, `Toggle` - device-specific encodings used by the XML device descriptions.
- **XML-RPC client side / events**:
  - `HSSManager` (`HSSManager.h:43`, `DLLEXPORT`): abstract manager; pure virtual `ListDevices`, `IsDeviceReplaced`, `GetInstance`; `ReportEvent(address, value_key, val)` and `ReportServiceMessage` (:61-68) fan events out to every registered client; `PlatformInit(url, id, dont_callback)` (:85) backs the `init` RPC; `XmlRpcCallSync/Async`, `StoreMulticall`, `MulticallCollectBegin/End` (:107-113, :199-223) batch events; `Ping` (:165); service-message store (`GetServiceMessages`, `ValidateServiceMessages`); metadata API `MetadataSet/Get/GetAll/Delete` plus volatile variants (:132-158); `SendUDPInfo` (:100); `LoadXmlRpcHandlers`/`SaveXmlRpcHandlers` persist client registrations to a file under `/var/` (:185-190, `HSSManager.cpp:491`); `removeUnreachableClients` flag (:256).
  - `HSSXmlRpcEventDispatcher` (`HSSXmlRpcEventDispatcher.cpp:21-110`): per-client actor; builds a `system.multicall` whose entries are `methodName:"event"`, ` params:[id`, ` address`, ` key`, ` value]` (:41-70), retries once on transport failure (:72-73), logs faults (:88-89), exposes `isClientUnreachable()` (:110). Messages are `HSSXmlRpcEventMessage`.
  - `AsyncXmlRpcSender` (`AsyncXmlRpcSender.h:17-28`): thread-backed fire-and-forget `AsyncCall(method, params)` on an `XmlRpcClient`.
- Links: `pthread elvutils xmlparser XmlRpc` (PRIVATE).

**Consumers**: `hs485d` (full model), `SetInterfaceClock` (links `hsscomm`; part 1), `rfd`/`multimacd` (per part 1 inventory, not verified here).

### libeq3config

**Location**: `src/libeq3config/` (shared library `eq3config`)

- **Command framework**: abstract `Command` (`Command.h:15-25`: `execute()`, `help()`), singleton `CommandManager::getInstance()` with `add(Command*)` (`CommandManager.cpp:30-41`). Commands self-register by being static instances in `Commands.cpp` (`static NetConfigCmd NetConfigCmdInstance;` etc., :1-30). `commandsgenerator.cpp` and `*/module.def` files (`HEADER:<hdr>`, `CLASSNAME:<class>`, e.g. `setlgwkey/module.def`) describe the generator inputs for the instance list. `eq3configcmd` (part 1) dispatches into this table.
- **Registered commands** (constructor names): `help` (`HelpSystem.cpp:14`), `netconfigcmd` (`netconfigcmd/netconfigcmd.cpp:17`, network config UDP frames via `src/networkconfig.cpp`, `src/udpframe.cpp`), `update-lgw-firmware` (LGW firmware push, reads from `/firmware/`, `update-lgw-firmware.cpp:247`), `update-coprocessor` (defaults `/dev/ccu2-ic200` reset file, `/firmware/` dir, `update-coprocessor.cpp:47-49`), `test-coprocessor` (`test-coprocessor.cpp:45`), `setlgwkey` (`setlgwkey/setlgwkey.cpp:28`), `rfd-interface-copy` (copies LAN interfaces between two `rfd.conf` files, writing `.xml` backup, `rfd-interface-copy.cpp:19,50,138`), `read-default-rf-address` (`ReadDefaultRFAddress.cpp:28`), `wait-for-file` (`-f file -p poll -t timeout`, `wait-for-file.cpp:22,74`), `md5` (`MD5Module.cpp:15`, bundled `md5/md5.cpp`). `lgwallocation` (`lgwallocation/lgwallocation.cpp`) is compiled but not instantiated in `Commands.cpp` as far as sampled.
- **CCU2CommControllerMod**: copies of the CCU2 comm stack (`CCU2SerialPortWrapperLinuxMod`, `...Win32Mod`, `CCU2SerialFrameMod`, `CCU2CoprocessorCommandMod`, `CCU2LGWCommControllerMod`, `LGWPortWrapperMod`, `FileIOMod`, `HM2UtilsMod`) used by the update commands; writes status under `/var/status/` (`CCU2LGWCommControllerMod.cpp:41`, `LGWPortWrapperMod.cpp:517`). Windows serial wrapper (`...Win32Mod`) is present on disk but not in `CMakeLists.txt`.
- Links: `pthread rt crypto LanDeviceUtils UnifiedLanComm elvutils` (PRIVATE).
- Not analysed: command bodies (protocol of coprocessor/LGW update, UDP frame format of `netconfigcmd`).

### libXmlRpc

**Location**: `src/libXmlRpc/src/`

- Based on XmlRpc++ (`XmlRpc.h:4`); public aggregate header `XmlRpc.h` with `XmlRpcLogHandler`/`setVerbosity` (:80-97).
- Classes: `XmlRpcClient` (blocking `execute(method, params, result)`, `setTimeout` default -1 = none, `ADDRINUSE_ERROR_MAX_RETRIES = 10` for connect retry; `XmlRpcClient.h:88-147`, `.cpp:83,172,196`), `XmlRpcServer` (`bindAndListen(port|ip,port,backlog)`, `work(ms)`, `enableIntrospection`, `getDispatcher`), `XmlRpcServerMethod` (self-registers in its constructor with the server, used by `hs485d/XmlRpcMethods.cpp:20-610`), `XmlRpcServerConnection`, `XmlRpcServerProxy` (UDS server variant, used only in commented code in `hs485d.cpp:405`), `XmlRpcDispatch` (`select` loop; `ReadableEvent` sources), `XmlRpcSource`, `XmlRpcSocket`, `XmlRpcValue` (types `TypeInvalid, TypeBoolean, TypeInt, ...`, `XmlRpcValue.h:31-34`), `XmlRpcUtil`, `XmlRpcException`, `base64.h`.
- Transport is plain HTTP/1.x over TCP; no TLS/SSL references were found in the grep (no `SSL`/`openssl` match).
- Legacy files: `xmlrpc.vc9.vcproj`, `Doxyfile`, `README.html`, `COPYING` (LGPL).
- Exports: `PUBLIC` include dir `src` (`CMakeLists.txt`), consumed by `SetInterfaceClock`, `hs485d`, `hsscomm` and others.

---

## External interfaces and data

| Interface | Direction | Detail | Evidence |
|---|---|---|---|
| XML-RPC server TCP 2000 (configurable `Listen IP`/`Listen Port`) | in | method list above, introspection on | `hs485d.cpp:19,392-402`, `XmlRpcMethods.cpp:618-645` |
| XML-RPC event callbacks (`system.multicall` of `event`) | out | to URLs registered via `init` | `HSSXmlRpcEventDispatcher.cpp:41-70` |
| HMW-LGW TCP 1000, encrypted | out | single-letter command protocol | `hs485d.cpp:304`, `HMWLGWCommand.h:14-24` |
| RS-485 device `/dev/hss_rs485` | I/O | HS485 frames | `hs485d.cpp:13,355` |
| Files | read/write | `/etc/config/hs485d.conf`, `/etc/config/hs485d` (device files), `/etc/config/hs485types`, `/firmware/hs485types`, `/firmware`, `/var/hs485d.pid`, `/var/log/hs485d.log`, `/var/status/*`, XML-RPC handler list under `/var/` | `hs485d.cpp:13-17,137,454`, `HS485Manager.cpp:27,231-246`, `HSSManager.cpp:491` |
| Syslog | out | identifier `hs485d` | `hs485d.cpp:145` |
| `/dev/ccu2-ic200`, `/firmware/` | I/O | coprocessor update | `update-coprocessor.cpp:47-49` |

## Dependencies and build graph

- `hs485d` -> `UnifiedLanComm`, `LanDeviceUtils`, `elvutils`, `hsscomm`, `xmlparser`, `XmlRpc`, `crypto`.
- `hsscomm` -> `elvutils`, `xmlparser`, `XmlRpc`.
- `eq3config` -> `LanDeviceUtils`, `UnifiedLanComm`, `elvutils`, `crypto`, `rt`.
- `XmlRpc` -> (none).

## Observations and risks

- Single-threaded dispatcher mixing XML-RPC sockets, comm controller and timers (`hs485d.cpp:423-431`); LGW keep-alive and event handling run in the same loop.
- Hard-coded values: LGW TCP port 1000, XML-RPC port 2000, device node paths.
- `SIGTERM`/`SIGINT` handlers disabled in source; `run` flag is only changed by the handler (`hs485d.cpp:83,148-149`), so clean shutdown relies on external kill.
- Legacy Windows artifacts (`win_pipe.*`, `...Win32Mod`, `.vcproj`) are unused by the CMake build.
- No automated tests for any of the four components.

<!-- from _parts/src-part-2.md -->
# src (part 2 of 2): WebUI, device types, Tcl extension modules

Scope: `src/webui`, `src/devicetypes`, `src/tcl_homematic`, `src/tclrega`, `src/tclrpc`, `src/tclticks`.
Excluded: `src/webui/www_source/config/devdescr` (device images/descriptors).
Dominant languages: Tcl (CGI scripts, JSON-RPC methods, easymode profiles), JavaScript (Prototype/jQuery-era frontend), XML (device descriptions), C++ (three Tcl extensions).

Coverage note: `src/webui` has about 4,573 files (`src/webui/www` 3,842, `www_source` 787, `rega` 188, `design` 166, `documentation` 104). It was analysed by grep-first sampling. Sampled in detail: build scripts, the JSON-RPC dispatcher, session/user code, a login method, one ReGa script (.fn), one easymode profile and `ic_common.tcl`. Only counted or listed (not read): the 1,083 easymode `.tcl` files, 1,441 easymode `.txt` localization files, 861 PNGs, `design/` (Photoshop/GIMP sources), `documentation/js/jsdoc-toolkit`, and vendored libraries in `www/webui/js/extern`.

## 1. Overview and build wiring

| Module | Path | Role | Size |
|---|---|---|---|
| WebUI | `src/webui` | Web frontend and CGI/Tcl backend of the CCU, plus ReGa-served pages | about 4,573 files |
| Device types | `src/devicetypes` | BidCoS-RF and HS485 (wired) device description XML | 159 files, 365 `<type>` entries in `rftypes`, 18 `hs485types` files |
| tcl_homematic | `src/tcl_homematic` | Tcl package `HomeMatic` 1.0 | 7 source fragments, about 140 LOC |
| tclrega | `src/tclrega` | Tcl extension (C++): talks to ReGa over HTTP | 518 LOC |
| tclrpc | `src/tclrpc` | Tcl extension (C++): XML-RPC client | 420 LOC |
| tclticks | `src/tclticks` | Tcl extension (C++): monotonic seconds | 100 LOC |

Build (CMake, staged into `${ROOTFS_DIR}`):
- `src/webui/CMakeLists.txt:1-2` adds `www_source` and `scripts`. The `webui-assets` target copies `www/` to `/www` and `rega/www` to `/www/rega`. It also creates symlinks: `cgi.tcl -> tcl/extern/cgi.tcl`, and `common.tcl`, `once.tcl`, `session.tcl` and `user.tcl -> tcl/eq3_old/*.tcl`. These are repeated in `www/config`, `www/config/display` and `www/tools`. `api/eq3` and `pda/eq3` get `rega.tcl` and `session.tcl -> tcl/eq3/*`. `/www/addons -> /etc/config/addons/www`. `/www/rega/EULA.de` and `/www/rega/EULA.en` point to `/tmp`.
- `src/webui/Makefile` is the legacy `romfs-inst.sh` (ATMEL/AT91) equivalent with the same symlink layout.
- `src/webui/www_source/CMakeLists.txt` (target `webui-www-source-assets`) concatenates JS (`create_webui_js.tcl`), CSS (`create_style_css.tcl`) and device DB (`create_devdb_tcl.tcl`). Each result is converted from UTF-8 to ISO-8859-1 by `utf82ansi.py`, then installed as `/www/webui/webui.js`, `/www/webui/style.css` and `/www/config/devdescr/DEVDB.tcl`. Temporary files are deleted afterwards.
- `src/webui/scripts/CMakeLists.txt` installs `libfirewall.tcl` to `/lib` and `setfirewall.tcl` to `/bin`.
- `src/devicetypes/CMakeLists.txt` runs `GenerateDeviceTypes.cmake` (see section 4). `tcl_homematic/CMakeLists.txt` generates and installs the package into `/usr/lib/tcl8.2/homematic`.
- `src/tclrega/CMakeLists.txt`, `src/tclrpc/CMakeLists.txt` and `src/tclticks/CMakeLists.txt` build `MODULE` libraries (`tclrega.so`, `tclrpc.so`, `tclticks.so`) with `-fPIC -O2`. They are guarded by `BUILD_TCL_MODULES` and need `find_package(TCL)`. tclrega links `xmlparser` (`src/libxmlparser`) and tclrpc links `XmlRpc` (`src/libXmlRpc`). Both use `openccu_stage_target(<name> lib)`.

## 2. Native Tcl extensions (C++)

All three are loaded with `load <name>.so`. They use the old string-based `Tcl_CreateCommand` API with a `CONST84` shim and run in `extern "C"`. License header is HMSL 2 (eQ-3).

### tclrega (`src/tclrega/tclrega.cpp`)
- Tcl commands registered in `Tclrega_Init` (`tclrega.cpp:138-148`): `rega`, `rega_script`, `rega_url`, `rega_sid`, `rega_post`. It provides package `rega` 1.4 (`:41`) and sets `rega_version`.
- Transport: a hand-written HTTP/1.0 POST over a raw BSD socket (`SendRequest`, `:207`). It sets `Content-Length`, reads the response until the `Content-Length` bytes arrive, and errors if the header is missing.
- Default endpoint: `http://127.0.0.1:<port>/tclrega.exe` (`:158`). The port defaults to `8183` (`:67`). It is lazily overridden from the file `/etc/rega_http.port` (`:106-111`), with a digits-only check. The `rega_url` command can change the URL.
- `rega` (`Tclrega_Cmd`, `:266`) wraps each argument as `var __tcl_result_N=...;`, posts it, and parses the `<__tcl_result_N>` tags out of the XML-ish response. With one argument it returns a plain string; with several it returns a Tcl list.
- `rega_script` sends a full HomeMatic Script. Callers read the `STDOUT` key of the returned dict (e.g. `www/tcl/eq3/rega.tcl:33-38`).
- Strings are converted between Tcl UTF-8 and ISO-8859-1 because ReGa only handles Latin-1 (`iso8859_encoding`, `:48`).
- Global mutable state: `dest_addr`, `uri`, `sid` and `portRega`. This is fine for CGI processes but not thread-safe.

### tclrpc (`src/tclrpc/tclrpc.cpp`)
- Command `xmlrpc url method ?args?` (`:65`), package `xmlrpc` 1.4 (`:34`). Usage string at `:36`.
- Arguments are typed lists (`{string x}`, `{int 1}`, and arrays/structs/base64), converted by `StringToXmlRpcValue` (`:90`). Results are rendered back to Tcl lists/dicts by `StringFromXmlRpcValue` (`:193`).
- It keeps one cached `XmlRpcClient` and re-creates it when the URL changes (`:377-384`). Errors go through a `TclrpcErrorHandler` that captures the message.
- On an XML-RPC fault the return code is the fault code (`:394-405`). This is deliberate so that `dispatch.tcl` can see codes such as -10 (TransmissionPending). The fault text is appended to the Tcl result.
- ISO-8859-1 conversion in both directions, as for tclrega.
- It talks to the interface processes (rfd, HS485d, etc.) via the vendored `src/libXmlRpc`.

### tclticks (`src/tclticks/tclticks.cpp`)
- Command `ticks_seconds` (`:57-ish`, `Tclticks_Init`), package `ticks` 1.0. It returns `clock_gettime(CLOCK_MONOTONIC)` seconds as a string (the comment says time since system start). A GCC-version check chooses `CLOCK_REALTIME` for GCC < 4. A hash table `hashTable` is initialised but unused.

### tcl_homematic (`src/tcl_homematic`)
- `files.txt` lists fragments in order: `src/tclload.tcl`, `serial.tcl`, `util.tcl`, `session.tcl`, `script.tcl`, `addon.tcl`, `trailer.tcl`. `create_homematic_tcl.tcl` concatenates them with `cat` into `homematic.tcl`. `stripcomments.tcl` strips comments. The output is installed with `pkgIndex.tcl` (`package ifneeded HomeMatic 1.0`).
- `tclload.tcl`: if `::rega_script` / `::xmlrpc` do not exist, it runs `load tclrega.so` / `load tclrpc.so`. This is why CGI scripts only need `package require HomeMatic` (e.g. `www/api/eq3/hmscript.tcl:7`).
- `::HomeMatic::GetSerialNumber` parses `SerialNumber=` from `/etc/config/ids` (`serial.tcl`).
- `::HomeMatic::Addon::AddConfigPage`, `::HomeMatic::Addon::RemoveConfigPage`, `::HomeMatic::Addon::GetAll` store add-on config pages in `/etc/config/hm_addons.cfg`, as a Tcl array serialised with `array get` (`addon.tcl`). The load/save helpers are in `util.tcl`.
- `Session::login/logout/renew` and `Script::eval` are stubs that `error "not implemented"`. `Session::isValid` has an empty body. Only the URL constants the local login.htm page on 127.0.0.1 and the local pages/index.htm page on 127.0.0.1 are real.

## 3. WebUI (`src/webui`)

### 3.1 Layout

| Dir | Content |
|---|---|
| `www/` | Docroot installed to `/www`. Subtrees below. |
| `rega/www/` | Pages served by the ReGa HTTP server on :8183 and exposed under `/rega`: `index.htm`, `login.htm`, `logout.htm`, `pages/`, `esp/`, `xml-api/` (188 files: 103 `.htm`, 70 `.fn`, 3 `.inc`, 6 `.xml`) |
| `rega/bin/` | `hm_startup`, `hm_autoconf`, `hm_deldev` (Tcl scripts using `load tclrega.so`/`tclrpc.so`) |
| `www_source/` | JS/CSS/resource sources plus the concatenation scripts. 787 files. |
| `CfgTool/` | Variant of the config pages for the PC "Konfigtool" (`config/`, `configapp/`, `cgi.tcl`, `session.tcl`, `user.tcl`, `admin.js`) |
| `bootstrap/` | Tooling only (`package.json`, `update.sh`, `README.md`). Pins Bootstrap 5.3.8, Popper 2.11.8 and Sass 1.78.0. It is not installed. It regenerates `www/webui/js/extern/bootstrap.bundle.min.js` and `www/webui/css/extern/main.min.css`. |
| `scripts/` | `libfirewall.tcl`, `setfirewall.tcl` (see 3.6) |
| `design/`, `documentation/` | Binary design sources (psd/xcf/7z) and a vendored jsdoc-toolkit. Not part of the runtime. |

`www/` subtrees (file counts): `config` 3,182 (of which `easymodes` 2,561 and `img` 589), `api` 203 (`methods` 183), `ise` 260, `webui` 125, `pda` 48, `tools` 12, `tcl` 8, `upnp` 2, `error` 2. Extension counts across `www`: 1,442 `.txt`, 1,308 `.tcl`, 861 `.png`, 111 `.js`, 45 `.cgi`.

### 3.2 Request model
- Server side is plain CGI Tcl (`#!/bin/tclsh`). `*.cgi` scripts use the vendored `cgi.tcl` library (`www/tcl/extern/cgi.tcl`, 2,714 lines) with `cgi_eval`, `cgi_input` and `import`. Older scripts use `source once.tcl` and `sourceOnce` / `loadOnce` helpers (`www/tcl/eq3_old/once.tcl`).
- Pages served by ReGa (`rega/www/**.htm`, `*.fn`) use ReGa "ESP" templating (`<% Call("/esp/system.fn::CheckUserFavorite()"); %>`, `rega/www/pages/index.htm`) with HomeMatic Script functions, e.g. `function ::setReadyConfig()` in `rega/www/esp/devices.fn:2`. Device-type controls are in `rega/www/esp/controls/*.fn`. `xml-api/*.fn` and `*.xml` expose device/room/function lists.
- Pages are HTML with `charset=iso-8859-1`. Source files are mixed ISO-8859-1 / UTF-8 and some use CRLF.

### 3.3 JSON-RPC API (`www/api`)
- Entry point `www/api/homematic.cgi` (215 lines). On POST it parses JSON-RPC (`api/eq3/jsonrpc.tcl`, `json.tcl`), looks the method up in `api/methods.conf` (1,292 lines), checks privilege level and required arguments, then `source`s `api/methods/<SCRIPT_FILE>`. On GET it renders an HTML method table. Error codes are 100-103 request, 200-203 response, 300 internal, 400 privilege, 401 unknown method, 402 missing argument, and 5xx application errors.
- `methods.conf` entries have the form `Name { LEVEL NONE|GUEST|USER|ADMIN  SCRIPT_FILE ...  INFO {...}  ARGUMENTS {...} }`. Levels map NONE=0, GUEST=1, USER=2, ADMIN=8 (`homematic.cgi`, `USER_LEVEL`). The privilege check runs `eq3/getupl.hms` in ReGa via `hmscript_runFromFile` and applies only when `DOCUMENT_ROOT` is `/www/` (the `central` flag; the Konfigtool skips it).
- Method namespaces (script counts in `api/methods`): bidcos, bidcosrf, bidcoswired, ccu (about 30, e.g. `getserial`, `setsshpassword`, `restartReGa`, `setsecuritylevel`), channel, device, event (`poll`, `subscribe`, `unsubscribe`), firewall, interface (about 55 wrappers over XML-RPC to rfd/hs485d, e.g. `setvalue.tcl`, `putparamset.tcl`, `getlinks.tcl`, `updatefirmware.tcl`, `dispatch.tcl`), program, rega (`runscript`, `isPresent`, `getalldatapoints`), room, safemode, session (`create`, `login`, `logout`, `renew`, `setsessionvar`), subsection, system, sysvar, user, webui. Each script sees `$args(...)` and the `$interface(URL)` of the chosen interface, and ends with `jsonrpc_response ...`.
- Support libraries in `api/eq3`: `common.tcl` (file_load/save), `ipc.tcl` (reads `/etc/config/InterfacesList.xml`, caches to `/var/tmp/api_ipc.cache`), `hmscript.tcl` (wraps `rega_script`, injects arguments as `var x = "...";` with escaping), `event.tcl`, `jsonrpc.tcl`, `json.tcl`, and `getupl.hms`/`checksid.hms`.
- Two backing systems are hit from the methods. XML-RPC to the interface processes uses `xmlrpc`, with `checkXmlRpcStatus` (`interface/setvalue.tcl`). The ReGa logic layer is called with `rega_script`.
- `session/login.tcl` does not check credentials itself. It POSTs `tbUsername`/`tbPassword` to `http://127.0.0.1/login.htm` and extracts `sid=@...@` from the `Location` header (HTTP 503 -> error 503, no sid -> error 501).
- Other API-style endpoints: `api/backup/*.cgi` (backup/login/tar/binfile/paramset/run-script), `pda/` (a mobile/PDA UI with templates, `pda/eq3/*.tcl`), `upnp/` (`index.cgi`, `basic_dev.cgi`; the first runs `exec /sbin/ifconfig eth0` and redirects the browser), `ise/checkrega.cgi` (health check via `rega_script`).

### 3.4 Sessions and users
- Legacy session store `www/tcl/eq3_old/session.tcl` (912 lines): `/var/SESSIONS.dat`, cookie/param name `icsessionid`, timeout 900 s, 10-character sid, max 10 sessions. Functions include `session_requestisvalid`, `session_generatesession` and `session_upl`.
- Users: `www/tcl/eq3_old/user.tcl` reads `/etc/config/USERS.dat`. A default admin is hardcoded (`ADMIN_NAME "admin"`, `ADMIN_PWD "elv"`, `ADMIN_UPL 8`, near lines 9-11). The `_ise` variants (`read_users_ise`, `user_upl_ise`, `user_isExpert_ise`) read users from ReGa. `tcl/eq3/session.tcl` (134 lines) is the newer, ReGa-based session helper used by `api/` and `pda/`. `tcl/eq3/rega.tcl` provides `rega_escape` and `rega_exec`.
- `webui/style.cgi` renders `webui/style.css` from a color template and `webui/color.map`, overridden by `/etc/config/color.map`.

### 3.5 Frontend (`www_source` -> `webui.js`, plus `www/webui`)
- `jsfiles.txt` (218 lines) lists the files that `create_webui_js.tcl` concatenates (ISO-8859-1 read, UTF-8 intermediate, ISO-8859-1 written) into one `webui.js`. `resources.txt` and `create_resource_js.tcl` inline `.jst` templates from `webui/resource/` as JS string constants (`CHANNELCHOOSER_JST`, `DEVICELIST_TREE_JST`, `RF_CONFIG_JST`, ...). `cssfiles.txt` lists 27 CSS files, concatenated into `style.css` and processed for `$_(color)` placeholders. `jsl.conf`, `jsCheckOnlyFiles.txt` and `check_CheckOnlyFiles.tcl` are lint-only (the call is commented out in CMake).
- Structure of `www_source/webui/js`:
  - `common/` (jsonrpc, xmlrpc, xmlhttprequest, httploader, debug, drag, expand, securityHint, eq3).
  - `ui/` (frame, label, button, textedit, listbox, ...).
  - `model/` (room, subsection, devicetype, channel, device and their lists).
  - `dialog/` (36 files, 11.7k lines, e.g. `deviceconfigdialog.js`, `installWizard.js`, `firewallconfigdialog.js`).
  - `pages/` (42 files, 4k lines: `control/`, `linksandprograms/`, `systemconfig/`, `help/`, startpage).
  - `webui.js` (`WebUI = Singleton.create`, page navigation, resize, `:6`), `mainmenu.js`, `homematic.js`, `homematic.com.js`, `regamonitor.js`, `interfacemonitor.js`.
- `ise/js` (52 files, 16.7k lines) holds the older "ise" channel widgets (`iseButtonsSwitch.js`, `iseThermostat.js`, `iseHmIPWeeklyProgram.js`, ...). `config/js` (15 files, 5.3k lines, `ic_*.js`) holds the config-dialog scripts. `ise/style/style.css` is 1.5k lines. `webui/css` has 18 files and 7.2k lines.
- API client: `homematic(method, params, callback)` in `webui/js/homematic.js` injects `_session_id_` (from `getSessionId()`) and POSTs JSON-RPC to `/api/homematic.cgi` via `jsonrpc()`. It is synchronous when no callback is given.
- Monitors: `ReGaMonitor` polls `ReGa.isPresent` every 30 s and opens a `CrashDialog` after 3 failures (`regamonitor.js`). `InterfaceMonitor` is the equivalent for interfaces.
- i18n: `www/webui/js/lang/de/translate.lang.*.js`, `www/webui/js/lang/en/translate.lang.*.js` (12 files per language), with `translate.js` and `loadTextResource.js` on the client. `www/config/stringtable_de.txt`, `st_values.cgi` and `st_values.js` (devicetypes) generate `elvST['key']` tables, with an `st_getValue` lookup. The easymode localization is `easymodes/**/localization/de/*.txt`, `easymodes/**/localization/en/*.txt` (1,441 txt files).
- Vendored libraries in `www/webui/js/extern` (not first-party): jQuery, jQuery UI, Prototype, script.aculo.us (`effects.js`, `dragdrop.js`, `builder.js`), Knockout, jqPlot plugins, iro.js, spectrum, less.js, json2, powertip, blockUI, Bootstrap 5 bundle, and others. CSS counterparts are in `www/webui/css/extern` (`main.min.css` 249 KB, compiled from `www/webui/scss`). Recent commits (git log) add Bootstrap 5 and its update tooling.
- Mixed UI generations coexist: the Prototype `Class.create` WebUI, jQuery/Knockout pieces, Bootstrap 5, and the HTML generated from Tcl (`ic_*.cgi`, which emit HTML and inline `<script>` with `puts`).

### 3.6 Device configuration UI (`www/config`)
- CGI pages: `ic_deviceparameters.cgi` (1,462 lines), `ic_setprofiles.cgi` (925), `ic_ifacecmd.cgi`, `ic_linkpeerlist.cgi`, `ic_seldevice.cgi`, `ic_selchannel.cgi`, `ic_neweasymode.cgi`, `ic_md.cgi`, `ic_deviceFirmwareOverview.cgi`, and control panel pages `cp_*.cgi` (network, security, time, software, maintenance, display, add_device). Libraries: `ic_common.tcl` (1,931 lines: navigation, `set_value`, `set_profiles`, `base_put_page`, `base_put_profile`, `modify_easymode_ui`, `activate_link_paramset`), `ic_metadata.tcl`, `file_io.tcl`, `backup.tcl`, `virtualHelp.tcl`. The `display/` subfolder holds the display/status pages.
- Easymodes: `config/easymodes` has 117 top-level `.tcl` profile files such as `blind_ch_link.tcl` and `cc_rt_dev_master.tcl`, plus 70 per-channel-type directories (e.g. `ACCESS_RECEIVER/`, each with `*.tcl`). It also has `hmip/`, `etc/` (helpers: `options*.tcl`, `uiElements.tcl`, `hmip_helper.tcl`, `profile_pname*.tcl`, plus `hmip*.tcl` dialog builders), `js/` (`ic_functions.js` 2,481 lines, `HmIPWeeklyProgram.js` 3,520, `ic_effects.js`, `CC.js`), `MASTER_LANG/` and `em_common.tcl`/`EnterFreeValue.tcl`. A profile file defines `PROFILES_MAP(n)`, `PROFILE_n(<PARAM>)` arrays with `UI_HINT`/`UI_DESCRIPTION`/`UI_TEMPLATE`, and procs that emit HTML. `ic_ifacecmd.cgi:665-667` `source`s `easymodes/$new_profilepath.tcl` when `easymodes/$paramid.tcl` exists, and then a per-user profile file from `$USERPROFILEFILE`. The profile path comes from the request (`import new_profilepath`).
- Data flow: browser -> `ic_*.cgi` (HTML) / JSON-RPC -> `xmlrpc` (paramsets, links) and `rega_script` (names, rooms, programs).

### 3.7 Firewall script
- `scripts/setfirewall.tcl` sources `/lib/libfirewall.tcl` and calls `Firewall_setLoggingEnabled`, `Firewall_loadConfiguration` and `Firewall_configureFirewall`. It logs via `logger -t firewall`. Not read in depth; `libfirewall.tcl` was only sampled by grep (iptables rules). It is exposed through `api/methods/firewall/*` and `firewallconfigdialog.js`.

### 3.8 Rega helper scripts
- `rega/bin/hm_startup` (runs at ReGa start): `checkDevices` iterates `root.Devices().EnumUsedIDs()` and sets `ReadyConfigChns` on devices that are `ReadyConfig`. `hm_autoconf` and `hm_deldev` were only listed, not read.

## 4. Device types (`src/devicetypes`)

- Content: `rftypes/*.xml` (130 entries incl. `ccu1/` with 3 older variants, `device.xsl`, `dp.xsl`), `hs485types/*.xml` (18 incl. `development/` and the XSLs), `replaceMap/rfReplaceMap.xml` (device replacement compatibility map), `device.xsd` (1,541 lines, schema for devices, channels, paramsets), `list_values.tcl` and `stripdocu.tcl` (tclsh tools), and the `st_values.cgi` / `st_values.js` string-table helpers.
- Format: each file is `<device version=... [eep_size] [supports_aes]>` with `<docu>`, `<supported_types><type id name priority><parameter index size const_value cond_op/>` (matching on firmware version and device-type bytes of the pairing frame), `<paramset type="MASTER|VALUES|LINK">`, `<channels><channel index type ... count_from_sysinfo>`, `<frames>`, `<parameter>` with `<logical>`, `<physical>` and `<conversion>` children. Files are ISO-8859-1 and carry German `docu` text. There are 365 `<type>` entries in `rftypes`. HmIP devices are not described here (no XML for them in this directory).
- Generation (`GenerateDeviceTypes.cmake`): for each family (`rftypes`, `hs485types`) it globs `*.xml`, runs `build-tools/bidcos-devicetype-strip <in> -o <tmp>` (a bash script in `build-tools/`; it has a `-ccu2` flag), fails the build on a non-zero exit or empty/missing output, and renames the result into `${ROOTFS_DIR}/firmware/<family>/`. `rfReplaceMap.xml` is copied to `firmware/rftypes/replaceMap/`. `st_values.cgi` and `st_values.js` go to `/www/config`. Note that the `device.xsl`/`dp.xsl` files in the source dirs are not copied by this target.
- `stripdocu.tcl` removes processing instructions, comments, `<docu>` tags and whitespace by regex (`stripDocu`). `list_values.tcl` uses `tdom` to extract parameter names/options and merges them into `stringtable_de.txt`, marking untranslated values as `<...>`. Both are dev-time tools, not part of the CMake build.
- `st_values.cgi` reads `config/stringtable_de.txt`, skips values still marked `<...>` (untranslated), and emits `elvST['key'] = 'value';` JavaScript (Latin-1) followed by the `st_values.js` helpers (`st_setStringTableValues` translating elements with class `stringtable_value`, `stringtable_select`, `stringtable_input`).

## 5. Integration seams and dependencies

- WebUI -> ReGa: `rega_script`/`rega` over HTTP to 127.0.0.1:8183 (`/etc/rega_http.port` override). The ReGa binary itself is outside this part.
- WebUI -> interface daemons (rfd, HS485d, HmIP server): `xmlrpc` over HTTP, with URLs from `/etc/config/InterfacesList.xml` (`api/eq3/ipc.tcl`).
- WebUI -> lighttpd: CGI runs under the web server (`DOCUMENT_ROOT`, `REQUEST_METHOD`, `CONTENT_LENGTH`). Login redirects through the local login.htm page on 127.0.0.1.
- Runtime files and configuration: `/etc/config/USERS.dat`, `/etc/config/hm_addons.cfg`, `/etc/config/ids`, `/etc/config/InterfacesList.xml`, `/etc/config/color.map`, `/var/SESSIONS.dat`, `/var/tmp/api_ipc.cache`, `/etc/rega_http.port`. The tools expected on the target are `tclsh`, `tdom` (dev only), `logger` and `ifconfig` (`upnp/index.cgi`).
- Build tooling: `OPENCCU_TCLSH_EXECUTABLE` (Tcl), `OPENCCU_PYTHON_EXECUTABLE` (`utf82ansi.py`), `build-tools/bidcos-devicetype-strip`, and Node/npm only for the optional Bootstrap update.
- Package install path `/usr/lib/tcl8.2/homematic`: the layout assumes Tcl 8.2 era interpreter conventions.

## 6. Observations relevant to migration (facts only)

- The code base is encoding-sensitive. Sources are ISO-8859-1, some with CRLF, and `utf82ansi.py` plus `encoding convertfrom iso8859-1` steps are part of the build. ReGa's Latin-1-only limitation drives the encoding conversion in both C++ extensions.
- Business logic is split across Tcl CGI, JavaScript, and HomeMatic Script inside ReGa. Feature logic for a device type is spread over `devicetypes/*.xml`, `config/easymodes/**`, `rega/www/esp/controls/*.fn`, `www_source/ise/js/*` and `webui/js/dialog/*`.
- Dynamic code loading from request-influenced names exists in `ic_ifacecmd.cgi:665-667` (a Tcl `source` of the easymodes profile path built from the request) and in `homematic.cgi` (`source api/methods/$method(SCRIPT_FILE)`, restricted to the names in `methods.conf`). A hardcoded default admin credential exists in `tcl/eq3_old/user.tcl`. Both are stated as facts and were not otherwise assessed.
- `tcl_homematic` session and script functions are stubs. `Session::isValid` is empty.
- Not analysed: contents of the ~1,083 easymode Tcl files beyond samples, `libfirewall.tcl` internals, `CfgTool/` internals, individual `api/methods` scripts other than `session/login.tcl` and `interface/setvalue.tcl`, `pda/` templates, and the `webui/js/dialog` and `ise/js` files beyond naming and sizes.
