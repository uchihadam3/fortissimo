#!/usr/bin/env node
/**
 * Long-form journey report for FORTÍSSIMO battle songs (offline renders in headless Chromium):
 * a 5-movement, ~104-bar journey with breathers, the band growing from the harp to the full band
 * (or the full band from the start), towers firing on their patterns, deaths and coins.
 * Per segment: loudness, peak, consonance (share of pitched energy on chord tones / on the scale)
 * and the spectral balance; plus the bar-by-bar trace of the form (plan, battle/breakdown, section).
 *
 * Usage: node tools/audio-journey.mjs [--song meadow] [--full] [--wav DIR] [--trace] [--bars N]
 *        AUDIO_PORT=5181 to use (or start) a Vite server on that port (default 5174).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AUDIO_PORT ?? 5174);
const URL = `http://localhost:${PORT}/tools/audio-lab.html`;
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const songs = opt('--song', 'meadow').split(',');
const full = flag('--full');
const both = flag('--both');
const wavDir = opt('--wav', null);
const showTrace = flag('--trace');
if (wavDir) mkdirSync(wavDir, { recursive: true });

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
  process.on('exit', () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* gone */
    }
  });
  for (let i = 0; i < 120 && !(await up()); i++) await sleep(250);
}
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.text().includes('[audio]')) errors.push(`${m.type()}: ${m.text()}`);
});
await page.goto(URL);
await page.waitForFunction(() => !!window.__lab, null, { timeout: 60000 });

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
const problems = [];
for (const song of songs) {
  for (const isFull of both ? [false, true] : [full]) {
    const t0 = Date.now();
    const r = await page.evaluate(
      async ([s, fl, w]) => {
        const o = window.__lab.offline;
        const j = o.standardJourney(fl);
        return o.renderJourney(s, j.bars, j.events, j.segments, { wav: w });
      },
      [song, isFull, !!wavDir],
    );
    const s = r.stats;
    console.log(`\n── ${song} journey (${isFull ? 'full band' : 'band grows'}) — ${(s.seconds / 60).toFixed(1)} min, rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s ──`);
    console.log(`overall LUFS ${f1(s.lufs)}  ST ${f1(s.stMin)}..${f1(s.stMax)}  peak ${f1(s.peakDb)} dBFS  silence ${s.silence.toFixed(1)}s  clicks ${s.clicks}  nan ${s.nan}  voices ${s.maxVoices}  load ${(s.load * 100).toFixed(0)}%  shots ${r.shots}`);
    console.log('segment          LUFS   peak  chord scale   63 125 250 500  1k  2k  4k  8k (dB)');
    for (const g of r.segments) {
      console.log(`${g.name.padEnd(14)} ${f1(g.lufs).padStart(6)} ${f1(g.peakDb).padStart(6)}  ${(g.inChord * 100).toFixed(0).padStart(4)}%  ${(g.inScale * 100).toFixed(0).padStart(3)}%  ${g.bands.map((x) => String(x).padStart(3)).join(' ')}`);
      if (g.inScale < 0.7) problems.push(`${song} ${g.name}: only ${(g.inScale * 100).toFixed(0)}% on the scale`);
    }
    if (showTrace) {
      const lines = [];
      for (let i = 0; i < r.trace.length; i += 16) lines.push(r.trace.slice(i, i + 16).join(' '));
      console.log(lines.join('\n'));
    }
    if (s.nan) problems.push(`${song}: NaN`);
    if (s.peakDb > -1) problems.push(`${song}: peak ${f1(s.peakDb)}`);
    if (s.silence > 1.2) problems.push(`${song}: dropout ${s.silence.toFixed(1)} s`);
    if (s.clicks > 0) problems.push(`${song}: ${s.clicks} clicks at ${s.clickAt.join(', ')}`);
    if (wavDir && r.wav) writeFileSync(resolve(wavDir, `journey-${song}${isFull ? '-full' : ''}.wav`), Buffer.from(r.wav, 'base64'));
  }
}
if (errors.length) console.log('\nERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
console.log(problems.length ? `\nPROBLEMS:\n  ${problems.join('\n  ')}` : '\nno problems');
await browser.close();
if (server) {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* gone */
  }
}
process.exit(problems.length || errors.length ? 1 : 0);
