// usage: node scripts/shot.cjs <url> <out.png> [waitMs] [width] [height] [scale]
const { chromium } = require('playwright');
(async () => {
  const [url, out, wait = '2500', w = '1280', h = '720', scale = '1'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => logs.push('[timeout] __ready'));
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: out, timeout: 180000 });
  console.log(logs.filter((l) => !l.includes('[vite]')).slice(-30).join('\n'));
  await browser.close();
})();
