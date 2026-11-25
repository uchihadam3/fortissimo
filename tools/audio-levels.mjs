#!/usr/bin/env node
/**
 * Offline audio report for FORTÍSSIMO (renders faster than real time in headless Chromium):
 *   every song at every intensity · intro / ending / world-restored sequences · a 24-tower battle
 *   stress test · an audio-domain grid (onset) test · ambiences · stingers.
 * Prints loudness (integrated LUFS, short-term range), peak, dropouts, clicks, voices and render load.
 *
 * Usage: node tools/audio-levels.mjs [--quick] [--wav DIR] [--only songs|cine|stress|onset|amb|sfx] [--secs N]
 * Uses a Vite server on :5174 if one is running, otherwise starts (and stops) one.
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
const quick = flag('--quick');
const wavDir = opt('--wav', null);
const only = opt('--only', null);
const secs = Number(opt('--secs', quick ? 16 : 26));
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
// other people edit the repo concurrently: if Vite reloads the page mid-render, wait and retry
const evaluate = page.evaluate.bind(page);
page.evaluate = async (fn, arg) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await evaluate(fn, arg);
    } catch (e) {
      if (attempt >= 3 || !String(e).includes('context was destroyed')) throw e;
      console.log('   (page reloaded by a concurrent edit — retrying)');
      await sleep(1500);
      await page.waitForFunction(() => !!window.__lab, null, { timeout: 60000 });
    }
  }
};

const save = (name, b64) => {
  if (wavDir && b64) writeFileSync(resolve(wavDir, `${name}.wav`), Buffer.from(b64, 'base64'));
};
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
const line = (name, s, extra = '') =>
  console.log(
    `${name.padEnd(22)} LUFS ${f1(s.lufs).padStart(6)}  ST ${f1(s.stMin).padStart(6)}..${f1(s.stMax).padStart(6)}  peak ${f1(s.peakDb).padStart(5)} dBFS  silence ${s.silence.toFixed(1)}s  clicks ${s.clicks}  nan ${s.nan}  voices ${s.maxVoices}  load ${(s.load * 100).toFixed(0)}%  oct ${(s.bands ?? []).join(" ")} ${extra}`,
  );
const problems = [];
const check = (name, s, o = {}) => {
  if (s.nan) problems.push(`${name}: NaN`);
  if (s.peakDb > -1) problems.push(`${name}: peak ${f1(s.peakDb)} dBFS`);
  if (s.clicks > (o.clicks ?? 0)) problems.push(`${name}: ${s.clicks} clicks`);
  if (o.silence !== undefined && s.silence > o.silence) problems.push(`${name}: dropout ${s.silence.toFixed(1)} s`);
};

const SONGS = ['menu', 'map', 'meadow', 'desert', 'ice', 'forge', 'citadel', 'boss', 'finale', 'credits'];
const BATTLE = new Set(['meadow', 'desert', 'ice', 'forge', 'citadel', 'boss', 'finale']);
const songLufs = {};

if (!only || only === 'songs') {
  console.log(`\n── songs (${secs} s each) ──`);
  for (const song of SONGS) {
    const levels = BATTLE.has(song) ? (quick ? [0, 3] : [0, 1, 2, 3]) : [0];
    for (const I of levels) {
      const r = await page.evaluate(([s, i, n, w]) => window.__lab.offline.renderSong(s, i, n, w), [song, I, song === 'credits' || song === 'menu' ? Math.max(secs, 40) : secs, !!wavDir]);
      const name = BATTLE.has(song) ? `${song} I${I}` : song;
      line(name, r.stats);
      check(name, r.stats, { silence: 1.6 });
      songLufs[name] = r.stats.lufs;
      save(name.replace(' ', '-'), r.wav);
    }
  }
  // the finale turning major (intensity 3 from bar 2)
  const fm = await page.evaluate(([n, w]) => window.__lab.offline.renderSong('finale', [[0, 1], [2, 3]], n, w), [Math.max(secs, 24), !!wavDir]);
  line('finale 1→3 (major)', fm.stats);
  check('finale 1→3', fm.stats, { silence: 1.6 });
  save('finale-turns-major', fm.wav);
}

if (!only || only === 'cine') {
  console.log('\n── cinematics ──');
  for (const which of ['intro', 'ending', 'intro2', 'ending2', 'restored', 'ending-song']) {
    if (quick && which === 'ending-song') continue;
    const r = await page.evaluate(([w, wv]) => window.__lab.offline.renderCinema(w, wv), [which, !!wavDir]);
    line(which, r.stats, r.restBarDb !== undefined ? `rest-bar peak ${r.restBarDb} dBFS` : '');
    console.log('   segments (dB RMS 0.5–3.5 s after cue):', JSON.stringify(r.segments));
    check(which, r.stats, { clicks: 2 });
    if (r.restBarDb !== undefined && r.restBarDb > -80) problems.push(`${which}: the rest bar is not silent (${r.restBarDb} dBFS)`);
    save(`cine-${which}`, r.wav);
  }
}

if (!only || only === 'moods') {
  console.log('\n── story moods and land openings (each sustains; consonance vs. its own harmony) ──');
  const worlds = ['meadow', 'desert', 'ice', 'forge', 'citadel'];
  const story = ['wonder', 'frozen', 'wake', 'join', 'threat', 'shard', 'voice', 'camp', 'memory', 'journey', 'dread', 'hush', 'comic'];
  const list = [...story.map((m, i) => [`story:${m}`, worlds[i % worlds.length]]), ...worlds.map((w) => [`land:${w}`, w])];
  if (!quick) for (const w of worlds) list.push(['story:voice', w], ['story:wonder', w]);
  for (const [cue, w] of list) {
    const r = await page.evaluate(([c, ww, wv]) => window.__lab.offline.renderCue(c, ww, 24, { wav: wv }), [cue, w, !!wavDir]);
    line(`${cue}@${w}`.slice(0, 22), r.stats, `chord ${(r.inChord * 100).toFixed(0)}% scale ${(r.inScale * 100).toFixed(0)}%`);
    check(`${cue}@${w}`, r.stats, { clicks: 2, silence: cue === 'story:hush' ? 30 : 2 });
    if (cue !== 'story:hush' && r.inScale < 0.75) problems.push(`${cue}@${w}: ${(r.inScale * 100).toFixed(0)}% on its scale`);
    save(`mood-${cue.replace(':', '-')}-${w}`, r.wav);
  }
}

if (!only || only === 'motifs') {
  console.log('\n── joinMotif (over story:join), duet flourishes, new creatures ──');
  for (const w of quick ? ['meadow'] : ['meadow', 'desert', 'citadel']) {
    const m = await page.evaluate(([ww, wv]) => window.__lab.offline.renderMotifs(ww, 'story:join', wv), [w, !!wavDir]);
    line(`motifs@${w}`, m.stats, m.each.map((e) => `${e.kind} ${f1(e.lufs)}`).join(' '));
    check(`motifs@${w}`, m.stats, { clicks: 2 });
    save(`motifs-${w}`, m.wav);
  }
  const d = await page.evaluate((wv) => window.__lab.offline.renderDuets('meadow', wv), !!wavDir);
  line('duets@meadow', d.stats, d.each.map((e) => `${e.id} ${f1(e.lufs)}`).join(' '));
  check('duets', d.stats, { clicks: 2 });
  save('duets', d.wav);
  const x = await page.evaluate((wv) => window.__lab.offline.renderDeaths('desert', wv), !!wavDir);
  line('deaths@desert', x.stats);
  check('deaths', x.stats, { clicks: 3 });
  save('deaths', x.wav);
}

if (!only || only === 'stress') {
  console.log('\n── stress: 24 towers + deaths/coins + wave call + boss + ff ──');
  for (const song of quick ? ['meadow'] : ['meadow', 'forge', 'boss']) {
    const r = await page.evaluate(([s, w]) => window.__lab.offline.renderStress(s, 30, window.__lab.offline.defaultArmy(24), w), [song, !!wavDir]);
    line(`stress ${song}`, r.stats, `shots ${r.shots}  grid max err ${(r.gridMaxErr * 1e6).toFixed(3)} µs`);
    check(`stress ${song}`, r.stats, { silence: 1.0 });
    if (r.gridMaxErr > 1e-6) problems.push(`stress ${song}: tower shots off the grid by ${r.gridMaxErr}`);
    save(`stress-${song}`, r.wav);
  }
  const r40 = await page.evaluate(() => window.__lab.offline.renderStress('citadel', 20, window.__lab.offline.defaultArmy(40), false));
  line('stress citadel ×40', r40.stats, `shots ${r40.shots}`);
  check('stress citadel ×40', r40.stats, { silence: 1.0 });
}

if (!only || only === 'onset') {
  const o = await page.evaluate(() => window.__lab.offline.onsetTest());
  console.log(`\n── onset test: measured onset − scheduled time (ms): ${o.measuredMs.join(' ')}  (master chain look-ahead 12 ms; max deviation ${o.maxErrMs.toFixed(2)} ms)`);
  if (o.maxErrMs > 3) problems.push(`onsets off by ${o.maxErrMs} ms`);
}

if (!only || only === 'amb') {
  console.log('\n── ambience (12 s) ──');
  for (const place of ['meadow', 'desert', 'ice', 'forge', 'citadel', 'menu']) {
    const r = await page.evaluate(([p, w]) => window.__lab.offline.renderAmbience(p, 12, w), [place, !!wavDir]);
    line(`amb ${place}`, r.stats);
    check(`amb ${place}`, r.stats, { clicks: 3 });
    save(`amb-${place}`, r.wav);
  }
}

if (!only || only === 'sfx') {
  console.log('\n── stingers & sfx ──');
  const list = [['studioSting', 7], ['titleReveal', 6], ['victory', 5], ['defeat', 7], ['stars', 4], ['newTower', 4], ['waveStart', 4], ['bossAppear', 6], ['ffReady', 2.5], ['ffUnleash', 5], ['build', 1.5], ['upgrade', 2], ['sell', 1.5], ['muted', 2], ['switchFlip', 1.2], ['heartHit', 1.5], ['countIn', 3], ['ui', 2]];
  for (const [name, s] of list) {
    const r = await page.evaluate(([n, x, w]) => window.__lab.offline.renderSfx(n, x, w), [name, s, !!wavDir]);
    line(name, r.stats);
    check(name, r.stats, { clicks: 2 });
    save(`sfx-${name}`, r.wav);
  }
}

if (Object.keys(songLufs).length) {
  const v = Object.values(songLufs);
  console.log(`\nsong loudness spread: ${f1(Math.min(...v))} .. ${f1(Math.max(...v))} LUFS`);
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
