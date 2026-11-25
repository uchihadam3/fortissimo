// usage: node scripts/cineshots.cjs <intro|ending> <outPrefix> <t1,t2,...> [width] [height]
// Drives the cinematic's timeline by hand (window.__cineManual), stepping toward each mark so moments,
// tracks and smoothed values unfold in order, then saves a frame exactly at each mark.
const { chromium } = require('playwright');
(async () => {
  const [name, prefix, list, w = '960', h = '540'] = process.argv.slice(2);
  const times = list.split(',').map(Number).sort((a, b) => a - b);
  const step = Number(process.env.CINE_STEP ?? 1.5);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  await page.addInitScript(() => { window.__cineManual = 0; });
  await page.goto(`http://localhost:5173/?cine=${name}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  const frame = (tt) => page.evaluate((v) => { window.__cineManual = v; return new Promise((r) => requestAnimationFrame(() => r())); }, tt);
  let cur = 0;
  for (const t of times) {
    while (cur < t) {
      cur = Math.min(t, cur + step);
      await frame(cur);
    }
    await frame(t);
    await frame(t);
    await page.screenshot({ path: `${prefix}-${t}.png`, timeout: 180000 });
    console.log(`shot t=${t}`);
  }
  console.log(logs.slice(-10).join('\n'));
  await browser.close();
})();
