/**
 * Composition toolkit: random-access forms (harmony is a pure function of the bar index),
 * composed lines, melodies with real phrasing, arpeggios, and the FORTÍSSIMO leitmotif.
 */
import { chord, chordTones, nearestChordTone, pcOf, type Chord, type Scale } from './theory';
import { chance, clamp, pick, rand, wpick } from './util';

/** One section of a form. A bar is a chord symbol or a list of chords splitting the bar evenly. */
export interface Section {
  name: string;
  bars: (string | string[])[];
}

export interface BarInfo {
  /** absolute bar index */
  bar: number;
  sec: string;
  /** bar index inside the section */
  i: number;
  /** section length */
  n: number;
  /** absolute bar index of the section's first bar */
  start: number;
  /** occurrence of this section (0 = first time it plays) */
  occ: number;
  /** chords of this bar (split evenly across the bar) */
  chords: Chord[];
  chord: Chord;
  next: Chord;
  /** completed passes of the loop (0 during the intro and the first pass) */
  cycle: number;
  /** 0..1 position in the section */
  pos: number;
  last: boolean;
  intro: boolean;
}

interface Slot {
  s: Section;
  start: number;
  occBefore: number;
}

/**
 * A form = intro sections (played once) followed by loop sections (cycled forever).
 * `at(bar)` is pure: the same bar index always yields the same section and chords.
 */
export class Form {
  private readonly intro: Slot[] = [];
  private readonly loop: Slot[] = [];
  private readonly introLen: number;
  readonly loopLen: number;
  private readonly introCount: Record<string, number> = {};
  private readonly loopCount: Record<string, number> = {};
  private readonly cache = new Map<number, BarInfo>();

  constructor(sections: Section[], introOrder: string[], loopOrder: string[]) {
    const byName = new Map(sections.map((s) => [s.name, s]));
    const get = (n: string): Section => {
      const s = byName.get(n);
      if (!s) throw new Error(`no section ${n}`);
      return s;
    };
    let pos = 0;
    for (const n of introOrder) {
      const s = get(n);
      this.intro.push({ s, start: pos, occBefore: this.introCount[n] ?? 0 });
      this.introCount[n] = (this.introCount[n] ?? 0) + 1;
      pos += s.bars.length;
    }
    this.introLen = pos;
    pos = 0;
    for (const n of loopOrder) {
      const s = get(n);
      this.loop.push({ s, start: pos, occBefore: this.loopCount[n] ?? 0 });
      this.loopCount[n] = (this.loopCount[n] ?? 0) + 1;
      pos += s.bars.length;
    }
    this.loopLen = Math.max(1, pos);
  }

  get length(): number {
    return this.introLen + this.loopLen;
  }

  private locate(bar: number): { slot: Slot; i: number; start: number; cycle: number; intro: boolean; occ: number } {
    const b = Math.max(0, Math.floor(bar));
    if (b < this.introLen) {
      for (const slot of this.intro) {
        if (b < slot.start + slot.s.bars.length) return { slot, i: b - slot.start, start: slot.start, cycle: 0, intro: true, occ: slot.occBefore };
      }
    }
    const k = b - this.introLen;
    const cycle = Math.floor(k / this.loopLen);
    const r = k - cycle * this.loopLen;
    let found = this.loop[this.loop.length - 1];
    for (const slot of this.loop) {
      if (r < slot.start + slot.s.bars.length) {
        found = slot;
        break;
      }
    }
    const name = found.s.name;
    const occ = (this.introCount[name] ?? 0) + cycle * (this.loopCount[name] ?? 0) + found.occBefore;
    return { slot: found, i: r - found.start, start: this.introLen + cycle * this.loopLen + found.start, cycle, intro: false, occ };
  }

  chordsOf(bar: number): Chord[] {
    const L = this.locate(bar);
    const raw = L.slot.s.bars[L.i];
    return (Array.isArray(raw) ? raw : [raw]).map(chord);
  }

  at(bar: number): BarInfo {
    const b = Math.max(0, Math.floor(bar));
    const hit = this.cache.get(b);
    if (hit) return hit;
    const L = this.locate(b);
    const chords = this.chordsOf(b);
    const n = L.slot.s.bars.length;
    const info: BarInfo = {
      bar: b,
      sec: L.slot.s.name,
      i: L.i,
      n,
      start: L.start,
      occ: L.occ,
      chords,
      chord: chords[0],
      next: this.chordsOf(b + 1)[0],
      cycle: L.cycle,
      pos: n > 1 ? L.i / (n - 1) : 0,
      last: L.i === n - 1,
      intro: L.intro,
    };
    if (this.cache.size > 512) this.cache.clear();
    this.cache.set(b, info);
    return info;
  }
}

/** Chord sounding at `beat` of a bar whose chords split the bar evenly. */
export function chordIn(chords: Chord[], beat: number, beats: number): Chord {
  const k = chords.length;
  return chords[clamp(Math.floor((beat / beats) * k + 1e-9), 0, k - 1)];
}

export interface MNote {
  beat: number;
  dur: number;
  midi: number;
  vel: number;
}

/**
 * A composed line: bars of [degree, beats]. degree null = rest; x.5 = degree x raised a semitone.
 * Degrees count steps of a 7-note scale from the tonic (7 = the octave).
 */
export type Line = [number | null, number][][];

/** Converts a composed line to absolute-beat notes (beat 0 = start of the first bar). */
export function lineNotes(scale: Scale, tonic: number, beats: number, bars: Line, o: { shift?: number; vel?: number; startBar?: number; accent?: number } = {}): MNote[] {
  const base = scale.degreeOf(tonic);
  const out: MNote[] = [];
  const vel = o.vel ?? 0.72;
  bars.forEach((bar, bi) => {
    let beat = (bi + (o.startBar ?? 0)) * beats;
    let first = true;
    for (const [d, len] of bar) {
      if (d !== null) {
        const midi = scale.degAlt(base + d + (o.shift ?? 0));
        const strong = first || beat % 2 === 0;
        out.push({ beat, dur: len, midi, vel: vel * (strong ? 1 : 0.88) * (len >= 2 ? (o.accent ?? 1.04) : 1) });
      }
      first = false;
      beat += len;
    }
  });
  return out;
}

/**
 * Melody writer: a constrained random walk in scale degrees with phrase arches, strong-beat
 * chord tones, preferred steps, occasional leaps that recover by step, and cadential endings.
 * (Used for ornamental lines only — never for harmony.)
 */
export class Melody {
  pos: number;
  private lastStep = 0;
  constructor(
    readonly scale: Scale,
    readonly lo: number,
    readonly hi: number,
  ) {
    this.pos = scale.degreeOf((lo + hi) / 2);
  }

  seat(midi: number): void {
    this.pos = this.scale.degreeOf(clamp(midi, this.lo, this.hi));
  }

  bar(rhythm: number[], c: Chord, o: { arch?: number; leap?: number; vel?: number; cadence?: boolean; strong?: number[] } = {}): MNote[] {
    const out: MNote[] = [];
    let beat = 0;
    const arch = o.arch ?? 0;
    rhythm.forEach((d, idx) => {
      const dur = Math.abs(d);
      if (d < 0) {
        beat += dur;
        return;
      }
      const isLast = idx === rhythm.length - 1;
      const strong = (o.strong ?? [0, 2]).includes(beat) || dur >= 1.5;
      let step: number;
      if (Math.abs(this.lastStep) >= 3) step = -Math.sign(this.lastStep);
      else {
        const mag = wpick<number>([[0, 0.12], [1, 0.52], [2, 0.24], [3, 0.08 + (o.leap ?? 0)], [4, 0.04 + (o.leap ?? 0) * 0.5]]);
        step = chance(0.5 + arch * 0.22) ? mag : -mag;
      }
      let deg = this.pos + step;
      let midi = this.scale.deg(deg);
      if (strong || (isLast && o.cadence)) {
        const ct = nearestChordTone(c, midi);
        if (this.scale.has(ct) || Math.abs(ct - midi) <= 2) midi = ct;
        deg = this.scale.degreeOf(midi);
      }
      while (midi > this.hi) {
        deg -= 2;
        midi = this.scale.deg(deg);
      }
      while (midi < this.lo) {
        deg += 2;
        midi = this.scale.deg(deg);
      }
      if (isLast && o.cadence) {
        const stable = chordTones(c, midi - 4, midi + 4).filter((m) => pcOf(m) === c.pcs[0] || pcOf(m) === c.pcs[1]);
        if (stable.length) midi = stable.reduce((a, b) => (Math.abs(b - midi) < Math.abs(a - midi) ? b : a));
        deg = this.scale.degreeOf(midi);
      }
      this.lastStep = deg - this.pos;
      this.pos = deg;
      out.push({ beat, dur, midi, vel: (o.vel ?? 0.7) * (strong ? 1 : 0.86) * rand(0.9, 1.05) });
      beat += dur;
    });
    return out;
  }
}

/** Arpeggio pitch list over a chord within a range. */
export function arp(c: Chord, lo: number, hi: number, pattern: 'up' | 'down' | 'updown' | 'broken' | 'alberti' | 'random', count: number): number[] {
  const tones = chordTones(c, lo, hi);
  if (!tones.length) return [];
  const out: number[] = [];
  switch (pattern) {
    case 'up':
      for (let i = 0; i < count; i++) out.push(tones[i % tones.length]);
      break;
    case 'down':
      for (let i = 0; i < count; i++) out.push(tones[tones.length - 1 - (i % tones.length)]);
      break;
    case 'updown': {
      const cyc = tones.length > 2 ? [...tones, ...tones.slice(1, -1).reverse()] : tones;
      for (let i = 0; i < count; i++) out.push(cyc[i % cyc.length]);
      break;
    }
    case 'broken': {
      const lo3 = tones.slice(0, Math.max(3, Math.min(tones.length, 4)));
      const order = [0, 2, 1, 3, 2, 1];
      for (let i = 0; i < count; i++) out.push(lo3[order[i % order.length] % lo3.length]);
      break;
    }
    case 'alberti': {
      const t = tones.slice(0, 3);
      const order = [0, 2, 1, 2];
      for (let i = 0; i < count; i++) out.push(t[order[i % 4] % t.length]);
      break;
    }
    case 'random':
      for (let i = 0; i < count; i++) out.push(pick(tones));
      break;
  }
  return out;
}

/** Small timing humanisation (seconds). */
export function human(amount = 0.008): number {
  return (Math.random() * 2 - 1) * amount;
}

// ═════════════════════════════ the FORTÍSSIMO leitmotif ═════════════════════════════
//
//  A (8 bars, major, in F):  F  C. Bb A | G. A Bb C | D — C A | G —— | F C. Bb A | G. A Bb D | F. E D E | F ——
//  The signature is the opening rising fifth with its dotted fall ("For-TÍS-si-mo"), answered by a
//  stepwise climb; the second half climbs a third higher to the octave.

export const LEIT_A: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [4, 1]],
  [[5, 2], [4, 1], [2, 1]],
  [[1, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [5, 1]],
  [[7, 1.5], [6, 0.5], [5, 1], [6, 1]],
  [[7, 3], [null, 1]],
];
/** harmony of LEIT_A (major, relative to F) */
export const LEIT_A_CHORDS: (string | string[])[] = ['F', ['Gm7', 'C7'], 'Dm7', 'C', 'F', ['Gm7', 'Bb'], ['Bb', 'C'], 'F'];

/** a warmer, film-score harmonisation of A for the menu, credits and ending (no towers there) */
export const LEIT_A_RICH_CHORDS: (string | string[])[] = ['Fmaj7', ['Gm7', 'C7sus4'], 'Bbmaj7', ['Am7', 'C7sus4'], 'Fmaj7', ['Gm7', 'Bb'], ['Bbmaj7', 'C'], 'Fadd9'];

/** the leitmotif in the minor (bar 7 borrows the leading tone over the dominant) */
export const LEIT_A_MINOR: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [4, 1]],
  [[5, 2], [4, 1], [2, 1]],
  [[1, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [5, 1]],
  [[7, 1.5], [6, 0.5], [5, 1], [6.5, 1]],
  [[7, 3], [null, 1]],
];
export const LEIT_A_MINOR_CHORDS: (string | string[])[] = ['Fm', ['Eb', 'C7'], 'Db', 'C', 'Fm', ['Eb', 'Bbm'], ['Db', 'Db', 'Db', 'C'], 'Fm'];

/** B (8 bars): the motif rhythm answered in the relative minor, climbing to the high F. */
export const LEIT_B: Line = [
  [[2, 1], [5, 1.5], [4, 0.5], [2, 1]],
  [[3, 1.5], [2, 0.5], [1, 1], [0, 1]],
  [[1, 1], [5, 1.5], [4, 0.5], [3, 1]],
  [[2, 2], [4.5, 1], [6, 1]],
  [[7, 3], [6, 1]],
  [[5, 1], [4, 1], [3, 1], [5, 1]],
  [[3, 1], [2, 1], [1, 1], [3, 1]],
  [[4, 2], [null, 1], [-3, 1]],
];
export const LEIT_B_CHORDS: (string | string[])[] = ['Dm', 'Bb', 'Gm7', 'A7', 'Dm', 'Bb', ['Gm7', 'C7'], ['Csus4', 'C']];
export const LEIT_B_RICH_CHORDS: (string | string[])[] = ['Dm9', 'Bbmaj7', 'Gm7', 'A7', 'Dm7', 'Bbmaj7', ['Gm7', 'C7'], ['C7sus4', 'C7']];

/** The head of the motif (first bar) — calls, fanfares, stingers. */
export const LEIT_HEAD: [number, number][] = [[0, 1], [4, 1.5], [3, 0.5], [2, 1]];
