/**
 * Defending a raid LIVE, and striking rivals on the island.
 *
 * Two things a burrow's owner could not do before: watch a raid on their own
 * ground while it happened (raids were history by the time they heard), and
 * answer it. And one thing nobody could do: fire the lightning the shop sold —
 * the server handled it, the shelf stocked it, and no client ever emitted it.
 *
 * The rules that matter here are wiring rules — which side pays, which side
 * decides, what a raider is told — so, like `raid-entry`, they are asserted
 * against the source: a refactor that quietly moved a decision to the client
 * would keep every unit test green and break the game.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RAID_RUN, LIGHTNING, ENERGY } from '../config/tuning';
import { defenderRaidView } from '../src/lib/game/defence';
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';

const SERVER = readFileSync('server/index.ts', 'utf8');
const RAID_API = readFileSync('src/app/api/raid/route.ts', 'utf8');
const STRIKE_API = readFileSync('src/app/api/raid/strike/route.ts', 'utf8');
const INCOMING_API = readFileSync('src/app/api/raid/incoming/route.ts', 'utf8');
const SOCKET_HOOK = readFileSync('src/components/use-game-socket.ts', 'utf8');
const RAID_HOOK = readFileSync('src/components/use-raid.ts', 'utf8');
const INCOMING_HOOK = readFileSync('src/components/use-incoming-raid.ts', 'utf8');
const PAGE = readFileSync('src/app/page.tsx', 'utf8');
const SCHEMA = readFileSync('src/lib/db/schema.ts', 'utf8');
const ISLAND = readFileSync('src/game/scenes/IslandScene.ts', 'utf8');
const BURROW = readFileSync('src/game/scenes/BurrowScene.ts', 'utf8');

/** The body of a `socket.on('<name>', ...)` handler. */
function handler(name: string): string {
  const start = SERVER.indexOf(`socket.on('${name}'`);
  expect(start, `no '${name}' handler`).toBeGreaterThan(-1);
  const next = SERVER.indexOf('socket.on(', start + 10);
  return SERVER.slice(start, next === -1 ? undefined : next);
}

describe('the island strike hits rabbits', () => {
  it('electrocutes whoever stands in the square, and tells the room', () => {
    const h = handler('lightning');
    expect(h).toMatch(/struckRabbits\(/);
    expect(h).toMatch(/emit\('rabbit_struck'/);
  });

  it('costs a heart, like a bomb', () => {
    // The whole reason the number is a tuning value: a strike that ended a run
    // outright would be a delete button on other people's runs.
    expect(LIGHTNING.SHOCK_LOSS).toBe(ENERGY.BOMB_LOSS);
    expect(handler('lightning')).toMatch(/LIGHTNING\.SHOCK_LOSS/);
  });

  it('ends a run it empties the way a shove does', () => {
    const h = handler('lightning');
    expect(h).toMatch(/emit\('rabbit_died'/);
    expect(h).toMatch(/bankRun\(victim\)/);
    expect(h).toMatch(/emit\('run_over'/);
  });

  it('is finally FIRED by a client', () => {
    // The shop sold it and the server handled it; nothing ever emitted it.
    expect(SOCKET_HOOK).toMatch(/emit\('lightning', \{ tile \}\)/);
    expect(SOCKET_HOOK).toMatch(/socket\.on\('rabbit_struck'/);
    expect(ISLAND).toMatch(/electrocuteRabbit\(/);
    expect(ISLAND).toMatch(/setAiming\(/);
    expect(PAGE).toMatch(/onStrikeIntent=\{onStrikeIntent\}/);
  });
});

describe('defending a raid live', () => {
  it('records a strike on the run, and nowhere else', () => {
    expect(SCHEMA).toMatch(/struckAt: timestamp\('struck_at'/);
  });

  it('spends a lightning, conditionally, before closing the run', () => {
    // The same guard the island's strike uses: two taps racing the last item
    // cannot both win.
    expect(STRIKE_API).toMatch(/eq\(inventory\.kind, 'lightning'\)/);
    expect(STRIKE_API).toMatch(/\$\{inventory\.qty\} > 0/);
    expect(STRIKE_API).toMatch(/none_held/);
    // ...and refunds it if the run had already ended under the bolt.
    expect(STRIKE_API).toMatch(/isNull\(raidRuns\.endedAt\)\)\)\s*\.returning/);
    expect(STRIKE_API).toMatch(/\$\{inventory\.qty\} \+ 1/);
    expect(STRIKE_API).toMatch(/raid_over/);
  });

  it('only ever closes a raid on the DEFENDER\'s own burrow', () => {
    expect(STRIKE_API).toMatch(/eq\(raidRuns\.defenderId, session\.sub\)/);
    expect(INCOMING_API).toMatch(/eq\(raidRuns\.defenderId, session\.sub\)/);
  });

  it('answers the struck raider with the strike, not with "no raid"', () => {
    expect(RAID_API).toMatch(/recentlyStruck\(session\.sub\)/);
    expect(RAID_API).toMatch(/struck: run\.struckAt !== null/);
    expect(RAID_RUN.STRUCK_SHOWN_MS).toBeGreaterThan(RAID_RUN.ENDED_SHOWN_MS);
  });

  it('is PUSHED, never polled — on either side', () => {
    // A poll every two seconds per open burrow was the first cut, and it was
    // rightly refused: it scales with players, not with raids. Every change
    // now crosses from the HTTP process to the socket over Postgres NOTIFY,
    // and no client holds an interval against the raid endpoints.
    expect(RAID_HOOK).not.toMatch(/setInterval/);
    expect(INCOMING_HOOK).not.toMatch(/setInterval/);
    expect(RAID_API).toMatch(/pushToPlayer\(/);
    expect(STRIKE_API).toMatch(/event: 'raid_struck'/);
    expect(SERVER).toMatch(/sql\.listen\(PLAYER_PUSH_CHANNEL/);
    expect(SOCKET_HOOK).toMatch(/socket\.on\('raid_incoming'/);
    expect(SOCKET_HOOK).toMatch(/socket\.on\('raid_struck'/);
    expect(PAGE).toMatch(/useIncomingRaid\(/);
  });

  it('tells the defender on every change of the run', () => {
    // Start, each step (walking or settled), and a retreat: one `tellDefender`
    // per write, so a burrow at home never sees its intruder freeze.
    expect(RAID_API.match(/await tellDefender\(run\.id\)/g)?.length).toBe(4);
  });

  it('never lets the push bus take the socket server down', () => {
    // The same lesson as presence: a LISTEN the database refuses costs the
    // live picture, not every run in memory.
    expect(SERVER).toMatch(/push bus unavailable/);
  });

  it('shapes the defender\'s view from the run, with the intruder named', () => {
    const v = defenderRaidView({
      id: 'r', tile: 5, energy: 12, visited: [1, 5], trapsSprung: 1, succeeded: false,
      carrotsLooted: 0, startedAt: new Date(0), endedAt: new Date(1), struckAt: new Date(1),
    }, { id: 'a', name: 'Bramble', avatar: null });
    expect(v).toMatchObject({ raidId: 'r', tile: 5, walked: [1, 5], finished: true, struck: true });
    expect(v.attacker.name).toBe('Bramble');
  });

  it('puts the board on the defender\'s side before drawing the raid', () => {
    // The grid stays up and the traps stay visible only for a defender.
    expect(PAGE).toMatch(/burrow\.setDefending\(true\)/);
    expect(BURROW).toMatch(/if \(!this\.defending\) this\.setPlacing\(false\)/);
    expect(BURROW).toMatch(/group\.visible = this\.defending/);
  });
});

describe('every language can say it', () => {
  it('has the defence and strike strings in all four dictionaries', () => {
    for (const locale of LOCALES) {
      const d = DICTIONARIES[locale];
      expect(d.defend.underAttack('x')).toBeTruthy();
      expect(d.defend.struckDown).toBeTruthy();
      expect(d.raid.struck).toBeTruthy();
      expect(d.run.strike).toBeTruthy();
      expect(d.raidErrors.none_held).toBeTruthy();
    }
  });
});

describe('the push bus', () => {
  it('round-trips a push and refuses anything that is not one', async () => {
    const { encodePush, decodePush } = await import('../src/lib/game/raid-events');
    const wire = encodePush({ to: 'p1', event: 'raid_struck', payload: { raidId: 'r' } });
    expect(wire).toBeTruthy();
    expect(decodePush(wire!)).toEqual({ to: 'p1', event: 'raid_struck', payload: { raidId: 'r' } });
    expect(decodePush('not json')).toBeNull();
    expect(decodePush(JSON.stringify({ to: 'p1', event: 'rm -rf', payload: 1 }))).toBeNull();
  });

  it('drops a payload Postgres would refuse rather than failing the raid', async () => {
    const { encodePush } = await import('../src/lib/game/raid-events');
    const huge = encodePush({ to: 'p1', event: 'raid_incoming', payload: { walked: new Array(4000).fill(123) } });
    expect(huge).toBeNull();
  });
});
