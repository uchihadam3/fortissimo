/**
 * Offline analysis (lab / tools only — the game never imports this): renders songs, cinematic
 * sequences and battle stress tests through an OfflineAudioContext, scheduling incrementally like
 * the real-time engine (suspend every 50 ms), and measures the result.
 */
import { SECTION_OF, SONGS, TOWERS, type DuetId, type EnemyKind, type Section, type SongId, type TowerKind, type WorldId } from '../../sim/defs';
import type { BandMix, CinematicCue } from '../api';
import { Ambience, type Place } from './ambience';
import { Cinema } from './cinema';
import { Core } from './core';
import { LOOKAHEAD } from './engine';
import { Motifs } from './motifs';
import { Rhythm, type TapQuality } from './rhythm';
import { bossSpec } from './songs/bossfight';
import { cleanBand, Director, type Player, type TrackId } from './music';
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
  /** octave-band levels (dB relative to the loudest band) at 63 125 250 500 1k 2k 4k 8k Hz */
  bands: number[];
  /** short-term loudness every 4 s */
  windows: number[];
  maxVoices: number;
  started: number;
  /** peak active voices per category (pad, strings, lead, tower, music…) */
  cats?: Record<string, number>;
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
  motifs: Motifs;
  rhythm: Rhythm;
  /** run fn once the render reaches context time `at` − lead */
  at(at: number, fn: () => void, lead?: number): void;
  render(): Promise<{ buf: AudioBuffer; ms: number; maxVoices: number; cats: Record<string, number> }>;
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
  const motifs = new Motifs(core, bank, director);
  const rhythm = new Rhythm(core, bank, director);
  const actions: { at: number; fn: () => void }[] = [];
  let maxVoices = 0;
  const cats: Record<string, number> = {};
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
    for (const [k, n] of Object.entries(core.voiceTable())) {
      v += n;
      if (n > (cats[k] ?? 0)) cats[k] = n;
    }
    if (v > maxVoices) maxVoices = v;
  };
  for (let k = 1; k * step < seconds - 0.05; k++) {
    void ctx.suspend(k * step).then(() => {
      run();
      void ctx.resume();
    });
  }
  return {
    ctx, core, bank, director, towers, sfx, cine, amb, motifs, rhythm,
    at(at: number, fn: () => void, lead = 0.15) {
      actions.push({ at: Math.max(0, at - lead), fn });
    },
    async render() {
      run();
      const t0 = performance.now();
      const buf = await ctx.startRendering();
      return { buf, ms: performance.now() - t0, maxVoices, cats };
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
  static lp(sr: number, f0: number, q: number): Biquad {
    const w = (2 * Math.PI * f0) / sr;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    return new Biquad((1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0);
  }
  static bp(sr: number, f0: number, q: number): Biquad {
    const w = (2 * Math.PI * f0) / sr;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    return new Biquad(al / a0, 0, -al / a0, (-2 * c) / a0, (1 - al) / a0);
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
    bands: octaves(buf, from, buf.duration),
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
/** the v2 cutscenes are re-timed (≈100 s opening, ≈120 s ending): the moods must sustain through any timing */
export const INTRO2: [number, CinematicCue][] = [[0, 'intro:dawn'], [11, 'intro:festival'], [34, 'intro:approach'], [47, 'intro:shatter'], [49.5, 'intro:grey'], [67, 'intro:hope'], [88, 'intro:title']];
export const ENDING2: [number, CinematicCue][] = [[0, 'ending:fall'], [9, 'ending:alone'], [36, 'ending:rest'], [47, 'ending:bloom'], [104, 'ending:bow']];

export interface CineRender {
  stats: Stats;
  /** per-segment loudness (cue → LUFS of the 2 s after it) */
  segments: Record<string, number>;
  /** the ending rest: RMS (dBFS) over the silent bar */
  restBarDb?: number;
  wav?: string;
}

export async function renderCinema(which: 'intro' | 'ending' | 'intro2' | 'ending2' | 'restored' | 'ending-song', wav = false): Promise<CineRender> {
  const plan = which === 'intro' ? INTRO : which === 'ending' ? ENDING : which === 'intro2' ? INTRO2 : which === 'ending2' ? ENDING2 : which === 'restored' ? ([[0.2, 'world:restored']] as [number, CinematicCue][]) : [];
  const seconds = which === 'intro' ? 82 : which === 'intro2' ? 102 : which === 'ending2' ? 124 : which === 'ending' || which === 'ending-song' ? 92 : 14;
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
  if (which === 'ending' || which === 'ending-song' || which === 'ending2') {
    // the bar of silence: from rest + 0.75 s to rest + 0.7 + bar − 0.05
    const bar = (60 / 84) * 4;
    const restAt = (plan.find(([, c]) => c === 'ending:rest') ?? [26])[0];
    const a = Math.floor((off + restAt + 0.03 + 0.75) * r.buf.sampleRate);
    const b = Math.floor((off + restAt + 0.03 + 0.7 + bar - 0.05) * r.buf.sampleRate);
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
    heartHeal: () => s.heartHeal(t + 0.1),
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


// ───────────────────────────── long-form journeys ─────────────────────────────

/** One scripted moment of a journey (bars are bar indices of the song; fractions allowed). */
export interface JourneyEvent {
  bar: number;
  intensity?: number;
  /** movement [index, total]; `late` = announced only 0.1 s ahead (like the game's event stream) */
  movement?: [number, number];
  late?: boolean;
  /** sections present (counts); harmony = distinct − 1 */
  band?: Partial<Record<Section, number>>;
  duets?: DuetId[];
  /** the towers firing from this bar on (null: none) */
  towers?: TowerSpec[] | null;
  plate?: boolean;
  duet?: DuetId;
  join?: TowerKind;
}

export interface Segment {
  name: string;
  from: number;
  to: number;
}

export interface SegmentStats {
  name: string;
  lufs: number;
  peakDb: number;
  /** share of pitched energy on chord tones of the song's harmony (0..1) */
  inChord: number;
  /** share of pitched energy on the notes of the movement's scale */
  inScale: number;
  /** energy share per band: sub <90 Hz · low 90–300 · lowmid 300–1k · mid 1–3k · high 3–8k · air >8k */
  bands: number[];
}

export function bandOf(secs: Partial<Record<Section, number>>, duets: DuetId[] = []): BandMix {
  const sections = { strings: 0, percussion: 0, bells: 0, brass: 0, voices: 0, low: 0, ...secs };
  return cleanBand({ sections, duets, harmony: Object.values(sections).filter((v) => v > 0).length - 1 });
}

export const OCTAVES = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

/** octave-band levels of [a, b) seconds in dB relative to the loudest band (a 4th-order band-pass per octave) */
export function octaves(buf: AudioBuffer, a: number, b: number): number[] {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const i0 = Math.max(0, Math.floor(a * sr));
  const i1 = Math.min(L.length, Math.floor(b * sr));
  const flt = OCTAVES.map((f) => [Biquad.bp(sr, f, 1.41), Biquad.bp(sr, f, 1.41)]);
  const e = new Array(OCTAVES.length).fill(0);
  const stride = 2;
  for (let i = i0; i < i1; i++) {
    const x = (L[i] + R[i]) * 0.5;
    for (let k = 0; k < OCTAVES.length; k++) {
      const y = flt[k][1].run(flt[k][0].run(x));
      if (i % stride === 0) e[k] += y * y;
    }
  }
  const mx = Math.max(...e, 1e-20);
  return e.map((v) => Math.round(10 * Math.log10((v + 1e-20) / mx)));
}

/** energy shares per frequency band of [a, b) seconds (cumulative high-passes, differenced) */
export function bandShares(buf: AudioBuffer, a: number, b: number): number[] {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const i0 = Math.max(0, Math.floor(a * sr));
  const i1 = Math.min(L.length, Math.floor(b * sr));
  const cuts = [90, 300, 1000, 3000, 8000];
  const hps = cuts.map((f) => [Biquad.hp(sr, f, 0.7071), Biquad.hp(sr, f, 0.7071)]);
  const e = new Array(cuts.length + 1).fill(0);
  for (let i = i0; i < i1; i++) {
    const x = (L[i] + R[i]) * 0.5;
    e[0] += x * x;
    for (let k = 0; k < cuts.length; k++) {
      const y = hps[k][1].run(hps[k][0].run(x));
      e[k + 1] += y * y;
    }
  }
  const out: number[] = [];
  for (let k = 0; k <= cuts.length; k++) out.push(Math.max(0, e[k] - (k < cuts.length ? e[k + 1] : 0)));
  const tot = out.reduce((s2, v) => s2 + v, 0) || 1;
  return out.map((v) => Math.round((v / tot) * 1000) / 1000);
}

/**
 * Pitch-class energy of each beat of [fromBar, toBar) compared with the harmony the player reports
 * for that beat: the share on chord tones and on the scale (a consonance check of the whole mix).
 */
export function harmonyCheck(buf: AudioBuffer, p: Player, fromBar: number, toBar: number): { inChord: number; inScale: number; worst: { bar: number; beat: number; share: number }[] } {
  const sr0 = buf.sampleRate;
  const dec = 4;
  const sr = sr0 / dec;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const mono = new Float32Array(Math.floor(L.length / dec));
  for (let i = 0; i < mono.length; i++) {
    let s2 = 0;
    for (let k = 0; k < dec; k++) s2 += L[i * dec + k] + R[i * dec + k];
    mono[i] = s2 / (2 * dec);
  }
  const midis: number[] = [];
  for (let m = 40; m <= 96; m++) midis.push(m);
  let wc = 0;
  let ws = 0;
  let wt = 0;
  const per: { bar: number; beat: number; share: number }[] = [];
  for (let bar = fromBar; bar < toBar; bar++) {
    for (let beat = 0; beat < p.theme.beats; beat++) {
      const t = p.barStart(bar) + beat * p.spb;
      const a = Math.floor((t + 0.04) * sr);
      const b2 = Math.floor((t + p.spb - 0.01) * sr);
      if (b2 >= mono.length || a < 0) continue;
      const pcE = new Array(12).fill(0);
      for (const m of midis) {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        const w = (2 * Math.PI * f) / sr;
        const cw = 2 * Math.cos(w);
        let s1 = 0;
        let s0 = 0;
        for (let i = a; i < b2; i++) {
          const y = mono[i] + cw * s1 - s0;
          s0 = s1;
          s1 = y;
        }
        const pw = s1 * s1 + s0 * s0 - cw * s1 * s0;
        pcE[m % 12] += pw;
      }
      const c = p.chordAtTime(t + p.spb * 0.5);
      const k = p.keyAtTime(t + p.spb * 0.5);
      const tot = pcE.reduce((s2, v) => s2 + v, 0);
      if (tot <= 0) continue;
      let inC = 0;
      let inS = 0;
      for (let pc = 0; pc < 12; pc++) {
        if (c.pcs.includes(pc)) inC += pcE[pc];
        if (k.has(pc + 60)) inS += pcE[pc];
      }
      wc += inC;
      ws += inS;
      wt += tot;
      per.push({ bar, beat, share: Math.round((inC / tot) * 100) / 100 });
    }
  }
  per.sort((x, y) => x.share - y.share);
  return { inChord: wt ? Math.round((wc / wt) * 1000) / 1000 : 0, inScale: wt ? Math.round((ws / wt) * 1000) / 1000 : 0, worst: per.slice(0, 6) };
}

/** LUFS and peak of [a, b) seconds */
export function measureRange(buf: AudioBuffer, a: number, b: number): { lufs: number; peakDb: number } {
  const sr = buf.sampleRate;
  const i0 = Math.max(0, Math.floor(a * sr));
  const i1 = Math.min(buf.length, Math.floor(b * sr));
  const n = Math.max(1, i1 - i0);
  const ctxLike = { sampleRate: sr, length: n, numberOfChannels: buf.numberOfChannels, getChannelData: (c: number) => buf.getChannelData(c).subarray(i0, i1), duration: n / sr } as unknown as AudioBuffer;
  const s2 = measure(ctxLike, 0, 0);
  return { lufs: s2.lufs, peakDb: s2.peakDb };
}

export interface JourneyRender {
  stats: Stats;
  segments: SegmentStats[];
  shots: number;
  /** the plan / mode of every bar (state machine trace) */
  trace: string[];
  wav?: string;
}

/**
 * A long-form journey: the song with a script of intensity changes, movements, band changes and
 * towers firing on their patterns (like the game), measured per segment.
 */
export async function renderJourney(song: SongId, bars: number, events: JourneyEvent[], segments: Segment[] = [], o: { wav?: boolean; deaths?: boolean; harmony?: boolean; mute?: string[]; solo?: string[]; towers?: boolean } = {}): Promise<JourneyRender> {
  const spb = 60 / SONGS[song].bpm;
  const barDur = spb * 4;
  const t0 = 0.2;
  const seconds = t0 + bars * barDur + 1.5;
  const rig = makeRig(seconds);
  const p = rig.director.play(song, t0, 0.05, 0);
  if (!p) throw new Error('no song');
  const sd = spb / 4;
  for (const [name, ch] of p.channels) if ((o.mute && o.mute.includes(name)) || (o.solo && !o.solo.includes(name))) ch.input.gain.value = 0;
  if (o.towers === false) rig.core.towerBus.gain.value = 0;
  let shots = 0;
  const sorted = [...events].sort((a, b) => a.bar - b.bar);
  // the towers active per bar
  const armyAt: (TowerSpec[] | null)[] = [];
  let cur: TowerSpec[] | null = null;
  let ei = 0;
  for (let bar = 0; bar < bars; bar++) {
    while (ei < sorted.length && sorted[ei].bar <= bar) {
      if (sorted[ei].towers !== undefined) cur = sorted[ei].towers ?? null;
      ei++;
    }
    armyAt.push(cur);
  }
  for (const e of sorted) {
    const tb = p.barStart(e.bar);
    if (e.intensity !== undefined) rig.at(tb - 0.3, () => p.setIntensity(e.intensity!, rig.ctx.currentTime), 0);
    if (e.band || e.duets) {
      const mix = bandOf(e.band ?? {}, e.duets ?? []);
      rig.at(tb - 0.3, () => {
        rig.director.setBand(mix);
        rig.towers.setBand(mix);
      }, 0);
    }
    if (e.movement) rig.at(tb - (e.late ? 0.09 : 2.5), () => rig.director.movement(e.movement![0], e.movement![1], tb), 0);
    if (e.plate) rig.at(tb, () => rig.motifs.plateUnlock(tb, 0.3), 0.1);
    if (e.duet) rig.at(tb, () => rig.motifs.duet(e.duet!, tb, -0.2), 0.1);
    if (e.join) rig.at(tb, () => rig.motifs.join(e.join!), 0.15);
  }
  for (let bar = 0; bar < bars; bar++) {
    const army = armyAt[bar];
    if (!army) continue;
    for (const tw of army) {
      const lv = TOWERS[tw.kind].levels[tw.level];
      const pat = lv.pattern;
      for (let s = 0; s < 16; s++) {
        const step = bar * 16 + s;
        if (pat[step % pat.length] !== 'x') continue;
        const t = t0 + step * sd;
        shots++;
        rig.at(t, () => rig.towers.shot(tw.kind, tw.level, t, tw.pan, tw.voice), 0.1);
        if (lv.flight > 0) rig.at(t + lv.flight * sd, () => rig.towers.impact(tw.kind, t + lv.flight * sd, tw.pan, 0.7), 0.1);
      }
    }
    if (o.deaths !== false && army.length) {
      const kinds: EnemyKind[] = ['blot', 'scurry', 'scorpion', 'whirl', 'echo', 'wolf', 'ember', 'slug', 'mimic', 'knight', 'conductor', 'moth'];
      for (const s of [3, 7, 11]) {
        if ((bar * 7 + s) % 3 !== 0) continue;
        const t = t0 + (bar * 16 + s) * sd;
        const k = kinds[(bar + s) % kinds.length];
        rig.at(t, () => rig.towers.enemyDeath(k, t, ((bar % 5) - 2) / 2, (tt) => rig.sfx.bossDeath(tt)), 0.1);
        rig.at(t + 0.3, () => rig.towers.coin(t + 0.3, 0, 4), 0.05);
      }
    }
  }
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0.3);
  stats.maxVoices = r.maxVoices;
  stats.started = rig.core.started;
  stats.cats = r.cats;
  const segs: SegmentStats[] = [];
  for (const sg of segments) {
    const a = p.barStart(sg.from);
    const b = p.barStart(sg.to);
    const m = measureRange(r.buf, a, b);
    const h = o.harmony === false ? { inChord: 0, inScale: 0 } : harmonyCheck(r.buf, p, sg.from, sg.to);
    segs.push({ name: sg.name, lufs: Math.round(m.lufs * 10) / 10, peakDb: Math.round(m.peakDb * 10) / 10, inChord: h.inChord, inScale: h.inScale, bands: octaves(r.buf, a, b) });
  }
  const theme = p.theme as unknown as { state?: (bar: number, pl: Player) => { plan: number; mode: string; pos: number; brk: number; brkN: number } ; info?: (s: unknown) => { sec: string; i: number } };
  const trace: string[] = [];
  if (theme.state && theme.info) {
    for (let bar = 0; bar < bars; bar++) {
      const st = theme.state(bar, p);
      const f = theme.info(st);
      trace.push(`${bar}:${st.mode === 'break' ? 'k' : 'b'}${st.plan}${f.sec}${f.i}`);
    }
  }
  return { stats, segments: segs, shots, trace, wav: o.wav ? wavBase64(r.buf) : undefined };
}

/** the standard long-form test: a 5-movement journey whose band grows from the harp to the full band */
export function standardJourney(full = false): { bars: number; events: JourneyEvent[]; segments: Segment[] } {
  const harp: TowerSpec = { kind: 'harp', level: 0, pan: -0.3, voice: 1 };
  const army = (n: number): TowerSpec[] => defaultArmy(n);
  const events: JourneyEvent[] = [
    { bar: 0, intensity: 0, band: full ? { strings: 1, percussion: 2, bells: 2, brass: 1, voices: 1, low: 1 } : { strings: 1 }, movement: [0, 5] },
    { bar: 6, intensity: 1, towers: full ? army(16) : [harp] },
    { bar: 14, intensity: 2, band: full ? undefined : { strings: 1, percussion: 1 }, towers: full ? army(16) : [harp, { kind: 'drum', level: 0, pan: 0.2, voice: 2 }] },
    { bar: 22, intensity: 0, towers: null },
    { bar: 30, movement: [1, 5], intensity: 1, band: full ? undefined : { strings: 1, percussion: 1, bells: 1 }, towers: full ? army(20) : [harp, { kind: 'drum', level: 1, pan: 0.2, voice: 2 }, { kind: 'bell', level: 0, pan: 0.5, voice: 3 }] },
    { bar: 40, intensity: 0, towers: null },
    { bar: 48, movement: [2, 5], late: true, intensity: 2, band: full ? undefined : { strings: 2, percussion: 1, bells: 1, brass: 1 }, towers: full ? army(24) : army(8) },
    { bar: 58, intensity: 0, towers: null },
    { bar: 64, movement: [3, 5], intensity: 1, band: full ? undefined : { strings: 2, percussion: 1, bells: 1, brass: 1, voices: 1 }, towers: army(full ? 24 : 12) },
    { bar: 74, intensity: 0, towers: null },
    { bar: 82, movement: [4, 5], intensity: 3, band: { strings: 2, percussion: 2, bells: 2, brass: 1, voices: 1, low: 1 }, towers: army(24) },
    { bar: 96, intensity: 0, towers: null },
  ];
  const segments: Segment[] = [
    { name: 'm0 calm', from: 0, to: 6 },
    { name: 'm0 wave', from: 6, to: 14 },
    { name: 'm0 heavy', from: 14, to: 22 },
    { name: 'breath1', from: 23, to: 30 },
    { name: 'm1 wave', from: 30, to: 40 },
    { name: 'breath2', from: 41, to: 48 },
    { name: 'm2 heavy', from: 49, to: 58 },
    { name: 'breath3', from: 59, to: 64 },
    { name: 'm3 wave', from: 64, to: 74 },
    { name: 'breath4', from: 75, to: 82 },
    { name: 'm4 climax', from: 82, to: 96 },
    { name: 'end calm', from: 97, to: 104 },
  ];
  return { bars: 104, events, segments };
}


// ───────────────────────────── moods, motifs, duets ─────────────────────────────

export interface CueRender {
  stats: Stats;
  inChord: number;
  inScale: number;
  octaves: number[];
  wav?: string;
}

/**
 * One cinematic cue in a land for `seconds` (moods sustain: the render shows whether they keep
 * evolving); optionally a joinMotif `joinAt` seconds in. Consonance is measured against the mood's
 * own harmony.
 */
export async function renderCue(cue: CinematicCue, world: WorldId | null, seconds: number, o: { join?: TowerKind; joinAt?: number; wav?: boolean } = {}): Promise<CueRender> {
  const rig = makeRig(seconds);
  rig.director.world = world;
  rig.at(0.2, () => rig.cine.cue(cue), 0);
  if (o.join) rig.at(o.joinAt ?? 4, () => rig.motifs.join(o.join!), 0);
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0.3);
  stats.maxVoices = r.maxVoices;
  stats.started = rig.core.started;
  stats.cats = r.cats;
  const p = rig.director.current ?? rig.director.last;
  let h = { inChord: 0, inScale: 0 };
  if (p) {
    const b0 = Math.max(0, p.barAt(1));
    const b1 = Math.max(b0 + 1, p.barAt(seconds - 0.5));
    h = harmonyCheck(r.buf, p, b0, b1);
  }
  return { stats, inChord: h.inChord, inScale: h.inScale, octaves: octaves(r.buf, 0.5, r.buf.duration), wav: o.wav ? wavBase64(r.buf) : undefined };
}

/** every musician's motif over a mood (default story:join), one after the other */
export async function renderMotifs(world: WorldId | null = null, cue: CinematicCue = 'story:join', wav = false): Promise<{ stats: Stats; each: { kind: TowerKind; lufs: number; peakDb: number }[]; wav?: string }> {
  const kinds: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];
  const gap = 7;
  const seconds = 1.5 + kinds.length * gap;
  const rig = makeRig(seconds);
  rig.director.world = world;
  rig.at(0.2, () => rig.cine.cue(cue), 0);
  kinds.forEach((k, i) => rig.at(1.5 + i * gap, () => rig.motifs.join(k), 0));
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0.3);
  stats.maxVoices = r.maxVoices;
  const each = kinds.map((kind, i) => {
    const m = measureRange(r.buf, 1.5 + i * gap, 1.5 + i * gap + 5);
    return { kind, lufs: Math.round(m.lufs * 10) / 10, peakDb: Math.round(m.peakDb * 10) / 10 };
  });
  return { stats, each, wav: wav ? wavBase64(r.buf) : undefined };
}

/** every duet flourish and a plate chime over a battle song at intensity 1 */
export async function renderDuets(song: SongId = 'meadow', wav = false): Promise<{ stats: Stats; each: { id: string; lufs: number; peakDb: number }[]; wav?: string }> {
  const ids: (DuetId | 'plate')[] = ['march', 'groundwork', 'shimmer', 'fanfare', 'hymn', 'serenade', 'groove', 'thunder', 'plate'];
  const spb = 60 / SONGS[song].bpm;
  const bar = 4 * spb;
  const seconds = 1 + ids.length * 2 * bar + 1;
  const rig = makeRig(seconds);
  const p = rig.director.play(song, 0.2, 0.05, 1);
  if (!p) throw new Error('no song');
  ids.forEach((id, i) => {
    const t = p.barStart(1 + i * 2);
    rig.at(t, () => (id === 'plate' ? rig.motifs.plateUnlock(t, 0.3) : rig.motifs.duet(id, t, -0.3)), 0.12);
  });
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0.3);
  const each = ids.map((id, i) => {
    const a = p.barStart(1 + i * 2);
    const m = measureRange(r.buf, a, a + bar);
    return { id, lufs: Math.round(m.lufs * 10) / 10, peakDb: Math.round(m.peakDb * 10) / 10 };
  });
  return { stats, each, wav: wav ? wavBase64(r.buf) : undefined };
}

/** every new creature's death sound over a song (towers silent) */
export async function renderDeaths(song: SongId = 'desert', wav = false): Promise<{ stats: Stats; wav?: string }> {
  const kinds: EnemyKind[] = ['scorpion', 'whirl', 'echo', 'wolf', 'ember', 'slug', 'mimic', 'knight', 'conductor', 'blot', 'obelisk', 'bossScarab'];
  const seconds = 2 + kinds.length * 1.2 + 3;
  const rig = makeRig(seconds);
  const p = rig.director.play(song, 0.2, 0.05, 1);
  if (!p) throw new Error('no song');
  kinds.forEach((k, i) => {
    const t = 1 + i * 1.2;
    rig.at(t, () => rig.towers.enemyDeath(k, t, ((i % 5) - 2) / 2, (tt) => rig.sfx.bossDeath(tt)), 0.1);
  });
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0.3);
  return { stats, wav: wav ? wavBase64(r.buf) : undefined };
}

// ───────────────────────────── tower balance (v3) ─────────────────────────────

/** a 2nd-order low-pass (RBJ) */
function lpq(sr: number, f0: number): Biquad {
  return Biquad.lp(sr, f0, 0.7071);
}

/**
 * Mono weighted copies of a render: K-weighting (loudness) and a phone-speaker model (a small
 * speaker gives almost nothing below ~420 Hz and rolls off above ~10 kHz; 4th-order slopes, plus
 * the K-weighting presence shelf). Also the stereo energy (side / mid).
 */
function weighted(buf: AudioBuffer): { k: Float32Array; phone: Float32Array; side: number; mid: number } {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = L.length;
  const k = new Float32Array(n);
  const phone = new Float32Array(n);
  const kf = [Biquad.shelf(sr, 1681.97, 4, 0.7071), Biquad.hp(sr, 38.13, 0.5)];
  const pf = [Biquad.hp(sr, 420, 0.7071), Biquad.hp(sr, 420, 0.7071), Biquad.shelf(sr, 1681.97, 4, 0.7071), lpq(sr, 10000), lpq(sr, 10000)];
  let side = 0;
  let mid = 0;
  for (let i = 0; i < n; i++) {
    const x = (L[i] + R[i]) * 0.5;
    const s = (L[i] - R[i]) * 0.5;
    side += s * s;
    mid += x * x;
    let y = x;
    for (const f of kf) y = f.run(y);
    k[i] = y;
    let z = x;
    for (const f of pf) z = f.run(z);
    phone[i] = z;
  }
  return { k, phone, side, mid };
}

/** gated integrated loudness (BS.1770 gates) of a weighted mono signal over [a, b) s */
function gatedLoudness(x: Float32Array, sr: number, a: number, b: number): number {
  const blk = Math.floor(sr * 0.1);
  const i0 = Math.max(0, Math.floor(a * sr));
  const i1 = Math.min(x.length, Math.floor(b * sr));
  const ms: number[] = [];
  for (let i = i0; i + blk <= i1; i += blk) {
    let s = 0;
    for (let j = i; j < i + blk; j++) s += x[j] * x[j];
    ms.push((2 * s) / blk);
  }
  const blocks: number[] = [];
  for (let i = 0; i + 4 <= ms.length; i++) blocks.push((ms[i] + ms[i + 1] + ms[i + 2] + ms[i + 3]) / 4);
  const lk = (m: number) => -0.691 + db(m);
  const abs = blocks.filter((m) => lk(m) > -70);
  if (!abs.length) return -99;
  const meanAbs = abs.reduce((s, m) => s + m, 0) / abs.length;
  const rel = abs.filter((m) => lk(m) > lk(meanAbs) - 10);
  return rel.length ? lk(rel.reduce((s, m) => s + m, 0) / rel.length) : -99;
}

/** loudness (dB, like LUFS) of [a, b) s of a weighted signal, ungated */
function windowLoudness(x: Float32Array, sr: number, a: number, b: number): number {
  const i0 = Math.max(0, Math.floor(a * sr));
  const i1 = Math.min(x.length, Math.floor(b * sr));
  let s = 0;
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return -0.691 + db((2 * s) / Math.max(1, i1 - i0));
}

const median = (v: number[]): number => {
  if (!v.length) return -99;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const r1 = (x: number) => Math.round(x * 10) / 10;

export interface BalanceStem {
  /** gated loudness, K-weighted (LUFS) and through the phone-speaker model */
  lufs: number;
  phone: number;
  peakDb: number;
}

export interface BalanceRender {
  back: BalanceStem;
  stem: BalanceStem;
  mix: BalanceStem & { width: number; bands: number[] };
  /** during the towers' hits (250 ms from each onset): stem − backing, dB (median over hits) */
  hitDelta: number;
  hitDeltaPhone: number;
  /** the stem's own level during its hits (K-weighted and phone model, dB) */
  hitK: number;
  hitPhone: number;
  hits: number;
  /** share (%) of the stem's energy above 2 kHz during its hits */
  stemBright?: number;
  wav?: string;
}

/** extra things a balance script can do (the rhythm API) */
export interface BalanceExtras {
  groove?: number;
  /** player taps on every beat (quality per tap) */
  taps?: 'perfect' | 'good' | 'miss';
  /** a solo of this tower (the army's first of that kind) on bar 2 */
  solo?: TowerKind;
  /** v4: a pickup or a strike of this quality on every beat from bar 1 (their onsets are the hits measured) */
  events?: { kind: 'tap' | 'pickup' | 'strike'; q: 'perfect' | 'good' | 'miss' };
  /** v4: the player's power (0…1) for the whole render */
  power?: number;
  /** measure the player's sounds (rhythm bus) against everything else (music + towers) */
  measure?: 'towers' | 'rhythm';
}

/**
 * The balance of a band over its song: three renders of the same script — the backing alone (tower
 * bus muted), the towers alone (music muted) and the mix — measured over bars [1, bars).
 * `band` = the sections reported to the engine (default: those of the army).
 */
export async function renderBalance(
  song: SongId,
  army: TowerSpec[],
  o: { bars?: number; intensity?: number; band?: Partial<Record<Section, number>>; duets?: DuetId[]; wav?: boolean; window?: number } & BalanceExtras = {},
): Promise<BalanceRender> {
  const bars = o.bars ?? 8;
  const spb = 60 / SONGS[song].bpm;
  const barDur = spb * 4;
  const sd = spb / 4;
  const t0 = 0.2;
  const seconds = t0 + (bars + 0.6) * barDur;
  const secs: Partial<Record<Section, number>> = o.band ? { ...o.band } : {};
  if (!o.band) for (const tw of army) secs[SECTION_OF[tw.kind]] = (secs[SECTION_OF[tw.kind]] ?? 0) + 1;
  const mix = bandOf(secs, o.duets ?? []);
  const win = o.window ?? 0.25;
  const run = async (mode: 'back' | 'stem' | 'mix') => {
    const rig = makeRig(seconds);
    rig.director.band = mix;
    rig.towers.setBand(mix);
    const rhythmStem = o.measure === 'rhythm';
    if (mode === 'stem') {
      rig.core.setVolumes({ master: 1, music: 0, sfx: 0.9, ambience: 0.8 });
      if (rhythmStem) rig.core.towerBus.gain.value = 0;
    }
    if (mode === 'back') {
      if (!rhythmStem) rig.core.towerBus.gain.value = 0;
      rig.core.rhythmBus.gain.value = 0;
    }
    if (o.power !== undefined) rig.director.power = o.power;
    const p = rig.director.play(song, t0, 0.05, o.intensity ?? 1);
    if (!p) throw new Error('no song');
    const evOnsets: number[] = [];
    if (o.events) {
      const ev = o.events;
      for (let beat = 4; beat < bars * 4; beat++) {
        const t = t0 + beat * spb;
        evOnsets.push(t);
        const run = beat - 4;
        rig.at(t, () => (ev.kind === 'tap' ? rig.rhythm.beatTap(t, ev.q, 0.2) : ev.kind === 'pickup' ? rig.rhythm.pickupTap(t, ev.q, 0.2, run) : rig.rhythm.strike(t, ev.q, 0.2)), 0.1);
      }
    }
    if (o.groove !== undefined) {
      // the groove arrives on bar 1 (with its riser and drop when it is 4)
      const g = o.groove;
      rig.at(t0 + barDur, () => {
        const tl = rig.director.setGroove(g);
        if (g === 4 && tl !== null) rig.rhythm.grooveRise(tl);
      }, 0.2 + 2 * spb);
    }
    const onsets: number[] = [];
    for (const tw of army) {
      const lv = TOWERS[tw.kind].levels[tw.level];
      for (let s = 0; s < bars * 16; s++) {
        if (lv.pattern[s % lv.pattern.length] !== 'x') continue;
        const t = t0 + s * sd;
        if (s >= 16) onsets.push(t);
        rig.at(t, () => rig.towers.shot(tw.kind, tw.level, t, tw.pan, tw.voice), 0.12);
        if (lv.flight > 0) rig.at(t + lv.flight * sd, () => rig.towers.impact(tw.kind, t + lv.flight * sd, tw.pan, 0.7), 0.12);
      }
    }
    if (o.taps) {
      for (let beat = 4; beat < bars * 4; beat++) {
        const t = t0 + beat * spb;
        rig.at(t, () => rig.rhythm.beatTap(t, o.taps!, 0), 0.1);
      }
    }
    if (o.solo) {
      const tw = army.find((x) => x.kind === o.solo) ?? { kind: o.solo, level: 1, pan: 0, voice: 1 };
      const t = t0 + 2 * barDur;
      rig.at(t, () => rig.rhythm.solo(tw.kind, tw.level, t, tw.pan, tw.voice), 0.15);
    }
    const r = await rig.render();
    return { buf: r.buf, onsets: [...new Set(rhythmStem ? evOnsets : onsets)].sort((x, y) => x - y) };
  };
  const back = await run('back');
  const stem = await run('stem');
  const mixed = await run('mix');
  const a = t0 + barDur;
  const b = t0 + bars * barDur;
  const sr = back.buf.sampleRate;
  const W = { back: weighted(back.buf), stem: weighted(stem.buf), mix: weighted(mixed.buf) };
  const peak = (buf: AudioBuffer) => {
    let pk = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = Math.floor(a * sr); i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    }
    return 20 * Math.log10(pk + 1e-12);
  };
  const st = (w: ReturnType<typeof weighted>, buf: AudioBuffer): BalanceStem => ({ lufs: r1(gatedLoudness(w.k, sr, a, b)), phone: r1(gatedLoudness(w.phone, sr, a, b)), peakDb: r1(peak(buf)) });
  const dK: number[] = [];
  const dP: number[] = [];
  const hK: number[] = [];
  const hP: number[] = [];
  for (const t of stem.onsets) {
    if (t >= b) continue;
    const sK = windowLoudness(W.stem.k, sr, t, t + win);
    const bK = windowLoudness(W.back.k, sr, t, t + win);
    const sP = windowLoudness(W.stem.phone, sr, t, t + win);
    const bP = windowLoudness(W.back.phone, sr, t, t + win);
    dK.push(sK - bK);
    dP.push(sP - bP);
    hK.push(sK);
    hP.push(sP);
  }
  return {
    back: st(W.back, back.buf),
    stem: st(W.stem, stem.buf),
    mix: { ...st(W.mix, mixed.buf), width: r1(10 * Math.log10((W.mix.side + 1e-12) / (W.mix.mid + 1e-12))), bands: octaves(mixed.buf, a, b) },
    hitDelta: r1(median(dK)),
    hitDeltaPhone: r1(median(dP)),
    hitK: r1(median(hK)),
    hitPhone: r1(median(hP)),
    hits: dK.length,
    stemBright: (() => {
      let hi = 0;
      let tot = 0;
      for (const t of stem.onsets) {
        if (t >= b) continue;
        const sh = bandShares(stem.buf, t, t + win);
        const e = windowLoudness(W.stem.k, sr, t, t + win);
        const w = Math.pow(10, e / 10);
        hi += w * (sh[3] + sh[4] + sh[5]);
        tot += w;
      }
      return tot > 0 ? Math.round((hi / tot) * 1000) / 10 : 0;
    })(),
    wav: o.wav ? wavBase64(mixed.buf) : undefined,
  };
}

// ───────────────────────────── rhythm play (v3) ─────────────────────────────

export interface RhythmRender {
  stats: Stats;
  /** a bar of each kind of tap: its loudness with the taps and without them (the same render, no player) */
  taps: { q: string; lufs: number; ref: number }[];
  /** `before`: that bar without the player (the full band alone) */
  solos: { kind: TowerKind; lufs: number; before: number; peakDb: number; inChord: number }[];
  call: { lufs: number; ref: number; inScale: number };
  wav?: string;
}

/**
 * The rhythm API over a battle song (full band, intensity 1): a bar of perfect, good and miss taps;
 * every musician's solo (one bar each, a bar of rest between); the Maestro's call, a right and a
 * wrong echo, and both verdicts. Rendered twice: with the player and without (the reference).
 */
export async function renderRhythm(song: SongId = 'meadow', o: { wav?: boolean; world?: WorldId } = {}): Promise<RhythmRender> {
  const kinds: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];
  const spb = 60 / SONGS[song].bpm;
  const barDur = 4 * spb;
  const t0 = 0.2;
  const soloBar0 = 5;
  const callBar = soloBar0 + kinds.length * 2 + 1;
  const bars = callBar + 6;
  const seconds = t0 + bars * barDur + 2;
  const qs: TapQuality[] = ['perfect', 'good', 'miss'];
  const run = async (player: boolean) => {
    const rig = makeRig(seconds);
    const mix = bandOf({ strings: 1, percussion: 1, bells: 1, brass: 1, voices: 1, low: 1 });
    rig.director.band = mix;
    rig.towers.setBand(mix);
    if (o.world) rig.director.world = o.world;
    const p = rig.director.play(song, t0, 0.05, 1);
    if (!p) throw new Error('no song');
    // the call comes in a breather (intensity 0)
    rig.at(p.barStart(callBar) - 0.3, () => p.setIntensity(0, rig.ctx.currentTime), 0);
    if (player) {
      qs.forEach((q, i) => {
        for (let beat = 0; beat < 4; beat++) {
          const t = p.barStart(2 + i) + beat * spb;
          rig.at(t, () => rig.rhythm.beatTap(t, q, 0.2), 0.1);
        }
      });
      kinds.forEach((k, i) => {
        const t = p.barStart(soloBar0 + i * 2);
        rig.at(t, () => rig.rhythm.solo(k, 1, t, 0.2, 1), 0.15);
      });
      for (let i = 0; i < 4; i++) {
        const tc = p.barStart(callBar) + i * spb;
        const te = p.barStart(callBar + 1) + i * spb;
        const tc2 = p.barStart(callBar + 3) + i * spb;
        const te2 = p.barStart(callBar + 4) + i * spb;
        rig.at(tc, () => rig.rhythm.callNote(i, tc), 0.1);
        rig.at(te, () => rig.rhythm.echoNote(i, te, true), 0.1);
        rig.at(tc2, () => rig.rhythm.callNote(3 - i, tc2), 0.1);
        rig.at(te2, () => rig.rhythm.echoNote(3 - i, te2, i !== 2), 0.1);
      }
      rig.at(p.barStart(callBar + 2), () => rig.rhythm.echoResult(true), 0.05);
      rig.at(p.barStart(callBar + 5), () => rig.rhythm.echoResult(false), 0.05);
    }
    const r = await rig.render();
    return { r, p };
  };
  const { r, p } = await run(true);
  const ref = (await run(false)).r;
  const stats = measure(r.buf, r.ms, 0.3);
  stats.maxVoices = r.maxVoices;
  stats.cats = r.cats;
  const lu = (buf: AudioBuffer, a: number, b: number) => Math.round(measureRange(buf, a, b).lufs * 10) / 10;
  const bar = (buf: AudioBuffer, k: number, n = 1) => lu(buf, p.barStart(k), p.barStart(k + n));
  const taps = [{ q: 'none', lufs: bar(r.buf, 1), ref: bar(ref.buf, 1) }, ...qs.map((q, i) => ({ q, lufs: bar(r.buf, 2 + i), ref: bar(ref.buf, 2 + i) }))];
  const solos = kinds.map((kind, i) => {
    const b = soloBar0 + i * 2;
    const m = measureRange(r.buf, p.barStart(b), p.barStart(b + 1));
    const h = harmonyCheck(r.buf, p, b, b + 1);
    return { kind, lufs: Math.round(m.lufs * 10) / 10, before: bar(ref.buf, b), peakDb: Math.round(m.peakDb * 10) / 10, inChord: h.inChord };
  });
  const hc = harmonyCheck(r.buf, p, callBar, callBar + 6);
  return { stats, taps, solos, call: { lufs: bar(r.buf, callBar, 6), ref: bar(ref.buf, callBar, 6), inScale: hc.inScale }, wav: o.wav ? wavBase64(r.buf) : undefined };
}

// ───────────────────────────── the power meter (v4) ─────────────────────────────

export interface PowerRender {
  stats: Stats;
  /** per segment: loudness (K and phone), share of energy above 4 kHz, stereo side/mid (dB) */
  segments: { name: string; power: number; lufs: number; phone: number; hf: number; width: number; peakDb: number }[];
  /** the bar of the power drop: loudness of the half bar after it vs the half bar before */
  drop: { before: number; after: number };
  wav?: string;
}

/**
 * The full band over a battle song while the player's power climbs 0 → 1 (updated every beat, like
 * the game), holds, then a miss breaks the run (powerDrop and power falls to 0.3).
 */
export async function renderPower(song: SongId = 'meadow', o: { wav?: boolean; intensity?: number } = {}): Promise<PowerRender> {
  const spb = 60 / SONGS[song].bpm;
  const barDur = 4 * spb;
  const sd = spb / 4;
  const t0 = 0.2;
  const bars = 22;
  const seconds = t0 + bars * barDur + 1.5;
  const rig = makeRig(seconds);
  const mix = bandOf({ strings: 2, percussion: 2, bells: 2, brass: 1, voices: 1, low: 1 });
  rig.director.band = mix;
  rig.towers.setBand(mix);
  rig.director.power = 0;
  const p = rig.director.play(song, t0, 0.05, o.intensity ?? 1);
  if (!p) throw new Error('no song');
  // power: 0 for bars 0–3, climbing over bars 4–11, 1 for bars 12–15, a miss on bar 16 (→ 0.3)
  const powerAt = (beat: number) => {
    const bar = beat / 4;
    if (bar < 4) return 0;
    if (bar < 12) return (bar - 4) / 8;
    if (bar < 16) return 1;
    return 0.3;
  };
  for (let beat = 0; beat < bars * 4; beat++) {
    const t = t0 + beat * spb;
    const pw = powerAt(beat);
    rig.at(t, () => rig.director.setPower(pw), 0.05);
  }
  const tDrop = p.barStart(16) + 0.5 * spb;
  rig.at(tDrop, () => rig.rhythm.powerDrop(tDrop), 0.1);
  const army = defaultArmy(10).map((x) => ({ ...x, level: 0 }));
  for (const tw of army) {
    const lv = TOWERS[tw.kind].levels[tw.level];
    for (let st = 0; st < bars * 16; st++) {
      if (lv.pattern[st % lv.pattern.length] !== 'x') continue;
      const t = t0 + st * sd;
      rig.at(t, () => rig.towers.shot(tw.kind, tw.level, t, tw.pan, tw.voice), 0.12);
    }
  }
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0.3);
  stats.maxVoices = r.maxVoices;
  const sr = r.buf.sampleRate;
  const W = weighted(r.buf);
  const segs: [string, number, number, number][] = [['p 0', 1, 4, 0], ['p .25', 6, 7, 0.25], ['p .5', 8, 9, 0.5], ['p .75', 10, 11, 0.75], ['p 1', 12, 16, 1], ['after miss (.3)', 17, 22, 0.3]];
  const segments = segs.map(([name, a, b, pw]) => {
    const ta = p.barStart(a);
    const tb = p.barStart(b);
    const i0 = Math.floor(ta * sr);
    const i1 = Math.floor(tb * sr);
    const L = r.buf.getChannelData(0);
    const R = r.buf.getChannelData(1);
    let side = 0;
    let midE = 0;
    for (let i = i0; i < i1; i++) {
      const m = (L[i] + R[i]) * 0.5;
      const d = (L[i] - R[i]) * 0.5;
      midE += m * m;
      side += d * d;
    }
    const sh = bandShares(r.buf, ta, tb);
    const rr = measureRange(r.buf, ta, tb);
    return { name, power: pw, lufs: r1(gatedLoudness(W.k, sr, ta, tb)), phone: r1(gatedLoudness(W.phone, sr, ta, tb)), hf: Math.round((sh[4] + sh[5]) * 1000) / 10, width: r1(10 * Math.log10((side + 1e-12) / (midE + 1e-12))), peakDb: r1(rr.peakDb) };
  });
  const drop = { before: r1(windowLoudness(W.k, sr, tDrop - 2 * spb, tDrop)), after: r1(windowLoudness(W.k, sr, tDrop, tDrop + 2 * spb)) };
  return { stats, segments, drop, wav: o.wav ? wavBase64(r.buf) : undefined };
}

export interface EventStems {
  /** per event kind and quality: the stem's level (K and phone) during the event, its share of energy
   * above 2 kHz (brightness), and stem − everything else (phone) during it */
  rows: { kind: string; q: string; hitK: number; hitPhone: number; bright: number; overPhone: number; peakDb: number }[];
}

/** every player sound (tap, pickup, strike) in every quality over the full band, measured as a stem */
export async function renderEvents(song: SongId = 'meadow'): Promise<EventStems> {
  const army = defaultArmy(10).map((x) => ({ ...x, level: 0 }));
  const rows: EventStems['rows'] = [];
  for (const kind of ['tap', 'pickup', 'strike'] as const) {
    for (const q of ['perfect', 'good', 'miss'] as const) {
      const r = await renderBalance(song, army, { bars: 4, intensity: 1, events: { kind, q }, measure: 'rhythm', window: 0.08 });
      rows.push({ kind, q, hitK: r.hitK, hitPhone: r.hitPhone, bright: r.stemBright ?? 0, overPhone: r.hitDeltaPhone, peakDb: r.mix.peakDb });
    }
  }
  return { rows };
}

// ───────────────────────────── boss fights (v5) ─────────────────────────────

/** the song each boss fights in (its level's) */
export const BOSS_HOME: Partial<Record<EnemyKind, SongId>> = {
  toad: 'meadow', drumBeetle: 'meadow', crow: 'meadow', bossBlot: 'boss', wyrm: 'meadow',
  sandworm: 'desert', croc: 'desert', sphinx: 'desert', bossScarab: 'boss', djinn: 'desert',
  yeti: 'ice', siren: 'ice', stag: 'ice', bossMoth: 'boss', aurora: 'ice',
  salamander: 'forge', magmaCrab: 'forge', smith: 'forge', bossGolem: 'boss', phoenix: 'forge',
  gargoyle: 'citadel', organist: 'citadel', twin: 'citadel', silence: 'finale', abyssKing: 'finale',
};
const BOSS_LAND: Partial<Record<EnemyKind, WorldId>> = {
  toad: 'meadow', drumBeetle: 'meadow', crow: 'meadow', bossBlot: 'meadow', wyrm: 'meadow',
  sandworm: 'desert', croc: 'desert', sphinx: 'desert', bossScarab: 'desert', djinn: 'desert',
  yeti: 'ice', siren: 'ice', stag: 'ice', bossMoth: 'ice', aurora: 'ice',
  salamander: 'forge', magmaCrab: 'forge', smith: 'forge', bossGolem: 'forge', phoenix: 'forge',
  gargoyle: 'citadel', organist: 'citadel', twin: 'citadel', silence: 'citadel', abyssKing: 'citadel',
};

export interface BossRender {
  stats: Stats;
  /** the level's song before the fight, every phase of the fight, the song after it */
  segments: { name: string; lufs: number; peakDb: number; inChord: number; inScale: number; music: number }[];
  wav?: string;
}

/**
 * A boss fight inside its level's song with the full band firing (intensity 2): two bars of the
 * song, the boss's phases (`bars` each, with tell → parry/blow duels in each phase), bossTheme(null)
 * and three bars of the song again.
 */
export async function renderBoss(kind: EnemyKind, o: { wav?: boolean; bars?: number; phases?: number } = {}): Promise<BossRender> {
  const full = await bossRun(kind, o, false);
  const music = await bossRun(kind, o, true);
  full.segments.forEach((x, i) => (x.music = music.segments[i].lufs));
  return full;
}

/** one render of the fight; `musicOnly` mutes the towers and the player's sounds (the music's own loudness) */
async function bossRun(kind: EnemyKind, o: { wav?: boolean; bars?: number; phases?: number }, musicOnly: boolean): Promise<BossRender> {
  const song = BOSS_HOME[kind] ?? 'meadow';
  const spec = bossSpec(kind);
  const nPh = o.phases ?? spec?.phases.length ?? 1;
  const per = o.bars ?? (spec?.cls === 'mini' ? 10 : 8);
  const spb = 60 / SONGS[song].bpm;
  const barDur = 4 * spb;
  const sd = spb / 4;
  const t0 = 0.2;
  const b0 = 2;
  const bEnd = b0 + nPh * per;
  const bars = bEnd + 3;
  const seconds = t0 + bars * barDur + 2;
  const rig = makeRig(seconds);
  rig.director.world = BOSS_LAND[kind] ?? null;
  const mix = bandOf({ strings: 2, percussion: 2, bells: 1, brass: 1, voices: 1, low: 1 });
  rig.director.band = mix;
  rig.towers.setBand(mix);
  if (musicOnly) {
    rig.core.towerBus.gain.value = 0;
    rig.core.rhythmBus.gain.value = 0;
  }
  const p = rig.director.play(song, t0, 0.05, 2);
  if (!p) throw new Error('no song');
  rig.at(p.barStart(b0) - 1.5, () => {
    const ts = rig.director.bossTheme(kind, p.barStart(b0));
    if (ts !== null) rig.rhythm.bossTransition(ts, true, 1);
  }, 0);
  for (let k = 1; k < nPh; k++) {
    const tb = p.barStart(b0 + k * per);
    rig.at(tb - 1.5, () => {
      const ts = rig.director.bossPhase(k + 1, tb);
      if (ts !== null) rig.rhythm.bossPhaseHit(ts, k + 1);
    }, 0);
  }
  rig.at(p.barStart(bEnd) - 1.5, () => {
    const ts = rig.director.bossTheme(null, p.barStart(bEnd));
    if (ts !== null) rig.rhythm.bossTransition(ts, false, 1);
  }, 0);
  for (let k = 0; k < nPh; k++) {
    for (let r = 0; r < 2; r++) {
      const bar = b0 + k * per + 3 + r * 3;
      for (let beat = 0; beat < 4; beat++) {
        const t = p.barStart(bar) + beat * spb;
        const last = beat === 3;
        rig.at(t, () => rig.rhythm.bossTell(t, 0.3, last), 0.1);
        if (last) {
          const what = (k + r) % 3;
          rig.at(t, () => (what === 0 ? rig.rhythm.parry(t, 'perfect', 0.3) : what === 1 ? rig.rhythm.parry(t, 'good', 0.3) : rig.rhythm.bossBlow(t, 0.3, 1)), 0.1);
        }
      }
    }
  }
  const army = defaultArmy(10).map((x) => ({ ...x, level: 1 }));
  for (const tw of army) {
    const lv = TOWERS[tw.kind].levels[tw.level];
    for (let st = 0; st < bars * 16; st++) {
      if (lv.pattern[st % lv.pattern.length] !== 'x') continue;
      const t = t0 + st * sd;
      rig.at(t, () => rig.towers.shot(tw.kind, tw.level, t, tw.pan, tw.voice), 0.12);
    }
  }
  const r = await rig.render();
  const stats = measure(r.buf, r.ms, 0.3);
  stats.maxVoices = r.maxVoices;
  stats.cats = r.cats;
  const seg = (name: string, a: number, b: number) => {
    const m = measureRange(r.buf, p.barStart(a), p.barStart(b));
    const h = musicOnly ? { inChord: 0, inScale: 0 } : harmonyCheck(r.buf, p, a, b);
    return { name, lufs: r1(m.lufs), peakDb: r1(m.peakDb), inChord: h.inChord, inScale: h.inScale, music: 0 };
  };
  const segments = [seg('song before', 0, b0)];
  for (let k = 0; k < nPh; k++) segments.push(seg(`phase ${k + 1}`, b0 + k * per, b0 + (k + 1) * per));
  segments.push(seg('song after', bEnd, bars));
  return { stats, segments, wav: o.wav && !musicOnly ? wavBase64(r.buf) : undefined };
}

// ───────────────────────────── viradas (v7) ─────────────────────────────

export type ViradaPlay = 'perfect' | 'good' | 'partial' | 'none';

export interface ViradaRender {
  song: SongId;
  /** grid times (s) of the marks and of the virada's window */
  marks: number[];
  start: number;
  end: number;
  /** the song's drum kit inside the window (from its 2nd beat), with the virada vs without (dB, K-weighted): the duck */
  duckDb: number;
  /** everything but the drum kit inside the window, with vs without (dB): must stay ≈ 0 */
  restDb: number;
  /** the song's drum kit outside the window (the bars before it and the bar after), with vs without (dB) */
  drumsOutsideDb: number;
  /** the largest sample difference (dBFS) with vs without the virada: the rest of the song over the
   * whole render, and the whole mix (song + towers) before the window — −Infinity = bit-identical */
  diff: { rest: number; mixBefore: number };
  /** the song's drum hits (the 2 bars before): 90th percentile of the 100 ms windows on each 16th (K / phone) */
  drumRef: { k: number; phone: number };
  /** every stroke (the player's stem, 100 ms from its onset), K / phone */
  strokes: { i: number; q: string; k: number; phone: number }[];
  /** loudest stroke − drumRef (dB, K / phone): must be ≤ 0 */
  over: { k: number; phone: number };
  /** the crash on the downbeat: the highs' rise there (dB), its onset error (ms) vs `end` (null: no
   * rise of 6 dB), its level (100 ms, K) */
  crash: { errMs: number | null; rise: number; k: number };
  /** onsets found in the player's stem and the worst distance (ms) of one from the 16th grid */
  grid: { onsets: number; maxErrMs: number; worst: number[] };
  /** the song's kit energy before the virada (Director.kitEnergy at the cue) */
  kitE: number | null;
  /** the bar after the virada: mix loudness with the virada vs without (the swell's lift) */
  after: { with: number; without: number };
  /** the whole mix (song + towers + the player): clicks and peak */
  stats: Stats;
  wav?: string;
}

/**
 * A virada over a battle song (full band and 10 towers firing, intensity `intensity`): the cue a bar
 * ahead, `n` marks across the last bar of a 6-bar phrase (8ths then 16ths), struck per `play`
 * (perfect / good / partial: every other one missed / none: all missed), then viradaEnd on the
 * downbeat. Measured as stems: the song's drum kit with and without the virada (the duck), the rest
 * of the song (unchanged), the player's strokes (level vs the song's drums, the crash, the grid).
 */
export async function renderVirada(song: SongId = 'meadow', o: { play?: ViradaPlay; level?: number; n?: number; intensity?: number; world?: WorldId; wav?: boolean } = {}): Promise<ViradaRender> {
  const play = o.play ?? 'perfect';
  const level = o.level ?? 0;
  const n = Math.max(2, Math.min(8, o.n ?? 6));
  const spb = 60 / SONGS[song].bpm;
  const barDur = 4 * spb;
  const sd = spb / 4;
  const t0 = 0.2;
  const vBar = 5;
  const bars = 8;
  const seconds = t0 + bars * barDur + 1.5;
  // the fill: 8ths, then 16ths into the downbeat (all on the grid, inside the last bar)
  const PAT: Record<number, number[]> = {
    2: [3, 3.5],
    3: [2, 3, 3.5],
    4: [2, 2.5, 3, 3.5],
    5: [1, 2, 2.5, 3, 3.5],
    6: [1, 2, 2.5, 3, 3.5, 3.75],
    7: [1, 1.5, 2, 2.5, 3, 3.5, 3.75],
    8: [1, 1.5, 2, 2.5, 3, 3.25, 3.5, 3.75],
  };
  const beats = PAT[n];
  const start = t0 + vBar * barDur;
  const end = start + barDur;
  const marks = beats.map((b) => start + b * spb);
  const quality = (i: number): TapQuality => (play === 'none' ? 'miss' : play === 'partial' ? (i % 2 === 1 ? 'miss' : 'perfect') : play);
  const hits = beats.filter((_, i) => quality(i) !== 'miss').length;
  const army = defaultArmy(10).map((x) => ({ ...x, level: 1 }));
  const world: WorldId | null = o.world ?? (song === 'meadow' || song === 'desert' || song === 'ice' || song === 'forge' || song === 'citadel' ? song : null);
  // every render draws the same random numbers (the humanisation is identical): with and without the
  // virada differ only by what the virada does, so "unchanged" can be measured exactly
  const seeded = (seed: number) => {
    let x = seed >>> 0;
    return () => {
      x = (x + 0x6d2b79f5) >>> 0;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const run = async (virada: boolean, mode: 'drums' | 'rest' | 'player' | 'mix') => {
    const keep = Math.random;
    Math.random = seeded(1234567);
    try {
      return await run1(virada, mode);
    } finally {
      Math.random = keep;
    }
  };
  let kitE: number | null = null;
  const run1 = async (virada: boolean, mode: 'drums' | 'rest' | 'player' | 'mix') => {
    const rig = makeRig(seconds);
    const mix = bandOf({ strings: 2, percussion: 2, bells: 1, brass: 1, voices: 1, low: 1 });
    rig.director.band = mix;
    rig.towers.setBand(mix);
    rig.director.world = world;
    // the fill's voices are rendered up front in every render (the same random draws either way)
    rig.rhythm.warmVirada();
    // (volumes 1 = the core's defaults: master 0.9, music 0.8, sfx 0.9, ambience 0.8)
    if (mode === 'drums' || mode === 'rest') {
      // the music alone (the sfx bus, dry and wet, is off: towers and the player's sounds)
      rig.director.stem = mode;
      rig.core.setVolumes({ master: 1, music: 1, sfx: 0, ambience: 1 });
    }
    if (mode === 'player') {
      rig.core.setVolumes({ master: 1, music: 0, sfx: 1, ambience: 1 });
      rig.core.towerBus.gain.value = 0;
    }
    const p = rig.director.play(song, t0, 0.05, o.intensity ?? 1);
    if (!p) throw new Error('no song');
    if (virada) {
      rig.at(start - barDur, () => {
        if (mode === 'player') kitE = rig.director.kitEnergy(start);
        rig.rhythm.viradaCue(start, end, n, level);
      }, 0.1);
      marks.forEach((t, i) => rig.at(t, () => rig.rhythm.viradaHit(i, n, t, quality(i), -0.6 + (1.2 * i) / (n - 1)), 0.05));
      rig.at(end, () => rig.rhythm.viradaEnd(end, hits, n, play === 'perfect'), 0.06);
    }
    if (mode === 'mix') {
      for (const tw of army) {
        const lv = TOWERS[tw.kind].levels[tw.level];
        for (let st = 0; st < bars * 16; st++) {
          if (lv.pattern[st % lv.pattern.length] !== 'x') continue;
          const t = t0 + st * sd;
          rig.at(t, () => rig.towers.shot(tw.kind, tw.level, t, tw.pan, tw.voice), 0.12);
        }
      }
    }
    return rig.render();
  };
  const drumsRef = await run(false, 'drums');
  const drumsV = await run(true, 'drums');
  const restRef = await run(false, 'rest');
  const restV = await run(true, 'rest');
  const player = await run(true, 'player');
  const mixRef = await run(false, 'mix');
  const mixV = await run(true, 'mix');
  const sr = player.buf.sampleRate;
  const W = { dRef: weighted(drumsRef.buf), dV: weighted(drumsV.buf), rRef: weighted(restRef.buf), rV: weighted(restV.buf), pl: weighted(player.buf), mRef: weighted(mixRef.buf), mV: weighted(mixV.buf) };
  // the window from its second beat (the hits before it ring out through the first; the first mark
  // is on beat 2), less its last 20 ms (the song's drums are back on the downbeat)
  const duckDb = r1(windowLoudness(W.dV.k, sr, start + spb, end - 0.02) - windowLoudness(W.dRef.k, sr, start + spb, end - 0.02));
  const restDb = r1(windowLoudness(W.rV.k, sr, start, end) - windowLoudness(W.rRef.k, sr, start, end));
  const outside = (w: ReturnType<typeof weighted>) => {
    const a = Math.pow(10, windowLoudness(w.k, sr, t0 + barDur, start) / 10) * (start - t0 - barDur);
    const b = Math.pow(10, windowLoudness(w.k, sr, end + 0.15, end + barDur) / 10) * (barDur - 0.15);
    return 10 * Math.log10((a + b) / (start - t0 - barDur + barDur - 0.15));
  };
  const drumsOutsideDb = r1(outside(W.dV) - outside(W.dRef));
  const maxDiff = (x: AudioBuffer, y: AudioBuffer, until: number) => {
    let m = 0;
    for (let c = 0; c < x.numberOfChannels; c++) {
      const a = x.getChannelData(c);
      const b = y.getChannelData(c);
      const i1 = Math.min(a.length, b.length, Math.floor(until * sr));
      for (let i = 0; i < i1; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    }
    return m > 0 ? r1(20 * Math.log10(m)) : -Infinity;
  };
  const diff = { rest: maxDiff(restV.buf, restRef.buf, seconds), mixBefore: maxDiff(mixV.buf, mixRef.buf, start - 0.04) };
  const p90 = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : -99;
  };
  const refK: number[] = [];
  const refP: number[] = [];
  for (let k = 0; k < 32; k++) {
    const t = start - 2 * barDur + k * sd;
    refK.push(windowLoudness(W.dRef.k, sr, t, t + 0.1));
    refP.push(windowLoudness(W.dRef.phone, sr, t, t + 0.1));
  }
  const drumRef = { k: r1(p90(refK)), phone: r1(p90(refP)) };
  const strokes = marks.map((t, i) => ({ i, q: quality(i), k: r1(windowLoudness(W.pl.k, sr, t, t + 0.1)), phone: r1(windowLoudness(W.pl.phone, sr, t, t + 0.1)) }));
  const hitStrokes = strokes.filter((s) => s.q !== 'miss');
  const loudest = (f: (s: (typeof strokes)[number]) => number) => (hitStrokes.length ? Math.max(...hitStrokes.map(f)) : -99);
  const over = { k: r1(loudest((s) => s.k) - drumRef.k), phone: r1(loudest((s) => s.phone) - drumRef.phone) };
  // onsets in the player's stem: 32-sample frames (0.7 ms), a jump of ≥ 8 dB over the previous 20 ms, above −50 dBFS
  const L = player.buf.getChannelData(0);
  const R = player.buf.getChannelData(1);
  const FR = 32;
  const envOf = (x: (i: number) => number) => {
    const e: number[] = [];
    for (let i = 0; i + FR <= L.length; i += FR) {
      let pk = 0;
      for (let j = i; j < i + FR; j++) pk = Math.max(pk, x(j));
      e.push(pk);
    }
    return e;
  };
  const look = Math.round((0.02 * sr) / FR);
  const onsetsOf = (e: number[], floor: number) => {
    const out: number[] = [];
    for (let k = look; k < e.length; k++) {
      let prev = 0;
      for (let j = k - look; j < k; j++) prev = Math.max(prev, e[j]);
      const tk = (k * FR) / sr;
      if (e[k] > floor && e[k] > 2.5 * prev && (!out.length || tk - out[out.length - 1] > 0.03)) out.push(tk);
    }
    return out;
  };
  const onsets = onsetsOf(envOf((j) => Math.max(Math.abs(L[j]), Math.abs(R[j]))), 0.00316);
  // the master chain's two compressors look 6 ms ahead each: everything leaves 12 ms late
  const LAT = 0.012;
  const errs = onsets.map((t) => {
    const g = Math.round((t - LAT - t0) / sd);
    return { t, e: Math.abs(t - LAT - (t0 + g * sd)) * 1000 };
  });
  // a frame quantises the onset (and a drum's attack takes a moment): up to ~2 ms is the measurement itself
  const worst = errs.filter((x) => x.e > 2.5).map((x) => Math.round(x.t * 1000) / 1000);
  // the crash: an onset in the highs (> 5 kHz) at the downbeat (the strokes are low drums)
  const hp = [Biquad.hp(sr, 5000, 0.7071), Biquad.hp(sr, 5000, 0.7071)];
  const H = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) H[i] = hp[1].run(hp[0].run((L[i] + R[i]) * 0.5));
  const eH = (a: number, b: number) => {
    let e = 0;
    for (let i = Math.max(0, Math.floor(a * sr)); i < Math.min(H.length, Math.floor(b * sr)); i++) e += H[i] * H[i];
    return e;
  };
  // the highs' rise at the downbeat (30 ms after vs 30 ms before) and the steepest 1 ms of it
  const tE = end + LAT;
  const rise = r1(10 * Math.log10((eH(tE, tE + 0.03) + 1e-12) / (eH(tE - 0.03, tE) + 1e-12)));
  let errMs: number | null = null;
  if (rise >= 6) {
    // the onset: the first millisecond whose highs are 4× the mean of the 30 ms before the downbeat
    const base = eH(tE - 0.03, tE) / 30;
    for (let tt = tE - 0.02; tt < tE + 0.02; tt += 0.00025) {
      if (eH(tt, tt + 0.001) > 4 * base + 1e-12) {
        errMs = Math.round((tt - tE) * 10000) / 10;
        break;
      }
    }
  }
  const crash = { errMs, rise, k: r1(windowLoudness(W.pl.k, sr, tE, tE + 0.1)) };
  const after = { with: r1(gatedLoudness(W.mV.k, sr, end, end + barDur)), without: r1(gatedLoudness(W.mRef.k, sr, end, end + barDur)) };
  const stats = measure(mixV.buf, mixV.ms, 0.3);
  stats.maxVoices = mixV.maxVoices;
  return {
    song, marks, start, end, duckDb, restDb, drumsOutsideDb, diff, drumRef, strokes, over, crash,
    grid: { onsets: onsets.length, maxErrMs: Math.round(Math.max(0, ...errs.map((x) => x.e)) * 10) / 10, worst },
    kitE, after, stats, wav: o.wav ? wavBase64(mixV.buf) : undefined,
  };
}
