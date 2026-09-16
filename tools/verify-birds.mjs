// Les oiseaux dans le jeu : sont-ils montes, sous les rais, et se deplacent-ils ?
//   node tools/verify-birds.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await page.click('button:has-text("Play as a guest")');
await page.waitForSelector('.rr-hud', { timeout: 90_000 });

// Un AnimatedSprite dont la texture vient de bird.png, plus les profondeurs.
const scan = () => page.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return null;
  const birds = [], rays = [], clouds = [];
  const walk = (n, depth) => {
    const kind = n.constructor?.name;
    if (kind === 'AnimatedSprite') {
      const src = n.texture?.source?.label ?? n.texture?.label ?? '';
      if (String(src).includes('bird')) {
        const g = n.getGlobalPosition();
        birds.push({ x: +g.x.toFixed(1), y: +g.y.toFixed(1),
          sx: +n.scale.x.toFixed(2), sy: +n.scale.y.toFixed(2),
          rot: +n.rotation.toFixed(3), z: n.parent?.zIndex, frame: n.currentFrame });
      }
    }
    if (kind === 'Mesh' && String(n.blendMode) === 'add') rays.push({ z: n.zIndex });
    if (n.zIndex === 10000) clouds.push({ z: n.zIndex, kids: n.children?.length ?? 0 });
    n.children?.forEach((c) => walk(c, depth + 1));
  };
  walk(app.stage, 0);
  return { birds, rays, clouds };
});

let s = await scan();
for (let i = 0; i < 40 && (!s || s.birds.length === 0); i++) { await page.waitForTimeout(1000); s = await scan(); }

console.log('[ile] oiseaux:', s?.birds.length ?? 0);
(s?.birds ?? []).forEach((b, i) =>
  console.log(`  #${i} pos=(${b.x},${b.y}) scale=(${b.sx},${b.sy}) rot=${b.rot} zIndex(calque)=${b.z} frame=${b.frame}`));
console.log('[ile] rais additifs z:', (s?.rays ?? []).map(r => r.z).join(',') || 'aucun');
if (s?.birds.length && s?.rays.length) {
  const bz = Math.max(...s.birds.map(b => b.z ?? 0));
  const rz = Math.min(...s.rays.map(r => r.z));
  console.log(`[ile] oiseau z=${bz} vs rais z=${rz} -> SOUS LES RAIS: ${bz < rz}`);
}
await page.screenshot({ path: `${OUT}/birds-1-island.png` });

// Bougent-ils ?
const before = (await scan())?.birds ?? [];
await page.waitForTimeout(2500);
const after = (await scan())?.birds ?? [];
before.forEach((b, i) => {
  const a = after[i]; if (!a) return;
  const dx = +(a.x - b.x).toFixed(1), dy = +(a.y - b.y).toFixed(1);
  const wrap = Math.abs(dx) > 400 || Math.abs(dy) > 300;
  console.log(`[ile] #${i} dx=${dx} dy=${dy}${wrap ? ' (rebouclage)' : ` monte=${dy < 0}`}`);
});

// Le terrier : le meme ciel doit porter les memes oiseaux.
const home = await page.$('.rr-overlay button:has-text("Home")');
if (home) {
  await home.click();
  await page.waitForTimeout(6000);
  const b = await scan();
  console.log('\n[terrier] oiseaux:', b?.birds.length ?? 0, '| rais z:', (b?.rays ?? []).map(r => r.z).join(',') || 'aucun');
  (b?.birds ?? []).forEach((v, i) => console.log(`  #${i} pos=(${v.x},${v.y}) rot=${v.rot} zIndex=${v.z}`));
  await page.screenshot({ path: `${OUT}/birds-2-burrow.png` });
} else {
  console.log('\n[terrier] bouton Home introuvable');
}

const real = errors.filter((e) => !/401|WebGL|GPU stall/i.test(e));
console.log('\nerreurs page:', real.length ? real : 'aucune (hors bruit connu)');
await browser.close();
