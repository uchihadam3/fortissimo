#!/usr/bin/env node
/**
 * Real-time audio check (headless Chromium, a live AudioContext): the AudioAPI contract.
 *   - before unlock: performance.now() clock, consistent virtual song clock, silent no-ops
 *   - unlock is fast, the clock stays continuous, the pre-unlock song clock stays valid
 *   - same song → same clock; tower shots land exactly on the song grid (API time)
 *   - suspend freezes the clock, resume continues it
 *   - every API method survives garbage arguments; no page errors or [audio] warnings
 *   - output peak below −1 dBFS during a 24-tower battle
 * Usage: node tools/audio-check.mjs   (uses a Vite server on :5174 if running, else starts one)
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AUDIO_PORT ?? 5174);
const URL = `http://localhost:${PORT}/tools/audio-lab.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async () => {
  try {
    return (await fetch(URL)).ok;
  } catch {
    return false;
  }
};
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

const fails = [];
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok ' : '  FAIL'} ${msg}`);
  if (!cond) fails.push(msg);
};
const errors = [];
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || t.includes('[audio]')) errors.push(`${m.type()}: ${t}`);
  });
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__lab);
  const ev = (f, arg) => page.evaluate(f, arg);

  console.log('before unlock');
  const pre = await ev(async () => {
    const a = window.__lab.audio;
    const n0 = a.now();
    const p0 = performance.now() / 1000;
    const clockNull = a.songClock() === null;
    const c = a.playSong('menu');
    const same = JSON.stringify(a.songClock()) === JSON.stringify(c);
    a.setIntensity(2);
    a.towerShot('harp', 1, a.now() + 0.1, 0, 1);
    a.cinematic('intro:dawn');
    a.setAmbience('menu');
    a.setMuffle(0.3);
    a.setMuffle(0);
    a.setVolumes({ master: 1, music: 0.8, sfx: 0.9, ambience: 0.8 });
    await new Promise((r) => setTimeout(r, 200));
    const n1 = a.now();
    return { n0, p0, clockNull, c, same, dt: n1 - n0, ready: a.ready, latency: a.latency() };
  });
  ok(Math.abs(pre.n0 - pre.p0) < 0.01, `now() follows performance.now()/1000 before unlock (Δ ${(pre.n0 - pre.p0).toFixed(4)} s)`);
  ok(pre.clockNull, 'songClock() is null before any song');
  ok(pre.c.song === 'menu' && Math.abs(pre.c.t0 - (pre.n0 + 0.15)) < 0.02 && Math.abs(pre.c.spb - 60 / 92) < 1e-9 && pre.c.beatsPerBar === 4, `playSong before unlock returns a virtual clock (t0 = now+${(pre.c.t0 - pre.n0).toFixed(3)} s, spb ${pre.c.spb.toFixed(4)})`);
  ok(pre.same, 'songClock() reports that clock');
  ok(pre.dt > 0.15 && pre.dt < 0.4, `the fallback clock runs (${pre.dt.toFixed(3)} s in 200 ms)`);
  ok(!pre.ready && pre.latency === 0, 'not ready, latency 0 without audio');

  console.log('unlock');
  const un = await ev(async () => {
    const a = window.__lab.audio;
    const long = [];
    const obs = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) long.push(Math.round(e.duration));
    });
    obs.observe({ entryTypes: ['longtask'] });
    const before = a.now();
    const t0 = performance.now();
    await a.unlock();
    const ms = performance.now() - t0;
    const after = a.now();
    const clock = a.songClock();
    await new Promise((r) => setTimeout(r, 2500));
    obs.disconnect();
    const reads = [];
    for (let i = 0; i < 20; i++) {
      reads.push(a.now());
      await new Promise((r) => setTimeout(r, 15));
    }
    return { ms, before, after, jump: after - before - ms / 1000, clock, ready: a.ready, long, mono: reads.every((v, i) => i === 0 || v >= reads[i - 1]), latency: a.latency(), worker: window.__lab.debug()?.worker };
  });
  ok(un.ms < 250, `unlock took ${un.ms.toFixed(0)} ms`);
  ok(un.ready, 'ready after unlock');
  ok(Math.abs(un.jump) < 0.05, `clock continuous across unlock (jump ${(un.jump * 1000).toFixed(1)} ms)`);
  ok(un.clock && Math.abs(un.clock.t0 - pre.c.t0) < 1e-9, 'the pre-unlock song clock is still the song clock');
  ok(un.mono, 'now() is monotonic');
  ok(un.latency > 0 && un.latency < 0.5, `latency ${(un.latency * 1000).toFixed(1)} ms`);
  ok(!un.long.some((d) => d > 150), `no long main-thread tasks after unlock (${un.long.join(', ') || 'none'})`);
  ok(un.worker === true, 'instruments render in the inline worker');

  console.log('music');
  await ev(() => window.__lab.reset());
  await sleep(1500);
  const menuPeak = await ev(() => window.__lab.read().peak);
  ok(menuPeak > 0.01, `the menu (requested before unlock) is playing (peak ${menuPeak.toFixed(3)})`);
  const mus = await ev(async () => {
    const a = window.__lab.audio;
    const c1 = a.playSong('meadow', { fade: 1 });
    const now = a.now();
    const c2 = a.playSong('meadow');
    const c3 = a.songClock();
    a.setIntensity(2);
    return { c1, c2, c3, now };
  });
  ok(mus.c1.song === 'meadow' && Math.abs(mus.c1.t0 - (mus.now + 0.15)) < 0.03, 'battle song starts ≈0.15 s ahead');
  ok(JSON.stringify(mus.c1) === JSON.stringify(mus.c2) && JSON.stringify(mus.c2) === JSON.stringify(mus.c3), 'same song again → same clock');
  const at = await ev(() => {
    const a = window.__lab.audio;
    const t = a.now() + 2;
    return a.playSong('desert', { at: t, fade: 0.5 }).t0 === t;
  });
  ok(at, 'playSong({at}) anchors beat 0 at `at`');
  await ev(() => window.__lab.audio.playSong('meadow', { fade: 0.3 }));

  console.log('towers on the grid');
  const grid = await ev(async () => {
    const lab = window.__lab;
    const a = lab.audio;
    a.setIntensity(2);
    const d = lab.debug();
    d.towerLog(true);
    lab.towers(lab.offline.defaultArmy(24), 6);
    await new Promise((r) => setTimeout(r, 400));
    lab.reset();
    await new Promise((r) => setTimeout(r, 9000));
    const log = d.towerLog(false) ?? [];
    const c = a.songClock();
    const off = d.clock.offC;
    let maxErr = 0;
    let n = 0;
    for (const e of log) {
      if (e.kind === 'impact' || e.kind === 'death' || e.kind === 'coin' || e.kind === 'deflect') continue;
      const tApi = e.t + off;
      const k = (tApi - c.t0) / (c.spb / 4);
      maxErr = Math.max(maxErr, Math.abs(k - Math.round(k)) * (c.spb / 4));
      n++;
    }
    return { n, maxErr, read: lab.read(), started: d.started() };
  });
  ok(grid.n > 300, `${grid.n} tower voices scheduled`);
  ok(grid.maxErr < 1e-6, `every tower voice on the 16th grid (max error ${(grid.maxErr * 1e6).toFixed(3)} µs)`);
  ok(grid.read.peak < 0.891, `peak with 24 towers ${(20 * Math.log10(grid.read.peak)).toFixed(2)} dBFS (< −1)`);
  ok(grid.read.nan === 0, 'no NaN at the output');
  const voices = Object.values(grid.read.voices).reduce((s, v) => s + v, 0);
  ok(voices < 400, `active voices ${voices}`);

  console.log('suspend / resume');
  const sus = await ev(async () => {
    const a = window.__lab.audio;
    a.suspend();
    await new Promise((r) => setTimeout(r, 300));
    const x = a.now();
    await new Promise((r) => setTimeout(r, 400));
    const y = a.now();
    a.resume();
    await new Promise((r) => setTimeout(r, 400));
    const z = a.now();
    return { frozen: y - x, after: z - y, ready: a.ready };
  });
  ok(Math.abs(sus.frozen) < 0.01, `clock frozen while suspended (Δ ${(sus.frozen * 1000).toFixed(1)} ms)`);
  ok(sus.after > 0.2 && sus.ready, `clock runs again after resume (+${sus.after.toFixed(3)} s)`);

  console.log('every method, odd arguments');
  const bad = await ev(async () => {
    const a = window.__lab.audio;
    const thrown = [];
    const tryIt = (name, f) => {
      try {
        f();
      } catch (e) {
        thrown.push(`${name}: ${e}`);
      }
    };
    const t = a.now() + 0.1;
    const kinds = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass', 'nope'];
    for (const k of kinds) tryIt('towerShot ' + k, () => a.towerShot(k, NaN, t, undefined, -3));
    for (const k of kinds) tryIt('impact ' + k, () => a.impact(k, t, 9, Infinity));
    for (const e of ['blot', 'bossGolem', 'silence', 'xx']) tryIt('enemyDeath ' + e, () => a.enemyDeath(e, t, 0));
    tryIt('deflect', () => a.deflect(NaN, NaN));
    tryIt('coin', () => a.coin(t, 0, -5));
    tryIt('heartHit', () => a.heartHit(t, NaN));
    tryIt('heartHeal', () => a.heartHeal(NaN));
    tryIt('heartHeal ok', () => a.heartHeal(t));
    tryIt('build', () => a.build(t, 2));
    tryIt('upgrade', () => a.upgrade(t, 0, 99));
    tryIt('sell', () => a.sell(t, -2));
    tryIt('towerMuted', () => a.towerMuted(t, 0, true));
    tryIt('switchFlip', () => a.switchFlip(t, 0));
    tryIt('waveStart', () => a.waveStart(t, 7, 0));
    tryIt('bossAppear', () => a.bossAppear(t));
    tryIt('countIn', () => a.countIn(t, 17));
    tryIt('ffReady', () => a.ffReady());
    tryIt('ffUnleash', () => a.ffUnleash(t, t - 1));
    tryIt('star', () => a.star(-4));
    tryIt('newTower', () => a.newTower());
    tryIt('setIntensity', () => a.setIntensity(7));
    tryIt('duck', () => a.duck(NaN, -1));
    tryIt('setMuffle', () => a.setMuffle(5));
    tryIt('setMuffle0', () => a.setMuffle(0));
    tryIt('setVolumes', () => a.setVolumes({}));
    tryIt('setVolumes2', () => a.setVolumes({ master: 1, music: 0.8, sfx: 0.9, ambience: 0.8 }));
    tryIt('playSong bad', () => a.playSong('nope'));
    for (const p of ['meadow', 'desert', 'ice', 'forge', 'citadel', 'menu', 'none', 'zzz']) tryIt('setAmbience ' + p, () => a.setAmbience(p, NaN));
    for (const c of ['intro:dawn', 'map:unlock', 'map:world', 'world:restored', 'ending:bow', 'bogus']) tryIt('cinematic ' + c, () => a.cinematic(c));
    // v2: the band, movements, duets, plates, motifs, story moods
    tryIt('setBand garbage', () => a.setBand(null));
    tryIt('setBand {}', () => a.setBand({}));
    tryIt('setBand odd', () => a.setBand({ sections: { strings: NaN, low: -4, bells: 'x' }, harmony: 99, duets: ['march', 'nope', 3] }));
    tryIt('setBand ok', () => a.setBand({ sections: { strings: 2, percussion: 1, bells: 0, brass: 0, voices: 0, low: 1 }, harmony: 2, duets: ['groundwork'] }));
    tryIt('movement', () => a.movement(NaN, -1, NaN));
    tryIt('movement ok', () => a.movement(2, 5, a.now() + 1));
    for (const d of ['march', 'groundwork', 'shimmer', 'fanfare', 'hymn', 'serenade', 'groove', 'thunder', 'nope']) tryIt('duet ' + d, () => a.duet(d, t, NaN));
    tryIt('plateUnlock', () => a.plateUnlock(NaN, 7));
    for (const k of ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass', 'nope']) tryIt('joinMotif ' + k, () => a.joinMotif(k));
    for (const c of ['story:wonder', 'story:frozen', 'story:wake', 'story:join', 'story:threat', 'story:shard', 'story:voice', 'story:camp', 'story:memory', 'story:journey', 'story:dread', 'story:hush', 'story:comic', 'land:meadow', 'land:desert', 'land:ice', 'land:forge', 'land:citadel', 'land:nowhere']) tryIt('cinematic ' + c, () => a.cinematic(c));
    for (const e of ['scorpion', 'whirl', 'echo', 'wolf', 'ember', 'slug', 'mimic', 'knight', 'conductor']) tryIt('enemyDeath ' + e, () => a.enemyDeath(e, t, 0.3));
    for (const u of ['uiHover', 'uiClick', 'uiBack', 'uiOpen', 'uiDeny', 'achievement', 'save', 'studioSting', 'titleReveal', 'victory', 'defeat']) tryIt(u, () => a[u]());
    // v7: viradas (garbage, then a real one over the song, then one cancelled by a new cue)
    tryIt('viradaCue garbage', () => a.viradaCue(NaN, undefined, -3, 'x'));
    tryIt('viradaCue reversed', () => a.viradaCue(t + 2, t + 1, 6, 9));
    tryIt('viradaHit garbage', () => a.viradaHit(NaN, -1, NaN, 'bogus', Infinity));
    tryIt('viradaEnd garbage', () => a.viradaEnd(NaN, NaN, undefined, 'yes'));
    tryIt('virada', () => {
      const c = a.songClock();
      const spb = c ? c.spb : 0.6;
      const s0 = (c ? c.t0 + Math.ceil((a.now() + 0.2 - c.t0) / (4 * spb)) * 4 * spb : t) + 4 * spb;
      a.viradaCue(s0, s0 + 4 * spb, 6, 1);
      a.viradaCue(s0, s0 + 4 * spb, 6, 2);
      [1, 2, 2.5, 3, 3.5, 3.75].forEach((b, i) => a.viradaHit(i, 6, s0 + b * spb, i === 2 ? 'miss' : 'perfect', i / 3 - 1));
      a.viradaEnd(s0 + 4 * spb, 5, 6, false);
      a.viradaHit(0, 6, a.now() - 5, 'good', 0);
      a.viradaEnd(a.now() - 5, 6, 6, true);
    });
    tryIt('stopMusic', () => a.stopMusic(undefined));
    tryIt('songClock', () => a.songClock());
    await new Promise((r) => setTimeout(r, 2500));
    for (const s of ['menu', 'map', 'meadow', 'desert', 'ice', 'forge', 'citadel', 'boss', 'finale', 'credits', 'ending']) {
      tryIt('playSong ' + s, () => a.playSong(s, { fade: 0.2 }));
      tryIt('setIntensity', () => a.setIntensity(3));
      await new Promise((r) => setTimeout(r, 350));
    }
    tryIt('stopMusic', () => a.stopMusic(0.2));
    a.setAmbience('none');
    return thrown;
  });
  ok(bad.length === 0, `no method threw${bad.length ? ': ' + bad.join('; ') : ''}`);
  await sleep(1500);
  const end = await ev(() => ({ c: window.__lab.audio.songClock(), players: window.__lab.debug().players() }));
  ok(end.c === null, 'songClock() null after stopMusic');
} catch (e) {
  fails.push('script: ' + (e && e.stack ? e.stack : e));
} finally {
  await browser.close();
  if (server) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* gone */
    }
  }
}
const uniq = [...new Set(errors)];
for (const e of uniq.slice(0, 20)) console.log('  ERROR ' + e);
const total = fails.length + uniq.length;
console.log(total ? `\n${total} problem(s)` : '\nall checks passed');
process.exit(total ? 1 : 0);
