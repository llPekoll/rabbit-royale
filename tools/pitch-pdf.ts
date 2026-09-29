/**
 * Le PDF du deck (rabbit.rip/pitch -> bouton PDF).
 *
 *   bun tools/pitch-pdf.ts
 *
 * Sert landing/ sur un port libre, ouvre /pitch/ dans Chromium, photographie
 * chaque slide en JPEG 1920 x 1080 et imprime ces images, une par page. Le
 * resultat est ecrit a cote, landing/pitch/rabbit-royale-pitch.pdf, et
 * versionne : le serveur ne sait pas le produire. A relancer apres toute
 * retouche des slides.
 *
 * POURQUOI DES PHOTOS ET PAS L'IMPRESSION DIRECTE. Imprimer la page (sa
 * feuille @media print marche, Cmd+P aussi) donne un PDF de 68 Mo : Chromium
 * rasterise chaque fond `filter: blur()` en pleine definition. En JPEG le deck
 * tient en quelques Mo ; le texte n'est plus selectionnable, ce qui ne gene
 * pas un deck qu'on envoie.
 */
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = join(import.meta.dir, '..', 'landing');
const out = join(root, 'pitch', 'rabbit-royale-pitch.pdf');

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    let path = decodeURIComponent(new URL(req.url).pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = Bun.file(join(root, path));
    return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 });
  },
});

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://localhost:${server.port}/pitch/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Sans le lecteur ni les fondus : la slide seule, a sa taille. Les
  // animations (la rature de la fin) sautent a leur etat final, sinon la
  // photo les prend a mi-course.
  await page.addStyleTag({
    content:
      '.bar, .progress { display: none !important } .slide { transition: none !important }' +
      ' *, *::before, *::after { animation-delay: 0s !important; animation-duration: 1ms !important }',
  });
  const total = await page.locator('.slide').count();
  const shots: string[] = [];
  for (let n = 1; n <= total; n++) {
    await page.evaluate((n) => (location.hash = `#${n}`), n);
    await page.waitForTimeout(150);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 86 });
    shots.push(jpg.toString('base64'));
  }

  const sheet = await browser.newPage();
  await sheet.setContent(
    `<style>@page{size:1920px 1080px;margin:0}body{margin:0}img{display:block;width:1920px;height:1080px;break-after:page}</style>` +
      shots.map((b) => `<img src="data:image/jpeg;base64,${b}">`).join(''),
  );
  await sheet.pdf({ path: out, width: '1920px', height: '1080px', printBackground: true });
  console.log(`ecrit : ${out} (${(Bun.file(out).size / 1e6).toFixed(1)} Mo)`);
} finally {
  await browser.close();
  server.stop();
}
