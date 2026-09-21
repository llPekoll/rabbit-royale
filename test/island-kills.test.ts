/**
 * BEING GOT AT LEAVES A TRACE, AND THE TRACE HAS A NAME ON IT.
 *
 * The profile's History used to answer "nobody has crossed your burrow" to a
 * player who had been shoved into the water four times that morning: the two
 * commonest ways to lose a run to another player — a shove and a lightning
 * strike — wrote nothing down and told the victim nothing at the time. A shove
 * that ended a run did not even send `run_over`, so the victim's screen simply
 * stopped on the tile they had been pushed off.
 *
 * Three things are pinned here, because each of them regressed once:
 *  - the kill is WRITTEN, with the culprit as the attacker;
 *  - the victim is TOLD, with a recap that names them;
 *  - the history SAYS SO, in every language, rather than printing "0 dmg".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SERVER = read('../server/index.ts');
const RECORD = read('../src/lib/game/record-raid.ts');
const RECAP = read('../src/components/run-recap.tsx');
const SOCKET = read('../src/components/use-game-socket.ts');
const HISTORY = read('../src/app/api/player/history/route.ts');

describe('a kill on the island', () => {
  it('is written down, for both ways of causing one', () => {
    // Both exits call it, and the kind is what tells them apart in the log.
    expect(SERVER).toMatch(/recordIslandKill\(\{[\s\S]{0,200}kind: 'shove'/);
    expect(SERVER).toMatch(/recordIslandKill\(\{[\s\S]{0,200}kind: 'lightning'/);
  });

  it('never lets a rabbit raid itself', () => {
    // `pushedBy` is the mover and a strike skips its own caster, but a
    // self-raid would read in the profile as a stranger having done it.
    expect(RECORD).toMatch(/if \(attackerId === defenderId\) return;/);
  });

  it('is a row the defender can read back, not a carrot movement', () => {
    // An island kill takes a RUN. Writing it inside `recordRaid`'s transaction
    // would have made a failed insert able to roll a death back.
    expect(RECORD).toMatch(/export async function recordIslandKill/);
    expect(RECORD).not.toMatch(/recordIslandKill[\s\S]{0,400}db\.transaction/);
  });

  it('reaches the profile with its kind', () => {
    // Without this the client cannot tell a drowning from a burrow crossing,
    // and falls back to printing the crossing's "0 dmg".
    expect(HISTORY.match(/kind: raids\.kind,/g) ?? []).toHaveLength(2);
  });
});

describe('the victim is told', () => {
  it('gets a recap when a shove ends the run', () => {
    // THE BUG THIS FILE WAS OPENED FOR: the shove banked the run and stopped,
    // so the victim's screen halted with no card and no way forward.
    const shove = SERVER.match(/if \(victim && shove\.runOver\) \{[\s\S]{0,900}?\n      \}/)?.[0] ?? '';
    expect(shove).toMatch(/emit\('run_over'/);
    expect(shove).toMatch(/rabbit_died/);
    expect(shove).toMatch(/killedBy/);
  });

  it('is told WHO, on both endings', () => {
    expect(SERVER).toMatch(/killedBy: \{[\s\S]{0,120}how: 'shove'/);
    // A wider window than the shove's: this one carries a comment about
    // reading the caster off the roster, which the shove has no need of.
    expect(SERVER).toMatch(/killedBy: \{[\s\S]{0,400}how: 'lightning'/);
  });

  it('sees the culprit on the card rather than "Out of energy"', () => {
    // The hearts did run out — but they ran out BECAUSE of somebody, and the
    // energy line alone is what made a defeat read as the game breaking.
    expect(RECAP).toMatch(/killedTitle \?\? t\.recap\.over/);
    expect(RECAP).toMatch(/killedNote \?\? t\.recap\.overNote/);
    // A won run has no killer: no rival can clear an island or end a tutorial.
    expect(RECAP).toMatch(/const killer = won \? null : recap\.killedBy \?\? null;/);
  });

  it('is blamed by name the moment it happens, not only at the end', () => {
    // Only OUR shoves raise a note — every bump in a four-rabbit room is noise.
    expect(SOCKET).toMatch(/if \(p\.playerId === playerId\) \{[\s\S]{0,300}setShoved\(/);
    // The name is resolved off the roster: the wire carries ids only.
    expect(SOCKET).toMatch(/rabbitsRef\.current\.get\(p\.pushedBy\)\?\.name/);
    expect(SOCKET).toMatch(/blameRabbit\?\.\(p\.pushedBy\)/);
  });
});

describe('the history says what happened', () => {
  it('has words for a drowning in every language', () => {
    for (const locale of LOCALES) {
      const { profile, recap, shove } = DICTIONARIES[locale];
      // The right-hand column, where a crossing would print its carrots.
      for (const line of [profile.shovedIn, profile.struckDown]) {
        expect(line.trim(), locale).not.toBe('');
      }
      // The card, named and anonymous.
      for (const line of [recap.shoved, recap.struck, recap.shovedNoteAnon, recap.struckNoteAnon]) {
        expect(line.trim(), locale).not.toBe('');
      }
      // And the toast, which has to carry the name itself.
      expect(shove.by('Tim'), locale).toContain('Tim');
      expect(recap.shovedNote('Tim'), locale).toContain('Tim');
      expect(recap.struckNote('Tim'), locale).toContain('Tim');
      expect(profile.youShoved('Tim'), locale).toContain('Tim');
      expect(profile.youStruck('Tim'), locale).toContain('Tim');
    }
  });

  it('no longer promises the empty list is about burrows', () => {
    // The list holds island kills now, so "nobody has crossed your burrow" was
    // false for a player who had only ever been drowned.
    for (const locale of LOCALES) {
      const { profile } = DICTIONARIES[locale];
      expect(profile.noRaids.trim(), locale).not.toBe('');
    }
    expect(DICTIONARIES.en.profile.noRaids).not.toMatch(/burrow/i);
  });
});
