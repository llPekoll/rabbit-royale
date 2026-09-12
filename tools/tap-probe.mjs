// Does a tap reach the thing that should answer it? Ask the real scene.
//
// Opens a story that runs the game's own scene in Storybook (port 6007, `bun run
// storybook`), finds a tappable target, and reports what Pixi's event boundary
// answers at its centre under BOTH root modes — `passive` (Pixi's default) and
// `static` — then actually clicks and shows whether the scene's own `[tap]` log
// fired. Written the day the burrow went untappable in production while every
// story worked: the difference was the root's eventMode, and this is the
// measurement that showed it. Run from the project dir:
//
//     node tools/tap-probe.mjs
//
// Playwright resolves only from inside the project, and the burrow story needs
// a few seconds to build its ground.
import { chromium } from 'playwright';

const STORY = 'http://localhost:6007/iframe.html?id=burrow-placing--placing&viewMode=story';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));

await page.goto(STORY, { waitUntil: 'networkidle' });
await page.waitForFunction(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return false;
  let found = false;
  const walk = (n) => { if (found) return; if (n.label?.startsWith('burrow-hint-')) found = true; n.children?.forEach(walk); };
  walk(app.stage);
  return found;
}, null, { timeout: 60000 });
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  const name = (n) => `${n.label || n.constructor?.name || '?'}`;

  // A visible, trappable hint near the middle of the board.
  const hints = [];
  const walk = (n) => { if (n.label?.startsWith('burrow-hint-') && n.visible) hints.push(n); n.children?.forEach(walk); };
  walk(app.stage);
  hints.sort((a, b) => {
    const pa = a.getGlobalPosition(), pb = b.getGlobalPosition();
    return Math.hypot(pa.x - 480, pa.y - 270) - Math.hypot(pb.x - 480, pb.y - 270);
  });
  const hint = hints[0];
  const g = hint.getGlobalPosition();

  // What the real boundary answers at that point. The boundary only learns
  // its root from a render, so hand it the stage if a frame has not run yet.
  const boundary = app.renderer.events.rootBoundary;
  if (!boundary.rootTarget) boundary.rootTarget = app.stage;
  const hit = boundary.hitTest(g.x, g.y);
  const chain = [];
  for (let p = hit; p; p = p.parent) chain.push(`${name(p)}(em=${p.eventMode ?? 'undef'},vis=${p.visible},ic=${p.interactiveChildren})`);

  // Now explain: walk from the stage DOWN the hint's ancestor path and say at
  // each step whether Pixi would descend / hit, and why not.
  const path = [];
  for (let p = hint; p; p = p.parent) path.unshift(p);
  const explain = path.map((n) => {
    const local = n.toLocal({ x: g.x, y: g.y });
    const ha = n.hitArea ? n.hitArea.contains(local.x, local.y) : null;
    const cp = typeof n.containsPoint === 'function' ? n.containsPoint(local) : null;
    return {
      node: name(n),
      eventMode: n.eventMode ?? 'undef',
      isInteractive: typeof n.isInteractive === 'function' ? n.isInteractive() : null,
      visible: n.visible,
      renderable: n.renderable,
      interactiveChildren: n.interactiveChildren,
      hasMask: !!n.mask,
      hitAreaContains: ha,
      containsPoint: cp,
      alpha: n.alpha,
      zIndex: n.zIndex,
      childCount: n.children?.length ?? 0,
    };
  });

  return {
    hintLabel: hint.label,
    hintGlobal: { x: g.x, y: g.y },
    hintCount: hints.length,
    boundaryHit: hit ? chain.join(' < ') : 'nothing',
    hitIsHint: hit === hint,
    explain,
    screen: { w: app.screen.width, h: app.screen.height },
    stageEventMode: app.stage.eventMode,
  };
});

console.log(JSON.stringify(report, null, 2));

// A/B: the same click with the root passive (as the stories leave it) and
// static (as Application.ts sets it in the game).
const canvas = await page.$('canvas');
const rect = await canvas.boundingBox();
const px = rect.x + report.hintGlobal.x * (rect.width / report.screen.w);
const py = rect.y + report.hintGlobal.y * (rect.height / report.screen.h);
for (const mode of ['passive', 'static']) {
  const hitInfo = await page.evaluate((m) => {
    const app = globalThis.__PIXI_APP__;
    app.stage.eventMode = m;
    const b = app.renderer.events.rootBoundary;
    if (!b.rootTarget) b.rootTarget = app.stage;
    const hints = [];
    const walk = (n) => { if (n.label?.startsWith('burrow-hint-') && n.visible) hints.push(n); n.children?.forEach(walk); };
    walk(app.stage);
    hints.sort((a, c) => { const pa = a.getGlobalPosition(), pc = c.getGlobalPosition(); return Math.hypot(pa.x - 480, pa.y - 270) - Math.hypot(pc.x - 480, pc.y - 270); });
    const g = hints[0].getGlobalPosition();
    const hit = b.hitTest(g.x, g.y);
    const chain = []; for (let p = hit; p; p = p.parent) chain.push(p.label || p.constructor?.name);
    return { stage: app.stage.eventMode, hitTest: hit ? chain.join(' < ') : 'nothing' };
  }, mode);
  logs.length = 0;
  await page.mouse.click(px, py);
  await page.waitForTimeout(600);
  console.log(`\n=== stage.eventMode = ${mode} ===`);
  console.log('hitTest at hint centre:', hitInfo.hitTest);
  console.log('console after click:', logs.filter((l) => l.includes('[tap]')).length ? logs.filter((l) => l.includes('[tap]')).join(' | ') : '(no [tap])');
}

// The island must survive whichever way the root is set: its taps are resolved
// on its scene container, which is `static` with an all-covering hitArea, so
// the hit path should end INSIDE the scene under both modes — never at the
// bare stage, never nowhere.
const ISLAND = 'http://localhost:6007/iframe.html?id=island-reachable-tiles--click-to-move&viewMode=story';
await page.goto(ISLAND, { waitUntil: 'networkidle' });
await page.waitForFunction(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return false;
  let found = false;
  const walk = (n) => { if (found) return; if (n.label?.startsWith('tile-')) found = true; n.children?.forEach(walk); };
  walk(app.stage);
  return found;
}, null, { timeout: 60000 });
await page.waitForTimeout(1500);
for (const mode of ['passive', 'static']) {
  const r = await page.evaluate((m) => {
    const app = globalThis.__PIXI_APP__;
    app.stage.eventMode = m;
    const b = app.renderer.events.rootBoundary;
    if (!b.rootTarget) b.rootTarget = app.stage;
    const tiles = [];
    const walk = (n) => { if (n.label?.startsWith('tile-') && n.visible) tiles.push(n); n.children?.forEach(walk); };
    walk(app.stage);
    tiles.sort((a, c) => { const pa = a.getGlobalPosition(), pc = c.getGlobalPosition(); return Math.hypot(pa.x - 480, pa.y - 270) - Math.hypot(pc.x - 480, pc.y - 270); });
    const g = tiles[0].getGlobalPosition();
    const hit = b.hitTest(g.x, g.y);
    const chain = []; for (let p = hit; p; p = p.parent) chain.push(p.label || p.constructor?.name);
    return { hitTest: hit ? chain.join(' < ') : 'nothing', isStage: hit === app.stage, insideScene: !!hit && hit !== app.stage };
  }, mode);
  console.log(`\n=== ISLAND, stage.eventMode = ${mode} ===`);
  console.log('hitTest at tile centre:', r.hitTest, r.insideScene ? '  -> reaches the scene' : '  -> DOES NOT reach the scene');
}
await browser.close();
