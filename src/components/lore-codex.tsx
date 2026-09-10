'use client';

/**
 * The codex: the scroll in the burrow, and the chapters behind it.
 *
 * This is the first surface in Rabbit Royale built on `@domin8/arcade-kit`, and
 * it is deliberately the first. The rest of the game's chrome is plain dark
 * cards — fine for a HUD, wrong for the one screen whose whole job is to be
 * read for pleasure. The kit gives the hub's nine-slice panel, its pixel title
 * face and its [X], so the codex arrives already looking like part of the same
 * cabinet as the hub instead of like a black dialog someone bolted on.
 *
 * PARCHMENT. Every colour below is lifted from `scroll.png`'s own eight-colour
 * palette rather than invented beside it — the same rule the hub's quest board
 * follows, and for the same reason: a panel that wears the tan of the icon
 * announcing it reads as one object. The sprite's palette in full:
 *
 *   #fbeabd cream highlight · #f4d593 lit parchment · #e5b885 upper sheet
 *   #dea86c parchment · #b46e39 rolled shadow · #975528 deep tan
 *   #60331c dark brown · #1e130d outline ink
 *
 * Unlike the hub's quest board, the panel here IS the parchment rather than the
 * wall it is pinned to. That board sits in a rail beside other panels and needs
 * to hold its own edge against them; this one opens over a dimmed burrow with
 * nothing to compete with, and a lore book that is literally the colour of an
 * unrolled scroll is worth more than the contrast a stone slab would buy.
 *
 * TYPE. Chapters are prose — paragraphs that wrap — so the body is set in the
 * kit's pixel WEB font (`PIXEL_FONT_FAMILY`, proportional, kerns properly), not
 * in `BitmapText`, whose fixed-cell atlas is built for short labels and turns
 * a paragraph into a ransom note. The title uses `PanelTitle` like every other
 * dialog in the arcade; the chapter numerals use `BitmapText`, which is exactly
 * the short-label case it is good at.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  NineSlicePanel,
  PanelTitle,
  CloseButton,
  BitmapText,
  loadPixelWebFont,
  PIXEL_FONT_FAMILY,
} from '@domin8/arcade-kit';
import { LORE, nextChapter, unlockedCount, type LoreChapter } from '@/config/lore';
import { LauncherTab } from './burrow-chrome';

/** The sprite, at its native 30x31. Drawn `pixelated`, never resampled soft. */
const SCROLL_SRC = '/assets/ui/scroll.png';

/* ── The scroll's palette ──────────────────────────────────────────────── */
const SHEET = '#dea86c';        // the panel face: parchment
const INK = '#3b2415';          // body text: brown ink on tan, not black on tan
const INK_DIM = 'rgba(59,36,21,0.62)';
const RULE = 'rgba(96,51,28,0.34)'; // hairline dividers, the sprite's dark brown
const SEAL = '#975528';         // deep tan: the numeral discs and the read mark
const LOCK = 'rgba(96,51,28,0.45)'; // a chapter not yet earned

/**
 * The pixel face, as a CSS font.
 *
 * `loadPixelWebFont()` registers the face with the document and resolves when
 * it is ready. Rendering before that lands would flash the fallback stack for a
 * frame — on a panel that is almost entirely text, that flash is the whole
 * panel — so the body waits on the promise and swaps in once.
 */
function usePixelFont(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    loadPixelWebFont().then(() => live && setReady(true));
    return () => { live = false; };
  }, []);
  return ready;
}

export interface LoreButtonProps {
  /** Lifetime carrots — the counter that opens chapters. See config/lore.ts. */
  lifetime: number;
  onOpen(): void;
}

/**
 * The way in, in the burrow column.
 *
 * It reports how much of the codex is open, because that number is the reason
 * to tap it: "III / VI" is a collection with holes in it, while a button that
 * says only "Lore" is a link to a wall of text. When a chapter has just come
 * within reach the button says so instead — the milestone is the hook, and it
 * is worth more than the tally on the one visit where both are true.
 */
export function LoreButton({ lifetime, onOpen }: LoreButtonProps) {
  const open = unlockedCount(lifetime);
  const next = nextChapter(lifetime);
  // "Fresh" = the newest chapter opened within the last 500 carrots, which is
  // roughly one run at the low end. Long enough that a player who dug and then
  // went to bed still sees it; short enough that it is not a permanent badge.
  const fresh = open > 0 && lifetime - LORE[open - 1].unlockAt < 500;

  return (
    <LauncherTab
      sprite={SCROLL_SRC}
      // Taller than the tab so the scroll lies ON it rather than sitting in a
      // box — the move the hub's QUESTS tab makes, and the reason this reads
      // as an object instead of an icon.
      spriteSize={50}
      label="THE CURSED CROWN"
      sub={
        fresh ? 'NEW CHAPTER'
        : next ? `${open} OF ${LORE.length} CHAPTERS`
        : 'COMPLETE'
      }
      // A chapter that just opened is the reason to tap: it takes the lit
      // parchment, the one tone here that reads as treasure.
      ink={fresh ? '#f4d593' : '#dea86c'}
      onClick={onOpen}
      ariaLabel="The Cursed Crown lore"
    />
  );
}

export interface LoreCodexProps {
  lifetime: number;
  onClose(): void;
}

/**
 * The codex itself: a list of chapters on the left, the open one on the right.
 *
 * On a phone the two stack — the Seeker is the target device and a two-column
 * reader at 380px gives neither column enough room — so the chapter list
 * becomes a horizontal strip of numerals above the text. That is handled in CSS
 * rather than in a JS breakpoint, matching how the rest of this codebase decides.
 */
export function LoreCodex({ lifetime, onClose }: LoreCodexProps) {
  const open = unlockedCount(lifetime);
  const next = nextChapter(lifetime);
  const fontReady = usePixelFont();

  // Open on the NEWEST unlocked chapter, not the first. A returning player's
  // reason to open the codex is the thing they have not read yet; making them
  // walk back down the list to find it is the panel's one obvious failure mode.
  const [selected, setSelected] = useState(() => Math.max(0, open - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chapter = LORE[selected];
  const locked = lifetime < chapter.unlockAt;

  const bodyFont: CSSProperties = useMemo(
    () => ({ fontFamily: fontReady ? PIXEL_FONT_FAMILY : 'inherit' }),
    [fontReady],
  );

  return createPortal(
    <div className="rr-lore-scrim" onClick={onClose}>
      <div
        className="rr-lore-modal"
        role="dialog"
        aria-modal="true"
        aria-label="The Cursed Crown lore"
        onClick={(e) => e.stopPropagation()}
      >
        <NineSlicePanel color={SHEET} scale={5} style={{ position: 'relative' }}>
          <div className="rr-lore-inner">
            <header className="rr-lore-head">
              <span className="rr-lore-head-title">
                <img
                  className="pixelated"
                  src={SCROLL_SRC}
                  alt=""
                  width={30}
                  height={31}
                  aria-hidden
                />
                <PanelTitle style={{ color: INK }}>THE CURSED CROWN</PanelTitle>
              </span>
              <CloseButton inline onClick={onClose} aria-label="Close the codex" />
            </header>

            <div className="rr-lore-body">
              {/* ── The shelf ─────────────────────────────────────────── */}
              <nav className="rr-lore-list" aria-label="Chapters">
                {LORE.map((c, i) => (
                  <ChapterTab
                    key={c.id}
                    chapter={c}
                    index={i}
                    locked={lifetime < c.unlockAt}
                    active={i === selected}
                    onSelect={() => setSelected(i)}
                  />
                ))}
              </nav>

              <div className="rr-lore-rule" aria-hidden />

              {/* ── The page ──────────────────────────────────────────── */}
              <article className="rr-lore-page" style={bodyFont}>
                <h2 className="rr-lore-title" style={{ color: INK }}>
                  {chapter.title}
                </h2>

                {locked ? (
                  /* A locked chapter still shows its subject and its price. A
                     row that says only "locked" tells the player nothing about
                     whether it is worth digging for. */
                  <>
                    <p className="rr-lore-teaser" style={{ color: INK_DIM }}>
                      {chapter.teaser}
                    </p>
                    <p className="rr-lore-locked" style={{ color: INK_DIM }}>
                      Sealed until {chapter.unlockAt.toLocaleString('en-US')} lifetime
                      carrots. You have {lifetime.toLocaleString('en-US')}.
                    </p>
                  </>
                ) : (
                  chapter.body.map((para, i) => (
                    <p key={i} className="rr-lore-para" style={{ color: INK }}>
                      {para}
                    </p>
                  ))
                )}
              </article>
            </div>

            {/* The footer is the "keep digging" line — the only place the panel
                talks about the counter rather than the story. Lifetime is never
                stolen and never reset, so this progress can only ever go up:
                worth saying, because every other number in this game can fall. */}
            <footer className="rr-lore-foot" style={bodyFont}>
              {next ? (
                <>
                  <span style={{ color: INK_DIM }}>
                    Next chapter in{' '}
                    <b style={{ color: SEAL }}>
                      {next.remaining.toLocaleString('en-US')}
                    </b>{' '}
                    carrots
                  </span>
                  <span className="rr-lore-foot-note" style={{ color: INK_DIM }}>
                    Lifetime carrots only. Nothing here can be raided away.
                  </span>
                </>
              ) : (
                <span style={{ color: SEAL }}>
                  The codex is complete. The island is still waiting.
                </span>
              )}
            </footer>
          </div>
        </NineSlicePanel>
      </div>
    </div>,
    document.body,
  );
}

/** One chapter on the shelf: numeral disc, title, and its state. */
function ChapterTab({
  chapter, index, locked, active, onSelect,
}: {
  chapter: LoreChapter;
  index: number;
  locked: boolean;
  active: boolean;
  onSelect(): void;
}) {
  return (
    <button
      className={`rr-lore-tab${active ? ' active' : ''}${locked ? ' locked' : ''}`}
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
    >
      {/* The numeral is a short label on a disc — the case BitmapText is for.
          `scale` 1 keeps it inside the 26px disc at every step of the ladder.
          The basic face is a MASK sheet painted with `currentColor`, so its ink
          is set through `color` on the wrapper, not through a prop. */}
      <span
        className="rr-lore-numeral"
        style={{ background: locked ? LOCK : SEAL, color: '#f4d593' }}
      >
        <BitmapText scale={1}>{chapter.numeral}</BitmapText>
      </span>
      <span className="rr-lore-tab-text">
        <span className="rr-lore-tab-title" style={{ color: locked ? INK_DIM : INK }}>
          {locked ? `Chapter ${index + 1}` : chapter.title}
        </span>
        <span className="rr-lore-tab-sub" style={{ color: INK_DIM }}>
          {locked
            ? `${chapter.unlockAt.toLocaleString('en-US')} carrots`
            : chapter.teaser}
        </span>
      </span>
    </button>
  );
}

export { RULE as LORE_RULE };
