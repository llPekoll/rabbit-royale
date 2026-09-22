/**
 * One Pixi application, both scenes resident, no route between them.
 *
 * Crossing between the burrow and the island used to be a route change, so each
 * crossing built a fresh Pixi app: every texture re-decoded, the WebGL context
 * dropped, a visible stall on a move a player makes constantly. The cost is now
 * paid once behind the loading screen. That is easy to undo by accident — a
 * `router.push` looks perfectly reasonable — so it is pinned here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PAGE = read('../src/app/page.tsx');
const CANVAS = read('../src/components/game-canvas.tsx');
const MANAGER = read('../src/game/SceneManager.ts');
const BOOT = read('../src/game/scenes/BootScene.ts');
const SCENE_ISLAND = read('../src/game/scenes/IslandScene.ts');

describe('one mount', () => {
  it('boots both scenes together', () => {
    // Both, in the boot, behind the loading screen the player already watches.
    expect(BOOT).toMatch(/resident_add\([^)]*BurrowScene/);
    expect(BOOT).toMatch(/resident_add\([^)]*IslandScene/);
  });

  it('keeps resident scenes alive across a swap', () => {
    // `show` must not tear anything down — that is the whole point.
    const show = MANAGER.slice(MANAGER.indexOf('show(key: string)'));
    const body = show.slice(0, show.indexOf('\n  }'));
    expect(body).not.toMatch(/\.destroy\(/);
    expect(body).toMatch(/visible = k === key/);
  });

  it('ticks only the visible scene', () => {
    // An off-screen scene running its clouds and tweens is work nobody sees.
    const show = MANAGER.slice(MANAGER.indexOf('show(key: string)'));
    expect(show.slice(0, 900)).toMatch(/ticker\.remove/);
  });

  it('crosses without navigating', () => {
    // A router push here would rebuild the app and undo everything above.
    expect(PAGE).not.toMatch(/router\.push/);
    // The crossing goes through the resident scenes, not the router. It used to
    // be a bare `show()`; the iris wipe wraps that, and `wipeTo` still ends in
    // the same swap — what matters is that neither one navigates.
    expect(PAGE).toMatch(/\.(show|wipeTo)\(/);
  });

  it('never rebuilds the app for a new island', () => {
    // Changing island re-cuts the coastline on the LIVE scene. Remounting for
    // it raced the socket and lost — the rebuilt scene missed the snapshot.
    expect(CANVAS).toMatch(/\}, \[playerId\]\);/);
    expect(SCENE_ISLAND).toMatch(/setIsland\(/);
  });

  it('does not wait for the game server before mounting', () => {
    // Gating the canvas on the island's seed deadlocked the boot: nothing asks
    // the server for an island until the scene exists, and the scene was
    // waiting for the island. What matters is the FALLBACK, not which seed it
    // is — see the next test for that half.
    expect(PAGE).toMatch(/seed=\{game\.islandSeed \?\?/);
  });

  it('falls back to a first-SIZED island for a first-timer', () => {
    // The fallback used to be a bare `player.id`, which cuts an ordinary
    // ~500-tile island. Harmless while the first screen was the burrow; once
    // the first-timer started opening ON the island, they were shown a
    // full-size island until the server answered and then it was re-cut under
    // them into the small tutorial one — a place that visibly changed size on
    // the first screen of the game.
    expect(PAGE).toMatch(/firstTimer \? firstIslandSeed\(player\.id\) : player\.id/);
  });
});

describe('the backdrop covers the frame', () => {
  const SCENE = read('../src/game/scenes/IslandScene.ts');

  it('measures the renderer, not the window', () => {
    // The season board takes 330px of the page on a wide screen, so
    // `innerWidth` overstates the canvas and the ground came out sized for a
    // box it does not occupy.
    expect(SCENE).toMatch(/this\.app\.renderer\.width/);
  });

  /**
   * The two `IslandBackground` checks that stood here are gone with it.
   *
   * They pinned a PAINTING to the frame — that it measured the renderer's own
   * viewport, and that it scaled past the letterbox so no flat blue band
   * showed under the island. There is no painting any more: the ground is
   * generated cell by cell and pinned to the board's grid
   * (`TerrainBackground`), so covering the frame is not a thing it can get
   * wrong in that way.
   *
   * Worth knowing they did not fail when the file went — `read` throws, so
   * the whole describe was skipped and the suite quietly lost eleven tests.
   */

  it('re-lays-out when the canvas changes size on its own', () => {
    // The board mounting beside the canvas resizes it WITHOUT a window resize.
    expect(SCENE).toMatch(/lastW/);
    expect(SCENE).toMatch(/addEventListener\('resize'/);
  });

  it('takes the boot off the stage when a resident scene is shown', () => {
    // The boot's loading bar is a Graphics at the centre of the design canvas.
    // Left on the root under the boards, it showed through wherever the
    // terrain left that spot bare — a yellow bar in the sea.
    const show = MANAGER.slice(MANAGER.indexOf('show(key: string)'));
    const body = show.slice(0, show.indexOf('\n  }'));
    expect(body).toMatch(/this\.retireTransient\(\)/);
    const retire = MANAGER.slice(MANAGER.indexOf('private retireTransient()'));
    // ...and only a scene that is NOT resident.
    expect(retire).toMatch(/\[\.\.\.this\.resident\.values\(\)\]\.includes\(gone\)\) return/);
    expect(retire).toMatch(/gone\.destroy\(\)/);
  });
});
