/**
 * THE KIT ROW — everything you carry, on the ground it is read against.
 *
 * WHAT TO JUDGE HERE, in the order it matters:
 *
 *  1. CAN YOU TELL THE THREE STATES APART AT A GLANCE? Empty, held, and
 *     running are the row's whole vocabulary, and they are carried by colour
 *     and a corner chip rather than by words. `AllStates` puts all three in
 *     one row on purpose — a state that only reads when you already know what
 *     you are looking at is a state that does not read.
 *  2. IS THE ONE PRESSABLE SLOT FINDABLE? Exactly one thing in this row is an
 *     action (raising a shield); the other five are readouts. If the row looks
 *     uniformly pressable, or uniformly dead, that is the bug.
 *  3. DOES IT SURVIVE THE SEEKER? 800x360 is the target device, and the
 *     column is ~400px there. Six squares plus gaps have to fit beside cards
 *     that are already tight — switch the toolbar's viewport to check.
 *
 * ON THE ISLAND'S COLOURS, not on a grey canvas: these are dark squares with
 * bright pixel art in them, and the one contrast that can fail is against
 * bright water. The same decorator the burrow column's story uses, for the
 * same reason.
 */
import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { KitRow } from '@/components/kit-row';
import { FarmButton } from '@/components/farm-button';
import '@/app/globals.css';

const HOUR = 3_600_000;

interface Args {
  /** Shields in the bag — the only pressable slot in the row. */
  shieldHeld: number;
  /** Hours of shield still standing; 0 for "raids can land right now". */
  shieldHours: number;
  /** Whole days of smoke banked; 0 for "off". */
  smokeDays: number;
  /** Traps in the shed, and how many are buried. */
  trapHeld: number;
  trapsPlaced: number;
  bombHeld: number;
  lightningHeld: number;
  mirageHeld: number;
  /** The garden bottles at the end of the row: held, and hours running. */
  waterHeld: number;
  waterHours: number;
  fertiliserHeld: number;
  fertiliserHours: number;
}

function Row(args: Args) {
  return (
    <>
    <KitRow
      held={{
        shield: args.shieldHeld,
        trap: args.trapHeld,
        bomb: args.bombHeld,
        lightning: args.lightningHeld,
        mirage: args.mirageHeld,
      }}
      shieldMs={args.shieldHours > 0 ? args.shieldHours * HOUR : null}
      smokeDays={args.smokeDays}
      trapsPlaced={args.trapsPlaced}
      trapsMaxPlaced={8}
      onShield={() => {}}
      water={{
        held: args.waterHeld,
        activeMs: args.waterHours > 0 ? args.waterHours * HOUR : null,
      }}
      fertiliser={{
        held: args.fertiliserHeld,
        activeMs: args.fertiliserHours > 0 ? args.fertiliserHours * HOUR : null,
      }}
      onPour={() => {}}
    />
    {/* BACK, on the slab GO FARM vacates — the other half of this floor.
        It is in this story because the two ship together: the kit row only
        ever appears while placing, and so does this button. Judging the row
        without it is judging half a screen. */}
    <div style={backSlot}>
      <FarmButton label="Back" onClick={() => {}} tone="back" />
    </div>
    </>
  );
}

/** Centres the slab over the floor, which `position: fixed` does in the app. */
const backSlot: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 10,
  transform: 'translateX(-50%)',
};

const meta: Meta<Args> = {
  title: 'UI/Kit row',
  render: (args) => <Row {...args} />,
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: '100vh',
          boxSizing: 'border-box',
          /* ON THE FLOOR, because that is where the row lives.
             The first cut laid it out at the top of the frame, which read as a
             toolbar and is the one thing this row is not: in the app it stands
             in the bottom-left corner on top of the launcher tiles, at thumb
             height. A story that shows it anywhere else is judging a different
             control. Padded to the same 10px the app's floor uses. */
          display: 'flex',
          alignItems: 'flex-end',
          padding: 10,
          /* Room under the row for the BACK slab, which is absolutely
             positioned against this box and would otherwise share the row's
             band. In the app the two stack for real (`--rr-back-h`); here the
             gap is reproduced by hand. */
          paddingBottom: 74,
          // The BACK slab is absolutely centred against this box — see
          // `backSlot`. Without it the slab would escape to the viewport.
          position: 'relative',
          // A stand-in for the island's sky and water, which is what the row's
          // dark squares actually sit on. See the header.
          background: 'linear-gradient(180deg, #2a7d9e 0%, #3f9ab4 55%, #6fbf8f 100%)',
        }}
      >
        {/* UNPINNED, and widened back.
            `position: fixed` would park every variant in the same viewport
            corner, stacked on top of each other and cropped by the frame, so
            the story lays the row out in flow instead — and the corner it
            ships in is reproduced by the wrapper above rather than lost.

            CENTRED AT ITS OWN WIDTH, which is what the shipped row is now.
            It used to span the floor edge to edge so the garden bottles could
            sit at the FAR corner while the raid kit held the near one, and the
            story stretched it to `width: 100%` to reproduce that. The groups
            are marked off by captions and seams today (see `Cluster`), so the
            row is only as wide as its three clusters and is centred on the
            floor — stretched, it would be judging
            a spacing the app no longer has.
            Whether it clears the mute and the tiles is judged in the burrow
            column's story, which mounts the real floor. */}
        <style>
          {`.rr-kit-row {
              position: static !important;
              /* The row sizes to its clusters and centres inside the floor,
                 exactly as margin-inline auto does in the app. The flex item
                 has to span the line for that to have anything to centre in.
                 (No backticks in here: this is inside a template literal.) */
              flex: 1;
              display: flex !important;
              justify-content: center;
              /* The shipped row centres with left:50% + translateX(-50%),
                 which only works while it is fixed. Unpinned, the translate
                 survives and drags the row half its width off the floor. */
              transform: none !important;
            }
            /* BACK is pinned to the middle of the floor by globals.css, which
               in a story would centre it on the whole frame rather than on the
               strip below. Laid out in flow it sits in the row's own line. */
            .rr-farm-btn { position: static !important; transform: none !important; }`}
        </style>
        <Story />
      </div>
    ),
  ],
  args: {
    shieldHeld: 1,
    shieldHours: 0,
    smokeDays: 0,
    trapHeld: 4,
    trapsPlaced: 2,
    bombHeld: 3,
    lightningHeld: 0,
    mirageHeld: 1,
    waterHeld: 2,
    waterHours: 0,
    fertiliserHeld: 0,
    fertiliserHours: 0,
  },
  argTypes: {
    shieldHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    shieldHours: { control: { type: 'range', min: 0, max: 48, step: 1 } },
    smokeDays: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    trapHeld: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    trapsPlaced: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    bombHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    lightningHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    mirageHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    waterHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    waterHours: { control: { type: 'range', min: 0, max: 24, step: 1 } },
    fertiliserHeld: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    fertiliserHours: { control: { type: 'range', min: 0, max: 24, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** An ordinary kit: some of everything, nothing running. */
export const Default: Story = {};

/**
 * A BRAND NEW PLAYER — nothing at all.
 *
 * The state most worth looking at, and the reason the row does not hide empty
 * slots: this is what someone sees before they have ever opened the shop, and
 * it has to read as "here are six things that exist and you have none" rather
 * than as six broken images. If it reads as clutter instead of as a promise,
 * that is the argument for cutting the row down.
 */
export const Empty: Story = {
  args: {
    shieldHeld: 0, shieldHours: 0, smokeDays: 0,
    trapHeld: 0, trapsPlaced: 0, bombHeld: 0, lightningHeld: 0, mirageHeld: 0,
    waterHeld: 0, waterHours: 0, fertiliserHeld: 0, fertiliserHours: 0,
  },
};

/**
 * DUG IN — shield up, smoke up, ground full of traps.
 *
 * Three lamplit rings at once. Check they still read as three separate facts
 * rather than as one gold blur, and that the offensive half beside them is
 * visibly the dimmer group.
 */
export const DugIn: Story = {
  args: {
    shieldHeld: 2, shieldHours: 5, smokeDays: 2,
    trapHeld: 4, trapsPlaced: 8, bombHeld: 0, lightningHeld: 0, mirageHeld: 0,
    waterHeld: 0, waterHours: 3, fertiliserHeld: 1, fertiliserHours: 0,
  },
};

/**
 * ARMED FOR A RAID — nothing defensive, a bag full of offence.
 *
 * The mirror of `DugIn`, and the pair is the point: the row should tell you
 * which kind of player you are at a glance, before any number is read.
 */
export const Armed: Story = {
  args: {
    shieldHeld: 0, shieldHours: 0, smokeDays: 0,
    trapHeld: 0, trapsPlaced: 0, bombHeld: 12, lightningHeld: 4, mirageHeld: 2,
    waterHeld: 0, waterHours: 0, fertiliserHeld: 0, fertiliserHours: 0,
  },
};

/**
 * ALL THREE STATES IN ONE ROW — the readability test.
 *
 * Shield is RUNNING (ringed, counting down), traps and bomb are HELD (lit,
 * counted), smoke and lightning are EMPTY (dimmed, no chip). If you cannot
 * sort these three groups without reading the chips, the states are not
 * carrying their weight.
 */
export const AllStates: Story = {
  args: {
    shieldHeld: 1, shieldHours: 6, smokeDays: 0,
    trapHeld: 4, trapsPlaced: 3, bombHeld: 2, lightningHeld: 0, mirageHeld: 0,
    waterHeld: 3, waterHours: 0, fertiliserHeld: 0, fertiliserHours: 2,
  },
};

/**
 * THE CHIPS AT THEIR WIDEST — every corner carrying two characters.
 *
 * The corner is 11px and the type is 8px pixel, so "12" and "47h" are where it
 * either holds or overflows. A count at its cap on every slot at once is the
 * worst case the row can actually reach.
 */
export const WideChips: Story = {
  args: {
    shieldHeld: 20, shieldHours: 47, smokeDays: 3,
    trapHeld: 12, trapsPlaced: 8, bombHeld: 20, lightningHeld: 20, mirageHeld: 20,
    waterHeld: 20, waterHours: 23, fertiliserHeld: 20, fertiliserHours: 12,
  },
};
