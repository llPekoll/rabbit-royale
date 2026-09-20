/**
 * Shoot the converted surfaces and report what the Woodland runtime painted.
 *
 * The panels fade and slide in, so a screenshot taken the moment a class
 * appears catches the animation, not the result: wait for the entrance to
 * settle before shooting. Run Storybook on 6007 first (`bun run storybook`).
 */
import { chromium } from 'playwright';

const STORIES = [
  'burrow-shop--default',
  'hud-profile-menu--profile',
  'island-run-recap--out-of-energy',
  'burrow-energypopup--default',
  'design-kit-woodland--collection',
];
const OUT = process.env.WOODLAND_OUT ?? '/tmp';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

for (const id of STORIES) {
  await page.goto(`http://localhost:6007/iframe.html?id=${id}&viewMode=story`);
  await page.locator('.wl-runtime-surface, .wl-runtime-action, .wl-kit').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  // Let the entrance transitions finish, then hold for two idle frames. Idle
  // loops (the blinking FX) never finish, so only wait on the ones that end,
  // and cap the wait so one endless animation cannot stall the run.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 2000)),
  ]));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${OUT}/woodland-${id}.png` });
  const counts = await page.evaluate(() => ({
    actions: document.querySelectorAll('.wl-runtime-action').length,
    surfaces: document.querySelectorAll('.wl-runtime-surface').length,
    // Anything still wearing the old arcade chrome is a surface we missed.
    legacy: document.querySelectorAll('[class*="nine-slice"], canvas.nine-btn').length,
  }));
  console.log(id, counts);
}

console.log(errors.length ? { errors } : 'no page errors');
await browser.close();
