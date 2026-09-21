/**
 * THE GOAL LINE, with the chest in place of the word.
 *
 * WHAT THIS HAS TO PROVE, and what a screenshot of one number does not:
 *
 *   1. THE SPRITE IS THE GAME'S CHEST. It comes off the kit's `LOOT_BOX_ATLAS`
 *      through `LootChest`, cropped to its ink — the same sheet the board and
 *      the shop draw. It is painted into a `<canvas>` after the texture
 *      loads, so it is also the one part of this line that can silently fail
 *      to arrive; a story that renders the count and an empty box is exactly
 *      the bug worth catching here.
 *   2. IT HOLDS AT EVERY COUNT. The line is `0/1` on the tutorial island and
 *      `12/12` on a full one, and the chest must not shove the digits around
 *      as they widen — the strip is centred, so a counter that walks as it
 *      counts moves the whole readout under the player's eye.
 *   3. THE WORD SURVIVED THE CUT. The picture replaced it ON SCREEN only: the
 *      tooltip and the label still say it in full, in the player's language,
 *      which `Localised` shows in all four.
 *
 * WHY THE WORD WENT (Paul, 2026-09-20: "les chest avec une icone plutot que le
 * mot"). It cost ~50px of the strip's scarcest width to name an object the
 * player is looking at, and the strip is where the watched-player's name was
 * already short of room.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChestCount } from '@/components/chest-count';
import { DICTIONARIES } from '@/i18n/dictionaries';
import { LOCALE_LIST } from '@/i18n/locales';

const meta: Meta<typeof ChestCount> = {
  title: 'HUD/Chest count',
  component: ChestCount,
  parameters: { backgrounds: { default: 'rr-sky' } },
  decorators: [
    // In the strip's own plate, over the island: the count is grey-on-glass
    // there, and judging it on a white desk is judging a contrast the game
    // never shows.
    (Story) => (
      <div style={{
        minHeight: '100vh',
        padding: 24,
        background: 'linear-gradient(180deg, #2a7d9e 0%, #3f9ab4 55%, #6fbf8f 100%)',
      }}>
        <div className="rr-hud">
          <div className="rr-hud-plate" style={{ background: 'rgba(13, 17, 23, 0.82)' }}>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
  args: { taken: 0, total: 10, warnStage: 0 },
  argTypes: {
    taken: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    total: { control: { type: 'range', min: 1, max: 20, step: 1 } },
    warnStage: { control: { type: 'range', min: 0, max: 3, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<typeof ChestCount>;

/** A fresh island: nothing out of the ground yet. */
export const Fresh: Story = {};

/** The tutorial island, which holds exactly one. */
export const FirstIsland: Story = { args: { taken: 0, total: 1 } };

/** Mid-run, everyone digging. */
export const Halfway: Story = { args: { taken: 5, total: 10 } };

/**
 * The volcano is smoking, so the count goes red WITH it — at that point the
 * count IS the warning, said precisely, rather than a second reading
 * competing with the 🌊 beside it.
 */
export const Warning: Story = { args: { taken: 8, total: 10, warnStage: 2 } };

/** The last chest. The island erupts on this one. */
export const Last: Story = { args: { taken: 9, total: 10, warnStage: 3 } };

/**
 * THE WIDTHS, stacked. The digits widen from `0/1` to `12/12` and the chest
 * must stay put: the sprite is `flex-shrink: 0` on a `nowrap` line, so the
 * line grows to the right and the icon never moves or squashes.
 */
export const Widths: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
      {([[0, 1], [3, 10], [9, 10], [12, 12]] as const).map(([taken, total]) => (
        <div key={`${taken}/${total}`} className="rr-hud-plate" style={{ background: 'rgba(13, 17, 23, 0.82)' }}>
          <ChestCount taken={taken} total={total} />
        </div>
      ))}
    </div>
  ),
};

/**
 * WHAT THE PICTURE SAVED, per language — and that the word is still said.
 *
 * NOT FOUR RENDERED COMPONENTS. `LocaleProvider` takes no language: it reads
 * the browser and `localStorage`, so wrapping four copies of the count in four
 * providers renders the SAME language four times and proves nothing. The
 * dictionaries are plain objects, so this prints the line each one would have
 * put on the strip beside the one the strip prints now.
 *
 * THE READING: the left column is what the row costs today — the same four or
 * five characters in every language, because the sprite carries the noun. The
 * right is what it used to cost, and it is the longest in the languages whose
 * text already has the least room. That is the whole argument for the icon.
 */
export const Localised: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
      {LOCALE_LIST.map((meta) => (
        <div key={meta.code} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 28, fontSize: 18 }}>{meta.flag}</span>
          <div className="rr-hud-plate" style={{ background: 'rgba(13, 17, 23, 0.82)' }}>
            <ChestCount taken={3} total={10} />
          </div>
          <span style={{ color: '#9aa7b8', fontSize: 12, fontFamily: 'monospace' }}>
            was: {DICTIONARIES[meta.code].run.chests(3, 10)}
          </span>
        </div>
      ))}
    </div>
  ),
};
