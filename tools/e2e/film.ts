/**
 * LE TOURNAGE A QUATRE — quatre fenetres sur tout l'ecran, qui s'ouvrent
 * l'une apres l'autre, et quatre lapins qui entrent dans la meme ile a tour de
 * role : 1/4, 2/4, 3/4, 4/4 — l'ile est pleine, et ca se bat jusqu'a
 * l'eruption.
 *
 *   bun run tools/e2e/film.ts [--level 7] [--spawn 6] [--fps 20]
 *   python3 tools/e2e/film_cut.py [tools/e2e/out/<date>]   (le montage)
 *
 * Chaque fenetre s'enregistre elle-meme (duo_player.gd `--rec`), en JPG
 * horodates a l'heure murale ; le bus de chacun garde events.jsonl (arrivees,
 * eclairs, poussees, eruption). Ce script ecrit film.json : qui, quand chaque
 * fenetre s'est ouverte, ou sont ses images. Le montage part de la.
 *
 * Triches (comme les autres bancs, tools/e2e/bench.ts) : comptes faits au
 * niveau voulu, l'oracle, l'energie remise a 300.
 */
import { writeFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/db';
import { players } from '../../src/lib/db/schema';
import { grantItem } from '../../src/lib/game/grant';
import { BASE, OUT, Player, arg, assist, dig, phase, remark, runBench, sleep } from './bench';

const LEVEL = arg('--level', 7);
const SPAWN_S = arg('--spawn', 6);
const FPS = arg('--fps', 20);
const NAMES = ['Shiro', 'Kuro', 'Mochi', 'Pepper'];
const TAGS = ['A', 'B', 'C', 'D'];
// Deux sur deux, sur tout l'ecran (1920x1080), au format du Seeker couche.
const W = 956;
const H = 430;

const cast = TAGS.map((tag, i) => {
  const p = new Player(tag, { x: (i % 2) * (W + 8), y: 25 + Math.floor(i / 2) * (H + 30), w: W, h: H });
  p.userArgs = [`--rec=${OUT}${tag}/rec`, `--rec-fps=${FPS}`];
  return p;
});
const names = new Map<string, string>();

async function prepare() {
  for (let i = 0; i < cast.length; i++) {
    const p = cast[i];
    const g: any = await (await fetch(BASE + '/api/auth/guest', { method: 'POST' })).json();
    if (!g?.token) throw new Error('guest failed ' + JSON.stringify(g));
    p.token = g.token;
    const name = NAMES[i];
    names.set(p.tag, name);
    await db.update(players).set({
      name, level: LEVEL, runsPlayed: 5, energy: 300, energyUpdatedAt: new Date(), stock: 3_000_000, shieldedUntil: null,
    }).where(eq(players.id, g.player.id));
    for (const kind of ['lightning', 'bloop'] as const) {
      await db.transaction((tx) => grantItem(tx as any, g.player.id, kind, 6));
    }
  }
  assist(`4 comptes au niveau ${LEVEL} (Shiro, Kuro, Mochi, Pepper), 6 eclairs et 6 bloops chacun`);
}

async function scenario() {
  phase(`1. Quatre fenetres, une toutes les ${SPAWN_S} s ; chacune entre dans l'ile quand la precedente y est`);
  const runs: Promise<unknown>[] = [];
  for (let i = 0; i < cast.length; i++) {
    const p = cast[i];
    while (!p.launchedAt) await sleep(100);
    const ok = await p.cmd('onboard', {}, 120);
    if (!ok.ok) throw new Error(`${p.tag} n'arrive pas au terrier`);
    // Le precedent est assis sur l'ile : a celui-ci de traverser.
    if (i > 0) for (let k = 0; k < 120 && !cast[i - 1].state?.onIsland; k++) await sleep(250);
    await sleep(1500);
    runs.push(dig(p, { fight: true, marks: 1 }));
    for (let k = 0; k < 120 && !p.state?.onIsland; k++) await sleep(250);
    remark(`${p.tag} (${names.get(p.tag)}) sur ${p.state?.seed?.slice(0, 12)}`);
  }
  const seeds = new Set(cast.map((p) => p.state?.seed));
  remark(seeds.size === 1 ? 'les quatre sur la meme ile' : `✘ ${seeds.size} iles : ${[...seeds].join(', ')}`);

  phase('2. La melee, jusqu\'a l\'eruption');
  await Promise.all(runs);
  await sleep(6000);

  writeFileSync(`${OUT}film.json`, JSON.stringify({
    level: LEVEL, fps: FPS, window: { w: W, h: H },
    players: cast.map((p) => ({ tag: p.tag, name: names.get(p.tag), launchedAt: p.launchedAt, rec: `${p.tag}/rec`, events: `${p.tag}/events.jsonl` })),
  }, null, 2));
  // Coupe : les fenetres s'enregistrent tant qu'elles vivent.
  for (const p of cast) p.proc?.kill();
  console.log(`\nfilm.json ecrit — montage : python3 tools/e2e/film_cut.py ${OUT}`);
}

await runBench({
  title: 'Tournage a quatre',
  players: cast,
  prepare,
  scenario,
  stagger: SPAWN_S * 1000,
  launchDuringScenario: true,
  godotArgs: ['--max-fps', '30'],
});
