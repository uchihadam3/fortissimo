/**
 * Offline analysis (lab / tools only — the game never imports this): renders songs, cinematic
 * sequences and battle stress tests through an OfflineAudioContext, scheduling incrementally like
 * the real-time engine (suspend every 50 ms), and measures the result.
 */
import { SONGS, TOWERS, type EnemyKind, type SongId, type TowerKind } from '../../sim/defs';
import type { CinematicCue } from '../api';
import { Ambience, type Place } from './ambience';
import { Cinema } from './cinema';
import { Core } from './core';
import { LOOKAHEAD } from './engine';
import { Director, type TrackId } from './music';
import { Sfx } from './sfx';
import { makeTheme } from './songs';
import { BufferBank } from './synth';
import { Towers } from './towers';

export interface Stats {
  seconds: number;
  peakDb: number;
  rmsDb: number;
  /** integrated loudness (BS.1770-style K-weighting, gated) */
  lufs: number;
  /** loudest 3 s window (short-term) */
  stMax: number;
  /** quietest 3 s window after the first 3 s */
  stMin: number;
  /** longest run below −55 dBFS (s), ignoring the first second */
  silence: number;
  nan: number;
  clicks: number;
  /** times (s) of the first detected clicks */
  clickAt: number[];
  /** share of samples in the safety clipper's knee (|x| > −3.1 dBFS) */
  hot: number;
  /** share of energy above 6 kHz (harshness indicator) */
  hf: number;
  /** render time / audio time */
  load: number;
  /** short-term loudness every 4 s */
  windows: number[];
  maxVoices: number;
  started: number;
}

export interface Rig {
  ctx: OfflineAudioContext;
  core: Core;
  bank: BufferBank;
  director: Director;
  towers: Towers;
  sfx: Sfx;
  cine: Cinema;
  amb: Ambience;
  /** run fn once the render reaches context time `at` − lead */
  at(at: number, fn: () => void, lead?: number): void;
  render(): Promise<{ buf: AudioBuffer; ms: number; maxVoices: number }>;
}

export function makeRig(seconds: number, sr = 44100): Rig {
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const core = new Core(ctx, null);
  const bank = new BufferBank(core, null);
  bank.sync = true;
  const director = new Director(core, bank, makeTheme);
  const towers = new Towers(core, bank, director);
  const sfx = new Sfx(core, bank, director);
  const cine = new Cinema(core, bank, director);
  const amb = new Ambience(core, bank);
  const actions: { at: number; fn: () => void }[] = [];
  let maxVoices = 0;
  const step = 0.05;
  const run = () => {
    const now = ctx.currentTime;
    actions.sort((a, b) => a.at - b.at);
    while (actions.length && actions[0].at <= now + 0.001) {
      const a = actions.shift()!;
      try {
        a.fn();
      } catch (e) {
        console.warn('[audio] offline action', e);
      }
    }
    director.tick(LOOKAHEAD);
    cine.tick();
    amb.tick();
    let v = 0;
    for (const n of Object.values(core.voiceTable())) v += n;
    if (v > maxVoices) maxVoices = v;
  };
  for (let k = 1; k * step < seconds - 0.05; k++) {
    void ctx.suspend(k * step).then(() => {
      run();
      void ctx.resume();
    });
  }
  return {
    ctx, core, bank, director, towers, sfx, cine, amb,
    at(at: number, fn: () => void, lead = 0.15) {
      actions.push({ at: Math.max(0, at - lead), fn });
    },
    async render() {
      run();
      const t0 = performance.now();
      const buf = await ctx.startRendering();
      return { buf, ms: performance.now() - t0, maxVoices };
    },
  };
}

// ───────────────────────────── measurements ─────────────────────────────

class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private b0: number, private b1: number, private b2: number, private a1: number, private a2: number) {}
  static shelf(sr: number, f0: number, gainDb: number, q: number): Biquad {
    const A = Math.pow(10, gainDb / 40);
    const w = (2 * Math.PI * f0) / sr;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const a0 = A + 1 - (A - 1) * c + 2 * Math.sqrt(A) * al;
    return new Biquad(
      (A * (A + 1 + (A - 1) * c + 2 * Math.sqrt(A) * al)) / a0,
      (-2 * A * (A - 1 + (A + 1) * c)) / a0,
      (A * (A + 1 + (A - 1) * c - 2 * Math.sqrt(A) * al)) / a0,
      (2 * (A - 1 - (A + 1) * c)) / a0,
      (A + 1 - (A - 1) * c - 2 * Math.sqrt(A) * al) / a0,
    );
  }
  static hp(sr: number, f0: number, q: number): Biquad {
    const w = (2 * Math.PI * f0) / sr;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    return new Biquad((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0);
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

const db = (x: number) => 10 * Math.log10(x + 1e-12);

export function measure(buf: AudioBuffer, renderMs = 0, from = 0): Stats {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const start = Math.floor(from * sr);
  const n = L.length - start;
  let peak = 0;
  let sum = 0;
  let nan = 0;
  let hot = 0;
  let hfE = 0;
  // K-weighting per channel
  const kL = [Biquad.shelf(sr, 1681.97, 4, 0.7071), Biquad.hp(sr, 38.13, 0.5)];
  const kR = [Biquad.shelf(sr, 1681.97, 4, 0.7071), Biquad.hp(sr, 38.13, 0.5)];
  const hpL = Biquad.hp(sr, 6000, 0.7071);
  const blk = Math.floor(sr * 0.1);
  const ms: number[] = []; // K-weighted mean square per 100 ms block (L+R)
  const raw: number[] = []; // plain mean square per block
  let accK = 0;
  let accR = 0;
  let clicks = 0;
  const clickAt: number[] = [];
  let prevL = start > 0 ? L[start - 1] : 0;
  let localE = prevL * prevL;
  for (let i = 0; i < n; i++) {
    const l = L[start + i];
    const r = R[start + i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) {
      nan++;
      continue;
    }
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
    if (a > 0.7) hot++;
    sum += (l * l + r * r) / 2;
    let kl = l;
    for (const f of kL) kl = f.run(kl);
    let kr = r;
    for (const f of kR) kr = f.run(kr);
    accK += kl * kl + kr * kr;
    accR += (l * l + r * r) / 2;
    const h = hpL.run(l);
    hfE += h * h;
    // click: a large sample jump while the surrounding signal is quiet
    localE = localE * 0.995 + l * l * 0.005;
    if (Math.abs(l - prevL) > 0.2 && localE < 0.002) {
      clicks++;
      if (clickAt.length < 8) clickAt.push(Math.round(((start + i) / sr) * 1000) / 1000);
    }
    prevL = l;
    if ((i + 1) % blk === 0) {
      ms.push(accK / blk);
      raw.push(accR / blk);
      accK = 0;
      accR = 0;
    }
  }
  // integrated loudness: 400 ms blocks (4 × 100 ms), 75 % overlap, gates −70 / −10
  const blocks: number[] = [];
  for (let i = 0; i + 4 <= ms.length; i++) blocks.push((ms[i] + ms[i + 1] + ms[i + 2] + ms[i + 3]) / 4);
  const lk = (m: number) => -0.691 + db(m);
  const abs = blocks.filter((m) => lk(m) > -70);
  const meanAbs = abs.reduce((s, m) => s + m, 0) / Math.max(1, abs.length);
  const rel = abs.filter((m) => lk(m) > lk(meanAbs) - 10);
  const lufs = rel.length ? lk(rel.reduce((s, m) => s + m, 0) / rel.length) : -99;
  // short-term (3 s)
  const st: number[] = [];
  for (let i = 0; i + 30 <= ms.length; i += 5) {
    let s = 0;
    for (let k = 0; k < 30; k++) s += ms[i + k];
    st.push(lk(s / 30));
  }
  const windows: number[] = [];
  for (let i = 0; i + 40 <= ms.length; i += 40) {
    let s = 0;
    for (let k = 0; k < 40; k++) s += ms[i + k];
    windows.push(Math.round(lk(s / 40) * 10) / 10);
  }
  let silence = 0;
  let run = 0;
  raw.forEach((m, i) => {
    if (i < 10) return;
    if (db(m) < -55) {
      run++;
      silence = Math.max(silence, run);
    } else run = 0;
  });
  return {
    seconds: n / sr,
    peakDb: 20 * Math.log10(peak + 1e-12),
    rmsDb: db(sum / Math.max(1, n)),
    lufs,
    stMax: st.length ? Math.max(...st) : lufs,
    stMin: st.length > 6 ? Math.min(...st.slice(6)) : lufs,
    silence: silence * 0.1,
    nan,
    clicks,
    clickAt,
    hot: hot / Math.max(1, n),
    hf: hfE / Math.max(1e-12, sum),
    load: renderMs / 1000 / (n / sr),
    windows,
    maxVoices: 0,
    started: 0,
  };
}

/** 16-bit PCM WAV, base64 (to hand a render to Node). */
export function wavBase64(buf: AudioBuffer, from = 0, to = buf.duration): string {
  const sr = buf.sampleRate;
  const a = Math.floor(from * sr);
  const b = Math.min(buf.length, Math.floor(to * sr));
  const n = Math.max(0, b - a);
  const ch = buf.numberOfChannels;
  const bytes = new Uint8Array(44 + n * ch * 2);
  const dv = new DataView(bytes.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
  };
  w(0, 'RIFF');
  dv.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * ch * 2, true);
  dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true);
  w(36, 'data');
  dv.setUint32(40, n * ch * 2, true);
  const data = [buf.getChannelData(0), buf.getChannelData(Math.min(1, ch - 1))];
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][a + i] || 0));
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

// ───────────────────────────── scenarios ─────────────────────────────

export interface SongRender {
  stats: Stats;
  wav?: string;
}

/** A song at a fixed intensity (or an intensity plan [bar, level][]) for `seconds`. */
export async function renderSong(song: SongId, intensity: number | [number, number][], seconds: number, wav = false): Promise<SongRender> {
  const rig = makeRig(seconds);
  const t0 = 0.1;
  const p = rig.director.play(song as TrackId, t0, 0.05, typeof intensity === 'number' ? intensity : 0);
  if (p && Array.isArray(intensity)) {
    for (const [bar, lv] of intensity) rig.at(p.barStart(bar) - 0.3, () => p.setIntensity(lv, rig.ctx.currentTime), 0);
  }
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0.5);
  stats.maxVoices = r.maxVoices;
  stats.started = rig.core.started;
  return { stats, wav: wav ? wavBase64(r.buf) : undefined };
}

export const INTRO: [number, CinematicCue][] = [[0, 'intro:dawn'], [8, 'intro:festival'], [24, 'intro:approach'], [36, 'intro:shatter'], [38, 'intro:grey'], [54, 'intro:hope'], [70, 'intro:title']];
export const ENDING: [number, CinematicCue][] = [[0, 'ending:fall'], [6, 'ending:alone'], [26, 'ending:rest'], [36, 'ending:bloom'], [74, 'ending:bow']];

export interface CineRender {
  stats: Stats;
  /** per-segment loudness (cue → LUFS of the 2 s after it) */
  segments: Record<string, number>;
  /** the ending rest: RMS (dBFS) over the silent bar */
  restBarDb?: number;
  wav?: string;
}

export async function renderCinema(which: 'intro' | 'ending' | 'restored' | 'ending-song', wav = false): Promise<CineRender> {
  const plan = which === 'intro' ? INTRO : which === 'ending' ? ENDING : which === 'restored' ? ([[0.2, 'world:restored']] as [number, CinematicCue][]) : [];
  const seconds = which === 'intro' ? 82 : which === 'ending' || which === 'ending-song' ? 92 : 14;
  const rig = makeRig(seconds);
  const off = 0.2;
  if (which === 'restored') {
    const p = rig.director.play('meadow', 0.1, 0.05, 1);
    void p;
  }
  if (which === 'ending-song') rig.at(off, () => rig.cine.startEnding(), 0);
  for (const [s, cue] of plan) rig.at(off + s, () => rig.cine.cue(cue), 0);
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0);
  stats.maxVoices = r.maxVoices;
  stats.started = rig.core.started;
  const segments: Record<string, number> = {};
  for (const [s, cue] of plan.length ? plan : ENDING) {
    const a = Math.floor((off + s + 0.5) * r.buf.sampleRate);
    const b = Math.min(r.buf.length, a + Math.floor(3 * r.buf.sampleRate));
    const L = r.buf.getChannelData(0);
    let m = 0;
    for (let i = a; i < b; i++) m += L[i] * L[i];
    segments[cue] = Math.round(db(m / Math.max(1, b - a)) * 10) / 10;
  }
  let restBarDb: number | undefined;
  if (which === 'ending' || which === 'ending-song') {
    // the bar of silence: from rest + 0.75 s to rest + 0.7 + bar − 0.05
    const bar = (60 / 84) * 4;
    const a = Math.floor((off + 26 + 0.03 + 0.75) * r.buf.sampleRate);
    const b = Math.floor((off + 26 + 0.03 + 0.7 + bar - 0.05) * r.buf.sampleRate);
    const L = r.buf.getChannelData(0);
    let m = 0;
    let pk = 0;
    for (let i = a; i < b; i++) {
      m += L[i] * L[i];
      pk = Math.max(pk, Math.abs(L[i]));
    }
    restBarDb = Math.round(20 * Math.log10(pk + 1e-12) * 10) / 10;
  }
  return { stats, segments, restBarDb, wav: wav ? wavBase64(r.buf) : undefined };
}

export interface TowerSpec {
  kind: TowerKind;
  level: number;
  pan: number;
  voice: number;
}

/** a mixed army of towers (default: 24, three of every kind, mixed levels) */
export function defaultArmy(n = 24): TowerSpec[] {
  const kinds: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];
  const out: TowerSpec[] = [];
  for (let i = 0; i < n; i++) out.push({ kind: kinds[i % kinds.length], level: i % 3, pan: Math.sin(i * 2.3) * 0.9, voice: i + 1 });
  return out;
}

export interface StressRender {
  stats: Stats;
  shots: number;
  gridMaxErr: number;
  gridMeanErr: number;
  wav?: string;
}

/**
 * A battle: the song at intensity 2 then 3, towers firing on their patterns, impacts after their
 * flight, deaths and coins on the grid, a wave call, a boss entrance and an ff unleash.
 */
export async function renderStress(song: SongId, seconds: number, army: TowerSpec[] = defaultArmy(), wav = false, extras = true, o: { music?: boolean; trim?: number; intensity?: number; deaths?: boolean } = {}): Promise<StressRender> {
  const rig = makeRig(seconds);
  if (o.trim !== undefined) rig.towers.trim = o.trim;
  if (o.music === false) rig.core.setVolumes({ master: 1, music: 0, sfx: 0.9, ambience: 0.8 });
  const t0 = 0.2;
  const spb = 60 / SONGS[song].bpm;
  const sd = spb / 4;
  const barDur = spb * 4;
  const p = rig.director.play(song, t0, 0.05, o.intensity ?? 2);
  if (!p) throw new Error('no song');
  rig.towers.debugLog = [];
  const steps = Math.floor((seconds - t0 - 0.5) / sd);
  let shots = 0;
  for (const tw of army) {
    const lv = TOWERS[tw.kind].levels[tw.level];
    const pat = lv.pattern;
    for (let s = 0; s < steps; s++) {
      if (pat[s % pat.length] !== 'x') continue;
      const t = t0 + s * sd;
      shots++;
      rig.at(t, () => rig.towers.shot(tw.kind, tw.level, t, tw.pan, tw.voice), 0.15);
      if (lv.flight > 0) rig.at(t + lv.flight * sd, () => rig.towers.impact(tw.kind, t + lv.flight * sd, tw.pan, 0.7), 0.15);
    }
  }
  // deaths & coins on the grid
  const kinds: EnemyKind[] = ['blot', 'blotling', 'scurry', 'shell', 'moth', 'bubble', 'phantom', 'mender'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let s = 4; s < steps && o.deaths !== false; s += 2) {
    if (rnd() < 0.3) {
      const t = t0 + s * sd;
      const k = kinds[Math.floor(rnd() * kinds.length)];
      const pan = rnd() * 2 - 1;
      rig.at(t, () => rig.towers.enemyDeath(k, t, pan, (tt) => rig.sfx.bossDeath(tt)), 0.12);
      rig.at(t + 0.4, () => rig.towers.coin(t + 0.4, pan, 5), 0.05);
      if (rnd() < 0.2) rig.at(t, () => rig.towers.deflect(t, pan), 0.1);
    }
  }
  if (extras) {
    rig.at(p.barStart(2), () => rig.sfx.waveStart(p.barStart(2), 3, 6), 0.12);
    if (o.intensity === undefined) rig.at(p.barStart(4) - 0.3, () => p.setIntensity(3, rig.ctx.currentTime), 0);
    rig.at(p.barStart(5), () => rig.sfx.bossAppear(p.barStart(5)), 0.12);
    const ffBar = 8;
    if (seconds > p.barStart(ffBar + 3)) rig.at(p.barStart(ffBar), () => rig.sfx.ffUnleash(p.barStart(ffBar), p.barStart(ffBar + 1)), 0.15);
    rig.at(p.barStart(6) + spb, () => rig.sfx.heartHit(p.barStart(6) + spb, 0.4), 0.1);
  }
  void barDur;
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0.3);
  stats.maxVoices = r.maxVoices;
  stats.started = rig.core.started;
  const log = rig.towers.debugLog ?? [];
  let maxErr = 0;
  let sumErr = 0;
  for (const e of log) {
    if (e.kind === 'impact' || e.kind === 'death' || e.kind === 'coin' || e.kind === 'deflect') continue;
    const k = Math.round((e.t - t0) / sd);
    const err = Math.abs(e.t - (t0 + k * sd));
    maxErr = Math.max(maxErr, err);
    sumErr += err;
  }
  return { stats, shots, gridMaxErr: maxErr, gridMeanErr: sumErr / Math.max(1, log.length), wav: wav ? wavBase64(r.buf) : undefined };
}

/** Audio-domain grid check: lone crystal & shaker shots; measures when each onset actually sounds. */
export async function onsetTest(): Promise<{ expected: number[]; measuredMs: number[]; maxErrMs: number }> {
  const seconds = 13;
  const rig = makeRig(seconds);
  const spb = 60 / SONGS.meadow.bpm;
  const sd = spb / 4;
  const times: number[] = [];
  for (let k = 0; k < 10; k++) times.push(0.5 + k * 8 * sd + (k % 3) * sd);
  // sharp attacks (crystal zap, harp pluck); the expected offset is the master chain look-ahead (12 ms)
  times.forEach((t, k) => rig.at(t, () => rig.towers.shot(k % 2 ? 'harp' : 'crystal', 2, t, 0, 1), 0.15));
  const r = await rig.render();
  const L = r.buf.getChannelData(0);
  const sr = r.buf.sampleRate;
  const measured: number[] = [];
  for (const t of times) {
    // the onset = first sample that rises well above what was already ringing before t
    const a = Math.floor((t - 0.02) * sr);
    const s0 = Math.floor((t - 0.002) * sr);
    const b = Math.floor((t + 0.06) * sr);
    let pre = 0;
    for (let i = a; i < s0; i++) pre = Math.max(pre, Math.abs(L[i]));
    let pk = 0;
    for (let i = s0; i < b; i++) pk = Math.max(pk, Math.abs(L[i]));
    const thr = pre + 0.3 * Math.max(0, pk - pre);
    let on = s0;
    for (let i = s0; i < b; i++)
      if (Math.abs(L[i]) > thr) {
        on = i;
        break;
      }
    measured.push(Math.round(((on / sr - t) * 1000) * 100) / 100);
  }
  // relative to the 12 ms look-ahead of the master glue + limiter (the same for every sound)
  return { expected: times, measuredMs: measured, maxErrMs: Math.max(...measured.map((x) => Math.abs(x - 12))) };
}

/** An ambience place for `seconds`. */
export async function renderAmbience(place: Place, seconds: number, wav = false): Promise<SongRender> {
  const rig = makeRig(seconds);
  rig.amb.setPlace(place, 1);
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 1);
  stats.maxVoices = r.maxVoices;
  return { stats, wav: wav ? wavBase64(r.buf) : undefined };
}

/** One-shot sfx / stinger renders (name → code), for levels and exceptions. */
export async function renderSfx(name: string, seconds: number, wav = false): Promise<SongRender> {
  const rig = makeRig(seconds);
  const s = rig.sfx;
  const t = 0.3;
  const fns: Record<string, () => void> = {
    studioSting: () => s.studioSting(),
    titleReveal: () => s.titleReveal(),
    victory: () => s.victory(),
    defeat: () => s.defeat(),
    newTower: () => s.newTower(),
    star: () => { s.star(0); },
    stars: () => { s.star(0); },
    waveStart: () => s.waveStart(t + 0.1, 5, 6),
    bossAppear: () => s.bossAppear(t + 0.1),
    ffReady: () => s.ffReady(),
    ffUnleash: () => s.ffUnleash(t + 0.1, t + 0.1 + 2.4),
    build: () => s.build(t + 0.1, 0),
    upgrade: () => s.upgrade(t + 0.1, 0, 2),
    sell: () => s.sell(t + 0.1, 0),
    muted: () => { s.towerMuted(t + 0.1, 0, true); s.towerMuted(t + 1, 0, false); },
    switchFlip: () => s.switchFlip(t + 0.1, 0),
    heartHit: () => s.heartHit(t + 0.1, 0.2),
    countIn: () => { for (let k = 0; k < 4; k++) s.countIn(t + 0.1 + k * 0.6, k); },
    ui: () => { s.uiHover(); s.uiClick(); s.uiBack(); s.uiOpen(); s.uiDeny(); s.achievement(); s.save(); },
  };
  const fn = fns[name];
  if (!fn) throw new Error(`no sfx ${name}`);
  rig.at(t, fn, 0);
  if (name === 'stars') {
    rig.at(t + 0.7, () => s.star(1), 0);
    rig.at(t + 1.4, () => s.star(2), 0);
  }
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0);
  stats.maxVoices = r.maxVoices;
  return { stats, wav: wav ? wavBase64(r.buf) : undefined };
}
