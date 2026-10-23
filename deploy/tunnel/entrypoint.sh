#!/bin/sh
# One end of the tunnel: bring up wg0, then forward TCP across it.
#
#   ADDRESS   this end's address in the tunnel, e.g. 10.77.0.2/24
#   PORT      UDP port to listen on (the hub only — spokes dial out)
#   FORWARDS  "listen_port:target_host:target_port ..." — socat, one per entry
#   BIND      the address the forwards listen on (default: every address)
#   USERSPACE  1 = wireguard-go even where the kernel has WireGuard (tests)
#
# The private key is made here, on first start, and never leaves this
# machine's /keys. Only its public half is printed, to put in the OTHER
# ends' /keys/peers:   <name> <public key> <tunnel ip> [endpoint host:port]
set -eu

umask 077
[ -s /keys/private ] || wg genkey > /keys/private
echo "[tunnel] public key: $(wg pubkey < /keys/private)"

ip link del wg0 2>/dev/null || true
if [ "${USERSPACE:-}" != 1 ] && ip link add wg0 type wireguard 2>/dev/null; then
  echo "[tunnel] kernel wireguard"
else
  # No module loaded and no root to load one (the regions' deploy user):
  # the userspace implementation, on /dev/net/tun.
  echo "[tunnel] wireguard-go"
  WG_PROCESS_FOREGROUND=1 wireguard-go wg0 &
  for _ in 1 2 3 4 5 6 7 8 9 10; do ip link show wg0 >/dev/null 2>&1 && break; sleep 0.5; done
fi

wg set wg0 private-key /keys/private ${PORT:+listen-port "$PORT"}
touch /keys/peers
while read -r name key ip endpoint; do
  case "$name" in ''|'#'*) continue ;; esac
  # The spokes keep the path open: they sit behind nothing, but the hub
  # cannot reach a spoke before it has spoken.
  wg set wg0 peer "$key" allowed-ips "${ip%/*}/32" \
    ${endpoint:+endpoint "$endpoint" persistent-keepalive 25}
  echo "[tunnel] peer $name ${ip%/*}${endpoint:+ via $endpoint}"
done < /keys/peers

ip addr add "$ADDRESS" dev wg0
ip link set mtu 1380 up dev wg0

for f in ${FORWARDS:-}; do
  listen="${f%%:*}"; target="${f#*:}"
  socat "TCP-LISTEN:$listen,${BIND:+bind=$BIND,}reuseaddr,fork,keepalive" "TCP:$target,keepalive" &
  echo "[tunnel] :$listen -> $target"
done

# Exit when wg0 goes away, so `restart: unless-stopped` brings it back whole.
while ip link show wg0 >/dev/null 2>&1; do sleep 15; done
echo "[tunnel] wg0 gone"
exit 1
