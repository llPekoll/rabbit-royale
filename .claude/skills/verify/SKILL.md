---
name: verify
description: How to run and drive Rabbit Royale (Godot client) for a runtime check — the local game server, a throwaway guest, desktop screenshots, the dialog benches, and the Seeker over adb.
---

# Verifying a change in the running game

The only client is **Godot** (`godot/`), on the Seeker (Android), on the web
(`rabbit.rip/play`, Godot's web export) and on desktop. The old Pixi/React web
client is archived: no `bun dev`, no Playwright, no `__PIXI_APP__`.

## Game server (rr-ws)

```bash
bun ws        # server/index.ts, port WS_PORT from .env (3011 locally)
curl localhost:3011/health   # 200 = up
bun run db:check             # must say all migrations applied, or routes 500
```

All `/api/*` routes live in rr-ws (`server/api-router.ts`) — a new route file
under `src/app/api` must be added to its `ROUTES` table. Nothing hot-reloads:
restart `bun ws` after touching `src/lib`, `src/app/api`, `config/` or
`server/`. Load `.env` for scripts and tests (`set -a; . ./.env; set +a`).
DB integration tests run with `RR_AUTH_DB_TEST=1 bunx vitest run`.

## Godot on the desktop

```bash
G=/Applications/Godot.app/Contents/MacOS/Godot
$G --path godot -- --server=http://localhost:3011 --doorstep --size=1335x600 --shot=out.png --after=6
```

- `--server=` points at a local rr-ws (otherwise the region picker hits prod).
- `--token=<jwt>` plays as that account without touching the stored session;
  mint one with `curl -X POST localhost:3011/api/auth/guest`. To skip the
  tutorial: `update players set runs_played=5 where id='<id>'`.
- `--doorstep` shows the title screen as a newcomer sees it; `--guest`
  presses the guest door by itself.
- `--shot=<png> --after=<s>` saves a frame and quits (DevShot);
  `--size=1335x600` ≈ the Seeker's landscape ratio. Around 10 s you can land
  on a white fade: prefer 6 or 14.
- A NEW `class_name` is unknown until the class cache is rebuilt:
  `$G --headless --path godot --import`, or the scene fails with
  "Identifier not declared".
- macOS has no `timeout`: a command prefixed with it never runs.

## Benches (no account, no network)

`godot/scenes/bench/*.tscn` show one surface with fake data, e.g.

```bash
$G --path godot scenes/bench/dialogs_bench.tscn -- --only=profile --size=1335x600 --shot=p.png --after=1.5
```

`dialogs_bench --only=` takes season, profile (`--account` for a Google
account), history, settings, lang, codex, pass, snack, email, email-code.
Others: shop_bench, skin_bench, raid_bench, defend_bench, revenge_bench,
reveal_bench… Benches are silent (no audio host).

## The Seeker (adb)

```bash
adb devices -l                                   # SM02E…  model:Seeker
adb install -r dist/rabbit-royale-<v>-<code>.apk # same key = data kept
adb shell monkey -p rip.rabbit.royale -c android.intent.category.LAUNCHER 1
adb logcat -d | grep -E '\[boot\]|SCRIPT ERROR'  # godot prints under tag "godot"
adb exec-out screencap -p > shot.png
```

- **Screen off or locked = the app pauses before Godot's first frame**: no
  log at all. Wake it (`adb shell input keyevent KEYCODE_WAKEUP`) and ask the
  user to unlock — the PIN cannot be entered for them.
- The APK is a shell: the game arrives as a `.pck` from
  `rabbit.rip/play/android/manifest.json` (`godot/scripts/boot.gd`). `[boot]`
  lines show the pack loaded, downloaded, or rejected. A game change reaches
  the phone by pushing `main`; a new APK only when project.godot, a plugin,
  the engine or boot.gd change (`tools/release-dappstore.sh`).
- Taps: `adb shell input tap X Y` in physical pixels (2670×1200 landscape).

## Phones are landscape

The Seeker is 2670×1200 physical, ~890×400 logical: the title column and
dialogs must fit 400 px of height. Check new UI there first.
