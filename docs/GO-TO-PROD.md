# Go to prod

Le déploiement est **automatique** (Coolify sur push), les **migrations ne le
sont pas**. C'est tout le sujet de ce document : le `Dockerfile` ne lance
jamais `db:migrate`, donc du code qui attend une colonne peut démarrer avant
que cette colonne existe.

C'est arrivé le 2026-09-10 avec le multi-devises : `48e1ae6` a déployé un code
qui lit `payments.token`, la colonne n'était pas en prod, et **chaque achat
échouait** en silence côté joueur avec `column "token" does not exist` dans les
logs. Rien ne prévient — l'app répond 200, seule la boutique est cassée.

> **La règle : la migration passe AVANT que le nouveau code démarre.**
> Une migration additive peut passer avant le push sans rien casser, puisque
> l'ancien code ignore une colonne qu'il ne lit pas.

---

## Les identifiants

Accès : `ssh datemeee`. Les noms de conteneurs Coolify sont opaques et
**changent à chaque redéploiement** (le suffixe est un timestamp), donc les
retrouver plutôt que les copier :

```bash
# Quel conteneur est quoi : l'image porte le SHA du commit déployé
ssh datemeee "for c in \$(docker ps --format '{{.Names}}'); do \
  echo \"\$c | \$(docker inspect -f '{{.Config.Image}}' \$c)\"; done"
```

| Service | Préfixe stable | Repère |
| --- | --- | --- |
| `rr-web` | `kpj80wphpilv7dzarcbyn4qi` | env `PORT=3010`, cmd `bun server.js` |
| `rr-ws` | `asshbpvdvfb4jmks7oyy20py` | env `WS_PORT`, cmd `./ws-server` |
| Postgres RR | `8eskt0v2sx156yrsrqyuam8t` | base `rr_crown`, user `rr` |
| Redis RR | `fbkd3is7bndgs324swexv1to` | `redis:7-alpine` |

Seul le **préfixe** est stable ; le suffixe change à chaque build. Une commande
copiée d'une session précédente échoue avec `no such object` — ce n'est pas la
prod qui est cassée, c'est le nom qui a vieilli. Redécouvrir, ne pas coller.

Les bases de données, elles, ne sont pas redéployées : leur nom tient.

Il y a **trois Postgres** sur la machine (Vikunja et un autre projet). Vérifier
lequel avant toute écriture :

```bash
ssh datemeee "docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' \
  <conteneur-rr-web> | grep '^DATABASE_URL='"
# → postgres://rr:***@8eskt0v2sx156yrsrqyuam8t:5432/rr_crown
```

---

## Migrer la prod

L'image runtime est minimale : ni `drizzle/`, ni `drizzle-kit` (le `Dockerfile`
ne copie que `.next/standalone`). Donc **pas de `bun db:migrate` dans le
conteneur** — le SQL s'applique directement sur la base.

### 1. Générer et appliquer en local d'abord

```bash
bun db:generate     # jamais db:push (règle maison)
bun db:migrate
bun db:check        # doit dire "all N migrations applied"
```

### 2. Relever ce qu'il faut reporter

```bash
# Le SQL généré
cat drizzle/00XX_*.sql

# Le hash de la migration en local, pour l'enregistrer à l'identique en prod
bun -e "import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const r = await sql\`select hash, created_at from drizzle.__drizzle_migrations
  order by created_at desc limit 1\`;
console.log(r[0].hash, r[0].created_at); await sql.end();"
```

Reporter le hash **tel quel** : sans lui, `__drizzle_migrations` diverge entre
local et prod, et la prochaine migration part d'un état que personne ne sait
lire.

### 3. Vérifier l'écart avant d'écrire

```bash
ssh datemeee "docker exec 8eskt0v2sx156yrsrqyuam8t \
  psql -U rr -d rr_crown -tAc 'select count(*) from drizzle.__drizzle_migrations'"
```

Ce nombre doit valoir le local **moins** les migrations à passer.

### 4. Appliquer

En une transaction, avec `ON_ERROR_STOP=1` : sans lui `psql` continue après une
erreur et laisse la base à moitié migrée.

```bash
ssh datemeee "docker exec -i 8eskt0v2sx156yrsrqyuam8t \
  psql -U rr -d rr_crown -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
-- le contenu de drizzle/00XX_*.sql, avec IF NOT EXISTS quand c'est possible
ALTER TABLE payments ADD COLUMN IF NOT EXISTS token text DEFAULT 'usdc' NOT NULL;
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT '<hash local>', <created_at local>
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '<hash local>'
);
COMMIT;
SQL"
```

### 5. Vérifier

```bash
ssh datemeee "docker exec 8eskt0v2sx156yrsrqyuam8t psql -U rr -d rr_crown -tAc \
  \"select column_name from information_schema.columns
    where table_name='payments' and column_name in ('token','usd_price')\""

# Et surtout : plus d'erreur de colonne dans les logs
ssh datemeee "docker logs --since 5m <conteneur-rr-web> 2>&1 | grep -c 'does not exist'"
```

---

## Après un déploiement, toujours

Le déploiement **peut échouer sans que rien ne le dise** côté site : le site
répond 200 parce que l'ancien conteneur tourne toujours.

```bash
# Le commit réellement déployé (le tag de l'image EST le SHA)
ssh datemeee "docker inspect -f '{{.Config.Image}}' <conteneur-rr-web>"
```

Comparer ce SHA avec `git rev-parse HEAD`. S'ils diffèrent, **le déploiement
n'est pas passé** — regarder l'historique dans Coolify (un build en échec y
apparaît en `Failed`), pas le site.

Les deux services se déploient séparément et peuvent donc tourner sur des
commits différents (observé le 2026-09-10 : `rr-web` sur `881e0797` pendant que
`rr-ws` était sur `4467b9e8`). Vérifier **les deux** avant de conclure qu'un
correctif est en ligne.

Un piège déjà rencontré : sans `.dockerignore`, `COPY . .` embarquait 812 Mo,
dont un `.next` construit sur macOS/arm64 posé sous un build Linux. Le
`.dockerignore` est là depuis `27edb9d` ; ne pas le supprimer.

### Ce qui a besoin de quoi

| Le changement touche | Redéployer |
| --- | --- |
| `src/app/**`, composants, API routes | `rr-web` |
| `server/**` | `rr-ws` |
| `src/lib/**`, `config/**` | **les deux** |
| une migration | migrer d'abord, puis les deux |

Les watch paths (voir [DEPLOY-WATCH-PATHS.md](./DEPLOY-WATCH-PATHS.md)) font
que Coolify ne redéploie que le service concerné.

---

## Variables d'environnement

Elles sont lues **au démarrage du serveur**, donc une variable ajoutée dans
Coolify n'existe qu'après un redéploiement — pas au prochain chargement de
page.

Les deux images ont besoin de `DATABASE_URL` et du **même**
`JWT_SIGNING_SECRET` (le WS vérifie les jetons que le web émet).

Pour le rail de paiement (`src/lib/pay/tokens.ts`) :

| Variable | Effet si absente |
| --- | --- |
| `USDC_TREASURY_ADDRESS` | tout le rail argent est coupé |
| `USDC_MINT` | rail USDC coupé |
| `SKR_MINT` | rail SKR coupé (SOL natif n'a pas de mint, il reste dispo) |
| `SOLANA_RPC_URL` | tout le rail argent est coupé |

Une absence **désactive** le rail, elle ne retombe jamais sur une valeur par
défaut : une adresse de mint en dur dans le code est la façon dont un build de
test encaisse du vrai argent.

> **Vérifier que tous les mints sont sur le MÊME réseau.** Au 2026-09-10 la
> prod avait `USDC_MINT` en devnet (`4zMMC9srt5Ri…`) et `SKR_MINT` en mainnet
> (`SKRbvo6Gf7…`). Les deux rails pointaient sur des réseaux différents.
> Mainnet : USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`,
> SKR `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`.

---

## En cas de doute

L'ordre qui ne casse rien, pour une migration additive :

1. `bun db:generate` + `bun db:migrate` en local, `bun db:check`
2. appliquer le SQL en prod (étape 4 ci-dessus)
3. `git push` — Coolify déploie
4. vérifier le SHA déployé, puis les logs

Pour une migration **destructive** (colonne supprimée, type changé), l'ordre
s'inverse et le déploiement doit se faire en deux temps : d'abord du code qui
tolère les deux formes, ensuite la migration. Il n'y en a pas encore eu ici.
