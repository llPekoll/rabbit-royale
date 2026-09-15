'use client';

/**
 * THE QUEST CARD — one ask at a time, in the burrow column.
 *
 * WHAT IT SHOWS. The active quest (config/quests.ts): its place in the arc,
 * the ask in one line, and where the player stands against the goal. When
 * the quest is DONE the card grows a CLAIM slab across its foot — the same
 * shape as the garden's HARVEST, because it is the same gesture: something is
 * standing there, take it. The island's line for the quest is NOT on the card;
 * it is said once, as the toast, when the reward is taken. The card is an
 * instruction, and an instruction with a paragraph under it is a card nobody
 * reads on a phone.
 *
 * WHY THE MOCK'S SLAB AND NOT THE WOODEN FRAME. It sits between energy and
 * the garden and has to read as one of them — see `hub-card.tsx`.
 *
 * NOTHING HERE BLOCKS. A player who ignores the card plays the same game; the
 * card is a pull, and the reward is what pulls. When every reward is taken
 * the card is simply not rendered (`quest` null), rather than sitting there
 * saying "all done" for the rest of the account's life.
 */
import type { CSSProperties } from 'react';
import {
  HubCard, HubRow, headingText, valueText, subText, SUB_CLASS,
} from './hub-card';
import type { QuestView } from '@/config/quests';

export interface QuestCardProps {
  quest: QuestView;
  onClaim?(): void;
  /** A claim is in flight; the slab must not be pressed twice. */
  pending?: boolean;
}

/* ── Sampled from the garden card, so the two slabs are one object ──────── */
const BTN = '#e4762b';
const BTN_LIP = '#ffd6ae';
const BTN_SHADOW = '#9a4810';
const BTN_OFF = '#5a3320';
const BTN_OFF_SHADOW = '#2f1a10';
const BTN_OFF_INK = '#9a8270';
/** The done state's value colour — the lamp, so "DONE" reads as lit. */
const LIT = '#ffd138';
const SCROLL_ART = '/assets/ui/scroll.png';

/** The reward, as the slab names it: what you get, not what it is called. */
export function rewardLabel(quest: QuestView): string {
  const { carrots, item } = quest.reward;
  if (item) return `CLAIM ${item.qty} ${item.kind.toUpperCase()}${item.qty > 1 ? 'S' : ''}`;
  if (carrots) return `CLAIM +${carrots}`;
  return 'CLAIM';
}

export function QuestCard({ quest, onClaim, pending }: QuestCardProps) {
  const canClaim = quest.done && !pending;

  const footer = quest.done ? (
    <button
      type="button"
      className="rr-hub-btn rr-slab-btn"
      onClick={onClaim}
      disabled={!canClaim}
      aria-label={`${rewardLabel(quest)} for ${quest.title}`}
      style={{ ...slab, background: canClaim ? BTN_LIP : BTN_OFF_SHADOW }}
    >
      <span
        className="rr-slab-face"
        style={{
          ...face,
          background: canClaim ? BTN : BTN_OFF,
          color: canClaim ? '#ffffff' : BTN_OFF_INK,
          boxShadow: `inset 0 -3px 0 ${canClaim ? BTN_SHADOW : BTN_OFF_SHADOW}`,
        }}
      >
        {rewardLabel(quest)}
      </span>
    </button>
  ) : undefined;

  return (
    // The garden's share when there is a slab to hold, energy's when there is
    // not — the card changes shape with its state, like the garden does with
    // an empty field, and for the same reason: a slab-sized card with no slab
    // is a hole in the column.
    <HubCard
      ratio={quest.done ? 14.5 : 12.4}
      art={SCROLL_ART}
      artHeight={quest.done ? '39cqh' : '59cqh'}
      artAlign={quest.done ? 'start' : 'center'}
      footer={footer}
    >
      <HubRow>
        <span style={headingText}>QUEST {quest.index}/{quest.total}</span>
        <span style={{ ...valueText, color: quest.done ? LIT : undefined }}>
          {quest.done ? 'DONE' : quest.goal > 1 ? `${quest.progress}/${quest.goal}` : ''}
        </span>
      </HubRow>
      {/* The ASK, not the title: on a card this size there is room for one
          line, and "Dig 10 tiles." is the line that tells the player what to
          do. The title names the quest in the toast when it is claimed. */}
      <p className={SUB_CLASS} style={{ ...subText, color: quest.done ? LIT : undefined }}>
        {quest.done ? quest.title : quest.ask}
      </p>
    </HubCard>
  );
}

const face: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: 'calc(100% - 3px)',
  position: 'absolute',
  top: 0,
  left: 0,
  borderRadius: 8,
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(9px, 15cqh, 15px)',
  letterSpacing: '0.08em',
  transition: 'transform 90ms ease-out',
};

const slab: CSSProperties = {
  height: '50cqh',
  minHeight: 32,
  flexShrink: 0,
  width: '100%',
  position: 'relative',
  border: 'none',
  borderRadius: 8,
  lineHeight: 1,
  padding: 0,
  overflow: 'hidden',
};
