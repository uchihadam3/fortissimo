// Cinematic screenshots at given seconds: node scripts/cine.cjs <url> <outPrefix> t1 t2 ...
const { chromium } = require('playwright');
(async () => {
  const [url, prefix, ...times] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const t0 = Date.now();
  for (const t of times.map(Number)) {
    const wait = t * 1000 - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${prefix}-${t}.png`, timeout: 180000 });
  }
  console.log(logs.slice(-15).join('\n'));
  await browser.close();
})();
