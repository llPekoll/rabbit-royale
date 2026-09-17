// Le GIF de l'electrocution : filme la story FX/Electrocuted et en tire une boucle.
//   bun run storybook            (port 6007, dans un autre terminal)
//   node tools/capture-electrocuted.mjs [outDir]
//
// Pourquoi filmer plutot que screenshoter image par image : Playwright rend ici
// en GL logiciel, ou une capture coute ~700ms. Echantillonner l'effet a sa
// vitesse reelle ne donne donc que quelques images eparses, et figer l'horloge
// de la page casse le chargement des atlas (les promesses d'Assets.load
// attendent du vrai temps). MediaRecorder sur le canvas, lui, preleve les
// images REELLEMENT presentees, au rythme du jeu : ~5.7 fps ici, ce qui suffit
// pour une boucle courte puisque l'effet lui-meme bat lentement (le bolt
// alterne avec des images vides, c'est son clignotement).
//
// L'enregistrement couvre plusieurs frappes (`every:4`) et le meilleur cycle
// complet est ensuite decoupe par ffmpeg : voir la ligne FFMPEG affichee a la
// fin, a lancer telle quelle.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });

const URL =
  'http://localhost:6007/iframe.html?id=fx-electrocuted--default&viewMode=story' +
  '&args=every:4;zoom:2.5;hold:1400';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!globalThis.__BURROW_SCENE, null, { timeout: 30_000 });

const b64 = await page.evaluate(async () => {
  const canvas = document.querySelector('canvas');
  const rec = new MediaRecorder(canvas.captureStream(30), {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 16_000_000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  // Le bolt a l'ecran : c'est le debut d'une frappe, donc le depart du film.
  const boltUp = () => {
    let hit = false;
    const walk = (n) => {
      if (n.constructor?.name === 'AnimatedSprite'
        && Math.round(n.texture?.frame?.width) === 195 && n.visible) hit = true;
      for (const c of n.children ?? []) walk(c);
    };
    walk(globalThis.__PIXI_APP__.stage);
    return hit;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 1000 && !boltUp(); i++) await sleep(20);

  rec.start();
  await sleep(9000); // plusieurs frappes, pour avoir un cycle propre au montage
  rec.stop();
  await new Promise((r) => { rec.onstop = r; });

  const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
});

writeFileSync(`${OUT}/strike.webm`, Buffer.from(b64, 'base64'));
console.log(`${OUT}/strike.webm ecrit`);
console.log(errors.length ? `erreurs page : ${errors.join(' | ')}` : 'aucune erreur page');
console.log(`
Ensuite, pour en tirer le GIF :
  ffmpeg -i ${OUT}/strike.webm -vsync 0 ${OUT}/l%03d.png
  # reperer le cycle complet (calme -> flash -> pose qui alterne -> retour)
  # puis, en renumerotant ces images-la dans ${OUT}/gifsrc/g%03d.png :
  ffmpeg -framerate 5.67 -i ${OUT}/gifsrc/g%03d.png \\
    -vf "crop=680:420:160:60,scale=544:336:flags=neighbor,split[a][b];\\
[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none" \\
    -loop 0 ${OUT}/electrocuted.gif
`);
await browser.close();
