/**
 * The opening crawl — the sign-in screen's story.
 *
 * THIS IS THE TUNING HARNESS. The crawl is four numbers wearing a trenchcoat
 * (perspective, tilt, travel, duration) and every one of them was wrong on the
 * first try in a way no amount of reading the CSS revealed: at 26deg on a 340px
 * perspective there was no visible recession at all, and at 52deg on 240px the
 * whole chapter folded into an unreadable band along the bottom edge. Both
 * looked perfectly reasonable in source. So the knobs are controls here, live,
 * over the real art and under the real sign-in block — the two things the crawl
 * has to coexist with and the two things a component-only preview leaves out.
 *
 * The values a control starts at are the ones that SHIP (see globals.css). Move
 * one, find something better, and copy the number back into the stylesheet;
 * nothing here writes to it.
 *
 * `Default` is the shipping screen, frozen at nothing — it plays. `Frozen` is
 * the one to reach for when judging legibility: it parks the animation at a
 * chosen second so you can look at a line instead of chasing it.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { LoreCrawl } from '@/components/lore-crawl';
import { CarrotField } from '@/components/carrot-field';
import { burrowArt } from '@/config/burrowArt';
import '@/app/globals.css';

const LOGO = '/assets/ui/RR-Logo_Banner.webp';

interface Knobs {
  /** Distance to the vanishing point, px. Shorter = more dramatic. */
  perspective: number;
  /** How far the plane tips away, degrees. */
  tilt: number;
  /** How far the text travels in one pass, vh. */
  run: number;
  /** Seconds for one pass. */
  seconds: number;
  /**
   * Park the animation at this second instead of playing it. -1 plays.
   * The whole point of the harness: a crawl you cannot hold still is a crawl
   * you cannot judge the type on.
   */
  freezeAt: number;
}

/**
 * The signed-out screen, rebuilt.
 *
 * Deliberately a COPY of what page.tsx renders when `player` is null rather
 * than the page itself: the page mounts a wallet session, a socket and a Pixi
 * canvas, none of which exist in Storybook and none of which the crawl needs.
 * What it does reproduce exactly is the stacking — art, crawl, then the
 * bottom-anchored sign-in column — because that stacking IS the thing under
 * test. If the two ever drift, the give-away is the crawl passing in front of
 * the wordmark here and behind it in the app.
 */
function Screen(k: Knobs) {
  const host = useRef<HTMLDivElement>(null);

  // The knobs reach the CSS the same way the stylesheet does — through the
  // cascade — so nothing here is a second implementation of the effect.
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const crawl = root.querySelector<HTMLElement>('.rr-crawl');
    const stage = root.querySelector<HTMLElement>('.rr-crawl-stage');
    const text = root.querySelector<HTMLElement>('.rr-crawl-text');
    if (!crawl || !stage || !text) return;

    crawl.style.perspective = `${k.perspective}px`;
    stage.style.transform = `rotateX(${k.tilt}deg)`;
    text.style.setProperty('--crawl-run', `${k.run}vh`);
    text.style.animationDuration = `${k.seconds}s`;

    if (k.freezeAt >= 0) {
      // A negative delay starts the animation already that far in; pausing on
      // top of it holds it there. Cheaper and steadier than waiting.
      text.style.animationDelay = `-${k.freezeAt}s`;
      text.style.animationPlayState = 'paused';
    } else {
      text.style.animationDelay = '0s';
      text.style.animationPlayState = 'running';
    }
  }, [k]);

  return (
    <div
      ref={host}
      style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}
    >
      {/* The painting, exactly as the signed-out page paints it. */}
      <div className="rr-home-art" aria-hidden>
        <div
          className="rr-home-art-img"
          style={{ backgroundImage: `url(${burrowArt(1)})` }}
        />
        <CarrotField className="rr-home-art-crop" progress={null} />
      </div>

      <LoreCrawl />

      {/* The sign-in block. The crawl has to die out before it reaches this —
          that is the single hardest thing to get right, and it is invisible
          unless the block is here at its real height. */}
      <section className="rr-burrow" style={{ position: 'relative', zIndex: 1, height: '100%' }}>
        <div className="rr-empty">
          <img className="rr-logo" src={LOGO} alt="Rabbit Royale" width={365} height={78} />
          <p style={{ color: 'var(--muted)', margin: 0 }}>The Cursed Crown</p>
          <p style={{ color: 'var(--muted)', maxWidth: 300 }}>
            Connect your wallet to claim a burrow. Nothing to remember, nothing to lose.
          </p>
        </div>
      </section>
    </div>
  );
}

const meta: Meta<typeof Screen> = {
  title: 'Home/Opening crawl',
  component: Screen,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    perspective: { control: { type: 'range', min: 160, max: 1400, step: 20 } },
    tilt: { control: { type: 'range', min: 0, max: 70, step: 1 } },
    run: { control: { type: 'range', min: 120, max: 400, step: 10 } },
    seconds: { control: { type: 'range', min: 10, max: 120, step: 2 } },
    freezeAt: { control: { type: 'range', min: -1, max: 60, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<typeof Screen>;

/** What ships. Playing, at the values in globals.css. */
export const Default: Story = {
  args: { perspective: 620, tilt: 38, run: 260, seconds: 44, freezeAt: -1 },
};

/**
 * Held mid-pass, where the body text is at its largest and nearest.
 *
 * This is the frame that decides whether the type survives the tilt, and it is
 * the one a playing story almost never lets you look at.
 */
export const Frozen: Story = {
  args: { ...Default.args, freezeAt: 20 } as Knobs,
};

/**
 * The failure that shipped first, kept as a control.
 *
 * Shallow tilt, long perspective: it scrolls, but nothing recedes, and it reads
 * as a text box sliding up a web page. Worth being able to see on demand —
 * "not enough" is much harder to recognise than "too much".
 */
export const TooFlat: Story = {
  args: { ...Default.args, perspective: 340, tilt: 26, freezeAt: 20 } as Knobs,
};

/**
 * The other failure, also kept.
 *
 * Steep tilt on a short perspective folds the chapter into a squashed band on
 * the bottom edge. It looks dramatic in a thumbnail and is unreadable at size,
 * which is exactly the trap.
 */
export const TooSteep: Story = {
  args: { ...Default.args, perspective: 240, tilt: 52, freezeAt: 20 } as Knobs,
};
