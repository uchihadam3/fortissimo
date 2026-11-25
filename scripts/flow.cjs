// Intro flow screenshots: gate → studio → title → menu
const { chromium } = require('playwright');
(async () => {
  const [base, outDir] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/f1-gate.png` });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(3600);
  await page.screenshot({ path: `${outDir}/f2-studio.png` });
  await page.waitForTimeout(5400);
  await page.waitForTimeout(3800);
  await page.screenshot({ path: `${outDir}/f3-title.png` });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${outDir}/f4-menu.png`, timeout: 180000 });
  console.log(logs.filter((l) => !l.includes('GPU stall') && !l.includes('PCF')).slice(-20).join('\n'));
  await browser.close();
})();
