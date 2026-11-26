#!/usr/bin/env node
/**
 * Tower balance report (offline renders in headless Chromium): is every musician heard over the
 * backing — also on a PHONE speaker (a model with almost nothing below ~420 Hz) — and does the
 * music get grander as the band grows?
 *
 *  1. one tower of each kind over its song (the band = that tower's section), three renders each:
 *     backing alone, tower stem alone, the mix. Per kind: stem and backing loudness (K-weighted and
 *     phone), the stem's level during its hits (250 ms from each onset) and stem − backing there.
 *     Target: every kind's hit level within ~3 dB of the harp's, and clearly above the backing.
 *  2. one harp (harmony 0) vs a full diverse band (harmony 5): loudness, stereo width (side/mid),
 *     octave spread. Target: ≥ +5 LU.
 *  3. groove 0 vs 4 (with perfect taps on every beat) over the full band.
 *  4. the rhythm API: taps of each quality, every solo, the call & echo (loudness, consonance).
 *  5. v4 events: baton taps, coin pickups and the colossus' strikes in every quality, measured as a
 *     stem over the full band (+ towers): level, brightness (energy > 2 kHz) and stem − band on the
 *     phone model. A miss must be clearly duller and quieter than a hit; a strike must cut through.
 *  6. v4 power: the full band while power climbs 0 → 1, holds, then a miss drops it (0.3): loudness,
 *     brightness, width per stage, the drop's dip, peaks and clicks.
 *
 * Usage: node tools/audio-balance.mjs [--song meadow,desert] [--level 0] [--intensity 1] [--bars 8]
 *        [--only kinds|band|groove|rhythm|events|power] [--wav DIR]      AUDIO_PORT selects the Vite server (default 5174).
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
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const songs = opt('--song', 'meadow,desert,ice,forge,citadel').split(',');
const level = Number(opt('--level', 0));
const intensity = Number(opt('--intensity', 1));
const bars = Number(opt('--bars', 8));
const only = opt('--only', null);
const wavDir = opt('--wav', null);
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

const KINDS = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
const p6 = (x) => f1(x).padStart(6);
const problems = [];
const bal = (song, army, o) =>
  page.evaluate(([s, a, oo]) => window.__lab.offline.renderBalance(s, a, oo), [song, army, o]);
const save = (name, r) => {
  if (wavDir && r.wav) writeFileSync(resolve(wavDir, `${name}.wav`), Buffer.from(r.wav, 'base64'));
};
const FULL = [
  { kind: 'harp', level, pan: -0.5, voice: 1 },
  { kind: 'drum', level, pan: 0.3, voice: 2 },
  { kind: 'bell', level, pan: 0.6, voice: 3 },
  { kind: 'shaker', level, pan: -0.7, voice: 4 },
  { kind: 'crystal', level, pan: 0.8, voice: 5 },
  { kind: 'horn', level, pan: -0.2, voice: 6 },
  { kind: 'choir', level, pan: 0.1, voice: 7 },
  { kind: 'bass', level, pan: 0, voice: 8 },
  { kind: 'harp', level, pan: 0.5, voice: 9 },
  { kind: 'drum', level, pan: -0.4, voice: 10 },
];

for (const song of songs) {
  if (!only || only === 'kinds') {
    console.log(`\n── ${song}: one tower of each kind (level ${level}, intensity ${intensity}) ──`);
    console.log('kind      stemLU stemPh backLU backPh |  hitK hitPh  ΔhitK ΔhitPh | vsHarp  peak');
    const rows = [];
    for (const kind of KINDS) {
      const r = await bal(song, [{ kind, level, pan: 0.2, voice: 1 }], { bars, intensity, wav: !!wavDir });
      save(`${song}-${kind}`, r);
      rows.push({ kind, r });
    }
    const harp = rows[0].r.hitPhone;
    for (const { kind, r } of rows) {
      const vs = r.hitPhone - harp;
      console.log(`${kind.padEnd(8)} ${p6(r.stem.lufs)} ${p6(r.stem.phone)} ${p6(r.back.lufs)} ${p6(r.back.phone)} | ${p6(r.hitK)} ${p6(r.hitPhone)} ${p6(r.hitDelta)} ${p6(r.hitDeltaPhone)} | ${p6(vs)} ${p6(r.mix.peakDb)}`);
      if (Math.abs(vs) > 3.5) problems.push(`${song} ${kind}: hit level ${f1(vs)} dB vs the harp (phone)`);
      if (r.hitDeltaPhone < 2) problems.push(`${song} ${kind}: only ${f1(r.hitDeltaPhone)} dB over the backing during its hits (phone)`);
      if (r.mix.peakDb > -1) problems.push(`${song} ${kind}: peak ${f1(r.mix.peakDb)}`);
    }
  }
  if (!only || only === 'band') {
    console.log(`\n── ${song}: one harp vs the full band ──`);
    console.log('band              mixLU mixPh  width  peak   63 125 250 500  1k  2k  4k  8k | backLU backPh stemLU stemPh');
    const one = await bal(song, [{ kind: 'harp', level, pan: -0.3, voice: 1 }], { bars, intensity, wav: !!wavDir });
    const full = await bal(song, FULL, { bars, intensity, wav: !!wavDir });
    save(`${song}-one-harp`, one);
    save(`${song}-full-band`, full);
    for (const [name, r] of [['1 harp (h0)', one], ['full band (h5)', full]]) console.log(`${name.padEnd(16)} ${p6(r.mix.lufs)} ${p6(r.mix.phone)} ${p6(r.mix.width)} ${p6(r.mix.peakDb)}  ${r.mix.bands.map((x) => String(x).padStart(3)).join(' ')} | ${p6(r.back.lufs)} ${p6(r.back.phone)} ${p6(r.stem.lufs)} ${p6(r.stem.phone)}`);
    const d = full.mix.lufs - one.mix.lufs;
    const dp = full.mix.phone - one.mix.phone;
    console.log(`full − one: ${f1(d)} LU (phone ${f1(dp)}), width ${f1(full.mix.width - one.mix.width)} dB`);
    if (d < 5) problems.push(`${song}: full band only ${f1(d)} LU over one harp`);
    if (full.mix.peakDb > -1) problems.push(`${song} full band: peak ${f1(full.mix.peakDb)}`);
  }
  if (!only || only === 'groove') {
    console.log(`\n── ${song}: groove (full band) ──`);
    const g0 = await bal(song, FULL, { bars, intensity, groove: 0 });
    const g4 = await bal(song, FULL, { bars, intensity, groove: 4, taps: 'perfect', wav: !!wavDir });
    save(`${song}-groove4`, g4);
    console.log(`groove 0: ${f1(g0.mix.lufs)} LU  groove 4 + perfect taps: ${f1(g4.mix.lufs)} LU (phone ${f1(g4.mix.phone)})  peak ${f1(g4.mix.peakDb)}  Δ ${f1(g4.mix.lufs - g0.mix.lufs)}`);
    if (g4.mix.peakDb > -1) problems.push(`${song} groove 4: peak ${f1(g4.mix.peakDb)}`);
    if (g4.mix.lufs - g0.mix.lufs < 1.5) problems.push(`${song}: groove 4 adds only ${f1(g4.mix.lufs - g0.mix.lufs)} LU`);
  }
  if (!only || only === 'rhythm') {
    console.log(`\n── ${song}: rhythm play (taps, solos, call & echo; full band, intensity 1) ──`);
    const r = await page.evaluate(([s, w]) => window.__lab.offline.renderRhythm(s, { wav: w }), [song, !!wavDir]);
    save(`${song}-rhythm`, r);
    console.log(`taps (a bar of each, LUFS with / without the taps): ${r.taps.map((x) => `${x.q} ${f1(x.lufs)}/${f1(x.ref)} (+${f1(x.lufs - x.ref)})`).join(' · ')}`);
    console.log('solo       LUFS  w/o     gain   peak  inChord (drum/shaker: unpitched)');
    for (const x of r.solos) {
      console.log(`${x.kind.padEnd(8)} ${p6(x.lufs)} ${p6(x.before)} ${p6(x.lufs - x.before)} ${p6(x.peakDb)}  ${(x.inChord * 100).toFixed(0).padStart(5)}%`);
      if (x.lufs - x.before < 1.5) problems.push(`${song} ${x.kind} solo: only ${f1(x.lufs - x.before)} LU over the bar before`);
      if (x.inChord < 0.6 && x.kind !== 'drum' && x.kind !== 'shaker') problems.push(`${song} ${x.kind} solo: ${(x.inChord * 100).toFixed(0)}% on chord tones`);
    }
    console.log(`call & echo: ${f1(r.call.lufs)} LUFS (breather alone ${f1(r.call.ref)}), ${(r.call.inScale * 100).toFixed(0)}% on the scale · whole render peak ${f1(r.stats.peakDb)} dBFS, clicks ${r.stats.clicks}, voices ${r.stats.maxVoices}`);
    if (r.stats.peakDb > -1) problems.push(`${song} rhythm: peak ${f1(r.stats.peakDb)}`);
    if (r.stats.clicks) problems.push(`${song} rhythm: ${r.stats.clicks} clicks at ${r.stats.clickAt.join(', ')}`);
  }
}
for (const song of songs) {
  if (!only || only === 'events') {
    console.log(`\n── ${song}: the player's sounds over the full band (stems, 80 ms from each onset: the attack) ──`);
    console.log('event    quality   hitK  hitPh  bright%  overBand(ph)  peak');
    const r = await page.evaluate((s) => window.__lab.offline.renderEvents(s), song);
    const by = {};
    for (const x of r.rows) {
      by[`${x.kind}:${x.q}`] = x;
      console.log(`${x.kind.padEnd(8)} ${x.q.padEnd(8)} ${p6(x.hitK)} ${p6(x.hitPhone)} ${p6(x.bright)}   ${p6(x.overPhone)}     ${p6(x.peakDb)}`);
      if (x.peakDb > -1) problems.push(`${song} ${x.kind} ${x.q}: peak ${f1(x.peakDb)}`);
    }
    for (const k of ['tap', 'pickup', 'strike']) {
      const g = by[`${k}:good`];
      const m = by[`${k}:miss`];
      if (g.hitPhone - m.hitPhone < 6) problems.push(`${song} ${k}: miss only ${f1(g.hitPhone - m.hitPhone)} dB under good (phone)`);
      if (k !== 'strike' && g.bright - m.bright < 8) problems.push(`${song} ${k}: miss not clearly duller (${f1(m.bright)}% vs ${f1(g.bright)}% above 2 kHz)`);
      if (g.overPhone < -4) problems.push(`${song} ${k}: good buried under the band on a phone (${f1(g.overPhone)} dB)`);
    }
  }
  if (!only || only === 'power') {
    console.log(`\n── ${song}: power 0 → 1, a miss (full band, intensity ${intensity}) ──`);
    const r = await page.evaluate(([s, w, i]) => window.__lab.offline.renderPower(s, { wav: w, intensity: i }), [song, !!wavDir, intensity]);
    save(`${song}-power`, r);
    console.log('stage              LUFS  phone  >3kHz(dB) width   peak');
    for (const x of r.segments) x.hfDb = x.lufs + 10 * Math.log10(Math.max(1e-3, x.hf) / 100);
    for (const x of r.segments) console.log(`${x.name.padEnd(16)} ${p6(x.lufs)} ${p6(x.phone)} ${p6(x.hfDb)}    ${p6(x.width)} ${p6(x.peakDb)}`);
    const s0 = r.segments[0];
    const s1 = r.segments[4];
    const s3 = r.segments[5];
    console.log(`power 1 − power 0: ${f1(s1.lufs - s0.lufs)} LU (phone ${f1(s1.phone - s0.phone)}), highs ${f1(s1.hfDb - s0.hfDb)} dB, width ${f1(s1.width - s0.width)} dB · after the miss ${f1(s3.lufs - s1.lufs)} LU · drop sting: ${f1(r.drop.before)} → ${f1(r.drop.after)} · whole peak ${f1(r.stats.peakDb)}, clicks ${r.stats.clicks}`);
    if (s1.lufs - s0.lufs < 3) problems.push(`${song}: power 1 only ${f1(s1.lufs - s0.lufs)} LU over power 0`);
    if (s1.lufs - s3.lufs < 1.5) problems.push(`${song}: losing power is not clear (${f1(s1.lufs - s3.lufs)} LU)`);
    if (r.stats.peakDb > -1) problems.push(`${song} power: peak ${f1(r.stats.peakDb)}`);
    if (r.stats.clicks) problems.push(`${song} power: ${r.stats.clicks} clicks at ${r.stats.clickAt.join(', ')}`);
  }
}
// v5: every boss fight inside its level's song (only with --only boss; --boss toad,crow picks some)
const ALL_BOSSES = ['toad', 'drumBeetle', 'crow', 'sandworm', 'croc', 'sphinx', 'yeti', 'siren', 'stag', 'salamander', 'magmaCrab', 'smith', 'gargoyle', 'organist', 'twin', 'bossBlot', 'bossScarab', 'bossMoth', 'bossGolem', 'silence', 'wyrm', 'djinn', 'aurora', 'phoenix', 'abyssKing'];
if (only === 'boss') {
  const list = opt('--boss', ALL_BOSSES.join(',')).split(',');
  console.log('\n── boss fights (full band at intensity 2, tells → parries / blows; mix LUFS (music alone) · peak · on chord / on scale) ──');
  for (const kind of list) {
    const r = await page.evaluate(([k, w]) => window.__lab.offline.renderBoss(k, { wav: w }), [kind, !!wavDir]);
    save(`boss-${kind}`, r);
    const segs = r.segments.map((x) => `${x.name.replace('song ', '')} ${f1(x.lufs)} (m ${f1(x.music)}) ${f1(x.peakDb)} ${(x.inChord * 100).toFixed(0)}%/${(x.inScale * 100).toFixed(0)}%`).join(' · ');
    console.log(`${kind.padEnd(11)} ${segs} · clicks ${r.stats.clicks} voices ${r.stats.maxVoices}`);
    const before = r.segments[0];
    const ph = r.segments.slice(1, -1);
    if (r.stats.peakDb > -1) problems.push(`${kind}: peak ${f1(r.stats.peakDb)}`);
    if (r.stats.clicks) problems.push(`${kind}: ${r.stats.clicks} clicks at ${r.stats.clickAt.join(', ')}`);
    for (const x of ph) {
      if (x.inScale < 0.75) problems.push(`${kind} ${x.name}: only ${(x.inScale * 100).toFixed(0)}% on the scale`);
      if (x.inChord < 0.6) problems.push(`${kind} ${x.name}: only ${(x.inChord * 100).toFixed(0)}% on chord tones`);
    }
    if (ph[0].lufs < before.lufs - 0.5) problems.push(`${kind}: the fight (${f1(ph[0].lufs)}) is quieter than the song (${f1(before.lufs)})`);
    if (ph.length > 1 && ph[ph.length - 1].music < ph[0].music + 1) problems.push(`${kind}: the last phase does not climb (music ${f1(ph[0].music)} → ${f1(ph[ph.length - 1].music)})`);
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
