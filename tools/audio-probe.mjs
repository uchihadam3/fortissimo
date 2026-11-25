#!/usr/bin/env node
/**
 * Ad-hoc audio experiments: evaluates a JavaScript expression in the audio lab page (headless
 * Chromium; `lab` = window.__lab, `o` = lab.offline) and prints the result as JSON.
 *   node tools/audio-probe.mjs "o.renderSong('meadow', 0, 8).then((r) => r.stats)"
 *   node tools/audio-probe.mjs --file probe.js        (the file's text is the expression)
 *   --wav PATH   if the result has a base64 `wav` field, it is written to PATH (and left out of the print)
 * AUDIO_PORT selects the Vite server (started if needed; default 5174).
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AUDIO_PORT ?? 5174);
const URL = `http://localhost:${PORT}/tools/audio-lab.html`;
const argv = process.argv.slice(2);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const file = opt('--file', null);
const wav = opt('--wav', null);
const expr = file ? readFileSync(file, 'utf8') : argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))).join(' ');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up() {
  try {
    return (await fetch(URL)).ok;
  } catch {
    return false;
  }
}
let server = null;
if (!(await up())) {
  server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
  for (let i = 0; i < 120 && !(await up()); i++) await sleep(250);
}
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.text().includes('[audio]')) errors.push(`${m.type()}: ${m.text()}`);
});
await page.goto(URL);
await page.waitForFunction(() => !!window.__lab, null, { timeout: 60000 });
let code = 0;
try {
  const res = await page.evaluate(async (src) => {
    const lab = window.__lab;
    const o = lab.offline;
    void lab;
    void o;
    // eslint-disable-next-line no-eval
    return await eval(src);
  }, expr);
  if (res && typeof res === 'object' && typeof res.wav === 'string') {
    if (wav) writeFileSync(wav, Buffer.from(res.wav, 'base64'));
    delete res.wav;
  }
  console.log(JSON.stringify(res, null, 1));
} catch (e) {
  console.log('ERROR', e.message);
  code = 1;
}
if (errors.length) console.log('\nERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
if (server) {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* gone */
  }
}
process.exit(code || (errors.length ? 1 : 0));
