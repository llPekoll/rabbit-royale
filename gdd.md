Rabbit Royale: The Cursed Crown — GDD v0.7
Competitive persistent minesweeper. Dig carrots, stack them in your burrow, raid other burrows. The #1 wears a crown that makes them everyone's target.
Minesweeper × Clash of Clans, on Solana Mobile. Free-to-play, zero wagering, no cash out. Android + Solana Seeker dApp store. Reuses the live Rabbit Royale codebase, pixel art and island engine.

Core loop
DIG (5-10 min runs) → STACK (burrow, async) → RAID (PvP) → repeat. While you play you can only win. The only thing you can lose sits in your burrow, while you're away.
The Run
Drop-in islands, up to 4 rabbits, no lobby ever. New players land on the least-full island; full → a new one spawns.
Shared board: a revealed cell is revealed for all, first to dig gets the carrot. Rabbits move cell by cell, visibly — the race is physical.
Walking on revealed cells is free; digging a new cell costs 1 energy.
Energy is elastic, never random: carrot +X, golden carrot +Y, bomb −Z. Fixed, displayed amounts. Skill = lasting longer.
Bomb: knockback + stun + energy loss. Nothing is stolen mid-run, no hard death.
Loot is random (carrot value, chests: items, NFTs); danger is deterministic (clue numbers). Risk is skill, reward is lottery.
Chests hold ONE table wherever they are dug: carrots (the floor, ~40% — every other line can be capped out or unwanted, and a chest that disappoints is worse than no chest because the player walked onto a known tile for it), raid items (bomb, shield, lightning), the two garden consumables (water and fertiliser, see The Burrow), and an NFT at 1 in 100. One table rather than a raid table and a farming one: a farmer who never raids still pulls something they want three times in ten, and splitting it would sort players into two games that never trade.
Island life cycle: no re-covering. When ~X% is dug, the volcano erupts, the island sinks, players redistribute.
Cursed Islands (opt-in mode): no clue numbers, higher variance rewards. Same average yield as normal islands — a thrill choice, never the optimal farm.
The Burrow
One building, one level. Leveling up = garden produces more + bigger defense budget.
Garden: passive carrot production, capped (~15% of active income — the run stays the main source). Harvest on return; stealable if you don't.
Water and fertiliser (chest drops, never sold): the garden's two dials, and they are deliberately different ones. WATER raises the RATE for a few hours — it pays the player who comes back often and harvests before the cap. FERTILISER raises the CEILING for longer — it pays the player who cannot come back tonight. One rewards attention, the other forgives its absence, so a player holding both has a real decision about the day ahead rather than a strictly-better button.
Both are windows of TIME, not instant top-ups: an instant "+N carrots" would be a carrot drop wearing a different sprite, whereas a window makes using one a small bet on when you will next be here. A second drop extends a running window rather than restarting it, and banked time is capped — an uncapped stack would be a permanently buffed garden, which is just a higher base rate with extra steps.
Neither is ever for sale. They are the reason a farmer opens a chest, and the moment water is on the shelf a rich player buys a permanent garden and the drop stops meaning anything. This is the one place the Economy's "buyable in carrots OR money" rule does not reach — because it is a reward for digging, not a good.
Stock: fully exposed. A successful raid takes ~20-25%. No secured storage (a king could bunker his score). New players get a starting shield (~3 days).
Defense field: your burrow is a 15x15 board with a fixed shape — the door, the stone path and the carrot field are where the art puts them. You bury traps on the walkable ground between them (budget per level, a valid path must always remain). Every burrow has the same shape; what differs between two of them is where the owner buried, which is the whole point. Your base IS a puzzle you design.
Traps are invisible to a raider until sprung. A visible trap is just a wall, and a wall gets routed around rather than feared.
Smoke screen (defensive, expensive): hides the clue numbers of YOUR burrow for 24h. A raider crosses it blind, reading nothing but their own steps. It is the anti-revenge item — after you take someone's carrots, it is what stops them walking straight back in with your layout memorised. Priced high on purpose: the crossing is meant to be solvable, and permanent blindness would make defence free.
Repairs and defense re-setup are free. Always.
A sprung trap REARMS ON A CLOCK; it is never re-bought and never re-placed. The tile keeps its trap, only the arming is on a timer, and the burrow comes back up one trap at a time over a few hours. This is the concrete form of "re-setup is free": a trap the owner already earned stays theirs, so the free daily allowance is what EXTENDS a defence rather than what repairs last night's.
The alternative — a sprung trap consumed outright — is pay-to-repair wearing a different name, and it is rejected for the reason listed below. The asymmetry is what makes it fatal: loss has no rate limit (as many raids as there are attackers) while replacement is capped at the daily allowance, so a player raided overnight cannot re-arm as fast as they are emptied and each morning starts poorer than the last. Clash of Clans re-arms free and automatically on login for exactly this reason.
Rearming is GRADUAL rather than instant, because a burrow that snaps back to full the moment its owner logs in makes the second raider's night meaningless. Partial recovery also reads better: coming back to three traps of eight standing is progress in motion, where an empty floor is a chore at zero.
Being raided raises a SHIELD, automatically. Rearming alone does not close the farm window — it only refills the burrow behind an attacker who has already left. The shield is what stops the queue forming while the owner is asleep, and it is the same absolute protection a new player's starting shield gives.
The fog never carries between raiders. Each attacker crosses the burrow blind, reading only their own steps — what raider n+1 inherits is the STATE of the floor (traps still sprung), never the KNOWLEDGE of it. Handing over the previous crossing would stack an intel advantage on top of a defence that is already down, and the defender loses twice for one absence.
PvP
The Crown: leaderboard #1 is marked on the world map, gets a score bonus, and drops more loot. Being first = being hunted.
Sabotage (real-time): spectate a live run, plant a signed bomb or lightning on their island. Items are earned in chests or bought, never free. The victim sees who did it — revenge is the point. A planted bomb updates revealed numbers: sharp players can spot the "2" that became a "3".
Raid (async): you enter the defender's base and WALK THEIR BOARD, tile by tile, from the door towards the carrot field — the minefield they designed. You spend energy on every step; a sprung trap drains a chunk of it. At zero the raid ends where you stand.
A raid is scored by HOW FAR you got, not by whether you "won". The crossing is only a handful of steps, so a pass/fail rule would resolve every raid to 100% or 0% however it was tuned; paying by depth makes each trap shave a slice off the haul instead of deciding the whole thing. Reach the field → the full share (~25%). Die on the doorstep → a floor, so attacking a defended burrow is never pure loss and nobody stops attacking after one bad run.
Attackers can invite a friend to dig together; the defender gets a push notification and can rush home.
Economy
One carrot feeds three counters:
Wallet — spendable, stealable. Buys everything in-game.
Season score — the leaderboard. Spending never touches it; only theft moves it: stolen carrots leave your score and join the thief's. The King can be dethroned by raids. Spending surplus = protecting points.
Lifetime — never resets. Doubles as XP: levels, richer islands, lore chapters.
Everything on the shelf is buyable in carrots OR money (water and fertiliser are not on the shelf — see The Burrow). Crypto (SOL/USDC via Seeker) is the convenience route; carrot prices are steep on energy (deliberate sink). No exclusive power for money, ever. Cosmetics and NFT drops bridge visually with the existing PFP collection — no economic bridge.
Seasons & narrative — The Cursed Crown
Seasons last 1 month. Season score resets; lifetime and stock never do.
The island is alive: it gives carrots and demands a King. At season's end, the #1 faces the Sacrifice, live in front of the server:
Accept → tomb of honor, unique NFT, writes his own epitaph.
Flee → 50/50 on-chain coin flip (provably fair, no wager). Win: return as the Errant King — crowned, hunted, shieldless. Lose: a runaway's tomb. Each escape lowers the next odds: the island learns.
Mausoleum of Kings: every fallen King gets a permanent tomb in the world with his name and last words. Resets erase scores, never glory.
Lore drips with lifetime milestones and chest fragments (Hades model: even bad sessions advance the story).
Design pillars (and what we rejected)
Deterministic risk, random reward. Session length is the skill reward.
Being rich = being visible = being hunted, at every scale (crown, loot, sabotage targets).
Rules and lore tell the same story (the crown is literally cursed).
Rejected: mid-run loot loss & cashout (gambling leftovers) · spending lowering rank (kills the economy) · secured storage (unkillable kings) · pay-to-repair (churn) · board re-covering (breaks minesweeper logic) · random energy amounts (slot machine).
To tune in prototype
Energy values & starting budget · defense field size & bomb budgets per level · raid loot % · island death threshold · Cursed Island variance · garden yield curve · chest density & loot weights · water/fertiliser strength and duration · trap rearm delay & whether it staggers per trap · post-raid shield duration.
