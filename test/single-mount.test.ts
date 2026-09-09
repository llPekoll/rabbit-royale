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
    expect(PAGE).toMatch(/handles\.current\?\.show\(/);
  });

  it('rebuilds the app only for a new island, never for a crossing', () => {
    expect(CANVAS).toMatch(/\}, \[seed, playerId\]\);/);
  });

  it('does not wait for the game server before mounting', () => {
    // Gating the canvas on the island's seed deadlocked the boot: nothing asks
    // the server for an island until the scene exists, and the scene was
    // waiting for the island.
    expect(PAGE).toMatch(/game\.islandSeed \?\? player\.id/);
  });
});

describe('the backdrop covers the frame', () => {
  const BG = read('../src/game/services/IslandBackground.ts');
  const SCENE = read('../src/game/scenes/IslandScene.ts');

  it('measures the renderer, not the window', () => {
    // The season board takes 330px of the page on a wide screen, so
    // `innerWidth` overstates the canvas and the ground came out sized for a
    // box it does not occupy.
    expect(SCENE).toMatch(/this\.app\.renderer\.width/);
    expect(BG).toMatch(/viewport\(\)/);
  });

  it('covers the letterbox, not just the design box', () => {
    // The design space is scaled to FIT, so a canvas that is not 16:9 leaves
    // bare space — it showed as a flat blue band under the island.
    expect(BG).toMatch(/rootScale/);
    expect(BG).toMatch(/needH/);
  });

  it('re-lays-out when the canvas changes size on its own', () => {
    // The board mounting beside the canvas resizes it WITHOUT a window resize.
    expect(SCENE).toMatch(/lastW/);
    expect(SCENE).toMatch(/addEventListener\('resize'/);
  });
});
