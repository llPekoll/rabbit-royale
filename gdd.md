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
Island life cycle: no re-covering. When ~X% is dug, the volcano erupts, the island sinks, players redistribute.
Cursed Islands (opt-in mode): no clue numbers, higher variance rewards. Same average yield as normal islands — a thrill choice, never the optimal farm.
The Burrow
One building, one level. Leveling up = garden produces more + bigger defense budget.
Garden: passive carrot production, capped (~15% of active income — the run stays the main source). Harvest on return; stealable if you don't.
Stock: fully exposed. A successful raid takes ~20-25%. No secured storage (a king could bunker his score). New players get a starting shield (~3 days).
Defense field: your burrow is a 15x15 board with a fixed shape — the door, the stone path and the carrot field are where the art puts them. You bury traps on the walkable ground between them (budget per level, a valid path must always remain). Every burrow has the same shape; what differs between two of them is where the owner buried, which is the whole point. Your base IS a puzzle you design.
Traps are invisible to a raider until sprung. A visible trap is just a wall, and a wall gets routed around rather than feared.
Smoke screen (defensive, expensive): hides the clue numbers of YOUR burrow for 24h. A raider crosses it blind, reading nothing but their own steps. It is the anti-revenge item — after you take someone's carrots, it is what stops them walking straight back in with your layout memorised. Priced high on purpose: the crossing is meant to be solvable, and permanent blindness would make defence free.
Repairs and defense re-setup are free. Always.
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
Everything is buyable in carrots OR money. Crypto (SOL/USDC via Seeker) is the convenience route; carrot prices are steep on energy (deliberate sink). No exclusive power for money, ever. Cosmetics and NFT drops bridge visually with the existing PFP collection — no economic bridge.
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
Energy values & starting budget · defense field size & bomb budgets per level · raid loot % · island death threshold · Cursed Island variance · garden yield curve.
