# Rabbit Royale: The Cursed Crown — Build Plan (MVP-first)

> Fichier destiné à Claude Code. Mets ce fichier + le GDD (`GDD-rabbit-royale-f2p.md`) à la racine du repo. Travaille phase par phase, dans l'ordre. Ne commence JAMAIS une phase avant que la précédente soit jouable et validée par un playtest humain.

## Contexte (à lire avant tout)

Rabbit Royale: The Cursed Crown est un twist free-to-play non-gambling du jeu Rabbit Royale existant. Minesweeper compétitif : un lapin se déplace case par case sur une île en grille isométrique, creuse des cases (indices minesweeper classiques), ramasse des carottes, évite des bombes. Couche persistante par-dessus : terrier pillable, leaderboard avec crown, saisons. Le GDD complet fait foi pour toute question de design — le lire avant de coder.

**Stack cible** : Next.js + TypeScript, Drizzle + PostgreSQL, Redis. Temps réel : WebSocket (serveur Node dédié, autoritaire). Rendu du jeu : réutiliser au maximum le code, les assets et le moteur d'île du Rabbit Royale existant si le repo est fourni ; sinon canvas/PixiJS en attendant les vrais assets. Cible finale Android (wrap plus tard, Capacitor ou TWA) — pour le MVP, tout est web, jouable au navigateur.

## Règles du build (non négociables)

1. **MVP d'abord, tout le reste est faké.** Pas de crypto, pas de NFT, pas de narratif, pas de paiement avant la phase 7. Si une feature n'est pas dans la phase en cours : stub ou rien.
2. **Un seul fichier de tuning.** Toutes les valeurs de game design (énergie de départ, +X carotte, −Z bombe, PV, %, timers, seuils, densités) vivent dans `config/tuning.ts`, jamais en dur dans le code. C'est le fichier qu'on va marteler pendant les playtests.
3. **Jouable à chaque phase.** Chaque phase se termine par un état qu'un humain peut lancer et tester en moins de 30 secondes (`npm run dev`, une URL, on joue).
4. **Serveur autoritaire dès qu'il y a du multi.** Le client n'est jamais source de vérité sur la position des bombes, l'énergie ou le score (jeu compétitif avec de l'argent plus tard = les tricheurs viendront).
5. **Chaque phase répond à une question de playtest.** Elle est écrite dans la phase. Si la réponse est non, on itère sur la phase, on n'avance pas.

---

## Phase 1 — Le run solo (LE MVP)

**But : prouver que creuser est fun.**

- [ ] Génération d'une île : grille (commencer ~16×16), placement aléatoire de bombes et de carottes, calcul des chiffres indices minesweeper (bombes adjacentes)
- [ ] Lapin sur la grille : déplacement case par case (adjacentes, 4 directions), tap/clic ou flèches
- [ ] Marcher sur une case révélée = gratuit ; entrer sur une case non révélée = la creuser (coût 1 énergie)
- [ ] Énergie élastique à montants fixes (depuis `tuning.ts`) : budget de départ, carotte +X, carotte dorée +Y, bombe −Z. HUD : énergie, carottes ramassées
- [ ] Bombe : knockback (projeté de N cases vers l'arrière, priorité au terrain révélé) + stun de S secondes + perte d'énergie. Pas de mort, rien de volé
- [ ] Fin de run quand énergie = 0 → écran récap (carottes, cases creusées, durée)
- [ ] Carotte dorée (rare) et case chest (stub : donne juste des carottes bonus pour l'instant)
- [ ] `tuning.ts` complet + un moyen de relancer une partie instantanément (touche R)

**Definition of done** : je peux enchaîner 5 runs au navigateur sans bug.
**Question de playtest** : est-ce que lire les chiffres pour durer plus longtemps est satisfaisant ? Est-ce qu'on sent la différence entre bien jouer et creuser au hasard ? Si non → tuner +X/−Z/budget avant d'avancer.

## Phase 2 — Le cycle de vie de l'île

**But : donner un rythme et une fin naturelle.**

- [ ] Suivi du % de cases creusées ; seuil (tuning) → warning visuel progressif (le volcan fume : 3 paliers d'intensité)
- [ ] Seuil atteint → éruption : petite séquence visuelle, l'île "coule", nouvelle île générée, le lapin respawn dessus
- [ ] Densités carottes/bombes par île dans `tuning.ts` (prépare les paliers de maps futurs)
- [ ] Variation de la taille/forme des îles à la génération (éviter la monotonie)

**Definition of done** : une session de 15 minutes traverse naturellement 2-3 îles.
**Question de playtest** : le seuil de mort de l'île donne-t-il un bon rythme ? Trop tôt = frustrant, trop tard = île vide et chiante.

## Phase 3 — Multi drop-in (LE risque technique)

**But : la course à 4 sur map partagée. La phase la plus dure, ne pas la sous-estimer.**

- [ ] Serveur WebSocket autoritaire : état de l'île, positions, énergie et scores gérés côté serveur ; le client envoie des intentions (move), reçoit l'état
- [ ] Drop-in : un joueur qui arrive rejoint l'île active la moins pleine (< 4 joueurs) ; toutes pleines → nouvelle île. Pas de lobby, pas de matchmaking
- [ ] Révélation partagée : une case creusée est révélée pour tous, la carotte va au premier (résolution serveur en cas de creusage simultané)
- [ ] Les 4 lapins visibles et animés, pseudo au-dessus, pas de collision (on se traverse)
- [ ] Départ d'un joueur / île qui coule → redistribution propre
- [ ] Reconnexion tolérée (refresh du navigateur ne doit pas tuer la session)
- [ ] Auth minimale : pseudo + session (pas de wallet, pas de compte complet)

**Definition of done** : 4 onglets de navigateur jouent ensemble sur la même île sans desync.
**Question de playtest** : la course à 4 est-elle plus fun que le solo ? Est-ce qu'on se bat pour les zones riches ?

## Phase 4 — Le terrier v0

**But : donner un endroit où les carottes s'accumulent, et une raison de revenir.**

- [ ] Persistance joueur (PostgreSQL/Drizzle) : pseudo, stock de carottes, niveau du terrier, compteurs
- [ ] Fin de run → les carottes rejoignent le stock (elles sont déjà acquises au ramassage, le stock est juste la banque persistante)
- [ ] Écran terrier : stock, niveau (= PV max, une seule stat), bouton upgrade (coût en carottes depuis tuning)
- [ ] Potager : production passive plafonnée, bouton récolter
- [ ] Énergie hors-run : recharge avec le temps (timer), affichée sur l'écran terrier
- [ ] Les 3 compteurs en place : portefeuille, score saison, lifetime (même événement carotte alimente les trois)

**Definition of done** : je ferme le navigateur, je reviens le lendemain, mon stock et mon énergie rechargée m'attendent.
**Question de playtest** : la boucle revenir → récolter → repartir en run donne-t-elle envie de revenir ?

## Phase 5 — PvP : raids puis sabotage

**But : la tension de perte. Faire les raids AVANT le sabotage (plus simple, plus structurant).**

Raids :
- [ ] PV du terrier avec regen temporelle (serveur, via timestamps — pas de cron par joueur)
- [ ] Écran d'attaque : choisir une cible (liste simple pour l'instant), consommer un item bombe → dégâts D ± aléa, réduits par le shield de la cible
- [ ] PV à 0 → pillage : ~25% du stock transféré, ET transfert du score saison équivalent (la carotte volée change de camp entièrement)
- [ ] Shield : item consommable (durée), + shield auto après terrier cassé, + shield d'onboarding nouveaux joueurs (tuning)
- [ ] Réparation : regen gratuite uniquement, jamais payante
- [ ] Notification in-app à la reconnexion ("X a pillé ton terrier : −N carottes")

Sabotage (après validation des raids) :
- [ ] Spectate d'un joueur en run depuis le leaderboard
- [ ] Item bombe → pose une bombe cachée sur sa map, signée (la cible voit qui) ; les chiffres déjà révélés se mettent à jour (le "2" devient "3" — détectable par un joueur attentif)
- [ ] Item lightning → brouille/détruit une zone révélée
- [ ] Les chests des runs droppent maintenant des items d'attaque et des shields (le stub de la phase 1 devient réel)

**Definition of done** : deux comptes peuvent se raid, le score se transfère, le shield protège.
**Question de playtest** : se faire piller donne-t-il envie de se venger (bon signe) ou de désinstaller (mauvais tuning : baisser le %) ?

## Phase 6 — Leaderboard, crown, saison

- [ ] Leaderboard temps réel sur le score saison (Redis sorted set)
- [ ] Crown au #1 : marqueur visuel partout, bonus (tuning), butin pillable augmenté sur lui
- [ ] Saison : durée (tuning), reset du score saison (jamais du lifetime ni du stock), archivage du classement final
- [ ] Fin de saison v0 : simple annonce du Roi + reset (la cérémonie du Sacrifice attend la phase 7)
- [ ] Niveaux = paliers lifetime → déblocage d'îles plus riches/dangereuses (utilise les densités de la phase 2)

**Definition of done** : une saison de test de 48h tourne toute seule du début à la fin.

## Phase 7 — Ce qu'on a volontairement gardé pour la fin

Dans l'ordre, chaque bloc étant optionnel pour un lancement soft :
1. **Monétisation** : achat de recharge d'énergie et de packs (SOL/USDC) — brancher le wallet en dernier, tester avec un mock avant
2. **Narratif** : Mausolée des Rois (tombes persistantes), cérémonie du Sacrifice avec coin flip on-chain, Journal des Rois Morts, épitaphes
3. **NFT** : drops de chests rares, mint Seeker
4. **Wrap Android / Seeker** : Capacitor ou TWA, push notifications natives (le moteur PvP en dépend pour le vrai engagement)
5. **Polish** : sons, juice, onboarding/tuto

---

## Anti-scope-creep (rappels pour Claude Code)

- Pas de clans, pas de chat, pas de push de lapins (collision), pas de re-cover de cases : rejetés ou reportés, c'est dans le GDD §9.
- Pas de "capacité sécurisée" du stock : rejeté v0.6, le plafond de pillage + shields suffisent.
- Ne pas monétiser la réparation. Jamais.
- Toute nouvelle idée de mécanique pendant le dev → l'écrire dans `IDEAS.md` et continuer, ne pas l'implémenter.
- En cas de doute sur une règle → le GDD tranche ; si le GDD ne tranche pas → demander, ne pas inventer.
