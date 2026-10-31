# Migration Plan: Assess opt (HMServer / HmIP runtime assets)

**Status**: assessed | **Date**: 2026-10-09 | **Type**: modernization (retain; document; contract-capture for the nextGen UI)

---

## Included Features

| # | Name | Role | Source | Notes |
|---|------|------|--------|-------|
| 1 | opt | primary | index.json | 25 files in `opt/HMServer` and `opt/HmIP`: 4 prebuilt fat jars (about 68 MB, no source), 17 Freemarker `.ftl` page fragments (6,586 lines), `groupdefinitions.xml` (8,116 lines), `templates.dit`, `legacy-parameter-definition.config`, `crrfd.fwfix`. The "21 files / 8,116 LOC" figure in the request counts the non-jar files and is dominated by `groupdefinitions.xml`. |
| 2 | webui-* (SPA shell, `www_source/webui/js/**`) | affected | index.json | Loads the `/pages/jpages/*` endpoints that render the `.ftl` fragments (`updateContent("jpages/...")`, `CreateCPPopup(...)`). The nextGen UI is the primary consumer to decide on. |
| 3 | www / `src/webui/www` (`easymodes/js/Group.js`, `config/ic_ifacecmd.cgi`) | affected | index.json | Legacy group-editing JS and Tcl CGIs call `/pages/jpages/group/*` directly, including `sid=` in the URL. |
| 4 | src-feature--rfd (`etc/config_templates/crRFD.conf`) | dependency | index.json | `crRFD.conf:11,18` hard-codes `/opt/HmIP/crrfd.fwfix` and `/opt/HmIP/legacy-parameter-definition.config`. |
| 5 | HMIPServer / HMServer (closed Java, external) | dependency | user | Render the `.ftl` pages, serve `/pages/jpages/*`, read the XML, `.dit` and config files. Source is not in this repo. |
| 6 | OpenCCU packaging repo (external) | affected | user | Builds the rootfs, launches the JVMs and probably maps the HTTP paths; not verifiable from this repo. |

---

## Context

### Summary

`opt/` is the runtime payload of the Java side of the CCU backend. It is copied unchanged into the rootfs (`cmake/Components.cmake:146-147`, `openccu_asset_directory(HMSERVER ...)` and `(HMIP_TOOLS ...)`). It holds the BidCoS server (`HMServer.jar`, JDK 8), the HmIP server (`HMIPServer.jar`, JDK 21, `1.5.1-SNAPSHOT` from Jenkins #5936), the ESH/Hue/Lightify bridge (`ESHBridge.jar`, not open source per `www/rega/licenseinfo.htm:13889-13893`), the coprocessor updater and the data files these servers read. Seventeen Freemarker templates are server-rendered HTML+JS fragments for HmIP access-point management, diagrams, groups and system settings (coupling, firmware, storage and energy price). They are loaded by the legacy WebUI over Ajax from `/pages/jpages/...`. Each call carries `sid=`.

This is not a UI source tree to be migrated in the same way as `webui-*`. It is a vendor-supplied runtime asset set whose templates are rendered by closed code. The nextGen UI touches it only through the HTTP endpoints that return those fragments.

### Migration Drivers

- The nextGen UI must either keep embedding these fragments (jQuery, Prototype, Knockout and jqPlot with global WebUI helpers `translateKey`, `dlgPopup`, `WebUI.enter`) or replace the screens with native components. Either choice needs the contract documented first.
- The fragments depend on legacy libraries the renovation intends to retire or isolate (Prototype `Class.create`, jqPlot, Knockout).
- Security: `sid` in URL query strings, and Freemarker interpolation of names into JS string literals with no `?js_string`, `?html` or `?json_string` escaping found by grep (unverified XSS surface).
- Maintainability: the repo ships 68 MB of opaque binaries, a SNAPSHOT build, and only `HMServer.jar` is verified by CI (`.github/workflows/ci.yml:188`, `tests/test-components.py:89`).
- Documentation gaps (see Focus Areas) block any informed wrap or replace decision.

### Current State

Static files copied into `/opt/HMServer` and `/opt/HmIP` on the rootfs, with no build step in this repo. Launch flags, classpath, the template and data lookup paths and the HTTP routing of `/pages/jpages/*` are defined outside this repo (OpenCCU Buildroot packaging, unverified). The jars were last replaced by binary commits (`8be251da` "Update HMIPServer.jar"). Two JVM baselines coexist (Java 8 for HMServer and the updater, Java 21 for HMIPServer).

### Cross-Cutting Findings

- No tests cover the pages, the endpoints or the data files. Only the presence of `HMServer.jar` is asserted (testing.md).
- Session id travels as a URL query parameter on the `jpages` endpoints (57 `sid=` occurrences in the templates). This differs from the JSON-RPC body and is not covered by the API contract.
- Unverified XSS surface from unescaped Freemarker output in JS literals (e.g. `GroupChooseDialog.ftl:7`, `${group.getName()}`).
- The legacy-UI to Java coupling goes through hard-coded absolute URLs (`/pages/jpages/...`), which the closed servers must continue to serve.
- `legacy-parameter-definition.config` is ISO-8859-1 (`Legacy.Encoding=ISO-8859-1` in `crRFD.conf`). Tools that re-encode it as UTF-8 corrupt degree and micro signs.
- `crrfd.fwfix` (6 divergent device types, OEM prefix "MO") has an undocumented semantic.
- Sibling packaging repo applies patches to rootfs content. Whether any touch `opt/` is unknown (external-context/summary.md).
- Licensing: `ESHBridge.jar` is not open source, which limits redistribution and modification.

---

## Migration Goal

**Retain `opt/` unchanged as an opaque backend asset and make its UI-facing contract explicit for the nextGen UI.**

No code in `opt/` is rewritten. The goal is to document how the `.ftl` templates are rendered and who consumes them, capture the `/pages/jpages/*` contract (endpoints, parameters, session handling, response fragments), and decide per screen whether the nextGen UI embeds the fragment through the strangler shell or later gets a native replacement.

---

## Decision

### Approach: Retain (document and contract-capture; wrap only on demand)

Keep `opt/` in place. The nextGen UI embeds the Freemarker fragments through the existing shell (`updateContent` and `CreateCPPopup`) during the first phases. No `.ftl` change is made unless a nextGen UI phase replaces a specific screen, and then the replacement is a native UI component calling the same `jpages` endpoint or a new JSON endpoint, not an edit of the template. Black-box contract capture of the endpoints comes before any replacement.

**Rationale**: (1) The templates are rendered by closed Java code (Freemarker is bundled in the jars) and the model objects (`accessPoint.*`, `dataSource.*`, `diagram.*`, `group.*`) are not visible in this repo, so edits cannot be tested or safely built. (2) 25 files, 68 MB of binaries and no source mean the effort to reimplement is unbounded without upstream eQ-3 sources. (3) The features (HmIP access points, diagrams, groups, coupling) are functionally important and have no JSON-RPC equivalent (webui-api has no group or diagram endpoints beyond those proxied here). (4) The packaging repo and OCI/HA/Helm deployments depend on current file paths and port contract. (5) Zero test coverage makes behaviour changes high-regression.

### Rejected Options

- **Replace (rewrite pages and servers)**: needs upstream source or full black-box capture; very high effort and risk; no evidence that the nextGen UI needs it.
- **Minimal-change (edit `.ftl` in place for escaping, `sid` handling, styling)**: attractive for the XSS and theming fixes, but templates are rendered by closed code and cannot be verified here. Keep as a fallback per screen only after the render pipeline is documented and a test harness exists.
- **Wrap now (new JSON facade over `jpages` and server-side re-render)**: premature. Defer until the contract is captured and the screen is scheduled in the nextGen UI roadmap.
- **Drop (remove the pages from the nextGen UI)**: breaks HmIP access point, diagram, group and coupling features with no substitute.

---

## Technology Stack

| Aspect | Source | Target |
|--------|--------|--------|
| Languages | Java (closed, prebuilt jars; JDK 8 and JDK 21), Freemarker templates (HTML+JS), XML, JSON-like `.dit`, Java properties | Unchanged for Java and data files. Java 8 jars (`HMServer.jar`, `hmip-copro-update.jar`) are upstream's decision to move to Java 21 LTS (HMIPServer already runs it). Templates: unchanged in this phase. |
| Frameworks | Vert.x, Netty, Guice, Jackson, Freemarker, Log4j2 (all bundled); client side jQuery, Prototype, Knockout, jqPlot | Unchanged server-side. Client side: retire Prototype and jqPlot only when a screen is natively replaced. |
| Infrastructure | Copied as-is into rootfs via CMake `assets` component; GitHub Actions CI (x86_64 only) | Preserve CMake asset copy, rootfs paths `/opt/HMServer`, `/opt/HmIP`, and the OpenCCU Buildroot packaging. Add CI presence and checksum checks for all four jars and the data files. |

---

## Scope

**Mode**: targeted

### Included Components

- `opt/HMServer/pages/*.ftl` (17 templates): inventory, rendering and consumer documentation, contract capture
- `opt/HMServer/groups/groupdefinitions.xml`, `opt/HMServer/measurement/templates.dit`
- `opt/HmIP/legacy-parameter-definition.config`, `opt/HmIP/crrfd.fwfix`
- Jars `HMServer.jar`, `HMIPServer.jar`, `ESHBridge.jar`, `hmip-copro-update.jar`: provenance and verification only (no content change)
- `cmake/Components.cmake:136-147` asset copy functions, `tests/test-components.py:87-89`, `.github/workflows/ci.yml:188`

### Excluded Components

- Reimplementation of any Java server behaviour
- `src/webui` shell and JSON-RPC API (covered by `webui-*` and `webui-api` plans)
- rfd/hs485d/multimacd daemons (separate feature plans)
- `etc/config_templates/crRFD.conf` content beyond the two `/opt/HmIP` path references

### Critical Components

- `AccessPointManagementListPage.ftl`, `EditAccessPointSettingsDialog.ftl`, `NewAccessPointDialog.ftl`, `DeleteAccessPointDialog.ftl` (HmIP onboarding and rescue)
- `GroupEditPage.ftl`, `GroupListPage.ftl` and `groupdefinitions.xml` (heating group definition; used by `easymodes/js/Group.js` and `ic_ifacecmd.cgi`)
- `DiagramControlListPage.ftl` (51 KB, largest; jqPlot) and `templates.dit`
- `legacy-parameter-definition.config` (XML-RPC legacy presentation of HmIP devices to ReGa and WebUI)

### Boundaries

- The `/pages/jpages/*` HTTP contract and `sid` handling are owned by the closed servers. The nextGen UI is a client of them.
- `crRFD.conf` absolute paths `/opt/HmIP/*` must keep resolving.
- Files are binary or encoding sensitive (jars; ISO-8859-1 config). Tooling must not re-encode or reformat them.

---

## Dependencies

### Internal

- `webui-*` SPA shell: `www_source/webui/js/pages/systemconfig/{creatediagrampage,devicefirmware,diagramcontrollistpage,creategrouppage,createtestpage}.js`, `www_source/webui/js/groups/deviceInboxGroupHandling.js`
- `src/webui/www/config/easymodes/js/Group.js` and `src/webui/www/config/ic_ifacecmd.cgi` (`CreateCPPopup("/pages/jpages/group/configureDevices", ...)`)
- `etc/config_templates/crRFD.conf:11,18` (paths to `crrfd.fwfix` and `legacy-parameter-definition.config`)
- `etc/config_templates/log4j2.xml` (runtime logging override; jars embed defaults)
- `cmake/Components.cmake`, `tests/test-components.py`, `.github/workflows/ci.yml`
- i18n tables resolved outside `opt/` (`translateKey`, `${diagramTemplateN}`, `Heating_Control`)

### External

- eQ-3 upstream (Jenkins `HM-CCU2-HmIP-Server`, Maven artefacts): the only source of the jars
- OpenCCU Buildroot packaging repo: JVM launch, ports (hs485d 32000, rfd 32001, legacy API 32010), HTTP routing
- `secgtw.homematic.com:8443` (HmIP key server, via `crRFD.conf`)
- Hue and Lightify gateways via ESHBridge (`CouplingDialog.ftl`)
- `/dev/mmd_hmip` via multimacd for the HmIP radio

---

## Constraints

### Unchanged

- Jar contents and filenames under `/opt/HMServer` and `/opt/HmIP`
- `/pages/jpages/*` endpoint paths, query parameters and `sid` semantics
- `legacy-parameter-definition.config` byte encoding (ISO-8859-1) and key set
- `crrfd.fwfix` and `groupdefinitions.xml` structure (read by closed code)
- CMake `assets` install component and `BUILD_HMSERVER` / `BUILD_HMIP_TOOLS` gating
- Rootfs path layout expected by `crRFD.conf` and the packaging repo

### Integration Systems

- HMIPServer and HMServer (Java, closed), including Freemarker template rendering
- ReGaHss and Tcl XML-RPC clients consuming the legacy API at port 32010
- rfd (2001) and hs485d (2000) via the OpenCCU port contract
- OpenCCU packaging repo (pins this repo by SHA)

---

## Risks

| Severity | Description | Mitigation | Evidence |
|----------|-------------|------------|---------|
| high | The render pipeline and consumer set of the `.ftl` files are undocumented: the launch config, template lookup path and URL routing live outside this repo, so a nextGen UI change can break the pages silently. | Document the pipeline first (Phase 0) by inspecting the packaging repo and a running image; capture each endpoint's request and response. | opt.md "Dependencies and coupling"; plan-context External constraint |
| high | No automated tests for the pages, `jpages` endpoints or data files; CI checks only `HMServer.jar` presence. | Add presence and checksum checks for all jars and data files; add contract smoke tests against a running container. | opt.md "Build and packaging integration"; testing.md |
| high | Closed, non-reproducible binaries (68 MB, `1.5.1-SNAPSHOT`, ESHBridge not open source) block fixes and source-level review. | Record provenance (Jenkins build, version, checksum) per jar; request upstream sources or an API description from eQ-3. | opt.md "Jars"; `www/rega/licenseinfo.htm:13889-13893` |
| medium | Unescaped Freemarker output in JS literals and `sid` in URLs create an XSS and session-leak surface when the pages are embedded in the nextGen UI. | Mitigate at the shell (CSP, embed through an isolated container, never inline-eval fragments); escalate to upstream; edit `.ftl` only after a test harness exists. | opt.md "Notes and debt markers" |
| medium | Fragments depend on legacy globals and libraries (Prototype, Knockout, jqPlot, `WebUI.*`, `translateKey`, `dlgPopup`) that the nextGen shell may drop. | Keep a compatibility layer in the shell for these globals until each screen is replaced; list the globals used per template. | opt.md "Freemarker pages" |
| medium | Config files with encoding or key-case sensitivity (`legacy-parameter-definition.config` ISO-8859-1, duplicate `HMIP-eTRV-2` / `HmIP-eTRV-2` keys) are easy to corrupt with editors or formatters. | Mark as binary-like in `.gitattributes`/`.editorconfig`; add a checksum and an encoding check to CI. | opt.md "legacy-parameter-definition.config" |
| medium | Mixed JDK baselines (JDK 8 servers coexisting with JDK 21), so the runtime image needs both JREs. | Track as a packaging follow-up with the OpenCCU repo; do not change here. | opt.md "Migration-relevant observations" |
| low | The packaging repo may patch or overlay files in `opt/` (unknown); an SHA bump would then conflict. | Grep the OpenCCU patches and overlays for `opt/` before any change. | plan-context External constraint |

---

## Success Criteria

- A document exists that explains how the 17 `.ftl` files are rendered (engine, model objects, lookup path, URL routing, session handling) and who consumes each one, verified against a running image.
- All `/pages/jpages/*` endpoints used by the repo's JS and CGI clients are listed with method, parameters and response type, and each is marked as embedded, wrapped or to be replaced in the nextGen UI roadmap.
- `opt/` content is bit-identical before and after the nextGen UI work unless a documented decision changes a specific file.
- The CI checks assert presence and checksum of all four jars and the data files (not just `HMServer.jar`).
- All existing functionality (access point management, groups, diagrams, coupling, firmware, storage and energy price) keeps working in the nextGen UI, with no regression.
- Security model is equivalent or stronger: the shell embeds the fragments without widening the XSS or `sid` exposure.
- Jar provenance (version, build id, checksum, JDK) is recorded in the repo.

---

## Focus Areas

1. Document how the `.ftl` templates are rendered (engine, template and data lookup paths, model objects, endpoint routing) and who requests them. This is the main documentation gap.
2. Capture the `/pages/jpages/*` contract (about 60 endpoints across access point, group, diagram, coupling, firmware, storage) as a black-box specification.
3. Map the per-template client dependencies (jQuery, Prototype, Knockout, jqPlot, WebUI globals, i18n keys) for the shell compatibility layer.
4. Security review of `sid` in URLs and unescaped interpolation; decide on shell-level mitigation.
5. Provenance and CI verification for all jars and data files; encoding guard for `legacy-parameter-definition.config`.
6. Document the semantics of `crrfd.fwfix` (OEM prefix "MO"), `groupdefinitions.xml` (single heating group type) and `templates.dit`.
7. Decide per screen (embed, wrap, replace) in the nextGen UI roadmap, starting with groups and diagrams.

---

## Consequences

### Positive Outcomes

- The nextGen UI can plan against a documented contract instead of an undocumented closed backend.
- No regression risk to the HmIP, group and diagram features from file changes.
- CI gets broader coverage of the runtime asset payload.
- Clear per-screen roadmap for future native replacements.

### Negative Outcomes

- The legacy libraries (Prototype, Knockout, jqPlot) and the legacy look remain in the embedded screens until replacement.
- The XSS and `sid`-in-URL exposure persists at the source until upstream or a later `.ftl` edit fixes it.
- Opaque binaries and the SNAPSHOT build remain a maintenance and supply-chain risk.
- Contract capture takes effort and needs a running image with HmIP hardware or a simulator.

### Follow-Up Decisions

- Obtain upstream sources, or an API description, for HMServer and HMIPServer from eQ-3.
- Per screen: embed, wrap with JSON facade, or replace natively (group editing and diagrams first).
- Whether to move the `jpages` calls to header-based or cookie-based session ids (requires upstream change).
- Whether to upgrade the JDK 8 jars (`HMServer.jar`, `hmip-copro-update.jar`) to JDK 21 (upstream and packaging decision).
- Whether to move the repo to Git LFS or a release-artefact fetch for the jars.

---

## Source Documents

- `.migration/plan-context.md` (shared engagement context)
- `.migration/docs/modules/opt.md` (module documentation)
- `.migration/docs/index.json`
- `.migration/docs/cross-cutting/technical-debt.md`
- `.migration/docs/cross-cutting/testing.md`
- `.migration/docs/cross-cutting/security.md`
- `.migration/docs/cross-cutting/integration-seams.md`
- `.migration/docs/external-context/summary.md`
- `.migration/plan/webui-api.plan.md` (for the JSON-RPC boundary)
- Repo checks: `grep jpages` over `src/webui` (consumer list), directory listing of `opt/`

---

## Approvals

- **Approved by**: pending
- **Approved at**: pending
- **Review iterations**: 0

---

