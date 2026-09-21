// The stall, as the Seeker and a desktop window see it. `bun tools/shot-stall.mjs`
// with Storybook on 6007; shots land in .agents/shots.
import { chromium } from 'playwright';
const OUT = process.argv[2] ?? '.agents/shots';
const b = await chromium.launch();
const mk = async (w, h, mobile) => (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile })).newPage();
const shot = async (p, id, file, after) => {
  await p.goto(`http://localhost:6007/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  if (after) await after(p);
  await p.screenshot({ path: `${OUT}/${file}.png` });
  console.log('[shot]', file);
};
const seeker = await mk(890, 400, true);
seeker.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await shot(seeker, 'burrow-shop--default', 'shop-seeker');
await shot(seeker, 'burrow-shop--default', 'shop-seeker-sol', async (p) => {
  await p.locator('.rr-stall-rail', { hasText: 'SOL' }).click();
  await p.waitForTimeout(300);
});
await shot(seeker, 'burrow-shop--broke', 'shop-seeker-broke');
const desk = await mk(1280, 800, false);
await shot(desk, 'burrow-shop--default', 'shop-desktop');
await shot(desk, 'burrow-shop--carrots-only', 'shop-desktop-carrots');
const laptop = await mk(1280, 660, false);
await shot(laptop, 'burrow-shop--default', 'shop-laptop');
await b.close();
