# Data Model: webui-api

Source: `spec.json` entities (31) with the values locked by the blueprint (`contracts/integration-contracts.json` -> `locked_values`).
There is no relational database (Q4/Q5): ReGaHss is the system of record; the entities describe registry rows, sessions,
file-backed state, configuration and the new wire shapes. Types follow the Tcl/JSON reality of the source (many v1 values are strings).

## MethodRegistryEntry

One entry of methods.conf (179 entries; 20 namespaces incl. the new RecoveryMode; NONE 8 / GUEST 48 / USER 30 / ADMIN 93 after the deliberate changes): privilege level, script file, documentation and required arguments. Parsed once per mtime change.

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| name | string | no | unique, case-sensitive, '<Namespace>.<method>' | - |
| LEVEL | enum NONE/GUEST/USER/ADMIN | no | NONE=0 GUEST=1 USER=2 ADMIN=8 | - |
| SCRIPT_FILE | string path | no | relative to api/methods/ | - |
| METHOD_FILE | string path | yes | present on 49 entries (interface/dispatch.tcl users) | - |
| INFO | string | no | ISO-8859-1 | - |
| ARGUMENTS | list<string> | no | presence-only check, no types | - |

### Relationships

- MethodRegistryEntry.LEVEL -> UserLevel.name
- MethodRegistryEntry.SCRIPT_FILE -> methods/<namespace>/<file>.tcl

## JsonRpcContext

Per-request state of the dispatcher (method, params, id, id-used flag). Target adds the correlation id and the resolved sid.

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| METHOD | string | no | set by jsonrpc_parse | - |
| PARAMS | Tcl list (key value ...) | no | flattened JSON object | - |
| ID | string | no | default '"error"'; echoed raw | '"error"' |
| ID_USED | boolean (0/1) | no | default 1; 0 when the request has no id | 1 |

### Relationships

- none (standalone value object)

## UserLevel

The four privilege levels NONE/GUEST/USER/ADMIN with numeric values 0/1/2/8 (frozen).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| name | enum NONE/GUEST/USER/ADMIN | no | - | - |
| value | integer | no | 0,1,2,8 | - |
| display | string | no | '<keine>' (HTML-escaped), 'Gast', 'Benutzer', 'Administrator' | - |

### Relationships

- none (standalone value object)

## ReGaSession

Session held by ReGaHss; string "<uid>;<upl>"; accessed only through rega_script (system.GetSessionVarStr).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| sessionId | string | no | 10 inner characters; wrapped in '@' by login.htm Location header and backup session_isValid | - |
| username/firstname/lastname | string | yes | fields 2-4 per legacy regex session.tcl:825 | - |
| userId | string digits | yes | element 0 of GetSessionVarStr (setuserackinstallwizard.tcl:16-17) | - |
| userPrivilegeLevel | integer 0/1/2/8 | no | element 1 (getupl.hms:10) | - |

### Relationships

- ReGaSession.uid -> ReGa user object (ID_USERS)
- ReGaSession.userId -> User.id

## LegacyFileSession

Classic-UI file session in /var/SESSIONS.dat (900 s timeout, 10 sessions); only id generation changes (CSPRNG).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| sid | string | no | regex ^(@[A-Za-z0-9]*@) | - |
| uid | string digits | no | - | - |
| lastActivity | epoch seconds | no | timeout 900 s | - |
| redirectUrl | string | yes | - | - |

### Relationships

- LegacyFileSession.uid -> LegacyUser.uid

## LegacyUser

Classic-UI user record mirrored from USERS.dat (plaintext passwords out of scope, EG-25).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| uid | string digits | no | - | - |
| name | string | no | [A-Za-z0-9]* | - |
| password | string | no | [A-Za-z0-9]*, stored in clear | - |
| upl | integer | no | digits | - |
| eq3 | integer 0/1 | no | single digit; must be 1 to be valid | - |

### Relationships

- none (standalone value object)

## EventSubscriber

Subscriber record in /tmp/event/subscriber.list with its pending-event counter.

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| EVENT_COUNT | integer | no | capped by EVENT_LIMIT=64, never decremented | - |
| sid | string | no | session id, used as file name unsanitised | - |
| TYPE | string | no | 'init' or 'delete' in observed producers | - |
| DATA | string | no | raw JSON fragment inserted verbatim | - |

### Relationships

- EventSubscriber.id -> ReGaSession.sessionId
- EventSubscriber.sid -> ReGa session id

## InterfaceDescriptor

Interface entry resolved from InterfacesList.xml and cached in /var/tmp/api_ipc.cache.

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| name | string | no | from <name>; 'default' for BIDCOS_SERVICE | - |
| URL | string | no | XML-RPC endpoint | - |
| PORT | integer | no | first :<digits> in URL, 0 if none | - |
| INFO | string | no | - | - |

### Relationships

- none (standalone value object)

## BackupQueryArgs

Query arguments of the legacy backup CGIs (sid, file, interface, ...).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| sid | string | yes | '@'+10+'@' for validation | - |
| file | string | yes | unrestricted path | - |
| interface/address/key | string | yes | interface must exist in InterfacesList.xml | - |
| username/password | string | yes | in clear in the URL | - |

### Relationships

- none (standalone value object)

## DeviceDescription

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| TYPE | string | no | - | - |
| ADDRESS | string | no | serial or serial:channel | - |
| PARAMSETS | string[] | no | - | - |
| VERSION | integer | no | emitted unquoted | - |
| FLAGS | integer | no | emitted unquoted | - |
| CHILDREN | string[] | yes | present only for devices | - |
| FIRMWARE / AVAILABLE_FIRMWARE / UPDATABLE / FIRMWARE_UPDATE_STATE | string | yes | device only | - |
| PARENT / PARENT_TYPE / INDEX / AES_ACTIVE / LINK_SOURCE_ROLES / LINK_TARGET_ROLES / DIRECTION | string/integer/boolean/string[] | no | channel only | - |
| GROUP / TEAM / TEAM_TAG / TEAM_CHANNELS | string/string[] | yes | TEAM_CHANNELS guard uses typo TEAM_CHANNELD | - |
| INTERFACE / ROAMING | string/boolean | yes | BidCoS-RF only | - |

### Relationships

- DeviceDescription.PARENT -> DeviceDescription.ADDRESS
- DeviceDescription.CHILDREN[] -> DeviceDescription.ADDRESS

## DirectLink

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| SENDER | string | no | channel address | - |
| RECEIVER | string | no | channel address | - |
| NAME | string | no | - | - |
| DESCRIPTION | string | no | - | - |
| FLAGS | integer | no | 0x01 sender broken, 0x02 receiver broken; emitted unquoted | - |
| SENDER_PARAMSET / RECEIVER_PARAMSET | map<string,string> | yes | only with flags 0x02/0x04 | - |

### Relationships

- DirectLink.SENDER -> DeviceDescription.ADDRESS
- DirectLink.RECEIVER -> DeviceDescription.ADDRESS

## Paramset / ParameterDescription

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| name | string | no | parameter id | - |
| value | string | no | all values stringified when read; written with explicit type | - |
| TYPE | string | yes | STRING, INTEGER, ... | - |
| OPERATIONS / FLAGS / DEFAULT / MIN / MAX / UNIT / TAB_ORDER / CONTROL / VALUE_LIST / SPECIAL | string | yes | - | - |

### Relationships

- Paramset.address -> DeviceDescription.ADDRESS

## ReGaDevice / ReGaChannel

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| id | string | no | ReGa numeric id as string | - |
| name | string | no | unique, uniquified by ReGa | - |
| address | string | no | - | - |
| interface | string | yes | device only; devices without interface skipped in listAllDetail | - |
| operateGroupOnly | string | yes | metadata; written with false by listAllDetail when null | - |
| mode / category | string | no | MODE_DEFAULT/MODE_AES; CATEGORY_NONE/SENDER/RECEIVER | - |
| isUsable / isVisible / isLogged / isLogable / isReadable / isWritable / isEventable / isAesAvailable / isVirtual / isReady | boolean | no | emitted raw from ReGa | - |
| partnerId | string | yes | 65535 mapped to empty | - |

### Relationships

- ReGaChannel.deviceId -> ReGaDevice.id
- ReGaChannel.address -> DeviceDescription.ADDRESS

## GatewayInterfaceConfig

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| Type | string | yes | RF side excludes 'CCU2' | - |
| Name | string | yes | - | - |
| Serial Number | string | yes | - | - |
| Encryption Key | string | yes | returned in clear text by get* | - |
| IP Address | string | yes | only written if non-empty | - |

### Relationships

- none (standalone value object)

## SecurityKeyFile / LanGatewayKeyChange

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| Current Index / Last Index / Key N | string | no | Key values are md5 hex of the key | - |
| Class / Serial / IP / KEY / CURKEY | string | yes | stored in clear text | - |

### Relationships

- none (standalone value object)

## Metadata

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| objectId | string | no | created as new OT_OBJECT if absent on set | - |
| dataId | string | no | free key | - |
| value | string | yes | - | - |

### Relationships

- Metadata.objectId -> ReGaDevice.id | ReGaChannel.id

## BidcosInterfaceGateway

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| ADDRESS / DESCRIPTION / TYPE / FIRMWARE_VERSION | string | no | all required by serialiser | - |
| DUTY_CYCLE | string | no | 0-100; emitted as quoted string | - |
| CONNECTED / DEFAULT | integer | no | 1 means true | - |

### Relationships

- none (standalone value object)

## User

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| id | string | no | ReGa object id | - |
| Name | string | no | user.Name() | - |
| UserFirstName | string | yes | user.UserFirstName() | - |
| UserPwd | string | yes | compared with "" for hasUserPWD | - |
| UserEasyLinkMode | boolean | yes | user.UserEasyLinkMode() | - |
| language | string | yes | first line of .lang file; default '0' | '0' |

### Relationships

- none (standalone value object)

## SystemVariable

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| id | string | no | ReGa id | - |
| name | string | no | creation regexp ^[A-Za-z0-9_\-\.:]+$ (createbool.tcl:14) | - |
| type | enum ALARM/LOGIC/LIST/NUMBER/STRING/UNKNOWN | no | derived from ValueSubType | - |
| value | string | yes | - | - |
| unit | string | yes | - | - |
| channelId | string | yes | '0' or '65535' = none | - |
| valueName0/valueName1 | string | yes | ALARM/LOGIC only | - |
| valueList | string ';'-separated | yes | LIST only | - |
| minValue/maxValue | string number | yes | NUMBER only | - |
| isLogged/isVisible/isInternal | boolean | no | unquoted ReGa booleans | - |

### Relationships

- SystemVariable.channelId -> Channel.id

## Program

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| id | string | no | - | - |
| name | string | no | - | - |
| isActive | boolean | no | - | - |
| isInternal | boolean | no | - | - |
| lastExecuteTime | string | yes | 'YYYY-MM-DD HH:MM:SS' | - |

### Relationships

- Channel.ChnEnumDPUsagePrograms -> Program.id

## RoomOrSubsection

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| id | string | no | - | - |
| name | string | no | - | - |
| description | string | yes | EnumInfo() | - |
| channelIds | list<string> | no | EnumUsedIDs() | - |

### Relationships

- RoomOrSubsection.channelIds -> Channel.id

## FirewallConfiguration

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| services[].id | enum XMLRPC/REGA/NEOSERVER/SNMP | no | libfirewall.tcl:27-30 | - |
| services[].ports | list<int> | no | built-in defaults merged on load | - |
| services[].access | enum full/restricted/none | no | not validated on write | - |
| ips | list<string> | no | default 192.168.0.1 192.168.0.0/16 fc00::/7 | 192.168.0.1 192.168.0.0/16 fc00::/7 |
| userports | list<string> | yes | - | - |
| mode | enum MOST_OPEN/RESTRICTIVE | no | default RESTRICTIVE | RESTRICTIVE |

### Relationships

- none (standalone value object)

## ColorMap

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| key | string | no | first whitespace/tab/'?'-separated token | - |
| color | string | no | e.g. '#192c6e'; unvalidated | - |

### Relationships

- none (standalone value object)

## ConfigFlagFile

Entity carried over from the as-is analysis; target changes are listed in the owning specification (see `spec.json`).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| path | string | no | fixed per method | - |
| content | string | yes | presence-only for flags; key = value lines for configs | - |

### Relationships

- none (standalone value object)

## MethodSchemaEntry

New. One machine-readable entry per method (179), source of central validation and GET /api/v2/schema.

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| name | string | no | unique; equals a methods.conf key (179 entries) | - |
| level | enum(NONE,GUEST,USER,ADMIN) | no | equals registry LEVEL after deliberate changes | - |
| info | string | no | from INFO; HTML-escaped when rendered | - |
| params | JSON Schema object | no | required == corrected ARGUMENTS; types/enums validated centrally | - |
| result | JSON Schema | yes | describes v2 strict result; v1 quirks documented as x-v1-quirk | - |

### Relationships

- MethodSchemaEntry.name -> MethodRegistryEntry.name

## ApiConfig

New. Explicit opt-in flags and numeric limits in src/webui/www/api/apiconfig.conf. Defaults preserve v1 (locked values, BD-08/BD-09).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| strict_mode | boolean | no | false = v1 compatible; true requires Content-Type application/json + non-empty X-Requested-With on v1; always on for /api/v2 | false |
| config_tool_mode | boolean | no | 'true' disables the privilege check (CfgTool); never inferred from DOCUMENT_ROOT | false |
| v2_enabled | boolean | no | v2 routes answer only when true (lighttpd routes external, EG-21) | false |
| cookie_mode | boolean | no | true => Session.login on v2 also sets cookie hm_sid (HttpOnly; SameSite=Strict; Path=/api) | false |
| rate_limit | boolean | no | OPT-IN (user decision 2026-10-14). true enables the per-IP Session.login limiter and the per-sid request limiter on v1; both are always enforced on /api/v2 and when strict_mode=true. false (default) keeps v1 behaviour unchanged (no counter file access, no 429; NFR-045, NFR-055) | false |
| sid_shape_strict | boolean | no | true enforces the sid shape validator ^@?[A-Za-z0-9]{10}@?$; EG-8 gated, not released until the runtime trace confirms the real session key format | false |
| allowed_origin | string | yes | absent => no Access-Control-* header (same-origin, AQ6) | absent |
| batch_limit | integer | no | 1..100; elements per POST /api/v2/batch | 20 |
| per_sid_limit / per_sid_window_seconds | integer / integer | no | requests per sid per window; excess => error 429 (v1 HTTP 200; v2 HTTP 429 + Retry-After); enforced only when rate_limit=true, strict_mode=true or on /api/v2 | 60 / 10 |
| login_ip_limit / login_ip_window_seconds | integer / integer | no | Session.login attempts per client IP (REMOTE_ADDR) per window; the 11th within 60 s => error 429; enforced only when rate_limit=true, strict_mode=true or on /api/v2 | 10 / 60 |
| model_default_limit / model_max_limit | integer / integer | no | pagination of /api/v2/model; limit 0 or above max => 403 invalid argument (limit) | 100 / 500 |
| long_poll_default_seconds / long_poll_max_seconds | integer / integer | no | GET /api/v2/events timeout parameter | 25 / 55 |
| event_lock_stale_seconds | integer | no | age after which /tmp/event/lock is considered stale | 10 |
| download_timeout_seconds | integer | no | CCU.downloadFirmware wget budget; CGI never blocks beyond this + 5 s | 300 |
| event_limit | integer | no | pending events per subscriber (constant EVENT_LIMIT) | 64 |

### Relationships

- none (standalone value object)

## PathAllowList

New. Exact-match path allow-lists (plus anchored patterns for CCU.existsFile only) for CCU.createFile, CCU.existsFile and the backup file CGIs (EG-3 resolved and corrected 2026-10-20, BD-16; EG-1 resolved 2026-10-20, BD-17: backup list stays empty, CGIs not removed now).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| scope | enum(createFile, existsFile, backup_files) | no | one list per method; createFile and existsFile are separate lists | - |
| entries | string[] | no | exact-match absolute paths; no globbing/normalisation; createFile default = [/etc/config/userAckSecurityHint, /etc/config/firewallConfigured, /etc/config/fieldTestActive, /etc/config/legacyAPIMigrationAccepted]; existsFile default = [/etc/config/userAckSecurityHint, /etc/config/firewallConfigured, /etc/config/fieldTestActive, /etc/config/showDiagramDatapoints, /media/sd-mmcblk0/measurement, /etc/config/legacyAPIMigrationAccepted]; backup_files default = [] | per scope as listed |
| patterns | string[] | no | anchored full-string regular expressions, existsFile only (createFile_patterns = []); existsFile default = [^/etc/config/userprofiles/userAckInstallWizardId_[0-9]{1,10}$, ^/etc/config/userprofiles/userAckInstallWizard_[^/\x00]{1,200}$]; fixed prefix, '/' and NUL excluded from the variable part, so no traversal; request values never add entries | per scope as listed |

### Relationships

- PathAllowList(createFile) -> ConfigFlagFile.path
- PathAllowList(existsFile) -> ConfigFlagFile.path (exact entries) and per-user ack files /etc/config/userprofiles/userAckInstallWizardId_<digits> and userAckInstallWizard_<name> (pattern entries)

## CorrelationId

New. Per-request id returned in generic errors and logged to syslog (format locked BD-06).

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| id | string | no | ^[0-9a-f]{16}$; 8 bytes from /dev/urandom; one per request; returned as X-Correlation-Id and in "internal error (ref: <id>)" | generated |
| syslog entry | structured line | no | logger -t webui-api -p daemon.err "cid=<id> method=<name> uid=<uid/-> code=<code> errorInfo=<single line>"; errorInfo never leaves the device in a response | generated |

### Relationships

- CorrelationId.id -> JsonRpcContext (per request)

## BatchRequest/BatchResponse

New. Body of POST /api/v2/batch (1..20 elements) and its same-order response.

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| requests[] | array<{id?: any, method: string, params: object}> | no | 1..batch_limit elements | - |
| responses[] | array<JSON-RPC envelope> | no | same order and length; element failure isolated | - |

### Relationships

- requests[].method -> MethodRegistryEntry.name

## DatapointChangedEvent

New. Event record fed to the per-session queues; producer gated by EG-2.

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| type | string | no | 'datapoint.changed' (also 'init', 'delete' as before) | - |
| data | JSON object | yes | {address, datapoint, value} (payload locked, BD-12; producer gated by EG-2) | - |

### Relationships

- DatapointChangedEvent -> EventSubscriber.id (fan-out per queue)

## ModelPage

New. One paginated section of GET /api/v2/model.

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| section | enum(devices,channels,rooms,functions,sysvars,programs,datapoints) | no | - | - |
| total/offset/limit | integer | no | limit > 0 and <= configured maximum | - |
| items | array<object> | no | strict JSON, real booleans | - |

### Relationships

- ModelPage.items -> ReGaDevice|ReGaChannel|RoomOrSubsection|SystemVariable|Program

## Locked cross-cutting shapes

JSON-RPC error object (v1 and v2): `{ "name": "JSONRPCError", "code": integer, "message": string }`; v2 adds optional `"reason"` (`SESSION_INVALID`, `PATH_NOT_ALLOWED`, `NAME_EXISTS`, `RATE_LIMITED`, `VALIDATION`, `STRICT_MODE`).

Event queue line (file `/tmp/event/<sid>`): `{TYPE <type> DATA <json>}` one per line; poll returns `[{"type": string, "data": any}]`.

Session id: ReGa-issued, inner id 10 characters `[A-Za-z0-9]`, `@`-wrapped (12 characters) in backup CGIs and the classic UI; locally minted legacy ids use the same format (~59.5 bits, 62^10, EG-17); validator pattern gated by EG-8.

## RateLimitCounter

New. Tmpfs counter files of the opt-in limiters (flag `rate_limit`, default false; always used on /api/v2 and in strict mode). Directory `/tmp/webui-ratelimit/`; no file exists while the limiters are inactive.

| Attribute | Type | Nullable | Constraints | Default |
| --- | --- | --- | --- | --- |
| key | string | no | `login-<REMOTE_ADDR>` (per-IP Session.login limiter) or `sid-<sid>` (per-sid limiter); characters outside [A-Za-z0-9._-] mapped to '_', sid keys truncated to 64 characters | - |
| timestamps | list<integer> | no | request epoch seconds inside the window (60 s for login-, 10 s for sid-); older entries dropped on every write | empty |
| write mode | atomic replace | no | write to a temp file in the same directory, then rename; two concurrent requests may lose one increment (fail-open by 1) | - |
| limit | integer | no | login_ip_limit 10 / per_sid_limit 60 (ApiConfig); over limit => error 429 `rate limit exceeded` (v1 HTTP 200, v2 HTTP 429 + Retry-After 1..window) | - |

### Relationships

- keyed by ApiConfig limits; reads REMOTE_ADDR (login) or the request sid (per-sid); unavailable store => request proceeds and a syslog line is written (EG-26 covers empty REMOTE_ADDR and batch counting).
