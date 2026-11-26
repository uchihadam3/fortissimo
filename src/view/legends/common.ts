/**
 * Shared kit for the five legends (src/view/legends.ts): the legend ink material (vertex colours,
 * per-vertex glow that pulses on the beat, red "tell" parts that light up on the wind-up, rim light,
 * hit flash, a noisy materialise/dissolve with a glowing edge, ground clip), world-sized glow points,
 * a skinned spine (one draw call for a long body that bends along a curve), the X-stitch, the parry
 * sparks, and the act state every rig reads.
 */
import * as THREE from 'three';
import { paint, merge } from '../musicians';
import { capsule, clamp01 } from '../kit';

export type Geo = THREE.BufferGeometry;
export type Col = string | number | THREE.Color;
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export { merge };

/** deterministic random (per legend) */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** paint a part: colour, glow (0 lit … 1+ emissive, pulses on the beat) and tell (lights red on the wind-up) */
export function P(g: Geo, color: Col | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color), glow = 0, tell = 0): Geo {
  paint(g, color as never, glow);
  const n = g.attributes.position.count;
  g.setAttribute('aTell', new THREE.BufferAttribute(new Float32Array(n).fill(tell), 1));
  return g;
}

/** a part whose glow fades along a direction (e.g. only the tips of a fin burn) */
export function glowAlong(g: Geo, fn: (p: THREE.Vector3) => number): Geo {
  const pos = g.attributes.position, gl = g.attributes.glow as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) gl.setX(i, gl.getX(i) * fn(v.fromBufferAttribute(pos, i)));
  return g;
}

// ───────────────────────────── noise ─────────────────────────────

export const NOISE = /* glsl */ `
float lH(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float lN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lH(i), lH(i + vec3(1,0,0)), f.x), mix(lH(i + vec3(0,1,0)), lH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lH(i + vec3(0,0,1)), lH(i + vec3(1,0,1)), f.x), mix(lH(i + vec3(0,1,1)), lH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float lF(vec3 p){ return lN(p) * 0.55 + lN(p * 2.07 + 3.1) * 0.3 + lN(p * 4.3 + 7.7) * 0.15; }
`;

// ───────────────────────────── the legend material ─────────────────────────────

export interface LU {
  uTime: { value: number };
  /** beat pulse: 1 on the beat, decaying */
  uBeat: { value: number };
  /** beat position (float) */
  uBeatPos: { value: number };
  /** the wind-up: 0 … 1 (red parts burn) */
  uTell: { value: number };
  /** the wind-up's count: 1 on each counted beat */
  uTellBeat: { value: number };
  uTellCol: { value: THREE.Color };
  uFlash: { value: THREE.Color };
  uRim: { value: THREE.Color };
  /** 0 gone … 1 fully there (noisy dissolve with a glowing edge) */
  uAppear: { value: number };
  uEdge: { value: THREE.Color };
  uClipY: { value: number };
  /** the phase look, smoothed (1 … 3) */
  uPhase: { value: number };
  /** free per-legend parameter (heat, haze, opening …) */
  uK: { value: number };
  uK2: { value: number };
  /** emissive strength of glowing parts: base + beat */
  uGlow: { value: THREE.Vector2 };
}

export function legendUniforms(rim: Col, edge: Col): LU {
  return {
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uBeatPos: { value: 0 },
    uTell: { value: 0 },
    uTellBeat: { value: 0 },
    uTellCol: { value: new THREE.Color('#ff2a1a') },
    uFlash: { value: new THREE.Color(0, 0, 0) },
    uRim: { value: new THREE.Color(rim) },
    uAppear: { value: 1 },
    uEdge: { value: new THREE.Color(edge) },
    uClipY: { value: -1e5 },
    uPhase: { value: 1 },
    uK: { value: 0 },
    uK2: { value: 0 },
    uGlow: { value: new THREE.Vector2(0.85, 0.6) },
  };
}

export interface LegendMatOpts {
  rough?: number;
  metal?: number;
  flat?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  /** GLSL run after begin_vertex (has `transformed`, `position`, `normal`, uniforms) */
  vert?: string;
  /** GLSL run after color_fragment (has diffuseColor, vObj, vGlow, vTell, uniforms, NOISE) */
  color?: string;
  /** GLSL adding to totalEmissiveRadiance */
  emissive?: string;
  /** extra declarations shared by both stages */
  pars?: string;
  /** cache key (distinct shader code needs a distinct key) */
  key: string;
}

export function legendMat(u: LU, o: LegendMatOpts): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: o.rough ?? 0.7,
    metalness: o.metal ?? 0,
    flatShading: o.flat ?? false,
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
  });
  const pars = /* glsl */ `
uniform float uTime; uniform float uBeat; uniform float uBeatPos; uniform float uTell; uniform float uTellBeat; uniform vec3 uTellCol;
uniform vec3 uFlash; uniform vec3 uRim; uniform float uAppear; uniform vec3 uEdge; uniform float uClipY; uniform float uPhase;
uniform float uK; uniform float uK2; uniform vec2 uGlow;
varying vec3 vObj; varying float vGlow; varying float vTell; varying vec3 vWPosL;
${NOISE}
${o.pars ?? ''}
`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${pars}\nattribute float glow; attribute float aTell;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvObj = position; vGlow = glow; vTell = aTell;\n${o.vert ?? ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvWPosL = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${pars}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vWPosL.y < uClipY) discard;
        float lEdge = 0.0;
        if (uAppear < 0.999) {
          float dn = lN(vObj * 2.3) * 0.62 + lN(vObj * 7.1) * 0.38;
          float th = 1.0 - uAppear * 1.2;
          if (dn < th) discard;
          lEdge = 1.0 - smoothstep(0.0, 0.08, dn - th);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 lBase = diffuseColor.rgb;
        ${o.color ?? ''}
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.12, 0.1), vTell * uTell * 0.6);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += lBase * vGlow * (uGlow.x + uGlow.y * uBeat);
        totalEmissiveRadiance += uTellCol * vTell * uTell * (0.9 + 1.6 * uTellBeat) * 1.6;
        totalEmissiveRadiance += uFlash;
        totalEmissiveRadiance += uEdge * lEdge * 3.0;
        ${o.emissive ?? ''}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{ float rf = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
           outgoingLight += uRim * rf; }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `legend-${o.key}`;
  return m;
}

// ───────────────────────────── glow points (world sized) ─────────────────────────────

const _v2 = new THREE.Vector2();

/** additive glow points sized in object units; attributes aCol (rgb), aSize, aA (alpha) */
export class GlowPoints {
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  readonly mat: THREE.ShaderMaterial;
  constructor(readonly n: number, o: { soft?: number; blending?: THREE.Blending; star?: boolean } = {}) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3).fill(1);
    this.size = new Float32Array(n).fill(0.1);
    this.alpha = new Float32Array(n).fill(1);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: o.blending ?? THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: { uPx: { value: 400 }, uOpacity: { value: 1 }, uClipY: { value: -1e5 } },
      vertexShader: /* glsl */ `
        attribute vec3 aCol; attribute float aSize; attribute float aA;
        uniform float uPx; uniform float uClipY; varying vec3 vC; varying float vA;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec4 mv = viewMatrix * wp;
          gl_Position = projectionMatrix * mv;
          float sc = length(modelMatrix[0].xyz);
          gl_PointSize = min(512.0, aSize * sc * projectionMatrix[1][1] * uPx / max(0.1, -mv.z));
          vC = aCol; vA = aA * step(uClipY, wp.y);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying vec3 vC; varying float vA;
        void main(){
          vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
          float a = pow(max(0.0, 1.0 - r), ${(o.soft ?? 1.6).toFixed(2)});
          float core = smoothstep(0.35, 0.0, r);
          ${o.star ? 'float cr = max(smoothstep(0.07, 0.0, abs(d.x)), smoothstep(0.07, 0.0, abs(d.y))) * smoothstep(1.0, 0.1, r); a += cr * 0.8;' : ''}
          float A = a * vA * uOpacity;
          if (A < 0.004) discard;
          gl_FragColor = vec4(vC * A + vec3(core * A * 0.6), A);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(_v2);
      this.mat.uniforms.uPx.value = _v2.y * 0.5;
    };
  }
  set(i: number, x: number, y: number, z: number, size: number, a: number, c?: THREE.Color) {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.size[i] = size;
    this.alpha[i] = a;
    if (c) {
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
    }
  }
  commit() {
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aCol.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aA.needsUpdate = true;
  }
}

// ───────────────────────────── the skinned spine ─────────────────────────────

const _X = new THREE.Vector3(), _N = new THREE.Vector3(), _T = new THREE.Vector3(), _M = new THREE.Matrix4();

export interface Frame {
  p: THREE.Vector3;
  t: THREE.Vector3;
  n: THREE.Vector3;
  x: THREE.Vector3;
}

/**
 * A long body built straight along +z (z = 0 tail … L head) and bent along a curve by `bones`
 * bones (one skinned mesh = one draw call). `pose(curve)` lays the bones on the curve (arc length),
 * with a twist-free frame (parallel transport from the head); `frame(u)` samples it for attachments.
 */
export class Spine {
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[] = [];
  readonly frames: Frame[] = [];
  constructor(geo: Geo, readonly n: number, readonly L: number, mat: THREE.Material) {
    const pos = geo.attributes.position;
    const si = new Uint16Array(pos.count * 4), sw = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const f = THREE.MathUtils.clamp((pos.getZ(i) / L) * (n - 1), 0, n - 1);
      const i0 = Math.min(n - 2, Math.floor(f));
      const w = f - i0;
      si.set([i0, i0 + 1, 0, 0], i * 4);
      sw.set([1 - w, w, 0, 0], i * 4);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    this.mesh = new THREE.SkinnedMesh(geo, mat);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Bone();
      b.position.set(0, 0, (i / (n - 1)) * L);
      this.mesh.add(b);
      this.bones.push(b);
      this.frames.push({ p: new THREE.Vector3(0, 0, b.position.z), t: V(0, 0, 1), n: V(0, 1, 0), x: V(1, 0, 0) });
    }
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  /** lay the body on `curve` (u: 0 tail … 1 head); `up` is the head's up; `scale(u)` thickens the body */
  pose(curve: THREE.Curve<THREE.Vector3>, up: THREE.Vector3, scale?: (u: number) => number, roll?: (u: number) => number) {
    const n = this.n;
    for (let i = 0; i < n; i++) curve.getPointAt(i / (n - 1), this.frames[i].p);
    for (let i = 0; i < n; i++) {
      const a = this.frames[Math.max(0, i - 1)].p, b = this.frames[Math.min(n - 1, i + 1)].p;
      this.frames[i].t.subVectors(b, a).normalize();
    }
    // parallel transport from the head
    _N.copy(up);
    for (let i = n - 1; i >= 0; i--) {
      const f = this.frames[i];
      _N.addScaledVector(f.t, -_N.dot(f.t));
      if (_N.lengthSq() < 1e-6) _N.set(0, 1, 0).addScaledVector(f.t, -f.t.y);
      _N.normalize();
      f.n.copy(_N);
      if (roll) f.n.applyAxisAngle(f.t, roll(i / (n - 1)));
      f.x.crossVectors(f.n, f.t).normalize();
      const b = this.bones[i];
      b.position.copy(f.p);
      _M.makeBasis(f.x, f.n, f.t);
      b.quaternion.setFromRotationMatrix(_M);
      b.scale.setScalar(scale ? scale(i / (n - 1)) : 1);
    }
  }

  /** an interpolated frame at u (0 tail … 1 head) */
  frame(u: number, out: Frame) {
    const f = clamp01(u) * (this.n - 1);
    const i0 = Math.min(this.n - 2, Math.floor(f)), w = f - i0;
    const a = this.frames[i0], b = this.frames[i0 + 1];
    out.p.lerpVectors(a.p, b.p, w);
    out.t.lerpVectors(a.t, b.t, w).normalize();
    out.n.lerpVectors(a.n, b.n, w).normalize();
    out.x.crossVectors(out.n, out.t).normalize();
    return out;
  }
}

export const newFrame = (): Frame => ({ p: new THREE.Vector3(), t: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(0, 1, 0), x: new THREE.Vector3(1, 0, 0) });

// ───────────────────────────── the X-stitch ─────────────────────────────

/** the mark of the Silence: two crossed stitches with little ticks, facing +z, width w */
export function xStitch(w: number, r: number, color: Col, glow = 0, tell = 1): Geo {
  const parts: Geo[] = [];
  for (const k of [-1, 1]) {
    parts.push(P(capsule(r, w, 3, 6).rotateZ(k * 0.78), color, glow, tell));
    for (const j of [-2, -1, 1, 2]) {
      const d = (j / 2.6) * w * 0.5;
      const tk = capsule(r * 0.45, w * 0.17, 2, 4).rotateZ(k * 0.78 + Math.PI / 2);
      tk.translate(-Math.sin(k * 0.78) * d, Math.cos(k * 0.78) * d, r * 0.4);
      parts.push(P(tk, color, glow, tell));
    }
  }
  return merge(parts);
}

// ───────────────────────────── parry sparks ─────────────────────────────

const GOLD = new THREE.Color('#ffd36b'), WHITE = new THREE.Color('#fff6e0');

/** golden sparks and a shock ring (the parry) */
export class Sparks {
  readonly group = new THREE.Group();
  private gp: GlowPoints;
  private vel: Float32Array;
  private life: Float32Array;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private ringT = 9;
  private next = 0;
  constructor(private n = 96) {
    this.gp = new GlowPoints(n, { star: true });
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n).fill(9);
    for (let i = 0; i < n; i++) this.gp.alpha[i] = 0;
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2a0').multiplyScalar(2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), this.ringMat);
    this.ring.visible = false;
    this.group.add(this.gp.points, this.ring);
  }
  burst(at: THREE.Vector3, dir: THREE.Vector3, count = 64, speed = 6) {
    const r = Math.random;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const v = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.4 + r()).addScaledVector(dir, 0.7).normalize().multiplyScalar(speed * (0.35 + r() * 0.8));
      this.vel.set([v.x, v.y, v.z], i * 3);
      this.gp.pos.set([at.x, at.y, at.z], i * 3);
      this.life[i] = 0;
      const c = r() < 0.6 ? GOLD : WHITE;
      this.gp.col.set([c.r * 2, c.g * 2, c.b * 2], i * 3);
    }
    this.ring.position.copy(at);
    this.ring.lookAt(at.clone().add(dir));
    this.ringT = 0;
  }
  update(dt: number) {
    const g = this.gp;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] > 2) {
        g.alpha[i] = 0;
        continue;
      }
      this.life[i] += dt;
      const L = this.life[i];
      this.vel[i * 3 + 1] -= dt * 6;
      const drag = Math.exp(-dt * 1.8);
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= drag;
        g.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      }
      g.size[i] = 0.16 * (1 - L / 1.4);
      g.alpha[i] = Math.max(0, 1 - L / 1.4);
    }
    g.commit();
    this.ringT += dt;
    const k = this.ringT / 0.5;
    this.ring.visible = k < 1;
    if (k < 1) {
      this.ring.scale.setScalar(0.3 + k * 3.2);
      this.ringMat.opacity = (1 - k) * (1 - k);
    }
  }
  dispose() {
    this.gp.points.geometry.dispose();
    this.gp.mat.dispose();
    this.ring.geometry.dispose();
    this.ringMat.dispose();
  }
}

// ───────────────────────────── the act state ─────────────────────────────

/** what every rig reads each frame (computed by LegendView from the acts) */
export interface ActS {
  dt: number;
  t: number;
  beat: number;
  /** beat fraction 0..1 */
  bp: number;
  /** 1 on the beat, decaying fast */
  pulse: number;
  /** seconds per beat (estimated) */
  spb: number;
  /** wind-up progress 0..1 (eased, reaches 1 on the landing beat) */
  windup: number;
  /** the wind-up is on (smoothed 0..1) */
  telling: number;
  /** 1 on each counted beat of the wind-up */
  tellBeat: number;
  /** the strike: 0 … 1 (snaps out fast) … back to 0 */
  strike: number;
  /** seconds since the blow (large if none) */
  blowAge: number;
  /** parried recoil 0..1..0 */
  recoil: number;
  /** stagger 0..1..0 */
  stagger: number;
  /** seconds since the stagger started */
  staggerAge: number;
  /** the phase flourish 0..1 progress (−1 when none) */
  phaseFx: number;
  /** the phase look, smoothed (1 … 3) */
  phase: number;
  /** summon 0..1..0 */
  summon: number;
  /** entrance progress 0..1 (1 = arrived) */
  enter: number;
  /** 0 up … 1 burrowed */
  sink: number;
}

export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** a quick rise, then a slow decay (0..1..0) over `dur` */
export const env = (age: number, rise: number, dur: number) => (age < 0 || age > dur ? 0 : age < rise ? smooth(0, rise, age) : 1 - smooth(rise, dur, age));

/** what a rig implements */
export interface Rig {
  readonly root: THREE.Object3D;
  readonly u: LU;
  /** total height (local units) */
  readonly height: number;
  /** where the blow lands / sparks fly (local, updated by the rig) */
  readonly strikeAt: THREE.Vector3;
  readonly enterDur: number;
  readonly phaseDur: number;
  update(s: ActS): void;
  /** called when the persistent phase changes (the smoothed blend is in s.phase) */
  setPhase(n: number): void;
  dispose(): void;
}

// ───────────────────────────── ribbon strips ─────────────────────────────

/** merge strip geometries that carry only position + aR (ribbon id, along, across, length) */
export function mergeAR(list: Geo[]): Geo {
  let off = 0;
  const pos: number[] = [], ar: number[] = [], idx: number[] = [];
  for (const g of list) {
    pos.push(...(g.attributes.position.array as Float32Array));
    ar.push(...(g.attributes.aR.array as Float32Array));
    for (const i of g.index!.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  m.setAttribute('aR', new THREE.Float32BufferAttribute(ar, 4));
  m.setIndex(idx);
  return m;
}

/** strips hanging from a spar (from a to b), streaming toward `down`, as one geometry */
export function curtain(a: THREE.Vector3, b: THREE.Vector3, down: THREE.Vector3, n: number, len: (k: number) => number, id0: number): Geo {
  const list: Geo[] = [];
  for (let k = 0; k < n; k++) {
    const q0 = k / n, q1 = (k + 1.15) / n;
    const segs = 14;
    const pos: number[] = [], ar: number[] = [], idx: number[] = [];
    const L0 = len(k / Math.max(1, n - 1));
    for (let j = 0; j <= segs; j++) {
      const v = j / segs;
      for (let i = 0; i <= 2; i++) {
        const w = i / 2;
        const q = q0 + (q1 - q0) * w;
        const root = a.clone().lerp(b, Math.min(1, q));
        const p = root.addScaledVector(down, v * L0);
        pos.push(p.x, p.y, p.z);
        ar.push(id0 + k, v, w, L0);
      }
    }
    for (let j = 0; j < segs; j++)
      for (let i = 0; i < 2; i++) {
        const p0 = j * 3 + i, p1 = p0 + 3;
        idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aR', new THREE.Float32BufferAttribute(ar, 4));
    g.setIndex(idx);
    list.push(g);
  }
  return mergeAR(list);
}

