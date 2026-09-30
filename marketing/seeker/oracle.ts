/**
 * L'ORACLE DE LA VIDEO SEEKER — dit au realisateur Godot ou sont les bombes et
 * les coffres de l'ile qu'il joue, sur un rr-ws LOCAL lance avec RR_STAGE=1.
 *
 *   bun run marketing/seeker/oracle.ts <dossier>
 *
 * Le realisateur ecrit la graine de son ile dans <dossier>/want.txt ; l'oracle
 * demande `__stage where` (server/stage.ts) et ecrit <dossier>/where.json.
 * Jamais en prod : sans RR_STAGE, l'evenement n'existe pas.
 */
import { io } from 'socket.io-client';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.STAGE_URL ?? 'http://localhost:3012';
const dir = process.argv[2];
if (!dir) throw new Error('usage: oracle.ts <dossier>');

const guest: any = await (await fetch(BASE + '/api/auth/guest', { method: 'POST' })).json();
const s = io(BASE, { auth: { token: guest.token }, transports: ['websocket'], reconnection: true });
await new Promise<void>((ok) => s.once('connect', () => ok()));
console.log('[oracle] pret');

const ask = (seed: string) => new Promise<any>((ok) => {
  const t = setTimeout(() => ok({ error: 'timeout' }), 3000);
  s.emit('__stage', { op: 'where', islandId: seed }, (res: any) => { clearTimeout(t); ok(res); });
});

let last = '';
for (;;) {
  await new Promise((r) => setTimeout(r, 300));
  const want = `${dir}/want.txt`;
  if (!existsSync(want)) continue;
  const seed = readFileSync(want, 'utf8').trim();
  if (!seed) continue;
  const res = await ask(seed);
  const out = JSON.stringify({ seed, ...res });
  if (out !== last) {
    writeFileSync(`${dir}/where.json`, out);
    last = out;
    if (res.error) console.log('[oracle]', seed, res.error);
  }
}
