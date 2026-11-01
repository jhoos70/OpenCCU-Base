#!/bin/bash
# make-addon.sh - Package the NextGen WebUI and API v2 into a HomeMatic CCU Add-on (.tar.gz)
#
# Usage:
#   .migration/webui-api/deploy/make-addon.sh [VERSION] [OUT_DIR]
#
# Example:
#   .migration/webui-api/deploy/make-addon.sh 0.1.0
#
set -euo pipefail

dir=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$dir" rev-parse --show-toplevel)
cd "$repo"

version=${1:-0.1.0}
out=${2:-$dir/out}

echo "==> Building OpenCCU NextGen WebUI Addon v${version}..."

mkdir -p "$out"
mkdir -p "$out/.addon-stage"
stage=$(mktemp -d "$out/.addon-stage/addon.XXXXXX")
trap 'rm -rf "$stage"' EXIT

# 1. Build API v2 bundle
echo "==> [1/4] Building API v2 bundle..."
"$dir/make-bundle.sh" >/dev/null

# 2. Build NextGen WebUI SPA
echo "==> [2/4] Building NextGen WebUI frontend..."
(
  cd "$repo/src/webui/next"
  [ -d "node_modules" ] || npm ci --ignore-scripts --no-audit --no-fund >/dev/null
  npm run build >/dev/null
)

# 3. Assemble Addon structure
echo "==> [3/4] Assembling CCU Addon package..."
mkdir -p "$stage/api" "$stage/www" "$stage/rc.d"

cp "$dir/addon/update_script" "$stage/update_script"
chmod 755 "$stage/update_script"

cp "$dir/addon/rc.d/openccu-next" "$stage/rc.d/openccu-next"
chmod 755 "$stage/rc.d/openccu-next"

echo "$version" > "$stage/VERSION"

cp "$out/webui-api-bundle.tar.gz" "$stage/api/webui-api-bundle.tar.gz"

tar -C "$repo/src/webui/next/dist" -czf "$stage/www/webui-next-dist.tar.gz" .

# 4. Create final Addon tarball
addon_tar="$out/openccu-nextgen-addon-${version}.tar.gz"
echo "==> [4/4] Creating archive $addon_tar..."
tar -C "$stage" -czf "$addon_tar" update_script VERSION rc.d api www

size=$(du -h "$addon_tar" | cut -f1)
md5=$(md5sum "$addon_tar" | cut -d' ' -f1)

echo ""
echo "=========================================================="
echo "SUCCESS: Addon package created!"
echo "  File:    $addon_tar"
echo "  Size:    $size"
echo "  MD5:     $md5"
echo "  Version: $version"
echo "=========================================================="
echo "Installation on any CCU3 / RaspberryMatic / OpenCCU:"
echo "  1. Open WebUI: Einstellungen -> Systemsteuerung -> Zusatzsoftware"
echo "  2. Upload: openccu-nextgen-addon-${version}.tar.gz"
echo "  3. Click: Installieren"
echo "=========================================================="
