#!/bin/bash
# remote-ccu.sh - check, install or restore the webui-api bundle and nextGen UI on a remote CCU3 / OpenCCU over SSH.
#
#   remote-ccu.sh check   <HOST>                 build bundle, stream to /tmp on HOST, run ./install.sh check --patch
#   remote-ccu.sh install <HOST>                 remount / rw, install bundle + nextGen UI, enable v2, remount / ro
#   remote-ccu.sh restore <HOST> [BACKUP.tar]    remount / rw, restore backup (latest if omitted) + remove /www/webui/next, remount / ro
#
# Uses a single SSH connection per command so interactive password authentication only prompts once.
set -euo pipefail

cmd=${1:-}
target=${2:-}
backup_arg=${3:-}
if [ -z "$cmd" ] || [ -z "$target" ]; then
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
case "$target" in *@*) ssh_target=$target ;; *) ssh_target="root@$target" ;; esac
host_only=${target#*@}

dir=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$dir" rev-parse --show-toplevel)
cd "$repo"

build_payload() {
  "$dir/make-bundle.sh" | tail -2 >&2
  [ -d "$repo/src/webui/next/node_modules" ] || (cd "$repo/src/webui/next" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null)
  (cd "$repo/src/webui/next" && npm run build >/dev/null)
  tar -C "$repo/src/webui/next/dist" -czf "$dir/out/webui-next-dist.tar.gz" .
}

case "$cmd" in
  check)
    build_payload
    tar -C "$dir/out" -cf - webui-api-bundle.tar.gz webui-next-dist.tar.gz | ssh "$ssh_target" '
      set -e
      cd /tmp
      rm -rf webui-api-bundle
      tar -xf -
      tar -xzf webui-api-bundle.tar.gz
      cd webui-api-bundle
      ./install.sh check --patch
    '
    ;;
  install)
    build_payload
    tar -C "$dir/out" -cf - webui-api-bundle.tar.gz webui-next-dist.tar.gz | ssh "$ssh_target" '
      set -e
      cd /tmp
      rm -rf webui-api-bundle
      tar -xf -
      tar -xzf webui-api-bundle.tar.gz
      ro_before=0
      grep -q " / [^ ]* ro[, ]" /proc/mounts && ro_before=1
      cleanup() {
        [ "$ro_before" = 1 ] && mount -o remount,ro / 2>/dev/null || true
      }
      trap cleanup EXIT
      [ "$ro_before" = 1 ] && mount -o remount,rw /
      cd /tmp/webui-api-bundle
      ./install.sh install --patch
      sed -i "s/^  v2_enabled false/  v2_enabled true/" /www/api/apiconfig.conf
      grep -q "^  v2_enabled true" /www/api/apiconfig.conf || printf "\n  v2_enabled true\n" >> /www/api/apiconfig.conf
      rm -rf /www/webui/next
      mkdir -p /www/webui/next
      tar -C /www/webui/next -xzf /tmp/webui-next-dist.tar.gz
    '
    echo "installed; the nextGen UI is at http://$host_only/webui/next/"
    ;;
  restore)
    ssh "$ssh_target" "
      set -e
      bk='$backup_arg'
      if [ -n \"\$bk\" ]; then
        bks=\"\$bk\"
      else
        bks=\$(ls -1t /usr/local/webui-api-backup-*.tar 2>/dev/null || true)
      fi
      [ -n \"\$bks\" ] || { echo 'ERROR: no backup tar found in /usr/local/' >&2; exit 1; }
      ro_before=0
      grep -q ' / [^ ]* ro[, ]' /proc/mounts && ro_before=1
      cleanup() {
        [ \"\$ro_before\" = 1 ] && mount -o remount,ro / 2>/dev/null || true
      }
      trap cleanup EXIT
      [ \"\$ro_before\" = 1 ] && mount -o remount,rw /
      for f in \$bks; do
        /tmp/webui-api-bundle/install.sh restore \"\$f\"
      done
      rm -rf /www/webui/next /usr/local/webui-api-installed.txt
      sed -i 's/^  v2_enabled true/  v2_enabled false/' /www/api/apiconfig.conf 2>/dev/null || true
    "
    echo "restored on $host_only"
    ;;
  *)
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
