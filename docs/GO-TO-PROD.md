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

---

## Journal des écritures manuelles en base

Tout SQL passé à la main sur `rr_crown` se note ici, **le jour où il est
passé**. Ce n'est pas de la paperasse : le registre `__drizzle_migrations` est
la seule mémoire qu'a Drizzle de l'état de la prod, et dès qu'on écrit hors
`db:migrate`, cette mémoire ne suffit plus à reconstituer ce qui s'est produit.
Un écart non noté devient, quelques semaines plus tard, une base dont personne
ne sait si elle est en avance ou en retard sur le dépôt.

Une ligne par intervention : la date, ce qui a été fait, et **pourquoi le
chemin normal n'a pas été pris**.

### 2026-09-14 — table `tuning` + réalignement du registre

Passé en une transaction (`CREATE TABLE IF NOT EXISTS` + `INSERT` dans
`__drizzle_migrations`), puis le seed des 35 clés.

Le registre de prod était à **9 entrées contre 13 en local**. En inspectant le
schéma colonne par colonne, trois de ces quatre migrations étaient **déjà
appliquées** (`burrow_hp` supprimée, `watered_until` et `sprung_at` présentes,
`water` dans l'enum) : c'est le registre qui avait divergé, pas le schéma. Leur
SQL n'a donc **pas** été rejoué — `0009` supprime des colonnes déjà supprimées
et aurait échoué en plein milieu de la transaction. Elles ont été enregistrées
telles quelles, et seule `0012` (la table `tuning`) a réellement été créée.

### 2026-09-14 — la migration `0008` enregistrée après coup

`0008_hot_adam_destine.sql` ajoute la valeur `mirage` à l'enum `item_kind`.
Elle était **appliquée au schéma mais absente du registre** : `mirage` bien
présent dans l'enum, et pourtant la prod comptait 12 migrations là où le dépôt
en a 13. Écart antérieur, origine inconnue.

Aucun effet sur le jeu — l'effet était sur la prochaine personne qui compare
les deux nombres et croit la prod en retard. La ligne a donc été insérée sans
rejouer le SQL : `ADD VALUE` aurait échoué sur une valeur déjà là.

```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT '796ab3979c9dbb651bdf6487e661cdc8678386ab4ae52ecaf660987f39cbcc9b', 1789103707098
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '796ab…');
```

Prod et local sont depuis à **13 migrations** toutes les deux. C'est le compte
à vérifier avant toute migration future ; s'il diverge de nouveau, la cause est
une écriture non notée dans ce journal.

### 2026-09-15 — migration `0014` (les compteurs de quêtes), passée APRÈS le push

`0014_tidy_magik.sql` ajoute six colonnes à `players` : `harvests`,
`traps_placed`, `chests_opened`, `raids_played`, `quests_claimed`,
`quest_marks`. Le tableau de quêtes et la première île les lisent à chaque
chargement du terrier.

**L'ordre a été inversé, et ça a cassé la prod.** Le code (`7eefbd0`, puis
deux déploiements par-dessus) est parti avant la migration : `bun db:check`
avait été lancé en local seulement, et la machine qui poussait n'avait pas
l'alias `datemeee`. Pendant la fenêtre, `POST /api/auth/guest` et
`GET /api/burrow` répondaient 500 — plus de nouveaux invités, plus de terrier
pour personne, et `bankRun` ne pouvait pas créditer une run finie
(`chests_opened` dans le même UPDATE que les carottes). Exactement l'incident
du 2026-09-10, avec le même symptôme : le site répondait 200.

Appliqué à la main, en une transaction avec `ADD COLUMN IF NOT EXISTS`, et
la ligne du registre insérée avec le hash local :

```sql
-- hash 69c858c1a73a915f59364094b585b7d9b318e39a2c98c3fa0b3ce0ed8c7d9832
-- created_at 1789464979037
```

Vérifié de l'extérieur après coup : `POST /api/auth/guest` → 200, puis
`GET /api/burrow` → 200 avec le champ `quest` rempli et `runs: 0`. Prod et
local sont à **15 migrations** toutes les deux.

La leçon, pour ne pas la repayer : quand le push part d'une machine sans
accès prod, le SQL est écrit dans le message de livraison et **rien n'est
poussé** tant qu'une réponse ne confirme pas qu'il est passé. « Migré ? »
n'est pas une question à laquelle on répond par défaut oui.

### 2026-09-16 — migration `0015` (données seulement), à passer en prod

`0015_rename_undefined_guests.sql` ne touche pas au schéma : un seul UPDATE
qui rebaptise les invités nés « undefined… » (l'ancien générateur de noms
indexait ses adjectifs avec un hash signé). Le déploiement ne dépend PAS
d'elle — l'ancien et le nouveau code lisent les mêmes colonnes — mais le
registre, lui, en dépend : sans la ligne, `bun db:check` dira BEHIND et la
prochaine personne croira la prod en retard sur une vraie migration.

Le SQL est dans le fichier, ré-exécutable sans effet (`WHERE name LIKE
'undefined%'`). Hash local à reporter tel quel :

```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT 'c5e4aa5f238a55cbeef168ee8fa4e45f2e73a28778ff41541f02e8ca73fa1be5', 1789489665760
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE hash = 'c5e4aa5f238a55cbeef168ee8fa4e45f2e73a28778ff41541f02e8ca73fa1be5'
);
```

Local à **16 migrations** après application. Compléter cette entrée avec la
date du passage en prod.

### Changer un réglage à chaud (ce n'est PAS une écriture à noter)

> Les commandes complètes sont dans [TUNING.md](./TUNING.md) — c'est là qu'on
> va pour régler, pas ici.

Les lignes de la table `tuning` sont faites pour être modifiées — c'est leur
raison d'être, pas une entorse. Elles portent leur propre `note` et leur
`updated_at`, donc elles se documentent seules :

```sql
update tuning set value = 199, note = 'promo week-end' where key = 'SHOP.PRICES.bomb';
```

Effet en 30 s, sans redéploiement, donc sans tuer les parties en cours. Ce qui
est surchargeable et dans quelles bornes est déclaré dans
`config/overridable.ts` ; une valeur hors bornes est refusée et le jeu retombe
sur `config/tuning.ts`.
