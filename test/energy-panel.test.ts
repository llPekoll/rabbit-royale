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

  it('wears the kit\'s explanation panel, and offers the refill only when a door is shut', () => {
    const PANEL = read('../src/components/energy-panel.tsx');
    expect(PANEL).toMatch(/<div className="rr-energy-panel" role="dialog"[\s\S]{0,120}className="rr-toolkit-detail rr-energy-panel-body"/);
    // Not at 295/300, and not mid-run: below the raid line, at the burrow.
    expect(PANEL).toMatch(/\{!p\.onIsland && p\.energy < RAID_FLOOR && \(\s*<PxButton className="rr-toolkit-action"/);
  });

  it('is a bar with the two lines on it, and rows with a chip each', () => {
    const PANEL = read('../src/components/energy-panel.tsx');
    expect(PANEL).toMatch(/className="rr-energy-tick" style=\{\{ left: pct\(p\.runCost\) \}\}/);
    expect(PANEL).toMatch(/className="rr-energy-tick raid" style=\{\{ left: pct\(RAID_FLOOR\) \}\}/);
    expect(PANEL).toMatch(/chip\(canIsland, c\.yes, c\.inWait\(wait\(p\.runCost\)\)\)/);
    expect(PANEL).toMatch(/chip\(canRaid, c\.yes, c\.inWait\(wait\(RAID_FLOOR\)\)\)/);
    expect(PANEL).toMatch(/chip\(canRaid, c\.homeYes, c\.homeNo\)/);
  });

  it('the RAID slab counts down to its own line, in DIG\'s grammar', () => {
    const LOOP = read('../src/components/loop-bar.tsx');
    expect(LOOP).toMatch(/\.\.\.\(dig\.energy < raidFloor \? \[t\.loop\.raidIn\(formatWait\(raidWaitMs, t\.units\)\)\] : \[\]\)/);
    expect(PAGE).toMatch(/regenPerHour: burrow\.regenPerHour,/);
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
