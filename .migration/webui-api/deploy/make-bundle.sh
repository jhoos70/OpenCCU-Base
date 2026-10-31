#!/bin/bash
# make-bundle.sh - build the deployment bundle for a TEST CCU / OpenCCU from the git history.
#
#   cd <OpenCCU-Base checkout> && .migration/webui-api/deploy/make-bundle.sh [BASE_REV] [OUT_DIR]
#
# BASE_REV  the upstream revision the changes are measured against (default: contents of
#           src/webui/tests/api/LEGACY_REV)
# OUT_DIR   where the bundle goes (default: .migration/webui-api/deploy/out)
#
# The bundle holds, for every file below src/webui/www and src/webui/rega/bin that differs from
# BASE_REV, the new version (files/), a unified diff (diffs/) and manifest.txt with the md5 of the
# BASE_REV and the new bytes. install.sh uses the md5 values to decide per file whether it may
# replace it (the device still has the upstream bytes) or must leave it alone (the device file
# differs, e.g. because an OpenCCU rootfs patch changed it).
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
cd "$repo"
base=${1:-$(tr -d '[:space:]' < src/webui/tests/api/LEGACY_REV)}
out=${2:-.migration/webui-api/deploy/out}
git rev-parse --verify -q "$base^{commit}" > /dev/null || { echo "unknown revision: $base" >&2; exit 1; }

# repo path -> path on the device (relative to /)
devpath() {
  case "$1" in
    src/webui/www/*)      echo "www/${1#src/webui/www/}" ;;
    src/webui/rega/bin/*) echo "bin/${1#src/webui/rega/bin/}" ;;
    *) return 1 ;;
  esac
}

b="$out/webui-api-bundle"
rm -rf "$b" "$out/webui-api-bundle.tar.gz"
mkdir -p "$b/files" "$b/diffs" "$out/.tmp"
tmp=$(mktemp -d "$out/.tmp/mk.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
: > "$b/manifest.txt"

n=0
while IFS=$'\t' read -r status path; do
  case "$status" in A|M) ;; *) echo "skipping $status $path" >&2; continue ;; esac
  dev=$(devpath "$path") || continue
  mkdir -p "$b/files/$(dirname "$dev")"
  cp -p "$path" "$b/files/$dev"
  nmd5=$(md5sum "$path" | cut -d' ' -f1)
  if [ "$status" = A ]; then
    printf 'A %s - %s\n' "$dev" "$nmd5" >> "$b/manifest.txt"
  else
    lmd5=$(git show "$base:$path" | md5sum | cut -d' ' -f1)
    printf 'M %s %s %s\n' "$dev" "$lmd5" "$nmd5" >> "$b/manifest.txt"
    mkdir -p "$tmp/a/$(dirname "$dev")" "$tmp/b/$(dirname "$dev")" "$b/diffs/$(dirname "$dev")"
    git show "$base:$path" > "$tmp/a/$dev"
    cp "$path" "$tmp/b/$dev"
    # -a: treat as text although most files are ISO-8859-1; the labels make `patch -p1` work
    (cd "$tmp" && diff -a -u --label "a/$dev" --label "b/$dev" "a/$dev" "b/$dev" || true) > "$b/diffs/$dev.diff"
  fi
  n=$((n + 1))
done < <(git diff --name-status --no-renames "$base" HEAD -- src/webui/www src/webui/rega/bin)

cp "$(dirname "$0")/install.sh" "$b/install.sh"
chmod 755 "$b/install.sh"
printf 'base %s\nhead %s\nfiles %d\n' "$(git rev-parse "$base")" "$(git rev-parse HEAD)" "$n" > "$b/VERSION"
(cd "$out" && tar -czf webui-api-bundle.tar.gz webui-api-bundle)
echo "bundle: $out/webui-api-bundle.tar.gz ($n files; base $(git rev-parse --short "$base"), head $(git rev-parse --short HEAD))"
echo "added: $(grep -c '^A ' "$b/manifest.txt")  modified: $(grep -c '^M ' "$b/manifest.txt")"
