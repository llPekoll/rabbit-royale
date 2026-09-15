'use client';

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
import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton, PanelTitle } from '@domin8/arcade-kit';
import type { RaidState, Target } from './use-raid';
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
      label="GO RAIDING"
      sub={
        open.length === 0
          ? (targets.length > 0 ? 'ALL BURROWS SHIELDED' : 'NOBODY TO ROB')
          : `${short(loot)} UNGUARDED`
      }
      // Lit only when there is something to take. A warm tab over an empty
      // street is the same lie as a count of unreachable targets.
      ink={open.length === 0 ? DANGER : fat >= 1000 ? CARROT : LAMP}
      count={open.length || undefined}
      onClick={onOpen}
      ariaLabel="Raid another burrow"
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="rr-shop-scrim" onClick={onClose}>
      <section
        className="rr-shop-modal rr-raid-pick"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a burrow"
        onClick={(e) => e.stopPropagation()}
      >
        {/* THE CODEX'S FRAME (`PxPanel`) in the soil this dialog always was.
            The rows inside are nested panels in plank, the raised-block tone
            that used to draw their dividers; the footer is one too. The title
            and the [X] are the codex's own `PanelTitle` and `CloseButton`. */}
        <PxPanel color={SOIL} className="rr-raid-pick-frame">
          <header className="rr-shop-top">
            <h2 aria-label="Whose burrow?">
              <PanelTitle>WHOSE BURROW?</PanelTitle>
            </h2>
            <CloseButton
              inline
              className="rr-px-btn"
              onClick={onClose}
              aria-label="Close"
              style={{ height: 44, minWidth: 44 }}
            />
          </header>

          {targets.length === 0 ? (
            <p className="rr-shop-pay">Nobody else has a burrow yet.</p>
          ) : (
            <ul className="rr-raid-list">
              {targets.map((t) => {
                const off = busy || t.shielded;
                return (
                  <li key={t.id} className={t.shielded ? 'shielded' : ''}>
                    <PxPanel color={PLANK} className="rr-raid-row">
                      <span className="rr-raid-name">{t.name}</span>
                      <span className="rr-raid-stock">{t.stock.toLocaleString()} 🥕</span>
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
                        <span style={raidLabel}>{t.shielded ? 'Shielded' : 'Raid'}</span>
                      </PxButton>
                    </PxPanel>
                  </li>
                );
              })}
            </ul>
          )}

          <PxPanel color={PLANK} className="rr-shop-foot">
            <span>{note ?? 'Reach the carrot field. Their traps are buried and unmarked.'}</span>
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
  return (
    // The codex's frame in the HUD's own dark soil. `position: fixed` rides
    // inline because the frame sets `relative` on itself; where it sits (under
    // the MEASURED top chrome, clear of the carrot pill) is px-raid.css.
    <PxPanel color={SOIL_DEEP} className="rr-raid-hud" style={{ position: 'fixed' }}>
      <header>
        <span className="rr-raid-target">{raid.defender.name}'s burrow</span>
        {/* NAMED, not just a number behind a bolt. This is the crossing's own
            budget — it starts at RAID_RUN.START_ENERGY, a step costs one and a
            sprung trap eight — and it is NOT the burrow's banked energy, which
            a raid never touches. Both were drawn as "⚡ n", so a raider who
            walked out at 10 read it as their burrow having been emptied. The
            word is what tells the two bars apart. */}
        <span className="rr-raid-energy">
          &#9889; {raid.energy}<small>pas</small>
        </span>
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
          bottom-left — page.tsx), not a small text button in this HUD. It
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
          <strong>Out of energy</strong>
          <span className="rr-raid-haul">
            {raid.carrotsLooted > 0
              ? `+${raid.carrotsLooted.toLocaleString()} 🥕`
              : 'Nothing taken'}
          </span>
        </div>
      )}
    </PxPanel>
  );
}
