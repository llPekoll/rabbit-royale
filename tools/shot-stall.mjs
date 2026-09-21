// The stall, as the Seeker and a desktop window see it, plus a mouse drag of
// the row and of the bar. `bun tools/shot-stall.mjs` with Storybook on 6007;
// shots land in .agents/shots.
import { chromium } from 'playwright';
const OUT = process.argv[2] ?? '.agents/shots';
const b = await chromium.launch();
const mk = async (w, h, mobile) => (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile })).newPage();
const open = async (p, id) => {
  await p.goto(`http://localhost:6007/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
};
const shot = async (p, id, file, after) => {
  await open(p, id);
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
const desk = await mk(1280, 800, false);
desk.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await shot(desk, 'burrow-shop--carrots-only', 'shop-desktop');
// Drag the row across a price button: it must scroll and must NOT buy.
await open(desk, 'burrow-shop--default');
const state = () => desk.evaluate(() => ({
  left: Math.round(document.querySelector('.rr-stall-shelf').scrollLeft),
  foot: document.querySelector('.rr-stall-foot').textContent,
  thumb: document.querySelector('.rr-stall-thumb').style.left,
}));
const before = await state();
const buy = await desk.locator('.rr-stall-buy').nth(2).boundingBox();
await desk.mouse.move(buy.x + buy.width / 2, buy.y + buy.height / 2);
await desk.mouse.down();
for (let i = 1; i <= 12; i++) await desk.mouse.move(buy.x + buy.width / 2 - i * 25, buy.y + buy.height / 2);
await desk.mouse.up();
await desk.waitForTimeout(300);
const afterRow = await state();
console.log('[drag row]', before, '->', afterRow, afterRow.left > before.left && afterRow.foot === before.foot ? 'OK' : 'FAIL');
await desk.screenshot({ path: `${OUT}/shop-desktop-dragged.png` });
// Drag the thumb back to the start.
const th = await desk.locator('.rr-stall-thumb').boundingBox();
await desk.mouse.move(th.x + th.width / 2, th.y + th.height / 2);
await desk.mouse.down();
await desk.mouse.move(th.x - 400, th.y + th.height / 2, { steps: 8 });
await desk.mouse.up();
await desk.waitForTimeout(300);
const afterThumb = await state();
console.log('[drag bar]', afterThumb, afterThumb.left === 0 ? 'OK' : 'FAIL');
// A plain click on a price still buys.
await desk.locator('.rr-stall-buy').nth(1).click();
await desk.waitForTimeout(200);
console.log('[click]', (await state()).foot);
await b.close();
