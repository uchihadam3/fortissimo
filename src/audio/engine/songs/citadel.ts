/**
 * CITADEL — "Cidadela do Silêncio": D minor, 116 bpm. The Needle, from where the song was conducted,
 * gives the world its pause — so this is the solemn land: the pipe organ, a dark choir, tubular
 * bells, clockwork ticks and a harpsichord toccata, timpani, low brass, footsteps on marble.
 *
 * The head comes in augmentation — D (two beats) A (two beats)… G F — majestic and slow over the
 * running pulse. Tunes: A (the citadel hymn, harmonic-minor cadence) · B (the chant, with the
 * Neapolitan E♭) · C (the clockwork, over the lament bass D–C♯–C–B–B♭). Movements: D → G → B →
 * C → E minor.
 */
import { SONGS } from '../../../sim/defs';
import type { BarInfo, Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { CHOIR, LOWBRASS, ORGAN, SUB, VIOLIN, CELLO, type BufInst } from '../synth';
import { MODES, note, Scale } from '../theory';
import type { PlanDef, SecDef } from './adaptive';
import { Battle, type Kit } from './battle';

export const CITADEL_A: Line = [
  [[0, 2], [4, 2]],
  [[4, 1], [3, 1], [2, 2]],
  [[1, 2], [2, 1], [3, 1]],
  [[4, 3], [null, 1]],
  [[0, 2], [4, 2]],
  [[5, 1], [4, 1], [3, 2]],
  [[4, 1], [6.5, 1], [8, 1], [6.5, 1]],
  [[7, 3], [null, 1]],
];

export const CITADEL_B: Line = [
  [[5, 2], [4, 1], [5, 1]],
  [[6, 2], [5, 1], [4, 1]],
  [[4, 1.5], [3, 0.5], [2, 1], [0, 1]],
  [[0.5, 2], [3, 2]],
  [[3, 2], [5, 2]],
  [[5, 1], [3, 1], [0.5, 2]],
  [[-0.5, 1], [1, 1], [4, 2]],
  [[0, 2], [2, 1], [4, 1]],
];

export const CITADEL_C: Line = [
  [[7, 4]],
  [[7, 2], [6.5, 2]],
  [[6, 4]],
  [[5.5, 2], [4, 2]],
  [[5, 2], [4, 1], [3, 1]],
  [[3, 2], [1, 2]],
  [[3, 2], [4, 2]],
  [[6.5, 4]],
];

const SECTIONS: SecDef[] = [
  { name: 'A', bars: ['Dm', 'Dm/C', 'C', 'A', 'Dm', 'Gm', 'A7', 'Dm'], tune: CITADEL_A },
  { name: 'B', bars: ['Bb', 'C', 'Dm', 'Eb/G', 'Gm', 'Eb', 'A7', 'Dm'], tune: CITADEL_B },
  { name: 'C', bars: ['Dm', 'Dm/C#', 'Dm/C', 'Dm/B', 'Bb', 'Gm6', 'A7sus4', 'A7'], tune: CITADEL_C },
];

const PLANS: PlanDef[] = [
  { shift: 0, order: ['A', 'B', 'A', 'C'], breaks: ['A', 'B', 'C'] },
  { shift: 5, order: ['B', 'C', 'B', 'A'], breaks: ['B', 'A', 'C'] },
  { shift: -3, order: ['C', 'A', 'C', 'B'], breaks: ['C', 'A'] },
  { shift: -2, order: ['A', 'C', 'B', 'A'], breaks: ['B', 'C', 'A'] },
  { shift: 2, order: ['A', 'B', 'C', 'A'], breaks: ['A', 'C', 'B'] },
];

export class CitadelTheme extends Battle {
  readonly bpm: number = SONGS.citadel.bpm;
  readonly level: number = 0.68;
  readonly reverb = 'cave' as const;
  readonly key = new Scale(note('D4'), MODES.aeolian);
  readonly warm: [BufInst, number, number][] = [['choir', 50, 74], ['choiroo', 50, 70], ['tick', 60, 60], ['tbell', 48, 72], ['tom', 40, 56], ['kick', 60, 60], ['snare', 60, 60], ['harpsi', 48, 76], ['timp', 36, 53], ['taiko', 30, 36], ['crash', 60, 60], ['glass', 84, 100], ['brass', 45, 62], ['gong', 60, 60], ['shaker', 60, 60], ['clap', 60, 60]];
  protected readonly sections = SECTIONS;
  protected readonly plans = PLANS;
  protected readonly kit: Kit = { snare: 'snare', perc: 'kit', shake: 'shaker', clap: 'clap', glock: 'glass', glockCh: 'glass', bell: 'tbell', bellCh: 'bells', brass: 'horns', choir: 'choir', bass: 'bass', timp: 'timp' };

  setup(p: Player): void {
    p.ch('organ', { gain: 0.36, wet: 0.45, pan: -0.05 });
    p.ch('organlead', { gain: 0.62, wet: 0.5, pan: 0.1, vibratoCents: 3, vibratoRate: 6 });
    p.ch('choirlead', { gain: 0.52, wet: 0.55, vibratoCents: 6 });
    p.ch('choir', { gain: 0.36, wet: 0.55, vibratoCents: 6, vibratoRate: 4.6 });
    p.ch('ticks', { gain: 0.22, wet: 0.3, pan: 0.3 });
    p.ch('bells', { gain: 0.28, wet: 0.6, pan: -0.2 });
    p.ch('glass', { gain: 0.18, wet: 0.7, pan: 0.3 });
    p.ch('kit', { gain: 0.46, wet: 0.24 });
    p.ch('harpsi', { gain: 0.26, wet: 0.36, pan: 0.22 });
    p.ch('timp', { gain: 0.48, wet: 0.35 });
    p.ch('horns', { gain: 0.38, wet: 0.42 });
    p.ch('bass', { gain: 0.44, wet: 0.05 });
    p.ch('cello', { gain: 0.42, wet: 0.4, vibratoCents: 8, pan: -0.12 });
    p.ch('vln', { gain: 0.3, wet: 0.5, vibratoCents: 9, pan: 0.22 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    const L = this.L(b);
    const brk = this.isBreak;
    const sec = f.sec;

    // ── core: the organ (pedal and chords), the root, the clockwork, steps on marble ──
    if (f.i % 2 === 0) this.play(b, ORGAN(0.2), 'organ', 0, this.root(f, 0, 38), 0.52, 2 * b.beats * b.spb);
    this.chords(b, f, 'org', ORGAN(0.3), 'organ', 50, 64, 3, brk ? 0.42 : I === 0 ? 0.48 : 0.4, 0.25);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 26), brk ? 0.34 : 0.4, (brk || I === 0 ? 4 : 2) * b.spb);
    const tk = brk ? 'x...x...x...x...' : I === 0 ? 'x.x.x.x.x.x.x.x.' : 'xoxoxoxoxoxoxoxo';
    for (let i = 0; i < 16; i++) {
      if (tk[i] === '.') continue;
      b.p.hit('tick', 'ticks', this.T(b, i * 0.25, 0.001), (tk[i] === 'x' ? 0.4 : 0.18) * this.vmul, i % 4 === 0 ? 64 : i % 2 === 0 ? 57 : 60);
    }
    const sv = brk ? 0.24 : [0.26, 0.42, 0.5, 0.56][I];
    const steps: { inst: BufInst; ch: string; midi?: number; v?: number }[] = brk || I === 0 ? [{ inst: 'tom', ch: 'kit', midi: 43 }] : [{ inst: 'kick', ch: 'kit' }, { inst: 'tom', ch: 'kit', midi: 43, v: 0.6 }];
    if (I >= 3) steps.push({ inst: 'taiko', ch: 'kit', midi: 33, v: 0.7 });
    this.steps(b, sv, steps);

    // ── the tune (breakdowns): the organ with the choir an octave below; the chant; the clockwork ──
    if (brk) {
      const mk = 1 + 0.05 * (5 - L.h);
      if (sec === 'A') {
        this.tune(b, f, ORGAN(0.85), 'organlead', 0.85 * mk, { legato: 0.98 });
        this.tune(b, f, CHOIR('oo'), 'choirlead', 0.5, { shift: -12, legato: 1.0 });
      } else if (sec === 'B') {
        this.tune(b, f, 'choir', 'choirlead', 0.42 * mk, { legato: 1.05 });
        if (L.h >= 2) this.tune(b, f, CELLO(), 'cello', 0.5, { shift: -12, legato: 1.0 });
      } else {
        this.tune(b, f, ORGAN(0.7), 'organlead', 0.8 * mk, { legato: 1.0 });
        this.ostinato(b, f, 'harpsi', 'harpsi', 50, 69, [0, 1, 2, 1, 0, 1, 2, 3], 0.3, 0.45, [0, 4]);
      }
      if (L.h >= 4 && L.bells) this.tune(b, f, 'tbell', 'bells', 0.22, { bars: [0, 4] });
    }
    if (f.i % 4 === 0 && (brk || I <= 1)) this.play(b, 'tbell', 'bells', 0, this.tone(f.chord, 50, 0) + 12, brk ? 0.3 : 0.34, 6);

    // ── strings: the harpsichord toccata ──
    if (L.strings) {
      const v = L.strings;
      if (brk) {
        if (sec !== 'C' && f.i % 2 === 1) this.ostinato(b, f, 'harpsi', 'harpsi', 50, 69, [0, 2, 1, 3], 0.26 * v, 0.9, [0]);
      } else if (I === 1) this.ostinato(b, f, 'harpsi', 'harpsi', 50, 66, [0, 1, 2, 1, 0, 1, 2, 3], 0.3 * v, 0.4, [0, 4]);
      else if (I >= 2) this.ostinato(b, f, 'harpsi', 'harpsi', 50, 66, [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 0, 1, 2, 3], 0.32 * v, 0.3, [0, 8]);
    }

    // ── percussion: snare and timpani ──
    if (L.percussion && !b.build) {
      const v = L.percussion;
      if (brk) {
        if (f.last) this.roll(b, 'timp', 'timp', 2, 4, 6, 0.06, 0.28 * v, this.root(f, 2, 38));
      } else if (I >= 1) {
        this.drum(b, 'snare', 'kit', I >= 3 ? '....x......ox..o' : I === 2 ? '....x.......x...' : '............x...', 0.44 * v);
        if (I >= 2) this.play(b, 'timp', 'timp', 0, this.root(f, 0, 38), 0.44 * v, 3, undefined, 0.002);
      }
      if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.24);
    }

    // ── bells: tubular bells and an eerie glass ──
    if (L.bells) {
      const v = L.bells;
      if (brk) {
        if (f.i % 4 === 2) this.play(b, 'glass', 'glass', 1, this.tone(this.cAt(f, 1), 86, 2), 0.16 * v, 3);
      } else {
        if (f.i % 2 === 0) this.play(b, 'tbell', 'bells', 0, this.root(f, 0, 50), 0.3 * v, 5);
        if (I >= 2 && f.i % 4 === 3) this.play(b, 'glass', 'glass', 2, this.tone(this.cAt(f, 2), 86, 0), 0.2 * v, 2.5);
      }
    }

    // ── brass: a low chorale; stabs at the climax ──
    if (L.brass) {
      const v = L.brass;
      if (brk) {
        if (f.i % 4 >= 2) this.chords(b, f, 'hp', { ...LOWBRASS(0.3), attack: 1.1 }, 'horns', 48, 62, 3, 0.36 * v, 0.4);
      } else if (I <= 1) {
        if (f.i % 2 === 0) this.chords(b, f, 'hc', { ...LOWBRASS(0.4), attack: 0.9 }, 'horns', 48, 62, 3, 0.42 * v, 0.3);
      } else {
        this.chords(b, f, 'hn', LOWBRASS(0.5), 'horns', 48, 62, 3, 0.48 * v, 0.3);
        if (I >= 3) this.stabs(b, f, 'hst', 'brass', 'horns', 45, 60, 3, [0, 2.5], 0.36 * v, 0.6);
      }
    }

    // ── voices: the dark choir ──
    if (L.voices) {
      const v = L.voices;
      if (brk) this.chords(b, f, 'ch', 'choiroo', 'choir', 52, 66, 3, 0.18 * v, 0.6);
      else this.chords(b, f, 'ch', I >= 3 ? 'choir' : 'choiroo', 'choir', I >= 3 ? 55 : 53, I >= 3 ? 72 : 67, I >= 3 ? 4 : 3, (I >= 3 ? 0.19 : 0.22) * v, 0.5);
    }

    // ── low: the pedal moves ──
    if (L.low) {
      const v = L.low;
      if (brk || I === 0) this.bassline(b, f, SUB(), 'bass', [[0, 0, 3.6, 0.36 * v]], 26);
      else this.bassline(b, f, SUB(), 'bass', I >= 2 ? [[0, 0, 0.9, 0.48 * v], [1, 0, 0.9, 0.34 * v], [2, 0, 0.9, 0.44 * v], [3, 2, 0.9, 0.34 * v]] : [[0, 0, 1.8, 0.46 * v], [2, 0, 1.8, 0.38 * v]], 26);
    }

    // ── harmony: violins; the choir sings the hymn at the climax ──
    if (!brk && I >= 1 && L.h >= 2) this.counter(b, f, VIOLIN(0.4), 'vln', 72, 84, 0.26 + 0.04 * L.h, I >= 3 ? 2 : 4);
    if (!brk && I >= 3 && L.h >= 4 && L.voices) this.tune(b, f, 'choir', 'choirlead', 0.32, { shift: -12, bars: [0, 1, 4, 5] });
    if (L.h >= 5 && f.i === 0 && !b.build) b.p.hit('gong', 'bells', this.T(b, 0, 0.001), I >= 2 ? 0.2 : 0.12);
    this.glory(b, f, L, I, null);
    this.duets(b, f, L, I);
    this.dropExtras(b, f, { ch: 'kit' }, 'bass');
  }

  protected fill(b: BarCtx): void {
    this.roll(b, 'timp', 'timp', 3, 4, 6, 0.2, 0.5, note('A2'));
  }
}
