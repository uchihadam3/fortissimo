/**
 * ICE — "Picos de Cristal": E Lydian (E F♯ G♯ A♯ B C♯ D♯ — the raised fourth that floats), 96 bpm.
 * The Crystal Organ gives the world its harmony, so this is the airy, glassy land: celesta and glass,
 * a music box, harp arpeggios, a glass harmonica, high violins, the airy "oo" choir, the organ;
 * soft sticks, brushed snare in a big space, a deep soft drum for steps in the snow.
 *
 * The head (E B. A♯ G♯) states the Lydian A♯ at once. Tunes: A (the crystal song, I–II over the
 * pedal) · B (the aurora, in C♯ dorian — the same notes, a minor heart) · C (the organ chorale).
 * Movements: E → its aurora → G Lydian (a lift by a third) → D → F♯ (the final lift).
 */
import { SONGS } from '../../../sim/defs';
import type { BarInfo, Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { GLASSHARM, LOWBRASS, ORGAN, PAD, SUB, VIOLIN, type BufInst } from '../synth';
import { chordTones, MODES, note, Scale } from '../theory';
import { pick } from '../util';
import type { PlanDef, SecDef } from './adaptive';
import { Battle, type Kit } from './battle';

export const ICE_A: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[3, 1.5], [2, 0.5], [1, 1], [5, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[3, 1], [5, 1], [7, 2]],
  [[6, 1.5], [5, 0.5], [4, 1], [2, 1]],
  [[4, 1.5], [3, 0.5], [2, 1], [4, 1]],
  [[3, 1], [1, 1], [3, 1], [5, 1]],
  [[4, 2], [null, 2]],
];

export const ICE_B: Line = [
  [[5, 2], [7, 0.5], [6, 0.5], [5, 1]],
  [[6, 1], [3, 1.5], [4, 0.5], [5, 1]],
  [[5, 2], [7, 0.5], [8, 0.5], [9, 1]],
  [[10, 3], [null, 1]],
  [[9, 1.5], [8, 0.5], [7, 1], [6, 1]],
  [[7, 1.5], [6, 0.5], [5, 1], [4, 1]],
  [[3, 1], [5, 1], [8, 1], [7, 1]],
  [[8, 2], [6, 2]],
];

/** the Crystal Organ's chorale: long notes over a slowly turning Lydian harmony */
export const ICE_C: Line = [
  [[7, 2], [9, 2]],
  [[8, 4]],
  [[6, 2], [8, 2]],
  [[9, 4]],
  [[9, 2], [8, 1], [7, 1]],
  [[8, 2], [7, 1], [8, 1]],
  [[8, 2], [7, 2]],
  [[6, 4]],
];

const SECTIONS: SecDef[] = [
  { name: 'A', bars: ['Emaj9', 'F#/E', 'Emaj9', 'F#/E', 'C#m9', 'G#m7', 'F#', ['Bsus4', 'B']], tune: ICE_A },
  { name: 'B', bars: ['C#m9', 'F#9', 'C#m9', 'F#9', 'G#m7', 'E/G#', 'F#/A#', 'B'], tune: ICE_B },
  { name: 'C', bars: ['Emaj7', 'F#/E', 'D#m7', 'G#m7', 'C#m7', 'F#7sus4', 'Bsus4', 'B'], tune: ICE_C },
];

const PLANS: PlanDef[] = [
  { shift: 0, order: ['A', 'B', 'A', 'C'], breaks: ['A', 'B', 'C'] },
  { shift: 0, order: ['B', 'C', 'B', 'A'], breaks: ['B', 'A', 'C'] },
  { shift: 3, order: ['C', 'A', 'C', 'B'], breaks: ['C', 'A'] },
  { shift: -2, order: ['A', 'C', 'B', 'A'], breaks: ['B', 'C', 'A'] },
  { shift: 2, order: ['A', 'B', 'C', 'A'], breaks: ['A', 'C', 'B'] },
];

export class IceTheme extends Battle {
  readonly bpm: number = SONGS.ice.bpm;
  readonly level: number = 0.86;
  readonly reverb = 'spire' as const;
  readonly key = new Scale(note('E4'), MODES.lydian);
  readonly warm: [BufInst, number, number][] = [['choiroo', 53, 72], ['choir', 55, 70], ['celesta', 72, 100], ['glass', 76, 100], ['mbox', 72, 96], ['tick', 60, 60], ['kick', 60, 60], ['snare', 60, 60], ['harp', 45, 88], ['timp', 39, 53], ['ohat', 60, 60], ['crash', 60, 60], ['tom', 40, 56], ['tbell', 52, 72], ['brass', 45, 62], ['shaker', 60, 60], ['clap', 60, 60]];
  protected readonly sections = SECTIONS;
  protected readonly plans = PLANS;
  protected readonly kit: Kit = { snare: 'snare', perc: 'snare', shake: 'shaker', clap: 'clap', glock: 'glass', glockCh: 'glass', bell: 'tbell', bellCh: 'bells', brass: 'horns', choir: 'choir', bass: 'bass', timp: 'timp' };

  setup(p: Player): void {
    p.ch('pad', { gain: 0.4, wet: 0.5, filterLfoHz: 320, filterLfoRate: 0.05 });
    p.ch('shimmer', { gain: 0.2, wet: 0.65, tremolo: 0.1, tremoloRate: 3.1 });
    p.ch('celesta', { gain: 0.6, wet: 0.5, pan: 0.15 });
    p.ch('glass', { gain: 0.3, wet: 0.6, pan: -0.25 });
    p.ch('mbox', { gain: 0.27, wet: 0.5, pan: 0.2 });
    p.ch('organ', { gain: 0.44, wet: 0.55, pan: -0.05, vibratoCents: 3, vibratoRate: 5.5 });
    p.ch('bass', { gain: 0.46, wet: 0.06 });
    p.ch('ticks', { gain: 0.22, wet: 0.2, pan: 0.28 });
    p.ch('kit', { gain: 0.46, wet: 0.22 });
    p.ch('snare', { gain: 0.36, wet: 0.55 });
    p.ch('harp', { gain: 0.34, wet: 0.42, pan: -0.2 });
    p.ch('bells', { gain: 0.26, wet: 0.6, pan: 0.1 });
    p.ch('horns', { gain: 0.32, wet: 0.5, pan: -0.12 });
    p.ch('choir', { gain: 0.3, wet: 0.6, vibratoCents: 5 });
    p.ch('vln', { gain: 0.32, wet: 0.55, vibratoCents: 9, vibratoRate: 5.3, pan: 0.25 });
    p.ch('timp', { gain: 0.4, wet: 0.38 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    const L = this.L(b);
    const brk = this.isBreak;
    const sec = f.sec;

    // ── core: the cold air (a high pad), a soft root, footsteps in the snow ──
    this.chords(b, f, 'pad', PAD(I >= 2 ? 1300 : 950), 'pad', 52, 71, 4, brk ? 0.34 : I === 0 ? 0.36 : 0.36, 0.6);
    if ((brk || I === 0) && f.i % 2 === 0) this.chords(b, f, 'sh', GLASSHARM(), 'shimmer', 76, 88, 2, 0.2, 1.2);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 28), brk ? 0.36 : 0.42, (brk || I === 0 ? 4 : 2.5) * b.spb);
    const sv = brk ? 0.22 : [0.26, 0.36, 0.42, 0.48][I];
    this.steps(b, sv, I < 2 ? [{ inst: 'kick', ch: 'kit', midi: 55 }] : [{ inst: 'kick', ch: 'kit', midi: 55 }, { inst: 'taiko', ch: 'kit', midi: 35, v: 0.3 + 0.08 * I }]);

    // ── the tune (breakdowns): celesta with a glass halo; the music box; the Crystal Organ ──
    if (brk) {
      const mk = 1 + 0.05 * (5 - L.h);
      if (sec === 'A') {
        this.tune(b, f, 'celesta', 'celesta', 0.28 * mk, { shift: 12, legato: 1.3 });
        this.tune(b, f, 'glass', 'glass', 0.2, { shift: 19, legato: 1.2 });
      } else if (sec === 'B') {
        this.tune(b, f, 'mbox', 'mbox', 0.6 * mk, { shift: 12, legato: 1.2 });
        if (L.h >= 2) this.tune(b, f, VIOLIN(0.6), 'vln', 0.42, { legato: 1.0 });
      } else {
        this.tune(b, f, ORGAN(0.6), 'organ', 0.85 * mk, { legato: 1.0 });
        if (L.h >= 2) this.tuneHarmony(b, f, ORGAN(0.35), 'organ', 0.5, 2, 0, 1);
      }
      if (L.h >= 4 && sec !== 'C') this.tuneHarmony(b, f, 'celesta', 'celesta', 0.26, -5, 0, 1);
    }

    // ── strings: harp arpeggios ──
    if (L.strings) {
      const v = L.strings;
      if (brk) this.ostinato(b, f, 'harp', 'harp', 45, 69, [0, 2, 4, 3, 1, 3, 2, 4], 0.28 * v, 1.4, [0, 4], 0.05);
      else if (I <= 1) this.ostinato(b, f, 'harp', 'harp', 45, 64, [0, 2, 1, 3, 4, 3, 2, 1], 0.28 * v, 1.0, [0, 4]);
      else this.ostinato(b, f, 'harp', 'harp', 45, 66, [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 4, 2], 0.26 * v, 0.6, [0, 8]);
    }

    // ── percussion: sticks, a brushed snare far away, an open hat, timpani ──
    if (L.percussion && !b.build) {
      const v = L.percussion;
      this.drum(b, 'tick', 'ticks', brk ? '....x.......x...' : I === 0 ? 'x.o.x.o.x.o.x.o.' : 'xoxoxoxoxoxoxoxo', (brk ? 0.3 : I === 0 ? 0.32 : 0.4) * v, 72, 0.002);
      if (!brk && I === 1) this.drum(b, 'snare', 'snare', '........x.......', 0.4 * v);
      else if (!brk && I >= 2) this.drum(b, 'snare', 'snare', I >= 3 ? '....x......ox..o' : '....x.......x...', 0.44 * v);
      if (!brk && I >= 3) {
        this.play(b, 'timp', 'timp', 0, this.root(f, 0, 40), 0.38 * v, 3, undefined, 0.002);
        this.play(b, 'timp', 'timp', 2, this.root(f, 2, 40), 0.28 * v, 3, undefined, 0.002);
        b.p.hit('ohat', 'kit', this.T(b, 3.5, 0.002), 0.22 * v);
        if (f.i % 4 === 3 && !b.drop) [50, 47, 44, 40].forEach((m, k) => b.p.hit('tom', 'kit', this.T(b, 3 + k * 0.25, 0.002), (0.42 + k * 0.05) * v, m));
      }
      if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.24);
    }

    // ── bells: glass and celesta sparkles, a deep bell at the phrases ──
    if (L.bells) {
      const v = L.bells;
      if (brk) {
        if (f.i % 2 === 1) for (let k = 0; k < 3; k++) this.play(b, 'glass', 'glass', 1 + k * 1.1 + Math.random() * 0.2, pick(chordTones(this.cAt(f, 2), 84, 98)), 0.15 * v, 2.5);
      } else {
        if (f.i % 2 === 0) this.play(b, 'glass', 'glass', 0, pick(chordTones(f.chord, 79, 93)), 0.26 * v, 3);
        if (I >= 2) {
          const tones = chordTones(this.cAt(f, 2), 84, 100);
          if (f.i % 2 === 1) for (let k = 0; k < 8 && tones.length; k++) this.play(b, 'celesta', 'celesta', 2 + k * 0.25, tones[(k * 3) % tones.length], (0.14 + 0.01 * k) * v, 0.7 * b.spb, undefined, 0.002);
        }
        if (I >= 3 && f.i % 4 === 0) this.play(b, 'tbell', 'bells', 0, this.tone(f.chord, 52, 0), 0.26 * v, 6);
      }
    }

    // ── brass: distant horns ──
    if (L.brass) {
      const v = L.brass;
      if (brk) {
        if (f.i % 4 === 2) this.chords(b, f, 'hp', { ...LOWBRASS(0.25), attack: 1.6, release: 1.6 }, 'horns', 50, 64, 3, 0.34 * v, 0.5);
      } else if (I <= 2) {
        if (f.i % 2 === 0) this.chords(b, f, 'hsw', { ...LOWBRASS(0.35), attack: 1.2, release: 1.4 }, 'horns', 48, 64, 3, 0.4 * v, 0.4);
      } else {
        this.chords(b, f, 'hch', LOWBRASS(0.5), 'horns', 48, 64, 3, 0.42 * v, 0.3);
        this.stabs(b, f, 'hst', 'brass', 'horns', 48, 62, 3, [0, 2.5], 0.3 * v, 0.6);
      }
    }

    // ── voices: the airy choir ──
    if (L.voices) {
      const v = L.voices;
      this.chords(b, f, 'choir', brk || I <= 2 ? 'choiroo' : 'choir', 'choir', 55, 69, 3, (brk ? 0.16 : I >= 3 ? 0.24 : 0.2) * v, 0.6);
    }

    // ── low: the deep bass with a pulse ──
    if (L.low) {
      const v = L.low;
      if (brk || I === 0) this.bassline(b, f, SUB(), 'bass', [[0, 0, 3.5, 0.36 * v]], 28);
      else if (I === 1) this.bassline(b, f, SUB(), 'bass', [[0, 0, 2.2, 0.46 * v], [2.5, 0, 1.4, 0.38 * v]], 28);
      else this.bassline(b, f, SUB(), 'bass', [[0, 0, 0.8, 0.5 * v], [0.75, 0, 0.5, 0.32 * v], [1.5, 0, 0.9, 0.42 * v], [2.5, 0, 0.8, 0.44 * v], [3.5, 3, 0.4, 0.28 * v]], 28);
    }

    // ── harmony: violins in harmonics, the organ in glory ──
    if (!brk && I >= 1 && L.h >= 2) this.counter(b, f, VIOLIN(0.8), 'vln', 76, 88, 0.26 + 0.04 * L.h, I >= 3 ? 2 : 4);
    if (!brk && I >= 2 && L.h >= 4 && f.i % 2 === 0) this.chords(b, f, 'org', ORGAN(0.4), 'organ', 52, 67, 3, 0.3, 0.3);
    this.glory(b, f, L, I, 'harp');
    this.duets(b, f, L, I);
    this.dropExtras(b, f, { ch: 'kit' }, 'bass');
  }

  protected fill(b: BarCtx): void {
    for (let k = 0; k < 8; k++) b.p.hit('tick', 'ticks', this.T(b, 3 + k * 0.125, 0.001), 0.25 + k * 0.05, 74 + k);
  }
}
