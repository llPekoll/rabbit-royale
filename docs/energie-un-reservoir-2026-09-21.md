# Un seul réservoir : ce qu'on a réglé et pourquoi

*21 septembre 2026 — Paul, pour Peko.*

**Une seule énergie (300, pleine en 10 h) pour l'île, le raid et le retour. But : qu'on revienne, et que réfléchir paie.** Tout est sur `main`, simulé (`tools/sim-dig.sim.ts`, `tools/economy-day.sim.ts`) et vu à l'écran.

## La boucle

1. **Plein, île.** Lire le plateau rend de l'énergie, ne pas lire en coûte. Un lecteur ramène le double d'un marcheur et finit Meadow et Thicket d'une traite ; dès Ashland tout le monde meurt.
2. **De quoi piller ? Le jeu le dit** (ligne sur l'île, dalle PILLER au retour). Rentrer vivant et raider rapporte plus que creuser jusqu'au bout.
3. **Raid.** Péage 45, puis un point par pas, huit par piège, 75 au plus. Atteindre le champ rend les pas, jamais les pièges.
4. **À sec, par n'importe quelle porte, le terrier propose la recharge.** Plein en 10 h ; un point par heure de plus par niveau de terrier, jusqu'au 10.

## Les chiffres

| Réglage | Avant | Après |
| --- | --- | --- |
| Regen | 12/h | 30/h, +1 par niveau jusqu'au 10 |
| Péage / mise du raid | 15 / 40 | 45 / 75 |
| Plancher île / raid | 10 / 16 | 40 / 58 |
| Pas rendus au champ | non | oui |
| Recharge en carottes | 900 | 700 |
| Portes de palier | 6 000 / 19 500 / 37 500 | 7 500 / 22 500 / 45 500 |

Le simulateur passe toutes ses cibles : courses 65 % du revenu, raids 15 %, portes aux jours 4 / 9 / 15.

**Rejeté, mesuré** : une barre qui grandit avec le terrier (à 335 le lecteur meurt deux fois moins sur Ashland), une bombe plus lourde (ne touche que le marcheur), une île plus grande (chantier de rendu). **À surveiller en test** : finir Meadow d'une traite ennuie-t-il ? La recharge se vend désormais au retour du raid, plus au récap.

## À toi

Aucune migration.

- [ ] `bun db:seed-tuning` après déploiement (`--dry-run` d'abord) : dix clés d'énergie et de raid sont surchargeables en base et masqueraient le fichier (`SHOP.PRICES.energy`, `OUT_OF_RUN_ENERGY.*`, `ENERGY.MIN_TO_CROSS`, `RAID_RUN.*`).
- [ ] Relire `src/app/api/raid/route.ts` : plancher, budget, pas payés avec `floor: true`, remboursement par charge négative plafonnée, `burrowLevel` lu avec le réservoir.
- [ ] Relire la fusion (d88fa00) : `payEnergy`, `bankRun`, l'éclair sur le réservoir persistant.
- [ ] `findJoinable()` (server/islands/store.ts) ignore le palier : un débutant peut atterrir sur Caldera. À filtrer quand le choix de l'île arrivera.
