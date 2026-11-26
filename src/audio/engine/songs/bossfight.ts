/**
 * BOSS FIGHTS (v5) — every boss has its own piece, played inside the level's song (same tempo, same
 * grid: the duel stays on the beat) from the bar line where bossTheme() lands until bossTheme(null).
 *
 *  - mini-bosses (15): a fierce variant of the land's battle colours with the creature's own motif
 *    and its own rhythm signature (toad hops, the beetle's drum corps, the crow's cawing brass, …);
 *  - guardians (5): a full theme each, three phases (key lifts, double-time, choir, the glory);
 *  - legends (5): long-form epics in three phases; the Abyss King quotes every land's theme.
 *
 * The towers keep playing: the boss's tune is their guide, so the band carries the boss's melody
 * (and fights it). Harmony is a pure function of the bar (the phase log), like every song.
 * Sections are written in A (tonic MIDI 57) unless `wrote` says otherwise and transposed to the
 * boss's tonic (+ the phase's lift).
 */
import type { EnemyKind } from '../../../sim/defs';
import type { BandMix } from '../../api';
import { chordIn, Form, LEIT_A, LEIT_A_CHORDS, LEIT_A_MINOR, LEIT_A_MINOR_CHORDS, lineNotes, type BarInfo, type Line, type MNote } from '../compose';
import type { BarCtx, Player } from '../music';
import { CELLO, CHOIR, DRONE, FIDDLE, FLUTE, GLASSHARM, HORNLEAD, LOWBRASS, ORGAN, REED, STRINGS, SUB, VIOLIN, type BufInst } from '../synth';
import { chordTones, MODES, Scale, transpose, type Chord } from '../theory';
import { clamp } from '../util';
import type { SecDef } from './adaptive';
import { Song, type Inst } from './base';
import { SECTIONS as CIT } from './citadel';
import { SECTIONS as DES } from './desert';
import { SECTIONS as FOR } from './forge';
import { SECTIONS as ICE } from './ice';
import { SECTIONS as MEA } from './meadow';

// ───────────────────────────── notation ─────────────────────────────

/** "0:1 4:1.5 3:.5 2:1 | …" → a Line (degree:beats, '-' = rest, x.5 = raised) */
function L(src: string): Line {
  return src.split('|').map((bar) =>
    bar
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((tok) => {
        const [d, len] = tok.split(':');
        return [d === '-' ? null : Number(d), Number(len)] as [number | null, number];
      }),
  );
}

/** a 4-bar phrase played twice: the second time with another last bar (the answer / the cadence) */
function twice(head: string, end: string): Line {
  const a = L(head);
  return [...a, ...a.slice(0, 3), ...L(end)];
}

type Cls = 'mini' | 'guardian' | 'legend';

interface Sec {
  bars: (string | string[])[];
  tune?: Line;
  /** the tonic (MIDI) the chords and the tune are written in (default A = 57) */
  wrote?: number;
  mode?: readonly number[];
}

/** a boss's signature: what only this creature plays */
type Sig =
  | 'hops' | 'corps' | 'caw' | 'rumble' | 'swamp' | 'riddle' | 'roar' | 'siren' | 'mirror' | 'fire' | 'seven' | 'anvil' | 'stone' | 'toccata' | 'antiphon'
  | 'blot' | 'scarab' | 'moth' | 'golem' | 'silence' | 'serpent' | 'djinn' | 'aurora' | 'phoenix' | 'abyss';

export interface BossSpec {
  cls: Cls;
  /** the sounding tonic (MIDI) in phase 1 */
  tonic: number;
  mode: readonly number[];
  sections: Record<string, Sec>;
  /** the loop of sections in each phase */
  phases: string[][];
  /** semitones added in each phase (key lifts) */
  lift: number[];
  lead: Inst;
  leadShift: number;
  leadVel: number;
  /** a second voice on the tune from phase 2 */
  lead2?: Inst;
  lead2Shift?: number;
  /** 16 steps: r root · t third · f fifth · o octave · '.' rest (upper case = accent) */
  bass: string;
  bassInst: Inst;
  kick: string;
  snare: string;
  hat: string;
  perc?: { inst: BufInst; pat: string; midi?: number };
  /** the ostinato: [instrument, low, high, chord-tone order per 16th (−1 rest), velocity, length in beats] */
  arp?: [Inst, number, number, number[], number, number];
  /** brass stab beats */
  stabs?: number[];
  pad: Inst;
  colour: BufInst;
  sig: Sig;
  swing?: number;
  /** a level trim for the whole piece (measured: every fight ≈ its song's loudness or above) */
  gain?: number;
}

const AEO = MODES.aeolian;
const PHR = MODES.phrygian;
const HIJ = MODES.phrygianDominant;
const DOR = MODES.dorian;
const LYD = MODES.lydian;
const HMI = MODES.harmonicMinor;
const MAJ = MODES.major;

const ARP_UP = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3];
const ARP_ROLL = [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3];
const ARP_PEDAL = [0, 3, 0, 2, 0, 3, 0, 1, 0, 3, 0, 2, 0, 3, 0, 1];

const secA = (list: SecDef[], name = 'A'): SecDef => list.find((s) => s.name === name) ?? list[0];

// ───────────────────────────── the bosses ─────────────────────────────

export const BOSSES: Partial<Record<EnemyKind, BossSpec>> = {
  // ── the meadow ──
  toad: {
    cls: 'mini', tonic: 64, mode: AEO, lift: [0, 0],
    sections: {
      A: { bars: ['Am', 'Am', 'F', 'E', 'Am', 'Am', 'Dm', 'E'], tune: twice('0:.5 -:.5 0:.5 4:.5 -:.5 3:.5 2:1 | 0:.5 -:.5 0:.5 2:.5 -:.5 4:.5 3:1 | 5:.5 -:.5 5:.5 3:.5 2:.5 0:.5 1:1 | 1:1 -:.5 -1:.5 1:2', '0:1 -:.5 -3:.5 0:2') },
      B: { bars: ['F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'E'], tune: twice('2:.5 -:.5 2:.5 3:.5 4:1 2:1 | 3:.5 -:.5 3:.5 4:.5 5:1 3:1 | 4:.5 5:.5 4:.5 3:.5 2:.5 0:.5 2:1 | 1:2 -1:2', '1:1 -:.5 1:.5 -1:2') },
    },
    phases: [['A', 'B'], ['B', 'A']],
    lead: REED(), leadShift: 0, leadVel: 0.62, lead2: FIDDLE(), lead2Shift: 12,
    bass: 'R.O.R.O.R.O.RoFo', bassInst: 'tbass',
    kick: 'X...x...X...x...', snare: '....x.......x..o', hat: 'x.x.x.x.x.x.x.x.',
    perc: { inst: 'tamb', pat: '..x...x...x...x.' },
    stabs: [0, 2.5], pad: STRINGS(0.3), colour: 'celesta', sig: 'hops',
  },
  drumBeetle: {
    cls: 'mini', tonic: 62, mode: DOR, lift: [0, 2],
    sections: {
      A: { bars: ['Am', 'G', 'Am', 'G', 'D', 'G', 'Am', 'Am'], tune: twice('0:1 0:.5 0:.5 4:1 4:1 | 3:.5 2:.5 1:.5 2:.5 3:1 -:1 | 4:1 4:.5 4:.5 6:1 5:.5 4:.5 | 3:1 1:1 0:2', '3:1 4:1 0:2') },
      B: { bars: ['C', 'G', 'D', 'Am', 'C', 'G', 'D', 'E'], tune: twice('2:.5 2:.5 2:.5 2:.5 4:1 2:1 | 3:.5 3:.5 3:.5 3:.5 5:1 3:1 | 4:.5 5:.5 6:.5 7:.5 8:1 6:1 | 5:2 4:2', '6:1 5:1 4:2') },
    },
    phases: [['A', 'A', 'B', 'A'], ['B', 'A', 'B', 'B']],
    lead: FLUTE(), leadShift: 12, leadVel: 0.62, lead2: 'brass', lead2Shift: -12,
    bass: 'R...R...R...R.R.', bassInst: SUB(),
    kick: 'X.x.X.x.X.x.X.xx', snare: '....X.......X...', hat: '',
    stabs: [0], pad: STRINGS(0.3), colour: 'tbell', sig: 'corps',
  },
  crow: {
    cls: 'mini', tonic: 59, mode: PHR, lift: [0, 1],
    sections: {
      A: { bars: ['Am', 'Bb', 'Am', 'Bb', 'Dm', 'C', 'Bb', 'Am'], tune: twice('4:.25 -:.25 4:.25 -:.25 -:1 3:.5 1:.5 0:1 | 4:.25 -:.25 4:.25 -:.25 -:1 5:.5 4:.5 1:1 | 7:.5 5:.5 4:.5 3:.5 1:1 0:1 | 1:1 -:1 0:2', '1:.5 0:.5 -1:1 0:2') },
      B: { bars: ['Dm', 'Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'Am'], tune: twice('3:1 5:.5 3:.5 1:2 | 4:1 6:.5 4:.5 2:2 | 5:.5 4:.5 3:.5 1:.5 2:.5 1:.5 0:1 | 1:4', '0:4') },
    },
    phases: [['A', 'B'], ['A', 'A', 'B', 'B']],
    lead: 'brass', leadShift: 0, leadVel: 0.5, lead2: VIOLIN(0.7), lead2Shift: 12,
    bass: 'R..R..R.R..R.F.O', bassInst: 'tbass',
    kick: 'X..x..x.X..x..x.', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx',
    stabs: [1.5, 3.5], pad: STRINGS(0.25), colour: 'glass', sig: 'caw',
  },

  // ── the dunes ──
  sandworm: {
    cls: 'mini', tonic: 57, mode: PHR, lift: [0, 1],
    sections: {
      A: { bars: ['Am', 'Bb', 'Am', 'Bb', 'Am', 'Gm', 'Bb', 'Am'], tune: twice('0:2 1:1 0:1 | -2:1 0:1 1:2 | 3:1 1:1 0:1 -1:1 | 0:4', '-2:2 0:2') },
      B: { bars: ['Dm', 'Bb', 'Gm', 'Am', 'Dm', 'Bb', 'Bb', 'Am'], tune: twice('3:1.5 4:.5 3:1 1:1 | 2:1.5 3:.5 1:2 | 4:1 5:1 4:1 3:1 | 1:2 0:2', '1:2 0:2') },
    },
    phases: [['A', 'B'], ['B', 'A']],
    lead: CELLO(), leadShift: 0, leadVel: 0.8, lead2: HORNLEAD(0.4), lead2Shift: 12,
    bass: 'R...r.r.R...r.Fr', bassInst: SUB(),
    kick: 'X.....x.X.....x.', snare: '........X.......', hat: 'x...x...x...x...',
    perc: { inst: 'dum', pat: 'x..x..x.x..x..x.' },
    arp: ['spicc', 40, 52, [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1], 0.32, 0.22],
    stabs: [0], pad: DRONE(380), colour: 'tile', sig: 'rumble',
  },
  croc: {
    cls: 'mini', tonic: 62, mode: DOR, lift: [0, 2], swing: 0.12,
    sections: {
      A: { bars: ['Am7', 'D7', 'Am7', 'D7', 'Em7', 'D7', 'Am7', 'Am7'], tune: twice('0:.5 2:.5 3:1 4:.5 3:.5 2:1 | 0:.5 -2:.5 0:2 -:1 | 4:.5 5:.5 6:1 5:.5 4:.5 3:1 | 2:1 1:.5 0:.5 0:2', '2:.5 1:.5 0:1 0:2') },
      B: { bars: ['F', 'G', 'Am7', 'D7', 'F', 'G', 'E7', 'E7'], tune: twice('5:1 4:.5 2:.5 3:2 | 6:1 5:.5 4:.5 4:2 | 7:.5 6:.5 4:.5 2:.5 4:1 3:1 | 1:4', '1:2 -1:2') },
    },
    phases: [['A', 'A', 'B', 'A'], ['B', 'A', 'B', 'A']],
    lead: 'oud', leadShift: 0, leadVel: 0.66, lead2: FLUTE(true), lead2Shift: 12,
    bass: 'R..rO.r.R..rF.rO', bassInst: 'tbass',
    kick: 'X..x....X..x..x.', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx',
    perc: { inst: 'clap', pat: '....x.......x..x' },
    stabs: [1.5], pad: STRINGS(0.3), colour: 'glass', sig: 'swamp',
  },
  sphinx: {
    cls: 'mini', tonic: 62, mode: HIJ, lift: [0, 1],
    sections: {
      A: { bars: ['A', 'Bb', 'A', 'Gm', 'A', 'Bb', 'Gm', 'A'], tune: twice('0:.75 1:.75 2:.5 1:1 0:1 | 3:.75 2:.75 1:.5 0:2 | 4:.75 3:.75 2:.5 1:.75 2:.75 1:.5 | 0:3 -:1', '1:.75 0:.75 -1:.5 0:2') },
      B: { bars: ['Dm', 'Gm', 'Bb', 'A', 'Dm', 'Gm', 'Bb', 'A'], tune: twice('3:.75 4:.75 5:.5 4:2 | 5:.75 6:.75 5:.5 4:2 | 6:.5 5:.5 4:.5 3:.5 2:.75 1:.75 2:.5 | 1:4', '0:4') },
    },
    phases: [['A', 'B'], ['B', 'A', 'B', 'A']],
    lead: FLUTE(true), leadShift: 12, leadVel: 0.7, lead2: 'oud', lead2Shift: 0,
    bass: 'R..R..R.R..R..O.', bassInst: 'tbass',
    kick: 'X..x..x.X..x..x.', snare: '', hat: '',
    perc: { inst: 'tek', pat: '.xx.x..x.xx.x..x' },
    arp: ['oud', 50, 64, [0, -1, -1, 1, -1, -1, 2, -1, 0, -1, -1, 1, -1, -1, 3, -1], 0.42, 0.7],
    stabs: [], pad: DRONE(520), colour: 'tile', sig: 'riddle',
  },

  // ── the peaks ──
  yeti: {
    cls: 'mini', tonic: 64, mode: AEO, lift: [0, 2],
    sections: {
      A: { bars: ['Am', 'F', 'G', 'Am', 'Am', 'F', 'G', 'E'], tune: twice('0:1 4:2 3:1 | 2:1 1:1 0:2 | 4:1 5:1.5 4:.5 3:1 | 2:3 -:1', '1:1 -1:1 0:2') },
      B: { bars: ['Dm', 'Am', 'F', 'G', 'Dm', 'Am', 'E', 'E'], tune: twice('3:2 4:1 5:1 | 4:2 2:2 | 3:1 4:1 5:1 7:1 | 6:4', '6:2 4:2') },
    },
    phases: [['A', 'B'], ['B', 'A']],
    lead: HORNLEAD(0.5), leadShift: 0, leadVel: 0.66, lead2: CELLO(), lead2Shift: -12,
    bass: 'R.......R...F...', bassInst: SUB(),
    kick: 'X.......X.......', snare: '....X.......X...', hat: 'x...x...x...x...',
    stabs: [], pad: STRINGS(0.3), colour: 'glass', sig: 'roar',
  },
  siren: {
    cls: 'mini', tonic: 64, mode: HMI, lift: [0, 1],
    sections: {
      A: { bars: ['Am', 'Dm', 'E', 'Am', 'F', 'Dm', 'E', 'E'], tune: twice('4:2 5:1 4:1 | 3:2 2:2 | 1:1 2:1 3:1 4:1 | 6:2 7:2', '6:2 4:2') },
      B: { bars: ['F', 'C', 'Dm', 'Am', 'F', 'Dm', 'E', 'Am'], tune: twice('5:2 4:1 2:1 | 4:2 2:1 0:1 | 3:1 2:1 1:1 2:1 | 1:4', '0:4') },
    },
    phases: [['A', 'B'], ['A', 'B', 'A', 'B']],
    lead: 'choirx', leadShift: 0, leadVel: 0.5, lead2: VIOLIN(0.5), lead2Shift: 12,
    bass: 'R.......F.......', bassInst: SUB(),
    kick: 'X.......x.......', snare: '........X.......', hat: '..x...x...x...x.',
    arp: ['glass', 76, 93, [0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 0, -1, 1, -1], 0.16, 1.2],
    stabs: [], pad: GLASSHARM(), colour: 'celesta', sig: 'siren',
  },
  stag: {
    cls: 'mini', tonic: 64, mode: LYD, lift: [0, 2],
    sections: {
      A: { bars: ['A', 'B', 'C#m', 'B', 'A', 'B', 'E', 'E'], tune: twice('0:.5 2:.5 4:.5 7:.5 4:1 3:1 | 2:.5 4:.5 6:.5 8:.5 6:2 | 7:.5 6:.5 4:.5 3:.5 4:1 2:1 | 0:3 -:1', '1:1 2:1 4:2') },
      B: { bars: ['F#m', 'E', 'A', 'B', 'F#m', 'E', 'B', 'B'], tune: twice('5:1 4:.5 3:.5 4:2 | 3:1 2:.5 1:.5 2:2 | 4:.5 5:.5 6:.5 7:.5 8:1 6:1 | 5:4', '5:2 3:2') },
    },
    phases: [['A', 'B'], ['B', 'A']],
    lead: 'celesta', leadShift: 12, leadVel: 0.6, lead2: VIOLIN(0.7), lead2Shift: 0,
    bass: 'R...O...R...F...', bassInst: 'tbass',
    kick: 'X...x...X...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    stabs: [], pad: GLASSHARM(), colour: 'glass', sig: 'mirror',
  },

  // ── the forge ──
  salamander: {
    cls: 'mini', tonic: 60, mode: HMI, lift: [0, 2],
    sections: {
      A: { bars: ['Am', 'F', 'E', 'Am', 'Am', 'Dm', 'E', 'E'], tune: twice('0:.3333 2:.3333 4:.3334 7:1 6:.3333 4:.3333 2:.3334 4:1 | 3:.3333 4:.3333 6:.3334 7:1 6:2 | 5:.3333 4:.3333 3:.3334 2:.3333 1:.3333 0:.3334 1:1 2:1 | 0:3 -:1', '6:1 4:1 6:2') },
      B: { bars: ['F', 'Dm', 'E', 'Am', 'F', 'Dm', 'E', 'E'], tune: twice('5:1 4:.3333 3:.3333 2:.3334 3:1 1:1 | 4:1 3:.3333 2:.3333 1:.3334 2:2 | 3:.3333 4:.3333 5:.3334 6:1 7:1 6:1 | 6:4', '6:2 4:2') },
    },
    phases: [['A', 'B'], ['A', 'A', 'B', 'B']],
    lead: VIOLIN(0.85), leadShift: 0, leadVel: 0.62, lead2: 'brass', lead2Shift: -12,
    bass: 'R..R..R.R..R..F.', bassInst: 'tbass',
    kick: 'X...x...X...x...', snare: '....X.......X...', hat: '',
    stabs: [0, 1.5], pad: STRINGS(0.35), colour: 'anvil', sig: 'fire',
  },
  magmaCrab: {
    cls: 'mini', tonic: 60, mode: AEO, lift: [0, 1],
    sections: {
      A: { bars: ['Am', 'G', 'Am', 'E', 'Am', 'G', 'Am', 'E'], tune: twice('0:.75 0:.75 0:.75 3:.75 2:.5 0:.5 | -1:.75 -1:.75 -1:.75 0:.75 1:1 | 0:.75 0:.75 0:.75 4:.75 3:.5 1:.5 | 1:4', '1:2 -3:2') },
      B: { bars: ['Dm', 'Am', 'G', 'E', 'Dm', 'Am', 'G', 'E'], tune: twice('3:.75 3:.75 3:.75 5:.75 4:1 | 2:.75 2:.75 2:.75 4:.75 3:1 | 1:.75 2:.75 3:.75 4:.75 5:.5 3:.5 | 4:4', '-3:4') },
    },
    phases: [['A', 'B'], ['B', 'A']],
    lead: 'brass', leadShift: 0, leadVel: 0.48, lead2: CELLO(), lead2Shift: -12,
    bass: 'R..R..R..R..R.R.', bassInst: 'tbass',
    kick: 'X..x..x..x..x.x.', snare: '......X.......X.', hat: 'x.x.x.x.x.x.x.x.',
    stabs: [0, 0.75, 1.5, 2.25, 3, 3.5], pad: LOWBRASS(0.4), colour: 'anvil', sig: 'seven',
  },
  smith: {
    cls: 'mini', tonic: 60, mode: AEO, lift: [0, 2],
    sections: {
      A: { bars: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'], tune: twice('0:1 2:1 4:1 2:1 | 3:1 4:1 5:2 | 4:1 3:1 2:1 1:1 | 0:2 -:2', '-1:2 0:2') },
      B: { bars: ['C', 'G', 'Am', 'F', 'C', 'G', 'E', 'E'], tune: twice('2:1 4:1 7:1 6:1 | 5:1 4:1 3:2 | 4:1 5:1 6:1 7:1 | 6:4', '6:2 4:2') },
    },
    phases: [['A', 'B'], ['B', 'A']],
    lead: HORNLEAD(0.45), leadShift: 0, leadVel: 0.66, lead2: 'brass', lead2Shift: -12,
    bass: 'R...R...R...R...', bassInst: 'tbass',
    kick: 'X...X...X...X...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    stabs: [0], pad: LOWBRASS(0.35), colour: 'anvil', sig: 'anvil',
  },

  // ── the citadel ──
  gargoyle: {
    cls: 'mini', tonic: 62, mode: AEO, lift: [0, 1],
    sections: {
      A: { bars: ['Am', 'G', 'F', 'E', 'Am', 'G', 'F', 'E'], tune: twice('4:2 3:1 2:1 | 1:2 0:2 | 2:1 3:1 4:1 5:1 | 4:4', '-1:4') },
      B: { bars: ['Dm', 'Am', 'Bb', 'F', 'Dm', 'Am', 'E', 'E'], tune: twice('3:2 4:1 5:1 | 4:2 1:2 | 3:1 2:1 1:1 0:1 | -1:4', '-1:4') },
    },
    phases: [['A', 'B'], ['B', 'A']],
    lead: ORGAN(0.6), leadShift: 0, leadVel: 0.6, lead2: CHOIR('ah'), lead2Shift: 0,
    bass: 'R.......R.......', bassInst: ORGAN(0.3),
    kick: 'X.......X.......', snare: '....x.......x...', hat: 'x...x...x...x...',
    stabs: [], pad: ORGAN(0.4), colour: 'tbell', sig: 'stone',
  },
  organist: {
    cls: 'mini', tonic: 62, mode: HMI, lift: [0, 1],
    sections: {
      A: { bars: ['Am', 'E', 'Am', 'E', 'Am', 'E', 'Am', 'Am'], tune: [...L('7:.125 6:.125 7:1.75 -:.5 6:.25 5:.25 4:.25 3:.25 2:.5 | -1:1.5 0:2.5 | 0:.125 -1:.125 0:1.75 -:.5 -1:.25 -2:.25 -3:.25 -4:.25 -5:.5 | -8:1.5 -7:2.5'), ...L('7:.125 6:.125 7:1.75 -:.5 6:.25 5:.25 4:.25 3:.25 2:.5 | -1:1.5 0:2.5 | 2:.5 3:.5 4:.5 5:.5 6:.5 7:.5 6:.5 4:.5 | 7:4')] },
      B: { bars: ['Dm', 'Am', 'E', 'Am', 'F', 'Dm', 'E', 'E'], tune: twice('3:.5 2:.5 3:.5 5:.5 3:.5 2:.5 1:.5 0:.5 | -1:1 0:1 1:2 | 4:.5 3:.5 4:.5 6:.5 4:.5 3:.5 2:.5 1:.5 | 6:4', '6:2 4:2') },
    },
    phases: [['A', 'B'], ['B', 'A', 'B', 'A']],
    lead: ORGAN(0.9), leadShift: 0, leadVel: 0.9, lead2: 'brass', lead2Shift: -12,
    bass: 'R...R...R...R...', bassInst: ORGAN(0.3),
    kick: 'X.......X.......', snare: '....x.......x...', hat: '',
    stabs: [], pad: ORGAN(0.5), colour: 'tbell', sig: 'toccata', gain: 1.3,
  },
  twin: {
    cls: 'mini', tonic: 62, mode: AEO, lift: [0, 2],
    sections: {
      A: { bars: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'], tune: twice('0:1 0:.5 2:.5 4:2 | 4:1 4:.5 3:.5 2:2 | 5:1 5:.5 4:.5 3:1 2:1 | 1:2 0:2', '1:2 -1:2') },
      B: { bars: ['Dm', 'G', 'C', 'F', 'Dm', 'E', 'Am', 'Am'], tune: twice('3:1 3:.5 4:.5 5:2 | 6:1 6:.5 5:.5 4:2 | 3:.5 4:.5 5:.5 6:.5 7:1 6:1 | 4:4', '0:4') },
    },
    phases: [['A', 'B'], ['A', 'B', 'B', 'A']],
    lead: 'brass', leadShift: 0, leadVel: 0.5, lead2: HORNLEAD(0.6), lead2Shift: 12,
    bass: 'R.r.R.r.R.r.F.f.', bassInst: SUB(),
    kick: 'X...x...X...x...', snare: '....X.......X..x', hat: 'x.x.x.x.x.x.x.x.',
    stabs: [], pad: STRINGS(0.35), colour: 'tbell', sig: 'antiphon',
  },

  // ── the guardians ──
  bossBlot: {
    cls: 'guardian', tonic: 64, mode: AEO, lift: [0, 2, 5],
    sections: {
      A: { bars: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'], tune: twice('0:1 4:1.5 3:.5 2:1 | 1:1.5 2:.5 3:1 4:1 | 5:2 4:1 2:1 | 1:3 -:1', '0:3 -:1') },
      B: { bars: ['F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'E'], tune: twice('5:.5 4:.5 5:.5 7:.5 5:1 4:1 | 6:.5 5:.5 6:.5 8:.5 6:1 5:1 | 7:1 4:1 2:1 0:1 | 4:3 -:1', '6:3 -:1') },
      C: { bars: ['F', 'G', 'C', 'Am', 'F', 'G', 'A', 'A'], tune: twice('7:2 6:1 5:1 | 4:2 5:2 | 6:1 7:1 8:1 6:1 | 7:4', '7:4') },
    },
    phases: [['A', 'B'], ['B', 'A', 'B', 'B'], ['C', 'A', 'C', 'B']],
    lead: FIDDLE(), leadShift: 0, leadVel: 0.85, lead2: FLUTE(), lead2Shift: 12,
    bass: 'R.r.O.r.R.r.F.o.', bassInst: 'pizz',
    kick: 'X...x...X...x...', snare: '....x.......x.ox', hat: 'x.x.x.x.x.x.x.x.',
    perc: { inst: 'tamb', pat: '..x...x...x...x.' },
    arp: ['spicc', 45, 62, ARP_ROLL, 0.34, 0.3],
    stabs: [0, 2.5], pad: STRINGS(0.35), colour: 'celesta', sig: 'blot',
  },
  bossScarab: {
    cls: 'guardian', tonic: 62, mode: HIJ, lift: [0, 1, 3],
    sections: {
      A: { bars: ['A', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'], tune: twice('4:1 5:.5 4:.5 3:1 2:1 | 1:1.5 0:.5 1:2 | 4:.5 5:.5 6:.5 5:.5 4:1 3:1 | 2:.5 1:.5 2:.5 1:.5 0:2', '1:1 0:1 0:2') },
      B: { bars: ['Dm', 'A', 'Bb', 'A', 'Dm', 'Gm', 'Bb', 'A'], tune: twice('7:1 6:.5 5:.5 4:2 | 5:1 4:.5 3:.5 2:2 | 3:.5 4:.5 5:.5 6:.5 7:1 5:1 | 4:4', '1:4') },
      C: { bars: ['Bb', 'A', 'Gm', 'A', 'Bb', 'Gm', 'Bb', 'A'], tune: twice('0:.5 1:.5 2:.5 3:.5 4:.5 5:.5 6:.5 7:.5 | 8:2 7:2 | 6:.5 5:.5 4:.5 5:.5 6:1 4:1 | 4:2 1:1 0:1', '7:4') },
    },
    phases: [['A', 'B'], ['B', 'A', 'C', 'A'], ['C', 'B', 'C', 'A']],
    lead: FLUTE(true), leadShift: 12, leadVel: 0.85, lead2: 'oud', lead2Shift: 0,
    bass: 'R..R..R.R..R.F.O', bassInst: 'tbass',
    kick: 'X..x..x.X..x..x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    perc: { inst: 'tek', pat: '.xx.x..x.xx.x.xx' },
    arp: ['oud', 50, 64, ARP_PEDAL, 0.36, 0.4],
    stabs: [0, 1.5], pad: DRONE(520), colour: 'tile', sig: 'scarab',
  },
  bossMoth: {
    cls: 'guardian', tonic: 64, mode: DOR, lift: [0, 2, 3],
    sections: {
      A: { bars: ['Am', 'D', 'Am', 'D', 'C', 'G', 'Bm', 'E'], tune: twice('0:1.5 2:.5 4:1 3:1 | 2:1.5 1:.5 0:2 | 4:1 5:1 6:1 5:1 | 4:3 -:1', '2:1 1:1 0:2') },
      B: { bars: ['C', 'D', 'Em', 'Am', 'C', 'D', 'E', 'E'], tune: twice('7:1.5 6:.5 5:1 4:1 | 5:1.5 4:.5 3:2 | 4:1 5:1 6:1 7:1 | 8:2 6:2', '8:4') },
      C: { bars: ['Am', 'G', 'D', 'D', 'C', 'G', 'D', 'E'], tune: twice('4:.5 5:.5 7:1 9:1 8:1 | 7:1.5 6:.5 5:2 | 6:.5 7:.5 8:1 9:1 10:1 | 9:4', '7:4') },
    },
    phases: [['A', 'B'], ['B', 'A', 'B', 'C'], ['C', 'A', 'C', 'B']],
    lead: VIOLIN(0.6), leadShift: 0, leadVel: 1.0, lead2: 'celesta', lead2Shift: 12,
    bass: 'R...F...O...F...', bassInst: SUB(),
    kick: 'X.....x.X.......', snare: '....x.......x...', hat: 'x.xox.xox.xox.xo',
    arp: ['harp', 57, 84, ARP_UP, 0.34, 0.6],
    stabs: [], pad: GLASSHARM(), colour: 'glass', sig: 'moth', gain: 1.25,
  },
  bossGolem: {
    cls: 'guardian', tonic: 60, mode: PHR, lift: [0, 1, 3],
    sections: {
      A: { bars: ['Am', 'Bb', 'Am', 'Bb', 'F', 'Bb', 'Am', 'Am'], tune: twice('0:1 0:.5 1:.5 0:2 | 3:1 3:.5 1:.5 1:2 | 4:1 2:1 0:1 2:1 | 1:2 -2:2', '0:4') },
      B: { bars: ['Dm', 'C', 'Bb', 'Am', 'Dm', 'C', 'Bb', 'Am'], tune: twice('3:2 2:1 1:1 | 2:2 1:1 0:1 | 1:1 2:1 3:1 4:1 | 5:4', '0:4') },
      C: { bars: ['Am', 'G', 'F', 'Bb', 'Am', 'G', 'Bb', 'A'], tune: twice('7:2 6:1 5:1 | 4:2 3:2 | 4:1 5:1 6:1 8:1 | 7:4', '7:4') },
    },
    phases: [['A', 'B'], ['B', 'A', 'B', 'A'], ['C', 'B', 'C', 'A']],
    lead: HORNLEAD(0.4), leadShift: 0, leadVel: 0.8, lead2: CELLO(), lead2Shift: -12,
    bass: 'R.R...R.R.R...F.', bassInst: SUB(),
    kick: 'X.x...x.X.x...x.', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.',
    perc: { inst: 'taiko', pat: 'X.......x.x.....', midi: 36 },
    stabs: [0, 0.5, 2.5], pad: LOWBRASS(0.4), colour: 'tbell', sig: 'golem',
  },
  silence: {
    cls: 'guardian', tonic: 62, mode: AEO, lift: [0, 1, 3],
    sections: {
      A: { bars: ['Am', 'Dm', 'E', 'Am', 'F', 'Dm', 'E', 'E'], tune: twice('0:2 -1:1 0:1 | 1:2 0:1 -1:1 | -3:1 -2:1 -1:1 0:1 | -1:4', '0:4') },
      B: { bars: ['F', 'G', 'C', 'Am', 'F', 'Dm', 'E', 'Am'], tune: twice('5:2 4:1 3:1 | 4:2 3:1 2:1 | 3:1 2:1 1:1 0:1 | -1:4', '0:4') },
      L: { bars: LEIT_A_MINOR_CHORDS, tune: LEIT_A_MINOR, wrote: 65, mode: AEO },
    },
    phases: [['A', 'B'], ['B', 'L', 'A', 'B'], ['L', 'A', 'L', 'B']],
    lead: ORGAN(0.8), leadShift: 0, leadVel: 0.7, lead2: CHOIR('ah'), lead2Shift: 0,
    bass: 'R...r...R...r.F.', bassInst: SUB(),
    kick: 'X...x...X...x...', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.',
    arp: ['spicc', 45, 62, ARP_ROLL, 0.3, 0.3],
    stabs: [0], pad: ORGAN(0.5), colour: 'tbell', sig: 'silence', gain: 1.25,
  },

  // ── the legends ──
  wyrm: {
    cls: 'legend', tonic: 64, mode: DOR, lift: [0, 2, 5],
    sections: {
      A: { bars: ['Am', 'D', 'Am', 'D', 'C', 'G', 'D', 'D'], tune: twice('0:.5 2:.5 4:.5 2:.5 3:.5 4:.5 5:1 | 4:.5 2:.5 0:.5 -1:.5 0:2 | 4:.5 5:.5 7:.5 5:.5 6:.5 7:.5 8:1 | 7:.5 5:.5 4:.5 2:.5 4:2', '3:.5 2:.5 1:.5 2:.5 0:2') },
      B: { bars: ['C', 'G', 'Am', 'Em', 'C', 'G', 'D', 'D'], tune: twice('7:1.5 6:.5 5:1 4:1 | 5:.5 4:.5 3:.5 2:.5 3:2 | 4:1 5:1 7:1 9:1 | 8:4', '6:4') },
      C: { bars: ['F', 'G', 'Am', 'Am', 'F', 'G', 'A', 'A'], tune: twice('7:1 8:.5 9:.5 10:2 | 9:1 8:.5 7:.5 8:2 | 9:.5 8:.5 7:.5 6:.5 5:1 7:1 | 7:4', '7:4') },
    },
    phases: [['A', 'A', 'B', 'A'], ['B', 'A', 'B', 'C'], ['C', 'A', 'C', 'B', 'C', 'C']],
    lead: FLUTE(), leadShift: 12, leadVel: 0.8, lead2: VIOLIN(0.6), lead2Shift: 0,
    bass: 'R..rO.r.R..rF.r.', bassInst: 'pizz',
    kick: 'X...x...X...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    arp: ['harp', 55, 86, [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1], 0.3, 0.5],
    stabs: [0], pad: STRINGS(0.4), colour: 'celesta', sig: 'serpent',
  },
  djinn: {
    cls: 'legend', tonic: 62, mode: HIJ, lift: [0, 2, 3],
    sections: {
      A: { bars: ['A', 'Bb', 'A', 'Bb', 'Gm', 'A', 'Bb', 'A'], tune: twice('0:1 2:.5 3:.5 4:2 | 5:.5 4:.5 3:.5 2:.5 1:2 | 0:.5 1:.5 2:.5 3:.5 4:.5 5:.5 6:.5 7:.5 | 7:3 -:1', '1:1 0:1 0:2') },
      B: { bars: ['Dm', 'Gm', 'A', 'A', 'Dm', 'Gm', 'Bb', 'A'], tune: twice('7:2 8:.5 7:.5 6:.5 5:.5 | 4:2 5:1 4:1 | 3:.5 2:.5 1:.5 2:.5 3:1 4:1 | 1:4', '0:4') },
      C: { bars: ['Bb', 'A', 'Bb', 'A', 'Gm', 'A', 'Bb', 'A'], tune: twice('7:.5 8:.5 9:1 8:.5 7:.5 6:1 | 7:.5 6:.5 5:.5 4:.5 5:2 | 4:.5 5:.5 6:.5 7:.5 8:.5 9:.5 10:1 | 7:4', '7:4') },
    },
    phases: [['A', 'B', 'A', 'B'], ['B', 'C', 'A', 'C'], ['C', 'A', 'C', 'B', 'C', 'C']],
    lead: FLUTE(true), leadShift: 12, leadVel: 0.85, lead2: 'brass', lead2Shift: -12,
    bass: 'R..R..R.R..R..O.', bassInst: 'tbass',
    kick: 'X..x..x.X..x..x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx',
    perc: { inst: 'tek', pat: 'xxoxxoxoxxoxxoxx' },
    arp: ['koto', 62, 81, ARP_ROLL, 0.3, 0.4],
    stabs: [0, 1.5, 3], pad: DRONE(560), colour: 'tile', sig: 'djinn',
  },
  aurora: {
    cls: 'legend', tonic: 64, mode: LYD, lift: [0, 2, 3],
    sections: {
      A: { bars: ['A', 'B', 'A', 'B', 'F#m', 'G#m', 'A', 'B'], tune: twice('4:2 3:.5 4:.5 6:1 | 7:2 6:1 4:1 | 3:.5 4:.5 6:.5 7:.5 8:1 7:1 | 6:4', '4:4') },
      B: { bars: ['C#m', 'B', 'A', 'E', 'C#m', 'B', 'A', 'B'], tune: twice('9:2 8:1 7:1 | 6:2 4:2 | 5:1 6:1 7:1 8:1 | 7:4', '8:4') },
      C: { bars: ['D', 'E', 'A', 'A', 'D', 'E', 'F#m', 'E'], tune: twice('7:1 10:1 12:2 | 11:1 8:1 11:2 | 9:1 11:1 14:2 | 14:4', '11:4'), mode: MAJ },
    },
    phases: [['A', 'B', 'A', 'B'], ['B', 'A', 'C', 'B'], ['C', 'B', 'C', 'A', 'C', 'C']],
    lead: VIOLIN(0.65), leadShift: 0, leadVel: 0.8, lead2: 'celesta', lead2Shift: 12,
    bass: 'R...O...R...O...', bassInst: SUB(),
    kick: 'X.......X...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    arp: ['glass', 76, 96, ARP_UP, 0.2, 0.5],
    stabs: [], pad: GLASSHARM(), colour: 'glass', sig: 'aurora',
  },
  phoenix: {
    cls: 'legend', tonic: 60, mode: HMI, lift: [0, 2, 2],
    sections: {
      A: { bars: ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'E', 'E'], tune: twice('0:.5 2:.5 4:.5 7:.5 6:1 4:1 | 5:.5 4:.5 3:.5 2:.5 1:2 | 2:.5 3:.5 4:.5 5:.5 6:1 7:1 | 6:4', '0:4') },
      B: { bars: ['Dm', 'Am', 'F', 'E', 'Dm', 'Am', 'E', 'E'], tune: twice('3:1 5:1 7:1 6:1 | 5:2 4:2 | 3:.3333 4:.3333 5:.3334 6:1 7:1 6:1 | 6:4', '6:2 4:2') },
      R: { bars: ['A', 'E', 'F#m', 'D', 'A', 'E', 'D', 'E'], tune: twice('7:2 9:1 11:1 | 10:2 9:2 | 8:1 9:1 10:1 11:1 | 12:4', '11:2 9:2'), mode: MAJ },
      S: { bars: ['D', 'A', 'E', 'F#m', 'D', 'A', 'E', 'A'], tune: twice('10:1 9:1 8:1 7:1 | 8:2 9:2 | 11:1 10:1 9:1 8:1 | 7:4', '7:4'), mode: MAJ },
    },
    phases: [['A', 'B', 'A', 'B'], ['B', 'A', 'B', 'A'], ['R', 'S', 'R', 'S']],
    lead: VIOLIN(0.85), leadShift: 0, leadVel: 0.8, lead2: HORNLEAD(0.6), lead2Shift: -12,
    bass: 'R..R..R.R..R..F.', bassInst: 'tbass',
    kick: 'X...x...X...x...', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.',
    arp: ['spicc', 45, 64, ARP_ROLL, 0.34, 0.3],
    stabs: [0, 1.5, 3], pad: STRINGS(0.4), colour: 'anvil', sig: 'phoenix',
  },
  abyssKing: {
    cls: 'legend', tonic: 62, mode: HMI, lift: [0, 1, 3],
    sections: {
      K: { bars: ['Am', 'F', 'Bb', 'E', 'Am', 'F', 'Bb', 'E'], tune: twice('0:1 4:1 5:.5 4:.5 3:.5 2:.5 | 1:2 -1:2 | 0:1 4:1 7:1 6:1 | 5:.5 4:.5 3:.5 1:.5 -1:2', '0:4') },
      J: { bars: ['Dm', 'Bb', 'E', 'Am', 'Dm', 'Bb', 'E', 'E'], tune: twice('3:1 5:1 7:1.5 6:.5 | 5:1 4:1 3:2 | 4:.5 5:.5 6:.5 7:.5 8:1 6:1 | 6:4', '6:4') },
      M: { bars: secA(MEA).bars, tune: secA(MEA).tune, wrote: 67, mode: MAJ },
      D: { bars: secA(DES).bars, tune: secA(DES).tune, wrote: 62, mode: HIJ },
      I: { bars: secA(ICE).bars, tune: secA(ICE).tune, wrote: 64, mode: LYD },
      F: { bars: secA(FOR).bars, tune: secA(FOR).tune, wrote: 60, mode: AEO },
      C: { bars: secA(CIT).bars, tune: secA(CIT).tune, wrote: 62, mode: AEO },
      Lm: { bars: LEIT_A_MINOR_CHORDS, tune: LEIT_A_MINOR, wrote: 65, mode: AEO },
      La: { bars: LEIT_A_CHORDS, tune: LEIT_A, wrote: 65, mode: MAJ },
    },
    phases: [['K', 'M', 'K', 'D'], ['J', 'I', 'K', 'F'], ['C', 'Lm', 'K', 'J', 'La', 'La']],
    lead: ORGAN(0.85), leadShift: 0, leadVel: 0.7, lead2: 'brass', lead2Shift: -12,
    bass: 'R..R..R.R..R..F.', bassInst: SUB(),
    kick: 'X..x..x.X..x..x.', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.',
    arp: ['spicc', 45, 64, ARP_ROLL, 0.34, 0.3],
    stabs: [0, 1.5, 3], pad: STRINGS(0.45), colour: 'tbell', sig: 'abyss',
  },
};

export function bossSpec(kind: EnemyKind): BossSpec | null {
  return BOSSES[kind] ?? null;
}

// ───────────────────────────── the score ─────────────────────────────

const CH: [string, { gain: number; wet: number; pan?: number; vibratoCents?: number; vibratoRate?: number; tremolo?: number; tremoloRate?: number }][] = [
  ['bx-pad', { gain: 0.4, wet: 0.36 }],
  ['bx-bass', { gain: 0.55, wet: 0.06 }],
  ['bx-kit', { gain: 0.5, wet: 0.16 }],
  ['bx-hat', { gain: 0.22, wet: 0.12, pan: 0.26 }],
  ['bx-perc', { gain: 0.3, wet: 0.18, pan: -0.28 }],
  ['bx-arp', { gain: 0.36, wet: 0.24, pan: 0.18 }],
  ['bx-lead', { gain: 0.72, wet: 0.4, vibratoCents: 11, vibratoRate: 5.4, pan: 0.08 }],
  ['bx-lead2', { gain: 0.5, wet: 0.4, vibratoCents: 9, pan: -0.16 }],
  ['bx-brass', { gain: 0.42, wet: 0.3, pan: -0.1 }],
  ['bx-choir', { gain: 0.36, wet: 0.5, vibratoCents: 6 }],
  ['bx-colour', { gain: 0.26, wet: 0.5, pan: 0.3 }],
  ['bx-timp', { gain: 0.5, wet: 0.3 }],
  ['bx-left', { gain: 0.4, wet: 0.3, pan: -0.75 }],
  ['bx-right', { gain: 0.4, wet: 0.3, pan: 0.75 }],
];

/** the boss of a bar, as the host player's log reports it */
export interface BossAt {
  kind: EnemyKind;
  phase: number;
  from: number;
  phaseFrom: number;
}

/**
 * One boss's music. It is a delegate of the host battle song: the host asks it for the harmony, the
 * guide and the arrangement of the bars that belong to the boss (local bar = bars since its phase began).
 */
export class BossScore extends Song {
  readonly bpm = 100;
  readonly key: Scale;
  protected readonly form: Form;
  private readonly forms: Form[];
  private readonly infos = new Map<string, BarInfo>();
  private readonly tunes = new Map<string, MNote[]>();
  private readonly scales = new Map<string, Scale>();
  private readonly ready = new WeakSet<Player>();
  private bs: BossAt = { kind: 'toad', phase: 1, from: 0, phaseFrom: 0 };
  private lastSec = '';

  constructor(
    readonly kind: EnemyKind,
    readonly spec: BossSpec,
  ) {
    super();
    this.key = new Scale(spec.tonic, spec.mode);
    this.forms = spec.phases.map((order) => new Form(order.map((n) => ({ name: n, bars: spec.sections[n].bars })), [], order));
    this.form = this.forms[0];
  }

  setup(_p: Player): void {}
  protected arrange(_b: BarCtx, _f: BarInfo): void {}

  get phases(): number {
    return this.spec.phases.length;
  }

  private ph(phase: number): number {
    return clamp(Math.round(phase), 1, this.spec.phases.length) - 1;
  }

  /** the sounding tonic of a phase (and of a section written in another key) */
  private tonicOf(phase: number): number {
    return this.spec.tonic + (this.spec.lift[this.ph(phase)] ?? 0);
  }

  scaleOf(phase: number, sec: string): Scale {
    const key = `${phase}:${sec}`;
    let s = this.scales.get(key);
    if (!s) {
      const sd = this.spec.sections[sec];
      s = new Scale(this.tonicOf(phase), sd?.mode ?? this.spec.mode);
      this.scales.set(key, s);
    }
    return s;
  }

  /** the bar's info (chords transposed to the phase's key) */
  info(local: number, phase: number): BarInfo {
    const pi = this.ph(phase);
    const key = `${pi}:${local}`;
    let f = this.infos.get(key);
    if (f) return f;
    const raw = this.forms[pi].at(Math.max(0, local));
    const shiftOf = (sec: string) => this.tonicOf(phase) - (this.spec.sections[sec]?.wrote ?? 57);
    const sh = shiftOf(raw.sec);
    const nextSec = this.forms[pi].at(Math.max(0, local) + 1).sec;
    const tr = (c: Chord, k: number) => transpose(c, k);
    f = { ...raw, chords: raw.chords.map((c) => tr(c, sh)), chord: tr(raw.chord, sh), next: tr(raw.next, shiftOf(nextSec)) };
    if (this.infos.size > 1500) this.infos.clear();
    this.infos.set(key, f);
    return f;
  }

  private local(bar: number, bs: BossAt): number {
    return bar - bs.phaseFrom;
  }

  chordAtBar(bar: number, beat: number, bs: BossAt): Chord {
    return chordIn(this.info(this.local(bar, bs), bs.phase).chords, beat, this.beats);
  }

  keyAtBar(bar: number, bs: BossAt): Scale {
    return this.scaleOf(bs.phase, this.info(this.local(bar, bs), bs.phase).sec);
  }

  private tuneOf(phase: number, sec: string): MNote[] {
    const key = `${phase}:${sec}`;
    let t = this.tunes.get(key);
    if (!t) {
      const line = this.spec.sections[sec]?.tune;
      const k = this.scaleOf(phase, sec);
      t = line ? lineNotes(k, k.tonic, this.beats, line) : [];
      this.tunes.set(key, t);
    }
    return t;
  }

  guideAtBar(bar: number, beat: number, bs: BossAt): number | null {
    const f = this.info(this.local(bar, bs), bs.phase);
    const notes = this.tuneOf(bs.phase, f.sec);
    if (!notes.length) return null;
    const at = f.i * this.beats + beat + 1e-6;
    let best: MNote | null = null;
    for (const n of notes) {
      if (n.beat <= at) best = n;
      else break;
    }
    return best ? best.midi : notes[0].midi;
  }

  /** the notes of the tune that start in this bar (beats relative to the bar) */
  private tuneNotes(f: BarInfo, phase: number): MNote[] {
    const all = this.tuneOf(phase, f.sec);
    const from = f.i * this.beats;
    const out: MNote[] = [];
    for (const n of all) if (n.beat >= from - 1e-6 && n.beat < from + this.beats - 1e-6) out.push({ ...n, beat: n.beat - from });
    return out;
  }

  private melody(b: BarCtx, f: BarInfo, phase: number, inst: Inst, ch: string, vel: number, shift: number, o: { legato?: number; minDur?: number; release?: number } = {}): void {
    for (const n of this.tuneNotes(f, phase)) {
      if (o.minDur && n.dur < o.minDur) continue;
      this.play(b, inst, ch, n.beat, n.midi + shift, n.vel * vel, n.dur * b.spb * (o.legato ?? 0.94), o.release, 0.004);
    }
  }

  /** a 16-step bass pattern on the chord (r root · t third · f fifth · o octave; upper case = accent) */
  private bassPat(b: BarCtx, f: BarInfo, pat: string, inst: Inst, vel: number): void {
    if (!pat) return;
    const step = b.beats / pat.length;
    for (let i = 0; i < pat.length; i++) {
      const ch = pat[i];
      if (ch === '.') continue;
      const lo = ch.toLowerCase();
      const which = lo === 'r' ? 0 : lo === 't' ? 1 : lo === 'f' ? 2 : lo === 'o' ? 3 : 0;
      const beat = i * step;
      const c = this.cAt(f, beat);
      const m = this.tone(c, typeof inst === 'string' ? 36 : 28, which);
      let len = 1;
      while (i + len < pat.length && pat[i + len] === '.' && len < 4) len++;
      this.play(b, inst, 'bx-bass', beat, m, vel * (ch === lo ? 0.78 : 1), len * step * b.spb * 0.85, 0.08, 0.002);
    }
  }

  private setupOn(p: Player): void {
    if (this.ready.has(p)) return;
    this.ready.add(p);
    for (const [name, o] of CH) p.ch(name, { ...o, gain: o.gain * 0.9 });
  }

  /** compose one bar of the boss (b.bar is the host's absolute bar) */
  composeBar(b: BarCtx, bs: BossAt, band: BandMix): void {
    this.bs = bs;
    this.setupOn(b.p);
    const f = this.info(this.local(b.bar, bs), bs.phase);
    const sk = `${bs.phase}:${f.start}`;
    if (sk !== this.lastSec) {
      this.lastSec = sk;
      this.vmul = 1;
    }
    const S = this.spec;
    const ph = bs.phase;
    const top = ph >= this.phases;
    const I = clamp(b.drop ? 3 : b.I, 1, 3);
    const cls = S.cls;
    // every phase pushes harder (and the bigger the boss, the bigger the band)
    const big = (cls === 'legend' ? 1.08 : cls === 'guardian' ? 1.04 : 1) * (this.phases <= 2 ? 0.8 + 0.28 * (ph - 1) : 0.84 + 0.13 * (ph - 1)) * (S.gain ?? 1);
    const h = band.harmony;
    const first = b.bar === bs.from;
    const phaseStart = b.bar === bs.phaseFrom;

    // ── the bed ──
    this.chords(b, f, 'bx-pad', S.pad, 'bx-pad', 45, 62, 3, (typeof S.pad === 'string' ? 0.3 : 0.34) * big, 0.3);
    this.bassPat(b, f, S.bass, S.bassInst, (typeof S.bassInst === 'string' ? 0.62 : 0.5) * big);
    if (typeof S.bassInst === 'string' && S.bassInst !== 'pizz') this.play(b, SUB(), 'bx-bass', 0, this.tone(f.chord, 28, 0), 0.3, b.beats * b.spb * 0.9, undefined, 0.001);

    // ── the drums (the turtle's steps are in the kick) ──
    if (!b.build) {
      const sw = S.swing ?? 0;
      this.drum(b, 'kick', 'bx-kit', S.kick, 0.62 * big, 60, 0.002, sw);
      if (S.snare) this.drum(b, 'snare', 'bx-kit', ph >= 3 ? S.snare.replace(/\./g, (_m, i: number) => (i % 4 === 2 ? 'o' : '.')) : S.snare, 0.5 * big, 60, 0.002, sw);
      const hat = ph >= 2 && S.hat ? 'xoxoxoxoxoxoxoxo' : S.hat;
      if (hat) this.drum(b, 'hat', 'bx-hat', hat, (I >= 2 ? 0.42 : 0.36), 60, 0.002, sw);
      if (S.perc) this.drum(b, S.perc.inst, 'bx-perc', S.perc.pat, 0.46 * big, S.perc.midi ?? 60, 0.002, sw);
      if (ph >= 2 && f.i % 2 === 0) b.p.buf('timp', 'bx-timp', this.T(b, 0, 0.001), this.tone(f.chord, 40, 0), 0.34 * big, 2.5);
      if (f.last && !b.drop) [52, 48, 45, 41].forEach((m, k) => b.p.hit('tom', 'bx-kit', this.T(b, 3 + k * 0.25, 0.002), (0.4 + k * 0.07) * big, m));
      if ((f.i === 0 && (ph >= 2 || cls !== 'mini')) || first || phaseStart) b.p.hit('crash', 'bx-kit', this.T(b, 0, 0.001), 0.3 * big);
      if (top && f.i % 4 === 3 && !b.drop) this.roll(b, 'timp', 'bx-timp', 2, 4, 6, 0.1, 0.42, this.tone(f.next, 40, 0));
    }

    // ── the ostinato ──
    if (S.arp) {
      const [inst, lo, hi, order, vel, len] = S.arp;
      this.ostinato(b, f, inst, 'bx-arp', lo, hi, order, vel * (ph >= 2 ? 1.1 : 1), len, [0, 4, 8, 12]);
    }

    // ── the creature's tune: a call in the first phase (the towers answer), all of it later ──
    const callBar = f.i % 4 < 2 || cls !== 'mini' || ph >= 2;
    if (callBar) this.melody(b, f, ph, S.lead, 'bx-lead', S.leadVel * big, S.leadShift, { legato: 0.95 });
    if (S.lead2 && ph >= 2) this.melody(b, f, ph, S.lead2, 'bx-lead2', S.leadVel * 0.6, S.lead2Shift ?? 0, { legato: 0.95 });
    if (top && cls !== 'mini') {
      // the glory of the last phase: the choir sings the tune's long notes, the horns hammer it an octave down
      this.melody(b, f, ph, 'choir', 'bx-choir', 0.2, 0, { minDur: 0.9, legato: 1, release: 0.5 });
      this.melody(b, f, ph, 'brass', 'bx-brass', 0.34, -12, { legato: 0.85 });
    }

    // ── brass and voices ──
    if (S.stabs && S.stabs.length && I >= 1) this.stabs(b, f, 'bx-st', 'brass', 'bx-brass', 50, 67, 3, S.stabs, (ph >= 2 ? 0.44 : 0.38) * big, 0.4);
    if (ph >= 2 || cls === 'legend') this.chords(b, f, 'bx-ch', ph >= 3 ? 'choir' : 'choiroo', 'bx-choir', 55, 72, ph >= 3 ? 4 : 3, (ph >= 3 ? 0.17 : 0.14) * big, 0.5);
    if (top && cls !== 'mini' && f.i % 4 === 3) this.chords(b, f, 'bx-sw', { ...LOWBRASS(0.65), attack: 3 * b.spb, release: 0.4 }, 'bx-brass', 50, 67, 3, 0.4, 0.15);

    // ── the colour ──
    const hi = chordTones(f.chord, S.colour === 'tbell' ? 60 : 79, S.colour === 'tbell' ? 74 : 96);
    if (hi.length && f.i % 2 === 0) this.play(b, S.colour, 'bx-colour', 0, hi[(f.i / 2) % hi.length], S.colour === 'anvil' ? 0.26 : 0.22, 2);

    // ── the band and the player on top ──
    if (h >= 4 && f.i % 4 === 3) this.chords(b, f, 'bx-tu', 'choir', 'bx-choir', 60, 76, 3, 0.12, 0.4);
    const g = b.groove;
    if (g >= 1 && !b.build) this.drum(b, 'clap', 'bx-kit', '....x.......x...', 0.4);
    if (g >= 3 && !b.build) this.stabs(b, f, 'bx-g', 'brass', 'bx-brass', 55, 70, 3, f.i % 2 === 0 ? [0, 1.5] : [2.5, 3.5], 0.34, 0.3);
    if (b.power > 0.6) this.melody(b, f, ph, 'celesta', 'bx-colour', 0.3 * Math.min(1, (b.power - 0.6) / 0.2), 12, { legato: 0.9 });
    if (b.power > 0.85 && !(top && cls !== 'mini')) this.melody(b, f, ph, 'choir', 'bx-choir', 0.18, 0, { minDur: 0.9, legato: 1, release: 0.5 });

    this.signature(b, f, ph, I);
  }

  // ───────────────────────────── signatures ─────────────────────────────

  private signature(b: BarCtx, f: BarInfo, ph: number, I: number): void {
    const S = this.spec;
    const c0 = f.chord;
    switch (S.sig) {
      case 'hops': {
        // the toad hops: low staccato octave leaps, and a croak (a horn sliding down) every other bar
        for (const beat of [0, 1, 2, 3]) this.play(b, 'boom', 'bx-bass', beat, this.tone(this.cAt(f, beat), 28, 0), beat % 2 ? 0.22 : 0.32, 0.18, 0.06, 0.001);
        if (f.i % 2 === 1) b.p.buf('brass', 'bx-brass', this.T(b, 3.5, 0.002), this.tone(this.cAt(f, 3.5), 45, 0), 0.4, 0.4 * b.spb, { release: 0.1, bend: 300, bendTime: 0.18 });
        break;
      }
      case 'corps': {
        // the beetle's drum corps: snare rudiments (flams, diddles), the bass drums in thirds, cymbals
        this.drum(b, 'snare', 'bx-kit', ph >= 2 ? 'XoxoXoxxXoxoXxxx' : 'Xoxo.oxoXoxo.oxx', 0.4);
        for (const [beat, which] of [[0, 0], [0.75, 1], [1.5, 2], [2, 0], [2.75, 1], [3.5, 2]] as [number, number][]) b.p.hit('tom', 'bx-perc', this.T(b, beat, 0.002), 0.42, [45, 50, 55][which]);
        if (f.i % 4 === 0) b.p.hit('crash', 'bx-kit', this.T(b, 0, 0.001), 0.24);
        break;
      }
      case 'caw': {
        // the crow caws: two staccato brass shrieks that bend down, wing-beats in the brushes
        for (const beat of f.i % 2 === 0 ? [1.5, 1.75] : [3.5, 3.75]) {
          const tones = chordTones(this.cAt(f, beat), 67, 76);
          if (tones.length) b.p.buf('brass', 'bx-right', this.T(b, beat, 0.002), tones[tones.length - 1], 0.42, 0.18 * b.spb, { release: 0.06, bend: 250, bendTime: 0.12 });
        }
        this.drum(b, 'brush', 'bx-perc', '..x...x...x...x.', 0.5);
        break;
      }
      case 'rumble': {
        // the sandworm: a low rumble (taiko rolls) under a drone on the tonic and the flat second
        this.roll(b, 'taiko', 'bx-perc', 2, 4, 4, 0.12, 0.36, 33);
        const t = this.tone(c0, 33, 0);
        this.play(b, DRONE(300), 'bx-pad', 0, t, 0.3, b.beats * b.spb);
        if (f.i % 2 === 1) this.play(b, CELLO(), 'bx-lead2', 2, t + 13, 0.3, 1.8 * b.spb);
        break;
      }
      case 'swamp': {
        // the croc: a lazy swamp shuffle; the mirage shimmers (glass in detuned pairs, wide)
        for (let k = 0; k < 4; k++) {
          const tones = chordTones(this.cAt(f, k + 0.5), 84, 96);
          if (!tones.length) continue;
          const m = tones[(k + f.i) % tones.length];
          b.p.buf('glass', 'bx-left', this.T(b, k + 0.5, 0.002), m, 0.12, 0.8, { cents: -14 });
          b.p.buf('glass', 'bx-right', this.T(b, k + 0.54, 0.002), m, 0.12, 0.8, { cents: 14 });
        }
        break;
      }
      case 'riddle': {
        // the sphinx: the darbuka's riddle (3+3+2 against the bar), finger cymbals on the answers
        this.drum(b, 'dum', 'bx-perc', 'X..x..X.x..X..x.', 0.5);
        if (f.i % 2 === 1) this.drum(b, 'anvil', 'bx-colour', '......x.......x.', 0.12, 91);
        break;
      }
      case 'roar': {
        // the yeti roars, and the mountains answer: a low brass chord echoing twice; big toms
        if (f.i % 2 === 0) {
          const c = this.cAt(f, 0);
          [[0, 'bx-brass', 0.5], [1, 'bx-left', 0.26], [2, 'bx-right', 0.14]].forEach(([beat, ch, v]) => {
            for (const m of [this.tone(c, 45, 0), this.tone(c, 45, 2), this.tone(c, 45, 3)]) b.p.buf('brass', ch as string, this.T(b, beat as number, 0.002), m, v as number, 0.8 * b.spb, { release: 0.3, bend: -60, bendTime: 0.2 });
          });
        }
        this.drum(b, 'tom', 'bx-perc', 'X...o.X.X...o.oo', 0.5, 45);
        b.p.hit('tom', 'bx-perc', this.T(b, 0, 0.002), 0.5, 41);
        break;
      }
      case 'siren': {
        // the siren's choir under her song: a haunting 'oo' that swells into every phrase
        this.chords(b, f, 'bx-sir', 'choiroo', 'bx-choir', 57, 72, 3, f.i % 4 === 3 ? 0.2 : 0.13, 0.6);
        break;
      }
      case 'mirror': {
        // the stag's mirror: the chord climbs on the left while its reflection falls on the right
        for (let k = 0; k < 8; k++) {
          const beat = k * 0.5;
          const tones = chordTones(this.cAt(f, beat), 72, 91);
          if (!tones.length) continue;
          b.p.buf('glass', 'bx-left', this.T(b, beat, 0.002), tones[k % tones.length], 0.16, 0.5);
          b.p.buf('celesta', 'bx-right', this.T(b, beat, 0.002), tones[tones.length - 1 - (k % tones.length)], 0.18, 0.5);
        }
        break;
      }
      case 'fire': {
        // the salamander: running triplets (strings and hats) and the crackle of sparks
        for (let k = 0; k < 12; k++) {
          const beat = k / 3;
          const tones = chordTones(this.cAt(f, beat), 52, 69);
          if (tones.length) this.play(b, 'spicc', 'bx-arp', beat, tones[[0, 1, 2, 3, 2, 1][k % 6] % tones.length], k % 3 === 0 ? 0.4 : 0.28, 0.3 * b.spb, undefined, 0.002);
          b.p.hit('hat', 'bx-hat', this.T(b, beat, 0.002), k % 3 === 0 ? 0.34 : 0.2);
        }
        if (I >= 2) this.drum(b, 'tek', 'bx-perc', '.x..x.x...x..x.x', 0.26);
        break;
      }
      case 'seven': {
        // the magma crab: clanking 3+3+3+3+2+2 accents against the four beats
        this.drum(b, 'anvil', 'bx-colour', 'X..X..X..X..X.X.', 0.16, 79);
        this.drum(b, 'tom', 'bx-perc', 'X..X..X..X..X.X.', 0.36, 43);
        break;
      }
      case 'anvil': {
        // the smith: the hammer on the anvil IS the beat; sparks fly on the sixteenth after
        for (let beat = 0; beat < 4; beat++) {
          const tones = chordTones(this.cAt(f, beat), 76, 88);
          if (tones.length) this.play(b, 'anvil', 'bx-colour', beat, tones[(beat + f.i) % tones.length], beat === 0 ? 0.4 : 0.3, 1, undefined, 0.001);
          b.p.hit('tick', 'bx-hat', this.T(b, beat + 0.25, 0.002), 0.3, 64);
          b.p.hit('tom', 'bx-perc', this.T(b, beat, 0.001), 0.36, 41);
        }
        break;
      }
      case 'stone': {
        // the gargoyle: tolling stone bells on 1 and 3, a pedal in the organ, a stone thud
        for (const beat of [0, 2]) this.play(b, 'tbell', 'bx-colour', beat, this.tone(this.cAt(f, beat), 55, beat === 0 ? 0 : 2), 0.3, 2 * b.spb, 1.2, 0.001);
        this.play(b, ORGAN(0.3), 'bx-bass', 0, this.tone(c0, 33, 0), 0.4, b.beats * b.spb * 0.95);
        b.p.hit('taiko', 'bx-perc', this.T(b, 0, 0.001), 0.4, 33);
        break;
      }
      case 'toccata': {
        // the organist's toccata: sixteenths flickering between the pedal and the chord above
        for (let k = 0; k < 16; k++) {
          const beat = k * 0.25;
          const c = this.cAt(f, beat);
          const tones = chordTones(c, 62, 81);
          const m = k % 2 === 0 ? this.tone(c, 50, 0) : tones[(k >> 1) % Math.max(1, tones.length)] ?? 69;
          this.play(b, ORGAN(0.7), 'bx-arp', beat, m, k % 4 === 0 ? 0.46 : 0.34, 0.22 * b.spb, undefined, 0.001);
          // the second manual joins an octave up in the last phase
          if (ph >= 2 && k % 2 === 1) this.play(b, ORGAN(0.9), 'bx-colour', beat, m + 12, 0.24, 0.2 * b.spb, undefined, 0.001);
        }
        this.play(b, ORGAN(0.3), 'bx-bass', 0, this.tone(c0, 26, 0), 0.42, b.beats * b.spb * 0.95);
        break;
      }
      case 'antiphon': {
        // the twin knights: two brass choirs, left then right, calling and answering
        const left = f.i % 2 === 0;
        for (const [beat, ch] of [[0, left ? 'bx-left' : 'bx-right'], [0.5, left ? 'bx-left' : 'bx-right'], [2, left ? 'bx-right' : 'bx-left'], [2.5, left ? 'bx-right' : 'bx-left']] as [number, string][]) {
          const c = this.cAt(f, beat);
          for (const m of [this.tone(c, 50, 0), this.tone(c, 50, 1), this.tone(c, 50, 2)]) b.p.buf('brass', ch, this.T(b, beat, 0.002), m, beat % 1 ? 0.3 : 0.4, 0.4 * b.spb, { release: 0.15 });
        }
        break;
      }
      case 'blot': {
        // the Great Blot: the meadow's reel turned fierce — fiddle doubles, a bodhrán drive
        this.drum(b, 'tom', 'bx-perc', 'x.ox.ox.x.ox.oxo', 0.32, 50);
        if (ph >= 2) this.ostinato(b, f, FIDDLE(), 'bx-lead2', 62, 79, [0, 2, 1, 2, 3, 2, 1, 2], 0.22, 0.45, [0, 4]);
        break;
      }
      case 'scarab': {
        // the Scarab: the qanun's tremolo and the riq's jingles; zills on the phrase ends
        this.drum(b, 'tamb', 'bx-perc', 'x.xxx.x.x.xxx.xx', 0.22);
        if (f.i % 2 === 1) this.drum(b, 'anvil', 'bx-colour', '............x.x.', 0.12, 91);
        break;
      }
      case 'moth': {
        // the Moth Queen: wings of glass beating in sixteenths high above
        this.ostinato(b, f, 'glass', 'bx-colour', 79, 96, [0, 2, 1, 3, 2, 4, 3, 5, 4, 3, 2, 1, 2, 1, 0, 1], ph >= 2 ? 0.16 : 0.12, 0.25);
        break;
      }
      case 'golem': {
        // the Golem: the forge's taiko army and its anvil choir; the ground shakes on 1
        b.p.hit('taiko', 'bx-perc', this.T(b, 0, 0.001), 0.5, 31);
        this.drum(b, 'anvil', 'bx-colour', 'x...x...x...x.x.', 0.14, 84);
        if (ph >= 2) this.roll(b, 'taiko', 'bx-perc', 3, 4, 4, 0.2, 0.42, 36);
        break;
      }
      case 'silence': {
        // the Silence: a bell that tolls the downbeat, and a hush before every phrase
        this.play(b, 'tbell', 'bx-colour', 0, this.tone(c0, 50, 0), 0.34, 3 * b.spb, 1.5, 0.001);
        if (ph >= 2) this.play(b, 'gong', 'bx-perc', 0, 60, f.i % 4 === 0 ? 0.3 : 0, 3);
        break;
      }
      case 'serpent': {
        // the firefly serpent: fireflies glinting on the off-sixteenths, everywhere in the stereo
        for (const k of [1, 6, 11, 14]) {
          const tones = chordTones(this.cAt(f, k * 0.25), 88, 98);
          if (tones.length) b.p.buf('glass', k % 2 ? 'bx-left' : 'bx-right', this.T(b, k * 0.25, 0.002), tones[(k + f.i) % tones.length], 0.14, 0.6);
        }
        break;
      }
      case 'djinn': {
        // the Djinn: brass swells rising out of the sand, mirage hands of glass
        if (f.i % 2 === 0) this.chords(b, f, 'bx-dj', { ...LOWBRASS(0.6), attack: 1.5 * b.spb, release: 0.5 }, 'bx-brass', 50, 65, 3, 0.36, 0.2);
        this.ostinato(b, f, 'glass', 'bx-right', 81, 96, [0, -1, 2, -1, 1, -1, 3, -1, 2, -1, 0, -1, 1, -1, 3, -1], 0.14, 0.6);
        break;
      }
      case 'aurora': {
        // the Aurora Dragon: the sky's colour shifting — slow glass-harmonica swells and a high choir
        this.chords(b, f, 'bx-au', GLASSHARM(), 'bx-left', 72, 86, 3, 0.2, 0.5);
        if (ph >= 2) this.chords(b, f, 'bx-au2', 'choiroo', 'bx-right', 67, 79, 2, 0.14, 0.5);
        break;
      }
      case 'phoenix': {
        // the Black Phoenix: wingbeats of brass in triplets; reborn (phase 3), the bells ring out
        if (ph < 3) for (const beat of [0, 1 / 3, 2 / 3]) this.play(b, 'brass', 'bx-brass', beat, this.tone(this.cAt(f, beat), 48, beat === 0 ? 0 : 2), 0.32, 0.25 * b.spb, undefined, 0.002);
        else for (let k = 0; k < 8; k++) {
          const tones = chordTones(this.cAt(f, k * 0.5), 72, 91);
          if (tones.length) this.play(b, 'tbell', 'bx-colour', k * 0.5, tones[(k * 2) % tones.length] - 12, 0.18, 1.2, 0.8, 0.002);
        }
        break;
      }
      case 'abyss': {
        // the Abyss King: the whole orchestra; the organ's pedal under everything, a gong per phrase
        this.play(b, ORGAN(0.3), 'bx-bass', 0, this.tone(c0, 26, 0), 0.36, b.beats * b.spb * 0.95);
        if (f.i % 4 === 0) this.play(b, 'gong', 'bx-perc', 0, 60, 0.32, 4);
        if (ph >= 2) this.ostinato(b, f, 'spicc', 'bx-left', 50, 67, [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 0, 1, 2, 3], 0.22, 0.25);
        break;
      }
    }
  }
}

/** every boss's score, made on demand (one per host song) */
export function makeBossScore(kind: EnemyKind): BossScore | null {
  const s = bossSpec(kind);
  return s ? new BossScore(kind, s) : null;
}

export const BOSS_KINDS = Object.keys(BOSSES) as EnemyKind[];
