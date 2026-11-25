/**
 * Visual effects: projectiles (timed to land exactly on the musical grid), lightning, sonic beams,
 * shockwave rings, particles, released notes, floating numbers.
 */
import * as THREE from 'three';
import { box, clamp01, easeOutCubic, glowMat, torus } from './kit';
import { noteMesh } from './models';

interface Projectile {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t0: number;
  t1: number;
  arc: number;
  spin: number;
  trail?: { color: THREE.Color; every: number; acc: number; size: number };
}

interface Timed {
  obj: THREE.Object3D;
  t0: number;
  dur: number;
  tick: (k: number, obj: THREE.Object3D) => void;
  dispose?: () => void;
}

const MAX_P = 2400;

class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX_P * 3);
  private vel = new Float32Array(MAX_P * 3);
  private col = new Float32Array(MAX_P * 3);
  private size = new Float32Array(MAX_P);
  private life = new Float32Array(MAX_P);
  private maxLife = new Float32Array(MAX_P);
  private grav = new Float32Array(MAX_P);
  private drag = new Float32Array(MAX_P);
  private alpha = new Float32Array(MAX_P);
  private next = 0;
  private geo: THREE.BufferGeometry;

  constructor(additive: boolean) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * (300.0 / -mv.z); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size: number, life: number, grav = 0, drag = 0) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_P;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, k * 2.2);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const BALL = new THREE.SphereGeometry(0.12, 14, 10);
const BALL_RING = torus(0.17, 0.02, 6, 20);
const ORB = new THREE.SphereGeometry(0.18, 16, 12);
const ORB_HALO = new THREE.SphereGeometry(0.26, 16, 12);
const SPARK = new THREE.SphereGeometry(0.06, 8, 6);
const ringGeos = new Map<number, THREE.BufferGeometry>();
function ringGeo(thick: number): THREE.BufferGeometry {
  const k = Math.round(thick * 100);
  let g = ringGeos.get(k);
  if (!g) {
    g = new THREE.RingGeometry(Math.max(0.01, 1 - thick), 1, 64).rotateX(-Math.PI / 2);
    ringGeos.set(k, g);
  }
  return g;
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpC = new THREE.Color();

export class Fx {
  readonly group = new THREE.Group();
  private glow = new Particles(true);
  private ink = new Particles(false);
  private projectiles: Projectile[] = [];
  private timed: Timed[] = [];
  private notePool: THREE.Mesh[] = [];
  private now = 0;

  constructor() {
    this.group.add(this.glow.points, this.ink.points);
  }

  private note(color: string, size: number): THREE.Mesh {
    const m = noteMesh(size, color, 1.8);
    return m;
  }

  // ───────────── projectiles ─────────────

  /** A projectile that leaves `from` at t0 and lands on the target at exactly t1. */
  shoot(kind: 'note' | 'ball' | 'orb' | 'spark', from: THREE.Vector3, to: () => THREE.Vector3, t0: number, t1: number, color: string) {
    let obj: THREE.Object3D;
    let arc = 0;
    let trail: Projectile['trail'];
    switch (kind) {
      case 'note':
        obj = this.note(color, 0.22);
        arc = 0.35;
        trail = { color: new THREE.Color(color), every: 0.02, acc: 0, size: 0.18 };
        break;
      case 'ball': {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(BALL, glowMat(color, 2.2)));
        const ringM = new THREE.Mesh(BALL_RING, glowMat('#fff2c2', 1.6));
        g.add(ringM);
        obj = g;
        arc = 1.6;
        trail = { color: new THREE.Color(color), every: 0.015, acc: 0, size: 0.3 };
        break;
      }
      case 'orb': {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(ORB, glowMat('#6a3aff', 1.4)));
        g.add(new THREE.Mesh(ORB_HALO, glowMat('#b48cff', 1.2, 0.35)));
        obj = g;
        arc = 0.5;
        trail = { color: new THREE.Color('#9b6bff'), every: 0.01, acc: 0, size: 0.45 };
        break;
      }
      case 'spark':
      default:
        obj = new THREE.Mesh(SPARK, glowMat(color, 2.5));
        arc = 0.1;
        break;
    }
    obj.position.copy(from);
    obj.visible = false;
    this.group.add(obj);
    this.projectiles.push({ obj, from: from.clone(), to, t0, t1, arc, spin: kind === 'note' ? 6 : 2, trail });
  }

  // ───────────── instant effects ─────────────

  lightning(points: THREE.Vector3[], color = '#d9b8ff') {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const pts: THREE.Vector3[] = [];
      const n = 7;
      for (let k = 0; k <= n; k++) {
        const p = a.clone().lerp(b, k / n);
        if (k > 0 && k < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25));
        pts.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 24, 0.045, 5, false);
      const outer = new THREE.TubeGeometry(curve, 24, 0.12, 5, false);
      const g = new THREE.Group();
      const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2.5), transparent: true, toneMapped: false }));
      const halo = new THREE.Mesh(outer, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
      g.add(core, halo);
      this.group.add(g);
      this.timed.push({
        obj: g, t0: this.now, dur: 0.22,
        tick: (k) => {
          (core.material as THREE.MeshBasicMaterial).opacity = 1 - k;
          (halo.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
        },
        dispose: () => {
          geo.dispose();
          outer.dispose();
          (core.material as THREE.Material).dispose();
          (halo.material as THREE.Material).dispose();
        },
      });
      this.burst(b, color, 6, 1.6, 0.14, 0.35, true);
    }
  }

  /** Horn blast: a cone of sound along a line. */
  beam(from: THREE.Vector3, dir: THREE.Vector3, length: number, width: number, color = '#ffcf7a') {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(width * 0.9, 0.18, length, 24, 1, true);
    geo.translate(0, length / 2, 0);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const cone = new THREE.Mesh(geo, mat);
    g.add(cone);
    g.position.copy(from);
    g.lookAt(from.clone().add(dir));
    this.group.add(g);
    // travelling rings
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(torus(1, 0.04, 6, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3), transparent: true, toneMapped: false, depthWrite: false }));
      g.add(r);
      rings.push(r);
    }
    this.timed.push({
      obj: g, t0: this.now, dur: 0.5,
      tick: (k) => {
        mat.opacity = 0.2 * (1 - k) * Math.min(1, k * 8);
        cone.scale.set(1, 1, 0.3 + 0.7 * easeOutCubic(Math.min(1, k * 2)));
        rings.forEach((r, i) => {
          const kk = clamp01(k * 1.6 - i * 0.12);
          r.position.z = kk * length;
          const s = 0.2 + kk * width * 0.9;
          r.scale.set(s, s, s);
          (r.material as THREE.MeshBasicMaterial).opacity = (1 - kk) * 0.7;
        });
      },
      dispose: () => {
        geo.dispose();
        mat.dispose();
        rings.forEach((r) => (r.material as THREE.Material).dispose());
      },
    });
  }

  /** Expanding ground ring. */
  ring(pos: THREE.Vector3, radius: number, color: string, dur = 0.6, thick = 0.08, y = 0.08) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(ringGeo(thick), mat);
    m.position.copy(pos);
    m.position.y += y;
    m.renderOrder = 4;
    this.group.add(m);
    this.timed.push({
      obj: m, t0: this.now, dur,
      tick: (k) => {
        const s = 0.15 + easeOutCubic(k) * radius;
        m.scale.setScalar(s);
        mat.opacity = 1 - k;
      },
      dispose: () => mat.dispose(),
    });
  }

  /** A flash sphere (impact light). */
  flash(pos: THREE.Vector3, radius: number, color: string, dur = 0.25) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.9), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(SPHERE, mat);
    m.position.copy(pos);
    this.group.add(m);
    this.timed.push({
      obj: m, t0: this.now, dur,
      tick: (k) => {
        m.scale.setScalar(radius * (0.3 + easeOutCubic(k) * 0.6));
        mat.opacity = (1 - k) * 0.45;
      },
      dispose: () => mat.dispose(),
    });
  }

  burst(pos: THREE.Vector3, color: string, count: number, speed: number, size = 0.12, life = 0.6, additive = true, grav = 2.5) {
    const sys = additive ? this.glow : this.ink;
    tmpC.set(color);
    for (let i = 0; i < count; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      sys.emit(pos, tmpV, tmpC, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), grav, 1.5);
    }
  }

  /** Enemy defeated: ink splash + the stolen notes fly free. */
  release(pos: THREE.Vector3, inkColor: string, big = false) {
    this.burst(pos, inkColor, big ? 60 : 16, big ? 4.5 : 2.6, big ? 0.3 : 0.16, 0.7, false, 6);
    this.burst(pos, '#fff2c2', big ? 40 : 10, big ? 3 : 1.8, 0.1, 0.8, true, 0.5);
    this.flash(pos, big ? 1.6 : 0.6, '#fff4d6', 0.22);
    const n = big ? 8 : 2;
    const cols = ['#ffd36b', '#ffe9a8', '#ffb3cf', '#bfe9ff'];
    for (let i = 0; i < n; i++) {
      const m = this.note(cols[i % cols.length], big ? 0.3 : 0.2);
      m.position.copy(pos);
      const vx = (Math.random() - 0.5) * 1.2, vz = (Math.random() - 0.5) * 1.2;
      const base = pos.clone();
      this.group.add(m);
      this.timed.push({
        obj: m, t0: this.now, dur: 1.1 + Math.random() * 0.4,
        tick: (k) => {
          m.position.set(base.x + vx * k, base.y + 0.3 + easeOutCubic(k) * 1.4, base.z + vz * k);
          m.rotation.y = k * 6;
          m.scale.setScalar(Math.sin(Math.min(1, k * 3) * Math.PI * 0.5) * (1 - Math.max(0, k - 0.7) / 0.3));
        },
      });
    }
  }

  /** Healing sparkle rising from a spot. */
  heal(pos: THREE.Vector3) {
    for (let i = 0; i < 6; i++) {
      tmpV2.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4).add(pos);
      this.glow.emit(tmpV2, new THREE.Vector3(0, 1.2 + Math.random(), 0), tmpC.set('#7dff9a'), 0.14, 0.7, 0, 0.5);
    }
  }

  dust(pos: THREE.Vector3, color = '#d9c39a', count = 20) {
    this.burst(pos, color, count, 1.6, 0.35, 0.9, false, 1.2);
  }

  /** Floating note glyph that rises (economy towers, coins). */
  coinNote(pos: THREE.Vector3) {
    const m = this.note('#ffd36b', 0.18);
    const base = pos.clone();
    this.group.add(m);
    this.timed.push({
      obj: m, t0: this.now, dur: 0.9,
      tick: (k) => {
        m.position.set(base.x, base.y + easeOutCubic(k) * 0.9, base.z);
        m.rotation.y = k * 5;
        m.scale.setScalar(Math.min(1, k * 5) * (1 - Math.max(0, k - 0.6) / 0.4));
      },
    });
  }

  /** A falling object (golem plate) tumbling to the ground. */
  drop(obj: THREE.Object3D, from: THREE.Vector3) {
    obj.position.copy(from);
    this.group.add(obj);
    const v = new THREE.Vector3((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2);
    const base = from.clone();
    this.timed.push({
      obj, t0: this.now, dur: 1.4,
      tick: (k) => {
        const t = k * 1.4;
        obj.position.set(base.x + v.x * t, Math.max(0.05, base.y + v.y * t - 4.9 * t * t), base.z + v.z * t);
        obj.rotation.x = t * 6;
        obj.rotation.z = t * 4;
        obj.scale.setScalar(1 - Math.max(0, k - 0.8) / 0.2);
      },
    });
  }

  update(dt: number, vt: number) {
    this.now += dt;
    // projectiles in view time
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (vt < p.t0) continue;
      const k = clamp01((vt - p.t0) / Math.max(1e-3, p.t1 - p.t0));
      const to = p.to();
      p.obj.visible = true;
      p.obj.position.lerpVectors(p.from, to, k);
      p.obj.position.y += Math.sin(k * Math.PI) * p.arc;
      p.obj.rotation.y += dt * p.spin;
      if (p.trail) {
        p.trail.acc += dt;
        while (p.trail.acc > p.trail.every) {
          p.trail.acc -= p.trail.every;
          this.glow.emit(p.obj.position, tmpV.set(0, 0.2, 0), p.trail.color, p.trail.size, 0.35, 0, 0);
        }
      }
      if (k >= 1) {
        this.group.remove(p.obj);
        this.projectiles.splice(i, 1);
      }
    }
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const e = this.timed[i];
      const k = clamp01((this.now - e.t0) / e.dur);
      e.tick(k, e.obj);
      if (k >= 1) {
        this.group.remove(e.obj);
        e.dispose?.();
        this.timed.splice(i, 1);
      }
    }
    this.glow.update(dt);
    this.ink.update(dt);
  }

  clear() {
    for (const p of this.projectiles) this.group.remove(p.obj);
    for (const e of this.timed) {
      this.group.remove(e.obj);
      e.dispose?.();
    }
    this.projectiles = [];
    this.timed = [];
  }
}

void box;
void Fx.prototype;
