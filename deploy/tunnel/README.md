# Le tunnel régions → bases d'Europe

Depuis l'unification des régions (2026-10-23), Singapour et les US gardent leur
serveur de jeu et leur Redis, mais lisent et écrivent dans **les bases
d'Europe**. Elles n'ont pas de port public : on y passe par WireGuard.

```
sg  rr-ws ──eu-db:5432──▶ tunnel 10.77.0.2 ─┐
                                            ├─ UDP 51820 ─▶ tunnel 10.77.0.1 (datemeee) ──▶ rr-postgres  (web3)
us  rr-ws ──eu-db:5432──▶ tunnel 10.77.0.3 ─┘                         :5433 ──▶ rr2-postgres (web2)
```

- **Europe** (`~/rabbit-tunnel` sur datemeee, `compose.hub.yml`) : à côté de
  Coolify, pas géré par lui. Il est branché sur le réseau `coolify` et n'offre
  les deux bases **que** sur son adresse de tunnel. Le seul port publié est
  l'UDP de WireGuard, qui ne répond rien à un paquet sans clé connue.
- **Régions** (`/opt/rabbit/tunnel`, `compose.spoke.yml`) : un projet compose
  à part, que le workflow `deploy-regions` ne touche pas. Il est branché sur
  `rabbit_default` sous le nom `eu-db`. WireGuard y tourne en userspace
  (`wireguard-go`), parce que l'utilisateur `deploy` n'a pas de quoi charger le
  module du noyau.
- **Clés** : chaque machine crée la sienne au premier démarrage, dans
  `keys/private`, et elle n'en sort jamais. Seule la clé publique circule,
  dans le `keys/peers` des autres.

## Installer / remettre d'aplomb

```sh
bash deploy/tunnel/install.sh
```

Le script peut se relancer sans risque. Il finit par un `pg_isready` sur
`eu-db:5432` et `eu-db:5433` depuis le réseau de chaque région, sans mot de
passe.

## La bascule (jour de la fusion)

Tout est dans `scripts/cutover-regions.sh`, à lancer à la main depuis le Mac :

```sh
bash scripts/cutover-regions.sh check   # lecture seule : tunnel, pg_hba, commit à pousser
bash scripts/cutover-regions.sh go      # ~10 min de maintenance, une question avant chaque étape
bash scripts/cutover-regions.sh back    # retour : serveurs relancés, régions sur leur propre base
```

`go` déroule ces étapes, dans l'ordre :
1. arrête les six serveurs ;
2. sauvegarde les six bases ;
3. fusionne web3 (répétition, rapport, puis ton accord) et web2 ;
4. crée un rôle `rr_region_<r>` par région sur chaque base d'Europe, avec un
   mot de passe neuf. La connexion de chaque rôle est testée à travers le
   tunnel avant d'aller plus loin ;
5. écrit le `.env` des régions : `SHARED_DATABASE_URL`,
   `WEB2_SHARED_DATABASE_URL`, les petits pools, et le secret de jeton web2
   d'Europe (les trois étaient différents, le monde web2 était vide). L'ancien
   `.env` reste à côté, sous le nom `.env.pre-unify` ;
6. `git push origin main` ;
7. attend que les six serveurs tournent sur ce commit.

Pourquoi la bascule ne passe pas par le push seul : un push redéploie l'Asie
et les US tout seuls. Sans `SHARED_DATABASE_URL`, `compose.yml` garde la
région sur sa propre base. C'est donc le script qui décide du moment où une
région rejoint l'Europe, après la fusion.

Les migrations restent sur la base de chaque région : la base commune n'est
migrée que par l'Europe, avec son propriétaire. Un rôle de région ne peut pas
modifier les tables, et trois régions qui passeraient le même journal en même
temps se marcheraient dessus. Les tables créées par une migration future sont
couvertes par `alter default privileges`.
