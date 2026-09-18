/**
 * ENGLISH — the source of truth.
 *
 * Every other language's file is checked against the TYPE of this one, so a
 * translation that misses a key, or invents one, fails to compile rather than
 * showing a blank label on somebody's phone. The type is derived here (see
 * `dictionaries.ts`); this file is the only one that may add a key.
 *
 * HOW TO READ IT. Sections follow the surfaces of the game, not the source
 * tree: `loop`, `shop`, `raid`, `codex`, `quests`. Anything with a number or a
 * name in it is a FUNCTION taking that value, so a language can put the pieces
 * in its own order and the compiler checks the call.
 *
 * ALL CAPS IS A FONT FACT, NOT A TONE. The kit's bitmap face has no lowercase,
 * so the labels it draws are written in capitals here. That applies to ENGLISH
 * ONLY: every other language falls back to a face with both cases (see
 * i18n/locales.ts), and those files write their labels normally — shouting at
 * a French player is not a translation of an atlas limitation.
 *
 * THE COPY BUDGETS ARE REAL. The cards are fixed-height containers with
 * `overflow: hidden`, the pill's rank line is one line, and the tagline ribbon
 * is a slot in a piece of art. Where the English carries a budget in its
 * comment ("twelve words at most", "two or three words"), translations are
 * held to the same one.
 */
import type { ItemTable, LoreTable } from './types';

export const en = {
  /* ── The unit letters, for i18n/format.ts ─────────────────────────────── */
  units: { s: 's', m: 'm', h: 'h', d: 'd' },

  /* ── The document, and the language picker on the doorstep ────────────── */
  meta: {
    title: 'Rabbit Royale: The Cursed Crown',
    description: 'Competitive minesweeper. Dig, hoard, raid, wear the crown.',
  },
  lang: {
    /** The picker's own label. Never seen — it labels the select for a reader. */
    label: 'Language',
  },

  /* ── Signing in ───────────────────────────────────────────────────────── */
  auth: {
    connect: 'Connect wallet',
    connecting: 'Digging in...',
    guest: 'Play as a guest',
    waiting: 'Waiting...',
    guestNote: 'Guest burrow. Connect a wallet to keep it.',
    guestTag: 'GUEST',
    noWallet: 'No wallet found. Open in the Rabbit Royale app or install a Solana wallet.',
    signInFailed: 'Sign-in failed',
    guestFailed: 'Could not start a guest burrow',
    walletTaken: 'That wallet already has a burrow.',
    walletDigsFor: (name: string) => `That wallet already digs for "${name}".`,
    alreadyLinked: 'This burrow already has a wallet.',
    linkFailed: 'Could not connect that wallet',
  },

  /* ── The frame around everything ──────────────────────────────────────── */
  chrome: {
    loading: 'Loading',
    waking: 'Waking the warren',
    moreBelow: 'Scroll for more',
    reconnecting: 'Reconnecting...',
    back: 'Back',
    close: 'Close',
    shop: 'Shop',
    story: 'Story',
    season: 'SEASON',
    logoAlt: 'Rabbit Royale',
    rotateTitle: 'Turn your phone sideways',
    rotateBody: 'Rabbit Royale plays in landscape.',
  },

  /* ── Sound ────────────────────────────────────────────────────────────── */
  /* ── Installing the game as an app (install-guide.tsx) ────────────────
     Titles are drawn by the bitmap face, so they are capitals. The steps name
     the platform's own buttons exactly as the platform spells them. */
  install: {
    title: {
      ios: 'ADD TO HOME SCREEN',
      macSafari: 'ADD TO DOCK',
      chromiumDesktop: 'INSTALL THE APP',
      androidChromium: 'ADD TO HOME SCREEN',
    },
    line: {
      ios: 'Full screen, no browser bar, one tap from your Home Screen.',
      macSafari: 'Rabbit Royale in its own window, straight from your Dock.',
      chromiumDesktop: 'Rabbit Royale in its own window, one click from your dock.',
      androidChromium: 'Full screen, no browser bar, one tap from your home screen.',
    },
    steps: {
      ios: [
        'Tap the Share button (in Safari it is in the bottom toolbar, in Chrome in the address bar).',
        'Scroll the sheet and tap Add to Home Screen.',
        'Tap Add. Rabbit Royale opens full screen from your Home Screen.',
      ],
      macSafari: [
        'In the menu bar, choose File > Add to Dock (or Share > Add to Dock).',
        'Click Add. Rabbit Royale opens in its own window from your Dock.',
        'Needs Safari 17 or newer.',
      ],
      prompt: ['Press INSTALL below and confirm in the browser popup.'],
      chromiumDesktop: [
        'Click the install icon at the right end of the address bar, or open the browser menu > Cast, save and share > Install page as app.',
        'Confirm with Install.',
        'Already installed? That icon says Open in app instead.',
      ],
      androidChromium: [
        'Open the browser menu (the three dots) and tap Add to Home screen.',
        'Tap Install. Rabbit Royale opens full screen from your home screen.',
      ],
    },
    install: 'INSTALL',
    installing: 'INSTALLING...',
    showMe: 'SHOW ME',
    gotIt: 'GOT IT',
    close: 'Close',
    app: 'App',
  },

  sound: {
    group: 'Sound',
    music: 'Music',
    effects: 'Effects',
    volume: 'Volume',
    on: 'ON',
    off: 'OFF',
    settings: 'Sound settings',
    mute: 'Mute music',
    unmute: 'Unmute music',
    musicOn: 'Music on',
    musicOff: 'Music off',
  },

  /* ── The three-verb floor, and the state lines under each verb ────────── */
  loop: {
    dig: 'DIG',
    defend: 'DEFEND',
    raid: 'RAID',
    broughtHome: 'brought home',
    ariaGroup: 'Dig, home, raid',
    ariaDig: (line: string) => `Dig. ${line}`,
    ariaDefend: (line: string) => `Defend: bury traps. ${line}`,
    ariaRaid: (line: string) => `Raid. ${line}`,
    energyOf: (energy: number, max: number) => `${energy}/${max} energy`,
    runCosts: (n: number) => `run costs ${n}`,
    runIn: (wait: string) => `run in ${wait}`,
    aMoment: 'a moment',
    gardenPlus: (n: string) => `garden +${n}`,
    gardenEmpty: 'garden empty',
    shieldFor: (wait: string) => `shield ${wait}`,
    /* The badge over the burrow, drawn on the canvas. NAMED, because a bare
       "47H" over the house reads as a season clock — the word says what is
       running. Capitals in English only: the kit's atlas has no lowercase. */
    shieldBadge: (wait: string) => `SHIELD ${wait}`.toUpperCase(),
    noShield: 'no shield',
    traps: (n: number) => `${n} trap${n === 1 ? '' : 's'}`,
    leftOutside: (name: string, n: string) => `${name} left ${n} outside`,
    burrowsOpen: (n: number) => `${n} burrow${n === 1 ? '' : 's'} open`,
    bombsInBag: (n: number) => `${n} bomb${n === 1 ? '' : 's'} in the bag`,
    allShielded: 'every burrow is shielded',
  },

  /* ── The NEXT strip ───────────────────────────────────────────────────── */
  next: {
    label: 'NEXT',
    aria: (text: string) => `Next: ${text}`,
    /* Twelve words at most, each of them. They are read at a glance, over a
       board the player is already touching. */
    gardenFull: 'Garden nearly full. Bring it in before a raider does.',
    shieldLifts: (wait: string) => `Shield lifts in ${wait}. Bury traps.`,
    raidTarget: (name: string, garden: string) => `${name} left ${garden} in the garden. Raid.`,
    dig: (energy: number) => `${energy} energy: a run's worth. Dig.`,
    digPlain: 'Dig.',
    runIn: (wait: string) => `A run in ${wait}. The garden grows meanwhile.`,
  },

  /* ── The burrow's cards ───────────────────────────────────────────────── */
  burrow: {
    title: 'YOUR BURROW',
    level: (n: number) => `BURROW - LVL ${n}`,
    maxLevel: 'MAX LEVEL',
    upgrade: 'UPGRADE',
    safe: 'SAFE',
    exposed: (n: string) => `${n} EXPOSED`,
    garden: 'GARDEN',
    harvest: 'HARVEST',
    energy: 'ENERGY',
    gardenGrows: 'THE GARDEN GROWS FASTER',
  },

  /* ── What the burrow says back ────────────────────────────────────────── */
  notes: {
    shieldUp: 'Shield up. Raids bounce off.',
    watered: 'Watered. The garden fills faster.',
    fed: 'Fed. The garden holds more.',
    gardenEmpty: 'The garden is empty. Come back later.',
    maxDepth: 'Your burrow is as deep as it goes.',
    shieldAlready: 'A shield is already up.',
    noneLeft: 'None left. Chests drop them.',
    toppedUp: 'Already topped up. Save it for later.',
    islandSilent: 'The island did not answer. Try again in a moment.',
    runResumed: 'Back to your run.',
    reconnecting: 'Reconnecting... try again in a moment.',
    harvested: (n: number) => `+${n} 🥕`,
    needMore: (n: number) => `Need ${n} more 🥕`,
    questDone: (title: string) => `Quest done: ${title}`,
  },

  /* ── A run, on the island ─────────────────────────────────────────────── */
  run: {
    goFarm: 'Clear all mines',
    findMe: 'Find my rabbit',
    retreat: 'Retreat',
    home: 'Home',
    stopWatching: 'Stop watching',
    theirRun: 'their run',
    /**
     * How much of the island is dug — the strip's one number about the GROUND
     * rather than about the rabbit standing on it.
     *
     * Kept to "82% dug" rather than a sentence: it sits in a strip measured in
     * pixels on a phone, beside a gauge and two item buttons, and the word
     * that explains it belongs in the tooltip. See `run-hud.tsx`.
     */
    chests: (taken: number, total: number) => `${taken}/${total} chests`,
    chestsTitle: 'Chests taken on this island — by everyone on it. Take them all and it sinks.',
    watching: (label: string) => `👁 watching ${label}`,
    hearts: (full: number, total: number) => `${full} of ${total} hearts`,
    heartsShort: (full: number, total: number) => `${full} / ${total} hearts`,
    /** The run's energy bar, read aloud. */
    energy: (n: number, max: number) => `${n} of ${max} energy`,
    /** The red X — see FLAG in tuning. */
    markBomb: 'Mark a bomb',
    markHint: 'Tap a tile you think hides a bomb · right: +energy · wrong: -energy',
    markCancel: 'Cancel',
    markNothing: 'Nothing to mark here: every tile around you is already read.',
    energyLow: 'Low energy. A right X on a bomb gives some back.',
    trapHint: (left: number) => `Tap a tile to mine it, tap a mine to lift it · ${left} left`,
    trapHintEmpty: 'No bombs left · buy another, or tap a mine to lift it and bury it elsewhere',
    strike: 'Strike',
    aiming: 'Tap a rival to strike',
    strikeNone: 'No lightning to call. The shed sells it.',
    plant: 'Plant a bomb',
    aimingPlant: 'Tap undug ground to bury a bomb',
    plantNone: 'No bombs to plant. The shed sells them.',
    planted: 'Bomb buried. Only you know where.',
    plantRefused: {
      'off-island': 'Not on the island.',
      revealed: 'That ground is already dug.',
      hinted: 'The board already says that tile is safe.',
      chest: 'Not under a chest.',
      'too-many': 'Three bombs live is the most you may have here.',
    } as Record<string, string>,
    plantedBy: (name: string) => `${name}'s bomb!`,
    struckBy: (name: string) => `${name} struck you with lightning`,
  },

  /* ── What the island says during the very first run ───────────────────── */
  firstRun: {
    tap: 'Tap a tile beside you to dig it.',
    numbers: 'The number counts the bombs touching that tile.',
    mark: 'Sure where a bomb is? Press the red X and mark it: energy back.',
    marked: 'Right! A good X gives energy back. That is how you dig further.',
    bomb: 'That cost energy. The 1 was pointing at it.',
    golden: 'Gold! One golden carrot is worth five.',
    chest: 'A chest. Whatever it holds goes home with you.',
    clock: 'The island is the clock. Dig it out and it sinks.',
    recap: 'Your carrots are home now. Go and see.',
  },

  /* ── The end of a run ─────────────────────────────────────────────────── */
  recap: {
    cleared: 'ISLAND CLEARED!',
    over: 'RUN OVER',
    clearedNote: 'Every tile worth digging is dug. The volcano took the rest.',
    overNote: 'Out of energy.',
    /** The first island's chest, which is what ends the tutorial run. */
    tutorialDone: 'YOU GOT IT!',
    tutorialDoneNote: 'The chest was the whole island. Your carrots are waiting at the burrow.',
    stats: (carrots: number, dug: number, bombs: number, time: string) =>
      `🥕 ${carrots} · ${dug} dug · 💣 ${bombs} · ${time}`,
    bank: (energy: number, max: number, cost: number) =>
      `⚡ ${energy}/${max} at the burrow · a run takes ${cost}`,
    getEnergy: 'Get more energy',
    goHome: 'Home · stack it',
  },

  /* ── The carrot pill ──────────────────────────────────────────────────── */
  pill: {
    banked: (n: number) => `${n} carrots banked`,
    carryNote: 'Carried this run: banked when you walk home',
    carrying: (n: number) => `${n} carrots carried, not banked yet`,
    leading: 'leading',
    rankFirst: 'Season rank #1: leading the board',
    rank: (rank: number, gap: string) =>
      `Season rank #${rank}: ${gap} season points to pass #${rank - 1}`,
    toPass: (gap: string, rank: number) => `${gap} to #${rank - 1}`,
    showClimb: (n: number, rank: number) => `${n} carrots banked, season rank ${rank}. Show what it takes to climb`,
    hideClimb: (n: number, rank: number) => `${n} carrots banked, season rank ${rank}. Hide what it takes to climb`,
  },

  /* ── The season board ─────────────────────────────────────────────────── */
  board: {
    show: 'Show the season board',
    hide: 'Hide the season board',
    diggingNow: 'digging now · tap to watch',
    watch: (name: string) => `Watch ${name} dig`,
    notOut: (name: string) => `${name} is not out right now`,
  },

  /* ── The shop and the shed ────────────────────────────────────────────── */
  shop: {
    title: 'SHOP',
    shed: 'THE SHED',
    aria: 'Shop',
    protect: 'PROTECT BASE',
    protectAria: 'Protect your base',
    protectBuyAria: 'Protect your base - buy a trap',
    noTraps: 'NO TRAPS - GET ONE',
    nothingBuried: 'NOTHING BURIED',
    inShed: (n: number) => `${n} IN THE SHED`,
    rearming: (n: number) => `REARMING - ${n} COMING BACK`,
    upAndRearming: (armed: number, rearming: number) => `${armed} UP - ${rearming} REARMING`,
    inGround: (armed: number, max: number) => `${armed}/${max} IN THE GROUND`,
    openShed: 'Open the shed',
    payWith: 'Pay with',
    outOfEnergy: 'OUT OF ENERGY',
    /* Plain ASCII punctuation only: the pixel face has no em dash and draws
       one as a blank box. See test/pixel-font-glyphs. */
    energySay: (cost: number, wait: string) =>
      `A run takes ${cost}. Enough comes back on its own in ${wait}.`
      + ' Or fill it now and keep digging.',
    energySayEmpty: (wait: string) =>
      `The bar is empty. One point comes back on its own in ${wait}.`
      + ' Or fill it now and keep digging.',
    fillsTo: (max: number) => `Fills the bar to ${max}.`,
    noRefills: ' No refills left today.',
    refillsLeft: (n: number) => ` ${n} refill${n > 1 ? 's' : ''} left today.`,
    cardsOff: 'Card payments are not switched on yet. Carrots only for now.',
    connectForCard: 'Connect a wallet to pay by card. Everything here is diggable anyway.',
    eitherWay: 'Carrots you dig, or card. Same goods either way.',
    pricing: 'Pricing...',
    approve: 'Approve it in your wallet...',
    confirming: 'Confirming on chain...',
    priceLabel: (price: string) => `${price} carrots`,
    buy: (name: string, price: string) => `Buy ${name} for ${price}`,
    capped: (name: string, price: string) =>
      `${name}: ${price}. You are holding as many as you can.`,
    tooPoor: (name: string, price: string) =>
      `${name}: ${price}. Not enough carrots yet. Dig for more.`,
    /* The count line under an item: "3/20", "2 today", "1d left", "off". */
    heldOf: (held: number, cap: number) => `${held}/${cap}`,
    heldToday: (n: number) => `${n} today`,
    heldDaysLeft: (n: number) => `${n}d left`,
    heldOff: 'off',
    /* What a purchase says back. The count leads only when there is more than
       one of them — "trap in the shed" and "3 traps in the shed". */
    boughtEnergy: (paid: string) => `Energy refilled. ${paid}`,
    boughtTrap: (n: number, paid: string) => `${n > 1 ? `${n} traps` : 'trap'} in the shed. ${paid}`,
    boughtBomb: (n: number, paid: string) => `${n > 1 ? `${n} bombs` : 'bomb'} armed. ${paid}`,
    boughtLightning: (n: number, paid: string) =>
      `${n > 1 ? `${n} lightning bolts` : 'lightning bolt'} bottled. ${paid}`,
    boughtShield: (n: number, paid: string) => `${n > 1 ? `${n} shields` : 'shield'} ready. ${paid}`,
    boughtSmoke: (paid: string) => `The numbers are hidden. ${paid}`,
    boughtMirage: (n: number, paid: string) =>
      `${n > 1 ? `${n} mirages` : 'mirage'} ready to throw. ${paid}`,
    /* Plain ASCII '-', not a minus sign: the pixel face cannot draw U+2212 and
       it renders as a blank box on the device. See test/pixel-font-glyphs. */
    paid: (spent: number) => `-${spent} 🥕`,
  },

  /* ── Refusals, keyed by the code the server sends ─────────────────────── */
  shopErrors: {
    fallback: 'That did not work.',
    insufficient_carrots: 'Not enough carrots.',
    inventory_full: 'Your bag is full of those.',
    daily_energy_limit: 'No more refills today. The garden still grows.',
    smoke_capped: 'Your burrow is hidden as long as it can be.',
    too_many_at_once: 'Too many at once.',
    bad_quantity: 'That is not a quantity.',
    no_traps: 'No traps left. Buy one, or wait for tomorrow.',
    board_full: 'Your burrow cannot hold another trap.',
    tile_not_trappable: 'Nothing to mine there.',
    tile_doorstep: 'Too near the door. The first steps inside stay open.',
    tile_already_trapped: 'Already mined.',
    no_trap_there: 'No trap there.',
    payments_unavailable: 'Card payments are not set up yet.',
    quote_expired: 'That quote expired. Try again.',
    signature_already_used: 'That payment was already used.',
    not_confirmed_yet: 'Still confirming on chain...',
    wrong_reference: 'That transaction does not match this purchase.',
    no_matching_transfer: 'No matching USDC transfer found.',
    failed_on_chain: 'The transaction failed on chain.',
  },

  /* ── Paying with USDC ─────────────────────────────────────────────────── */
  pay: {
    needsBuild: 'Paying in the app needs the next build. Buy with carrots for now.',
    noWallet: 'No Solana wallet found. Install Phantom to pay with USDC.',
    notConfigured: 'Payments are not configured on this server.',
    stillConfirming: 'Paid, but still confirming. Reopen the shop in a minute. Nothing is lost.',
    failed: 'Payment failed',
  },

  /* ── What you are carrying ────────────────────────────────────────────── */
  kit: {
    aria: 'What you are carrying',
    shieldHolding: (wait: string, held: number) =>
      `Shield: holding, ${wait} left. ${held} in the bag.`,
    shieldReady: (held: number) =>
      `Shield: ${held} in the bag. Raise one. Raids bounce off while it holds.`,
    shieldNone: 'Shield: none. Buy one in the shop.',
    smokeOff: 'Smoke screen: off. Buy one in the shop to hide your numbers.',
    smokeUp: (days: number) =>
      `Smoke screen: up, ${days} day${days === 1 ? '' : 's'} left. Raiders cross your burrow blind.`,
    /* Any carried item, in the row: its name, the count, and what it does. */
    carried: (name: string, held: number, blurb: string) => `${name}: ${held} in the bag. ${blurb}`,
    carriedNone: (name: string, blurb: string) => `${name}: none. ${blurb}`,
    trapsLine: (placed: number, max: number | null, held: number) =>
      `Traps: ${placed}${max ? ` of ${max}` : ''} in the ground, ${held} in the shed.`
      + ' Bury them from BASE.',
    /* The same slot while PLACING, when it is a button rather than a readout.
       It names the PRICE, because that is the whole decision being made — and
       it says "buy" rather than "more", so a player reads what pressing it
       spends before they press it. */
    trapsBuy: (held: number, price: string) =>
      (held > 0
        ? `Traps: ${held} in the shed. Buy another for ${price} carrots.`
        // "another" is a lie at zero, and this is the state the press exists
        // for — so it gets the sentence that names the empty shed outright.
        : `Traps: none in the shed. Buy one for ${price} carrots.`),
    trapsBuyBroke: (price: string) =>
      `Traps: none left. One costs ${price} carrots - dig for more.`,
    trapsBuyFull: (held: number) => `Traps: ${held} in the shed. The shed is full.`,
    bottleRunning: (name: string, wait: string, count: number) =>
      `${name}: running, ${wait} left. ${count} in the bag.`,
    bottleHeld: (name: string, count: number) => `${name}: ${count} in the bag. Pour one on the garden.`,
    bottleNone: (name: string) => `${name}: none. Found in chests.`,
    watering: 'Watering',
    fertiliser: 'Fertiliser',
  },

  /* ── Raiding ──────────────────────────────────────────────────────────── */
  raid: {
    go: 'GO RAIDING',
    another: 'Raid another burrow',
    choose: 'Choose a burrow',
    whose: 'WHOSE BURROW?',
    allShielded: 'ALL BURROWS SHIELDED',
    nobody: 'NOBODY TO ROB',
    shielded: 'Shielded',
    /**
     * WHERE THE OWNER IS, one word per row — never a blank.
     *
     * Each says the CONSEQUENCE, not the status: "online" is a fact about an
     * account, while these are facts about the burrow you are about to walk
     * into. `away` is nobody to stop you; `home` is the owner at the keyboard,
     * who is told you came and can end the crossing with lightning; `digging`
     * is a burrow standing empty while its owner is out on an island — they
     * are still told, and can break off their own run to come back.
     */
    presence: {
      away: 'away',
      home: 'home',
      digging: 'out digging',
    },
    raidIt: 'Raid',
    brief: 'Reach the carrot field. Their traps are buried and unmarked.',
    outOfEnergy: 'Out of energy',
    nothingTaken: 'Nothing taken',
    unguarded: (amount: string) => `${amount} UNGUARDED`,
    nobodyYet: 'Nobody else has a burrow yet.',
    steps: 'steps',
    looted: (n: string) => `+${n} 🥕`,
    won: 'RAID WON!',
    backToBurrow: 'BACK TO THE BURROW',
    aRival: 'A RIVAL',
    lootedFrom: (name: string) => `LOOTED FROM ${name}`,
    wasEmpty: (name: string) => `${name}'S BURROW WAS EMPTY`,
    trapsSprung: (n: number) =>
      n === 1 ? '1 TRAP SPRUNG ON THE WAY IN' : `${n} TRAPS SPRUNG ON THE WAY IN`,
    wonAria: (carrots: number, name: string) => `Raid won - ${carrots} carrots looted from ${name}`,
    rabbitAria: 'Your rabbit, celebrating',
    stolen: (n: string, name: string) => `+${n} 🥕 stolen from ${name}`,
    fellShort: (pct: number, name: string) => `Fell ${pct}% of the way to ${name}'s field`,
    defended: 'DEFENDED',
    raided: 'RAIDED',
    byWho: (who: string, n: number) => `BY ${who} · -${n} CARROTS`,
    byWhoNothing: (who: string) => `BY ${who}`,
    bounced: (n: number) => `${n} RAID${n === 1 ? '' : 'S'} BOUNCED OFF`,
    struck: 'Struck by lightning',
    struckBy: (name: string) => `${name} called lightning down on you`,
  },

  /* ── Your burrow under attack, watched from home ──────────────────────── */
  defend: {
    underAttack: (name: string) => `${name.toUpperCase()} IS RAIDING YOU`,
    theirSteps: 'their steps',
    hint: 'Bury a bomb ahead of them, or tap the rabbit to strike it.',
    strike: 'Strike',
    held: (n: number) => (n === 1 ? '1 held' : `${n} held`),
    struckDown: 'STRUCK DOWN',
    ranDry: 'THEY RAN OUT OF ENERGY',
    looted: (n: string) => `THEY TOOK ${n} 🥕`,
    lost: 'Your burrow was sacked',
    held_: 'Burrow held',
    incoming: (name: string) => `${name} is raiding your burrow!`,
  },

  raidErrors: {
    fallback: 'That did not work.',
    target_shielded: 'Their burrow is shielded. Try someone else.',
    cannot_raid_yourself: 'That is your own burrow.',
    raid_in_progress: 'You are already inside a burrow.',
    cooldown: 'You raided them too recently.',
    not_adjacent: 'Too far. One step at a time.',
    raid_over: 'That raid is already over.',
    none_held: 'No lightning to call. The shed sells it.',
    no_raid: 'That raid is over.',
    unknown_player: 'They are gone.',
  },

  /* ── The chest ────────────────────────────────────────────────────────── */
  chest: {
    carrots: 'CARROTS',
    watering: 'WATERING',
    fertiliser: 'FERTILISER',
    bomb: 'BOMB',
    shield: 'SHIELD',
    lightning: 'LIGHTNING',
    genesis: 'RR GENESIS',
    piece: (amount: number, label: string) => `A PIECE IS YOURS - PLUS ${amount}x ${label}`,
  },

  /* ── The profile ──────────────────────────────────────────────────────── */
  profile: {
    tabProfile: 'Profile',
    tabHistory: 'History',
    name: 'Name',
    save: 'Save name',
    saving: 'Saving...',
    taken: (name: string) => `Play as "${name}"`,
    waitingWallet: 'Waiting for wallet...',
    signInWith: 'Sign in with that wallet',
    disconnect: 'Disconnect',
    abandon: 'Abandon this burrow',
    abandonConfirm: 'Really abandon? This cannot be undone',
    loading: 'Loading...',
    now: 'now',
    historyFailed: 'Could not load your history.',
    noRuns: 'No finished runs yet.',
    noRaids: 'Nobody has crossed your burrow yet.',
    noPurchases: 'Nothing from the shed yet.',
    today: 'Today',
    youHit: (name: string) => `You hit ${name}`,
    damage: (n: number) => `${n} dmg`,
    spent: (n: string) => `-${n} 🥕`,
    usd: (n: string) => `$${n}`,
  },

  /* ── The avatars, by colour ───────────────────────────────────────────── */
  avatars: {
    brown: 'Brown',
    gray: 'Gray',
    orange: 'Orange',
    white: 'White',
    yellow: 'Yellow',
  },

  /* ── The codex ────────────────────────────────────────────────────────── */
  codex: {
    title: 'THE CURSED CROWN',
    aria: 'The Cursed Crown lore',
    close: 'Close the codex',
    newChapter: 'NEW CHAPTER',
    complete: 'COMPLETE',
    isNew: 'NEW',
    sealed: (at: string, have: string) =>
      `Sealed until ${at} lifetime carrots. You have ${have}.`,
    nextIn: (n: string) => `Next chapter in ${n} carrots`,
    lifetimeOnly: 'Lifetime carrots only. Nothing here can be raided away.',
    done: 'The codex is complete. The island is still waiting.',
    carrotsAt: (n: string) => `${n} carrots`,
    /** A chapter still sealed: it has a number but no name yet. */
    chapterN: (n: number) => `Chapter ${n}`,
    chapters: 'Chapters',
  },

  /* ── The quest card ───────────────────────────────────────────────────── */
  quest: {
    claim: 'CLAIM',
    done: 'DONE',
    claimItem: (qty: number, kind: string) => `CLAIM ${qty} ${kind.toUpperCase()}${qty > 1 ? 'S' : ''}`,
    claimCarrots: (n: number) => `CLAIM ${n} 🥕`,
    aria: (reward: string, title: string) => `${reward} for ${title}`,
    progress: (progress: number, goal: number) => `${progress}/${goal}`,
    counter: (index: number, total: number) => `QUEST ${index} / ${total}`,
  },

  /* ── The five phrases in the wordmark's ribbon ────────────────────────── */
  taglines: [
    'EVERY STEP COULD BE YOUR LAST... OR YOUR FORTUNE',
    'CROSS THE ISLAND, CLAIM THE GOLD, OR DIE TRYING',
    'THE BRAVE HOP FURTHER - THE LUCKY HOP HOME',
    'STEP BY STEP, THE ISLAND TAKES OR THE ISLAND GIVES',
    'ONLY THE BOLD SURVIVE - ONLY THE WISE CASH OUT',
  ] as readonly string[],

  /* ── The islands on the ladder ────────────────────────────────────────── */
  islands: {
    Meadow: 'Meadow',
    Thicket: 'Thicket',
    Ashland: 'Ashland',
    Caldera: 'Caldera',
  } as Record<string, string>,

  /* ── The items on the shelf ───────────────────────────────────────────── */
  items: {
    trap: {
      name: 'Trap',
      blurb: 'Bury one in your burrow. It drains the raider who steps on it.',
    },
    bomb: {
      name: 'Bomb',
      blurb: "Plant one on someone's island mid-run. They see it was you.",
    },
    lightning: {
      name: 'Lightning',
      blurb: 'Calls a strike on a rival’s island. It opens the ground around it.',
    },
    shield: {
      name: 'Shield',
      blurb: 'Raids bounce off your burrow while it holds.',
    },
    energy: {
      name: 'Energy',
      blurb: 'Fill the bar and dig now, instead of waiting it out.',
    },
    smoke: {
      name: 'Smoke screen',
      blurb: 'Hides your burrow’s numbers for a day. Raiders cross it blind.',
    },
    mirage: {
      name: 'Mirage',
      blurb: 'Makes a few of a rival’s numbers lie, mid-run. They can spot it.',
    },
  } satisfies ItemTable,

  /* ── The quest arc. Numbers come from tuning; these are the words ─────── */
  quests: {
    'break-ground': {
      title: 'Break ground',
      ask: (tiles: number) => `Dig ${tiles} tiles.`,
      line: 'Every dug tile tells you how many bombs touch it. Exactly. The numbers are honest.',
    },
    'come-home': {
      title: 'Come home',
      ask: () => 'Finish a run.',
      line: 'What you carried is in the burrow now. Nothing on the island can reach it.',
    },
    'bring-it-in': {
      title: 'Bring it in',
      ask: () => 'Harvest the garden.',
      line: 'The garden grows while you are away. So does what a thief can carry off it.',
    },
    'bury-something': {
      title: 'Bury something',
      ask: () => 'Place a trap on your floor.',
      line: 'A trap nobody can see is the only wall worth building. A wall gets walked around.',
    },
    'open-a-chest': {
      title: 'Open a chest',
      ask: () => 'Dig up a chest on an island.',
      line: 'A chest is a promise. It is also a walk across ground you have not read yet.',
    },
    'knock-on-a-door': {
      title: 'Knock on a door',
      ask: () => 'Raid a burrow. Any depth counts.',
      line: 'The only thing that can be taken from a rabbit is what it left behind.'
        + ' Now you have been on both sides of that.',
    },
    'look-up': {
      title: 'Look up',
      ask: () => 'Open the season board.',
      line: 'Someone wears the crown. It puts a light on every map, and it never goes out.',
    },
    'read-the-stones': {
      title: 'Read the stones',
      ask: (numeral: string) => `Open chapter ${numeral} of the codex.`,
      line: 'The island does not kill the unlucky. It kills the hurried,'
        + ' and it keeps a careful record of the difference.',
    },
    'hold-the-door': {
      title: 'Hold the door',
      ask: (traps: number) => `Have ${traps} traps in the ground before your shield lifts.`,
      line: 'Your shield lifts soon. After that, the floor is all you have. Make it expensive.',
    },
    'the-thicket': {
      title: (island: string) => `The ${island}`,
      ask: (carrots: string) => `Reach ${carrots} lifetime carrots.`,
      line: 'Richer ground, and more of it buried.'
        + ' The island calls that a fair trade and does not wait for your answer.',
    },
  },

  /* ── The codex's six chapters ─────────────────────────────────────────── */
  lore: {
    'the-island': {
      title: 'The Island That Gives',
      teaser: 'Why the ground is generous.',
      body: [
        'Nobody planted the first carrot. The island was simply found, one morning, '
        + 'already full of them -- rows of orange crowns pushing up through ash that was '
        + 'still warm. The rabbits who found it did the sensible thing. They dug.',

        'It has never stopped giving. Dig a hole and the ground offers something: a '
        + 'carrot, a chest, a stone with a number scratched on it. The numbers are '
        + 'honest. They have always been honest. That is the part the old rabbits '
        + 'warn you about -- a thing that never lies to you is a thing that wants '
        + 'something, and it is patient enough to wait until you ask what.',
      ],
    },
    'the-numbers': {
      title: 'What the Numbers Know',
      teaser: 'The ground counts what it buried.',
      body: [
        'A dug tile tells you how many bombs touch it. Not roughly. Exactly. No '
        + 'rabbit has ever found a stone that lied, and rabbits have looked hard, '
        + 'usually while missing a paw.',

        'So the danger is never the dice. The danger is you, reading fast because '
        + 'someone else is three tiles away and reaching for the same carrot. The '
        + 'island does not kill the unlucky. It kills the hurried, and it keeps a '
        + 'careful record of the difference.',
      ],
    },
    'the-burrow': {
      title: 'The Law of the Burrow',
      teaser: 'Nothing is taken from you while you dig.',
      body: [
        'Out on the island you cannot lose. Step on a bomb and you are thrown, '
        + 'stunned, emptied of breath -- but your pile is not touched. Every carrot '
        + 'you have ever carried home is still at home.',

        'That is exactly the problem. Home is where it all is, and home is where '
        + 'you are not, because you are here, digging. The island made a rule out of '
        + 'this and thought it very funny: the only thing that can be taken from a '
        + 'rabbit is the thing it left behind.',
      ],
    },
    'the-crown': {
      title: 'The Crown Is Not a Prize',
      teaser: 'It marks you on every map.',
      body: [
        'Whoever holds the largest season finds the crown waiting on their head one '
        + 'morning. It cannot be removed, sold, buried, or given away. Rabbits have '
        + 'tried all four. There is a chapter about the fourth one, and it is short.',

        'The crown is generous, which is how it works. It makes the ground richer '
        + 'under its wearer and the chests heavier. It also puts a light on the world '
        + 'map that every other rabbit can see from anywhere, and it never goes out. '
        + 'The island does not reward the first rabbit. It illuminates them, and then '
        + 'it stands back to watch what the others do about it.',
      ],
    },
    'the-eruption': {
      title: 'When an Island Has Given Enough',
      teaser: 'The ground closes its account.',
      body: [
        'Dig enough of an island and the mountain wakes. There is no negotiating '
        + 'with this and no re-covering what was opened -- an island is a thing that '
        + 'happens once. It gives until it is mostly holes, then it goes down into '
        + 'the water without much ceremony and the rabbits swim.',

        'The old rabbits do not treat this as a disaster. They treat it as a bill '
        + 'being settled. Something has been taken out of the world, in enormous '
        + 'quantity, by rabbits who were told the exact truth about every step and '
        + 'chose to keep going. The island simply stops, and another one surfaces '
        + 'somewhere, already full of carrots, already warm.',
      ],
    },
    'the-sacrifice': {
      title: 'The Sacrifice',
      teaser: 'What the crown was for.',
      body: [
        'At the end of every season the island asks for its King. Not for the '
        + 'carrots -- it never wanted the carrots, it has more. It wanted somebody to '
        + 'stand at the top where everyone could see, and to have grown fond of '
        + 'standing there.',

        'A King who accepts is buried with honour, writes their own last words, and '
        + 'keeps a tomb in the world that no reset will ever clear. A King who runs '
        + 'gets one honest coin flip -- the island will not cheat, it has never '
        + 'cheated -- and comes back crowned, hunted and without a single shield, or '
        + 'does not come back at all.',

        'Every escape makes the next coin colder. The island learns. It has been '
        + 'doing this longer than there have been rabbits to do it to, and it has '
        + 'never once needed to raise its voice: it simply keeps giving carrots to '
        + 'the ambitious, and waits.',
      ],
    },
  } satisfies LoreTable,
};
