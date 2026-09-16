/**
 * BOMBS SURVIVE A CHANGE OF SCREEN — the ones on the board, not just the ones
 * in the database.
 *
 * Reported from production on 16 September 2026: bombs buried in DEFEND are
 * gone when the player leaves the mode and comes back, both on the board and
 * in the menu behind it. Nothing was ever lost — `api/traps` keeps them as
 * rows and the panel went on counting "3 bombs live" correctly off that list,
 * which is what made the report so precise: the COUNT was right and the GROUND
 * was bare, so the two halves of the same screen disagreed.
 *
 * The cause was one teardown missing its bookkeeping, on both sides of the
 * wire between React and Pixi:
 *
 *   - Every trap sprite is mounted INSIDE its cell's terrain block, so
 *     `showGround` destroying the terrain destroys the markers with it. But
 *     `trapSprites` went on holding the dead containers, and `addTrap` opens
 *     with a `trapSprites.has(tile)` guard — so every attempt to draw them
 *     again was refused as already-drawn.
 *   - The page caches what it last pushed in a `drawnTraps` ref, which
 *     survives that teardown too, so the sync effect saw an unchanged key and
 *     pushed nothing at all.
 *
 * Either one alone is enough to empty the board, which is why both are pinned
 * here. Asserted against the sources rather than by mounting Pixi: what broke
 * is not a computation but a MISSING TEARDOWN, and a teardown is only visible
 * in the code that performs it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SCENE = readFileSync(new URL('../src/game/scenes/BurrowScene.ts', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');

/**
 * The body of a named method, brace-matched from its signature.
 *
 * The opening brace is found by walking the PARAMETER LIST to its closing
 * paren first, rather than by taking the next `{` after the name: `setRaid`
 * declares its argument as an inline object type, so the naive search matched
 * that type's brace and returned the signature alone — a body that contained
 * none of the calls this file is about, and reported them missing.
 */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `no method matching "${signature}"`).toBeGreaterThan(-1);

  // Past the parameters: balance parens from the signature's own opening one.
  let parens = 0;
  let afterParams = -1;
  for (let i = source.indexOf('(', start); i < source.length; i++) {
    const c = source[i];
    if (c === '(') parens++;
    else if (c === ')') {
      parens--;
      if (parens === 0) { afterParams = i; break; }
    }
  }
  expect(afterParams, `unbalanced parens in "${signature}"`).toBeGreaterThan(-1);

  let depth = 0;
  for (let i = source.indexOf('{', afterParams); i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces in "${signature}"`);
}

describe('the ground is rebuilt without stranding the bombs on it', () => {
  /**
   * The premise everything else rests on: the markers hang in the terrain, so
   * the terrain going down takes them with it. If a bomb is ever mounted on
   * the flat board instead, this whole class of bug changes shape and the
   * assertions below stop describing it.
   */
  it('mounts each bomb inside its cell, not on the flat board', () => {
    expect(methodBody(SCENE, 'addTrap(tile: number')).toMatch(/mountVeil\(tile/);
  });

  it('refuses to redraw a bomb it thinks it already has', () => {
    // The guard that turned a destroyed sprite into a permanently empty cell.
    // Kept deliberately — it is what makes `addTrap` idempotent — which is
    // exactly why the map has to be emptied when the sprites die.
    expect(methodBody(SCENE, 'addTrap(tile: number')).toMatch(/if \(this\.trapSprites\.has\(tile\)\) return/);
  });

  it('drops the sprite record when the terrain those sprites live in goes', () => {
    const ground = methodBody(SCENE, 'private async showGround(');
    // The terrain is destroyed here...
    expect(ground).toMatch(/this\.terrain\?\.destroy\(\)/);
    // ...so the map that claims those sprites exist must not outlive it.
    expect(ground).toMatch(/this\.trapSprites\.clear\(\)/);
  });

  it('clears the rearm bookkeeping with the sprites it describes', () => {
    // A charge level for a tile with no sprite is a frame `paintTrap` cannot
    // draw and a bomb that comes back at the wrong opacity when it is redrawn.
    const ground = methodBody(SCENE, 'private async showGround(');
    expect(ground).toMatch(/this\.trapCharge\.clear\(\)/);
    expect(ground).toMatch(/this\.trapRearmMsLeft\.clear\(\)/);
    expect(ground).toMatch(/this\.trapRearmTotalMs\.clear\(\)/);
  });

  it('kills the tweens before the sprites stop existing', () => {
    // gsap ticking a destroyed container is the same rule `destroy` follows;
    // a bomb caught mid-pop is the case that reaches it.
    const ground = methodBody(SCENE, 'private async showGround(');
    expect(ground).toMatch(/killTweensOf/);
  });

  it('puts the traps back on the way home from a raid', () => {
    // The other half: clearing the map only helps if something re-adds them.
    // `data.traps` is the scene's own copy, kept current by `addTrap`.
    expect(methodBody(SCENE, 'async setRaid(state:'))
      .toMatch(/for \(const tile of this\.data\.traps\) this\.addTrap/);
  });
});

describe('the page re-pushes the traps onto ground it just replaced', () => {
  it('caches what it last drew, keyed on the tiles and their arming', () => {
    // The premise: without a cache there is no staleness to clear, and the
    // assertion below is meaningless.
    expect(PAGE).toMatch(/const drawnTraps = useRef\(''\)/);
    expect(PAGE).toMatch(/if \(drawnTraps\.current === key\) return/);
  });

  it('empties that cache when the board underneath it is swapped', () => {
    // `setRaid` is the call that grows a different homestead — the defender's
    // on the way in, the player's own on the way out. Both destroy the ground
    // the cached bombs were drawn on, so the cache has to admit it knows
    // nothing or the sync effect will push nothing.
    const draw = PAGE.slice(PAGE.indexOf('const draw = ()'));
    const body = draw.slice(0, draw.indexOf('burrow.setRaid(null)'));
    expect(body).toMatch(/drawnTraps\.current = ''/);
  });

  it('draws from the server list rather than from what it placed', () => {
    // The count in the panel and the bombs on the ground read the same field,
    // which is what makes a disagreement between them a drawing bug every
    // time — and keeps this fix honest about where the truth lives.
    expect(PAGE).toMatch(/const tiles = shop\.traps\?\.placed/);
  });
});
