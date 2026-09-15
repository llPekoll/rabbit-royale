'use client';

/**
 * THE HUB CARD — the shell the mock's burrow panels are all cut from.
 *
 * WHY THIS EXISTS. The energy card was built to the reference first, alone.
 * The garden card that follows it turns out to share almost everything: the
 * same rounded slab, the same bone rim, the same face gradient, the same pixel
 * web face, the same left-hand art standing clear of a text block that starts
 * at the same inset. Measured off the mock, `GARDEN`'s label and `ENERGY`'s
 * start at the identical x (86 of a 23..357 card) and both sprites at x 41.
 * Two cards agreeing to the pixel is a shell, not a coincidence — so it is
 * named once here rather than copied.
 *
 * WHAT IT IS NOT. Not `BurrowCard`. That is the game's nine-slice wooden frame
 * and it stays exactly as it is for the panels that still wear it; this is the
 * mock's rounded slab, which is a different object with a different job. The
 * two coexist on purpose — see `energy-card.tsx`'s header for why the game's
 * own frame could not be reused for these.
 *
 * COLOURS ARE MEASURED, NOT CHOSEN. Every hex here was sampled off the
 * reference image rather than picked beside it, which is the rule the burrow's
 * soil palette already follows against its own art.
 */
import type { CSSProperties, ReactNode } from 'react';

/* ── Sampled from the reference ────────────────────────────────────────── */
/** The card's face — near-black brown, warmer at the top where the light is. */
export const FACE_TOP = '#2d1610';
export const FACE_BOTTOM = '#1c0d08';
/** The 2px rim that lifts the card off the water. Bone, not white. */
export const RIM = '#ddccbc';
/** Headings: flat white. The card's name, not its news. */
export const LABEL = '#ffffff';
/** A live value — cream, brighter than the label it sits beside. */
export const VALUE = '#fde7bd';
/** The fine print under a heading. */
export const SUB = '#a28b7b';

/**
 * The slab.
 *
 * `ratio` is the card's width:height, stated as a MINIMUM height rather than a
 * fixed one. `aspect-ratio` alone sets a height the contents are free to
 * overflow, and they did: in the app the garden's HARVEST slab hung 21px below
 * the card's rim and was clipped by the panel underneath. `min-height` from the
 * same ratio holds the mock's shape whenever the contents fit, and lets the
 * card grow instead of spilling when they do not — a card a few px taller than
 * the reference is a far smaller error than a button outside its own frame. The mock's cards are 3.6:1 (energy) and 3.0:1 (garden), and at the
 * column's ~400px letting content set the height gave a much flatter strip
 * than either — the contents are small and the width just follows the column.
 * So the shape is declared and the contents sit inside it.
 *
 * `containerType: 'size'` makes the card the reference box for `cqh` lengths
 * used by its children (a bar's height, a button's). A plain `%` there
 * resolves against the flex column, which is sized by its own contents — that
 * collapsed the energy trough to 4px before this was understood.
 */
export function HubCard({
  ratio, art, artHeight, artAlign = 'center', children, footer, style,
}: {
  /**
   * The card's height as a percentage of the viewport's height — see
   * `heightBox`. Measured off the mock: 12.4 for energy, 14.5 for the cards
   * that carry a button. NOT an aspect ratio, despite the name it kept.
   */
  ratio: number;
  /** The sprite standing at the card's left. */
  art: string;
  /**
   * Its height as a share of the CARD's height — measured off the mock.
   *
   * Use `cqh` (not `%`) in a card that has a `footer`: the art then sits in a
   * band sized by its own contents, and a percentage against that collapses
   * the sprite. `cqh` always means the card.
   */
  artHeight: string;
  /**
   * Where the art sits against the text block.
   *
   * Energy's bolt is centred on the card; the garden's plant is pinned to the
   * TOP, level with the heading, because its pot would otherwise float in the
   * middle of a taller card. The mock does both, so this is a real choice and
   * not a default worth hiding.
   */
  artAlign?: 'center' | 'start';
  children: ReactNode;
  /**
   * Content spanning the card's FULL width, under the art-and-text block.
   *
   * Measured off the mock: the garden's HARVEST slab runs x 35..344 of a
   * 23..357 card, i.e. past the text block's left edge (86) and under the
   * plant. Keeping it inside the right-hand column — the first cut — left it
   * visibly narrower than the card and indented under nothing.
   */
  footer?: ReactNode;
  style?: CSSProperties;
}) {
  const sprite = (
    <img
      className="pixelated"
      src={art}
      alt=""
      aria-hidden
      style={{
        ...artBase,
        height: artHeight,
        alignSelf: artAlign === 'start' ? 'flex-start' : 'center',
      }}
    />
  );

  // With a footer the card becomes two STACKED rows — the art-and-text band,
  // then a full-width strip — rather than one flex row. Without one it stays
  // the simple row the energy card needs.
  if (footer) {
    return (
      <div style={{ ...cardBase, ...stacked, ...heightBox(ratio), ...style }}>
        <div style={band}>
          {sprite}
          <div style={column}>{children}</div>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div style={{ ...cardBase, ...heightBox(ratio), ...style }}>
      {sprite}
      <div style={column}>{children}</div>
    </div>
  );
}

/**
 * THE CARD'S HEIGHT COMES FROM THE VIEWPORT, NOT FROM A RATIO.
 *
 * This is the correction that matters, and the earlier mistake is worth
 * stating plainly: the cards used `aspect-ratio: 3.6`, taken from the mock's
 * 342x95 energy card. That number is not a property of the card — it is what
 * 342x95 happens to be at the mock's own 1376x768. What the mock actually
 * holds constant is the card's SHARE OF THE SCREEN: ~25% of the width and
 * ~12.4% of the height. On a 1376x768 window those coincide with a 3.6 ratio;
 * on the Seeker (800x360, the target device) the same shares are 199x45 — a
 * 4.4 ratio. Pinning 3.6 and letting the width follow the column produced
 * 108-129px cards on a 360px-tall screen, 2.4x too tall, and the row of
 * launcher tiles ended 137px BELOW the bottom of the viewport.
 *
 * So `ratio` is no longer a shape. It is the card's share of the viewport's
 * height, expressed in `svh` — small viewport height, which ignores mobile
 * browser chrome that grows and shrinks as you scroll, so the layout does not
 * resize under the player's thumb.
 *
 * `min-height` in `px` is a floor for very short windows (a landscape phone
 * at 320px would give a 40px card, below which the text stops fitting), and
 * `overflow: hidden` keeps the contents inside the frame the way the old
 * ratio box did.
 */
function heightBox(shareOfViewport: number): CSSProperties {
  /* `min-height` rather than `height`, though the card is a `size` container
     and so cannot actually grow past it — see `cardBase`. Written this way
     because it states the intent (this share is a floor, not a cage) and
     because it is what will take effect if the container type ever changes.

     WHERE THIS LANDS. Every card fits at every viewport measured except the
     burrow card on the Seeker, which is ~5px short of its contents and clips
     the bottom of its UPGRADE button's shadow. That is the accepted end of
     the trade: the alternative is shaving the button's floor below 26px or
     the strip's below 16, at which point their labels stop fitting and the
     card is unreadable rather than a few pixels tight. */
  return {
    /* `height`, NOT `min-height`.
       `min-height` was tried so the card could grow past its share instead of
       clipping. It cannot: a `size` container needs a determinate height, and
       with only a `min-height` the browser has none — so every `cqh` length
       inside resolved to ZERO. The sprites vanished, the energy gauge became a
       hairline, and that regression hit desktop as well as the phone. A card
       that is a few pixels tight beats a card with no art in it. */
    /* The mock's share, scaled by `--rr-card-scale`.
       That variable is 1 everywhere except a short window, where globals.css
       sets it to 0.93: on the Seeker the column's visible height is 228px —
       GO FARM claims the band below it — and the four cards at their full mock
       shares need 244. Scaling here rather than in CSS because the height is
       an inline style and a stylesheet cannot override it without
       `!important`; and scaling the CARD is enough, because everything inside
       is a `cqh` share of the card and follows it down. */
    height: `max(calc(${shareOfViewport}svh * var(--rr-card-scale, 1)), 44px)`,
    overflow: 'hidden',
  };
}

/** The stacked form: the band on top, the footer strip under it. */
const stacked: CSSProperties = {
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'center',
  /* In VIEWPORT units, like the card's own height and padding.
     Two earlier forms were wrong in opposite directions. `6cqh` was a feedback
     loop while the card's height came from its contents (it inflated to 46px
     and pushed the button past the rim). A `3%` gap escaped that loop but
     resolves against the card's WIDTH, which no longer tracks its height: on
     the Seeker it was still 12px of gutter inside a 54px card, and the button
     was clipped. `svh` is what the height itself is measured in, so the gap
     holds its proportion at every size. */
  gap: '0.6svh',
};

/** The art-and-text row inside a stacked card. */
const band: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '5%',
};

const cardBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  // 17px between the art and the text block in the mock, against an 18px pad.
  // Horizontal, so a %-of-width is exactly right here — it is the one gap in
  // this file that is not measuring against the card's height.
  gap: '5%',
  /* 18px of a 334px inner in the mock ≈ 5% across, and ~13% of the card's
     height down.
     The vertical pad must scale with the card's HEIGHT, which a percentage
     cannot do: a %-padding on a block always resolves against the parent's
     WIDTH. At desktop that read fine (3% of 400px ≈ 12px against a 95px card),
     but the card's height is now set from the viewport, and on the Seeker the
     same 3% still gave 12px top and bottom out of a 58px card — 23 of its 58
     pixels were padding, and the contents were clipped to nothing.
     `cqh` is NOT the answer either — the card is its own query container, so
     a `cqh` padding feeds back into the height it is measured from (tried: the
     card inflated to 84px with a 40px pad). The height comes from the viewport,
     so the padding does too: 1.5svh is ~12px at desktop and ~6px on the Seeker,
     which holds the same proportion at both. */
  /* Symmetric again: the footer button's shadow is drawn inside its own box
     now (an `inset` box-shadow), so there is no hanging margin to make room
     for. 1.1svh is ~8px at desktop and ~4px on the Seeker — the mock's
     proportion, and small enough that a 46px-tall card still has room for its
     contents. */
  padding: '1.1svh 5%',
  boxSizing: 'border-box',
  width: '100%',
  border: `2px solid ${RIM}`,
  borderRadius: 12,
  background: `linear-gradient(180deg, ${FACE_TOP} 0%, ${FACE_BOTTOM} 100%)`,
  // The card sits on bright water; without a cast shadow its dark face reads
  // as a hole rather than as an object lying on top.
  boxShadow: '0 3px 0 rgba(0, 0, 0, 0.35)',
  /* `size`, and it has to be: every length inside this card is a `cqh` share
     of the card's own height, and only `size` makes the height queryable.
     `inline-size` was tried and is the wrong trade — the `cqh` lengths then
     resolve against the VIEWPORT instead, and the cards ballooned to 258-404px.
     The cost of `size` is that the browser needs a determinate height, so the
     card cannot grow past what `heightBox` gives it. Everything fits at every
     viewport measured except the burrow card on the Seeker, which clips its
     last ~5px — see `heightBox` for why that is the accepted end of this
     trade rather than another round of shaving floors. */
  containerType: 'size',
};

/**
 * Height drives the art and the width follows, so a sprite can never distort
 * whatever its source aspect happens to be (the bolt is 24x29, the garden
 * 56x47).
 */
const artBase: CSSProperties = {
  width: 'auto',
  display: 'block',
  flexShrink: 0,
};

/**
 * The text block.
 *
 * Centred, so an optional extra line (energy's refill note) grows into the
 * card's slack instead of shoving the rows above it upward — the mock's
 * geometry was measured without that line and has to survive its arrival.
 */
const column: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  /* 11% of the CARD's height — the mock leaves 12px of a 111px card between a
     heading's ink and the line under it. `cqh`, not `%`: this column's own
     height is set by its contents, so a percentage gap resolved to zero and
     welded the sub-line to the heading. Same trap as the energy trough and the
     garden's plant; `cqh` always means the card. */
  gap: '6cqh',
  flex: 1,
  minWidth: 0,
};

/**
 * Group a number with thin separators, the SAME WAY on the server and in the
 * browser.
 *
 * `toLocaleString()` was used first and caused a hydration mismatch: with no
 * locale argument it takes the environment's, and Node's default is not
 * necessarily the browser's — so "1,940" rendered on the server could arrive
 * as "1 940" on the client and React threw the whole tree away. Formatting by
 * hand is deterministic, which is the only property that matters here.
 *
 * A plain space, not a comma: the pixel face draws it, and it reads in every
 * locale the game is played in.
 */
export function groupDigits(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const digits = Math.abs(Math.round(n)).toString();
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '\u2009';
    out += digits[i];
  }
  return sign + out;
}

/** A card's heading line: the name on the left, its live value on the right. */
export function HubRow({ children }: { children: ReactNode }) {
  return <div style={headRow}>{children}</div>;
}

const headRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
};

/**
 * The pixel WEB font, not the kit's `BitmapText`.
 *
 * The atlas trims every glyph to its ink, so a value ticking 9 -> 10 changes
 * width and shoves its row around. These are live numbers beside art that is
 * already moving; the web face keeps the baseline still.
 */
export const headingText: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  /* Sized against the CARD's height, not fixed.
     A 13px heading is right in a 95px desktop card and far too heavy in the
     49px one the Seeker gets — the type has to shrink with the frame or the
     card becomes all text. `cqh` is the card (see `containerType` on
     `cardBase`); the clamp keeps it legible at the small end and stops it
     ballooning on a tall desktop window. */
  fontSize: 'clamp(9px, 14cqh, 14px)',
  letterSpacing: '0.06em',
  color: LABEL,
  lineHeight: 1,
};

export const valueText: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(9px, 14cqh, 14px)',
  // Tabular digits, for the same reason the web face is used at all.
  fontVariantNumeric: 'tabular-nums',
  color: VALUE,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

/** The line under a heading that says what the number MEANS. */
/**
 * The fine print under a heading — and the first thing to go when the card is
 * short.
 *
 * WHY IT HIDES. On the Seeker (890x400, the target device) a card with a
 * button gets 14.5svh = 58px, of which 46 are usable. Heading, sub-line and a
 * full-width button need about 50. Something has to yield, and the sub-line is
 * the right thing: it is a RATE ("72/hour · holds 864") — useful context, but
 * not what the card is read for, and not what the button acts on. The heading,
 * the live value and the action all survive at every size.
 *
 * The threshold is on the CARD, not the viewport: `container (height < 70px)`
 * asks the only question that matters — is there room — so a card that gets
 * more height for any reason keeps its line.
 */
export const subText: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  // The fine print, held a step under the heading at every size — and never
  // under the face's own 8px cell: at 7.8px ("Dig 10 tiles.") every glyph was
  // resampled off the grid and the smallest words on the card went soft.
  fontSize: 'clamp(8px, 10.5cqh, 11px)',
  lineHeight: 1.4,
  color: SUB,
};

/**
 * The class that carries the hide-when-short rule.
 *
 * A container query cannot be written inline, so this pairs with the rule in
 * globals.css. Callers spread `subText` for the type and add this class for
 * the behaviour.
 */
export const SUB_CLASS = 'rr-hub-sub';
