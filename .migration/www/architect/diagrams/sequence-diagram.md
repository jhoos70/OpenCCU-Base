# Sequence Diagram

**What's shown**: Cutover sequence from verification to sibling pin bump
**Architectural style**: Keep current architecture (refactor in place)
**Key decisions reflected**: Q-GUARD, Q-DEPLOY

```mermaid
sequenceDiagram
  participant Dev as Maintainer
  participant CI as GitHub Actions
  participant Git as git
  participant Sib as OpenCCU repo
  Dev->>CI: Phase 0 build staged root, save manifest
  Dev->>Git: Phase 1 Makefile deploy skips www, docs updated
  Dev->>Git: Phase 2 tag www-snapshot-date
  Dev->>Git: Phase 3 git rm -r www + www-guard step
  Git->>CI: build 4 platforms
  CI->>CI: compare manifest with Phase 0
  alt manifests identical
    CI-->>Dev: green
    Dev->>Sib: Phase 4 update pin, check-openccu-base
    Sib-->>Dev: patches validate
  else manifest differs
    CI-->>Dev: red
    Dev->>Git: git revert Phase 3
  end
```

**Legend**: alt/else = pass or rollback path.

## Differences from Current State

The cutover itself is new; today there is no verification or guard.

## Design Rationale

Manifest proof gates the irreversible-in-practice step; rollback is a single revert.
