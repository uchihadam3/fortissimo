/**
 * The journey simulation: a colossus walks a route to a landmark while creatures of the Silence
 * come at it from the land around. Towers stand on the plates of its shell and fire on the 16th
 * notes of the song. Pure logic: deterministic and runnable headless for balancing.
 *
 * Time is song time in seconds (0 = first downbeat). Everything that matters happens on the grid of
 * 16th-note steps; between steps, enemies and the colossus move continuously.
 */
import {
  ENEMIES, TOWERS, SELL_REFUND, STEPS_PER_BAR, MAX_LIVES,
  type EnemyDef, type EnemyKind, type TowerKind, type DamageType, type WorldId, type SongId,
} from './defs';
import { JourneyPath } from './path';
import { SLOTS, SHELL_REACH } from './shell';
import { Rng } from '../core/rng';

export type Mode = 'normal' | 'virtuoso' | 'endless';
export type FeatureKind = 'canyon' | 'river' | 'lake' | 'forest' | 'hills' | 'ruins' | 'meadow';
export type TutorialId = 'basics' | 'upgrade' | 'ff' | 'pickup' | 'sides';
export type LandmarkKind = 'bell' | 'chimes' | 'organ' | 'harp' | 'spire';

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
}

export interface JWave {
  /** bar of the journey (0 = the bar the colossus starts walking) */
  bar: number;
  groups: JGroup[];
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
  slots: number;
  coins: number;
  lives?: number;
  towers: TowerKind[];
  waves: JWave[];
  features: Feature[];
  pickups?: number;
  obelisks?: { s: number; side: number; dist?: number }[];
  boss?: { kind: EnemyKind; bar: number };
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
}

export interface Tower {
  id: number;
  kind: TowerKind;
  level: number;
  slot: number;
  x: number;
  z: number;
  spent: number;
  muted: boolean;
  frozenUntil: number;
  aim: number;
  buff: number;
  damage: number;
  kills: number;
  builtT: number;
  shots: number;
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
}

export interface Pickup {
  id: number;
  x: number;
  z: number;
  s: number;
  value: number;
  taken: boolean;
  lost: boolean;
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
  | { t: number; type: 'muted'; tower: Tower; muted: boolean }
  | { t: number; type: 'heal'; enemy: Enemy; targets: number[] }
  | { t: number; type: 'waveWarn'; index: number; dirs: { dir: number; kinds: EnemyKind[]; count: number }[]; at: number }
  | { t: number; type: 'waveStart'; index: number; total: number }
  | { t: number; type: 'boss'; enemy: Enemy; action: 'summon' | 'burrow' | 'emerge' | 'freeze' | 'plates' | 'phase'; towers?: number[] }
  | { t: number; type: 'ffDrop'; hits: number[] }
  | { t: number; type: 'ffReady' }
  | { t: number; type: 'collect'; pickup: Pickup }
  | { t: number; type: 'pickupLost'; pickup: Pickup }
  | { t: number; type: 'start' }
  | { t: number; type: 'halt'; on: boolean }
  | { t: number; type: 'arrive' }
  | { t: number; type: 'victory' }
  | { t: number; type: 'defeat' };

export interface SimStats {
  kills: number;
  leaks: number;
  earned: number;
  spent: number;
  collected: number;
  pickups: number;
  damageByKind: Partial<Record<TowerKind, number>>;
  ffUses: number;
}

const BEATS_PER_BAR = 4;
export const DEFAULT_SPEED = 0.42;

export class Journey {
  readonly path: JourneyPath;
  readonly spb: number;
  readonly stepDur: number;
  readonly barDur: number;
  readonly speed: number;
  readonly length: number;
  time = 0;
  step = 0;
  coins: number;
  lives: number;
  readonly maxLives: number;
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  shots: Shot[] = [];
  pickups: Pickup[] = [];
  events: SimEvent[] = [];
  stats: SimStats = { kills: 0, leaks: 0, earned: 0, spent: 0, collected: 0, pickups: 0, damageByKind: {}, ffUses: 0 };
  /** the colossus */
  turtle = { s: 0, x: 0, z: 0, dx: 0, dz: -1 };
  walking = false;
  halted = false;
  /** bar at which the walk began (null: still waiting for the player) */
  startBar: number | null = null;
  started = false;
  outcome: 'playing' | 'victory' | 'defeat' = 'playing';
  readonly waves: { bar: number; groups: JGroup[] }[];
  /** waves whose warning / start has been emitted */
  private warned = new Set<number>();
  private begun = new Set<number>();
  private spawnQueue: { t: number; kind: EnemyKind; angle: number; dist: number; hp: number; wave: number }[] = [];
  ff = 0;
  ffNeed: number;
  ffDropT: number | null = null;
  ffBoostUntil = 0;
  private ffWasReady = false;
  private nextId = 1;
  readonly hpScale: number;
  readonly mode: Mode;
  private rng: Rng;
  readonly slotsOpen: number;
  private bossSpawned = false;
  private arrived = false;
  readonly stopS: number;

  constructor(readonly def: JourneyDef, bpm: number, opts: { mode?: Mode; path?: JourneyPath } = {}) {
    this.spb = 60 / bpm;
    this.stepDur = this.spb / 4;
    this.barDur = this.spb * BEATS_PER_BAR;
    this.speed = def.speed ?? DEFAULT_SPEED;
    this.length = def.bars * BEATS_PER_BAR * this.speed;
    this.path = opts.path ?? new JourneyPath(this.length, def.seed ?? 7, def.curviness ?? 1);
    this.mode = opts.mode ?? 'normal';
    const virt = this.mode === 'virtuoso';
    this.hpScale = virt ? 1.6 : 1;
    this.coins = Math.round(def.coins * (virt ? 0.9 : 1));
    this.maxLives = virt ? 10 : def.lives ?? MAX_LIVES;
    this.lives = this.maxLives;
    this.slotsOpen = Math.min(SLOTS.length, def.slots);
    this.waves = def.waves.slice().sort((a, b) => a.bar - b.bar);
    this.rng = new Rng((def.seed ?? 7) * 977 + 13);
    this.stopS = this.length - 16;
    let total = 0;
    for (const w of def.waves) for (const g of w.groups) total += ENEMIES[g.kind].hp * (g.hp ?? 1) * g.count;
    this.ffNeed = Math.max(400, Math.min(6000, total * 0.22)) * this.hpScale;
    this.placeTurtle();
    // pickups along the way
    const n = def.pickups ?? Math.round(def.bars / 6);
    const pr = new Rng((def.seed ?? 7) * 31 + 5);
    for (let i = 0; i < n; i++) {
      const s = 18 + ((this.length - 30) * (i + pr.next() * 0.6)) / Math.max(1, n);
      const p = this.path.at(s);
      const side = pr.chance(0.5) ? 1 : -1;
      const off = pr.range(6, 15) * side;
      this.pickups.push({ id: this.nextId++, x: p.x - p.dz * off, z: p.z + p.dx * off, s, value: pr.int(8, 14), taken: false, lost: false });
    }
    // obelisks of the Silence
    for (const o of def.obelisks ?? []) {
      const p = this.path.at(o.s);
      const off = (o.dist ?? 11) * o.side;
      this.addEnemy('obelisk', p.x - p.dz * off, p.z + p.dx * off, 1, -1, 0);
    }
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

  // ───────────────────────────── player actions ─────────────────────────────

  canBuild(slot: number, kind: TowerKind): boolean {
    return this.outcome === 'playing' && slot < this.slotsOpen && !this.towerAt(slot) && this.def.towers.includes(kind) && this.coins >= TOWERS[kind].levels[0].cost;
  }

  build(slot: number, kind: TowerKind): Tower | null {
    if (!this.canBuild(slot, kind)) return null;
    const cost = TOWERS[kind].levels[0].cost;
    this.coins -= cost;
    this.stats.spent += cost;
    const p = this.slotPos(slot);
    const t: Tower = {
      id: this.nextId++, kind, level: 0, slot, x: p.x, z: p.z, spent: cost, muted: false, frozenUntil: 0,
      aim: Math.atan2(this.turtle.dz, this.turtle.dx), buff: 1, damage: 0, kills: 0, builtT: this.time, shots: 0,
    };
    this.towers.push(t);
    this.recomputeBuffs();
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
    this.recomputeBuffs();
    return true;
  }

  sellValue(t: Tower): number {
    const fresh = this.time - t.builtT < 2.5 && !this.started;
    return Math.floor(t.spent * (fresh ? 1 : SELL_REFUND));
  }

  sell(t: Tower): number {
    const v = this.sellValue(t);
    this.coins += v;
    this.towers = this.towers.filter((x) => x !== t);
    this.recomputeBuffs();
    return v;
  }

  /** The colossus sets off (first press of ▶). */
  begin(): boolean {
    if (this.started || this.outcome !== 'playing') return false;
    this.started = true;
    this.startBar = this.bar + 1;
    return true;
  }

  collect(id: number): number {
    const p = this.pickups.find((x) => x.id === id);
    if (!p || p.taken || p.lost || this.outcome !== 'playing') return 0;
    p.taken = true;
    this.coins += p.value;
    this.stats.earned += p.value;
    this.stats.collected++;
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
    return [start, drop];
  }

  // ───────────────────────────── simulation ─────────────────────────────

  advance(to: number): void {
    if (this.outcome !== 'playing') {
      this.time = Math.max(this.time, to);
      return;
    }
    let guard = 0;
    while (this.outcome === 'playing') {
      const ts = this.stepTime(this.step);
      if (ts > to + 1e-9) break;
      this.integrate(ts - this.time);
      this.time = ts;
      this.processStep(this.step);
      this.step++;
      if (++guard > 100000) break;
    }
    if (this.outcome === 'playing' && to > this.time) {
      this.integrate(to - this.time);
      this.time = to;
    }
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
    if (dt <= 0) return;
    // the colossus walks once the walk began (and not before its first bar line)
    const walk = this.startBar !== null && this.time >= this.startBar * this.barDur - 1e-9 && !this.arrived;
    if (walk !== this.walking) this.walking = walk;
    const boss = this.bossAlive();
    const mustHalt = !!boss && this.turtle.s >= this.stopS;
    if (mustHalt !== this.halted) {
      this.halted = mustHalt;
      this.emit({ t: this.time, type: 'halt', on: mustHalt });
    }
    if (this.walking && !this.halted) {
      this.turtle.s = Math.min(this.length, this.turtle.s + (this.speed / this.spb) * dt);
      this.placeTurtle();
    }
    const T = this.turtle;
    // enemies run at the colossus
    const n = this.enemies.length;
    for (let i = 0; i < n; i++) {
      const e = this.enemies[i];
      if (!e.alive || e.structure) continue;
      let mult = 1;
      if (e.slowUntil > this.time) {
        const part = Math.min(dt, e.slowUntil - this.time) / dt;
        mult = part * e.slow + (1 - part);
      }
      if (e.burrowed) mult *= 1.6;
      let vx = T.x - e.x, vz = T.z - e.z;
      const d = Math.hypot(vx, vz) || 1;
      if (e.kind === 'silence' && d < 11) {
        // it looms over the colossus at arm's length and drifts back as it walks
        mult = -((this.speed / this.spb) * 1.1) / Math.max(0.01, e.speed) * Math.min(1, (11 - d) / 1.5);
      }
      vx /= d;
      vz /= d;
      // keep a little apart from neighbours
      let sx = 0, sz = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = this.enemies[j];
        if (!o.alive || o.structure || o.flying !== e.flying) continue;
        const ox = e.x - o.x, oz = e.z - o.z;
        const dd = ox * ox + oz * oz;
        const min = (e.def.radius + o.def.radius) * 0.9;
        if (dd < min * min && dd > 1e-6) {
          const l = Math.sqrt(dd);
          sx += (ox / l) * (min - l);
          sz += (oz / l) * (min - l);
        }
      }
      const sp = e.speed * mult;
      if (e.def.boss) {
        // bosses are not pushed around
        sx = 0;
        sz = 0;
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

  private leak(e: Enemy, t: number) {
    e.alive = false;
    e.leaked = true;
    const lives = e.def.lives;
    this.lives = Math.max(0, this.lives - lives);
    this.stats.leaks += lives;
    this.emit({ t, type: 'leak', enemy: e, lives });
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
      this.addEnemy(s.kind, T.x + Math.cos(s.angle) * s.dist, T.z + Math.sin(s.angle) * s.dist, s.hp, s.wave, t);
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
    for (const tw of this.towers) {
      if (tw.kind !== 'choir' || tw.muted) continue;
      const r = TOWERS.choir.levels[tw.level].range + 6;
      for (const e of this.enemies) if (e.alive && this.dist2(tw, e) <= r * r) e.revealedUntil = Math.max(e.revealedUntil, t + this.stepDur * 2);
    }
    this.updateMutes(t);
    for (const tw of this.towers) this.towerStep(tw, k, t);
    if (this.ffDropT !== null && t >= this.ffDropT - 1e-9) this.ffDrop(t);
    if (!this.ffWasReady && this.ff >= 1 && this.ffDropT === null) {
      this.ffWasReady = true;
      this.emit({ t, type: 'ffReady' });
    }
    this.checkEnd(t);
  }

  private onBar(bar: number, t: number) {
    if (this.startBar !== null && bar === this.startBar) this.emit({ t, type: 'start' });
    const jb = this.startBar === null ? null : bar - this.startBar;
    if (jb !== null) {
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
        this.addEnemy(this.def.boss.kind, T.x + Math.cos(a) * 34, T.z + Math.sin(a) * 34, 1, -2, t);
      }
    }
    // economy (only once the journey is under way)
    if (this.walking && this.outcome === 'playing') {
      for (const tw of this.towers) {
        if (tw.kind !== 'shaker' || tw.muted) continue;
        const inc = TOWERS.shaker.levels[tw.level].income ?? 0;
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
    for (const e of this.enemies) if (e.alive && e.def.boss) this.bossBar(e, t);
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
        this.spawnQueue.push({ t: q, kind: g.kind, angle: ang, dist: g.dist ?? 34, hp: g.hp ?? 1, wave: i });
      }
    });
    this.spawnQueue.sort((a, b) => a.t - b.t);
    this.emit({ t, type: 'waveStart', index: i, total: this.waves.length });
  }

  private addEnemy(kind: EnemyKind, x: number, z: number, hpMul: number, wave: number, t: number): Enemy {
    const def = ENEMIES[kind];
    const hp = def.hp * hpMul * this.hpScale;
    const e: Enemy = {
      id: this.nextId++, kind, def, hp, maxHp: hp, shield: (def.shield ?? 0) * this.hpScale, maxShield: (def.shield ?? 0) * this.hpScale,
      armor: def.armor, x, z, speed: def.speed * (this.mode === 'virtuoso' ? 1.08 : 1), flying: def.flying, slow: 1, slowUntil: 0,
      revealedUntil: 0, alive: true, leaked: false, spawnT: t, burrowed: false, invulnUntil: 0, phase: 0, hitT: -1, wave,
      structure: kind === 'obelisk', kx: 0, kz: 0,
    };
    this.enemies.push(e);
    this.emit({ t, type: 'spawn', enemy: e });
    return e;
  }

  // ───────────────────────────── towers ─────────────────────────────

  private recomputeBuffs() {
    for (const tw of this.towers) tw.buff = 1;
    for (const c of this.towers) {
      if (c.kind !== 'choir') continue;
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
    for (const tw of this.towers) {
      let m = tw.frozenUntil > t;
      if (!m) {
        for (const e of mutes) {
          const r = e.def.mute!;
          if (this.dist2(tw, e) <= r * r) {
            m = true;
            break;
          }
        }
      }
      if (m !== tw.muted) {
        tw.muted = m;
        this.emit({ t, type: 'muted', tower: tw, muted: m });
      }
    }
  }

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

  /** The most dangerous: closest to the shell. Structures only when nothing else is in range. */
  private pickTarget(tw: Tower, t: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const T = this.turtle;
    for (const e of this.enemies) {
      if (!this.targetable(tw, e, t, range)) continue;
      const score = Math.hypot(T.x - e.x, T.z - e.z) + (e.structure ? 1000 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private towerStep(tw: Tower, k: number, t: number) {
    const def = TOWERS[tw.kind];
    const L = def.levels[tw.level];
    if (L.pattern[k % L.pattern.length] !== 'x') return;
    if (tw.muted) return;
    const boost = t < this.ffBoostUntil ? 1.6 : 1;
    const dmg = L.damage * tw.buff * boost;
    const range = this.rangeOf(tw);
    switch (tw.kind) {
      case 'shaker':
        if (this.walking && this.aliveCount() + this.spawnQueue.length > 0) this.emit({ t, type: 'pulse', tower: tw, hits: [] });
        return;
      case 'choir':
        if (this.aliveCount() > 0) this.emit({ t, type: 'pulse', tower: tw, hits: [] });
        return;
      case 'bell': {
        const hits: number[] = [];
        for (const e of this.enemies) {
          if (!e.alive || e.burrowed || e.structure) continue;
          const r = range + e.def.radius * 0.5;
          if (this.dist2(tw, e) > r * r) continue;
          hits.push(e.id);
        }
        if (!hits.length) return;
        for (const id of hits) {
          const e = this.enemyById(id)!;
          e.revealedUntil = Math.max(e.revealedUntil, t + (L.slowBeats ?? 4) * this.spb);
          if (!e.def.boss || e.kind === 'bossBlot') {
            const s = e.def.boss ? Math.min(0.85, (L.slow ?? 1) + 0.25) : L.slow ?? 1;
            e.slow = Math.min(e.slowUntil > t ? e.slow : 1, s);
            e.slowUntil = Math.max(e.slowUntil, t + (L.slowBeats ?? 4) * this.spb);
          }
          this.damage(e, dmg, 'bell', tw, t);
        }
        tw.shots++;
        this.emit({ t, type: 'pulse', tower: tw, hits });
        return;
      }
    }
    const target = this.pickTarget(tw, t, range);
    if (!target) return;
    tw.aim = Math.atan2(target.z - tw.z, target.x - tw.x);
    tw.shots++;
    const flight = L.flight;
    // lead the target toward where it will be
    const leadT = flight * this.stepDur;
    const T = this.turtle;
    let lx = target.x, lz = target.z;
    if (!target.structure) {
      const dx = T.x - target.x, dz = T.z - target.z;
      const dl = Math.hypot(dx, dz) || 1;
      const sp = target.speed * (target.slowUntil > t ? target.slow : 1);
      lx += (dx / dl) * sp * leadT;
      lz += (dz / dl) * sp * leadT;
    }
    const shot: Shot = {
      id: this.nextId++, tower: tw, kind: tw.kind, level: tw.level, targetId: target.id,
      tx: lx, tz: lz, launchT: t, impactT: t + flight * this.stepDur, damage: dmg,
      dirx: Math.cos(tw.aim), dirz: Math.sin(tw.aim), hits: [], done: false,
    };
    this.shots.push(shot);
    this.emit({ t, type: 'fire', shot });
    if (flight === 0) this.resolve(shot, t);
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
        if (d < bd && (s.kind === 'drum' || this.targetable(tw, e, t, 999))) {
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
      case 'harp':
      case 'bass':
        if (target && (s.kind !== 'bass' || !target.flying)) {
          this.damage(target, s.damage, TOWERS[s.kind].damageType, tw, t);
          s.hits.push(target.id);
        }
        break;
      case 'drum': {
        const r = L.area ?? 2.5;
        for (const e of this.enemies) {
          if (!e.alive || e.flying || e.burrowed) continue;
          const d2 = (e.x - s.tx) ** 2 + (e.z - s.tz) ** 2;
          const rr = r + e.def.radius * 0.5;
          if (d2 <= rr * rr) {
            const fall = 1 - (0.35 * Math.sqrt(d2)) / (rr + 0.01);
            this.damage(e, s.damage * fall, 'blast', tw, t);
            s.hits.push(e.id);
          }
        }
        break;
      }
      case 'crystal': {
        if (!target) break;
        const n = L.chain ?? 3;
        let cur: Enemy = target;
        let dmg = s.damage;
        const hit = new Set<number>();
        for (let i = 0; i < n; i++) {
          hit.add(cur.id);
          s.hits.push(cur.id);
          this.damage(cur, dmg, 'arc', tw, t);
          dmg *= 0.82;
          let next: Enemy | null = null;
          let bd = 5 * 5;
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
        break;
      }
      case 'horn': {
        const len = this.rangeOf(tw) + 1;
        const w = L.area ?? 1.4;
        for (const e of this.enemies) {
          if (!e.alive || e.burrowed) continue;
          if (e.def.camo && e.revealedUntil < t) continue;
          const rx = e.x - tw.x, rz = e.z - tw.z;
          const along = rx * s.dirx + rz * s.dirz;
          if (along < 0 || along > len) continue;
          const across = Math.abs(rx * s.dirz - rz * s.dirx);
          if (across <= w + e.def.radius * 0.5) {
            this.damage(e, s.damage, 'sonic', tw, t);
            s.hits.push(e.id);
          }
        }
        break;
      }
    }
    this.emit({ t, type: 'impact', shot: s, hit: s.hits.length > 0 });
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
    }
    if (this.ffDropT === null && !e.structure) this.ff = Math.min(1, this.ff + (dealt + shielded) / this.ffNeed);
    this.emit({ t, type: 'damage', enemy: e, amount: dealt, shielded, hp: Math.max(0, e.hp) / e.maxHp, shield: s && s.maxShield > 0 ? s.shield / s.maxShield : 0, shieldOwner: s ? s.id : 0 });
    if (e.def.boss) this.bossDamaged(e, t);
    if (e.hp <= 0.0001) this.kill(e, t, tw);
  }

  private kill(e: Enemy, t: number, tw: Tower | null) {
    if (!e.alive) return;
    e.alive = false;
    const bounty = e.def.bounty;
    this.coins += bounty;
    this.stats.earned += bounty;
    if (!e.structure) this.stats.kills++;
    if (tw) tw.kills++;
    this.emit({ t, type: 'death', enemy: e, bounty });
    if (e.def.split) {
      for (let i = 0; i < e.def.split.count; i++) {
        const a = (i / e.def.split.count) * Math.PI * 2;
        this.addEnemy(e.def.split.kind, e.x + Math.cos(a) * 0.9, e.z + Math.sin(a) * 0.9, 1, -1, t);
      }
    }
    if (e.kind === 'silence') {
      for (const o of this.enemies) if (o.alive) {
        o.alive = false;
        this.emit({ t, type: 'death', enemy: o, bounty: 0 });
      }
      this.spawnQueue.length = 0;
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
      if (d > 19) continue;
      hits.push(e.id);
      const dmg = e.def.boss ? 250 + e.maxHp * 0.06 : 120 + e.maxHp * 0.25;
      if (!e.def.boss && !e.structure) {
        const k = 9 * (1 - d / 22);
        e.kx += ((e.x - T.x) / (d || 1)) * k;
        e.kz += ((e.z - T.z) / (d || 1)) * k;
        e.slow = 0.5;
        e.slowUntil = Math.max(e.slowUntil, t + this.barDur);
      }
      this.damage(e, dmg, 'bass', null, t);
    }
    this.emit({ t, type: 'ffDrop', hits });
  }

  // ───────────────────────────── bosses ─────────────────────────────

  private bossBar(e: Enemy, t: number) {
    const age = Math.round((t - e.spawnT) / this.barDur);
    switch (e.kind) {
      case 'bossBlot':
        if (age > 0 && age % 2 === 0) {
          for (let i = 0; i < 3; i++) this.addEnemy('blotling', e.x + (i - 1) * 1.2, e.z + 1.5, 1, -1, t);
          this.emit({ t, type: 'boss', enemy: e, action: 'summon' });
        }
        break;
      case 'bossScarab':
        if (e.burrowed) {
          e.burrowed = false;
          this.emit({ t, type: 'boss', enemy: e, action: 'emerge' });
        } else if (age > 0 && age % 4 === 0) {
          e.burrowed = true;
          this.emit({ t, type: 'boss', enemy: e, action: 'burrow' });
        }
        break;
      case 'bossMoth':
        if (age > 0 && age % 4 === 2) {
          const near = this.towers
            .filter((tw) => this.dist2(tw, e) <= 16 * 16)
            .sort((a, b) => this.dist2(a, e) - this.dist2(b, e))
            .slice(0, 2);
          for (const tw of near) tw.frozenUntil = t + this.barDur * 2;
          if (near.length) this.emit({ t, type: 'boss', enemy: e, action: 'freeze', towers: near.map((x) => x.id) });
        }
        break;
      case 'silence':
        if (age > 0 && age % 4 === 0) {
          for (let i = 0; i < 4; i++) this.addEnemy('phantom', e.x + (i - 1.5) * 2, e.z + 2, 1.3, -1, t);
          for (let i = 0; i < 2; i++) this.addEnemy('moth', e.x + (i - 0.5) * 3, e.z - 2, 1.5, -1, t);
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
        if (plates === 2) for (let i = 0; i < 3; i++) this.addEnemy('scurry', e.x + (i - 1) * 1.5, e.z, 1.2, -1, t);
      }
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
        this.emit({ t, type: 'boss', enemy: e, action: 'phase', towers: hit });
        const kinds: EnemyKind[] = phase === 1 ? ['muffler', 'shield', 'shield'] : ['muffler', 'mender', 'shell', 'shell'];
        const T = this.turtle;
        const heading = Math.atan2(T.dz, T.dx);
        kinds.forEach((k, i) => {
          for (const side of [-1, 1]) {
            this.spawnQueue.push({ t: t + (i + 1) * this.spb * 2, kind: k, angle: heading + side * 1.6, dist: 30, hp: 1.3, wave: -1 });
          }
        });
        this.spawnQueue.sort((a, b) => a.t - b.t);
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

  private dist2(a: { x: number; z: number }, b: { x: number; z: number }) {
    return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  }
}
