/**
 * The garden, growing — over the real backdrop, at the real scale.
 *
 * The field is a READOUT: how busy it is with sprouting carrots says how full
 * the garden is, and how full the garden is says whether it is worth coming
 * back. That only works if the difference between an empty garden and a ripe
 * one is legible at a glance, which is a judgement no unit test can make. Hence
 * these: the same component at fixed fullnesses, side by side.
 *
 * The `progress` control is the whole instrument. Drag it and the field's
 * BUSYNESS changes, not its frame — see garden-growth.ts for why driving the
 * frame from garden fullness would have produced 35 motionless sprites.
 */
import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CarrotField } from '@/components/carrot-field';
import { gardenCapacity, gardenProgress } from '@/lib/game/garden-growth';

const ART = '/assets/island/burrow.webp';

interface Args {
  /** Garden fullness, 0..1. `null` runs the signed-out decorative loop. */
  progress: number | null;
  /** Crop to the field, so the carrots are big enough to actually judge. */
  zoomToField: boolean;
}

/**
 * The backdrop and the crop, layered exactly as the app layers them.
 *
 * Same source resolution and both `cover`, which is what puts the carrots in
 * the furrows without a single hardcoded offset.
 */
function Field({ progress, zoomToField }: Args) {
  // The field occupies this box in the art's 1376x768 — see the flood-fill in
  // tools/plant_carrots.py. Used only to frame the story.
  const crop = zoomToField
    ? { transform: 'scale(2.6)', transformOrigin: '49.8% 66.8%' }
    : undefined;

  return (
    <div
      style={{
        position: 'relative', width: '100%', aspectRatio: '1376 / 768',
        overflow: 'hidden', background: '#3f9142',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, ...crop }}>
        <img
          src={ART}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', imageRendering: 'pixelated',
          }}
        />
        <CarrotField
          progress={progress}
          // Same box as the art, so the two layers cannot drift.
          className="rr-story-crop"
        />
      </div>
      <style>{`
        .rr-story-crop {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; image-rendering: pixelated;
        }
      `}</style>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'Burrow/Carrot field',
  render: (args) => <Field {...args} />,
  args: { progress: 0.5, zoomToField: true },
  argTypes: {
    progress: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * A garden about half full. Carrots pop steadily; roughly half the plots stand.
 *
 * The reference picture — most of a player's visits land somewhere near here.
 */
export const HalfGrown: Story = {};

/**
 * Just harvested. Bare soil, and the occasional sprout.
 *
 * Deliberately NOT still: a field with nothing happening in it reads as a
 * broken asset rather than as an empty field, so even at zero it ticks over.
 */
export const JustHarvested: Story = { args: { progress: 0 } };

/**
 * Ripe, and worth a trip back — plots popping constantly, the field full.
 *
 * Put this beside `JustHarvested`: if you cannot tell them apart across the
 * room, the readout has failed at the only job it has.
 */
export const ReadyToHarvest: Story = { args: { progress: 1 } };

/**
 * Signed out: no garden, so the field runs its slow decorative loop instead.
 *
 * It has to look alive without implying the viewer owns a farm — this is the
 * wallpaper behind "connect your wallet", and the person looking at it has no
 * burrow yet. A full two-minute turn, so give it a moment.
 */
export const SignedOutLoop: Story = { args: { progress: null } };

/** The whole homestead, for checking the field sits right in the picture. */
export const InContext: Story = { args: { zoomToField: false } };

/**
 * A harvest, live: full field, then the button empties it and it regrows.
 *
 * The moment the feature exists for. Collecting has to have a visible
 * consequence on the PLACE, not just on a counter somewhere — otherwise the
 * garden is a number with a picture next to it.
 */
export const HarvestCycle: Story = {
  render: () => {
    const [level] = useState(1);
    const [ready, setReady] = useState(gardenCapacity(1));
    const [harvests, setHarvests] = useState(0);

    // Refill over ~20s so the regrowth is watchable. The real garden takes 12
    // hours; a story that honest would be a still image.
    useEffect(() => {
      const id = setInterval(
        () => setReady((r) => Math.min(gardenCapacity(level), r + gardenCapacity(level) / 40)),
        500,
      );
      return () => clearInterval(id);
    }, [level]);

    return (
      <div>
        <Field progress={gardenProgress(ready, level)} zoomToField />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
          <button
            onClick={() => { setReady(0); setHarvests((h) => h + 1); }}
            disabled={ready < 1}
          >
            Harvest
          </button>
          <span style={{ color: '#8b949e', font: '12px ui-monospace, monospace' }}>
            {Math.floor(ready)} / {gardenCapacity(level)} &middot; {harvests} harvested
            {' '}&middot; refilling for the story&apos;s sake
          </span>
        </div>
      </div>
    );
  },
};
