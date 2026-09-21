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
import { EnergyCard } from '@/components/energy-card';
import { GardenCard } from '@/components/garden-card';
import { BurrowPanel } from '@/components/burrow-card-panel';
import { LoopBar } from '@/components/loop-bar';
import { NextStrip } from '@/components/next-strip';
import { nextAction } from '@/config/next-action';
import { TRAPS } from '@config/tuning';
import { DICTIONARIES } from '@/i18n/dictionaries';
import { KitRow } from '@/components/kit-row';
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
  /** Waterings in the bag — the left slot's count. */
  waterHeld: number;
  /** Hours of watering still running; 0 for "none". */
  waterMins: number;
  /** Feedings in the bag — the right slot's count. */
  fertiliserHeld: number;
  /** Minutes of feeding still running; 0 for "none". */
  fertiliserMins: number;
  /** The burrow's level — picks the building and names the card. */
  level: number;
  /** Carrots banked. The card derives the safe share from it. */
  stock: number;
  /** Price of the next level; 0 means MAX, which prints instead of a number. */
  upgradeCost: number;
  /** Can the player actually afford it right now. */
  canUpgrade: boolean;
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
  /**
   * Mining the board — the mode the raid kit belongs to.
   *
   * A control rather than a separate story, because what is checked is the
   * DIFFERENCE between the two floors.
   */
  placing: boolean;
  /** The kit row on the floor — shields held, and hours of one standing. */
  shieldHeld: number;
  shieldHours: number;
  smokeDays: number;
  bombHeld: number;
}

/**
 * The column, arranged as `app/page.tsx` arranges it.
 *
 * `.rr-burrow` is the app's own class, so the width cap, the scroll box and
 * the pointer rules are the shipped ones rather than a story's approximation.
 */
function BurrowColumn({
  energy, maxEnergy, nextEnergyMins, gardenReady, yieldPerHour, gardenCapacity,
  waterHeld, waterMins, fertiliserHeld, fertiliserMins,
  level, stock, upgradeCost, canUpgrade,
  trapsHeld, trapsPlaced, openTargets, lifetime, rank, toPass,
  shieldHeld, shieldHours, smokeDays, bombHeld, placing,
}: Args) {
  const capHours = yieldPerHour > 0 ? Math.round(gardenCapacity / yieldPerHour) : 0;
  return (
    <section className="rr-burrow">
      {/* NO SHIELD CARD — the board's own badge over the homestead carries the
          countdown now. It was dropped from the column because the two said
          the same thing and only one of them stands on the thing being
          protected. See `BurrowTerrain`'s `setShield`. */}

      {/* THE NEXT STRIP, first: the one line that says what to do now. In the
          app the quest card takes this slot while the arc runs; after it the
          line comes from `nextAction`, which this story drives from the same
          controls the cards read. */}
      <div style={{ marginBottom: 10 }}>
        <NextStrip
          action={nextAction(DICTIONARIES.en, {
            energy,
            runCost: 25,
            nextRunInMs: energy >= 25 ? null : nextEnergyMins * 60_000 * (25 - energy),
            gardenReady,
            gardenCapacity,
            shieldMs: shieldHours > 0 ? shieldHours * 3_600_000 : null,
            trapsLive: trapsPlaced,
            trapsPlaced,
            targets: Array.from({ length: openTargets }, (_, i) => ({
              name: `Burrow ${i}`, garden: 120 * (i + 1), shielded: false,
            })),
          })}
        />
      </div>

      {/* NO ENERGY CARD. The bar lives on the DIG slab of the loop bar now —
          the number is read at the moment of deciding to dig, which is the
          slab, not a card above the garden. */}

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

      {/* THE RAID KIT — only while PLACING, exactly as the app mounts it.
          
          It is in this story as well as its own because the floor is the only
          place its POSITION can be judged: its own story unpins it to read the
          slots, and here it is fixed to the corner it ships in. `placing` is a
          control so both modes can be seen — the resting burrow, which must
          NOT carry raid gear, and the placing screen, which must. */}
      {placing && (
        <KitRow
          held={{ shield: shieldHeld, trap: trapsHeld, bomb: bombHeld, lightning: 0, mirage: 0 }}
          shieldMs={shieldHours > 0 ? shieldHours * 3_600_000 : null}
          smokeDays={smokeDays}
          trapsPlaced={trapsPlaced}
          trapsMaxPlaced={TRAPS.MAX_PLACED}
          onShield={() => {}}
          /* THE TRAP SLOT AS A BUY — the placing floor's own affordance.
             Passing `onBuyTrap` is what turns the square from a readout into
             a press; the app passes it for exactly the same reason, and only
             while placing. Without these four props this story would show the
             resting readout on a placing floor, which is the drift the header
             warns about. */
          onBuyTrap={() => {}}
          trapCost={TRAPS.CARROT_COST}
          trapsMaxHeld={TRAPS.MAX_HELD}
          stock={stock}
          /* Null rather than 0 for "no window": the slot reads the absence,
             and a zero-length window would ring the icon in lamplight while
             saying "0m left". */
          water={{ held: waterHeld, activeMs: waterMins > 0 ? waterMins * 60_000 : null }}
          fertiliser={{
            held: fertiliserHeld,
            activeMs: fertiliserMins > 0 ? fertiliserMins * 60_000 : null,
          }}
          onPour={() => {}}
        />
      )}

      {/* THE LOOP BAR — DIG ▸ HOME ▸ RAID — on the floor, exactly as the app
          mounts it, and slid away while PLACING (the BACK slab takes the
          floor then). Fed from the same story args, so each slab's line can
          be driven to its edge cases (an empty bank, no open burrow, a full
          garden) from the controls rather than by reaching a game state. */}
      <LoopBar
        dig={{
          energy, maxEnergy, runCost: 25, crossingCost: 5,
          nextRunInMs: energy >= 25 ? null : nextEnergyMins * 60_000 * (25 - energy),
            regenPerHour: 30,
        }}
        home={{
          gardenReady,
          shieldMs: shieldHours > 0 ? shieldHours * 3_600_000 : null,
          trapsLive: trapsPlaced,
          trapsPlaced,
        }}
        raid={{
          open: openTargets,
          best: openTargets > 0 ? { name: `Burrow ${openTargets - 1}`, garden: 120 * openTargets } : null,
          bombs: bombHeld,
        }}
        questDoor={lifetime < 500 ? 'garden' : null}
        away={placing}
        onDig={() => {}}
        onHome={() => {}}
        onRaid={() => {}}
      />
      {placing && (
        <div style={{ marginTop: 10 }}>
          <FarmButton label="Back" onClick={() => {}} tone="back" />
        </div>
      )}
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
    waterHeld: 2,
    waterMins: 0,
    fertiliserHeld: 0,
    fertiliserMins: 0,
    level: 1,
    stock: 1_940,
    upgradeCost: 250,
    canUpgrade: false,
    trapsHeld: 4,
    trapsPlaced: 2,
    openTargets: 14,
    lifetime: 3_200,
    rank: 5,
    toPass: 340,
    placing: false,
    shieldHeld: 1,
    shieldHours: 0,
    smokeDays: 0,
    bombHeld: 3,
  },
  argTypes: {
    energy: { control: { type: 'range', min: 0, max: 120, step: 1 } },
    maxEnergy: { control: { type: 'range', min: 10, max: 120, step: 10 } },
    nextEnergyMins: { control: { type: 'range', min: 0, max: 120, step: 1 } },
    gardenReady: { control: { type: 'range', min: 0, max: 2000, step: 10 } },
    yieldPerHour: { control: { type: 'range', min: 0, max: 400, step: 4 } },
    gardenCapacity: { control: { type: 'range', min: 0, max: 4000, step: 40 } },
    waterHeld: { control: { type: 'range', min: 0, max: 9, step: 1 } },
    waterMins: { control: { type: 'range', min: 0, max: 240, step: 5 } },
    fertiliserHeld: { control: { type: 'range', min: 0, max: 9, step: 1 } },
    fertiliserMins: { control: { type: 'range', min: 0, max: 720, step: 15 } },
    level: { control: { type: 'range', min: 1, max: 10, step: 1 } },
    stock: { control: { type: 'range', min: 0, max: 200_000, step: 500 } },
    upgradeCost: { control: { type: 'range', min: 0, max: 5000, step: 50 } },
    trapsHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    trapsPlaced: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    openTargets: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    lifetime: { control: { type: 'range', min: 0, max: 50_000, step: 100 } },
    rank: { control: { type: 'range', min: 0, max: 50, step: 1 } },
    toPass: { control: { type: 'range', min: 0, max: 5_000, step: 20 } },
    shieldHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    shieldHours: { control: { type: 'range', min: 0, max: 48, step: 1 } },
    smokeDays: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    bombHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
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

/**
 * THE TWO BOTTLES, in the three states the slot has.
 *
 * Water is RUNNING with more in the bag (ringed, counting down, still
 * pressable — a second pour extends the first); fertiliser is EMPTY, which is
 * the state most worth looking at: it has to read as "a thing you do not have
 * yet" rather than as a broken image, because a player who has never opened
 * the right chest sees only this.
 */
export const Boosts: Story = {
  args: {
    gardenReady: 320, waterHeld: 3, waterMins: 95, fertiliserHeld: 0, fertiliserMins: 0,
  },
};

/**
 * Both running, and both bags empty — the slots carry the time instead of a
 * count. This is where the corner chip has to stay legible with "1h" in it
 * rather than a single digit.
 */
export const BoostsRunning: Story = {
  args: {
    // 1296 over 72/hour is the 18-hour ceiling a FED garden has — the column
    // derives `capHours` from these two, so setting them is how the story
    // shows a fertilised garden without a second control for it.
    gardenReady: 700, yieldPerHour: 72, gardenCapacity: 1296,
    waterHeld: 0, waterMins: 70, fertiliserHeld: 0, fertiliserMins: 480,
  },
};

/**
 * Freshly raided — and the column says NOTHING about it.
 *
 * Kept as a story precisely because that is the claim worth checking: the
 * shield now lives only on the board (see `Burrow.stories` → `Shielded`), so
 * the column under a shield must look exactly like the column without one.
 */
export const Shielded: Story = {
  args: { energy: 12, gardenReady: 120 },
};

/**
 * MINING THE BASE — the one screen the raid kit belongs to.
 *
 * The pair to look at is this against `Default`: the resting burrow carries
 * NOTHING in the bottom-left (the garden's bottles keep their own corner on the
 * right), and here the six raid slots appear on the floor where the launcher
 * tiles normally sit. If both floors look the same, the split has not happened.
 */
export const Placing: Story = {
  args: { placing: true, shieldHeld: 2, shieldHours: 0, smokeDays: 1, bombHeld: 5 },
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

/**
 * OUT OF BOMBS, MID-PLACEMENT — the state the trap slot's press exists for.
 *
 * The shed is empty and two bombs are already buried, which is where a
 * defender lands after their third free trap of the day. Until now the only
 * answer on this screen was to leave it: back out of placement, open the shed,
 * find the defence strip, buy, walk back in. Now the square that has always
 * REPORTED the count is the square that changes it.
 *
 * Why the row and not a slab on the floor: the floor has exactly one saturated
 * shape at a time, and while placing that shape is BACK (see farm-button.tsx —
 * "two 'press me' slabs on one floor make neither of them mean anything"). The
 * count and the way to change it also belong in the same place, and the count
 * was already here.
 *
 * What to judge: hover or focus the trap slot — its line should read "none
 * left. One costs 150 carrots". Does the slot look PRESSABLE next to the five
 * readouts beside it? That is the whole question: if it reads as just another
 * readout the affordance has failed, and if it shouts louder than BACK it has
 * failed the other way.
 */
export const PlacingOutOfBombs: Story = {
  args: {
    placing: true, trapsHeld: 0, trapsPlaced: 2,
    stock: 4_200, shieldHeld: 1, smokeDays: 0, bombHeld: 2,
  },
};

/**
 * OUT OF BOMBS AND OUT OF CARROTS — the slot dims rather than disappearing.
 *
 * `stock` is below one trap's price, so the square goes disabled. It is still
 * THERE, and its line still names the price: a player who cannot afford one
 * needs to learn what they are saving towards, and a slot that vanished would
 * teach nothing and read as the feature being missing.
 *
 * The dimming is only a hint — the server prices and refuses the purchase
 * regardless, exactly as it does for the shelf. This is the client being
 * polite, not the client being in charge.
 *
 * What to judge: does the dimmed slot read as "not yet" rather than "broken"?
 * It sits beside `smoke`, which is genuinely empty and inert, so the two
 * should NOT look the same — one is a door you cannot afford, the other is not
 * a door at all.
 */
export const PlacingBroke: Story = {
  args: {
    placing: true, trapsHeld: 0, trapsPlaced: 2,
    stock: 40, shieldHeld: 1, smokeDays: 0, bombHeld: 0,
  },
};

/**
 * THE SHED IS FULL — twelve held, and the press closes.
 *
 * MAX_HELD is a ceiling neither the grind nor money can pass, so there is
 * nothing to offer and the slot says so outright ("The shed is full") instead
 * of taking a press that would only be refused. Unlike the broke case this is
 * not a "not yet": it is the end of the line, and the wording is different for
 * that reason.
 *
 * What to judge: the slot should still carry its COUNT — a full shed is a good
 * state, and dimming it to look like an empty one would report success as
 * failure.
 */
export const PlacingShedFull: Story = {
  args: {
    placing: true, trapsHeld: 12, trapsPlaced: 8,
    stock: 999_999, shieldHeld: 2, smokeDays: 1, bombHeld: 5,
  },
};
