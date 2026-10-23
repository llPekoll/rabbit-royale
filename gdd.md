# Rabbit Royale: The Family Crown — GDD v1.1

*Updated 23 October 2026 from the code as it ships (v1.0 was rewritten on 1 October; 88 feature commits have landed since). Every number lives in `config/tuning.ts`, but **52 keys are overridable live** from the `tuning` table (`config/overridable.ts`), and where production overrides the file, the table rules: those values are marked **(prod)** below. `docs/codex.html` lists each number with its source line.*

**Competitive minesweeper with rabbits. Dig, grow your burrow, raid the neighbours.**
The #1 of the season wears a crown that makes them everyone's target.

Minesweeper × Clash of Clans. Free-to-play. One client, built in Godot. The server is authoritative on everything that counts: position, energy, carrots, what is under a tile.

---

## Worlds and platforms

**TWO SEALED WORLDS (18 October 2026).** The same game ships twice, and the two never meet: one account, one burrow, one leaderboard per world.

| | web2 | web3 |
|---|---|---|
| Where | rabbit.rip (storefront and /play), Google Play, App Store, CrazyGames, itch.io | sol.rabbit.rip/play (web3.rabbit.rip is an alias), the Solana Seeker APK (dApp Store) |
| Login | Google, or a code by email | Solana wallet, or guest |
| Money | none: everything is paid in carrots | USDC, SOL or SKR on mainnet |
| Only here | | skins, the Crown Race Ticket and its pot, RR Genesis pieces |

The server picks its world from `RR_WORLD`; wallet routes do not exist in web2 (`WEB3_ONLY_ROUTES`).

**ONE ACCOUNT WORLDWIDE (23 October 2026).** Europe, Singapore and the US run their own game servers and Redis, on one central database. Your burrow, rabbit and ranking follow you; the region only decides your ping and your island neighbours. A ping before each island picks the closest server, unless you force one in Settings. Raids cross continents. **One device at a time:** opening the game elsewhere shows "Another device" on the first one; "Play here" takes it back, and an island in progress is banked.

- **Android** ships a shell APK; the game itself arrives as a `.pck` over the air (`rabbit.rip/play/android`). A new APK is only needed when the engine, a plugin or `boot.gd` changes.
- **Voyageur** (itch.io builds): fully offline. The device plays the server: solo islands at your level, a save that never reaches the online economy, no raids, shop, season or snack.
- **7 languages:** en, fr, es, it, zh, pt-BR, vi. Text, pushes, and Mum's voice on the books.
- **Desktop and web controls:** arrows / WASD step (two keys = a diagonal), right-click or X/3 marks a red X, 1 and 2 aim lightning and bloop, Esc cancels.
- **What's new:** every push carries a player changelog entry (`src/changelog/entries.ts`); `new` and `tune` open WHAT'S NEW at the burrow, a lone `fix` is a silent patch (v1.17 → v1.17.1). Also at rabbit.rip/changelog.
- **Discord** is the players' server, linked from WHAT'S NEW, Settings and the site. Failed payments are reported there too.

---

## Core loop

**DIG → STACK → RAID → repeat.**

- **DIG.** Cross from the burrow to an island and read the board. A run ends when the island sinks (every chest found), when the tank is empty, or when you walk home.
- **STACK.** The burrow banks the haul, grows carrots in the garden, refills the tank and gets upgraded.
- **RAID.** Walk someone else's burrow, the minefield they designed, to take part of their garden and stock.

While you play you can only win. The only thing you can lose sits in your burrow while you are away.

---

## The tank (energy)

**ONE TANK (since 21 September 2026).** One bar of **300** pays for everything: the crossing, each dug tile, the bombs, the wrong X, and the raid's toll, steps and traps. What a run does not spend comes home.

| | |
|---|---|
| Dig a fresh tile | −1 (walking dug ground is free) |
| Dig a bomb | **−60 (prod)**, −70 in the file; the dig point is part of it |
| Drown | = a bomb (`DROWN.LOSS` aliases `ENERGY.BOMB_LOSS`), 2 s under water |
| Lightning on you | −50, 2 s held (detached from the bomb on 2 October) |
| Right red X | +3 on levels 1-5, +2 on levels 6-10 |
| Wrong red X | −15 |
| Crossing to an island | −5; minimum to cross **5 (prod)**, 80 in the file |
| Dug carrot / golden carrot | +1 / +3 energy on **levels 7-10** only (big islands) |
| Regen at the burrow | 30 an hour, +1/h per burrow level up to level 10 (39/h). No regen while on an island |
| Refill | **carried in the bag**, poured by hand (see below) |

**REFILLS ARE CARRIED (8 October 2026).** A refill bought or won goes **into the bag** (20 max) and is poured when you want: at the burrow, dry on the island, or mid-run. Each pour tops the tank to 300, and is refused with a full tank outside a run. **5 pours** per 24 h window (opened by the first pour; all five come back together). 700 carrots or $0.99 each, or in packs of 3 and 10 at −20 %. Every new burrow starts with 3.

- **Bombs hurt (2-3 October).** "The levels are only a ramp before the raids; climbing fast is fine — but bombs must hurt more." The file says 70; production settled on 60 the next day ("80 is too dear, 70 too hard").
- **Energy is elastic, never random.** Every amount is fixed and shown. A blind X only pays when the tile is a bomb more than 5 times in 6 (83 % at +3, 88 % at +2). An X now costs a quarter of a bomb, so at a coin-flip it is by far the cheaper way to find out.
- **Nothing is computed on a timer.** Energy is derived when it is read, from a timestamp. There is no cron.
- **A new player is created with a full tank.**
- **LOOKING IS NOT PLAYING.** A player who crosses, takes not one step and walks home gets the crossing back.
- **One door at a time.** No raid while you sit on an island, and no crossing while a raid you have stepped into is open.
- **THE TANK EXPLAINS ITSELF.** A tap on the ring says what the energy buys right now; out of energy, the free route (the wait) is offered first, then a refill.

---

## The island

### The run

- **Levels 1-6 share one coast** (`ISLAND_GROUND = 'island-v1'`, 32×32): the level sets how much of it is land, the private seed what is buried.
- **Levels 7-10 are BIG ISLANDS (10 October 2026).** Each island cuts its own coast from its seed, 650 to 1 450 tiles, on a box of 32 to 76 cells. 35 % of them are a drawn silhouette: atoll, twins, crescent, archipelago, star, horseshoe, snake.
- **First digger takes it.** A revealed tile is revealed for everyone, and the first to dig it gets the carrot, the golden carrot or the chest.
- **What is buried.** Bombs, carrots (3 each), golden carrots (15 each), and chests. Bombs and golden carrots are weighted outward from the spawn.
- **The cascade.** At birth the island opens around the spawn, capped at 3 tiles. In play, a zero opens its whole connected zero region, as a wave.
- **Loot is random, danger is deterministic.** The clue numbers never lie.
- **Readability (13 October).** Decor that hides a number turns to a screen, and the number of the tile under the rabbit sits at its feet.

### The red X

Mark any of the 8 tiles around the rabbit as a bomb, if it says nothing yet. The server answers at once.

- **Right:** energy back (+3 or +2), and a carrot bounty that climbs with the streak (1, 2, then 3 per X). The X is a wall. Every 25 right X in a row adds one burrow bomb to the bag. Energy the full bar cannot take is paid as carrots.
- **Wrong:** −15, the streak is gone, the tile gets its number, and it cascades if it is a zero.

### Bombs, the sea and the shove

- **A dug bomb:** the bomb's loss, a 1.2 s stun, and the rabbit is thrown back onto the tile it came from. The X streak resets.
- **The sea drowns.** A rabbit shoved into the sea pays a bomb and spends 2 s under water, then comes back up on the free dug tile nearest the spawn.
- **The shove** (walk into a rival) only works between rabbits at level 3 or above; below that a rabbit is a wall. A shove onto a bomb costs the bomb without the dig point. A shove never opens a chest.
- Nothing is stolen mid-run, and there is no death.

### How a run ends

| Exit | Trigger | What happens |
|---|---|---|
| **The island sinks** (the win) | The last chest is dug, by anyone | 4 s later, everyone is banked and **every living rabbit gains a level** (+1 to their own level, capped at 10) |
| **Empty tank** | Digging, a bomb, a wrong X, the sea, lightning | The island sinks under the rabbit and it is back at the burrow. Same level. |
| **Walk home** | The player leaves (refused while inked) | Banked at once |
| **Disconnect** | Socket lost | The seat is held 45 s, then the run is banked |

Every exit goes through one idempotent bank. A last chest dug with the last point still counts.

### Chests are the win condition

**THE ISLAND IS A LEVEL.** It is cleared when every chest has been taken. Chests sit on the rim (on big islands: at least 10 steps from the spawn), visible from the start with their rank. The island rumbles at 45 %, 62 % and 78 % of chests taken, then sinks: the sea, not a volcano, because an island emptied of everything is an island that goes under.

| Rank | Odds | Contents |
|---|---|---|
| Bronze | 45 % | 20-90 carrots |
| Silver | 30 % | Water ×1-3 (40), fertiliser ×1-2 (30), **axe ×1-2 (30)** |
| Gold | 19 % | Bombs ×1-2 (40), **axe ×1-2 (25)**, shield (20), lightning (15) |
| Crown | 6 % | Lightning (40), shield (35), bombs ×2-3 (25), plus a 1-in-4 chance of an **RR Genesis piece** (web3 only, while the game wallet has stock) |

### The rabbit's levels

Ten levels and **no island choice**: DIG sends you to an island at your level. Clearing an island is +1 level; a run that ends dry replays the level.

| Lvl | Tier | Seats | Island | Bombs | Chests | X gain | Energy per carrot / golden |
|---|---|---|---|---|---|---|---|
| 1 | Meadow | 1 | ~103 tiles | 10 % | 2 | 3 | 0 / 0 |
| 2 | Meadow | 1 | ~138 | 12 % | 2 | 3 | 0 / 0 |
| 3 | Meadow | 2 | ~174 | 14 % | 3 | 3 | 0 / 0 |
| 4 | Thicket | 2 | ~213 | 15 % | 3 | 3 | 0 / 0 |
| 5 | Thicket | 2 | ~258 | 17 % | 4 | 3 | 0 / 0 |
| 6 | Ashland | 2 | ~307 | 18 % | 5 | 2 | 0 / 0 |
| 7 | Ashland | 4 | big, 650-850 | 16 % | 6 | 2 | 1 / 3 |
| 8 | Caldera | 4 | big, 800-1 000 | 17 % | 7 | 2 | 1 / 3 |
| 9 | Caldera | 4 | big, 950-1 200 | 18 % | 8 | 2 | 1 / 3 |
| 10 | Caldera | 4 | big, 1 100-1 450 | 19 % | 9 | 2 | 1 / 3 |

- **Solo, levels 1-2** (2 October): the island sinks with its run, so levelling up means every chest in one run.
- **Duo, levels 3-6; four from level 7** (10 October). A started shared island lives 24 h with nobody on it.
- **From level 7 it is one pool** (`POOL_FROM`): any 7+ rabbit joins any joinable 7+ island and plays it at that island's level. Below 7, matching is exact.
- **Joining.** No lobby. A joiner lands on the fullest island with a seat, at least 20 safe tiles and 2 chests left; otherwise a new one is dealt.
- **SOLO option** (Settings, 2 October): your own one-seat island at any level, that nobody can watch, and out of PvP entirely (see PvP).

**DIFFICULTY:** progressive while learning, social at the top. The ladder is a ramp to the raids; the shared, competitive game starts at level 7.

### The first trip: the three books

A new account presses PLAY and **Shiro's book** opens on the title screen, read aloud by Mum. Then the player lands **on the tutorial island**, not the burrow: the hand-drawn 28-tile corridor (a "1", one bomb to the side, a clearing, a chest). It always plays offline in Godot, each step replayed to the server 150 ms apart.

- **The chest takes the rabbit from level 1 to 2** and pays the **tutorial reward: 875 carrots and a shield** (the old quest board's total, given at once).
- **Kuro's journal** opens on the sunk island, before the burrow. Its door **SKIP TO LEVEL 3** jumps the ramp.
- **The book of the sea** opens at level 3, when RAID opens (not in Solo).
- **Skips.** NO TUTORIAL, under SKIP in the first book, goes straight to level 3 with the reward; Kuro's book then waits for the first island played, the sea book for the second. Below level 3 the RAID plank reads **SKIP TO RAID** (→ level 6, no reward).
- Closing the app before the chest sends the player back to the tutorial.

---

## The burrow

The player's persistent base: it grows carrots, refills the tank, banks the loot, and it is the board other players raid.

### The shared ground

**ONE GROUND FOR EVERYONE (30 September).** Every burrow stands on the same 19×19 ground (`BURROW_GROUND = 'burrow-g285'`): entrance at the bottom, a 12-tile garden at the top, the house a solid 2×2. Only the decor (trees, rocks) is drawn from the player's id, and the owner can move all of it.

- The shortest crossing from door to garden is **11 steps** for everyone; edits must keep it between 6 and 13.
- **The doorstep** (the first 2 steps, 13 tiles) can never be mined.
- **Steps go eight ways.** Walling the four faces closes nothing.
- Changing `BURROW_GROUND` needs `scripts/reset-burrows.ts` in prod first.

### The screen (13 October: the islets are off)

The islets that rose out of the sea are switched off (`Chrome.islets = false`, code kept). The burrow now reads as a mobile game:

- **The floor bar:** DIG (on the energy dial), **BURY** (the defence), RAID. The active step carries a "!".
- **The top KIT:** BURROW (house, level, a fold-out panel with UPGRADE, water and fertiliser), the carrots with their safe gauge, HARVEST (which says when the garden will be full).
- **SHOP** on the top rail; your own rabbit, top right, opens the profile.
- On the first arrival, **Shiro and Kuro visit** and walk the player through what is on the screen, once.
- **BURY shows the raider's cheapest route and a verdict**, and TEST makes Kuro walk it, locally.

### Arranging the burrow

No mode: tap to pick up a tree, a rock, the house or the whole garden, tap a lit tile to put it down, or press and drag. Each drop saves at once (the 4 s UNDO banner was removed: "it read like a bug"). The board pans and pinch-zooms (×3). The server re-measures every edit: the garden must stay reachable, the crossing between 6 and 13 steps.

- Rearranging is refused while a raid is open on the burrow.
- Planks move with the garden; if they would seal it, they go back to the bag.
- **A covered bomb steps aside** (22 October): the house, a tree or the garden dropped on a bomb pushes it to the nearest free tile (3 rings), clock kept.
- A felled tree's stump moves with it. Snack Time gifts are decor too.

### The house, the garden, the stock

- **Burrow level 1-20.** Upgrading costs `500 × 1.45^(level−1)` carrots (3 800 in total to level 5, ~30 370 to level 10). A level gives **+8 carrots/h of garden** (20/h at level 1) and **+1 energy/h of regen** up to level 10.
- **The garden** fills for **12 hours** and then stops. Harvest adds the lot to stock, season score and lifetime. What is left growing outside is raided at 35 %, what is banked at 8-10 %: the garden is the purse a raid is for.
- **Water** (×1.5 rate for 4 h) and **fertiliser** (+6 h of ceiling for 12 h) are found in silver chests and Snack Time, poured by hand, capped at 24 h banked per kind. **Never for sale.**
- **The stock** is exposed above a **floor of 300**.

### What a new burrow gets

A 300 tank, a **48 h shield**, the 3 free bombs of the day, and in the bag 3 planks, 3 lightning, 3 bloops and 3 refills. Plus a **default defence already standing** (9 October): **5 bombs and 5 planks**, drawn per player, two of the bombs at least 4 steps from the garden. Nobody starts naked.

---

## Defence

### Bombs

The burrow bomb is the only bomb item (the code says `trap`).

- Buried on walkable ground, never on the doorstep, garden or house. **8 placed, 12 held.**
- **3 free per rolling 24 h**, spent before bought stock. Extra: 150 carrots or $0.25.
- **Invisible to the raider**, who reads numbers only where they stood (see The raid).
- A sprung bomb burns **12** of the raider's energy.
- **A sprung bomb rearms on a clock, for free:** 3 h, plus 30 min for each one sprung with it.
- **Or at a tap, for a bomb** (22 October): "Rearms in 2h / Tap to rearm" — one bomb from the bag (free allowance first) rearms it at once. The bomb slot reads 8/8 on the burrow, with the stock below.

### Fences

A plank sits on one edge of the garden and refuses any raider step through it, corner diagonals included. Placed and lifted one by one. **The last opening can never be closed** (a reachability test, not a count). Fences are visible: they channel the raider into the bombs. 3 at the start (plus the 5 standing), 300 carrots or $0.40, 20 in the bag. A raider's **axe** can fell one.

### Smoke

Hides your burrow's numbers from every raider for 24 h: they cross blind. Stacks, caps at 3 days, 2 000 carrots or $1.99.

### Live defence

An online defender watches the intruder step by step and can bury a bomb in front of them, drop a plank, or **strike them with lightning**: the raid ends on the spot and nothing is taken. **No shield comes with the strike** any more. With an empty pocket, BUY AND STRIKE buys and fires in one tap. An offline defender gets a push ("X is raiding your burrow!", then the result). Everything travels over the socket.

---

## PvP

**From rabbit level 3, both ways**, for raids, island weapons and the shove (`RAID_MIN`, `level_locked`). With duos from level 3, island weapons now open at the same level as raids.

### The raid

You enter the defender's burrow and **walk their board** from the door to the garden.

**A RAID BEGINS AT THE FIRST STEP.** Opening a target is looking at it: abandoned before a step, it costs nothing, starts no cooldown and the defender is never told. A raid walked then abandoned starts the cooldown and tells the defender, but writes no log row.

**IT READS LIKE MINESWEEPER (12 October).** A number shows only on a tile **you stood on**. A zero you stand on opens its neighbours, and further zeros keep opening (from the door, bounded to 3 rings, like an island's birth). A bomb tile never opens by cascade and reads blank. Each raider crosses blind: what raider n+1 inherits is the state of the floor, never the knowledge of it.

**What it costs, from the one tank:**

- **Entry** needs 58: the toll (45) plus the longest crossing (13).
- **The toll** is taken at the first step and never refunded.
- **The walk:** 1 per step, 12 per sprung bomb, within a **stake of 69**. At zero the raid ends where you stand.
- **READING THE BURROW PAYS BACK:** reaching the garden refunds the steps (never the bombs).

**THE AXE (12 October).** One per raid, 150 carrots or $0.25, found in silver and gold chests. It fells one tree or plank next to the raider, at no step and no energy. A felled tree is a walkable stump for 48 h; the planks it brings down go back to the owner's bag. It is the answer to the walled burrow: measured, the worst wall now takes one cut.

**What it takes:**

- The **garden** first: 35 % of what is unharvested. Then the **stock above 300**: 8-10 %, rolled.
- Reaching the garden pays the full share; a raid that dies on the way pays 15 % + 25 % × progress.
- At most **1 200** per raid. Stock theft moves the season score from victim to thief; garden theft creates none.
- **An asleep burrow** (owner unseen for 3 days) pays **a tenth**, and only **once per absence**: after that it is off the list until its owner comes back (10 October: the top raider was walking twice through dozens of abandoned accounts).
- **Nothing to take, not listed:** a burrow whose best haul is under 20 is off the list and refused.

### Shields and the burrow guard

- **No free shield after a raid any more (19 October, prod).** The file still says 16 h after a sacked burrow and 12 h after a raid short of the field, but `SHIELD_AFTER_RAID_MS` and `BROKEN_SHIELD_MS` are **0 in production**: the shield is something you pay for.
- **The shield item:** 6 h, 600 carrots or $0.90, refused while another is up. A new account: 48 h.
- **THE BURROW GUARD (23 October).** The per-raider cooldown (1 h) let two raiders take turns on one burrow seconds apart: the first sprang the bomb and cut the plank, the second walked the cleared path to the cap (31 such chains in 11 days, reported on Discord). Rules that belong to the **victim**, whoever the raiders:
  - **30 min of rest** after any raid that took carrots;
  - **at most 3 raids that take carrots per burrow per rolling 24 h**;
  - **one raider at a time**: a crossing someone else opened under 10 min ago holds the door;
  - **THE SHIELD RAISES ITSELF:** once raids have taken **300 carrots in 2 h**, a shield from the owner's bag goes up for 6 h. Players being farmed had bought shields and never raised them.
  - Replayed on the fortnight's real raids (`tools/raid-shield-replay.ts`): the worst victim's worst day falls from 10 696 to 2 224, theft by 29 %, and the top raider still makes ~2 400 a day.
- **SOLO** is out of PvP both ways: off every list, cannot raid or be raided. It is refused for 2 h after your last walked raid ("otherwise you strike and pull up the drawbridge"), and to Crown Race ticket holders.

### The target list (14 October)

Built in three passes: **owed** (whoever took something from me this week and has not been paid back, listed even when bare or asleep), **everyone connected**, then **the 50 richest**. On screen: **three picks** on top (the revenge, the richest, the one digging), then two columns of rows with the toll in the header. Each row has the garden waiting, presence (*away*, *home* — can strike, *digging* — RAID with WATCH under it), and the **door verdict**: open, shield (with the wait, which includes my cooldown and the burrow's rest), bare, asleep. **The same verdict is written beside every name** on the leaderboard and the raid log (13 October).

### Sabotage on the island

Aimed at a rabbit, from the island or while watching. The victim always sees who did it.

- **LIGHTNING** (500 carrots or $0.60). The 3×3 around the tap opens at once, bombs included (never a chest). Every rival in it: **−50** and 2 s held.
- **THE BLOOP** (100 carrots or $0.10). Ink over the rival's screen for 6 s, and **they cannot walk home while it holds**. Refused on empty ground.
- **The shove** (see The island).

### Revenge, offered hot

A STRIKE BACK banner for 6 s after a shove, strike or ink (buys and fires on an empty bag); BUY AND STRIKE on a live raider; TAKE REVENGE on the profile; and the owed raider first in the RAID list. A pleasure purchase, offered hot, with no quota.

---

## Economy

**A dug carrot is worth 3 carrots.** Run, garden and raid are tuned to carry comparable weight over a day.

**One carrot feeds three counters:** the **stock** (spendable, stealable above 300), the **season score** (the leaderboard: runs and harvests add, only theft moves it), and **lifetime** (never resets).

### The Forest Shop (8 October)

The forest stall replaced the row of items. Three tabs: **PACKS** (the four packs and a carousel of skins), **ITEMS**, **SKINS** (money only). In web2 the skins tab and every money rail are gone.

| Item | Carrots | $ | Does |
|---|---|---|---|
| Bomb | 150 | 0.25 | Burrow defence (also 3 free a day) |
| Axe | 150 | 0.25 | Fell one tree or plank in a raid |
| Lightning | 500 | 0.60 | Island strike, or the live-defence strike |
| Shield | 600 | 0.90 | 6 h out of PvP |
| Refill | 700 | 0.99 | Into the bag, poured to 300 |
| Smoke | 2 000 | 1.99 | 24 h of blind burrow, up to 3 days |
| Bloop | 100 | 0.10 | 6 s of ink on a rival |
| Fence | 300 | 0.40 | One garden plank |

| Pack (−20 %) | Contents | Carrots | $ |
|---|---|---|---|
| Shiro's Stash | 2 bombs, 2 fences, 1 shield | 1 200 | 1.76 |
| Kuro's Tantrum | 2 lightning, 3 bloops | 1 040 | 1.20 |
| Refill ×3 | 3 refills | 1 680 | 2.38 |
| Refill ×10 | 10 refills | 5 600 | 7.92 |

- **Everything on the shelf is buyable in carrots OR money**, and everything money buys can be earned. Caps: 20 of an item (bombs 12, smoke 3 days), 10 per purchase; a pack that would overflow is refused whole. Water and fertiliser are never sold. **No exclusive power for money, ever.**
- Packs broke the old "no bulk discount" rule (2 October). Prices are all overridable live.
- **The money rail:** USDC, SOL or SKR on Solana mainnet since 30 September. The price is set in dollars; the server quotes, builds the transaction and reads the chain. It never holds a key that can send.

### Skins (web3, money only)

Solana, Carrot, Flary (Solflare), Pink October at $0.99; Teadom (the moss-green kappa) at $1.99; the newest first. Indie Games on Solana is off sale. **The ticket skin (`kuro-violet`) cannot be bought.** The rabbit wears its look everywhere: skin, else the fur colour chosen on the profile, else brown. A new skin is revealed (a trembling silhouette, a flash, the colours).

### Snack Time (2-8 October)

**One surprise box a day** (the phone's midnight, 6 h apart at least). Days count the days you came: a missed day never resets.

| Box | Common | Rare | Epic | Jackpot |
|---|---|---|---|---|
| Normal | 80 % | 15 % | 4 % | 1 % |
| Every 7th (golden) | — | 65 % | 30 % | 5 % |

Common: 40 × level carrots, 2 water or 1 fertiliser. Rare: a lightning, a shield or a refill. Epic: Magic Hat (lightning + bloop) or Lucky Foot (2 bombs + a plank). Jackpot: a skin you do not own, else 1 500 carrots. Opening the box also **doubles the carrots of your first paying run** before midnight (bonus capped at 75 × level). Days 7, 14, 21 and 28 bring a burrow gift (mushroom, pumpkin, carrot, scarecrow): decor, never sold.

### Season, crown and the Crown Race Ticket

- **Seasons last 30 days.** The standings freeze, the #1 is recorded as champion, every season score goes to 0. Stock and lifetime stay.
- **The Crown:** the #1 scores ×1.15 on runs and loses ×1.5 to raids (within the 1 200 cap). Heavy is the head.
- **CROWN RACE TICKET** (was the Golden Carrot Pass; web3 only). $4.99 in USDC, SOL or SKR. **It does nothing in play**: no chest, no item, no energy. It gives the **ticket skin for good** and a seat in the race: half of all ticket money goes to the top 10 holders of the season (40 / 24 / 16 %, then 2.86 % each), paid in USDC to the wallet. Sales stop an hour before the end. A holder cannot play Solo. Migration 0025 is in prod; a ticket season has to be opened (`scripts/season-pass.ts open`).
- **RR GENESIS PIECES** (20 October). Real Core assets, sent from the game wallet to the winner's when a crown chest rolls one. A guest wins nothing and is told what was there. Listed in the profile's GENESIS tab.

### The next action

**The quest board left the burrow** (15 October): what it taught, the books and the burrow's steps teach, and what it paid is the tutorial reward. A "now do this" line still reads the state: garden almost full, shield about to drop with few bombs, a rich target, an island if the tank allows, the wait.

### Push notifications

The twice-a-day appointment: tank full, garden full, **tank will fill overnight** (from 20:00), **snack ready** (and golden day), away 24 h then 72 h. At most 3 a day, 2 h apart, silent 22:00-09:00 local, never within 15 minutes of leaving. Raid pushes (incoming, looted, held) ignore quiet hours and the cap, 2 min apart. In 7 languages.

---

## Story — The Family Crown

The lore is told in **three books**, read aloud by Mum (ElevenLabs, 7 languages), each opened once and kept on the shelf:

1. **The Queen's book** (Shiro's, to everyone, at the first PLAY).
2. **Kuro's book** ("Do not show it to Kuro"), after the first island.
3. **The book of the sea**, when RAID opens: the tide, and why islands go under.

Shiro is calm, at peace, never mocking; Kuro carries all the agitation. The STORY button left the title screen (20 October); the old five lifetime chapters survive only as data.

**Not built:** the Sacrifice at season's end, the Mausoleum of Kings, lore fragments in chests, Cursed Islands, a daily mood at level 10. A season still ends quietly.

---

## Design pillars

- **Deterministic risk, random reward.** Reading the board is the skill.
- **Being rich means being visible means being hunted** — but **never farmed**: the burrow guard caps what a day of raids can take.
- **The rules and the lore tell the same story:** the crown is cursed, and the island sinks once it has been emptied.
- **Fair defence:** free bombs every day, a free rearm on the clock, a floor nobody can take, a default defence for everyone. Paying only makes it faster.
- **Money buys time and style, never power.** The ticket gives a skin and a seat, nothing in play.
- **No token.** Nothing is minted for the game: the pot is in USDC and the Genesis pieces are a fixed stock.

## Rejected (and why)

- **Mid-run loot loss and cash-out** (gambling leftovers).
- **Spending lowering rank** (it kills the economy).
- **Secured storage** (unkillable kings).
- **Pay-to-repair** (churn) — the paid instant rearm is a shortcut, never the only way back.
- **Board re-covering** (it breaks minesweeper logic).
- **Random energy amounts** (a slot machine).
- **Energy per dig with no way to earn it back.** The red X is what makes the dig cost a different thing.
- **Hearts**; **a higher energy ceiling**; **an X generous enough to sustain a run**; **a "dry" state at zero**; **surrounding a bomb to defuse it**; **a red ring on unread tiles**; **a run that survives its island**; **a timer on a run**.
- **Golden carrots that give energy back** — still out on levels 1-6; the big islands (7+) brought it back as `carrotGain` +1 / `goldenGain` +3.
- **Charging a crossing that was never walked.**
- **Choosing an island or a tier before a run** (the level decides).
- **A volcano to end the island** (the sea took its place).
- **A shield for a raid that took nothing**, and then **any free shield after a raid** (19 October): the shield is paid, the guard does the protecting.
- **A shield for a live strike** (removed; the strike ends the raid and that is all).
- **Telling a defender about a raider who never stepped in.**
- **A bomb planted on a rival's island**, **the mirage**, **a minable doorstep**, **a burrow ground per player**, **fences sold one whole side at a time**.
- **Numbers on every tile next to the raider** (12 October): replaced by numbers only where you stood, like minesweeper.
- **Islets as the burrow's interface** (switched off 13 October for the bar and the KIT; the code is kept).
- **A 4 s UNDO after each move** (it read like a bug).
- **A quest board** (15 October): the books and the burrow's steps teach the verbs.
- **A shared database for both worlds** (18 October): web2 and web3 stay sealed.
- **Separate accounts per region** (23 October): travelling lost your game.

---

## Open questions

1. **How long is a run?** Still three targets side by side (5 min × 2 a day; 5-10 min; 12-25 min on full tanks). Big islands make the top longer still. Fix one target and re-run `tools/sim-dig.sim.ts` and `tools/economy-day.sim.ts`.
2. **The 6 → 7 step.** Duos now start at 3, but level 6 drops the X gain to 2 and level 7 doubles the island and the seats at once. Is it the steepest step on the ladder now?
3. **Burrow levels 11-20** still only add +8 carrots/h for 20 000 to 400 000 carrots. Cap at 10, give them something, or soften the curve.
4. **Fertiliser** poured right after a harvest is still worthless (12 h window for +6 h).
5. **Should a raider's own shield drop when they attack** (Clash of Clans does)? Solo already closes for 2 h after a raid.
6. **The live-defence strike** costs 500, often more than the raid would take, and no longer raises a shield. Keep it a pleasure purchase?
7. **End of an ordinary season** gives the champion nothing but a name.
8. **Every 25 right X → a bomb** is still out of reach on the first levels.
9. **Multi-accounts.** The guard neutralises tag-team raids, but two accounts of one player can still feed each other. Recording a hashed IP and a random install id (30 days, stated in the privacy policy, which today promises we store neither) would let us see it. What happens to a proven multi-account?
10. **The production overrides** (bomb 60, minimum to cross 5, after-raid shields 0) are not in `config/tuning.ts`: align the file, or keep the table as the only truth?
11. **The ticket pot vs the stores** is answered by the worlds (no ticket in web2); is the pot itself legal everywhere the web3 build ships (likely not in France)?

*Answered since v1.0: the pass in prod (0025 applied), the raid gate vs island weapons (both level 3), quest 10 (no more quests), where the refill sells after a dry run (it is carried and poured on the island).*

## To tune with tools, not by feel

- Dig, bomb and X costs → `tools/sim-dig.sim.ts`
- A day's income split and prices → `tools/economy-day.sim.ts`
- The level ladder → `tools/ladder.sim.ts`
- The raid walk, bomb drain and loot → `tools/raid-matrix.sim.ts` on `burrow-g285`
- Shields, rest and daily caps against real raids → `tools/raid-shield-replay.ts` (14 days of prod) and `tools/raid-guard-check.ts` (against a server)
- Burrow ground candidates → `tools/burrow-ground-pick.ts`
- Live PvP with robots → `tools/bots/` (trio, styles), `tools/scenarios/`, `tools/e2e/duo.ts` (two Godot clients, tutorial to level 10)

**52 keys are live** (`config/overridable.ts`): shop and pass prices, garden, regen and tank, upgrade cost, raid loot, shields, cooldowns, the burrow guard, asleep rules, bomb caps, crossing and bomb costs, toll, stake, refills per day. Change a value in the `tuning` table and it acts within 30 s, in every region at once. **Keep `config/tuning.ts` in step**, or say here which one rules.
