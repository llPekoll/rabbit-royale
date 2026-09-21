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
import type { CSSProperties, ReactNode } from 'react';

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

export interface EnergyDialProps {
  /** Energy in hand. */
  value: number;
  /** A full tank — the ring is whole at this. */
  max: number;
  /** How tall to draw the board. The dial scales with it. */
  height: number;
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
  value, max, height, children, className, style,
}: EnergyDialProps) {
  /* Clamped, because energy is a live value: a bomb can take more than is
     left, and a negative fraction would sweep the wedge back the wrong way. */
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const k = height / DIAL_SIZE.height;
  const width = DIAL_SIZE.width * k;

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

export function dialInset(height: number) {
  const k = height / DIAL_SIZE.height;
  /* Plus the game's own image-to-label gap, so the text is beside the dial
     rather than against it. */
  return Math.round(DIAL_END * DIAL_SIZE.width * k) + 8;
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

/* ── THE RING ALONE ────────────────────────────────────────────────────────
   The dial cropped out of its board (104x102), for the DIG slab.

   WHY THE CROP EXISTS. The whole board keeps its aspect — a circle cannot be
   stretched — so at the Seeker's 48px slab height it is only 126px wide and
   DIG's line runs off the plank. The slab already HAS a plank (the kit's
   face) and already carries an image at its left end: the carrot. So the
   dial goes in as that image, round and fixed, and the slab keeps sizing
   itself the way it always has. No aspect to fight.

   The ring's centre moves with the crop: 49.52% of 104px where it was 19.22%
   of 268. */
export const RING_EMPTY_URL = '/assets/gauge/dial-empty-ring.webp';
export const RING_FULL_URL = '/assets/gauge/dial-full-ring.webp';
export const RING_SIZE = { width: 104, height: 102 } as const;
const RING_ONLY_CX = 0.4952;

export interface EnergyRingProps {
  value: number;
  max: number;
  /** Drawn at this height; the art is near-square so width follows. */
  size: number;
  /**
   * Draw ONLY the coloured ring, without the grey one under it.
   *
   * For a surface that already paints the dial's grey ring and rim as part of
   * its own art — the DIG slab wears the whole board — where a second grey
   * ring would sit a pixel off the first and read as a double edge.
   */
  colourOnly?: boolean;
  /** The bolt on the hub. Off where the surface draws its own middle. */
  bolt?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The energy mark, as drawn for the shop's shelf and the run's bar. */
const BOLT_URL = '/assets/ui/icons/bolt.webp';
const BOLT_SIZE = { width: 24, height: 29 } as const;
/**
 * Whole multiples only, and BIGGER THAN THE HUB: the hub is ~47% of the ring
 * and the bolt is sized to 56% of it, so its tips run a few pixels out over
 * the coloured band — a mark stamped over the gauge, not a picture framed
 * inside it (Paul, 2026-09-21: "bleed out over the gauge slightly"). On the
 * 102px ring that is 2x, a 58px bolt on a 48px hub.
 */
function boltScale(ringSize: number): number {
  return Math.max(1, Math.floor((ringSize * 0.56) / BOLT_SIZE.height));
}

/**
 * The energy dial as an ICON — the carrot's replacement on the DIG slab.
 *
 * Same two layers and the same anticlockwise drain as `EnergyDial`; only the
 * picture is cropped and the centre re-measured for it.
 */
export function EnergyRing({
  value, max, size, colourOnly = false, bolt = false, className, style,
}: EnergyRingProps) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const width = Math.round((RING_SIZE.width / RING_SIZE.height) * size);
  const mask = `conic-gradient(at ${RING_ONLY_CX * 100}% ${RING_CY * 100}%, `
    + `#000 0turn, #000 ${frac}turn, `
    + `transparent ${frac}turn, transparent 1turn)`;
  return (
    <span
      className={`rr-energy-ring${className ? ` ${className}` : ''}`}
      style={{ position: 'relative', display: 'block', width, height: size, flexShrink: 0, ...style }}
      aria-hidden
    >
      {!colourOnly && <span style={layer(RING_EMPTY_URL)} />}
      <span style={{ ...layer(RING_FULL_URL), WebkitMaskImage: mask, maskImage: mask }} />
      {/* THE BOLT ON THE HUB — what the ring measures, said in the game's own
          mark for it (the same bolt the run's bar and the shop use). The hub
          was a bare wooden disc once the carrot left it, and a ring with
          nothing in its middle is a ring around nothing (Paul, 2026-09-21).
          Scaled by whole pixels off the ring's height so the sprite stays
          square-pixelled; centred on the ring's measured centre, not the
          box's. */}
      {bolt && (
        <img
          src={BOLT_URL}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: `${RING_ONLY_CX * 100}%`,
            top: `${RING_CY * 100}%`,
            width: BOLT_SIZE.width * boltScale(size),
            height: BOLT_SIZE.height * boltScale(size),
            transform: 'translate(-50%, -50%)',
            imageRendering: 'pixelated',
            pointerEvents: 'none',
          }}
        />
      )}
    </span>
  );
}
