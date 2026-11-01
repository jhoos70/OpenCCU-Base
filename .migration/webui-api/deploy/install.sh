#!/bin/sh
# install.sh - install the webui-api bundle on a TEST CCU / OpenCCU, or undo it.
#
#   ./install.sh check                  report what would happen; changes nothing
#   ./install.sh install [--patch]      back up the touched files, then install
#   ./install.sh restore BACKUP.tar     put the backed-up files back and remove the added files
#
# Environment
#   ROOT=/some/dir   operate on a copy of the file system (used by the tests); default is the real /
#   BACKUP_DIR=dir   where the backup goes (default $ROOT/usr/local)
#
# Per file the manifest records the md5 of the upstream version and of the new version:
#   device file == upstream   replaced by the new version
#   device file == new        left alone (already installed)
#   device file differs       NOT touched: it was changed on the device, typically by an OpenCCU
#                             rootfs patch. With --patch the difference between upstream and the
#                             new version is applied as a patch instead, if it applies cleanly.
#   file does not exist       added (new files) or reported (expected file missing)
# Upgrading: after an install the md5 of every file the installer wrote is recorded in
#   $BACKUP_DIR/webui-api-installed.txt ("R <file> <md5>" written whole, "P <file> <md5>" patched, "PV <file> <md5> <bundle md5>"
#   which bundle version the patch came from). A later run
#   replaces a file whose md5 is one it recorded as written whole (it is ours, not an OpenCCU patch), and says
#   so ("upgrade"). A file it PATCHED earlier is not replaced (that would drop the OpenCCU changes it was
#   patched onto): restore the older backup first, then install.
# POSIX sh / busybox compatible. Not for production systems.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${ROOT:-}
MAN=$HERE/manifest.txt
BACKUP_DIR=${BACKUP_DIR:-$ROOT/usr/local}
STATE=$BACKUP_DIR/webui-api-installed.txt
CMD=${1:-}
PATCH=0
BK=
case "$CMD" in
  check|install) shift; for a in "$@"; do [ "$a" = "--patch" ] && PATCH=1; done ;;
  restore) BK=${2:-} ;;
  *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

md5() { md5sum "$1" 2>/dev/null | cut -d' ' -f1; }
# did an earlier run of this installer record this md5 for this file? (kind R: written whole, P: patched)
recorded() { [ -f "$STATE" ] && grep -qx "$1 $2 $3" "$STATE"; }
die() { echo "ERROR: $*" >&2; exit 1; }
clear_caches() { rm -f "$ROOT/var/tmp/api_registry.cache" "$ROOT/var/tmp/api_validate.cache" "$ROOT/var/tmp/api_ipc.cache"; }

if [ "$CMD" = restore ]; then
  [ -n "$BK" ] && [ -f "$BK" ] || die "usage: install.sh restore BACKUP.tar"
  tar -C "$ROOT/" -xf "$BK" || die "cannot extract $BK"
  if [ -f "$BK.added" ]; then
    while read -r dev; do [ -n "$dev" ] && rm -f "$ROOT/$dev"; done < "$BK.added"
  fi
  rmdir "$ROOT/www/api/v2" "$ROOT/www/api/schema" 2>/dev/null
  clear_caches
  echo "restored from $BK"
  exit 0
fi

[ -f "$MAN" ] || die "manifest.txt not found next to install.sh"
TMPD=$(mktemp -d /tmp/webui-api.XXXXXX) || die "cannot create a temp directory"
trap 'rm -rf "$TMPD"' EXIT INT TERM
for f in replace add skip already missing exists patchok upgrade patched_before; do : > "$TMPD/$f"; done

# BusyBox patch (the CCU) has no -d, --dry-run or -s: run it from inside a directory, and test a diff
# by applying it to a temporary copy of the file.
patch_applies() { # dev
  rm -rf "$TMPD/dry"; mkdir -p "$TMPD/dry/$(dirname "$1")" || return 1
  cp "$ROOT/$1" "$TMPD/dry/$1" || return 1
  (cd "$TMPD/dry" && patch -p1 < "$HERE/diffs/$1.diff" > /dev/null 2>&1)
}

# ---- plan
while read -r cls dev lmd5 nmd5; do
  [ -n "$cls" ] || continue
  dst=$ROOT/$dev
  if [ "$cls" = A ]; then
    if [ -e "$dst" ]; then
      cur=$(md5 "$dst")
      if [ "$cur" = "$nmd5" ]; then echo "$dev" >> "$TMPD/already"
      elif recorded R "$dev" "$cur"; then echo "$dev" >> "$TMPD/upgrade"
      else echo "$dev" >> "$TMPD/exists"; fi
    else
      echo "$dev" >> "$TMPD/add"
    fi
  else
    if [ ! -f "$dst" ]; then
      echo "$dev" >> "$TMPD/missing"
    else
      cur=$(md5 "$dst")
      if [ "$cur" = "$nmd5" ]; then
        echo "$dev" >> "$TMPD/already"
      elif [ "$cur" = "$lmd5" ]; then
        echo "$dev" >> "$TMPD/replace"
      elif recorded R "$dev" "$cur"; then
        echo "$dev" >> "$TMPD/upgrade"
      elif recorded PV "$dev" "$cur $nmd5"; then
        echo "$dev" >> "$TMPD/already"           # patched earlier from this very bundle version
      elif recorded P "$dev" "$cur"; then
        echo "$dev" >> "$TMPD/patched_before"
      elif [ "$PATCH" = 1 ] && patch_applies "$dev"; then
        echo "$dev" >> "$TMPD/patchok"
      else
        echo "$dev" >> "$TMPD/skip"
      fi
    fi
  fi
done < "$MAN"

count() { wc -l < "$TMPD/$1" | tr -d ' '; }
show() { # list-name title
  if [ -s "$TMPD/$1" ]; then echo; echo "$2 ($(count "$1")):"; sed 's/^/  /' "$TMPD/$1"; fi
}
echo "webui-api bundle: $(tr '\n' ' ' < "$HERE/VERSION" 2>/dev/null)"
echo "target root: ${ROOT:-/}"
echo "replace: $(count replace)  upgrade: $(count upgrade)  add: $(count add)  patch: $(count patchok)  already: $(count already)  SKIPPED: $(count skip)  missing: $(count missing)  exists-different: $(count exists)  patched-before: $(count patched_before)"
show replace "replace (device has the upstream bytes)"
show patchok "patch (device file differs; the difference applies cleanly)"
show upgrade "upgrade (written by an earlier run of this installer; replaced by the new version)"
show add "add (new files)"
show skip "SKIPPED - the device file differs from upstream (probably an OpenCCU patch); not touched"
show missing "missing on the device - not installed"
show exists "exists on the device with different content - not touched"
show patched_before "NOT upgraded - patched by an earlier run onto an OpenCCU-modified file; restore the older backup first, then install"
if grep -qx 'www/api/methods.conf' "$TMPD/skip"; then
  echo
  echo "WARNING: www/api/methods.conf is patched on this device and was NOT replaced. The new code"
  echo "         runs with the OpenCCU registry; the registry changes (privileges, ARGUMENTS) are not"
  echo "         active. Use --patch to try applying them as a diff."
fi
if [ "$CMD" = check ]; then exit 0; fi

# ---- install
touch "$ROOT/www/.webui-api-wtest" 2>/dev/null || die "$ROOT/www is not writable (read-only root file system?). Nothing was changed."
rm -f "$ROOT/www/.webui-api-wtest"
mkdir -p "$BACKUP_DIR" || die "cannot create $BACKUP_DIR"
TS=$(date +%Y%m%d-%H%M%S)
BK=$BACKUP_DIR/webui-api-backup-$TS.tar
cat "$TMPD/replace" "$TMPD/patchok" "$TMPD/upgrade" > "$TMPD/bk.list"
if [ -s "$TMPD/bk.list" ]; then
  tar -C "$ROOT/" -cf "$BK" -T "$TMPD/bk.list" || die "backup failed; nothing was changed"
else
  tar -cf "$BK" -T /dev/null 2>/dev/null || : > "$BK"
fi
cp "$TMPD/add" "$BK.added"
echo
echo "backup: $BK ($(count replace) replaced + $(count upgrade) upgraded + $(count patchok) patched files, $(count add) added)"

fail=0
while read -r dev; do
  [ -n "$dev" ] || continue
  cat "$HERE/files/$dev" > "$ROOT/$dev" || { echo "FAILED to write $dev"; fail=1; }
done < "$TMPD/replace"
while read -r dev; do
  [ -n "$dev" ] || continue
  mkdir -p "$(dirname "$ROOT/$dev")"
  cp -p "$HERE/files/$dev" "$ROOT/$dev" || { echo "FAILED to add $dev"; fail=1; }
done < "$TMPD/add"
while read -r dev; do
  [ -n "$dev" ] || continue
  cat "$HERE/files/$dev" > "$ROOT/$dev" || { echo "FAILED to upgrade $dev"; fail=1; }
done < "$TMPD/upgrade"
while read -r dev; do
  [ -n "$dev" ] || continue
  had_orig=0; [ -e "$ROOT/$dev.orig" ] && had_orig=1
  (cd "$ROOT/" && patch -p1 < "$HERE/diffs/$dev.diff" > /dev/null) || { echo "FAILED to patch $dev"; fail=1; }
  # patch leaves FILE.orig behind when a hunk applied with an offset; the real backup is the tar
  [ "$had_orig" = 0 ] && rm -f "$ROOT/$dev.orig"
done < "$TMPD/patchok"

# verify the replaced and added files, then let the registry and schema caches rebuild
while read -r cls dev lmd5 nmd5; do
  [ -n "$cls" ] || continue
  if grep -qx "$dev" "$TMPD/replace" || grep -qx "$dev" "$TMPD/add" || grep -qx "$dev" "$TMPD/upgrade"; then
    [ "$(md5 "$ROOT/$dev")" = "$nmd5" ] || { echo "VERIFY FAILED: $dev"; fail=1; }
  fi
done < "$MAN"
touch "$ROOT/www/api/methods.conf" "$ROOT/www/api/schema/methods.json" 2>/dev/null
clear_caches

# remember what was written, so that a later run knows these files are ours (history is kept: never removed)
{
  while read -r cls dev lmd5 nmd5; do
    [ -n "$cls" ] || continue
    if grep -qx "$dev" "$TMPD/replace" || grep -qx "$dev" "$TMPD/add" || grep -qx "$dev" "$TMPD/upgrade" || grep -qx "$dev" "$TMPD/already"; then
      echo "R $dev $(md5 "$ROOT/$dev")"
    elif grep -qx "$dev" "$TMPD/patchok"; then
      echo "P $dev $(md5 "$ROOT/$dev")"
      echo "PV $dev $(md5 "$ROOT/$dev") $nmd5"      # and from which bundle version, so the same bundle is "already"
    fi
  done < "$MAN"
} > "$TMPD/state.new"
if [ -s "$TMPD/state.new" ]; then
  { [ -f "$STATE" ] && cat "$STATE"; cat "$TMPD/state.new"; } | sort -u > "$TMPD/state.all" && cat "$TMPD/state.all" > "$STATE"
fi

if [ "$fail" = 0 ]; then
  echo "installed. Undo with: $0 restore $BK"
else
  echo "finished with errors. Undo with: $0 restore $BK"
  exit 1
fi
