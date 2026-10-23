#!/usr/bin/env bash
# THE DAY THE REGIONS BECOME ONE — run by hand, from this Mac, once.
#
#   bash scripts/cutover-regions.sh check   # read-only: is everything ready?
#   bash scripts/cutover-regions.sh go      # the cutover, with a stop before each step
#   bash scripts/cutover-regions.sh back    # the way back: regions on their own bases again
#
# WHY A SCRIPT AND NOT A PUSH. A push redeploys Singapore and the US by itself
# (deploy-regions.yml). Had the push pointed them at Europe's base, they would
# have written into it before the merge. So the code goes out by a normal push,
# but only once THIS script has stopped the servers, merged, and set each
# region's SHARED_DATABASE_URL — compose.yml falls back on the region's own
# base while it is unset.
#
# `go`, in order, ~10 minutes of maintenance:
#   1. stop every game server (eu, sg, us, both worlds)
#   2. back up the six bases (scripts/merge-regions.sh backup)
#   3. merge web3 (rehearsal, report, then your yes) and web2 into Europe
#   4. a role per region on Europe's two bases, with a NEW password each —
#      Europe's own password never leaves datemeee
#   5. each region's .env: the shared bases through the tunnel (eu-db), small
#      pools (Europe's base takes 100 connections in all), Europe's web2 JWT
#      secret (one token opens every region of a world). The old .env stays
#      beside it as .env.pre-unify
#   6. git push origin main — Coolify rebuilds Europe, the workflow ships the
#      regions with the new compose.yml
#   7. wait until all six servers run this commit, then show who is connected
#      to Europe's bases
set -euo pipefail
cd "$(dirname "$0")/.."

EU=(ssh datemeee)
SG_IP=51.79.223.94
US_IP=15.235.25.87
region() { local ip; [ "$1" = sg ] && ip=$SG_IP || ip=$US_IP; ssh -i ~/.ssh/rabbit-deploy "deploy@$ip" "${@:2}"; }
# Europe's two game bases (Coolify containers) and game servers (Coolify apps).
EU_PG_WEB3=8eskt0v2sx156yrsrqyuam8t
EU_PG_WEB2=h3ep5bsbpxnj2ue6ayfe7o9g
EU_APP_WEB3=asshbpvdvfb4jmks7oyy20py   # ws.rabbit.rip
EU_APP_WEB2=bmivm0pcpgoxedki2felnlwa   # ws2.rabbit.rip
# Per region: 15 + 4 + one LISTEN for web3, 5 + 2 + 1 for web2. With Europe's
# own 30 + 1, web3's base stays near 70 of its 100.
POOLS="PG_POOL_MAX=15 PG_TX_POOL_MAX=4 WEB2_PG_POOL_MAX=5 WEB2_PG_TX_POOL_MAX=2"

ask() { read -r -p "$1 [y/N] " a; [ "$a" = y ] || { echo "stopped here — nothing after this step was done"; exit 1; }; }
step() { echo; echo "━━ $*"; }

# Set KEY=value in a region's .env; the value comes on stdin, never on a
# command line (ps, shell history).
set_env() {
  region "$1" "f=/opt/rabbit/.env; IFS= read -r v; [ -f \$f.pre-unify ] || cp -p \$f \$f.pre-unify
    { grep -v '^$2=' \$f || true; printf '%s=%s\n' '$2' \"\$v\"; } > \$f.new && chmod 600 \$f.new && mv \$f.new \$f"
}

check() {
  local ok=1
  step "code"
  git fetch -q origin main
  if git show HEAD:deploy/region/compose.yml | grep -q SHARED_DATABASE_URL; then echo "HEAD carries the new compose.yml"; else echo "HEAD has no SHARED_DATABASE_URL in deploy/region/compose.yml — commit first"; ok=0; fi
  echo "HEAD $(git rev-parse --short HEAD), $(git rev-list --count origin/main..HEAD) commit(s) ahead of origin/main"
  [ "$(git rev-list --count origin/main..HEAD)" -gt 0 ] || { echo "nothing to push"; ok=0; }
  step "tunnel (pg_isready from each region, no password)"
  for r in sg us; do
    for port in 5432 5433; do
      if region $r "docker run --rm --network rabbit_default postgres:18-alpine pg_isready -q -h eu-db -p $port -t 5"; then echo "$r eu-db:$port OK"; else echo "$r eu-db:$port UNREACHABLE"; ok=0; fi
    done
  done
  step "Europe's bases take a password login from the tunnel"
  for pg in $EU_PG_WEB3 $EU_PG_WEB2; do
    "${EU[@]}" "docker exec $pg psql -U rr -d rr_crown -Atc \"select type, database, user_name, address, auth_method from pg_hba_file_rules where type = 'host'\"" | sed "s/^/$pg  /"
  done
  step "servers"
  "${EU[@]}" "docker ps --format '{{.Names}} {{.Status}}' | grep -E '^($EU_APP_WEB3|$EU_APP_WEB2)'" || true
  for r in sg us; do region $r "cd /opt/rabbit && docker compose ps --format '$r {{.Service}} {{.Status}}' rr-ws rr-ws-web2"; done
  [ $ok = 1 ] && echo "ready" || { echo "NOT ready"; return 1; }
}

go() {
  check
  sha=$(git rev-parse HEAD)
  ask "Start the cutover now? Every game server stops for ~10 minutes."
  trap 'echo; echo "!! STOPPED MID-WAY. The game servers may still be down: bash scripts/cutover-regions.sh back"' ERR

  step "1. stop the game servers"
  "${EU[@]}" "docker stop \$(docker ps -q -f name=^$EU_APP_WEB3- -f name=^$EU_APP_WEB2-)" >/dev/null
  for r in sg us; do region $r "cd /opt/rabbit && docker compose stop rr-ws rr-ws-web2" 2>&1 | tail -1; done
  echo "stopped"

  step "2. backup, both worlds"
  out=$(bash scripts/merge-regions.sh backup | tee /dev/stderr | sed -n 's/^backup in \([^ ]*\).*/\1/p')
  out2=$(WORLD=web2 bash scripts/merge-regions.sh backup | tee /dev/stderr | sed -n 's/^backup in \([^ ]*\).*/\1/p')
  [ -n "$out" ] && [ -n "$out2" ] || { echo "backup failed"; exit 1; }

  step "3. merge web3 — rehearsal first, nothing is written"
  bash scripts/merge-regions.sh eu "$out"
  ask "Merge web3 for real, as reported above?"
  bash scripts/merge-regions.sh eu "$out" --yes | tail -3
  step "3b. merge web2"
  WORLD=web2 bash scripts/merge-regions.sh eu "$out2" --yes | sed -n '/^== accounts$/,/^$/p;$p'

  step "4. a role per region on Europe's bases"
  for r in sg us; do
    for world in web3 web2; do
      [ $world = web3 ] && pg=$EU_PG_WEB3 port=5432 key=SHARED_DATABASE_URL || pg=$EU_PG_WEB2 port=5433 key=WEB2_SHARED_DATABASE_URL
      role="rr_region_$r"; pw=$(openssl rand -hex 24)
      "${EU[@]}" "docker exec -i $pg psql -q -U rr -d rr_crown -v ON_ERROR_STOP=1" <<SQL
select format('create role %I', '$role') where not exists (select from pg_roles where rolname = '$role') \gexec
alter role $role login password '$pw' connection limit 25;
grant connect on database rr_crown to $role;
grant usage on schema public to $role;
grant select, insert, update, delete on all tables in schema public to $role;
grant usage, select on all sequences in schema public to $role;
-- Tables and sequences the next migrations create (run by rr, in Europe).
alter default privileges for role rr in schema public grant select, insert, update, delete on tables to $role;
alter default privileges for role rr in schema public grant usage, select on sequences to $role;
SQL
      url="postgres://$role:$pw@eu-db:$port/rr_crown"
      printf '%s\n' "$url" | set_env $r $key
      # The region logs in through the tunnel and reads, or nothing is pushed.
      n=$(printf '%s\n' "$url" | region $r "IFS= read -r u; docker run --rm --network rabbit_default postgres:18-alpine psql \"\$u\" -Atc 'select count(*) from players'")
      echo "$r $world: $role logs in through the tunnel, sees $n players"
    done
  done

  step "5. each region's .env"
  # Read from the stopped container's definition: exec needs it running.
  web2_secret=$("${EU[@]}" "docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' \$(docker ps -aq -f name=^$EU_APP_WEB2- | head -1) | sed -n 's/^JWT_SIGNING_SECRET=//p'")
  [ -n "$web2_secret" ] || { echo "no web2 secret read from Europe"; exit 1; }
  for r in sg us; do
    printf '%s\n' "$web2_secret" | set_env $r WEB2_JWT_SIGNING_SECRET
    for kv in $POOLS; do printf '%s\n' "${kv#*=}" | set_env $r "${kv%%=*}"; done
    echo "$r .env set (previous one: /opt/rabbit/.env.pre-unify)"
  done
  unset web2_secret

  step "6. push"
  ask "git push origin main ($(git rev-parse --short HEAD))?"
  git push origin main

  step "7. waiting for the six servers to run $(git rev-parse --short HEAD) (Coolify + deploy-regions, ~5-10 min)"
  for _ in $(seq 1 80); do
    eu=$("${EU[@]}" "docker ps --format '{{.Image}}' -f name=^$EU_APP_WEB3- -f name=^$EU_APP_WEB2- | grep -c $sha" || true)
    sg=$(region sg "cd /opt/rabbit && docker compose ps --format '{{.Image}}' rr-ws rr-ws-web2 | grep -c $sha" || true)
    us=$(region us "cd /opt/rabbit && docker compose ps --format '{{.Image}}' rr-ws rr-ws-web2 | grep -c $sha" || true)
    echo "  eu $eu/2  sg $sg/2  us $us/2"
    [ "$eu$sg$us" = 222 ] && break
    sleep 15
  done
  for h in ws ws-sg ws-us ws2 ws2-sg ws2-us; do
    printf '%-7s %s\n' "$h" "$(curl -s -m 5 "https://$h.rabbit.rip/health" || echo DOWN)"
  done
  step "who is connected to Europe's bases"
  for pg in $EU_PG_WEB3 $EU_PG_WEB2; do
    "${EU[@]}" "docker exec $pg psql -U rr -d rr_crown -Atc \"select usename, count(*) from pg_stat_activity where datname = 'rr_crown' group by 1 order by 1\""
  done
  echo
  echo "done. Next: the Discord/Telegram post (docs/unified-regions-players.md)."
}

back() {
  # Every game server up again, the regions each on its own base as before
  # the cutover. Europe's base stays as it is, merged or not; to undo the
  # merge too, restore the backup taken in step 2 (pg_restore --clean).
  ask "Restart Europe's servers and put sg and us back on their own bases?"
  "${EU[@]}" "docker start \$(docker ps -aq -f name=^$EU_APP_WEB3- -f name=^$EU_APP_WEB2- -f status=exited)" >/dev/null 2>&1 || true
  echo "eu started"
  for r in sg us; do
    region $r "cd /opt/rabbit && { [ ! -f .env.pre-unify ] || cp -p .env.pre-unify .env; } && docker compose up -d rr-ws rr-ws-web2" 2>&1 | tail -2
    echo "$r back on its own base"
  done
}

case "${1:-}" in
  check) check ;;
  go) go ;;
  back) back ;;
  *) echo "usage: $0 check | go | back" >&2; exit 2 ;;
esac
