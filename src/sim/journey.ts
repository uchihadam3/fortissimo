/**
 * The journey simulation: a colossus walks a route to a landmark while creatures of the Silence
 * come at it from the land around. Towers stand on the plates of its shell and fire on the 16th
 * notes of the song. Pure logic: deterministic and runnable headless for balancing.
 *
 * Time is song time in seconds (0 = first downbeat). Everything that matters happens on the grid of
 * 16th-note steps; between steps the creatures and the colossus move in fixed sub-steps (SUB per
 * 16th). The state therefore never depends on how often `advance` is called: the player's actions,
 * recorded with the sub-step they happened at (`log`), replay to exactly the same journey. That is
 * what checkpoints are made of (`checkpoint()`, `Journey.replay`).
 *
 * A journey is a symphony in movements (`def.movements`). Between two movements comes a breather:
 * a few calm bars, a burst of golden notes along the road and one more plate of the shell lighting
 * up, so the band grows during the journey.
 */
import {
  ENEMIES, TOWERS, SELL_REFUND, STEPS_PER_BAR, MAX_LIVES, SECTION_OF, SECTIONS, TOWER_KINDS, BAND, duetOf, emptySections,
  type EnemyDef, type EnemyKind, type TowerKind, type DamageType, type WorldId, type SongId, type BandState, type DuetId,
} from './defs';
import { JourneyPath } from './path';
import { SLOTS, SHELL_REACH, slotsAdjacent } from './shell';
import { Rng, hashString } from '../core/rng';
import { RHYTHM, SOLO, ECHO } from './rhythm';

export type Mode = 'normal' | 'virtuoso' | 'endless';
export type FeatureKind = 'canyon' | 'river' | 'lake' | 'forest' | 'hills' | 'ruins' | 'meadow';
export type TutorialId = 'basics' | 'upgrade' | 'ff' | 'pickup' | 'sides' | 'baton' | 'solo' | 'echo';
export type LandmarkKind = 'bell' | 'chimes' | 'organ' | 'harp' | 'spire';

/** sub-steps per 16th note (fixed integration grid) */
export const SUB = 4;
const BEATS_PER_BAR = 4;
export const SUBS_PER_BAR = STEPS_PER_BAR * SUB;
export const DEFAULT_SPEED = 0.42;
/** the Virtuoso challenge (a crown): the same journey with half the lives and a tighter purse at the start */
export const VIRTUOSO = { hp: 1, speed: 1, coins: 0.92, lives: 10 };

export interface Feature {
  kind: FeatureKind;
  from: number;
  to: number;
  side?: number;
}

export interface JGroup {
  kind: EnemyKind;
  count: number;
  /** beats between spawns */
  every: number;
  /** direction relative to travel, degrees: 0 front, 90 right, -90 left, 180 behind */
  dir: number;
  /** angular spread in degrees */
  spread?: number;
  /** spawn distance from the colossus */
  dist?: number;
  /** beats after the wave starts */
  at?: number;
  hp?: number;
  /** a mid-journey elite: tougher (use `hp`), richer, bites harder; marked on the journey bar */
  elite?: boolean;
}

export interface JWave {
  /** bar of the journey (0 = the bar the colossus starts walking) */
  bar: number;
  groups: JGroup[];
}

/** One movement of a journey. */
export interface JMovement {
  /** journey bar at which the movement begins (its first downbeat) */
  bar: number;
  /** bars of breather before it (0 for the first): calm, golden notes and a new plate */
  rest: number;
  /** golden notes along the road during the breather before it */
  notes?: number;
  /** plates that light up when its breather begins (default 1; ignored for the first movement) */
  plates?: number;
}

export interface JourneyDef {
  id: string;
  world: WorldId;
  song: SongId;
  name: { pt: string; en: string };
  /** journey length in bars */
  bars: number;
  /** path units per beat */
  speed?: number;
  /** plates open at the start (more light up at every breather) */
  slots: number;
  coins: number;
  lives?: number;
  towers: TowerKind[];
  waves: JWave[];
  /** the movements (absent: one single movement) */
  movements?: JMovement[];
  features: Feature[];
  pickups?: number;
  obelisks?: { s: number; side: number; dist?: number }[];
  boss?: { kind: EnemyKind; bar: number; hp?: number };
  tutorial?: TutorialId[];
  newTower?: TowerKind;
  ff?: boolean;
  seed?: number;
  extra?: boolean;
  landmark?: LandmarkKind;
  curviness?: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  armor: number;
  x: number;
  z: number;
  speed: number;
  flying: boolean;
  slow: number;
  slowUntil: number;
  /** groundwork: stopped (stumbling) until */
  stunUntil: number;
  revealedUntil: number;
  alive: boolean;
  leaked: boolean;
  spawnT: number;
  burrowed: boolean;
  invulnUntil: number;
  phase: number;
  hitT: number;
  wave: number;
  structure: boolean;
  /** knock-back velocity */
  kx: number;
  kz: number;
  /** lives it takes if it bites */
  lives: number;
  bounty: number;
  elite: boolean;
  /** an echo that already came back once */
  echoed: boolean;
  /** Mimic: the instrument it copies (null: nothing to copy) */
  mimicKind: TowerKind | null;
  /** the last 16th step a bell tolled on it (bells do not stack) */
  bellStep: number;
  /** guardians: angle around the colossus they stalk at, and whether they charge */
  orbit: number;
  charging: boolean;
}

export type MuteCause = 'mute' | 'freeze' | 'disable' | 'mimic';

export interface Tower {
  id: number;
  kind: TowerKind;
  level: number;
  slot: number;
  x: number;
  z: number;
  spent: number;
  /** not playing (any cause); muted towers do not count in the band */
  muted: boolean;
  muteCause: MuteCause | null;
  frozenUntil: number;
  /** slug bite: silenced until */
  disabledUntil: number;
  aim: number;
  buff: number;
  damage: number;
  kills: number;
  builtT: number;
  shots: number;
  /** duets this tower plays in right now (partner tower) */
  partners: { id: DuetId; tower: Tower }[];
  /** v3: solo charge 0…1 (1 = ready: the musician glows) */
  solo: number;
  /** the 16th step its solo began on (−1: not soloing) and its strength */
  soloFrom: number;
  soloQ: number;
}

export interface Shot {
  id: number;
  tower: Tower;
  kind: TowerKind;
  level: number;
  targetId: number;
  tx: number;
  tz: number;
  launchT: number;
  impactT: number;
  damage: number;
  dirx: number;
  dirz: number;
  hits: number[];
  done: boolean;
  /** a note played because of a duet (march) */
  duet?: DuetId;
  /** a note of a solo (the solo's own music plays it: no separate tower note) */
  solo?: boolean;
}

export interface Pickup {
  id: number;
  x: number;
  z: number;
  s: number;
  value: number;
  taken: boolean;
  lost: boolean;
  /** golden notes of a breather: the movement it leads into */
  breather?: number;
}

export type SimEvent =
  | { t: number; type: 'spawn'; enemy: Enemy }
  | { t: number; type: 'fire'; shot: Shot }
  | { t: number; type: 'impact'; shot: Shot; hit: boolean }
  | { t: number; type: 'pulse'; tower: Tower; hits: number[] }
  | { t: number; type: 'damage'; enemy: Enemy; amount: number; shielded: number; hp: number; shield: number; shieldOwner: number }
  | { t: number; type: 'death'; enemy: Enemy; bounty: number }
  | { t: number; type: 'leak'; enemy: Enemy; lives: number }
  | { t: number; type: 'income'; tower: Tower; amount: number }
  | { t: number; type: 'muted'; tower: Tower; muted: boolean; cause: MuteCause | null }
  | { t: number; type: 'heal'; enemy: Enemy; targets: number[] }
  | { t: number; type: 'waveWarn'; index: number; dirs: { dir: number; kinds: EnemyKind[]; count: number }[]; at: number }
  | { t: number; type: 'waveStart'; index: number; total: number }
  | { t: number; type: 'boss'; enemy: Enemy; action: 'summon' | 'burrow' | 'emerge' | 'freeze' | 'plates' | 'phase' | 'charge'; towers?: number[] }
  | { t: number; type: 'ffDrop'; hits: number[] }
  | { t: number; type: 'ffReady' }
  | { t: number; type: 'collect'; pickup: Pickup }
  | { t: number; type: 'pickupLost'; pickup: Pickup }
  | { t: number; type: 'start' }
  | { t: number; type: 'halt'; on: boolean }
  | { t: number; type: 'arrive' }
  | { t: number; type: 'victory' }
  | { t: number; type: 'defeat' }
  // ── v2: the band, the movements, the bestiary ──
  /** the band changed (sections, harmony or duets) */
  | { t: number; type: 'band'; band: BandState }
  /** a duet formed (or broke) between towers a and b */
  | { t: number; type: 'duet'; id: DuetId; a: number; b: number; formed: boolean }
  /** a plate of the shell lights up */
  | { t: number; type: 'plate'; slot: number; open: number; max: number }
  /** movement `index` of `total` begins (on its downbeat) */
  | { t: number; type: 'movement'; index: number; total: number }
  /** a breather begins (calm before movement `index`), lasting `bars` */
  | { t: number; type: 'breather'; index: number; bars: number }
  /** a Mimic copies an instrument: every tower of that kind falls silent while it lives */
  | { t: number; type: 'mimic'; enemy: Enemy; kind: TowerKind | null; towers: number[] }
  /** a Lava Slug's bite silences a tower until `until` */
  | { t: number; type: 'disable'; enemy: Enemy; tower: Tower; until: number }
  /** an Echo comes back (a 'spawn' of the returning echo comes with it) */
  | { t: number; type: 'echo'; enemy: Enemy }
  /** a burrower dives (on) or surfaces (off) */
  | { t: number; type: 'burrow'; enemy: Enemy; on: boolean }
  /** a single-target shot passed through a Whirl */
  | { t: number; type: 'deflect'; enemy: Enemy; shot: Shot }
  /** groundwork: creatures stumble */
  | { t: number; type: 'stumble'; tower: Tower; hits: number[] }
  /** hymn: the colossus heals */
  | { t: number; type: 'heartHeal'; lives: number }
  // ── v3: the player's rhythm ──
  /** a musician's solo is charged (it glows on the shell) */
  | { t: number; type: 'soloReady'; tower: Tower }
  /** a solo begins at t (a beat) and lasts until `until` */
  | { t: number; type: 'solo'; tower: Tower; perfect: boolean; until: number }
  /** a solo's area effect (drum shockwave, bell ring, shaker shower, choir anthem, bass drop) */
  | { t: number; type: 'soloHit'; tower: Tower; kind: TowerKind; x: number; z: number; r: number; hits: number[] }
  /** the Maestro's call was echoed right: bonus notes, and a chord waits for the next movement */
  | { t: number; type: 'echoWin'; index: number; coins: number }
  /** the chord blast of a right echo */
  | { t: number; type: 'chord'; hits: number[] };

export interface SimStats {
  kills: number;
  leaks: number;
  earned: number;
  spent: number;
  collected: number;
  pickups: number;
  damageByKind: Partial<Record<TowerKind, number>>;
  ffUses: number;
  /** lives given back by the hymn */
  heals: number;
  /** duets formed during the journey */
  duets: number;
  /** highest harmony reached */
  harmonyPeak: number;
  /** v3: solos played (perfectly timed ones), calls echoed right, chord blasts */
  solos: number;
  perfectSolos: number;
  echoes: number;
  chords: number;
  /** groove: the highest level, and its sum over the bars walked (average = grooveSum / walkBars) */
  groovePeak: number;
  grooveSum: number;
  walkBars: number;
}

/** A player input, with the sub-step it happened at. */
export type SimAction =
  | { sub: number; a: 'build'; slot: number; kind: TowerKind }
  | { sub: number; a: 'upgrade'; slot: number }
  | { sub: number; a: 'sell'; slot: number }
  | { sub: number; a: 'collect'; id: number }
  | { sub: number; a: 'ff' }
  | { sub: number; a: 'go' }
  // v3: what the player's rhythm did (judged by the controller, recorded here)
  | { sub: number; a: 'groove'; level: number }
  | { sub: number; a: 'solo'; slot: number; perfect: boolean }
  | { sub: number; a: 'echo' };

/** Where a fallen journey can start again: the beginning of a movement's breather. */
export interface Checkpoint {
  /** level id and mode it belongs to */
  id: string;
  mode: Mode;
  /** the movement it leads into (≥ 1) and how many there are */
  movement: number;
  total: number;
  /** sub-step the live play resumes at (always on a bar line) */
  sub: number;
  /** the player's actions up to that point (replayed headless) */
  actions: SimAction[];
  /** fingerprint of the journey's data: a checkpoint only replays on the very same journey */
  version?: number;
}

/** A fingerprint of everything in a journey's data that the simulation depends on. */
export function journeyVersion(def: JourneyDef): number {
  return hashString(JSON.stringify([def.bars, def.speed, def.slots, def.coins, def.lives, def.towers, def.waves, def.movements, def.pickups, def.obelisks, def.boss, def.seed, def.curviness]));
}

interface SpawnReq {
  t: number;
  kind: EnemyKind;
  angle: number;
  dist: number;
  hp: number;
  wave: number;
  elite: boolean;
}

export class Journey {
  readonly path: JourneyPath;
  readonly spb: number;
  readonly stepDur: number;
  readonly subDur: number;
  readonly barDur: number;
  readonly speed: number;
  readonly length: number;
  time = 0;
  /** next 16th step to process */
  step = 0;
  /** sub-steps integrated so far (time = sub × subDur) */
  sub = 0;
  coins: number;
  lives: number;
  readonly maxLives: number;
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  shots: Shot[] = [];
  pickups: Pickup[] = [];
  events: SimEvent[] = [];
  stats: SimStats = { kills: 0, leaks: 0, earned: 0, spent: 0, collected: 0, pickups: 0, damageByKind: {}, ffUses: 0, heals: 0, duets: 0, harmonyPeak: 0, solos: 0, perfectSolos: 0, echoes: 0, chords: 0, groovePeak: 0, grooveSum: 0, walkBars: 0 };
  /** the colossus */
  turtle = { s: 0, x: 0, z: 0, dx: 0, dz: -1 };
  walking = false;
  halted = false;
  /** bar at which the walk began (null: still waiting for the player) */
  startBar: number | null = null;
  /** sim time at which the player set off */
  goTime: number | null = null;
  started = false;
  outcome: 'playing' | 'victory' | 'defeat' = 'playing';
  readonly waves: { bar: number; groups: JGroup[] }[];
  readonly movements: JMovement[];
  /** current movement (its breather included); -1 before the walk */
  movement = -1;
  /** plates open now / at the end of the journey */
  slotsOpen: number;
  readonly slotsMax: number;
  /** the band on the shell (playing towers only) */
  band: BandState = { sections: emptySections(), harmony: 0, duets: [] };
  /** damage multiplier from harmony */
  harmonyMul = 1;
  /** the player's actions (replayed by checkpoints) */
  readonly log: SimAction[] = [];
  /** waves whose warning / start has been emitted */
  private warned = new Set<number>();
  private begun = new Set<number>();
  private spawnQueue: SpawnReq[] = [];
  private respawns: { t: number; kind: EnemyKind; x: number; z: number; hp: number; wave: number; elite: boolean }[] = [];
  ff = 0;
  ffNeed: number;
  ffDropT: number | null = null;
  ffBoostUntil = 0;
  private ffWasReady = false;
  private nextId = 1;
  readonly hpScale: number;
  readonly mode: Mode;
  private rng: Rng;
  private bossSpawned = false;
  private arrived = false;
  readonly stopS: number;
  private bandDirty = false;
  private anyDead = false;
  /** the Silence steals an instrument for a while */
  stolen: { kind: TowerKind; until: number } | null = null;
  /** v3: the groove the player's baton keeps (0…4) */
  groove = 0;
  /** a choir's solo lifts the whole band until then */
  soloBuffUntil = 0;
  soloBuffMul = 1;
  /** breathers whose call was echoed right */
  private echoed = new Set<number>();
  /** a chord blast waiting for movement `chordFor` to begin (null: none) */
  chordFor: number | null = null;

  constructor(readonly def: JourneyDef, bpm: number, opts: { mode?: Mode; path?: JourneyPath } = {}) {
    this.spb = 60 / bpm;
    this.stepDur = this.spb / 4;
    this.subDur = this.stepDur / SUB;
    this.barDur = this.spb * BEATS_PER_BAR;
    this.speed = def.speed ?? DEFAULT_SPEED;
    this.length = def.bars * BEATS_PER_BAR * this.speed;
    this.path = opts.path ?? new JourneyPath(this.length, def.seed ?? 7, def.curviness ?? 1);
    this.mode = opts.mode ?? 'normal';
    const virt = this.mode === 'virtuoso';
    this.hpScale = virt ? VIRTUOSO.hp : 1;
    this.coins = Math.round(def.coins * (virt ? VIRTUOSO.coins : 1));
    this.maxLives = virt ? VIRTUOSO.lives : def.lives ?? MAX_LIVES;
    this.lives = this.maxLives;
    this.movements = def.movements?.length ? def.movements.slice().sort((a, b) => a.bar - b.bar) : [{ bar: 0, rest: 0 }];
    this.slotsOpen = Math.min(SLOTS.length, def.slots);
    let extra = 0;
    for (let k = 1; k < this.movements.length; k++) extra += this.movements[k].plates ?? 1;
    this.slotsMax = Math.min(SLOTS.length, def.slots + extra);
    this.waves = def.waves.slice().sort((a, b) => a.bar - b.bar);
    this.rng = new Rng((def.seed ?? 7) * 977 + 13);
    this.stopS = this.length - 16;
    let total = 0;
    for (const w of def.waves) {
      for (const g of w.groups) {
        const d = ENEMIES[g.kind];
        let hp = d.hp + (d.split ? ENEMIES[d.split.kind].hp * d.split.count : 0) + (d.echo ? d.hp * d.echo : 0);
        hp *= g.hp ?? 1;
        total += hp * g.count;
      }
    }
    // FORTÍSSIMO fills about twice per movement
    this.ffNeed = Math.max(400, Math.min(40000, (total * 0.5) / this.movements.length)) * this.hpScale;
    this.placeTurtle();
    // pickups along the way
    const n = def.pickups ?? Math.round(def.bars / 6);
    const pr = new Rng((def.seed ?? 7) * 31 + 5);
    for (let i = 0; i < n; i++) {
      const s = 18 + ((this.length - 30) * (i + pr.next() * 0.6)) / Math.max(1, n);
      this.addPickup(s, (pr.chance(0.5) ? 1 : -1) * pr.range(6, 15), pr.int(8, 14));
    }
    // the golden notes of every breather, strewn along the road where the calm will be
    const br = new Rng((def.seed ?? 7) * 53 + 11);
    for (let k = 1; k < this.movements.length; k++) {
      const m = this.movements[k];
      const cnt = m.notes ?? 8;
      const s0 = (m.bar - m.rest) * BEATS_PER_BAR * this.speed, s1 = m.bar * BEATS_PER_BAR * this.speed;
      for (let i = 0; i < cnt; i++) {
        const s = s0 + 4 + ((s1 - s0) * (i + br.next() * 0.7)) / cnt;
        const side = i % 2 ? 1 : -1;
        this.addPickup(s, side * br.range(5, 10), br.int(7, 11), k);
      }
    }
    this.pickups.sort((a, b) => a.s - b.s);
    // obelisks of the Silence
    for (const o of def.obelisks ?? []) {
      const p = this.path.at(o.s);
      const off = (o.dist ?? 11) * o.side;
      this.addEnemy('obelisk', p.x - p.dz * off, p.z + p.dx * off, 1, -1, 0);
    }
    // step 0 is processed right away, so player actions at sub-step 0 always come after it
    this.advance(0);
  }

  private addPickup(s: number, off: number, value: number, breather?: number) {
    const p = this.path.at(s);
    this.pickups.push({ id: this.nextId++, x: p.x - p.dz * off, z: p.z + p.dx * off, s, value, taken: false, lost: false, breather });
  }

  /** can this checkpoint start this journey again (same level, same data)? */
  static canResume(def: JourneyDef, cp: Checkpoint | null | undefined): boolean {
    return !!cp && cp.id === def.id && (cp.version === undefined || cp.version === journeyVersion(def)) && Array.isArray(cp.actions);
  }

  /** Replays a checkpoint headless: the journey exactly as it was at the checkpoint (events drained). */
  static replay(def: JourneyDef, bpm: number, cp: Checkpoint): Journey {
    const j = new Journey(def, bpm, { mode: cp.mode });
    for (const a of cp.actions) {
      if (a.sub > cp.sub) break;
      j.advanceToSub(a.sub);
      j.apply(a);
    }
    j.advanceToSub(cp.sub);
    j.drain();
    return j;
  }

  // ───────────────────────────── queries ─────────────────────────────

  get bar(): number {
    return Math.floor(this.time / this.barDur + 1e-9);
  }

  /** journey bar (bars since the walk began), or null before */
  get journeyBar(): number | null {
    return this.startBar === null ? null : this.bar - this.startBar;
  }

  get progress(): number {
    return Math.min(1, this.turtle.s / this.length);
  }

  stepTime(k: number): number {
    return k * this.stepDur;
  }

  towerAt(slot: number): Tower | undefined {
    return this.towers.find((t) => t.slot === slot);
  }

  enemyById(id: number): Enemy | undefined {
    return this.enemies.find((e) => e.id === id);
  }

  aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && !e.structure) n++;
    return n;
  }

  bossAlive(): Enemy | undefined {
    return this.enemies.find((e) => e.alive && e.def.boss);
  }

  /** world xz of a slot right now */
  slotPos(slot: number, out = { x: 0, z: 0 }) {
    const L = SLOTS[slot];
    const t = this.turtle;
    // local: +x right, −z forward; world: forward = (dx, dz), right = (−dz, dx)
    out.x = t.x + -t.dz * L.x + t.dx * -L.z;
    out.z = t.z + t.dx * L.x + t.dz * -L.z;
    return out;
  }

  /** seconds until the next wave starts (null if none or not walking yet) */
  nextWaveIn(): number | null {
    if (this.startBar === null) return null;
    for (let i = 0; i < this.waves.length; i++) {
      if (this.begun.has(i)) continue;
      return Math.max(0, (this.startBar + this.waves[i].bar) * this.barDur - this.time);
    }
    return null;
  }

  wavesBegun(): number {
    return this.begun.size;
  }

  /** the movement a journey bar belongs to (its breather counts as part of it) */
  movementAt(jb: number): number {
    let k = 0;
    for (let i = 1; i < this.movements.length; i++) if (jb >= this.movements[i].bar - this.movements[i].rest) k = i;
    return k;
  }

  /** is the journey in a breather right now? */
  inBreather(): boolean {
    const jb = this.journeyBar;
    if (jb === null) return false;
    for (let i = 1; i < this.movements.length; i++) {
      const m = this.movements[i];
      if (jb >= m.bar - m.rest && jb < m.bar) return true;
    }
    return false;
  }

  // ───────────────────────────── player actions ─────────────────────────────

  canBuild(slot: number, kind: TowerKind): boolean {
    return this.outcome === 'playing' && slot >= 0 && slot < this.slotsOpen && !this.towerAt(slot) && this.def.towers.includes(kind) && this.coins >= TOWERS[kind].levels[0].cost;
  }

  build(slot: number, kind: TowerKind): Tower | null {
    if (!this.canBuild(slot, kind)) return null;
    const cost = TOWERS[kind].levels[0].cost;
    this.coins -= cost;
    this.stats.spent += cost;
    const p = this.slotPos(slot);
    const t: Tower = {
      id: this.nextId++, kind, level: 0, slot, x: p.x, z: p.z, spent: cost, muted: false, muteCause: null, frozenUntil: 0, disabledUntil: 0,
      aim: Math.atan2(this.turtle.dz, this.turtle.dx), buff: 1, damage: 0, kills: 0, builtT: this.time, shots: 0, partners: [],
      solo: 0, soloFrom: -1, soloQ: 1,
    };
    this.towers.push(t);
    this.log.push({ sub: this.sub, a: 'build', slot, kind });
    // a Mimic (or the Silence) copying this instrument silences the newcomer too
    this.updateMutes(this.time);
    this.updateBand(this.time);
    return t;
  }

  upgradeCost(t: Tower): number | null {
    if (t.level >= 2) return null;
    return TOWERS[t.kind].levels[t.level + 1].cost;
  }

  upgrade(t: Tower): boolean {
    const c = this.upgradeCost(t);
    if (c === null || this.coins < c || this.outcome !== 'playing') return false;
    this.coins -= c;
    this.stats.spent += c;
    t.spent += c;
    t.level++;
    this.log.push({ sub: this.sub, a: 'upgrade', slot: t.slot });
    this.updateBand(this.time);
    return true;
  }

  sellValue(t: Tower): number {
    const fresh = this.time - t.builtT < 2.5 && !this.started;
    return Math.floor(t.spent * (fresh ? 1 : SELL_REFUND));
  }

  sell(t: Tower): number {
    if (this.outcome !== 'playing' || !this.towers.includes(t)) return 0;
    const v = this.sellValue(t);
    this.coins += v;
    this.towers = this.towers.filter((x) => x !== t);
    this.log.push({ sub: this.sub, a: 'sell', slot: t.slot });
    this.updateBand(this.time);
    return v;
  }

  /** The colossus sets off (first press of ▶). */
  begin(): boolean {
    if (this.started || this.outcome !== 'playing') return false;
    this.started = true;
    this.startBar = this.bar + 1;
    this.goTime = this.time;
    this.log.push({ sub: this.sub, a: 'go' });
    return true;
  }

  collect(id: number): number {
    const p = this.pickups.find((x) => x.id === id);
    if (!p || p.taken || p.lost || this.outcome !== 'playing') return 0;
    p.taken = true;
    this.coins += p.value;
    this.stats.earned += p.value;
    this.stats.collected++;
    this.log.push({ sub: this.sub, a: 'collect', id });
    this.emit({ t: this.time, type: 'collect', pickup: p });
    return p.value;
  }

  ffReady(): boolean {
    return this.ff >= 1 && this.ffDropT === null && this.outcome === 'playing';
  }

  unleash(): [number, number] | null {
    if (!this.ffReady()) return null;
    const beat = Math.ceil(this.time / this.spb - 1e-9);
    const start = beat * this.spb;
    let dropBar = Math.ceil(this.time / this.barDur - 1e-9);
    if (dropBar * this.barDur - this.time < this.spb * 2 - 1e-9) dropBar++;
    const drop = dropBar * this.barDur;
    this.ffDropT = drop;
    this.ff = 0;
    this.ffWasReady = false;
    this.stats.ffUses++;
    this.log.push({ sub: this.sub, a: 'ff' });
    return [start, drop];
  }

  /** Applies a recorded action (replays). */
  apply(a: SimAction): boolean {
    switch (a.a) {
      case 'build':
        return !!this.build(a.slot, a.kind);
      case 'upgrade': {
        const t = this.towerAt(a.slot);
        return !!t && this.upgrade(t);
      }
      case 'sell': {
        const t = this.towerAt(a.slot);
        return !!t && this.sell(t) > 0;
      }
      case 'collect':
        return this.collect(a.id) > 0;
      case 'ff':
        return !!this.unleash();
      case 'go':
        return this.begin();
      case 'groove':
        return this.setGroove(a.level);
      case 'solo': {
        const t = this.towerAt(a.slot);
        return !!t && this.solo(t, a.perfect) !== null;
      }
      case 'echo':
        return this.echo() > 0;
    }
  }

  // ───────────────────────────── the player's rhythm (v3) ─────────────────────────────

  /** The groove the baton keeps changed (judged by the controller). */
  setGroove(level: number): boolean {
    const l = Math.max(0, Math.min(RHYTHM.maxGroove, Math.round(level)));
    if (l === this.groove || this.outcome !== 'playing') return false;
    this.groove = l;
    this.stats.groovePeak = Math.max(this.stats.groovePeak, l);
    this.log.push({ sub: this.sub, a: 'groove', level: l });
    return true;
  }

  canSolo(t: Tower): boolean {
    return this.outcome === 'playing' && this.towers.includes(t) && !t.muted && t.solo >= 1 - 1e-9 && t.soloFrom < 0;
  }

  /**
   * A charged musician tapped on the beat: its solo starts on the next beat and lasts one bar.
   * Returns [start, end] in sim time (null: it cannot solo now).
   */
  solo(t: Tower, perfect: boolean): [number, number] | null {
    if (!this.canSolo(t)) return null;
    const from = Math.ceil(this.step / 4) * 4;
    t.solo = 0;
    t.soloFrom = from;
    t.soloQ = perfect ? SOLO.perfect : 1;
    this.stats.solos++;
    if (perfect) this.stats.perfectSolos++;
    this.log.push({ sub: this.sub, a: 'solo', slot: t.slot, perfect });
    const start = this.stepTime(from), end = this.stepTime(from + SOLO.steps);
    this.emit({ t: start, type: 'solo', tower: t, perfect, until: end });
    return [start, end];
  }

  /** can the Maestro's call be answered now (in a breather whose call was not echoed yet)? */
  canEcho(): boolean {
    if (this.outcome !== 'playing' || this.movement < 1 || this.echoed.has(this.movement)) return false;
    // from the breather's first bar to the first bar of its movement (the last echo can end on it)
    const m = this.movements[this.movement];
    const jb = this.journeyBar;
    return jb !== null && jb >= m.bar - m.rest && jb <= m.bar;
  }

  /** The call of this breather was echoed right: bonus golden notes, and a chord for the next movement. */
  echo(): number {
    if (!this.canEcho()) return 0;
    const k = this.movement;
    this.echoed.add(k);
    const coins = ECHO.coins + ECHO.perMovement * k;
    this.coins += coins;
    this.stats.earned += coins;
    this.stats.echoes++;
    this.chordFor = k;
    this.log.push({ sub: this.sub, a: 'echo' });
    this.emit({ t: this.time, type: 'echoWin', index: k, coins });
    return coins;
  }

  /** how much damage a full solo charge takes from a fighter (Infinity for musicians that do not hit) */
  private soloNeed(tw: Tower): number {
    const L = TOWERS[tw.kind].levels[tw.level];
    if (!L.damage) return Infinity;
    let xs = 0;
    for (const c of L.pattern) if (c === 'x') xs++;
    return L.damage * xs * (STEPS_PER_BAR / L.pattern.length) * SOLO.damageBars;
  }

  private chargeSolo(tw: Tower, amount: number, t: number) {
    if (tw.soloFrom >= 0 || tw.solo >= 1 || !(amount > 0) || !this.towers.includes(tw)) return;
    tw.solo = Math.min(1, tw.solo + amount);
    if (tw.solo >= 1 - 1e-9) {
      tw.solo = 1;
      this.emit({ t, type: 'soloReady', tower: tw });
    }
  }

  /** one 16th step of a solo (i = 0…15 within its bar) */
  private soloStep(tw: Tower, k: number, t: number) {
    const i = k - tw.soloFrom;
    if (i < 0) return;
    if (i >= SOLO.steps) {
      tw.soloFrom = -1;
      return;
    }
    if (i === SOLO.steps - 1) tw.soloFrom = -1;
    if (tw.muted) return;
    const L = TOWERS[tw.kind].levels[tw.level];
    const q = tw.soloQ;
    const mul = this.towerMul(tw, t) * q;
    const range = this.rangeOf(tw);
    const T = this.turtle;
    switch (tw.kind) {
      case 'harp':
        // a rapid volley: every 16th of the bar
        this.shoot(tw, t, L.damage * mul * 0.85, range * 1.15, undefined, true);
        break;
      case 'crystal':
        // a chain storm: every eighth
        if (i % 2 === 0) this.shoot(tw, t, L.damage * mul, range * 1.2, undefined, true);
        break;
      case 'horn':
        // piercing blasts on every beat
        if (i % 4 === 0) this.shoot(tw, t, L.damage * mul * 1.15, range * 1.2, undefined, true);
        break;
      case 'drum': {
        // a shockwave around the colossus on every beat: damage and a push outward
        if (i % 4 !== 0) break;
        const R = 8 + tw.level;
        const hits: number[] = [];
        for (const e of this.enemies) {
          if (!e.alive || e.flying || e.burrowed || e.structure) continue;
          const d = Math.hypot(e.x - T.x, e.z - T.z);
          if (d > R + e.def.radius * 0.5) continue;
          hits.push(e.id);
          if (!e.def.boss) {
            const kb = 7 * (1 - d / (R + 4));
            e.kx += ((e.x - T.x) / (d || 1)) * kb;
            e.kz += ((e.z - T.z) / (d || 1)) * kb;
          }
          this.damage(e, L.damage * mul * (1 - (0.3 * d) / (R + 1)), 'blast', tw, t);
        }
        this.emit({ t, type: 'soloHit', tower: tw, kind: 'drum', x: T.x, z: T.z, r: R, hits });
        break;
      }
      case 'bell': {
        // a great slow ring: everything around is revealed, slowed hard and tolled
        if (i % 8 !== 0) break;
        const R = range * 1.8;
        const hits: number[] = [];
        const beats = 4 * q;
        for (const e of this.enemies) {
          if (!e.alive || e.burrowed || e.structure) continue;
          if (this.dist2(tw, e) > (R + e.def.radius * 0.5) ** 2) continue;
          hits.push(e.id);
          e.revealedUntil = Math.max(e.revealedUntil, t + 8 * this.spb);
          if ((!e.def.boss || e.kind === 'bossBlot') && !e.def.steady) {
            e.slow = Math.min(e.slowUntil > t ? e.slow : 1, e.def.boss ? 0.7 : 0.4);
            e.slowUntil = Math.max(e.slowUntil, t + beats * this.spb);
          }
          this.damage(e, L.damage * 6 * mul, 'bell', tw, t);
        }
        this.emit({ t, type: 'soloHit', tower: tw, kind: 'bell', x: tw.x, z: tw.z, r: R, hits });
        break;
      }
      case 'shaker': {
        // a shower of golden notes, every eighth
        if (i % 2 !== 0) break;
        const inc = Math.max(1, Math.round((L.income ?? 3) * 0.9 * q));
        this.coins += inc;
        this.stats.earned += inc;
        this.emit({ t, type: 'income', tower: tw, amount: inc });
        if (i === 0) this.emit({ t, type: 'soloHit', tower: tw, kind: 'shaker', x: tw.x, z: tw.z, r: 4, hits: [] });
        break;
      }
      case 'choir': {
        // an anthem: the whole band plays stronger for a while, and nothing stays hidden
        if (i !== 0) break;
        this.soloBuffUntil = t + SOLO.choirBars * this.barDur;
        this.soloBuffMul = 1 + SOLO.choirBuff * q * (1 + 0.15 * tw.level);
        const hits: number[] = [];
        for (const e of this.enemies) {
          if (!e.alive || e.structure) continue;
          if (this.dist2(T, e) > 40 * 40) continue;
          e.revealedUntil = Math.max(e.revealedUntil, t + 4 * this.barDur);
          hits.push(e.id);
        }
        this.emit({ t, type: 'soloHit', tower: tw, kind: 'choir', x: tw.x, z: tw.z, r: 40, hits });
        break;
      }
      case 'bass': {
        // a huge drop on the heaviest creature on the ground, twice in the bar
        if (i % 8 !== 0) break;
        let target: Enemy | null = null;
        for (const e of this.enemies) {
          if (e.structure || !this.targetable(tw, e, t, range * 1.1)) continue;
          if (!target || e.hp > target.hp) target = e;
        }
        if (!target) break;
        const R = 5;
        const hits: number[] = [target.id];
        const x = target.x, z = target.z;
        this.damage(target, L.damage * mul * 1.2, 'bass', tw, t);
        for (const e of this.enemies) {
          if (e === target || !e.alive || e.flying || e.burrowed || e.structure) continue;
          if ((e.x - x) ** 2 + (e.z - z) ** 2 > R * R) continue;
          hits.push(e.id);
          this.damage(e, L.damage * mul * 0.45, 'bass', tw, t);
          if (e.alive) this.stumble(e, 1.5, t);
        }
        if (target.alive) this.stumble(target, 1.5, t);
        this.emit({ t, type: 'soloHit', tower: tw, kind: 'bass', x, z, r: R, hits });
        break;
      }
    }
  }

  /** the chord of a right echo rings once its movement has creatures to ring at */
  private chordCheck(jb: number, t: number) {
    const k = this.chordFor;
    if (k === null || this.movement < k || jb < this.movements[k].bar) return;
    const T = this.turtle;
    let near = 0, any = 0;
    for (const e of this.enemies) {
      if (!e.alive || e.structure) continue;
      any++;
      if (Math.hypot(e.x - T.x, e.z - T.z) <= ECHO.radius) near++;
    }
    if (near < ECHO.crowd && !(jb >= this.movements[k].bar + ECHO.wait && any > 0)) return;
    this.chordFor = null;
    this.stats.chords++;
    const hits: number[] = [];
    for (const e of this.enemies) {
      if (!e.alive || e.structure || e.burrowed) continue;
      hits.push(e.id);
      this.damage(e, e.def.boss ? ECHO.bossFlat + e.maxHp * ECHO.bossShare : ECHO.flat + e.maxHp * ECHO.share, 'bass', null, t);
    }
    this.emit({ t, type: 'chord', hits });
  }


  // ───────────────────────────── checkpoints ─────────────────────────────

  /** The start of every breather (movement ≥ 1) as sub-step indices; empty before the walk. */
  checkpoints(): { movement: number; sub: number }[] {
    if (this.startBar === null) return [];
    const sb = this.startBar;
    return this.movements.slice(1).map((m, i) => ({ movement: i + 1, sub: (sb + m.bar - m.rest) * SUBS_PER_BAR }));
  }

  /**
   * Where to start again after falling now: the latest breather that began at least two bars ago
   * (null: only a full restart).
   */
  checkpoint(): Checkpoint | null {
    const margin = 2 * SUBS_PER_BAR;
    let best: { movement: number; sub: number } | null = null;
    for (const c of this.checkpoints()) if (c.sub <= this.sub - margin) best = c;
    if (!best) return null;
    const until = best.sub;
    return { id: this.def.id, mode: this.mode, movement: best.movement, total: this.movements.length, sub: until, actions: this.log.filter((a) => a.sub <= until), version: journeyVersion(this.def) };
  }

  // ───────────────────────────── simulation ─────────────────────────────

  advance(to: number): void {
    if (this.outcome !== 'playing') {
      this.time = Math.max(this.time, to);
      return;
    }
    let guard = 0;
    while (this.outcome === 'playing') {
      if (this.sub === this.step * SUB) {
        this.processStep(this.step);
        this.step++;
        continue;
      }
      const tn = (this.sub + 1) * this.subDur;
      if (tn > to + 1e-9) break;
      this.integrate(this.subDur);
      this.sub++;
      this.time = this.sub * this.subDur;
      if (++guard > 20_000_000) break;
    }
  }

  advanceToSub(n: number): void {
    this.advance(n * this.subDur);
  }

  private emit(ev: SimEvent) {
    this.events.push(ev);
  }

  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private placeTurtle() {
    const p = this.path.at(this.turtle.s);
    this.turtle.x = p.x;
    this.turtle.z = p.z;
    this.turtle.dx = p.dx;
    this.turtle.dz = p.dz;
  }

  private integrate(dt: number) {
    // the colossus walks once the walk began (and not before its first bar line)
    const walk = this.startBar !== null && this.time >= this.startBar * this.barDur - 1e-9 && !this.arrived;
    if (walk !== this.walking) this.walking = walk;
    const boss = this.bossAlive();
    const mustHalt = !!boss && this.turtle.s >= this.stopS;
    if (mustHalt !== this.halted) {
      this.halted = mustHalt;
      this.emit({ t: this.time, type: 'halt', on: mustHalt });
    }
    const colossusV = this.walking && !this.halted ? this.speed / this.spb : 0;
    if (colossusV > 0) {
      this.turtle.s = Math.min(this.length, this.turtle.s + colossusV * dt);
      this.placeTurtle();
    }
    const T = this.turtle;
    const heading = Math.atan2(T.dz, T.dx);
    // auras: whirls push their neighbours on; a conductor drives them on every downbeat
    const downbeat = Math.floor(this.time / this.spb + 1e-9) % BEATS_PER_BAR === 0;
    const n = this.enemies.length;
    const auras: Enemy[] = [];
    for (let i = 0; i < n; i++) {
      const e = this.enemies[i];
      if (e.alive && e.def.aura && !e.burrowed && (e.kind !== 'conductor' || downbeat)) auras.push(e);
    }
    for (let i = 0; i < n; i++) {
      const e = this.enemies[i];
      if (!e.alive || e.structure) continue;
      let mult = 1;
      if (e.slowUntil > this.time) {
        const part = Math.min(dt, e.slowUntil - this.time) / dt;
        mult = part * e.slow + (1 - part);
      }
      if (e.stunUntil > this.time) mult = 0;
      if (auras.length) {
        let am = 1;
        for (const a of auras) {
          if (a === e || a.flying !== e.flying) continue;
          const r = a.def.aura!.radius;
          if (this.dist2(a, e) <= r * r) am = Math.max(am, a.def.aura!.speed);
        }
        mult *= am;
      }
      if (e.burrowed && e.def.boss) mult *= 1.6;
      let vx = T.x - e.x, vz = T.z - e.z;
      const d = Math.hypot(vx, vz) || 1;
      vx /= d;
      vz /= d;
      let sp = e.speed * mult;
      // guardians stalk the colossus at arm's length, circling, until they charge
      if (e.def.boss && !e.charging) {
        const hold = this.holdDistance(e);
        if (d < hold + 3) {
          const age = (this.time - e.spawnT) / this.barDur;
          const ang = heading + e.orbit + Math.sin(age * 0.35 + e.id) * 0.7;
          const gx = T.x + Math.cos(ang) * hold, gz = T.z + Math.sin(ang) * hold;
          let wx = gx - e.x, wz = gz - e.z;
          const wl = Math.hypot(wx, wz);
          const vmax = Math.max(e.speed * mult, colossusV * 1.4);
          if (wl > 1e-6) {
            const v = Math.min(vmax, wl / dt);
            wx /= wl;
            wz /= wl;
            vx = wx;
            vz = wz;
            sp = v;
          } else sp = 0;
        }
      }
      // keep a little apart from neighbours
      let sx = 0, sz = 0;
      if (!e.def.boss) {
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const o = this.enemies[j];
          if (!o.alive || o.structure || o.flying !== e.flying) continue;
          const ox = e.x - o.x, oz = e.z - o.z;
          const min = (e.def.radius + o.def.radius) * 0.9;
          if (Math.abs(ox) > min || Math.abs(oz) > min) continue;
          const dd = ox * ox + oz * oz;
          if (dd < min * min && dd > 1e-6) {
            const l = Math.sqrt(dd);
            sx += (ox / l) * (min - l);
            sz += (oz / l) * (min - l);
          }
        }
      }
      e.x += (vx * sp + sx * 2 + e.kx) * dt;
      e.z += (vz * sp + sz * 2 + e.kz) * dt;
      const kd = Math.exp(-dt * 3);
      e.kx *= kd;
      e.kz *= kd;
      // reached the shell: bite
      const reach = SHELL_REACH + e.def.radius * 0.5;
      if (Math.hypot(T.x - e.x, T.z - e.z) <= reach) this.leak(e, this.time + dt);
    }
    // pickups left far behind are lost
    for (const p of this.pickups) {
      if (p.taken || p.lost) continue;
      if (T.s - p.s > 28) {
        p.lost = true;
        this.emit({ t: this.time, type: 'pickupLost', pickup: p });
      }
    }
    if (this.walking && T.s >= this.length - 1e-6 && !this.arrived && !boss) {
      this.arrived = true;
      this.emit({ t: this.time + dt, type: 'arrive' });
    }
  }

  /** how far a guardian stalks from the colossus' centre */
  private holdDistance(e: Enemy): number {
    return e.kind === 'silence' ? 12 : 9.5 + e.def.radius * 0.5;
  }

  private leak(e: Enemy, t: number) {
    e.alive = false;
    e.leaked = true;
    this.anyDead = true;
    const lives = e.lives;
    this.lives = Math.max(0, this.lives - lives);
    this.stats.leaks += lives;
    this.emit({ t, type: 'leak', enemy: e, lives });
    // a Lava Slug's bite puts out the nearest plate for a while
    if (e.def.disable && this.towers.length) {
      let best: Tower | null = null;
      let bd = Infinity;
      for (const tw of this.towers) {
        if (tw.disabledUntil > t) continue;
        const d = this.dist2(tw, e);
        if (d < bd) {
          bd = d;
          best = tw;
        }
      }
      if (best) {
        best.disabledUntil = t + e.def.disable * this.barDur;
        this.emit({ t, type: 'disable', enemy: e, tower: best, until: best.disabledUntil });
      }
    }
    if (this.lives <= 0 && this.outcome === 'playing') {
      this.outcome = 'defeat';
      this.emit({ t, type: 'defeat' });
    }
  }

  private processStep(k: number) {
    const t = this.stepTime(k);
    if (k % STEPS_PER_BAR === 0) this.onBar(Math.round(k / STEPS_PER_BAR), t);
    while (this.spawnQueue.length && this.spawnQueue[0].t <= t + 1e-9) {
      const s = this.spawnQueue.shift()!;
      const T = this.turtle;
      this.addEnemy(s.kind, T.x + Math.cos(s.angle) * s.dist, T.z + Math.sin(s.angle) * s.dist, s.hp, s.wave, t, s.elite);
    }
    while (this.respawns.length && this.respawns[0].t <= t + 1e-9) {
      const r = this.respawns.shift()!;
      const e = this.addEnemy(r.kind, r.x, r.z, r.hp, r.wave, t, r.elite, true);
      this.emit({ t, type: 'echo', enemy: e });
    }
    // towers follow the shell
    const tmp = { x: 0, z: 0 };
    for (const tw of this.towers) {
      this.slotPos(tw.slot, tmp);
      tw.x = tmp.x;
      tw.z = tmp.z;
    }
    for (const s of this.shots) if (!s.done && s.impactT <= t + 1e-9) this.resolve(s, t);
    this.shots = this.shots.filter((s) => !s.done);
    const hymn = this.band.duets.some((d) => d.id === 'hymn');
    for (const tw of this.towers) {
      if (tw.kind !== 'choir' || tw.muted) continue;
      const r = TOWERS.choir.levels[tw.level].range + 6 + (hymn && tw.partners.some((p) => p.id === 'hymn') ? BAND.hymnReveal : 0);
      for (const e of this.enemies) if (e.alive && this.dist2(tw, e) <= r * r) e.revealedUntil = Math.max(e.revealedUntil, t + this.stepDur * 2);
    }
    this.updateMutes(t);
    if (this.bandDirty) this.updateBand(t);
    for (const tw of this.towers) this.towerStep(tw, k, t);
    for (const tw of this.towers) if (tw.soloFrom >= 0) this.soloStep(tw, k, t);
    if (this.ffDropT !== null && t >= this.ffDropT - 1e-9) this.ffDrop(t);
    if (!this.ffWasReady && this.ff >= 1 && this.ffDropT === null) {
      this.ffWasReady = true;
      this.emit({ t, type: 'ffReady' });
    }
    if (this.anyDead) {
      this.anyDead = false;
      this.enemies = this.enemies.filter((e) => e.alive);
    }
    this.checkEnd(t);
  }

  private onBar(bar: number, t: number) {
    if (this.startBar !== null && bar === this.startBar) this.emit({ t, type: 'start' });
    const jb = this.startBar === null ? null : bar - this.startBar;
    if (jb !== null) {
      // movements and breathers
      this.movements.forEach((m, k) => {
        if (k > 0 && jb === m.bar - m.rest) this.breather(k, t);
        if (jb === m.bar) {
          this.movement = k;
          this.emit({ t, type: 'movement', index: k, total: this.movements.length });
        }
      });
      if (jb === 0 && this.movement < 0) this.movement = 0;
      this.waves.forEach((w, i) => {
        if (!this.warned.has(i) && jb >= w.bar - 2) {
          this.warned.add(i);
          const dirs: { dir: number; kinds: EnemyKind[]; count: number }[] = [];
          for (const g of w.groups) {
            let d = dirs.find((x) => Math.abs(x.dir - g.dir) < 1);
            if (!d) dirs.push((d = { dir: g.dir, kinds: [], count: 0 }));
            if (!d.kinds.includes(g.kind)) d.kinds.push(g.kind);
            d.count += g.count;
          }
          this.emit({ t, type: 'waveWarn', index: i, dirs, at: (this.startBar! + w.bar) * this.barDur });
        }
        if (!this.begun.has(i) && jb >= w.bar) {
          this.begun.add(i);
          this.startWave(i, t);
        }
      });
      if (this.def.boss && !this.bossSpawned && jb >= this.def.boss.bar) {
        this.bossSpawned = true;
        const T = this.turtle;
        const a = Math.atan2(T.dz, T.dx);
        const e = this.addEnemy(this.def.boss.kind, T.x + Math.cos(a) * 34, T.z + Math.sin(a) * 34, this.def.boss.hp ?? 1, -2, t);
        e.orbit = 0;
      }
      // hymn: the colossus heals a little every few bars
      if (this.walking && jb > 0 && jb % BAND.hymnEvery === 0 && this.lives < this.maxLives && this.stats.heals < BAND.hymnCap && this.band.duets.some((d) => d.id === 'hymn')) {
        this.lives++;
        this.stats.heals++;
        this.emit({ t, type: 'heartHeal', lives: this.lives });
      }
      if (this.walking) {
        this.stats.grooveSum += this.groove;
        this.stats.walkBars++;
        // every playing musician charges its solo a little each bar (more with a good groove)
        const g = SOLO.perBar * (1 + SOLO.grooveCharge * this.groove);
        for (const tw of this.towers) if (!tw.muted) this.chargeSolo(tw, g, t);
      }
      this.chordCheck(jb, t);
    }
    // economy (only once the journey is under way)
    if (this.walking && this.outcome === 'playing') {
      for (const tw of this.towers) {
        if (tw.kind !== 'shaker' || tw.muted) continue;
        let inc = TOWERS.shaker.levels[tw.level].income ?? 0;
        if (tw.partners.some((p) => p.id === 'groove')) inc = Math.round(inc * BAND.grooveIncome);
        this.coins += inc;
        this.stats.earned += inc;
        this.emit({ t, type: 'income', tower: tw, amount: inc });
      }
    }
    for (const e of this.enemies) {
      if (!e.alive || !e.def.heal) continue;
      const targets: number[] = [];
      for (const o of this.enemies) {
        if (!o.alive || o === e || o.hp >= o.maxHp || o.structure) continue;
        if (this.dist2(e, o) <= 4.5 * 4.5) {
          o.hp = Math.min(o.maxHp, o.hp + e.def.heal * this.hpScale);
          targets.push(o.id);
        }
      }
      if (targets.length) this.emit({ t, type: 'heal', enemy: e, targets });
    }
    // burrowers dive one bar out of every few
    for (const e of this.enemies) {
      if (!e.alive || !e.def.burrow || e.def.boss) continue;
      const age = bar - Math.floor(e.spawnT / this.barDur + 1e-9);
      if (age < 1) continue;
      const b = e.def.burrow;
      const want = (age + e.id) % b.every >= b.every - b.for;
      if (want !== e.burrowed) {
        e.burrowed = want;
        this.emit({ t, type: 'burrow', enemy: e, on: want });
      }
    }
    for (const e of this.enemies) if (e.alive && e.def.boss) this.bossBar(e, t);
  }

  /** a breather begins: calm before movement k, and one more plate of the shell lights up */
  private breather(k: number, t: number) {
    const m = this.movements[k];
    this.movement = k;
    this.emit({ t, type: 'breather', index: k, bars: m.rest });
    const n = m.plates ?? 1;
    for (let i = 0; i < n && this.slotsOpen < this.slotsMax; i++) {
      const slot = this.slotsOpen++;
      this.emit({ t, type: 'plate', slot, open: this.slotsOpen, max: this.slotsMax });
    }
  }

  private startWave(i: number, t: number) {
    const w = this.waves[i];
    const T = this.turtle;
    const heading = Math.atan2(T.dz, T.dx);
    w.groups.forEach((g) => {
      const base = heading + (g.dir * Math.PI) / 180;
      const spread = ((g.spread ?? 24) * Math.PI) / 180;
      for (let k = 0; k < g.count; k++) {
        const st = t + ((g.at ?? 0) + k * g.every) * this.spb;
        const q = Math.round(st / this.stepDur) * this.stepDur;
        const ang = base + (this.rng.next() - 0.5) * spread;
        this.spawnQueue.push({ t: q, kind: g.kind, angle: ang, dist: g.dist ?? (ENEMIES[g.kind].flying ? 37 : 34), hp: g.hp ?? 1, wave: i, elite: !!g.elite });
      }
    });
    this.spawnQueue.sort((a, b) => a.t - b.t);
    this.emit({ t, type: 'waveStart', index: i, total: this.waves.length });
  }

  private addEnemy(kind: EnemyKind, x: number, z: number, hpMul: number, wave: number, t: number, elite = false, echoed = false): Enemy {
    const def = ENEMIES[kind];
    const hp = def.hp * hpMul * this.hpScale;
    const e: Enemy = {
      id: this.nextId++, kind, def, hp, maxHp: hp, shield: (def.shield ?? 0) * this.hpScale * (elite ? 2 : 1), maxShield: (def.shield ?? 0) * this.hpScale * (elite ? 2 : 1),
      armor: def.armor, x, z, speed: def.speed * (this.mode === 'virtuoso' ? VIRTUOSO.speed : 1), flying: def.flying, slow: 1, slowUntil: 0, stunUntil: 0,
      revealedUntil: 0, alive: true, leaked: false, spawnT: t, burrowed: false, invulnUntil: 0, phase: 0, hitT: -1, wave,
      structure: kind === 'obelisk', kx: 0, kz: 0, lives: def.lives + (elite ? 1 : 0), bounty: Math.round(def.bounty * (elite ? 3 : echoed ? 0.5 : 1)),
      elite, echoed, mimicKind: null, orbit: 0, charging: false, bellStep: -1,
    };
    if (def.boss) {
      const T = this.turtle;
      e.orbit = Math.atan2(z - T.z, x - T.x) - Math.atan2(T.dz, T.dx);
    }
    this.enemies.push(e);
    this.emit({ t, type: 'spawn', enemy: e });
    if (def.mimic) this.copyInstrument(e, t);
    return e;
  }

  /** The Mimic copies the most common instrument on the shell (not one another Mimic already took). */
  private copyInstrument(e: Enemy, t: number) {
    const kind = this.mostCommon(new Set(this.enemies.filter((o) => o.alive && o !== e && o.mimicKind).map((o) => o.mimicKind!)));
    e.mimicKind = kind;
    this.emit({ t, type: 'mimic', enemy: e, kind, towers: kind ? this.towers.filter((tw) => tw.kind === kind).map((tw) => tw.id) : [] });
    this.updateMutes(t);
  }

  /** most common instrument on the shell (ties: more levels, then the catalogue order) */
  private mostCommon(exclude: Set<TowerKind>): TowerKind | null {
    let best: TowerKind | null = null;
    let bn = 0, bl = 0;
    for (const k of TOWER_KINDS) {
      if (exclude.has(k)) continue;
      let n = 0, l = 0;
      for (const tw of this.towers) if (tw.kind === k) {
        n++;
        l += tw.level;
      }
      if (n > bn || (n === bn && n > 0 && l > bl)) {
        best = k;
        bn = n;
        bl = l;
      }
    }
    return best;
  }

  // ───────────────────────────── the band ─────────────────────────────

  /** Sections, harmony and duets of the playing towers; emits what changed. */
  private updateBand(t: number) {
    this.bandDirty = false;
    const sections = emptySections();
    for (const tw of this.towers) if (!tw.muted) sections[SECTION_OF[tw.kind]]++;
    const distinct = SECTIONS.filter((s) => sections[s] > 0).length;
    const harmony = Math.max(0, distinct - 1);
    const duets: { id: DuetId; a: number; b: number }[] = [];
    for (const tw of this.towers) tw.partners = [];
    for (let i = 0; i < this.towers.length; i++) {
      const p = this.towers[i];
      if (p.muted) continue;
      for (let j = i + 1; j < this.towers.length; j++) {
        const q = this.towers[j];
        if (q.muted || !slotsAdjacent(p.slot, q.slot)) continue;
        const d = duetOf(p.kind, q.kind);
        if (!d) continue;
        const [x, y] = p.kind === d.a ? [p, q] : [q, p];
        duets.push({ id: d.id, a: x.id, b: y.id });
        p.partners.push({ id: d.id, tower: q });
        q.partners.push({ id: d.id, tower: p });
      }
    }
    const prev = this.band;
    const key = (d: { id: DuetId; a: number; b: number }) => `${d.id}:${d.a}:${d.b}`;
    const before = new Set(prev.duets.map(key));
    const after = new Set(duets.map(key));
    let changed = harmony !== prev.harmony || SECTIONS.some((s) => sections[s] !== prev.sections[s]);
    for (const d of prev.duets) if (!after.has(key(d))) {
      changed = true;
      this.emit({ t, type: 'duet', id: d.id, a: d.a, b: d.b, formed: false });
    }
    for (const d of duets) if (!before.has(key(d))) {
      changed = true;
      this.stats.duets++;
      this.emit({ t, type: 'duet', id: d.id, a: d.a, b: d.b, formed: true });
    }
    this.band = { sections, harmony, duets };
    this.harmonyMul = 1 + BAND.harmonyStep * harmony;
    this.stats.harmonyPeak = Math.max(this.stats.harmonyPeak, harmony);
    this.recomputeBuffs();
    if (changed) this.emit({ t, type: 'band', band: { sections: { ...sections }, harmony, duets: duets.slice() } });
  }

  /** the choir lifts the towers around it (only while it sings) */
  private recomputeBuffs() {
    for (const tw of this.towers) tw.buff = 1;
    for (const c of this.towers) {
      if (c.kind !== 'choir' || c.muted) continue;
      const L = TOWERS.choir.levels[c.level];
      const a = SLOTS[c.slot];
      for (const tw of this.towers) {
        if (tw === c || tw.kind === 'choir' || tw.kind === 'shaker') continue;
        const b = SLOTS[tw.slot];
        if (Math.hypot(a.x - b.x, a.z - b.z) <= L.range + 1e-6) tw.buff = Math.max(tw.buff, L.buff ?? 1);
      }
    }
  }

  private updateMutes(t: number) {
    const mutes = this.enemies.filter((e) => e.alive && e.def.mute && !e.burrowed);
    const copied = new Set<TowerKind>();
    for (const e of this.enemies) if (e.alive && e.mimicKind) copied.add(e.mimicKind);
    if (this.stolen && this.stolen.until > t) copied.add(this.stolen.kind);
    for (const tw of this.towers) {
      let cause: MuteCause | null = null;
      if (tw.disabledUntil > t) cause = 'disable';
      else if (copied.has(tw.kind)) cause = 'mimic';
      else if (tw.frozenUntil > t) cause = 'freeze';
      else {
        for (const e of mutes) {
          const r = e.def.mute!;
          if (this.dist2(tw, e) <= r * r) {
            cause = 'mute';
            break;
          }
        }
      }
      const m = cause !== null;
      if (m !== tw.muted || cause !== tw.muteCause) {
        const was = tw.muted;
        tw.muted = m;
        tw.muteCause = cause;
        if (was !== m) {
          this.bandDirty = true;
          this.emit({ t, type: 'muted', tower: tw, muted: m, cause });
        }
      }
    }
    // a silenced tower leaves the band at once (and comes back the same way)
    if (this.bandDirty) this.updateBand(t);
  }

  // ───────────────────────────── towers ─────────────────────────────

  private rangeOf(tw: Tower): number {
    // the high plates see a little farther
    return TOWERS[tw.kind].levels[tw.level].range * (SLOTS[tw.slot].ring === 1 ? 1.08 : 1);
  }

  private targetable(tw: Tower, e: Enemy, t: number, range: number): boolean {
    if (!e.alive || e.burrowed) return false;
    const def = TOWERS[tw.kind];
    if (e.flying ? !def.hitsAir : !def.hitsGround) return false;
    if (e.def.camo && e.revealedUntil < t && !def.detects) return false;
    const r = range + e.def.radius * 0.5;
    return this.dist2(tw, e) <= r * r;
  }

  /** single-target shots pass straight through a Whirl */
  private deflects(kind: TowerKind, e: Enemy): boolean {
    return !!e.def.deflect && (kind === 'harp' || kind === 'horn');
  }

  /** The most dangerous: closest to the shell. Structures (and what it cannot hurt) only when nothing else is in range. */
  private pickTarget(tw: Tower, t: number, range: number, skip = -1): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const T = this.turtle;
    for (const e of this.enemies) {
      if (e.id === skip || !this.targetable(tw, e, t, range)) continue;
      const score = Math.hypot(T.x - e.x, T.z - e.z) + (e.structure ? 1000 : 0) + (this.deflects(tw.kind, e) ? 500 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private hasDuet(tw: Tower, id: DuetId): boolean {
    for (const p of tw.partners) if (p.id === id && !p.tower.muted) return true;
    return false;
  }

  private towerMul(tw: Tower, t: number): number {
    return tw.buff * this.harmonyMul * (t < this.ffBoostUntil ? 1.5 : 1) * (1 + RHYTHM.grooveDamage[this.groove]) * (t < this.soloBuffUntil ? this.soloBuffMul : 1);
  }

  private towerStep(tw: Tower, k: number, t: number) {
    const def = TOWERS[tw.kind];
    const L = def.levels[tw.level];
    if (L.pattern[k % L.pattern.length] !== 'x') return;
    if (tw.muted) return;
    const dmg = L.damage * this.towerMul(tw, t);
    let range = this.rangeOf(tw);
    switch (tw.kind) {
      case 'shaker':
        if (this.walking && this.aliveCount() + this.spawnQueue.length > 0) this.emit({ t, type: 'pulse', tower: tw, hits: [] });
        return;
      case 'choir':
        if (this.aliveCount() > 0) this.emit({ t, type: 'pulse', tower: tw, hits: [] });
        return;
      case 'bell': {
        const hymn = this.hasDuet(tw, 'hymn');
        if (hymn) range += 1.5;
        const hits: number[] = [];
        for (const e of this.enemies) {
          if (!e.alive || e.burrowed || e.structure) continue;
          const r = range + e.def.radius * 0.5;
          if (this.dist2(tw, e) > r * r) continue;
          hits.push(e.id);
        }
        if (!hits.length) return;
        const beats = (L.slowBeats ?? 4) * (hymn ? 1.5 : 1);
        for (const id of hits) {
          const e = this.enemyById(id)!;
          e.revealedUntil = Math.max(e.revealedUntil, t + beats * this.spb);
          if ((!e.def.boss || e.kind === 'bossBlot') && !e.def.steady) {
            const s = e.def.boss ? Math.min(0.85, (L.slow ?? 1) + 0.25) : L.slow ?? 1;
            e.slow = Math.min(e.slowUntil > t ? e.slow : 1, s);
            e.slowUntil = Math.max(e.slowUntil, t + beats * this.spb);
          }
          // bells ringing together sound as one: a creature takes one bell's toll per step
          if (e.bellStep !== k) {
            e.bellStep = k;
            this.damage(e, dmg, 'bell', tw, t);
          }
        }
        tw.shots++;
        this.emit({ t, type: 'pulse', tower: tw, hits });
        return;
      }
    }
    if (!this.shoot(tw, t, dmg, range)) return;
    // march: the drum's partners pluck along with every hit
    if (tw.kind === 'drum') {
      for (const p of tw.partners) {
        if (p.id !== 'march' || p.tower.muted) continue;
        const h = p.tower;
        const HL = TOWERS.harp.levels[h.level];
        for (let i = 0; i < BAND.marchShots; i++) this.shoot(h, t, HL.damage * this.towerMul(h, t), this.rangeOf(h), 'march');
      }
    }
  }

  /** a tower fires one shot at its best target (false: nothing to shoot at) */
  private shoot(tw: Tower, t: number, dmg: number, range: number, duet?: DuetId, solo = false): boolean {
    const L = TOWERS[tw.kind].levels[tw.level];
    const target = this.pickTarget(tw, t, range);
    if (!target) return false;
    if (tw.kind === 'harp' && this.hasDuet(tw, 'serenade')) dmg *= BAND.serenadeDamage;
    if (tw.kind === 'horn' && this.hasDuet(tw, 'fanfare')) dmg *= BAND.fanfareDamage;
    tw.aim = Math.atan2(target.z - tw.z, target.x - tw.x);
    tw.shots++;
    const flight = L.flight;
    // lead the target toward where it will be
    const leadT = flight * this.stepDur;
    const T = this.turtle;
    let lx = target.x, lz = target.z;
    if (!target.structure && !target.def.boss) {
      const dx = T.x - target.x, dz = T.z - target.z;
      const dl = Math.hypot(dx, dz) || 1;
      const sp = target.stunUntil > t ? 0 : target.speed * (target.slowUntil > t ? target.slow : 1);
      lx += (dx / dl) * sp * leadT;
      lz += (dz / dl) * sp * leadT;
    }
    const shot: Shot = {
      id: this.nextId++, tower: tw, kind: tw.kind, level: tw.level, targetId: target.id,
      tx: lx, tz: lz, launchT: t, impactT: t + flight * this.stepDur, damage: dmg,
      dirx: Math.cos(tw.aim), dirz: Math.sin(tw.aim), hits: [], done: false, duet, solo: solo || undefined,
    };
    this.shots.push(shot);
    this.emit({ t, type: 'fire', shot });
    if (flight === 0) this.resolve(shot, t);
    return true;
  }

  private resolve(s: Shot, t: number) {
    s.done = true;
    const tw = s.tower;
    const L = TOWERS[s.kind].levels[s.level];
    let target = this.enemyById(s.targetId);
    if (target && target.alive && !target.burrowed) {
      s.tx = target.x;
      s.tz = target.z;
    } else {
      target = undefined;
      let bd = 2.2 * 2.2;
      for (const e of this.enemies) {
        if (!e.alive || e.burrowed) continue;
        const d = (e.x - s.tx) ** 2 + (e.z - s.tz) ** 2;
        if (d < bd && (s.kind === 'drum' || (this.targetable(tw, e, t, 999) && !this.deflects(s.kind, e)))) {
          bd = d;
          target = e;
        }
      }
      if (target) {
        s.tx = target.x;
        s.tz = target.z;
      }
    }
    switch (s.kind) {
      case 'harp': {
        if (!target) break;
        if (this.deflects('harp', target)) {
          this.emit({ t, type: 'deflect', enemy: target, shot: s });
          break;
        }
        this.damage(target, s.damage, 'pluck', tw, t);
        s.hits.push(target.id);
        // serenade: the note rings as a chord on what stands next to it
        if (this.hasDuet(tw, 'serenade')) {
          const rr = BAND.serenadeRadius;
          for (const e of this.enemies) {
            if (e === target || !e.alive || e.burrowed || e.structure || this.deflects('harp', e) || !this.targetable(tw, e, t, 999)) continue;
            if ((e.x - s.tx) ** 2 + (e.z - s.tz) ** 2 <= rr * rr) {
              this.damage(e, s.damage * BAND.serenadeSplash, 'pluck', tw, t);
              s.hits.push(e.id);
            }
          }
        }
        break;
      }
      case 'bass': {
        if (!target || target.flying) break;
        this.damage(target, s.damage, 'bass', tw, t);
        s.hits.push(target.id);
        if (this.hasDuet(tw, 'groundwork')) {
          const hits: number[] = [];
          const rr = BAND.stumbleBassArea;
          for (const e of this.enemies) {
            if (!e.alive || e.flying || e.burrowed || e.structure) continue;
            if ((e.x - s.tx) ** 2 + (e.z - s.tz) ** 2 <= rr * rr && this.stumble(e, BAND.stumbleBassBeats, t)) hits.push(e.id);
          }
          if (hits.length) this.emit({ t, type: 'stumble', tower: tw, hits });
        }
        // thunder: the crystal partner answers every drop with a chain
        for (const p of tw.partners) {
          if (p.id !== 'thunder' || p.tower.muted) continue;
          const c = p.tower;
          const CL = TOWERS.crystal.levels[c.level];
          const start = target.alive ? target : this.nearestAlive(s.tx, s.tz, 4, c, t);
          if (start) this.chain(c, start, CL.damage * BAND.thunderDamage * this.towerMul(c, t), CL.chain ?? 3, 5, null, t, s.hits);
          break;
        }
        break;
      }
      case 'drum': {
        const r = L.area ?? 2.5;
        const ground = this.hasDuet(tw, 'groundwork');
        const stumbled: number[] = [];
        for (const e of this.enemies) {
          if (!e.alive || e.flying || e.burrowed) continue;
          const d2 = (e.x - s.tx) ** 2 + (e.z - s.tz) ** 2;
          const rr = r + e.def.radius * 0.5;
          if (d2 <= rr * rr) {
            const fall = 1 - (0.35 * Math.sqrt(d2)) / (rr + 0.01);
            this.damage(e, s.damage * fall, 'blast', tw, t);
            s.hits.push(e.id);
            if (ground && e.alive && !e.structure && this.stumble(e, BAND.stumbleBeats, t)) stumbled.push(e.id);
          }
        }
        if (stumbled.length) this.emit({ t, type: 'stumble', tower: tw, hits: stumbled });
        break;
      }
      case 'crystal': {
        if (!target) break;
        const shimmer = this.hasDuet(tw, 'shimmer');
        const n = (L.chain ?? 3) + (shimmer ? BAND.shimmerExtraChain : 0) + (s.solo ? 2 : 0);
        this.chain(tw, target, s.damage, n, shimmer ? BAND.shimmerJump : s.solo ? 6.5 : 5, shimmer ? { slow: BAND.shimmerSlow, beats: BAND.shimmerSlowBeats } : null, t, s.hits);
        break;
      }
      case 'horn': {
        const len = (this.rangeOf(tw) + 1) * (s.solo ? 1.25 : 1);
        const w = ((L.area ?? 1.4) + (this.hasDuet(tw, 'fanfare') ? BAND.fanfareWidth : 0)) * (s.solo ? 1.8 : 1);
        for (const e of this.enemies) {
          if (!e.alive || e.burrowed || e.flying) continue;
          if (e.def.camo && e.revealedUntil < t) continue;
          const rx = e.x - tw.x, rz = e.z - tw.z;
          const along = rx * s.dirx + rz * s.dirz;
          if (along < 0 || along > len) continue;
          const across = Math.abs(rx * s.dirz - rz * s.dirx);
          if (across <= w + e.def.radius * 0.5) {
            if (this.deflects('horn', e) && !s.solo) {
              this.emit({ t, type: 'deflect', enemy: e, shot: s });
              continue;
            }
            this.damage(e, s.damage, 'sonic', tw, t);
            s.hits.push(e.id);
          }
        }
        break;
      }
    }
    this.emit({ t, type: 'impact', shot: s, hit: s.hits.length > 0 });
  }

  private nearestAlive(x: number, z: number, r: number, tw: Tower, t: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = r * r;
    for (const e of this.enemies) {
      if (!e.alive || e.burrowed || !this.targetable(tw, e, t, 999)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** a crystal arc jumping from one creature to the next */
  private chain(tw: Tower, first: Enemy, damage: number, n: number, jump: number, chill: { slow: number; beats: number } | null, t: number, hits: number[]) {
    let cur: Enemy = first;
    let dmg = damage;
    const hit = new Set<number>();
    for (let i = 0; i < n; i++) {
      hit.add(cur.id);
      hits.push(cur.id);
      if (chill && !cur.def.steady && !cur.def.boss) {
        cur.slow = Math.min(cur.slowUntil > t ? cur.slow : 1, chill.slow);
        cur.slowUntil = Math.max(cur.slowUntil, t + chill.beats * this.spb);
      }
      this.damage(cur, dmg, 'arc', tw, t);
      dmg *= 0.75;
      let next: Enemy | null = null;
      let bd = jump * jump;
      for (const e of this.enemies) {
        if (!e.alive || hit.has(e.id) || e.burrowed) continue;
        if (e.def.camo && e.revealedUntil < t) continue;
        const d2 = (e.x - cur.x) ** 2 + (e.z - cur.z) ** 2;
        if (d2 < bd) {
          bd = d2;
          next = e;
        }
      }
      if (!next) break;
      cur = next;
    }
  }

  /** groundwork: a creature trips and stops for a moment (false: it does not) */
  private stumble(e: Enemy, beats: number, t: number): boolean {
    if (e.def.steady || e.flying) return false;
    const dur = beats * this.spb * (e.def.boss ? 0.25 : 1);
    if (e.stunUntil > t + dur * 0.5) return false;
    e.stunUntil = Math.max(e.stunUntil, t + dur);
    return true;
  }

  private findShield(e: Enemy): Enemy | null {
    if (e.shield > 0) return e;
    for (const o of this.enemies) {
      if (!o.alive || o.shield <= 0) continue;
      if (this.dist2(o, e) <= 2.6 * 2.6) return o;
    }
    return null;
  }

  damage(e: Enemy, amount: number, type: DamageType, tw: Tower | null, t: number) {
    if (!e.alive || amount <= 0) return;
    if (e.invulnUntil > t) return;
    let a = amount;
    if (type !== 'bass' && type !== 'bell') a *= 1 - e.armor;
    let shielded = 0;
    const s = this.findShield(e);
    if (s) {
      shielded = Math.min(s.shield, a);
      s.shield -= shielded;
      a -= shielded;
    }
    const dealt = Math.min(e.hp, a);
    e.hp -= a;
    e.hitT = t;
    if (tw) {
      tw.damage += dealt + shielded;
      this.stats.damageByKind[tw.kind] = (this.stats.damageByKind[tw.kind] ?? 0) + dealt + shielded;
      if (!e.structure) this.chargeSolo(tw, (dealt + shielded) / this.soloNeed(tw), t);
    }
    if (this.ffDropT === null && !e.structure) this.ff = Math.min(1, this.ff + ((dealt + shielded) / this.ffNeed) * (1 + RHYTHM.grooveFF * this.groove));
    this.emit({ t, type: 'damage', enemy: e, amount: dealt, shielded, hp: Math.max(0, e.hp) / e.maxHp, shield: s && s.maxShield > 0 ? s.shield / s.maxShield : 0, shieldOwner: s ? s.id : 0 });
    if (e.def.boss) this.bossDamaged(e, t);
    if (e.hp <= 0.0001) this.kill(e, t, tw);
  }

  private kill(e: Enemy, t: number, tw: Tower | null) {
    if (!e.alive) return;
    e.alive = false;
    this.anyDead = true;
    const bounty = e.bounty;
    this.coins += bounty;
    this.stats.earned += bounty;
    if (!e.structure) this.stats.kills++;
    if (tw) tw.kills++;
    this.emit({ t, type: 'death', enemy: e, bounty });
    if (e.def.split) {
      for (let i = 0; i < e.def.split.count; i++) {
        const a = (i / e.def.split.count) * Math.PI * 2;
        this.addEnemy(e.def.split.kind, e.x + Math.cos(a) * 0.9, e.z + Math.sin(a) * 0.9, 1, e.wave, t);
      }
    }
    // an Echo comes back once, weaker, one bar later
    if (e.def.echo && !e.echoed) {
      this.respawns.push({ t: t + this.barDur, kind: e.kind, x: e.x, z: e.z, hp: e.def.echo * (e.maxHp / (e.def.hp * this.hpScale)), wave: e.wave, elite: e.elite });
      this.respawns.sort((a, b) => a.t - b.t);
    }
    if (e.kind === 'silence') {
      for (const o of this.enemies) if (o.alive) {
        o.alive = false;
        this.emit({ t, type: 'death', enemy: o, bounty: 0 });
      }
      this.spawnQueue.length = 0;
      this.respawns.length = 0;
    }
  }

  private ffDrop(t: number) {
    this.ffDropT = null;
    this.ffBoostUntil = t + this.barDur * 2;
    const hits: number[] = [];
    const T = this.turtle;
    for (const e of this.enemies) {
      if (!e.alive || e.burrowed) continue;
      const d = Math.hypot(e.x - T.x, e.z - T.z);
      if (d > 18) continue;
      hits.push(e.id);
      const dmg = e.def.boss ? 200 + e.maxHp * 0.04 : 70 + e.maxHp * 0.18;
      if (!e.def.boss && !e.structure) {
        const k = 9 * (1 - d / 22);
        e.kx += ((e.x - T.x) / (d || 1)) * k;
        e.kz += ((e.z - T.z) / (d || 1)) * k;
        if (!e.def.steady) {
          e.slow = 0.5;
          e.slowUntil = Math.max(e.slowUntil, t + this.barDur);
        }
      }
      this.damage(e, dmg, 'bass', null, t);
    }
    this.emit({ t, type: 'ffDrop', hits });
  }

  // ───────────────────────────── guardians ─────────────────────────────

  private summon(e: Enemy, kind: EnemyKind, n: number, t: number, hp = 1, spread = 1.4) {
    for (let i = 0; i < n; i++) {
      const a = e.orbit + Math.atan2(this.turtle.dz, this.turtle.dx) + Math.PI + (i - (n - 1) / 2) * 0.5;
      // they come out of the guardian, on the colossus' side
      const r = e.def.radius + 0.6;
      this.addEnemy(kind, e.x + Math.cos(a) * r + (i - (n - 1) / 2) * spread * 0.3, e.z + Math.sin(a) * r, hp, -1, t);
    }
  }

  private bossBar(e: Enemy, t: number) {
    const age = Math.round((t - e.spawnT) / this.barDur);
    // stalking ends when the colossus stops at the end of the road (or the guardian tires of waiting)
    if (!e.charging && (this.halted || age >= 48)) {
      e.charging = true;
      this.emit({ t, type: 'boss', enemy: e, action: 'charge' });
    }
    switch (e.kind) {
      case 'bossBlot':
        if (age > 0 && age % 2 === 0) {
          this.summon(e, 'blotling', e.phase >= 2 ? 5 : 3, t);
          this.emit({ t, type: 'boss', enemy: e, action: 'summon' });
        }
        break;
      case 'bossScarab':
        if (e.burrowed) {
          e.burrowed = false;
          this.emit({ t, type: 'boss', enemy: e, action: 'emerge' });
        } else if (age > 0 && age % 4 === 0 && !e.charging) {
          e.burrowed = true;
          this.emit({ t, type: 'boss', enemy: e, action: 'burrow' });
        } else if (age > 0 && age % 4 === 2) {
          this.summon(e, e.phase >= 1 ? 'scorpion' : 'echo', 2, t, 0.8);
          this.emit({ t, type: 'boss', enemy: e, action: 'summon' });
        }
        break;
      case 'bossMoth':
        if (age > 0 && age % 4 === 2) {
          const near = this.towers
            .filter((tw) => this.dist2(tw, e) <= 18 * 18 && tw.frozenUntil <= t)
            .sort((a, b) => this.dist2(a, e) - this.dist2(b, e))
            .slice(0, e.phase >= 2 ? 3 : 2);
          for (const tw of near) tw.frozenUntil = t + this.barDur * 2;
          if (near.length) this.emit({ t, type: 'boss', enemy: e, action: 'freeze', towers: near.map((x) => x.id) });
        } else if (age > 0 && age % 3 === 0) {
          this.summon(e, 'moth', e.phase >= 1 ? 4 : 3, t);
          this.emit({ t, type: 'boss', enemy: e, action: 'summon' });
        }
        break;
      case 'bossGolem':
        if (age > 0 && age % 3 === 0) {
          this.summon(e, 'ember', 4 + e.phase, t);
          this.emit({ t, type: 'boss', enemy: e, action: 'summon' });
        }
        break;
      case 'silence':
        if (age > 0 && age % 4 === 0) {
          this.summon(e, 'phantom', 4, t, 1.3, 2);
          this.summon(e, 'moth', 2, t, 1.5, 3);
          this.emit({ t, type: 'boss', enemy: e, action: 'summon' });
        }
        break;
    }
  }

  private bossDamaged(e: Enemy, t: number) {
    const f = e.hp / e.maxHp;
    if (e.kind === 'bossGolem') {
      const plates = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
      if (plates > e.phase) {
        e.phase = plates;
        e.armor = [0.55, 0.4, 0.25, 0.1][plates];
        this.emit({ t, type: 'boss', enemy: e, action: 'plates' });
        if (plates === 1) this.summon(e, 'shield', 2, t, 1.2);
        if (plates === 2) {
          this.summon(e, 'mender', 1, t, 1.2);
          this.summon(e, 'shield', 2, t, 1.2);
        }
        if (plates === 3) this.summon(e, 'slug', 1, t, 0.8);
      }
      return;
    }
    if (e.kind === 'silence') {
      const phase = f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
      if (phase > e.phase && e.hp > 0) {
        e.phase = phase;
        e.invulnUntil = t + this.barDur * 2;
        const hit: number[] = [];
        for (const tw of this.towers) {
          tw.frozenUntil = Math.max(tw.frozenUntil, t + this.barDur);
          hit.push(tw.id);
        }
        // it steals the band's most common instrument for a while
        const kind = this.mostCommon(new Set());
        if (kind) this.stolen = { kind, until: t + this.barDur * 6 };
        this.emit({ t, type: 'boss', enemy: e, action: 'phase', towers: hit });
        // and calls its court from both flanks (kind, side)
        const court: [EnemyKind, number][] = phase === 1
          ? [['muffler', -1], ['muffler', 1], ['mimic', -1]]
          : [['knight', -1], ['knight', 1], ['conductor', 1], ['mimic', -1]];
        const T = this.turtle;
        const heading = Math.atan2(T.dz, T.dx);
        court.forEach(([k, side], i) => {
          this.spawnQueue.push({ t: t + (i + 1) * this.spb * 2, kind: k, angle: heading + side * 1.6, dist: 30, hp: 1.1, wave: -1, elite: false });
        });
        this.spawnQueue.sort((a, b) => a.t - b.t);
        this.updateMutes(t);
      }
      return;
    }
    // the other guardians: a turn at two thirds and at one third of their song
    const phase = f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
    if (phase > e.phase && e.hp > 0) {
      e.phase = phase;
      this.emit({ t, type: 'boss', enemy: e, action: 'phase' });
      if (e.kind === 'bossBlot') {
        if (phase === 1) this.summon(e, 'bubble', 2, t, 1, 3);
        else this.summon(e, 'scurry', 6, t, 1, 2);
      } else if (e.kind === 'bossScarab') {
        this.summon(e, 'whirl', 2, t, 1, 3);
        this.summon(e, 'scorpion', phase, t, 1, 3);
      } else if (e.kind === 'bossMoth') {
        this.summon(e, 'phantom', 3 + phase, t, 1, 3);
      }
    }
  }

  // ───────────────────────────── end ─────────────────────────────

  private checkEnd(t: number) {
    if (this.outcome !== 'playing' || this.mode === 'endless') return;
    if (!this.arrived) return;
    // arrival: the landmark rings and the Silence around it scatters
    for (const e of this.enemies) {
      if (e.alive) {
        e.alive = false;
        this.emit({ t, type: 'death', enemy: e, bounty: 0 });
      }
    }
    this.spawnQueue.length = 0;
    this.respawns.length = 0;
    this.outcome = 'victory';
    this.emit({ t, type: 'victory' });
  }

  stars(): number {
    if (this.outcome !== 'victory') return 0;
    const lost = this.maxLives - this.lives;
    if (lost <= Math.floor(this.maxLives * 0.1)) return 3;
    if (lost <= Math.floor(this.maxLives * 0.5)) return 2;
    return 1;
  }

  /** A short fingerprint of the state (tests: replays must match the live journey exactly). */
  fingerprint(): string {
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    const en = this.enemies.filter((e) => e.alive).map((e) => `${e.id}:${e.kind}:${r(e.x)},${r(e.z)}:${r(e.hp)}`).join('|');
    const tw = this.towers.map((t) => `${t.id}:${t.kind}${t.level}@${t.slot}:${t.muted ? 'm' : ''}:${r(t.damage)}:${r(t.solo)}${t.soloFrom >= 0 ? 's' : ''}`).join('|');
    return `g${this.groove} e${this.stats.echoes} so${this.stats.solos} t${this.sub} s${r(this.turtle.s)} c${this.coins} l${this.lives} ff${r(this.ff)} o${this.outcome} k${this.stats.kills} p${this.slotsOpen} h${this.band.harmony} d${this.band.duets.length} n${this.nextId} [${tw}] [${en}]`;
  }

  private dist2(a: { x: number; z: number }, b: { x: number; z: number }) {
    return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  }
}
