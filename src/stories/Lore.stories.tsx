/**
 * The codex: the scroll in the burrow, and the chapters behind it.
 *
 * Framed like the Shop stories — the Seeker's landscape, panels in a column
 * over the burrow art — because the button is judged BESIDE the things it
 * competes with, and the panel is judged at the width it actually opens at.
 *
 * The question each story answers is a different one about the same panel:
 * whether a brand-new player finds something to open at all, whether a locked
 * chapter says enough to be worth digging for, and whether the parchment holds
 * up once every chapter is unsealed and the shelf is full.
 *
 * Interactive: press the scroll, click through the chapters. Escape or a tap on
 * the scrim closes it, like every other panel in the game.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LoreButton, LoreCodex } from '@/components/lore-codex';
import { LORE } from '@/config/lore';
import {
  LauncherTab, BurrowCard, CardRow, CardNote, BurrowMeter, BurrowButton,
  CARROT, LAMP,
} from '@/components/burrow-chrome';
import { TitleText } from '@domin8/arcade-kit';
import { LootChest, CHEST_ASPECT } from '@/components/loot-chest';
import '@/app/globals.css';

const ART = '/assets/island/burrow_generated.webp';

function Harness({ lifetime, open = true }: { lifetime: number; open?: boolean }) {
  const [codexOpen, setCodexOpen] = useState(open);

  return (
    <div style={{
      width: 900, height: 500, position: 'relative',
      overflow: 'hidden', background: '#2d5a27',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${ART})`, backgroundSize: 'cover',
        backgroundPosition: 'center', imageRendering: 'pixelated',
      }} />
      {/* Scrolls, like the real `.rr-burrow` column does — without this the
          harness clips the bottom tab on a short viewport and invents a bug
          the app does not have. */}
      <div style={{
        position: 'relative', width: 380, height: '100%', padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        overflowY: 'auto', boxSizing: 'border-box',
        background: 'linear-gradient(90deg, rgba(13,17,23,0.82) 60%, rgba(13,17,23,0))',
      }}>
        <div className="rr-burrow-head">
          <TitleText scale={1.6} style={{ color: LAMP }}>YOUR BURROW</TitleText>
        </div>

        {/* Neighbour cards, so the scroll tab is judged BESIDE the chrome it
            sits under rather than alone on a page. */}
        <BurrowCard>
          <CardRow label="ENERGY" value="12/30" tone={CARROT} />
          <BurrowMeter value={12} max={30} label="Energy" />
          <CardNote>+1 in 4m.</CardNote>
        </BurrowCard>

        <BurrowCard>
          <CardRow label="GARDEN" value="+48" tone={CARROT} />
          <CardNote>6/hour &middot; holds 144 (24h)</CardNote>
          <BurrowButton>HARVEST</BurrowButton>
        </BurrowCard>

        <LauncherTab
          art={<LootChest size={52} />}
          spriteSize={52}
          spriteHeight={Math.round(52 * CHEST_ASPECT)}
          label="SHOP"
          sub="2/8 BURIED"
          count={3}
          ink={LAMP}
        />

        <LoreButton lifetime={lifetime} onOpen={() => setCodexOpen(true)} />
      </div>

      {codexOpen && (
        <LoreCodex lifetime={lifetime} onClose={() => setCodexOpen(false)} />
      )}
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Burrow/Lore codex',
  component: Harness,
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** A rabbit who has never dug. Chapter I is open at zero on purpose: a codex
 *  that is entirely sealed on first sight reads as broken, not as a promise. */
export const FirstDay: Story = { args: { lifetime: 0 } };

/** Mid-game: some chapters read, the next one in sight. The ordinary case. */
export const PartwayThrough: Story = { args: { lifetime: 3_400 } };

/** The moment a chapter opens — the button wears "New chapter" rather than
 *  the tally, which is the whole reason to come back to this panel. */
export const JustUnlocked: Story = { args: { lifetime: 8_120 } };

/** Everything unsealed. The shelf is at its longest here, which is where the
 *  two-column layout is under the most pressure. */
export const Complete: Story = {
  args: { lifetime: LORE[LORE.length - 1].unlockAt + 5_000 },
};

/** The way in, with the panel shut — how the scroll reads in the column. */
export const ButtonOnly: Story = { args: { lifetime: 3_400, open: false } };
