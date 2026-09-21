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
  zero runs is crossed to the FIRST island automatically. `.rr-hud` is an
  EMPTY header now (the gauge moved onto the carrot pill), so Playwright
  reports it hidden — wait for `.rr-back-btn` or poll the stage (below).
- Home is the shared exit slab `.rr-back-btn`, bottom centre. It is HIDDEN on
  the first island until the bomb lesson is done (`game.taughtBomb`), so a
  drive that only needs the burrow should not cross at all:
  `node tools/verify-ios-burrow.mjs` makes a guest, marks it `runs_played = 1`
  in the local db, restarts `bun ws` (which holds the run's seat in memory)
  and reopens it — straight to the burrow. Banking a run does the same
  (`.rr-back-btn`), so the next join is a normal island. The burrow shows
  `.rr-loop-bar` with slabs `.rr-loop-dig / .rr-loop-home / .rr-loop-raid`;
  the top bar has `[aria-label="Shop"]` and `[aria-label="Story"]`.
- Energy: a guest starts at 60, each crossing costs 20 (`ENERGY.RUN_COST`) →
  the fourth DIG opens the "Out of energy" dialog
  (`[aria-label="Out of energy"]`). Inside a run the HUD shows a yellow
  energy BAR (`.rr-energy`, value in `.rr-energy-value`), not hearts: 100 to
  start, a dig costs 1, a bomb 30, a right red X gives 8 back, a wrong one
  costs 15. Re-treading dug tiles is free. The X button is `.rr-mark-btn`
  (bottom right, labelled; `aria-pressed` while armed). The ring is always
  gold while moving; ONLY armed does it turn red (tint `0xff5a4a`), on what
  can be marked. `tools/verify-red-x.mjs` drives the whole path.
- The Pixi app is exposed as `globalThis.__PIXI_APP__`. Fog sprites are
  labelled `tile-<index>` and live INSIDE the terrain block, not the tile's
  container — match hints/rabbits to tiles by `getGlobalPosition()`, not by
  parent. Page coords = canvas rect + global × (rect / canvas size).
- Arrow keys do not move the rabbit under Playwright; click a lit ring tile
  (a visible sibling Sprite with tint `0xffd700` marks a reachable tile).
- Expect one console error on load (a 401 from an auth probe) and WebGL
  driver warnings; both are noise.

## Phones are landscape

A touch phone held upright gets the rotate gate, not a layout
(`PORTRAIT_GATE_QUERY`, `src/config/orientation.ts`). Check phones at the
Seeker's **890×400** with `isMobile: true, hasTouch: true` — without them
Chromium reports a fine pointer and the gate never applies. Use `page.tap`.

The portrait media blocks in globals.css still serve a desktop window
dragged tall and narrow (no gate there); 390×844 WITHOUT touch emulation is
that case, not a phone.

## iPhone under Safari's bar

Safari's landscape toolbar takes ~70px and nothing on the page can hide it:
an iPhone 15 is 852×393 and the game gets **852×320**. That is the shortest
screen the game meets, so it is where the top bar, the column and the slabs
break first. The side notch reports ~59px of `safe-area-inset-left/right`;
Chromium emulates it through CDP (`tools/verify-ios-burrow.mjs` with
`SAFE=59`), and it must NOT move the layout — only the top and bottom insets
are honoured (globals.css `body` padding).
