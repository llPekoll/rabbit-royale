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

/**
 * A FEUD, which is what the log is actually for.
 *
 * One player who has come back three times, and one payback in the middle of
 * it: the two oldest raids are settled and struck through, the one that
 * landed AFTER the payback is still owed and keeps its button. The rows
 * STACK — three visits are three lines, never one line saying "x3".
 */
const FEUD_AGAINST = [
  raid('f1', 'against', 'NorminaskyTV', 'looted', 173, 0, 60 * 24),
  raid('f2', 'against', 'NorminaskyTV', 'looted', 202, 0, 60 * 48),
  raid('f3', 'against', 'NorminaskyTV', 'looted', 151, 0, 60 * 96),
  raid('f4', 'against', 'PaleClover', 'looted', 88, 0, 60 * 3),
];
/** The payback: after f2/f3, before f1. So f1 stays open. */
const FEUD_BY = [
  raid('f5', 'by', 'NorminaskyTV', 'looted', 287, 0, 60 * 36),
  raid('f6', 'by', 'SilentHop64', 'looted', 110, 0, 60 * 168),
];

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
const stub = { unseen: 0, feud: false };

if (typeof window !== 'undefined') {
  const real = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : ((input as Request).url ?? input));
    if (url.includes('/api/player/history')) {
      if (init?.method === 'POST') return json({ ok: true });
      return json({
        days: DAYS,
        runs: [],
        raids: stub.feud
          ? { against: FEUD_AGAINST, by: FEUD_BY, unseen: stub.unseen }
          : { against: AGAINST, by: BY, unseen: stub.unseen },
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
  feud = false,
}: {
  unseen?: number;
  avatar?: string | null;
  guest?: boolean;
  /** Show the repeat-raider fixtures, with one score settled. */
  feud?: boolean;
}) {
  // Set before the panel's first render, which is when it fetches.
  stub.unseen = unseen;
  stub.feud = feud;
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
        onAbandon={() => {}}
        onRevenge={() => {}}
        // Standing in for the socket: one raider out digging, one at home,
        // so both live dots are on screen at once.
        presence={{ 'sol:NorminaskyTV': 'digging', 'sol:PaleClover': 'home' }}
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

/**
 * A FEUD, on the History tab — the raid log as a ledger of open scores.
 *
 * NorminaskyTV has been three times. One payback sits between the second
 * visit and the latest, so the two older lines are struck through and the
 * newest is still owed: the mark says "answered", and an attack that landed
 * after the answer is a fresh debt. Open rows carry a live dot and the
 * REVENGE button; settled ones carry neither.
 */
export const Feud: Story = { args: { feud: true, avatar: 'brown', unseen: 1 } };
