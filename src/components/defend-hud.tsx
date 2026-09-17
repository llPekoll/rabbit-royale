'use client';

/**
 * The thin bar over the board while YOUR burrow is being raided.
 *
 * The mirror of `RaidHud`: that one names whose burrow you are in and what you
 * have left to cross it with; this one names who is in yours and what they
 * have left. The two numbers a defender prices their next move against are the
 * raider's energy (how many more steps, how many more bombs) and their own
 * lightnings (whether the certain answer is still available).
 *
 * The bomb is not offered here: the board is already in placement while a raid
 * is on (page.tsx), so burying one is a tap on the ground. The bolt is offered
 * twice — a tap on the rabbit, or this button — because on a phone a rabbit
 * mid-hop is a small target and the moment it is needed is not the moment to
 * miss.
 */
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';
import { groupDigits } from '@/i18n/format';
import type { IncomingRaid } from './use-incoming-raid';

const SOIL_DEEP = '#2a1d12';

export interface DefendHudProps {
  raid: IncomingRaid;
  /** Lightnings in the bag. */
  held: number;
  striking: boolean;
  /** The server's refusal, already worded. */
  note?: string | null;
  onStrike(): void;
}

export function DefendHud({ raid, held, striking, note, onStrike }: DefendHudProps) {
  const t = useT();
  const live = !raid.finished;
  return (
    <PxPanel color={SOIL_DEEP} className="rr-raid-hud rr-defend-hud" style={{ position: 'fixed' }}>
      <header>
        <span className="rr-raid-target">{t.defend.underAttack(raid.attacker.name)}</span>
        <span className="rr-raid-energy">
          &#9889; {raid.energy}<small>{t.defend.theirSteps}</small>
        </span>
        {raid.trapsSprung > 0 && (
          <span className="rr-raid-sprung">🪤 {raid.trapsSprung}</span>
        )}
      </header>

      {live && (
        <p className="rr-raid-note">
          {t.defend.hint}
          {' '}
          <button
            type="button"
            onClick={onStrike}
            disabled={striking || held <= 0}
            style={{
              font: 'inherit',
              color: held > 0 ? '#ffd45c' : 'var(--muted)',
              background: 'transparent',
              border: `1px solid ${held > 0 ? '#ffd45c' : 'rgba(255,255,255,0.25)'}`,
              borderRadius: 4,
              padding: '0 6px',
              cursor: held > 0 ? 'pointer' : 'default',
            }}
          >
            &#9889; {t.defend.strike} &middot; {t.defend.held(held)}
          </button>
        </p>
      )}

      {note && live && <p className="rr-raid-note">{note}</p>}

      {raid.finished && (
        <div className="rr-raid-over">
          <strong>
            {raid.struck
              ? t.defend.struckDown
              : raid.succeeded
                ? t.defend.looted(groupDigits(raid.carrotsLooted))
                : t.defend.ranDry}
          </strong>
          <span className="rr-raid-haul">
            {raid.succeeded ? t.defend.lost : t.defend.held_}
          </span>
        </div>
      )}
    </PxPanel>
  );
}
