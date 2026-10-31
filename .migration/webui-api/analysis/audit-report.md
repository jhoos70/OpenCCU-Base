# Audit Report

Verdict: PASS_WITH_WARNINGS
Target: analysis
Artifact: .migration/webui-api/analysis/analysis.json
Checks passed: 6/7
Critical issues: 0
Warnings: 1

## Summary

This is round 2, after remediation. The analysis now has 47 stories, 18 CFs, 24 entities, 18 external systems, 41 NFRs and 32 evidence gaps. The round-1 critical issue and three of the four round-1 warnings are resolved:

- SP020, SP021 and SP023 now have failure requirements, and they match the source.
- The SP003 `class: null` is gone.
- Duplicate control flows and external systems are merged, and every CF component now starts with `src/webui/www/`.

One warning remains. The entity merge joined the two attribute lists without deduplicating them, so ReGaSession and EventSubscriber each list the same field under two names. In ReGaSession, the two copies of the privilege-level field also disagree on `nullable`.

Every round-1 source verification still applies; the source files are unchanged:

- lock_tryget always returns 1 (`common.tcl:100`)
- Event.subscribe loads a missing `common/checksid.hms`
- the DOCUMENT_ROOT check decides central mode (`homematic.cgi:28`)
- `setinstallmodehmip.tcl:72` contains `set $on 0`
- backup CGIs fail open
- CCU.createFile runs at GUEST level

## Check Results

### Check 1: Schema Compliance - PASS

- Severity: n/a
- Evidence: A manual walk of the schema finds 0 violations: the 8 required keys are present, there are no extra properties, the patterns and enums are valid, and SP003.source has no `class` key. The producer's `validate-analysis.js` also reports a pass.
- Remediation: none
- Principles applied: none

### Check 2: User Story Integrity - PASS

- Severity: n/a
- Evidence: SP001-SP047 are unique and sequential, the source objects are valid, start <= end, the input/output shapes are typed, and every story has at least one happy-path and one failure requirement. The new failure requirements are correct against source:
  - SP020: error 402 when a required argument is missing (`homematic.cgi:127-130`), and 601 "TCL error" when the XML-RPC call fails (`interface/dispatch.tcl:132-136`).
  - SP021: 400 "access denied" for a session below ADMIN (`homematic.cgi:114-115`; `methods.conf:336-342` LEVEL ADMIN), and 601 when deleteDevice fails.
  - SP023: 601, or internal error 200 when a file read fails. `getlgwconnectionstatus.tcl:18` calls `open` without catching errors, and `homematic.cgi:155` reports such errors as 200.
  - SP024 already had a failure path: "No metadata available" when the objectId cannot be resolved.
- Remediation: none. Two optional OBS fixes:
  - SP020 calls 402 "invalid parameters"; the source message is "missing argument".
  - SP023 attributes the file-access failure to "getLGWStatus"; it is actually in getLGWConnectionStatus.

  The new failure requirements also have no file:line citations.
- Principles applied: none

### Check 3: Source Evidence Spot-Check - PASS

- Severity: n/a
- Evidence: Round 1 verified 13 of 13 sampled anchors. Round 2 re-checked that all 47 source files exist under `src/webui/www/` and that every line range is within its file, counting lines with CR, CRLF and LF endings normalised. Round 2 also verified 4 new anchors: `homematic.cgi:127-130`, `dispatch.tcl:132-144`, `getlgwconnectionstatus.tcl:14-22` and `methods.conf:336-342`.
- Remediation: none
- Principles applied: none (GP-PROJ-004 is still a candidate)

### Check 4: Control Flow Completeness - PASS

- Severity: n/a
- Evidence: CF001-CF018 are sequential with no gaps. Every flow has a summary, entry_point.component/function, a boolean `affected_by_migration`, and a `migration_impact`, and every component starts with `src/webui/www/`. The text contains no stale references to CF019-CF022. The diagram files `cf001`-`cf018` line up with the renumbered IDs; for example, `cf009` is now hasLinksOrPrograms. The previous duplicates are gone: CF003 (event queue), CF008 (hmscript), CF002 (login) and CF001 (dispatch plus privilege gate).
- Remediation: none. OBS: some `entry_point.function` values are still descriptions such as "(script body)" or "lines 26-76" rather than function names. This is acceptable for Tcl scripts that have no proc.
- Principles applied: none

### Check 5: External System Coverage - PASS

- Severity: OBS
- Evidence: There are 18 entries, each with a name, type and description. ReGaHss, the ReGa login endpoint and the Tcl packages each appear only once now. The libraries without contracts (tar, Tcl md5, the Tcl runtime) are allowed to omit them.
- Remediation: OBS only. The merged ReGaHss `error_contract` is three source texts joined with " | ", and parts of it repeat each other. One consolidated sentence would read better: rega_exec and hmscript_run return '' on failure, which is treated as denied in checkPrivilegeLevel, fail-open in the backup CGIs, and as null, '""' or 500 in the methods.
- Principles applied: none

### Check 6: Entity Consistency - FAIL

- Severity: warning
- Evidence: There are 24 entities. Every `related_specs` entry resolves, and the ER diagram has 24 matching blocks. However, two merged entities list the same attributes under different names:
  - **ReGaSession**:
    - `sessionId` and `session_id` are the same field.
    - `uid` and `userId` are the same field.
    - `upl` and `userPrivilegeLevel` are the same field, but `upl` has `nullable: true` while `userPrivilegeLevel` has `nullable: false`. The source returns 0 for an unknown session (`getupl.hms`), so `nullable: false` with default 0 is the correct value.
  - **EventSubscriber**:
    - `id` and `sid` are the same field.
    - `event record` duplicates `TYPE` and `DATA`.
- Remediation: Keep one canonical attribute per field: `sessionId`, `userId` and `userPrivilegeLevel` (nullable false, 0 when the session is unknown), plus the display fields; and `sid`, `EVENT_COUNT`, `TYPE` and `DATA`. Combine the constraint text of each duplicate pair into the canonical attribute, then regenerate `diagrams/entity-relationships.md`.
- Principles applied: none

### Check 7: Behavioral Evidence - PASS

- Severity: OBS
- Evidence: All 47 stories have non-empty requirements and edge cases, and every requirement contains GIVEN and THEN. Cosmetic: the last SP043 requirement starts "GIVEN WHEN Room.listProgramIds ...", with an empty GIVEN clause.
- Remediation: Optionally fill in the precondition, for example "GIVEN a GUEST session".
- Principles applied: GP-005

## Round-1 Findings Status

| ID | Status |
|---|---|
| ANA-webui-api-2026-10-10-01 (Check 2 critical) | resolved |
| ANA-webui-api-2026-10-10-02 (SP003 class null) | resolved |
| ANA-webui-api-2026-10-10-03 (duplicate CFs, prefixes) | resolved |
| ANA-webui-api-2026-10-10-04 (duplicate external systems) | resolved |
| ANA-webui-api-2026-10-10-05 (duplicate entities) | partially resolved: entities merged, attributes not deduplicated (R2-01) |
| ANA-webui-api-2026-10-10-07 (non-GWT requirements) | resolved (SP043 cosmetic remains) |

## Project Memory Updates

- Findings appended: 3
- Golden dataset examples appended: 1
- Project decisions proposed or reinforced: 0
