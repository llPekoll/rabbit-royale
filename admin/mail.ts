/**
 * The back office's mail: sign-in codes, through jenvoie (jenvoie.fr), the
 * same service and the same call as the game's (src/lib/mail.ts) — copied, so
 * rr-admin carries no game code. `transactional`: the code was asked for.
 */
const ENDPOINT = 'https://jenvoie.fr/api/v1/emails';

export function mailConfigured(): boolean {
  return Boolean(process.env.JENVOIE_API_KEY);
}

export async function sendMail(params: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const key = process.env.JENVOIE_API_KEY;
  if (!key) throw new Error('JENVOIE_API_KEY must be set');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    // `to` as ONE string: jenvoie calls `.trim()` on it, an array is a 500.
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? 'Rabbit Royale <noreply@rabbit.rip>',
      transactional: true,
      ...params,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`jenvoie ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
