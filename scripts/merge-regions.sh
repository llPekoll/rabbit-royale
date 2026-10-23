#!/usr/bin/env bash
# The three regions' databases into Europe's — see scripts/merge-regions.sql
# for which copy of an account is kept and what the others still give.
#
#   bash scripts/merge-regions.sh backup              # dump eu, sg, us (read-only)
#   bash scripts/merge-regions.sh local <dumps dir>   # rehearse on this Mac, from those dumps
#   bash scripts/merge-regions.sh eu <dumps dir>      # rehearse IN the EU database: report, then rollback
#   bash scripts/merge-regions.sh eu <dumps dir> --yes   # the real merge
#   bash scripts/merge-regions.sh secrets             # do the regions sign with one JWT secret?
#
# WORLD=web2 in front does the same for the web2 world: Europe's rr2-postgres,
# each region's postgres-web2, dumps named web2-*.
#
# BACKUP FIRST, ALWAYS. `backup` writes the three dumps to
# ~/work/ton/rabbit-backups/<stamp>/ on this Mac AND leaves each one on its
# own server (/opt/rabbit/backups/ for sg/us, ~/rabbit-backups/ on datemeee),
# so a merge gone wrong is undone with a pg_restore of the dump taken minutes
# before it. Take it with the game servers STOPPED, or the dump misses the
# games still being played.
set -euo pipefail
cd "$(dirname "$0")/.."

EU=(ssh datemeee)
SG=(ssh -i ~/.ssh/rabbit-deploy deploy@51.79.223.94)
US=(ssh -i ~/.ssh/rabbit-deploy deploy@15.235.25.87)
case "${WORLD:-web3}" in
  web3) EU_PG=8eskt0v2sx156yrsrqyuam8t; REGION_PG=postgres;      p="";      LOCAL_DB=rr_merged ;;
  web2) EU_PG=h3ep5bsbpxnj2ue6ayfe7o9g; REGION_PG=postgres-web2; p="web2-"; LOCAL_DB=rr_merged_web2 ;;
  *) echo "WORLD is web3 or web2" >&2; exit 2 ;;
esac
REGION_DUMP="cd /opt/rabbit && docker compose exec -T $REGION_PG pg_dump -U rabbit -Fc rabbit"

mode="${1:-}"; dir="${2:-}"; go="${3:-}"

case "$mode" in
backup)
  stamp="$(date -u +%Y-%m-%dT%H%MZ)"
  out="$HOME/work/ton/rabbit-backups/$stamp"; mkdir -p "$out"
  "${EU[@]}" "mkdir -p ~/rabbit-backups && docker exec $EU_PG pg_dump -U rr -Fc rr_crown > ~/rabbit-backups/${p}eu-$stamp.dump && cat ~/rabbit-backups/${p}eu-$stamp.dump" > "$out/${p}eu.dump" &
  "${SG[@]}" "$REGION_DUMP > /opt/rabbit/backups/${p}sg-$stamp.dump && cat /opt/rabbit/backups/${p}sg-$stamp.dump" > "$out/${p}sg.dump" &
  "${US[@]}" "$REGION_DUMP > /opt/rabbit/backups/${p}us-$stamp.dump && cat /opt/rabbit/backups/${p}us-$stamp.dump" > "$out/${p}us.dump" &
  wait
  for r in eu sg us; do
    tables=$(pg_restore -l "$out/$p$r.dump" | grep -c "TABLE DATA")
    echo "[$p$r] $(wc -c < "$out/$p$r.dump" | tr -d ' ') bytes, $tables tables"
  done
  echo "backup in $out (and one copy on each server)"
  ;;

local)
  [ -f "$dir/${p}eu.dump" ] || { echo "no $dir/${p}eu.dump" >&2; exit 2; }
  db=$LOCAL_DB
  dropdb --if-exists "$db"; createdb "$db"
  # sg and us first, each renamed out of `public`; then Europe into `public`.
  for r in sg us; do
    pg_restore --no-owner --no-acl -n public -d "$db" "$dir/$p$r.dump"
    psql -q -d "$db" -c "alter schema public rename to $r; create schema public;"
  done
  pg_restore --no-owner --no-acl -d "$db" "$dir/${p}eu.dump"
  psql -d "$db" -v ON_ERROR_STOP=1 -v commit=1 -f scripts/merge-regions.sql
  psql -q -d "$db" -c "drop schema sg cascade; drop schema us cascade;"
  echo "merged into local database $db"
  ;;

eu)
  [ -f "$dir/${p}sg.dump" ] && [ -f "$dir/${p}us.dump" ] || { echo "no ${p}sg.dump / ${p}us.dump in $dir" >&2; exit 2; }
  commit=0; [ "$go" = "--yes" ] && commit=1
  # The two dumps travel to Europe's database container and land beside
  # `public` as the schemas sg and us, by way of a scratch database (a dump
  # restores into `public`, which Europe already holds).
  "${EU[@]}" "docker exec $EU_PG sh -c 'dropdb -U rr --if-exists rr_merge_in && createdb -U rr rr_merge_in'"
  for r in sg us; do
    "${EU[@]}" "docker exec -i $EU_PG pg_restore -U rr --no-owner --no-acl -n public -d rr_merge_in" < "$dir/$p$r.dump"
    "${EU[@]}" "docker exec $EU_PG psql -U rr -d rr_merge_in -q -c 'alter schema public rename to $r; create schema public;'"
  done
  "${EU[@]}" "docker exec $EU_PG sh -c 'psql -U rr -d rr_crown -q -c \"drop schema if exists sg cascade; drop schema if exists us cascade;\" && pg_dump -U rr -n sg -n us rr_merge_in | psql -U rr -d rr_crown -q -v ON_ERROR_STOP=1'"
  status=0
  "${EU[@]}" "docker exec -i $EU_PG psql -U rr -d rr_crown -v ON_ERROR_STOP=1 -v commit=$commit" < scripts/merge-regions.sql || status=$?
  "${EU[@]}" "docker exec $EU_PG sh -c 'psql -U rr -d rr_crown -q -c \"drop schema if exists sg cascade; drop schema if exists us cascade;\" && dropdb -U rr rr_merge_in'"
  [ "$status" = 0 ] || { echo "merge FAILED — nothing changed (one transaction)" >&2; exit "$status"; }
  [ "$commit" = 1 ] && echo "merged into Europe" || echo "rehearsal only — rerun with --yes to merge"
  ;;

secrets)
  # Fingerprints only: the secrets themselves never leave their machine. One
  # token now opens every region of a world, so a world's three must match.
  fp='sha256sum | cut -c1-12'
  # Every container on datemeee that signs tokens, named by its domain
  # (ws, ws2, ws-stage…): Coolify's container names say nothing.
  "${EU[@]}" "for c in \$(docker ps -q); do s=\$(docker exec \$c printenv JWT_SIGNING_SECRET 2>/dev/null) || continue
      echo \"eu  \$(docker exec \$c printenv RR_WORLD 2>/dev/null || echo web3) \$(echo \"\$s\" | $fp) \$(docker exec \$c printenv AUTH_ORIGIN 2>/dev/null)\"; done"
  for r in sg us; do
    [ $r = sg ] && H=("${SG[@]}") || H=("${US[@]}")
    echo "$r  web3 $("${H[@]}" "cd /opt/rabbit && docker compose exec -T rr-ws printenv JWT_SIGNING_SECRET | $fp")"
    echo "$r  web2 $("${H[@]}" "cd /opt/rabbit && docker compose exec -T rr-ws-web2 printenv JWT_SIGNING_SECRET | $fp")"
  done
  ;;

*) echo "usage: [WORLD=web2] $0 backup | local <dumps dir> | eu <dumps dir> [--yes] | secrets" >&2; exit 2 ;;
esac
