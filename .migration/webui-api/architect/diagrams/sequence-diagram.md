# Sequence Diagram — Hardened v2 Request and Push Subscription (Target)

**What's shown**: A strict-mode v2 call from the React UI through the hardened dispatcher to ReGa and an interface daemon, followed by event long-poll delivery.

**Architectural style**: Refactor in place (modular monolith internals)

**Key decisions reflected**: Q3, Q6, Q7, AQ5, AQ6

```mermaid
sequenceDiagram
    autonumber
    participant UI as React UI (same-origin)
    participant LH as lighttpd
    participant D as Dispatcher & Contract Core
    participant S as Security & Session Layer
    participant SC as Schema Validator
    participant R as ReGaHss (rega_script)
    participant X as rfd / hs485d (XML-RPC)
    participant E as Event & Push Service

    UI->>LH: POST /api/v2/rpc (Content-Type JSON, X-Requested-With, sid)
    LH->>D: CGI request
    D->>D: parse JSON, assign correlation id
    D->>S: checkPrivilege(method, sid)
    S->>R: session upl lookup
    alt unknown sid or ReGa error
        R-->>S: empty or failure
        S-->>D: deny (fail-closed)
        D-->>UI: 401/403 generic error + correlation id
    else allowed
        R-->>S: upl
        S-->>D: ok
        D->>SC: validate params against method schema
        SC-->>D: valid (whitelisted params)
        alt Interface.* method
            D->>X: XML-RPC call (via adapter)
            X-->>D: result or fault (mapped 501-507/599)
        else ReGa-backed method
            D->>R: fixed script with escaped params
            R-->>D: STDOUT
        end
        D-->>UI: JSON result
    end

    UI->>LH: GET /api/v2/events (long-poll)
    LH->>D: CGI request
    D->>S: checkPrivilege(Event.poll, sid)
    S-->>D: ok
    D->>E: poll(sid)
    E-->>UI: queued datapoint.changed events (or empty on timeout)
```

## Legend

- `alt` blocks: fail-closed denial versus allowed path
- Interface adapter and rega_script calls are the anti-corruption points (AQ5)

## Differences from Current State

- Strict Content-Type + CSRF header, correlation id, schema-driven param whitelist (v1: any param becomes an injected variable)
- Errors are generic with real HTTP status in v2 (v1: HTTP 200 with `errorInfo`)
- Event producers are real; polling is long-poll with fixed lock/overflow behaviour

## Design Rationale

Privilege check first and fail-closed (Q6, ADR Q6); one serializer and sanitised errors (Q7 logging); long-poll via CGI first, SSE via gateway only if gated in (Q3, Q2).
