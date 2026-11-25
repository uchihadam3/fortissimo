/**
 * Cinematics, all in-engine and wordless: the opening (a joyful world, the Silence, the grey,
 * the last note on the Maestro's baton, the title) and the ending (the Silence falls, is small
 * and alone, the Maestro conducts a rest, the night of stars, the bow).
 */
import * as THREE from 'three';
import type { App } from './app';
import type { WorldId } from '../sim/defs';
import { audio } from './sound';
import { Journey } from '../sim/journey';
import { JourneyView } from '../view/journeyView';
import { showcaseDef } from './showcase';
import { MaestroView } from '../view/models';
import { EnemyView } from '../view/enemies';
import { SHELL, domeY } from '../sim/shell';
import { logoHTML } from '../ui/logo';
import { worldColor } from '../view/worldColor';
import { damp, easeInOut } from '../view/kit';

type Vec = [number, number, number];
interface Key {
  t: number;
  pos: Vec;
  look: Vec;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A running cinematic: world, colossus, Maestro, overlay, timeline. */
class Cine {
  readonly sim: Journey;
  readonly view: JourneyView;
  readonly maestro = new MaestroView();
  readonly overlay: HTMLElement;
  private remove: () => void = () => {};
  t = 0;
  private events: { t: number; fn: () => void; done?: boolean }[] = [];
  private tracks: { t0: number; t1: number; fn: (k: number) => void }[] = [];
  keys: Key[] = [];
  /** the colossus walks (path units per second) */
  walkSpeed = 0.9;
  walking = true;
  skipped = false;
  private ended!: () => void;
  readonly done: Promise<void>;
  private beatSpb: number;
  private startMs = performance.now();

  constructor(readonly app: App, world: WorldId, bpm: number) {
    app.enterCinematic();
    const def = showcaseDef(world);
    this.sim = new Journey(def, bpm);
    this.sim.turtle.s = 20;
    this.beatSpb = 60 / bpm;
    this.view = new JourneyView(app.engine, def, this.sim);
    this.view.cineRate = 50;
    app.engine.setScene(this.view.scene);
    app.engine.camera.far = 5000;
    app.engine.camera.fov = 40;
    app.engine.camera.updateProjectionMatrix();
    app.engine.renderer.toneMappingExposure = this.view.look.exposure;
    app.engine.paused = false;
    // the Maestro rides in front of the Heart, facing the road
    const x = -0.9, z = -1.35;
    this.maestro.group.position.set(x, SHELL.y0 + domeY(x, z) + 0.05, z);
    this.maestro.group.scale.setScalar(1.6);
    this.maestro.group.rotation.y = Math.PI + 0.35;
    this.view.turtle.shell.add(this.maestro.group);
    this.overlay = document.createElement('div');
    this.overlay.className = 'cine-overlay';
    this.overlay.innerHTML = `<div class="bar top"></div><div class="bar bottom"></div><div class="card"></div><button class="skip">${app.screens.t('skip')} ⏭</button>`;
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
    const cleanupInput = () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    this.remove = app.engine.onUpdate((dt) => {
      if (holding) {
        holdT += dt;
        skipBtn.style.setProperty('--hold', String(Math.min(1, holdT / 1.2)));
        if (holdT > 1.2) this.skip();
      } else skipBtn.style.setProperty('--hold', '0');
      this.update(dt);
    });
    const prevEnd = this.ended;
    this.ended = () => {
      cleanupInput();
      prevEnd();
    };
  }

  /** restart the timeline clock (call when the cinematic becomes visible) */
  begin() {
    // developer: ?cinet=30 starts the timeline at 30 s
    const jump = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('cinet') ?? 0) : 0;
    this.startMs = performance.now() - jump * 1000;
    (window as unknown as { __ready: boolean }).__ready = true;
  }

  at(t: number, fn: () => void) {
    this.events.push({ t, fn });
  }

  during(t0: number, t1: number, fn: (k: number) => void) {
    this.tracks.push({ t0, t1, fn });
  }

  /** world point from turtle-local coordinates */
  local(v: Vec): THREE.Vector3 {
    return this.view.turtle.group.localToWorld(new THREE.Vector3(...v));
  }

  card(html: string, cls = '') {
    const c = this.overlay.querySelector('.card') as HTMLElement;
    c.className = `card ${cls}`;
    c.innerHTML = html;
    requestAnimationFrame(() => c.classList.add('show'));
  }

  private update(dt: number) {
    // real time, so the picture stays locked to the music even when frames are slow
    this.t = (performance.now() - this.startMs) / 1000;
    const t = this.t;
    for (const e of this.events) {
      if (!e.done && t >= e.t) {
        e.done = true;
        e.fn();
      }
    }
    for (const tr of this.tracks) {
      if (t >= tr.t0 && t <= tr.t1 + dt) tr.fn(Math.min(1, (t - tr.t0) / Math.max(1e-3, tr.t1 - tr.t0)));
    }
    if (this.walking) this.sim.turtle.s += this.walkSpeed * dt;
    this.sim.walking = this.walking;
    this.sim.time += dt;
    const beat = this.sim.time / this.beatSpb;
    this.view.update(dt, this.app.engine.time, this.sim.time, beat, true);
    this.maestro.update(dt, this.app.engine.time, beat);
    // camera from keyframes (turtle-local)
    if (this.keys.length) {
      let i = 0;
      while (i < this.keys.length - 2 && this.keys[i + 1].t <= t) i++;
      const a = this.keys[i], b = this.keys[Math.min(this.keys.length - 1, i + 1)];
      const k = b.t > a.t ? easeInOut(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)))) : 1;
      const pos = this.local(a.pos).lerp(this.local(b.pos), k);
      const look = this.local(a.look).lerp(this.local(b.look), k);
      this.view.cine = { pos, look };
    }
  }

  skip() {
    if (this.skipped) return;
    this.skipped = true;
    this.finish();
  }

  async finish() {
    await this.app.screens.fadeTo(1, 700);
    this.dispose();
    this.ended();
  }

  dispose() {
    this.remove();
    this.overlay.remove();
    this.view.cine = null;
    this.view.dispose();
  }
}

export async function playCutscene(app: App, name: 'intro' | 'ending', _world?: WorldId): Promise<void> {
  if (name === 'intro') return intro(app);
  return ending(app);
}

// ───────────────────────────── the opening ─────────────────────────────

async function intro(app: App) {
  audio.stopMusic(1.5);
  audio.setAmbience('meadow', 0.7);
  const c = new Cine(app, 'meadow', 92);
  const v = c.view;
  v.life = v.lifeTarget = 1.12;
  c.walkSpeed = 0.75;
  c.maestro.pose = 'conduct';
  // the Silence on the horizon (hidden until it rises)
  const giant = new EnemyView(-1, 'silence', 9);
  v.scene.add(giant.group);
  const giantPos = () => {
    const p = v.land.path.at(c.sim.turtle.s + 95);
    return new THREE.Vector3(p.x, 0, p.z);
  };
  let giantRise = 0;
  let giantArm = 0;
  c.keys = [
    // a wide, low establishing shot: the colossus walks toward us through the meadow
    { t: 0, pos: [-16, 3.2, -34], look: [0, 4.5, 0] },
    { t: 8, pos: [-22, 5, -18], look: [0, 4.2, 0] },
    // alongside, the village and its lanterns
    { t: 15, pos: [-20, 8, 2], look: [0, 4.6, -1] },
    // the Maestro conducting by the Heart
    { t: 18, pos: [-4.6, 7.2, -5.6], look: [-0.9, 6.3, -1.35] },
    { t: 23, pos: [-3.2, 6.9, -6.2], look: [-0.9, 6.3, -1.35] },
    // something on the horizon…
    { t: 25, pos: [5, 7.5, 15], look: [0, 12, -90] },
    { t: 34, pos: [3, 6.5, 12], look: [0, 16, -90] },
    // the grey wave
    { t: 37, pos: [-18, 15, 16], look: [0, 3, -4] },
    { t: 41, pos: [-14, 9, 6], look: [0, 3.5, -2] },
    // alone in the grey
    { t: 44, pos: [-4.8, 7.4, -5.4], look: [-0.9, 6.1, -1.35] },
    { t: 53, pos: [-3.6, 6.8, -5.9], look: [-0.9, 6.1, -1.35] },
    // hope: circling the little light
    { t: 58, pos: [1.6, 7.6, -5.8], look: [-0.9, 6.5, -1.35] },
    { t: 63, pos: [-10, 5.5, -16], look: [0, 3.5, -3] },
    // the first step, and the title
    { t: 68, pos: [-18, 9, -6], look: [0, 4, -4] },
    { t: 74, pos: [-26, 28, 32], look: [0, 4, -34] },
    { t: 80, pos: [-26, 32, 36], look: [0, 4, -38] },
  ];
  c.at(0.2, () => audio.cinematic('intro:dawn'));
  c.at(8, () => {
    audio.cinematic('intro:festival');
    v.turtle.cheer();
  });
  c.at(22, () => (c.maestro.pose = 'idle'));
  c.at(24, () => {
    audio.cinematic('intro:approach');
    c.maestro.pose = 'point';
  });
  // the grey creeps toward the colossus
  c.during(24, 36, (k) => {
    v.lifeTarget = 1.12 - k * 0.9;
    v.colorScale = 1 - k * 0.55;
    giantRise = easeInOut(Math.min(1, k * 1.3));
  });
  c.at(34, () => (giantArm = 1));
  c.at(36, () => {
    audio.cinematic('intro:shatter');
    v.fx.ring(v.turtle.group.position.clone().setY(v.turtle.group.position.y + 1), 70, '#cfd3e6', 1.6, 0.05);
    v.fx.flash(v.turtle.group.position.clone().setY(v.turtle.group.position.y + 7), 6, '#ffffff', 0.6);
    v.shake(0.9);
    v.colorScale = 0;
    v.life = v.lifeTarget = 0.02;
    v.turtle.heartGlow = 0;
    v.turtle.lights = 0;
  });
  c.at(37, () => {
    c.walking = false;
    c.maestro.pose = 'sad';
    c.maestro.glow = 0.25;
  });
  c.during(37, 40, (k) => (v.turtle.sleep = k));
  c.at(38, () => audio.cinematic('intro:grey'));
  c.during(38, 46, (k) => (giantRise = 1 - easeInOut(k)));
  c.at(54, () => {
    audio.cinematic('intro:hope');
    c.maestro.pose = 'raise';
  });
  c.during(54, 62, (k) => {
    c.maestro.glow = 0.25 + k * 1.6;
    const m = c.maestro.group.getWorldPosition(new THREE.Vector3());
    v.extraSources = [{ x: m.x, z: m.z, r: 2 + k * 14, s: 1.1 }];
    v.turtle.heartGlow = k * 0.6;
  });
  c.at(60, () => (v.turtle.sleep = 0.6));
  c.during(60, 64, (k) => (v.turtle.sleep = 1 - k));
  c.at(64, () => {
    c.walking = true;
    c.walkSpeed = 0.9;
    v.turtle.lights = 1;
    v.turtle.heartGlow = 1;
    v.extraSources = [];
    v.colorScale = 1;
    c.maestro.pose = 'conduct';
    v.shake(0.4);
    v.fx.ring(v.turtle.group.position.clone().setY(v.turtle.group.position.y + 0.4), 30, '#ffd36b', 1.2, 0.05);
  });
  c.during(64, 72, (k) => (v.lifeTarget = 0.1 + k * 0.25));
  c.at(70, () => {
    audio.cinematic('intro:title');
    c.card(logoHTML(app.screens.t('tagline')), 'title');
  });
  c.at(79, () => c.finish());
  // per-frame: the giant
  const removeGiant = app.engine.onUpdate((dt) => {
    const gp = giantPos();
    const ground = v.land.heightAt(gp.x, gp.z);
    giant.push(c.t, gp.x, gp.z);
    giant.update(dt, c.t, c.t * 1.5, () => ground, (x, z, y, out) => out.set(x, y, z), app.engine.camera.quaternion);
    giant.group.position.y = ground - 30 + giantRise * 30;
    giant.group.visible = giantRise > 0.01;
    giant.group.lookAt(v.turtle.group.position.x, giant.group.position.y, v.turtle.group.position.z);
    void giantArm;
  });
  c.begin();
  app.screens.fadeTo(0, 1600);
  await c.done;
  removeGiant();
  worldColor.uWorldSat.value = 1;
}

// ───────────────────────────── the ending ─────────────────────────────

async function ending(app: App) {
  audio.stopMusic(1);
  audio.setAmbience('citadel', 0.5);
  const c = new Cine(app, 'citadel', 84);
  const v = c.view;
  v.life = v.lifeTarget = 0.12;
  v.colorScale = 0.4;
  c.walkSpeed = 0.5;
  c.maestro.pose = 'conduct';
  const small = new EnemyView(-2, 'silence', 9);
  v.scene.add(small.group);
  let size = 9;
  let fade = 1;
  const spot = () => {
    const p = v.land.path.at(c.sim.turtle.s + 16);
    return new THREE.Vector3(p.x, 0, p.z);
  };
  const stars: THREE.Points[] = [];
  c.keys = [
    { t: 0, pos: [-9, 8, 6], look: [0, 6, -18] },
    { t: 6, pos: [-6, 6, -6], look: [0, 3, -16] },
    { t: 14, pos: [-3.5, 3.2, -12], look: [0, 1.6, -16] },
    { t: 24, pos: [-4.4, 6.8, -5.8], look: [-0.9, 6.0, -1.35] },
    { t: 30, pos: [-6, 5.5, -9], look: [0, 3, -16] },
    { t: 38, pos: [-14, 9, -4], look: [0, 6, -16] },
    { t: 56, pos: [-20, 14, 12], look: [0, 10, -24] },
    { t: 74, pos: [-4.2, 7.0, -6.0], look: [-0.9, 6.2, -1.35] },
    { t: 84, pos: [-30, 30, 40], look: [0, 6, -30] },
    { t: 96, pos: [-30, 34, 46], look: [0, 6, -34] },
  ];
  c.at(0.2, () => {
    audio.cinematic('ending:fall');
    v.shake(0.8);
  });
  c.during(0, 6, (k) => (size = 9 - easeInOut(k) * 7.2));
  c.at(5, () => (c.walking = false));
  c.at(6, () => {
    audio.cinematic('ending:alone');
    c.maestro.pose = 'idle';
  });
  c.at(26, () => {
    audio.cinematic('ending:rest');
    c.maestro.pose = 'raise';
  });
  c.at(30, () => (c.maestro.pose = 'idle'));
  c.at(36, () => {
    audio.cinematic('ending:bloom');
    c.maestro.pose = 'cheer';
    v.turtle.cheer();
    v.bloomWave();
    const p = small.group.position.clone();
    v.fx.ring(p, 60, '#ffd36b', 2, 0.04);
    v.fx.release(p.clone().setY(p.y + 3), '#c9b8ff', true);
    // its cloak becomes the stars
    stars.push(starBurst(v.scene, p));
  });
  c.during(36, 46, (k) => {
    fade = 1 - k;
    v.lifeTarget = 0.12 + k * 1.0;
    v.colorScale = 0.4 + k * 1.6;
  });
  c.at(48, () => (c.walking = true));
  c.at(74, () => {
    audio.cinematic('ending:bow');
    c.maestro.pose = 'bow';
  });
  c.at(80, () => c.card(`<div class="the-end">${app.screens.t('theEnd')}</div>${logoHTML(app.screens.t('tagline'), 'small')}`, 'title'));
  c.at(95, () => c.finish());
  const removeSmall = app.engine.onUpdate((dt) => {
    const sp = spot();
    const ground = v.land.heightAt(sp.x, sp.z);
    small.push(c.t, sp.x, sp.z);
    small.update(dt, c.t, c.t, () => ground, (x, z, y, out) => out.set(x, y, z), app.engine.camera.quaternion);
    small.group.scale.setScalar(Math.max(0.01, size * fade));
    small.group.position.y = ground + 0.2;
    small.group.lookAt(v.turtle.group.position.x, small.group.position.y, v.turtle.group.position.z);
    small.group.visible = fade > 0.02;
    for (const s of stars) {
      s.position.y += dt * 6;
      (s.material as THREE.PointsMaterial).opacity = damp((s.material as THREE.PointsMaterial).opacity, 1, 1, dt);
    }
  });
  c.begin();
  app.screens.fadeTo(0, 1600);
  await c.done;
  removeSmall();
  for (const s of stars) s.geometry.dispose();
  worldColor.uWorldSat.value = 1;
}

function starBurst(scene: THREE.Scene, at: THREE.Vector3): THREE.Points {
  const n = 600;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 40, y = Math.random() * 60;
    pos[i * 3] = at.x + Math.cos(a) * r;
    pos[i * 3 + 1] = at.y + y;
    pos[i * 3 + 2] = at.z + Math.sin(a) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: new THREE.Color('#fff4c8').multiplyScalar(2), size: 0.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const p = new THREE.Points(g, m);
  scene.add(p);
  return p;
}

void sleep;
