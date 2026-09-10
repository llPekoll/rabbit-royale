# Rabbit Royale: The Cursed Crown

Competitive minesweeper. A rabbit walks an isometric island tile by tile, digs
for carrots, reads the numbers to avoid bombs, and banks what it survives with.
On top of the run sits a persistent layer: a raidable burrow, a season score,
and a crown worth stealing.

Free-to-play, **non-gambling**. There is no wager, no balance and no cash-out:
carrots are earned by playing and spent in the game, and they never come back
out. The shop takes USDC as a CONVENIENCE route beside its carrot prices — see
[The shop](#the-shop) — and it buys nothing the grind cannot reach. What that
paid route is not, and must never become, is a way to put money in and take
money out.

---

## Quick start

```bash
bun install
cp .env.example .env          # then fill JWT_SIGNING_SECRET: openssl rand -hex 32
createdb rr_crown             # or point DATABASE_URL at your Postgres
bun db:generate && bun db:migrate

bun ws                        # terminal 1 — the authoritative game server
bun dev                       # terminal 2 — the web app
```

Open <http://localhost:3010/play>, connect a wallet, and you are on an island.
`R` restarts a run instantly.

`bun test` runs the suite — generation invariants, the rule set, regen maths,
and the pinned login message.

---

## Architecture

Two processes, deliberately, because they scale on different axes.

```
  browser / Seeker app
          │  socket.io (JWT in the handshake)
          ▼
  server/index.ts ────────── authoritative game loop
     islands in memory        moves, digs, eruptions
          │
          ├──► Postgres   run boundaries only (carrots, runs, raids)
          └──► Redis      leaderboard ZSET, presence

  src/app/**  Next.js — auth routes, burrow, leaderboard (stateless, replicable)
```

**The server is authoritative.** The client sends `{ dir }` and nothing else. It
never asserts a position, an energy value or a carrot count, and it is never
told what is under an unrevealed tile — `publicView()` strips the content, and a
test asserts the redacted tile has exactly one key. This is a competitive game
whose leaderboard will eventually matter, so a cheating client must be able to
lie to itself and to nothing else.

### Key files

| Path | What it is |
| --- | --- |
| `config/tuning.ts` | **Every** design number. Nothing is hardcoded elsewhere. |
| `src/lib/game/island.ts` | Seed-deterministic generation. Server-only — it knows where the bombs are. |
| `src/lib/game/run.ts` | The rule set: move, dig, knockback, first-digger-wins. |
| `src/lib/game/regen.ts` | Energy / HP / garden, derived from timestamps. No cron. |
| `server/index.ts` | The authoritative loop. |
| `server/islands/store.ts` | Where island state lives — the seam for sharding. |
| `src/lib/auth/wallet-login.ts` | Sign-in. ed25519 over a single-use nonce. |
| `src/lib/game/inventory.ts` | The bag and the shelf: prices, caps, refusals. |
| `src/lib/game/grant.ts` | The ONE place an item is credited, whichever currency paid. |
| `src/lib/pay/solana.ts` | Reads the chain to decide whether a USDC payment happened. |
| `src/game/island/` | Square-tile islands with stacked plateaus, from the Tiny Swords sheets. Groundwork for a future game, not used by the run. [Its own README](./src/game/island/README.md); look at one at `/island`. |

### Tuning

Every playtestable number lives in `config/tuning.ts` and nowhere else. If you
are about to type a number into game code, it belongs there. The tests assert
*behaviour* (walking is free, bombs throw you back) rather than literals, so
retuning during a playtest never turns the suite red for no reason.

---

## The shop

Four items and an energy refill, each priced in **carrots or USDC**. Both prices
sit on every line and neither buys anything the other cannot — that is the GDD's
economy rule (`no exclusive power for money, ever`) expressed as a data shape
rather than as a promise, and `test/shop.test.ts` fails if a one-currency line
ever appears.

| Item | What it does |
| --- | --- |
| Trap | Mined into your own burrow floor. Drains a raider's energy when sprung. |
| Bomb | Planted on someone's live island. Signed — the victim sees who. |
| Lightning | Re-hides ground they had already cleared. |
| Shield | Raids bounce off your burrow for `RAID.ITEM_SHIELD_MS`. |
| Energy | Refills the run bar now instead of waiting for regen. |

Traps and energy are deliberately **not** rows in `inventory`. A trap lives on
the player row beside the timestamp its free daily allowance is derived from,
and energy is applied on purchase rather than carried — `holdings()` folds all
three storage decisions back into one bag so a client sees a shelf, not a schema.

Every limit that binds the carrot route binds the money route too: caps,
per-purchase quantities and the daily energy window are all checked before a
quote is issued *and* before an item is credited. Only affordability differs,
because a wallet, not a carrot stock, decides that one.

### The USDC rail

The game never touches the money. It quotes a price, the player's wallet signs
an SPL transfer, and the server **reads the chain** to decide whether that
transfer happened:

```
POST  /api/shop/pay   → { paymentId, treasury, mint, amount, reference }
      (the wallet signs and submits the transfer itself)
PATCH /api/shop/pay   → { paymentId, signature } → verified, then credited
```

`verifyPayment` reads the transaction's **token balance deltas** rather than
decoding instructions: the deltas are the post-execution truth, so a transfer
wrapped in any number of instructions still counts and one that reverted does
not. It refuses a transfer to the wrong address, of the wrong mint (any SPL
token can call itself "USDC" — the mint address is the only real name), of too
little, or without this quote's reference in its memo. Redeeming one signature
twice is stopped by the unique index on `payments.signature`, which is load
bearing: do not remove it.

### Three ways a payment lands

A quote/sign/confirm rail has one structural gap: the player signs, the transfer
lands, and they close the tab before the confirm round-trip finishes. Their
money is on chain and their bag is empty. So three independent paths credit a
payment, and they fail differently on purpose:

| Path | Confirms in | Dies when |
| --- | --- | --- |
| The player's browser polls | seconds | the tab closes |
| Alchemy's webhook wakes the server | seconds | a deploy or an Alchemy outage |
| The shop sweeps unclaimed quotes | next visit | never — it is the floor |

**None of them is believed.** The browser reports a signature, the webhook
points at a transaction, the sweep finds one by memo — and in all three cases
the server then reads that transaction on chain through the same
`verifyPayment`. That is why adding a public webhook endpoint does not widen the
trust boundary: the chain stays the only authority, and Alchemy merely gets to
say *look now*.

The webhook is HMAC-signed (`ALCHEMY_WEBHOOK_SECRET`) over the RAW body, checked
before the body is parsed. A missing secret CLOSES the endpoint rather than
opening it — an unsigned webhook that credited items would be a public "give me
things" button. `test/webhook.test.ts` pins every refusal.

A dApp **cannot** make Phantom convert SOL or SKR into USDC — that swap is a
manual action inside the wallet. A player holding no USDC is told to swap first,
in those words, rather than handed a button that quietly does nothing.

Three variables switch the rail on, and there is deliberately no default for the
first two (a hardcoded mainnet address in a repo is how a test build takes real
money):

```
USDC_TREASURY_ADDRESS=   # a wallet you control
USDC_MINT=               # mainnet EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
SOLANA_RPC_URL=          # also served to the browser via /api/config
```

Optional, for the webhook path:

```
ALCHEMY_WEBHOOK_SECRET=  # the signing key from Alchemy's dashboard
```

Point the webhook at `POST /api/webhooks/alchemy` and watch the treasury's USDC
token account. Without the secret the endpoint refuses everything, and the other
two paths carry the rail on their own.

Unset, the shop serves carrots only and hides its USDC buttons rather than
offering a payment that cannot complete.

`bun run scripts/smoke-shop.ts` walks the whole thing against a real database —
purchases, refusals, trap placement, and quoting — in-process, so it needs
Postgres and no running server. It covers both configurations; set the three
variables to exercise the money path.

## Traps: the burrow is a board

A trap is placed on your own floor from the burrow screen, which is why that
screen is a map rather than a panel: the question it asks is spatial — *which
approach do I make expensive?* The owner sees their own traps; a raider is sent
none of them, because a visible trap is a wall, and a wall gets routed around
rather than feared.

Three a day are free (`TRAPS.FREE_PER_DAY`), derived from a timestamp on a
rolling window rather than granted at midnight, so nobody is punished for
playing at the wrong hour. Lifting a trap destroys it — otherwise a defender
would re-mine between every raid at no cost, and choosing where to defend would
stop being a commitment.

## Identity: the wallet is the account

The target device is the **Solana Seeker**, where the wallet is the Seed Vault
and signing is a system gesture. There is no email, no password, no recovery
flow — the account IS the keypair.

1. `POST /api/auth/challenge { address }` → a nonce and the exact message to sign
2. the wallet signs it (Seed Vault on device, browser wallet on desktop)
3. `POST /api/auth/verify { address, signature }` → session JWT (cookie + body)

The nonce is single-use and consumed whether or not the signature checks out, so
a captured challenge cannot be replayed. `loginMessage()` is pinned by a test:
changing that string invalidates every challenge in flight and every wrapper
build that hardcodes it.

New players are born with an onboarding shield (`RAID.ONBOARDING_SHIELD_MS`), so
a fresh burrow cannot be farmed on day one — the single biggest churn risk in a
raid game, and one column to avoid it.

---

## Staying up

`rr-ws` died repeatedly in production — Coolify reported **Exited / Restart
limit reached** — and the cause was structural rather than one bad line: nothing
in the server was wrapped in anything.

The chain was always the same. An `async` socket handler throws (Postgres
blinks, Redis drops a connection), and because socket.io never awaits a
handler's promise, that becomes an unhandled rejection. Node's default is to
kill the process. Docker restarts it, the next disconnect does it again, and
after N restarts Docker gives up.

Two things made it severe. It was triggered by **routine** events — `markOffline`
runs on every closed tab, so one bad second from Redis killed the server. And the
work that threw was **optional**: nobody's run should end because a presence set
could not be written.

`server/resilience.ts` encodes the rule that follows: *a failure while handling
one socket must never reach the other players.*

| Tool | Where it is used |
| --- | --- |
| `guard(scope, handler)` | Every socket handler, the eruption timer, the sweep. Logs a throw instead of ending the process. |
| `optional(scope, work)` | Presence and the leaderboard mirror — the writes that are nice to have and not load bearing. |
| `installProcessGuards()` | `uncaughtException` / `unhandledRejection` downgraded to log lines, plus an orderly SIGTERM. |

Downgrading those two process events is normally bad advice, and it is the right
call here: this box holds every live run **in memory**, so crashing on one bad
event throws away dozens of innocent runs to punish one. Full stacks are logged,
so nothing is hidden — it is triaged from logs rather than from an outage.

`/health` deliberately does **not** check Postgres or Redis. A health endpoint
decides whether to RESTART the process, and restarting cannot fix a database
that is down — it would only destroy the live runs and fail again, which is the
exact loop this work exists to end.

`test/resilience.test.ts` pins the containment. The behaviour was also verified
against a running server with `REDIS_URL` pointed at a dead port: 15 authenticated
join/disconnect cycles, junk tokens, and malformed payloads on every event left
uptime climbing uninterrupted, with the Redis failures visible in the log.

## Built to hold a crowd

The MVP runs one WS process, which on 4 vCPUs handles thousands of sockets. The
decisions that matter are the ones that keep it from needing a rewrite later:

- **Regen is derived, never ticked.** Energy, burrow HP and garden yield are
  computed from a timestamp when someone reads them. A per-player cron is
  O(players) every minute forever; a subtraction is O(1) and only runs when a
  player actually shows up.
- **Islands never touch Postgres.** An island lives minutes and is fully
  reconstructible from its seed. Writing 400 tiles per dig would put the
  database on the hot path for nothing. The DB is written at run boundaries.
- **Every broadcast is island-scoped.** There is no global room, so a busy
  server does not fan every dig out to every player.
- **`IslandStore` is an interface.** Today it is a `Map`. The day one process
  stops keeping up, the fix is a second implementation plus the socket.io Redis
  adapter — `server/islands/router.ts` already routes an island id to a shard.
  No call site changes.
- **Redis is a cache, never the record.** The leaderboard sorted set answers
  "top 100" and "my rank" in O(log n), and `rebuildLeaderboard()` restores it
  from Postgres. Losing Redis costs a rebuild, not anyone's progress.

---

## Deployment

Two services on the Coolify instance at `datemeee`, plus Postgres and Redis:

| Service | Image | Port | Notes |
| --- | --- | --- | --- |
| `rr-web` | `Dockerfile` | 3010 | Stateless — scale horizontally at will. |
| `rr-ws` | `Dockerfile.ws` | 3010 | Stateful. **One replica** until sharding lands. |
| `rr-postgres` | `postgres:18-alpine` | 5432 | Own database, `rr_crown`. |
| `rr-redis` | `redis:7-alpine` | 6379 | Leaderboard + presence. |

Both images need `DATABASE_URL` and `JWT_SIGNING_SECRET` (**the same secret** —
the WS server verifies the tokens the web tier issues). The browser needs
`NEXT_PUBLIC_WS_URL` pointing at the WS service's public URL.

Migrations follow the house rule: `bun db:generate` then `bun db:migrate`.
Never `db:push`.

---

## Where things stand

Phases 1-3 of the BUILD-PLAN are scaffolded — solo run, island life cycle, and
the authoritative multiplayer loop. Phases 4-6 have their schema and their
tuning in place but no UI yet. Phase 7 (money, narrative, NFT, Android wrap) is
untouched by design.

Read [BUILD-PLAN.md](./BUILD-PLAN.md) before starting a phase, and put the GDD
at the repo root — it is the tiebreaker for every design question, and it is not
in this repo yet.

---

## Le client natif Android (`android/`)

**Kotlin natif, pas un TWA** — délibérément. Un TWA délègue le rendu à Chrome,
ce qui coûte trois choses dont le jeu ne peut pas se passer :

- dessiner **sous l'encoche** (un TWA laisse une bande noire) ;
- garder le **plein écran immersif** pendant une partie ;
- injecter un **pont JavaScript** vers le Seed Vault et vers FCM.

Ici l'app tient sa propre fenêtre et charge le jeu dans une WebView qu'elle
contrôle. Elle reprend la structure de `seeker-app`, qui a déjà fait ses preuves.

| Fichier | Rôle |
| --- | --- |
| `MainActivity.kt` | La fenêtre : edge-to-edge, encoche, immersif, permission notifs. |
| `WalletBridge.kt` | `window.AndroidWallet` — Mobile Wallet Adapter / Seed Vault. |
| `RoyaleMessagingService.kt` | Réception FCM **application fermée**. |

Côté web, `src/components/native-bridge.ts` présente ce pont sous la même forme
qu'un wallet de navigateur, donc **un seul chemin de code** sert le Seeker et le
bureau : le serveur ne voit aucune différence.

### Les notifications

Elles ne sont pas un bonus : la boucle PvP ne rappelle personne sans elles. Un
raid subi pendant la nuit doit réveiller le joueur, pas l'attendre — d'où FCM
natif plutôt qu'une notification web, qui ne partirait pas application fermée.
Android 13+ exige une demande **à l'exécution** ; la déclaration au manifest ne
suffit pas (leçon déjà payée sur `seeker-app`).

```bash
cd android
RR_GAME_URL=https://…  ./gradlew assembleRelease
```

Il manque `app/google-services.json` (console Firebase) — sans lui, le module
`google-services` fait échouer le build. C'est la seule pièce manquante.
