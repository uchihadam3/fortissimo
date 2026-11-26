/**
 * A journey battle: the simulation, the 3D view, the HUD and the music clock working together.
 *
 *   songNow  = audio.now() − clock.t0                 (what the audio engine renders)
 *   simTime  = songNow + LEAD − offset                (the simulation runs a little ahead…)
 *   viewTime = songNow − latency − offset             (…so the view shows what you hear)
 * `offset` grows by whole bars after a pause, which keeps the bar phase intact.
 *
 * Checkpoints (v2): the simulation records every player action with the sub-step it happened at.
 * A fallen journey returns `checkpoint` in its result; `new JourneyBattle(…, { …opts, resume: checkpoint })`
 * replays those actions headless up to the start of that movement's breather and plays on live
 * from there (the song restarts on a downbeat that lines up with the checkpoint's bar).
 *
 * The player conducts (v3). Every tap of the baton is judged here, against the beat as it is HEARD:
 *   heard = audio.now() − (input delay from the event's time stamp) − clock.t0 − latency − offset
 * which is the view clock (what you hear), so a tap right on a beat you hear is a perfect one,
 * whatever the device's output latency. The tap itself sounds on the grid point it was judged
 * against (the audio engine's request), so the player's percussion always lands in the music. Only what comes of the taps reaches the simulation, as recorded actions
 * (`setGroove`, `solo`, `echo`), so replays and checkpoints stay exact.
 */
import * as THREE from 'three';
import { audio } from './sound';
import { Journey, type Checkpoint, type JourneyDef, type Mode, type SimEvent } from '../sim/journey';
import { DUETS, SONGS, TOWERS, duetOf, type BandState, type EnemyKind, type TowerKind } from '../sim/defs';
import { SLOT_NEIGHBOURS } from '../sim/shell';
import type { Engine } from '../core/engine';
import { JourneyView, type Pick } from '../view/journeyView';
import { Hud } from '../ui/hud';
import type { BandMix, SongClock } from '../audio/api';
import { JourneyTutorial } from './journeyTutorial';
import { ICON } from '../ui/icons';
import { Groove, RHYTHM, callBars, callPattern, nearestGrid, quality, type TapQuality } from '../sim/rhythm';
import { TowerView } from '../view/towers';
import type { Tower } from '../sim/journey';

const LEAD = 0.07;

export interface BattleResult {
  outcome: 'victory' | 'defeat' | 'quit';
  stars: number;
  lives: number;
  time: number;
  kills: number;
  collected: number;
  /**
   * After a defeat: where the journey can start again (the beginning of the breather before the
   * movement where it fell). Null when it fell in the first movement (only a full restart).
   * Pass it back as `BattleOptions.resume`.
   */
  checkpoint?: Checkpoint | null;
  /** the movement it reached (0-based) and how many there are */
  movement?: number;
  movements?: number;
}

export interface BattleOptions {
  mode: Mode;
  known: TowerKind[];
  seenEnemies: EnemyKind[];
  tutorials: boolean;
  onEnemySeen?: (k: EnemyKind) => void;
  /** start again from a checkpoint (from a previous `BattleResult.checkpoint` of the same level and mode) */
  resume?: Checkpoint;
}

type Sel = { type: 'slot'; id: number } | null;

const bandMix = (b: BandState): BandMix => ({ sections: { ...b.sections }, harmony: b.harmony, duets: b.duets.map((d) => d.id) });
const DUET_COLOR = new Map(DUETS.map((d) => [d.id, d.color]));
/** the groove's colours (baton, sparks on the shell) */
const GROOVE_COLOR = ['#fff2c2', '#ffd36b', '#ffb347', '#ff7ab8', '#9fe8ff'];

/** one of the Maestro's calls in a breather, and the player's echo of it (sim/song seconds) */
interface Call {
  k: number;
  attempt: number;
  callStart: number;
  echoStart: number;
  pattern: number[];
  /** when the Maestro plays each note, and when each echo is due */
  notes: number[];
  targets: number[];
  /** per note: 0 waiting · 2 to echo · 3 echoed right · 4 wrong */
  states: number[];
  scheduled: boolean;
  matched: number;
  wrong: number;
  taps: number;
  won: boolean;
}

/** a charged musician's glow on the shell */
interface Glow {
  g: THREE.Group;
  ring: THREE.Mesh;
  beam: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  beamMat: THREE.MeshBasicMaterial;
}

export class JourneyBattle {
  readonly sim: Journey;
  readonly view: JourneyView;
  readonly hud: Hud;
  private clock: SongClock;
  private offset = 0;
  private paused = false;
  private pausedAtSong = 0;
  private resumeAtSong: number | null = null;
  private sel: Sel = null;
  private ghost: THREE.Mesh | null = null;
  private intensity: 0 | 1 | 2 | 3 = 0;
  /** the movement the music was last told about (breathers announce the next one early) */
  private audioMovement = -1;
  private ended = false;
  private resolveEnd!: (r: BattleResult) => void;
  readonly done: Promise<BattleResult>;
  private lastVt = 0;
  private tutorial: JourneyTutorial | null = null;
  private cardOpen = false;
  private queuedCards: EnemyKind[] = [];
  private removeUpdate: () => void = () => {};
  private disposed = false;
  /** simulation time when the colossus set off (the journey's own clock, unaffected by slow frames) */
  private goSimTime = -1;
  /** incoming waves (from warnings) for the edge arrows */
  private incoming: { index: number; at: number; dirs: { dir: number; kinds: EnemyKind[] }[] }[] = [];
  private bossAnnounced = false;
  private detach: () => void = () => {};
  /** plates that just lit up glow until this view time */
  private plateGlow = new Map<number, number>();
  /** creature kinds already announced on a movement banner */
  private bannered = new Set<EnemyKind>();
  /** started from a checkpoint */
  readonly resumed: boolean;
  /** v3: the player's groove (the baton), the Maestro's calls, the solo glows */
  readonly groove: Groove;
  private calls: Call[] = [];
  private glows = new Map<number, Glow>();
  private soloEnds = new Map<number, number>();
  private soloCineUntil = -1;
  private lastBeat = -1;

  constructor(readonly engine: Engine, readonly def: JourneyDef, readonly opts: BattleOptions, uiRoot: HTMLElement) {
    const song = SONGS[def.song];
    // a checkpoint only replays on the very same journey (an older one simply starts from the beginning)
    this.resumed = Journey.canResume(def, opts.resume);
    this.sim = this.resumed ? Journey.replay(def, song.bpm, opts.resume!) : new Journey(def, song.bpm, { mode: opts.mode });
    // the view builds a pad for every plate the journey will ever open; the locked ones stay hidden
    // until their breather. INTEGRATION: JourneyView could build `sim.slotsMax` pads itself and show
    // them on 'plate' events (then this swap can go).
    const open = this.sim.slotsOpen;
    this.sim.slotsOpen = this.sim.slotsMax;
    this.view = new JourneyView(engine, def, this.sim);
    this.sim.slotsOpen = open;
    this.view.pads.forEach((p, i) => (p.group.visible = i < open));
    engine.setScene(this.view.scene);
    engine.camera.far = 5000;
    engine.camera.fov = 42;
    engine.camera.updateProjectionMatrix();
    this.view.adaptiveFov = true;
    this.view.resetCamera();
    this.view.snapCamera();
    engine.renderer.toneMappingExposure = this.view.look.exposure;
    this.hud = new Hud(uiRoot);
    this.hud.show(true);
    this.hud.setGoal(ICON.bell);
    this.clock = audio.playSong(def.song, { fade: 2.5, restart: this.resumed });
    audio.setIntensity(0);
    audio.setAmbience(def.world, 0.8);
    this.done = new Promise((r) => (this.resolveEnd = r));
    this.hud.onPause = () => this.onPauseRequest();
    this.hud.onFF = () => this.unleash();
    this.hud.onGo = () => this.go();
    this.hud.onHoverTower = (k) => this.previewRange(k);
    this.hud.onBaton = (ts) => this.baton(ts);
    this.hud.showGo(!this.sim.started);
    if (this.resumed) this.restore();
    audio.setBand(bandMix(this.sim.band));
    this.hud.setHarmony(this.sim.band.harmony);
    this.view.setDuets(this.sim.band.duets);
    // the baton: the groove carries over from a checkpoint
    this.groove = new Groove(this.sim.groove);
    audio.setGroove(this.sim.groove);
    this.hud.setGroove(this.groove.level, this.groove.progress);
    TowerView.groove = this.groove.level;
    // with a groove, the colossus stomps harder
    const step = this.view.turtle.onStep;
    this.view.turtle.onStep = (pos, front) => {
      step(pos, front);
      const g = this.groove.level;
      if (g <= 0) return;
      this.view.fx.dust(pos.clone().setY(pos.y + 0.2), this.view.look.land.dirt, 4 * g);
      this.view.shake((front ? 0.025 : 0.015) * g);
      if (g >= 3) this.view.fx.ring(pos.clone().setY(pos.y + 0.15), 1.6 + g * 0.6, GROOVE_COLOR[g], 0.4, 0.08);
    };
    // the first land also gets gentle nudges: an idle player with notes to spend is shown the free plate
    if (opts.tutorials && (def.tutorial?.length || def.world === 'meadow')) {
      this.tutorial = new JourneyTutorial(this, this.resumed ? [] : def.tutorial ?? [], def.world === 'meadow');
    }
    this.removeUpdate = engine.onUpdate((dt, t) => this.update(dt, t));
    // developer handle for automated play-throughs
    if (import.meta.env.DEV) (window as unknown as { __battle: JourneyBattle }).__battle = this;
    this.detach = this.attachInput(engine.renderer.domElement);
  }

  /** a journey replayed from a checkpoint: the view catches up with the simulation */
  private restore() {
    const s = this.sim;
    // the song starts again on a downbeat that lines up with the checkpoint's bar
    this.offset = -s.time;
    this.goSimTime = s.goTime ?? s.time;
    for (const tw of s.towers) this.view.addTower(tw.id, tw.kind, tw.level, tw.slot);
    const evs: SimEvent[] = [];
    for (const e of s.enemies) if (e.alive) evs.push({ t: s.time, type: 'spawn', enemy: e });
    for (const p of s.pickups) if (p.taken || p.lost) evs.push({ t: s.time, type: 'pickupLost', pickup: p });
    for (const tw of s.towers) if (tw.muted) evs.push({ t: s.time, type: 'muted', tower: tw, muted: true, cause: tw.muteCause });
    this.view.push(evs);
    this.lastVt = s.time;
    this.audioMovement = Math.max(0, s.movement);
    audio.movement(this.audioMovement, s.movements.length, this.ctx(s.time));
  }

  onPauseRequest: () => void = () => {};

  // ───────────────────────────── clocks ─────────────────────────────

  private songNow(): number {
    return audio.now() - this.clock.t0;
  }

  ctx(t: number): number {
    return this.clock.t0 + this.offset + t;
  }

  get isPaused() {
    return this.paused;
  }

  /**
   * Run something when the view reaches sim time t (what you see is what you hear). It follows the
   * view clock, so pauses and slow frames keep it in step with the picture.
   */
  private later(t: number, fn: () => void, extraMs = 0) {
    this.pending.push({ t: t + extraMs / 1000, fn });
  }
  private pending: { t: number; fn: () => void }[] = [];

  private runPending(vt: number) {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => p.t <= vt + 1e-6);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.t > vt + 1e-6);
    for (const p of due) p.fn();
  }

  // ───────────────────────────── input ─────────────────────────────

  private attachInput(el: HTMLElement): () => void {
    const pts = new Map<number, { x: number; y: number; sx: number; sy: number; ts: number }>();
    let moved = 0;
    let pinch = 0;
    const down = (e: PointerEvent) => {
      if (e.button === 2) return;
      el.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, ts: e.timeStamp });
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1 && moved > 8) this.view.orbit(dx, dy);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.view.zoom(pinch / d);
        pinch = d;
      }
    };
    const up = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (!p) return;
      if (moved <= 8 && pts.size === 0) this.tap(e.clientX, e.clientY, p.ts);
      else if (pts.size === 0) this.view.orbitEnd();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.view.zoom(e.deltaY > 0 ? 1.1 : 0.9);
    };
    const dbl = () => this.view.resetCamera();
    const key = (e: KeyboardEvent) => {
      if (this.disposed) return;
      if (e.key === ' ' || e.key === 'j' || e.key === 'J') {
        // the baton (keys repeat while held: only the first press counts)
        e.preventDefault();
        if (!e.repeat) this.baton(e.timeStamp);
      } else if (e.key === 'Enter') {
        if (!this.sim.started) this.go();
      } else if (e.key === 'f' || e.key === 'F') this.unleash();
      else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this.onPauseRequest();
      else if (e.key === 'r' || e.key === 'R') this.view.resetCamera();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', dbl);
      window.removeEventListener('keydown', key);
    };
  }

  tap(x: number, y: number, ts?: number) {
    if (this.paused || this.ended || this.cardOpen) return;
    const ndcX = (x / window.innerWidth) * 2 - 1, ndcY = -(y / window.innerHeight) * 2 + 1;
    const p = this.view.pick(ndcX, ndcY);
    if (!p) {
      if (this.sel) {
        this.deselect();
        audio.uiBack();
      }
      return;
    }
    this.pick(p, ts);
  }

  pick(p: Pick, ts?: number) {
    if (p.type === 'pickup') {
      const v = this.sim.collect(p.id);
      if (v > 0) {
        const pv = this.view.pickups.get(p.id);
        if (pv) {
          const s = this.view.screen(pv.group.position.clone().setY(pv.group.position.y + 2));
          this.hud.flyCoins(s.x, s.y, Math.min(6, Math.ceil(v / 3)));
          this.hud.floatNum(s.x, s.y - 30, `+${v}`);
        }
        audio.coin(audio.now(), 0, v);
        this.tutorial?.notify('pickup');
      }
      return;
    }
    if (p.type === 'slot') {
      // plates still asleep cannot be touched
      if (p.id >= this.sim.slotsOpen) return;
      if (this.sel?.id === p.id) {
        this.deselect();
        return;
      }
      const tid = this.view.towerOnSlot(p.id);
      // a glowing musician tapped on the beat plays its solo (off the beat: its menu, as always)
      if (tid !== null && this.trySolo(tid, ts)) return;
      if (tid !== null) this.selectTower(p.id, tid);
      else this.selectSlot(p.id);
    }
  }

  /** duet colours an instrument would form with the towers around a plate */
  duetsAround(slot: number, kind: TowerKind): string[] {
    const out: string[] = [];
    for (const nb of SLOT_NEIGHBOURS[slot]) {
      const t = this.sim.towerAt(nb);
      const d = t ? duetOf(kind, t.kind) : null;
      if (d) out.push(d.color);
    }
    return out;
  }

  selectSlot(id: number) {
    this.deselect();
    this.sel = { type: 'slot', id };
    this.view.pads[id].state = 2;
    const opts = this.def.towers.map((k) => {
      const cost = TOWERS[k].levels[0].cost;
      return { kind: k, cost, affordable: this.sim.coins >= cost, isNew: !this.opts.known.includes(k), duets: this.duetsAround(id, k) };
    });
    const s = this.view.screen(this.view.slotWorld(id, 1));
    this.hud.openBuild(s.x, s.y, opts, (k) => this.build(id, k));
    audio.uiOpen();
    this.tutorial?.notify('slotOpen', id);
  }

  selectTower(slot: number, id: number) {
    this.deselect();
    const tw = this.sim.towers.find((t) => t.id === id);
    if (!tw) return;
    this.sel = { type: 'slot', id: slot };
    this.view.pads[slot].state = 2;
    this.showRange(tw.kind, tw.level, slot);
    const up = this.sim.upgradeCost(tw);
    const s = this.view.screen(this.view.slotWorld(slot, 2));
    this.hud.openTower(s.x, s.y, tw.level, up, up !== null && this.sim.coins >= up, this.sim.sellValue(tw), () => this.upgrade(id), () => this.sell(id));
    audio.uiOpen();
    this.tutorial?.notify('towerOpen', slot);
  }

  deselect() {
    if (!this.sel) return;
    this.view.pads[this.sel.id].state = 0;
    this.sel = null;
    this.hud.closeRadial();
    this.showRange(null);
  }

  private previewRange(k: TowerKind | null) {
    if (!k || !this.sel) {
      if (!this.sel || this.view.towerOnSlot(this.sel.id) === null) this.showRange(null);
      return;
    }
    this.showRange(k, 0, this.sel.id);
  }

  /** range ring on the ground around the colossus' slot */
  private showRange(k: TowerKind | null, level = 0, slot = 0) {
    if (this.ghost) {
      this.ghost.removeFromParent();
      this.ghost.geometry.dispose();
      (this.ghost.material as THREE.Material).dispose();
      this.ghost = null;
    }
    if (!k) return;
    const r = TOWERS[k].levels[level].range;
    if (r <= 0) return;
    const col = new THREE.Color(TOWERS[k].color);
    const g = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col.multiplyScalar(1.4), transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }));
    g.renderOrder = 6;
    this.ghost = g;
    this.view.scene.add(g);
    this.ghostSlot = slot;
  }
  private ghostSlot = 0;

  build(slot: number, kind: TowerKind) {
    const cost = TOWERS[kind].levels[0].cost;
    if (this.sim.coins < cost) {
      this.hud.denyCoins();
      audio.uiDeny();
      return;
    }
    const tw = this.sim.build(slot, kind);
    if (!tw) return;
    this.deselect();
    this.view.addTower(tw.id, kind, 0, slot);
    audio.build(audio.now(), 0);
    if (!this.opts.known.includes(kind)) this.opts.known.push(kind);
    const s = this.view.screen(this.view.slotWorld(slot, 2));
    this.hud.floatNum(s.x, s.y, `-${cost}`);
    this.tutorial?.notify('built', slot);
    // the band changed right now (build happens between steps): its events are consumed at once
    this.consume(this.sim.drain());
  }

  upgrade(id: number) {
    const tw = this.sim.towers.find((t) => t.id === id);
    if (!tw) return;
    const c = this.sim.upgradeCost(tw);
    if (c === null) return;
    if (this.sim.coins < c) {
      this.hud.denyCoins();
      audio.uiDeny();
      return;
    }
    this.sim.upgrade(tw);
    this.deselect();
    this.view.upgradeTower(id, tw.level);
    audio.upgrade(audio.now(), 0, tw.level);
    const s = this.view.screen(this.view.slotWorld(tw.slot, 2.5));
    this.hud.floatNum(s.x, s.y, `-${c}`);
    this.tutorial?.notify('upgraded', tw.slot);
    this.consume(this.sim.drain());
  }

  sell(id: number) {
    const tw = this.sim.towers.find((t) => t.id === id);
    if (!tw) return;
    const v = this.sim.sell(tw);
    this.deselect();
    this.view.removeTower(id);
    audio.sell(audio.now(), 0);
    const s = this.view.screen(this.view.slotWorld(tw.slot, 1.5));
    this.hud.flyCoins(s.x, s.y, Math.min(6, Math.ceil(v / 30)));
    this.consume(this.sim.drain());
  }

  // ───────────────────────────── the baton (v3) ─────────────────────────────

  /** what the player is hearing at a tap (song seconds on the view clock), from the event's time stamp */
  heardAt(ts?: number): number {
    const lagMs = ts === undefined ? 0 : Math.max(0, Math.min(150, performance.now() - ts));
    return audio.now() - lagMs / 1000 - this.clock.t0 - audio.latency() - this.offset;
  }

  /**
   * when a judged tap sounds: on the grid point it was judged against (the engine plays a time
   * already past at once), so every tap lands on the music's grid
   */
  private soundAt(gridT: number, q: TapQuality): number {
    void q;
    return Math.max(this.ctx(gridT), audio.now() - 0.05);
  }

  /** a tap of the baton (pointerdown or Space/J) */
  baton(ts?: number) {
    if (this.paused || this.ended || this.cardOpen || this.disposed) return;
    const heard = this.heardAt(ts);
    this.tutorial?.notify('baton');
    const c = this.echoCall(heard);
    if (c) {
      this.echoTap(c, heard);
      return;
    }
    const r = this.groove.tap(heard, this.sim.spb);
    audio.beatTap(this.soundAt(r.at, r.q), r.q, -0.35);
    this.tapFeedback(r.q);
    this.syncGroove();
  }

  /** what the world does on a judged tap: sparks on the baton and the shell, a punch on a perfect */
  private tapFeedback(q: TapQuality) {
    const g = this.groove.level;
    this.hud.batonHit(q, g);
    if (q === 'miss') return;
    const v = this.view;
    const heart = v.turtle.heartWorld(new THREE.Vector3());
    const col = GROOVE_COLOR[g];
    v.fx.burst(heart.clone().setY(heart.y + 0.6), col, (q === 'perfect' ? 10 : 5) + g * 4, 2.4 + g * 0.5, 0.16, 0.5);
    const tp = v.turtle.group.position;
    v.fx.ring(new THREE.Vector3(tp.x, v.land.heightAt(tp.x, tp.z) + 0.25, tp.z), 5 + g, col, 0.35, 0.03);
    for (const tv of v.towers.values()) tv.pulse();
    if (q === 'perfect') {
      v.punch = Math.min(1.4, 0.45 + 0.22 * g);
      v.shake(0.04 + 0.03 * g);
      if (g >= 2) this.hud.kick(0.3 + 0.15 * g);
    }
  }

  /** the groove the baton keeps → the simulation (recorded), the music, the HUD */
  private syncGroove() {
    const l = this.groove.level;
    const prev = this.sim.groove;
    if (l !== prev) {
      this.sim.setGroove(l);
      audio.setGroove(l);
      TowerView.groove = l;
      if (l > prev) this.grooveUp(l);
      this.tutorial?.notify('groove');
    }
    this.hud.setGroove(l, this.groove.progress);
  }

  /** the groove rises: a ring of colour from the shell; at 4 everything kicks in */
  private grooveUp(l: number) {
    const v = this.view;
    const tp = v.turtle.group.position;
    const g = new THREE.Vector3(tp.x, v.land.heightAt(tp.x, tp.z) + 0.3, tp.z);
    v.fx.ring(g, 10 + l * 4, GROOVE_COLOR[l], 0.8, 0.05);
    const heart = v.turtle.heartWorld(new THREE.Vector3());
    v.fx.burst(heart, GROOVE_COLOR[l], 20 + l * 10, 4, 0.22, 0.9);
    v.shake(0.1 + 0.06 * l);
    if (l >= 4) {
      v.fx.ring(g, 30, '#fff1c2', 1.3, 0.05);
      v.fx.flash(heart, 4, '#fff1c2', 0.4);
      v.ffGlow = 1;
      v.punch = 1.6;
      v.shake(0.45);
      this.hud.kick(1);
      v.bloomWave({ x: tp.x, z: tp.z });
    }
  }

  // ───────────────────────────── solos ─────────────────────────────

  /** a tap on a musician: if it glows and the tap is on the beat, its solo (true) */
  private trySolo(id: number, ts?: number): boolean {
    const tw = this.sim.towers.find((t) => t.id === id);
    if (!tw || !this.sim.canSolo(tw)) return false;
    const heard = this.heardAt(ts);
    const g = nearestGrid(heard, this.sim.spb, this.groove.level);
    const q = quality(g.delta);
    if (q === 'miss') return false;
    this.groove.judge(q);
    this.groove.lastTap = heard;
    const r = this.sim.solo(tw, q === 'perfect');
    if (!r) return false;
    this.deselect();
    audio.beatTap(this.soundAt(g.at, q), q, this.view.pan(tw.x, tw.z));
    this.hud.batonHit(q, this.groove.level);
    this.syncGroove();
    this.tutorial?.notify('solo');
    this.consume(this.sim.drain());
    return true;
  }

  /** a solo begins (view time): the musician leaps, the camera leans toward it, light everywhere */
  private soloDrama(tw: Tower, perfect: boolean, until: number) {
    const v = this.view;
    const tv = v.towers.get(tw.id);
    if (!tv) return;
    this.soloEnds.set(tw.id, until);
    tv.bounce = perfect ? 0.09 : 0.06;
    const wp = tv.group.getWorldPosition(new THREE.Vector3());
    const col = TOWERS[tw.kind].color;
    v.fx.flash(wp.clone().setY(wp.y + 1.5), perfect ? 2.6 : 2, col, 0.3);
    v.fx.burst(wp.clone().setY(wp.y + 1.5), col, perfect ? 50 : 32, 4.5, 0.24, 1);
    v.fx.ring(wp.clone().setY(wp.y + 0.2), 4, col, 0.6, 0.08);
    v.punch = perfect ? 1.5 : 1;
    v.shake(perfect ? 0.25 : 0.15);
    this.hud.kick(perfect ? 1 : 0.6);
    // the camera leans toward the soloist for its bar (unless the player is steering it)
    if (!v.cine || this.soloCineUntil >= 0) {
      const cam = v.engine.camera.position.clone();
      const tp = v.turtle.group.position.clone().setY(v.turtle.group.position.y + 3);
      v.cineRate = 3.2;
      v.cine = { pos: cam.clone().lerp(wp, 0.16), look: tp.lerp(wp, 0.55) };
      this.soloCineUntil = until;
    }
  }

  /** a solo's area effect, drawn when it is heard */
  private soloHit(ev: Extract<SimEvent, { type: 'soloHit' }>) {
    const v = this.view;
    const ground = (x: number, z: number, y = 0.2) => new THREE.Vector3(x, v.land.heightAt(x, z) + y, z);
    const burstOn = (ids: number[], col: string) => {
      for (const id of ids) {
        const e = v.enemies.get(id);
        if (e) v.fx.burst(e.pos.clone().setY(e.pos.y + 1.2), col, 6, 2.6, 0.18, 0.4);
      }
    };
    switch (ev.kind) {
      case 'drum': {
        const p = ground(ev.x, ev.z);
        v.fx.ring(p, ev.r, '#ff9a4c', 0.5, 0.12);
        v.fx.ring(p, ev.r * 0.6, '#ffcf8a', 0.35, 0.1);
        v.fx.dust(p, v.look.land.dirt, 40);
        burstOn(ev.hits, '#ffb347');
        v.shake(0.3);
        v.turtle.rear = 0.5;
        break;
      }
      case 'bell': {
        const p = ground(ev.x, ev.z);
        v.fx.ring(p, ev.r, '#9fe3ff', 1.3, 0.06);
        v.fx.ring(p, ev.r * 0.7, '#e0f6ff', 1.0, 0.05);
        v.fx.flash(p.clone().setY(p.y + 3), 3, '#bfefff', 0.35);
        for (const id of ev.hits) v.enemies.get(id)?.slowed();
        break;
      }
      case 'shaker': {
        const tv = v.towers.get(ev.tower.id);
        const wp = tv ? tv.group.getWorldPosition(new THREE.Vector3()) : ground(ev.x, ev.z, 2);
        v.fx.burst(wp.clone().setY(wp.y + 2), '#ffe066', 60, 6, 0.26, 1.3, true, 5);
        for (let i = 0; i < 6; i++) v.fx.coinNote(wp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.5) * 4)));
        const sp = v.screen(wp.clone().setY(wp.y + 2));
        if (!sp.behind) this.hud.flyCoins(sp.x, sp.y, 8);
        break;
      }
      case 'choir': {
        const tv = v.towers.get(ev.tower.id);
        const wp = tv ? tv.group.getWorldPosition(new THREE.Vector3()) : ground(ev.x, ev.z, 2);
        v.fx.ring(ground(wp.x, wp.z), 26, '#fff1c2', 1.4, 0.04);
        v.fx.burst(wp.clone().setY(wp.y + 2), '#fff1c2', 50, 3, 0.24, 1.6, true, -1.2);
        for (const t of v.towers.values()) {
          const p = t.group.getWorldPosition(new THREE.Vector3());
          v.fx.burst(p.setY(p.y + 1.6), '#ffe9a8', 8, 1.5, 0.18, 0.8, true, -1);
        }
        v.ffGlow = Math.max(v.ffGlow, 0.7);
        break;
      }
      case 'bass': {
        const p = ground(ev.x, ev.z);
        v.fx.ring(p, ev.r, '#b48cff', 0.7, 0.15);
        v.fx.flash(p.clone().setY(p.y + 1), 3, '#9b6bff', 0.3);
        v.fx.burst(p, '#b48cff', 40, 6, 0.3, 0.7);
        v.fx.dust(p, v.look.land.dirt, 30);
        burstOn(ev.hits, '#d9c2ff');
        v.shake(0.45);
        break;
      }
    }
  }

  /** the glow of charged musicians (and the light of the ones soloing), every frame */
  private updateGlows(vt: number, u: number) {
    const live = new Set<number>();
    for (const tw of this.sim.towers) {
      const tv = this.view.towers.get(tw.id);
      if (!tv) continue;
      live.add(tw.id);
      let gl = this.glows.get(tw.id);
      if (!gl) {
        const col = new THREE.Color(TOWERS[tw.kind].color).multiplyScalar(1.6);
        const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
        const beamMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 6, 40).rotateX(Math.PI / 2), ringMat);
        ring.position.y = 0.08;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 2.4, 20, 1, true), beamMat);
        beam.position.y = 1.2;
        const g = new THREE.Group();
        g.add(ring, beam);
        tv.group.add(g);
        gl = { g, ring, beam, ringMat, beamMat };
        this.glows.set(tw.id, gl);
      }
      const end = this.soloEnds.get(tw.id);
      const soloing = end !== undefined && vt < end;
      if (end !== undefined && !soloing) {
        this.soloEnds.delete(tw.id);
        tv.bounce = 0;
      }
      const ready = tw.solo >= 1 && !tw.muted;
      const beat = Math.exp(-u * 5);
      if (soloing) {
        gl.ringMat.opacity = 0.9;
        gl.ring.scale.setScalar(1.3 + beat * 0.6);
        gl.beamMat.opacity = 0.35 + beat * 0.3;
        gl.beam.scale.set(1.2, 1.3, 1.2);
      } else if (ready) {
        gl.ringMat.opacity = 0.55 + beat * 0.45;
        gl.ring.scale.setScalar(1 + beat * 0.35);
        gl.beamMat.opacity = 0.16 + beat * 0.22;
        gl.beam.scale.set(1, 1 + beat * 0.15, 1);
      } else {
        gl.ringMat.opacity = tw.muted ? 0 : Math.min(0.3, tw.solo * 0.3);
        gl.ring.scale.setScalar(0.6 + 0.4 * tw.solo);
        gl.beamMat.opacity = 0;
      }
      gl.beam.visible = gl.beamMat.opacity > 0.001;
      gl.ring.visible = gl.ringMat.opacity > 0.001;
    }
    for (const [id, gl] of this.glows) {
      if (live.has(id)) continue;
      gl.g.removeFromParent();
      gl.ring.geometry.dispose();
      gl.beam.geometry.dispose();
      gl.ringMat.dispose();
      gl.beamMat.dispose();
      this.glows.delete(id);
    }
  }

  // ───────────────────────────── the Maestro's call & response ─────────────────────────────

  /** a breather begins: the Maestro will call (once or twice) and wait for the echo */
  private scheduleCalls(k: number, bars: number, t: number) {
    const s = this.sim;
    const eighth = s.spb / 2;
    callBars(bars).forEach((cb, attempt) => {
      const callStart = t + cb * s.barDur;
      const echoStart = callStart + s.barDur;
      const pattern = callPattern(this.def.world, this.def.seed ?? 7, k, attempt);
      this.calls.push({
        k, attempt, callStart, echoStart, pattern,
        notes: pattern.map((p) => callStart + p * eighth), targets: pattern.map((p) => echoStart + p * eighth),
        states: [0, 0, 0, 0], scheduled: false, matched: 0, wrong: 0, taps: 0, won: false,
      });
    });
  }

  /** the call whose echo bar a tap heard at `heard` falls in */
  private echoCall(heard: number): Call | null {
    const c = this.calls[0];
    if (!c || c.won) return null;
    return heard >= c.echoStart - RHYTHM.good && heard <= c.echoStart + this.sim.barDur + RHYTHM.good ? c : null;
  }

  private echoTap(c: Call, heard: number) {
    c.taps++;
    this.groove.lastTap = heard;
    const n = c.matched;
    if (n >= 4) {
      c.wrong++;
      audio.echoNote(3, this.soundAt(heard, 'miss'), false);
      this.hud.batonHit('miss', this.groove.level);
      return;
    }
    const d = heard - c.targets[n];
    const q = quality(d);
    if (q !== 'miss') {
      c.states[n] = 3;
      c.matched++;
      audio.echoNote(n, this.soundAt(c.targets[n], q), true);
      this.tapFeedback(q);
    } else {
      c.states[n] = 4;
      c.wrong++;
      audio.echoNote(n, this.soundAt(c.targets[n], 'miss'), false);
      this.hud.batonHit('miss', this.groove.level);
    }
    if (c.matched === 4 && c.wrong === 0) {
      c.won = true;
      audio.echoResult(true);
      this.hud.maestroResult(true);
      if (this.sim.echo() > 0) {
        this.groove.set(this.groove.level + 1);
        this.groove.lastTap = heard;
        this.syncGroove();
        this.consume(this.sim.drain());
      }
      this.tutorial?.notify('echo');
    }
  }

  /** is the Maestro calling (or waiting for the echo) right now? (the glove) */
  maestro(): { echo: boolean; next: number | null } | null {
    const c = this.calls[0];
    if (!c || c.won) return null;
    const vt = this.lastVt;
    if (vt < c.callStart - this.sim.barDur * 0.5) return null;
    const echo = vt >= c.echoStart - 0.2;
    const next = echo ? c.targets[c.matched] ?? null : null;
    return { echo, next };
  }

  /** the glove's press for tapping at `t` (song seconds on the view clock): down right on it */
  pressAt(t: number): number {
    const d = this.lastVt - t;
    if (d > -0.16 && d < 0) return 1 + d / 0.16;
    if (d >= 0 && d < 0.12) return 1 - d / 0.12;
    return 0;
  }

  /** the glove taps on every beat */
  beatPress(): number {
    const spb = this.sim.spb;
    return this.pressAt(Math.round(this.lastVt / spb) * spb);
  }

  private updateCalls(vt: number) {
    const s = this.sim;
    // calls of a breather already answered, or whose time has passed, are dropped
    while (this.calls.length) {
      const c = this.calls[0];
      // (a little grace: a tap that came in during a slow frame is still heard)
      const over = vt > c.echoStart + s.barDur + RHYTHM.good + 0.25;
      if (!over && !(c.won && vt > c.echoStart + s.barDur)) break;
      if (!c.won && c.taps > 0) {
        audio.echoResult(false);
        this.hud.maestroResult(false);
      }
      this.calls.shift();
      if (c.won) this.calls = this.calls.filter((x) => x.k !== c.k);
    }
    const c = this.calls[0];
    if (!c || this.ended) {
      this.hud.setMaestro(null);
      return;
    }
    // the Maestro's notes are scheduled a little ahead, at their exact time on the grid
    if (!c.scheduled && s.time >= c.callStart - 0.35) {
      c.scheduled = true;
      c.notes.forEach((t, i) => audio.callNote(i, this.ctx(t)));
    }
    if (vt < c.callStart - s.barDur * 0.75) {
      this.hud.setMaestro(null);
      return;
    }
    const echo = vt >= c.echoStart - 0.05;
    const states = c.notes.map((t, i) => {
      if (echo || c.won) return c.states[i] || 2;
      return vt >= t - 0.02 && vt < t + 0.2 ? 1 : vt >= t + 0.2 ? 2 : 0;
    });
    const head = echo ? (vt - c.echoStart) / s.barDur : (vt - c.callStart) / s.barDur;
    this.hud.setMaestro({ pattern: c.pattern, states, head: head >= 0 && head <= 1 ? head : -1, echo });
  }

  private journeyTime(): number {
    return this.goSimTime < 0 ? 0 : Math.max(0, this.sim.time - this.goSimTime);
  }

  go() {
    if (this.paused || this.ended || this.sim.started) return;
    this.sim.begin();
    this.goSimTime = this.sim.time;
    this.hud.showGo(false);
    audio.uiClick();
    this.tutorial?.notify('go');
  }

  unleash() {
    if (this.paused || this.ended) return;
    const r = this.sim.unleash();
    if (!r) {
      audio.uiDeny();
      return;
    }
    audio.ffUnleash(this.ctx(r[0]), this.ctx(r[1]));
    this.intensity = 3;
    audio.setIntensity(3);
    this.tutorial?.notify('ff');
  }

  /** where this journey could start again right now (null: only from the beginning) */
  checkpoint(): Checkpoint | null {
    return this.sim.checkpoint();
  }

  // ───────────────────────────── pause ─────────────────────────────

  pause() {
    if (this.paused || this.ended) return;
    this.paused = true;
    this.pausedAtSong = this.songNow();
    this.resumeAtSong = null;
    this.deselect();
    audio.setMuffle(0.85);
  }

  resume() {
    if (!this.paused || this.resumeAtSong !== null) return;
    audio.setMuffle(0);
    const bar = this.clock.spb * this.clock.beatsPerBar;
    const simAtPause = this.pausedAtSong + LEAD - this.offset;
    const now = this.songNow();
    let k = Math.ceil((now + this.clock.spb * 3 - (simAtPause + this.offset - LEAD)) / bar);
    if (k < 0) k = 0;
    this.offset += k * bar;
    this.resumeAtSong = simAtPause + this.offset - LEAD;
  }

  // ───────────────────────────── main loop ─────────────────────────────

  private update(dt: number, t: number) {
    if (this.disposed) return;
    const song = this.songNow();
    const lat = audio.latency();
    if (this.paused && this.resumeAtSong !== null) {
      const left = this.resumeAtSong - song;
      const beatsLeft = Math.ceil(left / this.clock.spb - 1e-6);
      this.hud.countIn(left > 0 && beatsLeft <= 4 ? 4 - beatsLeft : -1);
      if (left <= 0) {
        this.paused = false;
        this.resumeAtSong = null;
        this.hud.countIn(-1);
      }
    }
    if (!this.paused) {
      const target = song + LEAD - this.offset;
      if (target > this.sim.time) {
        this.sim.advance(target);
        this.consume(this.sim.drain());
      }
    }
    const vt = this.paused ? this.lastVt : Math.max(this.lastVt, song - lat - this.offset);
    this.lastVt = vt;
    const beatPos = this.paused ? (song - lat) / this.clock.spb : vt / this.clock.spb;
    this.view.update(dt, t, vt, beatPos, !this.paused);
    if (this.ghost) {
      const p = this.view.slotWorld(this.ghostSlot);
      this.ghost.position.set(p.x, this.view.land.heightAt(p.x, p.z) + 0.25, p.z);
    }
    this.runPending(vt);
    this.updateRhythm(vt);
    this.updateHud(vt);
    this.tutorial?.update(dt);
    // (the simulation drops its dead creatures itself, deterministically)
  }

  /** the baton's beat rings, the groove fading when the baton rests, the shell's lights, glows, calls */
  private updateRhythm(vt: number) {
    const s = this.sim;
    const spb = this.clock.spb;
    const beatPos = vt / spb;
    const u = beatPos - Math.floor(beatPos);
    const g = this.groove.level;
    // a wave drawing near (the last two bars before it): the beat rings burn hotter
    let tension = 0;
    for (const w of this.incoming) if (vt < w.at) tension = Math.max(tension, 1 - (w.at - vt) / (2 * s.barDur));
    this.hud.setBeat(beatPos, this.clock.beatsPerBar, g >= RHYTHM.eighthsFrom, g, Math.max(0, tension));
    if (!this.paused && !this.ended && this.groove.idle(vt, s.barDur)) this.syncGroove();
    // the shell's lanterns and the colour around the colossus pulse with the groove
    this.view.turtle.lights = 1 + g * 0.09 * (1 + 1.5 * Math.exp(-u * 5));
    if (g >= 3) this.view.ffGlow = Math.max(this.view.ffGlow, (g - 2) * 0.22 * Math.exp(-u * 3));
    const beat = Math.floor(beatPos);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      // groove 4: every downbeat rings out over the land
      if (g >= 4 && !this.paused && beat % this.clock.beatsPerBar === 0) {
        const tp = this.view.turtle.group.position;
        this.view.fx.ring(new THREE.Vector3(tp.x, this.view.land.heightAt(tp.x, tp.z) + 0.3, tp.z), 16, GROOVE_COLOR[4], 0.7, 0.035);
      }
    }
    if (this.soloCineUntil >= 0 && vt >= this.soloCineUntil) {
      this.soloCineUntil = -1;
      if (!this.ended) this.view.cine = null;
    }
    this.updateGlows(vt, u);
    this.updateCalls(vt);
  }

  private consume(events: SimEvent[]) {
    if (!events.length) return;
    for (const ev of events) {
      const at = this.ctx(ev.t);
      switch (ev.type) {
        case 'fire':
          // (a solo's notes are played by the solo itself)
          if (!ev.shot.solo) audio.towerShot(ev.shot.kind, ev.shot.level, at, this.view.pan(ev.shot.tower.x, ev.shot.tower.z), ev.shot.tower.id);
          break;
        case 'impact': {
          const s = ev.shot;
          if (s.kind === 'drum' || s.kind === 'bass' || ((s.kind === 'harp' || s.kind === 'crystal') && ev.hit)) audio.impact(s.kind, at, this.view.pan(s.tx, s.tz), s.hits.length);
          break;
        }
        case 'pulse':
          audio.towerShot(ev.tower.kind, ev.tower.level, at, this.view.pan(ev.tower.x, ev.tower.z), ev.tower.id);
          break;
        case 'damage':
          if (ev.shielded > 0 && ev.amount <= 0) audio.deflect(at, this.view.pan(ev.enemy.x, ev.enemy.z));
          break;
        case 'death': {
          if (ev.bounty > 0 || ev.enemy.def.boss) audio.enemyDeath(ev.enemy.kind, at, this.view.pan(ev.enemy.x, ev.enemy.z));
          if (ev.bounty > 0) {
            const wp = new THREE.Vector3(ev.enemy.x, this.view.land.heightAt(ev.enemy.x, ev.enemy.z) + 1.5, ev.enemy.z);
            const bounty = ev.bounty;
            this.later(ev.t, () => {
              const s = this.view.screen(wp);
              if (!s.behind) this.hud.flyCoins(s.x, s.y, Math.min(4, Math.ceil(bounty / 6)));
            });
            audio.coin(at + 0.12, this.view.pan(ev.enemy.x, ev.enemy.z), bounty);
          }
          break;
        }
        case 'leak':
          audio.heartHit(at, this.sim.lives / this.sim.maxLives);
          this.later(ev.t, () => this.hud.hurt());
          break;
        case 'income':
          audio.coin(at, this.view.pan(ev.tower.x, ev.tower.z), ev.amount);
          break;
        case 'muted':
          // mufflers, obelisks, frost, a slug's bite or a mimic's copy: the tower falls silent (and back)
          audio.towerMuted(at, this.view.pan(ev.tower.x, ev.tower.z), ev.muted);
          break;
        case 'waveWarn':
          this.incoming.push({ index: ev.index, at: ev.at, dirs: ev.dirs });
          break;
        case 'waveStart': {
          audio.waveStart(at, ev.index, ev.total);
          const kinds = [...new Set(this.sim.waves[ev.index]?.groups.map((g) => g.kind) ?? [])];
          this.later(ev.t, () => this.introduce(kinds));
          break;
        }
        case 'spawn':
          if (ev.enemy.def.boss && !this.bossAnnounced) {
            this.bossAnnounced = true;
            audio.bossAppear(at);
            this.intensity = 3;
            audio.setIntensity(3);
            this.later(ev.t, () => this.introduce([ev.enemy.kind]), 600);
          }
          break;
        case 'ffReady':
          audio.ffReady();
          this.tutorial?.notify('ffReady');
          break;
        case 'start':
          audio.waveStart(at, -1, 0);
          break;
        case 'arrive':
          audio.cinematic('world:restored');
          break;
        case 'victory':
          this.finish('victory', ev.t);
          break;
        case 'defeat':
          this.finish('defeat', ev.t);
          break;
        // ── v2: the band, the movements, the bestiary ──
        case 'band':
          audio.setBand(bandMix(ev.band));
          this.view.setDuets(ev.band.duets);
          this.later(ev.t, () => this.hud.setHarmony(ev.band.harmony));
          break;
        case 'duet': {
          if (!ev.formed) break;
          const a = this.sim.towers.find((x) => x.id === ev.a), b = this.sim.towers.find((x) => x.id === ev.b);
          const x = a && b ? (a.x + b.x) / 2 : this.sim.turtle.x, z = a && b ? (a.z + b.z) / 2 : this.sim.turtle.z;
          audio.duet(ev.id, at, this.view.pan(x, z));
          const color = DUET_COLOR.get(ev.id) ?? '#ffd36b';
          this.later(ev.t, () => {
            this.hud.duetFlash(color);
            // a little flourish between the partners (INTEGRATION: the view draws the ribbon from setDuets)
            for (const id of [ev.a, ev.b]) {
              const tv = this.view.towers.get(id);
              if (tv) this.view.fx.burst(tv.group.getWorldPosition(new THREE.Vector3()).setY(tv.group.getWorldPosition(new THREE.Vector3()).y + 1.6), color, 22, 2.2, 0.16, 0.8);
            }
          });
          break;
        }
        case 'plate': {
          const wp = this.view.slotWorld(ev.slot, 0.5);
          audio.plateUnlock(at, this.view.pan(wp.x, wp.z));
          this.later(ev.t, () => {
            const pad = this.view.pads[ev.slot];
            if (pad) pad.group.visible = true;
            const p = this.view.slotWorld(ev.slot, 0.3);
            this.view.fx.ring(p, 2.6, '#ffd36b', 0.9, 0.1);
            this.view.fx.burst(p.clone().setY(p.y + 0.8), '#ffe9a8', 36, 3, 0.2, 1);
            this.plateGlow.set(ev.slot, this.lastVt + 3.5);
            this.tutorial?.notify('plate', ev.slot);
          });
          break;
        }
        case 'movement': {
          // (usually already announced at its breather, so the calm modulates into the new key)
          if (this.audioMovement !== ev.index) {
            this.audioMovement = ev.index;
            audio.movement(ev.index, ev.total, at);
          }
          // the creatures this movement brings for the first time
          const m = this.sim.movements[ev.index];
          const next = this.sim.movements[ev.index + 1];
          const kinds: EnemyKind[] = [];
          for (const w of this.sim.waves) {
            if (w.bar < m.bar || (next && w.bar >= next.bar - next.rest)) continue;
            for (const g of w.groups) if (!kinds.includes(g.kind) && !this.bannered.has(g.kind)) kinds.push(g.kind);
          }
          for (const k of kinds) this.bannered.add(k);
          this.later(ev.t, () => this.hud.movement(ev.index, kinds));
          break;
        }
        case 'breather':
          this.scheduleCalls(ev.index, ev.bars, ev.t);
          if (this.intensity > 0 && this.sim.aliveCount() < 4) {
            this.intensity = 0;
            audio.setIntensity(0);
          }
          // the breather's calm already sings in the key of the movement it leads into
          if (this.audioMovement !== ev.index) {
            this.audioMovement = ev.index;
            audio.movement(ev.index, this.sim.movements.length, at);
          }
          break;
        // (the Mimic's look and burrowing are drawn by the view from `enemy.mimicKind` / `enemy.burrowed`)
        // (the slug's bite is drawn by the view: a puff of lava and the musician knocked out)
        case 'deflect':
          audio.deflect(at, this.view.pan(ev.enemy.x, ev.enemy.z));
          break;
        case 'heartHeal':
          audio.heartHeal(at);
          this.later(ev.t, () => this.hud.healed());
          break;
        // ── v3: the player's rhythm ──
        case 'soloReady': {
          const tw = ev.tower;
          this.later(ev.t, () => {
            const tv = this.view.towers.get(tw.id);
            if (!tv) return;
            const wp = tv.group.getWorldPosition(new THREE.Vector3());
            this.view.fx.burst(wp.setY(wp.y + 2), TOWERS[tw.kind].color, 18, 2.2, 0.18, 0.7, true, -1);
          });
          break;
        }
        case 'solo': {
          const tw = ev.tower;
          audio.solo(tw.kind, tw.level, at, this.view.pan(tw.x, tw.z), tw.id);
          this.later(ev.t, () => this.soloDrama(tw, ev.perfect, ev.until));
          break;
        }
        case 'soloHit':
          this.later(ev.t, () => this.soloHit(ev));
          break;
        case 'echoWin': {
          const coins = ev.coins;
          this.later(ev.t, () => {
            const b = this.hud.batonCenter();
            if (b) {
              this.hud.flyCoins(b.x, b.y - 60, Math.min(8, Math.ceil(coins / 6)));
              this.hud.floatNum(b.x + 40, b.y - 90, `+${coins}`);
            }
            const heart = this.view.turtle.heartWorld(new THREE.Vector3());
            this.view.fx.burst(heart, '#7dff9a', 40, 4, 0.22, 1);
            this.view.fx.ring(heart.clone().setY(this.view.land.heightAt(heart.x, heart.z) + 0.3), 12, '#ffd36b', 0.9, 0.05);
          });
          break;
        }
        case 'chord': {
          // the Maestro's chord: the choir and the low strings at once, on everything around
          audio.towerShot('choir', 2, at, 0, 97);
          audio.impact('bass', at, 0, ev.hits.length);
          this.later(ev.t, () => {
            const v = this.view;
            const tp = v.turtle.group.position;
            const g = new THREE.Vector3(tp.x, v.land.heightAt(tp.x, tp.z) + 0.3, tp.z);
            v.fx.ring(g, 34, '#7dff9a', 1.2, 0.06);
            v.fx.ring(g, 22, '#ffd36b', 0.9, 0.05);
            v.fx.flash(g.clone().setY(g.y + 4), 4, '#fff1c2', 0.35);
            for (const id of ev.hits) {
              const e = v.enemies.get(id);
              if (e) v.fx.burst(e.pos.clone().setY(e.pos.y + 1.2), '#ffe9a8', 10, 3, 0.2, 0.5);
            }
            v.shake(0.5);
            v.punch = 1.2;
            this.hud.kick(1);
          });
          break;
        }
      }
    }
    this.view.push(events);
  }

  private introduce(kinds: EnemyKind[]) {
    for (const k of kinds) {
      if (this.opts.seenEnemies.includes(k) || k === 'blotling') continue;
      this.opts.seenEnemies.push(k);
      this.opts.onEnemySeen?.(k);
      if (k === 'blot') continue;
      this.queuedCards.push(k);
    }
    this.showCards();
  }

  private async showCards() {
    if (this.cardOpen || !this.queuedCards.length || this.ended) return;
    this.cardOpen = true;
    const k = this.queuedCards.shift()!;
    this.pause();
    this.hud.countIn(-1);
    await this.hud.card({ enemy: k });
    this.cardOpen = false;
    this.resume();
    this.showCards();
  }

  private updateHud(vt: number) {
    const s = this.sim;
    this.hud.setLives(s.lives);
    this.hud.setCoins(s.coins);
    // journey bar: movements (breathers with their plate, bar lines), elites and the guardian
    const per = (bar: number) => Math.min(1, (bar * 4 * s.speed) / s.length);
    const jb = s.journeyBar ?? -1;
    const marks: { at: number; kind: EnemyKind; done: boolean; elite?: boolean }[] = [];
    s.waves.forEach((w, i) => {
      for (const g of w.groups) if (g.elite) marks.push({ at: per(w.bar), kind: g.kind, done: i < s.wavesBegun(), elite: true });
    });
    if (this.def.boss) marks.push({ at: per(this.def.boss.bar), kind: this.def.boss.kind, done: !!s.bossAlive() });
    const moves = s.movements.slice(1).map((m) => ({ rest: per(m.bar - m.rest), at: per(m.bar), done: jb >= m.bar }));
    this.hud.setJourney(this.view.turtleS / s.length, marks, moves);
    // the movements as pips
    this.hud.setWave(Math.max(0, s.movement), s.started ? s.movement : -1, s.movements.length);
    // colour returns as the journey goes on
    if (!this.ended) this.view.lifeTarget = 0.26 + 0.4 * (this.view.turtleS / s.length) + (s.started ? 0.04 : 0);
    // FORTÍSSIMO
    const ffOn = !!this.def.ff;
    this.hud.setFF(s.ffDropT !== null ? 1 : s.ff, s.ffReady(), s.ffDropT !== null || vt < s.ffBoostUntil, ffOn);
    for (const tv of this.view.towers.values()) tv.boosted = vt < s.ffBoostUntil;
    // music intensity (calm in the breathers)
    if (!this.ended) {
      const alive = s.aliveCount();
      let want: 0 | 1 | 2 | 3 = alive === 0 ? 0 : 1;
      if (alive > 12) want = 2;
      if (s.inBreather() && alive < 4) want = 0;
      if (s.bossAlive() || vt < s.ffBoostUntil) want = 3;
      if (!s.started) want = 0;
      if (want !== this.intensity) {
        this.intensity = want;
        audio.setIntensity(want);
      }
    }
    // pads glow when you can afford something; plates still asleep stay hidden, new ones shine
    const cheapest = Math.min(...this.def.towers.map((k) => TOWERS[k].levels[0].cost));
    this.view.pads.forEach((p, i) => {
      if (i >= s.slotsOpen) {
        p.group.visible = false;
        return;
      }
      if (this.sel?.id === i) return;
      const glow = this.plateGlow.get(i);
      if (glow !== undefined && vt < glow && !p.occupied) {
        p.state = 2;
        return;
      }
      p.state = s.coins >= cheapest ? 1 : 0;
    });
    // edge arrows toward incoming waves
    const arrows: { x: number; y: number; angle: number; kinds: EnemyKind[]; urgent: boolean }[] = [];
    this.incoming = this.incoming.filter((w) => vt < w.at + this.clock.spb * 8);
    const cam = this.view.engine.camera;
    const tp = this.view.turtle.group.position;
    const heading = Math.atan2(s.turtle.dz, s.turtle.dx);
    for (const w of this.incoming) {
      for (const d of w.dirs) {
        const a = heading + (d.dir * Math.PI) / 180;
        const world = new THREE.Vector3(tp.x + Math.cos(a) * 28, tp.y + 1, tp.z + Math.sin(a) * 28);
        const v = world.clone().project(cam);
        const behind = v.z > 1;
        let sx = v.x, sy = v.y;
        if (behind) {
          sx = -sx;
          sy = -sy;
        }
        const onScreen = !behind && Math.abs(sx) < 0.85 && Math.abs(sy) < 0.8;
        if (onScreen && vt > w.at) continue;
        const ang = Math.atan2(-sy, sx);
        const m = Math.max(Math.abs(sx) / 0.88, Math.abs(sy) / 0.78, 1e-3);
        const ex = onScreen ? sx : sx / m, ey = onScreen ? sy : sy / m;
        arrows.push({ x: ((ex + 1) / 2) * window.innerWidth, y: ((1 - ey) / 2) * window.innerHeight, angle: ang, kinds: d.kinds, urgent: vt > w.at - this.clock.spb * 2 });
      }
    }
    this.hud.setArrows(this.paused || this.ended ? [] : arrows);
    // keep an open menu attached to its plate
    if (this.sel && this.hud.radialOpen) {
      const sp = this.view.screen(this.view.slotWorld(this.sel.id, this.view.towerOnSlot(this.sel.id) !== null ? 2 : 1));
      this.hud.place(sp.x, sp.y);
    }
  }

  private finish(outcome: 'victory' | 'defeat', t: number) {
    if (this.ended) return;
    this.ended = true;
    this.soloCineUntil = -1;
    this.calls = [];
    this.deselect();
    this.hud.showGo(false);
    const checkpoint = outcome === 'defeat' ? this.sim.checkpoint() : null;
    this.later(t, () => {
      if (outcome === 'victory') {
        audio.victory();
        this.view.bloomWave();
        this.view.lifeTarget = 1.1;
        this.view.turtle.cheer();
        this.celebrate();
      } else {
        audio.defeat();
        this.view.lifeTarget = 0.05;
      }
      setTimeout(() => {
        if (this.disposed) return;
        this.resolveEnd({
          outcome, stars: this.sim.stars(), lives: this.sim.lives, time: this.journeyTime(), kills: this.sim.stats.kills, collected: this.sim.stats.collected,
          checkpoint, movement: Math.max(0, this.sim.movement), movements: this.sim.movements.length,
        });
      }, outcome === 'victory' ? 5600 : 2600);
    }, 200);
  }

  /** Arrival: look at the landmark ringing, a shard of light flies home to the Heart. */
  private celebrate() {
    const v = this.view;
    const lm = v.landmark.group.position.clone();
    const tp = v.turtle.group.position.clone();
    const dir = lm.clone().sub(tp).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    v.cineRate = 1.4;
    v.cine = { pos: tp.clone().addScaledVector(dir, -16).addScaledVector(side, 10).setY(tp.y + 9), look: lm.clone().setY(lm.y + 12) };
    const from = lm.clone().setY(lm.y + 16);
    const heart = () => v.turtle.shell.localToWorld(new THREE.Vector3(0, 7.2, 0));
    const t0 = this.lastVt + 1.2;
    v.fx.shoot('orb', from, heart, t0, t0 + 2.2, '#ffd36b');
    setTimeout(() => {
      if (this.disposed) return;
      v.cine = { pos: tp.clone().addScaledVector(dir, 10).addScaledVector(side, 9).setY(tp.y + 8), look: tp.clone().setY(tp.y + 5) };
      v.fx.ring(heart(), 6, '#ffe9a8', 0.8, 0.06);
      v.fx.burst(heart(), '#ffd36b', 40, 4, 0.25, 0.9);
    }, 3300);
  }

  quit() {
    if (this.ended) return;
    this.ended = true;
    this.resolveEnd({ outcome: 'quit', stars: 0, lives: this.sim.lives, time: this.journeyTime(), kills: this.sim.stats.kills, collected: this.sim.stats.collected, checkpoint: null, movement: Math.max(0, this.sim.movement), movements: this.sim.movements.length });
  }

  dispose() {
    this.disposed = true;
    audio.setGroove(0);
    TowerView.groove = 0;
    this.detach();
    this.removeUpdate();
    this.tutorial?.dispose();
    this.showRange(null);
    this.hud.dispose();
    this.view.dispose();
  }
}
