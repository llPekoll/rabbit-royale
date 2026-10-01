# Régler le jeu sans redéployer

Les chiffres de `config/tuning.ts` partent avec le build. En changer un demande
un commit, une image, un redéploiement — et pour `rr-ws`, qui tient les îles en
mémoire en réplique unique, **un redéploiement tue toutes les parties en
cours**. C'est le bon prix pour changer une règle, et beaucoup trop cher pour
corriger un prix.

**Quarante-deux** valeurs sont donc surchargeables depuis la table `tuning` :
une ligne de SQL, effet côté serveur en **30 secondes**, aucun redémarrage. Le
client Godot suit à sa prochaine relecture du terrier (**une minute** au plus,
ou tout de suite au retour au terrier).

---

## La commande

```bash
ssh datemeee "docker exec 8eskt0v2sx156yrsrqyuam8t psql -U rr -d rr_crown -c \
  \"update tuning set value = 120, note = 'promo week-end', seeded = false where key = 'SHOP.PRICES.trap';\""
```

En SQL nu, une fois dans `psql` :

```sql
update tuning set value = 120, note = 'promo week-end', seeded = false where key = 'SHOP.PRICES.trap';
```

**Toujours remplir `note`, et passer `seeded = false`.** Un chiffre nu est
inexplicable une semaine plus tard : c'est la note qui distingue un réglage
voulu d'une expérience oubliée. Et `seeded = false` est ce qui empêche le
prochain `db:seed-tuning` de remettre la ligne à la valeur du fichier — rien ne
le fait tout seul, la colonne n'a pas de trigger.

### Voir ce qui est réglé en ce moment

```bash
# Tout, avec ce qui a été touché à la main en premier
ssh datemeee "docker exec 8eskt0v2sx156yrsrqyuam8t psql -U rr -d rr_crown -c \
  'select key, value, note, seeded, updated_at from tuning order by seeded, key'"

# Juste les prix
ssh datemeee "docker exec 8eskt0v2sx156yrsrqyuam8t psql -U rr -d rr_crown -c \
  \"select key, value, note from tuning where key like 'SHOP.%' order by key\""

# Ce que le serveur applique VRAIMENT (après bornes et règles entre clés),
# alias compris — c'est ce que reçoit le client :
curl -s https://ws.rabbit.rip/api/config | jq .tuning
```

`seeded = false` marque les lignes modifiées à la main. C'est la colonne à lire
pour retrouver ce qui a été bidouillé un soir et jamais remis.

### Revenir à la valeur du fichier

```sql
-- remet le piège au prix du build, et le remarque comme semé
update tuning set value = 150, note = 'Prix d''un piège en carottes', seeded = true
where key = 'SHOP.PRICES.trap';
```

Supprimer la ligne marche aussi : une clé absente **est** la valeur du fichier.
`bun db:seed-tuning --reset` remet **tout** au fichier.

---

## Ce qu'on peut changer

Quarante-deux clés, déclarées avec leurs bornes dans `config/overridable.ts`.
Chacune est lue **au moment où elle s'applique** (un achat, une lecture du
terrier, un pas de raid, une traversée), donc une nouvelle valeur vaut pour la
prochaine requête.

| Groupe | Clés | Ce que ça bouge |
| --- | --- | --- |
| `SHOP.PRICES.*` | 7 | Prix en carottes : `trap` `lightning` `shield` `energy` `smoke` `bloop` `fence` |
| `SHOP.USDC_PRICES.*` | 7 | Les mêmes, en argent réel (0,01 à 50) |
| `PASS.PRICE_USD` | 1 | Prix du pass de saison (0,99 à 50 $) |
| `GARDEN.*` | 3 | `YIELD_PER_HOUR_BASE` `YIELD_PER_LEVEL` `CAP_HOURS` — rendement et plafond du potager |
| `OUT_OF_RUN_ENERGY.*` | 4 | `REGEN_PER_HOUR` `REGEN_PER_LEVEL` `REGEN_LEVEL_CAP` `MAX` — la regen, et le réservoir (voir les alias) |
| `ENERGY.*` | 2 | `CROSSING_COST` (péage d'une île) `MIN_TO_CROSS` (seuil pour traverser) |
| `ENERGY_PACK.MAX_PER_DAY` | 1 | Pleins d'énergie achetables par jour |
| `BURROW.*` | 2 | `UPGRADE_BASE_COST` `UPGRADE_GROWTH` — l'échelle des niveaux de terrier |
| `RAID_RUN.*` | 9 | `TOLL` `STAKE` `WALK_FLOOR` `STEP_REFUND_AT_FIELD` (le coût d'un raid), `LOOT_SHARE` `LOOT_SHARE_MIN` `MIN_LOOT_FRACTION` (le butin), `COOLDOWN_MS` `SHIELD_AFTER_RAID_MS` |
| `RAID.*` | 3 | `LOOT_CAP`, `BROKEN_SHIELD_MS`, `ONBOARDING_SHIELD_MS` |
| `TRAPS.*` | 3 | `FREE_PER_DAY` `MAX_PLACED` `MAX_HELD` |

Les dérivés suivent tout seuls : le plancher d'un raid
(`TOLL + WALK_FLOOR × STEP_COST`), la regen d'un niveau (`regenPerHour`), le
coût d'un niveau (`upgradeCost`), le plafond du potager, la perte maximale
affichée (« stock à l'abri »), le plafond du sac de pièges.

### Les alias : un seul bouton pour un seul nombre

Certaines clés du fichier sont **définies comme** une autre. On ne règle que la
source ; l'alias la suit partout, serveur et client. Une ligne posée sur un
alias est refusée au chargement, avec un message qui nomme la bonne clé.

| Alias | Suit | Pourquoi |
| --- | --- | --- |
| `ENERGY.MAX` | `OUT_OF_RUN_ENERGY.MAX` | Un seul réservoir : la barre de la partie EST celle du terrier |
| `ENERGY_PACK.AMOUNT` | `OUT_OF_RUN_ENERGY.MAX` | Un plein est un réservoir plein |
| `TRAPS.CARROT_COST` | `SHOP.PRICES.trap` | La boutique facture `SHOP.PRICES.trap` ; l'autre n'était qu'un nom |
| `FENCES.CARROT_COST` | `SHOP.PRICES.fence` | Idem pour la clôture |

### Les règles entre clés

Chaque valeur est bornée seule, mais certaines paires se contredisent. Le
chargeur vérifie les valeurs **fusionnées** (surcharges sur le fichier) et, si
une règle casse, **retire les surcharges qu'elle nomme** — le fichier, lui, les
respecte toutes — avec une ligne de log :

- `RAID_RUN.LOOT_SHARE_MIN ≤ RAID_RUN.LOOT_SHARE`
- `RAID_RUN.TOLL ≤ RAID_RUN.STAKE` (sinon un raid entre avec une énergie négative)
- `TOLL + WALK_FLOOR × STEP_COST ≤ OUT_OF_RUN_ENERGY.MAX` (sinon plus aucun raid)
- `ENERGY.CROSSING_COST ≤ ENERGY.MIN_TO_CROSS`
- `ENERGY.MIN_TO_CROSS ≤ OUT_OF_RUN_ENERGY.MAX` (sinon plus aucune partie)
- `RAID_RUN.SHIELD_AFTER_RAID_MS ≤ RAID.BROKEN_SHIELD_MS` (un terrier vidé est protégé au moins aussi longtemps qu'un terrier défendu)

Conséquence pratique : pour baisser le réservoir sous le seuil de traversée, il
faut baisser **les deux** dans la même minute, sinon la plus récente est
refusée.

### Ce qu'on ne peut PAS changer, et pourquoi

- **Les densités de l'île** (`ISLAND.CARROT_DENSITY`, `BOMB_DENSITY`, …) : le
  contenu des cases est figé à la génération.
- **Les règles d'une partie** (`ENERGY.START`, `DIG_COST`, `BOMB_LOSS`,
  `CARROT_GAIN`, `GOLDEN_GAIN`, `FLAG.*`) : elles sont lues pendant que
  quelqu'un est debout sur le plateau. Les changer à chaud ferait jouer deux
  joueurs à deux jeux différents au même moment.
- **`TRAPS.DOORSTEP`** (retirée du registre le 2026-10-01) : le générateur du
  terrier la découpe dans le sol, le résultat est mis en cache, les pièges sont
  stockés par index de case, et le client dessine le seuil depuis sa propre
  copie. La changer à chaud laisserait des pièges posés sur ce qui serait
  devenu le seuil. C'est un déploiement (et un `reset-burrows`), comme tout
  changement de sol.
- **`TRAPS.CARROT_COST`** (retirée le même jour) : c'est un alias, voir plus
  haut. Régler `SHOP.PRICES.trap`.

Insérer une ligne pour l'une d'elles ne casse rien : le chargeur l'ignore et le
journalise (toutes les 30 s — d'où le `--prune` ci-dessous).

### Ce qui est figé au début d'une action

Le serveur lit la valeur du moment, et une poignée de nombres est capturée au
début d'une action plutôt que relue :

- **Une traversée** prend `CROSSING_COST` à l'entrée ; une partie sans un pas
  rend le péage **en vigueur au retour**. Si on le change entre les deux, le
  remboursement diffère du prélèvement de cette différence.
- **Un raid** fixe son énergie de marche (`min(STAKE, réservoir) − TOLL`) à
  l'ouverture, puis prélève `TOLL` au premier pas : changer `TOLL` ou `STAKE`
  pendant qu'un raid est ouvert ne touche que les raids suivants, à quelques
  points près pour celui en cours.
- **Le réservoir pendant une partie** (`ENERGY.MAX`) est relu à chaque gain :
  le baisser plafonne aussi les lapins déjà sur une île.

---

## Côté client

Le client Godot embarque `godot/assets/tuning.json` (exporté de
`config/tuning.ts`). Le serveur lui sert les surcharges **en vigueur**, alias
compris, sous la forme `{"RAID_RUN.TOLL": 50, "ENERGY.MAX": 400, …}` :

- `GET /api/config` → `tuning`, lu une fois au démarrage (`Tuning._ready`) ;
- `GET /api/burrow` → `tuning`, que `Home` relit chaque minute et à chaque
  retour au terrier (`Home._adopt` → `Tuning.adopt`).

`Tuning.adopt` pose ces valeurs **sur** les tables du fichier : `Tuning.n`,
`Tuning.i`, `Tuning.table` et les dérivés (`raid_floor`, `regen_per_hour`,
`upgrade_cost`) lisent les nombres du serveur. Une surcharge qui disparaît
reprend la valeur du fichier ; `{}` les retire toutes. Hors ligne, le fichier
fait foi.

## Côté serveur (pour qui ajoute une clé)

Déclarer une clé dans `config/overridable.ts` **ne suffit pas** : le code doit
la lire en direct. Le code serveur importe ces tables depuis
`src/lib/tuning/tables.ts` (des vues des mêmes objets, même type, dont les clés
déclarées lisent l'instantané de 30 s en mémoire — aucune requête par lecture)
au lieu de `config/tuning.ts`. Une clé lue depuis le fichier directement est un
bouton branché sur rien. `test/tuning-live.test.ts` pose des surcharges et
vérifie que les lectures représentatives bougent ; une clé ajoutée mérite sa
ligne là.

---

## Ce qui se passe si on se trompe

Le fichier est toujours le filet. Une valeur hors bornes, une fraction là où il
faut un entier, une clé inconnue ou alias, deux valeurs qui se contredisent,
une base injoignable : tout retombe sur `config/tuning.ts` et écrit une ligne
dans les logs.

```
[tuning] valeur refusée pour SHOP.PRICES.trap (-50): hors bornes [1, 100000]
[tuning] surcharges refusées (RAID_RUN.TOLL) : le péage dépasse la mise : un raid entrerait avec une énergie négative
```

Une faute de frappe peut donc empêcher une surcharge de s'appliquer, **jamais**
faire tourner le jeu sans règles. Si un changement ne prend pas, c'est la
première chose à regarder :

```bash
ssh datemeee "docker logs --since 5m \$(docker ps --format '{{.Names}}' | grep '^kpj80' | head -1) 2>&1 | grep '\[tuning\]'"
```

---

## Remplir la table

Après une migration, ou après un déploiement qui ajoute une clé :

```bash
DATABASE_URL=... bun db:seed-tuning              # crée ce qui manque
DATABASE_URL=... bun db:seed-tuning --dry-run    # montre sans écrire
DATABASE_URL=... bun db:seed-tuning --reset      # remet TOUT au fichier
DATABASE_URL=... bun db:seed-tuning --prune      # retire les clés mortes
```

Sans `--reset`, le script ne touche **jamais** une ligne modifiée à la main
(`seeded = false`) : il crée ce qui manque et rafraîchit seulement les lignes
qu'il a lui-même écrites. Il est donc rejouable après chaque déploiement sans
écraser une promo en cours.

> **Une ligne semée qui n'a pas suivi le fichier S'APPLIQUE.** Depuis le
> 2026-10-01 les 42 clés sont lues en direct : une ligne `seeded = true` restée
> à une ancienne valeur du fichier (le seed n'a pas été rejoué après un
> changement de `tuning.ts`) surcharge le nouveau chiffre. Rejouer le seed
> après tout déploiement qui touche un de ces nombres, et le
> `--dry-run` liste ce qui diverge (« À remettre à la valeur du fichier »).

> L'URL de la prod pointe sur un nom de conteneur Docker, injoignable depuis
> une machine de dev. Pour semer la prod, passer le SQL par `psql` dans le
> conteneur — voir `docs/GO-TO-PROD.md`.

---

## Les identifiants

Le conteneur Postgres est `8eskt0v2sx156yrsrqyuam8t`, base `rr_crown`, user
`rr`. **Ce nom-là ne change pas** (les bases ne sont pas redéployées), contrairement
aux conteneurs web et ws dont le suffixe bouge à chaque build. Il y a trois
autres Postgres sur la machine : vérifier avant d'écrire.

Pour décider d'un réglage plutôt que de le subir, le carnet d'économie modélise
la journée d'un joueur et dit ce que chaque curseur déplace :
[docs/economy-tuning.html](./economy-tuning.html).
