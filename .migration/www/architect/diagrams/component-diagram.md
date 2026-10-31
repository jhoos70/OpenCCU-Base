# Component Diagram

**What's shown**: Components that produce and guard the staged web root after www/ is removed
**Architectural style**: Keep current architecture (refactor in place)
**Key decisions reflected**: Q2, Q-DEPLOY, Q-GUARD, Q-REACT

```mermaid
flowchart LR
  subgraph SRC[Sources in git]
    A[src/webui/www]
    N[src/webui/www/ngui<br/>React slot]
    R[src/webui/rega/www]
    G[src/webui/www_source]
    D[src/devicetypes]
  end
  C1[C1 Web Root Staging<br/>webui-assets]
  C2[C2 Generated Asset Pipeline]
  C3[C3 Devicetype Asset Staging]
  S[(Staged web root<br/>ROOTFS_DIR/www)]
  C4[C4 make deploy<br/>no www]
  C5[C5 CI verification]
  C6[C6 www-guard + docs]
  O[OpenCCU Buildroot repo]
  A --> C1
  N --> C1
  R --> C1
  G --> C2
  D --> C3
  C1 --> S
  C2 --> S
  C3 --> S
  S --> C5
  S --> O
  S -.local copy only.-> C4
  C6 -.fails if www/ tracked.-> C5
```

**Legend**: solid arrow = build-time copy or generation; dotted = checks or optional flow.

## Differences from Current State

Repo-level `www/` is no longer part of the picture; `make deploy` stops writing the web root; a guard and an `ngui` slot are added.

## Design Rationale

Single source for both UIs (Q2). Guard is a CI step (Q-GUARD). The `ngui` slot reuses the existing copy step (Q-REACT).
