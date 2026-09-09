# Rabbit Royale: The Cursed Crown

Competitive minesweeper. A rabbit walks an isometric island tile by tile, digs
for carrots, reads the numbers to avoid bombs, and banks what it survives with.
On top of the run sits a persistent layer: a raidable burrow, a season score,
and a crown worth stealing.

Free-to-play, **non-gambling**. There is no wager, no balance and no token in
this repo — see [BUILD-PLAN.md](./BUILD-PLAN.md) phase 7 for what is deliberately
kept for later.

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
| `src/game/island/` | Square-tile islands with stacked plateaus, from the Tiny Swords sheets. Groundwork for a future game, not used by the run. [Its own README](./src/game/island/README.md); look at one at `/island`. |

### Tuning

Every playtestable number lives in `config/tuning.ts` and nowhere else. If you
are about to type a number into game code, it belongs there. The tests assert
*behaviour* (walking is free, bombs throw you back) rather than literals, so
retuning during a playtest never turns the suite red for no reason.

---

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
