#!/bin/sh
# install-test.sh - tests install.sh on a fake device (ROOT=...) with two small bundle versions. No CCU needed.
#   sh install-test.sh
# Checks the classification (replace / patch / add / already / skipped / exists) and the upgrade rules: a file the
# installer wrote whole is replaced by a newer bundle, a file it PATCHED is not, a file someone else changed is not.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d /tmp/install-test.XXXXXX); trap 'rm -rf "$T"' EXIT
md5() { md5sum "$1" | cut -d' ' -f1; }
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1: got [$2] want [$3]"; fi; }

# ---- the upstream files, and what OpenCCU has made of one of them on the device
mkdir -p "$T/up/www/api" "$T/dev/www/api" "$T/dev/usr/local" "$T/dev/var/tmp"
printf 'a1\na2\na3\n' > "$T/up/www/api/a.tcl"
printf 'b1\nb2\nb3\nb4\nb5\nb6\n' > "$T/up/www/api/b.tcl"
cp "$T/up/www/api/a.tcl" "$T/up/www/api/b.tcl" "$T/dev/www/api/"
printf 'openccu\n' >> "$T/dev/www/api/b.tcl"           # an OpenCCU rootfs patch on b

# ---- two versions of the bundle: v1 and v2 change a, b (line b2) and add c
mkbundle() { # dir ver
  d=$1; v=$2; mkdir -p "$d/files/www/api" "$d/diffs/www/api"
  printf 'a1\nA-%s\na3\n' "$v" > "$d/files/www/api/a.tcl"
  printf 'b1\nB-%s\nb3\nb4\nb5\nb6\n' "$v" > "$d/files/www/api/b.tcl"
  printf 'c-%s\n' "$v" > "$d/files/www/api/c.tcl"
  for f in a b; do (cd "$T" && diff -u --label "a/www/api/$f.tcl" --label "b/www/api/$f.tcl" "up/www/api/$f.tcl" "$d/files/www/api/$f.tcl" > "$d/diffs/www/api/$f.tcl.diff"); done
  { echo "M www/api/a.tcl $(md5 "$T/up/www/api/a.tcl") $(md5 "$d/files/www/api/a.tcl")"
    echo "M www/api/b.tcl $(md5 "$T/up/www/api/b.tcl") $(md5 "$d/files/www/api/b.tcl")"
    echo "A www/api/c.tcl - $(md5 "$d/files/www/api/c.tcl")"; } > "$d/manifest.txt"
  cp "$HERE/install.sh" "$d/install.sh"; echo "test $v" > "$d/VERSION"
}
mkbundle "$T/v1" v1; mkbundle "$T/v2" v2
run() { ROOT=$T/dev sh "$1/install.sh" "$2" --patch 2>&1; }
line() { echo "$1" | grep '^replace:'; }
D=$T/dev/www/api

# ---- 1. a fresh install: a replaced, b patched, c added
out=$(run "$T/v1" install)
check "fresh install: replace 1, patch 1, add 1" "$(line "$out" | sed 's/  */ /g')" "replace: 1 upgrade: 0 add: 1 patch: 1 already: 0 SKIPPED: 0 missing: 0 exists-different: 0 patched-before: 0"
check "a is the new version" "$(sed -n 2p $D/a.tcl)" "A-v1"
check "b keeps the OpenCCU line and has our change" "$(sed -n 2p $D/b.tcl) $(tail -1 $D/b.tcl)" "B-v1 openccu"
check "c was added" "$(cat $D/c.tcl)" "c-v1"
check "the installer recorded what it wrote (2 whole, 1 patched with its bundle version)" "$(grep -c '^R ' $T/dev/usr/local/webui-api-installed.txt) $(grep -c '^P ' $T/dev/usr/local/webui-api-installed.txt) $(grep -c '^PV ' $T/dev/usr/local/webui-api-installed.txt)" "2 1 1"
bk1=$(ls "$T"/dev/usr/local/webui-api-backup-*.tar | head -1)

# ---- 2. nothing changed: v1 again is all "already"
out=$(run "$T/v1" check)
check "the same bundle again: everything is already installed" "$(line "$out" | sed 's/  */ /g')" "replace: 0 upgrade: 0 add: 0 patch: 0 already: 3 SKIPPED: 0 missing: 0 exists-different: 0 patched-before: 0"

# ---- 3. a newer bundle: a and c are upgraded (ours), b is not (patched onto an OpenCCU file)
out=$(run "$T/v2" check)
check "v2 check: a and c upgrade, b reported as patched before" "$(line "$out" | sed 's/  */ /g')" "replace: 0 upgrade: 2 add: 0 patch: 0 already: 0 SKIPPED: 0 missing: 0 exists-different: 0 patched-before: 1"
check "the report names the file that is not upgraded" "$(echo "$out" | grep -c 'www/api/b.tcl')" "1"
sleep 1
out=$(run "$T/v2" install)
check "a is upgraded" "$(sed -n 2p $D/a.tcl)" "A-v2"
check "c is upgraded" "$(cat $D/c.tcl)" "c-v2"
check "b is NOT touched (still v1 and the OpenCCU line)" "$(sed -n 2p $D/b.tcl) $(tail -1 $D/b.tcl)" "B-v1 openccu"
bk2=$(ls "$T"/dev/usr/local/webui-api-backup-*.tar | tail -1)
check "the backup of the upgrade holds the old a and c" "$(tar -tf "$bk2" | sort | tr '\n' ' ')" "www/api/a.tcl www/api/c.tcl "
check "the upgrade made no entry in the 'added' list" "$(wc -l < "$bk2.added" | tr -d ' ')" "0"
check "installing v2 again is a no-op for a and c" "$(line "$(run "$T/v2" check)" | sed 's/  */ /g')" "replace: 0 upgrade: 0 add: 0 patch: 0 already: 2 SKIPPED: 0 missing: 0 exists-different: 0 patched-before: 1"

# ---- 4. restore the upgrade: a and c are v1 again
ROOT=$T/dev sh "$T/v2/install.sh" restore "$bk2" > /dev/null
check "restore brings back the previous a and c" "$(sed -n 2p $D/a.tcl) $(cat $D/c.tcl)" "A-v1 c-v1"
out=$(run "$T/v2" check)
check "after the restore the history still lets v2 upgrade a and c" "$(line "$out" | sed 's/  */ /g')" "replace: 0 upgrade: 2 add: 0 patch: 0 already: 0 SKIPPED: 0 missing: 0 exists-different: 0 patched-before: 1"

# ---- 5. someone else's change is never overwritten
printf 'a1\nhand-edited\na3\n' > "$D/a.tcl"; printf 'not ours\n' > "$D/c.tcl"
out=$(run "$T/v2" check)
check "a hand-edited file (its lines no longer match the diff) is skipped, an unknown added file is 'exists-different'" "$(line "$out" | sed 's/  */ /g')" "replace: 0 upgrade: 0 add: 0 patch: 0 already: 0 SKIPPED: 1 missing: 0 exists-different: 1 patched-before: 1"

# ---- 6. back to stock by undoing in reverse order, then a clean install of v2
ROOT=$T/dev sh "$T/v2/install.sh" restore "$bk1" > /dev/null
rm -f "$D/c.tcl"
check "undoing the first backup gives the OpenCCU-patched upstream a and b back" "$(sed -n 2p $D/a.tcl) $(sed -n 2p $D/b.tcl)" "a2 b2"
out=$(run "$T/v2" check)
check "a clean device: v2 is a normal fresh install again" "$(line "$out" | sed 's/  */ /g')" "replace: 1 upgrade: 0 add: 1 patch: 1 already: 0 SKIPPED: 0 missing: 0 exists-different: 0 patched-before: 0"

echo; echo "$pass PASS, $fail FAIL"; [ "$fail" = 0 ]
