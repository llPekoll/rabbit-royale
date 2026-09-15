/**
 * THE QUEST CARD, at every point in the arc.
 *
 * The app shows one card and moves it forward as the player plays, so seeing
 * the DONE state means finishing a quest, and seeing the last quest means a
 * fortnight. Here the arc is a control: pick a quest, set its progress, and
 * the card draws it — on the island art, at the column's width, next to the
 * energy card it has to sit beside.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EnergyCard } from '@/components/energy-card';
import { QuestCard } from '@/components/quest-card';
import { QUESTS_ARC, questView, type QuestFacts } from '@/config/quests';
import '@/app/globals.css';

interface Args {
  /** Which quest of the arc to draw. */
  quest: string;
  /** Progress towards its goal; at or past the goal the CLAIM slab appears. */
  progress: number;
  pending: boolean;
}

/** Facts that put exactly `progress` on the chosen quest. */
function factsFor(id: string, progress: number): QuestFacts {
  const f: QuestFacts = {
    runsPlayed: 0, tilesDug: 0, lifetimeCarrots: 0, harvests: 0,
    trapsPlaced: 0, chestsOpened: 0, raidsPlayed: 0, marks: [],
  };
  switch (id) {
    case 'break-ground': f.tilesDug = progress; break;
    case 'come-home': f.runsPlayed = progress; break;
    case 'bring-it-in': f.harvests = progress; break;
    case 'bury-something':
    case 'hold-the-door': f.trapsPlaced = progress; break;
    case 'open-a-chest': f.chestsOpened = progress; break;
    case 'knock-on-a-door': f.raidsPlayed = progress; break;
    case 'look-up': f.marks = progress > 0 ? ['leaderboard'] : []; break;
    case 'read-the-stones': f.marks = progress > 0 ? ['codex:the-numbers'] : []; break;
    case 'the-thicket': f.lifetimeCarrots = progress; break;
  }
  return f;
}

function Column({ quest, progress, pending }: Args) {
  const q = QUESTS_ARC.find((x) => x.id === quest) ?? QUESTS_ARC[0];
  const view = questView(q, factsFor(q.id, progress));
  return (
    <section className="rr-burrow">
      <div style={{ marginBottom: 10 }}>
        <EnergyCard energy={60} maxEnergy={60} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <QuestCard quest={view} pending={pending} onClaim={() => {}} />
      </div>
    </section>
  );
}

const meta: Meta<Args> = {
  title: 'UI/Quest card',
  render: (args) => <Column {...args} />,
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <div
        className="rr-home"
        style={{
          height: '100vh',
          background: 'linear-gradient(180deg, #2a7d9e 0%, #3f9ab4 55%, #6fbf8f 100%)',
        }}
      >
        <Story />
      </div>
    ),
  ],
  argTypes: {
    quest: { control: 'select', options: QUESTS_ARC.map((q) => q.id) },
    progress: { control: { type: 'number', min: 0, max: 2500, step: 1 } },
  },
  args: { quest: 'break-ground', progress: 3, pending: false },
};
export default meta;

type Story = StoryObj<Args>;

export const FirstAsk: Story = {};
export const Done: Story = { args: { quest: 'break-ground', progress: 10 } };
export const ItemReward: Story = { args: { quest: 'open-a-chest', progress: 1 } };
export const HoldTheDoor: Story = { args: { quest: 'hold-the-door', progress: 1 } };
export const LastRung: Story = { args: { quest: 'the-thicket', progress: 1400 } };
