/**
 * The bosses (v5, docs/DESIGN-v5.md): every boss fight is a DUEL ON THE BEAT.
 *
 * A boss winds up a blow (a tell bar: red marks close in on the baton on its count-in, or — for the
 * singers and the legends — it plays the rhythm of its blows a bar ahead, a call the player answers)
 * and the blows land on the beat grid of the next bar. The player parries by tapping the landing
 * beat (baton, empty ground or the boss itself): perfect reflects the blow (damage, a stagger), good
 * blocks it; missed, it lands (lives, a stunned musician, the power drops) — but a full power meter
 * wraps the colossus in a golden shield of sound that soaks up much of it.
 *
 * The simulation schedules every attack on the grid (deterministic); the controller judges the
 * taps and records the parries (`Journey.parry`). This module is pure data and helpers.
 */
import type { EnemyKind, WorldId } from './defs';
import type { TapQuality } from './rhythm';

export type BossAbility = 'echo' | 'burrow' | 'mirage' | 'mute' | 'stone' | 'rebirth' | 'twin';

export interface BossSpec {
  /** proper names (pt / en) */
  name: { pt: string; en: string };
  /**
   * The attack patterns of each phase. One attack = one bar of blows: the eighth notes (0…7) of the
   * bar its blows land on. A phase cycles through its attacks.
   */
  phases: number[][][];
  /** the hp fractions where the next phase begins (one fewer than phases) */
  at: number[];
  /** bars of rest between the end of one attack and the next tell */
  rest: number;
  /** count: red marks on the beats before; call: it plays its rhythm a bar ahead (answer it) */
  tell: 'count' | 'call';
  /** lives a blow takes (before the shield) */
  blow: number;
  ability?: BossAbility;
}

export const DUEL = {
  /** bars of entrance before the first tell (a legend takes longer to arrive) */
  entrance: 2,
  legendEntrance: 3,
  /** the black phoenix: at its last phase it burns down and is reborn with this share of its health, immune meanwhile (seconds) */
  rebirthHp: 0.6,
  rebirthTime: 3.4,
  /** a blow resolves (lands for real) this long after its beat if it was not parried: beats */
  resolveBeats: 1,
  /** a perfect parry reflects: boss damage = maxHp × reflect (× (1 + power/100)) */
  reflect: { mini: 0.03, guardian: 0.018, legend: 0.014 },
  /** the golden shield of sound absorbs up to this share of an unparried blow (at full power) */
  shield: 0.75,
  /** an unparried blow silences the musician nearest to the boss for this many bars */
  stunBars: 2,
  /** the power meter drops this much when a blow lands */
  powerHit: 12,
  /** the parry window widens a little with the combo: + perCombo × combo, up to max (seconds) */
  windowPerCombo: 0.002,
  windowMax: 0.04,
};

const E = (o: number[]) => o;
/** a plain count-in pattern set (single → double → triple) */
const SINGLE = [E([0]), E([4])];
const DOUBLE = [E([0, 4]), E([2, 6])];
const TRIPLE = [E([0, 2, 4]), E([0, 4, 6])];

export const BOSSES: Partial<Record<EnemyKind, BossSpec>> = {
  // ── the meadow ──
  toad: { name: { pt: 'Sapo-Borrão', en: 'Blot Toad' }, phases: [SINGLE, [E([0]), E([0, 4])]], at: [0.5], rest: 2, tell: 'count', blow: 1 },
  drumBeetle: { name: { pt: 'Besouro-Bumbo', en: 'Bass-Drum Beetle' }, phases: [DOUBLE, [E([0, 4]), E([0, 2, 4])]], at: [0.5], rest: 1, tell: 'count', blow: 1 },
  crow: { name: { pt: 'Corvo-Cinza', en: 'Grey Crow' }, phases: [[E([0, 4]), E([2])], [E([0, 3]), E([1, 4])]], at: [0.5], rest: 1, tell: 'count', blow: 1 },
  bossBlot: { name: { pt: 'O Grande Borrão', en: 'The Great Blot' }, phases: [SINGLE, DOUBLE, TRIPLE], at: [0.66, 0.33], rest: 2, tell: 'count', blow: 1 },
  wyrm: { name: { pt: 'Serpente-Vagalume', en: 'Firefly Wyrm' }, phases: [[E([0, 2, 4])], [E([0, 3, 4]), E([1, 2, 5])], [E([0, 1, 3, 4]), E([0, 3, 5, 6])]], at: [0.66, 0.33], rest: 1, tell: 'call', blow: 3 },
  // ── the dunes ──
  sandworm: { name: { pt: 'Verme-das-Dunas', en: 'Dune Worm' }, phases: [DOUBLE, [E([0, 3]), E([0, 4, 6])]], at: [0.5], rest: 1, tell: 'count', blow: 1, ability: 'burrow' },
  croc: { name: { pt: 'Crocodilo-Miragem', en: 'Mirage Croc' }, phases: [[E([0, 4]), E([1, 4])], [E([0, 3, 4]), E([1, 5])]], at: [0.5], rest: 1, tell: 'count', blow: 1, ability: 'mirage' },
  sphinx: { name: { pt: 'Esfinge Muda', en: 'Silent Sphinx' }, phases: [[E([0, 3]), E([1, 4])], [E([0, 3, 6]), E([1, 3, 5])]], at: [0.5], rest: 1, tell: 'call', blow: 1, ability: 'mute' },
  bossScarab: { name: { pt: 'O Escaravelho', en: 'The Scarab' }, phases: [DOUBLE, [E([0, 3, 4]), E([1, 4, 6])], [E([0, 1, 4, 5]), E([0, 3, 4, 7])]], at: [0.66, 0.33], rest: 1, tell: 'count', blow: 2 },
  djinn: { name: { pt: 'Gênio da Miragem', en: 'Mirage Djinn' }, phases: [[E([0, 3, 4])], [E([0, 3, 5]), E([1, 2, 6])], [E([0, 1, 3, 6]), E([1, 3, 4, 7])]], at: [0.66, 0.33], rest: 1, tell: 'call', blow: 3, ability: 'mirage' },
  // ── the peaks ──
  yeti: { name: { pt: 'Yeti-Eco', en: 'Echo Yeti' }, phases: [[E([0]), E([4])], [E([0, 4]), E([2])]], at: [0.5], rest: 1, tell: 'count', blow: 1, ability: 'echo' },
  siren: { name: { pt: 'Sereia de Gelo', en: 'Ice Siren' }, phases: [[E([0, 2, 3]), E([0, 3, 4])], [E([0, 1, 3, 4]), E([1, 3, 5])]], at: [0.5], rest: 1, tell: 'call', blow: 1 },
  stag: { name: { pt: 'Cervo-Espelho', en: 'Mirror Stag' }, phases: [[E([0, 6]), E([2, 4])], [E([0, 3, 4, 7]), E([1, 2, 5, 6])]], at: [0.5], rest: 1, tell: 'count', blow: 1 },
  bossMoth: { name: { pt: 'A Mariposa-Rainha', en: 'The Moth Queen' }, phases: [DOUBLE, [E([0, 3]), E([1, 4, 6])], [E([0, 3, 4, 6]), E([1, 3, 5, 7])]], at: [0.66, 0.33], rest: 1, tell: 'count', blow: 2 },
  aurora: { name: { pt: 'Dragão da Aurora', en: 'Aurora Dragon' }, phases: [[E([0, 2, 5])], [E([0, 3, 5, 6]), E([1, 2, 4, 7])], [E([0, 1, 3, 5, 6]), E([0, 2, 3, 5, 7])]], at: [0.66, 0.33], rest: 1, tell: 'call', blow: 3 },
  // ── the forge ──
  salamander: { name: { pt: 'Salamandra', en: 'Salamander' }, phases: [[E([0, 1, 2]), E([4, 5, 6])], [E([0, 1, 2, 4]), E([2, 3, 4, 6])]], at: [0.5], rest: 1, tell: 'count', blow: 1 },
  magmaCrab: { name: { pt: 'Caranguejo-de-Magma', en: 'Magma Crab' }, phases: [[E([0, 1]), E([4, 5])], [E([0, 1, 4, 5]), E([2, 3, 6])]], at: [0.5], rest: 1, tell: 'count', blow: 2 },
  smith: { name: { pt: 'Ferreiro Sombrio', en: 'Shadow Smith' }, phases: [[E([0, 2, 4, 6])], [E([0, 2, 3, 4, 6]), E([0, 1, 2, 4, 6])]], at: [0.5], rest: 1, tell: 'count', blow: 1 },
  bossGolem: { name: { pt: 'O Golem da Forja', en: 'The Forge Golem' }, phases: [[E([0, 4])], [E([0, 2, 4]), E([0, 3, 4])], [E([0, 2, 4, 6]), E([0, 1, 4, 5])]], at: [0.66, 0.33], rest: 1, tell: 'count', blow: 2 },
  phoenix: { name: { pt: 'Fênix Negra', en: 'Black Phoenix' }, phases: [[E([0, 3, 4])], [E([0, 1, 3, 4, 6])], [E([0, 1, 2, 4, 5, 6]), E([0, 2, 3, 5, 6, 7])]], at: [0.66, 0.33], rest: 1, tell: 'call', blow: 3, ability: 'rebirth' },
  // ── the citadel ──
  gargoyle: { name: { pt: 'Gárgula', en: 'Gargoyle' }, phases: [[E([0, 4]), E([0, 6])], [E([0, 3, 4]), E([0, 4, 7])]], at: [0.5], rest: 1, tell: 'count', blow: 1, ability: 'stone' },
  organist: { name: { pt: 'Organista Fantasma', en: 'Phantom Organist' }, phases: [[E([0, 3, 6]), E([1, 4, 6])], [E([0, 2, 3, 5, 6]), E([1, 3, 4, 6, 7])]], at: [0.5], rest: 1, tell: 'call', blow: 1 },
  twin: { name: { pt: 'Cavaleiros Gêmeos', en: 'Twin Knights' }, phases: [[E([0]), E([4])], [E([0, 4]), E([2, 6])]], at: [0.5], rest: 0, tell: 'count', blow: 1, ability: 'twin' },
  silence: { name: { pt: 'O Silêncio', en: 'The Silence' }, phases: [[E([0, 4]), E([0, 3])], [E([0, 3, 4]), E([1, 4, 6])], [E([0, 1, 3, 4, 6]), E([0, 2, 3, 5, 6])]], at: [0.66, 0.33], rest: 1, tell: 'call', blow: 2 },
  abyssKing: { name: { pt: 'Rei do Abismo', en: 'Abyss King' }, phases: [[E([0, 3, 4]), E([0, 2, 5])], [E([0, 1, 3, 4, 6]), E([0, 2, 3, 5, 7])], [E([0, 1, 2, 3, 4, 6]), E([0, 1, 3, 4, 5, 7]), E([1, 2, 3, 5, 6, 7])]], at: [0.66, 0.33], rest: 0, tell: 'call', blow: 3 },
};

/** the mini-boss at the end of every main level (near the bell) */
export const END_BOSS: Record<string, EnemyKind> = {
  m1: 'toad', m2: 'drumBeetle', m3: 'crow',
  d1: 'sandworm', d2: 'croc', d3: 'sphinx',
  i1: 'yeti', i2: 'siren', i3: 'stag',
  f1: 'salamander', f2: 'magmaCrab', f3: 'smith',
  c1: 'gargoyle', c2: 'organist', c3: 'twin',
  // the legends of the secret paths
  mx: 'wyrm', dx: 'djinn', ix: 'aurora', fx: 'phoenix', cx: 'abyssKing',
};

/** the land's mini-bosses that return mid-fight in its guardian level (2nd and 3rd movement) */
export const MID_BOSSES: Record<WorldId, [EnemyKind, EnemyKind]> = {
  meadow: ['toad', 'crow'],
  desert: ['sandworm', 'sphinx'],
  ice: ['yeti', 'siren'],
  forge: ['salamander', 'smith'],
  citadel: ['gargoyle', 'organist'],
};

/** what kind of boss it is (for the reflect damage and the HUD) */
export function bossClass(d: { mini?: boolean; legend?: boolean }): 'mini' | 'guardian' | 'legend' {
  return d.legend ? 'legend' : d.mini ? 'mini' : 'guardian';
}

/** a parry's quality: the beat's windows, a little wider with a long combo */
export function parryQuality(delta: number, combo: number): TapQuality | null {
  const extra = Math.min(DUEL.windowMax, combo * DUEL.windowPerCombo);
  const d = Math.abs(delta);
  if (d <= 0.06 + extra * 0.5) return 'perfect';
  if (d <= 0.12 + extra) return 'good';
  return d <= 0.3 ? 'miss' : null;
}

/** how much of an unparried blow the shield of sound soaks up at a power (0…100) */
export function shieldOf(power: number): number {
  return DUEL.shield * Math.max(0, Math.min(100, power)) / 100;
}
