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
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { RaidOutcome, RaidState, Target } from './use-raid';

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
        <header className="rr-shop-top">
          <h2>Whose burrow?</h2>
          <button className="rr-shop-x" onClick={onClose} aria-label="Close">&times;</button>
        </header>

        {targets.length === 0 ? (
          <p className="rr-shop-pay">Nobody else has a burrow yet.</p>
        ) : (
          <ul className="rr-raid-list">
            {targets.map((t) => (
              <li key={t.id} className={t.shielded ? 'shielded' : ''}>
                <span className="rr-raid-name">{t.name}</span>
                <span className="rr-raid-stock">{t.stock.toLocaleString()} 🥕</span>
                {/* Shielded targets are shown but not attackable: hiding them
                    would make the list look empty for no visible reason. */}
                <button
                  onClick={() => onEnter(t.id)}
                  disabled={busy || t.shielded}
                >
                  {t.shielded ? 'Shielded' : 'Raid'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <footer className="rr-shop-foot">
          <span>{note ?? 'Reach the carrot field. Their traps are buried and unmarked.'}</span>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export interface RaidHudProps {
  raid: RaidState;
  outcome: RaidOutcome | null;
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
export function RaidHud({ raid, outcome, busy, note, onLeave }: RaidHudProps) {
  return (
    <div className="rr-raid-hud">
      <header>
        <span className="rr-raid-target">{raid.defender.name}'s burrow</span>
        <span className="rr-raid-energy">&#9889; {raid.energy}</span>
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

      {raid.finished && (
        <div className="rr-raid-over">
          <strong>
            {outcome?.reachedField
              ? 'You reached the field'
              : 'Out of energy'}
          </strong>
          <span className="rr-raid-haul">
            {raid.carrotsLooted > 0
              ? `+${raid.carrotsLooted.toLocaleString()} 🥕`
              : 'Nothing taken'}
          </span>
          <button onClick={onLeave} disabled={busy}>Back to the burrow</button>
        </div>
      )}
    </div>
  );
}
