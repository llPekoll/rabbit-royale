'use client';

import { WoodlandClose as CloseButton } from '@/components/woodland/runtime';

/**
 * The raid: choosing a burrow, and the HUD while you are inside one.
 *
 * The board itself is the Pixi scene behind this — a raid is walked on the
 * ground, not in a list — so everything here is deliberately thin: who you are
 * robbing, what is left of your energy, and the way out. The panel never draws
 * a tile.
 *
 * It reuses the shed's palette (warm earth, lamplight) rather than the app's
 * slate, because a raid and a shop are the two screens that are about somebody
 * else's carrots, and they should feel like the same world.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useT } from '@/i18n/provider';
import { groupDigits, shortWait } from '@/i18n/format';
import { createPortal } from 'react-dom';

import { PanelTitle } from './pixel-text';
import { presenceOf, type RaidState, type Target } from './use-raid';
import { LauncherTab, CARROT, DANGER, LAMP, PLANK, SOIL, SOIL_DEEP } from './burrow-chrome';
import { LootChest, CHEST_ASPECT } from './loot-chest';
import { PxButton, PxPanel, pxLabel } from './px';

export interface RaidButtonProps {
  targets: Target[];
  onOpen(): void;
}

/**
 * The way out of your own burrow and into someone else's.
 *
 * It reports the SIZE OF THE PRIZE rather than a target count, because that is
 * the number that decides whether to go: "4.8k unguarded" is a reason, "3
 * targets" is a menu item. Shielded burrows are excluded from that figure —
 * counting carrots you cannot take would be the button lying about the trip.
 *
 * The subtitle goes quiet rather than the button disappearing when there is
 * nobody to rob: raiding is half the game, and a door that vanishes when the
 * street is empty reads as a broken feature rather than a quiet night.
 */
export function RaidButton({ targets, onOpen }: RaidButtonProps) {
  // `d`, not `t`: in this file `t` is already a raid TARGET in the list's
  // own map callbacks, and shadowing it there would be a real bug.
  const d = useT();
  const open = targets.filter((t) => !t.shielded);
  const loot = open.reduce((n, t) => n + t.stock, 0);
  const fat = open.length > 0 ? Math.max(...open.map((t) => t.stock)) : 0;

  return (
    <LauncherTab
      // The kit's chest, the same object the shop tab wears — and drawn from
      // the arcade-kit atlas rather than a file in public/, which is what
      // keeps it from 404ing the way a loose sprite would.
      art={<LootChest size={46} />}
      spriteSize={46}
      spriteHeight={Math.round(46 * CHEST_ASPECT)}
      label={d.raid.go}
      sub={
        open.length === 0
          ? (targets.length > 0 ? d.raid.allShielded : d.raid.nobody)
          : d.raid.unguarded(short(loot))
      }
      // Lit only when there is something to take. A warm tab over an empty
      // street is the same lie as a count of unreachable targets.
      ink={open.length === 0 ? DANGER : fat >= 1000 ? CARROT : LAMP}
      count={open.length || undefined}
      onClick={onOpen}
      ariaLabel={d.raid.another}
    />
  );
}

/** 4820 -> "4.8k". The tab is one line wide; five digits do not fit it. */
function short(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

export interface TargetListProps {
  targets: Target[];
  busy: boolean;
  onEnter(id: string): void;
  onClose(): void;
  note?: string | null;
}

/** Who is worth robbing. Ordered by stock, because that is the reason to go. */
export function TargetList({ targets, busy, onEnter, onClose, note }: TargetListProps) {
  // `d`, not `t`: in this file `t` is already a raid TARGET in the list's
  // own map callbacks, and shadowing it there would be a real bug.
  const d = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // HOW LONG THE SHIELDS STILL HAVE TO RUN, ticked here rather than re-fetched.
  //
  // `shieldedFor` is a duration measured when the list arrived, so what is left
  // is that minus however long this panel has been open. One minute is the
  // right grain: the label is rounded to minutes at its finest, so a faster
  // clock would re-render the whole list to draw the same string.
  //
  // The tick matters beyond the label: a shield that lifts while the panel is
  // open unlocks its RAID button on its own, instead of leaving a row that
  // refuses a burrow which is in fact open.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((ms) => ms + 60_000), 60_000);
    return () => window.clearInterval(id);
  }, [targets]);

  return createPortal(
    <div className="rr-shop-scrim" onClick={onClose}>
      <section
        className="rr-shop-modal rr-raid-pick"
        role="dialog"
        aria-modal="true"
        aria-label={d.raid.choose}
        onClick={(e) => e.stopPropagation()}
      >
        {/* THE CODEX'S FRAME (`PxPanel`) in the soil this dialog always was.
            The rows inside are nested panels in plank, the raised-block tone
            that used to draw their dividers; the footer is one too. The title
            and the [X] are the codex's own `PanelTitle` and `CloseButton`. */}
        <PxPanel color={SOIL} className="rr-raid-pick-frame">
          <header className="rr-shop-top">
            <h2 aria-label={d.raid.whose}>
              <PanelTitle>{d.raid.whose}</PanelTitle>
            </h2>
            <CloseButton onClick={onClose} aria-label={d.chrome.close} />
          </header>

          {targets.length === 0 ? (
            <p className="rr-shop-pay">{d.raid.nobodyYet}</p>
          ) : (
            <ul className="rr-raid-list">
              {targets.map((t) => {
                // What is left of their shield right now. A target with no
                // `shieldedFor` (an older server) keeps the flag it was sent,
                // and simply shows no clock.
                const left = t.shieldedFor === undefined
                  ? undefined
                  : Math.max(0, t.shieldedFor - elapsed);
                const shielded = left === undefined ? t.shielded : left > 0;
                const off = busy || shielded;
                // Doubles as the badge's class and its dictionary key, so the
                // three states cannot drift apart between the word and the
                // colour that is supposed to mean the same thing.
                const where = presenceOf(t);
                return (
                  <li key={t.id} className={shielded ? 'shielded' : ''}>
                    <PxPanel color={PLANK} className="rr-raid-row">
                      {/* WHERE THE OWNER IS STANDING, under their name.
                          The list ranked burrows by stock alone, which answers
                          "how much" and not "what kind of raid is this" — and
                          those are three different raids (see `Presence`).

                          ALWAYS a word, on every row, including `away`. The
                          first cut only marked the diggers, which left the
                          blank rows saying two opposite things at once: nobody
                          home, and home and watching. A raider cannot act on
                          that, so silence is not one of the three states. */}
                      <span className="rr-raid-name">
                        {t.name}
                        <small className={`rr-raid-where ${where}`}>
                          <i aria-hidden />
                          {d.raid.presence[where]}
                        </small>
                      </span>
                      <span className="rr-raid-stock">{groupDigits(t.stock)} 🥕</span>
                      {/* Shielded targets are shown but not attackable: hiding
                          them would make the list look empty for no visible
                          reason. RAID wiggles — it is the loudest thing on
                          this screen, the tap that starts a robbery. */}
                      <PxButton
                        type="button"
                        onClick={() => onEnter(t.id)}
                        disabled={off}
                        color={off ? RAID_OFF : DANGER}
                        shadowColor={off ? RAID_OFF_SHADOW : RAID_SHADOW}
                        textColor={off ? RAID_OFF_INK : RAID_INK}
                        wiggle={!off}
                        style={raidButton}
                      >
                        {/* WHEN the shield lifts, not merely that it is up.
                            The row already says a burrow is out of reach; the
                            raider's actual question is whether it is worth
                            coming back tonight, and these shields run from 6h
                            to 48h. The wait rides UNDER the word so the button
                            keeps its width — a stack of two short lines, not
                            one long one that would push the list sideways. */}
                        <span style={raidLabel}>
                          {shielded ? d.raid.shielded : d.raid.raidIt}
                          {shielded && left ? (
                            <small style={raidWait}>{shortWait(left, d.units)}</small>
                          ) : null}
                        </span>
                      </PxButton>
                    </PxPanel>
                  </li>
                );
              })}
            </ul>
          )}

          <PxPanel color={PLANK} className="rr-shop-foot">
            <span>{note ?? d.raid.brief}</span>
          </PxPanel>
        </PxPanel>
      </section>
    </div>,
    document.body,
  );
}

/* The RAID button's colours, kept from the outline button it was: its red rim
   (DANGER) is now the face, the darker raid red under it is the bevel, and the
   salmon ink is lifted a step so it still reads on a filled red face. Off (a
   shielded target, or a raid already starting) keeps the off colours it had —
   the app's slate rim and muted ink. */
const RAID_SHADOW = '#6b2f24';
const RAID_INK = '#ffe9e2';
const RAID_OFF = '#30363d';
const RAID_OFF_SHADOW = '#1c2024';
const RAID_OFF_INK = '#8b949e';

/** 44px tall — the touch floor — at any chrome pixel size. */
const raidButton: CSSProperties = {
  height: 44,
  minWidth: 84,
};
const raidLabel: CSSProperties = { ...pxLabel, fontSize: 12 };
/**
 * The shield's remaining wait, under the word on the same dead button.
 *
 * NOT dimmed. The row it rides on is already at 0.45 opacity — that is what
 * says "out of reach" — and a second veil on top of it left the clock as grey
 * mush on a grey face, which is the one thing here the player has to be able
 * to read. The size alone (10 against the label's 12) makes it the footnote.
 */
const raidWait: CSSProperties = {
  display: 'block',
  fontSize: 11,
  marginTop: 3,
  // Lamplight, the same warm ink the rest of this world states a WAIT in. The
  // button's own off-ink is slate, and a slate clock on a slate face is the
  // one thing on this row the player actually came back to read.
  color: LAMP,
};

export interface RaidHudProps {
  raid: RaidState;
  busy: boolean;
  note?: string | null;
  onLeave(): void;
}

/**
 * The thin bar over the board while a raid is live.
 *
 * Energy first and widest: it is the only resource, every step spends it, and
 * it is what the player prices the next tile against. The same reasoning as the
 * island's HUD, because it is the same decision.
 */
export function RaidHud({ raid, busy, note, onLeave }: RaidHudProps) {
  // `d`, not `t`: in this file `t` is already a raid TARGET in the list's
  // own map callbacks, and shadowing it there would be a real bug.
  const d = useT();
  return (
    // The codex's frame in the HUD's own dark soil. `position: fixed` rides
    // inline because the frame sets `relative` on itself; where it sits (under
    // the MEASURED top chrome, clear of the carrot pill) is px-raid.css.
    <PxPanel color={SOIL_DEEP} className="rr-raid-hud" style={{ position: 'fixed' }}>
      <header>
        <span className="rr-raid-target">{raid.defender.name}'s burrow</span>
        {/* NO ENERGY READOUT HERE. The raid spends the one tank, and the
            medallion on the carrot pill shows it ticking (page.tsx
            `liveEnergy`); a second "⚡ n" on this plate was the two-bars
            confusion this panel's old note apologised for. */}
        {raid.trapsSprung > 0 && (
          <span className="rr-raid-sprung">🪤 {raid.trapsSprung}</span>
        )}
      </header>

      {/* A smoke screen has to ANNOUNCE itself. A board with no numbers and no
          explanation reads as a broken game rather than as a defence somebody
          paid for. */}
      {raid.smoked && !raid.finished && (
        <p className="rr-raid-smoke">Smoke. No numbers here. Walk it blind.</p>
      )}

      {note && !raid.finished && <p className="rr-raid-note">{note}</p>}

      {/* The way out, MID-RAID, is the shared BackButton now ("Retreat",
          bottom-CENTRE — page.tsx), not a small text button in this HUD. It
          exists for the same reason it always did: a raider who changed their
          mind was stuck on someone else's board until their energy ran out. */}

      {/* The end, WITHOUT a button — and only for a LOSS.
          The board carries the moment (the rabbit collapses where its energy
          ran out) and the page takes the player home by itself a couple of
          seconds later, with the news announced in their own burrow. This line
          only names what happened while that plays out.

          A WIN says nothing here any more. It now raises the full-screen
          ceremony (`components/raid-victory`) over this whole board, and the
          two seconds before it arrives are the rabbit's dance — printing
          "You reached the field! +4,820" in the corner first makes the stage
          that follows a repeat of a corner label rather than the announcement.

          Keyed on `raid.succeeded` rather than `outcome.reachedField`: the
          outcome only rides the response that ended the raid, so after a
          reload a won raid has none — and this line used to answer "Out of
          energy" to a raid the player had just won. */}
      {raid.finished && !raid.succeeded && (
        <div className="rr-raid-over">
          {/* Struck says STRUCK: the defender did this, from their own screen,
              and "Out of energy" would blame a bar that was not empty. */}
          <strong>{raid.struck ? d.raid.struck : d.raid.outOfEnergy}</strong>
          <span className="rr-raid-haul">
            {raid.carrotsLooted > 0
              ? d.raid.looted(groupDigits(raid.carrotsLooted))
              : d.raid.nothingTaken}
          </span>
        </div>
      )}
    </PxPanel>
  );
}
