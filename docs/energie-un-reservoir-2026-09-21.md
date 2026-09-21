# Un seul réservoir : ce qu'on a réglé et pourquoi

*21 septembre 2026 — Paul, pour Peko. La version vivante est aussi un doc Claude ; celle-ci est la copie du dépôt.*

**Le but : qu'on revienne, et que réfléchir paie.** Une seule énergie (300, pleine en 10 h) fait tourner les trois boucles, et chaque réglage ci-dessous sert l'un de ces deux buts. Tout est sur `main`, mesuré avec les simulateurs (`tools/sim-dig.sim.ts`, `tools/economy-day.sim.ts`) et vu à l'écran. Ta part tient en quatre cases, tout en bas.

## Ce que vit le joueur

1. **Il part sur une île avec le plein** et creuse. Lire le plateau rend de l'énergie ; ne pas lire en coûte. Un lecteur ramène le double d'un marcheur, et finit même Meadow et Thicket d'une traite : c'est la récompense de la première semaine. À partir d'Ashland, tout le monde meurt.
2. **Quand il lui reste de quoi piller, le jeu le lui dit** : une ligne sur l'île, la dalle PILLER qui saute au retour. Rentrer vivant et raider rapporte plus que creuser jusqu'au bout. C'est le premier vrai choix entre deux portes.
3. **Il raide.** Le péage est le prix, la marche est une caution : s'il atteint le champ, ses pas lui reviennent ; chaque piège brûle la sienne. Là aussi, réfléchir rend de l'énergie.
4. **À sec, par n'importe quelle porte, le terrier lui propose la recharge**, ou l'attente. Le plein revient en 10 h, plus vite si le terrier a grandi : un point par heure et par niveau, jusqu'au 10.

## Les règles, une phrase chacune

- Une course finit à zéro, donc un plein est une course : regen, recharge et portes de palier suivent la barre.
- Un raid coûte un péage (45) puis ses pas et ses pièges, jamais plus que la mise (75) ; il paie environ deux fois une course au point d'énergie, pas cinq.
- On n'entre nulle part sans de quoi y faire quelque chose : 40 pour une île, 58 pour un raid.
- Seul le X rend de l'énergie sur l'île ; seul le champ atteint en rend en raid.
- Chaque niveau de terrier recharge un point de plus par heure, jusqu'au niveau 10.

## Les chiffres

| Réglage | Avant | Après |
| --- | --- | --- |
| Regen | 12/h | 30/h au niveau 1, +1 par niveau jusqu'au 10 |
| Péage / mise du raid | 15 / 40 | 45 / 75 |
| Plancher île / raid | 10 / 16 | 40 / 58 |
| Pas rendus au champ | non | oui, pièges exclus |
| Recharge en carottes | 900 | 700 |
| Portes de palier | 6 000 / 19 500 / 37 500 | 7 500 / 22 500 / 45 500 |

Inchangés : fouille 1, bombe 30, X +3/+2 et −15, frais de traversée 5, piège 8, recharge 0,99 $. Le simulateur du jour passe toutes ses cibles : courses 65 % du revenu, raids 15 %, terrier niveau 5 en un jour et demi, Thicket / Ashland / Caldera aux jours 4 / 9 / 15.

## Mesuré et rejeté

- **Une barre qui grandit avec le terrier** : à 335 un lecteur meurt deux fois moins sur Ashland, à 395 il la nettoie. La barre est la difficulté des deux derniers paliers ; on a donné la regen à la place.
- **Une bombe à 45 ou 60, ou un X à +2** : punit le marcheur, ne touche pas le lecteur.
- **Une île plus grande** : le disque remplit déjà la grille, ce serait un chantier de rendu.

## À surveiller en test

- Finir Meadow d'une traite ennuie-t-il, et combien de carburant rentre ?
- Le joueur qui rentre toujours au seuil ne meurt plus : la recharge se vend au retour du raid, pas au récap.

## À toi : base et serveur

Aucune migration : l'énergie est lue contre `energyUpdatedAt`, un raid en cours garde son budget de départ.

- [ ] **Semer la table `tuning`** après déploiement, `bun db:seed-tuning` (`--dry-run` d'abord). Dix clés y sont surchargeables et masqueraient le fichier : `SHOP.PRICES.energy`, `OUT_OF_RUN_ENERGY.REGEN_PER_HOUR`, `.MAX`, `.REGEN_PER_LEVEL`, `.REGEN_LEVEL_CAP`, `ENERGY.MIN_TO_CROSS`, `RAID_RUN.TOLL`, `.STAKE`, `.WALK_FLOOR`, `.STEP_REFUND_AT_FIELD`. Une ligne éditée à la main est laissée telle quelle (`--reset` pour l'écraser).
- [ ] **Relire `src/app/api/raid/route.ts`** : plancher `TOLL + WALK_FLOOR`, budget `min(STAKE, réservoir) − TOLL`, pas payés avec `floor: true`, pas rendus au champ par charge négative plafonnée, et les lignes lues avec leur `burrowLevel` pour la regen.
- [ ] **Relire la fusion** (d88fa00) : `payEnergy` en verrou optimiste à la milliseconde, `bankRun`, l'éclair du spectateur sur le réservoir persistant.
- [ ] **À la prochaine barre** : rejouer `tools/economy-day.sim.ts`, qui dit où tombent recharge et portes, puis re-semer.

Côté interface, pour Paul : `EnergyBar` n'est plus montée, `hasRank` dans la pilule est calculé sans être lu, et un bug de dalles éteintes sans obstacle visible attend une reproduction.

## À noter aussi

`findJoinable()` (server/islands/store.ts) rejoint l'île la plus pleine sans regarder le palier : un débutant peut atterrir sur Caldera, un vétéran sur Meadow. À filtrer par palier si le choix de l'île par course arrive (GDD, ligne sur les paliers).
