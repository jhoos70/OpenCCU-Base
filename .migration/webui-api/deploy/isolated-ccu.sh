#!/bin/bash
# isolated-ccu.sh - an OpenCCU test instance in Docker that CANNOT reach the internet, your LAN or your real CCU,
# for trying the nextGen UI on a RESTORED BACKUP of a real CCU (data only, no radio).
#
#   isolated-ccu.sh up              create the network, the proxy and the CCU container
#   isolated-ccu.sh check           prove the isolation (every probe must fail) and the way in
#   isolated-ccu.sh install         build the bundle, run its installer, enable v2, copy the nextGen UI
#   isolated-ccu.sh restore FILE    validate FILE (.sbk), apply it, restart, keep the isolation
#   isolated-ccu.sh down            remove everything, INCLUDING the restored data
#
# How it is isolated: the CCU sits on an --internal Docker network (no route out, no published ports). Its image needs
# a default route to generate its TLS certificate, so it gets one whose gateway is the proxy container, which has IP
# forwarding switched OFF: the route leads nowhere. The proxy is the only way in: http://127.0.0.1:18090 on this host.
# NEVER attach a radio module to this instance while the real CCU is running (both would claim the same devices).
# A .sbk holds secrets (passwords, keys): keep it outside the repository; `down` removes the copy in the container.
set -euo pipefail

NET=ccu-isolated; CCU=ccu-real-copy; PROXY=ccu-real-copy-proxy; VOL=ccu_real_copy_data; PORT=${PORT:-18090}
IMAGE=${CCU_IMAGE:-ghcr.io/openccu/openccu:3.89.11.20261019-631730c}
repo=$(git rev-parse --show-toplevel)
dir=$repo/.migration/webui-api/deploy

route() {  # the route that leads nowhere (runtime state: needed again after every restart of the container)
  local gw; gw=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$NET\").IPAddress}}" "$PROXY")
  docker exec "$CCU" sh -c "ip route | grep -q '^default' || ip route add default via $gw dev eth0"
}
wait_web() {
  local i; for i in $(seq 1 60); do
    [ "$(curl -s -m5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/login.htm")" = 200 ] && return 0; sleep 5
  done; echo "the web UI did not come up" >&2; return 1
}

case "${1:-}" in
  up)
    docker network inspect "$NET" >/dev/null 2>&1 || docker network create --internal "$NET" >/dev/null
    docker volume create "$VOL" >/dev/null
    conf=$(mktemp); trap 'rm -f "$conf"' EXIT
    printf 'events {}\nhttp { server { listen 80; client_max_body_size 512m; location / { proxy_pass http://%s:80; proxy_set_header Host $http_host; proxy_read_timeout 300s; } } }\n' "$CCU" > "$conf"
    docker run -d --name "$CCU" --hostname "$CCU" --network "$NET" --cap-add NET_ADMIN -v "$VOL":/usr/local "$IMAGE" /sbin/init >/dev/null
    sleep 3
    # the proxy: created first on the default bridge (so the port is published), then joined to the isolated network
    docker create --name "$PROXY" --sysctl net.ipv4.ip_forward=0 -p "127.0.0.1:$PORT:80" -v "$conf":/etc/nginx/nginx.conf:ro nginx:1 >/dev/null
    docker network connect "$NET" "$PROXY"; docker start "$PROXY" >/dev/null; route
    echo "up; waiting for the web UI (about a minute) ..."; wait_web; echo "http://127.0.0.1:$PORT is ready"
    "$0" check ;;
  check)
    fail=0
    [ "$(docker exec "$PROXY" cat /proc/sys/net/ipv4/ip_forward)" = 0 ] || { echo "FAIL: the proxy forwards packets"; fail=1; }
    [ -z "$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$CCU" | grep -v '{}')" ] || { echo "FAIL: the CCU publishes ports"; fail=1; }
    nets=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$CCU"); [ "$nets" = "$NET " ] || { echo "FAIL: the CCU is on: $nets"; fail=1; }
    for probe in "ping -c2 -W2 8.8.8.8" "wget -T4 -q -O- http://example.com" "ping -c2 -W2 192.168.178.1" "ping -c2 -W2 172.17.0.1"; do
      if docker exec "$CCU" sh -c "$probe >/dev/null 2>&1"; then echo "FAIL (reachable): $probe"; fail=1; else echo "blocked: $probe"; fi
    done
    [ "$(curl -s -m10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/login.htm")" = 200 ] && echo "way in: http://127.0.0.1:$PORT answers" || { echo "FAIL: no way in"; fail=1; }
    [ $fail = 0 ] && echo "ISOLATED" || { echo "NOT ISOLATED"; exit 1; } ;;
  install)
    "$dir/make-bundle.sh" | tail -2
    docker cp "$dir/out/webui-api-bundle.tar.gz" "$CCU":/tmp/
    docker exec "$CCU" sh -c 'cd /tmp && tar xzf webui-api-bundle.tar.gz && cd webui-api-bundle && ./install.sh install --patch' | tail -4
    docker exec "$CCU" sh -c 'sed -i "s/^  v2_enabled false/  v2_enabled true/" /www/api/apiconfig.conf; mkdir -p /www/webui/next'
    [ -d "$repo/src/webui/next/dist" ] || (cd "$repo/src/webui/next" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && npm run build >/dev/null)
    docker cp "$repo/src/webui/next/dist/." "$CCU":/www/webui/next/
    echo "installed; the nextGen UI is at http://127.0.0.1:$PORT/webui/next/" ;;
  restore)
    f=${2:?usage: isolated-ccu.sh restore FILE.sbk}; [ -f "$f" ] || { echo "no such file: $f" >&2; exit 1; }
    case "$f" in "$repo"/*) echo "refusing: keep the backup outside the repository" >&2; exit 1 ;; esac
    docker cp "$f" "$CCU":/tmp/restore.sbk
    docker exec "$CCU" /bin/restoreBackup.sh -c /tmp/restore.sbk
    docker exec "$CCU" /bin/restoreBackup.sh /tmp/restore.sbk
    docker exec "$CCU" rm -f /tmp/restore.sbk
    docker restart "$CCU" >/dev/null; sleep 3; route
    echo "restored; waiting for the web UI ..."; wait_web; "$0" check ;;
  down)
    docker rm -f "$PROXY" "$CCU" >/dev/null 2>&1 || true
    docker volume rm "$VOL" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    echo "removed: containers, network and the volume with the restored data" ;;
  *) sed -n '2,19p' "$0"; exit 2 ;;
esac
