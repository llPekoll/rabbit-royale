/**
 * THE TANK EXPLAINS ITSELF (Paul, 21 September 2026): a tap on the ring
 * opens the panel that says what the energy buys right now; the raid line
 * is a tick on the ring; RAID without a raid's worth says so with the wait
 * instead of opening a list; the way home says "raid ready" in the band
 * under a third of the tank; and the DIG slab, shut for an island, says a
 * raid is open. Asserted against the sources.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PAGE = read('../src/app/page.tsx');
const DIAL = read('../src/components/energy-dial.tsx');
const PILL = read('../src/components/carrot-pill.tsx');

describe('the energy panel', () => {
  it('opens from a tap on the ring, and the ring carries the raid line', () => {
    expect(DIAL).toMatch(/\{onTap && \(\s*<button\s*type="button"\s*className="rr-dial-tap"/);
    expect(DIAL).toMatch(/className="rr-dial-mark"/);
    expect(PILL).toMatch(/mark=\{bank !== null \? energyMark : undefined\}\s*onTap=\{bank !== null \? onEnergyTap : undefined\}/);
    expect(PAGE).toMatch(/onEnergyTap=\{\(\) => setEnergyPanelOpen\(\(o\) => !o\)\}\s*energyMark=\{RAID_FLOOR\}/);
    expect(PAGE).toMatch(/\{player && energyPanelOpen && liveEnergy && \(\s*<EnergyPanel/);
  });

  it('wears the kit\'s explanation panel', () => {
    const PANEL = read('../src/components/energy-panel.tsx');
    expect(PANEL).toMatch(/<div className="rr-energy-panel" role="dialog"[\s\S]{0,120}className="rr-toolkit-detail rr-energy-panel-body"/);
  });

  it('is the ring laid flat with the two floors on it, and a ledger row per door', () => {
    const PANEL = read('../src/components/energy-panel.tsx');
    expect(PANEL).toMatch(/className="rr-tank-tick island" style=\{\{ left: pct\(p\.runCost\) \}\}/);
    expect(PANEL).toMatch(/className="rr-tank-tick raid" style=\{\{ left: pct\(RAID_FLOOR\) \}\}/);
    expect(PANEL).toMatch(/verdict: canIsland \? ready : short\(p\.runCost\)/);
    expect(PANEL).toMatch(/verdict: canRaid \? ready : short\(RAID_FLOOR\)/);
  });

  it('the RAID slab counts down to its own line, in DIG\'s grammar', () => {
    const LOOP = read('../src/components/loop-bar.tsx');
    expect(LOOP).toMatch(/\.\.\.\(dig\.energy < raidFloor \? \[t\.loop\.raidIn\(formatWait\(raidWaitMs, t\.units\)\)\] : \[\]\)/);
    expect(PAGE).toMatch(/regenPerHour: burrow\.regenPerHour,/);
  });

  it('what a tier is made of is on every tier row, from its own numbers', () => {
    const PICK = read('../src/components/island-picker.tsx');
    expect(PICK).toMatch(/t\.islandPick\.tier\(Math\.round\(tier\.bombDensity \* 100\), tier\.xGain\)/);
  });

  it('the recap counts the ONE tank, in every language', () => {
    // The three reserves are gone, so no language may still send the player
    // to a second pool "at the burrow" — the bar on screen IS that number.
    const burrows = /burrow|terrier|toca|\u5154\u7a9d/i;
    for (const locale of LOCALES) {
      const d = DICTIONARIES[locale].recap;
      const bank = d.bank(85, 300, 5);
      expect(bank, locale).not.toMatch(burrows);
      expect(bank, locale).toContain('85');
      expect(bank, locale).toContain('300');
      expect(d.raidLeft(85), locale).not.toMatch(burrows);
    }
  });

  it('the way home says it in words, not in a status chip', () => {
    // "HOME \u00b7 RAID READY" was two labels glued together; every language
    // now says one thing, and none of them wears the separator.
    for (const locale of LOCALES) {
      const label = DICTIONARIES[locale].run.homeRaid;
      expect(label.trim(), locale).not.toBe('');
      expect(label, locale).not.toContain('\u00b7');
    }
  });

  it('every language says what a tier\'s ground is made of', () => {
    for (const locale of LOCALES) {
      const line = DICTIONARIES[locale].islandPick.tier(14, 6);
      expect(line, locale).toContain('14');
      expect(line, locale).toContain('6');
    }
  });

  it('the crossing note is one-tank wording, localised', () => {
    const NOTE = read('../src/components/run-cost-note.tsx');
    expect(NOTE).not.toMatch(/left at the burrow/);
    expect(NOTE).toMatch(/\{t\.run\.crossed\(shown\.cost, shown\.energy\)\}/);
  });
});

describe('the raid cues', () => {
  it('RAID without a raid\'s worth says so with the wait, and never opens the list', () => {
    expect(PAGE).toMatch(/if \(have < RAID_FLOOR\) \{[\s\S]{0,400}refuse\(t\.loop\.raidNeeds\(RAID_FLOOR, have, formatWait\(/);
    expect(PAGE).toMatch(/onRaid=\{openRaid\}/);
    expect(PAGE).toMatch(/case 'raid': openRaid\(\); break;/);
  });

  it('the way home says raid ready in the band under a third of the tank', () => {
    expect(PAGE).toMatch(/const raidReady = where === 'island' && !spectating && !crossing\s*&& \(game\.me\?\.energy \?\? 0\) >= RAID_FLOOR && \(game\.me\?\.energy \?\? 0\) <= ENERGY\.MAX \/ 3;/);
    expect(PAGE).toMatch(/label=\{spectating \? t\.run\.stopWatching : raidReady \? t\.run\.homeRaid : t\.run\.home\}/);
  });
});
