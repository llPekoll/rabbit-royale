'use client';

/**
 * THE RAID'S CEREMONY — the full-screen beat the raider gets for reaching the
 * defender's red tile and walking out with the burrow's carrots.
 *
 * Reaching that tile IS the raid. Until now it resolved the way a form submits:
 * the board stopped, a number changed, and the player was handed back to their
 * burrow. The arcade already owns the right answer to this. The hub's shop and
 * the casino's island chest both raise the kit's `ChestReveal` — a spinning
 * sunburst, a whiteout, and the light draining onto the prize — precisely
 * because a rare win deserves more than a footnote. A successful raid is the
 * same shape of moment arriving by a harder road: the player crossed a
 * minefield somebody else laid and paid energy for every step. It gets the
 * same stage.
 *
 * WHY THIS IS ITS OWN STAGE AND NOT A `ChestReveal` CALL. The kit's rays are
 * keyed to a RARITY and there is no way in from outside: violet means
 * legendary, gold means epic, and that wash of colour is the information the
 * ceremony exists to deliver. A raid has no roll — it succeeded — so keying it
 * to a rarity would be dressing a win up as a drop. What it wears instead is
 * the SEA: the RR blues off the hub cabinet's own colour wheel, the island's
 * water read back at the player. Passing `rarity="rare"` to borrow the kit's
 * nearest blue would also drag in its silver accent and its "RARE" grammar,
 * which is a different claim about what just happened.
 *
 * So the choreography is ported and the colour is ours:
 *
 *   1. BURST  — a white disc explodes out of the centre. There is nothing to
 *               unwrap here, so there is no chest to rumble first; the stage
 *               opens on the light, the beat the kit itself reserves for a
 *               claim rather than an opening.
 *   2. HOLD   — full white.
 *   3. DRAIN  — the light is sucked back into the middle and the rabbit fades
 *               up underneath it, mid-hop on its happy row: the same sprite
 *               the player just watched cross the board, under the carrots it
 *               took.
 *   4. SHOWN  — RAID WON! slams on, the confetti is already falling, the
 *               button rises in. A tap anywhere (or Escape) dismisses.
 *
 * The board is untouched underneath and dismissing returns to it.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { BitmapText, TitleText, NineSliceButton, TYPE_SCALE } from '@domin8/arcade-kit';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';
import { avatarSrc, AVATAR_FRAME } from '@/lib/game/avatars';
import { playUiSfx } from '@/game/services/SoundManager';

const OCEAN_INK = '#0a2a3a';
const CARROT_ORANGE = '#ff8c2e';
const CARROT_DEEP = '#9c4a0c';
const FLUFF = '#f6f7f2';
/** The accent: the island's sea, and what the stamp and the trap line wear. */
const SEA = '#46b8d8';

/**
 * The rays' three stops, cycled around the burst. Lifted from the hub
 * cabinet's own wheel — its shadowed sea cyan and sea cyan, with the deeper
 * water between them — so the raid's stage and the arcade's backdrop are
 * demonstrably the same blue rather than two blues that nearly match.
 */
const RAY_PALETTE: [string, string, string] = ['#2e98c0', '#46b8d8', '#1d6a92'];

const RAYS = 36;
const RAY_CANVAS = 384;

/** The ceremony's beats, in ms. */
const BURST_MS = 230;
const HOLD_MS = 110;
const DRAIN_MS = 620;
const STAMP_DELAY_MS = 380;

type Phase = 'burst' | 'hold' | 'drain' | 'shown';
const NEXT: Partial<Record<Phase, [Phase, number]>> = {
  burst: ['hold', BURST_MS],
  hold: ['drain', HOLD_MS],
  drain: ['shown', DRAIN_MS],
};
const ORDER: Phase[] = ['burst', 'hold', 'drain', 'shown'];

/**
 * The rabbit on the stage, in source pixels scaled up whole.
 *
 * 6x of a 32px frame: big enough to be the thing you are looking at on a phone
 * held at arm's length, and a WHOLE multiple so the pixels stay square — the
 * one rule this art cannot bend.
 */
const RABBIT_SCALE = 6;
const RABBIT_PX = AVATAR_FRAME * RABBIT_SCALE;

/**
 * The happy row, from `BUNNY_ANIM_DEFS`: frames 40-47 at 10fps — the row the
 * board itself plays when a raid is won (`PlayerRabbit.playHappy`).
 *
 * Restated here rather than imported because that table lives in the Pixi
 * `AssetLoader`, which pulls the whole texture pipeline in with it. This is a
 * DOM sprite stepping a background-position; dragging Pixi into a React
 * overlay to learn two integers would be the tail wagging the dog. Sheets are
 * 8 frames wide (`lib/game/avatars`), so the row is one clean line.
 */
const HAPPY_FROM = 40;
const HAPPY_TO = 47;
const HAPPY_FPS = 10;
const SHEET_COLS = 8;

export interface RaidVictoryProps {
  /** Whose burrow was emptied — named on the stage, because that is the story. */
  defender: string;
  /** What was taken. The number is the reward, so it gets the big type. */
  carrots: number;
  /** The raider's own bunny (an `AVATARS` key). Falls back to the default. */
  avatar?: string | null;
  /** Traps sprung on the way in — shown as the cost, when there was one. */
  trapsSprung?: number;
  /** Tapped through, pressed Escape, or hit the button. */
  onDone: () => void;
  actionLabel?: string;
  zIndex?: number;
}

export function RaidVictory({
  defender,
  carrots,
  avatar,
  trapsSprung = 0,
  onDone,
  actionLabel = 'BACK TO THE BURROW',
  zIndex = 1000,
}: RaidVictoryProps) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduced ? 'shown' : 'burst');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Heard, not only seen: the biggest win in the game was a silent ceremony.
  // The coin chirp as the burst opens, the chime as RAID WON! lands.
  useEffect(() => { playUiSfx('coinStart'); }, []);
  useEffect(() => { if (phase === 'shown') playUiSfx('chime'); }, [phase]);

  // The chain. Each beat schedules the next; reduced motion starts at the end
  // and this never runs.
  useEffect(() => {
    const next = NEXT[phase];
    if (!next) return;
    const t = window.setTimeout(() => setPhase(next[0]), next[1]);
    return () => window.clearTimeout(t);
  }, [phase]);

  const shown = phase === 'shown';
  const dismiss = useCallback(() => { if (shown) onDone(); }, [shown, onDone]);

  // Escape (or Enter/Space) taps through, once there is something to tap
  // through to. Captured, because the board underneath binds keys of its own.
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onDone();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [shown, onDone]);

  if (!mounted || typeof document === 'undefined') return null;

  const past = (p: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(p);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Raid won - ${carrots} carrots looted from ${defender}`}
      className="rr-victory-backdrop"
      // Always swallow the click: this may be raised inside somebody else's
      // tap-to-close overlay, and the screen under it must not close first.
      onClick={(e) => { e.stopPropagation(); dismiss(); }}
      style={{ ...overlayStyle, zIndex, cursor: shown ? 'pointer' : 'default' }}
    >
      {/* The sunburst, on its own layer so the pulse filter never touches art. */}
      <div className="rr-victory-rays-pulse" style={raysWrapStyle} aria-hidden>
        <RayBurst />
      </div>

      {/* The prize, from the drain on. */}
      {past('drain') && (
        <div style={centreColumnStyle}>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            {phase === 'drain' && (
              <div
                className="rr-victory-glow"
                style={{ ...glowStyle, background: `radial-gradient(circle, ${SEA}aa 0 18%, ${SEA}33 38%, transparent 62%)` }}
                aria-hidden
              />
            )}
            <div className="rr-victory-item" style={{ position: 'relative', display: 'inline-flex' }}>
              <Spoils defender={defender} carrots={carrots} avatar={avatar} trapsSprung={trapsSprung} />
            </div>
            {shown && (
              <div className="rr-victory-stamp" style={{ ...stampStyle, animationDelay: `${STAMP_DELAY_MS}ms` }} aria-hidden>
                {/* `TitleText` is a full-colour outlined face with its own
                    3-D extrude baked into the atlas — `color` does nothing to
                    it, which is exactly why it is here: the stamp is supposed
                    to be the one element on the stage wearing the arcade's own
                    lettering rather than the scene's palette. */}
                <TitleText scale={TYPE_SCALE.title}>RAID WON!</TitleText>
              </div>
            )}
          </div>
          {shown && (
            <div
              className="rr-victory-rise"
              style={{ ...actionsStyle, animationDelay: `${STAMP_DELAY_MS + 260}ms` }}
              onClick={(e) => e.stopPropagation()}
            >
              <NineSliceButton color={CARROT_ORANGE} shadowColor={CARROT_DEEP} scale={2} onClick={onDone} aria-label={actionLabel}>
                <BitmapText scale={TYPE_SCALE.caption} style={{ color: OCEAN_INK }}>
                  {actionLabel}
                </BitmapText>
              </NineSliceButton>
            </div>
          )}
        </div>
      )}

      {/* Paper, from the moment the light lets go of the rabbit. */}
      {past('drain') && <Confetti />}

      {/* The flash: ONE element across all three of its beats — it bursts out
          of the centre, holds full-screen, then drains back in. Rendering it
          once, in a fixed slot, is what stops it restarting its expansion on
          each phase change. */}
      {!past('shown') && (
        <div
          className={phase === 'burst' ? 'rr-victory-flash-in' : phase === 'drain' ? 'rr-victory-flash-suck' : undefined}
          style={{ ...flashStyle, ...(phase === 'hold' ? { transform: 'scale(1)' } : null) }}
          aria-hidden
        />
      )}

      {shown && (
        <div className="rr-victory-rise" style={{ ...captionStyle, animationDelay: `${STAMP_DELAY_MS + 500}ms` }} aria-hidden>
          <span className="rr-victory-blink" style={{ display: 'inline-flex' }}>
            <BitmapText scale={TYPE_SCALE.caption} style={{ color: '#fef3c7' }}>
              TAP TO CONTINUE
            </BitmapText>
          </span>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** The rabbit, the haul, and who paid for it. */
function Spoils({
  defender,
  carrots,
  avatar,
  trapsSprung,
}: {
  defender: string;
  carrots: number;
  avatar?: string | null;
  trapsSprung: number;
}) {
  return (
    <span style={spoilsStyle}>
      <HoppingRabbit avatar={avatar} />
      {/* AN EMPTY BURROW still counts as a win.
          Loot is a share of what the defender is holding, floored — so a raid
          that crosses the whole minefield to reach a burrow somebody already
          emptied pays nothing. "+0 LOOTED FROM THISTLE" reads as a bug, and
          worse, as though the walk had failed; what actually happened is that
          the player won and the cupboard was bare, so it says that. */}
      {carrots > 0 ? (
        <>
          <span style={haulStyle}>
            <img
              src={CARROT_URL}
              alt=""
              aria-hidden
              width={CARROT_SIZE.width * 2}
              height={CARROT_SIZE.height * 2}
              style={{ imageRendering: 'pixelated' }}
            />
            {/* The count has to be CARROT ORANGE — it is the reward, and the
                colour is half of what says so. That rules out `TitleText`,
                whose glyphs carry their own baked palette; `BitmapText` is a
                mask, so it takes the tint. At `display` it still out-sizes
                everything else on the stage bar the stamp. */}
            <BitmapText scale={TYPE_SCALE.display} style={{ color: CARROT_ORANGE, textShadow: '0 4px 0 rgba(0,0,0,0.6)' }}>
              {`+${carrots.toLocaleString('en-US')}`}
            </BitmapText>
          </span>
          <BitmapText scale={TYPE_SCALE.body} style={{ color: FLUFF }}>
            {`LOOTED FROM ${asciiName(defender)}`}
          </BitmapText>
        </>
      ) : (
        <BitmapText scale={TYPE_SCALE.body} style={{ color: FLUFF }}>
          {`${asciiName(defender)}'S BURROW WAS EMPTY`}
        </BitmapText>
      )}
      {trapsSprung > 0 && (
        <BitmapText scale={TYPE_SCALE.caption} style={{ color: SEA }}>
          {trapsSprung === 1 ? '1 TRAP SPRUNG ON THE WAY IN' : `${trapsSprung} TRAPS SPRUNG ON THE WAY IN`}
        </BitmapText>
      )}
    </span>
  );
}

/**
 * The raider's bunny, playing its happy row and hopping on the spot.
 *
 * Two motions, deliberately separate: the SHEET steps frames 40-47, and the
 * ELEMENT arcs up and down under it. The row alone is a rabbit being pleased in
 * place; the arc is what makes it jump. Pinning the hop's period to the
 * animation's own keeps the two from drifting into a rabbit that lands
 * mid-cheer.
 *
 * A background-position walk rather than eight swapped `<img>`s: one decoded
 * sheet, nothing to flicker on the first loop, and `pixelated` holds the art
 * square.
 */
function HoppingRabbit({ avatar }: { avatar?: string | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState(HAPPY_FROM);
  const src = useMemo(() => avatarSrc(avatar), [avatar]);
  const reduced = useReducedMotion();

  // The row, looped. A 10fps `setInterval` rather than a rAF walk: eight frames
  // a second is far below the display's beat, so a rAF buys nothing, and the
  // timer stops dead with the component.
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f >= HAPPY_TO ? HAPPY_FROM : f + 1));
    }, 1000 / HAPPY_FPS);
    return () => window.clearInterval(id);
  }, [reduced]);

  // The hop: one row period per jump, so the rabbit is at the top of its arc in
  // the middle of the cheer and back down as the row restarts.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const period = (HAPPY_TO - HAPPY_FROM + 1) / HAPPY_FPS;
    const tl = gsap.timeline({ repeat: -1 });
    tl.to(el, { y: -RABBIT_SCALE * 7, duration: period * 0.42, ease: 'power2.out' })
      .to(el, { y: 0, duration: period * 0.34, ease: 'power2.in' })
      // A beat on the floor, so it reads as jumping rather than as bobbing.
      .to(el, { y: 0, duration: period * 0.24 });
    return () => { tl.kill(); };
  }, [reduced]);

  const col = frame % SHEET_COLS;
  const row = Math.floor(frame / SHEET_COLS);

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <span
        ref={ref}
        role="img"
        aria-label="Your rabbit, celebrating"
        style={{
          width: RABBIT_PX,
          height: RABBIT_PX,
          backgroundImage: `url('${src}')`,
          // The sheet is scaled as a whole and then windowed, which is what
          // keeps a 32px frame's pixels square at 6x.
          backgroundSize: `${SHEET_COLS * RABBIT_PX}px auto`,
          backgroundPosition: `${-col * RABBIT_PX}px ${-row * RABBIT_PX}px`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          willChange: 'transform',
        }}
      />
      {/* The shadow stays put while the rabbit leaves it, which is most of what
          sells the jump — a sprite translating up on its own just floats. */}
      <span style={shadowStyle} aria-hidden />
    </span>
  );
}

/**
 * Paper falling over the whole stage.
 *
 * Pixel confetti, not a physics toy: flat chips in the game's own palette, each
 * with its own lane, fall speed, spin and drift. They sit over everything and
 * never intercept a tap, so tap-to-continue still works through them.
 */
const CONFETTI_COLORS = ['#ff8c2e', '#46b8d8', '#6ec43c', '#f5c518', '#f6f7f2', '#c98cff'];
const CONFETTI_COUNT = 64;

export function Confetti() {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = host.current;
    // Falling paper is decoration on an already-loud stage, and a drifting
    // field is exactly the motion that makes some people ill.
    if (!el || reduced) return;

    const chips: HTMLSpanElement[] = [];
    const tweens: gsap.core.Tween[] = [];

    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const chip = document.createElement('span');
      const size = gsap.utils.random(5, 11, 1);
      chip.style.cssText = [
        'position:absolute',
        'top:-8vh',
        `width:${size}px`,
        // A mix of squares and ribbons: a field of identical chips reads as a
        // texture rather than as paper.
        `height:${Math.random() < 0.35 ? size * 2 : size}px`,
        `background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`,
        `left:${gsap.utils.random(0, 100, 0.1)}%`,
        'will-change:transform',
      ].join(';');
      el.appendChild(chip);
      chips.push(chip);

      const fall = gsap.utils.random(2.4, 4.6);
      // Each chip on its own clock, started at a negative offset so the field
      // is already mid-fall on the first frame instead of raining in from a
      // clean line along the top edge.
      tweens.push(
        gsap.fromTo(
          chip,
          { y: 0, x: 0, rotate: 0 },
          {
            y: '116vh',
            x: gsap.utils.random(-90, 90),
            rotate: gsap.utils.random(180, 900) * (Math.random() < 0.5 ? -1 : 1),
            duration: fall,
            ease: 'none',
            repeat: -1,
            delay: -gsap.utils.random(0, fall),
            // A new lane each time round, so the field never settles into
            // visible columns.
            onRepeat: () => { chip.style.left = `${gsap.utils.random(0, 100, 0.1)}%`; },
          },
        ),
      );
    }

    return () => {
      tweens.forEach((t) => t.kill());
      chips.forEach((c) => c.remove());
    };
  }, [reduced]);

  return <div ref={host} style={confettiStyle} aria-hidden />;
}

// ── Sunburst ────────────────────────────────────────────────────────────────
// The cabinet's backdrop, distilled: N pixel wedges on a small canvas,
// CSS-scaled with `pixelated` so the edges stair-step, radially faded to
// nothing at the rim, spun slowly by CSS. Painted ONCE — the palette never
// changes here (a raid has no roll to reveal), so there is no reason to hold a
// rAF open behind a static bitmap the CSS rotation is already carrying.

function RayBurst() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = RAY_CANVAS;
    canvas.height = RAY_CANVAS;
    const cx = RAY_CANVAS / 2;
    const cy = RAY_CANVAS / 2;
    const rayW = (Math.PI * 2) / RAYS;

    for (let i = 0; i < RAYS; i++) {
      ctx.fillStyle = RAY_PALETTE[i % RAY_PALETTE.length];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      // Overspilling each wedge past its neighbour is what keeps a seam of
      // background from showing between them.
      ctx.arc(cx, cy, RAY_CANVAS, i * rayW, i * rayW + rayW * 1.12);
      ctx.closePath();
      ctx.fill();
    }

    // Radial fade, punched with destination-in so the wedges themselves lose
    // alpha outward — a dark overlay on top would grey the whole stage.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(cx, cy, 0, cx, cy, RAY_CANVAS * 0.5);
    mask.addColorStop(0, 'rgba(255,255,255,1)');
    mask.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    mask.addColorStop(0.7, 'rgba(255,255,255,0.3)');
    mask.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, RAY_CANVAS, RAY_CANVAS);
    ctx.restore();
  }, []);

  return <canvas ref={ref} className="rr-victory-rays" style={raysStyle} />;
}

/** `BitmapText` covers printable ASCII 32-126 only, and a defender's name is
 *  whatever they typed. */
function asciiName(name: string): string {
  return name.toUpperCase().replace(/[^\x20-\x7e]/g, '').slice(0, 20) || 'A RIVAL';
}

function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setR(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return r;
}

// ── styles ──────────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(5, 18, 26, 0.94)',
  overflow: 'hidden',
  display: 'block',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

const raysWrapStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
};

const raysStyle: CSSProperties = {
  width: '200vmax',
  height: '200vmax',
  flexShrink: 0,
  imageRendering: 'pixelated',
  opacity: 0.85,
};

const centreColumnStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 22,
  padding: 24,
  boxSizing: 'border-box',
};

const glowStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: '120vmin',
  height: '120vmin',
  marginLeft: '-60vmin',
  marginTop: '-60vmin',
  pointerEvents: 'none',
};

// The keyframe owns `transform`, so the stamp centres by spanning the item's
// width and centring its text, not by a translate the animation would clobber.
const stampStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  // Just clear of the rabbit's ears. Sat ON the sprite it hides the face the
  // whole beat is pointing at; floated far above it in open blue it reads as a
  // page heading rather than as something stamped onto this win. This is the
  // gap between the two.
  top: -46,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  display: 'flex',
  justifyContent: 'center',
  transformOrigin: '50% 50%',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const flashStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: '250vmax',
  height: '250vmax',
  marginLeft: '-125vmax',
  marginTop: '-125vmax',
  borderRadius: '50%',
  background: 'radial-gradient(circle, #ffffff 0 40%, #eafaff 70%, #d6f2ff 100%)',
  pointerEvents: 'none',
  transformOrigin: '50% 50%',
};

const captionStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
};

const spoilsStyle: CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
  textAlign: 'center',
};

const haulStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
};

/**
 * The ground the rabbit leaves and comes back to.
 *
 * The sprite sits low in its own 32px frame with transparent pixels beneath it,
 * so a shadow tucked up under the box (a negative margin) disappears behind
 * that empty space and the jump loses the one cue that sells it. This sits
 * clear of the frame instead, wide enough to read at 6x.
 */
const shadowStyle: CSSProperties = {
  width: RABBIT_PX * 0.34,
  // Clear of the sprite's feet, which already reach the bottom of the frame:
  // an ellipse tucked against them is read as part of the rabbit rather than
  // as the ground it is leaving.
  marginTop: 4,
  height: 9,
  borderRadius: '50%',
  background: 'rgba(0,0,0,0.55)',
  filter: 'blur(3px)',
};

const confettiStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
};
