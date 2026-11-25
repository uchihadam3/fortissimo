/**
 * MENU — the FORTÍSSIMO theme: a warm, epic journey melody (F major, orchestral-folk with a
 * film-score heart): pizzicato, harp and piano arpeggios, a horn melody, soft timpani.
 * Form: intro · A (horn) · A2 (flute + violins, horn counter-line) · B (solo piano, relative
 * minor) · A3 (tutti, the turtle's footsteps) · turn → back to A (≈94 s loop, 104 s first pass).
 *
 * MAP — a light, playful variation of the leitmotif (C major): pizz, flute, celesta, shaker.
 */
import { SONGS } from '../../../sim/defs';
import { Form, LEIT_A, LEIT_A_RICH_CHORDS, LEIT_B, LEIT_B_RICH_CHORDS, type BarInfo, type Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { CHOIR, CLARINET, FLUTE, HORNLEAD, LOWBRASS, OBOE, PAD, STRINGS, SUB, VIOLIN, type BufInst } from '../synth';
import { chordTones, MODES, note, Scale } from '../theory';
import { chance, pick, rand } from '../util';
import { Song } from './base';

const UP8 = [0, 1, 2, 3, 4, 5, 6, 7];
const BROKEN8 = [0, 2, 1, 3, 2, 4, 3, 1];
const UPDOWN8 = [0, 1, 2, 3, 4, 3, 2, 1];

export class MenuTheme extends Song {
  readonly bpm: number = SONGS.menu.bpm;
  readonly level: number = 1;
  readonly key = new Scale(note('F4'), MODES.major);
  readonly warm: [BufInst, number, number][] = [['pizz', 29, 62], ['harp', 48, 89], ['piano', 41, 89], ['timp', 39, 53], ['celesta', 76, 96], ['tamb', 60, 60], ['taiko', 30, 36]];
  protected readonly energy: Record<string, number> = { intro: 0.9, A: 0.95, A2: 1.0, B: 0.95, A3: 1.08, turn: 0.92 };
  protected readonly form: Form = new Form(
    [
      { name: 'intro', bars: ['Fadd9', 'Bbmaj7/F', 'Fadd9', 'C7sus4'] },
      { name: 'A', bars: LEIT_A_RICH_CHORDS },
      { name: 'A2', bars: LEIT_A_RICH_CHORDS },
      { name: 'B', bars: LEIT_B_RICH_CHORDS },
      { name: 'A3', bars: LEIT_A_RICH_CHORDS },
      { name: 'turn', bars: ['Bbmaj7', 'F/A', 'Gm7', ['C7sus4', 'C7']] },
    ],
    ['intro'],
    ['A', 'A2', 'B', 'A3', 'turn'],
  );

  setup(p: Player): void {
    p.ch('strings', { gain: 0.5, wet: 0.4, vibratoCents: 7, pan: 0.05 });
    p.ch('pizz', { gain: 0.62, wet: 0.24, pan: -0.1 });
    p.ch('bass', { gain: 0.42, wet: 0.06 });
    p.ch('harp', { gain: 0.42, wet: 0.36, pan: -0.25 });
    p.ch('horn', { gain: 0.6, wet: 0.4, vibratoCents: 5, vibratoRate: 5 });
    p.ch('horn2', { gain: 0.42, wet: 0.42, vibratoCents: 4, pan: -0.15 });
    p.ch('hornpad', { gain: 0.42, wet: 0.45, pan: 0.18 });
    p.ch('violins', { gain: 0.55, wet: 0.42, vibratoCents: 11, vibratoRate: 5.4, pan: 0.15 });
    p.ch('flute', { gain: 0.48, wet: 0.4, vibratoCents: 12, vibratoRate: 5.2, pan: 0.22 });
    p.ch('oboe', { gain: 0.5, wet: 0.38, vibratoCents: 10, vibratoRate: 5.1, pan: 0.08 });
    p.ch('choir', { gain: 0.42, wet: 0.5, vibratoCents: 5 });
    p.ch('timp', { gain: 0.55, wet: 0.32 });
    p.ch('celesta', { gain: 0.3, wet: 0.5, pan: 0.32 });
    p.ch('perc', { gain: 0.26, wet: 0.2, pan: 0.28 });
    p.ch('piano', { gain: 0.5, wet: 0.34, pan: 0.05 });
    p.ch('pianolead', { gain: 0.58, wet: 0.36, pan: -0.04 });
  }

  protected onSection(_b: BarCtx, f: BarInfo): void {
    const F4 = note('F4');
    switch (f.sec) {
      case 'A':
        this.lines.mel = [{ notes: this.line(this.key, F4, LEIT_A), inst: HORNLEAD(0.55), ch: 'horn', vel: 0.95 }];
        break;
      case 'A2':
        this.lines.mel = [
          { notes: this.line(this.key, F4, LEIT_A, { shift: 7 }), inst: FLUTE(), ch: 'flute', vel: 0.8 },
          { notes: this.line(this.key, F4, LEIT_A, { shift: 7 }), inst: VIOLIN(0.7), ch: 'violins', vel: 0.62 },
        ];
        break;
      case 'B': {
        // the B melody on solo piano, an oboe joining for the climb
        const mel = this.line(this.key, F4, LEIT_B, { shift: 7 });
        this.lines.mel = [
          { notes: mel, inst: 'piano', ch: 'pianolead', vel: 0.62, legato: 1.05, release: 0.9 },
          { notes: this.line(this.key, F4, LEIT_B).filter((n) => n.beat >= 16), inst: OBOE(), ch: 'oboe', vel: 0.6 },
        ];
        break;
      }
      case 'A3':
        this.lines.mel = [
          { notes: this.line(this.key, F4, LEIT_A), inst: HORNLEAD(0.75), ch: 'horn', vel: 1.0 },
          { notes: this.line(this.key, F4, LEIT_A, { shift: -7 }), inst: HORNLEAD(0.4), ch: 'horn2', vel: 0.62 },
          { notes: this.line(this.key, F4, LEIT_A, { shift: 7 }), inst: VIOLIN(0.85), ch: 'violins', vel: 0.66 },
        ];
        break;
    }
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const s = f.sec;
    const big = s === 'A3';
    // strings bed
    const sv = s === 'intro' ? 0.32 + 0.1 * f.i : big ? 0.6 : s === 'B' ? 0.55 : 0.48;
    this.chords(b, f, 'str', STRINGS(big ? 0.8 : 0.45), 'strings', 53, 72, big ? 4 : 3, sv, 0.35);

    // harp
    if (s === 'intro') this.ostinato(b, f, 'harp', 'harp', 53, 81, UP8, 0.3 + 0.05 * f.i, 1.4, [0, 4]);
    else if (s === 'A') this.ostinato(b, f, 'harp', 'harp', 60, 79, BROKEN8, 0.28, 1.1, [0, 4], 0.2);
    else if (s === 'A2') this.ostinato(b, f, 'harp', 'harp', 57, 79, UPDOWN8, 0.36, 1.1, [0, 4], 0.06);
    else if (s === 'B' && f.i % 2 === 1) this.ostinato(b, f, 'harp', 'harp', 62, 84, [0, 1, 2, 3], 0.22, 1.8, [0]);
    else if (s === 'A3') {
      this.ostinato(b, f, 'harp', 'harp', 60, 84, UP8, 0.38, 1.0, [0, 4], 0.05);
      if (f.i === 3 || f.i === 7) for (let k = 0; k < 8; k++) this.play(b, 'harp', 'harp', 2 + k * 0.25, this.key.deg(this.key.degreeOf(note('C6')) - k), 0.3, 0.6 * b.spb);
    } else if (s === 'turn') {
      if (f.i === 0) for (let k = 0; k < 12; k++) this.play(b, 'harp', 'harp', k * (2 / 12), this.key.deg(this.key.degreeOf(note('F3')) + k * 1), 0.26 + k * 0.012, 1.2 * b.spb);
      else this.ostinato(b, f, 'harp', 'harp', 55, 77, UPDOWN8, 0.34, 1.1, [0, 4]);
    }

    // piano: flowing broken chords (intro, A, B) — the film-score heart
    if (s === 'intro') this.ostinato(b, f, 'piano', 'piano', 41, 69, [0, 2, 3, 4, 5, 4, 3, 2], 0.26 + 0.03 * f.i, 1.6, [0, 4]);
    else if (s === 'A' || s === 'turn') this.ostinato(b, f, 'piano', 'piano', 41, 65, [0, 2, 4, 2, 1, 3, 4, 3], 0.24, 1.4, [0, 4]);
    else if (s === 'B') this.ostinato(b, f, 'piano', 'piano', 38, 62, [0, 2, 3, 2, 0, 2, 3, 2], 0.26, 1.5, [0, 4]);

    // bass
    if (s === 'A' || s === 'B') {
      this.bassline(b, f, 'pizz', 'pizz', s === 'B' ? [[0, 0, 2, 0.6], [2, 2, 2, 0.48]] : [[0, 0, 1, 0.62], [2, 2, 1, 0.5]], 34);
      if (s === 'A' && f.i % 2 === 1 && chance(0.6)) this.bassline(b, f, 'pizz', 'pizz', [[3.5, 3, 0.5, 0.34]], 34);
      if (s === 'B') this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), 0.5, b.beats * b.spb);
    } else if (s === 'A2' || s === 'A3') {
      this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.64], [1, 3, 0.5, 0.42], [2, 2, 0.6, 0.54], [3, 3, 0.5, 0.42]], 34);
      if (big) this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), 0.45, b.beats * b.spb);
    } else if (s === 'turn') {
      this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 1, 0.6], [2, 2, 1, 0.46], [3, 3, 0.8, 0.4]], 34);
    }

    // timpani
    const timp = (beat: number, vel: number) => this.play(b, 'timp', 'timp', beat, this.root(f, beat, 41), vel, 3, undefined, 0.002);
    if (s === 'intro' && f.i === 3) this.roll(b, 'timp', 'timp', 1, 4, 6, 0.08, 0.42, note('C3'));
    if (s === 'A' && (f.i === 0 || f.i === 4)) timp(0, 0.42);
    if (s === 'A2' && f.i % 2 === 0) timp(0, 0.4);
    if (big) {
      timp(0, 0.55);
      if (f.i === 3 || f.i === 7) this.roll(b, 'timp', 'timp', 2, 4, 6, 0.15, 0.45, this.root(f, 2, 41));
    }
    if (s === 'turn' && f.last) this.roll(b, 'timp', 'timp', 1, 4, 6, 0.1, 0.5, note('C3'));

    // percussion
    if (s === 'A2') this.drum(b, 'tamb', 'perc', '....x.......x...', 0.42);
    if (big) {
      // the journey: soft footsteps on every beat under the tutti
      this.drum(b, 'tamb', 'perc', 'x.o.x.o.x.o.x.oo', 0.42);
      this.drum(b, 'taiko', 'timp', 'x...x...x...x...', 0.3, 33);
    }

    // choir & horns
    if (s === 'B') this.chords(b, f, 'choir', CHOIR('oo'), 'choir', 55, 69, 3, 0.42, 0.6);
    if (big) this.chords(b, f, 'choir', CHOIR('ah'), 'choir', 55, 72, 4, 0.55, 0.4);
    if (s === 'A2') this.chords(b, f, 'hp', LOWBRASS(0.4), 'hornpad', 50, 64, 2, 0.5, 0.4);
    if (big || s === 'turn') this.chords(b, f, 'hp', LOWBRASS(0.55), 'hornpad', 48, 62, 3, big ? 0.55 : 0.45, 0.4);

    // celesta glimmers
    if (s === 'intro') for (let k = 0; k < 2; k++) this.play(b, 'celesta', 'celesta', rand(0.3, 3.5), pick(chordTones(f.chord, 79, 91)), 0.24, 2 * b.spb);
    if ((s === 'B' && (f.i === 3 || f.i === 7)) || (s === 'A2' && f.i === 7)) {
      const tones = chordTones(this.cAt(f, 2.5), 76, 93);
      for (let k = 0; k < 8; k++) this.play(b, 'celesta', 'celesta', 2 + k * 0.25, tones[k % tones.length], 0.2, 1.2 * b.spb);
    }
  }
}

// ═════════════════════════════════════ MAP ═════════════════════════════════════

/** The leitmotif, bounced: staccato quavers with rests (C major). */
const MAP_A: Line = [
  [[0, 0.5], [4, 0.5], [4, 0.5], [null, 0.5], [3, 0.5], [2, 0.5], [null, 1]],
  [[1, 0.5], [null, 0.5], [2, 0.5], [3, 0.5], [4, 1], [null, 1]],
  [[5, 0.5], [5, 0.5], [4, 0.5], [2, 0.5], [null, 0.5], [2, 0.5], [3, 0.5], [2, 0.5]],
  [[1, 1.5], [null, 2.5]],
  [[0, 0.5], [4, 0.5], [4, 0.5], [null, 0.5], [3, 0.5], [2, 0.5], [null, 1]],
  [[1, 0.5], [null, 0.5], [2, 0.5], [3, 0.5], [5, 1], [null, 1]],
  [[7, 0.5], [7, 0.5], [6, 0.5], [5, 0.5], [6, 0.5], [null, 0.5], [4, 0.5], [6, 0.5]],
  [[7, 1.5], [null, 2.5]],
];
const MAP_A_CHORDS: (string | string[])[] = ['C', ['Dm7', 'G7'], 'Am7', 'G', 'C', ['Dm7', 'F'], ['F', 'G'], 'C'];

/** answer: broken-chord figures tossed between flute and celesta */
const MAP_B: Line = [
  [[5, 0.5], [7, 0.5], [5, 0.5], [3, 0.5], [0, 1], [null, 1]],
  [[6, 0.5], [8, 0.5], [6, 0.5], [4, 0.5], [1, 1], [null, 1]],
  [[4, 0.5], [6, 0.5], [8, 0.5], [6, 0.5], [9, 1], [null, 1]],
  [[7, 1.5], [6, 0.5], [5, 1], [null, 1]],
  [[3, 0.5], [5, 0.5], [7, 0.5], [5, 0.5], [3, 1], [null, 1]],
  [[4, 0.5], [6, 0.5], [8, 0.5], [6, 0.5], [4, 1], [null, 1]],
  [[2, 0.5], [4, 0.5], [6, 0.5], [4, 0.5], [5, 0.5], [7.5, 0.5], [9, 0.5], [11, 0.5]],
  [[10, 1], [8, 1], [6, 1], [4, 0.5], [null, 0.5]],
];
const MAP_B_CHORDS: (string | string[])[] = ['F', 'G', 'Em7', 'Am', 'Dm7', 'G', ['Em7', 'A7'], ['Dm7', 'G7']];

const MAP_C: Line = [
  [[5, 1], [9, 1.5], [8, 0.5], [7, 1]],
  [[3, 1.5], [5, 0.5], [7, 2]],
  [[8, 1], [7, 1], [5, 1], [3, 1]],
  [[4, 2], [null, 1], [4, 0.5], [6, 0.5]],
];

export class MapTheme extends Song {
  readonly bpm: number = SONGS.map.bpm;
  readonly level: number = 1.4;
  readonly key = new Scale(note('C4'), MODES.major);
  readonly warm: [BufInst, number, number][] = [['pizz', 31, 74], ['celesta', 72, 100], ['shaker', 60, 60], ['tamb', 60, 60], ['harp', 55, 84]];
  protected readonly energy: Record<string, number> = { intro: 0.9, A: 1, B: 0.98, A2: 1.04, C: 0.95 };
  protected readonly form: Form = new Form(
    [
      { name: 'intro', bars: ['C', 'G7sus4'] },
      { name: 'A', bars: MAP_A_CHORDS },
      { name: 'B', bars: MAP_B_CHORDS },
      { name: 'A2', bars: MAP_A_CHORDS },
      { name: 'C', bars: ['Am', 'F', 'Dm7', 'G7'] },
    ],
    ['intro'],
    ['A', 'B', 'A2', 'C'],
  );

  setup(p: Player): void {
    p.ch('pizz', { gain: 0.6, wet: 0.22, pan: -0.12 });
    p.ch('chick', { gain: 0.34, wet: 0.24, pan: 0.2 });
    p.ch('flute', { gain: 0.5, wet: 0.36, vibratoCents: 13, vibratoRate: 5.4, pan: -0.15 });
    p.ch('celesta', { gain: 0.36, wet: 0.42, pan: 0.25 });
    p.ch('clar', { gain: 0.48, wet: 0.36, vibratoCents: 6, pan: 0.1 });
    p.ch('pad', { gain: 0.36, wet: 0.42, filterLfoHz: 200, filterLfoRate: 0.08 });
    p.ch('shaker', { gain: 0.22, wet: 0.15, pan: 0.32 });
    p.ch('harp', { gain: 0.3, wet: 0.35, pan: -0.3 });
  }

  protected onSection(_b: BarCtx, f: BarInfo): void {
    const C5 = note('C5');
    if (f.sec === 'A') this.lines.mel = [{ notes: this.line(this.key, C5, MAP_A), inst: FLUTE(), ch: 'flute', vel: 0.82, legato: 0.8 }];
    if (f.sec === 'A2')
      this.lines.mel = [
        { notes: this.line(this.key, C5, MAP_A), inst: FLUTE(), ch: 'flute', vel: 0.78, legato: 0.8 },
        { notes: this.line(this.key, C5, MAP_A, { shift: 7 }), inst: 'celesta', ch: 'celesta', vel: 0.55 },
      ];
    if (f.sec === 'B') {
      const all = this.line(this.key, C5, MAP_B);
      const flute = all.filter((n) => Math.floor(n.beat / 8) % 2 === 0);
      const cel = all.filter((n) => Math.floor(n.beat / 8) % 2 === 1).map((n) => ({ ...n, midi: n.midi + 12 }));
      this.lines.mel = [
        { notes: flute, inst: FLUTE(), ch: 'flute', vel: 0.8, legato: 0.82 },
        { notes: cel, inst: 'celesta', ch: 'celesta', vel: 0.6 },
      ];
    }
    if (f.sec === 'C') this.lines.mel = [{ notes: this.line(this.key, note('C4'), MAP_C), inst: CLARINET(), ch: 'clar', vel: 0.85, legato: 0.92 }];
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const s = f.sec;
    // bouncing pizz bass with pickups
    if (s === 'C') this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.7, 0.62], [1, 1, 0.5, 0.42], [2, 2, 0.6, 0.52], [3, 1, 0.5, 0.4]], 36);
    else this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.7, 0.62], [1.5, 2, 0.4, 0.36], [2, 2, 0.6, 0.52], [3.5, 3, 0.4, 0.34]], 36);
    // "chick" — staccato pizz chords on 2 and 4
    for (const beat of [1, 3]) {
      const tones = chordTones(this.cAt(f, beat), 60, 72).slice(0, 3);
      for (const m of tones) this.play(b, 'pizz', 'chick', beat, m, 0.34, 0.25 * b.spb);
    }
    if (s === 'intro') {
      const tones = chordTones(f.chord, 72, 91);
      for (let k = 0; k < 8; k++) this.play(b, 'celesta', 'celesta', k * 0.5, tones[k % tones.length], 0.2 + 0.02 * k, 0.8 * b.spb);
      return;
    }
    // light shaker (offbeats a touch louder)
    this.drum(b, 'shaker', 'shaker', s === 'A2' ? 'oxoxoxoxoxoxoxox' : 'o.x.o.x.o.x.o.x.', 0.5, 60, 0.004);
    if (s === 'A2') this.drum(b, 'tamb', 'shaker', '............x...', 0.45);
    if (s === 'A2' || s === 'B') this.chords(b, f, 'pad', PAD(1500), 'pad', 52, 67, 3, 0.42, 0.4);
    if (s === 'C') this.ostinato(b, f, 'harp', 'harp', 55, 79, [0, 1, 2, 3, 4, 3, 2, 1], 0.3, 1.0, [0, 4]);
    // celesta sparkle at phrase ends
    if (s === 'A' && (f.i === 3 || f.i === 7)) {
      const tones = chordTones(f.chord, 79, 96);
      [2, 2.5, 3, 3.5].forEach((beat, k) => this.play(b, 'celesta', 'celesta', beat, tones[(k * 2) % tones.length], 0.28, 0.8 * b.spb));
    }
  }
}
