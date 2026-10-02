# Les régions — Singapour, US

Chaque région est un **jeu entier et isolé** : sa base, son Redis, ses comptes,
ses saisons, ses raids. Seule l'image est commune. L'Europe reste sur Coolify
(`datemeee`, `ws.rabbit.rip`) ; les régions tournent sur un VPS OVH chacune,
sans Coolify : `compose.yml` + le workflow `.github/workflows/deploy-regions.yml`.

| Région | Hôte | Machine |
|---|---|---|
| eu | `ws.rabbit.rip` | Coolify, datemeee |
| sg | `ws-sg.rabbit.rip` | OVH VPS-1, Singapour |
| us | `ws-us.rabbit.rip` | OVH VPS-1, Vint Hill |

Le client Godot choisit la région au premier lancement (la plus rapide à
répondre à `/health`) et la planche « Serveur » de l'accueil permet d'en
changer — elle n'apparaît que si au moins deux régions répondent. Un joueur
d'avant les régions (jeton déjà enregistré) reste en Europe.

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
- **Tuning** : la table `tuning` de chaque région est vide au départ, le
  serveur lit alors `config/tuning.ts`. Un réglage en base est à passer dans
  CHAQUE base (`bun db:seed-tuning` avec le `DATABASE_URL` de la région, via
  un tunnel SSH : `ssh -L 5433:localhost:5432` ne suffit pas, Postgres n'a pas
  de port publié — `docker compose exec postgres psql -U rabbit` sur le VPS).
- **Logs** : `ssh deploy@<ip> 'cd /opt/rabbit && docker compose logs -f rr-ws'`.
- **Restaurer** : `docker compose exec -T postgres pg_restore -U rabbit -d rabbit --clean < backups/rabbit-<n>.dump`.
