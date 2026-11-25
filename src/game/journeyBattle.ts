/**
 * A journey battle: the simulation, the 3D view, the HUD and the music clock working together.
 *
 *   songNow  = audio.now() − clock.t0                 (what the audio engine renders)
 *   simTime  = songNow + LEAD − offset                (the simulation runs a little ahead…)
 *   viewTime = songNow − latency − offset             (…so the view shows what you hear)
 * `offset` grows by whole bars after a pause, which keeps the bar phase intact.
 */
import * as THREE from 'three';
import { audio } from './sound';
import { Journey, type JourneyDef, type Mode, type SimEvent } from '../sim/journey';
import { ENEMIES, SONGS, TOWERS, type EnemyKind, type TowerKind } from '../sim/defs';
import type { Engine } from '../core/engine';
import { JourneyView, type Pick } from '../view/journeyView';
import { Hud } from '../ui/hud';
import type { SongClock } from '../audio/api';
import { JourneyTutorial } from './journeyTutorial';
import { ICON } from '../ui/icons';

const LEAD = 0.07;

export interface BattleResult {
  outcome: 'victory' | 'defeat' | 'quit';
  stars: number;
  lives: number;
  time: number;
  kills: number;
  collected: number;
}

export interface BattleOptions {
  mode: Mode;
  known: TowerKind[];
  seenEnemies: EnemyKind[];
  tutorials: boolean;
  onEnemySeen?: (k: EnemyKind) => void;
}

type Sel = { type: 'slot'; id: number } | null;

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

  constructor(readonly engine: Engine, readonly def: JourneyDef, readonly opts: BattleOptions, uiRoot: HTMLElement) {
    const song = SONGS[def.song];
    this.sim = new Journey(def, song.bpm, { mode: opts.mode });
    this.view = new JourneyView(engine, def, this.sim);
    engine.setScene(this.view.scene);
    engine.camera.far = 5000;
    engine.camera.fov = 42;
    engine.camera.updateProjectionMatrix();
    engine.renderer.toneMappingExposure = this.view.look.exposure;
    this.hud = new Hud(uiRoot);
    this.hud.show(true);
    this.hud.setGoal(ICON.bell);
    this.clock = audio.playSong(def.song, { fade: 2.5 });
    audio.setIntensity(0);
    audio.setAmbience(def.world, 0.8);
    this.done = new Promise((r) => (this.resolveEnd = r));
    this.hud.onPause = () => this.onPauseRequest();
    this.hud.onFF = () => this.unleash();
    this.hud.onGo = () => this.go();
    this.hud.onHoverTower = (k) => this.previewRange(k);
    this.hud.showGo(true);
    // the first land also gets gentle nudges: an idle player with notes to spend is shown the free plate
    if (opts.tutorials && (def.tutorial?.length || def.world === 'meadow')) this.tutorial = new JourneyTutorial(this, def.tutorial ?? [], def.world === 'meadow');
    this.removeUpdate = engine.onUpdate((dt, t) => this.update(dt, t));
    // developer handle for automated play-throughs
    if (import.meta.env.DEV) (window as unknown as { __battle: JourneyBattle }).__battle = this;
    this.detach = this.attachInput(engine.renderer.domElement);
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

  // ───────────────────────────── input ─────────────────────────────

  private attachInput(el: HTMLElement): () => void {
    const pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let moved = 0;
    let pinch = 0;
    const down = (e: PointerEvent) => {
      if (e.button === 2) return;
      el.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
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
      if (moved <= 8 && pts.size === 0) this.tap(e.clientX, e.clientY);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.view.zoom(e.deltaY > 0 ? 1.1 : 0.9);
    };
    const dbl = () => this.view.resetCamera();
    const key = (e: KeyboardEvent) => {
      if (this.disposed) return;
      if (e.key === ' ' || e.key === 'Enter') {
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

  tap(x: number, y: number) {
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
    this.pick(p);
  }

  pick(p: Pick) {
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
      if (this.sel?.id === p.id) {
        this.deselect();
        return;
      }
      const tid = this.view.towerOnSlot(p.id);
      if (tid !== null) this.selectTower(p.id, tid);
      else this.selectSlot(p.id);
    }
  }

  selectSlot(id: number) {
    this.deselect();
    this.sel = { type: 'slot', id };
    this.view.pads[id].state = 2;
    const opts = this.def.towers.map((k) => {
      const cost = TOWERS[k].levels[0].cost;
      return { kind: k, cost, affordable: this.sim.coins >= cost, isNew: !this.opts.known.includes(k) };
    });
    const s = this.view.screen(this.view.slotWorld(id, 1));
    this.hud.openBuild(s.x, s.y, opts, (k) => this.build(id, k));
    audio.uiOpen();
    this.tutorial?.notify('slotOpen');
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
    this.tutorial?.notify('towerOpen');
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
    this.tutorial?.notify('built');
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
    this.tutorial?.notify('upgraded');
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
    this.updateHud(vt);
    this.tutorial?.update(dt);
    if (!this.paused) this.sim.enemies = this.sim.enemies.filter((e) => e.alive);
  }

  private consume(events: SimEvent[]) {
    if (!events.length) return;
    for (const ev of events) {
      const at = this.ctx(ev.t);
      switch (ev.type) {
        case 'fire':
          audio.towerShot(ev.shot.kind, ev.shot.level, at, this.view.pan(ev.shot.tower.x, ev.shot.tower.z), ev.shot.tower.id);
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
            const lag = Math.max(0, (ev.t - this.lastVt) * 1000);
            const wp = new THREE.Vector3(ev.enemy.x, this.view.land.heightAt(ev.enemy.x, ev.enemy.z) + 1.5, ev.enemy.z);
            const bounty = ev.bounty;
            setTimeout(() => {
              if (this.disposed) return;
              const s = this.view.screen(wp);
              if (!s.behind) this.hud.flyCoins(s.x, s.y, Math.min(4, Math.ceil(bounty / 6)));
            }, lag);
            audio.coin(at + 0.12, this.view.pan(ev.enemy.x, ev.enemy.z), bounty);
          }
          break;
        }
        case 'leak': {
          audio.heartHit(at, this.sim.lives / this.sim.maxLives);
          const lag = Math.max(0, (ev.t - this.lastVt) * 1000);
          setTimeout(() => !this.disposed && this.hud.hurt(), lag);
          break;
        }
        case 'income':
          audio.coin(at, this.view.pan(ev.tower.x, ev.tower.z), ev.amount);
          break;
        case 'muted':
          audio.towerMuted(at, this.view.pan(ev.tower.x, ev.tower.z), ev.muted);
          break;
        case 'waveWarn':
          this.incoming.push({ index: ev.index, at: ev.at, dirs: ev.dirs });
          break;
        case 'waveStart': {
          audio.waveStart(at, ev.index, ev.total);
          const kinds = [...new Set(this.def.waves[ev.index]?.groups.map((g) => g.kind) ?? [])];
          const lag = Math.max(0, (ev.t - this.lastVt) * 1000);
          setTimeout(() => !this.disposed && this.introduce(kinds), lag);
          break;
        }
        case 'spawn':
          if (ev.enemy.def.boss && !this.bossAnnounced) {
            this.bossAnnounced = true;
            audio.bossAppear(at);
            this.intensity = 3;
            audio.setIntensity(3);
            const lag = Math.max(0, (ev.t - this.lastVt) * 1000);
            setTimeout(() => !this.disposed && this.introduce([ev.enemy.kind]), lag + 600);
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
    // journey bar with wave markers
    const marks = this.def.waves.map((w, i) => ({
      at: Math.min(1, (w.bar * 4 * s.speed) / s.length),
      kind: w.groups[0].kind,
      done: i < s.wavesBegun(),
    }));
    if (this.def.boss) marks.push({ at: Math.min(1, (this.def.boss.bar * 4 * s.speed) / s.length), kind: this.def.boss.kind, done: !!s.bossAlive() || false });
    this.hud.setJourney(this.view.turtleS / s.length, marks);
    this.hud.setWave(s.wavesBegun(), s.wavesBegun() - 1, this.def.waves.length);
    // colour returns as the journey goes on
    if (!this.ended) this.view.lifeTarget = 0.26 + 0.4 * (this.view.turtleS / s.length) + (s.started ? 0.04 : 0);
    // FORTÍSSIMO
    const ffOn = !!this.def.ff;
    this.hud.setFF(s.ffDropT !== null ? 1 : s.ff, s.ffReady(), s.ffDropT !== null || vt < s.ffBoostUntil, ffOn);
    for (const tv of this.view.towers.values()) tv.boosted = vt < s.ffBoostUntil;
    // music intensity
    if (!this.ended) {
      const alive = s.aliveCount();
      let want: 0 | 1 | 2 | 3 = alive === 0 ? 0 : 1;
      if (alive > 12) want = 2;
      if (s.bossAlive() || vt < s.ffBoostUntil) want = 3;
      if (!s.started) want = 0;
      if (want !== this.intensity) {
        this.intensity = want;
        audio.setIntensity(want);
      }
    }
    // pads glow when you can afford something
    const cheapest = Math.min(...this.def.towers.map((k) => TOWERS[k].levels[0].cost));
    this.view.pads.forEach((p, i) => {
      if (this.sel?.id === i) return;
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
    void ENEMIES;
  }

  private finish(outcome: 'victory' | 'defeat', t: number) {
    if (this.ended) return;
    this.ended = true;
    this.deselect();
    this.hud.showGo(false);
    const lag = Math.max(0, (t - this.lastVt) * 1000);
    setTimeout(() => {
      if (this.disposed) return;
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
        this.resolveEnd({ outcome, stars: this.sim.stars(), lives: this.sim.lives, time: this.journeyTime(), kills: this.sim.stats.kills, collected: this.sim.stats.collected });
      }, outcome === 'victory' ? 5600 : 2600);
    }, lag + 200);
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
    this.resolveEnd({ outcome: 'quit', stars: 0, lives: this.sim.lives, time: this.journeyTime(), kills: this.sim.stats.kills, collected: this.sim.stats.collected });
  }

  dispose() {
    this.disposed = true;
    this.detach();
    this.removeUpdate();
    this.tutorial?.dispose();
    this.showRange(null);
    this.hud.dispose();
    this.view.dispose();
  }
}
