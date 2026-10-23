# Les régions — Singapour, US

Depuis l'unification (2026-10-23, `scripts/cutover-regions.sh`), chaque
région garde **son serveur de jeu et son Redis**. Les comptes, les saisons et
les raids sont dans **les bases d'Europe**, jointes par le tunnel WireGuard
(`deploy/tunnel`). La base locale de la région ne sert plus qu'aux migrations
et au retour en arrière. L'image est la même partout. L'Europe reste sur Coolify
(`datemeee`, `ws.rabbit.rip`) ; les régions tournent sur un VPS OVH chacune,
sans Coolify : `compose.yml` + le workflow `.github/workflows/deploy-regions.yml`.

| Région | Hôte | Machine |
|---|---|---|
| eu | `ws.rabbit.rip` | Coolify, datemeee |
| sg | `ws-sg.rabbit.rip` | OVH VPS-1, Singapour |
| us | `ws-us.rabbit.rip` | OVH VPS-1, Vint Hill |

Avant chaque île, le client Godot prend le serveur qui répond le plus vite à
`/health` (`Net.settle_for_island`). Réglages → Serveur permet d'en forcer un.
Un seul jeton ouvre toutes les régions d'un même monde.

## Mettre une région en route (une fois)

1. **DNS** : un enregistrement A `ws-sg.rabbit.rip` (ou `ws-us`) → l'IP du VPS.
2. **Clé de déploiement** (sur ton Mac, une seule pour toutes les régions) :
   `ssh-keygen -t ed25519 -f ~/.ssh/rabbit-deploy -C deploy -N ''`
3. **Préparer le VPS** :
   ```sh
   scp deploy/region/bootstrap.sh ubuntu@<ip>:
   ssh ubuntu@<ip> "sudo bash bootstrap.sh '$(cat ~/.ssh/rabbit-deploy.pub)'"
   ```
   Docker, pare-feu (22/80/443 seulement), utilisateur `deploy`, `/opt/rabbit`,
   un `pg_dump` par nuit (7 gardés).
4. **Le `.env`** : copier `env.example` en `/opt/rabbit/.env` sur le VPS et le
   remplir — `JWT_SIGNING_SECRET` **propre à la région**.
   `chmod 600 /opt/rabbit/.env`, propriétaire `deploy`.
5. **Secrets GitHub** (Settings → Secrets → Actions) : `REGION_SSH_KEY` (le
   contenu de `~/.ssh/rabbit-deploy`), `REGION_SG_HOST` / `REGION_US_HOST`.
6. **Premier déploiement** : Actions → deploy-regions → Run workflow. Ensuite,
   chaque push sur `main` qui touche le serveur redéploie les régions.

Vérifier : `curl https://ws-sg.rabbit.rip/health`.

## Au quotidien

- **Migrations** : automatiques — le conteneur `migrate` passe le journal
  `drizzle/` avant chaque démarrage du serveur. Jamais de push.
- **Tuning** : une seule table `tuning`, celle d'Europe. Un réglage s'y passe
  une fois et vaut pour les trois régions (chaque serveur relit la table).
  La table des bases locales de Singapour et des US ne sert plus.
- **Logs** : `ssh deploy@<ip> 'cd /opt/rabbit && docker compose logs -f rr-ws'`.
- **Sauvegardes** : les bases d'Europe sont copiées chaque nuit, trois fois
  (`scripts/eu-backups.sh`, `status` pour voir les dernières nuits) :
  - sur datemeee, dans `~/rabbit-backups/nightly`, à 03:31 UTC ;
  - à Singapour (03:41) et aux US (04:11), tirées par le tunnel avec
    `eu-backup.sh` dans `/opt/rabbit/backups/eu-web3-<jour>.dump` et
    `eu-web2-<jour>.dump`, sous le rôle `rr_backup`, qui ne peut que lire.

  Les dumps `rabbit-<n>.dump` de `bootstrap.sh` copient encore la base
  locale, qui ne bouge plus depuis le 2026-10-23.
- **Restaurer l'Europe** : arrêter les serveurs du monde, puis sur datemeee
  `docker exec -i <conteneur> pg_restore -U rr -d rr_crown --clean --if-exists < eu-web3-<n>.dump`.
