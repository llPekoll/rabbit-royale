---
name: verify
description: How to run and drive Rabbit Royale for a runtime check — servers, a throwaway guest, the burrow and island surfaces, Playwright probes that read the live Pixi stage.
---

# Verifying a change in the running game

## Servers (both must be up)

```bash
bun dev   # web, http://localhost:3010  (port 3010; the game is at `/`, not `/play`)
bun ws    # game server, port from WS_PORT in .env (3011 locally)
```

Postgres and Redis must be reachable (`DATABASE_URL`, `REDIS_URL` in `.env`).
`curl localhost:3011/health` → 200 says the ws is up. If `bun ws` fails at
`listen`, an older `bun ws:dev` is still holding the port: `Get-Process bun`
and stop the stale ones, never `next dev` (its own `node` holds 3010).

Migrations: `bun db:check` must say all applied, or `/api/burrow` 500s.

## Driving it with Playwright (installed, Chromium present)

`tools/verify-loop-bar.mjs` and `tools/verify-hint-lift.mjs` are working
drives; copy their shape. Key facts:

- A fresh guest: click `button:has-text("Play as a guest")`. A guest with
  zero runs is crossed to the FIRST island automatically; wait for `.rr-hud`.
  The HUD mounts before the board boots — do not trust a fixed delay, poll the
  stage instead (below).
- Home: `.rr-overlay button:has-text("Home")`. Banks the run, so the next
  join is a normal island. The burrow shows `.rr-loop-bar` with slabs
  `.rr-loop-dig / .rr-loop-home / .rr-loop-raid`; the top bar has
  `[aria-label="Shop"]` and `[aria-label="Story"]`.
- Energy: a guest starts at 60, each crossing costs 25 → the third DIG opens
  the "Out of energy" dialog (`[aria-label="Out of energy"]`).
- The Pixi app is exposed as `globalThis.__PIXI_APP__`. Fog sprites are
  labelled `tile-<index>` and live INSIDE the terrain block, not the tile's
  container — match hints/rabbits to tiles by `getGlobalPosition()`, not by
  parent. Page coords = canvas rect + global × (rect / canvas size).
- Arrow keys do not move the rabbit under Playwright; click a lit ring tile
  (a visible sibling Sprite with tint `0xffd700` marks a reachable tile).
- Expect one console error on load (a 401 from an auth probe) and WebGL
  driver warnings; both are noise.

## Portrait

Viewport 390×844 stacks the loop bar into three rows; the sound cluster
must sit above it (`body:has(.rr-loop-bar) .rr-sound` in the portrait
media block).
