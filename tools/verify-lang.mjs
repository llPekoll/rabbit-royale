import { chromium } from 'playwright';

const SHOT = '/private/tmp/claude-501/-Users-peko-work-ton-rabbit-royale/fa77bcb8-5ef7-4a31-9581-d71bc9d2870d/scratchpad';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 890, height: 400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:3010', { waitUntil: 'networkidle' });
await page.waitForSelector('.rr-lang-select', { timeout: 15000 });

const report = {};

// The picker exists, and offers exactly the four languages.
report.options = await page.$$eval('.rr-lang-select option', (os) =>
  os.map((o) => ({ value: o.value, text: o.textContent.trim() })));

// English first (the default before a stored choice).
report.htmlLangInitial = await page.getAttribute('html', 'lang');
report.connectInitial = await page.textContent('button:has-text("Connect wallet")').catch(() => null);
await page.screenshot({ path: `${SHOT}/lang-en.png` });

for (const [code, name] of [['fr', 'fr'], ['zh', 'zh'], ['pt-BR', 'pt']]) {
  await page.selectOption('.rr-lang-select', code);
  await page.waitForTimeout(400);
  report[`html_${code}`] = await page.getAttribute('html', 'lang');
  // The sign-in column's primary button, in that language.
  report[`cta_${code}`] = await page.$eval('.rr-gate button, button', (b) => b.textContent.trim()).catch(() => null);
  // The crawl's chapter title — the longest prose on the screen.
  report[`crawlTitle_${code}`] = await page.textContent('.rr-crawl-title').catch(() => null);
  report[`font_${code}`] = await page.evaluate(() =>
    getComputedStyle(document.body).fontFamily);
  await page.screenshot({ path: `${SHOT}/lang-${name}.png` });
}

// And the choice survives a reload.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.rr-lang-select', { timeout: 15000 });
await page.waitForTimeout(500);
report.afterReload = await page.inputValue('.rr-lang-select');
report.htmlAfterReload = await page.getAttribute('html', 'lang');

report.errors = errors.slice(0, 8);
console.log(JSON.stringify(report, null, 2));
await browser.close();
