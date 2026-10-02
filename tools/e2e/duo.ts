/**
 * LE TEST DE BOUT EN BOUT A DEUX — deux vrais clients Godot, cote a cote,
 * qui jouent ensemble du tuto au niveau 10 sur un rr-ws LOCAL.
 *
 *   bun run tools/e2e/duo.ts [--stop-after <phase>] [--to <niveau>]
 *
 * Chaque fenetre est le jeu (main.tscn) joue par une main qu'on voit
 * (godot/scripts/demo/duo_player.gd) : chaque geste est un vrai clic. Ce
 * script est le chef d'orchestre : il dit a chacun quoi faire (creuser,
 * raider l'autre, garder la maison, regarder, acheter...), lit ce qui s'est
 * passe, et ecrit le rapport. Le socle commun : tools/e2e/bench.ts.
 *
 * Ce qu'il triche, et seulement ca (tout est note au rapport) :
 *   • l'ORACLE : il dit au joueur ou sont les bombes et les coffres de son
 *     ile (`__stage where`), pour choisir ou taper — jamais pour jouer ;
 *   • l'ENERGIE : remise a 300 avant chaque traversee et pendant la run sous
 *     80 (sinon 10 niveaux = des heures de recharge) ;
 *   • les CAROTTES : 3 M au niveau 3, pour etre en tete de la liste RAID
 *     (la base locale garde des bots du banc a 2 M) ;
 *   • les BOUCLIERS leves avant chaque raid, et le delai d'une heure entre
 *     deux raids sur la meme victime efface (raid_runs recules, base locale).
 */
import { and, eq, or } from 'drizzle-orm';
import { db } from '../../src/lib/db';
import { players, raidRuns } from '../../src/lib/db/schema';
import { Player, arg, ask, assist, dig, home, liftShield, phase, runBench, sleep, topUp } from './bench';

const W = 950;
const H = 428;
const FINAL_LEVEL = arg('--to', 10);

// ── Le scenario ──────────────────────────────────────────────────────────────
async function scenario(A: Player, B: Player) {
  phase('1. Accueil, invite, tuto (les deux en meme temps)');
  const [oa, ob] = await Promise.all([A.cmd('onboard', {}, 240), B.cmd('onboard', {}, 240)]);
  if (!oa.ok || !ob.ok) throw new Error('onboard rate — rien ne peut suivre');
  for (const p of [A, B]) await liftShield(p);
  console.log(`  A = ${A.state?.name} (${A.id})\n  B = ${B.state?.name} (${B.id})`);

  phase('2. Niveaux 1-2 en solo, et fouiller le terrier');
  await Promise.all([A.cmd('wander', { random: 6 }, 240), B.cmd('wander', { random: 6 }, 240)]);
  const solo = async (p: Player, upTo: number, extras: (lvl: number) => Promise<void>) => {
    let guard = 0;
    while (p.level < upTo && guard++ < upTo * 3) {
      const lvl = p.level;
      await dig(p, { blast: guard === 1, wrong: guard === 2 });
      await home(p);
      if (p.level > lvl) await extras(p.level);
    }
  };
  const early = (p: Player) => async (lvl: number) => {
    if (lvl === 2) await p.cmd('defend_setup', { traps: 3, fences: 2 }, 180);
    await p.cmd('harvest', {}, 60);
  };
  await Promise.all([solo(A, 3, early(A)), solo(B, 3, early(B))]);

  phase('3. Raids croises au niveau 3 (defense en direct)');
  for (const p of [A, B]) {
    await db.update(players).set({ stock: 3_000_000 }).where(eq(players.id, p.id));
    await liftShield(p);
    await topUp(p);
  }
  // B pille A ; A, a la maison, le foudroie au 3e pas.
  await Promise.all([
    A.cmd('guard', { strike_after: 3, wait: 90 }, 200),
    (async () => { await sleep(3000); await B.cmd('raid', { target: A.id }, 180); })(),
  ]);
  // A pille B ; B regarde, sans frapper : A va jusqu'au potager.
  await liftShield(B); await topUp(A); await forgetRaids(A, B);
  await Promise.all([
    B.cmd('guard', { strike_after: -1, wait: 90 }, 200),
    (async () => { await sleep(3000); await A.cmd('raid', { target: B.id }, 180); })(),
  ]);
  // B pille A et se replie apres 2 pas.
  await liftShield(A); await topUp(B); await forgetRaids(A, B);
  await Promise.all([
    A.cmd('guard', { strike_after: -1, wait: 90 }, 200),
    (async () => { await sleep(3000); await B.cmd('raid', { target: A.id, retreat_after: 2 }, 180); })(),
  ]);

  // La boutique, maintenant que les carottes sont la : de quoi frapper.
  await Promise.all([
    A.cmd('shop', { buy: { lightning: 3, bloop: 3, trap: 1 } }, 240),
    B.cmd('shop', { buy: { lightning: 3, bloop: 3, fence: 1 } }, 240),
  ]);

  phase('4. A creuse ; B le regarde, puis pille son terrier vide');
  const aDig = dig(A, { leave_after: 150 });
  for (let i = 0; i < 60 && !A.state?.onIsland; i++) await sleep(500);
  await sleep(4000);
  await B.cmd('watch', { target: A.id, secs: 16, zap: true }, 120);
  await liftShield(A); await topUp(B); await forgetRaids(A, B);
  await B.cmd('raid', { target: A.id }, 180);
  await aDig;
  await home(A);

  phase('5. Niveaux 3-5 en solo');
  // LE POTAGER a pousse 6 h (il etait vide a chaque passage) : la recolte.
  for (const p of [A, B]) {
    await db.update(players).set({ gardenCollectedAt: new Date(Date.now() - 6 * 3600_000) }).where(eq(players.id, p.id));
  }
  assist('potager vieilli de 6 h pour A et B');
  await Promise.all([A.cmd('harvest', {}, 60), B.cmd('harvest', {}, 60)]);
  await Promise.all([solo(A, 6, async () => { await A.cmd('harvest'); }), solo(B, 6, async () => { await B.cmd('harvest'); })]);

  phase('6. Niveaux 6-9 : la meme ile, eclairs, bloops, poussees');
  let killed = false;
  let rounds = 0;
  while ((A.level < FINAL_LEVEL || B.level < FINAL_LEVEL) && rounds++ < 20) {
    await Promise.all([home(A), home(B)]);
    if (A.level >= FINAL_LEVEL && B.level >= FINAL_LEVEL) break;
    // Des munitions : la boutique, quand le sac se vide.
    if (rounds % 2 === 0) {
      await Promise.all([A.cmd('shop', { buy: { lightning: 2, bloop: 2 } }, 200), B.cmd('shop', { buy: { lightning: 2, bloop: 2 } }, 200)]);
    }
    if (A.level !== B.level) {
      const low = A.level < B.level ? A : B;
      console.log(`  niveaux ${A.level}/${B.level} : ${low.tag} rattrape seul`);
      await dig(low, { fight: true });
      continue;
    }
    const lvl = A.level;
    console.log(`  niveau ${lvl} : les deux traversent ensemble`);
    const both = [dig(A, { fight: true }), (async () => { await sleep(1500); return dig(B, { fight: true }); })()];
    // LE CAS « IL MEURT » : au niveau 7, B tombe a 25 d'energie ; le prochain
    // eclair ou la prochaine bombe le tue. Il regarde A finir, puis revient.
    if (lvl === 7 && !killed) {
      killed = true;
      for (let i = 0; i < 60 && !(A.state?.onIsland && B.state?.onIsland); i++) await sleep(500);
      if (A.state?.seed && A.state.seed === B.state?.seed) {
        await sleep(8000);
        B.starve = true;
        await ask({ op: 'energy', islandId: B.state.seed, playerId: B.id, energy: 25 });
        assist('B : energie en run → 25 (le cas « il meurt »)');
        const bEnd = await both[1];
        B.starve = false;
        await home(B);
        if (A.state?.onIsland) {
          await topUp(B);
          await B.cmd('watch', { target: A.id, secs: 14, zap: true }, 120);
          if (A.state?.onIsland) await dig(B, { fight: true });
        }
        console.log(`  B : ${bEnd.result?.end ?? '?'}`);
      } else {
        console.log('  ✘ A et B ne sont pas sur la meme ile au niveau 7');
      }
    }
    await Promise.all(both);
  }

  phase(`7. Niveau ${FINAL_LEVEL} : une derniere ile ensemble`);
  await Promise.all([home(A), home(B)]);
  await Promise.all([dig(A, { fight: true }), (async () => { await sleep(1500); return dig(B, { fight: true }); })()]);
  await Promise.all([A.cmd('wander', { random: 4 }, 200), B.cmd('wander', { random: 4 }, 200)]);
}

// ── Le delai entre deux raids ─────────────────────────────────────────────────
/**
 * LE DELAI D'UNE HEURE ENTRE DEUX RAIDS sur la meme victime se compte depuis
 * le `startedAt` du dernier raid marche : on recule ces departs, entre nos
 * deux invites seulement, dans la base locale.
 */
async function forgetRaids(a: Player, b: Player) {
  await db.update(raidRuns).set({ startedAt: new Date(Date.now() - 2 * 3600_000) })
    .where(or(
      and(eq(raidRuns.attackerId, a.id), eq(raidRuns.defenderId, b.id)),
      and(eq(raidRuns.attackerId, b.id), eq(raidRuns.defenderId, a.id)),
    ));
  assist(`delai entre deux raids leve (raid_runs ${a.tag}↔${b.tag} recules de 2 h)`);
}

const A = new Player('A', { x: 0, y: 40, w: W, h: H });
const B = new Player('B', { x: W + 10, y: 40, w: W, h: H });
await runBench({ title: 'Test de bout en bout a deux', players: [A, B], scenario: () => scenario(A, B) });
