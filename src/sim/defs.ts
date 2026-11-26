/**
 * Shared identifiers and gameplay numbers of FORTÍSSIMO.
 * Pure data: imported by the simulation, the 3D view, the UI and the audio engine.
 */

export type WorldId = 'meadow' | 'desert' | 'ice' | 'forge' | 'citadel';
export const WORLDS: WorldId[] = ['meadow', 'desert', 'ice', 'forge', 'citadel'];

export type TowerKind = 'harp' | 'drum' | 'bell' | 'crystal' | 'horn' | 'bass' | 'choir' | 'shaker';
export const TOWER_KINDS: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];

export type EnemyKind =
  | 'blot' | 'blotling' | 'scurry' | 'shell' | 'moth' | 'shield' | 'bubble' | 'phantom' | 'muffler' | 'mender' | 'obelisk'
  // v2 bestiary (see docs/DESIGN-v2.md §3): dunes, peaks, forge, citadel families
  | 'scorpion' | 'whirl' | 'echo' | 'wolf' | 'ember' | 'slug' | 'mimic' | 'knight' | 'conductor'
  | 'bossBlot' | 'bossScarab' | 'bossMoth' | 'bossGolem' | 'silence'
  // v5 mini-bosses (one at the end of every main level, near the bell; they return mid-fight in the
  // land's guardian level) — see docs/DESIGN-v5.md
  | 'toad' | 'drumBeetle' | 'crow'
  | 'sandworm' | 'croc' | 'sphinx'
  | 'yeti' | 'siren' | 'stag'
  | 'salamander' | 'magmaCrab' | 'smith'
  | 'gargoyle' | 'organist' | 'twin'
  // v5 legends: the bosses of the secret/extra paths
  | 'wyrm' | 'djinn' | 'aurora' | 'phoenix' | 'abyssKing';

/** Battle songs and other music. Every battle song is in 4/4. */
export type SongId =
  | 'menu' | 'map'
  | 'meadow' | 'desert' | 'ice' | 'forge' | 'citadel' | 'boss' | 'finale'
  | 'ending' | 'credits';

export interface SongInfo {
  bpm: number;
  beatsPerBar: number;
}

/** Tempi are part of the game balance (towers fire on 16th-note steps of the song). */
export const SONGS: Record<SongId, SongInfo> = {
  menu: { bpm: 92, beatsPerBar: 4 },
  map: { bpm: 100, beatsPerBar: 4 },
  meadow: { bpm: 100, beatsPerBar: 4 },
  desert: { bpm: 104, beatsPerBar: 4 },
  ice: { bpm: 96, beatsPerBar: 4 },
  forge: { bpm: 112, beatsPerBar: 4 },
  citadel: { bpm: 116, beatsPerBar: 4 },
  boss: { bpm: 112, beatsPerBar: 4 },
  finale: { bpm: 120, beatsPerBar: 4 },
  ending: { bpm: 84, beatsPerBar: 4 },
  credits: { bpm: 104, beatsPerBar: 4 },
};

export const STEPS_PER_BEAT = 4; // towers think in 16th notes

// ───────────────────────────── the band (v2) ─────────────────────────────
// Every instrument belongs to a section of the orchestra. More distinct sections on the shell =
// more harmony (richer music, stronger band); some neighbours form duets. See docs/DESIGN-v2.md §1.

export type Section = 'strings' | 'percussion' | 'bells' | 'brass' | 'voices' | 'low';

export const SECTIONS: Section[] = ['strings', 'percussion', 'bells', 'brass', 'voices', 'low'];

export const SECTION_OF: Record<TowerKind, Section> = {
  harp: 'strings',
  drum: 'percussion',
  shaker: 'percussion',
  bell: 'bells',
  crystal: 'bells',
  horn: 'brass',
  choir: 'voices',
  bass: 'low',
};

export type DuetId = 'march' | 'groundwork' | 'shimmer' | 'fanfare' | 'hymn' | 'serenade' | 'groove' | 'thunder';

export interface DuetDef {
  id: DuetId;
  /** the two instruments (order does not matter) that form it on adjacent plates */
  a: TowerKind;
  b: TowerKind;
  /** ribbon / flourish colour */
  color: string;
}

export const DUETS: DuetDef[] = [
  { id: 'march', a: 'harp', b: 'drum', color: '#ffd36b' },
  { id: 'groundwork', a: 'drum', b: 'bass', color: '#ff8a5a' },
  { id: 'shimmer', a: 'bell', b: 'crystal', color: '#9fe8ff' },
  { id: 'fanfare', a: 'horn', b: 'drum', color: '#ffb84a' },
  { id: 'hymn', a: 'choir', b: 'bell', color: '#ffd9f0' },
  { id: 'serenade', a: 'harp', b: 'choir', color: '#ff9ec7' },
  { id: 'groove', a: 'shaker', b: 'drum', color: '#c8f07a' },
  { id: 'thunder', a: 'crystal', b: 'bass', color: '#c9a0ff' },
];

/** What the band on the shell sounds like right now (shared by the sim, the HUD, the view and audio). */
export interface BandState {
  /** how many towers of each section are playing (muted/disabled towers do not count) */
  sections: Record<Section, number>;
  /** distinct sections − 1 (0…5) */
  harmony: number;
  /** active duets between two towers (tower ids) */
  duets: { id: DuetId; a: number; b: number }[];
}
export const STEPS_PER_BAR = 16;

/** Harmony and duet numbers (tuned with tools/balance.ts). */
export const BAND = {
  /** every tower's damage × (1 + harmonyStep × harmony) */
  harmonyStep: 0.12,
  /** march: each drum hit makes its harp partners pluck one extra note */
  marchShots: 1,
  /** groundwork: drum blasts / bass drops make ground creatures stumble (stop) for this many beats */
  stumbleBeats: 0.5,
  stumbleBassBeats: 1,
  stumbleBassArea: 2.6,
  /** shimmer: crystal chains jump farther, one more time, and chill what they touch */
  shimmerJump: 7.5,
  shimmerExtraChain: 1,
  shimmerSlow: 0.7,
  shimmerSlowBeats: 2,
  /** fanfare: horn waves wider and stronger */
  fanfareWidth: 1.1,
  fanfareDamage: 1.35,
  /** hymn: reveal reaches farther; the colossus heals 1 life every `hymnEvery` bars (at most `hymnCap` per journey) */
  hymnReveal: 6,
  hymnEvery: 6,
  hymnCap: 5,
  /** serenade: harp notes become chords */
  serenadeDamage: 1.3,
  serenadeSplash: 0.45,
  serenadeRadius: 1.8,
  /** groove: shaker notes per bar × this */
  grooveIncome: 1.5,
  /** thunder: every bass drop also fires a chain of the crystal partner (its damage × this) */
  thunderDamage: 2.2,
};

/** The duet a pair of instruments forms, if any. */
export function duetOf(a: TowerKind, b: TowerKind): DuetDef | null {
  for (const d of DUETS) if ((d.a === a && d.b === b) || (d.a === b && d.b === a)) return d;
  return null;
}

export function emptySections(): Record<Section, number> {
  return { strings: 0, percussion: 0, bells: 0, brass: 0, voices: 0, low: 0 };
}

// ───────────────────────────── towers ─────────────────────────────

export type DamageType = 'pluck' | 'blast' | 'sonic' | 'arc' | 'bass' | 'bell';

export interface TowerLevel {
  /** price to build (level 0) or to upgrade into this level */
  cost: number;
  /** fire pattern over one or two bars of 16th notes ('x' fires, '.' rests) */
  pattern: string;
  range: number;
  damage: number;
  /** splash radius (drum), chain jumps (crystal), pierce width (horn) */
  area?: number;
  chain?: number;
  /** slow factor applied (bell) and its duration in beats */
  slow?: number;
  slowBeats?: number;
  /** support: damage multiplier given to towers in range (choir) */
  buff?: number;
  /** economy: coins produced per bar (shaker) */
  income?: number;
  /** flight time of the projectile in 16th steps (impacts also land on the grid) */
  flight: number;
}

export interface TowerDef {
  kind: TowerKind;
  damageType: DamageType;
  hitsAir: boolean;
  hitsGround: boolean;
  /** sees camouflaged enemies by itself */
  detects?: boolean;
  levels: [TowerLevel, TowerLevel, TowerLevel];
  /** colour used for range rings, icons and particles */
  color: string;
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  harp: {
    kind: 'harp', damageType: 'pluck', hitsAir: true, hitsGround: true, color: '#ffd36b',
    levels: [
      { cost: 70, pattern: 'x...x...x...x...', range: 10, damage: 9, flight: 2 },
      { cost: 80, pattern: 'x.x.x...x.x.x...', range: 11, damage: 11, flight: 2 },
      { cost: 140, pattern: 'x.x.x.x.x.x.x.x.', range: 12, damage: 14, flight: 2 },
    ],
  },
  drum: {
    kind: 'drum', damageType: 'blast', hitsAir: false, hitsGround: true, color: '#ff8a4c',
    levels: [
      { cost: 110, pattern: 'x.......x.......', range: 10, damage: 26, area: 2.6, flight: 4 },
      { cost: 110, pattern: 'x.......x.....x.', range: 10.5, damage: 34, area: 2.9, flight: 4 },
      { cost: 190, pattern: 'x.....x.x.....x.', range: 11.5, damage: 44, area: 3.2, flight: 4 },
    ],
  },
  bell: {
    kind: 'bell', damageType: 'bell', hitsAir: true, hitsGround: true, detects: true, color: '#8fd8ff',
    levels: [
      { cost: 90, pattern: 'x.......x.......', range: 10, damage: 3, slow: 0.6, slowBeats: 3, flight: 0 },
      { cost: 90, pattern: 'x.......x.......', range: 11, damage: 5, slow: 0.55, slowBeats: 4, flight: 0 },
      { cost: 150, pattern: 'x...x...x...x...', range: 12, damage: 6, slow: 0.5, slowBeats: 4, flight: 0 },
    ],
  },
  shaker: {
    kind: 'shaker', damageType: 'pluck', hitsAir: false, hitsGround: false, color: '#ffe066',
    levels: [
      { cost: 60, pattern: '..x...x...x...x.', range: 0, damage: 0, income: 3, flight: 0 },
      { cost: 90, pattern: '..x.x.x...x.x.x.', range: 0, damage: 0, income: 5, flight: 0 },
      { cost: 140, pattern: '..xxx.x...xxx.x.', range: 0, damage: 0, income: 8, flight: 0 },
    ],
  },
  crystal: {
    kind: 'crystal', damageType: 'arc', hitsAir: true, hitsGround: true, color: '#c58bff',
    levels: [
      { cost: 130, pattern: 'x.x.............', range: 9.5, damage: 16, chain: 3, flight: 1 },
      { cost: 120, pattern: 'x.x.....x.x.....', range: 10, damage: 18, chain: 4, flight: 1 },
      { cost: 200, pattern: 'x.x.x...x.x.x...', range: 11, damage: 22, chain: 5, flight: 1 },
    ],
  },
  horn: {
    kind: 'horn', damageType: 'sonic', hitsAir: false, hitsGround: true, color: '#ffb347',
    levels: [
      { cost: 150, pattern: 'x...............................', range: 16, damage: 70, area: 1.4, flight: 1 },
      { cost: 140, pattern: 'x...............x...............', range: 17, damage: 80, area: 1.6, flight: 1 },
      { cost: 230, pattern: 'x.......x.......x.......x.......', range: 18, damage: 92, area: 1.8, flight: 1 },
    ],
  },
  choir: {
    kind: 'choir', damageType: 'bell', hitsAir: false, hitsGround: false, detects: true, color: '#ffe9b8',
    levels: [
      { cost: 120, pattern: 'x...............', range: 4.2, damage: 0, buff: 1.25, flight: 0 },
      { cost: 120, pattern: 'x...............', range: 5.2, damage: 0, buff: 1.4, flight: 0 },
      { cost: 200, pattern: 'x.......x.......', range: 6.4, damage: 0, buff: 1.6, flight: 0 },
    ],
  },
  bass: {
    kind: 'bass', damageType: 'bass', hitsAir: false, hitsGround: true, color: '#9b6bff',
    levels: [
      { cost: 200, pattern: 'x...............................', range: 18, damage: 240, flight: 4 },
      { cost: 180, pattern: 'x...............x...............', range: 19, damage: 260, flight: 4 },
      { cost: 300, pattern: 'x...............x.......x.......', range: 20, damage: 320, flight: 4 },
    ],
  },
};

/** Fraction of everything spent on a tower given back when it is sold. */
export const SELL_REFUND = 0.7;

// ───────────────────────────── enemies ─────────────────────────────

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  /** tiles per second */
  speed: number;
  /** 0..0.9: fraction of pluck/blast/arc/sonic damage ignored (bass and bell ignore armour) */
  armor: number;
  flying: boolean;
  /** coins dropped */
  bounty: number;
  /** lives lost if it reaches the Heart */
  lives: number;
  /** body radius in tiles (also the hit radius) */
  radius: number;
  /** hidden from towers unless revealed (bell / choir) */
  camo?: boolean;
  /** absorbs this much damage first and shields neighbours */
  shield?: number;
  /** on death, splits into children */
  split?: { kind: EnemyKind; count: number };
  /** silences towers within this radius while alive */
  mute?: number;
  /** heals neighbours by this much per bar */
  heal?: number;
  boss?: boolean;
  /** v5: a mini-boss (end of a main level; returns mid-fight in the guardian level) */
  mini?: boolean;
  /** v5: a legend (the boss of a secret/extra path) */
  legend?: boolean;
  /** relative difficulty for the wave generator / balance tool */
  threat: number;
  // ── v2 abilities (optional; implemented by the simulation) ──
  /** single-target shots (harp plucks, horn waves) pass through it: only area, chains, bells and drops hurt */
  deflect?: boolean;
  /** comes back once, this fraction of its hp, one bar after dying */
  echo?: number;
  /** hides underground (untargetable) for `for` bars out of every `every` bars */
  burrow?: { every: number; for: number };
  /** travels in packs (the wave generator spawns it in groups) */
  pack?: boolean;
  /** when it reaches the colossus it also silences the nearest tower for this many bars */
  disable?: number;
  /** copies the most common instrument on the shell and mutes every tower of that kind while alive */
  mimic?: boolean;
  /** bells cannot slow it */
  steady?: boolean;
  /** creatures within `radius` move `speed`× faster (on the downbeat for a conductor) */
  aura?: { radius: number; speed: number };
}

// threat ≈ hp/34 × (speed + 0.7)/2.8 × armour/abilities: the work it takes to stop one, in Borrões
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  // meadow: sounds of the fields
  blot: { kind: 'blot', hp: 34, speed: 2.1, armor: 0, flying: false, bounty: 5, lives: 1, radius: 0.7, threat: 1 },
  blotling: { kind: 'blotling', hp: 14, speed: 2.7, armor: 0, flying: false, bounty: 1, lives: 1, radius: 0.5, threat: 0.5 },
  scurry: { kind: 'scurry', hp: 22, speed: 3.5, armor: 0, flying: false, bounty: 4, lives: 1, radius: 0.6, pack: true, threat: 1.1 },
  bubble: { kind: 'bubble', hp: 95, speed: 1.7, armor: 0, flying: false, bounty: 9, lives: 2, radius: 1.0, split: { kind: 'blotling', count: 4 }, threat: 4 },
  moth: { kind: 'moth', hp: 42, speed: 2.6, armor: 0, flying: true, bounty: 7, lives: 1, radius: 0.75, threat: 2.1 },
  // dunes: echoes
  scorpion: { kind: 'scorpion', hp: 120, speed: 1.8, armor: 0.45, flying: false, bounty: 17, lives: 2, radius: 0.9, burrow: { every: 4, for: 1 }, threat: 5.5 },
  whirl: { kind: 'whirl', hp: 85, speed: 2.3, armor: 0, flying: false, bounty: 11, lives: 1, radius: 0.85, deflect: true, aura: { radius: 3.6, speed: 1.3 }, threat: 3.5 },
  echo: { kind: 'echo', hp: 64, speed: 2.2, armor: 0, flying: false, bounty: 6, lives: 1, radius: 0.75, echo: 0.5, threat: 2.9 },
  obelisk: { kind: 'obelisk', hp: 320, speed: 0, armor: 0.2, flying: false, bounty: 30, lives: 0, radius: 1.2, mute: 11, threat: 0 },
  // peaks: cold
  wolf: { kind: 'wolf', hp: 30, speed: 3.8, armor: 0, flying: false, bounty: 5, lives: 1, radius: 0.7, pack: true, threat: 1.6 },
  shell: { kind: 'shell', hp: 150, speed: 1.35, armor: 0.5, flying: false, bounty: 16, lives: 2, radius: 0.95, threat: 5 },
  phantom: { kind: 'phantom', hp: 60, speed: 2.4, armor: 0, flying: false, bounty: 9, lives: 1, radius: 0.7, camo: true, threat: 2.7 },
  muffler: { kind: 'muffler', hp: 110, speed: 1.6, armor: 0.2, flying: false, bounty: 15, lives: 2, radius: 0.9, mute: 7.5, threat: 4.6 },
  // forge: fire
  ember: { kind: 'ember', hp: 26, speed: 3.1, armor: 0, flying: true, bounty: 5, lives: 1, radius: 0.6, pack: true, threat: 1.6 },
  slug: { kind: 'slug', hp: 520, speed: 0.95, armor: 0.25, flying: false, bounty: 40, lives: 3, radius: 1.3, disable: 4, threat: 13 },
  shield: { kind: 'shield', hp: 70, speed: 1.8, armor: 0.1, flying: false, bounty: 13, lives: 1, radius: 0.8, shield: 70, threat: 3.9 },
  mender: { kind: 'mender', hp: 80, speed: 1.8, armor: 0, flying: false, bounty: 11, lives: 1, radius: 0.8, heal: 14, threat: 3.2 },
  // citadel: the silence itself
  mimic: { kind: 'mimic', hp: 150, speed: 1.9, armor: 0.1, flying: false, bounty: 20, lives: 2, radius: 0.85, mimic: true, threat: 6 },
  knight: { kind: 'knight', hp: 280, speed: 1.35, armor: 0.6, flying: false, bounty: 40, lives: 2, radius: 1.0, shield: 80, steady: true, threat: 13 },
  conductor: { kind: 'conductor', hp: 420, speed: 1.4, armor: 0.2, flying: false, bounty: 52, lives: 3, radius: 1.0, aura: { radius: 7, speed: 1.9 }, steady: true, threat: 16 },
  // guardians
  bossBlot: { kind: 'bossBlot', hp: 2400, speed: 0.95, armor: 0.1, flying: false, bounty: 150, lives: 10, radius: 2.1, boss: true, threat: 40 },
  bossScarab: { kind: 'bossScarab', hp: 4200, speed: 1.05, armor: 0.45, flying: false, bounty: 200, lives: 10, radius: 2.2, boss: true, threat: 60 },
  bossMoth: { kind: 'bossMoth', hp: 4600, speed: 1.2, armor: 0.1, flying: true, bounty: 220, lives: 10, radius: 2.3, boss: true, threat: 70 },
  bossGolem: { kind: 'bossGolem', hp: 9000, speed: 0.8, armor: 0.55, flying: false, bounty: 300, lives: 15, radius: 2.6, boss: true, threat: 100 },
  silence: { kind: 'silence', hp: 17000, speed: 0.7, armor: 0.3, flying: false, bounty: 0, lives: 20, radius: 3.0, boss: true, threat: 160 },
  // v5 placeholders (the gameplay agent tunes hp/speed/armour and implements the attacks)
  toad: { kind: 'toad', hp: 1400, speed: 0.9, armor: 0, flying: false, bounty: 80, lives: 5, radius: 1.6, boss: true, mini: true, threat: 25 },
  drumBeetle: { kind: 'drumBeetle', hp: 1800, speed: 0.85, armor: 0.3, flying: false, bounty: 90, lives: 5, radius: 1.6, boss: true, mini: true, threat: 28 },
  crow: { kind: 'crow', hp: 1600, speed: 1.2, armor: 0, flying: true, bounty: 90, lives: 5, radius: 1.5, boss: true, mini: true, threat: 30 },
  sandworm: { kind: 'sandworm', hp: 2600, speed: 0.9, armor: 0.2, flying: false, bounty: 110, lives: 6, radius: 1.8, boss: true, mini: true, threat: 36 },
  croc: { kind: 'croc', hp: 3000, speed: 0.85, armor: 0.35, flying: false, bounty: 120, lives: 6, radius: 1.8, boss: true, mini: true, threat: 40 },
  sphinx: { kind: 'sphinx', hp: 3300, speed: 0.75, armor: 0.4, flying: false, bounty: 130, lives: 6, radius: 2.0, boss: true, mini: true, threat: 44 },
  yeti: { kind: 'yeti', hp: 3800, speed: 0.9, armor: 0.25, flying: false, bounty: 140, lives: 7, radius: 1.9, boss: true, mini: true, threat: 50 },
  siren: { kind: 'siren', hp: 3600, speed: 1.0, armor: 0.1, flying: true, bounty: 140, lives: 7, radius: 1.7, boss: true, mini: true, threat: 52 },
  stag: { kind: 'stag', hp: 4200, speed: 1.1, armor: 0.2, flying: false, bounty: 150, lives: 7, radius: 1.9, boss: true, mini: true, threat: 56 },
  salamander: { kind: 'salamander', hp: 5000, speed: 1.0, armor: 0.3, flying: false, bounty: 170, lives: 8, radius: 1.9, boss: true, mini: true, threat: 64 },
  magmaCrab: { kind: 'magmaCrab', hp: 6200, speed: 0.75, armor: 0.55, flying: false, bounty: 180, lives: 8, radius: 2.1, boss: true, mini: true, threat: 70 },
  smith: { kind: 'smith', hp: 6800, speed: 0.8, armor: 0.45, flying: false, bounty: 190, lives: 8, radius: 2.2, boss: true, mini: true, threat: 76 },
  gargoyle: { kind: 'gargoyle', hp: 6000, speed: 1.0, armor: 0.4, flying: true, bounty: 200, lives: 9, radius: 2.0, boss: true, mini: true, threat: 84 },
  organist: { kind: 'organist', hp: 7800, speed: 0.7, armor: 0.3, flying: false, bounty: 210, lives: 9, radius: 2.2, boss: true, mini: true, threat: 90 },
  twin: { kind: 'twin', hp: 4600, speed: 0.95, armor: 0.5, flying: false, bounty: 120, lives: 6, radius: 1.8, boss: true, mini: true, threat: 60 },
  wyrm: { kind: 'wyrm', hp: 5500, speed: 0.9, armor: 0.15, flying: true, bounty: 300, lives: 12, radius: 2.6, boss: true, legend: true, threat: 90 },
  djinn: { kind: 'djinn', hp: 11000, speed: 0.85, armor: 0.3, flying: true, bounty: 350, lives: 12, radius: 2.8, boss: true, legend: true, threat: 120 },
  aurora: { kind: 'aurora', hp: 14000, speed: 1.0, armor: 0.3, flying: true, bounty: 400, lives: 14, radius: 3.0, boss: true, legend: true, threat: 150 },
  phoenix: { kind: 'phoenix', hp: 18000, speed: 1.1, armor: 0.35, flying: true, bounty: 450, lives: 15, radius: 3.0, boss: true, legend: true, echo: 0.6, threat: 180 },
  abyssKing: { kind: 'abyssKing', hp: 26000, speed: 0.7, armor: 0.4, flying: false, bounty: 0, lives: 20, radius: 3.2, boss: true, legend: true, threat: 240 },
};

/** visual scale of enemy models in the big world */
export const ENEMY_SCALE = 2.2;

export const MAX_LIVES = 20;
