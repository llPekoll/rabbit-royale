'use client';

/**
 * THE ENERGY DIAL — the DIG board, with the run's fuel as its face.
 *
 * WHERE IT COMES FROM. Paul's art (2026-09-19, `energy-dial.aseprite`): a wood
 * board with a ringed dial at its left end and a plank to write on at its
 * right. The file ships two layers over a shared canvas — `empty`, the board
 * with the dial's ring GREY, and `full`, the same ring painted green through
 * yellow. Both are baked at the same crop so they register exactly.
 *
 * IT EMPTIES LIKE A CAR'S FUEL GAUGE, which is Paul's own description: at 60
 * energy the ring is whole, and it drains toward zero. So the two layers are
 * stacked — grey underneath, colour on top — and the COLOUR is clipped to a
 * wedge. What the wedge uncovers is not a hole but the grey ring that was
 * always there, which is why the empty layer carries a full ring of its own.
 *
 * THE WEDGE IS A `conic-gradient` MASK, not a rotated overlay. A cover drawn
 * on top would have to match the board's own wood to hide anything, and would
 * still sit over the four gold studs at the cardinals. A mask removes the
 * colour and leaves every pixel of the grey art beneath it untouched.
 *
 * THE GAP OPENS AT 12 O'CLOCK AND WIDENS ANTICLOCKWISE (Paul, 2026-09-19).
 * The gold stud at 12 is the full mark; the colour is eaten back from it,
 * counter-clockwise, and the arc that survives runs clockwise from 12.
 *
 * `conic-gradient` only ever sweeps CLOCKWISE from its start angle, so the
 * direction is expressed by WHICH SIDE of the turn is kept, not by reversing
 * anything: keeping the FIRST `frac` of the turn leaves an arc pinned at 12
 * and reaching clockwise, which is the same thing as a gap eating
 * anticlockwise out of 12.
 *
 * Two earlier cuts were both wrong here. The first kept a wedge that swept
 * away from 12 and read as a ring FILLING — a progress ring's vocabulary, not
 * a tank's. The second kept the LAST `frac`, which drained the right way up
 * but clockwise, the mirror of what the art wants.
 *
 * THE RING'S GEOMETRY IS MEASURED, not guessed: on the baked 268x102 art the
 * ring's centre is at 19.22% / 51.72% and it runs from r=24 to r=34. Those
 * three numbers are the only link between the picture and the mask, so they
 * are stated once here and scaled with the board.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * How long the ring takes to travel to a new reading, and how it gets there.
 *
 * Decelerating, so the ARRIVAL is the readable part: the needle leaves fast
 * enough to catch the eye and settles slowly enough to be read.
 */
const SWEEP_MS = 340;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * A number that SLIDES to its target instead of jumping to it, on rAF.
 *
 * THE RING CANNOT BE TRANSITIONED IN CSS. Its fill is a `conic-gradient` used
 * as a mask (see above), and mask-image is not an animatable property: every
 * browser snaps it. That is why the dial moved in one frame however the bar
 * beside it was tuned — the value was correct on the first paint and there was
 * simply nothing in between. So the tween happens HERE, on the number, and the
 * mask is rebuilt each frame from a value that is already partway there.
 *
 * It re-aims rather than restarting: a second change mid-sweep runs from
 * wherever the ring currently IS, so a burst of digs reads as one continuous
 * drain rather than a stutter of overlapping animations.
 */
function useSweep(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const since = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    // The first reading is not a movement: a gauge that winds up from zero on
    // mount announces a change that never happened.
    if (from.current === target && since.current === 0) return undefined;
    from.current = shown;
    since.current = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - since.current) / SWEEP_MS);
      setShown(from.current + (target - from.current) * easeOut(t));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // `shown` is read to re-aim from the live position, never to re-run the
    // effect — that would restart the sweep on its own every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return shown;
}

export const DIAL_EMPTY_URL = '/assets/gauge/dial-empty.webp';
export const DIAL_FULL_URL = '/assets/gauge/dial-full.webp';
/** The baked art's size — both layers share it. */
export const DIAL_SIZE = { width: 268, height: 102 } as const;

/** The ring's centre, as a fraction of the art's own box. */
const RING_CX = 0.1922;
const RING_CY = 0.5172;
/** The ring's radii, in source pixels on the baked art. */
const RING_INNER = 24;
const RING_OUTER = 34;

/** The energy mark, as drawn for the shop's shelf and the run's bar. */
const BOLT_URL = '/assets/ui/icons/bolt.webp';
const BOLT_SIZE = { width: 24, height: 29 } as const;

/**
 * THE MARK'S SIZE ON THE HUB, as a factor of the sprite's own 24x29.
 *
 * BIGGER THAN THE HUB, so its tips run out over the coloured band — a mark
 * stamped over the gauge, not a picture framed inside it (Paul, 2026-09-21:
 * "bleed out over the gauge slightly", then "plus gros l'eclaire"). The hub
 * is 2*24 across and the sprite is 29 tall, so 1.6 puts the bolt at 46 on a
 * 48px hub: it fills the wood and its points cross the ring.
 */
const HUB_BOLT = 1.6;

/**
 * WHERE THE BOLT'S INK ACTUALLY SITS in its own 24x29 box, measured as the
 * alpha centroid of the sprite: (10.84, 11.01) against a box centre of
 * (12, 14.5).
 *
 * THE SPRITE IS NOT CENTRED IN ITS BOX. It leans slightly left and sits
 * markedly HIGH — the tail tapers to a point that costs little ink while the
 * head is solid — so squaring the box on the hub puts the mark low and a
 * touch left of the middle (Paul, 2026-09-21: "un peu plus a droite").
 *
 * Both the seat and the BEAT'S PIVOT read these: scaling from the box centre
 * would swell the bolt downward, away from the ring's middle, because that
 * centre is 3.5px below the ink's. Corrected on the ART rather than by
 * re-measuring the ring, whose centre the mask depends on too.
 */
const BOLT_INK_CX = 10.84;
const BOLT_INK_CY = 11.01;
const HUB_BOLT_DX = BOLT_SIZE.width / 2 - BOLT_INK_CX;
const HUB_BOLT_DY = BOLT_SIZE.height / 2 - BOLT_INK_CY;

/**
 * WHEN THE BEAT STARTS, and how fast it runs at each end.
 *
 * A third of the tank, because that is where the reading stops being a
 * number and starts being a decision: below it a crossing (20) is no longer
 * a rounding error against what is left.
 */
const BEAT_FROM = 1 / 3;
/** At the threshold — a slow, unhurried pulse. */
const BEAT_SLOW = 1100;
/** At empty. */
const BEAT_FAST = 500;

export interface EnergyDialProps {
  /** Energy in hand. */
  value: number;
  /** A full tank — the ring is whole at this. */
  max: number;
  /** How tall to draw the board. The dial scales with it. */
  height: number;
  /**
   * THE READING ON THE HUB — the figure in the middle of the ring, as the
   * medallion carried it before the board was one piece (Paul, 2026-09-21:
   * "rajoute moi l'energie au milieu comme avant").
   *
   * A ring says how full; it does not say how much, and the tank is spent in
   * named amounts — 20 a crossing — so the arc alone cannot tell you whether
   * the next step is affordable. Off by default: the DIG slab and the story
   * draw their own middles.
   */
  hub?: boolean;
  /**
   * THE HEARTBEAT — the dial pulsing, for a tank that is running out.
   *
   * It is the board's own alarm and it beats FASTER the emptier it gets, the
   * way a pulse does: a gauge the player is not looking at cannot warn them,
   * and a steady blink reads as decoration. Tied to the value rather than a
   * flag so the board cannot disagree with the number on it.
   */
  beat?: boolean;
  /** The board's text end. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * The board, its dial, and whatever the caller writes on the plank.
 *
 * `contentInset` reports what the dial costs so the text can clear it — the
 * same contract the scroll board uses.
 */
export function EnergyDial({
  value, max, height, hub = false, beat = false, children, className, style,
}: EnergyDialProps) {
  /* Clamped, because energy is a live value: a bomb can take more than is
     left, and a negative fraction would sweep the wedge back the wrong way.
     Swept, because a mask cannot be transitioned — see useSweep. */
  const shown = useSweep(value);
  const frac = max > 0 ? Math.max(0, Math.min(1, shown / max)) : 0;
  const k = height / DIAL_SIZE.height;
  const width = DIAL_SIZE.width * k;

  /* THE BEAT IS THE TANK'S, not a caller's flag: asked for, it runs only
     once the gauge is into its last third, and quickens the rest of the way
     down — 1.1s at the threshold, 0.5s at empty. A pulse that beats at one
     speed whatever the reading is says "something is animated here"; one
     that quickens says "this is running out", which is the whole message.
     On the TRUE value, so the alarm starts on the dig that crossed the line
     rather than a third of a second later when the paint catches up. */
  const beatOn = beat && max > 0 && value / max <= BEAT_FROM;
  const beatMs = beatOn
    ? Math.round(BEAT_SLOW - (BEAT_SLOW - BEAT_FAST) * (1 - Math.min(1, value / max / BEAT_FROM)))
    : 0;

  /* KEEP THE FIRST `frac` OF THE TURN, FROM 12 O'CLOCK, WITH NO `from`
     OFFSET. The gradient sweeps clockwise from 12, so the arc that survives
     starts at the stud and runs clockwise; the gap is what is left over,
     which lands at the END of the turn — degrees 300-359 at 10/60 — i.e.
     touching 12 from the LEFT and widening anticlockwise as the tank drains.
     That is Paul's reading (2026-09-19).
     
     Worked out on the angles rather than by eye, after two cuts that were
     each wrong and one that was wrong twice: `from -frac turn` rotates the
     start to exactly where the kept arc would have ended anyway, so it
     CANCELS ITSELF and leaves the gap back on the clockwise side — the
     simulation put both variants' gap at 0-60deg, which is what the
     screenshots kept showing.
     
     The stops are doubled at the boundary to get a hard edge: a gradient
     between two stops at the same position is a line, and anything softer
     would fray the ring's paint. */
  const mask = `conic-gradient(at ${RING_CX * 100}% ${RING_CY * 100}%, `
    + `#000 0turn, #000 ${frac}turn, `
    + `transparent ${frac}turn, transparent 1turn)`;

  return (
    <div
      className={`rr-energy-dial${className ? ` ${className}` : ''}`}
      style={{ ...board(width, height), ...style }}
    >
      {/* THE GREY RING AND THE BOARD — the whole picture, always drawn. */}
      <span style={layer(DIAL_EMPTY_URL)} aria-hidden />
      {/* THE COLOUR, clipped to what is left. */}
      <span
        style={{
          ...layer(DIAL_FULL_URL),
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
        aria-hidden
      />
      {/* THE MARK ON THE HUB, AND IT BEATS (Paul, 2026-09-21: "je parlais
          juste de l'icone d'energie au milieu", then "vire le nombre"). The
          ring already says how full the tank is; a figure repeating it inside
          the same circle is the gauge captioning itself.

          Centred on the RING's measured centre, not the box's — the circle
          sits at the board's left end and the art's box is the circle's
          height, so the two centres are nowhere near each other. The beat
          animates the `scale` PROPERTY, so this centring translate survives
          it untouched (keyframes in globals.css). */}
      {/* THE MARK ON THE HUB, AND IT BEATS.

          THE SPRITE AS IT IS DRAWN — its own yellow, no tint and no blend.
          It was masked to blue and printed with `multiply` for one pass
          (2026-09-21); over the hub's dark wood multiply can only darken,
          so the bolt came out a brown smudge with the grain showing through
          it rather than a mark on the gauge. The art is already the game's
          energy colour, and the hub is already the ground it was drawn for.

          Centred on the RING's measured centre, not the box's — the circle
          sits at the board's left end and the art's box is the circle's
          height, so the two centres are nowhere near each other. */}
      {hub && (
        <img
          className={beatOn ? 'rr-dial-beat' : undefined}
          src={BOLT_URL}
          alt=""
          draggable={false}
          aria-hidden
          style={{
            position: 'absolute',
            /* Seated so the INK's centre lands on the ring's, not the
               sprite's box — the offsets are in source pixels, so they scale
               with the drawn mark (HUB_BOLT * k), not the board alone. */
            left: `calc(${RING_CX * 100}% + ${(HUB_BOLT_DX * HUB_BOLT * k).toFixed(2)}px)`,
            top: `calc(${RING_CY * 100}% + ${(HUB_BOLT_DY * HUB_BOLT * k).toFixed(2)}px)`,
            transform: 'translate(-50%, -50%)',
            /* THE PIVOT IS THE INK'S CENTRE. At 50% 50% the beat swells the
               bolt from its box's middle, 3.5 source px below the mark's own,
               and the pulse walks it downward off the hub. */
            transformOrigin: `${(BOLT_INK_CX / BOLT_SIZE.width * 100).toFixed(2)}% `
              + `${(BOLT_INK_CY / BOLT_SIZE.height * 100).toFixed(2)}%`,
            width: Math.round(BOLT_SIZE.width * HUB_BOLT * k),
            height: Math.round(BOLT_SIZE.height * HUB_BOLT * k),
            animationDuration: beatOn ? `${beatMs}ms` : undefined,
            imageRendering: 'pixelated',
            pointerEvents: 'none',
          }}
        />
      )}
      {children}
    </div>
  );
}

/**
 * What the dial end costs at a given height, so text can clear it.
 *
 * MEASURED OFF THE ART, not derived from the ring: the dial's wooden rim and
 * its gold studs reach to x=100 on the 268px-wide board, where centre plus
 * outer radius plus a little air came to 91 — and those 9px were enough for
 * "DIG" to sit on the rim in the story. The ring is what drains; the RIM is
 * what the text has to clear.
 */
const DIAL_END = 100 / DIAL_SIZE.width;

const WOOD_START = 115 / DIAL_SIZE.width;
/* THE FULL PLANK, not the last column of untouched grain (Paul, 2026-09-21:
   "le container fait le plus grand pour pas que ca mange le chiffre"). The
   right cluster's leaves grow over the wood from ~225, but they are thin
   there — sprigs against the board's top and bottom edges, not a wall — and
   a figure passing under them still reads, where a figure with its last
   digit cut off does not. 255 keeps the board's own rounded end clear. */
const WOOD_END = 255 / DIAL_SIZE.width;

export function dialInset(height: number) {
  const k = height / DIAL_SIZE.height;
  /* THE GRAIN, NOT THE RIM. `DIAL_END` is where the dial's wood stops, which
     is what a LABEL on the rim has to clear; the pill's row has to clear the
     left leaf cluster too, and that hangs on past it to x=115. Callers that
     want the rim alone read `DIAL_END`. */
  return Math.round(WOOD_START * DIAL_SIZE.width * k);
}

/**
 * THE CLEAN GRAIN — where the wood is wood and not leaf, measured by scanning
 * the plank's band (rows 31-86) for the columns that are opaque and NOT green.
 *
 * BOTH ENDS ARE TIGHTER THAN THE BOARD'S. The left cluster overhangs the
 * plank past the dial's rim and only clears at x=115, where `DIAL_END` (the
 * RIM, at 100) stops; the right cluster starts touching at 225 and bites hard
 * from 241, though the board paints on to 263. Laying the row out between the
 * rim and the paint therefore claims 22px that leaves are sitting on, which
 * is what clipped the rank chip to a bare "#" (Paul, 2026-09-21: "ca rentre
 * pas dans le cadre non plus").
 *
 * WHY IT EXISTS AT ALL. The content used to lay itself out in the plank's
 * STRETCHING wood, which was as wide as the row needed. This board is a fixed
 * image, so the row has to fit the wood instead of the other way round.
 */
/** The width of the board's usable wood, between the two leaf clusters. */
export function dialRoom(height: number) {
  const k = height / DIAL_SIZE.height;
  return Math.round((WOOD_END - WOOD_START) * DIAL_SIZE.width * k);
}

/**
 * THE PLANK'S OWN ROWS, as a fraction of the art's height — because the plank
 * is NOT centred in it.
 *
 * The dial is taller than the board it is bolted to, so the art's box is the
 * CIRCLE's height and the plank hangs in its lower two thirds: rows 31 to 86
 * of 102, whose middle is 58.5 where the box's is 51. Text centred on the box
 * therefore sits ~7px high and reads as floating above the wood (Paul,
 * 2026-09-19: "le text est un peu trop haut").
 *
 * Callers lay their text out against these rather than against the box.
 */
const PLANK_TOP = 31 / DIAL_SIZE.height;
const PLANK_BOTTOM = 86 / DIAL_SIZE.height;

/** The plank's top and bottom edges at a given board height, in CSS px. */
export function plankRows(height: number) {
  return {
    top: Math.round(PLANK_TOP * height),
    bottom: Math.round((1 - PLANK_BOTTOM) * height),
  };
}

const board = (width: number, height: number): CSSProperties => ({
  position: 'relative',
  width,
  height,
  flexShrink: 0,
});

const layer = (url: string): CSSProperties => ({
  position: 'absolute',
  inset: 0,
  backgroundImage: `url(${url})`,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat',
  pointerEvents: 'none',
});

/** The ring's radii as a fraction of the art, for anything that needs them. */
export const DIAL_RING = { cx: RING_CX, cy: RING_CY, inner: RING_INNER, outer: RING_OUTER };
