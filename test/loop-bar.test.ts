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
    const verbs = [...BAR.matchAll(/>(DIG|HOME|RAID|SHOP|STORY|BASE)<\/span>/g)].map((m) => m[1]);
    expect(verbs).toEqual(['DIG', 'HOME', 'RAID']);
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
    // The BACK slab survives: it is the way out of placement, not a loop.
    expect(PAGE).toMatch(/<FarmButton label="Back"/);
  });

  it('keeps one verb per loop on the island too', () => {
    expect(PAGE).toMatch(/'Stop watching' : 'Home'/);
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
