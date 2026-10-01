import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';

const output = '/private/tmp/rr-home-parallax-check';
await mkdir(output, { recursive: true });
const root = resolve('landing');
const layerRoot = resolve('godot/assets/ui/home-parallax');
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  let path = decodeURIComponent(new URL(request.url).pathname);
  const base = path.startsWith('/__layers/') ? layerRoot : root;
  if (base === layerRoot) path = path.slice('/__layers'.length);
  if (path.endsWith('/')) path += 'index.html';
  const filePath = resolve(base, '.' + path);
  if (!filePath.startsWith(base + sep)) return new Response('Forbidden', { status: 403 });
  const file = Bun.file(filePath);
  return await file.exists() ? new Response(file) : new Response('Not found', { status: 404 });
} });
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(base) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('[data-home-parallax]').length === 2);
  await page.waitForFunction(() => [...document.querySelectorAll('.layers img')].every(i => i.complete && i.naturalWidth === 1672));
  await page.mouse.move(20, 20);
  await page.waitForTimeout(500);
  const before = await page.locator('.layers img').evaluateAll(images => images.map(i => i.style.transform));
  await page.mouse.move(1400, 870);
  await page.waitForTimeout(700);
  const after = await page.locator('.layers img').evaluateAll(images => images.map(i => i.style.transform));
  assert.notDeepEqual(before, after, 'pointer moves layers');
  assert.equal(after[3], after[5], 'rabbits stay attached to the terrain');
  assert.notEqual(after[0], after[4], 'near and far planes travel differently');
  await page.screenshot({ path: `${output}/landing-desktop.png` });
  for (const viewport of [{ width: 890, height: 400 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: `${output}/landing-${viewport.width}.png` });
    assert(await page.locator('[data-play]').first().isVisible(), 'play remains visible');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  assert((await page.locator('.layers img').evaluateAll(images => images.map(i => i.style.transform))).every(t => t === 'none'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.story').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${output}/story.png` });
  await page.goto(`${base}/pitch/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('[data-home-parallax]').length === 7);
  await page.screenshot({ path: `${output}/pitch.png` });
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('.count').innerText(), /^2 /);

  // View the assembled raw planes, then inspect alpha and registration in-browser.
  await page.goto(`${base}/__layers/preview.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${output}/layers.png` });
  const alpha = await page.evaluate(async () => {
    const result = [];
    for (const image of document.querySelectorAll('#scene img')) {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, partial = 0, opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparent++; else if (pixels[i] === 255) opaque++; else partial++;
      }
      result.push({ name: image.alt, width: canvas.width, height: canvas.height, transparent, partial, opaque });
    }
    return result;
  });
  for (const [i, layer] of alpha.entries()) {
    assert.equal(layer.width, 1672); assert.equal(layer.height, 940);
    assert.equal(layer.partial, 0, 'crisp alpha');
    assert(layer.opaque > 0);
    assert(i === 0 ? layer.transparent === 0 : layer.transparent > 0);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', checks: ['desktop + mobile layouts', 'six decoded layers', 'different depth motion', 'rabbit/ground contact', 'reduced motion', 'story', 'pitch navigation', 'alpha + dimensions', 'no page/resource errors'], alpha, screenshots: output }, null, 2));
} finally {
  await browser.close(); server.stop();
}
