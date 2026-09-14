# Régler le jeu sans redéployer

Les chiffres de `config/tuning.ts` partent avec le build. En changer un demande
un commit, une image, un redéploiement — et pour `rr-ws`, qui tient les îles en
mémoire en réplique unique, **un redéploiement tue toutes les parties en
cours**. C'est le bon prix pour changer une règle, et beaucoup trop cher pour
corriger un prix.

Une trentaine de valeurs sont donc surchargeables depuis la table `tuning` :
une ligne de SQL, effet en **30 secondes**, aucun redémarrage.

---

## La commande

```bash
ssh datemeee "docker exec 8eskt0v2sx156yrsrqyuam8t psql -U rr -d rr_crown -c \
  \"update tuning set value = 199, note = 'promo week-end' where key = 'SHOP.PRICES.bomb';\""
```

En SQL nu, une fois dans `psql` :

```sql
update tuning set value = 199, note = 'promo week-end' where key = 'SHOP.PRICES.bomb';
```

**Toujours remplir `note`.** Un chiffre nu est inexplicable une semaine plus
tard : c'est la note qui distingue un réglage voulu d'une expérience oubliée.

### Voir ce qui est réglé en ce moment

```bash
# Tout, avec ce qui a été touché à la main en premier
ssh datemeee "docker exec 8eskt0v2sx156yrsrqyuam8t psql -U rr -d rr_crown -c \
  'select key, value, note, updated_at from tuning order by seeded, key'"

# Juste les prix
ssh datemeee "docker exec 8eskt0v2sx156yrsrqyuam8t psql -U rr -d rr_crown -c \
  \"select key, value, note from tuning where key like 'SHOP.%' order by key\""
```

`seeded = false` marque les lignes modifiées à la main. C'est la colonne à lire
pour retrouver ce qui a été bidouillé un soir et jamais remis.

### Revenir à la valeur du fichier

```bash
# Une clé
DATABASE_URL=... bun db:seed-tuning --reset     # ou, à la main :
```

```sql
-- remet la bombe au prix du build, et la remarque comme semée
update tuning set value = 300, note = 'Prix d''une bombe en carottes', seeded = true
where key = 'SHOP.PRICES.bomb';
```

Supprimer la ligne marche aussi : une clé absente **est** la valeur du fichier.

---

## Ce qu'on peut changer

Trente-cinq clés, déclarées avec leurs bornes dans `config/overridable.ts`.

| Groupe | Clés | Ce que ça bouge |
| --- | --- | --- |
| `SHOP.PRICES.*` | 7 | Prix en carottes : `trap` `bomb` `lightning` `shield` `energy` `smoke` `mirage` |
| `SHOP.USDC_PRICES.*` | 7 | Les mêmes, en argent réel |
| `GARDEN.*` | 3 | `YIELD_PER_HOUR_BASE` `YIELD_PER_LEVEL` `CAP_HOURS` |
| `OUT_OF_RUN_ENERGY.*` | 2 | `REGEN_PER_HOUR` `MAX` |
| `ENERGY.RUN_COST` | 1 | Ce qu'une partie coûte au terrier |
| `ENERGY_PACK.MAX_PER_DAY` | 1 | Pleins d'énergie achetables par jour |
| `BURROW.*` | 2 | `UPGRADE_BASE_COST` `UPGRADE_GROWTH` |
| `RAID_RUN.*` | 5 | Parts de butin, bouclier, délai entre raids |
| `RAID.*` | 3 | `LOOT_CAP` et les deux boucliers |
| `TRAPS.*` | 4 | Allocation gratuite, plafonds, prix |

### Ce qu'on ne peut PAS changer, et pourquoi

Les densités de l'île (`ISLAND.CARROT_DENSITY`, `BOMB_DENSITY`, …) et les
règles d'une partie (`ENERGY.START`, `CARROT_GAIN`, `GOLDEN_GAIN`,
`BOMB_LOSS`, `DIG_COST`) **ne sont pas surchargeables**, et ce n'est pas un
oubli.

Le contenu des cases est figé une fois pour toutes à la génération de l'île,
et les règles d'énergie sont lues pendant que quelqu'un est debout sur le
plateau. Les changer à chaud ferait jouer deux joueurs à deux jeux différents
au même moment, sans rien à l'écran pour l'expliquer. Ces chiffres-là coûtent
un déploiement, ce qui est le prix honnête d'un changement de règle.

Insérer une ligne pour l'une d'elles ne casse rien : le chargeur l'ignore et le
journalise.

---

## Ce qui se passe si on se trompe

Le fichier est toujours le filet. Une valeur hors bornes, une fraction là où il
faut un entier, une clé inconnue, une base injoignable : les quatre retombent
sur `config/tuning.ts` et écrivent une ligne dans les logs.

```
[tuning] valeur refusée pour SHOP.PRICES.bomb (-50): hors bornes [1, 100000]
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

Sans `--reset`, le script ne touche **jamais** une ligne modifiée à la main :
il crée ce qui manque et rafraîchit seulement les lignes qu'il a lui-même
écrites. Il est donc rejouable après chaque déploiement sans écraser une promo
en cours.

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
