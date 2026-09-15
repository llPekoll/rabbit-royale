/**
 * THE LOOP IS ON THE FLOOR: DIG ▸ HOME ▸ RAID, and nothing else claims it.
 *
 * The four doors and the GO FARM slab told the loop in five unrelated
 * pieces. The bar tells it in three, in order, each with its reason. Pinned
 * against the sources: a fourth slab, or GO FARM creeping back, is the
 * regression this file exists to catch.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loopOf } from '../src/components/loop-bar';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PAGE = read('../src/app/page.tsx');
const BAR = read('../src/components/loop-bar.tsx');

describe('the loop bar', () => {
  it('holds exactly three verbs, in loop order', () => {
    // Three VERBS: the middle slab was "HOME" (a place) until it became DEFEND.
    const verbs = [...BAR.matchAll(/>(DIG|HOME|DEFEND|RAID|SHOP|STORY|BASE)<\/span>/g)].map((m) => m[1]);
    expect(verbs).toEqual(['DIG', 'DEFEND', 'RAID']);
  });

  it('maps every quest door onto a slab, or nowhere', () => {
    expect(loopOf('farm')).toBe('dig');
    expect(loopOf('garden')).toBe('home');
    expect(loopOf('base')).toBe('home');
    expect(loopOf('raid')).toBe('raid');
    expect(loopOf('story')).toBeNull();
    expect(loopOf('shop')).toBeNull();
    expect(loopOf(null)).toBeNull();
  });

  it('is what the burrow mounts — not the four doors, not GO FARM', () => {
    expect(PAGE).toMatch(/<LoopBar/);
    expect(PAGE).not.toMatch(/<HubTabs/);
    expect(PAGE).not.toMatch(/label="Go farm"/);
    // The way out of placement survives, as the shared back button.
    expect(PAGE).toMatch(/<BackButton label="Back" onClick=\{stopPlacing\} \/>/);
  });

  it('keeps one verb per loop on the island too', () => {
    // Watching gets the shared way back; playing keeps the run's own exit.
    expect(PAGE).toMatch(/<BackButton label="Stop watching" onClick=\{stopSpectating\} \/>/);
    expect(PAGE).toMatch(/<GoButton dir="down" label="Home" onClick=\{stopSpectating\} \/>/);
    expect(read('../src/components/run-recap.tsx')).toMatch(/Home &middot; stack it/);
  });

  it('moves the shop and the codex off the floor, to the top bar', () => {
    const top = PAGE.slice(PAGE.indexOf('className="rr-topbar"'), PAGE.indexOf('<TopbarReserve'));
    expect(top).toMatch(/label="Shop"/);
    expect(top).toMatch(/label="Story"/);
  });

  it('falls back to the next action once the quests are claimed', () => {
    expect(PAGE).toMatch(/quest\?\.active \? \([\s\S]{0,600}<QuestCard/);
    expect(PAGE).toMatch(/<NextStrip action=\{next\}/);
  });
});
