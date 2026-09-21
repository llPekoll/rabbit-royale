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

  it('wears the kit\'s explanation panel, and offers the refill when short', () => {
    const PANEL = read('../src/components/energy-panel.tsx');
    expect(PANEL).toMatch(/<div className="rr-energy-panel" role="dialog"[\s\S]{0,120}className="rr-toolkit-detail rr-energy-panel-body"/);
    expect(PANEL).toMatch(/\{p\.energy < p\.max && \(\s*<PxButton className="rr-toolkit-action"/);
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
