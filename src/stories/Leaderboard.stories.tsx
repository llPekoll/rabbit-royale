/**
 * The season board, and the one column on it that is alive.
 *
 * Every other field describes a PLAYER — their score, their burrow, what they
 * have banked over a lifetime. `digging` describes a RUN, happening while you
 * read the row, and it is the only reason to tap one: spectating someone who is
 * not on an island lands on the server's `not_playing` error, so a board that
 * does not say who is out is a board of buttons that mostly fail.
 *
 * These stories exist because that state cannot be reached locally. Presence
 * lives in a Redis set written by the WS server on `join`, so seeing a live row
 * on a dev machine means running the game server, Redis, and a second player.
 * The fetch is stubbed instead, which is the difference between checking this
 * in ten seconds and not checking it at all.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LeaderboardDrawer, type Entry } from '@/components/leaderboard-drawer';
import '@/app/globals.css';

const ROWS: Entry[] = [
  { rank: 1, playerId: 'a', name: 'Thistle', score: 25000, lifetime: 25000, burrowLevel: 3, crowned: true, digging: false },
  { rank: 2, playerId: 'b', name: 'Bramble', score: 6480, lifetime: 7310, burrowLevel: 4, crowned: false, digging: true },
  { rank: 3, playerId: 'c', name: 'Clementine', score: 3140, lifetime: 9260, burrowLevel: 5, crowned: false, digging: false },
  { rank: 4, playerId: 'd', name: 'mamadou', score: 1172, lifetime: 1172, burrowLevel: 3, crowned: false, digging: true },
  { rank: 5, playerId: 'me', name: 'undefinedBuck15', score: 57, lifetime: 57, burrowLevel: 1, crowned: false, digging: false },
];

/**
 * The rows the stub will answer with. Module-level and mutable on purpose —
 * see the patch below.
 */
let SERVED: Entry[] = [];

/**
 * Stub `fetch` for the drawer's own poll, AT MODULE SCOPE.
 *
 * The component owns its fetching (it polls every 20s, because presence goes
 * stale), so there is no prop to hand rows to — intercepting the request is the
 * honest way to drive it, and it exercises the real parsing path rather than a
 * test-only branch that could rot.
 *
 * Patched here rather than in an effect because the drawer fetches in ITS own
 * effect, and a child's effect runs before the parent's: the first request was
 * already in flight before a patch in `Harness` could land, so the board came
 * up empty and stayed that way until the 20s poll. Patching on import means the
 * stub is in place before any component mounts.
 */
if (typeof window !== 'undefined') {
  const real = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/api/leaderboard')) {
      return new Response(JSON.stringify({
        entries: SERVED,
        me: { rank: 5, score: 57 },
        season: { id: 1, endsAt: new Date(Date.now() + 13 * 864e5).toISOString() },
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    return real(input, init);
  };
}

function Harness({ entries }: { entries: Entry[] }) {
  // Set BEFORE the drawer mounts and fires its fetch. `useState`'s initialiser
  // runs during render, which is early enough; an effect would not be.
  useState(() => { SERVED = entries; });

  return (
    <div style={{ height: '100vh', background: '#0d1117', position: 'relative' }}>
      <LeaderboardDrawer
        token="storybook"
        playerId="me"
        onSpectate={(id) => console.log('spectate', id)}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Burrow/Season board',
  component: Harness,
  parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'desktop' } },
};
export default meta;
type Story = StoryObj<typeof Harness>;

/**
 * The mixed board — two players out, three not.
 *
 * What to look for: the live rows are the ONLY ones that can be clicked, they
 * carry the pulsing dot, and their subtitle swaps from the player's stats to
 * "digging now · tap to watch". The quiet rows dim rather than disappear —
 * they are still on the board, they are just not targets right now.
 */
export const Mixed: Story = { args: { entries: ROWS } };

/**
 * Nobody is out.
 *
 * The state a small game is in most of the time, and the one worth checking:
 * every row is inert, so the board must still read as information rather than
 * as a list of broken buttons.
 */
export const NobodyDigging: Story = {
  args: { entries: ROWS.map((e) => ({ ...e, digging: false })) },
};

/**
 * A busy evening. Mostly here to check the dot does not become noise when it
 * repeats down the column.
 */
export const Busy: Story = {
  args: { entries: ROWS.map((e, i) => ({ ...e, digging: i !== 4 })) },
};
