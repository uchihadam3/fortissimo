// Phone-size gameplay screenshots: node scripts/phone.cjs <outPrefix> [level] [w] [h] [scale]
// Opens a journey, follows the glove: taps the glowing plate, picks the instrument, sets off, and shoots along the way.
const { chromium } = require('playwright');
(async () => {
  const [prefix, level = 'm1', w = '844', h = '390', scale = '2'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale, isMobile: true, hasTouch: true });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  const frames = (n = 2) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  await page.goto(`http://localhost:${process.env.PORT || 5173}/?play=${level}`, { waitUntil: 'load' });
  await page.waitForSelector('#go', { state: 'attached', timeout: 240000 });
  await frames(3);
  await page.waitForSelector('#hand.on', { timeout: 120000 }).catch(() => logs.push('no hand'));
  await frames(2);
  await page.screenshot({ path: `${prefix}-1.png`, timeout: 180000 });
  console.log('shot 1 (start)');
  // follow the glove to the plate
  const hp = await page.evaluate(() => { const e = document.querySelector('#hand'); return { x: parseFloat(e.style.left), y: parseFloat(e.style.top) }; });
  await page.touchscreen.tap(hp.x, hp.y);
  await page.waitForSelector('#radial.open', { state: 'attached', timeout: 120000 }).catch(() => logs.push('no radial'));
  await frames(2);
  await page.screenshot({ path: `${prefix}-2.png`, timeout: 180000 });
  console.log('shot 2 (build menu)');
  // the buttons pulse, so press them directly rather than waiting for them to sit still
  await page.evaluate(() => document.querySelector('#radial .rb')?.click());
  await frames(3);
  await page.evaluate(() => document.querySelector('#go')?.click());
  await frames(2);
  // keep following the glove like a new player would: tap where it points, take the first affordable instrument
  const until = Date.now() + Number(process.env.PLAY_MS ?? 30000);
  let shot = 0;
  while (Date.now() < until) {
    const hand = await page.evaluate(() => { const e = document.querySelector('#hand.on'); return e ? { x: parseFloat(e.style.left), y: parseFloat(e.style.top) } : null; });
    if (hand) {
      if (process.env.NUDGE_SHOT && !shot++) await page.screenshot({ path: `${prefix}-nudge.png`, timeout: 180000 });
      await page.touchscreen.tap(hand.x, hand.y);
      await frames(2);
      await page.evaluate(() => document.querySelector('#radial.open .rb:not(.poor)')?.click());
    }
    await frames(1);
  }
  await frames(2);
  await page.screenshot({ path: `${prefix}-3.png`, timeout: 180000 });
  console.log('shot 3 (journey)');
  console.log(logs.slice(-10).join('\n'));
  await browser.close();
})();
