/**
 * THE BURROW'S CHROME, on its own — the bench this UI gets built on.
 *
 * WHY A STORY AND NOT THE APP. The real column only appears after a sign-in, a
 * socket connect and an island that takes seconds to load, and its interesting
 * states are the ones a fresh guest account never has: an empty gauge, a full
 * garden, a maxed burrow, a shield running down. Reaching them through the app
 * means playing the game into the state you want to look at. Here they are
 * args.
 *
 * WHAT IT IS EVIDENCE OF. Only the chrome — `burrow-chrome.tsx`'s cards, rows,
 * meters and buttons, laid out exactly as `app/page.tsx` lays them out. It is
 * deliberately a COPY of that arrangement rather than the page itself: the page
 * is 1200 lines welded to sockets and auth, and importing it would make this a
 * slower, less reliable way of doing what the app already does. The cost is
 * that the two can drift, so the rule is that a change to the column happens
 * HERE first and is carried over — never the other way round.
 *
 * THE GROUND MATTERS. These panels are dark wood on a bright hand-painted
 * island, and the one failure mode that a grey Storybook canvas hides is
 * exactly that contrast. So the column sits on the island art, at the width the
 * app gives it.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  BurrowCard, CardRow, CardNote, CARROT,
} from '@/components/burrow-chrome';
import { EnergyCard } from '@/components/energy-card';
import { GardenCard } from '@/components/garden-card';
import { BurrowPanel } from '@/components/burrow-card-panel';
import { HubTabs } from '@/components/hub-tabs';
import { CarrotPill } from '@/components/carrot-pill';
import { FarmButton } from '@/components/farm-button';
import { LeaderboardDrawer } from '@/components/leaderboard-drawer';
import { SoundButton } from '@/components/sound-button';
import '@/app/globals.css';

/**
 * The page's own wait formatter, kept in step by hand.
 *
 * Copied rather than imported because it is a local in `app/page.tsx` — a
 * module-level export just for a story would be the story reshaping the app,
 * which is the wrong direction. It is six lines and it only formats.
 */
function formatWait(ms: number | null): string {
  if (ms === null) return '-';
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

interface Args {
  /** Energy in hand. 0 is the state the whole card exists to announce. */
  energy: number;
  /** The ceiling the gauge is drawn against. */
  maxEnergy: number;
  /** Minutes until the next point trickles in; 0 for "the bar is full". */
  nextEnergyMins: number;
  /** Carrots standing in the garden, ready to take. */
  gardenReady: number;
  /** What the garden makes per hour at this level. */
  yieldPerHour: number;
  /** How much it holds before it stops making more. */
  gardenCapacity: number;
  /** The burrow's level — picks the building and names the card. */
  level: number;
  /** Carrots banked. The card derives the safe share from it. */
  stock: number;
  /** Price of the next level; 0 means MAX, which prints instead of a number. */
  upgradeCost: number;
  /** Can the player actually afford it right now. */
  canUpgrade: boolean;
  /** Hours of shield left. 0 hides the card — it only renders while it holds. */
  shieldHours: number;
  /** Traps on the shelf — the SHOP tile's badge. */
  trapsHeld: number;
  /** Traps already buried — with `trapsHeld`, decides whether BASE is lit. */
  trapsPlaced: number;
  /** Unshielded burrows — the RAIDING tile's badge. */
  openTargets: number;
  /** Lifetime carrots: decides whether STORY has a fresh chapter to badge. */
  lifetime: number;
  /** Season rank for the carrot pill's climb line; 0 for unranked. */
  rank: number;
  /** Season score needed to pass the place above; 0 for "nothing to chase". */
  toPass: number;
}

/**
 * The column, arranged as `app/page.tsx` arranges it.
 *
 * `.rr-burrow` is the app's own class, so the width cap, the scroll box and
 * the pointer rules are the shipped ones rather than a story's approximation.
 */
function BurrowColumn({
  energy, maxEnergy, nextEnergyMins, gardenReady, yieldPerHour, gardenCapacity,
  level, stock, upgradeCost, canUpgrade, shieldHours,
  trapsHeld, trapsPlaced, openTargets, lifetime, rank, toPass,
}: Args) {
  const capHours = yieldPerHour > 0 ? Math.round(gardenCapacity / yieldPerHour) : 0;
  return (
    <section className="rr-burrow">
      {shieldHours > 0 && (
        <BurrowCard>
          <CardRow label="SHIELD" value={formatWait(shieldHours * 3600_000)} tone={CARROT} />
          <CardNote>You were raided. Raids bounce off until it runs out.</CardNote>
        </BurrowCard>
      )}

      {/* Energy is its OWN object now — see energy-card.tsx. It does not share
          the wooden frame the cards below use, which is the whole point: the
          screen's most-read number stopped looking like the upgrade price. */}
      <div style={{ marginBottom: 10 }}>
        <EnergyCard
          energy={energy}
          maxEnergy={maxEnergy}
          note={
            nextEnergyMins <= 0
              ? undefined
              : energy <= 0
                ? `Out of energy. Next in ${formatWait(nextEnergyMins * 60_000)}.`
                : `+1 in ${formatWait(nextEnergyMins * 60_000)}.`
          }
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <GardenCard
          ready={gardenReady}
          yieldPerHour={yieldPerHour}
          capacity={gardenCapacity}
          capHours={capHours}
        />
      </div>

      <BurrowPanel
        level={level}
        stock={stock}
        yieldPerHour={yieldPerHour}
        upgradeCost={upgradeCost === 0 ? null : upgradeCost}
        canUpgrade={canUpgrade}
      />

      {/* The four doors. Fed from the same story args, so the badges can be
          driven to their edge cases (an empty shed, no open targets) from the
          controls rather than by reaching a game state. */}
      <HubTabs
        shop={{
          traps: { held: trapsHeld, placed: trapsPlaced, maxPlaced: 8 },
        } as never}
        targets={Array.from({ length: openTargets }, (_, i) => ({
          id: `t${i}`, name: `Burrow ${i}`, stock: 500, shielded: false,
        })) as never}
        lifetime={lifetime}
        onShop={() => {}}
        onProtect={() => {}}
        onRaid={() => {}}
        onStory={() => {}}
      />

      {/* GO FARM sits centred at the bottom in the app; here it follows the
          row so the two can be seen at the same scale. */}
      <div style={{ marginTop: 10 }}>
        <FarmButton label="Go farm" onClick={() => {}} />
      </div>
    </section>
  );
}

/**
 * A STANDING BOARD, without a server.
 *
 * `LeaderboardDrawer` fetches `/api/leaderboard` itself — which is right for
 * the app and useless in a story, where there is no season, no Redis and no
 * session. So the story answers that one request with a fixed board: the same
 * shape the route returns, with a crowned leader, a live "digging" row worth a
 * tap, and the viewer sitting mid-table so the highlighted row and the rank
 * line in the carrot pill both have something to show.
 *
 * Patching `fetch` rather than mocking the module: the component is under test
 * as it actually ships, including its poll and its own state — a stubbed
 * component would prove the story renders, not that the board does.
 */
const BOARD = {
  entries: [
    { rank: 1, playerId: 'p1', name: 'Thistle', score: 25000, lifetime: 41200, burrowLevel: 9, crowned: true },
    { rank: 2, playerId: 'p2', name: 'Ironwood', score: 9500, lifetime: 18400, burrowLevel: 7, crowned: false },
    { rank: 3, playerId: 'p3', name: 'Bramble', score: 6199, lifetime: 12050, burrowLevel: 6, crowned: false, digging: true },
    { rank: 4, playerId: 'p4', name: 'Clementine', score: 3140, lifetime: 9264, burrowLevel: 5, crowned: false },
    { rank: 5, playerId: 'me', name: 'mamadou', score: 3895, lifetime: 7313, burrowLevel: 4, crowned: false },
    { rank: 6, playerId: 'p6', name: 'GoldenEars49', score: 1036, lifetime: 2400, burrowLevel: 3, crowned: false },
    { rank: 7, playerId: 'p7', name: 'IronDigger92', score: 482, lifetime: 1180, burrowLevel: 2, crowned: false },
    { rank: 8, playerId: 'p8', name: 'AshenBramble85', score: 133, lifetime: 640, burrowLevel: 2, crowned: false },
    { rank: 9, playerId: 'p9', name: 'undefinedBuck15', score: 100, lifetime: 300, burrowLevel: 1, crowned: false },
    { rank: 10, playerId: 'p10', name: 'SlyKit59', score: 58, lifetime: 90, burrowLevel: 1, crowned: false },
  ],
  me: { rank: 5, score: 3895, toPass: 340 },
  season: { endsAt: new Date(Date.now() + 11 * 864e5).toISOString() },
};

/** Answer the board's own request; leave every other fetch alone. */
function stubBoardFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/leaderboard')) {
      return Promise.resolve(new Response(JSON.stringify(BOARD), {
        headers: { 'content-type': 'application/json' },
      }));
    }
    return real(input, init);
  }) as typeof fetch;
}
stubBoardFetch();

const meta: Meta<Args> = {
  title: 'UI/Burrow column',
  render: (args) => <BurrowColumn {...args} />,
  parameters: {
    layout: 'fullscreen',
    // The island, because these panels are dark wood on bright paint and a
    // grey canvas hides the one contrast that can fail.
    backgrounds: { disable: true },
  },
  decorators: [
    (Story, ctx) => (
      <div
        style={{
          minHeight: '100vh',
          padding: 12,
          boxSizing: 'border-box',
          // A stand-in for the island's sky and water: the real board is a Pixi
          // scene that costs seconds to boot, and what the chrome needs from it
          // is only that it is BRIGHT and blue-green.
          background: 'linear-gradient(180deg, #2a7d9e 0%, #3f9ab4 55%, #6fbf8f 100%)',
        }}
      >
        {/* The pill is `position: fixed` to the top edge, exactly as in the
            app — rendered INSIDE the column it escaped its wrapper and landed
            on the energy card. It belongs to the screen, so the story puts it
            on the screen. */}
        <CarrotPill
          stock={(ctx.args as Args).stock}
          fireKey={0}
          gain={0}
          rank={(ctx.args as Args).rank || null}
          toPass={(ctx.args as Args).toPass || null}
        />
        {/* The season board, as the app mounts it: a trophy button in the
            corner and a panel that opens from it. Closed on arrival — which is
            the behaviour worth checking here, since it used to open itself. */}
        <LeaderboardDrawer token={null} playerId="me" />
        {/* Bottom-right, and part of the screen rather than of any one panel —
            so the story carries it too, or the corner it lives in cannot be
            judged against the controls it shares an edge with. */}
        <SoundButton />
        <Story />
      </div>
    ),
  ],
  args: {
    energy: 30,
    maxEnergy: 60,
    nextEnergyMins: 5,
    gardenReady: 0,
    yieldPerHour: 40,
    gardenCapacity: 480,
    level: 1,
    stock: 1_940,
    upgradeCost: 250,
    canUpgrade: false,
    shieldHours: 0,
    trapsHeld: 4,
    trapsPlaced: 2,
    openTargets: 14,
    lifetime: 3_200,
    rank: 5,
    toPass: 340,
  },
  argTypes: {
    energy: { control: { type: 'range', min: 0, max: 120, step: 1 } },
    maxEnergy: { control: { type: 'range', min: 10, max: 120, step: 10 } },
    nextEnergyMins: { control: { type: 'range', min: 0, max: 120, step: 1 } },
    gardenReady: { control: { type: 'range', min: 0, max: 2000, step: 10 } },
    yieldPerHour: { control: { type: 'range', min: 0, max: 400, step: 4 } },
    gardenCapacity: { control: { type: 'range', min: 0, max: 4000, step: 40 } },
    level: { control: { type: 'range', min: 1, max: 10, step: 1 } },
    stock: { control: { type: 'range', min: 0, max: 200_000, step: 500 } },
    upgradeCost: { control: { type: 'range', min: 0, max: 5000, step: 50 } },
    shieldHours: { control: { type: 'range', min: 0, max: 48, step: 1 } },
    trapsHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    trapsPlaced: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    openTargets: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    lifetime: { control: { type: 'range', min: 0, max: 50_000, step: 100 } },
    rank: { control: { type: 'range', min: 0, max: 50, step: 1 } },
    toPass: { control: { type: 'range', min: 0, max: 5_000, step: 20 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** A fresh burrow, part-way through its refill: the column's ordinary day. */
export const Default: Story = {};

/**
 * OUT OF ENERGY — the state the card is built for.
 *
 * Everything that can say so, says so at once: the bolt turns, the gauge takes
 * the danger sprites, the count goes red, and the note gives a return time.
 * The thing to check here is that they AGREE — this is where a mark tinted by
 * CSS instead of picked by state would show as a gold bolt on a red bar.
 */
export const OutOfEnergy: Story = {
  args: { energy: 0, nextEnergyMins: 4 },
};

/** Full: the note disappears, because a full bar is not news. */
export const FullEnergy: Story = {
  args: { energy: 60, nextEnergyMins: 0 },
};

/** A garden worth harvesting and an upgrade that is actually affordable. */
export const Flush: Story = {
  args: { energy: 45, gardenReady: 864, yieldPerHour: 72, gardenCapacity: 864, canUpgrade: true },
};

/** Freshly raided: the shield card appears above everything else. */
export const Shielded: Story = {
  args: { shieldHours: 48, energy: 12, gardenReady: 120 },
};

/** The end of the upgrade ladder — the price prints MAX, not a number. */
export const MaxLevel: Story = {
  args: { level: 10, upgradeCost: 0, yieldPerHour: 320, gardenCapacity: 3840 },
};

/**
 * Every energy state stacked, for judging the card as a SET.
 *
 * One card answers "does this read?"; only the stack answers "does the fill
 * still say the same thing at a glance when it is nearly gone?", which is the
 * question a bar exists for. The 8/60 row is the one to watch — it is the last
 * state before empty, and the width there is what a player prices a dig
 * against.
 */
export const EnergyLadder: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 10, maxWidth: 400 }}>
      {[60, 30, 8, 0].map((e) => (
        <EnergyCard key={e} energy={e} maxEnergy={60} />
      ))}
    </div>
  ),
};
