---
id: GP-PROJ-003
title: "accuracy_check false positives for ../-relative and brace-expanded paths"
severity: OBS
applies_to: explore
check: 6
status: candidate
source_repo: OpenCCU-Base
discovered_at: 2026-10-09
confirmed_at: null
observations: 1
---

The deep-explore accuracy verifier resolves file_exists claims from the repo root. In the docs here, paths are often relative to a subtree, for example `../www/config/...` written from `src/webui/www_source/`, or use shell brace expansion such as `old/lock_{open,closed}.png`. When the target files exist after the path is resolved in context, treat the failed claim as a verifier false positive and not a documentation defect. Related: GP-PROJ-001 (methods.conf SCRIPT_FILE relative paths).
