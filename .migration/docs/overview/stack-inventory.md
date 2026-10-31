# Stack Inventory
| Stack | Dirs | Language | Notes |
|---|---|---|---|
| root | . | make/cmake | |
| .github | .github | YAML | CI |
| bin | bin | binaries | prebuilt |
| build-tools | build-tools | script | |
| cmake | cmake | CMake | |
| etc | etc | conf | |
| firmware | firmware | XML/hex | |
| licenses | licenses | txt | |
| opt | opt | FTL | |
| src | src | C++/Tcl/JS | split: native, webui+devicetypes+tcl |
| tests | tests | XML/sh/py | |
| usr | usr | Tcl | |
| www | www | Tcl/JS | split: config, rest |
Integration seams: msmq (HS485Controller*), ipc (hs485d, eq3_char_loop, hss_led, libLanDeviceUtils), tcl-load (devicetypes, eq3configd, hs485d), xmlrpc (SetInterfaceClock, hs485d, ...).
Related repo [src-001] `/home/standard/dev/OpenCCU`: scope hint only.

## Architecture Overview

```mermaid
C4Container
    title OpenCCU-Base containers
    Person(user, "User", "Browser")
    System_Ext(rega, "ReGaHss", "Closed binary in bin/")
    System_Ext(hmip, "HMIPServer", "Runtime peer of multimacd")
    System_Ext(lgw, "HMW-LGW", "LAN gateway")
    Boundary(b, "OpenCCU-Base") {
        Container(www, "WebUI and CGI", "Tcl/JS, www and src/webui", "Config pages, JSON-RPC API")
        Container(tclext, "Tcl extensions", "C++, tclrpc/tclrega", "xmlrpc command")
        Container(rfd, "rfd", "C++", "BidCoS XML-RPC on 2001")
        Container(hs485d, "hs485d", "C++", "HS485 XML-RPC on 2000")
        Container(mmd, "multimacd", "C++", "Radio coprocessor mux")
        Container(led, "hss_led", "C++", "LED control, UDP 8182")
        Container(cfg, "eq3configd", "C++", "UDP identify/config")
        Container(kmod, "eq3_char_loop", "C kernel module", "Char-device loopback")
    }
    Rel(user, www, "HTTP")
    Rel(www, tclext, "load")
    Rel(tclext, rfd, "XML-RPC")
    Rel(tclext, hs485d, "XML-RPC")
    Rel(rega, rfd, "xmlrpc_bin via InterfacesList.xml")
    Rel(rega, hs485d, "xmlrpc_bin via InterfacesList.xml")
    Rel(mmd, kmod, "ioctl")
    Rel(kmod, rfd, "slave node mmd_bidcos")
    Rel(kmod, hmip, "slave node ttyS0")
    Rel(hs485d, lgw, "TCP 1000")
    Rel(rfd, led, "UDP 8182")
    Rel(hs485d, led, "UDP 8182")
    Rel(www, cfg, "eq3configcmd, UDP")
```
