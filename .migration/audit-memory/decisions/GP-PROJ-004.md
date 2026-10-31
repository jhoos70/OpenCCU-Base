---
id: GP-PROJ-004
title: "CR-only line terminators make line ranges look out of range"
severity: OBS
applies_to: both
check: 3
status: candidate
source_repo: OpenCCU-Base
discovered_at: 2026-10-10
confirmed_at: null
observations: 1
---

`src/webui/www/api/backup/{binfile,tarfile,textfile,version}.cgi` use classic-Mac CR-only line terminators. `wc -l` and line-based tools report 1 line, so a cited range such as `binfile.cgi:7-26` looks out of range. Count lines with `tr '\r' '\n' < file | cat -n` before you flag a range violation. Other files in the same tree use CRLF (common.tcl, run-script.cgi), and some use ISO-8859-1 (see repo-facts.md).
