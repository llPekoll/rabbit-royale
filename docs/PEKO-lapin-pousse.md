# Pour Peko : le lapin poussé n'est jamais montré, et sa run ne finit pas

Salut Peko,

En faisant l'audit des feedbacks du 15/09, on est tombés sur un trou dans les
poussées (`docs/bumping.md`). Côté serveur, la règle est bien appliquée, mais
**le client n'écoute pas l'événement**, et **une poussée qui tue la victime ne
lui envoie jamais de fin de run**. La moitié client est pour Paul (UX), la
moitié serveur est pour toi. Ce document décrit les deux, pour qu'on se mette
d'accord sur le contrat de l'événement avant de coder.

Tout est lu dans le code, pas reproduit en jeu : il faut deux joueurs sur la
même île, et nos sondes Playwright n'en pilotent qu'un. Si tu veux voir le
bug, le plus simple est deux navigateurs en invité sur la même île, avec A
qui avance dans B.

## Ce qui se passe aujourd'hui

1. **Le serveur émet bien la poussée.** Dans `server/index.ts`, vers la ligne
   751, le handler `move` diffuse `rabbit_pushed` à la room pour chaque
   rabbit poussé, avec `{ playerId, from, to, pushedBy, energy, runOver }`.
   Si la case d'arrivée n'était pas creusée, la règle 2 la creuse et envoie
   un `tile_revealed` normal.

2. **Le client n'écoute pas cet événement.** Il n'y a aucun
   `socket.on('rabbit_pushed')` dans `src/components/use-game-socket.ts`.
   Conséquences, pour tout le monde sur l'île :
   - le sprite de la victime reste sur son ancienne case ;
   - chez la victime, `IslandScene.myTile` ne bouge pas, donc l'anneau des
     cases jouables entoure la mauvaise case et ses taps suivants sont
     refusés (`not-adjacent`). Depuis le commit `14e08eb`, ces refus au moins
     se voient (case rouge, buzz) ;
   - si la poussée tombe sur une bombe, l'explosion se voit sur la case (via
     `tile_revealed`), mais les cœurs de la victime ne baissent pas :
     `energy` n'arrive que par `rabbit_pushed`, que personne ne lit, et le
     serveur n'émet pas de `rabbit_moved` pour la victime.

3. **Une poussée qui finit la run ne la finit que dans la base.** Toujours
   vers la ligne 760, pour `shove.runOver` le serveur appelle seulement
   `bankRun(victim)`. Il n'émet ni `rabbit_died` à la room, ni `run_over` au
   socket de la victime. Or c'est ce que fait le joueur qui bouge quand sa
   propre run se termine (vers les lignes 826-834). La victime continue donc
   à jouer un lapin mort :
   - le serveur refuse ses coups (`dead`) ;
   - pas de carte « Run over », pas de carte grise, pas de musique de fin ;
   - la run est pourtant déjà encaissée.

   Le calcul lui-même est correct : `entry.runOver = true` dans
   `src/lib/game/run.ts` (vers la ligne 178), couvert par `test/push.test.ts`.
   Il manque seulement la sortie vers les clients.

## Ce qu'il faudrait côté serveur (toi)

1. **Pouvoir joindre le socket de la victime.** Aujourd'hui on ne peut pas :
   les sockets ne rejoignent que la room de l'île (`socket.join(roomFor(...))`,
   lignes 496 et 550), et il n'existe pas de table joueur vers socket. Deux
   options :
   - **(recommandé)** une room par joueur au connect, par exemple
     `socket.join(playerRoom(playerId))`, puis
     `io.to(playerRoom(victim)).emit(...)`. Ça servira aussi le jour où on
     voudra prévenir quelqu'un qui se fait piller en direct ;
   - ou `io.in(room).fetchSockets()` en filtrant sur `s.data.playerId`,
     sans rien changer au connect, mais asynchrone à chaque poussée mortelle.

2. **Quand `shove.runOver` est vrai, finir la run de la victime comme
   celle du joueur qui bouge :**
   - `io.to(room).emit('rabbit_died', { playerId: shove.playerId })` ;
   - `run_over` au socket de la victime, avec le même contenu que pour le
     joueur qui bouge : `carrots`, `tilesDug`, `bombsHit`, `durationMs`.
     Attention : ces compteurs vivent dans `socket.data` de la victime, pas
     du pousseur. `victim.run` porte déjà `tilesDug` et `bombsHit`, c'est
     sans doute la source la plus simple ;
   - à toi de voir si une bombe déclenchée par la poussée compte dans
     `bombsHit` de la victime. `bumping.md` dit seulement que le creusage
     n'est pas facturé à la victime.

3. **Optionnel :** garder `energy` dans `rabbit_pushed` (c'est déjà le cas),
   plutôt que d'ajouter un `rabbit_moved` pour la victime. Le client s'en
   servira pour les cœurs.

## Ce que Paul (UX) fera côté client, une fois le contrat validé

- Un listener `rabbit_pushed` qui appelle une nouvelle
  `IslandScene.pushRabbit(playerId, to, pushedBy, energy)` :
  - l'animation de projection existante (`PlayerRabbit.playKnockback`) ;
  - chez la victime : mise à jour de `myTile`, de l'énergie et de l'anneau,
    et l'appareil photo qui suit ;
  - au-dessus de la victime : « shoved by X » (règle 7, la victime voit
    toujours qui l'a poussée) ;
  - les cœurs du HUD mis à jour avec `energy`.
- Rien à faire de plus pour la fin de run : dès que `rabbit_died` et
  `run_over` arrivent, la carte grise, la musique de fin et le récap
  s'enchaînent déjà.

## Références

- `server/index.ts`, handler `move` : lignes ~731 (`move_rejected`), ~740-765
  (boucle `out.pushed`), ~826-834 (fin de run du joueur qui bouge)
- `src/lib/game/run.ts` : `resolveMove`, `pushed`, `entry.runOver`
- `src/lib/game/push.ts` et `test/push.test.ts` : les règles
- `docs/bumping.md` : règle 2 (la poussée creuse et fait sauter), règle 7
  (la victime voit qui l'a poussée)
- `src/components/use-game-socket.ts` : où le listener manque

Dis-nous si le contrat te va (surtout la room par joueur), et on fait le
client dans la foulée.

Paul
