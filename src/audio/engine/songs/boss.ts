/**
 * BOSS — the guardians (112 bpm). One theme for the four guardians, in the colours of their land:
 * it takes the land's key (the relative/tonic minor of the land) and its voices — the meadow's
 * fiddle and whistle, the desert's ney and darbuka, the ice's celesta and glass, the forge's anvils
 * and taiko — so every guardian fight quotes its land.
 *
 * The leitmotif's head in the minor, hammered by low strings and brass; the Neapolitan (♭II) before
 * the dominant; a driving eighth-note bass. Tunes: A (the guardian's theme) · B (the ostinato,
 * rising by steps) · C (the chromatic climb) · Q (the lament: the head slow, on the land's voice).
 */
import { SONGS, type WorldId } from '../../../sim/defs';
import type { BarInfo, Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { CELLO, FLUTE, HORNLEAD, LOWBRASS, ORGAN, STRINGS, SUB, VIOLIN, type BufInst, type StackOpts } from '../synth';
import { chordTones, MODES, note, Scale } from '../theory';
import type { PlanDef, SecDef } from './adaptive';
import { Battle, type Kit } from './battle';

export const BOSS_A: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [4, 1]],
  [[5, 2], [4, 1], [2, 1]],
  [[1, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[3, 1.5], [2, 0.5], [3, 1], [5, 1]],
  [[5, 1], [3, 1], [-0.5, 1], [1, 1]],
  [[0, 3], [null, 1]],
];

export const BOSS_B: Line = [
  [[5, 0.5], [4, 0.5], [5, 0.5], [7, 0.5], [5, 1], [4, 1]],
  [[6, 0.5], [5, 0.5], [6, 0.5], [8, 0.5], [6, 1], [5, 1]],
  [[7, 1], [4, 1], [2, 1], [0, 1]],
  [[4, 3], [null, 1]],
  [[5, 0.5], [4, 0.5], [5, 0.5], [7, 0.5], [5, 1], [4, 1]],
  [[6, 0.5], [5, 0.5], [6, 0.5], [8, 0.5], [6, 1], [5, 1]],
  [[4, 1], [6.5, 1], [8, 1], [6.5, 1]],
  [[4, 2], [null, 2]],
];

export const BOSS_C: Line = [
  [[3, 2], [5, 2]],
  [[4, 2], [2, 2]],
  [[5, 1.5], [4, 0.5], [3, 2]],
  [[1, 2], [-0.5, 2]],
  [[7, 2], [5, 2]],
  [[7, 1], [4, 1], [2, 1], [4, 1]],
  [[5, 2], [3, 2]],
  [[6.5, 2], [4, 2]],
];

export const BOSS_Q: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1.5], [1, 0.5], [0, 2]],
  [[3, 1], [5, 1.5], [4, 0.5], [3, 1]],
  [[1, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1], [4, 1], [5, 2]],
  [[7, 1], [5, 1], [-0.5, 1], [1, 1]],
  [[0, 3], [null, 1]],
];

const SECTIONS: SecDef[] = [
  { name: 'A', bars: ['Am', 'G', 'F', 'E', 'Am', 'Dm', ['Bb', 'E'], 'Am'], tune: BOSS_A },
  { name: 'B', bars: ['F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'E'], tune: BOSS_B },
  { name: 'C', bars: ['Dm', 'Am/C', 'Bb', 'E', 'Dm', 'Am', 'Bb', 'E'], tune: BOSS_C },
  { name: 'Q', bars: ['Am', 'F', 'Dm', 'E', 'Am', 'F', ['Dm', 'E'], 'Am'], tune: BOSS_Q },
];

const PLANS: PlanDef[] = [
  { shift: 0, order: ['A', 'B', 'A', 'C'], breaks: ['Q', 'A'] },
  { shift: 5, order: ['B', 'C', 'B', 'A'], breaks: ['A', 'Q'] },
  { shift: 0, order: ['C', 'A', 'C', 'B'], breaks: ['Q', 'A'] },
  { shift: 2, order: ['A', 'C', 'B', 'A'], breaks: ['A', 'Q'] },
  { shift: 3, order: ['A', 'B', 'C', 'A'], breaks: ['Q', 'A'] },
];

/** the guardian's key (semitones from A minor) and voices, per land */
const LAND: Record<WorldId, { shift: number; lead: StackOpts | BufInst; leadShift: number; color: BufInst; colorShift: number; perc: BufInst; percMidi: number }> = {
  meadow: { shift: -5, lead: FLUTE(), leadShift: 12, color: 'celesta', colorShift: 24, perc: 'tamb', percMidi: 60 },
  desert: { shift: 5, lead: FLUTE(true), leadShift: 12, color: 'tile', colorShift: 24, perc: 'tek', percMidi: 60 },
  ice: { shift: 4, lead: 'celesta', leadShift: 12, color: 'glass', colorShift: 24, perc: 'tick', percMidi: 72 },
  forge: { shift: 3, lead: HORNLEAD(0.4), leadShift: 0, color: 'anvil', colorShift: 24, perc: 'rim', percMidi: 60 },
  citadel: { shift: 5, lead: ORGAN(0.8), leadShift: 0, color: 'tbell', colorShift: 0, perc: 'tick', percMidi: 64 },
};

export class BossTheme extends Battle {
  readonly bpm: number = SONGS.boss.bpm;
  readonly level: number = 0.74;
  readonly key = new Scale(note('A3'), MODES.aeolian);
  readonly warm: [BufInst, number, number][] = [['choir', 52, 72], ['choiroo', 52, 70], ['spicc', 43, 64], ['brass', 40, 64], ['kick', 60, 60], ['snare', 60, 60], ['hat', 60, 60], ['taiko', 30, 36], ['timp', 36, 53], ['crash', 60, 60], ['tom', 40, 56], ['celesta', 72, 98], ['glass', 76, 98], ['tbell', 48, 72], ['anvil', 72, 92], ['tile', 84, 100], ['tek', 60, 60], ['tamb', 60, 60], ['tick', 60, 60], ['rim', 60, 60], ['gong', 60, 60], ['shaker', 60, 60], ['clap', 60, 60]];
  protected readonly sections = SECTIONS;
  protected readonly plans = PLANS;
  protected readonly kit: Kit = { snare: 'snare', perc: 'kit', shake: 'shaker', clap: 'clap', glock: 'glass', glockCh: 'color', bell: 'tbell', bellCh: 'color', brass: 'brass', choir: 'choir', bass: 'bass', timp: 'timp' };
  protected readonly breakGain: number = 1.26;
  private world: WorldId | null = null;
  private resolved = false;

  private land(p: Player): (typeof LAND)[WorldId] | null {
    if (!this.resolved) {
      this.resolved = true;
      this.world = p.director.world;
    }
    return this.world ? LAND[this.world] : null;
  }

  /** the key of the land the guardian guards (read once, when the song first needs its harmony) */
  private pl: Player | null = null;
  protected baseShift(): number {
    return this.pl ? this.land(this.pl)?.shift ?? 0 : 0;
  }

  chordAt(bar: number, beat: number, p: Player): ReturnType<Battle['chordAt']> {
    this.pl = p;
    return super.chordAt(bar, beat, p);
  }

  setup(p: Player): void {
    this.pl = p;
    p.ch('lowstr', { gain: 0.42, wet: 0.32, vibratoCents: 7 });
    p.ch('spicc', { gain: 0.36, wet: 0.22, pan: 0.15 });
    p.ch('brass', { gain: 0.4, wet: 0.24, pan: -0.12 });
    p.ch('bass', { gain: 0.5, wet: 0.04 });
    p.ch('kit', { gain: 0.48, wet: 0.16 });
    p.ch('hat', { gain: 0.2, wet: 0.12, pan: 0.28 });
    p.ch('lperc', { gain: 0.22, wet: 0.18, pan: -0.28 });
    p.ch('taiko', { gain: 0.5, wet: 0.22 });
    p.ch('timp', { gain: 0.5, wet: 0.32 });
    p.ch('choir', { gain: 0.36, wet: 0.48, vibratoCents: 6 });
    p.ch('cello', { gain: 0.7, wet: 0.32, vibratoCents: 10, vibratoRate: 5.2, pan: -0.06 });
    p.ch('horn', { gain: 0.42, wet: 0.36, vibratoCents: 4, pan: 0.1 });
    p.ch('lead', { gain: 0.75, wet: 0.42, vibratoCents: 12, vibratoRate: 5.5, pan: 0.12 });
    p.ch('color', { gain: 0.24, wet: 0.5, pan: 0.3 });
    p.ch('vln', { gain: 0.32, wet: 0.45, vibratoCents: 10, pan: 0.22 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    this.pl = b.p;
    const I = this.Ieff(b);
    const L = this.L(b);
    const brk = this.isBreak;
    const land = this.land(b.p);

    // ── core: low strings, the pulsing bass, heavy steps ──
    this.chords(b, f, 'ls', STRINGS(0.3), 'lowstr', 45, 62, 3, brk ? 0.5 : I === 0 ? 0.56 : 0.38, 0.35);
    const drive = !brk && I >= 1;
    for (let k = 0; k < 8; k++) {
      if (!drive && k % 2 === 1) continue;
      const c = this.cAt(f, k * 0.5);
      const m = this.tone(c, 28, I >= 2 && k % 4 === 3 ? 3 : 0);
      this.play(b, SUB(), 'bass', k * 0.5, m, (k % 2 ? 0.28 : 0.4) * (drive ? 1 : 0.75), (drive ? 0.4 : 0.9) * b.spb, undefined, 0.001);
    }
    const sv = brk ? 0.34 : [0.4, 0.5, 0.54, 0.6][I];
    this.steps(b, sv, I < 3 ? [{ inst: 'kick', ch: 'kit' }] : [{ inst: 'kick', ch: 'kit' }, { inst: 'taiko', ch: 'taiko', midi: 33, v: 0.6 }]);

    // ── the tune (breakdowns): the lament on the land's voice; the theme on cello and horn ──
    if (brk) {
      const mk = 1 + 0.04 * (5 - L.h);
      if (f.sec === 'Q') {
        const inst = land?.lead ?? CELLO();
        this.tune(b, f, inst, 'lead', (typeof inst === 'string' ? 0.6 : 0.85) * mk, { shift: land?.leadShift ?? 0, grace: land === LAND.desert || land === LAND.meadow ? 0.4 : 0, graceBelow: land === LAND.desert });
        if (L.h >= 2) this.tune(b, f, CELLO(), 'cello', 0.45, { shift: -12, legato: 1.0 });
      } else {
        this.tune(b, f, CELLO(), 'cello', 0.95 * mk, { legato: 0.97 });
        if (L.h >= 2) this.tune(b, f, HORNLEAD(0.3), 'horn', 0.5, { legato: 0.95 });
      }
    }

    // ── strings: the driving spiccato ──
    if (L.strings && !brk) {
      const v = L.strings;
      if (I >= 1) this.ostinato(b, f, 'spicc', 'spicc', 45, 60, [0, 0, 1, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 1, 0, 1], (I === 1 ? 0.32 : 0.4) * v, 0.3, [0, 4, 8, 12]);
    } else if (L.strings && brk && f.i % 2 === 1) this.ostinato(b, f, 'spicc', 'spicc', 45, 62, [0, 2, 1, 2], 0.26 * L.strings, 0.8, [0]);

    // ── percussion: the kit and the land's own drum ──
    if (L.percussion && !b.build) {
      const v = L.percussion;
      if (brk) this.drum(b, 'hat', 'hat', 'x...x...x...x...', 0.26 * v);
      else if (I === 0) this.drum(b, 'hat', 'hat', 'x.x.x.x.x.x.x.x.', 0.3 * v);
      else {
        this.drum(b, 'snare', 'kit', I === 1 ? '....x.......x...' : '....x..x....x.ox', 0.48 * v);
        this.drum(b, 'hat', 'hat', I === 1 ? 'x.x.x.x.x.x.x.x.' : 'xoxoxoxoxoxoxoxo', 0.38 * v);
        if (land) this.drum(b, land.perc, 'lperc', I >= 2 ? '..x...x...x.x.x.' : '......x.......x.', 0.42 * v, land.percMidi);
        if (I >= 2 && f.i % 4 === 3 && !b.drop) [52, 48, 45, 41].forEach((m, k) => b.p.hit('tom', 'kit', this.T(b, 3 + k * 0.25, 0.002), (0.48 + k * 0.06) * v, m));
        if (I >= 3 && f.i % 2 === 1 && !b.drop) this.roll(b, 'timp', 'timp', 3, 4, 8, 0.2 * v, 0.5 * v, this.root(f, 3, 40));
      }
      if (this.rise(b) || (I === 3 && f.i % 2 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.28);
    }

    // ── bells: the land's colour (celesta, finger cymbals, glass, anvils, tubular bells) ──
    if (L.bells) {
      const v = L.bells;
      const inst: BufInst = land?.color ?? 'glass';
      const hi = chordTones(this.cAt(f, 0), inst === 'tbell' ? 55 : 79, inst === 'tbell' ? 70 : 96);
      if (hi.length && (brk ? f.i % 2 === 1 : true)) this.play(b, inst, 'color', brk ? 2 : 0, hi[(f.i * 2) % hi.length], (inst === 'anvil' ? 0.3 : 0.22) * v, 2);
      if (!brk && I >= 2 && hi.length) this.play(b, inst, 'color', 2.5, hi[(f.i * 2 + 1) % hi.length], 0.18 * v, 1.5);
    }

    // ── brass: the hammer stabs ──
    if (L.brass) {
      const v = L.brass;
      if (brk) {
        if (f.i % 4 === 3) this.chords(b, f, 'hp', { ...LOWBRASS(0.35), attack: 1 }, 'brass', 45, 60, 3, 0.36 * v, 0.4);
      } else if (I >= 2) {
        for (const beat of [0, 2.5]) {
          const c = this.cAt(f, beat);
          for (const m of [this.tone(c, 45, 0), this.tone(c, 45, 2), this.tone(c, 45, 3)]) this.play(b, 'brass', 'brass', beat, m, (beat === 0 ? 0.52 : 0.42) * v, 0.55 * b.spb, undefined, 0.002);
        }
      } else if (I === 1 && f.i % 2 === 0) this.chords(b, f, 'hsw', { ...LOWBRASS(0.45), attack: 1.2 }, 'brass', 45, 60, 3, 0.42 * v, 0.3);
    }

    // ── voices ──
    if (L.voices) {
      const v = L.voices;
      if (brk) this.chords(b, f, 'choir', 'choiroo', 'choir', 52, 67, 3, 0.16 * v, 0.6);
      else if (I >= 2) this.chords(b, f, 'choir', I >= 3 ? 'choir' : 'choiroo', 'choir', 55, 72, I >= 3 ? 4 : 3, (I >= 3 ? 0.17 : 0.2) * v, 0.4);
    }

    // ── low: octave jumps on the off-beats ──
    if (L.low && drive && I >= 2) for (const beat of [1.5, 3.5]) this.play(b, SUB(), 'bass', beat, this.tone(this.cAt(f, beat), 28, 3), 0.3 * L.low, 0.35 * b.spb, undefined, 0.001);

    // ── harmony ──
    if (!brk && I >= 1 && L.h >= 2) this.counters(b, f, [[[VIOLIN(0.5), 'vln', 72, 84]], [[CELLO(), 'cello', 50, 62]], [[HORNLEAD(0.4), 'horn', 57, 69]], [[VIOLIN(0.6), 'vln', 74, 86]], [[VIOLIN(0.6), 'vln', 74, 86], [CELLO(), 'cello', 50, 62]]], 0.26 + 0.04 * L.h, I >= 3 ? 2 : 4);
    if (!brk && I >= 3 && L.h >= 4) this.tune(b, f, HORNLEAD(0.5), 'horn', 0.6, { bars: [0, 4] });
    this.glory(b, f, L, I, null);
    this.duets(b, f, L, I);
    this.dropExtras(b, f, { ch: 'kit' }, 'bass');
  }

  protected fill(b: BarCtx): void {
    this.roll(b, 'snare', 'kit', 3, 4, 6, 0.2, 0.5);
  }
}
