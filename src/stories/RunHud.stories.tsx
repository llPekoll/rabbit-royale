/**
 * The in-run HUD, driven the way the SOCKET drives it.
 *
 * Written after a bug nobody could reproduce: "I pick up a carrot and the
 * counter stays put". Every existing story of this bar passed `carrots` as a
 * prop and drew it, which proves the bar can render a number and nothing else.
 * The real HUD never receives a number — it receives a MAP of rabbits and
 * looks itself up in it, and that lookup is where a counter goes quiet.
 *
 * So these stories replay the actual sequence: a snapshot arrives, then a
 * `rabbit_moved` with a higher carrot count, exactly as `use-game-socket`
 * applies them. If the bar does not move here, the bug is in the HUD; if it
 * does, the bug is upstream of it — which is worth knowing either way.
 */
import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RunHud, type HudGame } from '@/components/run-hud';
import type { ClientRabbit } from '@/components/use-game-socket';

const ME = 'player-me';
const OTHER = 'player-other';

const rabbit = (over: Partial<ClientRabbit> = {}): ClientRabbit => ({
  playerId: ME,
  name: 'GoldenEars49',
  tile: 120,
  energy: 18,
  carrots: 0,
  alive: true,
  crowned: false,
  ...over,
});

interface Args {
  /** Carrots the server reports after the dig. */
  carrots: number;
  /** Seconds between each simulated `rabbit_moved`. */
  every: number;
  /** Watch someone else instead of playing. */
  spectating: boolean;
  /** Break the id the HUD looks itself up by — the suspected failure. */
  mismatchedId: boolean;
}

/**
 * Replays what the socket hook does on `rabbit_moved`:
 * `setRabbits(prev => new Map(prev).set(r.playerId, r))`.
 */
function Scene({ carrots, every, spectating, mismatchedId }: Args) {
  const [rabbits, setRabbits] = useState<Map<string, ClientRabbit>>(
    () => new Map([
      [ME, rabbit()],
      [OTHER, rabbit({ playerId: OTHER, name: 'Rival', carrots: 3, tile: 99 })],
    ]),
  );
  const [digs, setDigs] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDigs((n) => {
        const next = n + 1;
        setRabbits((prev) => {
          const m = new Map(prev);
          // The one line that matters, copied from `use-game-socket`.
          m.set(ME, rabbit({ carrots: carrots * next, energy: Math.max(0, 18 - next) }));
          // The rival digs too. Without this, `Spectating` showed a number
          // frozen in the fixture — which is the very thing these stories were
          // written to stop doing: a counter that cannot move proves nothing
          // about a counter that will not move.
          m.set(OTHER, rabbit({
            playerId: OTHER, name: 'Rival', tile: 99,
            carrots: 3 + next, energy: Math.max(0, 15 - next),
          }));
          return m;
        });
        return next;
      });
    }, every * 1000);
    return () => window.clearInterval(id);
  }, [carrots, every]);

  // `me` as the hook derives it: `rabbits.get(playerId)`. When the id the page
  // holds and the id the server sends disagree, this is null and every number
  // falls back to zero — which is exactly what "the counter never moves" looks
  // like from the outside.
  const lookupId = mismatchedId ? 'player-me-WRONG' : ME;
  const game: HudGame = {
    rabbits,
    me: rabbits.get(lookupId) ?? null,
    warnStage: 0,
  };

  return (
    <div style={{ padding: 16, background: '#0d1420', minHeight: 200 }}>
      <div className="rr-overlay" style={{ position: 'static' }}>
        <RunHud game={game} name="GoldenEars49" spectating={spectating ? OTHER : null} />
      </div>
      <p style={{ color: '#9aa7b8', fontSize: 12, marginTop: 24, fontFamily: 'monospace' }}>
        digs: {digs} - server says carrots={carrots * digs} - me={game.me ? 'found' : 'NULL'}
        {spectating && ' - watching, so the HUD reads the RIVAL, not me'}
      </p>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'HUD/Run HUD',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { carrots: 1, every: 1, spectating: false, mismatchedId: false },
  argTypes: {
    carrots: { control: { type: 'range', min: 0, max: 5, step: 1 } },
    every: { control: { type: 'range', min: 1, max: 5, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * A carrot every second. The counter has to climb 1, 2, 3 — if it sits at 0
 * here, the HUD itself is at fault and nothing upstream needs looking at.
 */
export const Default: Story = {};

/**
 * The id the page looks up is not the id the server sends, so `me` is null.
 *
 * Every number reads zero AND the energy bar sits empty — the two fall
 * together because they come from the same `subject`. That pairing is the
 * tell, and it is worth stating because it is easy to get backwards: an
 * energy bar that DOES move rules this out only while playing. A spectator
 * sees `me` null by definition and still gets full numbers, from the watched
 * rabbit — see `Spectating`.
 */
export const MismatchedId: Story = { args: { mismatchedId: true } };

/**
 * Watching someone else: their numbers, and it says so.
 *
 * `me` is null here and that is CORRECT — a spectator has no rabbit of their
 * own. The numbers come from the watched rabbit instead, and they have to
 * climb: a frozen rival would make this story prove nothing.
 */
export const Spectating: Story = { args: { spectating: true } };

/** Nothing dug yet. The honest zero, for comparison with the broken one. */
export const Fresh: Story = { args: { carrots: 0 } };
