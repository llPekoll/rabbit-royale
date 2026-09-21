'use client';

/**
 * WHICH ISLAND? The list on DIG (Paul, 21 September 2026: difficulty is
 * PROGRESSIVE WHILE LEARNING, CHOSEN AFTERWARDS). One row per island a
 * newcomer could be seated on — its tier, who is digging it, how many chests
 * are left — and one row per tier to open a fresh island, greyed above the
 * highest tier this player has dug their way to. Joining a busy island is a
 * short, safe session with a share of the chests (measured: at four nobody
 * dies, even on Caldera); opening one alone is the long run where a rabbit
 * can die. That is the second dial of difficulty, beside the tier, and it
 * existed before anyone could see it.
 *
 * The raid's target list, in shape and in chrome (`TargetList`): same scrim,
 * same frame, same plank rows — one screen the player already knows.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { WoodlandClose as CloseButton } from '@/components/woodland/runtime';
import { useT } from '@/i18n/provider';
import { groupDigits } from '@/i18n/format';
import { islandName } from '@/i18n/content';
import { ISLAND_TIERS } from '@config/tuning';
import { PanelTitle } from './pixel-text';
import { CARROT, PLANK, SOIL } from './burrow-chrome';
import { PxButton, PxPanel } from './px';
import type { IslandChoice, IslandListing } from './use-game-socket';

export interface IslandPickerProps {
  /** Null while the list is being fetched, or when the socket had no answer. */
  listing: IslandListing | null;
  busy: boolean;
  onChoose: (choice: IslandChoice) => void;
  onClose: () => void;
}

export function IslandPicker({ listing, busy, onChoose, onClose }: IslandPickerProps) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const unlocked = listing?.unlocked ?? 0;
  const tierName = (name: string) => islandName(t, name);

  return createPortal(
    <div className="rr-shop-scrim" onClick={onClose}>
      <section
        className="rr-shop-modal rr-raid-pick rr-island-pick"
        role="dialog"
        aria-modal="true"
        aria-label={t.islandPick.choose}
        onClick={(e) => e.stopPropagation()}
      >
        <PxPanel color={SOIL} className="rr-raid-pick-frame">
          <header className="rr-shop-top">
            <h2 aria-label={t.islandPick.which}>
              <PanelTitle>{t.islandPick.which}</PanelTitle>
            </h2>
            <CloseButton onClick={onClose} aria-label={t.chrome.close} />
          </header>

          {listing === null ? (
            <p className="rr-shop-pay">{t.islandPick.loading}</p>
          ) : (
            <ul className="rr-raid-list">
              {/* THE LIVE ISLANDS FIRST, fullest first: the ones with company. */}
              {[...listing.islands].sort((a, b) => b.rabbits - a.rabbits).map((i) => (
                <li key={i.id}>
                  <PxPanel color={PLANK} className="rr-raid-row">
                    <span className="rr-raid-name">
                      {tierName(i.tier)}
                      <small className="rr-raid-where digging">
                        <i aria-hidden />
                        {t.islandPick.row(i.rabbits, i.chestsLeft, i.chestsTotal, Math.round(100 * i.dugFraction))}
                        {(i.chestsLeft <= 3 || i.dugFraction >= 0.7) && <>{' \u00b7 '}{t.islandPick.almostDone}</>}
                      </small>
                    </span>
                    <PxButton
                      type="button"
                      onClick={() => onChoose({ islandId: i.id })}
                      disabled={busy}
                      color={CARROT}
                      wiggle={!busy}
                    >
                      {t.islandPick.join}
                    </PxButton>
                  </PxPanel>
                </li>
              ))}
              {/* THEN A FRESH ISLAND, one row per tier, the ladder in order. */}
              {ISLAND_TIERS.map((tier, idx) => {
                const locked = idx > unlocked;
                return (
                  <li key={tier.name} className={locked ? 'shielded' : ''}>
                    <PxPanel color={PLANK} className="rr-raid-row">
                      <span className="rr-raid-name">
                        {tierName(tier.name)}
                        <small className={`rr-raid-where ${locked ? 'away' : 'home'}`}>
                          <i aria-hidden />
                          {locked ? t.islandPick.locked(groupDigits(tier.minLifetime)) : t.islandPick.fresh}
                          {!locked && (listing.bests[tier.name] ?? 0) > 0 && <>{' \u00b7 '}{t.islandPick.best(groupDigits(listing.bests[tier.name]))}</>}
                        </small>
                      </span>
                      <PxButton
                        type="button"
                        onClick={() => onChoose({ tier: tier.name })}
                        disabled={busy || locked}
                        color={CARROT}
                        wiggle={!busy && !locked}
                      >
                        {locked ? t.islandPick.lockedShort : t.islandPick.open}
                      </PxButton>
                    </PxPanel>
                  </li>
                );
              })}
            </ul>
          )}

          <PxPanel color={PLANK} className="rr-shop-foot">
            <span>{t.islandPick.brief}</span>
          </PxPanel>
        </PxPanel>
      </section>
    </div>,
    document.body,
  );
}
