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
 * Gold rim like the quest card when it is done, because they are the same
 * object at two moments: "here is the next thing".
 */
import type { CSSProperties } from 'react';
import type { NextAction } from '@/config/next-action';

export function NextStrip({ action, onClick }: { action: NextAction; onClick?(): void }) {
  return (
    <button type="button" className="rr-next-strip" onClick={onClick} style={strip} aria-label={`Next: ${action.text}`}>
      <span style={label}>NEXT</span>
      <span style={text}>{action.text}</span>
    </button>
  );
}

const strip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '10px 14px',
  boxSizing: 'border-box',
  background: 'linear-gradient(180deg, #2d1610 0%, #1c0d08 100%)',
  border: '2px solid #ffd138',
  borderRadius: 12,
  boxShadow: '0 3px 0 rgba(0, 0, 0, 0.35)',
  textAlign: 'left',
  pointerEvents: 'auto',
};

const label: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 11,
  letterSpacing: '0.1em',
  color: '#ffd138',
  flexShrink: 0,
};

const text: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(10px, 1.6svh, 12px)',
  lineHeight: 1.3,
  color: '#f5e6d3',
  minWidth: 0,
};
