/**
 * The door into someone else's burrow.
 *
 * Worth a story because the button's whole job is to answer "is it worth going
 * out?", and that answer is a number it computes from the target list — so the
 * states that matter are the ones where that number is zero for two different
 * reasons: nobody has registered, or everybody is shielded. Those read very
 * differently to a player and must not look the same.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RaidButton } from '@/components/raid-panel';
import type { Target } from '@/components/use-raid';
import '@/app/globals.css';

const t = (id: string, name: string, stock: number, shielded = false): Target =>
  ({ id, name, stock, shielded, avatar: null });

function Frame({ targets }: { targets: Target[] }) {
  return (
    <div style={{ background: '#0d1117', padding: 16, width: 380 }}>
      <RaidButton targets={targets} onOpen={() => console.log('open')} />
    </div>
  );
}

const meta: Meta<typeof Frame> = {
  title: 'Burrow/Raid button',
  component: Frame,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof Frame>;

/** A fat night: the total is what decides whether to go. */
export const WorthGoing: Story = {
  args: { targets: [t('a', 'Clementine', 4820), t('b', 'Bramble', 1960), t('c', 'mamadou', 340)] },
};

/** Thin pickings — lit, but not shouting. */
export const Slim: Story = {
  args: { targets: [t('a', 'undefinedHop64', 120), t('b', 'undefinedBuck15', 57)] },
};

/**
 * Everyone is shielded. The distinction that matters: there ARE players, they
 * are simply all protected — a different sentence from an empty street, and a
 * different decision (wait, rather than give up).
 */
export const AllShielded: Story = {
  args: { targets: [t('a', 'Clementine', 4820, true), t('b', 'Bramble', 1960, true)] },
};

/** Nobody registered yet. The state a new deployment is in. */
export const Empty: Story = { args: { targets: [] } };
