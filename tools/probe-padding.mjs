// Every visible text run in a pixel frame, measured against the frame's inner
// edge: a panel's 2-source-px border, a button's face (outline above, bevel
// below). Paul's floor is 2px of air between the two.
//   node tools/probe-padding.mjs [outDir] [width] [height]
import { chromium } from 'playwright';
const OUT = process.argv[2] ?? 'verify-out';
const W = +(process.argv[3] ?? 890), H = +(process.argv[4] ?? 400);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await page.tap('button:has-text("Play as a guest")');
await page.waitForSelector('.rr-hud', { timeout: 90_000 });
await page.waitForTimeout(2000);
await page.tap('.rr-overlay button:has-text("Home")');
await page.waitForSelector('.rr-loop-bar', { timeout: 60_000 });
if (process.env.CSS) { await page.addStyleTag({ content: process.env.CSS }); await page.waitForTimeout(500); }
await page.waitForTimeout(3000);

export async function measure(page) {
  return page.evaluate(() => {
    const isFrame = (el) => el.classList?.contains('nine-btn')
      || (el.style && el.style.borderImageSource && !el.closest('.nine-btn'));
    const frameOf = (el) => { for (let e = el; e; e = e.parentElement) if (isFrame(e)) return e; return null; };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      const frame = frameOf(el);
      if (!frame) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const b = frame.getBoundingClientRect();
      if (!b.width) continue;
      const u = parseFloat(getComputedStyle(frame).getPropertyValue('--u')) || 2;
      const btn = frame.classList.contains('nine-btn');
      // inner edge: panel border 2u all round; button outline 1u, bevel 6u
      const inner = btn
        ? { l: b.left + u, r: b.right - u, t: b.top + u, b: b.bottom - 6 * u }
        : { l: b.left + 2 * u, r: b.right - 2 * u, t: b.top + 2 * u, b: b.bottom - 2 * u };
      // clip to overflow-hidden ancestors inside the frame
      let clip = { l: -1e9, r: 1e9, t: -1e9, b: 1e9 };
      for (let e = el; e && e !== frame.parentElement; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.overflow !== 'visible' || s.overflowX !== 'visible') {
          const c = e.getBoundingClientRect();
          clip = { l: Math.max(clip.l, c.left), r: Math.min(clip.r, c.right), t: Math.max(clip.t, c.top), b: Math.min(clip.b, c.bottom) };
        }
      }
      const r = document.createRange(); r.selectNodeContents(n);
      for (const t0 of r.getClientRects()) {
        const t = { l: Math.max(t0.left, clip.l), r: Math.min(t0.right, clip.r), t: Math.max(t0.top, clip.t), b: Math.min(t0.bottom, clip.b) };
        if (t.r - t.l < 1 || t.b - t.t < 1) continue;
        // A corner badge hangs OFF its host on purpose; it is not text in the frame.
        if (t0.top < b.top || t0.right > b.right) continue;
        const g = { l: t.l - inner.l, r: inner.r - t.r, t: t.t - inner.t, b: inner.b - t.b };
        const min = Math.min(g.l, g.r, g.t, g.b);
        out.push({ text: n.textContent.trim().slice(0, 22), frame: (frame.className || frame.tagName).toString().replace('nine-btn font-mono', 'btn').slice(0, 28), l: +g.l.toFixed(1), r: +g.r.toFixed(1), t: +g.t.toFixed(1), b: +g.b.toFixed(1), min: +min.toFixed(1) });
      }
    }
    return out.sort((a, b) => a.min - b.min);
  });
}
const res = await measure(page);
console.table(res.filter((x) => x.min < 2));
console.log('ok count', res.filter((x) => x.min >= 2).length);
await page.screenshot({ path: `${OUT}/burrow-${W}.png` });
await browser.close();
