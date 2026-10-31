---
id: GP-PROJ-002
title: "lib/ holds only prebuilt shared libraries"
severity: OBS
applies_to: explore
check: 4
status: candidate
source_repo: OpenCCU-Base
discovered_at: 2026-10-09
confirmed_at: null
observations: 2
---

`lib/<arch>/*.so` (40 files) contains no source. Its absence from file_index is not a source coverage gap. Still recommend indexing it, because the www Tcl layer depends on tclrega.so and tclrpc.so at runtime.
