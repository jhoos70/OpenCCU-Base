---
id: GP-PROJ-001
title: "methods.conf SCRIPT_FILE values resolve under www/api/methods/"
severity: OBS
applies_to: explore
check: 6
status: candidate
source_repo: OpenCCU-Base
discovered_at: 2026-10-09
confirmed_at: null
observations: 1
---

The scripted accuracy check reports `SCRIPT_FILE interface/dispatch.tcl` as a missing file. The value is relative to `www/api/methods/` (and to `src/webui/www/api/methods/`), and both files exist. Treat this as a verifier false positive, not a documentation defect.
