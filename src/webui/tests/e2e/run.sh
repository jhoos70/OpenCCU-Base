#!/bin/sh
# Run the classic UI smoke test in a Playwright container (nothing is installed on the host).
#   CCU_PASS=Admin ./run.sh http://127.0.0.1:18080 report.json [screenshot-dir]
# The container uses host networking so that 127.0.0.1 reaches a CCU container published on loopback.
set -e
base="$1"; out="$2"; shots="$3"
[ -n "$base" ] && [ -n "$out" ] || { echo "usage: CCU_PASS=... $0 <base-url> <report.json> [shots-dir]" >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
docker image inspect ccu-e2e:local >/dev/null 2>&1 || docker build -q -t ccu-e2e:local "$here"
outdir="$(cd "$(dirname "$out")" && pwd)"
set -- --base "$base" --user "${CCU_USER:-Admin}" --password "${CCU_PASS:?set CCU_PASS}" --out "/out/$(basename "$out")"
[ -n "$shots" ] && mkdir -p "$shots" && set -- "$@" --shots /shots
exec docker run --rm --network host -v "$here":/w -v "$outdir":/out ${shots:+-v "$(cd "$shots" && pwd)":/shots} -w /w ccu-e2e:local python classic_smoke.py "$@"
