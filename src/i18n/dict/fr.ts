/**
 * FRANÇAIS.
 *
 * PAS DE CAPITALES PARTOUT. L'anglais crie parce que la police du kit n'a pas
 * de minuscules (voir en.ts) ; le français tombe sur une face qui en a, donc
 * les étiquettes s'écrivent normalement. Les quelques mots qui restent en
 * capitales ici sont ceux que l'arcade crie aussi en français — les trois
 * verbes du sol, le titre d'un panneau — et c'est un choix de ton, pas une
 * limite technique.
 *
 * LE TON. L'île parle sec, à la deuxième personne, sans emphase. Elle constate.
 * Les phrases longues de l'original restent longues ; les répliques de douze
 * mots restent courtes, parce que les cartes qui les portent ont une hauteur
 * fixe et coupent ce qui déborde.
 */
import type { Dict } from '../dictionaries';

export const fr: Dict = {
  units: { s: 's', m: 'min', h: 'h', d: 'j' },

  meta: {
    title: 'Rabbit Royale : la couronne maudite',
    description: 'Démineur compétitif. Creuse, entasse, pille, porte la couronne.',
  },
  lang: { label: 'Langue' },

  auth: {
    connect: 'Connecter un portefeuille',
    connecting: 'On creuse...',
    guest: 'Jouer en invité',
    waiting: 'Attente...',
    guestNote: 'Terrier invité. Connecte un portefeuille pour le garder.',
    guestTag: 'INVITÉ',
    noWallet: "Aucun portefeuille trouvé. Ouvre l'appli Rabbit Royale ou installe un portefeuille Solana.",
    signInFailed: 'Connexion échouée',
    guestFailed: "Impossible d'ouvrir un terrier invité",
    walletTaken: 'Ce portefeuille a déjà un terrier.',
    walletDigsFor: (name) => `Ce portefeuille creuse déjà pour « ${name} ».`,
    alreadyLinked: 'Ce terrier a déjà un portefeuille.',
    linkFailed: 'Impossible de connecter ce portefeuille',
  },

  chrome: {
    loading: 'Chargement',
    waking: 'On réveille la garenne',
    moreBelow: 'Faire défiler pour voir la suite',
    reconnecting: 'Reconnexion...',
    back: 'Retour',
    close: 'Fermer',
    shop: 'Boutique',
    story: 'Récit',
    season: 'SAISON',
    logoAlt: 'Rabbit Royale',
    rotateTitle: 'Tourne ton téléphone',
    rotateBody: 'Rabbit Royale se joue en paysage.',
  },

  install: {
    title: {
      ios: 'Écran d\'accueil',
      macSafari: 'Dans le Dock',
      chromiumDesktop: 'Installer l\'app',
      androidChromium: 'Écran d\'accueil',
    },
    line: {
      ios: 'Plein écran, sans barre de navigateur, à un geste de ton écran d\'accueil.',
      macSafari: 'Rabbit Royale dans sa propre fenêtre, depuis ton Dock.',
      chromiumDesktop: 'Rabbit Royale dans sa propre fenêtre, à un clic de ton dock.',
      androidChromium: 'Plein écran, sans barre de navigateur, à un geste de ton écran d\'accueil.',
    },
    steps: {
      ios: [
        'Touche le bouton Partager (dans Safari, la barre du bas ; dans Chrome, la barre d\'adresse).',
        'Fais défiler et touche Sur l\'écran d\'accueil.',
        'Touche Ajouter. Rabbit Royale s\'ouvre en plein écran depuis ton écran d\'accueil.',
      ],
      macSafari: [
        'Dans la barre des menus, choisis Fichier > Ajouter au Dock (ou Partager > Ajouter au Dock).',
        'Clique sur Ajouter. Rabbit Royale s\'ouvre dans sa fenêtre depuis ton Dock.',
        'Il faut Safari 17 ou plus récent.',
      ],
      prompt: ['Appuie sur Installer ci-dessous et confirme dans la fenêtre du navigateur.'],
      chromiumDesktop: [
        'Clique sur l\'icône d\'installation au bout de la barre d\'adresse, ou ouvre le menu du navigateur > Caster, enregistrer et partager > Installer la page en tant qu\'application.',
        'Confirme avec Installer.',
        'Déjà installée ? L\'icône dit alors Ouvrir dans l\'application.',
      ],
      androidChromium: [
        'Ouvre le menu du navigateur (les trois points) et touche Ajouter à l\'écran d\'accueil.',
        'Touche Installer. Rabbit Royale s\'ouvre en plein écran depuis ton écran d\'accueil.',
      ],
    },
    install: 'Installer',
    installing: 'Installation...',
    showMe: 'Montre-moi',
    gotIt: 'Compris',
    close: 'Fermer',
    app: 'App',
  },

  sound: {
    group: 'Son',
    music: 'Musique',
    effects: 'Effets',
    volume: 'Volume',
    on: 'OUI',
    off: 'NON',
    settings: 'Réglages du son',
    mute: 'Couper la musique',
    unmute: 'Remettre la musique',
    musicOn: 'Musique active',
    musicOff: 'Musique coupée',
  },

  loop: {
    dig: 'CREUSER',
    defend: 'DÉFENDRE',
    raid: 'PILLER',
    broughtHome: 'ramenées',
    ariaGroup: 'Creuser, terrier, piller',
    ariaDig: (line) => `Creuser. ${line}`,
    ariaDefend: (line) => `Défendre : enterrer des pièges. ${line}`,
    ariaRaid: (line) => `Piller. ${line}`,
    energyOf: (energy, max) => `${energy}/${max} énergie`,
    runCosts: (n) => `une sortie coûte ${n}`,
    runIn: (wait) => `sortie dans ${wait}`,
    aMoment: 'un instant',
    gardenPlus: (n) => `potager +${n}`,
    gardenEmpty: 'potager vide',
    shieldFor: (wait) => `bouclier ${wait}`,
    shieldBadge: (wait) => `Bouclier ${wait}`,
    noShield: 'sans bouclier',
    /* Zéro est singulier en français, contrairement à l'anglais. */
    traps: (n) => `${n} piège${n < 2 ? '' : 's'}`,
    leftOutside: (name, n) => `${name} a laissé ${n} dehors`,
    burrowsOpen: (n) => `${n} terrier${n < 2 ? '' : 's'} ouvert${n < 2 ? '' : 's'}`,
    bombsInBag: (n) => `${n} bombe${n < 2 ? '' : 's'} en sac`,
    allShielded: 'tous les terriers sont protégés',
  },

  next: {
    label: 'SUITE',
    aria: (text) => `Suite : ${text}`,
    gardenFull: 'Potager presque plein. Rentre-le avant un pillard.',
    shieldLifts: (wait) => `Bouclier levé dans ${wait}. Enterre des pièges.`,
    raidTarget: (name, garden) => `${name} a laissé ${garden} au potager. Pille.`,
    dig: (energy) => `${energy} énergie : de quoi sortir. Creuse.`,
    digPlain: 'Creuse.',
    runIn: (wait) => `Une sortie dans ${wait}. Le potager pousse pendant ce temps.`,
  },

  burrow: {
    title: 'TON TERRIER',
    level: (n) => `TERRIER - NIV ${n}`,
    maxLevel: 'NIVEAU MAX',
    upgrade: 'CREUSER PLUS',
    safe: 'À L’ABRI',
    exposed: (n) => `${n} EXPOSÉES`,
    garden: 'POTAGER',
    harvest: 'RÉCOLTER',
    energy: 'ÉNERGIE',
    gardenGrows: 'LE POTAGER POUSSE PLUS VITE',
  },

  notes: {
    shieldUp: 'Bouclier levé. Les pillards rebondissent.',
    watered: 'Arrosé. Le potager se remplit plus vite.',
    fed: 'Nourri. Le potager tient davantage.',
    gardenEmpty: 'Le potager est vide. Reviens plus tard.',
    maxDepth: 'Ton terrier est aussi profond que possible.',
    shieldAlready: 'Un bouclier est déjà levé.',
    noneLeft: 'Plus rien. Les coffres en lâchent.',
    toppedUp: 'Déjà plein. Garde-le pour plus tard.',
    islandSilent: "L'île n'a pas répondu. Réessaie dans un instant.",
    runResumed: 'Retour à ta partie.',
    reconnecting: 'Reconnexion... réessaie dans un instant.',
    harvested: (n) => `+${n} 🥕`,
    needMore: (n) => `Il manque ${n} 🥕`,
    questDone: (title) => `Quête finie : ${title}`,
  },

  run: {
    goFarm: 'Déminer l’île',
    findMe: 'Retrouver mon lapin',
    retreat: 'Battre en retraite',
    home: 'Terrier',
    stopWatching: 'Arrêter de regarder',
    theirRun: 'leur sortie',
    chests: (taken: number, total: number) => `${taken}/${total} coffres`,
    chestsTitle: "Les coffres pris sur cette île — par tout le monde. Tous pris, elle coule.",
    watching: (label) => `👁 tu regardes ${label}`,
    hearts: (full, total) => `${full} cœurs sur ${total}`,
    heartsShort: (full, total) => `${full} / ${total} cœurs`,
    /** The run's energy bar, read aloud. */
    energy: (n, max) => `${n} d'énergie sur ${max}`,
    /** The red X — see FLAG in tuning. */
    markBomb: 'Marquer une bombe',
    markHint: 'Touche la case où tu penses qu’il y a une bombe · juste : +énergie · faux : -énergie',
    markCancel: 'Annuler',
    markNothing: 'Rien à marquer ici : toutes les cases autour de toi sont déjà lues.',
    energyLow: 'Énergie basse. Un X juste sur une bombe en rend.',
    trapHint: (left) => `Touche une case pour la miner, une mine pour la reprendre · ${left} restant`,
    trapHintEmpty: 'Plus de bombes · achètes-en une autre, ou touche une mine pour la reprendre et la poser ailleurs',
    strike: 'Foudroyer',
    aiming: 'Touche un rival pour le foudroyer',
    strikeNone: 'Pas d’éclair à appeler. La remise en vend.',
    plant: 'Poser une bombe',
    aimingPlant: 'Touche une case non creusée pour y enterrer une bombe',
    plantNone: 'Pas de bombe à poser. La remise en vend.',
    planted: 'Bombe enterrée. Toi seul sais où.',
    plantRefused: {
      'off-island': 'Pas sur l’île.',
      revealed: 'Ce sol est déjà creusé.',
      hinted: 'Le plateau dit déjà que cette case est sûre.',
      chest: 'Pas sous un coffre.',
      'too-many': 'Trois bombes actives, c’est le maximum ici.',
    } as Record<string, string>,
    plantedBy: (name) => `La bombe de ${name} !`,
    struckBy: (name) => `${name} t’a foudroyé`,
  },

  firstRun: {
    tap: 'Touche une case à côté de toi pour creuser.',
    numbers: 'Le chiffre compte les bombes qui touchent la case.',
    mark: 'Tu sais où est une bombe ? Appuie sur le X rouge et marque-la : ça rend de l’énergie.',
    marked: 'Juste ! Un bon X rend de l’énergie. C’est comme ça qu’on creuse plus loin.',
    bomb: 'Ça coûte de l’énergie. Le 1 la désignait.',
    golden: 'De l’or ! Une carotte dorée en vaut cinq.',
    chest: 'Un coffre. Ce qu’il contient rentre avec toi.',
    clock: 'L’île est l’horloge. Creuse-la et elle coule.',
    recap: 'Tes carottes sont au terrier. Va voir.',
  },

  recap: {
    cleared: 'ÎLE DÉMINÉE !',
    over: 'SORTIE FINIE',
    clearedNote: 'Tout ce qui valait la peine est creusé. Le volcan a pris le reste.',
    overNote: 'Plus d’énergie.',
    tutorialDone: 'TU L\u2019AS EU !',
    tutorialDoneNote: 'Le coffre, c\u2019était toute l\u2019île. Tes carottes t\u2019attendent au terrier.',
    stats: (carrots, dug, bombs, time) => `🥕 ${carrots} · ${dug} creusées · 💣 ${bombs} · ${time}`,
    bank: (energy, max, cost) => `⚡ ${energy}/${max} au terrier · une sortie prend ${cost}`,
    getEnergy: 'Prendre de l’énergie',
    goHome: 'Terrier · entasser',
  },

  pill: {
    banked: (n) => `${n} carottes en réserve`,
    carryNote: 'Portées cette sortie : mises en réserve au retour',
    carrying: (n) => `${n} carottes portées, pas encore en réserve`,
    leading: 'en tête',
    rankFirst: 'Rang de saison n°1 : en tête du classement',
    rank: (rank, gap) => `Rang de saison n°${rank} : ${gap} points pour passer n°${rank - 1}`,
    toPass: (gap, rank) => `${gap} pour le n°${rank - 1}`,
    showClimb: (n, rank) => `${n} carottes en réserve, rang de saison n°${rank}. Afficher ce qu'il faut pour monter`,
    hideClimb: (n, rank) => `${n} carottes en réserve, rang de saison n°${rank}. Masquer ce qu'il faut pour monter`,
  },

  board: {
    show: 'Afficher le classement',
    hide: 'Masquer le classement',
    diggingNow: 'creuse en ce moment · touche pour regarder',
    watch: (name) => `Regarder ${name} creuser`,
    notOut: (name) => `${name} n’est pas dehors en ce moment`,
  },

  shop: {
    title: 'BOUTIQUE',
    shed: 'LA REMISE',
    aria: 'Boutique',
    protect: 'PROTÉGER LA BASE',
    protectAria: 'Protéger ta base',
    protectBuyAria: 'Protéger ta base - acheter un piège',
    noTraps: 'AUCUN PIÈGE - EN PRENDRE',
    nothingBuried: 'RIEN D’ENTERRÉ',
    inShed: (n) => `${n} À LA REMISE`,
    rearming: (n) => `RÉARMEMENT - ${n} REVIENNENT`,
    upAndRearming: (armed, rearming) => `${armed} EN PLACE - ${rearming} EN RÉARMEMENT`,
    inGround: (armed, max) => `${armed}/${max} EN TERRE`,
    openShed: 'Ouvrir la remise',
    payWith: 'Payer avec',
    outOfEnergy: 'PLUS D’ÉNERGIE',
    energySay: (cost, wait) =>
      `Une sortie prend ${cost}. De quoi repartir revient tout seul dans ${wait}.`
      + ' Ou remplis maintenant et continue de creuser.',
    energySayEmpty: (wait) =>
      `La barre est vide. Un point revient tout seul dans ${wait}.`
      + ' Ou remplis maintenant et continue de creuser.',
    fillsTo: (max) => `Remplit la barre jusqu’à ${max}.`,
    noRefills: ' Plus de recharge aujourd’hui.',
    refillsLeft: (n) => ` ${n} recharge${n > 1 ? 's' : ''} aujourd’hui.`,
    cardsOff: 'Le paiement par carte n’est pas encore ouvert. Carottes seulement.',
    connectForCard: 'Connecte un portefeuille pour payer par carte. Tout ici se creuse aussi.',
    eitherWay: 'Carottes creusées ou carte. Même marchandise.',
    pricing: 'Calcul du prix...',
    approve: 'Valide dans ton portefeuille...',
    confirming: 'Confirmation sur la chaîne...',
    priceLabel: (price) => `${price} carottes`,
    buy: (name, price) => `Acheter ${name} pour ${price}`,
    capped: (name, price) => `${name} : ${price}. Tu en portes déjà le maximum.`,
    tooPoor: (name, price) => `${name} : ${price}. Pas assez de carottes. Va creuser.`,
    heldOf: (held, cap) => `${held}/${cap}`,
    heldToday: (n) => `${n} aujourd’hui`,
    heldDaysLeft: (n) => `${n}j restants`,
    heldOff: 'inactif',
    boughtEnergy: (paid) => `Énergie rechargée. ${paid}`,
    boughtTrap: (n, paid) => `${n > 1 ? `${n} pièges` : 'Piège'} à la remise. ${paid}`,
    boughtBomb: (n, paid) => `${n > 1 ? `${n} bombes armées` : 'Bombe armée'}. ${paid}`,
    boughtLightning: (n, paid) => `${n > 1 ? `${n} éclairs` : 'Éclair'} en bouteille. ${paid}`,
    boughtShield: (n, paid) => `${n > 1 ? `${n} boucliers prêts` : 'Bouclier prêt'}. ${paid}`,
    boughtSmoke: (paid) => `Les chiffres sont cachés. ${paid}`,
    boughtMirage: (n, paid) => `${n > 1 ? `${n} mirages prêts` : 'Mirage prêt'} à lancer. ${paid}`,
    paid: (spent) => `-${spent} 🥕`,
  },

  shopErrors: {
    fallback: 'Ça n’a pas marché.',
    insufficient_carrots: 'Pas assez de carottes.',
    inventory_full: 'Ton sac en est plein.',
    daily_energy_limit: 'Plus de recharge aujourd’hui. Le potager pousse quand même.',
    smoke_capped: 'Ton terrier est caché aussi longtemps que possible.',
    too_many_at_once: 'Trop à la fois.',
    bad_quantity: 'Ce n’est pas une quantité.',
    no_traps: 'Plus de pièges. Achètes-en un, ou attends demain.',
    board_full: 'Ton terrier ne peut pas tenir un piège de plus.',
    tile_not_trappable: 'Rien à miner là.',
    tile_doorstep: 'Trop près de l\'entrée. Les premiers pas restent libres.',
    tile_already_trapped: 'Déjà miné.',
    no_trap_there: 'Pas de piège là.',
    payments_unavailable: 'Le paiement par carte n’est pas encore en place.',
    quote_expired: 'Ce prix a expiré. Réessaie.',
    signature_already_used: 'Ce paiement a déjà servi.',
    not_confirmed_yet: 'Confirmation sur la chaîne en cours...',
    wrong_reference: 'Cette transaction ne correspond pas à cet achat.',
    no_matching_transfer: 'Aucun transfert USDC correspondant.',
    failed_on_chain: 'La transaction a échoué sur la chaîne.',
  },

  pay: {
    needsBuild: 'Payer dans l’appli attend la prochaine version. Paie en carottes pour l’instant.',
    noWallet: 'Aucun portefeuille Solana. Installe Phantom pour payer en USDC.',
    notConfigured: 'Les paiements ne sont pas configurés sur ce serveur.',
    stillConfirming: 'Payé, confirmation en cours. Rouvre la boutique dans une minute. Rien n’est perdu.',
    failed: 'Paiement échoué',
  },

  kit: {
    aria: 'Ce que tu portes',
    shieldHolding: (wait, held) => `Bouclier : actif, ${wait} restant. ${held} en sac.`,
    shieldReady: (held) => `Bouclier : ${held} en sac. Lève-en un. Les pillards rebondissent tant qu’il tient.`,
    shieldNone: 'Bouclier : aucun. Achètes-en un en boutique.',
    smokeOff: 'Écran de fumée : inactif. Achètes-en un pour cacher tes chiffres.',
    smokeUp: (days) =>
      `Écran de fumée : actif, ${days} jour${days < 2 ? '' : 's'} restant${days < 2 ? '' : 's'}.`
      + ' Les pillards traversent ton terrier à l\u2019aveugle.',
    carried: (name, held, blurb) => `${name} : ${held} en sac. ${blurb}`,
    carriedNone: (name, blurb) => `${name} : aucun. ${blurb}`,
    trapsLine: (placed, max, held) =>
      `Pièges : ${placed}${max ? ` sur ${max}` : ''} en terre, ${held} à la remise.`
      + ' Enterre-les depuis BASE.',
    trapsBuy: (held, price) =>
      (held > 0
        ? `Pièges : ${held} à la remise. Achètes-en un autre pour ${price} carottes.`
        : `Pièges : la remise est vide. Achètes-en un pour ${price} carottes.`),
    trapsBuyBroke: (price) =>
      `Pièges : plus aucun. Un piège coûte ${price} carottes - va en creuser.`,
    trapsBuyFull: (held) => `Pièges : ${held} à la remise. La remise est pleine.`,
    bottleRunning: (name, wait, count) => `${name} : en cours, ${wait} restant. ${count} en sac.`,
    bottleHeld: (name, count) => `${name} : ${count} en sac. Verse-en un sur le potager.`,
    bottleNone: (name) => `${name} : aucun. On en trouve dans les coffres.`,
    watering: 'Arrosage',
    fertiliser: 'Engrais',
  },

  raid: {
    go: 'PARTIR PILLER',
    another: 'Piller un autre terrier',
    choose: 'Choisis un terrier',
    whose: 'QUEL TERRIER ?',
    allShielded: 'TOUS LES TERRIERS PROTÉGÉS',
    nobody: 'PERSONNE À VOLER',
    shielded: 'Protégé',
    presence: {
      away: 'absent',
      home: 'au terrier',
      digging: 'parti creuser',
    },
    raidIt: 'Piller',
    brief: 'Atteins le champ de carottes. Leurs pièges sont enterrés et invisibles.',
    outOfEnergy: 'Plus d’énergie',
    nothingTaken: 'Rien pris',
    unguarded: (amount) => `${amount} SANS GARDE`,
    nobodyYet: 'Personne d\u2019autre n\u2019a encore de terrier.',
    steps: 'pas',
    looted: (n) => `+${n} 🥕`,
    won: 'PILLAGE RÉUSSI !',
    backToBurrow: 'RETOUR AU TERRIER',
    aRival: 'UN RIVAL',
    lootedFrom: (name) => `VOLÉ À ${name}`,
    wasEmpty: (name) => `LE TERRIER DE ${name} ÉTAIT VIDE`,
    trapsSprung: (n) =>
      n < 2 ? `${n} PIÈGE DÉCLENCHÉ À L’ALLER` : `${n} PIÈGES DÉCLENCHÉS À L’ALLER`,
    wonAria: (carrots, name) => `Pillage réussi - ${carrots} carottes volées à ${name}`,
    rabbitAria: 'Ton lapin, qui fête ça',
    stolen: (n, name) => `+${n} 🥕 volées à ${name}`,
    fellShort: (pct, name) => `Arrêté à ${pct}% du champ de ${name}`,
    defended: 'DÉFENDU',
    raided: 'PILLÉ',
    byWho: (who, n) => `PAR ${who} · -${n} CAROTTES`,
    byWhoNothing: (who) => `PAR ${who}`,
    bounced: (n) => `${n} PILLAGE${n < 2 ? '' : 'S'} REPOUSSÉ${n < 2 ? '' : 'S'}`,
    struck: 'Foudroyé',
    struckBy: (name) => `${name} a appelé la foudre sur toi`,
  },

  /* ── Ton terrier attaqué, vu de chez toi ─────────────────────────────── */
  defend: {
    underAttack: (name) => `${name.toUpperCase()} PILLE TON TERRIER`,
    theirSteps: 'ses pas',
    hint: 'Enterre une bombe devant lui, ou touche le lapin pour le foudroyer.',
    strike: 'Foudroyer',
    held: (n) => (n < 2 ? `${n} en stock` : `${n} en stock`),
    struckDown: 'FOUDROYÉ',
    ranDry: 'À COURT D’ÉNERGIE',
    looted: (n) => `IL A PRIS ${n} 🥕`,
    lost: 'Ton terrier a été pillé',
    held_: 'Terrier tenu',
    incoming: (name) => `${name} pille ton terrier !`,
  },

  raidErrors: {
    fallback: 'Ça n’a pas marché.',
    target_shielded: 'Leur terrier est protégé. Essaie quelqu’un d’autre.',
    cannot_raid_yourself: 'C’est ton propre terrier.',
    raid_in_progress: 'Tu es déjà dans un terrier.',
    cooldown: 'Tu les as pillés trop récemment.',
    not_adjacent: 'Trop loin. Un pas à la fois.',
    raid_over: 'Ce pillage est déjà terminé.',
    none_held: 'Pas d’éclair à appeler. La remise en vend.',
    no_raid: 'Ce pillage est terminé.',
    unknown_player: 'Ils ont disparu.',
  },

  chest: {
    carrots: 'CAROTTES',
    watering: 'ARROSAGE',
    fertiliser: 'ENGRAIS',
    bomb: 'BOMBE',
    shield: 'BOUCLIER',
    lightning: 'FOUDRE',
    genesis: 'RR GENESIS',
    piece: (amount, label) => `UNE PART EST À TOI - PLUS ${amount}x ${label}`,
  },

  profile: {
    tabProfile: 'Profil',
    tabHistory: 'Historique',
    name: 'Nom',
    save: 'Enregistrer',
    saving: 'Enregistrement...',
    taken: (name) => `Jouer sous « ${name} »`,
    waitingWallet: 'Attente du portefeuille...',
    signInWith: 'Se connecter avec ce portefeuille',
    disconnect: 'Déconnecter',
    abandon: 'Abandonner ce terrier',
    abandonConfirm: 'Vraiment abandonner ? C’est irréversible',
    loading: 'Chargement...',
    now: 'à l\u2019instant',
    historyFailed: 'Impossible de charger ton historique.',
    noRuns: 'Aucune sortie terminée pour l\u2019instant.',
    noRaids: 'Personne n\u2019a encore traversé ton terrier.',
    noPurchases: 'Rien de la remise pour l\u2019instant.',
    today: 'Aujourd’hui',
    youHit: (name) => `Tu as touché ${name}`,
    damage: (n) => `${n} dég.`,
    spent: (n) => `-${n} 🥕`,
    usd: (n) => `${n} $`,
  },

  avatars: {
    brown: 'Brun',
    gray: 'Gris',
    orange: 'Orange',
    white: 'Blanc',
    yellow: 'Jaune',
  },

  codex: {
    title: 'LA COURONNE MAUDITE',
    aria: 'Récit de la couronne maudite',
    close: 'Fermer le codex',
    newChapter: 'NOUVEAU CHAPITRE',
    complete: 'COMPLET',
    isNew: 'NOUVEAU',
    sealed: (at, have) => `Scellé jusqu’à ${at} carottes cumulées. Tu en as ${have}.`,
    nextIn: (n) => `Prochain chapitre dans ${n} carottes`,
    lifetimeOnly: 'Carottes cumulées seulement. Rien ici ne peut être pillé.',
    done: 'Le codex est complet. L’île attend toujours.',
    carrotsAt: (n) => `${n} carottes`,
    chapterN: (n) => `Chapitre ${n}`,
    chapters: 'Chapitres',
  },

  quest: {
    claim: 'RÉCLAMER',
    done: 'FINI',
    claimItem: (qty, kind) => `RÉCLAMER ${qty} ${kind.toUpperCase()}`,
    claimCarrots: (n) => `RÉCLAMER ${n} 🥕`,
    aria: (reward, title) => `${reward} pour ${title}`,
    progress: (progress, goal) => `${progress}/${goal}`,
    counter: (index, total) => `QUÊTE ${index} / ${total}`,
  },

  taglines: [
    'CHAQUE PAS PEUT ÊTRE LE DERNIER... OU TA FORTUNE',
    'TRAVERSE L’ÎLE, PRENDS L’OR, OU MEURS EN ESSAYANT',
    'LES BRAVES VONT PLUS LOIN - LES CHANCEUX RENTRENT',
    'PAS À PAS, L’ÎLE PREND OU L’ÎLE DONNE',
    'SEULS LES AUDACIEUX SURVIVENT - SEULS LES SAGES S’ARRÊTENT',
  ],

  islands: {
    Meadow: 'Prairie',
    Thicket: 'Fourré',
    Ashland: 'Terre de cendres',
    Caldera: 'Caldeira',
  },

  items: {
    trap: {
      name: 'Piège',
      blurb: 'Enterre-le dans ton terrier. Il épuise le pillard qui marche dessus.',
    },
    bomb: {
      name: 'Bombe',
      blurb: 'Pose-la sur l’île de quelqu’un en pleine sortie. Il verra que c’était toi.',
    },
    lightning: {
      name: 'Foudre',
      blurb: 'Appelle un éclair sur l’île d’un rival. Il ouvre le sol autour.',
    },
    shield: {
      name: 'Bouclier',
      blurb: 'Les pillages rebondissent sur ton terrier tant qu’il tient.',
    },
    energy: {
      name: 'Énergie',
      blurb: 'Remplis la barre et creuse maintenant, au lieu d’attendre.',
    },
    smoke: {
      name: 'Écran de fumée',
      blurb: 'Cache les chiffres de ton terrier pour un jour. Les pillards traversent à l’aveugle.',
    },
    mirage: {
      name: 'Mirage',
      blurb: 'Fait mentir quelques chiffres chez un rival, en pleine sortie. Il peut le repérer.',
    },
  },

  quests: {
    'break-ground': {
      title: 'Ouvrir le sol',
      ask: (tiles) => `Creuse ${tiles} cases.`,
      line: 'Chaque case creusée dit combien de bombes la touchent. Exactement. Les chiffres sont honnêtes.',
    },
    'come-home': {
      title: 'Rentrer',
      ask: () => 'Termine une sortie.',
      line: 'Ce que tu portais est au terrier. Rien sur l’île ne peut l’atteindre.',
    },
    'bring-it-in': {
      title: 'Tout rentrer',
      ask: () => 'Récolte le potager.',
      line: 'Le potager pousse pendant ton absence. Ce qu’un voleur peut emporter aussi.',
    },
    'bury-something': {
      title: 'Enterrer quelque chose',
      ask: () => 'Pose un piège sur ton sol.',
      line: 'Un piège invisible est le seul mur qui vaille. Un mur, on le contourne.',
    },
    'open-a-chest': {
      title: 'Ouvrir un coffre',
      ask: () => 'Déterre un coffre sur une île.',
      line: 'Un coffre est une promesse. C’est aussi une marche sur un sol que tu n’as pas lu.',
    },
    'knock-on-a-door': {
      title: 'Frapper à une porte',
      ask: () => 'Pille un terrier. N’importe quelle profondeur compte.',
      line: 'La seule chose qu’on puisse prendre à un lapin est ce qu’il a laissé derrière lui.'
        + ' Tu as vu les deux côtés.',
    },
    'look-up': {
      title: 'Lever les yeux',
      ask: () => 'Ouvre le classement de saison.',
      line: 'Quelqu’un porte la couronne. Elle allume une lumière sur chaque carte, et elle ne s’éteint jamais.',
    },
    'read-the-stones': {
      title: 'Lire les pierres',
      ask: (numeral) => `Ouvre le chapitre ${numeral} du codex.`,
      line: 'L’île ne tue pas les malchanceux. Elle tue les pressés,'
        + ' et elle tient le compte exact de la différence.',
    },
    'hold-the-door': {
      title: 'Tenir la porte',
      ask: (traps) => `Aie ${traps} pièges en terre avant que ton bouclier ne tombe.`,
      line: 'Ton bouclier tombe bientôt. Après ça, il ne te reste que le sol. Rends-le coûteux.',
    },
    'the-thicket': {
      title: (island) => `Le ${island}`,
      ask: (carrots) => `Atteins ${carrots} carottes cumulées.`,
      line: 'Un sol plus riche, et plus de choses enterrées.'
        + ' L’île appelle ça un échange équitable et n’attend pas ta réponse.',
    },
  },

  lore: {
    'the-island': {
      title: 'L’île qui donne',
      teaser: 'Pourquoi le sol est généreux.',
      body: [
        'Personne n’a planté la première carotte. On a simplement trouvé l’île, un matin, '
        + 'déjà pleine — des rangées de couronnes orange perçant une cendre encore tiède. '
        + 'Les lapins qui l’ont trouvée ont fait la chose sensée. Ils ont creusé.',

        'Elle n’a jamais cessé de donner. Creuse un trou et le sol offre quelque chose : une '
        + 'carotte, un coffre, une pierre avec un chiffre gravé dessus. Les chiffres sont '
        + 'honnêtes. Ils l’ont toujours été. C’est précisément ce dont les vieux lapins '
        + 'te préviennent — une chose qui ne te ment jamais est une chose qui veut '
        + 'quelque chose, et elle est assez patiente pour attendre que tu demandes quoi.',
      ],
    },
    'the-numbers': {
      title: 'Ce que les chiffres savent',
      teaser: 'Le sol compte ce qu’il a enterré.',
      body: [
        'Une case creusée te dit combien de bombes la touchent. Pas approximativement. '
        + 'Exactement. Aucun lapin n’a jamais trouvé de pierre menteuse, et les lapins ont '
        + 'cherché longtemps, souvent en y laissant une patte.',

        'Le danger n’est donc jamais le hasard. Le danger, c’est toi, qui lis vite parce '
        + 'qu’un autre est à trois cases et tend la patte vers la même carotte. L’île ne '
        + 'tue pas les malchanceux. Elle tue les pressés, et elle tient le compte exact de '
        + 'la différence.',
      ],
    },
    'the-burrow': {
      title: 'La loi du terrier',
      teaser: 'On ne te prend rien pendant que tu creuses.',
      body: [
        'Sur l’île tu ne peux pas perdre. Marche sur une bombe et tu es projeté, sonné, '
        + 'le souffle coupé — mais ton tas n’est pas touché. Chaque carotte que tu as '
        + 'rapportée est encore à la maison.',

        'C’est exactement le problème. La maison, c’est là où tout se trouve, et c’est là '
        + 'où tu n’es pas, puisque tu es ici, à creuser. L’île en a fait une règle et l’a '
        + 'trouvée très drôle : la seule chose qu’on puisse prendre à un lapin est celle '
        + 'qu’il a laissée derrière lui.',
      ],
    },
    'the-crown': {
      title: 'La couronne n’est pas un prix',
      teaser: 'Elle te signale sur chaque carte.',
      body: [
        'Celui qui tient la plus grosse saison trouve un matin la couronne posée sur sa '
        + 'tête. Impossible de l’ôter, de la vendre, de l’enterrer ou de la donner. Des '
        + 'lapins ont essayé les quatre. Il existe un chapitre sur le quatrième, et il est court.',

        'La couronne est généreuse, c’est ainsi qu’elle opère. Elle enrichit le sol sous '
        + 'celui qui la porte et alourdit les coffres. Elle allume aussi sur la carte du '
        + 'monde une lumière que tous les autres lapins voient de partout, et elle ne '
        + 's’éteint jamais. L’île ne récompense pas le premier lapin. Elle l’éclaire, puis '
        + 'elle recule pour voir ce que les autres en feront.',
      ],
    },
    'the-eruption': {
      title: 'Quand une île a assez donné',
      teaser: 'Le sol solde son compte.',
      body: [
        'Creuse assez une île et la montagne se réveille. On ne négocie pas et on ne '
        + 'recouvre pas ce qui a été ouvert — une île est une chose qui n’arrive qu’une '
        + 'fois. Elle donne jusqu’à n’être presque que trous, puis elle descend sous l’eau '
        + 'sans cérémonie et les lapins nagent.',

        'Les vieux lapins n’y voient pas un désastre. Ils y voient une facture réglée. '
        + 'Quelque chose a été retiré du monde, en quantité énorme, par des lapins à qui '
        + 'on avait dit la vérité exacte sur chaque pas et qui ont choisi de continuer. '
        + 'L’île s’arrête, simplement, et une autre remonte quelque part, déjà pleine de '
        + 'carottes, déjà tiède.',
      ],
    },
    'the-sacrifice': {
      title: 'Le sacrifice',
      teaser: 'Ce à quoi servait la couronne.',
      body: [
        'À la fin de chaque saison, l’île réclame son Roi. Pas les carottes — elle n’a '
        + 'jamais voulu les carottes, elle en a davantage. Elle voulait quelqu’un debout '
        + 'tout en haut, là où tous peuvent le voir, et qui aurait pris goût à y être.',

        'Un Roi qui accepte est enterré avec les honneurs, écrit ses derniers mots, et '
        + 'garde dans le monde une tombe qu’aucune remise à zéro n’effacera. Un Roi qui '
        + 'fuit obtient un tirage honnête — l’île ne trichera pas, elle n’a jamais triché — '
        + 'et revient couronné, traqué et sans un seul bouclier, ou ne revient pas du tout.',

        'Chaque fuite refroidit la pièce suivante. L’île apprend. Elle fait cela depuis '
        + 'plus longtemps qu’il n’y a de lapins à qui le faire, et elle n’a jamais eu '
        + 'besoin d’élever la voix : elle continue simplement de donner des carottes aux '
        + 'ambitieux, et elle attend.',
      ],
    },
  },
};
