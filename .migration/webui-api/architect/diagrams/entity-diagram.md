# Entity Diagram — webui-api Domain Model (Target)

**What's shown**: Core API entities from the analysis plus the new schema/fixture entities; storage stays in ReGa, files and the event queue (no new database).

**Architectural style**: Refactor in place (modular monolith internals)

**Key decisions reflected**: Q4, Q6, Q12 (auto-selected), Q14 (auto-selected)

```mermaid
erDiagram
    METHOD_REGISTRY_ENTRY ||--o| METHOD_SCHEMA : "described by"
    METHOD_REGISTRY_ENTRY }o--|| USER_LEVEL : "requires"
    METHOD_SCHEMA ||--o{ CONTRACT_FIXTURE : "verified by"
    JSONRPC_CONTEXT }o--|| METHOD_REGISTRY_ENTRY : "invokes"
    JSONRPC_CONTEXT }o--|| REGA_SESSION : "authenticated by"
    REGA_SESSION }o--|| USER : "belongs to"
    REGA_SESSION ||--o| EVENT_SUBSCRIBER : "owns"
    USER }o--|| USER_LEVEL : "has"
    INTERFACE_DESCRIPTOR ||--o{ DEVICE_DESCRIPTION : "lists"
    REGA_DEVICE ||--o{ REGA_CHANNEL : "contains"
    REGA_CHANNEL }o--o{ PROGRAM : "used in"
    REGA_CHANNEL }o--o{ ROOM_OR_SUBSECTION : "member of"
    SYSTEM_VARIABLE }o--o{ PROGRAM : "referenced by"

    METHOD_REGISTRY_ENTRY {
        string name PK
        int level
        string script_file
        string arguments
    }
    METHOD_SCHEMA {
        string method_name PK
        string params_schema
        string result_schema
    }
    CONTRACT_FIXTURE {
        string id PK
        string method_name FK
        string request
        string expected_response
    }
    USER_LEVEL {
        int value PK
        string name
    }
    REGA_SESSION {
        string sid PK
        int uid
        int upl
    }
    EVENT_SUBSCRIBER {
        string sid PK
        string queue_file
    }
    USER {
        int id PK
        string name
        string language
    }
    INTERFACE_DESCRIPTOR {
        string name PK
        string url
    }
    DEVICE_DESCRIPTION {
        string address PK
        string type
    }
    REGA_DEVICE {
        int id PK
        string address
        string name
    }
    REGA_CHANNEL {
        int id PK
        string address
        bool visible
    }
    PROGRAM {
        int id PK
        string name
    }
    ROOM_OR_SUBSECTION {
        int id PK
        string name
    }
    SYSTEM_VARIABLE {
        int id PK
        string name
        string type
    }
    JSONRPC_CONTEXT {
        string method
        string correlation_id
    }
```

## Legend

- `METHOD_SCHEMA` and `CONTRACT_FIXTURE` are new (data files / tests, not database tables)
- All other entities are existing and owned by ReGaHss, interface daemons, config files or the event queue; no DB schema changes

## Differences from Current State

- Adds method schema and golden fixtures as first-class contract artifacts
- Adds `correlation_id` to the request context
- Entities and relationships otherwise unchanged

## Design Rationale

No schema change per Q4 (keep current). Schema and fixtures make the contract machine-checkable (Q12/Q14 auto-selected; ADR CQ1).
