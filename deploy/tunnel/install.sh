#!/usr/bin/env bash
# Put the tunnel up on the three machines, or bring it back in line. Safe to
# run twice: keys stay where they were made, peers are rewritten from them.
#
#   bash deploy/tunnel/install.sh
#
# Nothing uses the tunnel until a region's DATABASE_URL names eu-db.
set -euo pipefail
cd "$(dirname "$0")"

HUB=(ssh datemeee)
HUB_HOST=datemeee
HUB_IP=89.167.125.209
SPOKES=("sg 51.79.223.94 10.77.0.2" "us 15.235.25.87 10.77.0.3")
spoke() { ssh -i ~/.ssh/rabbit-deploy "deploy@$1" "${@:2}"; }

echo "== eu (hub)"
"${HUB[@]}" 'modprobe wireguard && echo wireguard > /etc/modules-load.d/wireguard.conf
  mkdir -p ~/rabbit-tunnel/keys && chmod 700 ~/rabbit-tunnel/keys && touch ~/rabbit-tunnel/keys/peers'
scp -q Dockerfile entrypoint.sh compose.hub.yml "$HUB_HOST:rabbit-tunnel/"
"${HUB[@]}" 'cd ~/rabbit-tunnel && docker compose -f compose.hub.yml up -d --build --quiet-pull 2>&1 | tail -1'
sleep 2
hub_key=$("${HUB[@]}" 'cd ~/rabbit-tunnel && docker compose -f compose.hub.yml exec -T tunnel sh -c "wg pubkey < /keys/private"')
echo "eu key $hub_key"

peers=""
for s in "${SPOKES[@]}"; do
  read -r name ip addr <<<"$s"
  echo "== $name"
  spoke "$ip" "mkdir -p /opt/rabbit/tunnel/keys && chmod 700 /opt/rabbit/tunnel/keys
    echo 'eu $hub_key 10.77.0.1 $HUB_IP:51820' > /opt/rabbit/tunnel/keys/peers
    echo 'TUNNEL_ADDRESS=$addr/24' > /opt/rabbit/tunnel/.env"
  scp -q -i ~/.ssh/rabbit-deploy Dockerfile entrypoint.sh compose.spoke.yml "deploy@$ip:/opt/rabbit/tunnel/"
  spoke "$ip" 'cd /opt/rabbit/tunnel && docker compose -f compose.spoke.yml up -d --build --force-recreate --quiet-pull 2>&1 | tail -1'
  sleep 2
  key=$(spoke "$ip" 'cd /opt/rabbit/tunnel && docker compose -f compose.spoke.yml exec -T tunnel sh -c "wg pubkey < /keys/private"')
  echo "$name key $key"
  peers+="$name $key $addr"$'\n'
done

echo "== eu peers"
printf '%s' "$peers" | "${HUB[@]}" 'cat > ~/rabbit-tunnel/keys/peers && cd ~/rabbit-tunnel && docker compose -f compose.hub.yml restart tunnel >/dev/null && sleep 3 && docker compose -f compose.hub.yml logs --no-log-prefix tunnel | tail -4'

echo "== check (from each region's network: pg_isready, no password)"
for s in "${SPOKES[@]}"; do
  read -r name ip _ <<<"$s"
  spoke "$ip" 'for port in 5432 5433; do
      ok=""; for _ in 1 2 3 4 5 6 7 8 9 10; do
        docker run --rm --network rabbit_default postgres:18-alpine pg_isready -q -h eu-db -p $port -t 3 && { ok=1; break; }; sleep 2
      done
      echo "'"$name"' eu-db:$port ${ok:+OK}"; [ -n "$ok" ] || echo "'"$name"' eu-db:$port UNREACHABLE"
    done
    docker compose -f /opt/rabbit/tunnel/compose.spoke.yml exec -T tunnel wg show wg0 latest-handshakes'
done
