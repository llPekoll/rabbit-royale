#!/bin/sh
# EUROPE'S BASES, COPIED OFF EUROPE'S MACHINE — every night, from a region,
# through the tunnel (eu-db). Since 2026-10-23 they hold every region's
# players; a disk lost on datemeee must not take them along.
#
# Installed by scripts/eu-backups.sh in /opt/rabbit/backups, run by the
# deploy user's crontab. Reads EU_BACKUP_URL (role rr_backup, read-only:
# pg_read_all_data) from /opt/rabbit/.env; web2 is the same role on :5433.
# Seven nights kept, one per weekday: backups/eu-web3-<1..7>.dump.
#
# Restore (on datemeee, the world's base stopped from its game server):
#   docker exec -i <container> pg_restore -U rr -d rr_crown --clean --if-exists < eu-web3-<n>.dump
set -eu
cd /opt/rabbit
log=backups/eu-pgdump.log
url=$(sed -n 's/^EU_BACKUP_URL=//p' .env)
[ -n "$url" ] || { echo "$(date -u +%FT%TZ) no EU_BACKUP_URL in .env" >> $log; exit 1; }
day=$(date -u +%u)
fail=0
for w in web3:5432 web2:5433; do
  name=${w%%:*}
  u=$(printf '%s' "$url" | sed "s/:5432\//:${w#*:}\//")
  out=backups/eu-$name-$day.dump
  if docker run --rm --network rabbit_default -e U="$u" postgres:18-alpine sh -c 'pg_dump -Fc "$U"' > $out.tmp 2>> $log && [ -s $out.tmp ]; then
    mv $out.tmp $out
    echo "$(date -u +%FT%TZ) $name ok $(wc -c < $out) bytes" >> $log
  else
    rm -f $out.tmp
    echo "$(date -u +%FT%TZ) $name FAILED" >> $log
    fail=1
  fi
done
exit $fail
