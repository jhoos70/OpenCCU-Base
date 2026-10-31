# Component Diagram — webui-api (Target)

**What's shown**: Target containers and components of the API deployable, their bridges to unchanged external systems, and the optional gated gateway.

**Architectural style**: Refactor in place (modular monolith internals)

**Key decisions reflected**: Q2, Q3, Q4, Q6, Q7, Q8, AQ3, AQ5, AQ6

```mermaid
flowchart LR
    subgraph Clients["Clients (out of scope)"]
        classic["Classic UI (v1)"]
        react["nextGen React UI (v1 + v2)"]
    end

    lighttpd["lighttpd (same-origin /api/*)"]

    subgraph API["webui-api deployable (CGI + Tcl)"]
        disp["Dispatcher & Contract Core"]
        sec["Security & Session Layer"]
        schema["Method Schema & Contract Test Harness"]
        ev["Event & Push Service"]
        ifgw["Interface Gateway Adapter"]
        rega["ReGa Object Model Services"]
        sysadm["System Administration Services"]
        usr["User, Profile & UI Settings"]
        bkp["Legacy Backup CGIs (restricted or removed)"]
    end

    gw["Optional Gateway (gated, Phase 6)"]

    subgraph Ext["External systems (unchanged)"]
        regahss["ReGaHss (tclrega.so)"]
        login["ReGaHss login.htm"]
        rfd["rfd / hs485d (XML-RPC via tclrpc.so)"]
        queue["/tmp/event queue + api_ipc.cache"]
        os["OS files and tools"]
    end

    classic --> lighttpd
    react --> lighttpd
    lighttpd --> disp
    lighttpd -.-> gw
    gw -.-> ev
    disp --> sec
    disp --> schema
    disp --> ifgw
    disp --> rega
    disp --> sysadm
    disp --> usr
    disp --> ev
    lighttpd --> bkp
    bkp --> sec
    sec --> regahss
    sec --> login
    rega --> regahss
    usr --> regahss
    ifgw --> rfd
    ev --> queue
    sysadm --> os
    bkp --> os

    classDef newc fill:#d6f5d6,stroke:#2e7d32
    classDef gated stroke-dasharray: 5 5
    class schema newc
    class gw gated
```

## Legend

- Solid arrows: synchronous calls (CGI, in-process Tcl, XML-RPC, rega_script, file I/O)
- Dashed arrows and dashed box: optional, evidence-gated gateway path
- Green: new component (no legacy spec)
- Clients are outside the feature scope

## Differences from Current State

- New internal layer boundaries; all privilege/validation flows through Security & Session Layer and the schema harness
- Backup CGIs removed or restricted; `www/api` duplicate removed
- New v2 surface (batch, bulk model, edit endpoints, profile, events) and optional gateway
- External systems and ports unchanged

## Design Rationale

Single deployable fits the small device (Q2, AQ3, Q8); per-integration adapters isolate escaping and error mapping (AQ5); same-origin keeps CORS closed (AQ6); gateway deferred until measured (Q2, Q7). See ADR decisions Q2, Q6, Q7, AQ3, AQ5, AQ6.
