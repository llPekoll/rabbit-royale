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
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';
import { loopOf } from '../src/components/loop-bar';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PAGE = read('../src/app/page.tsx');
const BAR = read('../src/components/loop-bar.tsx');

describe('the loop bar', () => {
  it('holds exactly three verbs, in loop order', () => {
    // Three VERBS: the middle slab was "HOME" (a place) until it became DEFEND.
    // Matched on the dictionary KEYS, since the words are translated — the
    // order is the design, and it is the same in every language.
    const verbs = [...BAR.matchAll(/\{t\.loop\.(dig|home|defend|raid)\}<\/span>/g)].map((m) => m[1]);
    expect(verbs).toEqual(['dig', 'defend', 'raid']);
    // And every language actually fills all three, with a verb rather than a
    // place — the middle one was "HOME" until it became DEFEND.
    for (const locale of LOCALES) {
      const { loop } = DICTIONARIES[locale];
      for (const verb of [loop.dig, loop.defend, loop.raid]) {
        expect(verb.trim(), locale).not.toBe('');
      }
    }
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
    // The way out of placement survives, as the shared back button. It now
    // serves BOTH board modes — walling arrived with the fence — so the one
    // handler closes both (and the kit's inspect state with them); what is
    // pinned is the one shared Back button, not which mode it happens to
    // close. Its label comes from the dictionary since the four languages.
    expect(PAGE).toMatch(/<BackButton label=\{t\.chrome\.back\} onClick=\{\(\) => \{\s*stopPlacing\(\);\s*stopWalling\(\);/);
  });

  it('keeps one verb per loop on the island too', () => {
    // Watching and playing both leave by the SHARED corner button now: the big
    // centred HOME arrow sat in the bottom band where the near tiles are, and
    // on a phone it took the taps meant for digging.
    // Matched on the STRUCTURE, not the words: the labels moved into the
    // dictionaries when the game learned four languages, so asserting the
    // English would only prove that English still exists.
    expect(PAGE).toMatch(/label=\{spectating \? t\.run\.stopWatching : t\.run\.home\}/);
    expect(PAGE).not.toMatch(/<GoButton/);
    expect(read('../src/components/run-recap.tsx')).toMatch(/t\.recap\.goHome/);
    // ...and the slab steps aside while the recap is up: the card's own last
    // row is the same exit, and the two HOMEs were drawn over each other.
    // (The same gate also holds the corner shut during the first island —
    // `!game.firstRun` — see the next assertion's note; the recap half is
    // what this one pins.)
    expect(PAGE).toMatch(/\{\(spectating \|\| \(!game\.recap && !game\.firstRun\)\) &&[\s\S]{0,120}<BackButton[\s\S]{0,120}label=\{spectating \? t\.run\.stopWatching : t\.run\.home\}/);
    // ...and it also steps aside for the WHOLE first island, not only while
    // the X lesson held (`taughtBomb`, once): with every dig refused until
    // the bomb is marked, HOME would be the only door that still opens, and a
    // new player takes it having learned nothing — and after the lesson the
    // first island still ends on its chest, its recap being the way out.
    expect(PAGE).toMatch(/!game\.recap && !game\.firstRun\)\) &&/);
    expect(PAGE).not.toMatch(/game\.taughtBomb === null && \(/);
  });

  it('moves the shop and the codex off the floor, to the top bar', () => {
    const top = PAGE.slice(PAGE.indexOf('className="rr-topbar"'), PAGE.indexOf('<TopbarReserve'));
    expect(top).toMatch(/label=\{t\.chrome\.shop\}/);
    expect(top).toMatch(/label=\{t\.chrome\.story\}/);
  });

  it('falls back to the next action once the quests are claimed', () => {
    expect(PAGE).toMatch(/quest\?\.active \? \([\s\S]{0,600}<QuestCard/);
    expect(PAGE).toMatch(/<NextStrip action=\{next\}/);
  });
});
