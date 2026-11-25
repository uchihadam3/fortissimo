/**
 * Everything 3D in a journey: the land, the sky, the grass, the colossus with its towers, the
 * creatures, the landmark, pickups and effects. Sim events are replayed at their timestamps on the
 * view clock (slightly behind the simulation, so what you see is what you hear).
 */
import * as THREE from 'three';
import type { Engine } from '../core/engine';
import type { Journey, JourneyDef, SimEvent, Enemy } from '../sim/journey';
import { DUETS, ENEMIES, ENEMY_SCALE, TOWERS, type DuetId, type TowerKind } from '../sim/defs';
import { SLOTS } from '../sim/shell';
import { LOOKS, type WorldLook } from './styles';
import { buildLandscape, type Landscape, treeUniforms } from './landscape';
import { Sky } from './sky';
import { Grass } from './grass';
import { Turtle } from './turtle';
import { TowerView } from './towers';
import { EnemyView } from './enemies';
import { Fx } from './fx';
import { Landmark, MistView, PickupView } from './journeyProps';
import { damp, glowMat, torus } from './kit';
import { setSources, worldColor } from './worldColor';
import { Rng } from '../core/rng';

export type Pick = { type: 'slot'; id: number } | { type: 'pickup'; id: number } | { type: 'turtle' };

const INK: Partial<Record<string, string>> = {
  blot: '#463d63', blotling: '#6a5f8c', scurry: '#4f6185', shell: '#4a4660', moth: '#9a90b8', shield: '#3d4a6b',
  bubble: '#9f96d6', phantom: '#d9d3ff', muffler: '#8a8598', mender: '#3f5a52', obelisk: '#4a465c', bossBlot: '#3a3158',
  bossScarab: '#a8742e', bossMoth: '#9fc4ea', bossGolem: '#ff6a1f', silence: '#1d1a2b',
};

class SlotPad {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private ring: THREE.Mesh;
  state = 0; // 0 idle, 1 affordable, 2 selected
  occupied = false;
  private glow = 0;

  constructor(readonly id: number) {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.22, 6), new THREE.MeshStandardMaterial({ color: '#e9dcc0', roughness: 0.8 }));
    stone.rotation.y = Math.PI / 6;
    stone.castShadow = true;
    stone.receiveShadow = true;
    this.group.add(stone);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd36b').multiplyScalar(1.5), transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false });
    this.ring = new THREE.Mesh(torus(0.72, 0.045, 6, 6).rotateX(Math.PI / 2), this.ringMat);
    this.ring.rotation.y = Math.PI / 6;
    this.ring.position.y = 0.13;
    this.group.add(this.ring);
    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 1.1;
    this.hit.userData.slot = id;
    this.group.add(this.hit);
  }

  update(dt: number, bp: number) {
    const target = this.state === 2 ? 1 : this.occupied ? 0 : this.state === 1 ? 0.45 + 0.4 * Math.exp(-bp * 4) : 0.18;
    this.glow = damp(this.glow, target, 10, dt);
    this.ringMat.opacity = this.glow;
    this.ring.visible = this.glow > 0.02;
    this.ring.scale.setScalar(1 + (this.state === 1 && !this.occupied ? Math.exp(-bp * 5) * 0.08 : 0));
  }
}

export class JourneyView {
  readonly scene = new THREE.Scene();
  readonly look: WorldLook;
  readonly land: Landscape;
  readonly sky: Sky;
  readonly grass: Grass;
  readonly turtle: Turtle;
  readonly fx = new Fx();
  readonly towers = new Map<number, TowerView>();
  /** tower id → slot */
  private towerSlot = new Map<number, number>();
  readonly enemies = new Map<number, EnemyView>();
  readonly pads: SlotPad[] = [];
  readonly pickups = new Map<number, PickupView>();
  readonly landmark: Landmark;
  private mists: MistView[] = [];
  private queue: SimEvent[] = [];
  private sun: THREE.DirectionalLight;
  private sunDir: THREE.Vector3;
  private ray = new THREE.Raycaster();
  private sHist: { t: number; s: number }[] = [];
  /** colossus path distance at view time */
  turtleS = 0;
  walking = false;
  private particles: THREE.Points;
  private pMat: THREE.ShaderMaterial;
  // camera
  camYaw = 0.42;
  camPitch = 0.46;
  camDist = 27;
  private camYawGoal = 0.42;
  private camPitchGoal = 0.46;
  private camDistGoal = 27;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camHeading = 0;
  private firstCam = true;
  private shakeAmt = 0;
  private shakeT = 0;
  /** cinematic camera override */
  cine: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  /** how fast the cinematic camera takes over (1/s) */
  cineRate = 1.6;
  private cineMix = 0;
  life = 0.26;
  lifeTarget = 0.26;
  /** colour floor for lands already restored (set from the save: 0 grey … ~0.8 mostly coloured) */
  restoredLife = 0;
  private waveR = -1;
  ffGlow = 0;
  private trail: { x: number; z: number }[] = [];
  /** cinematics: scales the colour around the colossus (0 = none) */
  colorScale = 1;
  /** extra colour sources (cinematics) */
  extraSources: { x: number; z: number; r: number; s: number }[] = [];
  private lastTrailS = -99;
  readonly speedPerBeat: number;

  constructor(readonly engine: Engine, readonly def: JourneyDef, readonly sim: Journey, lookOverride?: WorldLook) {
    this.look = lookOverride ?? LOOKS[def.world];
    const look = this.look;
    this.speedPerBeat = sim.speed;
    const seed = def.seed ?? 7;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(look.fog), look.fogDensity);
    this.sunDir = new THREE.Vector3(...look.sky.sunDir).normalize();
    this.land = buildLandscape(def.world, look.land, sim.length, def.features, seed, this.sunDir, sim.path);
    // the landscape must be built on the very same path as the simulation
    this.scene.add(this.land.group);
    this.sky = new Sky(look.sky, seed);
    this.scene.add(this.sky.group);
    const q = engine.quality;
    this.grass = new Grass(this.land, look.grass, q === 'high' ? 90000 : q === 'medium' ? 50000 : 22000, q === 'low' ? 80 : 100);
    this.scene.add(this.grass.mesh);
    this.sun = new THREE.DirectionalLight(new THREE.Color(look.sun), look.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q === 'low' ? 1024 : 2048, q === 'low' ? 1024 : 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -42;
    sc.right = 42;
    sc.top = 42;
    sc.bottom = -42;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(new THREE.Color(look.hemiSky), new THREE.Color(look.hemiGround), look.hemiIntensity));
    this.scene.add(this.fx.group);

    this.turtle = new Turtle();
    this.scene.add(this.turtle.group);
    for (let i = 0; i < sim.slotsOpen; i++) {
      const pad = new SlotPad(i);
      const s = SLOTS[i];
      pad.group.position.set(s.x, s.y - 0.06, s.z);
      this.turtle.shell.add(pad.group);
      this.pads.push(pad);
    }
    this.turtle.onStep = (pos, front) => {
      this.fx.dust(pos.clone().setY(pos.y + 0.2), this.look.land.dirt, front ? 10 : 7);
      this.shake(front ? 0.05 : 0.03);
      // flowers spring up in its footprints once colour is back
      if (this.life > 0.3) this.fx.burst(pos.clone().setY(pos.y + 0.3), this.look.land.flowers[Math.floor(Math.random() * this.look.land.flowers.length)], 5, 1.2, 0.18, 1.2, false, 1);
    };

    // landmark at the end of the road
    this.landmark = new Landmark(def.landmark ?? 'bell');
    const end = this.land.path.at(sim.length + 22);
    this.landmark.group.position.set(end.x, this.land.heightAt(end.x, end.z) - 0.5, end.z);
    this.landmark.group.rotation.y = Math.atan2(-end.dx, -end.dz) + Math.PI;
    this.scene.add(this.landmark.group);

    // pickups
    for (const p of sim.pickups) {
      const pv = new PickupView(p.id, p.value);
      pv.group.position.set(p.x, this.land.heightAt(p.x, p.z), p.z);
      this.scene.add(pv.group);
      this.pickups.set(p.id, pv);
    }

    // ambient particles around the camera
    const pp = makeParticles(look.particles);
    this.particles = pp.points;
    this.pMat = pp.mat;
    this.scene.add(this.particles);

    this.turtleS = 0;
    worldColor.uWorldSat.value = this.life;
    worldColor.uWave.value.set(0, 0, -1, 1.1);
    this.camHeading = Math.atan2(sim.turtle.dz, sim.turtle.dx);
  }

  // ───────────────────────────── poses ─────────────────────────────

  /** World transform of the colossus at path distance s. */
  poseAtS(s: number, out: THREE.Matrix4): THREE.Matrix4 {
    const p = this.land.path.at(s);
    const f = this.land.path.at(s + 3);
    const b = this.land.path.at(Math.max(0, s - 3));
    const yf = this.land.heightAt(f.x, f.z), yb = this.land.heightAt(b.x, b.z);
    const water = this.land.waterAt(p.x, p.z);
    let y = (yf + yb + this.land.heightAt(p.x, p.z) * 2) / 4;
    if (water !== null) y = Math.max(y, water - 1.2);
    const yaw = Math.atan2(-p.dx, -p.dz);
    const pitch = Math.atan2(yf - yb, 6) * 0.8;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    return out.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(1, 1, 1));
  }

  // ───────────────────────────── towers ─────────────────────────────

  addTower(id: number, kind: TowerKind, level: number, slot: number) {
    const tv = new TowerView(kind, level, id);
    tv.scaleMul = 2.3;
    const s = SLOTS[slot];
    tv.group.position.set(s.x, s.y + 0.08, s.z);
    this.turtle.shell.add(tv.group);
    this.towers.set(id, tv);
    this.towerSlot.set(id, slot);
    this.pads[slot].occupied = true;
    const wp = this.slotWorld(slot);
    this.fx.ring(wp, 3, TOWERS[kind].color, 0.5);
    this.fx.burst(wp.clone().setY(wp.y + 1), TOWERS[kind].color, 30, 3, 0.2, 0.7);
  }

  upgradeTower(id: number, level: number) {
    const tv = this.towers.get(id);
    if (!tv) return;
    tv.setLevel(level);
    const wp = tv.group.getWorldPosition(new THREE.Vector3());
    this.fx.ring(wp, 3.2, '#ffd36b', 0.6);
    this.fx.burst(wp.clone().setY(wp.y + 1.4), '#ffe9a8', 40, 3.4, 0.2, 0.9);
  }

  removeTower(id: number) {
    const tv = this.towers.get(id);
    if (!tv) return;
    const slot = this.towerSlot.get(id)!;
    const wp = tv.group.getWorldPosition(new THREE.Vector3());
    tv.group.removeFromParent();
    this.towers.delete(id);
    this.towerSlot.delete(id);
    this.pads[slot].occupied = false;
    this.fx.burst(wp.clone().setY(wp.y + 1), '#ffd36b', 24, 2.6, 0.18, 0.7);
  }

  towerOnSlot(slot: number): number | null {
    for (const [id, s] of this.towerSlot) if (s === slot) return id;
    return null;
  }

  slotWorld(slot: number, y = 0): THREE.Vector3 {
    const s = SLOTS[slot];
    return this.turtle.shell.localToWorld(new THREE.Vector3(s.x, s.y + y, s.z));
  }

  // ───────────────────────────── picking ─────────────────────────────

  pick(ndcX: number, ndcY: number): Pick | null {
    this.ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.engine.camera);
    const targets: THREE.Object3D[] = [];
    for (const p of this.pads) targets.push(p.hit);
    for (const p of this.pickups.values()) if (!p.gone) targets.push(p.hit);
    const hits = this.ray.intersectObjects(targets, false);
    if (hits.length) {
      const o = hits[0].object;
      if (o.userData.pickup !== undefined) return { type: 'pickup', id: o.userData.pickup };
      if (o.userData.slot !== undefined) return { type: 'slot', id: o.userData.slot };
    }
    return null;
  }

  screen(world: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const v = world.clone().project(this.engine.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, behind: v.z > 1 };
  }

  pan(x: number, z: number): number {
    // stereo position relative to the camera's right
    const cam = this.engine.camera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const d = new THREE.Vector3(x - cam.position.x, 0, z - cam.position.z).normalize();
    return Math.max(-1, Math.min(1, d.dot(right))) * 0.8;
  }

  // ───────────────────────────── camera ─────────────────────────────

  /**
   * Drag to orbit, "grabbing" the world: the ground under the finger follows it (drag right and the
   * near side of the world moves right). Speed scales with the screen so a full-width swipe turns
   * about 160°, and a flick keeps spinning briefly (inertia) after release.
   */
  orbit(dx: number, dy: number) {
    const k = 2.8 / Math.max(320, Math.min(window.innerWidth, 1400));
    const dyaw = dx * k;
    this.camYawGoal += dyaw;
    this.camPitchGoal = Math.max(0.18, Math.min(1.25, this.camPitchGoal + dy * k * 0.7));
    const now = performance.now() / 1000;
    const step = Math.max(1 / 120, now - this.lastOrbitT);
    this.orbitVel = this.lastOrbitT > 0 && now - this.lastOrbitT < 0.1 ? this.orbitVel * 0.5 + (dyaw / step) * 0.5 : dyaw / step;
    this.lastOrbitT = now;
    this.spin = 0;
    this.dragging = true;
  }

  /** the finger left the screen: a quick flick keeps the camera turning for a moment */
  orbitEnd() {
    const now = performance.now() / 1000;
    this.dragging = false;
    if (now - this.lastOrbitT < 0.08) this.spin = Math.max(-5, Math.min(5, this.orbitVel));
    this.lastOrbitT = 0;
  }
  private orbitVel = 0;
  private lastOrbitT = 0;
  private spin = 0;
  private dragging = false;
  /** battles fit the view to the screen shape (wider lens and a higher, farther camera when held upright) */
  adaptiveFov = false;
  private portrait(): number {
    const a = window.innerWidth / Math.max(1, window.innerHeight);
    return Math.max(0, Math.min(1, (1.3 - a) / 0.85));
  }

  zoom(f: number) {
    this.camDistGoal = Math.max(13, Math.min(46, this.camDistGoal * f));
  }

  /** Place the orbit camera (instantly or eased). */
  setCamera(yaw: number, pitch: number, dist: number, instant = false) {
    this.camYawGoal = yaw;
    this.camPitchGoal = pitch;
    this.camDistGoal = dist;
    if (instant) {
      this.camYaw = yaw;
      this.camPitch = pitch;
      this.camDist = dist;
      this.firstCam = true;
    }
  }

  // ───────────────────────────── duets ─────────────────────────────

  private duetRibbons = new Map<string, { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; grow: number; dying: boolean }>();
  private duetBeat = 0;

  /**
   * Glowing ribbons between duet partners on the shell (tower ids): an arch of flowing light in the
   * duet's colour that pulses on the beat. New duets grow in with a little burst; broken ones fade out.
   */
  setDuets(list: { id: DuetId; a: number; b: number }[]): void {
    const want = new Set<string>();
    for (const d of list) {
      const sa = this.towerSlot.get(d.a), sb = this.towerSlot.get(d.b);
      if (sa === undefined || sb === undefined) continue;
      const key = `${d.id}:${Math.min(d.a, d.b)}:${Math.max(d.a, d.b)}`;
      want.add(key);
      const have = this.duetRibbons.get(key);
      if (have) {
        have.dying = false;
        continue;
      }
      const A = SLOTS[sa], B = SLOTS[sb];
      const p0 = new THREE.Vector3(A.x, A.y + 2.3, A.z);
      const p1 = new THREE.Vector3(B.x, B.y + 2.3, B.z);
      const mid = p0.clone().lerp(p1, 0.5);
      mid.y += 1.5 + p0.distanceTo(p1) * 0.12;
      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      const geo = new THREE.TubeGeometry(curve, 32, 0.13, 6, false);
      const color = new THREE.Color(DUETS.find((x) => x.id === d.id)?.color ?? '#ffd36b');
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: color }, uTime: { value: 0 }, uGrow: { value: 0 }, uBeat: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uTime; uniform float uGrow; uniform float uBeat; varying vec2 vUv;
          void main() {
            float along = vUv.x;
            // grows out from both partners toward the middle
            float reach = uGrow * 0.5 + 0.001;
            float shown = step(0.5 - reach, abs(along - 0.5) + 0.001);
            // little notes of light flowing both ways
            float flow = 0.5 + 0.5 * sin((along * 18.0 - uTime * 4.0) * 3.14159);
            float flow2 = 0.5 + 0.5 * sin((along * 11.0 + uTime * 3.0) * 3.14159);
            float edge = smoothstep(0.0, 0.06, along) * smoothstep(1.0, 0.94, along);
            float a = (0.35 + 0.45 * flow * flow2 + uBeat * 0.6) * edge * shown;
            gl_FragColor = vec4(uColor * (1.4 + uBeat * 1.2), a);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 5;
      this.turtle.shell.add(mesh);
      this.duetRibbons.set(key, { mesh, mat, grow: 0, dying: false });
      // the moment two musicians click: a ring and a burst at each of them
      for (const slot of [sa, sb]) {
        const wp = this.slotWorld(slot, 2.2);
        this.fx.ring(wp.clone().setY(wp.y - 2), 2.6, color.getStyle(), 0.6);
        this.fx.burst(wp, color.getStyle(), 22, 2.4, 0.16, 0.8);
      }
    }
    for (const [key, r] of this.duetRibbons) if (!want.has(key)) r.dying = true;
  }

  private updateDuets(dt: number, t: number, beatPos: number) {
    const beat = Math.exp(-(beatPos - Math.floor(beatPos)) * 5);
    this.duetBeat = beat;
    for (const [key, r] of this.duetRibbons) {
      r.grow = r.dying ? r.grow - dt * 2.5 : Math.min(1, r.grow + dt * 1.6);
      if (r.dying && r.grow <= 0) {
        r.mesh.removeFromParent();
        r.mesh.geometry.dispose();
        r.mat.dispose();
        this.duetRibbons.delete(key);
        continue;
      }
      r.mat.uniforms.uTime.value = t;
      r.mat.uniforms.uGrow.value = r.grow;
      r.mat.uniforms.uBeat.value = beat;
    }
  }

  /** change only the orbit distance (eased) */
  setDistance(d: number) {
    this.camDistGoal = d;
  }

  /** jump straight to the camera goal (no easing) */
  snapCamera() {
    this.camYaw = this.camYawGoal;
    this.camPitch = this.camPitchGoal;
    this.camDist = this.camDistGoal;
    this.firstCam = true;
  }

  addYaw(d: number) {
    this.camYawGoal += d;
  }

  resetCamera() {
    const p = this.adaptiveFov ? this.portrait() : 0;
    this.camYawGoal = 0.42;
    this.camPitchGoal = 0.46 + p * 0.3;
    this.camDistGoal = 27 + p * 8;
    this.spin = 0;
  }

  shake(a: number) {
    this.shakeAmt = Math.min(0.8, Math.max(this.shakeAmt, a));
  }

  private updateCamera(dt: number) {
    const cam = this.engine.camera;
    const m = new THREE.Matrix4();
    this.poseAtS(this.turtleS, m);
    const tp = new THREE.Vector3().setFromMatrixPosition(m);
    const p = this.land.path.at(this.turtleS);
    const heading = Math.atan2(p.dz, p.dx);
    let dh = heading - this.camHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.camHeading += dh * Math.min(1, dt * 1.2);
    if (this.spin) {
      this.camYawGoal += this.spin * dt;
      this.spin *= Math.exp(-dt * 3.5);
      if (Math.abs(this.spin) < 0.02) this.spin = 0;
    }
    // follow the finger closely while dragging; ease gently otherwise
    const follow = this.dragging || this.spin ? 16 : 6;
    this.camYaw = damp(this.camYaw, this.camYawGoal, follow, dt);
    this.camPitch = damp(this.camPitch, this.camPitchGoal, follow, dt);
    this.camDist = damp(this.camDist, this.camDistGoal, 6, dt);
    if (this.adaptiveFov && !this.cine) {
      const fov = 42 + this.portrait() * 20;
      if (Math.abs(cam.fov - fov) > 0.05) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
    }
    // behind the colossus (opposite of its heading), turned by the orbit yaw
    const back = this.camHeading + Math.PI + this.camYaw;
    const horiz = Math.cos(this.camPitch) * this.camDist;
    const desired = new THREE.Vector3(tp.x + Math.cos(back) * horiz, tp.y + 3 + Math.sin(this.camPitch) * this.camDist, tp.z + Math.sin(back) * horiz);
    const fwd = new THREE.Vector3(Math.cos(this.camHeading), 0, Math.sin(this.camHeading));
    const look = tp.clone().addScaledVector(fwd, 8 * Math.cos(this.camYaw) * (1 - this.camPitch * 0.5)).add(new THREE.Vector3(0, 3.2, 0));
    // never dip under the ground
    const gy = this.land.heightAt(desired.x, desired.z) + 2.5;
    if (desired.y < gy) desired.y = gy;
    if (this.firstCam) {
      this.camPos.copy(desired);
      this.camLook.copy(look);
      this.firstCam = false;
    }
    const posRate = this.dragging || this.spin ? 14 : 4;
    this.camPos.lerp(desired, 1 - Math.exp(-dt * posRate));
    this.camLook.lerp(look, 1 - Math.exp(-dt * Math.max(5, posRate)));
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    this.cineMix = damp(this.cineMix, this.cine ? 1 : 0, this.cineRate, dt);
    if (this.cineMix > 0.001 && this.cine) {
      const gq = cam.quaternion.clone();
      const gp = cam.position.clone();
      cam.position.copy(this.cine.pos);
      cam.lookAt(this.cine.look);
      const cq = cam.quaternion.clone();
      cam.position.lerpVectors(gp, this.cine.pos, this.cineMix);
      cam.quaternion.copy(gq).slerp(cq, this.cineMix);
    }
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt * 38;
      const s = this.shakeAmt * 0.25;
      cam.position.x += Math.sin(this.shakeT * 1.3) * s;
      cam.position.y += Math.sin(this.shakeT * 1.7 + 1) * s;
      cam.position.z += Math.sin(this.shakeT * 1.1 + 2) * s;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.6);
    }
  }

  // ───────────────────────────── events ─────────────────────────────

  push(events: SimEvent[]) {
    for (const e of events) this.queue.push(e);
  }

  private enemyPos(e: EnemyView | undefined, y = 0.45): THREE.Vector3 {
    if (!e) return new THREE.Vector3();
    return e.pos.clone().setY(e.pos.y + y * ENEMY_SCALE * (ENEMIES[e.kind].boss ? 2.4 : 1));
  }

  private towerWorld(id: number): THREE.Vector3 | null {
    const tv = this.towers.get(id);
    if (!tv) return null;
    return tv.muzzleWorld();
  }

  private handle(ev: SimEvent) {
    switch (ev.type) {
      case 'spawn': {
        let v = this.enemies.get(ev.enemy.id);
        if (!v) {
          v = new EnemyView(ev.enemy.id, ev.enemy.kind, ENEMY_SCALE);
          this.enemies.set(ev.enemy.id, v);
          this.scene.add(v.group);
          v.push(ev.t, ev.enemy.x, ev.enemy.z);
        }
        // a Mimic (Sombra) shows which of the band's instruments it copies
        const mk = (ev.enemy as { mimicKind?: TowerKind | null }).mimicKind;
        if (mk) v.setMimicKind(mk);
        if (!ev.enemy.structure && ev.enemy.wave >= 0) {
          const p = new THREE.Vector3(ev.enemy.x, this.land.heightAt(ev.enemy.x, ev.enemy.z) + 0.3, ev.enemy.z);
          this.fx.burst(p, '#5a5378', 10, 2, 0.4, 0.8, false, 0.5);
        }
        if (ev.enemy.def.boss) this.shake(0.6);
        break;
      }
      case 'fire': {
        const s = ev.shot;
        const tv = this.towers.get(s.tower.id);
        if (!tv) break;
        // aim in the shell's frame
        const local = this.turtle.shell.worldToLocal(new THREE.Vector3(s.tx, 0, s.tz));
        const tl = SLOTS[this.towerSlot.get(s.tower.id) ?? 0];
        tv.aimAt(Math.atan2(local.z - tl.z, local.x - tl.x));
        tv.fire();
        const from = tv.muzzleWorld();
        const target = this.enemies.get(s.targetId);
        const flight = s.impactT - s.launchT;
        const lastPos = this.enemyPos(target);
        if (!target) lastPos.set(s.tx, this.land.heightAt(s.tx, s.tz) + 1, s.tz);
        const follow = () => {
          const t = this.enemies.get(s.targetId);
          if (t && t.visibleNow && t.goneAt === null) lastPos.copy(this.enemyPos(t));
          return lastPos;
        };
        if (s.kind === 'harp') this.fx.shoot('note', from, follow, ev.t, ev.t + flight, '#ffd36b');
        else if (s.kind === 'bass') this.fx.shoot('orb', from, follow, ev.t, ev.t + flight, '#9b6bff');
        else if (s.kind === 'drum') {
          const land = new THREE.Vector3(s.tx, this.land.heightAt(s.tx, s.tz) + 0.3, s.tz);
          this.fx.shoot('ball', from, () => land, ev.t, ev.t + flight, '#ff9a4c');
        } else if (s.kind === 'crystal') this.fx.flash(from, 0.8, '#d9b8ff', 0.15);
        break;
      }
      case 'impact': {
        const s = ev.shot;
        if (s.kind === 'drum') {
          const p = new THREE.Vector3(s.tx, this.land.heightAt(s.tx, s.tz) + 0.15, s.tz);
          this.fx.ring(p, (TOWERS.drum.levels[s.level].area ?? 2.6) * 1.1, '#ffb070', 0.45, 0.16);
          this.fx.flash(p.clone().setY(p.y + 0.5), 1.8, '#ffcf8a', 0.2);
          this.fx.dust(p, this.look.land.dirt, 14);
          this.fx.burst(p, '#ffb347', 14, 4, 0.25, 0.5);
          this.shake(0.08);
        } else if (s.kind === 'harp') {
          if (ev.hit) this.fx.burst(this.enemyPos(this.enemies.get(s.targetId)), '#ffe9a8', 6, 2.4, 0.18, 0.35);
        } else if (s.kind === 'bass') {
          const p = new THREE.Vector3(s.tx, this.land.heightAt(s.tx, s.tz) + 0.2, s.tz);
          this.fx.ring(p, 3, '#b48cff', 0.6, 0.2);
          this.fx.flash(p.clone().setY(p.y + 0.8), 2.6, '#9b6bff', 0.3);
          this.fx.burst(p, '#b48cff', 24, 4.5, 0.3, 0.6);
          this.shake(0.18);
        } else if (s.kind === 'crystal') {
          const from = this.towerWorld(s.tower.id);
          if (from) {
            const pts = [from];
            for (const id of s.hits) {
              const e = this.enemies.get(id);
              if (e) pts.push(this.enemyPos(e));
            }
            if (pts.length > 1) this.fx.lightning(pts);
          }
        } else if (s.kind === 'horn') {
          const from = this.towerWorld(s.tower.id);
          if (from) {
            const dir = new THREE.Vector3(s.dirx, 0, s.dirz).normalize();
            this.fx.beam(from, dir, TOWERS.horn.levels[s.level].range, (TOWERS.horn.levels[s.level].area ?? 1.4) + 0.4);
            this.shake(0.05);
          }
        }
        break;
      }
      case 'pulse': {
        const tv = this.towers.get(ev.tower.id);
        if (!tv) break;
        tv.pulse();
        const L = TOWERS[ev.tower.kind].levels[ev.tower.level];
        const wp = tv.group.getWorldPosition(new THREE.Vector3());
        if (ev.tower.kind === 'bell') {
          const g = wp.clone();
          g.y = this.land.heightAt(wp.x, wp.z) + 0.2;
          this.fx.ring(g, L.range, '#9fe3ff', 0.8, 0.04);
          for (const id of ev.hits) this.enemies.get(id)?.slowed();
        } else if (ev.tower.kind === 'choir') {
          this.fx.burst(wp.clone().setY(wp.y + 1.6), '#fff1c2', 6, 1.2, 0.2, 1.2, true, -0.8);
        } else if (ev.tower.kind === 'shaker') {
          this.fx.burst(wp.clone().setY(wp.y + 1.3), '#ffe066', 3, 1.4, 0.14, 0.4, true, 1);
        }
        break;
      }
      case 'damage': {
        const v = this.enemies.get(ev.enemy.id);
        if (v) {
          v.hit();
          v.hp = ev.hp;
        }
        if (ev.shieldOwner) {
          const o = this.enemies.get(ev.shieldOwner);
          if (o) o.shield = ev.shield;
        }
        break;
      }
      case 'death': {
        const v = this.enemies.get(ev.enemy.id);
        if (v) {
          v.goneAt = ev.t;
          const p = this.enemyPos(v);
          this.fx.release(p, INK[ev.enemy.kind] ?? '#463d63', !!ev.enemy.def.boss || ev.enemy.structure);
          if (ev.enemy.def.boss) this.shake(0.8);
        }
        break;
      }
      case 'leak': {
        const v = this.enemies.get(ev.enemy.id);
        if (v) {
          v.goneAt = ev.t;
          v.leaked = true;
          this.fx.burst(this.enemyPos(v), '#463d63', 20, 3, 0.3, 0.6, false, 4);
        }
        this.turtle.hurt();
        this.shake(0.3);
        break;
      }
      case 'income': {
        const tv = this.towers.get(ev.tower.id);
        if (tv) this.fx.coinNote(tv.group.getWorldPosition(new THREE.Vector3()).setY(tv.group.getWorldPosition(new THREE.Vector3()).y + 2));
        break;
      }
      case 'muted':
        this.towers.get(ev.tower.id)?.setMuted(ev.muted);
        break;
      case 'heal': {
        const v = this.enemies.get(ev.enemy.id);
        if (v) this.fx.ring(v.pos, 4.5, '#7dff9a', 0.5, 0.04);
        for (const id of ev.targets) {
          const o = this.enemies.get(id);
          if (o) {
            this.fx.heal(o.pos);
            o.hp = Math.min(1, o.hp + 0.15);
          }
        }
        break;
      }
      case 'waveWarn': {
        // grey mists rise where the creatures will come from
        const beatsUntil = Math.max(0, (ev.at - ev.t) / this.sim.spb);
        const sPred = Math.min(this.sim.length, this.sim.turtle.s + (this.sim.walking || this.sim.startBar !== null ? this.speedPerBeat * beatsUntil : 0));
        const p = this.land.path.at(sPred);
        const heading = Math.atan2(p.dz, p.dx);
        for (const d of ev.dirs) {
          const a = heading + (d.dir * Math.PI) / 180;
          const mx = p.x + Math.cos(a) * 30, mz = p.z + Math.sin(a) * 30;
          const mist = new MistView(beatsUntil * this.sim.spb + 4);
          mist.group.position.set(mx, this.land.heightAt(mx, mz), mz);
          mist.group.scale.setScalar(1 + Math.min(2, d.count / 6));
          this.scene.add(mist.group);
          this.mists.push(mist);
        }
        break;
      }
      case 'boss': {
        const v = this.enemies.get(ev.enemy.id);
        if (!v) break;
        if (ev.action === 'burrow') {
          v.burrowed = true;
          this.fx.dust(v.pos, this.look.land.dirt, 60);
          this.shake(0.3);
        } else if (ev.action === 'emerge') {
          v.burrowed = false;
          this.fx.dust(v.pos, this.look.land.dirt, 70);
          this.shake(0.4);
        } else if (ev.action === 'summon') {
          this.fx.burst(v.pos.clone().setY(v.pos.y + 2), '#6a5f8c', 40, 4, 0.35, 0.8, false, 4);
        } else if (ev.action === 'freeze') {
          for (const id of ev.towers ?? []) {
            const w = this.towerWorld(id);
            if (w) {
              this.fx.burst(w, '#bff0ff', 40, 3, 0.25, 0.9);
              this.fx.ring(w, 2.5, '#bff0ff', 0.5);
            }
          }
        } else if (ev.action === 'plates') {
          const plate = v.dropPlate();
          if (plate) {
            const wp = new THREE.Vector3();
            plate.getWorldPosition(wp);
            plate.removeFromParent();
            plate.scale.multiplyScalar(ENEMY_SCALE);
            this.fx.drop(plate, wp);
          }
          this.shake(0.35);
        } else if (ev.action === 'phase') {
          this.fx.ring(v.pos, 24, '#8f8aa8', 1.4, 0.06);
          this.fx.flash(v.pos.clone().setY(v.pos.y + 4), 8, '#bdb8d6', 0.6);
          this.shake(0.7);
        }
        break;
      }
      case 'ffDrop': {
        const m = new THREE.Matrix4();
        this.poseAtS(this.turtleS, m);
        const tp = new THREE.Vector3().setFromMatrixPosition(m);
        this.turtle.rear = 0;
        this.fx.ring(tp.clone().setY(tp.y + 0.3), 22, '#ffd36b', 1.3, 0.05);
        this.fx.ring(tp.clone().setY(tp.y + 0.3), 15, '#fff1c2', 1.0, 0.08);
        this.fx.flash(tp.clone().setY(tp.y + 2), 9, '#ffe9a8', 0.5);
        this.fx.dust(tp, this.look.land.dirt, 90);
        for (const id of ev.hits) {
          const v = this.enemies.get(id);
          if (v) {
            v.hit();
            this.fx.burst(this.enemyPos(v), '#ffd36b', 10, 3, 0.2, 0.5);
          }
        }
        this.ffGlow = 1;
        this.shake(0.9);
        break;
      }
      case 'collect': {
        const pv = this.pickups.get(ev.pickup.id);
        if (pv) {
          pv.take();
          const p = pv.group.position.clone().setY(pv.group.position.y + 2);
          this.fx.burst(p, '#ffd36b', 30, 4, 0.25, 0.8);
          this.fx.flash(p, 1.5, '#ffe9a8', 0.25);
        }
        break;
      }
      case 'pickupLost': {
        const pv = this.pickups.get(ev.pickup.id);
        if (pv) pv.take();
        break;
      }
      case 'arrive':
        this.landmark.ring();
        break;
      default:
        break;
    }
  }

  /** victory: a wave of colour from the landmark */
  /** a wave of colour sweeping the land, from the landmark (or from a given point) */
  bloomWave(from?: { x: number; z: number }) {
    this.waveR = 0;
    this.waveFrom = from ? { x: from.x, z: from.z } : null;
  }
  private waveFrom: { x: number; z: number } | null = null;

  // ───────────────────────────── update ─────────────────────────────

  /**
   * @param simTime  the simulation's time (it runs ahead)
   * @param vt       view time (what the player hears now)
   * @param beatPos  view time in beats
   */
  update(dt: number, t: number, vt: number, beatPos: number, live: boolean) {
    const sim = this.sim;
    // the colossus' progress: recorded at sim time, shown at view time
    if (live) {
      const last = this.sHist[this.sHist.length - 1];
      if (!last || sim.time > last.t) this.sHist.push({ t: sim.time, s: sim.turtle.s });
      while (this.sHist.length > 2 && this.sHist[1].t < vt - 0.5) this.sHist.shift();
    }
    this.turtleS = this.sAt(vt);
    // long journeys: only the land around the colossus is drawn
    this.land.setFocus(this.turtleS);
    if (this.duetRibbons.size) this.updateDuets(dt, t, beatPos);
    const prevWalking = this.walking;
    this.walking = sim.walking && !sim.halted;
    void prevWalking;
    // replay due events
    if (this.queue.length) {
      this.queue.sort((a, b) => a.t - b.t);
      let n = 0;
      while (n < this.queue.length && this.queue[n].t <= vt + 1e-6) n++;
      if (n) for (const e of this.queue.splice(0, n)) this.handle(e);
    }
    const bp = beatPos - Math.floor(beatPos);
    // enemies: positions from the sim, rendered at view time
    if (live) {
      for (const e of sim.enemies) {
        if (!e.alive) continue;
        const v = this.enemies.get(e.id);
        if (v) {
          v.push(sim.time, e.x, e.z);
          v.revealed = !e.def.camo || e.revealedUntil > sim.time;
        }
      }
    }
    // the colossus walks on the beat
    const sNow = this.turtleS;
    const walking = this.walking;
    const spb = sim.spb;
    const self = this;
    const poseAtBeat = (beat: number, out: THREE.Matrix4) => {
      const ds = walking ? (beat - beatPos) * self.speedPerBeat : 0;
      return self.poseAtS(Math.max(0, Math.min(sim.length, sNow + ds)), out);
    };
    void spb;
    // look at the nearest threat
    let near: EnemyView | null = null;
    let nd = 18;
    const tpos = this.turtle.group.position;
    for (const v of this.enemies.values()) {
      if (!v.visibleNow || v.goneAt !== null) continue;
      const d = v.pos.distanceTo(tpos);
      if (d < nd) {
        nd = d;
        near = v;
      }
    }
    this.turtle.lookAt = near ? near.pos.clone().setY(near.pos.y + 1) : null;
    this.turtle.rear = damp(this.turtle.rear, sim.ffDropT !== null ? 1 : 0, 3, dt);
    this.turtle.update(dt, t, beatPos, poseAtBeat, (x, z) => this.land.heightAt(x, z), walking);
    this.turtle.group.updateMatrixWorld(true);
    const camQ = this.engine.camera.quaternion;
    for (const [id, v] of this.enemies) {
      const keep = v.update(dt, vt, beatPos, (x, z) => this.land.heightAt(x, z), (x, z, y, out) => out.set(x, y, z), camQ);
      if (!keep) {
        this.scene.remove(v.group);
        v.dispose();
        this.enemies.delete(id);
      }
    }
    for (const tv of this.towers.values()) tv.update(dt, t, beatPos);
    for (const p of this.pads) p.update(dt, bp);
    for (const p of this.pickups.values()) p.update(dt, t, this.land.heightAt(p.group.position.x, p.group.position.z));
    this.mists = this.mists.filter((m) => {
      const keep = m.update(dt, t);
      if (!keep) {
        this.scene.remove(m.group);
        m.dispose();
      }
      return keep;
    });
    this.landmark.update(dt, t);
    this.fx.update(dt, vt);
    this.land.update(t);
    treeUniforms.uTime.value = t;
    this.sky.update(t);
    this.updateCamera(dt);
    this.sky.follow(this.engine.camera);
    // sun and shadows follow the colossus
    this.sun.position.copy(tpos).addScaledVector(this.sunDir, 90);
    this.sun.target.position.copy(tpos);
    // grass around what the camera looks at; the feet press it down
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.turtle.group.quaternion);
    this.grass.follow(tpos.x + fwd.x * 12, tpos.z + fwd.z * 12);
    this.grass.update(t);
    // the body presses the grass, and each foot flattens a patch so it is seen planted on the ground
    const push = [{ x: tpos.x, z: tpos.z, r: 6.2, s: 1 }];
    for (const f of this.turtle.feet()) push.push({ x: f.x, z: f.z, r: 2.3, s: 1.35 });
    this.grass.setPushers(push);
    this.pMat.uniforms.uTime.value = t;
    this.particles.position.set(this.engine.camera.position.x, 0, this.engine.camera.position.z);
    // colour: around the colossus and in its wake
    if (Math.abs(sNow - this.lastTrailS) > 6) {
      this.lastTrailS = sNow;
      this.trail.push({ x: tpos.x, z: tpos.z });
      if (this.trail.length > 18) this.trail.shift();
    }
    // a land whose guardian was defeated remembers its colour: it never goes back to full grey
    this.life = damp(this.life, Math.max(this.lifeTarget, this.restoredLife), 1.2, dt);
    worldColor.uWorldSat.value = this.life;
    const cs = this.colorScale;
    const src: { x: number; z: number; r: number; s: number }[] = [];
    if (cs > 0.01) {
      src.push({ x: tpos.x, z: tpos.z, r: (26 + this.life * 14 + this.ffGlow * 12) * cs, s: 1.08 });
      for (let i = this.trail.length - 1; i >= 0 && src.length < 18; i--) src.push({ x: this.trail[i].x, z: this.trail[i].z, r: (22 + this.life * 10) * cs, s: 1.04 });
    }
    for (const e of this.extraSources) if (src.length < 23) src.push(e);
    const lm = this.landmark.group.position;
    if (this.landmark.awake > 0) src.push({ x: lm.x, z: lm.z, r: 20 + this.landmark.awake * 60, s: 1.12 });
    setSources(src);
    if (this.waveR >= 0) {
      this.waveR += dt * 40;
      const wc = this.waveFrom ?? lm;
      worldColor.uWave.value.set(wc.x, wc.z, this.waveR, 1.12);
    }
    this.ffGlow = Math.max(0, this.ffGlow - dt * 0.6);
  }

  private sAt(t: number): number {
    const h = this.sHist;
    if (!h.length) return this.sim.turtle.s;
    if (t <= h[0].t) return h[0].s;
    if (t >= h[h.length - 1].t) return h[h.length - 1].s;
    for (let i = h.length - 2; i >= 0; i--) {
      if (h[i].t <= t) {
        const a = h[i], b = h[i + 1];
        return a.s + ((b.s - a.s) * (t - a.t)) / Math.max(1e-6, b.t - a.t);
      }
    }
    return h[0].s;
  }

  dispose() {
    this.fx.clear();
    this.land.dispose();
    this.sky.dispose();
    this.grass.dispose();
    for (const v of this.enemies.values()) v.dispose();
    for (const m of this.mists) m.dispose();
    worldColor.uWave.value.set(0, 0, -1, 1);
    setSources([]);
  }
}

function makeParticles(kind: WorldLook['particles']) {
  const N = kind === 'snow' ? 900 : kind === 'embers' ? 500 : kind === 'motes' ? 400 : 300;
  const pos = new Float32Array(N * 3);
  const rnd = new Float32Array(N * 4);
  const rng = new Rng(99);
  const box = 60;
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rng.range(-box, box);
    pos[i * 3 + 1] = rng.range(0, 24);
    pos[i * 3 + 2] = rng.range(-box, box);
    for (let k = 0; k < 4; k++) rnd[i * 4 + k] = rng.next();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  const colors: Record<string, [string, string]> = {
    petals: ['#ffc2d9', '#ffffff'], dust: ['#fff0d0', '#e8c48f'], snow: ['#ffffff', '#d8ecff'], embers: ['#ffb347', '#ff5a1f'], motes: ['#d9d3ff', '#ffe9a8'],
  };
  const vel: Record<string, [number, number, number]> = {
    petals: [1.2, -0.6, 0.4], dust: [2.2, 0.05, 0.4], snow: [0.3, -1.4, 0.15], embers: [0.2, 1.6, 0.1], motes: [0.1, 0.6, 0.08],
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: kind === 'embers' || kind === 'motes' ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 }, uBox: { value: box }, uVel: { value: new THREE.Vector3(...vel[kind]) },
      uC1: { value: new THREE.Color(colors[kind][0]) }, uC2: { value: new THREE.Color(colors[kind][1]) },
      uSize: { value: kind === 'snow' ? 26 : kind === 'petals' ? 30 : 18 }, uFlutter: { value: kind === 'petals' ? 1.5 : kind === 'snow' ? 1 : 0.4 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aRnd; uniform float uTime; uniform float uBox; uniform vec3 uVel; uniform float uSize; uniform float uFlutter;
      varying vec4 vR; varying float vFade;
      void main(){
        vR = aRnd;
        vec3 p = position + uVel * uTime * (0.6 + aRnd.x * 0.8);
        p.x += sin(uTime * (0.8 + aRnd.y) + aRnd.z * 6.28) * uFlutter;
        p.z += cos(uTime * (0.7 + aRnd.w) + aRnd.x * 6.28) * uFlutter * 0.7;
        p.xz = mod(p.xz + uBox, 2.0 * uBox) - uBox;
        p.y = mod(p.y, 24.0);
        vFade = smoothstep(0.0, 2.0, p.y) * smoothstep(24.0, 18.0, p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(18.0, uSize * (0.6 + aRnd.w * 0.8) * (10.0 / -mv.z));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uC1; uniform vec3 uC2; varying vec4 vR; varying float vFade;
      void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(d)); if (a < 0.01) discard;
        gl_FragColor = vec4(mix(uC1, uC2, vR.y), a * vFade * 0.85); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}

void glowMat;
void ({} as Enemy);
