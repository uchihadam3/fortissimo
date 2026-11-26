/**
 * Pure DSP (no Web Audio objects): instrument renderers, impulse responses, noise.
 * Runs in the render worker (off the main thread) and as a main-thread fallback.
 */
import { clamp, mtof } from './util';

export type BufInst =
  | 'piano' | 'epiano' | 'harp' | 'guitar' | 'koto' | 'oud' | 'pizz' | 'harpsi' | 'mando'
  | 'kalimba' | 'marimba' | 'celesta' | 'glass' | 'bell' | 'tile' | 'wood'
  // FORTÍSSIMO tonal instruments
  | 'brass' | 'choir' | 'choiroo' | 'zap' | 'spicc' | 'tbell' | 'mbox' | 'boom' | 'anvil' | 'timp' | 'taiko' | 'tom'
  // v3 tower voices that cut through on small speakers: the battle drum, the bright bass, the choir's sung attack
  | 'tdrum' | 'tbass' | 'choirx'
  // one-shot percussion (single zone at MIDI 60 — play at 60 for the natural pitch)
  | 'kick' | 'snare' | 'brush' | 'hat' | 'ohat' | 'shaker' | 'tamb' | 'tick' | 'crash' | 'dum' | 'tek' | 'clap' | 'gong' | 'rim';

/** Unpitched one-shots: a single buffer, transposed only slightly for variation. */
export const PERC: ReadonlySet<BufInst> = new Set<BufInst>(['kick', 'snare', 'brush', 'hat', 'ohat', 'shaker', 'tamb', 'tick', 'crash', 'dum', 'tek', 'clap', 'gong', 'rim']);

export interface Rendered {
  data: Float32Array;
  sr: number;
}

interface InstSpec {
  lo: number;
  hi: number;
  step: number;
  render: (midi: number) => Rendered;
}

/** Additive synthesis with phasor recurrences (fast, accurate). partials: [ratio, amp, tau, cents] */
function additive(
  sr: number,
  dur: number,
  f0: number,
  partials: [number, number, number, number?][],
  opt: { attack?: number; noise?: number; noiseTau?: number; noiseLp?: number } = {},
): Float32Array {
  const n = Math.max(16, Math.floor(sr * dur));
  const out = new Float32Array(n);
  for (const [ratio, amp, tau, cents = 0] of partials) {
    const f = f0 * ratio * Math.pow(2, cents / 1200);
    if (f >= sr * 0.46 || amp <= 0) continue;
    const w = (2 * Math.PI * f) / sr;
    const c = Math.cos(w);
    const s = Math.sin(w);
    const ph = Math.random() * Math.PI * 2;
    let x = Math.cos(ph);
    let y = Math.sin(ph);
    let env = amp;
    const k = Math.exp(-1 / (Math.max(0.002, tau) * sr));
    for (let i = 0; i < n; i++) {
      out[i] += env * y;
      const nx = x * c - y * s;
      y = x * s + y * c;
      x = nx;
      env *= k;
      if (env < 2e-5) break;
    }
  }
  if (opt.noise) {
    const k = Math.exp(-1 / ((opt.noiseTau ?? 0.004) * sr));
    const a = 1 - Math.exp((-2 * Math.PI * (opt.noiseLp ?? 3000)) / sr);
    let env = opt.noise;
    let lp = 0;
    for (let i = 0; i < n && env > 1e-5; i++) {
      lp += a * (Math.random() * 2 - 1 - lp);
      out[i] += lp * env;
      env *= k;
    }
  }
  finish(out, sr, opt.attack ?? 0.002);
  return out;
}

/** Attack ramp, peak normalisation to 0.9 and an end fade. */
function finish(out: Float32Array, sr: number, attack: number): void {
  const na = Math.max(1, Math.floor(attack * sr));
  for (let i = 0; i < na && i < out.length; i++) out[i] *= i / na;
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    const v = Math.abs(out[i]);
    if (v > peak) peak = v;
  }
  if (peak > 0) {
    const g = 0.9 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  const nf = Math.min(out.length, Math.floor(0.03 * sr));
  for (let i = 0; i < nf; i++) out[out.length - 1 - i] *= i / nf;
}

/** Karplus-Strong pluck, tuned exactly by choosing the buffer sample rate. */
function ks(
  f0: number,
  o: { dur: number; t60: number; bright: number; pick: number; srTarget?: number; nasal?: number; soft?: number },
): Rendered {
  const target = o.srTarget ?? 32000;
  const N = Math.max(4, Math.round(target / f0 - 0.5));
  const sr = clamp((N + 0.5) * f0, 8000, 96000);
  const len = Math.floor(sr * o.dur);
  const y = new Float32Array(len);
  // excitation
  const exc = new Float32Array(N);
  const a = 0.08 + 0.92 * o.bright;
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    lp += a * (Math.random() * 2 - 1 - lp);
    exc[i] = lp;
    mean += lp;
  }
  mean /= N;
  for (let i = 0; i < N; i++) exc[i] -= mean;
  const p = Math.max(1, Math.round(o.pick * N));
  const orig = exc.slice();
  for (let i = p; i < N; i++) exc[i] = orig[i] - orig[i - p];
  for (let i = 0; i < N && i < len; i++) y[i] = exc[i];
  const g = Math.pow(0.001, 1 / (f0 * o.t60));
  const S = 0.5;
  for (let i = N; i < len; i++) {
    const a1 = y[i - N];
    const a2 = i - N - 1 >= 0 ? y[i - N - 1] : 0;
    y[i] = g * (S * a1 + (1 - S) * a2);
  }
  // gentle post filtering: soft lowpass (nylon) and/or nasal resonance (oud)
  if (o.soft) {
    const k = 1 - Math.exp((-2 * Math.PI * o.soft) / sr);
    let z = 0;
    for (let i = 0; i < len; i++) {
      z += k * (y[i] - z);
      y[i] = z;
    }
  }
  if (o.nasal) {
    // RBJ peaking EQ at o.nasal Hz, +7 dB, Q 1.4
    const w0 = (2 * Math.PI * o.nasal) / sr;
    const A = Math.pow(10, 7 / 40);
    const alpha = Math.sin(w0) / (2 * 1.4);
    const b0 = 1 + alpha * A, b1 = -2 * Math.cos(w0), b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A, a1c = -2 * Math.cos(w0), a2c = 1 - alpha / A;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < len; i++) {
      const x = y[i];
      const v = (b0 * x + b1 * x1 + b2 * x2 - a1c * y1 - a2c * y2) / a0;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = v;
      y[i] = v;
    }
  }
  finish(y, sr, 0.0008);
  return { data: y, sr };
}

// ═════════════════════════════ FORTÍSSIMO renderers ═════════════════════════════

const TBL = 4096;
const SIN = (() => {
  const t = new Float32Array(TBL + 1);
  for (let i = 0; i <= TBL; i++) t[i] = Math.sin((2 * Math.PI * i) / TBL);
  return t;
})();

/** sin(2π·ph) for a phase in cycles (table lookup, linear interpolation). */
function sn(ph: number): number {
  const x = (ph - Math.floor(ph)) * TBL;
  const i = x | 0;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i);
}

const white = (): number => Math.random() * 2 - 1;

/** RBJ biquad for shaping noise inside renderers. */
class Bq {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(type: 'lp' | 'hp' | 'bp' | 'peak', f: number, q: number, sr: number, gainDb = 0) {
    const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const c = Math.cos(w0);
    const al = Math.sin(w0) / (2 * q);
    let b0: number, b1: number, b2: number, a0: number;
    const a1 = -2 * c;
    let a2: number;
    if (type === 'lp') {
      b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a2 = 1 - al;
    } else if (type === 'hp') {
      b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a2 = 1 - al;
    } else if (type === 'bp') {
      b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a2 = 1 - al;
    } else {
      const A = Math.pow(10, gainDb / 40);
      b0 = 1 + al * A; b1 = a1; b2 = 1 - al * A; a0 = 1 + al / A; a2 = 1 - al / A;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
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

/** Brass: harmonic additive voice whose brightness follows its loudness (the classic brass law),
 *  with a lip "scoop" at the onset, a little blat and delayed vibrato. */
function brass(m: number): Rendered {
  const f0 = mtof(m);
  const sr = 32000;
  const dur = clamp(2.1 - (m - 48) * 0.015, 1.3, 2.3);
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  const fmax = Math.min(7500, sr * 0.45, f0 * 56);
  const K = Math.max(1, Math.floor(fmax / f0));
  const w = new Float32Array(K + 1);
  const ex = new Float32Array(K + 1);
  for (let k = 1; k <= K; k++) {
    const f = k * f0;
    const res = 0.32 + 0.68 / (1 + Math.pow((f - 1150) / 1500, 2));
    const roll = 1 / (1 + Math.pow(f / 4300, 4));
    w[k] = (res * roll) / Math.pow(k, 0.5);
    ex[k] = 0.62 * Math.pow(k - 1, 0.8);
  }
  const amps = new Float32Array(K + 1);
  const B = 16;
  let ph = 0;
  for (let i0 = 0; i0 < n; i0 += B) {
    const t = i0 / sr;
    const A = (1 - Math.exp(-t / 0.016)) * (0.72 + 0.28 * Math.exp(-t / 0.1)) * Math.exp(-t / 3.4);
    const lb = Math.log(Math.max(1e-4, Math.min(1, A / 0.92)));
    for (let k = 1; k <= K; k++) amps[k] = w[k] * A * Math.exp(ex[k] * lb);
    const vib = t > 0.3 ? 6 * Math.min(1, (t - 0.3) / 0.5) * Math.sin(2 * Math.PI * 5.1 * t) : 0;
    const dph = (f0 * Math.pow(2, (-38 * Math.exp(-t / 0.026) + vib) / 1200)) / sr;
    const iEnd = Math.min(n, i0 + B);
    for (let i = i0; i < iEnd; i++) {
      ph += dph;
      if (ph >= 1) ph -= 1;
      let s = 0;
      for (let k = 1; k <= K; k++) s += amps[k] * sn(k * ph);
      out[i] = s;
    }
  }
  const lp = new Bq('bp', 1500, 0.8, sr);
  const nb = Math.min(n, Math.floor(sr * 0.09));
  for (let i = 0; i < nb; i++) out[i] += lp.run(white()) * 0.09 * Math.exp(-i / sr / 0.02);
  finish(out, sr, 0.003);
  return { data: out, sr };
}

type Vowel = 'ah' | 'oo';
const VOWELS: Record<Vowel, [number, number, number][]> = {
  ah: [[760, 1, 95], [1180, 0.62, 120], [2600, 0.26, 170], [3350, 0.1, 220]],
  oo: [[330, 1, 65], [820, 0.34, 100], [2350, 0.05, 160]],
};

/** One cycle of a sung vowel (harmonics weighted by a formant envelope). */
function vowelTable(f0: number, vowel: Vowel, shift: number): Float32Array {
  const tab = new Float32Array(TBL + 1);
  const K = Math.max(1, Math.floor(5200 / f0));
  const F = VOWELS[vowel];
  for (let k = 1; k <= K; k++) {
    const f = k * f0;
    let env = 0.012;
    for (const [ff, g, bw] of F) env += g / (1 + Math.pow((f - ff * shift) / bw, 2));
    const a = env / Math.pow(k, 0.8);
    const phi = Math.random();
    for (let j = 0; j <= TBL; j++) tab[j] += a * sn((k * j) / TBL + phi);
  }
  let peak = 0;
  for (let j = 0; j <= TBL; j++) peak = Math.max(peak, Math.abs(tab[j]));
  if (peak > 0) for (let j = 0; j <= TBL; j++) tab[j] /= peak;
  return tab;
}

/** Choir ensemble: four voices reading a vowel wavetable with independent vibrato and drift. */
function choir(m: number, vowel: Vowel, attack = 0.3, dur = 4.4): Rendered {
  const f0 = mtof(m);
  const sr = 24000;
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  const tab = vowelTable(f0, vowel, m >= 62 ? 1.14 : 1);
  const voices: [number, number, number][] = [[-11, 4.7, 16], [0, 5.25, 13], [9, 5.0, 18], [-4, 5.6, 11]];
  for (const [det, rate, depth] of voices) {
    let ph = Math.random();
    const vph = Math.random();
    const aph = Math.random();
    let drift = 0;
    let driftT = 0;
    for (let i0 = 0; i0 < n; i0 += 32) {
      const t = i0 / sr;
      driftT += (white() * 6 - driftT) * 0.01;
      drift += (driftT - drift) * 0.05;
      const vibEnv = Math.min(1, Math.max(0, (t - 0.25) / 0.6));
      const cents = det + drift + depth * vibEnv * sn(rate * t + vph);
      const dph = (f0 * Math.pow(2, cents / 1200)) / sr;
      const amp = 0.25 * (1 + 0.08 * sn(0.6 * t + aph));
      const iEnd = Math.min(n, i0 + 32);
      for (let i = i0; i < iEnd; i++) {
        ph += dph;
        if (ph >= 1) ph -= 1;
        const x = ph * TBL;
        const j = x | 0;
        out[i] += amp * (tab[j] + (tab[j + 1] - tab[j]) * (x - j));
      }
    }
  }
  const f2 = VOWELS[vowel][1][0] * (m >= 62 ? 1.14 : 1);
  const bp = new Bq('bp', f2, 1.4, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t / attack));
    // a sung attack (fast) bursts a little above its sustain, like a choir's accent
    const acc = attack < 0.1 ? 1 + 0.45 * Math.exp(-t / 0.12) : 1;
    out[i] = (out[i] + bp.run(white()) * 0.05) * env * acc * (0.92 + 0.08 * Math.min(1, t / 1.5));
  }
  if (attack < 0.1) {
    // the consonant: a breathy 'h' just before the vowel speaks
    const hb = new Bq('bp', 2400, 0.9, sr);
    const nh = Math.min(n, Math.floor(sr * 0.08));
    for (let i = 0; i < nh; i++) out[i] += hb.run(white()) * 0.35 * Math.exp(-i / sr / 0.018);
  }
  finish(out, sr, 0.01);
  return { data: out, sr };
}

/** Crystal zap: detuned saw/square through a fast resonant low-pass sweep, with a pitch blip. */
function zap(m: number): Rendered {
  const f0 = mtof(m);
  const sr = 32000;
  const n = Math.floor(sr * 1.0);
  const out = new Float32Array(n);
  const K = Math.max(1, Math.floor(Math.min(12000, sr * 0.45) / f0));
  const a1 = new Float32Array(K + 1);
  const a2 = new Float32Array(K + 1);
  const det = Math.pow(2, 8 / 1200);
  let p1 = 0;
  let p2 = Math.random();
  for (let i0 = 0; i0 < n; i0 += 32) {
    const t = i0 / sr;
    const fc = f0 * 1.3 + 9000 * Math.exp(-t / 0.05) + 1400 * Math.exp(-t / 0.4);
    const A = (1 - Math.exp(-t / 0.0012)) * (0.28 + 0.72 * Math.exp(-t / 0.14)) * Math.exp(-t / 0.55);
    for (let k = 1; k <= K; k++) {
      const f = k * f0;
      const lp = 1 / Math.sqrt(1 + Math.pow(f / fc, 8));
      const res = 1 + 1.4 * Math.exp(-Math.pow((f - fc) / (0.25 * fc), 2));
      const g = A * lp * res;
      a1[k] = g * (0.55 / k + (k % 2 ? 0.45 / k : 0));
      a2[k] = (g * 0.5) / k;
    }
    const d1 = (f0 * Math.pow(2, (150 * Math.exp(-t / 0.01)) / 1200)) / sr;
    const d2 = d1 * det;
    const iEnd = Math.min(n, i0 + 32);
    for (let i = i0; i < iEnd; i++) {
      p1 += d1;
      p2 += d2;
      if (p1 >= 1) p1 -= 1;
      if (p2 >= 1) p2 -= 1;
      let s = 0;
      for (let k = 1; k <= K; k++) s += a1[k] * sn(k * p1) + a2[k] * sn(k * p2);
      out[i] = s;
    }
  }
  finish(out, sr, 0.001);
  return { data: out, sr };
}

/** Struck membrane: gliding modes + low thump + stick noise (taiko, toms, darbuka dum). */
function membrane(
  f0: number,
  o: { sr?: number; dur: number; modes: [number, number, number][]; glide: number; glideTau: number; thump: number; thumpTau: number; stick: number; stickLp: number; drive?: number },
): Rendered {
  const sr = o.sr ?? 24000;
  const n = Math.floor(sr * o.dur);
  const out = new Float32Array(n);
  for (const [r, a, tau] of o.modes) {
    let ph = Math.random();
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = a * Math.exp(-t / tau);
      if (env < 1e-5) break;
      ph += (f0 * r * (1 + o.glide * Math.exp(-t / o.glideTau))) / sr;
      out[i] += env * sn(ph);
    }
  }
  if (o.thump > 0) {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = o.thump * Math.exp(-t / o.thumpTau);
      if (env < 1e-5) break;
      ph += (f0 * 0.92 * (1 + 0.6 * Math.exp(-t / 0.02))) / sr;
      out[i] += env * sn(ph);
    }
  }
  if (o.stick > 0) {
    const lp = new Bq('lp', o.stickLp, 0.7, sr);
    const ns = Math.min(n, Math.floor(sr * 0.08));
    for (let i = 0; i < ns; i++) out[i] += lp.run(white()) * o.stick * Math.exp(-i / sr / 0.007);
  }
  if (o.drive) {
    const d = o.drive;
    const k = 1 / Math.tanh(d);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
    const g = peak > 0 ? 1 / peak : 1;
    for (let i = 0; i < n; i++) out[i] = Math.tanh(d * out[i] * g) * k;
  }
  finish(out, sr, 0.0008);
  return { data: out, sr };
}

/** Sub boom with an octave pitch drop and warm saturation (the Grave tower, the ff drop). */
function boom(m: number): Rendered {
  const f0 = mtof(m);
  const sr = 24000;
  const n = Math.floor(sr * 2.4);
  const out = new Float32Array(n);
  let ph = 0;
  const lp = new Bq('lp', 2600, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (f0 * (1 + 1.0 * Math.exp(-t / 0.045))) / sr;
    const A = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.85);
    let y = sn(ph) + 0.3 * sn(2 * ph) * Math.exp(-t / 0.5) + 0.12 * sn(3 * ph) * Math.exp(-t / 0.3);
    y = Math.tanh(1.8 * y * A) / Math.tanh(1.8);
    if (t < 0.03) y += lp.run(white()) * 0.25 * Math.exp(-t / 0.003);
    out[i] = y;
  }
  finish(out, sr, 0.001);
  return { data: out, sr };
}

/** Decaying filtered noise into `out` (helper for percussion). */
function noiseInto(out: Float32Array, sr: number, filters: Bq[], gain: number, tau: number, attack = 0.0005, from = 0): void {
  const n = out.length;
  for (let i = Math.floor(from * sr); i < n; i++) {
    const t = i / sr - from;
    const env = gain * (1 - Math.exp(-t / attack)) * Math.exp(-t / tau);
    if (t > 0.05 && env < 1e-5) break;
    let x = white();
    for (const f of filters) x = f.run(x);
    out[i] += x * env;
  }
}

/** Sum of decaying sine partials [freq Hz, amp, tau] into `out`. */
function pingsInto(out: Float32Array, sr: number, parts: [number, number, number][], from = 0): void {
  const n = out.length;
  for (const [f, a, tau] of parts) {
    if (f >= sr * 0.45) continue;
    let ph = Math.random();
    const d = f / sr;
    for (let i = Math.floor(from * sr); i < n; i++) {
      const t = i / sr - from;
      const env = a * Math.exp(-t / tau);
      if (env < 1e-5) break;
      ph += d;
      out[i] += env * sn(ph);
    }
  }
}

function perc(dur: number, sr: number, build: (out: Float32Array, sr: number) => void, attack = 0.0005): Rendered {
  const out = new Float32Array(Math.floor(sr * dur));
  build(out, sr);
  finish(out, sr, attack);
  return { data: out, sr };
}

function kick(): Rendered {
  const sr = 24000;
  const n = Math.floor(sr * 0.6);
  const out = new Float32Array(n);
  let ph = 0;
  const lp = new Bq('lp', 5000, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (48 + 130 * Math.exp(-t / 0.03)) / sr;
    let y = sn(ph) * (1 - Math.exp(-t / 0.0008)) * Math.exp(-t / 0.28);
    if (t < 0.02) y += lp.run(white()) * 0.4 * Math.exp(-t / 0.0025);
    out[i] = Math.tanh(1.5 * y);
  }
  finish(out, sr, 0.0005);
  return { data: out, sr };
}

function snare(): Rendered {
  return perc(0.5, 32000, (out, sr) => {
    for (const [f, a, tau] of [[185, 0.8, 0.09], [330, 0.4, 0.06]] as [number, number, number][]) {
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        ph += (f * (1 + 0.06 * Math.exp(-t / 0.015))) / sr;
        out[i] += a * Math.exp(-t / tau) * sn(ph);
      }
    }
    noiseInto(out, sr, [new Bq('hp', 1200, 0.7, sr), new Bq('lp', 9000, 0.7, sr)], 0.9, 0.11, 0.0008);
    noiseInto(out, sr, [new Bq('bp', 4200, 0.8, sr)], 0.18, 0.2);
  });
}

function brush(): Rendered {
  return perc(0.45, 32000, (out, sr) => {
    const bp = new Bq('bp', 3600, 0.5, sr);
    let grain = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      grain += (Math.random() - grain) * 0.02;
      const env = Math.min(1, t / 0.008) * Math.exp(-t / 0.09);
      out[i] = bp.run(white()) * env * (0.55 + 0.9 * grain);
    }
    pingsInto(out, sr, [[210, 0.06, 0.05]]);
  }, 0.004);
}

function hat(open: boolean): Rendered {
  return perc(open ? 0.9 : 0.14, 32000, (out, sr) => {
    const tm = open ? 0.32 : 0.022;
    pingsInto(out, sr, [3150, 4210, 5280, 6430, 7590, 8840].map((f) => [f * (0.98 + Math.random() * 0.04), 0.12, tm] as [number, number, number]));
    noiseInto(out, sr, [new Bq('hp', 6500, 0.7, sr)], 0.8, open ? 0.3 : 0.028);
    const hp = new Bq('hp', 5000, 0.7, sr);
    for (let i = 0; i < out.length; i++) out[i] = hp.run(out[i]);
  });
}

function shaker(): Rendered {
  return perc(0.17, 32000, (out, sr) => {
    const f = () => [new Bq('bp', 6200, 0.9, sr), new Bq('hp', 3500, 0.7, sr)];
    noiseInto(out, sr, f(), 0.9, 0.035, 0.012);
    noiseInto(out, sr, f(), 0.35, 0.025, 0.006, 0.042);
  }, 0.008);
}

function tamb(): Rendered {
  return perc(0.5, 32000, (out, sr) => {
    noiseInto(out, sr, [new Bq('hp', 5000, 0.7, sr)], 0.5, 0.06);
    for (const at of [0, 0.008, 0.019]) {
      const parts: [number, number, number][] = [];
      for (let k = 0; k < 8; k++) parts.push([5000 + Math.random() * 6000, 0.07, 0.1 + Math.random() * 0.15]);
      pingsInto(out, sr, parts, at);
    }
  });
}

function tick(): Rendered {
  return perc(0.07, 32000, (out, sr) => {
    noiseInto(out, sr, [new Bq('hp', 2000, 0.7, sr)], 0.6, 0.0015);
    pingsInto(out, sr, [[3200, 0.5, 0.006], [1900, 0.35, 0.01]]);
  });
}

function crash(): Rendered {
  return perc(3.6, 32000, (out, sr) => {
    noiseInto(out, sr, [new Bq('hp', 2500, 0.7, sr)], 0.55, 1.3, 0.001);
    noiseInto(out, sr, [new Bq('hp', 4000, 0.7, sr)], 0.6, 0.08, 0.0008);
    noiseInto(out, sr, [new Bq('bp', 900, 0.6, sr)], 0.12, 0.5, 0.002);
    const parts: [number, number, number][] = [];
    for (let k = 0; k < 28; k++) parts.push([2600 + Math.random() * 8000, 0.02 + Math.random() * 0.03, 0.5 + Math.random() * 1.6]);
    pingsInto(out, sr, parts);
  }, 0.001);
}

function tek(): Rendered {
  return perc(0.16, 32000, (out, sr) => {
    noiseInto(out, sr, [new Bq('hp', 2500, 0.7, sr)], 0.7, 0.004);
    pingsInto(out, sr, [[2900, 0.5, 0.025], [4300, 0.3, 0.018], [6100, 0.15, 0.01]]);
  });
}

function clap(): Rendered {
  return perc(0.42, 32000, (out, sr) => {
    for (const at of [0, 0.011, 0.023, 0.034]) noiseInto(out, sr, [new Bq('bp', 1150, 1.2, sr)], at === 0.034 ? 0.9 : 0.6, at === 0.034 ? 0.09 : 0.006, 0.0005, at);
  });
}

function rim(): Rendered {
  return perc(0.12, 32000, (out, sr) => {
    noiseInto(out, sr, [new Bq('bp', 1800, 2, sr)], 0.6, 0.008);
    pingsInto(out, sr, [[1700, 0.5, 0.02], [800, 0.3, 0.03]]);
  });
}

/** Gong: inharmonic partials whose upper modes bloom in after the strike. */
function gong(m: number): Rendered {
  const f0 = mtof(m);
  const sr = 24000;
  const n = Math.floor(sr * 7);
  const out = new Float32Array(n);
  const P: [number, number, number][] = [[1, 1, 5], [1.42, 0.7, 4], [1.98, 0.55, 3.5], [2.48, 0.45, 3], [2.95, 0.35, 2.6], [3.6, 0.3, 2.2], [4.3, 0.22, 1.8], [5.1, 0.16, 1.5], [6.2, 0.1, 1.2]];
  P.forEach(([r, a, tau], k) => {
    const f = f0 * r * (0.985 + Math.random() * 0.03);
    if (f >= sr * 0.45) return;
    let ph = Math.random();
    const ta = 0.05 + 0.07 * k;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += f / sr;
      out[i] += a * (1 - Math.exp(-t / ta)) * Math.exp(-t / tau) * sn(ph);
    }
  });
  pingsInto(out, sr, [[f0 * 0.8, 0.6, 0.3]]);
  noiseInto(out, sr, [new Bq('lp', 1200, 0.7, sr)], 0.3, 0.02);
  finish(out, sr, 0.002);
  return { data: out, sr };
}


/**
 * The battle drum of the drum tower: a tight, bright snare-tom (a tuned shell, a hard stick and
 * snare wires). Unlike the turtle's deep footstep drum it lives in the mids and highs, so it cuts
 * through the backing on any speaker.
 */
function tdrum(m: number): Rendered {
  const f0 = mtof(m);
  const sr = 32000;
  const r = membrane(f0, {
    sr, dur: 0.8,
    modes: [[1, 1, 0.12], [1.59, 0.7, 0.08], [2.14, 0.55, 0.06], [2.65, 0.4, 0.045], [3.16, 0.3, 0.035], [3.65, 0.2, 0.028]],
    glide: 0.16, glideTau: 0.015, thump: 0.15, thumpTau: 0.03, stick: 1.3, stickLp: 7000, drive: 1.6,
  });
  const out = r.data;
  // snare wires (rattle) and the stick's crack
  noiseInto(out, sr, [new Bq('hp', 1300, 0.7, sr), new Bq('lp', 9000, 0.7, sr)], 1.6, 0.11, 0.0008);
  noiseInto(out, sr, [new Bq('bp', 2600, 1.0, sr)], 2.2, 0.014, 0.0004);
  // the shell's ring an octave and a fifth up (a crisp, pitched 'tak')
  pingsInto(out, sr, [[f0 * 3.0, 0.45, 0.06], [f0 * 4.5, 0.3, 0.04]]);
  finish(out, sr, 0.0004);
  return { data: out, sr };
}

/**
 * The bass tower's voice: a bright, growling plucked bass (strong 2nd–8th harmonics and a slap
 * click) — the fundamental can sit an octave lower, the harmonics are what a phone speaker plays.
 */
function tbass(m: number): Rendered {
  const f0 = mtof(m);
  const sr = 32000;
  const P: [number, number, number, number?][] = [];
  for (let k = 1; k * f0 < 6000 && k <= 40; k++) {
    const f = k * f0;
    const formant = 1 + 1.6 / (1 + Math.pow((f - 900) / 450, 2)) + 0.6 / (1 + Math.pow((f - 2200) / 700, 2));
    P.push([k, (formant / Math.pow(k, 0.75)) * (k === 1 ? 0.9 : 1), 1.2 / (1 + 0.22 * k), k % 2 ? 0 : 2]);
  }
  const out = additive(sr, 1.8, f0, P, { attack: 0.0015, noise: 0.5, noiseTau: 0.006, noiseLp: 5000 });
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(1.8 * out[i]) / Math.tanh(1.8);
  finish(out, sr, 0.0015);
  return { data: out, sr };
}

const NEW_SPECS = {
  mando: { lo: 48, hi: 96, step: 4, render: (m: number) => ks(mtof(m), { dur: clamp(2.2 - (m - 55) * 0.02, 0.9, 2.2), t60: clamp(1.5 - (m - 55) * 0.015, 0.6, 1.6), bright: 0.86, pick: 0.15, soft: 7000 }) },
  brass: { lo: 36, hi: 77, step: 3, render: brass },
  choir: { lo: 45, hi: 81, step: 3, render: (m: number) => choir(m, 'ah') },
  choiroo: { lo: 45, hi: 81, step: 3, render: (m: number) => choir(m, 'oo') },
  choirx: { lo: 48, hi: 84, step: 3, render: (m: number) => choir(m, 'ah', 0.035, 3.2) },
  tdrum: { lo: 43, hi: 67, step: 3, render: tdrum },
  tbass: { lo: 28, hi: 60, step: 3, render: tbass },
  zap: { lo: 57, hi: 99, step: 3, render: zap },
  spicc: {
    lo: 33, hi: 81, step: 4,
    render: (m: number) => {
      const f = mtof(m);
      const P: [number, number, number, number?][] = [];
      for (let k = 1; k * f < 7000; k++) {
        const fk = k * f;
        const body = 0.45 + 0.55 / (1 + Math.pow((fk - 450) / 350, 2)) + 0.35 / (1 + Math.pow((fk - 2600) / 900, 2));
        P.push([k, body / k, 0.34 / (1 + 0.12 * k), k % 2 ? 1.5 : -1.5]);
      }
      return { data: additive(28000, 0.75, f, P, { attack: 0.012, noise: 0.08, noiseTau: 0.02, noiseLp: 4000 }), sr: 28000 };
    },
  },
  tbell: {
    lo: 48, hi: 88, step: 4,
    render: (m: number) => {
      const f = mtof(m);
      const T = clamp(6.5 - (m - 60) * 0.06, 3.5, 7.5);
      const P: [number, number, number, number?][] = [
        [0.5, 0.22, T * 1.1], [1, 1, T * 0.75], [1, 0.35, T * 0.9, 2.2], [2, 0.5, T * 0.55], [2, 0.2, T * 0.6, -1.8],
        [3, 0.28, T * 0.35], [4, 0.14, T * 0.22], [5.04, 0.06, T * 0.15], [6.27, 0.05, T * 0.08], [8.1, 0.03, T * 0.05],
      ];
      return { data: additive(24000, Math.min(8, T * 1.25), f, P, { noise: 0.05, noiseTau: 0.003, noiseLp: 3000, attack: 0.0015 }), sr: 24000 };
    },
  },
  mbox: {
    lo: 64, hi: 100, step: 4,
    render: (m: number) => ({ data: additive(36000, 2.0, mtof(m), [[1, 1, 1.1], [1, 0.3, 0.9, 6], [6.27, 0.18, 0.12], [17.55, 0.04, 0.03]], { noise: 0.04, noiseTau: 0.0015, noiseLp: 6000 }), sr: 36000 }),
  },
  boom: { lo: 24, hi: 52, step: 4, render: boom },
  anvil: {
    lo: 64, hi: 96, step: 4,
    render: (m: number) => ({ data: additive(32000, 2.6, mtof(m), [[1, 1, 1.6], [2.72, 0.6, 0.9], [4.19, 0.42, 0.6], [5.6, 0.25, 0.42], [7.5, 0.15, 0.25], [9.9, 0.08, 0.15]], { noise: 0.25, noiseTau: 0.002, noiseLp: 8000 }), sr: 32000 }),
  },
  timp: {
    lo: 36, hi: 60, step: 3,
    render: (m: number) => ({
      data: additive(24000, 3.2, mtof(m), [[1, 1, 2.4], [1.504, 0.75, 1.7], [1.742, 0.5, 1.2], [2.0, 0.45, 1.0], [2.245, 0.3, 0.8], [2.494, 0.22, 0.6], [2.8, 0.12, 0.45], [2.95, 0.1, 0.35]], { noise: 0.25, noiseTau: 0.012, noiseLp: 700, attack: 0.002 }),
      sr: 24000,
    }),
  },
  taiko: {
    lo: 28, hi: 56, step: 4,
    render: (m: number) => {
      const f0 = mtof(m);
      const size = clamp(90 / f0, 0.6, 1.6);
      return membrane(f0, {
        dur: 2.0,
        modes: [[1, 1, 0.75 * size], [1.59, 0.42, 0.36 * size], [2.14, 0.28, 0.26 * size], [2.3, 0.2, 0.22 * size], [2.65, 0.14, 0.17 * size], [2.92, 0.1, 0.14 * size], [3.16, 0.07, 0.1 * size]],
        glide: 0.2, glideTau: 0.03, thump: 0.7, thumpTau: 0.22 * size, stick: 0.5, stickLp: 1600, drive: 1.3,
      });
    },
  },
  tom: {
    lo: 40, hi: 68, step: 4,
    render: (m: number) => membrane(mtof(m), { dur: 0.9, modes: [[1, 1, 0.45], [1.59, 0.35, 0.2], [2.14, 0.2, 0.12]], glide: 0.12, glideTau: 0.04, thump: 0.3, thumpTau: 0.1, stick: 0.35, stickLp: 3000, drive: 1.1 }),
  },
  kick: { lo: 60, hi: 60, step: 12, render: () => kick() },
  snare: { lo: 60, hi: 60, step: 12, render: () => snare() },
  brush: { lo: 60, hi: 60, step: 12, render: () => brush() },
  hat: { lo: 60, hi: 60, step: 12, render: () => hat(false) },
  ohat: { lo: 60, hi: 60, step: 12, render: () => hat(true) },
  shaker: { lo: 60, hi: 60, step: 12, render: () => shaker() },
  tamb: { lo: 60, hi: 60, step: 12, render: () => tamb() },
  tick: { lo: 60, hi: 60, step: 12, render: () => tick() },
  crash: { lo: 60, hi: 60, step: 12, render: () => crash() },
  dum: {
    lo: 60, hi: 60, step: 12,
    render: () => membrane(105, { dur: 0.7, modes: [[1, 1, 0.28], [1.59, 0.3, 0.12], [2.14, 0.18, 0.08]], glide: 0.08, glideTau: 0.03, thump: 0.4, thumpTau: 0.12, stick: 0.3, stickLp: 1500 }),
  },
  tek: { lo: 60, hi: 60, step: 12, render: () => tek() },
  clap: { lo: 60, hi: 60, step: 12, render: () => clap() },
  gong: { lo: 60, hi: 60, step: 12, render: () => gong(40) },
  rim: { lo: 60, hi: 60, step: 12, render: () => rim() },
};

export const SPECS: Record<BufInst, InstSpec> = {
  piano: {
    lo: 33, hi: 100, step: 3,
    render: (m) => {
      const f0 = mtof(m);
      const sr = m < 84 ? 24000 : 32000;
      const tau1 = clamp(3.4 * Math.pow(2, -(m - 48) / 22), 0.7, 5.2);
      const B = 0.00018 + 0.0007 * Math.max(0, (m - 72) / 24);
      const np = Math.max(3, Math.min(14, Math.floor(5200 / f0)));
      const partials: [number, number, number, number?][] = [];
      for (let k = 1; k <= np; k++) {
        const ratio = k * Math.sqrt(1 + B * k * k);
        const felt = 1 / (1 + Math.pow((k * f0) / 1700, 2));
        const amp = (1 / Math.pow(k, 1.15)) * felt * (k === 1 ? 1.1 : 1);
        const tau = tau1 / (1 + 0.22 * (k - 1) + (k * f0) / 3500);
        partials.push([ratio, amp * 0.6, tau * 0.42, 0.4]);
        partials.push([ratio, amp * 0.42, tau * 1.15, -0.4]);
      }
      const dur = Math.min(5, tau1 * 1.4 + 0.4);
      return { data: additive(sr, dur, f0, partials, { attack: 0.0025, noise: 0.05, noiseTau: 0.005, noiseLp: 1400 }), sr };
    },
  },
  epiano: {
    lo: 40, hi: 96, step: 4,
    render: (m) => {
      const f = mtof(m);
      const sr = 28000;
      const dur = clamp(3.6 - (m - 48) * 0.03, 1.4, 3.6);
      const n = Math.floor(sr * dur);
      const out = new Float32Array(n);
      const tauC = clamp(2.2 - (m - 48) * 0.02, 0.8, 2.4);
      const I0 = 1.6;
      const tine = f * 7 < sr * 0.45;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const I = I0 * Math.exp(-t / 0.35) + 0.25;
        const ph = 2 * Math.PI * f * t;
        out[i] =
          Math.sin(ph + I * Math.sin(ph)) * Math.exp(-t / tauC) +
          (tine ? 0.12 * Math.sin(ph * 7.0) * Math.exp(-t / 0.012) : 0) +
          0.18 * Math.sin(ph * 2) * Math.exp(-t / 0.4);
      }
      finish(out, sr, 0.002);
      return { data: out, sr };
    },
  },
  harp: { lo: 36, hi: 100, step: 4, render: (m) => ks(mtof(m), { dur: clamp(3.9 - (m - 48) * 0.04, 1.5, 3.9), t60: clamp(4.2 - (m - 48) * 0.06, 1.2, 4.5), bright: 0.55, pick: 0.3, soft: 5000 }) },
  guitar: { lo: 38, hi: 88, step: 4, render: (m) => ks(mtof(m), { dur: clamp(4 - (m - 45) * 0.05, 1.4, 4), t60: clamp(3.2 - (m - 45) * 0.05, 0.9, 3.4), bright: 0.32, pick: 0.17, soft: 3200 }) },
  koto: { lo: 48, hi: 96, step: 4, render: (m) => ks(mtof(m), { dur: clamp(3.2 - (m - 55) * 0.03, 1.2, 3.2), t60: clamp(2.6 - (m - 55) * 0.03, 0.9, 2.8), bright: 0.75, pick: 0.1, soft: 6500 }) },
  oud: { lo: 40, hi: 84, step: 4, render: (m) => ks(mtof(m), { dur: clamp(2.2 - (m - 50) * 0.02, 0.9, 2.2), t60: clamp(1.7 - (m - 50) * 0.02, 0.6, 1.8), bright: 0.62, pick: 0.12, nasal: 850, soft: 4200 }) },
  pizz: { lo: 28, hi: 88, step: 4, render: (m) => ks(mtof(m), { dur: 0.9, t60: clamp(0.65 - (m - 40) * 0.006, 0.25, 0.7), bright: 0.3, pick: 0.24, soft: 2400 }) },
  harpsi: { lo: 36, hi: 96, step: 4, render: (m) => ks(mtof(m), { dur: clamp(2.6 - (m - 48) * 0.02, 1.2, 2.6), t60: clamp(2.1 - (m - 48) * 0.025, 0.8, 2.2), bright: 0.96, pick: 0.07, soft: 9000 }) },
  kalimba: {
    lo: 48, hi: 100, step: 4,
    render: (m) => {
      const f = mtof(m);
      const tau = clamp(1.5 - (m - 60) * 0.015, 0.5, 1.6);
      return { data: additive(32000, tau * 2.2, f, [[1, 1, tau], [2.0, 0.05, 0.35], [5.4, 0.2, 0.07], [9.6, 0.05, 0.03]], { noise: 0.05, noiseTau: 0.002, noiseLp: 4000 }), sr: 32000 };
    },
  },
  marimba: {
    lo: 40, hi: 100, step: 4,
    render: (m) => {
      const f = mtof(m);
      const tau = clamp(1.0 - (m - 55) * 0.012, 0.18, 1.1);
      return { data: additive(28000, tau * 2.6 + 0.1, f, [[1, 1, tau], [3.93, 0.32, tau * 0.14], [9.2, 0.1, 0.035]], { noise: 0.06, noiseTau: 0.003, noiseLp: 2000 }), sr: 28000 };
    },
  },
  celesta: {
    lo: 55, hi: 108, step: 4,
    render: (m) => {
      const f = mtof(m);
      const tau = clamp(1.6 - (m - 72) * 0.015, 0.5, 1.8);
      return { data: additive(36000, tau * 2.4, f, [[1, 1, tau], [2.0, 0.22, tau * 0.35], [3.0, 0.07, tau * 0.18], [4.16, 0.05, 0.08]], { noise: 0.03, noiseTau: 0.0015, noiseLp: 6000 }), sr: 36000 };
    },
  },
  glass: {
    lo: 52, hi: 108, step: 4,
    render: (m) => {
      const f = mtof(m);
      const tau = clamp(3.0 - (m - 72) * 0.03, 0.9, 3.4);
      return {
        data: additive(36000, tau * 2.2, f, [[1, 1, tau], [2.756, 0.42, tau * 0.5], [5.404, 0.2, tau * 0.25], [8.933, 0.09, tau * 0.12]], { noise: 0.02, noiseTau: 0.001, noiseLp: 7000, attack: 0.003 }),
        sr: 36000,
      };
    },
  },
  bell: {
    lo: 28, hi: 84, step: 4,
    render: (m) => {
      const f = mtof(m);
      const T = clamp(6 - (m - 48) * 0.06, 2.5, 7);
      const P: [number, number, number][] = [
        [0.5, 0.35, T], [1.0, 0.6, T * 0.7], [1.183, 0.45, T * 0.5], [1.506, 0.3, T * 0.42], [2.0, 0.5, T * 0.36],
        [2.514, 0.2, T * 0.24], [2.662, 0.18, T * 0.2], [3.011, 0.14, T * 0.16], [4.166, 0.1, T * 0.1], [5.433, 0.06, T * 0.06],
      ];
      return { data: additive(24000, Math.min(8, T * 1.2), f, P, { noise: 0.04, noiseTau: 0.004, noiseLp: 2500, attack: 0.002 }), sr: 24000 };
    },
  },
  tile: {
    lo: 48, hi: 108, step: 4,
    render: (m) => {
      const f = mtof(m);
      const tau = clamp(0.9 - (m - 72) * 0.01, 0.35, 1.0);
      return { data: additive(36000, tau * 2.2, f, [[1, 1, tau], [2.0, 0.12, tau * 0.3], [4.07, 0.16, tau * 0.13], [6.8, 0.04, 0.04]], { noise: 0.025, noiseTau: 0.0012, noiseLp: 5000 }), sr: 36000 };
    },
  },
  wood: {
    lo: 36, hi: 96, step: 6,
    render: (m) => {
      const f = mtof(m);
      return { data: additive(28000, 0.45, f, [[1, 1, 0.11], [2.45, 0.45, 0.05], [4.6, 0.22, 0.025], [7.1, 0.08, 0.012]], { noise: 0.12, noiseTau: 0.002, noiseLp: 3000 }), sr: 28000 };
    },
  },
  ...NEW_SPECS,
};

/** Zone (pitch the buffer is rendered at) used for a MIDI note. */
export function zoneOf(inst: BufInst, midi: number): number {
  const s = SPECS[inst];
  const z = s.lo + Math.round((midi - s.lo) / s.step) * s.step;
  return clamp(z, s.lo, s.lo + Math.floor((s.hi - s.lo) / s.step) * s.step);
}

export function zonesIn(inst: BufInst, lo: number, hi: number): number[] {
  const s = SPECS[inst];
  const out: number[] = [];
  for (let m = Math.max(lo, s.lo); m <= Math.min(hi, s.hi) + s.step; m += s.step) {
    const z = zoneOf(inst, m);
    if (!out.includes(z)) out.push(z);
  }
  return out;
}

export function renderZone(inst: BufInst, zone: number): Rendered {
  return SPECS[inst].render(zone);
}

export type ReverbKind = 'hall' | 'cave' | 'spire';

/** Procedural stereo impulse response (diffuse tail with frequency-dependent damping). */
export function makeImpulseData(mode: ReverbKind, sr: number): [Float32Array, Float32Array] {
  const spec = {
    hall: { len: 2.9, pre: 0.014, decay: 2.3, damp0: 0.55, damp1: 0.12, er: 6, bright: 0.0 },
    cave: { len: 6.5, pre: 0.035, decay: 5.4, damp0: 0.45, damp1: 0.08, er: 10, bright: 0.0 },
    spire: { len: 5.2, pre: 0.03, decay: 4.2, damp0: 0.85, damp1: 0.35, er: 4, bright: 0.25 },
  }[mode];
  const n = Math.floor(sr * spec.len);
  const pre = Math.floor(spec.pre * sr);
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch++) {
    const d = out[ch];
    let lp = 0;
    let lp2 = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.9 * t) / spec.decay);
      const k = spec.damp1 + (spec.damp0 - spec.damp1) * Math.exp(-t / (spec.decay * 0.35));
      const x = Math.random() * 2 - 1;
      lp += k * (x - lp);
      lp2 += 0.5 * (lp - lp2);
      const fadeIn = Math.min(1, t / 0.02);
      const shimmer = spec.bright > 0 ? spec.bright * Math.sin(t * 1300 + ch) * (x * 0.5) : 0;
      d[i] = (lp2 * 0.85 + lp * 0.15 + shimmer * env) * env * fadeIn;
    }
    for (let e = 0; e < spec.er; e++) {
      const idx = pre + Math.floor((0.004 + Math.random() * 0.07) * sr);
      if (idx < n) d[idx] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - e * 0.03) * 0.6;
    }
    const fade = Math.floor(0.08 * sr);
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
  }
  return out;
}

/** Fast seeded noise (xorshift) for loopable noise beds. */
export function makeNoiseData(kind: 'white' | 'pink' | 'brown', n: number, sr: number): Float32Array {
  const d = new Float32Array(n);
  let s = (Math.random() * 0xffffffff) >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
  if (kind === 'white') {
    for (let i = 0; i < n; i++) d[i] = rnd();
  } else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = rnd();
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * rnd()) / 1.02;
      d[i] = last * 3.5;
    }
  }
  const xf = Math.min(n >> 1, Math.floor(sr * 0.05));
  for (let i = 0; i < xf; i++) {
    const a = i / xf;
    d[n - xf + i] = d[n - xf + i] * (1 - a) + d[i] * a;
  }
  return d;
}
