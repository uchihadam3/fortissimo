/**
 * Cinematic themes, driven by the cutscene cues:
 *   dawn     — glimmers and a string swell that crests into…
 *   festival — the main theme, joyful, the turtle's village dancing; `approach` decays it
 *   fall     — a soft low drone after the Silence collapses
 *   alone    — the tender solo (piano + celesta), the leitmotif in D minor
 *   bloom    — the leitmotif in full glory; `bow` turns it into the final cadence and last chord
 */
import { SONGS } from '../../../sim/defs';
import { Form, LEIT_A, LEIT_A_RICH_CHORDS, LEIT_B, lineNotes, type BarInfo, type Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { CHOIR, DRONE, FLUTE, HORNLEAD, LOWBRASS, PAD, STRINGS, SUB, VIOLIN, type BufInst } from '../synth';
import { chord, chordTones, type Chord, MODES, note, Scale } from '../theory';
import { clamp, pick, rand } from '../util';
import { Song } from './base';

const MENU_BPM = SONGS.menu.bpm;
const END_BPM = SONGS.ending.bpm;

// ═════════════════════════════════════ DAWN ═════════════════════════════════════

export class DawnTheme extends Song {
  readonly bpm = MENU_BPM;
  readonly level: number = 1;
  readonly key = new Scale(note('F4'), MODES.major);
  readonly warm: [BufInst, number, number][] = [['harp', 53, 93], ['celesta', 76, 96], ['piano', 60, 89], ['timp', 41, 50]];
  protected readonly form: Form = new Form(
    [
      { name: 'dawn', bars: ['Fadd9', 'Bbmaj7/F', 'C7sus4'] },
      { name: 'hold', bars: ['Fadd9', 'Bbmaj7/F'] },
    ],
    ['dawn'],
    ['hold'],
  );
  setup(p: Player): void {
    p.ch('strings', { gain: 0.5, wet: 0.5, vibratoCents: 8 });
    p.ch('harp', { gain: 0.36, wet: 0.5, pan: -0.25 });
    p.ch('celesta', { gain: 0.3, wet: 0.6, pan: 0.3 });
    p.ch('piano', { gain: 0.42, wet: 0.45 });
    p.ch('timp', { gain: 0.5, wet: 0.35 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const dawn = f.sec === 'dawn';
    const swell = dawn ? 0.22 + 0.16 * f.i : 0.3;
    this.chords(b, f, 'str', { ...STRINGS(0.3 + 0.2 * f.i), attack: dawn ? 2.2 : 1.5 }, 'strings', 53, 72, 4, swell, 0.6);
    for (let k = 0; k < (dawn ? 2 + f.i : 2); k++) this.play(b, 'celesta', 'celesta', rand(0, 3.6), pick(chordTones(f.chord, 79, 93)), 0.18 + 0.04 * f.i, 2 * b.spb);
    for (let k = 0; k < 4; k++) if (Math.random() < 0.6) this.play(b, 'piano', 'piano', k + rand(0, 0.1), pick(chordTones(f.chord, 72, 86)), 0.16 + 0.03 * f.i, 2 * b.spb, 1.2);
    const tones = chordTones(f.chord, 62, 91);
    const runAt = dawn && f.i === 2 ? 2 : 3;
    const n = dawn && f.i === 2 ? 16 : 6;
    for (let k = 0; k < n; k++) this.play(b, 'harp', 'harp', runAt + (k * (4 - runAt)) / n, tones[k % tones.length], 0.16 + 0.015 * k, 1.4 * b.spb);
    if (dawn && f.i === 2) this.roll(b, 'timp', 'timp', 1, 4, 6, 0.06, 0.4, note('C3'));
  }
}

// ═════════════════════════════════════ FESTIVAL ═════════════════════════════════════

export class FestivalTheme extends Song {
  readonly bpm = MENU_BPM;
  readonly level: number = 1;
  readonly key = new Scale(note('F4'), MODES.major);
  readonly warm: [BufInst, number, number][] = [['pizz', 29, 62], ['harp', 55, 89], ['timp', 39, 53], ['tamb', 60, 60], ['taiko', 30, 36], ['snare', 60, 60], ['crash', 60, 60]];
  protected readonly form: Form = new Form([{ name: 'fest', bars: LEIT_A_RICH_CHORDS }], [], ['fest']);
  setup(p: Player): void {
    p.ch('strings', { gain: 0.5, wet: 0.4, vibratoCents: 7 });
    p.ch('pizz', { gain: 0.6, wet: 0.22, pan: -0.1 });
    p.ch('harp', { gain: 0.4, wet: 0.36, pan: -0.25 });
    p.ch('horn', { gain: 0.6, wet: 0.4, vibratoCents: 5 });
    p.ch('violins', { gain: 0.52, wet: 0.42, vibratoCents: 11, vibratoRate: 5.4, pan: 0.15 });
    p.ch('flute', { gain: 0.46, wet: 0.4, vibratoCents: 12, pan: 0.22 });
    p.ch('choir', { gain: 0.4, wet: 0.5, vibratoCents: 5 });
    p.ch('kit', { gain: 0.45, wet: 0.2 });
    p.ch('perc', { gain: 0.26, wet: 0.18, pan: 0.28 });
    p.ch('timp', { gain: 0.52, wet: 0.32 });
  }
  /** 0 = festive … 1 = decayed (set by the approach cue) */
  private decayOf(b: BarCtx): number {
    const t0 = b.p.state.decayT;
    if (t0 === undefined) return 0;
    return clamp((b.t - t0) / (b.p.state.decayDur ?? 12), 0, 1);
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const d = this.decayOf(b);
    const F4 = note('F4');
    const bar = LEIT_A[f.i];
    const mel = (shift: number) => lineNotes(this.key, F4, this.beats, [bar], { vel: 0.72, shift });
    this.chords(b, f, 'str', STRINGS(0.75 * (1 - 0.6 * d)), 'strings', 53, 72, 4, 0.58 * (1 - 0.5 * d), 0.35);
    if (d < 0.85) this.notes(b, mel(0).filter((n) => d < 0.6 || n.beat < 2), HORNLEAD(0.7), 'horn', 0.95 * (1 - 0.4 * d), 0.96);
    if (d < 0.35) {
      this.notes(b, mel(7), VIOLIN(0.85), 'violins', 0.6, 0.96);
      this.notes(b, mel(7), FLUTE(), 'flute', 0.55, 0.9);
    }
    if (d < 0.25) this.chords(b, f, 'cho', CHOIR('ah'), 'choir', 55, 72, 4, 0.5, 0.4);
    if (d < 0.55) this.ostinato(b, f, 'harp', 'harp', 60, 84, [0, 1, 2, 3, 4, 3, 2, 1], 0.38 * (1 - d), 1.0, [0, 4]);
    if (d < 0.72) this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.64], [1, 3, 0.5, 0.42], [2, 2, 0.6, 0.54], [3, 3, 0.5, 0.42]], 34);
    if (d < 0.15) {
      // the village dances: the turtle's footsteps, tambourine, a folk snare
      this.drum(b, 'taiko', 'timp', 'x...x...x...x...', 0.42, 33);
      this.drum(b, 'tamb', 'perc', 'xoxoxoxoxoxoxoxo', 0.42);
      this.drum(b, 'snare', 'kit', 'o...x..o....x.oo', 0.34);
      if (f.i === 0) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.3);
      if (f.i % 2 === 0) this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.5, 3, undefined, 0.002);
    } else if (d < 0.5) this.drum(b, 'taiko', 'timp', 'x.......x.......', 0.3 * (1 - d), 33);
  }
}

// ═════════════════════════════════════ FALL (drone) ═════════════════════════════════════

export class FallTheme extends Song {
  readonly bpm = END_BPM;
  readonly level: number = 1;
  readonly key = new Scale(note('F4'), MODES.major);
  protected readonly form: Form = new Form([{ name: 'drone', bars: ['F5', 'F5'] }], [], ['drone']);
  setup(p: Player): void {
    p.ch('drone', { gain: 0.5, wet: 0.35, filterLfoHz: 90, filterLfoRate: 0.05 });
    p.ch('pad', { gain: 0.32, wet: 0.5 });
    p.ch('choir', { gain: 0.26, wet: 0.6, vibratoCents: 4 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    if (f.i !== 0) return;
    const len = 2 * b.beats * b.spb + 2;
    this.play(b, DRONE(300), 'drone', 0, note('F1'), 0.7, len);
    this.play(b, DRONE(300), 'drone', 0.1, note('C2'), 0.45, len);
    this.play(b, { ...PAD(520), attack: 3 }, 'pad', 0.2, note('F2'), 0.5, len);
    this.play(b, { ...PAD(520), attack: 3 }, 'pad', 0.3, note('C3'), 0.4, len);
    if (f.occ % 2 === 1) this.play(b, CHOIR('mm'), 'choir', 1, note('F3'), 0.35, len - 2);
  }
}

// ═════════════════════════════════════ ALONE ═════════════════════════════════════

/** the leitmotif in D minor, slow and sparse — the Silence, small and alone */
const ALONE: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1.5], [1, 0.5], [0, 2]],
  [[5, 1], [4, 1], [3, 1], [null, 1]],
  [[1, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1.5], [3, 0.5], [4, 1], [5, 1]],
  [[6, 1], [5, 1], [4, 1], [3, 1]],
  [[4, 4]],
];

export class AloneTheme extends Song {
  readonly bpm = END_BPM;
  readonly level: number = 0.6;
  readonly key = new Scale(note('D4'), MODES.aeolian);
  readonly warm: [BufInst, number, number][] = [['piano', 36, 89], ['celesta', 76, 96]];
  protected readonly form: Form = new Form([{ name: 'alone', bars: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'C', ['A7sus4', 'A7']] }], [], ['alone']);
  setup(p: Player): void {
    p.ch('piano', { gain: 0.6, wet: 0.45 });
    p.ch('lh', { gain: 0.4, wet: 0.45, pan: -0.1 });
    p.ch('celesta', { gain: 0.3, wet: 0.6, pan: 0.2 });
    p.ch('pad', { gain: 0.3, wet: 0.55, filterLfoHz: 120, filterLfoRate: 0.04 });
    p.ch('bass', { gain: 0.3, wet: 0.1 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const mel = lineNotes(this.key, note('D5'), this.beats, [ALONE[f.i]], { vel: 0.62 });
    this.notes(b, mel, 'piano', 'piano', 1, 1.15, 1.2);
    if (f.occ > 0) this.notes(b, mel.map((n) => ({ ...n, midi: n.midi + 12 })), 'celesta', 'celesta', 0.4, 1.1);
    this.chords(b, f, 'pad', PAD(800), 'pad', 50, 65, 3, 0.4, 0.8);
    this.play(b, 'piano', 'lh', 0, this.root(f, 0, 38), 0.32, 3 * b.spb, 1.5);
    if (f.i % 2 === 1) this.play(b, 'piano', 'lh', 2, this.tone(this.cAt(f, 2), 45, 2), 0.22, 2 * b.spb, 1.2);
    if (f.i === 0) this.play(b, SUB(), 'bass', 0, note('D2'), 0.3, 4 * b.beats * b.spb * 0.5);
  }
}

// ═════════════════════════════════════ BLOOM ═════════════════════════════════════

const CADENCE: (string | string[])[] = [['Bbmaj7', 'Gm7'], ['C7sus4', 'C7'], 'F', 'F', 'F'];

export class BloomTheme extends Song {
  readonly bpm = END_BPM;
  readonly level: number = 1;
  readonly reverb = 'spire' as const;
  readonly key = new Scale(note('F4'), MODES.major);
  readonly warm: [BufInst, number, number][] = [['pizz', 29, 62], ['harp', 53, 93], ['timp', 39, 53], ['taiko', 30, 36], ['crash', 60, 60], ['tbell', 52, 72], ['glass', 79, 100], ['choir', 53, 74], ['brass', 41, 67], ['gong', 60, 60]];
  protected readonly form: Form = new Form(
    [
      { name: 'swell', bars: ['Fsus2', 'Bbmaj7/F'] },
      { name: 'A', bars: LEIT_A_RICH_CHORDS },
      { name: 'B4', bars: ['Dm9', 'Bbmaj7', 'Gm7', ['C7sus4', 'C7']] },
      { name: 'A2', bars: LEIT_A_RICH_CHORDS },
    ],
    ['swell'],
    ['A', 'B4', 'A2'],
  );
  setup(p: Player): void {
    p.ch('strings', { gain: 0.5, wet: 0.45, vibratoCents: 8 });
    p.ch('pizz', { gain: 0.5, wet: 0.25, pan: -0.1 });
    p.ch('harp', { gain: 0.38, wet: 0.45, pan: -0.25 });
    p.ch('horn', { gain: 0.6, wet: 0.45, vibratoCents: 5 });
    p.ch('horn2', { gain: 0.42, wet: 0.45, vibratoCents: 4, pan: -0.15 });
    p.ch('violins', { gain: 0.55, wet: 0.48, vibratoCents: 11, vibratoRate: 5.4, pan: 0.15 });
    p.ch('choir', { gain: 0.44, wet: 0.55, vibratoCents: 5 });
    p.ch('brass', { gain: 0.42, wet: 0.4 });
    p.ch('timp', { gain: 0.55, wet: 0.35 });
    p.ch('kit', { gain: 0.42, wet: 0.3 });
    p.ch('bells', { gain: 0.3, wet: 0.65, pan: 0.25 });
    p.ch('glass', { gain: 0.28, wet: 0.65, pan: -0.3 });
    p.ch('bass', { gain: 0.45, wet: 0.06 });
  }

  private bowBar(p: Player): number {
    return p.state.bowBar ?? Infinity;
  }

  chordAt(bar: number, beat: number, p: Player): Chord {
    const k = bar - this.bowBar(p);
    if (k >= 0) {
      const raw = CADENCE[Math.min(k, CADENCE.length - 1)];
      const cs = (Array.isArray(raw) ? raw : [raw]).map(chord);
      return cs[Math.min(cs.length - 1, Math.floor((beat / this.beats) * cs.length))];
    }
    return super.chordAt(bar, beat, p);
  }

  compose(b: BarCtx): void {
    const k = b.bar - this.bowBar(b.p);
    if (k >= 0) {
      this.cadence(b, k);
      return;
    }
    super.compose(b);
  }

  /** the bow: Bb–Gm7 | C7sus4–C7 | F (the big last chord, shimmering) */
  private cadence(b: BarCtx, k: number): void {
    const F4 = note('F4');
    if (k >= 5) {
      b.p.stop(3);
      return;
    }
    if (k >= 3) return;
    const raw = CADENCE[k];
    const f: BarInfo = {
      bar: b.bar, sec: 'bow', i: k, n: 3, start: b.bar - k, occ: 0, chords: (Array.isArray(raw) ? raw : [raw]).map(chord), chord: chord(Array.isArray(raw) ? raw[0] : raw),
      next: chord('F'), cycle: 0, pos: k / 2, last: k === 2, intro: false,
    };
    const horn: Line = [[[3, 2], [5, 2]], [[4, 2], [6, 2]], [[7, 4]]];
    const mel = lineNotes(this.key, F4, this.beats, [horn[k]], { vel: 0.8 });
    if (k < 2) {
      this.chords(b, f, 'str', STRINGS(0.9), 'strings', 50, 72, 5, 0.62, 0.4);
      this.chords(b, f, 'cho', CHOIR('ah'), 'choir', 55, 72, 4, 0.55, 0.4);
      this.notes(b, mel, HORNLEAD(0.85), 'horn', 1, 0.97);
      this.notes(b, mel, VIOLIN(0.9), 'violins', 0.65, 0.97);
      this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 1, 0.6], [2, 0, 1, 0.55]], 34);
      this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), 0.45, b.beats * b.spb);
      this.drum(b, 'taiko', 'timp', 'x...x...x...x...', 0.36, 33);
      if (k === 1) {
        this.roll(b, 'timp', 'timp', 1, 4, 8, 0.1, 0.6, note('C3'));
        for (let i = 0; i < 14; i++) this.play(b, 'harp', 'harp', 2 + i / 7, this.key.deg(this.key.degreeOf(note('F3')) + i), 0.26, 1.4 * b.spb);
      }
      return;
    }
    // the last chord
    const ring = 6.5;
    const F = chord('Fadd9');
    for (const m of [note('F2'), note('C3'), note('F3'), note('A3'), note('C4'), note('F4'), note('A4'), note('C5')]) this.play(b, { ...STRINGS(1), attack: 0.06, release: 3.5 }, 'strings', 0, m, 0.7, ring, undefined, 0.002);
    for (const m of [note('F3'), note('A3'), note('C4'), note('F4'), note('A4')]) this.play(b, { ...CHOIR('ah'), attack: 0.2, release: 3.5 }, 'choir', 0, m, 0.6, ring, undefined, 0.002);
    for (const m of [note('F2'), note('C3'), note('F3'), note('A3'), note('C4')]) this.play(b, 'brass', 'brass', 0, m, 0.5, 3, 1.5, 0.002);
    for (const m of [note('F3'), note('C4'), note('F4')]) this.play(b, { ...LOWBRASS(0.8), attack: 0.05, release: 3 }, 'brass', 0, m, 0.6, ring - 1, undefined, 0.002);
    this.notes(b, mel, HORNLEAD(0.9), 'horn', 1, 1);
    this.play(b, 'timp', 'timp', 0, note('F2'), 0.8, 4, undefined, 0.001);
    b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.6);
    b.p.hit('gong', 'kit', this.T(b, 0, 0.001), 0.3);
    this.play(b, 'taiko', 'timp', 0, 29, 0.8, 2, undefined, 0.001);
    this.play(b, { ...SUB(), attack: 0.02, release: 3 }, 'bass', 0, note('F1'), 0.6, ring - 1, undefined, 0.001);
    this.play(b, 'tbell', 'bells', 0.02, note('F4'), 0.35, 7);
    const up = chordTones(F, 77, 101);
    up.forEach((m, i) => this.play(b, 'glass', 'glass', 0.4 + i * 0.22, m, 0.2, 3.5, 2.5));
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const F4 = note('F4');
    const s = f.sec;
    if (s === 'swell') {
      this.chords(b, f, 'str', { ...STRINGS(0.5 + 0.3 * f.i), attack: 1.8 }, 'strings', 53, 72, 4, 0.4 + 0.2 * f.i, 0.5);
      this.roll(b, 'timp', 'timp', f.i === 0 ? 2 : 0, 4, 6, 0.08 + 0.15 * f.i, 0.25 + 0.3 * f.i, note('C3'));
      const tones = chordTones(f.chord, 55, 93);
      if (f.i === 1) for (let k = 0; k < 16; k++) this.play(b, 'harp', 'harp', 2 + k / 8, tones[k % tones.length], 0.2 + 0.01 * k, 1.4 * b.spb);
      return;
    }
    const bar = s === 'B4' ? (f.i < 3 ? LEIT_B[f.i] : LEIT_B[7]) : LEIT_A[f.i];
    const mel = (shift: number) => lineNotes(this.key, F4, this.beats, [bar], { vel: 0.74, shift });
    const big = s === 'A2';
    if (s === 'B4') {
      this.notes(b, mel(7), VIOLIN(0.85), 'violins', 0.75, 0.97);
      this.notes(b, mel(0), HORNLEAD(0.4), 'horn2', 0.45, 0.97);
    } else {
      this.notes(b, mel(0), HORNLEAD(0.8), 'horn', 1, 0.97);
      this.notes(b, mel(-7), HORNLEAD(0.45), 'horn2', 0.55, 0.97);
      this.notes(b, mel(7), VIOLIN(0.9), 'violins', 0.66, 0.97);
    }
    this.chords(b, f, 'str', STRINGS(0.85), 'strings', 50, 72, 4, 0.6, 0.35);
    this.chords(b, f, 'cho', CHOIR('ah'), 'choir', 55, 72, 4, big ? 0.58 : 0.5, 0.4);
    this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.62], [1, 3, 0.5, 0.4], [2, 2, 0.6, 0.52], [3, 3, 0.5, 0.4]], 34);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), 0.42, b.beats * b.spb);
    this.ostinato(b, f, 'harp', 'harp', 60, 86, [0, 1, 2, 3, 4, 3, 2, 1], 0.36, 1.0, [0, 4]);
    this.drum(b, 'taiko', 'timp', 'x...x...x...x...', 0.34, 33);
    if (f.i === 0 || f.i === 4 || big) this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.5, 3, undefined, 0.002);
    if (f.i === 0) {
      b.p.hit('crash', 'kit', this.T(b, 0, 0.001), big ? 0.45 : 0.35);
      this.play(b, 'tbell', 'bells', 0, note('F4'), 0.3, 6);
    }
    if (big) for (let k = 0; k < 3; k++) this.play(b, 'glass', 'glass', rand(0.5, 3.5), pick(chordTones(f.chord, 84, 98)), 0.18, 2.5);
  }
}
