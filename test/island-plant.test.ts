/**
 * Planting a bomb on the island, wired end to end.
 *
 * The rule itself is `sabotage.test`. This pins the wiring — the second item
 * the shop sold and nobody could use (the strike was the first): who pays,
 * who is told, and that nobody but the planter learns where it went.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';

const SERVER = readFileSync('server/index.ts', 'utf8');
const SOCKET_HOOK = readFileSync('src/components/use-game-socket.ts', 'utf8');
const HUD = readFileSync('src/components/run-hud.tsx', 'utf8');
const PAGE = readFileSync('src/app/page.tsx', 'utf8');
const ISLAND = readFileSync('src/game/scenes/IslandScene.ts', 'utf8');

function handler(name: string): string {
  const start = SERVER.indexOf(`socket.on('${name}'`);
  expect(start, `no '${name}' handler`).toBeGreaterThan(-1);
  const next = SERVER.indexOf('socket.on(', start + 10);
  return SERVER.slice(start, next === -1 ? undefined : next);
}

describe('the plant handler', () => {
  const h = handler('plant');

  it('refuses before it charges, and charges conditionally', () => {
    expect(h.indexOf('plantBlocker(')).toBeLessThan(h.indexOf("eq(inventory.kind, 'bomb')"));
    expect(h).toMatch(/\$\{inventory\.qty\} > 0/);
    expect(h).toMatch(/none-held/);
  });

  it('tells the planter alone where it went', () => {
    // `socket.emit`, never `io.to(room)`: the position is the whole ambush.
    expect(h).toMatch(/socket\.emit\('bomb_planted'/);
    expect(h).not.toMatch(/io\.to\(room\)\.emit\('bomb_planted'/);
  });

  it('redraws the numbers it changed for everyone, mirages respected', () => {
    expect(h).toMatch(/emit\('hints_changed'/);
    expect(h).toMatch(/shownAdjacent\(/);
  });

  it('only lets a seated, living rabbit plant', () => {
    expect(h).toMatch(/live\.rabbits\.get\(data\.playerId\)\?\.alive/);
  });
});

describe('the client', () => {
  it('fires it, marks it, and reads who bombed it', () => {
    expect(SOCKET_HOOK).toMatch(/emit\('plant', \{ tile \}\)/);
    expect(SOCKET_HOOK).toMatch(/socket\.on\('bomb_planted'/);
    expect(SOCKET_HOOK).toMatch(/r\.dig\?\.plantedBy/);
    expect(ISLAND).toMatch(/markPlanted\(/);
    // The marker goes when the tile is dug, whoever dug it.
    expect(ISLAND).toMatch(/revealTile\([\s\S]{0,200}this\.clearPlanted\(index\)/);
  });

  it('arms it from the strip, next to the bolt', () => {
    expect(HUD).toMatch(/onToggle\('plant'\)/);
    expect(HUD).toMatch(/onToggle\('strike'\)/);
    expect(PAGE).toMatch(/onPlantIntent=\{onPlantIntent\}/);
  });

  it('never resolves a bomb onto a rabbit', () => {
    // A bomb goes under ground; the rival lookup is the strike's alone.
    const aimed = ISLAND.slice(ISLAND.indexOf('private aimedTap('), ISLAND.indexOf('markPlanted('));
    const plantBranch = aimed.slice(aimed.indexOf('// A bomb goes under GROUND'));
    expect(plantBranch).not.toMatch(/rivalAt\(/);
  });

  it('has the words in all four languages', () => {
    for (const locale of LOCALES) {
      const d = DICTIONARIES[locale];
      expect(d.run.plant).toBeTruthy();
      expect(d.run.plantRefused['too-many']).toBeTruthy();
      expect(d.run.plantedBy('x')).toContain('x');
    }
  });
});
