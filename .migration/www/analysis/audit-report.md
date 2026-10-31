# Audit Report

Verdict: PASS_WITH_WARNINGS
Target: analysis
Artifact: .migration/www/analysis/analysis.json
Checks passed: 7/7
Critical issues: 0
Warnings: 2

## Summary

This is the second audit run, after remediation. The first run returned FAIL with 1 critical issue and 5 warnings.

What is fixed:
- The critical issue is resolved: SP001-SP004 now each carry a failure GIVEN/WHEN/THEN requirement.
- W1 is fixed. SP009 and CF007 cover `devicetypes-assets` (`src/devicetypes/CMakeLists.txt:10-12`), and the feature_description and NFR-001 now name it.
- W2 is fixed: the 1ba5c642 citation is corrected.
- W3 is fixed: the only-in-www count is now 30.
- W5 is fixed. ReGaHss is now in `external_systems`. licenseinfo.htm is reclassified, and the sibling regeneration claim checks out at `openccu-base.mk:210-212`.

What is left: 2 residual inconsistencies, both warnings. The external_systems entry for the sibling still describes a rega.tcl CRLF patch, and NFR-002 now cites the wrong lines. CF001 still calls webui-assets the "sole producer".

## Check Results

### Check 1: Schema Compliance - PASS

- Severity: critical
- Evidence: A strict manual walk found no errors. There are 8 top-level keys, no extras, and all patterns and types are valid across 9 stories, 7 CFs and 5 NFRs.
- Remediation: none
- Principles applied: none

### Check 2: User Story Integrity - PASS

- Severity: critical
- Evidence:
  - SP001-SP009 are unique and match the pattern. Goals, sources and typed shapes are present, and every story has `line_start <= line_end`.
  - The new failure requirements:
    - SP001 req 4: missing source dir makes copy_directory fail.
    - SP002 req 4: tclsh/python3 unavailable or a generator failing makes the target fail.
    - SP003 req 4: create_symlink failing.
    - SP004 req 3: `install(DIRECTORY)` fails when `${ROOTFS_DIR}/www/` is missing; tests/test-components.py:117 creates `www/keep` to avoid that.
    - SP009 req 3: a missing source makes copy_if_different fail.
  - SP005-SP008 already had failure or defect requirements.
- Remediation: none
- Principles applied: GP-005

### Check 3: Source Evidence Spot-Check - PASS

- Severity: critical
- Evidence: All 9 anchors are in range and relevant (100%). The new SP009 anchor (`src/devicetypes/CMakeLists.txt:10-12`) matches the make_directory command and the two copy_if_different commands for st_values.cgi and st_values.js. The SP005 commit text now matches `git show --stat 1ba5c642`. The SP001 count of 30 matches the recount.
- Remediation: none
- Principles applied: none

### Check 4: Control Flow Completeness - PASS

- Severity: warning
- Evidence: CF001-CF007 are sequential with complete fields.
- Remediation: none for structure; see W-B for the inconsistent CF001 wording.
- Principles applied: none

### Check 5: External System Coverage - PASS

- Severity: warning
- Evidence: All 5 entries have name/type/description. The 4 integrations carry the 5 contract fields. ReGaHss is now present (`/rega/*`, `/licenseinfo.htm`).
- Remediation: none for structure; see W-A.
- Principles applied: none

### Check 6: Entity Consistency - PASS

- Severity: warning
- Evidence: All 5 entities are complete. related_specs all resolve. The OpenCCUBasePin path is fixed (`/home/standard/dev/OpenCCU/buildroot-external/package/openccu-base/openccu-base.mk`, pin at line 7). generated_files is reclassified.
- Remediation: none
- Principles applied: none

### Check 7: Behavioral Evidence - PASS

- Severity: warning
- Evidence: All 9 stories have non-empty requirements (3-4) and edge_cases (1-3).
- Remediation: none
- Principles applied: none

## Additional Findings (content accuracy)

### W-A - The sibling CRLF / rega.tcl claim is only partly fixed (warning)

- Evidence:
  - `external_systems[0].description` still says "one on tcl/eq3/rega.tcl with CRLF". Its `error_contract` still says the build fails "if generated webui.js or rega.tcl change shape". No sibling patch touches rega.tcl.
  - NFR-002's text is now correct, but its source cites `prepare_patch_input.sh:7-11`. Those lines are `die()` and argument parsing. The CR strip is at lines 51-55 (`sed -i.bak 's/\r$//' "$rega_tcl"`), and `rega_tcl` is defined at line 13.
- Remediation:
  - Remove the rega.tcl patch claim from `external_systems[0].description`.
  - Limit the `error_contract` to webui.js line structure.
  - Change the NFR-002 source to `prepare_patch_input.sh:13,51-55`.

### W-B - CF001 still says "sole producer" (warning)

- Evidence: CF001 `migration_impact` begins "This is the sole producer of the shipped web root". That contradicts CF007 ("Third producer of the staged web root"), SP009 and the updated feature_description.
- Remediation: Reword it to say CF001 is "the primary producer; together with CF002 and CF007 it forms the manifest baseline".

### Observations (OBS, no verdict impact)

- `evidence_gaps[4]` (licenseinfo.htm) can now be closed. `openccu-base.mk:210-212` runs `createLicenseHtml.py --output=$(TARGET_DIR)/www/rega/licenseinfo.htm`, and SP006 already states this as fact.
- SP001 `edge_cases[0]` ("same-named files from rega/www win") never happens: src/webui/www has no `rega/` folder.
- NFR-005 `source` is still a command, not a `file:line`.
- SP008 calls README.md:30 the sole www/ doc reference. `cmake/README.md:33,100` also documents `make deploy` writing back into the repo, and the plan scope covers that file.

## Project Memory Updates

- Findings appended: 3
- Golden dataset examples appended: 1
- Project decisions proposed or reinforced: 0
