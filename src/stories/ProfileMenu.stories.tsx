/**
 * The player's own panel.
 *
 * Storybook is the only place this can be eyeballed without a wallet and a
 * database, so the fetches are stubbed here rather than mocked in the component
 * — the component stays the one the app ships.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProfileMenu } from '@/components/profile-menu';
import '@/app/globals.css';

const PLAYER = {
  id: 'sol:demo',
  name: 'CursedWarren42',
  wallet: '7xKXtg2CW3xY9mSVzKqPmJfBnQ4dRhVaLpEwNcUuTbHs',
  guest: false,
};

/** The same panel for someone who pressed PLAY and never held a wallet. */
const GUEST = {
  id: 'guest:8f0c1a2e-0000-4000-8000-000000000000',
  name: 'LuckyClover7',
  wallet: null,
  guest: true,
};

const DAYS = [
  { day: today(0), carrots: 184, runs: 6, tilesDug: 212 },
  { day: today(1), carrots: 96, runs: 3, tilesDug: 120 },
  { day: today(2), carrots: 141, runs: 5, tilesDug: 178 },
  { day: today(4), carrots: 38, runs: 1, tilesDug: 44 },
];

const AGAINST = [
  raid('r1', 'against', 'SlyThumper7', 'looted', 62, 0, 40),
  raid('r2', 'against', 'IronFang13', 'damaged', 0, 35, 300),
  raid('r3', 'against', 'PaleClover', 'blocked', 0, 0, 1400),
];
const BY = [raid('r4', 'by', 'GrimSnare', 'looted', 25, 20, 90)];

function raid(
  id: string,
  direction: 'against' | 'by',
  otherName: string,
  result: 'looted' | 'damaged' | 'blocked',
  carrotsLooted: number,
  damage: number,
  minsAgo: number,
) {
  return {
    id,
    direction,
    otherName,
    otherId: `sol:${otherName}`,
    otherAvatar: null,
    result,
    carrotsLooted,
    damage,
    createdAt: new Date(Date.now() - minsAgo * 60_000).toISOString(),
  };
}

function today(minusDays: number): string {
  return new Date(Date.now() - minusDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Answers the panel's two endpoints, so the story is the real component.
 *
 * Installed at MODULE level rather than in an effect: the panel fetches on its
 * own first render, which happens before any effect runs, so a stub set up in
 * `useEffect` loses the race and the tab sits on "Loading..." forever.
 *
 * `unseen` is read from a mutable holder for the same reason — the story sets it
 * before rendering, not after.
 */
const stub = { unseen: 0 };

if (typeof window !== 'undefined') {
  const real = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : ((input as Request).url ?? input));
    if (url.includes('/api/player/history')) {
      if (init?.method === 'POST') return json({ ok: true });
      return json({
        days: DAYS,
        runs: [],
        raids: { against: AGAINST, by: BY, unseen: stub.unseen },
      });
    }
    if (url.includes('/api/player')) return json({ player: {}, token: 'stub' });
    return real(input as RequestInfo, init);
  }) as typeof window.fetch;
}

function json(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }),
  );
}

function Harness({
  unseen = 0,
  avatar = null,
  guest = false,
}: {
  unseen?: number;
  avatar?: string | null;
  guest?: boolean;
}) {
  // Set before the panel's first render, which is when it fetches.
  stub.unseen = unseen;
  return (
    <div style={{ height: 700, background: '#0d1117' }}>
      <ProfileMenu
        token="stub"
        player={guest ? GUEST : PLAYER}
        avatar={avatar}
        onConnectWallet={guest ? async () => true : null}
        onUpdated={() => {}}
        onClose={() => {}}
        onLogout={() => {}}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'HUD/Profile menu',
  component: Harness,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** What opens on a tap: your face, your name, your rabbits. */
export const Profile: Story = { args: { avatar: 'orange' } };

/** A player who has never picked — the default rabbit, not a hole. */
export const NoAvatarYet: Story = { args: { avatar: null } };

/** Robbed overnight: the badge is the whole point of the feature. */
export const WithUnreadRaids: Story = { args: { unseen: 3, avatar: 'gray' } };

/**
 * A guest's panel: no address to show, an offer in its place.
 *
 * The block stands exactly where the wallet line does for everyone else, which
 * is the point — this is the same panel, telling the truth about a different
 * kind of account rather than a reduced version of it.
 */
export const GuestBurrow: Story = { args: { guest: true, avatar: 'orange' } };
