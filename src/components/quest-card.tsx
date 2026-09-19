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
import { useEffect, useRef, type CSSProperties } from 'react';
import gsap from 'gsap';
import { PxButton, pxLabel } from './px';
import {
  HubCard, HubRow, headingText, valueText, subText, SUB_CLASS, cardSize,
} from './hub-card';
import type { QuestView } from '@/config/quests';
import { useT } from '@/i18n/provider';
import type { Dict } from '@/i18n/dictionaries';
import { treasurePiece } from './treasure-piece';

export interface QuestCardProps {
  quest: QuestView;
  onClaim?(): void;
  /** A claim is in flight; the slab must not be pressed twice. */
  pending?: boolean;
  /**
   * Bumped the moment the ask is DONE — a gold ring lights around the card.
   * The page detects the transition (it sees the board before and after);
   * the card only has to celebrate when told.
   */
  celebrateKey?: number;
  /** Bumped when a reward was just TAKEN: confetti off the card, and the
   *  next ask slides in. */
  claimKey?: number;
}

/** How many pieces of loot a claim throws. */
const CONFETTI_COUNT = 18;

/**
 * A burst of loot from the card's centre — a claim is a small win, and a
 * small win gets a small stage. Coins and jewels (`treasurePiece`), where it
 * used to throw flat paper chips. Fires on `fireKey`; nothing on mount.
 */
function ConfettiBurst({ fireKey }: { fireKey: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!fireKey || !el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const chips: HTMLElement[] = [];
    const tl = gsap.timeline({ onComplete: () => chips.forEach((c) => c.remove()) });
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      // 1x or 2x the native pixel: a card-sized burst, not the raid's stage.
      const chip = treasurePiece(i, Math.random() < 0.5 ? 1 : 2);
      el.appendChild(chip);
      chips.push(chip);
      const angle = gsap.utils.random(-Math.PI, 0);
      const speed = gsap.utils.random(70, 150);
      tl.fromTo(chip,
        { x: 0, y: 0, opacity: 1, rotation: 0 },
        {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed + 90,
          rotation: gsap.utils.random(-360, 360),
          opacity: 0,
          duration: gsap.utils.random(0.7, 1.0),
          ease: 'power2.out',
        }, 0);
    }
    return () => { tl.kill(); chips.forEach((c) => c.remove()); };
  }, [fireKey]);
  return <div className="rr-confetti-burst" ref={host} aria-hidden />;
}

/* ── Sampled from the garden card, so the two slabs are one object ──────── */
/* CLAIM — the carrot orange, sampled off Paul's mock (2026-09-19): the three
   card buttons used to share ONE face (#e4762b), so the screen offered three
   identical orange slabs and the colour said nothing about the action. Each
   verb takes its own tone now: taking a reward is the carrot's orange, and it
   stays the loudest of the three because it is the one that pays out. */
const BTN = '#d96626';
const BTN_LIP = '#ffa157';
const BTN_SHADOW = '#793513';
const BTN_OFF = '#5a3320';
const BTN_OFF_SHADOW = '#2f1a10';
const BTN_OFF_INK = '#9a8270';
/** The done state's value colour — the lamp, so "DONE" reads as lit. */
const LIT = '#ffd138';
const SCROLL_ART = '/assets/ui/scroll.png';

/** The reward, as the slab names it: what you get, not what it is called. */
export function rewardLabel(t: Dict, quest: QuestView): string {
  const { carrots, item } = quest.reward;
  // The item's NAME comes from the dictionary, not from its key upper-cased:
  // "BOMBS" was built by bolting an English plural S onto an id.
  if (item) return t.quest.claimItem(item.qty, t.items[item.kind].name);
  if (carrots) return t.quest.claimCarrots(carrots);
  return t.quest.claim;
}

export function QuestCard({
  quest, onClaim, pending, celebrateKey = 0, claimKey = 0,
}: QuestCardProps) {
  const t = useT();
  const canClaim = quest.done && !pending;

  const footer = quest.done ? (
    // The codex's pixel button in the carrot it always was — see `PxButton`.
    // It wiggles: taking a reward is one of the loud moments.
    <PxButton
      type="button"
      className="rr-hub-btn rr-carrot-price"
      onClick={onClaim}
      disabled={!canClaim}
      aria-label={t.quest.aria(rewardLabel(t, quest), quest.title)}
      color={canClaim ? BTN : BTN_OFF}
      shadowColor={canClaim ? BTN_SHADOW : BTN_OFF_SHADOW}
      textColor={canClaim ? '#ffffff' : BTN_OFF_INK}
      wiggle
      style={slab}
    >
      <span style={{ ...pxLabel, fontSize: cardSize(15, 9, 15) }}>{rewardLabel(t, quest)}</span>
    </PxButton>
  ) : undefined;

  return (
    // The wrapper carries the two celebrations. Keyed on the CLAIM so a new
    // ask slides in fresh; the glow class is re-applied per `celebrateKey`
    // by remounting the same element, which is what replays a CSS animation.
    <div
      key={`${claimKey}:${celebrateKey}`}
      className={
        `${celebrateKey > 0 && quest.done ? 'rr-quest-done' : ''}`
        + `${claimKey > 0 ? ' rr-quest-next' : ''}`
      }
      style={{ position: 'relative' }}
    >
      <ConfettiBurst fireKey={claimKey} />
      {/* The garden's share when there is a slab to hold, energy's when there
          is not — the card changes shape with its state, like the garden does
          with an empty field, and for the same reason: a slab-sized card with
          no slab is a hole in the column. */}
      <HubCard
        ratio={quest.done ? 14.5 : 12.4}
        // The garden card's floor when it holds the same button.
        floor={quest.done ? 66 : 44}
        art={SCROLL_ART}
        artHeight={quest.done ? '39cqh' : '59cqh'}
        artAlign={quest.done ? 'start' : 'center'}
        footer={footer}
      >
        <HubRow>
          <span style={headingText}>{t.quest.counter(quest.index, quest.total)}</span>
          <span style={{ ...valueText, ...(quest.done ? { color: LIT } : null) }}>
            {quest.done ? t.quest.done : quest.goal > 1 ? t.quest.progress(quest.progress, quest.goal) : ''}
          </span>
        </HubRow>
        {/* The ASK, not the title: on a card this size there is room for one
            line, and "Dig 10 tiles." is the line that tells the player what to
            do. The title names the quest in the toast when it is claimed. */}
        {/* Spread-or-nothing, never `color: undefined`: React deletes an
            undefined style property, so the line would inherit the page's
            near-white instead of falling back to `subText`'s ink — invisible
            on the vine banner's cream board. */}
        <p className={SUB_CLASS} style={{ ...subText, ...(quest.done ? { color: LIT } : null) }}>
          {quest.done ? quest.title : quest.ask}
        </p>
      </HubCard>
    </div>
  );
}

/** The claim button's size in its card; the look is `PxButton`'s. */
const slab: CSSProperties = {
  height: '50cqh',
  minHeight: 32,
  flexShrink: 0,
  width: '100%',
};
