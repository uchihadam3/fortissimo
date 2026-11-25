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
  | 'bossBlot' | 'bossScarab' | 'bossMoth' | 'bossGolem' | 'silence';

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
export const STEPS_PER_BAR = 16;

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
      { cost: 90, pattern: 'x...............', range: 9, damage: 4, slow: 0.55, slowBeats: 4, flight: 0 },
      { cost: 90, pattern: 'x.......x.......', range: 10, damage: 7, slow: 0.48, slowBeats: 4, flight: 0 },
      { cost: 150, pattern: 'x.......x.......', range: 11, damage: 12, slow: 0.38, slowBeats: 6, flight: 0 },
    ],
  },
  shaker: {
    kind: 'shaker', damageType: 'pluck', hitsAir: false, hitsGround: false, color: '#ffe066',
    levels: [
      { cost: 60, pattern: '..x...x...x...x.', range: 0, damage: 0, income: 6, flight: 0 },
      { cost: 90, pattern: '..x.x.x...x.x.x.', range: 0, damage: 0, income: 11, flight: 0 },
      { cost: 140, pattern: '..xxx.x...xxx.x.', range: 0, damage: 0, income: 18, flight: 0 },
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
    kind: 'horn', damageType: 'sonic', hitsAir: true, hitsGround: true, color: '#ffb347',
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
  /** relative difficulty for the wave generator / balance tool */
  threat: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  blot: { kind: 'blot', hp: 34, speed: 2.1, armor: 0, flying: false, bounty: 5, lives: 1, radius: 0.7, threat: 1 },
  blotling: { kind: 'blotling', hp: 14, speed: 2.7, armor: 0, flying: false, bounty: 1, lives: 1, radius: 0.5, threat: 0.4 },
  scurry: { kind: 'scurry', hp: 22, speed: 3.9, armor: 0, flying: false, bounty: 5, lives: 1, radius: 0.6, threat: 1.1 },
  shell: { kind: 'shell', hp: 150, speed: 1.35, armor: 0.5, flying: false, bounty: 14, lives: 2, radius: 0.95, threat: 3.2 },
  moth: { kind: 'moth', hp: 42, speed: 2.6, armor: 0, flying: true, bounty: 7, lives: 1, radius: 0.75, threat: 1.6 },
  shield: { kind: 'shield', hp: 70, speed: 1.8, armor: 0.1, flying: false, bounty: 11, lives: 1, radius: 0.8, shield: 70, threat: 2.6 },
  bubble: { kind: 'bubble', hp: 95, speed: 1.7, armor: 0, flying: false, bounty: 8, lives: 2, radius: 1.0, split: { kind: 'blotling', count: 4 }, threat: 3 },
  phantom: { kind: 'phantom', hp: 60, speed: 2.4, armor: 0, flying: false, bounty: 10, lives: 1, radius: 0.7, camo: true, threat: 2.4 },
  muffler: { kind: 'muffler', hp: 110, speed: 1.6, armor: 0.2, flying: false, bounty: 15, lives: 2, radius: 0.9, mute: 7.5, threat: 4 },
  mender: { kind: 'mender', hp: 80, speed: 1.8, armor: 0, flying: false, bounty: 12, lives: 1, radius: 0.8, heal: 14, threat: 3 },
  obelisk: { kind: 'obelisk', hp: 320, speed: 0, armor: 0.2, flying: false, bounty: 30, lives: 0, radius: 1.2, mute: 11, threat: 0 },
  bossBlot: { kind: 'bossBlot', hp: 2400, speed: 0.95, armor: 0.1, flying: false, bounty: 150, lives: 10, radius: 2.1, boss: true, threat: 40 },
  bossScarab: { kind: 'bossScarab', hp: 4200, speed: 1.05, armor: 0.45, flying: false, bounty: 200, lives: 10, radius: 2.2, boss: true, threat: 60 },
  bossMoth: { kind: 'bossMoth', hp: 4600, speed: 1.2, armor: 0.1, flying: true, bounty: 220, lives: 10, radius: 2.3, boss: true, threat: 70 },
  bossGolem: { kind: 'bossGolem', hp: 9000, speed: 0.8, armor: 0.55, flying: false, bounty: 300, lives: 15, radius: 2.6, boss: true, threat: 100 },
  silence: { kind: 'silence', hp: 17000, speed: 0.7, armor: 0.3, flying: false, bounty: 0, lives: 20, radius: 3.0, boss: true, threat: 160 },
};

/** visual scale of enemy models in the big world */
export const ENEMY_SCALE = 2.2;

export const MAX_LIVES = 20;
