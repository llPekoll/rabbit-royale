#!/usr/bin/env bash
# The RR Genesis pieces won before 2026-10-20, recovered from the logs.
#
#   bash scripts/genesis-backfill.sh eu capture  # 1. BEFORE the push: keep the log lines
#   bash scripts/genesis-backfill.sh eu          # 2. after the migration: plan only
#   bash scripts/genesis-backfill.sh eu --yes    #    inserts them
#
# Until genesis_pieces existed, a crown chest's piece was only a log line —
# `[chest-nft] <player> run <run> tiles <a,b>` (server/index.ts bankRun). A
# container's log dies with the container, and every deploy makes a new one,
# while the table only exists once that deploy's migration (0037) has run.
# Hence two steps: `capture` copies the lines out of the running containers
# into ~/.cache/rabbit-royale/genesis/<region>.txt (merged, never shrunk) —
# run it for every region BEFORE the push — and the insert reads that file
# afterwards. Each later run captures again first, so lines logged by the new
# containers (a failed insert) are picked up too. Web3 only — the web2
# containers never draw a piece.
#
# Safe to run twice: one row per (run, tile), ON CONFLICT DO NOTHING. Only a
# player with a wallet gets a row — a guest wins nothing (src/lib/genesis/
# award.ts) — and it is inserted with no asset: rr-ws's sender gives it a real
# piece from the game wallet and sends it, like any piece won since.
#
# Regions: eu (Coolify, datemeee), sg, us (OVH, user deploy).
set -euo pipefail
cd "$(dirname "$0")/.."

region="${1:-}"; go="${2:-}"
case "$region" in
  eu)
    remote=(ssh datemeee)
    # Every rr-ws container Coolify still has, stopped ones included: the
    # prefix is stable, the suffix changes with each deploy (docs/GO-TO-PROD.md).
    logs_cmd="for c in \$(docker ps -a --format '{{.Names}}' | grep '^asshbpvdvfb4jmks7oyy20py'); do docker logs \$c 2>&1; done"
    psql_cmd="docker exec -i 8eskt0v2sx156yrsrqyuam8t psql -U rr -d rr_crown" ;;
  sg|us)
    host=$([ "$region" = sg ] && echo 51.79.223.94 || echo 15.235.25.87)
    remote=(ssh -i ~/.ssh/rabbit-deploy "deploy@$host")
    logs_cmd="cd /opt/rabbit && docker compose logs --no-log-prefix rr-ws 2>&1"
    psql_cmd="cd /opt/rabbit && docker compose exec -T postgres psql -U rabbit -d rabbit" ;;
  *) echo "usage: $0 eu|sg|us [capture|--yes]" >&2; exit 2 ;;
esac

tmp="$(mktemp -d)"
keep="$HOME/.cache/rabbit-royale/genesis/$region.txt"
mkdir -p "$(dirname "$keep")"
touch "$keep"
"${remote[@]}" "$logs_cmd" | grep -o '\[chest-nft\] [^ ]* run [0-9a-f-]* tiles [0-9,]*' > "$tmp/found.txt" || true
sort -u "$keep" "$tmp/found.txt" > "$tmp/lines.txt"
cp "$tmp/lines.txt" "$keep"
echo "[$region] $(wc -l < "$tmp/found.txt" | tr -d ' ') lines in the logs now, $(wc -l < "$keep" | tr -d ' ') kept in $keep"
[ "$go" = capture ] && exit 0
if [ ! -s "$tmp/lines.txt" ]; then
  echo "[$region] nothing to recover"
  exit 0
fi

# One VALUES row per tile. Player ids are `sol:<base58>` or `guest:<uuid>`:
# no quote can appear in them, and the grep above already pinned the shape.
values="$(awk '{ split($6, t, ","); for (i in t) printf "%s(%s, %s, %s)", (n++ ? ",\n  " : "  "), "'"'"'" $2 "'"'"'", "'"'"'" $4 "'"'"'", t[i] }' "$tmp/lines.txt")"
cat > "$tmp/apply.sql" <<SQL
INSERT INTO genesis_pieces (player_id, run_id, tile, won_at, wallet, status)
SELECT v.player_id, r.id, v.tile, coalesce(r.ended_at, r.started_at), p.wallet, 'sending'
FROM (VALUES
$values
) AS v(player_id, run_id, tile)
JOIN runs r ON r.id = v.run_id::uuid AND r.player_id = v.player_id
JOIN players p ON p.id = v.player_id AND p.wallet IS NOT NULL
ON CONFLICT DO NOTHING;
SQL

if [ "$go" != "--yes" ]; then
  echo "[$region] plan only — SQL in $tmp/apply.sql ; rerun with --yes to insert"
  exit 0
fi
"${remote[@]}" "$psql_cmd -v ON_ERROR_STOP=1" < "$tmp/apply.sql"
echo "[$region] done"
