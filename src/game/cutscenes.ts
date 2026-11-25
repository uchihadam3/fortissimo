/**
 * The story's cinematic engine, and its great set pieces: the opening, the ending (with the joyful cast
 * credits) and the Abyss epilogue. The chapter openings and the interludes live in story.ts.
 *
 * Everything is in-engine and wordless: only chapter titles and place names appear as text.
 *
 * A scene is a timeline of SHOTS (the camera moves along smooth splines with per-shot easing, lens and
 * roll; a new shot is a cut), MOMENTS (`at`: something happens) and TRACKS (`during`: something changes
 * from t0 to t1). Positions are ANCHORS, functions evaluated every frame, so a shot can be placed
 * relative to the colossus, its shell, an actor or the world, and moving subjects stay in frame.
 *
 * The clock is the real time since the scene became visible (the picture stays locked to the music even
 * when frames are slow); capture tools can drive it by hand (window.__cineManual). Animation runs on a
 * separate "world clock" that can be slowed or frozen (`timeScale`) while the camera keeps moving.
 */
import * as THREE from 'three';
import type { App } from './app';
import type { TowerKind, WorldId } from '../sim/defs';
import { audio } from './sound';
import type { CinematicCue } from '../audio/api';
import { Journey, type Feature, type JourneyDef, type LandmarkKind } from '../sim/journey';
import { JourneyView } from '../view/journeyView';
import { showcaseDef } from './showcase';
import { MaestroView, type MaestroPose } from '../view/models';
import { MusicianView, type MusicianPose } from '../view/musicians';
import { SilenceView } from '../view/silence';
import { EnemyView } from '../view/enemies';
import type { EnemyKind } from '../sim/defs';
import { SHELL, domeY } from '../sim/shell';
import { logoHTML } from '../ui/logo';
import { worldColor } from '../view/worldColor';
import { clamp01, damp } from '../view/kit';
import { LOOKS, FINALE_LOOK, type WorldLook } from '../view/styles';
import { Landmark } from '../view/journeyProps';
import { SHARD_COLORS } from '../view/turtle';
import {
  AuroraMoth, Debris, Fall, Fireflies, GentleGolem, GoldenScarab, Gust, InkCoil, LightThread, MusicMotes, NoteFirework, NoteStream,
  RestGlyph, ShardView, StaffCrown, Villager, glowSprite,
} from '../view/storyProps';

// ───────────────────────────── basics ─────────────────────────────

export type V3 = [number, number, number];
export type Anchor = () => THREE.Vector3;
export type Ease = (k: number) => number;

export const ease = {
  linear: (k: number) => k,
  /** gentle S (the default for camera moves) */
  sine: (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k),
  inOut: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  in: (k: number) => k * k,
  inCubic: (k: number) => k * k * k,
  out: (k: number) => 1 - (1 - k) * (1 - k),
  outCubic: (k: number) => 1 - Math.pow(1 - k, 3),
  outExpo: (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  outBack: (k: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
};

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

/** where each musician stands on the shell (shell-local), facing outward like a bandstand */
export const SEATS: Record<TowerKind, { x: number; z: number }> = {
  harp: { x: -1.42, z: -2.4 },
  drum: { x: 1.42, z: -2.4 },
  bell: { x: -2.75, z: 0.1 },
  shaker: { x: 2.75, z: 0.1 },
  crystal: { x: -1.5, z: 2.45 },
  horn: { x: 1.5, z: 2.45 },
  choir: { x: 0, z: -4.05 },
  bass: { x: 0, z: 4.1 },
};
/** the band as it grows through the story (rescue order) */
export const BAND_ORDER: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];
export const FULL_BAND: TowerKind[] = BAND_ORDER.slice();
export const BAND_COLORS: Record<TowerKind, string> = {
  harp: '#9be07a', drum: '#ff8a6a', bell: '#8fd8ff', shaker: '#ffe066', crystal: '#d9b8ff', horn: '#ffcf7a', choir: '#ffb3d9', bass: '#b48cff',
};
/** the landmark (great Voice) of each land */
export const VOICE_OF: Record<WorldId, LandmarkKind> = { meadow: 'bell', desert: 'harp', ice: 'organ', forge: 'chimes', citadel: 'spire' };
export const WORLD_INDEX: Record<WorldId, number> = { meadow: 0, desert: 1, ice: 2, forge: 3, citadel: 4 };

/** shell-local seat → position on the dome */
export function seatPos(x: number, z: number, lift = 0.02): THREE.Vector3 {
  return new THREE.Vector3(x, SHELL.y0 + domeY(x, z) + lift, z);
}

function lerpColor(a: THREE.Color, b: THREE.Color, k: number, out: THREE.Color) {
  out.r = a.r + (b.r - a.r) * k;
  out.g = a.g + (b.g - a.g) * k;
  out.b = a.b + (b.b - a.b) * k;
  return out;
}

// ───────────────────────────── actors ─────────────────────────────

type Updatable = { update(dt: number, t: number, beat: number): void };

/**
 * Anything that acts in a scene. `holder` is placed (on the shell or in the world); acting offsets (a
 * hop, a fall, a spin, a tremble) are applied to the inner group, so they never fight the placement.
 */
export class Actor {
  readonly holder = new THREE.Group();
  readonly inner = new THREE.Group();
  hop = 0;
  tilt = 0;
  roll = 0;
  spin = 0;
  tremble = 0;
  /** extra uniform scale (squash and stretch, growing, shrinking) */
  scale = 1;
  squash = 0;
  /** rhythmic playing: an 8-step pattern per bar ('x' plays) */
  pattern: string | null = null;
  strength = 1;
  private lastStep = -1;
  motes: { at: () => THREE.Vector3; color: string; every: number } | null = null;
  private motesN = 0;
  constructor(readonly view: { group: THREE.Object3D } & Partial<Updatable>, readonly kind?: TowerKind) {
    this.inner.add(view.group);
    this.holder.add(this.inner);
  }
  update(dt: number, t: number, beat: number, cine: Cine) {
    const tr = this.tremble ? Math.sin(t * 61) * this.tremble * 0.03 : 0;
    this.inner.position.set(tr, this.hop, 0);
    this.inner.rotation.set(this.tilt, this.spin, this.roll + tr * 2);
    this.inner.scale.set(this.scale * (1 + this.squash * 0.5), this.scale * (1 - this.squash), this.scale * (1 + this.squash * 0.5));
    if (this.pattern) {
      const step = Math.floor(beat * 2);
      if (step !== this.lastStep) {
        this.lastStep = step;
        if (this.pattern[((step % 8) + 8) % 8] === 'x') {
          (this.view as unknown as MusicianView).play?.(this.strength);
          if (this.motes && this.motesN++ % this.motes.every === 0) cine.motes.emit(this.motes.at(), cine.wt, this.motes.color);
        }
      }
    }
    this.view.update?.(dt, t, beat);
  }
  world(out = new THREE.Vector3()): THREE.Vector3 {
    return this.inner.getWorldPosition(out);
  }
}

export const PATTERNS: Record<TowerKind, string> = {
  harp: 'x.xxx.xx', drum: 'x...x.x.', bell: 'x.......', shaker: 'xxxxxxxx', crystal: '..x...x.', horn: 'x...x...', choir: 'x...x...', bass: 'x.....x.',
};

/** A creature of the Silence driven by hand (its own hop on the beat stays). */
export class Creature {
  readonly view: EnemyView;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  /** extra height (rising out of the sand, flying) */
  lift = 0;
  visible = true;
  constructor(kind: EnemyKind, scale: number, private id: number) {
    this.view = new EnemyView(id, kind, scale);
    this.view.setAura(false);
  }
  update(dt: number, vt: number, beat: number, camQ: THREE.Quaternion) {
    this.view.push(vt, this.pos.x, this.pos.z);
    const y = this.pos.y;
    this.view.update(dt, vt, beat, () => y, (x, z, yy, out) => out.set(x, yy, z), camQ);
    this.view.group.position.y += this.lift;
    this.view.group.rotation.y = this.yaw;
    this.view.group.visible = this.visible && this.view.visibleNow;
  }
}

// ───────────────────────────── scene setup ─────────────────────────────

export interface SetSpec {
  world: WorldId;
  look?: WorldLook;
  bpm?: number;
  seed?: number;
  /** road length in bars (the landmark stands 22 units past its end) */
  bars?: number;
  features?: Feature[];
  landmark?: LandmarkKind | null;
  curviness?: number;
  /** where the colossus starts on the road */
  s0?: number;
  /** musicians already on the shell */
  band?: TowerKind[];
  /** facets of the Heart already lit */
  shards?: number;
  /** world saturation at the start (0 grey … 1.1 full colour) */
  life?: number;
  /** colour around the colossus (0 none … 1) */
  colorScale?: number;
  maestro?: boolean;
}

interface Shot {
  t0: number;
  t1: number;
  pos: Anchor[];
  look: Anchor[];
  ease: Ease;
  lookEase: Ease;
  fov: [number, number];
  roll: [number, number];
  shake: number;
}

interface GradeState {
  vignette: number;
  saturation: number;
  contrast: number;
  warmth: number;
  grain: number;
  aberration: number;
  tint: THREE.Color;
}

const STYLE_ID = 'cine-story-css';
const CINE_CSS = `
.cine-overlay .cine-chapter { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; opacity: 0; transition: opacity 1.6s ease; pointer-events: none; text-align: center; }
.cine-overlay .cine-chapter.show { opacity: 1; }
.cine-overlay .cine-chapter small { font-family: var(--serif, Georgia, serif); letter-spacing: .5em; text-transform: uppercase; font-size: clamp(12px, 1.6vw, 18px); color: rgba(255,247,230,.85); text-shadow: 0 2px 10px rgba(0,0,0,.8); }
.cine-overlay .cine-chapter h1 { margin: 0; font-family: var(--deco, Georgia, serif); font-weight: 900; font-size: clamp(30px, 6vw, 78px); color: #ffe9a8; letter-spacing: .06em; text-shadow: 0 0 34px rgba(255,211,107,.55), 0 4px 0 #6a4310, 0 8px 30px rgba(0,0,0,.6); }
.cine-overlay .cine-chapter i { display: block; width: min(420px, 60vw); height: 2px; background: linear-gradient(90deg, transparent, rgba(255,233,168,.9), transparent); }
.cine-overlay .cine-place { position: absolute; left: calc(28px + var(--safe-l, 0px)); bottom: calc(9vh + 22px); font-family: var(--serif, Georgia, serif); font-size: clamp(16px, 2.2vw, 26px); color: rgba(255,247,230,.92); letter-spacing: .14em; text-shadow: 0 2px 12px rgba(0,0,0,.85); opacity: 0; transform: translateY(8px); transition: opacity 1.2s ease, transform 1.2s ease; pointer-events: none; }
.cine-overlay .cine-place::before { content: ''; display: block; width: 46px; height: 2px; margin-bottom: 8px; background: rgba(255,211,107,.9); }
.cine-overlay .cine-place.show { opacity: 1; transform: none; }
.cine-overlay .cine-memory { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 1.4s ease;
  background: radial-gradient(ellipse 70% 62% at 50% 50%, rgba(60,30,80,0) 55%, rgba(48,22,70,.55) 85%, rgba(20,8,30,.9) 100%); mix-blend-mode: multiply; }
.cine-overlay .cine-memory.show { opacity: 1; animation: cineflicker 0.18s steps(2) infinite; }
@keyframes cineflicker { 0% { filter: brightness(1); } 50% { filter: brightness(1.06); } }
.cine-overlay .cine-cast { position: absolute; bottom: calc(9vh + 26px); left: calc(36px + var(--safe-l, 0px)); display: flex; flex-direction: column; gap: 4px; opacity: 0; transform: translateX(-16px); transition: opacity .7s ease, transform .7s ease; pointer-events: none; }
.cine-overlay .cine-cast.right { left: auto; right: calc(36px + var(--safe-r, 0px)); align-items: flex-end; transform: translateX(16px); }
.cine-overlay .cine-cast.show { opacity: 1; transform: none; }
.cine-overlay .cine-cast b { font-family: var(--deco, Georgia, serif); font-size: clamp(22px, 3.6vw, 46px); color: #ffe9a8; text-shadow: 0 0 24px rgba(255,211,107,.5), 0 3px 0 #6a4310, 0 6px 22px rgba(0,0,0,.7); letter-spacing: .04em; }
.cine-overlay .cine-cast span { font-family: var(--round, sans-serif); font-weight: 800; font-size: clamp(12px, 1.6vw, 18px); letter-spacing: .2em; text-transform: uppercase; color: rgba(255,247,230,.85); text-shadow: 0 2px 8px rgba(0,0,0,.9); }
.cine-overlay .cine-roll { position: absolute; left: 0; right: 0; top: 9vh; bottom: 9vh; overflow: hidden; pointer-events: none; }
.cine-overlay .cine-roll > div { position: absolute; left: 0; right: 0; top: 100%; display: flex; flex-direction: column; align-items: center; gap: 26px; text-align: center; }
.cine-overlay .cine-roll .cl span { display: block; color: rgba(255,247,230,.7); letter-spacing: .16em; text-transform: uppercase; font-size: 12px; font-family: var(--round, sans-serif); font-weight: 800; }
.cine-overlay .cine-roll .cl b { display: block; font-family: var(--serif, Georgia, serif); font-size: clamp(18px, 2.4vw, 28px); color: #fff7e6; text-shadow: 0 2px 10px rgba(0,0,0,.9); }
.cine-overlay .cine-roll .cl.big b { font-family: var(--deco, Georgia, serif); color: #ffe9a8; font-size: clamp(26px, 4vw, 48px); }
`;

/** A running cinematic: its world, the colossus, the Maestro and the band, the overlay, the timeline. */
export class Cine {
  readonly sim: Journey;
  readonly view: JourneyView;
  readonly maestro: Actor;
  readonly maestroView = new MaestroView();
  readonly band = new Map<TowerKind, Actor>();
  readonly overlay: HTMLElement;
  readonly motes = new MusicMotes();
  /** timeline (real) time */
  t = 0;
  /** world (animation) time: it can be slowed or frozen */
  wt = 0;
  timeScale = 1;
  readonly spb: number;
  readonly speed: number;
  skipped = false;
  /** the colossus' head looks here (null: free) */
  turtleLook: Anchor | null = null;
  private turtleLookAuto: THREE.Vector3 | null = null;
  private events: { t: number; fn: () => void; done?: boolean }[] = [];
  private tracks: { t0: number; t1: number; fn: (k: number, dt: number) => void; done?: boolean }[] = [];
  private shots: Shot[] = [];
  private walkKeys: { t: number; v: number }[] = [];
  private actors: Actor[] = [];
  private things: { update(dt: number, t: number, beat: number): unknown }[] = [];
  private creatures: Creature[] = [];
  private debris: Debris[] = [];
  private started = false;
  private startMs = performance.now();
  private lastT = 0;
  private remove: () => void = () => {};
  private ended!: () => void;
  readonly done: Promise<void>;
  private shakeAmt = 0;
  private gradeBase: GradeState;
  private bloomBase: number;
  private cleanups: (() => void)[] = [];
  private nextCreatureId = -100;
  private lastFov = 0;
  /** the colossus' path distance at the current moment */
  s = 0;
  readonly s0: number;

  constructor(readonly app: App, readonly set: SetSpec) {
    app.enterCinematic();
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CINE_CSS;
      document.head.appendChild(st);
    }
    const world = set.world;
    const base = showcaseDef(world);
    const def: JourneyDef = {
      ...base,
      id: `cine-${world}`,
      bars: set.bars ?? 90,
      seed: set.seed ?? base.seed,
      features: set.features ?? base.features,
      curviness: set.curviness ?? 0.7,
      landmark: set.landmark ?? VOICE_OF[world],
    };
    const bpm = set.bpm ?? 92;
    this.sim = new Journey(def, bpm);
    this.spb = 60 / bpm;
    this.speed = this.sim.speed / this.spb;
    this.s0 = set.s0 ?? 20;
    this.s = this.s0;
    this.sim.turtle.s = this.s0;
    this.view = new JourneyView(app.engine, def, this.sim, set.look ?? LOOKS[world]);
    if (set.landmark === null) this.view.landmark.group.visible = false;
    this.view.cineRate = 60;
    this.view.life = this.view.lifeTarget = set.life ?? 0.3;
    this.view.colorScale = set.colorScale ?? 1;
    const eng = app.engine;
    eng.setScene(this.view.scene);
    eng.camera.far = 5000;
    eng.camera.fov = 40;
    eng.camera.updateProjectionMatrix();
    eng.renderer.toneMappingExposure = this.view.look.exposure;
    eng.paused = false;
    const g = eng.grade.uniforms;
    this.gradeBase = {
      vignette: g.uVignette.value, saturation: g.uSaturation.value, contrast: g.uContrast.value, warmth: g.uWarmth.value,
      grain: g.uGrain.value, aberration: g.uAberration.value, tint: (g.uTint.value as THREE.Color).clone(),
    };
    this.bloomBase = eng.bloom.strength;
    // the colossus' head can be steered by the script (the view resets its look target every frame)
    const turtle = this.view.turtle;
    let viewLook: THREE.Vector3 | null = null;
    Object.defineProperty(turtle, 'lookAt', {
      configurable: true,
      get: () => (this.turtleLook ? this.turtleLookAuto : viewLook),
      set: (v: THREE.Vector3 | null) => (viewLook = v),
    });
    turtle.setShards(set.shards ?? 0);
    // the Maestro on his podium in front of the Heart, facing the road
    this.maestro = new Actor(this.maestroView);
    this.maestroView.group.scale.setScalar(1.6);
    this.maestro.holder.position.copy(seatPos(0, -1.25, 0.03));
    this.maestro.holder.rotation.y = Math.PI;
    if (set.maestro !== false) this.addActor(this.maestro, turtle.shell);
    for (const k of set.band ?? []) this.seat(k);
    this.view.scene.add(this.motes.group);
    // the overlay: letterbox, cards, the skip button
    this.overlay = document.createElement('div');
    this.overlay.className = 'cine-overlay';
    this.overlay.innerHTML = `<div class="bar top"></div><div class="bar bottom"></div><div class="cine-memory"></div><div class="cine-card"></div><div class="cine-chapter"></div><div class="cine-place"></div><div class="cine-cast"></div><div class="cine-roll"></div><button class="skip">${app.screens.t('skip')} ⏭</button>`;
    app.uiRoot.appendChild(this.overlay);
    requestAnimationFrame(() => this.overlay.classList.add('on'));
    this.done = new Promise((r) => (this.ended = r));
    // hold to skip (or the button)
    let holdT = 0;
    let holding = false;
    const down = () => (holding = true);
    const up = () => {
      holding = false;
      holdT = 0;
    };
    const skipBtn = this.overlay.querySelector('.skip') as HTMLElement;
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.cleanups.push(() => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    });
    this.remove = eng.onUpdate((dt) => {
      if (holding) {
        holdT += dt;
        skipBtn.style.setProperty('--hold', String(Math.min(1, holdT / 1.2)));
        if (holdT > 1.2) this.skip();
      } else skipBtn.style.setProperty('--hold', '0');
      this.update();
    });
  }

  // ───────────── the cast ─────────────

  /** put a musician on its seat on the shell (returns its actor) */
  seat(kind: TowerKind, opts: { scale?: number; pose?: MusicianPose } = {}): Actor {
    let a = this.band.get(kind);
    if (!a) {
      const mv = new MusicianView(kind, { scale: opts.scale ?? 1.5 });
      a = new Actor(mv, kind);
      this.band.set(kind, a);
      this.addActor(a, this.view.turtle.shell);
    } else this.view.turtle.shell.attach(a.holder);
    const s = SEATS[kind];
    a.holder.position.copy(seatPos(s.x, s.z));
    a.holder.rotation.set(0, Math.atan2(s.x, s.z), 0);
    (a.view as MusicianView).pose = opts.pose ?? 'idle';
    return a;
  }

  /** a musician somewhere in the world (a rescue) */
  musician(kind: TowerKind, at: THREE.Vector3, opts: { scale?: number; yaw?: number; pose?: MusicianPose; frozen?: number } = {}): Actor {
    const mv = new MusicianView(kind, { scale: opts.scale ?? 1.5 });
    const a = new Actor(mv, kind);
    a.holder.position.copy(at);
    a.holder.rotation.y = opts.yaw ?? 0;
    mv.pose = opts.pose ?? 'idle';
    if (opts.frozen !== undefined) mv.setFrozen(opts.frozen);
    this.addActor(a, this.view.scene);
    return a;
  }

  addActor(a: Actor, parent: THREE.Object3D) {
    parent.add(a.holder);
    if (!this.actors.includes(a)) this.actors.push(a);
    return a;
  }

  /** anything with an update(dt, t, beat) is ticked on the world clock */
  add<T extends { update(dt: number, t: number, beat: number): unknown }>(thing: T, parent?: THREE.Object3D | null, obj?: THREE.Object3D): T {
    this.things.push(thing);
    const o = obj ?? (thing as unknown as { group?: THREE.Object3D }).group;
    if (o && parent !== null) (parent ?? this.view.scene).add(o);
    return thing;
  }

  /** an object with no logic */
  place(o: THREE.Object3D, parent?: THREE.Object3D) {
    (parent ?? this.view.scene).add(o);
    return o;
  }

  creature(kind: EnemyKind, scale: number, at: THREE.Vector3, yaw = 0): Creature {
    const c = new Creature(kind, scale, this.nextCreatureId--);
    c.pos.copy(at);
    c.yaw = yaw;
    this.view.scene.add(c.view.group);
    this.creatures.push(c);
    this.cleanups.push(() => c.view.dispose());
    return c;
  }

  silence(scale: number, at: THREE.Vector3): SilenceView {
    const s = new SilenceView({ scale });
    s.group.position.copy(at);
    this.view.scene.add(s.group);
    this.things.push({ update: (dt: number, t: number) => s.update(dt, t) });
    return s;
  }

  debrisOf(d: Debris) {
    this.view.scene.add(d.group);
    this.debris.push(d);
    return d;
  }

  musicianView(kind: TowerKind): MusicianView {
    return this.band.get(kind)!.view as MusicianView;
  }

  /** world anchor of a musician's seat on the shell */
  seatAnchor(kind: TowerKind, lift = 0.02): Anchor {
    const s = SEATS[kind];
    const local = seatPos(s.x, s.z, lift);
    const v = new THREE.Vector3();
    return () => this.view.turtle.shell.localToWorld(v.copy(local));
  }

  /** the whole band (on the shell) starts or stops playing its patterns */
  play(kinds: TowerKind[] | 'all', on = true, motes = true) {
    const list = kinds === 'all' ? [...this.band.keys()] : kinds;
    for (const k of list) {
      const a = this.band.get(k);
      if (!a) continue;
      a.pattern = on ? PATTERNS[k] : null;
      (a.view as MusicianView).pose = on ? 'play' : 'idle';
      a.motes = on && motes ? { at: () => a!.world(tmpV.clone()).setY(a!.world(tmpV.clone()).y + 1.6), color: BAND_COLORS[k], every: k === 'shaker' ? 4 : k === 'harp' ? 2 : 1 } : null;
    }
  }

  pose(kind: TowerKind | 'all', pose: MusicianPose) {
    const list = kind === 'all' ? [...this.band.values()] : [this.band.get(kind)].filter(Boolean) as Actor[];
    for (const a of list) (a.view as MusicianView).pose = pose;
  }

  mpose(p: MaestroPose) {
    this.maestroView.pose = p;
  }

  // ───────────── anchors ─────────────

  /** turtle-local (the colossus' frame on the road) */
  T(x: number, y: number, z: number): Anchor {
    const v = new THREE.Vector3();
    return () => this.view.turtle.group.localToWorld(v.set(x, y, z));
  }
  /** shell-local (moves with the body: the bob, the sleep) */
  Sh(x: number, y: number, z: number): Anchor {
    const v = new THREE.Vector3();
    return () => this.view.turtle.shell.localToWorld(v.set(x, y, z));
  }
  /** world */
  W(x: number, y: number, z: number): Anchor {
    const v = new THREE.Vector3(x, y, z);
    return () => v;
  }
  /** a point beside the road: path distance s, lateral (+ right), height above the ground */
  P(s: number, lat: number, h: number): Anchor {
    let v: THREE.Vector3 | null = null;
    return () => (v ??= this.roadPoint(s, lat, h));
  }
  /** relative to an object's world position, offset in the colossus' axes */
  R(o: THREE.Object3D | Actor | (() => THREE.Vector3), x: number, y: number, z: number): Anchor {
    const v = new THREE.Vector3();
    const q = new THREE.Quaternion();
    return () => {
      const base = o instanceof Actor ? o.world(v) : o instanceof THREE.Object3D ? o.getWorldPosition(v) : v.copy(o());
      this.view.turtle.group.getWorldQuaternion(q);
      return base.add(tmpV.set(x, y, z).applyQuaternion(q));
    };
  }
  /** relative to an object, in the object's own frame (scaled) */
  O(o: THREE.Object3D, x: number, y: number, z: number): Anchor {
    const v = new THREE.Vector3();
    return () => o.localToWorld(v.set(x, y, z));
  }
  /** a blend of two anchors */
  mix(a: Anchor, b: Anchor, k: number): Anchor {
    const v = new THREE.Vector3();
    return () => v.copy(a()).lerp(b(), k);
  }
  /** an anchor shifted by a world offset */
  add3(a: Anchor, x: number, y: number, z: number): Anchor {
    const v = new THREE.Vector3();
    return () => v.copy(a()).add(tmpV.set(x, y, z));
  }

  /** world point beside the road */
  roadPoint(s: number, lat: number, h: number): THREE.Vector3 {
    const p = this.view.land.path.at(s);
    const x = p.x - p.dz * lat, z = p.z + p.dx * lat;
    return new THREE.Vector3(x, this.view.land.heightAt(x, z) + h, z);
  }
  /** road heading (yaw) at s: objects with rotation.y = this face along the road (forward) */
  roadYaw(s: number): number {
    const p = this.view.land.path.at(s);
    return Math.atan2(-p.dx, -p.dz);
  }

  // ───────────── timeline ─────────────

  at(t: number, fn: () => void) {
    this.events.push({ t, fn });
  }
  during(t0: number, t1: number, fn: (k: number, dt: number) => void) {
    this.tracks.push({ t0, t1, fn });
  }
  cue(t: number, mood: CinematicCue) {
    this.at(t, () => audio.cinematic(mood));
  }
  motif(t: number, kind: TowerKind) {
    this.at(t, () => audio.joinMotif(kind));
  }
  end(t: number) {
    this.at(t, () => this.finish());
  }

  /** a camera shot from t0 (cut) to t1; after t1 it holds its last frame until the next shot */
  shot(t0: number, t1: number, spec: { pos: Anchor | Anchor[]; look: Anchor | Anchor[]; ease?: Ease; lookEase?: Ease; fov?: number | [number, number]; roll?: number | [number, number]; shake?: number }) {
    const arr = (a: Anchor | Anchor[]) => (Array.isArray(a) ? a : [a]);
    const pair = (v: number | [number, number] | undefined, d: number): [number, number] => (v === undefined ? [d, d] : typeof v === 'number' ? [v, v] : v);
    this.shots.push({ t0, t1, pos: arr(spec.pos), look: arr(spec.look), ease: spec.ease ?? ease.sine, lookEase: spec.lookEase ?? spec.ease ?? ease.sine, fov: pair(spec.fov, 40), roll: pair(spec.roll, 0), shake: spec.shake ?? 0 });
    this.shots.sort((a, b) => a.t0 - b.t0);
  }

  /** the colossus' walking speed from t (1 = its natural stride), ramped over `ramp` seconds */
  walk(t: number, v: number, ramp = 0.8) {
    const prev = this.speedAt(t);
    this.walkKeys.push({ t, v: prev }, { t: t + ramp, v });
    this.walkKeys.sort((a, b) => a.t - b.t);
  }
  private speedAt(t: number): number {
    const k = this.walkKeys;
    if (!k.length) return 0;
    if (t <= k[0].t) return k[0].t > 0 ? 0 : k[0].v;
    for (let i = k.length - 1; i >= 0; i--) {
      if (k[i].t <= t) {
        const n = k[i + 1];
        if (!n) return k[i].v;
        return k[i].v + ((n.v - k[i].v) * (t - k[i].t)) / Math.max(1e-6, n.t - k[i].t);
      }
    }
    return 0;
  }
  /** path distance of the colossus at time t (analytic, so captures and playback agree) */
  sAt(t: number): number {
    const k = this.walkKeys;
    let s = this.s0;
    let prevT = 0, prevV = this.speedAt(0);
    const pts = k.filter((p) => p.t > 0 && p.t < t).map((p) => p.t);
    pts.push(t);
    for (const pt of pts) {
      const v = this.speedAt(pt);
      s += ((prevV + v) / 2) * (pt - prevT) * this.speed;
      prevT = pt;
      prevV = v;
    }
    return s;
  }

  // ───────────── look & feel ─────────────

  shake(a: number) {
    if (this.app.settings.shake === false) return;
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  /** tween the colour grade */
  grade(t0: number, dur: number, to: Partial<{ vignette: number; saturation: number; contrast: number; warmth: number; grain: number; aberration: number; tint: string }>) {
    const u = this.app.engine.grade.uniforms;
    let from: GradeState | null = null;
    const tint = to.tint ? new THREE.Color(to.tint) : null;
    this.during(t0, t0 + Math.max(0.001, dur), (k) => {
      if (!from) from = { vignette: u.uVignette.value, saturation: u.uSaturation.value, contrast: u.uContrast.value, warmth: u.uWarmth.value, grain: u.uGrain.value, aberration: u.uAberration.value, tint: (u.uTint.value as THREE.Color).clone() };
      const e = ease.sine(k);
      const f = from;
      if (to.vignette !== undefined) u.uVignette.value = f.vignette + (to.vignette - f.vignette) * e;
      if (to.saturation !== undefined) u.uSaturation.value = f.saturation + (to.saturation - f.saturation) * e;
      if (to.contrast !== undefined) u.uContrast.value = f.contrast + (to.contrast - f.contrast) * e;
      if (to.warmth !== undefined) u.uWarmth.value = f.warmth + (to.warmth - f.warmth) * e;
      if (to.grain !== undefined) u.uGrain.value = f.grain + (to.grain - f.grain) * e;
      if (to.aberration !== undefined) u.uAberration.value = f.aberration + (to.aberration - f.aberration) * e;
      if (tint) lerpColor(f.tint, tint, e, u.uTint.value as THREE.Color);
    });
  }
  /** back to the normal grade */
  gradeReset(t0: number, dur: number) {
    const b = this.gradeBase;
    this.grade(t0, dur, { vignette: b.vignette, saturation: b.saturation, contrast: b.contrast, warmth: b.warmth, grain: b.grain, aberration: b.aberration, tint: `#${b.tint.getHexString()}` });
  }
  /** a flash of light (white by default) that fades */
  flash(t: number, color = '#fff8ea', strength = 0.85, dur = 0.9) {
    const u = this.app.engine.grade.uniforms;
    this.during(t, t + dur, (k) => {
      (u.uFadeColor.value as THREE.Color).set(color);
      u.uFade.value = strength * Math.pow(1 - k, 2);
    });
  }
  /** fade the picture to a colour and back (inside the scene) */
  dip(t0: number, t1: number, color = '#000000', peak = 1) {
    const u = this.app.engine.grade.uniforms;
    this.during(t0, t1, (k) => {
      (u.uFadeColor.value as THREE.Color).set(color);
      u.uFade.value = peak * Math.sin(Math.PI * k);
    });
  }
  bloom(t0: number, dur: number, strength: number) {
    const b = this.app.engine.bloom;
    let from = -1;
    this.during(t0, t0 + Math.max(0.001, dur), (k) => {
      if (from < 0) from = b.strength;
      b.strength = from + (strength - from) * ease.sine(k);
    });
  }
  exposure(t0: number, dur: number, v: number) {
    const r = this.app.engine.renderer;
    let from = -1;
    this.during(t0, t0 + Math.max(0.001, dur), (k) => {
      if (from < 0) from = r.toneMappingExposure;
      r.toneMappingExposure = from + (v - from) * ease.sine(k);
    });
  }
  /** world saturation (0 grey … 1.1) */
  life(t0: number, dur: number, v: number) {
    let from = -1;
    this.during(t0, t0 + Math.max(0.001, dur), (k) => {
      if (from < 0) from = this.view.life;
      this.view.life = this.view.lifeTarget = from + (v - from) * ease.sine(k);
    });
  }
  /** colour around the colossus */
  colour(t0: number, dur: number, v: number) {
    let from = -1;
    this.during(t0, t0 + Math.max(0.001, dur), (k) => {
      if (from < 0) from = this.view.colorScale;
      this.view.colorScale = from + (v - from) * ease.sine(k);
    });
  }
  /** a growing circle of colour at a point (radius over time) */
  colourCircle(t0: number, dur: number, at: Anchor, r0: number, r1: number, sat = 1.12, hold = true) {
    const src = { x: 0, z: 0, r: r0, s: sat };
    this.at(t0, () => this.view.extraSources.push(src));
    this.during(t0, t0 + dur, (k) => {
      const p = at();
      src.x = p.x;
      src.z = p.z;
      src.r = r0 + (r1 - r0) * ease.outCubic(k);
    });
    if (!hold) this.at(t0 + dur, () => (this.view.extraSources = this.view.extraSources.filter((s) => s !== src)));
    return src;
  }
  /** the sky (top, horizon, glow colours; cloud cover, stars, aurora) */
  sky(t0: number, dur: number, to: Partial<{ top: string; horizon: string; glow: string; cloud: string; shade: string; cover: number; stars: number; aurora: number }>) {
    const u = this.skyU();
    if (!u) return;
    let from: Record<string, THREE.Color | number> | null = null;
    const cols: [string, string][] = [['top', 'uTop'], ['horizon', 'uHorizon'], ['glow', 'uGlow'], ['cloud', 'uCloud'], ['shade', 'uShade']];
    const nums: [string, string][] = [['cover', 'uCover'], ['stars', 'uStars'], ['aurora', 'uAurora']];
    this.during(t0, t0 + Math.max(0.001, dur), (k) => {
      if (!from) {
        from = {};
        for (const [, uk] of cols) from[uk] = (u[uk].value as THREE.Color).clone();
        for (const [, uk] of nums) from[uk] = u[uk].value as number;
      }
      const e = ease.sine(k);
      for (const [key, uk] of cols) {
        const v = (to as Record<string, string | undefined>)[key];
        if (v) lerpColor(from[uk] as THREE.Color, new THREE.Color(v), e, u[uk].value as THREE.Color);
      }
      for (const [key, uk] of nums) {
        const v = (to as Record<string, number | undefined>)[key];
        if (v !== undefined) u[uk].value = (from[uk] as number) + (v - (from[uk] as number)) * e;
      }
    });
  }
  skyU(): Record<string, THREE.IUniform> | null {
    // INTEGRATION: the Sky keeps its material private; a public `uniforms` getter would be cleaner.
    const m = (this.view.sky as unknown as { mat?: THREE.ShaderMaterial }).mat;
    return m?.uniforms ?? null;
  }
  fog(t0: number, dur: number, color?: string, density?: number) {
    const f = this.view.scene.fog as THREE.FogExp2;
    let fc: THREE.Color | null = null;
    let fd = 0;
    const tc = color ? new THREE.Color(color) : null;
    this.during(t0, t0 + Math.max(0.001, dur), (k) => {
      if (!fc) {
        fc = f.color.clone();
        fd = f.density;
      }
      const e = ease.sine(k);
      if (tc) lerpColor(fc, tc, e, f.color);
      if (density !== undefined) f.density = fd + (density - fd) * e;
    });
  }
  /** sun and sky light */
  light(t0: number, dur: number, sun?: number, hemi?: number, sunColor?: string) {
    const sunL = this.view.scene.children.find((o) => (o as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight | undefined;
    const hemiL = this.view.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight | undefined;
    let s0 = -1, h0 = -1;
    let c0: THREE.Color | null = null;
    const tc = sunColor ? new THREE.Color(sunColor) : null;
    this.during(t0, t0 + Math.max(0.001, dur), (k) => {
      if (s0 < 0) {
        s0 = sunL?.intensity ?? 0;
        h0 = hemiL?.intensity ?? 0;
        c0 = sunL?.color.clone() ?? null;
      }
      const e = ease.sine(k);
      if (sunL && sun !== undefined) sunL.intensity = s0 + (sun - s0) * e;
      if (hemiL && hemi !== undefined) hemiL.intensity = h0 + (hemi - h0) * e;
      if (sunL && tc && c0) lerpColor(c0, tc, e, sunL.color);
    });
  }
  /** letterbox bar height (vh) */
  bars(t: number, vh: number, ms = 1200) {
    this.at(t, () => {
      this.overlay.querySelectorAll<HTMLElement>('.bar').forEach((b) => {
        b.style.transition = `height ${ms}ms ease`;
        b.style.height = `${vh}vh`;
      });
    });
  }

  // ───────────── words (only chapter titles, place names and the credits) ─────────────

  card(html: string, cls = '') {
    const c = this.overlay.querySelector('.cine-card') as HTMLElement;
    c.className = `cine-card ${cls}`;
    c.innerHTML = html;
    requestAnimationFrame(() => c.classList.add('show'));
  }
  cardOff() {
    this.overlay.querySelector('.cine-card')?.classList.remove('show');
  }
  /** a chapter title card */
  chapter(t0: number, t1: number, small: string, big: string) {
    const el = this.overlay.querySelector('.cine-chapter') as HTMLElement;
    this.at(t0, () => {
      el.innerHTML = `<small>${small}</small><h1>${big}</h1><i></i>`;
      requestAnimationFrame(() => el.classList.add('show'));
    });
    this.at(t1, () => el.classList.remove('show'));
  }
  /** a place name in the corner */
  placeName(t0: number, t1: number, name: string) {
    const el = this.overlay.querySelector('.cine-place') as HTMLElement;
    this.at(t0, () => {
      el.textContent = name;
      requestAnimationFrame(() => el.classList.add('show'));
    });
    this.at(t1, () => el.classList.remove('show'));
  }
  /** a cast name in the credits */
  castName(t0: number, t1: number, name: string, role: string, right = false) {
    const el = this.overlay.querySelector('.cine-cast') as HTMLElement;
    this.at(t0, () => {
      el.className = `cine-cast ${right ? 'right' : ''}`;
      el.innerHTML = `<b>${name}</b><span>${role}</span>`;
      requestAnimationFrame(() => el.classList.add('show'));
    });
    this.at(t1, () => el.classList.remove('show'));
  }
  /** the violet music-box frame of a memory */
  memoryFrame(t: number, on: boolean) {
    this.at(t, () => this.overlay.querySelector('.cine-memory')?.classList.toggle('show', on));
  }
  /** rolling credits over the picture */
  roll(t0: number, dur: number, html: string) {
    const box = this.overlay.querySelector('.cine-roll') as HTMLElement;
    this.at(t0, () => {
      box.innerHTML = `<div>${html}</div>`;
    });
    this.during(t0, t0 + dur, (k) => {
      const inner = box.firstElementChild as HTMLElement | null;
      if (!inner) return;
      const h = inner.offsetHeight + box.offsetHeight;
      inner.style.transform = `translateY(${-k * h}px)`;
    });
  }

  // ───────────── acting ─────────────

  /** a hop in place */
  hop(a: Actor, t0: number, dur = 0.45, h = 0.6, squash = true) {
    this.during(t0, t0 + dur, (k) => {
      a.hop = 4 * h * k * (1 - k);
      a.squash = squash ? (k < 0.15 ? -k * 1.2 : k > 0.85 ? (k - 0.85) * 1.5 : 0) : 0;
    });
    this.at(t0 + dur, () => {
      a.hop = 0;
      a.squash = 0;
    });
  }
  /** bounce on the beat for a while */
  bounce(a: Actor, t0: number, t1: number, h = 0.25, beats = 1) {
    this.during(t0, t1, () => {
      const b = this.wt / this.spb / beats;
      a.hop = Math.abs(Math.sin(b * Math.PI)) * h;
    });
    this.at(t1, () => (a.hop = 0));
  }
  /** turn to a yaw (holder) */
  turn(a: Actor, t0: number, dur: number, yaw: number) {
    let from = 0;
    this.during(t0, t0 + dur, (k) => {
      if (k <= 0.0001 || from === 0) from = from || a.holder.rotation.y || 1e-6;
      let d = yaw - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      a.holder.rotation.y = from + d * ease.sine(k);
    });
  }
  /** turn to face a world point */
  face(a: Actor, t0: number, dur: number, target: Anchor) {
    let from: number | null = null;
    this.during(t0, t0 + dur, (k) => {
      const p = a.holder.parent ? a.holder.parent.worldToLocal(target().clone()) : target();
      const goal = Math.atan2(p.x - a.holder.position.x, p.z - a.holder.position.z);
      if (from === null) from = a.holder.rotation.y;
      let d = goal - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      a.holder.rotation.y = from + d * ease.sine(k);
    });
  }
  /** fly along an arc to a point (a jump, a toss, being blown away); lands on the shell if `seat` */
  arc(a: Actor, t0: number, dur: number, to: Anchor, height: number, opts: { spins?: number; seat?: TowerKind; land?: () => void; ease?: Ease; tumble?: number } = {}) {
    let from: THREE.Vector3 | null = null;
    const e = opts.ease ?? ease.linear;
    this.during(t0, t0 + dur, (k) => {
      if (!from) {
        this.view.scene.attach(a.holder);
        from = a.holder.position.clone();
      }
      const kk = e(k);
      const p = from.clone().lerp(to(), kk);
      p.y += 4 * height * kk * (1 - kk);
      a.holder.position.copy(p);
      if (opts.spins) a.spin = kk * opts.spins * Math.PI * 2;
      if (opts.tumble) a.tilt = kk * opts.tumble * Math.PI * 2;
    });
    this.at(t0 + dur, () => {
      a.spin = 0;
      if (opts.tumble) a.tilt = 0;
      if (opts.seat) {
        this.band.set(opts.seat, a);
        this.seat(opts.seat, { pose: (a.view as MusicianView).pose });
        a.squash = 0.35;
        this.during(t0 + dur, t0 + dur + 0.35, (k) => (a.squash = 0.35 * (1 - k)));
        const w = a.world(new THREE.Vector3());
        this.view.fx.ring(w, 2.4, BAND_COLORS[opts.seat], 0.6, 0.12);
        this.view.fx.burst(w.setY(w.y + 0.5), BAND_COLORS[opts.seat], 24, 3, 0.18, 0.7);
      }
      opts.land?.();
    });
  }
  /** move along a straight line (walking on the ground or on the shell); `face` turns toward the way it goes */
  move(a: Actor, t0: number, dur: number, to: Anchor, opts: { hops?: number; hopH?: number; ease?: Ease; local?: boolean; face?: boolean } = {}) {
    let from: THREE.Vector3 | null = null;
    const e = opts.ease ?? ease.sine;
    this.during(t0, t0 + dur, (k) => {
      const target = opts.local && a.holder.parent ? a.holder.parent.worldToLocal(to().clone()) : to();
      if (!from) from = a.holder.position.clone();
      const prev = a.holder.position.clone();
      a.holder.position.copy(from).lerp(target, e(k));
      if (opts.face) {
        const dx = a.holder.position.x - prev.x, dz = a.holder.position.z - prev.z;
        if (dx * dx + dz * dz > 1e-8) a.holder.rotation.y = Math.atan2(dx, dz);
      }
      if (opts.hops) a.hop = Math.abs(Math.sin(k * Math.PI * opts.hops)) * (opts.hopH ?? 0.18);
    });
    this.at(t0 + dur, () => (a.hop = 0));
  }
  /** a pratfall: tips over backwards, bounces, lies there, gets back up */
  fall(a: Actor, t0: number, lie = 0.9, dir = -1) {
    this.during(t0, t0 + 0.35, (k) => (a.tilt = dir * 1.45 * ease.outBack(k)));
    this.during(t0 + 0.35, t0 + 0.6, (k) => (a.hop = Math.sin(k * Math.PI) * 0.12));
    this.during(t0 + 0.35 + lie, t0 + 0.75 + lie, (k) => (a.tilt = dir * 1.45 * (1 - ease.outBack(k))));
    this.at(t0 + 0.8 + lie, () => (a.tilt = 0));
  }
  /** tremble with fear */
  shiver(a: Actor, t0: number, t1: number, amt = 1) {
    this.at(t0, () => (a.tremble = amt));
    this.at(t1, () => (a.tremble = 0));
  }

  // ───────────── effects ─────────────

  /** a shard flies along an arc from a to b (both anchors), leaving a trail */
  shardFlight(t0: number, dur: number, color: string, from: Anchor, to: Anchor, lift = 6, size = 1.2, onArrive?: () => void): ShardView {
    const sv = new ShardView(color, size);
    sv.group.visible = false;
    this.view.scene.add(sv.group);
    let a0: THREE.Vector3 | null = null;
    let last = 0;
    this.during(t0, t0 + dur, (k) => {
      if (!a0) a0 = from().clone();
      const b = to();
      const e = ease.inOut(k);
      const p = a0.clone().lerp(b, e);
      p.y += 4 * lift * e * (1 - e);
      sv.group.position.copy(p);
      sv.group.visible = k < 1;
      if (this.wt - last > 0.03) {
        last = this.wt;
        this.view.fx.burst(p, color, 3, 0.4, 0.35 * size, 0.8, true, 0);
      }
    });
    this.things.push({ update: (dt: number, t: number) => sv.update(dt, t) });
    this.at(t0 + dur, () => {
      sv.group.visible = false;
      onArrive?.();
    });
    return sv;
  }

  /** a Voice of the world (a great landmark) standing at a point */
  voice(kind: LandmarkKind, at: THREE.Vector3, scale = 1, yaw = 0): Landmark {
    const lm = new Landmark(kind);
    lm.group.position.copy(at);
    lm.group.scale.setScalar(scale);
    lm.group.rotation.y = yaw;
    this.view.scene.add(lm.group);
    this.things.push({ update: (dt: number, t: number) => lm.update(dt, t) });
    return lm;
  }

  // ───────────── run ─────────────

  /** compile shaders and upload the scene before the clock starts, so the opening seconds are not lost to a hitch */
  async warm() {
    try {
      this.update(true);
      await this.app.engine.renderer.compileAsync(this.view.scene, this.app.engine.camera);
    } catch {
      /* not supported: the first frames compile instead */
    }
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }

  begin() {
    // developer: ?cinet=30 starts the timeline at 30 s
    const jump = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('cinet') ?? 0) : 0;
    this.startMs = performance.now() - jump * 1000;
    this.started = true;
    const w = window as unknown as { __ready: boolean; __cineT: number };
    w.__cineT = jump;
    w.__ready = true;
  }

  /** play the scene: warm up, fade in, wait until it ends (or is skipped) */
  async run(fadeIn = 1400) {
    await this.warm();
    this.begin();
    this.app.screens.fadeTo(0, fadeIn);
    await this.done;
  }

  private update(prime = false) {
    // capture tools can freeze the timeline (window.__cineFreeze) or drive it by hand (window.__cineManual)
    const w = window as unknown as { __cineT: number; __cineFreeze?: boolean; __cineShift?: number; __cineManual?: number };
    if (w.__cineFreeze && !prime) return;
    this.t = !this.started ? 0 : typeof w.__cineManual === 'number' ? w.__cineManual : (performance.now() - (w.__cineShift ?? 0) - this.startMs) / 1000;
    const t = this.t;
    const dt = Math.max(0, Math.min(0.25, t - this.lastT));
    this.lastT = t;
    w.__cineT = t;
    if (this.started) {
      for (const tr of this.tracks) {
        if (tr.done || t < tr.t0) continue;
        const k = Math.min(1, (t - tr.t0) / Math.max(1e-3, tr.t1 - tr.t0));
        tr.fn(k, dt);
        if (k >= 1) tr.done = true;
      }
      for (const e of this.events) {
        if (!e.done && t >= e.t) {
          e.done = true;
          e.fn();
        }
      }
    }
    const wdt = dt * this.timeScale;
    this.wt += wdt;
    const wt = this.wt;
    // the colossus
    this.s = this.sAt(t);
    this.sim.turtle.s = this.s;
    this.sim.walking = this.speedAt(t) > 0.05;
    this.sim.time = wt;
    const beat = wt / this.spb;
    if (this.turtleLook) this.turtleLookAuto = this.turtleLook().clone();
    this.view.update(wdt, wt + 50, wt, beat, true);
    for (const a of this.actors) a.update(wdt, wt, beat, this);
    for (const th of this.things) th.update(wdt, wt, beat);
    const camQ = this.app.engine.camera.quaternion;
    for (const c of this.creatures) c.update(wdt, wt, beat, camQ);
    this.debris = this.debris.filter((d) => {
      const alive = d.update(wdt);
      if (!alive) d.group.removeFromParent();
      return alive;
    });
    this.motes.update(wt, camQ);
    this.applyCamera(t, dt);
  }

  private applyCamera(t: number, dt: number) {
    const cam = this.app.engine.camera;
    let shot: Shot | null = null;
    for (const s of this.shots) if (s.t0 <= t) shot = s;
    if (!shot) shot = this.shots[0] ?? null;
    if (!shot) return;
    const k = clamp01((t - shot.t0) / Math.max(1e-3, shot.t1 - shot.t0));
    const pos = evalPath(shot.pos, shot.ease(k));
    const look = evalPath(shot.look, shot.lookEase(k));
    cam.position.copy(pos);
    cam.up.copy(UP);
    cam.lookAt(look);
    const roll = shot.roll[0] + (shot.roll[1] - shot.roll[0]) * ease.sine(k);
    if (roll) cam.rotateZ(roll);
    const fov = shot.fov[0] + (shot.fov[1] - shot.fov[0]) * shot.ease(k);
    if (Math.abs(fov - this.lastFov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.lastFov = fov;
    }
    // handheld drift and shake
    const hh = shot.shake + this.shakeAmt;
    if (hh > 0.0005) {
      const s = hh * 0.25;
      cam.rotateX(Math.sin(t * 31) * s * 0.06 + Math.sin(t * 2.3) * shot.shake * 0.02);
      cam.rotateY(Math.sin(t * 27 + 1) * s * 0.06 + Math.sin(t * 1.7) * shot.shake * 0.02);
      cam.position.addScaledVector(tmpV.set(Math.sin(t * 37), Math.sin(t * 41 + 2), Math.sin(t * 29 + 4)), s * 0.6);
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.4);
    // keep the view's own camera blend settled on ours
    this.view.cine = { pos: cam.position.clone(), look };
    void tmpM;
  }

  skip() {
    if (this.skipped) return;
    this.skipped = true;
    this.finish();
  }

  private finishing = false;
  async finish(fadeMs = 900) {
    if (this.finishing) return;
    this.finishing = true;
    await this.app.screens.fadeTo(1, fadeMs);
    this.dispose();
    this.ended();
  }

  dispose() {
    this.remove();
    for (const c of this.cleanups) c();
    this.overlay.remove();
    this.view.cine = null;
    const g = this.app.engine.grade.uniforms;
    const b = this.gradeBase;
    g.uVignette.value = b.vignette;
    g.uSaturation.value = b.saturation;
    g.uContrast.value = b.contrast;
    g.uWarmth.value = b.warmth;
    g.uGrain.value = b.grain;
    g.uAberration.value = b.aberration;
    (g.uTint.value as THREE.Color).copy(b.tint);
    g.uFade.value = 0;
    g.uPulse.value = 0;
    this.app.engine.bloom.strength = this.bloomBase;
    this.view.dispose();
    worldColor.uWorldSat.value = 1;
  }
}

function evalPath(pts: Anchor[], k: number): THREE.Vector3 {
  if (pts.length === 1) return pts[0]().clone();
  if (pts.length === 2) return pts[0]().clone().lerp(pts[1](), k);
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => p().clone()), false, 'centripetal');
  return curve.getPoint(k);
}

/** run a whole scene: build the set, let the script stage it, play it */
export async function runScene(app: App, set: SetSpec, script: (c: Cine) => void | Promise<void>, fadeIn = 1400): Promise<void> {
  const c = new Cine(app, set);
  await script(c);
  await c.run(fadeIn);
}

export async function playCutscene(app: App, name: 'intro' | 'ending' | 'epilogue'): Promise<void> {
  if (name === 'intro') return intro(app);
  if (name === 'epilogue') return epilogue(app);
  return ending(app);
}

// ───────────────────────────── looks ─────────────────────────────

/** Harmonia at dawn: low sun, warm horizon, clear air (the five Voices are visible far away). */
export const DAWN_LOOK: WorldLook = {
  ...LOOKS.meadow,
  sky: { ...LOOKS.meadow.sky, top: '#3f73c4', horizon: '#ffd7b0', sunGlow: '#ffb27a', sunDir: [0.5, 0.2, -0.84], cloudCover: 0.34 },
  fog: '#e9d6c8', fogDensity: 0.0024, sun: '#ffd9ae', sunIntensity: 3.0, hemiSky: '#cfe0ff', hemiIntensity: 1.0, exposure: 1.02,
};

/** the deep Abyss (memory 5) */
const ABYSS_LOOK: WorldLook = {
  ...LOOKS.citadel,
  sky: { ...LOOKS.citadel.sky, top: '#04030a', horizon: '#120c22', sunGlow: '#3a2a6a', cloudCover: 0.0, stars: 0.6, aurora: 0, mountains: ['#08060f', '#0b0814', '#0e0a1a'] },
  fog: '#0a0714', fogDensity: 0.02, sunIntensity: 0.3, hemiIntensity: 0.25, exposure: 1.1,
};

/** spring dawn of the next year's Tour (the epilogue) */
const SPRING_LOOK: WorldLook = {
  ...LOOKS.meadow,
  sky: { ...LOOKS.meadow.sky, horizon: '#ffe2c0', sunGlow: '#ffc890', sunDir: [0.45, 0.28, -0.85] },
  land: { ...LOOKS.meadow.land, leaves: ['#ff9ec7', '#ffc2dd', '#9fd46a', '#68b648', '#ffb3d1'], flowers: ['#ff7aa8', '#ffd84a', '#ffffff', '#b78cff', '#7ad7ff'] },
  fogDensity: 0.003,
};

/**
 * Each musician in turn, cut on the beat: a 3/4 view from outside the shell, a little push, a hop on
 * the accent. Returns the time the montage ends.
 */
export function bandMontage(c: Cine, t0: number, list: [TowerKind, number][], hop = true): number {
  let t = t0;
  list.forEach(([k, beats], i) => {
    const a = c.band.get(k);
    if (!a) return;
    const dur = beats * c.spb;
    const s = SEATS[k];
    const len = Math.hypot(s.x, s.z) || 1;
    const base = Math.atan2(s.x / len, s.z / len) + (i % 2 ? 0.5 : -0.5);
    const d = k === 'bass' ? 4.3 : 3.4;
    const y = seatPos(s.x, s.z).y;
    const p0 = c.Sh(s.x + Math.sin(base) * d, y + 1.45, s.z + Math.cos(base) * d);
    const p1 = c.Sh(s.x + Math.sin(base + (i % 2 ? -0.12 : 0.12)) * (d - 0.45), y + 1.25, s.z + Math.cos(base + (i % 2 ? -0.12 : 0.12)) * (d - 0.45));
    c.shot(t, t + dur, { pos: [p0, p1], look: c.R(a, 0, k === 'bass' ? 1.0 : 0.75, 0), fov: 36, ease: ease.out });
    if (hop) c.hop(a, t + 0.04, Math.min(0.5, dur * 0.8), 0.45);
    t += dur;
  });
  return t;
}

// ───────────────────────────── the opening ─────────────────────────────

/** where the five Voices stand around the colossus' starting point (path distance ahead, lateral) */
const VOICE_SPOTS: { kind: LandmarkKind; ds: number; lat: number; scale: number }[] = [
  { kind: 'bell', ds: 150, lat: -48, scale: 1.25 },
  { kind: 'harp', ds: 96, lat: 92, scale: 1.4 },
  { kind: 'organ', ds: 250, lat: -12, scale: 1.6 },
  { kind: 'chimes', ds: 74, lat: -98, scale: 1.4 },
  { kind: 'spire', ds: 205, lat: 58, scale: 1.3 },
];

async function intro(app: App) {
  audio.stopMusic(1.5);
  audio.setAmbience('meadow', 0.7);
  await runScene(app, {
    world: 'meadow', look: DAWN_LOOK, bpm: 92, bars: 150, seed: 11, curviness: 0.45, s0: 24, life: 1.12, band: FULL_BAND, shards: 5, landmark: null,
    features: [{ kind: 'meadow', from: 0, to: 90 }, { kind: 'lake', from: 30, to: 80, side: 1 }, { kind: 'forest', from: 90, to: 150, side: -1 }, { kind: 'hills', from: 140, to: 300 }],
  }, (c) => openingScript(app, c), 1800);
  worldColor.uWorldSat.value = 1;
}

function openingScript(app: App, c: Cine) {
  const v = c.view;
  const turtle = v.turtle;
  const fx = v.fx;
  const S0 = c.s0;
  c.walk(0, 1);
  c.mpose('idle');
  c.pose('all', 'idle');
  // ── the five Voices far away, linked to the Heart by threads of light
  const voices = VOICE_SPOTS.map((sp) => {
    const at = c.roadPoint(S0 + sp.ds, sp.lat, -1);
    return c.voice(sp.kind, at, sp.scale, c.roadYaw(S0 + sp.ds) + Math.PI);
  });
  voices.forEach((lm) => lm.setAwake(0.45));
  const heart = () => turtle.heartWorld(new THREE.Vector3());
  const threads = voices.map((lm, i) => {
    const th = new LightThread(SHARD_COLORS[i], 0.08, 1.2, 0.22);
    v.scene.add(th.mesh);
    c.add({ update: (_dt: number, t: number) => { th.set(lm.top(new THREE.Vector3()), heart()); th.update(t); } }, null);
    return th;
  });
  // the village dances among the houses
  const villagers: Villager[] = [];
  const vcols = ['#ff9a8a', '#8ad0ff', '#ffd36b', '#b98cff', '#9be07a', '#ffb3d9', '#ffcf7a'];
  const vspots: [number, number][] = [[-3.4, -1.9], [3.4, -1.9], [-3.6, 1.6], [3.6, 1.6], [-0.9, 3.4], [0.9, 3.4], [-2.2, 3.6]];
  vspots.forEach(([x, z], i) => {
    const vg = new Villager(vcols[i % vcols.length], vcols[(i + 3) % vcols.length], i);
    vg.group.position.copy(seatPos(x, z, 0.02));
    vg.group.rotation.y = Math.atan2(x, z);
    vg.group.scale.setScalar(1.4);
    vg.dance = 0;
    c.add(vg, turtle.shell);
    villagers.push(vg);
  });
  const petals = c.add(new Fall(['#ffc2d9', '#ffffff'], 600, 30, 22, 30, 1.6), null);
  v.scene.add(petals.points);
  c.add({ update: () => petals.points.position.copy(turtle.group.position) }, null);
  petals.alpha = 0;

  // ── 1. dawn: high over Harmonia, the threads of light converge on the colossus
  c.cue(0.2, 'intro:dawn');
  c.shot(0, 7.5, { pos: [c.T(-9, 16, 30), c.T(-6, 10.5, 19)], look: [c.T(0, 16, -80), c.T(0, 9, -60)], fov: [50, 46], ease: ease.sine });
  // ── 2. the Heart: complete, five facets singing
  c.shot(7.5, 11.5, { pos: [c.Sh(2.9, 7.1, -2.5), c.Sh(-2.6, 7.6, -2.9)], look: c.Sh(0, 7.4, 0), fov: [36, 33] });
  // ── 3. the Maestro raises his baton: the band gets ready
  c.shot(11.5, 15, { pos: [c.Sh(0.5, 6.35, -4.9), c.Sh(-0.2, 6.5, -4.4)], look: c.Sh(0, 6.35, -1.25), fov: 34 });
  c.at(12.2, () => c.mpose('raise'));
  c.at(13.4, () => c.pose('all', 'idle'));
  c.at(14.6, () => {
    audio.cinematic('intro:festival');
    c.mpose('conduct');
    c.play('all');
    villagers.forEach((vg) => (vg.dance = 1));
    turtle.cheer();
  });
  c.during(14.6, 18, (k) => (petals.alpha = k * 0.9));
  // ── 4. the festival: around the shell, the whole band playing
  c.shot(15, 21, { pos: [c.T(10.5, 9.5, -9), c.T(13, 8.4, 3), c.T(5, 9.6, 12)], look: c.T(0, 5.6, 0), fov: 42 });
  // ── 5. the band, one by one, cut on the beat
  const tJoy = bandMontage(c, 21, [['drum', 1], ['harp', 2], ['bell', 1], ['shaker', 1], ['crystal', 1], ['horn', 2], ['choir', 2], ['bass', 2]]);
  // ── 6. joy: low beside the road as the colossus strides through the flowers
  c.shot(tJoy, tJoy + 5.2, { pos: [c.T(-15, 1.8, -12), c.T(-14, 2.4, 1)], look: [c.T(0, 5.2, -4), c.T(0, 5.6, 0)], fov: 40 });

  // ── the Silence
  const T_SHADOW = tJoy + 5.2;
  const giantAt = c.roadPoint(S0 + 205, 14, -2);
  const giant = c.silence(32, giantAt);
  giant.emerge = 0;
  giant.pose = 'loom';
  giant.group.visible = false;
  const giantHead = () => giant.group.localToWorld(new THREE.Vector3(0, 2.9, 0.25));
  const handOf = (): THREE.Vector3 => {
    const hw = (giant as unknown as { handWorld?: (o: THREE.Vector3) => THREE.Vector3 }).handWorld;
    if (typeof hw === 'function') return hw.call(giant, new THREE.Vector3());
    const h = heart();
    return h.clone().lerp(giant.group.position.clone().setY(h.y + 40), 0.28).setY(h.y + 22);
  };
  c.add({ update: () => giant.lookAt(turtle.group.position) }, null);
  // ── 7. the shadow: the sky darkens, the music falters, one by one the musicians stop and look up
  c.cue(T_SHADOW, 'intro:approach');
  c.sky(T_SHADOW, 9, { top: '#24203e', horizon: '#6d6488', glow: '#8a6a9a', cloud: '#8a86a6', shade: '#3a3656', cover: 0.62 });
  c.fog(T_SHADOW, 9, '#5d5878', 0.0042);
  c.light(T_SHADOW, 9, 1.0, 0.55, '#c9c0e6');
  c.exposure(T_SHADOW, 9, 0.9);
  c.during(T_SHADOW, T_SHADOW + 6, (k) => (petals.alpha = 0.9 * (1 - k)));
  c.shot(T_SHADOW, T_SHADOW + 5, { pos: [c.T(0, 8.6, -12.5), c.T(0, 7.9, -10.5)], look: c.T(0, 5.9, 0), fov: 40 });
  const order: TowerKind[] = ['shaker', 'crystal', 'horn', 'choir', 'bell', 'bass', 'drum', 'harp'];
  order.forEach((k, i) => {
    c.at(T_SHADOW + 0.6 + i * 0.42, () => {
      c.play([k], false);
      c.musicianView(k).pose = 'idle';
    });
  });
  c.at(T_SHADOW + 1.2, () => villagers.forEach((vg) => (vg.dance = 0)));
  c.at(T_SHADOW + 3.0, () => c.mpose('idle'));
  c.walk(T_SHADOW + 3.0, 0, 2.2);
  // everyone turns to the horizon
  for (const k of FULL_BAND) c.face(c.band.get(k)!, T_SHADOW + 3.2 + Math.random() * 0.4, 0.8, () => giantAt);
  c.during(T_SHADOW + 1, T_SHADOW + 8, (k) => {
    threads.forEach((th, i) => (th.mat.uniforms.uOpacity.value = 1 - k * 0.55 + Math.sin(c.wt * (9 + i)) * 0.25 * k));
    voices.forEach((lm) => lm.setAwake(0.45 - k * 0.3));
  });
  // ── 8. over the Maestro's shoulder: something rises on the horizon
  const T_RISE = T_SHADOW + 5;
  c.at(T_RISE, () => {
    giant.group.visible = true;
    c.turtleLook = giantHead;
  });
  c.during(T_RISE, T_RISE + 9, (k) => (giant.emerge = ease.inOut(k)));
  c.during(T_RISE, T_RISE + 9, () => {
    if (Math.random() < 0.35) fx.burst(giant.group.position.clone().add(tmpV.set((Math.random() - 0.5) * 40, 2, (Math.random() - 0.5) * 40)), '#2a2238', 6, 6, 9, 3.2, false, -1.2);
  });
  c.during(T_RISE, T_RISE + 9, () => c.shake(0.12));
  c.shot(T_RISE, T_RISE + 3.6, { pos: c.Sh(0.9, 6.9, 0.6), look: [c.add3(() => giantAt, 0, 20, 0), c.add3(() => giantAt, 0, 46, 0)], fov: [36, 32] });
  c.at(T_RISE + 0.4, () => c.mpose('point'));
  // ── 9. the rise: low on the ground, the giant towers over the hills behind the colossus' head
  c.shot(T_RISE + 3.6, T_RISE + 9.6, { pos: [c.T(-3.4, 1.5, -1.6), c.T(-3.1, 1.3, -2.4)], look: [c.add3(() => giant.group.position, 0, 30, 0), c.add3(() => giant.group.position, 0, 56, 0)], fov: [52, 46] });
  // it glides closer, looming
  const giantNear = c.roadPoint(S0 + 120, 8, -2);
  c.during(T_RISE + 6, T_RISE + 16, (k) => giant.group.position.lerpVectors(giantAt, giantNear, ease.inOut(k)));
  // ── 10. the mask: a slow push with a long lens
  const T_MASK = T_RISE + 9.6;
  c.shot(T_MASK, T_MASK + 4.4, { pos: [c.T(5, 7.5, -12), c.T(4.6, 7.8, -12.6)], look: () => giantHead(), fov: [17, 10.5] });
  c.at(T_MASK + 2.6, () => {
    c.shake(0.25);
    fx.flash(giantHead(), 8, '#d9d3ff', 0.4);
  });
  // ── 11. the Maestro's face: a beat of terror
  const T_FACE = T_MASK + 4.4;
  c.shot(T_FACE, T_FACE + 1.7, { pos: [c.Sh(0.25, 6.75, -3.3), c.Sh(0.2, 6.7, -3.0)], look: c.Sh(0, 6.55, -1.25), fov: 28, shake: 0.4 });
  c.at(T_FACE, () => {
    c.mpose('sad');
    c.maestro.tremble = 1;
  });
  // ── 12. the hand: from the shell, looking up as it reaches over the colossus
  const T_HAND = T_FACE + 1.7;
  c.at(T_HAND, () => {
    giant.pose = 'reach';
    giant.reach(heart());
  });
  c.shot(T_HAND, T_HAND + 4.2, { pos: [c.Sh(-2.6, 5.9, 3.2), c.Sh(-2.9, 5.7, 3.6)], look: [() => heart().lerp(handOf(), 0.55), () => handOf()], fov: [52, 56], roll: [0.05, 0.12] });
  c.during(T_HAND, T_HAND + 4.2, () => c.shake(0.08));
  for (const k of FULL_BAND) c.at(T_HAND + 0.3, () => (c.musicianView(k).pose = 'scared'));
  for (const k of FULL_BAND) c.shiver(c.band.get(k)!, T_HAND + 0.3, T_HAND + 11, 0.7);
  // ── 13. the theft: the fist closes; the music is torn out of the world in streams of notes
  const T_GRASP = T_HAND + 3.2;
  c.at(T_GRASP, () => {
    giant.pose = 'grasp';
    c.shake(0.6);
  });
  const stream = c.add(new NoteStream(() => handOf()), null);
  v.scene.add(stream.group);
  c.at(T_GRASP, () => {
    const rng = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < 90; i++) {
      const fromShell = i < 50;
      let p: THREE.Vector3;
      if (fromShell) {
        const kinds = FULL_BAND;
        const a = c.band.get(kinds[i % kinds.length])!;
        p = a.world(new THREE.Vector3()).add(tmpV.set(rng(-0.5, 0.5), rng(0.5, 1.5), rng(-0.5, 0.5)));
      } else {
        const ang = rng(0, Math.PI * 2), r = rng(8, 34);
        const tp = turtle.group.position;
        p = new THREE.Vector3(tp.x + Math.cos(ang) * r, 0, tp.z + Math.sin(ang) * r);
        p.y = v.land.heightAt(p.x, p.z) + rng(0.3, 2);
      }
      stream.add(p, c.t + rng(0, 2.2) + (fromShell ? 0 : 0.4), rng(1.6, 2.6), i % 3 ? '#ffd36b' : SHARD_COLORS[i % 5], 0.4, rng(2, 9));
    }
  });
  c.shot(T_GRASP, T_GRASP + 4.4, { pos: [c.T(-24, 9, 9), c.T(-26, 12, 13)], look: [() => turtle.group.position.clone().lerp(handOf(), 0.4), () => turtle.group.position.clone().lerp(handOf(), 0.65)], fov: [44, 48] });
  c.life(T_GRASP + 0.3, 3.4, 0.05);
  c.colour(T_GRASP + 0.3, 3.4, 0);
  c.grade(T_GRASP, 0.6, { aberration: 2.2, contrast: 1.12, vignette: 0.55 });
  c.grade(T_GRASP + 2.6, 1.6, { aberration: 0.4 });
  c.during(T_GRASP, T_GRASP + 3, (k) => {
    threads.forEach((th) => (th.mat.uniforms.uOpacity.value = 0.45 * (1 - k)));
    voices.forEach((lm) => lm.setAwake(0.15 * (1 - k)));
    turtle.lights = 1 - k;
  });
  // ── 14. the Heart cracks… and shatters
  const T_CRACK = T_GRASP + 4.4;
  c.shot(T_CRACK, T_CRACK + 2.2, { pos: [c.Sh(1.8, 7.7, -2.1), c.Sh(1.4, 7.6, -1.7)], look: c.Sh(0, 7.4, 0), fov: [30, 26], shake: 0.15 });
  c.at(T_CRACK + 0.5, () => turtle.flashFacet(1));
  c.at(T_CRACK + 0.9, () => turtle.flashFacet(3));
  c.at(T_CRACK + 1.3, () => {
    turtle.flashFacet(0);
    turtle.flashFacet(2);
    turtle.flashFacet(4);
  });
  const T_SHATTER = T_CRACK + 2.0;
  c.cue(T_SHATTER - 0.1, 'intro:shatter');
  c.flash(T_SHATTER, '#ffffff', 0.95, 1.1);
  c.at(T_SHATTER, () => {
    turtle.heartBroken = 1;
    turtle.heartGlow = 0;
    turtle.setShards(0);
    turtle.facetGhost = 0;
    const h = heart();
    fx.ring(h.clone().setY(turtle.group.position.y + 0.6), 70, '#e6e2ff', 1.6, 0.04);
    fx.flash(h, 6, '#ffffff', 0.6);
    fx.burst(h, '#ffffff', 80, 9, 0.25, 1.2);
    c.shake(1.2);
    c.during(T_SHATTER, T_SHATTER + 0.4, () => {});
  });
  c.grade(T_SHATTER, 0.5, { aberration: 0, saturation: 0.75 });
  // ── 15. five shards fly to the five lands; the camera chases the meadow's
  const shardTargets = voices.map((lm, i) => () => lm.group.position.clone().add(tmpV.set(0, i === 0 ? 1 : 30, 0)));
  const flights = voices.map((_lm, i) => c.shardFlight(T_SHATTER + 0.05, i === 0 ? 6.0 : 3.6, SHARD_COLORS[i], () => heart(), shardTargets[i], i === 0 ? 34 : 26, 1.6));
  c.shot(T_SHATTER, T_SHATTER + 1.6, { pos: [c.T(-9, 15, 12), c.T(-12, 21, 16)], look: c.T(0, 7, 0), fov: [50, 56] });
  const chase = flights[0];
  const chaseDir = () => {
    const to = shardTargets[0]();
    return to.clone().sub(chase.group.position).setY(0).normalize();
  };
  c.shot(T_SHATTER + 1.6, T_SHATTER + 5.4, {
    pos: () => chase.group.position.clone().addScaledVector(chaseDir(), -9).add(tmpV.set(0, 3.5, 0)).addScaledVector(new THREE.Vector3(-chaseDir().z, 0, chaseDir().x), 3),
    look: () => chase.group.position.clone().addScaledVector(chaseDir(), 10).setY(chase.group.position.y - 4),
    fov: 54,
    shake: 0.12,
  });
  // the land greys beneath it
  c.at(T_SHATTER + 6.0, () => {
    const p = voices[0].group.position;
    fx.flash(p.clone().setY(p.y + 2), 10, SHARD_COLORS[0], 0.8);
    fx.ring(p.clone().setY(p.y + 0.5), 30, '#2a2040', 1.4, 0.2);
    fx.burst(p.clone().setY(p.y + 2), '#1d1a2b', 90, 9, 0.9, 1.6, false, 2);
    c.shake(0.6);
  });
  // ink rises and coils around the Bell: the shard has a guardian now
  const coil = c.add(new InkCoil(7.5 * VOICE_SPOTS[0].scale, 26 * VOICE_SPOTS[0].scale, 4));
  coil.group.position.copy(voices[0].group.position);
  coil.grow = 0;
  const blot = c.creature('bossBlot', 7, voices[0].group.position.clone().add(new THREE.Vector3(6, 0, 6)), Math.PI);
  blot.visible = false;
  c.at(T_SHATTER + 6.1, () => (blot.visible = true));
  c.during(T_SHATTER + 6.0, T_SHATTER + 8.2, (k) => {
    coil.grow = ease.outCubic(k);
    blot.lift = -9 + 9 * ease.outBack(Math.min(1, k * 1.3));
  });
  c.shot(T_SHATTER + 5.4, T_SHATTER + 8.6, {
    pos: [c.add3(() => voices[0].group.position, -26, 6, 30), c.add3(() => voices[0].group.position, -22, 4, 26)],
    look: c.add3(() => voices[0].group.position, 0, 16, 0),
    fov: [40, 36],
  });
  // ── 16. the grey gust sweeps the musicians off the shell like leaves
  const T_GUST = T_SHATTER + 8.6;
  const gustDir = new THREE.Vector3();
  const gust = c.add(new Gust(() => turtle.group.position.clone().setY(turtle.group.position.y + 4), gustDir, 18, 180), null);
  v.scene.add(gust.mesh);
  c.at(T_GUST - 0.2, () => {
    gustDir.copy(turtle.group.position).sub(giant.group.position).setY(0).normalize();
  });
  c.during(T_GUST, T_GUST + 5.5, (k) => (gust.strength = Math.sin(Math.PI * Math.min(1, k * 1.3)) * 1.1));
  c.shot(T_GUST, T_GUST + 5.2, { pos: [c.Sh(-5.2, 7.2, 4.6), c.Sh(-4.1, 6.6, 3.4)], look: [c.Sh(0.6, 5.6, -1.2), c.Sh(0.4, 5.9, 0.4)], fov: 46, shake: 0.25 });
  const blown: TowerKind[] = ['choir', 'shaker', 'bell', 'crystal', 'horn', 'drum', 'bass'];
  blown.forEach((k, i) => {
    const a = c.band.get(k)!;
    const t0 = T_GUST + 0.4 + i * 0.36;
    c.at(t0 - 0.05, () => {
      a.pattern = null;
      (a.view as MusicianView).pose = 'scared';
    });
    let fixed: THREE.Vector3 | null = null;
    const dest = () => {
      if (fixed) return fixed;
      const p = a.world(new THREE.Vector3());
      const side = new THREE.Vector3(-gustDir.z, 0, gustDir.x).multiplyScalar((i % 2 ? 1 : -1) * (12 + i * 5));
      return (fixed = p.clone().addScaledVector(gustDir, 70 + i * 9).add(side).setY(p.y + 14 + (i % 3) * 6));
    };
    c.arc(a, t0, 2.4, dest, 9, { spins: 2 + (i % 2), tumble: 1.5 });
    c.during(t0 + 1.4, t0 + 2.4, (kk) => (a.scale = 1 - kk));
  });
  villagers.forEach((vg, i) => c.during(T_GUST + 0.3 + i * 0.15, T_GUST + 0.9 + i * 0.15, (k) => (vg.hide = k)));
  // Lira clings to the pedestal and ducks behind it; the Maestro is bowled over
  const lira = c.band.get('harp')!;
  c.at(T_GUST + 0.4, () => ((lira.view as MusicianView).pose = 'scared'));
  c.move(lira, T_GUST + 0.6, 1.2, () => turtle.shell.localToWorld(seatPos(0.35, 1.05, 0.0)), { local: true, hops: 2, hopH: 0.3 });
  c.turn(lira, T_GUST + 0.6, 0.6, 0);
  c.at(T_GUST + 1.1, () => {
    c.maestro.tremble = 0;
    c.fall(c.maestro, T_GUST + 1.1, 6.5);
  });
  // ── grey
  const T_GREY = T_GUST + 5.2;
  c.cue(T_GREY, 'intro:grey');
  const ash = c.add(new Fall(['#bdb8cc', '#8f8aa3'], 500, 34, 26, 26, 1.0), null);
  v.scene.add(ash.points);
  c.add({ update: () => ash.points.position.copy(turtle.group.position) }, null);
  c.during(T_GREY, T_GREY + 3, (k) => (ash.alpha = k * 0.7));
  c.during(T_GREY + 1, T_GREY + 8, (k) => (giant.dissolve = ease.inOut(k)));
  c.during(T_GREY + 2, T_GREY + 6.5, (k) => {
    turtle.sleep = ease.inOut(k);
  });
  c.at(T_GREY + 2, () => (c.turtleLook = null));
  c.grade(T_GREY, 3, { saturation: 0.55, contrast: 1.02, vignette: 0.42, aberration: 0 });
  c.sky(T_GREY, 6, { top: '#5a5870', horizon: '#a9a6b8', glow: '#a9a6b8', cover: 0.5 });
  c.fog(T_GREY, 6, '#a6a3b4', 0.005);
  c.light(T_GREY, 6, 1.6, 0.8, '#e6e4ee');
  c.exposure(T_GREY, 4, 0.95);
  c.shot(T_GREY, T_GREY + 8, { pos: [c.T(-27, 16, 19), c.T(-25, 14.5, 17)], look: [c.T(0, 4, -22), c.T(0, 3.6, -18)], fov: 44 });
  // ── the Maestro, alone, walks around the empty shell
  const T_ALONE = T_GREY + 8;
  c.at(T_ALONE - 0.5, () => c.mpose('sad'));
  const pathAround = [seatPos(0, -1.25), seatPos(-1.1, -0.65), seatPos(-1.3, 0.35), seatPos(-0.8, 1.1)];
  pathAround.slice(1).forEach((p, i) => c.move(c.maestro, T_ALONE + i * 1.7, 1.7, () => turtle.shell.localToWorld(p.clone()), { local: true, hops: 3, hopH: 0.06, ease: ease.linear, face: true }));
  c.shot(T_ALONE, T_ALONE + 5.4, { pos: [c.Sh(-3.6, 6.4, -4.4), c.Sh(-4.4, 6.5, -0.6), c.Sh(-3.8, 6.6, 2.6)], look: c.R(c.maestro, 0, 0.6, 0), fov: 34 });
  // ── hope: behind the empty pedestal, Lira, hiding
  const T_LIRA = T_ALONE + 5.4;
  c.cue(T_LIRA + 0.8, 'intro:hope');
  c.at(T_LIRA, () => {
    c.maestro.holder.rotation.y = Math.atan2(0.35 - -0.8, 1.05 - 1.1);
    (lira.view as MusicianView).pose = 'scared';
  });
  c.shiver(lira, T_LIRA, T_LIRA + 3.4, 0.8);
  c.shot(T_LIRA, T_LIRA + 3.8, { pos: [c.Sh(1.5, 6.3, 3.1), c.Sh(1.3, 6.2, 2.8)], look: c.mix(c.R(lira, 0, 0.7, 0), c.R(c.maestro, 0, 0.8, 0), 0.4), fov: 32 });
  c.hop(lira, T_LIRA + 1.4, 0.3, 0.12);
  c.face(lira, T_LIRA + 1.2, 0.6, () => c.maestro.world(new THREE.Vector3()));
  // the last note, still alight on the tip of the baton
  const T_NOTE = T_LIRA + 3.8;
  c.at(T_NOTE, () => {
    c.mpose('raise');
    c.maestroView.glow = 1.4;
  });
  const lastNote = glowSprite('#fff2b8', 0.9, 0);
  v.scene.add(lastNote);
  c.during(T_NOTE + 0.8, T_NOTE + 7.5, (k) => {
    const tip = c.maestroView.tipWorld(new THREE.Vector3());
    lastNote.position.copy(tip).add(tmpV.set(0, ease.outCubic(Math.min(1, k * 2)) * 0.9, 0));
    (lastNote.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 6) * (0.75 + Math.sin(c.wt * 6) * 0.25);
    lastNote.scale.setScalar(0.9 + k * 0.8);
  });
  c.shot(T_NOTE, T_NOTE + 3.6, { pos: [c.R(c.maestro, -1.4, 1.5, -1.9), c.R(c.maestro, -1.1, 1.8, -1.5)], look: () => c.maestroView.tipWorld(new THREE.Vector3()).add(tmpV.set(0, 0.35, 0)), fov: [28, 24] });
  // Lira plucks a string; the note answers; a circle of colour is born
  const T_PLUCK = T_NOTE + 3.6;
  c.at(T_PLUCK + 0.6, () => {
    (lira.view as MusicianView).pose = 'play';
    lira.tremble = 0;
    (lira.view as MusicianView).play(1);
    audio.towerShot('harp', 0, audio.now() + 0.05, 0, 1);
    const p = lastNote.position.clone();
    fx.ring(p, 3, '#ffe9a8', 0.9, 0.08, 0);
    fx.burst(p, '#ffe9a8', 30, 2.6, 0.16, 1.0);
  });
  c.colourCircle(T_PLUCK + 0.8, 5.5, () => turtle.group.position, 1, 22, 1.15);
  c.at(T_PLUCK + 0.8, () => {
    turtle.heartGlow = 0.35;
    turtle.heartBroken = 0;
  });
  c.during(T_PLUCK + 0.8, T_PLUCK + 4, (k) => (turtle.facetGhost = k));
  c.at(T_PLUCK + 1.3, () => fx.ring(turtle.group.position.clone().setY(turtle.group.position.y - 0.8), 24, '#ffd36b', 2.4, 0.05));
  c.grade(T_PLUCK + 0.8, 4, { saturation: 1, vignette: 0.3 });
  c.during(T_PLUCK + 1, T_PLUCK + 5, (k) => (ash.alpha = 0.7 * (1 - k)));
  c.shot(T_PLUCK, T_PLUCK + 4.2, { pos: [c.Sh(-3.6, 6.9, 2.4), c.Sh(-4.4, 7.4, 3.0)], look: c.Sh(0.0, 6.0, 0.9), fov: 38 });
  // the colossus opens its eyes
  const T_EYE = T_PLUCK + 4.2;
  c.during(T_EYE + 0.4, T_EYE + 1.4, (k) => (turtle.sleep = 1 - k * 0.55));
  c.at(T_EYE + 0.2, () => (c.turtleLook = () => c.maestro.world(new THREE.Vector3()).add(tmpV.set(0, 3, 0))));
  c.shot(T_EYE, T_EYE + 3.6, { pos: [c.T(-2.9, 4.0, -8.9), c.T(-2.6, 3.95, -8.6)], look: c.T(-0.66, 3.4, -7.3), fov: [24, 21] });
  // it rises and takes the first step
  const T_STEP = T_EYE + 3.6;
  c.during(T_STEP, T_STEP + 1.2, (k) => (turtle.sleep = 0.45 * (1 - k)));
  c.at(T_STEP + 0.2, () => {
    c.turtleLook = null;
    turtle.cheer();
    turtle.lights = 0.6;
    c.mpose('conduct');
    c.play(['harp'], true);
    c.maestro.holder.position.copy(seatPos(0, -1.25, 0.03));
    c.maestro.holder.rotation.y = Math.PI;
    lira.holder.position.copy(seatPos(SEATS.harp.x, SEATS.harp.z));
    lira.holder.rotation.y = Math.atan2(SEATS.harp.x, SEATS.harp.z);
  });
  c.walk(T_STEP + 0.6, 1, 1.2);
  const prevStep = turtle.onStep;
  let firstStep = true;
  turtle.onStep = (pos, front) => {
    prevStep(pos, front);
    if (c.t > T_STEP && firstStep && front) {
      firstStep = false;
      fx.ring(pos.clone().setY(pos.y + 0.1), 5, '#ffd36b', 0.8, 0.12);
      fx.burst(pos.clone().setY(pos.y + 0.3), '#ff9ec7', 30, 3, 0.25, 1.2, false, 1);
      c.shake(0.5);
    }
  };
  c.shot(T_STEP, T_STEP + 3.8, { pos: [c.T(-6.2, 0.9, -8.2), c.T(-6.6, 1.1, -7.6)], look: [c.T(-3.0, 1.2, -3.4), c.T(-2.6, 2.6, -2.6)], fov: 44 });
  // ── the title: the colossus walks on into the grey, a small circle of colour around it
  const T_TITLE = T_STEP + 3.8;
  c.cue(T_TITLE + 0.6, 'intro:title');
  c.colour(T_STEP, 3, 0.35);
  c.shot(T_TITLE, T_TITLE + 10, { pos: [c.T(-13, 6, 12), c.T(-25, 27, 36)], look: [c.T(0, 4, -18), c.T(0, 3, -44)], fov: [42, 46], ease: ease.inOut });
  c.at(T_TITLE + 1.6, () => c.card(logoHTML(app.screens.t('tagline')), 'cine-title'));
  c.end(T_TITLE + 10.5);
}

// ───────────────────────────── the ending ─────────────────────────────

async function ending(app: App) {
  audio.stopMusic(1);
  audio.setAmbience('citadel', 0.5);
  await runScene(app, {
    world: 'citadel', look: FINALE_LOOK, bpm: 84, bars: 110, seed: 29, curviness: 0.4, s0: 110 * 4 * 0.42 - 34, life: 0.12, colorScale: 0.4, band: FULL_BAND, shards: 4, landmark: 'spire',
    features: [{ kind: 'ruins', from: 0, to: 70 }, { kind: 'meadow', from: 70, to: 200 }, { kind: 'lake', from: 60, to: 120, side: -1 }],
  }, (c) => endingScript(app, c), 1200);
  worldColor.uWorldSat.value = 1;
}

function endingScript(app: App, c: Cine) {
  const v = c.view;
  const turtle = v.turtle;
  const fx = v.fx;
  const pt = app.screens.lang === 'pt';
  const heart = () => turtle.heartWorld(new THREE.Vector3());
  c.mpose('conduct');
  c.pose('all', 'idle');
  // where it falls: straight ahead of the colossus
  const spot = c.roadPoint(c.s0 + 17, 0, 0);
  const sil = c.silence(30, spot.clone().setY(spot.y + 0));
  sil.pose = 'recoil';
  sil.emerge = 1;
  c.add({ update: () => sil.lookAt(turtle.group.position) }, null);
  let size = 30;
  let lift = 0;
  c.add({ update: () => {
    sil.group.scale.setScalar(Math.max(0.01, size));
    sil.group.position.set(spot.x, spot.y + lift, spot.z);
  } }, null);
  // the five Voices, far away on the horizon (dark until they ring)
  const vspots: { kind: LandmarkKind; ds: number; lat: number; scale: number }[] = [
    { kind: 'bell', ds: -90, lat: -95, scale: 1.4 },
    { kind: 'harp', ds: -40, lat: 110, scale: 1.5 },
    { kind: 'organ', ds: 120, lat: -105, scale: 1.7 },
    { kind: 'chimes', ds: 140, lat: 100, scale: 1.5 },
    { kind: 'spire', ds: 60, lat: 0, scale: 1 },
  ];
  const voices = vspots.map((sp, i) => {
    if (i === 4) return v.landmark;
    const at = c.roadPoint(c.s0 + sp.ds, sp.lat, -1);
    const lm = c.voice(sp.kind, at, sp.scale, 0);
    lm.group.lookAt(turtle.group.position.x, lm.group.position.y, turtle.group.position.z);
    return lm;
  });
  voices.forEach((lm) => lm.setAwake(0));
  // ── 1. it falls
  c.cue(0.2, 'ending:fall');
  c.shot(0, 5.2, { pos: [c.T(-10, 3, 15), c.T(-11, 4, 17)], look: [c.T(0, 60, -20), c.T(0, 30, -18)], fov: [52, 48], ease: ease.inOut });
  c.during(1.6, 3.4, (k) => (lift = -ease.in(k) * 6));
  c.during(1.4, 3.4, (k) => (sil.group.rotation.x = ease.in(k) * 0.3));
  c.at(3.4, () => {
    c.shake(1.1);
    fx.ring(spot.clone().setY(spot.y + 0.3), 40, '#b9b4cc', 1.4, 0.05);
    fx.dust(spot.clone().setY(spot.y + 0.5), '#9a94b0', 80);
    fx.burst(spot.clone().setY(spot.y + 6), '#1d1a2b', 120, 14, 1.2, 1.8, false, 3);
    sil.pose = 'kneel';
    sil.group.rotation.x = 0;
    lift = 0;
  });
  // ── 2. it shrinks in a storm of ink
  c.shot(5.2, 11, { pos: [c.T(-13, 7, -3), c.T(-9, 4, -7)], look: [c.T(0, 6, -17), c.T(0, 1.6, -17)], fov: [42, 36] });
  c.during(5.4, 10, (k) => {
    size = 30 - ease.inOut(k) * 29.2;
    if (Math.random() < 0.5) fx.burst(spot.clone().setY(spot.y + size * 1.4), '#1d1a2b', 8, 3 + size * 0.2, 0.4 + size * 0.05, 1.4, false, -0.6);
  });
  c.cue(8, 'ending:alone');
  c.at(10, () => (sil.pose = 'small'));
  // ── 3. small and alone, in the dust, under the colossus
  c.shot(11, 17, { pos: [c.T(1.8, 0.9, -21.5), c.T(1.4, 0.95, -21)], look: [c.T(0, 1.4, -17), c.T(0, 2.4, -14)], fov: 30 });
  // ── 4. the band leans over the edge to look
  for (const k of FULL_BAND) c.face(c.band.get(k)!, 16.5 + Math.random() * 0.6, 0.8, () => spot);
  c.shot(17, 22, { pos: [c.T(0.6, 1.4, -15.2), c.T(0.4, 1.6, -15.6)], look: c.T(0, 6.2, -3), fov: 38 });
  c.at(17.4, () => FULL_BAND.forEach((k) => (c.band.get(k)!.tilt = 0.25)));
  // ── 5. the Maestro jumps down… and trips on his tails
  const T_JUMP = 22;
  c.shot(T_JUMP, T_JUMP + 5, { pos: [c.T(-6.5, 3.2, -11), c.T(-6, 2.6, -13)], look: c.R(c.maestro, 0, 0.5, 0), fov: 40 });
  c.at(T_JUMP, () => c.mpose('idle'));
  c.arc(c.maestro, T_JUMP + 0.5, 1.4, () => spot.clone().add(tmpV.set(0, 0, 0)).lerp(turtle.group.position.clone().setY(spot.y), 0.22).setY(spot.y), 3.2, { spins: 0 });
  c.at(T_JUMP + 1.9, () => {
    c.cue(T_JUMP + 1.9, 'story:comic');
    fx.dust(c.maestro.world(new THREE.Vector3()), '#b9b4cc', 16);
  });
  c.fall(c.maestro, T_JUMP + 1.95, 0.5, 1);
  c.at(T_JUMP + 3.6, () => c.hop(c.maestro, T_JUMP + 3.6, 0.3, 0.1));
  // ── 6. the rest: a whole bar of true silence; time stops
  const T_REST = 28;
  c.cue(T_REST, 'ending:rest');
  c.at(T_REST, () => {
    c.maestro.holder.lookAt(spot.x, c.maestro.holder.position.y, spot.z);
    c.mpose('raise');
  });
  const rest = new RestGlyph('#fff4c8', 1.4);
  rest.opacity = 0;
  v.scene.add(rest.group);
  c.during(T_REST + 1.2, T_REST + 9, (k) => {
    const tip = c.maestroView.tipWorld(new THREE.Vector3());
    rest.group.position.copy(tip).add(tmpV.set(0, 0.8 + k * 0.6, 0));
    rest.group.quaternion.copy(app.engine.camera.quaternion);
    rest.opacity = Math.min(1, k * 4) * (1 - Math.max(0, k - 0.85) / 0.15);
  });
  c.during(T_REST + 1.4, T_REST + 6.6, (k) => (c.timeScale = k < 0.1 ? 1 - k * 10 : k > 0.9 ? (k - 0.9) * 10 : 0));
  c.at(T_REST + 6.6, () => (c.timeScale = 1));
  c.grade(T_REST + 1.2, 1, { saturation: 0.6, vignette: 0.6 });
  c.grade(T_REST + 6.4, 1.2, { saturation: 1, vignette: 0.3 });
  c.shot(T_REST, T_REST + 8, { pos: [c.add3(() => spot, -4.2, 2.2, 3.2), c.add3(() => spot, -1.5, 2.6, 5.2), c.add3(() => spot, 2.8, 2.0, 4.0)], look: c.mix(() => spot.clone().setY(spot.y + 1.2), c.R(c.maestro, 0, 0.9, 0), 0.5), fov: 32, ease: ease.linear });
  // ── 7. the first breath: the little one lifts its head
  const T_BREATH = 36;
  c.at(T_BREATH, () => {
    sil.pose = 'loom';
    c.mpose('idle');
  });
  c.at(T_BREATH + 1.4, () => {
    const lira = c.band.get('harp')!;
    (lira.view as MusicianView).play(1);
    audio.towerShot('harp', 0, audio.now() + 0.05, 0, 2);
    fx.burst(lira.world(new THREE.Vector3()).add(tmpV.set(0, 1.4, 0)), '#ffe9a8', 16, 2, 0.14, 0.8);
  });
  c.shot(T_BREATH, T_BREATH + 6, { pos: [c.add3(() => spot, 2.4, 1.3, 2.6), c.add3(() => spot, 2.0, 1.4, 2.2)], look: () => spot.clone().setY(spot.y + 1.6), fov: 26 });
  // ── 8. it gives back the last shard
  const T_GIFT = 42;
  c.cue(T_GIFT, 'story:shard');
  c.at(T_GIFT, () => {
    sil.pose = 'reach';
    sil.reach(heart());
  });
  c.shardFlight(T_GIFT + 1.2, 4.2, SHARD_COLORS[4], () => spot.clone().setY(spot.y + 1.8), () => turtle.facetWorld(4), 7, 1.1, () => {
    turtle.setShards(5);
    turtle.flashFacet(4);
    fx.flash(heart(), 3, '#ffd36b', 0.5);
  });
  c.shot(T_GIFT, T_GIFT + 2.4, { pos: c.add3(() => spot, -2.6, 1.6, 3.2), look: () => spot.clone().setY(spot.y + 1.8), fov: 34 });
  c.shot(T_GIFT + 2.4, T_GIFT + 5.6, { pos: [c.T(-5, 4, -10), c.T(-6, 8.5, -6)], look: [c.T(0, 4, -12), c.Sh(0, 7.4, 0)], fov: 42 });
  // ── 9. the Heart is whole: a pillar of light, a wave of colour
  const T_WHOLE = 47.8;
  c.shot(T_WHOLE - 2.2, T_WHOLE + 2.4, { pos: [c.Sh(2.2, 7.6, -2.6), c.Sh(1.6, 7.9, -2.2)], look: c.Sh(0, 7.45, 0), fov: [30, 26] });
  c.at(T_WHOLE - 1.6, () => [0, 1, 2, 3].forEach((i) => turtle.flashFacet(i)));
  c.cue(T_WHOLE, 'ending:bloom');
  c.flash(T_WHOLE, '#fff4d8', 0.9, 1.4);
  const pillar = glowSprite('#fff2c2', 1, 0);
  v.scene.add(pillar);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.2, 160, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2c2').multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  v.scene.add(beam);
  c.at(T_WHOLE, () => {
    turtle.heartGlow = 1.6;
    c.shake(0.9);
    fx.ring(turtle.group.position.clone().setY(turtle.group.position.y + 0.5), 90, '#ffd36b', 2.2, 0.04);
    fx.burst(heart(), '#ffe9a8', 120, 10, 0.3, 1.6);
    v.bloomWave(turtle.group.position);
    sil.reach(null);
    sil.pose = 'small';
  });
  c.during(T_WHOLE, T_WHOLE + 14, (k) => {
    const h = heart();
    beam.position.copy(h).setY(h.y + 80);
    (beam.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.45;
    pillar.position.copy(h);
    pillar.scale.setScalar(6 + Math.sin(k * 40) * 0.5);
    (pillar.material as THREE.SpriteMaterial).opacity = (1 - k) * 0.9;
  });
  c.life(T_WHOLE, 7, 1.1);
  c.colour(T_WHOLE, 4, 1.6);
  c.bloom(T_WHOLE, 1, 0.75);
  c.bloom(T_WHOLE + 3, 3, 0.45);
  // ── 10. the Great Song: the whole band, in concert
  const T_SONG = T_WHOLE + 2.4;
  c.at(T_SONG, () => {
    c.maestro.holder.position.copy(seatPos(0, -1.25, 0.03));
    c.maestro.holder.rotation.set(0, Math.PI, 0);
    turtle.shell.attach(c.maestro.holder);
    c.maestro.holder.position.copy(seatPos(0, -1.25, 0.03));
    c.maestro.holder.rotation.set(0, Math.PI, 0);
    c.maestro.tilt = 0;
    c.mpose('conduct');
    FULL_BAND.forEach((k) => {
      c.band.get(k)!.tilt = 0;
      const s = SEATS[k];
      c.band.get(k)!.holder.rotation.y = Math.atan2(s.x, s.z);
    });
    c.play('all');
    turtle.cheer();
    // the little Silence rides along now, at the front with the Coralitos
    turtle.shell.attach(sil.group);
    size = 0.45;
  });
  let silBow = 0;
  c.add({ update: () => {
    if (c.t >= T_SONG && sil.group.parent === turtle.shell) {
      sil.group.position.copy(seatPos(0.95, -3.55, 0.02));
      sil.group.rotation.set(silBow, Math.PI * 0.9, 0);
    }
  } }, null);
  // the 'add' above runs after the size/position updater: keep its world placement off once seated
  c.shot(T_SONG, T_SONG + 6.5, { pos: [c.T(11, 10, -9), c.T(13.5, 8.6, 3), c.T(4, 10.5, 12.5)], look: c.T(0, 5.6, 0), fov: 42 });
  // ── 11. concert montage on the beat (with a sour chick)
  const B2 = c.spb * 2;
  const T_MONT = T_SONG + 6.5;
  const T_VOICES = bandMontage(c, T_MONT, [['drum', 2], ['harp', 2], ['bell', 2], ['horn', 2], ['choir', 3], ['bass', 2], ['crystal', 2], ['shaker', 2]]);
  // the sour note: one of the Coralitos sings off-key (and gets on with it, beaming)
  const choir = c.band.get('choir')!;
  const T_SOUR = T_MONT + 8 * c.spb + 0.5;
  c.at(T_SOUR, () => {
    audio.cinematic('story:comic');
    choir.roll = 0.35;
    fx.burst(choir.world(new THREE.Vector3()).add(tmpV.set(0.3, 1.3, 0)), '#ff7aa8', 10, 2, 0.14, 0.6);
  });
  c.at(T_SOUR + B2, () => {
    choir.roll = 0;
    audio.cinematic('ending:bloom');
  });
  // ── 12. the five Voices ring, one after another; threads of light join them to the Heart
  const threads: LightThread[] = [];
  voices.forEach((lm, i) => {
    const t0 = T_VOICES + i * 2.1;
    const th = new LightThread(SHARD_COLORS[i], 0.08, 1.8, 0.22);
    th.mat.uniforms.uGrow.value = 0;
    v.scene.add(th.mesh);
    threads.push(th);
    c.add({ update: (_dt: number, t: number) => { th.set(lm.top(new THREE.Vector3()), heart()); th.update(t); } }, null);
    c.at(t0 + 0.2, () => {
      lm.sing();
      const p = lm.top(new THREE.Vector3());
      fx.flash(p, 14, SHARD_COLORS[i], 0.8);
      v.bloomWave(lm.group.position);
    });
    c.during(t0 + 0.4, t0 + 2.4, (k) => (th.mat.uniforms.uGrow.value = ease.outCubic(k)));
    const dir = () => lm.group.position.clone().sub(turtle.group.position).setY(0).normalize();
    c.shot(t0, t0 + 2.1, {
      pos: [() => turtle.group.position.clone().addScaledVector(dir(), -6).setY(turtle.group.position.y + 9), () => turtle.group.position.clone().addScaledVector(dir(), -5).setY(turtle.group.position.y + 10)],
      look: () => lm.top(new THREE.Vector3()).add(tmpV.set(0, -6, 0)),
      fov: [15, 12.5],
    });
  });
  const T_WEB = T_VOICES + 5 * 2.1;
  c.shot(T_WEB, T_WEB + 5, { pos: [c.T(-30, 40, 46), c.T(-38, 58, 60)], look: [c.T(0, 8, -10), c.T(0, 4, -20)], fov: [50, 56] });
  // ── 13. the redeemed guardians come to the party
  const T_GUESTS = T_WEB + 5;
  const scarab = c.add(new GoldenScarab());
  const moth = c.add(new AuroraMoth(9));
  const golem = c.add(new GentleGolem());
  scarab.group.position.copy(c.roadPoint(c.sAt(T_GUESTS) + 4, -11, 0));
  scarab.group.scale.setScalar(1.3);
  golem.group.position.copy(c.roadPoint(c.sAt(T_GUESTS) + 2, 13, 0));
  golem.group.scale.setScalar(1.25);
  golem.group.lookAt(turtle.group.position.x, golem.group.position.y, turtle.group.position.z);
  scarab.group.visible = moth.group.visible = golem.group.visible = false;
  c.at(T_GUESTS, () => {
    scarab.group.visible = moth.group.visible = golem.group.visible = true;
    scarab.walk = 1;
  });
  const scarabFrom = c.roadPoint(c.s0 - 4, -30, 0), scarabTo = c.roadPoint(c.s0 + 3, -11, 0);
  c.during(T_GUESTS, T_GUESTS + 4, (k) => {
    scarab.group.position.lerpVectors(scarabFrom, scarabTo, ease.out(k));
    scarab.group.lookAt(scarabTo.x, scarab.group.position.y, scarabTo.z);
  });
  c.at(T_GUESTS + 4, () => {
    scarab.walk = 0;
    scarab.dance = 1;
    scarab.group.lookAt(turtle.group.position.x, scarab.group.position.y, turtle.group.position.z);
  });
  const golemFrom = c.roadPoint(c.s0 + 10, 40, 0), golemTo = c.roadPoint(c.s0 + 2, 13, 0);
  c.during(T_GUESTS + 1, T_GUESTS + 5, (k) => {
    golem.group.position.lerpVectors(golemFrom, golemTo, ease.sine(k));
    golem.group.position.y = v.land.heightAt(golem.group.position.x, golem.group.position.z) + Math.abs(Math.sin(k * Math.PI * 4)) * 0.3;
    golem.group.lookAt(turtle.group.position.x, golem.group.position.y, turtle.group.position.z);
  });
  c.at(T_GUESTS + 5, () => (golem.pose = 'wave'));
  c.during(T_GUESTS, T_GUESTS + 9, (k) => {
    const tp = turtle.group.position;
    const a = k * Math.PI * 1.6 + 1;
    moth.group.position.set(tp.x + Math.cos(a) * 16, tp.y + 14 + Math.sin(k * 9) * 1.5, tp.z + Math.sin(a) * 16);
    moth.group.lookAt(tp.x + Math.cos(a + 0.3) * 16, moth.group.position.y, tp.z + Math.sin(a + 0.3) * 16);
    if (Math.random() < 0.3) fx.burst(moth.group.position, ['#7dffb0', '#b48cff', '#7ad7ff'][Math.floor(Math.random() * 3)], 3, 0.6, 0.4, 1.4, true, 0.3);
  });
  c.shot(T_GUESTS, T_GUESTS + 4.6, { pos: [c.T(-6, 3, -16), c.T(-9, 3.4, -13)], look: [() => scarab.group.position.clone().setY(scarab.group.position.y + 1), () => scarab.group.position.clone().setY(scarab.group.position.y + 1.4)], fov: 40 });
  c.shot(T_GUESTS + 4.6, T_GUESTS + 9, { pos: [c.T(4, 3, -18), c.T(6, 4, -16)], look: [() => golem.group.position.clone().setY(golem.group.position.y + 5), () => golem.group.position.clone().setY(golem.group.position.y + 5.5)], fov: 44 });
  // the golem claps along… and the clap bowls the Maestro over
  const T_CLAP = T_GUESTS + 9;
  c.at(T_CLAP, () => (golem.pose = 'clap'));
  c.at(T_CLAP + 1.3, () => {
    fx.ring(golem.group.position.clone().setY(golem.group.position.y + 4), 14, '#fff2c2', 0.8, 0.1);
    c.shake(0.5);
  });
  c.fall(c.maestro, T_CLAP + 1.5, 0.7);
  c.shot(T_CLAP, T_CLAP + 4.2, { pos: [c.Sh(-3.4, 6.6, -5.6), c.Sh(-3.0, 6.5, -5.2)], look: c.mix(c.R(c.maestro, 0, 0.6, 0), () => golem.group.position.clone().setY(golem.group.position.y + 4), 0.25), fov: 38 });
  // the moth lands on the colossus' nose: it goes cross-eyed… and sneezes
  const T_SNEEZE = T_CLAP + 4.2;
  const nose = c.T(0, 3.55, -8.3);
  c.during(T_SNEEZE, T_SNEEZE + 2.2, (k) => {
    const from = moth.group.position.clone();
    moth.group.position.lerpVectors(from, nose().add(tmpV.set(0, 0.6, 0)), ease.out(k));
    moth.flap = 1 - k * 0.7;
  });
  c.at(T_SNEEZE + 0.4, () => (c.turtleLook = () => nose().add(tmpV.set(0, 0.2, 0.5))));
  c.at(T_SNEEZE + 3.4, () => {
    turtle.hurt();
    c.shake(0.7);
    fx.burst(nose().add(tmpV.set(0, 0, -0.6)), '#ffffff', 50, 6, 0.3, 0.9);
    moth.flap = 1.4;
    c.turtleLook = null;
  });
  let mothFrom: THREE.Vector3 | null = null;
  c.during(T_SNEEZE + 3.4, T_SNEEZE + 6.4, (k) => {
    // blown off by the sneeze, it tumbles up and back to its circle
    mothFrom ??= moth.group.position.clone();
    const tp = turtle.group.position;
    const goal = new THREE.Vector3(tp.x + Math.cos(1) * 16, tp.y + 14, tp.z + Math.sin(1) * 16);
    moth.group.position.lerpVectors(mothFrom, goal, ease.inOut(k));
    moth.group.position.y += Math.sin(k * Math.PI) * 4;
    moth.group.rotation.z = Math.sin(k * Math.PI * 3) * 0.6 * (1 - k);
  });
  c.during(T_SNEEZE + 6.4, T_SNEEZE + 200, () => {
    const tp = turtle.group.position;
    const a = 1 + (c.wt - (T_SNEEZE + 6.4)) * 0.35;
    moth.group.position.set(tp.x + Math.cos(a) * 16, tp.y + 14 + Math.sin(c.wt * 1.3) * 1.2, tp.z + Math.sin(a) * 16);
    moth.group.lookAt(tp.x + Math.cos(a + 0.3) * 16, moth.group.position.y, tp.z + Math.sin(a + 0.3) * 16);
    moth.flap = 1;
  });
  c.shot(T_SNEEZE, T_SNEEZE + 5.4, { pos: [c.T(-3.4, 4.4, -12), c.T(-3.0, 4.2, -11.4)], look: c.T(0, 3.8, -7.8), fov: 32 });
  // ── 14. night: fireworks of notes; the Silence's cloak becomes the stars
  const T_NIGHT = T_SNEEZE + 5.4;
  c.sky(T_NIGHT, 5, { top: '#0b0d2e', horizon: '#3a2a6a', glow: '#ff9ac8', stars: 1.6, aurora: 0.6 });
  c.light(T_NIGHT, 5, 1.2, 0.7, '#c9c0ff');
  c.fog(T_NIGHT, 5, '#2a2450', 0.0035);
  const fireworks: NoteFirework[] = [];
  for (let i = 0; i < 9; i++) {
    const t0 = T_NIGHT + 1 + i * 0.9;
    const a = (i / 9) * Math.PI * 2;
    const from = () => heart();
    c.at(t0, () => {
      const fw = new NoteFirework(from(), heart().add(tmpV.set(Math.cos(a) * 22, 26 + (i % 3) * 7, Math.sin(a) * 22 - 10)), c.wt, BAND_COLORS[FULL_BAND[i % 8]]);
      v.scene.add(fw.group);
      fireworks.push(fw);
    });
  }
  c.add({ update: (_dt: number, t: number) => fireworks.forEach((fw) => fw.update(t, app.engine.camera.quaternion)) }, null);
  const stars = starCloak(v.scene);
  c.at(T_NIGHT + 4, () => {
    stars.position.copy(sil.group.getWorldPosition(new THREE.Vector3()));
    stars.visible = true;
    fx.burst(stars.position.clone().setY(stars.position.y + 1), '#e6e0ff', 60, 4, 0.2, 1.4);
  });
  c.during(T_NIGHT + 4, T_NIGHT + 14, (k) => {
    const m = stars.material as THREE.ShaderMaterial;
    m.uniforms.uK.value = ease.out(k);
  });
  c.shot(T_NIGHT, T_NIGHT + 5, { pos: [c.T(-9, 1.8, 10), c.T(-10, 2.2, 12)], look: [c.T(0, 22, -12), c.T(0, 30, -14)], fov: [54, 58] });
  c.shot(T_NIGHT + 5, T_NIGHT + 11, { pos: [c.Sh(2.6, 6.2, -6.2), c.Sh(3.4, 6.6, -7.4)], look: [c.Sh(0.9, 6.2, -3.6), c.Sh(0.5, 16, -14)], fov: [36, 50] });
  // ── 15. the world blooms: an aerial pull-back over the restored land
  const T_BLOOM = T_NIGHT + 11;
  c.at(T_BLOOM, () => v.bloomWave(turtle.group.position));
  c.fog(T_BLOOM, 4, undefined, 0.0022);
  c.shot(T_BLOOM, T_BLOOM + 7, { pos: [c.T(-16, 12, 18), c.T(-40, 48, 64)], look: [c.T(0, 5, -4), c.T(0, 2, -30)], fov: [44, 52], ease: ease.inOut });
  c.walk(T_BLOOM, 0.6, 2);
  // ── 16. the bow (and the little one bows late)
  const T_BOW = T_BLOOM + 7;
  c.walk(T_BOW - 1, 0, 1);
  c.cue(T_BOW, 'ending:bow');
  c.at(T_BOW + 0.8, () => {
    c.mpose('bow');
    c.play('all', false);
    c.pose('all', 'bow');
    turtle.cheer();
  });
  c.during(T_BOW + 1, T_BOW + 3, (k) => (c.turtleLook = () => turtle.group.localToWorld(new THREE.Vector3(0, 0.5 - k * 2, -14))));
  c.at(T_BOW + 3.6, () => {
    c.pose('all', 'cheer');
    c.mpose('cheer');
    c.turtleLook = null;
  });
  // …and the little one bows too, a beat late, alone (then hurries back up)
  c.during(T_BOW + 3.4, T_BOW + 4.3, (k) => (silBow = Math.sin(k * Math.PI) * 0.7));
  c.shot(T_BOW, T_BOW + 6, { pos: [c.T(0, 7.6, -13.5), c.T(0, 7.2, -12.6)], look: c.T(0, 5.6, -1.5), fov: 36 });
  // ── 17. the cast (joyful credits): each one in their element
  const T_CAST = T_BOW + 6;
  const cast: { name: string; role: string; at: Anchor; from: Anchor; act?: (t0: number) => void }[] = [
    { name: pt ? 'Vovó Tuba' : 'Granny Tuba', role: pt ? 'a Grande Tartaruga' : 'the Great Turtle', at: c.T(0, 3.6, -6.6), from: c.T(-6.5, 4.2, -14), act: (t0) => c.at(t0 + 0.4, () => turtle.cheer()) },
    { name: pt ? 'O Maestro' : 'The Maestro', role: pt ? 'regente da Vila-Orquestra' : 'conductor of the village-orchestra', at: c.R(c.maestro, 0, 0.75, 0), from: c.R(c.maestro, -1.6, 1.3, -2.6), act: (t0) => c.at(t0, () => c.mpose('conduct')) },
    { name: 'Lira', role: pt ? 'a aprendiz · harpa' : 'the apprentice · harp', at: c.R(c.band.get('harp')!, 0, 0.8, 0), from: c.R(c.band.get('harp')!, -1.8, 1.5, -2.4) },
    { name: 'Bumbo', role: pt ? 'tambor' : 'drum', at: c.R(c.band.get('drum')!, 0, 0.8, 0), from: c.R(c.band.get('drum')!, 1.8, 1.5, -2.4), act: (t0) => c.fall(c.band.get('drum')!, t0 + 1.2, 0.4) },
    { name: pt ? 'Dona Badalo' : 'Granny Clang', role: pt ? 'sino' : 'bell', at: c.R(c.band.get('bell')!, 0, 0.8, 0), from: c.R(c.band.get('bell')!, -2.6, 1.5, -1.0) },
    { name: pt ? 'Chocalho' : 'Rattle', role: pt ? 'chocalho' : 'shaker', at: c.R(c.band.get('shaker')!, 0, 0.8, 0), from: c.R(c.band.get('shaker')!, 2.6, 1.5, -1.0), act: (t0) => c.during(t0, t0 + 2.6, (k) => (c.band.get('shaker')!.spin = k * Math.PI * 4)) },
    { name: 'Cristalina', role: pt ? 'cristal' : 'crystal', at: c.R(c.band.get('crystal')!, 0, 0.8, 0), from: c.R(c.band.get('crystal')!, -2.4, 1.5, 1.8) },
    { name: 'Trompa', role: pt ? 'trompa' : 'horn', at: c.R(c.band.get('horn')!, 0, 0.8, 0), from: c.R(c.band.get('horn')!, 2.4, 1.5, 1.8) },
    { name: pt ? 'Os Coralitos' : 'The Chorlets', role: pt ? 'coral' : 'choir', at: c.R(c.band.get('choir')!, 0, 0.7, 0), from: c.R(c.band.get('choir')!, 0.6, 1.2, -2.6) },
    { name: 'Grave', role: pt ? 'contrabaixo' : 'double bass', at: c.R(c.band.get('bass')!, 0, 1.0, 0), from: c.R(c.band.get('bass')!, 1.2, 1.8, 3.2) },
    { name: pt ? 'O Silêncio' : 'The Silence', role: pt ? 'o respiro entre as notas' : 'the breath between the notes', at: () => sil.group.getWorldPosition(new THREE.Vector3()).add(tmpV.set(0, 0.8, 0)), from: () => sil.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(1.4, 1.0, -2.2).applyQuaternion(turtle.group.quaternion)) },
  ];
  c.at(T_CAST - 0.2, () => c.play('all'));
  c.at(T_CAST - 0.2, () => c.mpose('conduct'));
  const CAST_D = 2.7;
  cast.forEach((m, i) => {
    const t0 = T_CAST + i * CAST_D;
    c.shot(t0, t0 + CAST_D, { pos: [m.from, c.mix(m.from, m.at, 0.12)], look: m.at, fov: [32, 30] });
    c.castName(t0 + 0.3, t0 + CAST_D - 0.3, m.name, m.role, i % 2 === 1);
    m.act?.(t0);
  });
  // ── 18. the credits roll over the colossus walking on under the new stars
  const T_ROLL = T_CAST + cast.length * CAST_D;
  c.walk(T_ROLL, 0.8, 2);
  const lines: [string, string][] = [
    [pt ? 'Uma produção' : 'A production of', 'Uchihadam Production'],
    [pt ? 'Direção e design' : 'Direction & design', 'Uchihadam Production'],
    [pt ? 'Mundo, personagens e animação' : 'World, characters & animation', pt ? 'gerados em tempo real, sem imagens' : 'generated in real time, no images'],
    [pt ? 'Música e sons' : 'Music & sound', pt ? '100% sintetizados ao vivo' : '100% synthesised live'],
    [pt ? 'Feito com' : 'Made with', 'three.js · Web Audio · TypeScript'],
  ];
  c.roll(T_ROLL + 0.5, 15, lines.map(([a, b]) => `<div class="cl"><span>${a}</span><b>${b}</b></div>`).join('') + `<div class="cl big"><b>${app.screens.t('thanks')}</b></div>`);
  c.shot(T_ROLL, T_ROLL + 17, { pos: [c.T(-18, 9, 16), c.T(-34, 30, 44)], look: [c.T(0, 5, -8), c.T(0, 4, -36)], fov: [44, 48], ease: ease.inOut });
  c.at(T_ROLL + 16.5, () => c.card(`<div class="the-end">${app.screens.t('theEnd')}</div>${logoHTML(app.screens.t('tagline'), 'small')}`, 'cine-title'));
  c.end(T_ROLL + 23);
}

/** the Silence's cloak turning into stars that rise and spread over the sky */
function starCloak(scene: THREE.Scene): THREE.Points {
  const n = 900;
  const dir = new Float32Array(n * 3);
  const rnd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, el = 0.25 + Math.random() * 1.2;
    dir[i * 3] = Math.cos(a) * Math.cos(el);
    dir[i * 3 + 1] = Math.sin(el);
    dir[i * 3 + 2] = Math.sin(a) * Math.cos(el);
    rnd[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } },
    vertexShader: /* glsl */ `attribute float aR; uniform float uK; varying float vA;
      void main(){ float d = uK * (60.0 + aR * 260.0); vec3 p = position * d; p.y += uK * 6.0;
        vA = smoothstep(0.0, 0.08, uK) * (0.5 + 0.5 * aR);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (2.0 + aR * 3.0) * (1.0 + (1.0 - uK) * 3.0); }`,
    fragmentShader: /* glsl */ `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vec3(1.0, 0.96, 0.85) * 2.0, a * vA); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.visible = false;
  scene.add(p);
  return p;
}

// ───────────────────────────── the Abyss: memory 5 and the epilogue ─────────────────────────────

async function epilogue(app: App) {
  audio.stopMusic(1);
  audio.setAmbience('citadel', 0.3);
  // memory 5: in the depths, the first rest of the Great Song, forgotten, never played
  await runScene(app, { world: 'citadel', look: ABYSS_LOOK, bpm: 72, bars: 60, seed: 41, s0: 30, life: 0.2, colorScale: 0, maestro: false, landmark: null, features: [{ kind: 'meadow', from: 0, to: 120 }] }, (c) => abyssScript(c), 1600);
  // the next year's Grand Tour: a little masked one rides with the band, and marks the rests
  audio.setAmbience('meadow', 0.6);
  await runScene(app, {
    world: 'meadow', look: SPRING_LOOK, bpm: 100, bars: 110, seed: 11, curviness: 0.45, s0: 30, life: 1.1, band: FULL_BAND, shards: 5, landmark: null,
    features: [{ kind: 'meadow', from: 0, to: 90 }, { kind: 'lake', from: 30, to: 80, side: 1 }, { kind: 'forest', from: 90, to: 150, side: -1 }],
  }, (c) => nextTourScript(app, c), 1400);
  worldColor.uWorldSat.value = 1;
}

function abyssScript(c: Cine) {
  const v = c.view;
  v.turtle.group.visible = false;
  v.land.group.visible = false;
  v.grass.mesh.visible = false;
  c.memoryFrame(0, true);
  c.grade(0, 0.01, { saturation: 0.7, vignette: 0.9, grain: 0.09, tint: '#e6d2ff', contrast: 0.96 });
  c.cue(0.3, 'story:memory');
  // the Great Song: five lines of light spiralling down into the dark, full of notes…
  const centre = c.roadPoint(c.s0, 0, 40);
  const stave = new THREE.Group();
  stave.position.copy(centre);
  v.scene.add(stave);
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d9d3ff').multiplyScalar(1.6), transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, fog: false });
  const R = 9, H = 70, turns = 2.2;
  const spiral = (r: number, y0: number, u: number) => new THREE.Vector3(Math.cos(u * turns * Math.PI * 2) * r, y0 - u * H, Math.sin(u * turns * Math.PI * 2) * r);
  for (let i = 0; i < 5; i++) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 120; k++) pts.push(spiral(R + i * 0.32, 0, k / 120));
    stave.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.05, 4, false), lineMat));
  }
  const notesGroup = new THREE.Group();
  stave.add(notesGroup);
  const REST_U = 0.82;
  for (let k = 0; k < 46; k++) {
    const u = 0.04 + (k / 46) * 0.92;
    if (Math.abs(u - REST_U) < 0.03) continue;
    const p = spiral(R + 0.64 + Math.sin(k * 2.3) * 0.5, 0, u);
    const n = glowSprite(k % 2 ? '#ffe9a8' : '#c9b8ff', 0.9, 0.9);
    n.position.copy(p);
    notesGroup.add(n);
  }
  // …and, deep down, one rest nobody ever played: grey, forgotten
  const restPos = spiral(R + 0.64, 0, REST_U);
  const rest = new RestGlyph('#8f8aa3', 1.6);
  rest.group.position.copy(restPos);
  stave.add(rest.group);
  const restW = () => stave.localToWorld(restPos.clone());
  // the descent along the stave
  c.shot(0, 9, {
    pos: [0.02, 0.25, 0.5, 0.72].map((u) => () => stave.localToWorld(spiral(R + 9, 4, u))),
    look: [0.08, 0.32, 0.58, 0.8].map((u) => () => stave.localToWorld(spiral(R, 0, u))),
    fov: 50,
    ease: ease.linear,
  });
  c.shot(9, 15, { pos: [() => restW().add(new THREE.Vector3(6, 2.5, 6)), () => restW().add(new THREE.Vector3(3, 1.2, 3))], look: () => restW(), fov: [40, 30] });
  c.during(11, 15, (k) => (rest.opacity = 0.5 + 0.5 * Math.abs(Math.sin(k * 14)) * k));
  // from the forgotten rest, a tiny masked shadow is born
  const little = c.silence(0.28, restW().add(tmpV.set(0, -0.8, 0)));
  little.pose = 'small';
  little.emerge = 0;
  c.during(14, 18, (k) => (little.emerge = ease.outCubic(k)));
  c.add({ update: () => little.lookAt(v.engine.camera.position) }, null);
  c.at(14, () => v.fx.burst(restW(), '#d9d3ff', 40, 2, 0.14, 1.4));
  c.shot(15, 21, { pos: [() => restW().add(new THREE.Vector3(2.2, 0.4, 2.2)), () => restW().add(new THREE.Vector3(1.7, 0.3, 1.7))], look: () => restW().add(tmpV.set(0, -0.3, 0)), fov: 30 });
  c.end(21);
}

function nextTourScript(app: App, c: Cine) {
  const v = c.view;
  const turtle = v.turtle;
  c.walk(0, 1);
  c.mpose('conduct');
  c.play('all');
  c.cue(0.2, 'story:journey');
  // a little masked one rides at the front, with the Coralitos
  const little = c.silence(0.42, new THREE.Vector3());
  little.pose = 'small';
  turtle.shell.add(little.group);
  little.group.position.copy(seatPos(0.95, -3.55, 0.02));
  little.group.rotation.y = Math.PI * 0.9;
  const lit = () => turtle.shell.localToWorld(seatPos(0.95, -3.55, 0.6));
  // threads of light link the five Voices again
  const petals = c.add(new Fall(['#ffc2d9', '#ffffff'], 500, 30, 22, 30, 1.6), null);
  v.scene.add(petals.points);
  c.add({ update: () => petals.points.position.copy(turtle.group.position) }, null);
  petals.alpha = 0.8;
  // 1. spring, a year later: the Grand Tour sets off again
  c.shot(0, 6, { pos: [c.T(-26, 14, 20), c.T(-20, 9, 12)], look: [c.T(0, 5, -10), c.T(0, 5, -2)], fov: 44 });
  // 2. around the shell… who's that?
  c.shot(6, 11, { pos: [c.T(9, 8.8, -10), c.T(5, 7.2, -9.5)], look: [c.T(0, 5.4, -1), () => lit()], fov: [40, 30] });
  // 3. the band plays; the little one raises a hand: everyone stops — a rest!
  const T_REST = 13;
  c.shot(11, 16.5, { pos: [c.Sh(2.6, 6.0, -6.8), c.Sh(2.2, 5.9, -6.4)], look: c.mix(() => lit(), c.Sh(0, 6.2, -1.2), 0.45), fov: 34 });
  c.at(T_REST, () => {
    little.pose = 'reach';
    c.play('all', false);
    c.pose('all', 'idle');
    c.mpose('idle');
    c.timeScale = 0.15;
    const r = new RestGlyph('#fff4c8', 0.9);
    r.group.position.copy(lit()).add(tmpV.set(0, 1.2, 0));
    r.group.quaternion.copy(app.engine.camera.quaternion);
    v.scene.add(r.group);
    c.during(T_REST, T_REST + 2.2, (k) => (r.opacity = Math.sin(Math.PI * k)));
  });
  c.at(T_REST + 2.2, () => {
    c.timeScale = 1;
    little.pose = 'small';
    c.play('all');
    c.mpose('cheer');
    turtle.cheer();
    v.fx.ring(turtle.group.position.clone().setY(turtle.group.position.y + 0.5), 30, '#ffd36b', 1.2, 0.05);
    v.fx.burst(lit(), '#ffe9a8', 30, 3, 0.2, 1);
  });
  c.at(T_REST + 4.4, () => c.mpose('conduct'));
  // 4. the Maestro winks to the little one (a nod); then the long road into the sunrise
  c.shot(16.5, 20.5, { pos: [c.R(c.maestro, 1.3, 1.2, -2.6), c.R(c.maestro, 1.1, 1.2, -2.3)], look: c.R(c.maestro, 0, 0.75, 0), fov: 30 });
  c.hop(c.maestro, 18.6, 0.35, 0.18);
  c.shot(20.5, 30, { pos: [c.T(-12, 6, 14), c.T(-30, 30, 42)], look: [c.T(0, 5, -10), c.T(0, 3, -50)], fov: [42, 48], ease: ease.inOut });
  c.at(23, () => c.card(`${logoHTML(app.screens.t('tagline'), 'small')}<div class="the-end" style="font-size:30px;margin-top:14px">${app.screens.t('thanks')}</div>`, 'cine-title'));
  c.end(30);
}

void damp;
void Gust;
void Fireflies;
void StaffCrown;
void InkCoil;
