# Rabbit Royale: The Cursed Crown — GDD v1.0

*Rewritten 1 October 2026 from the code as it ships. v0.9 described the game of early September; much has moved since. Every number below lives in `config/tuning.ts`; `docs/codex.html` lists each one with its source line, and its "Incohérence" notes track where code, comments and docs still disagree.*

**Competitive minesweeper with rabbits. Dig, grow your burrow, raid the neighbours.**
The #1 of the season wears a crown that makes them everyone's target.

Minesweeper × Clash of Clans, on Solana Mobile. Free-to-play. One client, built in Godot: on the web at rabbit.rip/play, as an Android APK (Solana Seeker), and on iOS in debug. The server is authoritative on everything that counts: position, energy, carrots, what is under a tile.

---

## Core loop

**DIG → STACK → RAID → repeat.**

- **DIG.** Cross from the burrow to an island and read the board. A run ends when the island sinks (every chest found) or the tank is empty, or when you walk home.
- **STACK.** The burrow banks the haul, grows carrots in the garden, refills the tank and gets upgraded.
- **RAID.** Walk someone else's burrow, the minefield they designed, to take part of their garden and stock.

While you play you can only win. The only thing you can lose sits in your burrow while you are away.

A session is one crossing: the burrow, an island, the way home with the loot and whatever energy is left.

---

## The tank (energy)

**ONE TANK (since 21 September 2026).** One bar of **300** pays for everything: the crossing, each dug tile, the bombs, the wrong X, and the raid's toll, steps and traps. What a run does not spend comes home. It is the game's fuel and its clock. Before this there were three meters (a 60 burrow bank, a 150 run bar, a 26-point raid counter), which took three sentences to explain.

| | |
|---|---|
| Dig a fresh tile | −1 (walking dug ground is free) |
| Dig a bomb | −30, all in |
| Right red X | +3 on levels 1-5 (Meadow, Thicket), +2 on levels 6-10 (Ashland, Caldera) |
| Wrong red X | −15 |
| Crossing to an island | −5, and only with at least 40 in the tank |
| Regen at the burrow | 30 an hour (empty to full in 10 h, 720 a day), +1/h per burrow level up to level 10 (39/h, full in 7 h 41) |
| Bought refill | fills to 300: 700 carrots or $0.99, at most 5 per rolling 24 h |

- **Carrots are score, never fuel.** Golden carrots are too. Only a right X puts energy back.
- **Energy is elastic, never random.** Every amount is fixed and shown. The loss on an X is five times the gain or more, so a blind X only pays when the tile is a bomb more than 5 times in 6 (83 % at +3, 88 % at +2). Guessing loses and knowing wins. An X costs half a bomb, so at a true coin-flip it is still the cheaper way to find out.
- **Nothing is computed on a timer.** Energy is derived when it is read, from a timestamp. There is no cron.
- **A new player is created with a full tank.** Nobody discovers this game half-empty: the first session decides whether there is a second.
- **LOOKING IS NOT PLAYING.** A player who crosses, takes not one step and walks home gets the crossing back. The test is having *moved*, not having dug. The refund folds in the regen that happened meanwhile and stops at the ceiling, so crossing and waiting is worth nothing.
- **One door at a time.** No raid while you sit on an island, and no crossing while a raid you have stepped into is open.
- A refill bought mid-run reaches the rabbit on the island too.
- **THE TANK EXPLAINS ITSELF.** A tap on the ring says what the energy buys right now. DIG is greyed under 40 and shows the wait. Out of energy, the popup gives the free route (the wait) first, then the price.

Why the regen sets the rhythm: it is sized to the gap between sessions, so two sit-downs a day each find a full tank. A burrow level recharges a point an hour faster, which gives a veteran more sessions rather than longer runs. A bigger tank was measured and rejected (21 September): the tank is what makes the last tiers hard.

---

## The island

### The run

- **The island is shared ground.** Every island outside the tutorial stands on the same coast (`ISLAND_GROUND = 'island-v1'`, a 32×32 grid). The rabbit's level sets how much of it is land, and the private seed sets what is buried. Everyone at a level walks the same shore; only the bombs move. Changing the ground means changing the constant in TS and Godot together.
- **First digger takes it.** A revealed tile is revealed for everyone, and the first to dig it gets the carrot, the golden carrot or the chest. Rabbits move tile by tile, visibly, so the race is physical.
- **What is buried.** Bombs, carrots (3 each), golden carrots (15 each), and chests. Bombs and golden carrots are weighted outward from the spawn: a bomb is 3× likelier at the far end than at the start, a golden carrot 5.7×. A bomb touches at most one other bomb while the draw allows, which spreads the same count over more of the board.
- **The cascade.** At birth the island opens around the spawn, capped at 3 tiles. In play, a zero opens its whole connected zero region with no cap ("when you clean a zone, the whole zone goes", Paul). The opening rolls out as a wave, ring by ring.
- **Loot is random, danger is deterministic.** Carrot values and chests are a lottery. The clue numbers never lie. Risk is skill, reward is luck.

### The red X

A player may mark any of the 8 tiles around their rabbit as a bomb, if that tile says nothing yet (not dug, not hinted, not marked, not a chest). The server answers at once.

- **Right:** energy back (+3 or +2), plus a carrot bounty that climbs with the streak (1, 2, then 3 per X). The bomb stays buried under its X, and the X is a wall nobody can step on. Every 25 right X in a row adds one burrow bomb to the bag. Energy the full bar cannot take is paid as carrots (1 per point), so a right X always pays something.
- **Wrong:** −15, the streak is gone, and the tile gets its number.

The X is what stretches a run: reading the board roughly doubles it. It never makes a run endless, and that is by design (see Rejected).

### Bombs and the sea

- **A dug bomb:** −30 energy, and a 1.2 s stun. The rabbit jumps, the bomb goes off, and it is thrown back onto the tile it came from (no crater, 23 September). One second on the ground with the stars, then it gets up. The X streak resets.
- **The sea drowns (23 September).** A rabbit shoved into the sea loses 30 (the price of a bomb) and spends 2 s under water. It comes back up on the free dug tile nearest the spawn. A tier-1 beach blocks like a wall. A rabbit shoved onto a bomb digs it and pays for it.
- Nothing is stolen mid-run, and there is no hard death.

### How a run ends

| Exit | Trigger | What happens |
|---|---|---|
| **The island sinks** (the win) | The last chest is dug, by anyone | 4 s later: everyone is banked, and **every living rabbit gains a level** |
| **Empty tank** | Digging, a bomb, a wrong X, the sea, lightning | **NO DEATH** (23 September): the rabbit jumps, the island sinks under it, and it is back at the burrow. Same level. |
| **Walk home** | The player leaves (refused while inked) | Banked at once |
| **Disconnect** | Socket lost | The seat is held 45 s, then the run is banked |

Zero ends the run, whatever emptied the bar: no energy, no more exploring, one rule. A last chest dug with the last point still counts: the rabbit lives at 0 and levels up. Every exit goes through a single, idempotent bank: carrots, chest items, energy left and counters, all or nothing.

The best haul per island tier is a record, and the game says so when you beat it.

### Chests are the win condition

**THE ISLAND IS A LEVEL.** It is cleared when every **chest** has been taken. The chests sit on the rim (the outer 40 % of the walk from the spawn), and they are visible from the start with their rank. Clearing an island means walking its edge. Nobody is ever asked to step on a bomb to finish: the chests stand on open, readable ground.

**WHY THE SEA AND NOT A VOLCANO.** An island that sinks because it has been emptied tells the same story as the game: rabbits dig an island until nothing is left holding it up. A volcano was a second threat bolted to the side of that, a mountain nobody dug deciding on its own to end a run about carrots. The tide is the island's own accounting, and the sea is already drawn around every board. (Internal names still say `ERUPTION`.)

As chests come out the island rumbles: warnings at 45 %, 62 % and 78 % of chests taken.

**Chest ranks**, rolled per chest:

| Rank | Odds | Contents |
|---|---|---|
| Bronze | 45 % | 20-90 carrots (the only carrot chest) |
| Silver | 30 % | Water ×1-3 (55 %) or fertiliser ×1-2 (45 %): the garden chest |
| Gold | 19 % | Burrow bombs ×1-2 (50 %), a shield (28 %), lightning (22 %) |
| Crown | 6 % | Lightning (40 %), a shield (35 %), bombs ×2-3 (25 %), and a 1-in-4 chance of an **RR Genesis piece** on top (1.5 % per chest) |

Silver exists so that a farmer who never raids still pulls something they want. Climbing from level 1 to 10 opens about 40 chests, for about 0.6 Genesis pieces on average.

### The rabbit's levels

**THE RABBIT'S LEVELS (23 September 2026).** The rabbit has ten levels, and there is **no island choice**: DIG sends you and the server picks the island at your level. Clearing an island is +1 level. A run that ends dry does not clear: you replay the level. Progress comes from islands cleared, no longer from carrots banked (the old tier doors at 6 000 / 19 500 / 37 500 are gone).

| Lvl | Tier | Seats | Tiles | Bombs | Carrots | Golden | Chests | X gain |
|---|---|---|---|---|---|---|---|---|
| 1 | Meadow | 1 | 103 | 10 | 27 | 1 | 2 | 3 |
| 2 | Meadow | 1 | 138 | 16 | 38 | 2 | 2 | 3 |
| 3 | Meadow | 1 | 174 | 24 | 49 | 3 | 3 | 3 |
| 4 | Thicket | 1 | 213 | 31 | 63 | 5 | 3 | 3 |
| 5 | Thicket | 1 | 258 | 43 | 80 | 7 | 4 | 3 |
| 6 | Ashland | 2 | 307 | 55 | 98 | 12 | 5 | 2 |
| 7 | Ashland | 2 | 358 | 71 | 119 | 17 | 6 | 2 |
| 8 | Caldera | 2 | 433 | 90 | 148 | 25 | 7 | 2 |
| 9 | Caldera | 2 | 487 | 107 | 168 | 31 | 8 | 2 |
| 10 | Caldera | 4 | 531 | 127 | 187 | 41 | 10 | 2 |

Bombs go from 10 % of the ground at level 1 to 24 % at level 10. The four tiers remain as the look, the name and the X gain of the levels.

- **Solo, levels 1-5.** The island sinks with its run: the next DIG deals a fresh island at the same level. Levelling up means taking every chest in one run.
- **Duo, levels 6-9; four, level 10.** A started shared island lives for 24 h with nobody on it. The player whose bar ran out, or anyone else at that exact level, can come back and finish it. A fresh island is a long run, a half-dug one a short cheap haul, and that is a real choice.
- **Level 10 repeats forever.** It is the shared, competitive game: four rabbits, the crown, the season.
- **Joining.** No lobby, ever. A joiner lands on the fullest island at their exact level that still has a seat, at least 20 safe tiles and at least 2 chests left; otherwise a new one is dealt. When an island sinks, every living rabbit on it levels up, even one who just arrived.

**DIFFICULTY, THE PRINCIPLE (Paul, 21 September, reshaped 23 September): PROGRESSIVE WHILE LEARNING, SOCIAL AT THE TOP.** Levels 1-9 are the ladder: each cleared island opens a harder one, and the player learns alone, then with one other rabbit. At level 10 the difficulty stops coming from the board and comes from the other players.

### The first trip

A new account lands **directly on the tutorial island**, not on the burrow. It is a hand-drawn corridor of 28 tiles: the spawn, three tiles in a row, a "1", one bomb to the side, a clearing and a chest. Until the bomb has its X, a step can only go onto dug ground or towards the bomb. The chest ends the lesson, the island sinks, and the player arrives at the burrow at level 1. The tutorial never comes back and is not a level.

In Godot the lesson always plays offline, and each step is replayed to the server (spaced 150 ms apart) so the server takes the chest and counts the run.

---

## The burrow

The player's persistent base between runs. It grows carrots, refills the tank, banks the loot, and it is the board other players come to raid.

### The shared ground

**ONE GROUND FOR EVERYONE (30 September 2026).** Every burrow stands on the same 19×19 ground (`BURROW_GROUND = 'burrow-g285'`): the entrance at the bottom of the screen, a 12-tile garden at the top, and the house, a solid 2×2. Only the decor (trees, rocks, clutter) is drawn from the player's id, and the owner can move all of it. One ground is drawn and balanced once. (It went from one ASCII map, to one ground per player, and back.)

- The shortest crossing from door to garden is **11 steps**, the same for everyone.
- **The doorstep**, the first 2 steps inside the entrance (13 tiles), is walkable and can never be mined. Both sides see where the door is and how far the doorstep runs. With the door minable every burrow had the same best defence, a ring of bombs round the landing tile, and the crossing ended before a clue was read.
- **Steps go eight ways.** Walling the four faces closes nothing, because a diagonal passes the corner. Any blocking rule must be tested by walling everything and checking that the goal becomes unreachable.
- Changing `BURROW_GROUND` moves every tile of every burrow, so `scripts/reset-burrows.ts` must run in prod first.

### Buildings and islets (24 September)

The burrow's interface stands in the world: every action is a building with a plank for a label.

| Door | Where | Tap |
|---|---|---|
| **DIG** | Islet, south-west | Cross to an island at your level |
| **DEFEND** | Islet, south | Place bombs and fences |
| **RAID** | Islet, south-east | The target list |
| **SHOP** | Islet, east | The stall |
| **HARVEST** | In the garden | Harvest in one tap |
| **UPGRADE** | Above the house | The upgrade card |

**The islets rise out of the sea as the player learns** (1.5 s, then a pontoon): DIG and SHOP when the tutorial ends, DEFEND at rabbit level 2, RAID at level 3. The active quest puts a "!" on its door.

### Arranging the burrow

No mode and no button: one click picks up a tree, a rock, the house or the whole garden, and one click on a lit tile puts it down. Dragging works too. Each move saves itself, and UNDO stays up for 4 s. The ground and the entrance never move. The server re-measures every edit: the garden must stay reachable and the crossing must stay between 6 and 13 steps. Because trees move the route, no two burrows are crossed the same way.

### The house and the burrow level

The house carries the burrow level (1-20). Upgrading costs `500 × 1.45^(level−1)` carrots, paid from the stock: 500 for level 2, 3 800 in total to reach level 5, 30 370 to reach level 10. A level does exactly two things:

- **Garden:** 20 carrots/h at level 1, +8 per level (52/h at 5, 92/h at 10).
- **Regen:** +1 energy/h per level, up to level 10.

The house art changes from level 1 to 5. *(v0.9 promised a bigger defence budget per level: it does not exist. Every burrow places 8 bombs.)*

### The garden

Passive carrot production that stops when full: **12 hours** of yield (240 carrots at level 1). Harvesting adds the lot to the stock, the season score and lifetime in one write. A full garden produces nothing more, and an unharvested one is what raiders come for.

**The garden is the other purse, and the one a raid is really for.** What is left growing outside is raided at a much higher share (35 %) than what is banked inside (8-10 %). Clash of Clans pillages collectors at 50 % where storages give 10-20 %, for the same reason: what is produced passively and left out should be what is vulnerable. A full garden is worth walking in for, and that is what brings its owner home twice a day. Stolen garden carrots cost the victim no season score (they were never scored), and the thief still gets the lot.

### Water and fertiliser

These are the garden's two dials, found in silver chests and never sold.

- **WATER** raises the **rate** (×1.5 for 4 h). It pays the player who comes back often and harvests before the cap.
- **FERTILISER** raises the **ceiling** (12 h → 18 h for 12 h). It pays the player who cannot come back tonight.

One rewards attention, the other forgives its absence. Both are held in the bag and **poured by hand** (a chest used to apply them on opening, often onto a full garden and for nothing). Both are windows of time, not instant top-ups. A second pour extends a running window, and banked time is capped at 24 h per kind.

**Neither is ever for sale.** They are the reason a farmer opens a chest. The moment water is on the shelf, a rich player buys a permanent garden.

### The stock

The stock is exposed above a **floor of 300**: no raid ever reaches below it. That floor is the beginner's protection, not secured storage, so a king cannot bunker their score behind it. A new account also gets a **48 h shield**, 3 free bombs and 3 fence planks.

---

## Defence

### Bombs

The burrow bomb is **the only bomb item in the game** (28 September: the island bomb item and the hidden bomb planted on islands are gone; the code still says `trap`, but the player only ever reads "bomb").

- It is buried on walkable ground, never on the doorstep, the garden or the house. **8 placed at most** for everyone, **12 held**.
- **3 free per rolling 24 h** (one every 8 h), spent before bought stock. Defence never depends on wealth. Extra bombs cost 150 carrots or $0.25.
- **Invisible to the raider.** A visible bomb is just a wall, and a wall gets routed around rather than feared. The raider reads clue numbers on the tiles they stand on and next to, never positions.
- A sprung bomb burns **12** of the raider's energy.
- **A sprung bomb rearms on a clock**, in place, for free: 3 h for the first, then +30 min for each one sprung with it (8 bombs come back in 6 h 30). It is never re-bought or re-placed. Loss has no rate limit (as many raids as there are attackers) while replacement is capped, so pay-to-repair would leave a player raided overnight poorer every morning. Clash of Clans re-arms for free for exactly this reason. Rearming is gradual so that a burrow does not snap back to full the moment its owner logs in.

### Fences (21 September, one plank at a time)

A plank sits on one edge of the garden and refuses any raider step through it, diagonals at its corners included. Planks are placed and lifted one by one, back to the bag intact. **The last opening can never be closed**: a plank that would seal the garden is refused (16 exposed edges, at most 15 planks). Unlike bombs, fences are **visible**. Their job is to channel the raider into the bombs: alone they barely defend anything. Each player gets 3 at the start; more cost 300 carrots or $0.40, and the bag holds 20.

### Smoke

Smoke hides the clue numbers of your burrow from every raider for 24 h. They cross blind, reading nothing but walls and what they set off. It is the anti-revenge item: the player you just robbed walks back in with your layout memorised. It costs 2 000 carrots or $1.99, stacks, and caps at 3 days. It is priced high on purpose: the crossing is meant to be solvable, and permanent blindness would make defence free.

### Live defence (17 September)

A defender who is online watches the intruder walk their burrow step by step, and can answer: bury a bomb in front of them, drop a plank, or **strike them with lightning**. A strike ends the raid on the spot: nothing is taken, and the defender gets a 12 h shield. With an empty pocket, "BUY AND STRIKE" buys the lightning and fires it in the same tap. A defender on an island sees the screen edges pulse red. A defender who is offline gets a push ("X is raiding your burrow!", then the result). Everything travels over the socket, never by polling.

---

## PvP

**From rabbit level 3, both ways.** Below level 3 a player cannot raid or be raided, struck or inked. The server enforces it (`level_locked`), and the RAID islet only rises at level 3. Island weapons need a rival on the island, so in practice they start at level 6, the first two-seat islands.

### The raid

You enter the defender's burrow and **walk their board** tile by tile, from the door to the garden. The board is the minefield they designed.

**A RAID BEGINS AT THE FIRST STEP**, not when the target is opened. Opening one is how you look at it. A raid abandoned before any step costs nothing, starts no cooldown, counts for no quest, writes nothing in the victim's log, and the defender is never told. From the first step, all of it counts.

**What it costs, from the one tank:**

- **Entry** needs 58 energy: the toll (45) plus the longest crossing (13 steps).
- **The toll (45)** is taken at the first step and never refunded.
- **The walk:** 1 per step, plus 12 per sprung bomb. The raid draws at most a **stake of 69** (a walk budget of 24). At zero the raid ends where you stand.
- **READING THE BURROW PAYS BACK.** A raid that reaches the garden gets its steps' energy back; the bombs stay burnt. A clean crossing costs the toll alone. A raid that dies on the way gets nothing back.
- On a full stake, **two bombs always stop a raid**; one bomb does if the raider entered at the floor.

The raid keeps a **budget, not hearts**: a step has to cost something, or the distance the defender put between the door and the garden defends nothing.

**What it takes (raid tuning G, 30 September):**

- The **garden** first: 35 % of what is unharvested. Then the **stock above 300**: 8-10 %.
- **The loot is in the garden.** Reaching it pays the full share. A raid that dies on the way pays a floor of 15 %, plus 25 % × progress (40 % at most), so a single bad run never stops anyone attacking, and a raid stopped one step short no longer takes nearly everything.
- At most **1 200** per raid, the garden filling the cap first.
- **Stock theft moves the season score** from victim to thief. Garden theft creates no score.

Tuning G measured, on robots: under the old tuning (a 30-step walk and 8-point bombs), even 8 bombs and 10 planks let 97 % of raids through for the full loot, so defence did nothing. Under G a well-built defence stops about 40-45 % of reading raiders. The walk is the one real lever, and it is dry: on the shared ground a 25-step walk gives 93 % success, 24 gives 70 %, 22 gives 0 %. Move it one point at a time and re-measure with `tools/raid-matrix.sim.ts`.

**Shields** stop the queue forming while the owner sleeps:

- **Losing carrots raises a shield, being visited does not.** A raid that reached the garden and took something: 16 h. One that took something short of it: 12 h. One that took nothing: no shield. A shield for an empty sack would be a reward for having nothing worth stealing.
- A defender's lightning strike: 12 h.
- A new account: 48 h. The shield item: 6 h (600 carrots or $0.90), refused while another shield is running.
- A raider can return to the same victim only an hour after their last walked raid.

**The fog never carries between raiders.** Each attacker crosses blind, reading only their own steps. What raider n+1 inherits is the *state* of the floor (bombs still sprung), never the *knowledge* of it.

**The target list** shows the 20 biggest stocks at level 3 or above. Each row has the garden waiting, the shield and its time left, and presence: *away*, *home* (online at the burrow, can strike) or *digging*. On a *digging* row the button is **WATCH**: it drops you on their island as a spectator, weapons in hand.

### Sabotage on the island (24 September)

Two weapons, both aimed at a **rabbit**, fired from the island or while watching. Arm one, then tap a rival. A miss on empty ground is refused before it is paid. The victim always sees who did it: revenge is the point.

- **LIGHTNING** (500 carrots or $0.60). The 3×3 around the tap opens at once, bombs included (a chest is never opened). Every rival standing in it is electrocuted: −30 and 2 s held. It never re-covers a dug tile.
- **THE BLOOP** (Mario Kart's squid; 100 carrots or $0.10). Ink runs down the rival's screen for 6 s. It takes nothing, but **while it holds they cannot walk home**. A pure screen-blocker gets shrugged off by good players (the Blooper is known as a wasted item), so the pin is its teeth. It is the cheapest thing on the stall, thrown on impulse.
- **The shove.** Walk into a rival and they are pushed, into the sea (they drown, −30) or onto a bomb (they pay it).

**BOMBS ARE FOR THE BURROW.** Nothing is planted on a rival's island any more.

### Revenge, offered hot (30 September)

The victim always knows who hit them, and the game offers the answer at the moment they want it.

- **On the island:** after a shove, a strike or an ink, a "STRIKE BACK" banner holds for 6 s. With an empty bag the tap buys the lightning and fires it on the culprit's tile.
- **In the burrow:** "BUY AND STRIKE" on the live raider.
- **On the profile:** every raid suffered and not yet answered carries a "TAKE REVENGE" raid button.

Striking back "doesn't make you win, it makes you feel good". It is a pleasure purchase, offered hot, with no quota. Items that change the outcome (shield, smoke, bombs, fences) get one offer at a time, with the free route said first. There is never a dead button: with no lightning and no means to buy one, the offer does not show.

---

## Economy

**A dug carrot is worth 3 carrots** (15 until 17 September). At 15, runs were 84 % of a regular player's income. Run, garden and raid are tuned to carry comparable weight over a day, so none of them is the one right answer. Measured on full islands: about 170 a run without the X, about 500 for a reader, beside a 240 garden visit and a raid of about 200 to 350.

**One carrot feeds three counters:**

- **Stock (wallet):** spendable and stealable above 300. It buys everything in game.
- **Season score:** the leaderboard. Runs, harvests and quests add to it. Spending never touches it; only theft moves it. Stolen stock leaves your score and joins the thief's, so the king can be dethroned by raids, and spending surplus protects points.
- **Lifetime:** never resets. It opens the lore chapters.

### The stall

Seven items, each with a carrot price and a dollar price. The server sets every price, and a few are tunable live from the `tuning` table.

| Item | Carrots | $ | Does |
|---|---|---|---|
| Bomb | 150 | 0.25 | Burrow defence (also 3 free a day) |
| Lightning | 500 | 0.60 | Island strike, or the live-defence strike |
| Shield | 600 | 0.90 | 6 h out of PvP |
| Refill | 700 | 0.99 | Tank to 300, 5 a day |
| Smoke | 2 000 | 1.99 | 24 h of blind burrow, up to 3 days |
| Bloop | 100 | 0.10 | 6 s of ink on a rival |
| Fence | 300 | 0.40 | One garden plank |

- **Everything on the stall is buyable in carrots OR money, and everything money buys can be earned by playing.** The same caps apply both ways (20 of an item held, 10 per purchase). Prices are flat with no bulk discount: a discount on attack is a discount on hurting people who bought nothing. Water and fertiliser are never on the stall. **No exclusive power for money, ever.**
- **The money rail** is USDC, SOL or SKR on Solana **mainnet since 30 September 2026**. The price is set in dollars; the token is only the rail. The server quotes the price, builds the transaction and reads the chain to verify it. It never holds a key that can send. A guest buys in carrots like everyone; only money needs a wallet.
- The refill is "play now": it fills, it never stacks past 300. Money buys the wait, never the edge.

### Season, crown and pass

- **Seasons last 30 days.** At the end the standings freeze, the #1 is recorded as champion, and every season score goes to 0. Stock and lifetime never reset.
- **The Crown:** the season's #1 scores ×1.15 on runs and loses ×1.5 to raids (within the 1 200 cap). Being first means being hunted. Heavy is the head.
- **GOLDEN CARROT PASS** (season pass, $4.99, money only). Built but **not in prod**: migration 0025 is pending. The team opens a pass season (`scripts/season-pass.ts`). A holder gets **a daily chest** (a refill, a bomb and a bloop, every day at UTC midnight, outside the 5 paid refills), a **gold tag** on the leaderboard, and a place in the **pot**. Half of all pass money is paid in USDC to the season's top 10 holders (40 / 24 / 16 %, then 2.86 % each for 4th to 10th), by hand from our machine. Sales stop an hour before the end.

### Quests and the next action

There is one quest at a time, in the order the game teaches its verbs:

1. dig 10 tiles
2. bring a run home
3. harvest
4. bury a bomb
5. open a chest (reward: a shield)
6. raid once (reward: a bomb)
7. open the leaderboard
8. read lore chapter II
9. bury 3 bombs
10. reach 7 500 lifetime carrots

The arc totals 875 carrots, a shield and a bomb, and it is the main income of the first days. After the arc, a "now do this" line reads the state: garden almost full, then shield about to drop with few bombs, then a rich target, then an island if the tank allows, then the wait.

### Push notifications (30 September, Firebase)

Pushes are the twice-a-day appointment: the tank is full, the garden is full, you have been away 24 h and then 72 h, a raid is on. At most 3 a day outside raids, 2 h apart, silent from 22:00 to 09:00 local time. Raid pushes ignore quiet hours and the daily cap.

---

## Story — The Cursed Crown

The island is alive: it gives carrots and demands a king. The lore is told in **five chapters** unlocked by lifetime carrots: *The Island* (0), *The Numbers* (500), *The Burrow* (2 000), *The Crown* (8 000) and *The Tide* (25 000). They are written in the order the game teaches its rules, and even a bad session moves the story on (the Hades model).

**Not built (parked from v0.9):**

- **The Sacrifice** at season's end (accept and get a tomb, or flee on a coin flip as the Errant King).
- **The Mausoleum of Kings.**
- **Lore fragments in chests.**
- **Cursed Islands** (no clue numbers, higher variance).
- **A daily mood at level 10.**

Today a season ends quietly: the champion is a name in the standings.

---

## Design pillars

- **Deterministic risk, random reward.** Reading the board is the skill, and it pays in carrots per tank, not in time without end.
- **Being rich means being visible means being hunted,** at every scale: the crown, the loot, the target list.
- **The rules and the lore tell the same story:** the crown is cursed, and the island sinks once it has been emptied.
- **Fair defence:** free bombs every day, free rearming, a floor nobody can take. Defence never depends on wealth.
- **Money buys time and style, never power.**

## Rejected (and why)

- **Mid-run loot loss and cash-out** (gambling leftovers).
- **Spending lowering rank** (it kills the economy).
- **Secured storage** (unkillable kings).
- **Pay-to-repair** (churn).
- **Board re-covering** (it breaks minesweeper logic).
- **Random energy amounts** (a slot machine).
- **Energy per dig WITH NO WAY TO EARN IT BACK** (an egg timer that hides the bombs behind attrition). The red X is what makes the shipped dig cost a different thing.
- **Hearts** (24 points, digging free): a player who deduced nothing still cleared 83 % of a Meadow island.
- **A higher energy ceiling** (a reader just sits at the new ceiling, and the last tension goes).
- **An X generous enough to sustain a run** (+8: the run never ends for a reader, and the refill is never seen).
- **Golden carrots that give energy back** (39 of them on a Caldera island out-fuel any X).
- **A "dry" state at zero** where only a right X revives the rabbit (shipped for an hour on 17 September: three sentences to explain, and proven bombs hoarded as a reserve tank).
- **Surrounding a bomb to defuse it** (it pays twice for knowledge the X already pays for).
- **A red ring on unread tiles** (an unexplained colour).
- **A run that survives its island** (nothing is left to end it once digging is free).
- **A timer on a run** (the island is the clock).
- **Charging a crossing that was never walked** (a third of the bank for a look, seen live on 21 September).
- **Choosing an island or a tier before a run** (it asked a newcomer to decide something they could not judge yet, so the level decides).
- **A volcano to end the island** (a second, unrelated threat; the sea took its place).
- **A shield for a raid that took nothing.**
- **Telling a defender about a raider who never stepped in.**
- **A bomb planted on a rival's island** (dropped 24 September: counted in the numbers it was a tell nobody read, left out of them it made the board lie, and lightning already did the damage).
- **The mirage**, a few of a rival's numbers lying by one for 90 s (a second way to spoil reading, never ported to Godot; the bloop took its place).
- **A minable doorstep** (every burrow had the same best defence).
- **A burrow ground per player** (unbalanceable; one shared ground, decor per player).
- **Fences sold one whole side at a time** (playtest: "it's one by one").

---

## Open questions

1. **How long is a run?** Three targets live side by side: 5 min × 2 sessions a day (economy notebook), 5-10 min (v0.9), and 12-25 min (measured on a full 300 tank on full-size islands). At levels 1-5 the island ends on its chests long before the tank runs out, and nothing has been measured per level. Fix one target, then re-run `tools/sim-dig.sim.ts` and `tools/economy-day.sim.ts` on the 30 September values.
2. **The 5 → 6 step** doubles the players, drops the X gain from 3 to 2 and makes the island persistent, all at once. It is the steepest step on the ladder. And with few players, exact-level matching leaves a level 6-9 player alone on a two-seat island.
3. **Burrow levels 11-20** only add +8 carrots/h of garden for 20 000 to 400 000 carrots. Options: cap at 10, give the high levels something (a defence budget, art), or soften the curve.
4. **Fertiliser** poured right after a harvest is worthless: its 12 h window expires just as the garden passes 12 h. Lengthen it to 18 h or more, or lock the ceiling in when it is poured.
5. **Raid gate (level 3) vs island weapons (level 6 in practice):** align the text and the rule. Also, should a raider's own shield drop when they attack (Clash of Clans does this)?
6. **The live-defence strike** costs 500, often more than the raid would take, and it raises a 12 h shield even when nothing was taken. Keep it as a pleasure purchase, or price it for defence?
7. **The pass pot** pays real money to the top of a leaderboard fed by paid entries. Against v0.9's "zero wagering, no cash out", and against Google Play's real-money-gaming policy, this has to be settled before a pass opens on a store build.
8. **End of an ordinary season** gives the champion nothing but a name. A chest, a title or a cosmetic for the top 10?
9. **Quest 10** still asks for 7 500 lifetime carrots, a leftover of the tier doors. "Reach level 4" fits better, and no quest teaches "clear an island", which is now how you progress.
10. **Every 25 right X → a bomb** is out of reach on levels 1-3 (10-24 bombs per island), so the DIG → DEFEND link does not exist early on.
11. **Where the refill sells after a dry run,** now that the recap card is gone: today only the "out of energy" popup at the burrow offers it.

## To tune with tools, not by feel

- Dig, bomb and X costs → `tools/sim-dig.sim.ts`
- A day's income split and prices → `tools/economy-day.sim.ts`
- The raid walk, bomb drain and loot → `tools/raid-matrix.sim.ts` on `burrow-g285`
- Burrow ground candidates → `tools/burrow-ground-pick.ts`
- Live PvP with robots → `tools/bots/` (trio, styles)
- The garden curve, chest weights, water/fertiliser strength, rearm delay and shield durations live in `config/tuning.ts`.

Change the file, deploy, then re-seed `tuning`. Only the stall prices and the pass price are actually read live from the table.
