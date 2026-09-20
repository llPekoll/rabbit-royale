/**
 * Shoved off the shore: the one push that does not end against the coastline.
 *
 * `docs/bumping.md` rule 2 case 2 says a push with nowhere to land simply
 * FAILS — the victim is "braced against the wall" and nobody moves. That is
 * the rule the shoreline runs on today, and it is the reason the edge of the
 * island is the safest place on it: a rabbit with its back to the sea cannot
 * be moved at all. The whole coast, which is where the last carrots are, is
 * where the bumper-car game switches off.
 *
 * So the sea stops being a wall and becomes the hazard it looks like. A push
 * toward open water throws the victim INTO it — `SPLASH_TILES` cells out, the
 * one shove in the game that travels further than a single tile — and the
 * water charges what a bomb charges (`ENERGY.BOMB_LOSS`, one heart) plus the
 * thing a bomb does not take: `DROWN_MS` of being nowhere at all, and the walk
 * back from the middle of the island. The energy is the bomb's price because
 * being thrown in the water is the same size of mistake as digging one —
 * `LIGHTNING.SHOCK_LOSS` already reuses that number for exactly this reason,
 * and a third figure for a third hazard would be a number to learn rather than
 * a rule to read.
 *
 * ## What is being judged
 *
 * The push itself is not the question — `playKnockback` already throws a
 * rabbit and it already reads. Four things are new, and all four fail by
 * DRAWING THE WRONG PICTURE, which is why they are here and not in a test:
 *
 *   - the rabbit has to go IN, not land on. Every knockback in the game ends
 *     with a squash-and-stretch bounce on solid ground; played over water that
 *     bounce says the sea is a floor. The flight has to end by CONTINUING
 *     down, past the surface, which is why this story does not call
 *     `playKnockback` — see `throwIntoSea`.
 *   - the splash has to land on the frame the rabbit breaks the surface. Early
 *     and it is a splash the rabbit then falls into; late and the rabbit sinks
 *     through a flat sea and the water reacts afterwards.
 *   - the sea has to CLOSE over it. A rabbit that fades out while sinking
 *     reads as a despawn; one that is still visible when the splash clears
 *     reads as floating. It goes under, and then there is only water.
 *   - the respawn cannot be a teleport. `DROWN_MS` of empty water is the beat
 *     that says the player lost TIME, and the rabbit has to arrive at the
 *     middle visibly — see `surfaceAt`.
 *
 * ## Why it is on the real island
 *
 * The same reason `FX/Bomb walk` is: the shoreline is generated, the tile a
 * rabbit is thrown off sits on a terrace whose height decides how far it
 * falls, and the sea it lands in is the real animated water. A story that
 * staged this on a flat blue rectangle would be answering an easier question
 * than the one that ships — in particular the fall, which is `tierLift` deep
 * and is the only thing making a shove off a high shelf read differently from
 * a shove off the beach.
 *
 * Nothing here is wired to the server. `push.ts` still refuses this push
 * (`chain-blocked`), and rule 2 case 2 still stands in `docs/bumping.md`. This
 * is the look, first, so the rule can be changed against something seen rather
 * than imagined.
 *
 * `bun run storybook` (port 6007).
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedSprite, Assets, Container, Spritesheet, Texture } from 'pixi.js';
import gsap from 'gsap';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createTerrainBackground } from '@/game/services/TerrainBackground';
import { DepthHole } from '@/game/fx/DepthHole';
import { DEPTH_HOLE_LOOK } from '@/config/depthHoleLook';
import { COLS, ROWS, toColRow, toIndex, tileDepth, tilePos } from '@/config/gridConfig';
import {
  farmableTiles, levelTierAt, spawnTile, terrainNeighbors, tierLift, tileScreenPos,
} from '@/lib/game/terrainBoard';
import { islandCam } from '@/game/scenes/islandCamera';

const WIDTH = 960;
const HEIGHT = 540;
const SEED = 'harbour-9';
const SEA = '#1eaac4';

/**
 * The splash sheet: 1728x192, nine frames of 192.
 *
 * Read off the file rather than declared in `AssetLoader` because this story
 * is the only thing using it so far. When the mechanic ships it belongs beside
 * `EXPLOSION` with the rest of the FX sheets, loaded once at boot — a splash
 * fetched on the frame someone is thrown in is a splash that arrives late.
 */
const SPLASH = { src: '/assets/fx/water-splash.webp', frame: 192, frames: 9 };

/**
 * How long the plume takes, in seconds.
 *
 * Short: the splash is the PUNCTUATION on the entry, not an event of its own.
 * Anything longer and it is still on screen while the rabbit is already gone,
 * which reads as the sea reacting to nothing.
 */
const SPLASH_S = 0.5;

/**
 * Where the splash sorts: over the sea meshes.
 *
 * `createTerrainBackground` lays the water in at z=5000 and its caustics at
 * z=7500, both over the entire board, so anything meant to be read AS
 * happening on the surface has to sit above them — see `playSplash`. The
 * rabbit deliberately does not: sinking BEHIND the water is what makes the sea
 * close over it (see `SINK_Z`).
 */
const SPLASH_Z = 9000;

/**
 * Where the point of impact sits inside a splash frame, as a share of height.
 *
 * Measured off the sheet: the plume's pixels run from about y=58 to y=140 of
 * 192 on the frames that carry the shape. The impact is the MIDDLE of that —
 * this art is a crown of water seen from above, thrown outward in every
 * direction from the thing that fell in, so the hole in the middle of the
 * crown is where the rabbit went through.
 *
 * Anchoring at the art's bottom edge (140) was the previous try and it is
 * wrong for the same reason the frame's bottom edge (192) was: it hangs the
 * whole plume ABOVE the water. Measured on screen, the spray drew from y=270
 * to y=390 while the rabbit broke the surface at y=390 and sank to 416 — every
 * pixel of splash was above the point it was supposed to be marking, so the
 * two never met.
 *
 * `LIGHTNING_FOOT` is the opposite case and worth keeping straight: a bolt is
 * drawn STANDING on the bottom of its cell, so its foot is the frame's foot. A
 * splash is drawn around its own centre.
 */
const SPLASH_WATERLINE = 99 / 192;

/**
 * Where the sinking rabbit sorts: still OVER the water, just under the splash.
 *
 * Sorting it below the sea mesh was tried first, on the theory that the water
 * would then close over it for free. It does not: the mesh at z=5000 is opaque
 * and covers the whole board, so a rabbit under it is not tinted or
 * half-occluded, it is simply gone on that frame — which reads as a despawn,
 * the exact failure the sink exists to avoid. The sea closing over it is the
 * ALPHA fade's job, and the rabbit stays above the water so that fade can be
 * seen happening. Under the splash, though, so the plume covers the moment of
 * entry.
 */
const SINK_Z = SPLASH_Z - 1;

/**
 * How long the sea keeps you, in ms.
 *
 * Long enough that it is a punishment and not a hiccup, short enough that the
 * player is not watching an empty island. Two seconds is also what
 * `LIGHTNING.SHOCK_STUN_MS` holds a struck rabbit for, which is the closest
 * thing the game has to a precedent for "you are out of this for a moment".
 */
const DROWN_MS = 2000;

/**
 * How far out to sea a drowning shove throws you, in cells.
 *
 * TWO, not one, and this is a rule rather than a framing trick. Every other
 * push in the game moves exactly one tile (`docs/bumping.md` rule 1, argued
 * from *Into the Breach* and from the bomb's own knockback), and the reason
 * that number is one is that the victim has to land somewhere they can play
 * from. A shove into the sea has no landing to protect: the tile is water
 * whichever cell it is, so the distance is free to say something instead, and
 * what it says is that this shove is the big one.
 *
 * It also buys the picture. The terrace in front of a shore cell is drawn
 * `tierLift` px tall and overhangs the cell behind it, so a one-cell throw off
 * a 2-tier shelf lands under the shelf's own grass — the take put the splash
 * and the sinking rabbit visibly on the lawn, on a cell the board correctly
 * calls sea. At two the arc clears the overhang and the entry happens where
 * the water is actually DRAWN, which is the only thing an eye can check.
 *
 * Every cell of the run has to be tier 0 (see `shoreline`), so a shove into a
 * narrow inlet is simply not offered rather than throwing someone across it
 * onto the far bank.
 */
const SPLASH_TILES = 2;

/**
 * How much open sea has to lie beyond the landing, in cells.
 *
 * The shove has to point at the HORIZON. An island this shape has inlets and
 * straits, and a cell of water in one is water by every test the board can
 * ask — tier 0, unwalkable, correctly not land — while being, to the eye, a
 * channel with more island on the far side. A rabbit thrown across one is
 * visibly thrown toward the opposite bank, which is the single thing this
 * story must not show.
 *
 * Six cells is past anything the generator makes as an inlet on this seed and
 * short enough to still allow a throw off a headland. It is a filter on the
 * SHOT, not a rule of the mechanic: a shipped version would let you shove
 * someone into a strait quite happily, since they drown there just as well.
 */
const OPEN_SEA_CELLS = 6;

/**
 * How far the sea keeps going from `at`, on the heading `(dc, dr)`.
 *
 * Counts cells, stopping at the first that is not water (off-board counts as
 * water — past the edge of the map is open sea, not a wall). Capped, because
 * the only question being asked is "does this look like the horizon", and
 * beyond a dozen cells the answer cannot change.
 */
function openWater(at: { col: number; row: number }, dc: number, dr: number): number {
  const CAP = 14;
  let n = 0;
  for (let k = 1; k <= CAP; k++) {
    const col = at.col + dc * k;
    const row = at.row + dr * k;
    const off = col < 0 || row < 0 || col >= COLS || row >= ROWS;
    if (!off && levelTierAt(SEED, col, row) !== 0) break;
    n++;
  }
  return n;
}

interface Args {
  /** Seconds the rabbit stands on the shore before it is shoved. */
  beat: number;
  /** Seconds the fall from the shelf into the water takes. */
  fall: number;
  /** How far past the surface the rabbit sinks, in design px. */
  sink: number;
  /** Scale of the splash against a tile. 1 covers one tile's width. */
  splashScale: number;
  /** Milliseconds the rabbit spends under, before the middle of the island. */
  drownMs: number;
  /** Play the splash at all — off, to see what the sea alone reads as. */
  splash: boolean;
  /** Seconds before the whole thing replays. */
  every: number;
}

/**
 * A shore tile, the land cell in front of it, and the water it throws into.
 *
 * Solved off the real board, like `FX/Bomb walk`'s approach: a shore is a
 * playable tile with the pusher standing on a playable neighbour, so the shove
 * direction is a real step — then `SPLASH_TILES` cells of open sea carried on
 * in that same direction, every one of them tier 0. `splashdown` is the last
 * of them, which is where the rabbit actually lands.
 *
 * `beyond` is `push.ts`'s own arithmetic — the cell one step further along
 * `pusher -> victim`. Reproduced here rather than imported because `push.ts`
 * keeps it private, and because what this story needs is the case that
 * function is currently used to REFUSE: the landing that is not on the board's
 * neighbour list.
 *
 * Prefers the shore with the greatest drop, since the height of the shelf is
 * the whole reason this is on real terrain.
 */
function shoreline(): { pusher: number; shore: number; sea: number; splashdown: number } | null {
  const land = new Set(farmableTiles(SEED));
  const beyond = (from: number, through: number): number | null => {
    const a = toColRow(from);
    const b = toColRow(through);
    const col = b.col + (b.col - a.col);
    const row = b.row + (b.row - a.row);
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
    return toIndex(col, row);
  };

  const found: Array<{
    pusher: number; shore: number; sea: number; splashdown: number;
    spread: number; open: number; drop: number;
  }> = [];
  for (const shore of land) {
    for (const pusher of terrainNeighbors(SEED, shore)) {
      if (!land.has(pusher)) continue;
      const sea = beyond(pusher, shore);
      if (sea === null) continue;
      // The landing has to be WATER, and water is tier 0.
      //
      // `!isPlayable` was the first test here and it is wrong: it means "a
      // rabbit cannot stand here", which is equally true of a tree, a rock and
      // a cliff face in the middle of the island. It picked cell (20,20) —
      // tier 3, dry land on every side — and the take threw the rabbit inland
      // onto a tree, splashing on grass. `levelTierAt` is the question that
      // was actually meant: 0 is sea, 1 is sea-level ground (see
      // `terrainBoard.ts`), so only 0 is somewhere you can drown.
      const seaCR = toColRow(sea);
      if (levelTierAt(SEED, seaCR.col, seaCR.row) !== 0) continue;
      // And `SPLASH_TILES` cells of water in that direction, not just one.
      // Keep walking the same direction for `SPLASH_TILES` cells of water.
      //
      // Every one of them has to be tier 0, so the whole arc is over sea and
      // the landing is in open water rather than on the waterline.
      let prev = shore;
      let splashdown = sea;
      let ok = true;
      for (let step = 1; step < SPLASH_TILES; step++) {
        const next = beyond(prev, splashdown);
        if (next === null) { ok = false; break; }
        const nextCR = toColRow(next);
        if (levelTierAt(SEED, nextCR.col, nextCR.row) !== 0) { ok = false; break; }
        prev = splashdown;
        splashdown = next;
      }
      if (!ok) continue;
      const { col, row } = toColRow(shore);
      // How far the throw travels ACROSS the screen, in iso columns.
      //
      // This is the difference between a throw and a rabbit sinking on the
      // spot, and it is invisible on the board: iso projects x as
      // `(col - row) * HALF_W`, so a shove along the col == row diagonal moves
      // the sprite straight DOWN the screen and leaves x untouched. The take
      // picked exactly such a line — (25,17) to (28,20), `col - row` a
      // constant 8 — and the rabbit dropped 63px without shifting a single
      // pixel sideways, which reads as falling through the floor rather than
      // as being thrown anywhere. `FX/Bomb walk` hit the same wall choosing
      // its approach and solved it the same way.
      const sdCR = toColRow(splashdown);
      const spread = Math.abs((sdCR.col - sdCR.row) - (col - row));
      if (spread === 0) continue;
      // And it has to be thrown at the OPEN SEA, not across an inlet.
      //
      // Water under the landing is not enough, and this is the failure that
      // survived both earlier fixes: the take picked a shore whose only water
      // was a three-cell channel with more island directly behind it, so the
      // rabbit flew out over a strait toward the far bank. Every frame of that
      // is technically over sea and all of it reads as being thrown TOWARD
      // land, because that is what is in front of the throw.
      //
      // `openWater` counts how far the sea keeps going on the same heading
      // past the landing. Requiring `OPEN_SEA_CELLS` of it is what makes the
      // shot point at the horizon; on this seed it keeps 159 of the 176
      // otherwise-legal shores, so it costs nothing but the bad ones.
      const open = openWater(sdCR, Math.sign(sdCR.col - col), Math.sign(sdCR.row - row));
      if (open < OPEN_SEA_CELLS) continue;
      found.push({ pusher, shore, sea, splashdown, spread, open, drop: levelTierAt(SEED, col, row) });
    }
  }
  if (!found.length) return null;
  // The tallest shelf on the coast, and among equals the one nearest the
  // middle of the board so the camera has island on both sides of the shot.
  const mid = { col: (COLS - 1) / 2, row: (ROWS - 1) / 2 };
  const fromMid = (t: number) => {
    const c = toColRow(t);
    return Math.abs(c.col - mid.col) + Math.abs(c.row - mid.row);
  };
  // Widest throw across the screen first, then the tallest shelf, then the
  // shore nearest the middle of the board so the camera has island on both
  // sides of the shot. `spread` leads because a throw nobody can see travel is
  // not a throw, however good the drop under it is.
  // Openness first — a throw at the horizon — then how far it travels across
  // the screen, then the tallest shelf, then the shore nearest the middle of
  // the board so the camera has island on both sides of the shot.
  found.sort(
    (a, b) =>
      b.open - a.open ||
      b.spread - a.spread ||
      b.drop - a.drop ||
      fromMid(a.shore) - fromMid(b.shore),
  );
  return found[0];
}

/** The nine splash frames, sliced on first use. */
async function splashTextures(): Promise<Texture[]> {
  const tex = await Assets.load<Texture>(SPLASH.src);
  const frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {};
  for (let i = 0; i < SPLASH.frames; i++) {
    frames[`splash-${i}`] = {
      frame: { x: i * SPLASH.frame, y: 0, w: SPLASH.frame, h: SPLASH.frame },
    };
  }
  const sheet = new Spritesheet(tex, { frames, meta: { scale: 1 } });
  await sheet.parse();
  return Array.from({ length: SPLASH.frames }, (_, i) => sheet.textures[`splash-${i}`]).filter(Boolean);
}

function Scene(args: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={() => loadAllAssets()}
      setup={(stage, app) => {
        initTileTextures(app.renderer);

        const cleanups: Array<() => void> = [];
        let gone = false;
        cleanups.push(() => { gone = true; });

        const world = new Container();
        world.sortableChildren = true;
        stage.addChild(world);
        cleanups.push(() => world.destroy({ children: true }));

        const coast = shoreline();
        if (!coast) return () => cleanups.forEach((fn) => fn());
        const { pusher, shore, splashdown } = coast;
        const home = spawnTile(SEED);

        const timers = new Set<number>();
        const after = (ms: number, fn: () => void) => {
          const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms);
          timers.add(t);
        };
        cleanups.push(() => { for (const t of timers) window.clearTimeout(t); });

        // Framed on the SHORE rather than on the whole island: the shot is the
        // hand-off between a tile and the water beside it, and an island-wide
        // camera makes a 192px splash four pixels tall.
        const cam = islandCam(SEED, WIDTH, HEIGHT, tileScreenPos(SEED, shore));
        world.scale.set(cam.scale);
        world.position.set(cam.x, cam.y);

        let victim: PlayerRabbit | null = null;
        let bully: PlayerRabbit | null = null;
        let splashes: Texture[] = [];

        const hole = new DepthHole(DEPTH_HOLE_LOOK);
        cleanups.push(() => hole.destroy());

        /**
         * Where a sea cell sits on screen.
         *
         * `tileScreenPos` asks the terrain for a lift, and a sea cell has none
         * — level 0, no ramp — so it answers the flat projection, which is
         * exactly right: the water IS the zero plane everything else is lifted
         * off. Written out rather than called so that is on the record, since
         * "the function happens to do the right thing here" is the kind of
         * thing that gets refactored away.
         */
        const seaPos = (index: number) => tilePos(index);

        /**
         * The splash, on the frame the rabbit breaks the surface.
         *
         * Anchored at its FOOT, like `LIGHTNING_FOOT`: the art draws water
         * thrown upward from a flat surface, so the bottom of the sprite is
         * the waterline. Anchored centrally the whole plume sits half a tile
         * low and the rabbit enters the sea above its own splash.
         */
        const playSplash = (at: { x: number; y: number }) => {
          if (!args.splash || !splashes.length) return;
          const anim = new AnimatedSprite(splashes);
          // Anchored on the ART, not on the frame.
          //
          // `(0.5, 1)` — the `LIGHTNING_FOOT` reflex — is wrong for this
          // sheet. The bolt is drawn standing on the bottom edge of its cell,
          // so its foot IS the frame's foot; the splash is drawn CENTRED in a
          // 192px cell, its pixels spanning roughly y=58..140 on the big
          // frames. Anchoring at the frame's bottom therefore hung the plume a
          // full 52px — more than a tile — above the water, which on screen
          // read as a splash going off in the grass behind the shore.
          //
          // `SPLASH_WATERLINE` is where the art's own surface sits inside the
          // cell, measured off the sheet.
          anim.anchor.set(0.5, SPLASH_WATERLINE);
          anim.position.set(at.x, at.y);
          // ABOVE THE WATER, which is not the same as above the sea cells.
          //
          // The first version sorted this the way anything standing on the
          // board is sorted (`tileDepth(sea) * 16 + 8`, about 744 here) on the
          // assumption that the sea is the bottom of the world. It is not:
          // `createTerrainBackground` puts the water and its caustics in as
          // meshes at z=5000 and z=7500, over the whole board, and the splash
          // was drawn underneath both — present, on screen, measurably 240px
          // wide, and completely invisible. A plume displaced by something
          // hitting the surface belongs on top of that surface.
          anim.zIndex = SPLASH_Z;
          // Sized against the tile rather than left at 192px: one splash is
          // one cell of water being displaced by one rabbit.
          const scale = (44 / SPLASH.frame) * args.splashScale * 4;
          anim.scale.set(scale);
          world.addChild(anim);
          // Driven off a REAL clock, not off `animationSpeed`.
          //
          // `animationSpeed` is frames per ticker tick, which is a duration
          // only if the ticker holds 60fps — and under software GL it does
          // not. Measured in a headless browser the splash ran for three
          // seconds and was still going during the respawn, which reads as the
          // sea boiling rather than as something entering it. Stepping the
          // frame from a gsap tween makes `SPLASH_S` mean seconds on every
          // machine, which is the only way this is tunable by eye.
          const clock = { f: 0 };
          gsap.to(clock, {
            f: SPLASH.frames - 1,
            duration: SPLASH_S,
            ease: 'none',
            onUpdate: () => { anim.currentFrame = Math.round(clock.f); },
            onComplete: () => anim.destroy(),
          });
        };

        /**
         * The throw that ends IN the water.
         *
         * Deliberately not `playKnockback`. That one is the game's own shove
         * and it is right everywhere else: it arcs across, tumbles, and lands
         * with a squash-and-stretch bounce. The bounce is the problem — it is
         * what says "this is ground" — and there is no argument to turn it
         * off, so the flight is rebuilt here with the ending swapped.
         *
         * Everything before the surface is the same shape as the original: a
         * horizontal track at a constant rate, a vertical one that goes up and
         * comes down heavier, and a backwards tumble around the body. What
         * changes is that the vertical track does not stop at the landing —
         * it carries `sink` pixels past it, the rabbit fades as the water
         * closes, and the splash fires at the crossing rather than at the end.
         */
        const throwIntoSea = (r: PlayerRabbit, from: number, to: number, done: () => void) => {
          const b = seaPos(to);
          const c = r.container;
          r.cancelMove();
          gsap.killTweensOf(c);
          // Start from the shore tile, set AFTER the tweens are killed.
          //
          // `run` already calls `setPosition(shore)`, and that was not enough:
          // the previous take's `surfaceAt` rise is still tweening the
          // container's y when the new take begins, so it overwrites the
          // position a moment later and the throw sets off from the middle of
          // the island. Killing the tweens first and placing the rabbit after
          // is what makes every take start on the shore instead of only the
          // first — the same ordering bug, and the same fix, as the alpha
          // reset below.
          r.setPosition(from);
          const a = tileScreenPos(SEED, from);
          // Reset the look AFTER killing the tweens, not before.
          //
          // `run` sets these too, but a take started while the previous one is
          // still in the air (the `__TAKE__` hook does exactly that) has its
          // fade killed mid-tween by the line above, which leaves the rabbit
          // stuck at whatever alpha it had reached. Restoring here, once
          // nothing is animating the container any more, is what makes the
          // flight visible on every take rather than only the first.
          c.visible = true;
          c.alpha = 1;
          r.playDamage();
          // IN THE AIR, over the sea: the flight has to be seen.
          //
          // Sorted by tile depth (what everything standing on the board uses)
          // the rabbit goes under the water mesh the moment it leaves the
          // shore, and the whole throw plays invisibly — which is what the
          // first take did. It drops below the surface at the crossing, not
          // before: see `SINK_Z` on the timeline.
          c.zIndex = SPLASH_Z + 1;

          // The apex, scaled to how far the throw actually travels.
          //
          // A flat 30px was calibrated against a one-tile shove and reads as a
          // lob; kept at `SPLASH_TILES: 2` the same arc spread over twice the
          // ground turns into a skim, with the rabbit crossing the water
          // almost level and the height only visible as a wobble. Tying it to
          // the horizontal distance keeps the same throw SHAPE whatever the
          // distance is, which is what makes a longer shove read as harder
          // rather than as flatter.
          const span = Math.hypot(b.x - a.x, b.y - a.y);
          const up = Math.min(a.y, b.y) - (24 + span * 0.22);
          const tl = gsap.timeline({
            onComplete: () => {
              // Under, and gone. The sea has closed; only the drift is left.
              c.visible = false;
              done();
            },
          });
          tl.to(c, { x: b.x, duration: args.fall, ease: 'none' }, 0);
          tl.to(c, { y: up, duration: args.fall * 0.35, ease: 'power2.out' }, 0);
          // Down to the waterline...
          tl.to(c, { y: b.y, duration: args.fall * 0.65, ease: 'power2.in' }, args.fall * 0.35);
          // ...and THROUGH it, without a bounce. This is the whole difference
          // between being thrown onto something and being thrown into it.
          tl.to(c, { y: b.y + args.sink, duration: 0.5, ease: 'power1.in' }, args.fall);
          // Behind the plume on the frame it breaks the surface, and fading.
          //
          // The fade is what the sea closing over it looks like; `SINK_Z` only
          // puts the rabbit behind the splash, so the plume covers the moment
          // of entry rather than the rabbit being visible through it. It
          // deliberately does NOT go under the water mesh — see `SINK_Z`.
          tl.call(() => { c.zIndex = SINK_Z; }, undefined, args.fall);
          tl.to(c, { alpha: 0, duration: 0.42, ease: 'power2.in' }, args.fall + 0.12);
          // The tumble, over the airborne part only: a rabbit still spinning
          // underwater reads as a physics object rather than an animal.
          //
          // A WHOLE number of turns, so it enters the water upright. 1.5π was
          // a quarter turn short and left the rabbit going in side-on, which
          // in the water reads as a corpse floating rather than as an animal
          // falling — and at `SPLASH_TILES: 2` there is enough airtime for the
          // eye to see which it is.
          tl.to(c.children[0] ?? c, { rotation: Math.PI * 2, duration: args.fall, ease: 'power1.out' }, 0);
          // The splash on the frame it breaks the surface, not before.
          tl.call(() => playSplash(b), undefined, args.fall);
        };

        /**
         * Back in the middle of the island, visibly.
         *
         * A rabbit that simply reappears at `spawnTile` has not come back from
         * anywhere — the `drownMs` of empty water reads as a stutter rather
         * than as a cost. So it rises: it is placed on the middle tile already
         * sunk into the ground and fades up as it lifts the last few pixels,
         * which is the cheapest read for "this one was somewhere else and is
         * now here" that does not need its own art.
         */
        const surfaceAt = (r: PlayerRabbit, tile: number) => {
          r.setPosition(tile);
          const c = r.container;
          const { x, y } = tileScreenPos(SEED, tile);
          c.visible = true;
          c.alpha = 0;
          // Back onto the board's own sorting, off the water's.
          //
          // The flight runs above the sea mesh and the sink runs below it
          // (`SPLASH_Z` / `SINK_Z`); a rabbit that kept either would surface in
          // the middle of the island either floating over the terrain or
          // drowned in dry grass.
          c.zIndex = tileDepth(tile) * 16 + 8;
          c.position.set(x, y + 14);
          const child = c.children[0];
          if (child) child.rotation = 0;
          gsap.to(c, { y, duration: 0.45, ease: 'back.out(1.6)' });
          gsap.to(c, { alpha: 1, duration: 0.3, ease: 'power1.out' });
        };

        /** One full take: the shove, the water, the wait, the walk back. */
        const run = () => {
          if (gone || !victim || !bully) return;
          const v = victim;
          const b = bully;
          v.cancelMove();
          b.cancelMove();
          gsap.killTweensOf(v.container);
          gsap.killTweensOf(b.container);
          const child = v.container.children[0];
          if (child) child.rotation = 0;
          v.container.visible = true;
          v.container.alpha = 1;
          v.setPosition(shore);
          b.setPosition(pusher);

          after(args.beat * 1000, () => {
            if (gone) return;
            // The bully takes the shore tile, which is the push: rule 1 says
            // the pusher ends up where the victim was standing.
            b.moveTo(shore);
            throwIntoSea(v, shore, splashdown, () => {
              after(args.drownMs, () => {
                if (gone) return;
                surfaceAt(v, home);
              });
            });
          });
        };

        void createTerrainBackground(world, SEED, { decoScale: 0.4 }).then((bg) => {
          if (gone) { bg.destroy(); return; }
          cleanups.push(() => bg.destroy());

          const ticker = (t: { deltaMS: number }) => {
            bg.update(t.deltaMS);
            if (victim && victim.container.visible) {
              hole.update(world, victim.container.zIndex, DepthHole.centreOf(victim), app.renderer);
            } else {
              hole.clear();
            }
          };
          app.ticker.add(ticker);
          cleanups.push(() => app.ticker.remove(ticker));

          // Dug ground around the shore: this is contested coast, which is the
          // only reason two rabbits are standing on it in the first place.
          const s = toColRow(shore);
          for (const i of farmableTiles(SEED)) {
            const { col, row } = toColRow(i);
            const tile = new Tile(i, undefined, tierLift(SEED, i), levelTierAt(SEED, col, row));
            world.addChild(tile.container);
            tile.mountVeil((veil) => bg.mountVeil(i, veil));
            const dist = Math.max(Math.abs(col - s.col), Math.abs(row - s.row));
            if (dist <= 2) tile.revealContent('empty', dist === 1 ? 1 : 0, false);
          }

          victim = new PlayerRabbit(shore, undefined, SEED);
          world.addChild(victim.container);
          cleanups.push(() => victim?.destroy());
          bully = new PlayerRabbit(pusher, undefined, SEED);
          world.addChild(bully.container);
          cleanups.push(() => bully?.destroy());

          void splashTextures().then((tex) => { if (!gone) splashes = tex; });

          // Replayable on demand as well as on the loop: the take is over in
          // about four seconds and a screenshot at a wall-clock delay lands
          // between runs more often than on the splash.
          (globalThis as { __TAKE__?: () => void }).__TAKE__ = run;
          cleanups.push(() => { delete (globalThis as { __TAKE__?: () => void }).__TAKE__; });

          run();
          const loop = window.setInterval(run, args.every * 1000);
          cleanups.push(() => window.clearInterval(loop));
        });

        return () => cleanups.forEach((fn) => fn());
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'FX/Drowning',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    beat: 0.8,
    // A little longer than the one-tile shove it started as: at `SPLASH_TILES:
    // 2` the rabbit covers twice the ground, and holding 0.5s there fires it
    // across the water flat and fast, like a skipped stone rather than a
    // thrown animal.
    fall: 0.62,
    sink: 26,
    // 1 sizes the plume to about one tile and was small enough to be missed
    // entirely against open water; 1.6 read at a glance but was a depth charge
    // rather than a rabbit. 1.25 is the middle: still clearly bigger than the
    // animal that made it, which is what a body hitting water looks like, but
    // no longer the biggest thing in the frame.
    splashScale: 1.25,
    drownMs: DROWN_MS,
    splash: true,
    // The whole take: the beat, the fall, the sink, `drownMs` under, the rise,
    // and a breath before it replays. A loop shorter than its own take
    // restarts over the ending it is meant to show.
    every: 7,
  },
  argTypes: {
    beat: { control: { type: 'range', min: 0.2, max: 2, step: 0.1 } },
    fall: { control: { type: 'range', min: 0.2, max: 1.2, step: 0.05 } },
    sink: { control: { type: 'range', min: 0, max: 60, step: 2 } },
    splashScale: { control: { type: 'range', min: 0.3, max: 3, step: 0.1 } },
    drownMs: { control: { type: 'range', min: 500, max: 5000, step: 100 } },
    every: { control: { type: 'range', min: 4, max: 20, step: 0.5 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** The shove off the shore, as it should play. */
export const Default: Story = {};

/**
 * No splash: the rabbit enters a sea that does not react.
 *
 * Kept because it is the tempting simplification — the water is already
 * animated, so why add a plume — and it is what shows the splash is doing the
 * work. Without it the rabbit sinks through a flat surface and the moment of
 * entry has no frame of its own.
 */
export const NoSplash: Story = { args: { splash: false } };

/**
 * The rabbit stops dead at the waterline: no sink.
 *
 * What the take looks like if the flight simply ends where a knockback's
 * would. The sea reads as a floor the rabbit is lying on, which is exactly the
 * failure `throwIntoSea` exists to avoid.
 */
export const NoSink: Story = { args: { sink: 0 } };

/**
 * Half a second under instead of two.
 *
 * The punishment stops being one. Useful for finding the floor: somewhere
 * between this and `Default` the wait turns from a stutter into a cost, and
 * that boundary is what `DROWN_MS` should sit above.
 */
export const ShortDrown: Story = { args: { drownMs: 500, every: 5 } };

/**
 * A long drop, slowed right down.
 *
 * The fall is the part that differs between a shove off the beach and a shove
 * off a high shelf; slowing it is the only way to see whether the arc still
 * reads at the top of the coast.
 */
export const SlowFall: Story = { args: { fall: 1.1, beat: 1.2, every: 9 } };

/** The plume pushed large, to find the ceiling against one tile of water. */
export const BigSplash: Story = { args: { splashScale: 2 } };
