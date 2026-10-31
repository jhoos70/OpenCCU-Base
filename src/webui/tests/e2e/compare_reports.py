#!/usr/bin/env python3
"""Diff two classic_smoke.py reports (a = reference, b = candidate); exit 1 on any difference."""
import json, sys

a, b = (json.load(open(f)) for f in sys.argv[1:3])
diffs = 0
for label in sorted(set(a["pages"]) | set(b["pages"])):
    pa, pb = a["pages"].get(label), b["pages"].get(label)
    if pa is None or pb is None:
        print("%-20s only in %s" % (label, "b" if pa is None else "a")); diffs += 1; continue
    for key in ("reachable", "text", "http", "rpc", "console"):
        if pa[key] != pb[key]:
            diffs += 1
            print("%-20s %s differs\n    a: %s\n    b: %s" % (label, key, str(pa[key])[:200], str(pb[key])[:200]))
print("%d page(s) compared, %d difference(s)" % (len(set(a["pages"]) | set(b["pages"])), diffs))
sys.exit(1 if diffs else 0)
