#!/usr/bin/env bash
# PREPARE A FRESH REGION VPS (OVH, Ubuntu 24.04) — once, as root.
#
#   scp deploy/region/bootstrap.sh ubuntu@<ip>:
#   ssh ubuntu@<ip> 'sudo bash bootstrap.sh "<public key of the deploy user>"'
#
# Then put /opt/rabbit/.env in place (deploy/region/env.example) and let the
# GitHub workflow ship the stack. Safe to run twice.
set -euo pipefail

DEPLOY_KEY="${1:?usage: bootstrap.sh \"ssh-ed25519 AAAA... deploy\"}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl ufw unattended-upgrades

# Docker, from Docker's own script (compose plugin included).
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# Only SSH and the web. Postgres and Redis publish no port in compose.yml, so
# nothing else needs to be open — and Docker's own rules only ever open what
# a container publishes (Caddy's 80/443).
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# The user GitHub Actions logs in as: docker, nothing else.
if ! id deploy >/dev/null 2>&1; then
  useradd -m -s /bin/bash deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$DEPLOY_KEY" /home/deploy/.ssh/authorized_keys 2>/dev/null \
  || echo "$DEPLOY_KEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

install -d -o deploy -g deploy /opt/rabbit /opt/rabbit/backups

# A dump a night, seven kept. They sit on the VPS disk, which OVH's daily
# backup carries off the machine.
cat > /etc/cron.d/rabbit-pgdump <<'CRON'
17 3 * * * deploy cd /opt/rabbit && docker compose exec -T postgres pg_dump -U rabbit -Fc rabbit > backups/rabbit-$(date +\%u).dump 2>> backups/pgdump.log
CRON

echo
echo "ready. next: put /opt/rabbit/.env (owner deploy, mode 600), then run the workflow."
