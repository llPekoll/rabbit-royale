#!/usr/bin/env bash
# EUROPE'S BASES, BACKED UP EVERY NIGHT — three copies, three continents.
#
#   bash scripts/eu-backups.sh install   # once (can be run again: new password, same jobs)
#   bash scripts/eu-backups.sh status    # the last nights, everywhere
#
# Since the unification (2026-10-23) every region's players live in Europe's
# two bases (rr-postgres = web3, rr2-postgres = web2), and Coolify backs up
# neither. So:
#  - datemeee dumps both at 03:31 UTC into ~/rabbit-backups/nightly (root
#    cron): the fast restore, but on the same disk;
#  - Singapore (03:41) and the US (04:11) pull both through the tunnel with
#    deploy/region/eu-backup.sh: the copies that survive datemeee.
# Seven nights each, one file per weekday.
#
# The regions log in as rr_backup: read-only (pg_read_all_data), 2
# connections, its own password — not rr's, not a game role's. The password
# goes into each region's .env as EU_BACKUP_URL, through stdin only.
set -euo pipefail
cd "$(dirname "$0")/.."

EU=(ssh datemeee)
SG_IP=51.79.223.94
US_IP=15.235.25.87
region() { local ip; [ "$1" = sg ] && ip=$SG_IP || ip=$US_IP; ssh -i ~/.ssh/rabbit-deploy "deploy@$ip" "${@:2}"; }
region_scp() { local ip; [ "$1" = sg ] && ip=$SG_IP || ip=$US_IP; scp -q -i ~/.ssh/rabbit-deploy "$2" "deploy@$ip:$3"; }
EU_PG_WEB3=8eskt0v2sx156yrsrqyuam8t
EU_PG_WEB2=h3ep5bsbpxnj2ue6ayfe7o9g
NIGHTLY=/root/rabbit-backups/nightly

# Set KEY=value in a region's .env; the value comes on stdin, never on a
# command line (ps, shell history).
set_env() {
  region "$1" "f=/opt/rabbit/.env; IFS= read -r v
    { grep -v '^$2=' \$f || true; printf '%s=%s\n' '$2' \"\$v\"; } > \$f.new && chmod 600 \$f.new && mv \$f.new \$f"
}

install() {
  echo "━━ role rr_backup on Europe's two bases"
  pw=$(openssl rand -hex 24)
  for pg in $EU_PG_WEB3 $EU_PG_WEB2; do
    "${EU[@]}" "docker exec -i $pg psql -q -U rr -d rr_crown -v ON_ERROR_STOP=1" <<SQL
select 'create role rr_backup' where not exists (select from pg_roles where rolname = 'rr_backup') \gexec
alter role rr_backup login password '$pw' connection limit 2;
grant pg_read_all_data to rr_backup;
SQL
    echo "$pg ok"
  done

  echo "━━ datemeee: nightly dump at 03:31 UTC into $NIGHTLY"
  "${EU[@]}" "mkdir -p $NIGHTLY && cat > /etc/cron.d/rabbit-eu-pgdump" <<CRON
# Europe's game bases, every night, 7 kept (scripts/eu-backups.sh).
31 3 * * * root docker exec $EU_PG_WEB3 pg_dump -U rr -Fc rr_crown > $NIGHTLY/eu-web3-\$(date -u +\\%u).dump 2>> $NIGHTLY/pgdump.log
36 3 * * * root docker exec $EU_PG_WEB2 pg_dump -U rr -Fc rr_crown > $NIGHTLY/eu-web2-\$(date -u +\\%u).dump 2>> $NIGHTLY/pgdump.log
CRON
  "${EU[@]}" "chmod 644 /etc/cron.d/rabbit-eu-pgdump && cat /etc/cron.d/rabbit-eu-pgdump | grep -c pg_dump"

  for r in sg us; do
    echo "━━ $r: pulls both through the tunnel"
    [ $r = sg ] && at="41 3" || at="11 4"
    region_scp $r deploy/region/eu-backup.sh /opt/rabbit/backups/eu-backup.sh
    region $r "chmod 755 /opt/rabbit/backups/eu-backup.sh"
    printf '%s\n' "postgres://rr_backup:$pw@eu-db:5432/rr_crown" | set_env $r EU_BACKUP_URL
    region $r "{ crontab -l 2>/dev/null | grep -v eu-backup.sh || true; echo '$at * * * /opt/rabbit/backups/eu-backup.sh'; } | crontab -"
    # One run now: the job works, or install stops here.
    region $r "/opt/rabbit/backups/eu-backup.sh && tail -2 /opt/rabbit/backups/eu-pgdump.log"
  done
  unset pw
  echo
  echo "done. Tomorrow: bash scripts/eu-backups.sh status"
}

status() {
  echo "━━ eu ($NIGHTLY)"
  "${EU[@]}" "ls -l --time-style=+%F\ %H:%M $NIGHTLY 2>/dev/null | tail -n +2; tail -3 $NIGHTLY/pgdump.log 2>/dev/null"
  for r in sg us; do
    echo "━━ $r"
    region $r "ls -l --time-style=+%F\ %H:%M /opt/rabbit/backups/eu-*.dump 2>/dev/null; tail -4 /opt/rabbit/backups/eu-pgdump.log 2>/dev/null"
  done
}

case "${1:-}" in
  install) install ;;
  status) status ;;
  *) echo "usage: $0 install | status" >&2; exit 2 ;;
esac
