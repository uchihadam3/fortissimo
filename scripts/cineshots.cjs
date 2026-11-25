// usage: node scripts/cineshots.cjs <scene> <outPrefix> <t1,t2,...> [width] [height]
//        node scripts/cineshots.cjs batch <spec.json> [width] [height]
//   <scene>: intro | ending | epilogue | a story scene id (ch-meadow, m1 … cx) | any query (e.g. "interlude&id=m1")
//   spec.json: [{ "scene": "m1", "prefix": "/tmp/shots/m1", "marks": [2, 6, 11] }, …] (one browser for all)
// Drives the cinematic's timeline by hand (window.__cineManual), stepping toward each mark so moments,
// tracks and smoothed values unfold in order (coarse steps, then fine steps for the last second so
// effects look as they would at full speed), then saves a frame exactly at each mark.
// env: PORT (default 5173), CINE_STEP (coarse step, s), CINE_FINE (fine step, s), LANG_UI=pt|en, QUALITY
const { chromium } = require('playwright');

async function shootScene(browser, scene, prefix, marks, w, h) {
  const step = Number(process.env.CINE_STEP ?? 1.5);
  const fine = Number(process.env.CINE_FINE ?? 0.25);
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  const lang = process.env.LANG_UI || 'pt';
  const quality = process.env.QUALITY || 'high';
  await page.addInitScript(([l, qq]) => {
    window.__cineManual = 0;
    try { localStorage.setItem('fortissimo.settings', JSON.stringify({ lang: l, quality: qq })); } catch {}
  }, [lang, quality]);
  await page.goto(`http://localhost:${process.env.PORT || 5173}/?cine=${scene}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  const frame = (tt) => page.evaluate((v) => { window.__cineManual = v; return new Promise((r) => requestAnimationFrame(() => r())); }, tt);
  const times = marks.slice().sort((a, b) => a - b);
  let cur = 0;
  for (const t of times) {
    while (cur < t) {
      const s = t - cur > 1.0 ? step : fine;
      cur = Math.min(t, cur + s);
      await frame(cur);
    }
    await frame(t);
    await frame(t);
    await page.screenshot({ path: `${prefix}-${t.toFixed(1).padStart(5, '0')}.png`, timeout: 180000 });
    console.log(`${scene} shot t=${t}`);
  }
  if (logs.length) console.log(logs.slice(-8).join('\n'));
  await page.close();
}

(async () => {
  const args = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (args[0] === 'batch') {
      const [, spec, w = '640', h = '360'] = args;
      const list = JSON.parse(require('fs').readFileSync(spec, 'utf8'));
      for (const it of list) {
        try {
          await shootScene(browser, it.scene, it.prefix, it.marks, w, h);
        } catch (e) {
          console.log(`${it.scene} FAILED: ${e.message}`);
        }
      }
    } else {
      const [name, prefix, list, w = '960', h = '540'] = args;
      await shootScene(browser, name, prefix, list.split(',').map(Number), w, h);
    }
  } finally {
    await browser.close();
  }
})();
