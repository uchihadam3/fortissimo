// Phone-size print of a journey in full swing: node scripts/phone-play.cjs <out.png> [level] [towers] [seconds] [w] [h] [scale]
// Uses the developer handle (window.__battle, dev server only) to set up towers and set off, then waits.
const { chromium } = require('playwright');
(async () => {
  const [out, level = 'm1', towers = 'harp,harp,harp', secs = '30', w = '844', h = '390', scale = '2'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale, isMobile: true, hasTouch: true });
  await page.goto(`http://localhost:${process.env.PORT || 5173}/?play=${level}&done=${process.env.DONE ?? ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__battle, null, { timeout: 240000 });
  // play like a good player: fill the plates in order with what can be afforded, then level towers up
  const play = (list) => {
    const b = window.__battle, s = b.sim, kinds = list.split(',');
    for (let i = 0; i < Math.min(kinds.length, s.slotsOpen); i++) if (!s.towerAt(i)) b.build(i, kinds[i]);
    for (const p of s.pickups) if (!p.taken && !p.lost && Math.hypot(p.x - s.turtle.x, p.z - s.turtle.z) < 20) s.collect(p.id);
    if (s.towers.length >= Math.min(kinds.length, s.slotsOpen)) for (const t of s.towers) if ((s.upgradeCost(t) ?? 1e9) <= s.coins) b.upgrade(t.id);
  };
  await page.evaluate(play, towers);
  await page.evaluate(() => window.__battle.go());
  const t0 = Date.now();
  while (Date.now() - t0 < +secs * 1000) {
    await page.evaluate(play, towers);
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: out, timeout: 180000 });
  const st = await page.evaluate(() => { const s = window.__battle.sim; return { t: s.time.toFixed(1), lives: s.lives, kills: s.stats.kills, enemies: s.enemies.length }; });
  console.log('shot', out, JSON.stringify(st));
  await browser.close();
})();
