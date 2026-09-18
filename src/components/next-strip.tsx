'use client';

/**
 * THE NEXT STRIP — one line at the top of the column that says what to do.
 *
 * While the quest arc runs, the quest card is this strip. Once every reward
 * is claimed the line comes from `nextAction` (config/next-action.ts): the
 * garden nearly full, the shield about to lift, a burrow worth raiding, or
 * the island. It never disappears: a burrow with nothing pointing anywhere is
 * a column of readings, and the loop is what this line is for.
 *
 * Gold like the quest card when it is done, because they are the same object
 * at two moments: "here is the next thing". It wears the codex's pixel button
 * (`PxButton`) in the cards' soil, and the gold that was its rim is the
 * button's gloss (and its label's ink).
 */
import type { CSSProperties } from 'react';
import type { NextAction } from '@/config/next-action';
import type { QuestDoor } from '@/config/quests';
import { PxButton, pxLabel } from './px';
import { useT } from '@/i18n/provider';

const FACE = '#2d1610';
const BEVEL = '#1c0d08';
const GOLD = '#ffd138';
const INK = '#f5e6d3';

/**
 * THE DOOR IS HANDED BACK, not looked up again.
 *
 * The strip's line and its destination are the SAME reading, and they have to
 * travel together. `onClick` used to take nothing, so the page re-read
 * `next.door` inside the handler — and `next` is recomputed whenever the
 * burrow, the shop or the target list is refreshed, which happens on a 60s
 * timer and on half a dozen events besides. A target that shielded (or had its
 * garden emptied) between the render and the finger dropped the door from
 * 'raid' to 'farm': the strip still SAID "Raid X" and the tap started a dig.
 *
 * Passing the action's own door closes that window for good. Whatever the
 * player read is what runs, however stale it has become by the time they
 * reach it — a tap that does what the line promised, or nothing at all.
 */
export function NextStrip({ action, onClick }: { action: NextAction; onClick?(door: QuestDoor): void }) {
  const t = useT();
  return (
    <PxButton
      type="button"
      className="rr-next-strip"
      onClick={() => onClick?.(action.door)}
      aria-label={t.next.aria(action.text)}
      color={FACE}
      shadowColor={BEVEL}
      highlightColor={GOLD}
      textColor={INK}
      style={strip}
    >
      <span style={row}>
        <span style={label}>{t.next.label}</span>
        <span style={text}>{action.text}</span>
      </span>
    </PxButton>
  );
}

const strip: CSSProperties = {
  width: '100%',
  height: 'auto',
  minHeight: 44,
  justifyContent: 'flex-start',
  /* The one label pad, as on every button. */
  padding: 'var(--rr-btn-pad)',
  boxSizing: 'border-box',
  textAlign: 'left',
  whiteSpace: 'normal',
  textTransform: 'none',
  letterSpacing: 'normal',
  fontWeight: 400,
  pointerEvents: 'auto',
};

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  /* The one gap between a label and the text beside it. */
  gap: 'var(--rr-pad)',
  minWidth: 0,
};

const label: CSSProperties = {
  ...pxLabel,
  fontSize: 11,
  letterSpacing: '0.1em',
  color: GOLD,
  flexShrink: 0,
};

const text: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(10px, 1.6svh, 12px)',
  lineHeight: 1.3,
  color: INK,
  minWidth: 0,
};
