/**
 * Tower voices, impacts, enemy deaths, coins, deflects — the sounds that ARE notes of the song.
 *
 *  - Every pitch comes from the song's harmony at the exact time `t` (Director.chordAt), which
 *    is a pure function of the bar index, so towers are always consonant with the backing. The
 *    chord a note is chosen from is locked, so a late intensity change can never re-harmonise it.
 *  - The towers carry the melody during waves: the first harp follows the song's tune (its
 *    `guide`), a second harp harmonises it, the others arpeggiate; bells toll the tune's strong notes
 *    and crystal sparkles climb from it.
 *  - Duets change how partners play: serenade (harp dyads/chords), shimmer (crystal interlocks with
 *    the bell), fanfare (horn calls), hymn (the choir holds, the bell sings with it), groove (accented
 *    shakers with claps), groundwork (the drum lands with a sub), thunder (bass drops glint), march.
 *  - Mix safety with 20+ towers: per-kind caps per 16th step, a global cap per step, velocity that
 *    falls with the number of towers of a kind heard in the last bar, shared pan buses (a voice is
 *    just source + gain), compressed panning for low sounds, and a glue compressor on the bus.
 *  - Sounds start exactly at `t` (no humanisation) so they sit on the grid.
 */
import type { DuetId, EnemyKind, TowerKind } from '../../sim/defs';
import type { BandMix } from '../api';
import type { Core } from './core';
import { Fx } from './fx';
import type { Director } from './music';
import { BufferBank, Channel, type BufInst, playBuf } from './synth';
import { bassNote, chord, chordTones, type Chord, nearestChordTone, pcOf, voiceLead } from './theory';
import { clamp, rand } from './util';

type WetClass = 0 | 1 | 2;

interface KindCfg {
  cap: number;
  base: number;
  wet: WetClass;
  panMul: number;
}

const KIND: Record<TowerKind, KindCfg> = {
  harp: { cap: 3, base: 0.6, wet: 1, panMul: 1 },
  drum: { cap: 2, base: 0.21, wet: 0, panMul: 0.35 },
  bell: { cap: 2, base: 0.14, wet: 2, panMul: 0.8 },
  shaker: { cap: 1, base: 0.24, wet: 1, panMul: 1 },
  crystal: { cap: 3, base: 0.36, wet: 1, panMul: 1 },
  horn: { cap: 3, base: 0.38, wet: 1, panMul: 0.6 },
  choir: { cap: 1, base: 0.135, wet: 2, panMul: 0.5 },
  bass: { cap: 1, base: 0.26, wet: 0, panMul: 0.2 },
};

const BUS_PANS = [-0.65, -0.32, 0, 0.32, 0.65];
const WETS = [0.07, 0.2, 0.42];
/** at most this many tower voices start on one 16th step */
const STEP_CAP = 10;
/** the tower bus compressor delays its signal by its 6 ms look-ahead: towers start that much earlier
 *  so they leave the mix exactly together with the music (which skips that compressor) */
const COMP = 0.006;

const pingpong = (i: number, n: number): number => {
  if (n <= 1) return 0;
  const p = 2 * n - 2;
  const k = ((i % p) + p) % p;
  return k < n ? k : p - k;
};

/** the pitch of `g` moved by octaves into [lo, hi] */
const fold = (g: number, lo: number, hi: number): number => {
  let m = g;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
};

export class Towers {
  private readonly fx: Fx;
  private readonly buses: Channel[][];
  private readonly stepCounts = new Map<string, number>();
  private readonly lastByVoice: Record<string, Map<number, number>> = {};
  private readonly crystal = new Map<number, { step: number; idx: number }>();
  private readonly choirStep = new Map<number, { notes: number[]; extra: number }>();
  private deathBar = -1;
  private deathIdx = 0;
  private coinBar = -1;
  private coinIdx = 0;
  private lastCoin = -1;
  private coinAcc = 0;
  private lastDeflect = -1;
  private prune = 0;
  private duets: ReadonlySet<DuetId> = new Set();
  /** the last bell pitch (shimmer: crystal answers around it) */
  private lastBell = 72;
  /** when set, every tower voice start time is recorded (grid checks) */
  debugLog: { kind: string; t: number }[] | null = null;

  constructor(
    private readonly core: Core,
    private readonly bank: BufferBank,
    private readonly director: Director,
  ) {
    this.fx = new Fx(core, bank);
    this.buses = WETS.map((wet) => BUS_PANS.map((pan) => new Channel(core, core.towerBus, core.sfxWet, { pan, wet, gain: 1 })));
    // tower instruments first (they are the melody of every battle)
    bank.warm('harp', 55, 96, 3);
    bank.warm('taiko', 30, 46, 3);
    bank.warm('tbell', 55, 80, 3);
    bank.warm('shaker', 60, 60, 3);
    bank.warm('zap', 70, 93, 3);
    bank.warm('brass', 45, 75, 3);
    bank.warm('choir', 53, 76, 4);
    bank.warm('choiroo', 53, 76, 4);
    bank.warm('boom', 26, 42, 3);
    bank.warm('celesta', 74, 98, 4);
    bank.warm('glass', 76, 98, 4);
    bank.warm('tick', 60, 60, 4);
    bank.warm('kick', 60, 60, 4);
    bank.warm('anvil', 84, 96, 5);
  }

  setBand(m: BandMix): void {
    this.duets = new Set(m.duets);
  }

  // ───────────────────────────── grid & harmony ─────────────────────────────

  private grid(t: number): { step: number; stepInBar: number; barDur: number; spb: number; bar: number } {
    const p = this.director.ref;
    if (!p) {
      const spb = 0.6;
      const step = Math.round(t / (spb / 4));
      return { step, stepInBar: ((step % 16) + 16) % 16, barDur: spb * 4, spb, bar: Math.floor(step / 16) };
    }
    const sd = p.spb / 4;
    const step = Math.round((t - p.t0) / sd);
    const spbar = p.theme.beats * 4;
    return { step, stepInBar: ((step % spbar) + spbar) % spbar, barDur: p.barDur, spb: p.spb, bar: Math.floor(step / spbar) };
  }

  /** the chord a note sounding at t is chosen from (locked: it will not change any more) */
  private chordAt(t: number): Chord {
    return this.director.chordAt(t, true) ?? chord('C');
  }

  /** a chord a little later (durations only: never locks) */
  private peek(t: number): Chord {
    return this.director.chordAt(t) ?? chord('C');
  }

  /** time until the harmony no longer contains `midi` (max `maxBeats` beats) */
  private holdFor(t: number, midi: number, spb: number, maxBeats: number): number {
    const pc = pcOf(midi);
    for (let k = 1; k <= maxBeats; k++) {
      const c = this.peek(t + k * spb - 0.001);
      if (!c.pcs.includes(pc)) return Math.max(spb * 0.9, k * spb - 0.03);
    }
    return maxBeats * spb;
  }

  /** claims a slot on this 16th step for `kind`; returns its order (0 = first) or −1 if full */
  private claim(kind: string, step: number, cap: number): number {
    const key = `${kind}:${step}`;
    const all = `*:${step}`;
    const n = this.stepCounts.get(key) ?? 0;
    const tot = this.stepCounts.get(all) ?? 0;
    if (n >= cap || tot >= STEP_CAP) return -1;
    this.stepCounts.set(key, n + 1);
    this.stepCounts.set(all, tot + 1);
    if (++this.prune > 400) {
      this.prune = 0;
      for (const k of this.stepCounts.keys()) {
        const s = Number(k.slice(k.indexOf(':') + 1));
        if (s < step - 256) this.stepCounts.delete(k);
      }
    }
    return n;
  }

  /** all towers heard recently (any kind) → a gentle global factor so 30 towers ≈ a few dB above 5 */
  private readonly all = new Map<string, number>();
  private globalDensity(kind: string, voice: number, t: number, barDur: number): number {
    this.all.set(`${kind}:${voice}`, t);
    let n = 0;
    for (const [k, tt] of this.all) {
      if (tt > t - barDur * 1.25) n++;
      else if (tt < t - barDur * 8) this.all.delete(k);
    }
    return 1 / Math.sqrt(1 + 0.07 * Math.max(0, n - 1));
  }

  /** overall level of tower voices: calibrated so that one tower of each kind ≈ the backing's loudness */
  trim = 0.66;

  /** velocity factor from how many towers of this kind were heard during the last bar */
  private density(kind: TowerKind, voice: number, t: number, barDur: number): number {
    let m = this.lastByVoice[kind];
    if (!m) m = this.lastByVoice[kind] = new Map();
    m.set(voice, t);
    let n = 0;
    for (const [v, tt] of m) {
      if (tt > t - barDur * 1.25) n++;
      else if (tt < t - barDur * 8) m.delete(v);
    }
    return 1 / Math.sqrt(1 + 0.35 * Math.max(0, n - 1));
  }

  /** this voice's rank among the towers of its kind heard in the last 1.5 bars (0 = the oldest = the lead) */
  private rank(kind: TowerKind, voice: number, t: number, barDur: number): number {
    const m = this.lastByVoice[kind];
    if (!m) return 0;
    let r = 0;
    for (const [v, tt] of m) if (v < voice && tt > t - barDur * 1.5) r++;
    return r;
  }

  private bus(wet: WetClass, pan: number, mul: number): Channel {
    const p = clamp((Number.isFinite(pan) ? pan : 0) * mul, -1, 1);
    const i = clamp(Math.round((p + 1) * 2), 0, 4);
    return this.buses[wet][i];
  }

  private note(inst: BufInst, ch: Channel, t: number, midi: number, vel: number, dur: number, o: { release?: number; lp?: number; cap?: number; cat?: string; bend?: number; bendTime?: number } = {}, kind = 'tower'): void {
    if (!(vel > 0.001)) return;
    playBuf(this.core, this.bank, inst, ch.input, t - COMP, midi, vel, dur, { cat: o.cat ?? 'tower', cap: o.cap ?? 110, release: o.release, lp: o.lp, bend: o.bend, bendTime: o.bendTime });
    if (this.debugLog && this.debugLog.length < 20000) this.debugLog.push({ kind, t });
  }

  // ───────────────────────────── tower shots ─────────────────────────────

  shot(kind: TowerKind, level: number, t: number, pan: number, voice: number): void {
    const cfg = KIND[kind];
    if (!cfg) return;
    const lv = clamp(Math.round(Number.isFinite(level) ? level : 0), 0, 2);
    const v = Math.abs(Math.round(Number.isFinite(voice) ? voice : 0));
    const g = this.grid(t);
    const order = this.claim(kind, g.step, cfg.cap);
    if (order < 0 && kind !== 'choir') return;
    const dens = this.density(kind, v, t, g.barDur) * this.globalDensity(kind, v, t, g.barDur);
    const vel = this.trim * cfg.base * dens * (order <= 0 ? 1 : order === 1 ? 0.8 : 0.66) * (1 + 0.08 * lv);
    const ch = this.bus(cfg.wet, pan, cfg.panMul);
    const c = this.chordAt(t);
    const D = this.duets;
    const accent = g.stepInBar === 0 ? 1.08 : g.stepInBar % 4 === 0 ? 1 : 0.9;
    const guide = this.director.guideAt(t);
    switch (kind) {
      case 'harp': {
        const r = this.rank('harp', v, t, g.barDur);
        const pcs = c.pcs.slice(0, 4);
        const lp = lv === 0 ? 3000 : lv === 1 ? 4600 : undefined;
        let m: number;
        if (r <= 1 && guide !== null) {
          // the lead sings the tune (snapped to the chord); the second harp a chord tone below it
          const onBeat = g.stepInBar % 4 === 0;
          const held = this.director.guideAt(t - g.spb / 2 + 0.001) === guide && !onBeat;
          let gm = fold(guide, 62, 84);
          gm = nearestChordTone(c, gm);
          if (held) gm = chordTones(c, gm - 9, gm - 1).pop() ?? gm;
          if (r === 1) gm = chordTones(c, gm - 9, gm - 3).pop() ?? gm - 12;
          m = clamp(gm, 52, 91);
        } else {
          const regs: [number, number][] = [[62, 79], [67, 84], [57, 74]];
          const [lo, hi] = regs[v % 3];
          const tones = chordTones(c, lo, hi).filter((x) => pcs.includes(pcOf(x)));
          if (!tones.length) return;
          const pos = Math.floor(g.stepInBar / 2) + v * 2;
          m = tones[pingpong(pos, tones.length)];
        }
        const dur = Math.min(1.3 * g.spb, this.holdFor(t, m, g.spb, 2));
        this.note('harp', ch, t, m, vel * accent, dur, { release: 0.35, lp }, kind);
        if (D.has('serenade')) {
          // serenade: the harp's notes become dyads (a chord on the downbeat)
          const below = chordTones(c, m - 9, m - 3);
          if (below.length) this.note('harp', ch, t, below[below.length - 1], vel * 0.55, dur, { release: 0.35, lp }, kind);
          if (g.stepInBar === 0 && below.length > 1) this.note('harp', ch, t + 0.012, below[0], vel * 0.4, dur, { release: 0.35, lp }, kind);
        } else if (lv === 2 && m + 12 <= 93) this.note('harp', ch, t, m + 12, vel * 0.4, dur * 0.8, { release: 0.3 }, kind);
        break;
      }
      case 'drum': {
        const p = this.director.ref;
        const tonic = p ? p.keyAtTime(t).tonicPc : 0;
        let r = 33;
        while (pcOf(r) !== tonic) r++;
        const m = v % 2 === 0 ? r : r - 5;
        this.note('taiko', ch, t, m, vel * accent, 2, { release: 0.6 }, kind);
        if (lv >= 1) this.note('tom', ch, t, m + 12, vel * 0.22 * lv, 0.4, { release: 0.2 }, kind);
        // groundwork: the drum lands together with a sub on the root
        if (D.has('groundwork') && g.stepInBar % 8 === 0) this.note('boom', ch, t, bassNote(c, 28), vel * 0.5, 1.2, { release: 0.4 }, kind);
        break;
      }
      case 'bell': {
        let m: number;
        if (guide !== null) m = nearestChordTone(c, fold(guide, 60, 74));
        else {
          const which = [0, 2, 1][v % 3];
          const pc = c.pcs[Math.min(which, c.pcs.length - 1)];
          m = 60;
          while (pcOf(m) !== pc) m++;
        }
        if (m > 74) m -= 12;
        this.lastBell = m;
        const dur = this.holdFor(t, m, g.spb, 10);
        this.note('tbell', ch, t, m, vel * accent, dur, { release: 1.2, cap: 110 }, kind);
        if (lv >= 1 || D.has('shimmer')) this.note('glass', ch, t, m + 24, vel * (lv === 2 || D.has('shimmer') ? 0.16 : 0.09), Math.min(dur, 3), { release: 1 }, kind);
        // hymn: the choir sings the bell's note with it
        if (D.has('hymn')) this.note('choiroo', ch, t + 0.02, m - 12 >= 50 ? m - 12 : m, vel * 0.7, Math.min(dur, 4 * g.spb), { release: 0.9, cap: 110 }, kind);
        break;
      }
      case 'shaker': {
        const off = g.stepInBar % 4 === 2;
        if (order < 0) return;
        const groove = D.has('groove');
        const acc = groove ? (g.stepInBar % 8 === 6 ? 1.25 : off ? 1 : 0.5) : off ? 1 : 0.62;
        this.note('shaker', ch, t, 60 + (off ? 0 : 1.2) + rand(-0.15, 0.15), vel * acc, 0.2, { release: 0.05 }, kind);
        if (groove && (g.stepInBar === 4 || g.stepInBar === 12)) this.note('clap', ch, t, 60, vel * 0.7, 0.3, { release: 0.1 }, kind);
        break;
      }
      case 'crystal': {
        const st = this.crystal.get(v);
        const idx = st && g.step - st.step <= 4 && g.step > st.step ? st.idx + 1 : 0;
        this.crystal.set(v, { step: g.step, idx });
        const tones = chordTones(c, 72, 93);
        if (!tones.length) return;
        let m: number;
        if (D.has('shimmer')) {
          // interlock with the bell: alternate a step above and below the bell's octave
          const base = fold(this.lastBell + 12, 74, 88);
          const i0 = tones.findIndex((x) => x >= base);
          const i = clamp((i0 < 0 ? tones.length - 1 : i0) + (idx % 2 === 0 ? idx / 2 + 1 : -Math.ceil(idx / 2)), 0, tones.length - 1);
          m = tones[i];
        } else {
          // each burst climbs the chord from just above the tune (or a voice-dependent tone)
          let start = (v % 2) + (g.stepInBar >= 8 ? 1 : 0);
          if (guide !== null) {
            const gi = tones.findIndex((x) => x > fold(guide, 67, 84));
            if (gi >= 0) start = gi;
          }
          m = tones[Math.min(start + idx, tones.length - 1)];
        }
        this.note('zap', ch, t, m, vel * accent, 0.5, { release: 0.25, lp: lv === 0 ? 6000 : undefined }, kind);
        if (lv === 2) this.note('zap', ch, t, m + 12 <= 99 ? m + 12 : m, vel * 0.25, 0.3, { release: 0.2 }, kind);
        break;
      }
      case 'horn': {
        const root = bassNote(c, 48);
        const fifthPc = c.pcs[Math.min(2, c.pcs.length - 1)];
        let fifth = root + 1;
        while (pcOf(fifth) !== fifthPc) fifth++;
        const pick = order <= 0 ? v % 2 : order;
        const m = pick === 0 ? root : pick === 1 ? fifth : root + 12;
        if (D.has('fanfare') && order <= 0) {
          // fanfare: a call — root, (a dotted eighth later) the fifth above, held
          const t2 = t + 0.75 * g.spb;
          const c2 = this.peek(t2);
          const up = chordTones(c2, root + 5, root + 12)[0] ?? fifth;
          this.note('brass', ch, t, root, vel * accent, 0.7 * g.spb, { release: 0.2 }, kind);
          this.note('brass', ch, t2, up, vel * 1.05, Math.min(1.6 * g.spb, this.holdFor(t2, up, g.spb, 2)), { release: 0.3 }, kind);
          if (lv === 2) this.note('brass', ch, t2, up + 12, vel * 0.4, 1.2 * g.spb, { release: 0.25 }, kind);
          break;
        }
        const dur = Math.min(1.6 * g.spb, this.holdFor(t, m, g.spb, 2));
        this.note('brass', ch, t, m, vel * accent, dur, { release: 0.28 }, kind);
        if (lv === 2) this.note('brass', ch, t, m + 12, vel * 0.42, dur * 0.85, { release: 0.25 }, kind);
        break;
      }
      case 'choir': {
        const inst: BufInst = v % 2 === 0 ? 'choir' : 'choiroo';
        const hymn = D.has('hymn');
        const span = hymn ? 8 : lv === 2 ? 2 : 4;
        const dur = Math.min(span * g.spb, this.holdFor(t, bassNote(c, 55), g.spb, span) + 0.05);
        const prev = this.choirStep.get(g.step);
        if (prev) {
          // another choir tower on the same step: widen the chord (at most two extra voices)
          if (prev.extra >= 2) return;
          prev.extra++;
          const top = Math.max(...prev.notes);
          const up = chordTones(c, top + 1, top + 9)[0];
          if (up === undefined) return;
          prev.notes.push(up);
          this.note(inst, ch, t, up, vel * 0.55, dur, { release: 0.7, cap: 110 }, kind);
          return;
        }
        const notes = voiceLead(this.lastChoir, c, 55, 72, 3);
        this.lastChoir = notes;
        this.choirStep.set(g.step, { notes: [...notes], extra: 0 });
        if (this.choirStep.size > 64) for (const k of this.choirStep.keys()) if (k < g.step - 64) this.choirStep.delete(k);
        notes.forEach((m, i) => this.note(inst, ch, t, m, vel * (i === 0 ? 1 : 0.85) * (hymn ? 0.85 : 1), dur, { release: hymn ? 1.2 : 0.7, cap: 110 }, kind));
        break;
      }
      case 'bass': {
        const m = bassNote(c, 28);
        this.note('boom', ch, t, m, vel * accent, 2.2, { release: 0.5 }, kind);
        if (lv >= 1) this.note('boom', ch, t, m + 12, vel * 0.18 * lv, 1, { release: 0.3 }, kind);
        if (D.has('groundwork')) this.note('taiko', ch, t, bassNote(c, 33), vel * 0.6, 1.6, { release: 0.5 }, kind);
        if (D.has('thunder')) {
          // thunder: the drop glints — a crystal arc flies up from it
          const hi = chordTones(c, 79, 96);
          hi.slice(0, 4).forEach((x, i) => this.note('zap', this.bus(1, pan, 1), t + 0.03 + i * 0.045, x, vel * (0.4 - i * 0.05), 0.4, { release: 0.25 }, kind));
        }
        break;
      }
    }
  }
  private lastChoir: number[] | null = null;
  private impacts: number[] = [];

  // ───────────────────────────── impacts ─────────────────────────────

  impact(kind: TowerKind, t: number, pan: number, strength: number): void {
    const s = clamp(Number.isFinite(strength) ? strength : 0.5, 0, 1.5);
    if (kind === 'bell' || kind === 'choir' || kind === 'shaker') return;
    const g = this.grid(t);
    const cap = kind === 'bass' || kind === 'horn' ? 1 : 2;
    const order = this.claim(`imp-${kind}`, g.step, cap);
    if (order < 0) return;
    // impacts thin out as they get dense (they are not towers: separate bookkeeping)
    this.impacts = this.impacts.filter((x) => x > t - g.barDur);
    this.impacts.push(t);
    const dens = 1 / Math.sqrt(1 + 0.04 * Math.max(0, this.impacts.length - 4));
    const ch = this.bus(kind === 'drum' || kind === 'bass' ? 0 : 1, pan, KIND[kind].panMul);
    const v = this.trim * 1.25 * (0.4 + 0.6 * s) * (order === 0 ? 1 : 0.7) * dens;
    switch (kind) {
      case 'drum':
        this.note('taiko', ch, t, 29, 0.42 * v, 1.2, { release: 0.4, lp: 900 }, 'impact');
        this.fx.burst(ch.input, t - COMP, { noise: 'pink', type: 'lowpass', f: 700, f1: 200, d: 0.14, g: 0.12 * v, cat: 'impact' });
        break;
      case 'harp': {
        const tones = chordTones(this.peek(t), 86, 96);
        this.note('tick', ch, t, 72 + rand(-2, 2), 0.2 * v, 0.1, {}, 'impact');
        if (tones.length) this.note('harp', ch, t, tones[g.step % tones.length], 0.08 * v, 0.15, { release: 0.1 }, 'impact');
        break;
      }
      case 'bass':
        this.note('kick', ch, t, 48, 0.5 * v, 0.8, { release: 0.3 }, 'impact');
        this.fx.burst(ch.input, t - COMP, { noise: 'brown', type: 'lowpass', f: 260, d: 0.2, g: 0.35 * v, cat: 'impact' });
        break;
      case 'crystal': {
        for (let k = 0; k < 4; k++) this.fx.burst(ch.input, t - COMP + k * 0.014 + rand(0, 0.008), { noise: 'white', type: 'highpass', f: rand(3500, 6500), a: 0.0006, d: rand(0.004, 0.012), g: rand(0.04, 0.08) * v, cat: 'impact' });
        const tones = chordTones(this.peek(t), 91, 100);
        if (tones.length) this.note('glass', ch, t + 0.01, tones[g.step % tones.length], 0.05 * v, 0.3, { release: 0.3 }, 'impact');
        break;
      }
      case 'horn':
        this.fx.burst(ch.input, t - COMP, { noise: 'pink', f: 700, f1: 2400, q: 0.9, a: 0.03, d: 0.16, g: 0.05 * v, cat: 'impact' });
        break;
    }
  }

  // ───────────────────────────── enemies ─────────────────────────────

  enemyDeath(kind: EnemyKind, t: number, pan: number, bossHook: (t: number) => void): void {
    const boss = kind === 'bossBlot' || kind === 'bossScarab' || kind === 'bossMoth' || kind === 'bossGolem' || kind === 'silence';
    if (boss) {
      bossHook(t);
      return;
    }
    const g = this.grid(t);
    const order = this.claim('death', g.step, 3);
    const ch = this.bus(1, pan, 0.9);
    if (order < 0 && this.core.voiceCount('pop') > 8) return;
    const T = t - COMP;
    const c = this.peek(t);
    // the body of the sound: every family dies its own way (the stolen sound bursts back)
    switch (kind) {
      case 'scorpion':
        // a chitinous crack and a hiss of sand
        this.note('wood', ch, t, 76, 0.16, 0.12, {}, 'death');
        this.note('tek', ch, t + 0.018, 60, 0.18, 0.12, {}, 'death');
        this.fx.burst(ch.input, T + 0.02, { noise: 'white', type: 'bandpass', f: 5200, f1: 2200, q: 0.8, a: 0.01, d: 0.22, g: 0.05, cat: 'pop' });
        break;
      case 'whirl':
        // the dust devil unwinds: a noise swirl falling away
        this.fx.burst(ch.input, T, { noise: 'pink', type: 'bandpass', f: 2600, f1: 380, q: 2.2, a: 0.03, d: 0.4, g: 0.12, cat: 'pop' });
        this.fx.burst(ch.input, T + 0.05, { noise: 'white', type: 'bandpass', f: 1800, f1: 6000, q: 3, a: 0.02, d: 0.25, g: 0.04, cat: 'pop' });
        break;
      case 'echo':
        // the sound rings back three times, fading (its released note repeats below)
        this.fx.tone(ch.input, T, { f: 520, f1: 1300, a: 0.003, d: 0.05, g: 0.05, cat: 'pop' });
        break;
      case 'wolf':
        // a short icy yelp, and shards
        this.fx.tone(ch.input, T, { type: 'triangle', f: 820, f1: 460, a: 0.01, d: 0.16, g: 0.05, lp: 2400, cat: 'pop' });
        this.note('glass', ch, t + 0.03, 96, 0.06, 0.3, { release: 0.25 }, 'death');
        this.fx.burst(ch.input, T + 0.03, { noise: 'white', type: 'highpass', f: 6500, a: 0.001, d: 0.08, g: 0.05, cat: 'pop' });
        break;
      case 'ember':
        // the fire bat fizzles out
        this.fx.burst(ch.input, T, { noise: 'white', type: 'highpass', f: 3200, f1: 7000, a: 0.004, d: 0.3, g: 0.05, cat: 'pop' });
        this.fx.tone(ch.input, T, { f: 700, f1: 240, a: 0.003, d: 0.07, g: 0.05, cat: 'pop' });
        break;
      case 'slug':
        // a big lava bloop and a crusty crack
        this.fx.tone(ch.input, T, { f: 95, f1: 190, a: 0.008, d: 0.22, g: 0.16, cat: 'pop' });
        this.fx.tone(ch.input, T + 0.09, { f: 140, f1: 300, a: 0.006, d: 0.14, g: 0.1, cat: 'pop' });
        this.fx.burst(ch.input, T, { noise: 'brown', type: 'lowpass', f: 420, a: 0.01, d: 0.35, g: 0.22, cat: 'pop' });
        this.note('rim', ch, t + 0.02, 52, 0.18, 0.15, {}, 'death');
        break;
      case 'mimic':
        // the false copy's wrong note bends back into the chord (the musician is freed)
        {
          const m = chordTones(c, 67, 79)[0] ?? 72;
          this.note('harp', ch, t, m + 1, 0.1, 0.25, { release: 0.2, bend: -100, bendTime: 0.2 }, 'death');
          this.fx.burst(ch.input, T, { noise: 'pink', type: 'bandpass', f: 900, f1: 2400, q: 1.4, a: 0.02, d: 0.2, g: 0.06, cat: 'pop' });
        }
        break;
      case 'knight':
        // heavy armour falls: a metallic clang, a low thud
        this.note('anvil', ch, t, 84, 0.08, 0.6, { release: 0.5 }, 'death');
        this.note('anvil', ch, t + 0.07, 79, 0.06, 0.5, { release: 0.4 }, 'death');
        this.note('kick', ch, t + 0.05, 52, 0.28, 0.4, {}, 'death');
        this.fx.burst(ch.input, T + 0.05, { noise: 'brown', type: 'lowpass', f: 300, a: 0.01, d: 0.3, g: 0.2, cat: 'pop' });
        break;
      case 'conductor': {
        // the shadow conductor's baton snaps; a little cadence answers (V → I of the moment)
        this.note('wood', ch, t, 88, 0.2, 0.1, {}, 'death');
        this.note('rim', ch, t + 0.01, 60, 0.2, 0.1, {}, 'death');
        const tones = chordTones(c, 64, 79);
        tones.slice(0, 3).forEach((m, i) => this.note('choiroo', ch, t + 0.06 + i * 0.03, m, 0.09, 1.4, { release: 0.9 }, 'death'));
        this.note('tbell', ch, t + 0.06, bassNote(c, 55), 0.12, 2.5, { release: 1.2 }, 'death');
        break;
      }
      default: {
        // the pop (the meadow, ice and forge families)
        const pop: Record<string, [number, number]> = { blotling: [520, 1500], shell: [170, 480], bubble: [210, 720], scurry: [380, 1200], moth: [600, 1600] };
        const [f0, f1] = pop[kind] ?? [300, 950];
        this.fx.tone(ch.input, T, { f: f0, f1, a: 0.002, d: kind === 'bubble' ? 0.07 : 0.035, g: 0.065, cat: 'pop' });
        this.fx.burst(ch.input, T, { noise: 'white', f: kind === 'shell' ? 900 : 2200, q: 1.2, d: 0.025, g: 0.028, cat: 'pop' });
        if (kind === 'shell') this.note('wood', ch, t, 50, 0.17, 0.2, {}, 'death');
        if (kind === 'shield') this.note('anvil', ch, t, 88, 0.035, 0.3, { release: 0.3 }, 'death');
        if (kind === 'obelisk') {
          this.note('kick', ch, t, 50, 0.3, 0.5, {}, 'death');
          this.fx.burst(ch.input, T, { noise: 'brown', type: 'lowpass', f: 500, a: 0.01, d: 0.5, g: 0.25, cat: 'pop' });
        }
      }
    }
    if (order < 0) return;
    // the released note: climbs the chord with every defeat in the bar
    if (g.bar !== this.deathBar) {
      this.deathBar = g.bar;
      this.deathIdx = 0;
    }
    const small = kind === 'blotling' || kind === 'ember';
    const tones = chordTones(this.chordAt(t), small ? 84 : 76, small ? 96 : 91);
    if (!tones.length) return;
    const m = tones[this.deathIdx++ % tones.length];
    const inst: BufInst = kind === 'phantom' || kind === 'moth' || kind === 'wolf' || kind === 'echo' ? 'glass' : kind === 'mender' || kind === 'mimic' ? 'harp' : kind === 'scorpion' || kind === 'whirl' ? 'koto' : kind === 'slug' || kind === 'knight' ? 'tbell' : 'celesta';
    const vel = (small ? 0.07 : 0.11) * (order === 0 ? 1 : 0.75) * (inst === 'tbell' ? 0.8 : 1);
    this.note(inst, ch, t + 0.012, inst === 'tbell' ? m - 12 : m, vel, 1.2, { release: 0.8 }, 'death');
    if (kind === 'echo') {
      // …and comes back, softer, on the next two eighth notes
      for (let k = 1; k <= 2; k++) this.note('glass', this.bus(2, -pan, 0.9), t + 0.012 + k * g.spb * 0.5, m, vel * Math.pow(0.45, k), 0.8, { release: 0.6 }, 'death');
    }
  }

  coin(t: number, pan: number, amount: number): void {
    const a = clamp(Number.isFinite(amount) ? amount : 1, 0, 1000);
    // throttle: merge coins arriving within 60 ms
    if (t - this.lastCoin < 0.06) {
      this.coinAcc += a;
      return;
    }
    const total = a + this.coinAcc;
    this.coinAcc = 0;
    this.lastCoin = t;
    const g = this.grid(t);
    if (g.bar !== this.coinBar) {
      this.coinBar = g.bar;
      this.coinIdx = 0;
    }
    const tones = chordTones(this.peek(t), 84, 98);
    if (!tones.length) return;
    const n = total >= 20 ? 3 : total >= 6 ? 2 : 1;
    const ch = this.bus(1, pan, 0.8);
    for (let k = 0; k < n; k++) {
      const m = tones[(this.coinIdx++) % tones.length];
      this.note(k % 2 ? 'glass' : 'celesta', ch, t + k * 0.045, m, 0.055 + 0.016 * Math.min(3, Math.log2(1 + total)), 0.5, { release: 0.5, cap: 110, cat: 'coin' }, 'coin');
    }
  }

  deflect(t: number, pan: number): void {
    if (t - this.lastDeflect < 0.04) return;
    this.lastDeflect = t;
    const ch = this.bus(1, pan, 0.9);
    this.note('anvil', ch, t, 92 + rand(-1, 1), 0.13, 0.25, { release: 0.25 }, 'deflect');
    this.fx.burst(ch.input, t - COMP, { noise: 'white', type: 'highpass', f: 5000, a: 0.0008, d: 0.03, g: 0.05, cat: 'impact' });
  }
}
