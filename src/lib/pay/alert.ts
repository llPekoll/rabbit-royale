/**
 * PAYMENT ALERTS — every failed payment, posted to a private Discord channel
 * (#payment-alerts, under STAFF) the moment it happens.
 *
 * Why not Firebase alone: `purchase_error` only leaves a phone whose player
 * said yes to analytics (most of Europe never does), and GA warns nobody — the
 * 2026-10-13 "Unexpected error" was reported by a player on Telegram, not by
 * us. The client reports to rr-ws whatever the consent, and rr-ws posts here.
 *
 * `PAY_ALERT_WEBHOOK` (a Discord webhook URL) on each region; absent = silent.
 * Never throws and never waits on the caller: an alert that fails must not
 * become a second failed payment.
 */

/** The owner, mentioned on every alert: a mention is what makes Discord push
 *  to the phone, whatever the channel's notification setting. */
const OWNER_ID = '257082959092252675';

const DEDUPE_MS = 10 * 60_000;
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 30;

/** Same player, same reason → once per 10 min (a player who taps five times
 *  on a broken button is one alert). */
const lastSent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;

export interface PayAlert {
  title: string;
  /** Who: the player's id, for the dedupe. */
  playerId: string;
  /** What went wrong, raw (a server code or the wallet's own words). */
  reason: string;
  /** Shown as embed fields, in order; empty values are dropped. */
  fields: Record<string, string | number | null | undefined>;
}

export function region(): string {
  return process.env.WS_DOMAIN || 'ws.rabbit.rip (eu)';
}

export function payAlert(alert: PayAlert): void {
  const url = process.env.PAY_ALERT_WEBHOOK;
  if (!url) return;

  const now = Date.now();
  const key = alert.playerId + '|' + alert.reason;
  if (now - (lastSent.get(key) ?? 0) < DEDUPE_MS) return;
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  if (++windowCount > MAX_PER_WINDOW) return;
  lastSent.set(key, now);
  if (lastSent.size > 500) {
    for (const [k, at] of lastSent) if (now - at > DEDUPE_MS) lastSent.delete(k);
  }

  const fields = Object.entries({ region: region(), ...alert.fields, reason: alert.reason })
    .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
    .map(([name, v]) => ({
      name,
      value: '`' + String(v).replace(/`/g, "'").slice(0, 1000) + '`',
      inline: name !== 'reason',
    }));

  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: '<@' + OWNER_ID + '>',
      embeds: [{
        title: alert.title.slice(0, 250),
        color: 0xe5484d,
        fields,
        timestamp: new Date(now).toISOString(),
      }],
      allowed_mentions: { users: [OWNER_ID] },
    }),
    signal: AbortSignal.timeout(5000),
  }).catch((err: unknown) => console.warn('[pay] alert not sent', err));
}
