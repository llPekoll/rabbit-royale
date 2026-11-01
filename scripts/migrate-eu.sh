#!/usr/bin/env bash
# LES MIGRATIONS DES BASES DE DATEMEEE, AVANT LE PUSH QUI LES DEMANDE.
#
#   scripts/migrate-eu.sh web3 web2        les deux bases de prod (EU, unifiées)
#   scripts/migrate-eu.sh stage web2-stage les bases des deux stages
#
# Coolify ne lance jamais `./migrate` (Dockerfile.ws) : une colonne que le
# nouveau code lit doit exister AVANT qu'il démarre. Une migration additive
# (colonne avec défaut, valeur d'enum) ne gêne pas l'ancien code : on migre,
# puis on pousse.
#
# Sans aucun secret ici : le drizzle/ de CE checkout est copié dans le serveur
# de jeu qui tourne, et c'est SON `./migrate` (le migrateur de drizzle, même
# journal que `bun db:migrate`) qui l'applique avec SA DATABASE_URL.
# Les régions SG/US lisent la base d'Europe : rien à faire chez elles.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
[ $# -gt 0 ] || { echo "usage: $0 web3|web2|stage|web2-stage ..." >&2; exit 1; }

for target in "$@"; do
  case "$target" in
    web3) app=asshbpvdvfb4jmks7oyy20py ;;   # rr-ws   (ws.rabbit.rip)
    web2) app=bmivm0pcpgoxedki2felnlwa ;;   # rr2-ws  (ws2.rabbit.rip)
    stage) app=fmsadpyezlwatu8uw7k0bzos ;;  # rr-ws-stage (ws-stage.rabbit.rip, web3)
    web2-stage) app=gf91d3jilku0ch31brt6b4l4 ;;  # rr2-ws-stage (ws2-stage.rabbit.rip)
    *) echo "inconnu : $target" >&2; exit 1 ;;
  esac
  echo "━━ $target ($app)"
  COPYFILE_DISABLE=1 tar --no-xattrs -C "$root" -czf - drizzle | ssh datemeee "set -e
    c=\$(docker ps -q -f name=$app | head -1)
    [ -n \"\$c\" ] || { echo 'serveur introuvable'; exit 1; }
    tmp=\$(mktemp -d)
    tar -xzf - -C \"\$tmp\"
    docker exec \"\$c\" rm -rf /tmp/rr-drizzle
    docker cp \"\$tmp/drizzle\" \"\$c:/tmp/rr-drizzle\"
    rm -rf \"\$tmp\"
    docker exec -e MIGRATIONS_DIR=/tmp/rr-drizzle \"\$c\" ./migrate"
done
