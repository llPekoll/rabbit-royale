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
import { PxPanel } from './px';
import { LeafBanner, BANNER_CARD_CAP_RATIO, BANNER_CARD_CAP_MAX } from './leaf-banner';

/* ── Sampled from the reference ────────────────────────────────────────── */
/** The card's face — near-black brown, warmer at the top where the light is. */
export const FACE_TOP = '#2d1610';
export const FACE_BOTTOM = '#1c0d08';
/** The 2px rim that lifts the card off the water. Bone, not white. */
export const RIM = '#ddccbc';
/* ── THE INK, SINCE THE CARD IS PARCHMENT ─────────────────────────────────
   These were a dark-room palette — white headings, cream values and a muted
   brown sub — set against `FACE_TOP`'s near-black soil. The vine banner
   (leaf-banner.tsx) put a cream board under them, where white on cream is
   nearly invisible: the burrow's own heading and its body copy disappeared.

   Same three ROLES, restated on the new ground: the heading is the darkest
   note, the value sits just under it, and the fine print is a wash of the
   same brown rather than a different colour. */
/** Headings: the board's darkest bark. The card's name, not its news. */
export const LABEL = '#3a2617';
/** A live value — bark brown, a step under the heading it sits beside. */
export const VALUE = '#4a3524';
/** The fine print under a heading: the same brown, washed back. */
export const SUB = 'rgba(74, 53, 36, 0.66)';

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
  ratio, floor = 44, art, artHeight, artAlign = 'center', children, footer, style,
}: {
  /**
   * The card's height as a percentage of the viewport's height — see
   * `heightBox`. Measured off the mock: 12.4 for energy, 14.5 for the cards
   * that carry a button. NOT an aspect ratio, despite the name it kept.
   */
  ratio: number;
  /**
   * The card's height floor in px: what its contents need to keep 2px of air
   * inside the frame. The viewport share wins wherever it is taller, which is
   * everywhere but a short landscape phone.
   */
  floor?: number;
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
        height: cardLength(artHeight),
        alignSelf: artAlign === 'start' ? 'flex-start' : 'center',
      }}
    />
  );

  // With a footer the card is the art beside a COLUMN that holds the text and
  // the button; without one it stays the simple row the energy card needs.
  //
  // THE BUTTON SITS IN THE TEXT COLUMN, NOT ACROSS THE CARD. It used to be a
  // sibling of the band, so it ran the full width — under the sprite and out
  // to both rails — and that is what read as "tous les boutons sont trop gros"
  // (Paul, 2026-09-19): not its height, which already matched his mock, but a
  // slab spanning a card where his starts after the icon. Measured on his mock
  // side by side with the game: his CLAIM begins level with "Quest 1 / 10",
  // mine began level with the scroll.
  if (footer) {
    return (
      <LeafBanner
        height={cardHeight(ratio, floor)}
        cap={cardCap(ratio, floor)}
        className="rr-hub-card"
        style={{ ...cardBase, ...stacked, ...heightBox(ratio, floor), ...style }}
      >
        <div style={band}>
          {sprite}
          <div style={column}>
            {children}
            {footer}
          </div>
        </div>
      </LeafBanner>
    );
  }

  return (
    <LeafBanner
      height={cardHeight(ratio, floor)}
      cap={cardCap(ratio, floor)}
      className="rr-hub-card"
      style={{ ...cardBase, ...heightBox(ratio, floor), ...style }}
    >
      {sprite}
      <div style={column}>{children}</div>
    </LeafBanner>
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
/**
 * THE CARD'S HEIGHT, as one CSS expression — the single source both the box and
 * the banner's end caps are built from.
 *
 * It was inline inside `heightBox`. The vine banner needs the SAME value to
 * size its ends (they are art and scale with the height, see leaf-banner.tsx),
 * and the height is a `max(calc(...svh ...), ...px)` that only the browser
 * resolves — so it has to be shared as text rather than as a number, or the
 * ends would drift from the card on any viewport where the floor wins.
 */
function cardHeight(shareOfViewport: number, floor: number): string {
  return `max(calc(${shareOfViewport}svh * var(--rr-card-scale, 1)), ${floor}px)`;
}

/**
 * Each end of the banner: a fixed share of whatever the card's height is.
 *
 * `BANNER_CARD_CAP_RATIO`, not the art's own proportion — see leaf-banner.tsx
 * for the measurement. At full proportion the two ends ate 142px of a 308px
 * card and its contents were clipped.
 */
function cardCap(shareOfViewport: number, floor: number): string {
  /* `min()`, so a tall card does not spend its width on ends it cannot afford
     — the ceiling is what the burrow card clips at. See leaf-banner.tsx. */
  return `min(calc(${cardHeight(shareOfViewport, floor)} * ${BANNER_CARD_CAP_RATIO}), ${BANNER_CARD_CAP_MAX}px)`;
}

function heightBox(shareOfViewport: number, floor: number): CSSProperties {
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
    /* THE FLOOR IS THE CARD'S OWN, in px (`floor`). It was a flat 44 for
       every card, and on a short landscape phone (855x397, 890x400) the
       shares came out 54-67px against contents that need 66-92: headings sat
       on the frame, button labels ran into their bevel, and the burrow card's
       heading was cut off the top (Paul, 2026-09-16: 2px of air between text
       and a panel's border, at least). The column has the room below — it
       ended 100px above the loop bar. */
    height: cardHeight(shareOfViewport, floor),
    /* One card-percent AS THE SHARE WOULD HAVE MADE IT. Where the floor lifts
       the card past its share, `cqh` grows with it and the type and art would
       swell into the width they share with the heading ("BURROW - LVL 1" wrapped
       under a bigger hut). `cardSize`/`cardLength` read `min(cqh, this)`, so
       the extra height goes to AIR and to the buttons, not to the type. Where
       the share wins, the two agree and nothing changes. */
    /* Of the CONTENT box, as `cqh` is: the share less the pad and the 2px frame
       each side, or the type came out a hair bigger and the heading wrapped. */
    ['--rr-card-u' as string]: `calc((${shareOfViewport}svh * var(--rr-card-scale, 1) - 2 * var(--rr-card-pad, var(--rr-pad)) - 4px) / 100)`,
    overflow: 'hidden',
  };
}

/**
 * A type or mark size tied to the card: `n`cqh, clamped, and never larger than
 * the card's viewport share would have made it — see `--rr-card-u` above.
 */
export function cardSize(n: number, min: number, max: number): string {
  return `clamp(${min}px, min(${n}cqh, calc(var(--rr-card-u, 1cqh) * ${n})), ${max}px)`;
}

/** `cardSize` without the clamp, for an art height given as "62cqh". */
function cardLength(cqh: string): string {
  const n = parseFloat(cqh);
  return cqh.endsWith('cqh') ? `min(${cqh}, calc(var(--rr-card-u, 1cqh) * ${n}))` : cqh;
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
  /* The band-to-footer gap. `0.6svh` held its proportion but was, again, a
     number only this file knew (4.6px desktop, 2.4px Seeker). `--rr-pad-tight`
     is the game's answer for the small stuff and it is what separates the two
     rows of a card, everywhere, at every size. */
  gap: 'var(--rr-pad-tight)',
};

/** The art-and-text row inside a stacked card. */
const band: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  // The same art-to-label gap the unstacked card uses — see `cardBase`.
  gap: 'var(--rr-card-pad, var(--rr-pad))',
};

const cardBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  /* The art-to-label gap, and it is the SAME length as the pad around them.
     A %-of-width put 16.6px here on the desktop and 10.5 on the Seeker, so the
     sprite stood at a different distance from its own text on every screen.
     The sprite is an element in a panel like any other: it takes the panel's
     pad as its inset and the panel's pad as its gap. */
  gap: 'var(--rr-card-pad, var(--rr-pad))',
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
  /* THE GAME'S ONE PAD, not this card's own number.
     Everything above is the record of how `1.1svh 5%` was arrived at, and it
     was never wrong so much as PRIVATE: a share of the viewport down and a
     share of the card's own width across means no two cards on the screen —
     and no two screens — ever agreed on the air inside them. The burrow's
     three cards measured 8.4/16.6 on the desktop and 4.4/10.5 on the Seeker,
     four different numbers for one gesture. `--rr-pad` is the whole game's
     answer to "how much air inside a panel", so the card takes it on all four
     sides and stops having an opinion.
     The card is still a `size` container whose height comes from the viewport,
     so a pad that does not scale is a real risk on a short screen — that is
     what `--rr-card-pad` is for: px-raid.css swaps it to `--rr-pad-tight`
     under `@media (max-height: 520px)`, where the Seeker's cards are ~54px and
     the full pad would eat the button. A variable rather than an `!important`
     override because this padding is an inline style, and the cascade can only
     reach INTO it through a custom property. */
  padding: 'var(--rr-card-pad, var(--rr-pad))',
  boxSizing: 'border-box',
  width: '100%',
  /* THE FRAME IS THE CODEX'S NOW (`PxPanel`): the kit's nine-slice pixel
     border with its pale top-left light and dark outline, filled with the
     card's own face colour. It replaced a 2px bone rim, a 12px radius and a
     smooth gradient — the one look on the burrow that was not pixel art. */
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
  /* The heading-to-fine-print gap. `6cqh` landed on 6.7px in a desktop card,
     which is `--rr-pad-tight` to within a rounding error — so this was already
     the game's small gap, measured the long way round. Stated as the token now,
     which also stops it drifting with the card's height. */
  gap: 'var(--rr-pad-tight)',
  flex: 1,
  minWidth: 0,
};

/**
 * Group a number with thin separators — RE-EXPORTED, defined once.
 *
 * It lives in i18n/format.ts now, beside the duration and plural helpers,
 * because grouping is a language decision and the game speaks four. The
 * re-export is here so the several cards that already import it from their own
 * neighbour keep working; the comment explaining WHY it is hand-rolled rather
 * than `toLocaleString()` (a hydration mismatch) went with the code.
 */
export { groupDigits } from '@/i18n/format';

/** A card's heading line: the name on the left, its live value on the right. */
export function HubRow({ children }: { children: ReactNode }) {
  return <div style={headRow}>{children}</div>;
}

const headRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--rr-pad)',
  /* The row must be allowed to shrink inside the card's column, or its
     children's content widths become its floor and the heading's `nowrap`
     overflows the frame. */
  minWidth: 0,
  /* WRAP RATHER THAN CLIP. The heading and its value do not fit side by side
     in the 165px the art and frame leave (measured); given the choice between
     truncating the name, clipping the value, or letting the value drop to its
     own line, the last is the only one that loses no information. Most cards
     still fit on one line and are unaffected. */
  flexWrap: 'wrap',
  rowGap: '2px',
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
  fontSize: cardSize(14, 9, 14),
  /* Tighter than it was (0.06em), for the same reason the buttons' tracking
     came down: on an all-caps pixel face, tracking is what pushes a heading
     onto a second line. "BURROW - LVL 1" wrapped in 99px and ate a row the
     card could not spare — Paul's mock keeps every heading on one line. */
  letterSpacing: '0.02em',
  color: LABEL,
  lineHeight: 1,
  /* ONE LINE, ALWAYS. A heading that wraps steals a row from the card and
     makes the button below it look oversized by comparison, which is what
     "les bouttons sont toujours trop gros" was actually showing.

     AND THE ROW GIVES IT THE WIDTH. `nowrap` alone pushed the value beside it
     off the card (DONE and the burrow's price were clipped at the rim), and
     ellipsising the heading instead only traded a clipped value for a truncated
     name — "BURRO…" tells the player less than a wrapped line did.

     The text column is 165-172px once the art (46-53) and the frame (68) have
     taken theirs, against a heading of ~122 plus a value of ~60. They do not
     fit side by side, so `headRow` lets them STACK when they cannot — see
     there. The heading keeps its one line; the value drops under it, which is
     what Paul's mock does with the burrow's own price. */
  whiteSpace: 'nowrap',
  minWidth: 0,
};

export const valueText: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: cardSize(14, 9, 14),
  // Tabular digits, for the same reason the web face is used at all.
  fontVariantNumeric: 'tabular-nums',
  color: VALUE,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  // The carrot mark's gap to the number it marks — an image beside a label
  // takes the game's small gap, the same one every other pairing here uses.
  gap: 'var(--rr-pad-tight)',
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
  fontSize: cardSize(10.5, 8, 11),
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
