/**
 * The client's board must never disagree with the server's about where the
 * local rabbit stands, what it may afford, or how long it is held — because
 * the ring is drawn from those three, and a lit tile the server refuses
 * teaches the player the ring lies.
 *
 * Every case here was a real way for the two to drift apart: a hop dropped
 * mid-flight, a shove nobody listened for, a strike whose energy never
 * reached the ring, a snapshot taken mid-stun, a board repainted from a stale
 * snapshot after an island swap. Each is pinned to the line that closes it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const RABBIT = read('../src/game/entities/PlayerRabbit.ts');
const SCENE = read('../src/game/scenes/IslandScene.ts');
const HOOK = read('../src/components/use-game-socket.ts');
const SERVER = read('../server/index.ts');

describe('a second hop accepted mid-flight is played, never dropped', () => {
  it('queues a hop to a DIFFERENT tile behind the one in the air', () => {
    // The ring re-lights the instant the server answers a step, so a quick
    // player's next tap is answered while the first hop is still being
    // drawn. That answer used to be thrown away: the sprite stayed a cell
    // behind the game, and every tap after that was judged from a tile the
    // player could not see.
    expect(RABBIT).toMatch(/if \(this\.isMoving\) \{\s*(\/\/[^\n]*\n\s*)*if \(tileIndex === this\.flightTarget\) \{\s*onComplete\?\.\(\);\s*return;\s*\}/);
    expect(RABBIT).toMatch(/this\.pendingHop = \{ tile: tileIndex, onComplete \};\s*return;/);
    expect(RABBIT).toMatch(/if \(this\.pendingHop\) \{\s*this\.takePendingHop\(\);\s*return;\s*\}/);
  });

  it('still swallows the landing the server repeats after a blast', () => {
    // The `rabbit_moved` that follows a bomb names the knockback's own tile;
    // the throw is already playing it.
    expect(RABBIT).toMatch(/playKnockback\(tileIndex: number, onComplete\?: \(\) => void\): void \{\s*this\.cancelMove\(\);\s*this\.isMoving = true;\s*this\.flightTarget = tileIndex;/);
  });

  it('forgets the queue when a move is cancelled outright', () => {
    expect(RABBIT).toMatch(/cancelMove\(\): void \{[\s\S]*?this\.flightTarget = null;\s*this\.pendingHop = null;/);
  });
});

describe('a shove moves the victim on every client', () => {
  it('is listened for', () => {
    // The one event that moves a rabbit without a `rabbit_moved`, and it had
    // no handler: the victim's ring stayed lit around the tile they had been
    // pushed off, and every tap after that bounced as out of reach.
    expect(HOOK).toMatch(/socket\.on\('rabbit_pushed'/);
    expect(HOOK).toMatch(/s\.pushRabbit\(p\.playerId, p\.to, p\.energy, p\.stunMs\)/);
    expect(SCENE).toMatch(/pushRabbit\(playerId: string, to: number, energy\?: number, stunMs\?: number\): void/);
  });

  it('moves the local rabbit, its energy and its stun in one step', () => {
    const body = SCENE.match(/pushRabbit\([^)]*\): void \{[\s\S]*?\n  \}/)?.[0] ?? '';
    expect(body).toMatch(/this\.myTile = to;/);
    expect(body).toMatch(/this\.myEnergy = energy;/);
    expect(body).toMatch(/this\.stunnedUntil = Date\.now\(\) \+ stunMs;/);
    expect(body).toMatch(/this\.refreshReachable\(\);/);
  });

  it('carries the stun a landing on a bomb hands out, as a remaining duration', () => {
    expect(SERVER).toMatch(/emit\('rabbit_pushed', \{[\s\S]*?stunMs: victim \? Math\.max\(0, victim\.stunnedUntil - Date\.now\(\)\) : 0,/);
  });
});

describe('a strike costs the ring what it cost the rabbit', () => {
  it('passes the energy the shock left through to the scene', () => {
    // No `rabbit_energy` follows a strike; the ring priced the next dig from
    // a bar the server no longer held.
    expect(HOOK).toMatch(/s\.electrocuteRabbit\(p\.playerId, p\.tile, \{ fatal: p\.runOver, stunMs: p\.stunMs, energy: p\.energy \}\)/);
    expect(SCENE).toMatch(/if \(opts\.energy !== undefined\) this\.myEnergy = opts\.energy;/);
  });
});

describe('a stun survives a snapshot', () => {
  it('is described by the server as what is left of it', () => {
    expect(SERVER).toMatch(/const publicRabbit = \(r: Rabbit\) => \(\{[\s\S]*?stunMs: Math\.max\(0, r\.stunnedUntil - Date\.now\(\)\),/);
  });

  it('is applied on a join and on a repaint', () => {
    expect(HOOK).toMatch(/s\.addRabbit\(r\.playerId, r\.name, r\.tile, i, r\.energy, r\.crowned, r\.stunMs\)/);
    expect(HOOK).toMatch(/scene\.addRabbit\(r\.playerId, r\.name, r\.tile, i, r\.energy, r\.crowned, stunLeft\(r\)\)/);
    expect(SCENE).toMatch(/this\.stunnedUntil = stunnedUntil;\s*if \(stunMs > 0\) known\.playStunned\(stunMs\);/);
    expect(SCENE).toMatch(/this\.stunnedUntil = stunnedUntil;\s*if \(stunMs > 0\) rabbit\.playStunned\(stunMs\);/);
  });
});

describe('a repaint after an island swap reads the roster as it stands', () => {
  it('takes the rabbits from the live roster, not the snapshot', () => {
    // Everything that moved a rabbit while the ground was being rebuilt had
    // landed on a scene that no longer had it; repainting from the snapshot
    // then put the rabbit back one or more tiles behind the server.
    expect(HOOK).toMatch(/const roster = rabbitsRef\.current\.size \? \[\.\.\.rabbitsRef\.current\.values\(\)\] : snap\.rabbits;/);
    expect(HOOK).toMatch(/useEffect\(\(\) => \{ rabbitsRef\.current = rabbits; \}, \[rabbits\]\);/);
  });

  it('keeps every stun on the roster, on the client clock', () => {
    // A blast, a shove and a strike each put their deadline on the roster,
    // so the repaint darkens the ring for what is LEFT and not again in full.
    expect(HOOK).toMatch(/return new Map\(prev\)\.set\(hit, \{ \.\.\.known, tile, stunUntil: until \?\? 0 \}\);/);
    expect(HOOK).toMatch(/stunUntil: p\.stunMs \? Date\.now\(\) \+ p\.stunMs : 0,/);
    expect(HOOK).toMatch(/stunUntil: Date\.now\(\) \+ p\.stunMs,/);
  });
});
