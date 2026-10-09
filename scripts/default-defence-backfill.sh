#!/usr/bin/env bash
# The default defence for every burrow that has none, one region at a time.
#
#   bash scripts/default-defence-backfill.sh eu        # plan only, writes nothing
#   bash scripts/default-defence-backfill.sh eu --yes  # places it
#   bash scripts/default-defence-backfill.sh eu --redo [--yes]  # re-lays untouched old defaults
#
# Regions: eu (Coolify, datemeee), sg, us (OVH, user deploy). See
# scripts/default-defence-backfill.ts for what is placed and why it is safe
# to run twice.
set -euo pipefail
cd "$(dirname "$0")/.."

region="${1:-}"; shift || true
go=""; redo=""
for a in "$@"; do case "$a" in --yes) go=--yes ;; --redo) redo=--redo ;; esac; done
case "$region" in
  eu) remote=(ssh datemeee); psql_cmd="docker exec -i 8eskt0v2sx156yrsrqyuam8t psql -U rr -d rr_crown" ;;
  sg) remote=(ssh -i ~/.ssh/rabbit-deploy deploy@51.79.223.94); psql_cmd="cd /opt/rabbit && docker compose exec -T postgres psql -U rabbit -d rabbit" ;;
  us) remote=(ssh -i ~/.ssh/rabbit-deploy deploy@15.235.25.87); psql_cmd="cd /opt/rabbit && docker compose exec -T postgres psql -U rabbit -d rabbit" ;;
  *) echo "usage: $0 eu|sg|us [--redo] [--yes]" >&2; exit 2 ;;
esac

candidates="$(bun run scripts/default-defence-backfill.ts --query $redo)"

tmp="$(mktemp -d)"
"${remote[@]}" "$psql_cmd -tA -v ON_ERROR_STOP=1" <<<"$candidates" > "$tmp/candidates.jsonl"
what="with no bomb and no plank"; [ -n "$redo" ] && what="with an untouched old default"
echo "[$region] $(wc -l < "$tmp/candidates.jsonl" | tr -d ' ') burrows $what"
bun run scripts/default-defence-backfill.ts $redo < "$tmp/candidates.jsonl" > "$tmp/apply.sql"

if [ "$go" != "--yes" ]; then
  echo "[$region] plan only — SQL in $tmp/apply.sql ; rerun with --yes to place it"
  exit 0
fi
"${remote[@]}" "$psql_cmd -v ON_ERROR_STOP=1" < "$tmp/apply.sql"
echo "[$region] done"
