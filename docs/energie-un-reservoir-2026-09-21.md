# Un seul réservoir : ce qu'on a réglé et pourquoi

*21 septembre 2026 — Paul, pour Peko.*

Aujourd'hui on a fondu les trois réserves d'énergie en une seule, puis réglé tout ce qui en dépend pour que le jeu reste cohérent : **qu'on ait envie de revenir, et que réfléchir rapporte**. Tout est sur `main`, simulé avec des robots joueurs et vérifié à l'écran.

## Ce qui a changé, en clair

- **Une seule énergie pour tout.** Elle paie la sortie sur l'île et le raid, et ce qu'il en reste rentre au terrier avec toi. Elle se recharge en 10 h, un peu plus vite à chaque niveau de terrier.
- **Les raids coûtent plus d'énergie qu'avant.** Sinon ils rapportaient trois à cinq fois plus qu'une fouille pour la même énergie, et tout le monde aurait raidé avant de creuser. Ils restent le meilleur coup, environ deux fois une fouille. Et un raid bien mené, qui atteint le champ, récupère l'énergie de ses pas.
- **On n'entre plus nulle part avec trop peu pour y faire quelque chose.** Avant, on pouvait débarquer sur une île et mourir au septième coup.
- **Quand il te reste de quoi piller, le jeu te le dit** : sur la jauge, sur l'île, sur le bouton de sortie. Rentrer vivant pour piller rapporte plus que creuser jusqu'au bout, et personne ne le devinait.
- **À sec, le terrier propose la recharge**, quelle que soit la façon dont tu t'es vidé. La recharge coûte à peu près ce qu'une sortie rapporte, ni cadeau ni arnaque.
- **On choisit son île** parmi celles qu'on a débloquées. Une île où d'autres creusent déjà est une sortie courte et sans danger ; une île neuve est la longue course où on peut mourir. Et un débutant ne tombe plus sur l'île d'un vétéran par accident.
- **Les îles suivantes s'ouvrent un peu plus tard** (jours 3-4, 8-9, 14-15), recalées sur ce que les joueurs gagnent vraiment.

## L'intention

- **Réfléchir paie.** Un joueur qui lit les chiffres ramène le double de celui qui creuse au hasard, et finit même les deux premières îles d'une traite. C'est voulu : la récompense de la première semaine. À partir de la troisième île, tout le monde meurt.
- **La difficulté est progressive en apprenant, choisie ensuite, sociale pour toujours.** Deux semaines d'échelle, puis le joueur choisit son île et son risque, et ce sont les autres joueurs qui font monter la pression. Pas de cinquième île : après, de la variété et des records.
- **On a testé et rejeté** ce qui punit le joueur au hasard sans toucher celui qui réfléchit : une jauge qui grandit avec le niveau, une bombe plus lourde, une île plus grande.

## À surveiller en test

- Finir la première île d'une traite, est-ce que ça ennuie ?
- La recharge se vend maintenant au retour d'un raid à sec, plus à la mort sur l'île. Est-ce que le moment est le bon ?

## À toi

Aucune migration de base.

- [ ] Après déploiement, relancer le semis de la table de réglages (`bun db:seed-tuning`, `--dry-run` d'abord) : une dizaine de valeurs d'énergie et de raid y sont surchargeables et masqueraient le fichier.
- [ ] Relire la route du raid (`src/app/api/raid/route.ts`) : ce qu'un raid demande pour entrer, ce qu'il dépense, le remboursement des pas au champ, et le niveau du terrier lu avec l'énergie.
- [ ] Relire la fusion des réserves (commit d88fa00) : le paiement atomique, le retour de l'énergie au terrier, l'éclair du spectateur.
- [ ] Relire le choix de l'île côté serveur (`join` avec une île ou un palier, la jointure par palier, l'événement `islands`).

Les chiffres exacts sont dans `config/tuning.ts`, chacun avec son commentaire et sa mesure.
