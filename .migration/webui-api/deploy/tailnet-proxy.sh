#!/bin/bash
# tailnet-proxy.sh - make the local test CCUs reachable from the Tailscale network, nothing else.
#
#   tailnet-proxy.sh up        start the proxy (listens ONLY on this host's Tailscale address)
#   tailnet-proxy.sh status    what listens, and does it answer
#   tailnet-proxy.sh down      stop and remove it (the CCU containers are never touched)
#
# One nginx container on the host network listens on <tailscale-ip>:PORT for each port in PORTS and forwards to
# 127.0.0.1:PORT, where the test containers publish their web UI (the restored copy 18090, the empty test CCU 18080).
# It does NOT listen on 0.0.0.0, the LAN address or the loopback, and it only accepts requests from the Tailscale range
# (100.64.0.0/10), so the LAN and the internet cannot reach it even if a firewall rule were missing. The stock A/B
# container (18081) is not exposed. Plain HTTP: the Tailscale tunnel encrypts it on the way.
# The proxy does not restart by itself after a reboot: it is on while you want it.
#
# WARNING: everybody the Tailscale ACLs let reach this host can then reach these CCUs. The restored copy holds the data of a
# real CCU (names, rooms, programs, the user accounts of the backup) and its test account has a weak password: use it only
# on a tailnet you trust, or take the proxy down.
set -euo pipefail

NAME=ccu-tailnet-proxy
PORTS=${PORTS:-"18080 18090"}
STATE=${XDG_STATE_HOME:-$HOME/.local/state}/openccu-tailnet
ADDR=${TAILNET_ADDR:-$(tailscale ip -4 2>/dev/null | head -1)}

case "${1:-}" in
  up)
    [ -n "$ADDR" ] || { echo "no Tailscale IPv4 address (is tailscale up?)" >&2; exit 1; }
    mkdir -p "$STATE"; conf=$STATE/nginx.conf
    {
      echo "events {}"
      echo "http {"
      for p in $PORTS; do
        cat <<E2
  server {
    listen $ADDR:$p;
    allow 100.64.0.0/10;
    allow 127.0.0.1;
    deny all;
    client_max_body_size 512m;
    location / {
      proxy_pass http://127.0.0.1:$p;
      proxy_set_header Host \$http_host;
      proxy_read_timeout 300s;
    }
  }
E2
      done
      echo "}"
    } > "$conf"
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" --network host -v "$conf":/etc/nginx/nginx.conf:ro nginx:1 >/dev/null
    sleep 1
    "$0" status ;;
  status)
    echo "address: ${ADDR:-none}   ports: $PORTS"
    docker ps --filter "name=^$NAME\$" --format 'container: {{.Names}} {{.Status}}' | grep . || echo "container: not running"
    for p in $PORTS; do
      printf ':%s  listening on: %s   | via tailscale address -> HTTP %s\n' "$p" "$(ss -tln 2>/dev/null | awk -v a="$ADDR:$p" '$4==a {print $4}' | tr '\n' ' ')" "$(curl -s -m5 -o /dev/null -w '%{http_code}' "http://$ADDR:$p/login.htm" 2>/dev/null || true)"
    done
    echo "listening on any other address than the Tailscale one: $(ss -tln 2>/dev/null | awk -v a="$ADDR" '$4 ~ /:(18080|18090)$/ && $4 !~ "^"a":" && $4 !~ /^127\.0\.0\.1:/ {print $4}' | tr '\n' ' ')(none expected)" ;;
  down)
    docker rm -f "$NAME" >/dev/null 2>&1 && echo "removed $NAME" || echo "$NAME was not running" ;;
  *) sed -n '2,19p' "$0"; exit 2 ;;
esac
