/**
 * The band's musicians: round "note birds" (the Maestro's kind), each with its own colour, hat,
 * personality and instrument. Used on the shell (every tower is a musician playing) and in the
 * cinematics.
 *
 *   Lira (harp)          tiny, shy, green, a leaf on the head, a harp taller than herself
 *   Bumbo (drum)         big, red, marching shako with a plume, a bass drum on the belly
 *   Dona Badalo (bell)   old blue owl-bird, round glasses, lilac shawl, a bronze hand bell
 *   Chocalho (shaker)    sandy yellow, striped scarf, desert goggles, two maracas
 *   Cristalina (crystal) lilac, lashes, a translucent crystal crest, a floating crystal
 *   Trompa (horn)        fluffy white, knitted striped hat with a pom-pom, a big brass horn
 *   Coralitos (choir)    three tiny pink chicks on a little riser
 *   Grave (bass)         huge purple, top hat and bow tie, an upright double bass and a bow
 *
 * Also the character kit shared with the creatures and the Silence: painted geometry with a glow
 * channel, and one material (`charMat`) that knows how to turn to stone (rescue scenes), go grey
 * (muted), become ink (the Mimic's shadow copies), flash and show a rim light.
 *
 * CONTRACT (docs/DESIGN-v2.md §6): `new MusicianView(kind, {scale?})`, `.group`, `.pose`,
 * `play(strength?)`, `setFrozen(k)`, `update(dt, t, beat)`. Extras: `{level}` in the options and
 * `setLevel(l)` (towers), `setMood()` (muted / disabled), `setInk(k)` (shadow copy), `muzzle`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TowerKind } from '../sim/defs';
import { at, box, capsule, clamp01, cone, cyl, scl, sph, torus } from './kit';

export type MusicianPose = 'idle' | 'play' | 'cheer' | 'wave' | 'sleep' | 'scared' | 'bow' | 'jump';
/** muted: covers its ears, eyes squeezed, grey · disabled (slug bite): slumped, dizzy, nearly stone grey */
export type MusicianMood = 'normal' | 'muted' | 'disabled';

// ───────────────────────────── character kit ─────────────────────────────

type Geo = THREE.BufferGeometry;
type Col = THREE.ColorRepresentation;
export type Painter = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const shade = (c: Col, k: number) => new THREE.Color(c).multiplyScalar(k);
export const mixc = (a: Col, b: Col, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k);
/** an ellipsoid (unit sphere scaled) */
export const ell = (rx: number, ry: number, rz: number, ws = 14, hs = 10) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);

/**
 * Give a geometry vertex colours (flat, or computed per vertex from position and normal) and a
 * glow amount (0 lit only … 1 glows in the dark). Drops uvs so painted parts merge freely.
 */
export function paint(g: Geo, color: Col | Painter, glow = 0): Geo {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const n = pos.count;
  const col = new Float32Array(n * 3), gl = new Float32Array(n);
  const flat = typeof color === 'function' ? null : new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const c = flat ?? (color as Painter)(_p.fromBufferAttribute(pos, i), _n.fromBufferAttribute(nor, i));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    gl[i] = glow;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
  return g;
}

/** Scale the glow of a painted geometry per vertex (e.g. only the tips of a crystal glow). */
export function glowBy(g: Geo, fn: (p: THREE.Vector3) => number): Geo {
  const pos = g.attributes.position, gl = g.attributes.glow as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) gl.setX(i, gl.getX(i) * fn(_p.fromBufferAttribute(pos, i)));
  return g;
}

/** Merge painted parts (position, normal, color, glow). */
export function merge(parts: Geo[]): Geo {
  const nonIdx = parts.some((p) => !p.index);
  const list = nonIdx ? parts.map((p) => (p.index ? p.toNonIndexed() : p)) : parts;
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('merge: incompatible parts');
  return g;
}

const _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);
/** Orient a geometry built facing +z along `n` and move it to `p`. */
export function place(g: Geo, p: THREE.Vector3, n: THREE.Vector3, spin = 0): Geo {
  if (spin) g.rotateZ(spin);
  _q.setFromUnitVectors(Z, _n.copy(n).normalize());
  g.applyQuaternion(_q);
  return g.translate(p.x, p.y, p.z);
}

/** Rotate a geometry about a pivot. */
export function turnAbout(g: Geo, pivot: THREE.Vector3, rx: number, ry = 0, rz = 0): Geo {
  g.translate(-pivot.x, -pivot.y, -pivot.z);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  return g.translate(pivot.x, pivot.y, pivot.z);
}

/** An egg-shaped body (ellipsoid): surface points and normals for placing features. */
export class Egg {
  constructor(readonly R: number, readonly sy: number, readonly cy: number, readonly sz = 0.96) {}
  /** surface point and outward normal in direction (x, y, z) from the centre */
  at(x: number, y: number, z: number): { p: THREE.Vector3; n: THREE.Vector3 } {
    const d = new THREE.Vector3(x, y, z).normalize();
    const a = this.R, b = this.R * this.sy, c = this.R * this.sz;
    const t = 1 / Math.sqrt((d.x / a) ** 2 + (d.y / b) ** 2 + (d.z / c) ** 2);
    const p = d.multiplyScalar(t);
    const n = new THREE.Vector3(p.x / (a * a), p.y / (b * b), p.z / (c * c)).normalize();
    p.y += this.cy;
    return { p, n };
  }
  /** front surface z at (x, y) */
  zAt(x: number, y: number): number {
    const u = 1 - (x / this.R) ** 2 - ((y - this.cy) / (this.R * this.sy)) ** 2;
    return this.R * this.sz * Math.sqrt(Math.max(0, u));
  }
  /** horizontal radius of the body at height y */
  rAt(y: number): number {
    return this.R * Math.sqrt(Math.max(0, 1 - ((y - this.cy) / (this.R * this.sy)) ** 2));
  }
  geo(ws = 30, hs = 22): Geo {
    return new THREE.SphereGeometry(this.R, ws, hs).scale(1, this.sy, this.sz).translate(0, this.cy, 0);
  }
}

// ───────────────────────────── the character material ─────────────────────────────

export interface CharUniforms {
  /** 0 … 1 desaturated (muted / disabled) */
  uGrey: { value: number };
  /** 0 alive … 1 stone statue; the colour front is at world height uStoneLine */
  uStone: { value: number };
  uStoneLine: { value: number };
  uStoneBand: { value: number };
  /** additive emissive (hit flash) */
  uFlash: { value: THREE.Color };
  /** rim light colour × strength */
  uRim: { value: THREE.Color };
  /** 0 … 1 shadow copy made of ink (eyes turn to glowing white) */
  uInk: { value: number };
  /** multiplier of the per-vertex glow */
  uGlowK: { value: number };
  /** 0 … 1 icy tint (slowed creatures) */
  uSlow: { value: number };
}

export function charUniforms(rim: Col = '#fff1d6', rimK = 0.16): CharUniforms {
  return {
    uGrey: { value: 0 },
    uStone: { value: 0 },
    uStoneLine: { value: -1e4 },
    uStoneBand: { value: 0.05 },
    uFlash: { value: new THREE.Color(0, 0, 0) },
    uRim: { value: new THREE.Color(rim).multiplyScalar(rimK) },
    uInk: { value: 0 },
    uGlowK: { value: 1 },
    uSlow: { value: 0 },
  };
}

const CH_FRAG_PARS = /* glsl */ `
uniform float uGrey; uniform float uStone; uniform float uStoneLine; uniform float uStoneBand;
uniform vec3 uFlash; uniform vec3 uRim; uniform float uInk; uniform float uGlowK; uniform float uSlow; uniform float uEye;
varying float vGlowC; varying vec3 vWPosC;
float chH(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float chN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(chH(i), chH(i + vec3(1,0,0)), f.x), mix(chH(i + vec3(0,1,0)), chH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(chH(i + vec3(0,0,1)), chH(i + vec3(1,0,1)), f.x), mix(chH(i + vec3(0,1,1)), chH(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

const CH_COLOR = /* glsl */ `
float chStone = 0.0;
if (uStone > 0.001) {
  float wob = (chN(vWPosC * 9.0) - 0.5) * uStoneBand * 2.4;
  chStone = smoothstep(-uStoneBand, uStoneBand, uStoneLine - vWPosC.y + wob);
}
float chL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(chL) * vec3(0.84, 0.86, 0.98), uGrey);
vec3 chInk = mix(vec3(0.035, 0.028, 0.07), vec3(0.12, 0.095, 0.2), chL);
diffuseColor.rgb = mix(diffuseColor.rgb, mix(chInk, vec3(0.93, 0.9, 1.0), uEye), uInk);
float chSp = chN(vWPosC * 31.0) * 0.6 + chN(vWPosC * 7.0) * 0.4;
vec3 chStoneC = vec3(0.6, 0.6, 0.64) * (0.74 + 0.42 * chL) * (0.8 + 0.32 * chSp);
diffuseColor.rgb = mix(diffuseColor.rgb, chStoneC, chStone);
diffuseColor.a = mix(diffuseColor.a, 1.0, chStone);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.9, 1.2) + vec3(0.05, 0.1, 0.18), uSlow);
`;

const CH_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += vColor.rgb * vGlowC * uGlowK * (1.0 - chStone) * (1.0 - 0.75 * uGrey) * (1.0 - uInk);
totalEmissiveRadiance += uFlash;
totalEmissiveRadiance += vec3(0.85, 0.8, 1.0) * uInk * uEye * 0.6;
if (uStone > 0.001 && uStone < 0.999) {
  float chE = 1.0 - abs(uStoneLine - vWPosC.y) / (uStoneBand * 2.2);
  totalEmissiveRadiance += vec3(1.0, 0.78, 0.35) * max(chE, 0.0) * 1.6;
}
totalEmissiveRadiance += vec3(0.2, 0.45, 0.8) * uSlow * 0.3;
`;

export interface CharMatOpts {
  rough?: number;
  metal?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** the eyes: glow white in ink mode */
  eye?: boolean;
  /** own glow multiplier (flashing instrument parts) */
  glowK?: { value: number };
  flat?: boolean;
  depthWrite?: boolean;
}

/** The shared character material (vertex colours + glow channel + stone/grey/ink/flash/rim). */
export function charMat(u: CharUniforms, o: CharMatOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: o.rough ?? 0.66,
    metalness: o.metal ?? 0,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    flatShading: !!o.flat,
    depthWrite: o.depthWrite ?? !o.transparent,
  });
  const eyeU = { value: o.eye ? 1 : 0 };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uEye: eyeU });
    if (o.glowK) sh.uniforms.uGlowK = o.glowK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow; varying float vGlowC; varying vec3 vWPosC;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vGlowC = glow;
        { vec4 chw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            chw = instanceMatrix * chw;
          #endif
          vWPosC = (modelMatrix * chw).xyz; }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${CH_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${CH_COLOR}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, chStone);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, max(chStone, uInk));')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${CH_EMISSIVE}`)
      .replace(
        '#include <opaque_fragment>',
        `{ float chF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
           outgoingLight += uRim * chF * (1.0 - chStone); }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'char1';
  return m;
}

/** Material slots used by character templates. */
export type MK = 'm' | 'g' | 'x' | 'c' | 'e' | 'd' | 'f' | 'h';

/** A set of character materials sharing one uniform set (one per instance). */
export class CharMats {
  readonly u: CharUniforms;
  /** glow multiplier of flashing parts (strings, drum skin, crystal…) */
  readonly flashK = { value: 0.4 };
  private mats = new Map<MK, THREE.MeshStandardMaterial>();
  constructor(rim?: Col, rimK?: number, public glassOpacity = 0.72) {
    this.u = charUniforms(rim, rimK);
  }
  get(k: MK): THREE.MeshStandardMaterial {
    let m = this.mats.get(k);
    if (!m) {
      const u = this.u;
      switch (k) {
        case 'g': m = charMat(u, { rough: 0.32 }); break;
        case 'x': m = charMat(u, { rough: 0.3, metal: 0.72, side: THREE.DoubleSide }); break;
        case 'c': m = charMat(u, { rough: 0.12, transparent: true, opacity: this.glassOpacity, glowK: this.flashK }); break;
        case 'e': m = charMat(u, { rough: 0.22, eye: true }); break;
        case 'd': m = charMat(u, { rough: 0.75, side: THREE.DoubleSide }); break;
        case 'f': m = charMat(u, { rough: 0.4, glowK: this.flashK }); break;
        case 'h': m = charMat(u, { rough: 0.55, transparent: true, opacity: this.glassOpacity, side: THREE.DoubleSide, glowK: this.flashK }); break;
        default: m = charMat(u, { rough: 0.68 });
      }
      this.mats.set(k, m);
    }
    return m;
  }
  /** give every mesh under `root` its material from userData.mk */
  apply(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.mk) m.material = this.get(m.userData.mk as MK);
    });
  }
  dispose() {
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}

const PLACEHOLDER = new THREE.MeshBasicMaterial({ visible: false });

/** Painted parts sorted by part name and material slot; turned into meshes when assembled. */
export class Bins {
  private map = new Map<string, Map<MK, Geo[]>>();
  add(part: string, mk: MK, ...gs: Geo[]): this {
    let p = this.map.get(part);
    if (!p) this.map.set(part, (p = new Map()));
    let l = p.get(mk);
    if (!l) p.set(mk, (l = []));
    l.push(...gs);
    return this;
  }
  has(part: string) {
    return this.map.has(part);
  }
  /** the meshes of one part (geometry moved so `origin` becomes 0,0,0) */
  meshes(part: string, origin?: THREE.Vector3, shadow = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    const p = this.map.get(part);
    if (!p) return out;
    for (const [mk, list] of p) {
      const g = merge(list);
      if (origin) g.translate(-origin.x, -origin.y, -origin.z);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, PLACEHOLDER);
      m.userData.mk = mk;
      m.castShadow = shadow && mk !== 'c' && mk !== 'e' && mk !== 'h';
      m.receiveShadow = mk !== 'c' && mk !== 'h';
      out.push(m);
    }
    return out;
  }
  into<T extends THREE.Object3D>(part: string, parent: T, origin?: THREE.Vector3, shadow = true): T {
    for (const m of this.meshes(part, origin, shadow)) parent.add(m);
    return parent;
  }
}

export function grp(name: string, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

/** body colour with a lighter belly and soft painted shading underneath */
export function bellyPaint(body: Col, belly: Col, o: { dir?: THREE.Vector3; k0?: number; k1?: number; disc?: { col: Col; dirs: THREE.Vector3[]; k0: number; k1: number } } = {}): Painter {
  const cb = new THREE.Color(body), cl = new THREE.Color(belly), cs = shade(body, 0.7);
  const dc = o.disc ? new THREE.Color(o.disc.col) : null;
  const dir = o.dir ?? new THREE.Vector3(0, -0.32, 1).normalize();
  const k0 = o.k0 ?? 0.45, k1 = o.k1 ?? 0.64;
  return (_pp, n) => {
    _c.copy(cb).lerp(cs, smooth(0.1, -0.95, n.y) * 0.42);
    _c.lerp(cl, smooth(k0, k1, n.dot(dir)));
    if (o.disc && dc) {
      let d = -1;
      for (const v of o.disc.dirs) d = Math.max(d, n.dot(v));
      _c.lerp(dc, smooth(o.disc.k0, o.disc.k1, d));
    }
    return _c;
  };
}

class Spiral extends THREE.Curve<THREE.Vector3> {
  constructor(private r: number) {
    super();
  }
  getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const a = t * Math.PI * 4.2;
    const rr = this.r * (0.12 + 0.88 * t);
    return out.set(Math.cos(a) * rr, Math.sin(a) * rr, 0);
  }
}

const LINE = '#2a1b2c';

/**
 * A pair of cartoon eyes in the eye-centre frame (eyes at ±s): white, coloured iris, pupil, two
 * highlights; the lids (top caps that roll down), and alternative eyes: happy ^ ^, squeezed > <
 * and dizzy swirls.
 */
export function eyeParts(b: Bins, e: number, s: number, iris: Col, lid: Col, pre = '', pupil = '#140f1d') {
  const E: Geo[] = [], L: Geo[] = [], H: Geo[] = [], S: Geo[] = [];
  const lc = new THREE.Color(lid), ll = new THREE.Color(LINE);
  for (const side of [-1, 1]) {
    const x = side * s;
    E.push(paint(at(scl(sph(e, 18, 14), 1, 1.15, 0.5), x, 0, 0), '#fbfaf5'));
    E.push(paint(at(scl(sph(e * 0.66, 16, 12), 1, 1.1, 0.36), x, -e * 0.05, e * 0.33), iris));
    E.push(paint(at(scl(sph(e * 0.4, 12, 10), 1, 1.1, 0.4), x, -e * 0.06, e * 0.47), pupil));
    E.push(paint(at(scl(sph(e * 0.2, 10, 8), 1, 1, 0.5), x + e * 0.24, e * 0.3, e * 0.6), '#ffffff', 1));
    E.push(paint(at(scl(sph(e * 0.1, 8, 6), 1, 1, 0.5), x - e * 0.22, -e * 0.3, e * 0.56), '#ffffff', 0.7));
    L.push(paint(at(new THREE.SphereGeometry(e * 1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, 0, 0), (p) => (p.y < e * 0.16 ? ll : lc)));
    H.push(paint(at(torus(e * 0.66, e * 0.15, 6, 14, Math.PI), x, -e * 0.15, e * 0.42), LINE));
    // > <
    const dx = -side;
    const tip = new THREE.Vector2(x + dx * 0.25 * e, 0);
    for (const ty of [0.32 * e, -0.32 * e]) {
      const tail = new THREE.Vector2(x - dx * 0.38 * e, ty);
      const len = tip.distanceTo(tail), a = Math.atan2(tip.y - tail.y, tip.x - tail.x);
      const g = capsule(e * 0.12, len, 3, 6);
      g.rotateZ(a - Math.PI / 2);
      g.translate((tip.x + tail.x) / 2, (tip.y + tail.y) / 2, e * 0.42);
      S.push(paint(g, LINE));
    }
  }
  b.add(pre + 'eyes', 'e', ...E);
  b.add(pre + 'lids', 'm', ...L);
  b.add(pre + 'happy', 'm', ...H);
  b.add(pre + 'squeeze', 'm', ...S);
  for (const k of ['dizzyL', 'dizzyR']) b.add(pre + k, 'm', paint(at(new THREE.TubeGeometry(new Spiral(e * 0.8), 40, e * 0.1, 5, false), 0, 0, e * 0.45), LINE));
}

// ───────────────────────────── the note bird ─────────────────────────────

export interface BirdDef {
  R: number;
  sy: number;
  leg: number;
  body: string;
  belly: string;
  beak: string;
  feet: string;
  cheek: string;
  iris: string;
  /** eye radius, spacing and height (× R) */
  eye: number;
  spread: number;
  eyeUp: number;
  /** wing length (× R) */
  wing: number;
  /** resting lid closure (0 open … 1 closed) */
  lid: number;
}

export interface Bird {
  egg: Egg;
  d: BirdDef;
  top: number;
  eyeY: number;
  eyeZ: number;
  e: number;
  s: number;
  shoulder: THREE.Vector3[];
  wingLen: number;
  beakY: number;
  beakZ: number;
}

const BIRD: Record<TowerKind, BirdDef> = {
  harp: { R: 0.19, sy: 1.14, leg: 0.035, body: '#7cc96a', belly: '#effad6', beak: '#f4a53a', feet: '#f0a040', cheek: '#ff98b0', iris: '#3d7a2c', eye: 0.27, spread: 0.4, eyeUp: 0.24, wing: 0.66, lid: 0.12 },
  drum: { R: 0.3, sy: 1.02, leg: 0.06, body: '#e2554b', belly: '#ffe3c9', beak: '#f5a43a', feet: '#ef9a3c', cheek: '#ff8f86', iris: '#5a2418', eye: 0.2, spread: 0.37, eyeUp: 0.32, wing: 0.7, lid: 0 },
  bell: { R: 0.27, sy: 1.1, leg: 0.04, body: '#5b8fd8', belly: '#dce9f9', beak: '#e9b04c', feet: '#e9a84a', cheek: '#ff9fb4', iris: '#e39a1c', eye: 0.23, spread: 0.37, eyeUp: 0.3, wing: 0.7, lid: 0.36 },
  shaker: { R: 0.23, sy: 1.06, leg: 0.05, body: '#efc95b', belly: '#fff3cf', beak: '#f07f35', feet: '#e8963c', cheek: '#ff9a7e', iris: '#6a4a1a', eye: 0.23, spread: 0.38, eyeUp: 0.26, wing: 0.72, lid: 0 },
  crystal: { R: 0.24, sy: 1.14, leg: 0.045, body: '#c7a3f7', belly: '#f5ecff', beak: '#f3be7a', feet: '#efb06a', cheek: '#ff9ed4', iris: '#7a3fc0', eye: 0.23, spread: 0.37, eyeUp: 0.27, wing: 0.72, lid: 0.15 },
  horn: { R: 0.28, sy: 0.98, leg: 0.05, body: '#f5f2ea', belly: '#fffaf0', beak: '#f0a03a', feet: '#e99a3c', cheek: '#ff8597', iris: '#4a6a9a', eye: 0.21, spread: 0.37, eyeUp: 0.18, wing: 0.7, lid: 0 },
  choir: { R: 0.115, sy: 1.12, leg: 0.025, body: '#ff9fca', belly: '#ffe6f1', beak: '#f7a83a', feet: '#f0a040', cheek: '#ff6fa3', iris: '#6a2a4a', eye: 0.27, spread: 0.39, eyeUp: 0.26, wing: 0.6, lid: 0 },
  bass: { R: 0.37, sy: 1.04, leg: 0.06, body: '#6c4ca0', belly: '#c6b0e6', beak: '#e8a03a', feet: '#d99040', cheek: '#d98ac0', iris: '#2c1a52', eye: 0.17, spread: 0.36, eyeUp: 0.3, wing: 0.66, lid: 0.32 },
};

/** the cast's body colours (icons, the gallery, the cinematics) */
export const MUSICIAN_COLOR: Record<TowerKind, string> = Object.fromEntries(Object.entries(BIRD).map(([k, d]) => [k, d.body])) as Record<TowerKind, string>;

/**
 * Build the parts of a note bird into the bins: 'body' (egg, feet, tail), 'face' (beak, cheeks,
 * curl), the eyes set, 'stitch' (an X over the beak, shown in ink mode), 'wingL' / 'wingR'.
 */
export function bird(b: Bins, d: BirdDef, o: { curl?: boolean; curlCol?: Col; tail?: boolean; wings?: boolean; feet?: boolean; lowBeak?: boolean; paint?: Painter; pre?: string } = {}): Bird {
  const pre = o.pre ?? '';
  const R = d.R, cy = d.leg + R * d.sy;
  const egg = new Egg(R, d.sy, cy);
  const top = cy + R * d.sy;
  b.add(pre + 'body', 'm', paint(o.paint ? egg.geo(56, 40) : egg.geo(30, 22), o.paint ?? bellyPaint(d.body, d.belly)));
  // legs and three-toed feet
  for (const side of o.feet === false ? [] : [-1, 1]) {
    const fx = side * R * 0.34;
    if (d.leg > 0.012) b.add(pre + 'body', 'm', paint(at(cyl(R * 0.05, R * 0.06, d.leg + R * 0.15, 6), fx, (d.leg + R * 0.15) / 2, R * 0.04), d.feet));
    for (const a of [-0.5, 0, 0.5]) {
      const toe = capsule(R * 0.052, R * 0.17, 3, 6);
      toe.rotateX(Math.PI / 2);
      toe.translate(0, 0, R * 0.12);
      toe.rotateY(a + side * 0.12);
      toe.translate(fx, R * 0.045, R * 0.06);
      b.add(pre + 'body', 'm', paint(toe, d.feet));
    }
  }
  // tail feathers
  if (o.tail !== false) {
    for (const a of [-0.4, 0, 0.4]) {
      const f = ell(R * 0.1, R * 0.05, R * 0.3, 10, 6);
      f.translate(0, 0, -R * 0.22);
      f.rotateX(0.55);
      f.rotateY(a);
      f.translate(0, cy - R * d.sy * 0.4, -R * 0.74);
      b.add(pre + 'body', 'm', paint(f, shade(d.body, 0.74)));
    }
  }
  // face
  const e = d.eye * R, s = d.spread * R, eyeY = cy + d.eyeUp * R * d.sy;
  const eyeZ = egg.zAt(s, eyeY) - e * 0.2;
  eyeParts(b, e, s, d.iris, shade(d.body, 0.94), pre);
  const beakY = eyeY - e * 1.2 - R * 0.05, bz = egg.zAt(0, beakY);
  const bl = R * 0.34, bw = R * 0.135;
  const up = cone(1, 1, 10);
  up.scale(bw, bl, bw * 0.8);
  up.rotateX(Math.PI / 2);
  up.translate(0, beakY + bw * 0.22, bz + bl * 0.28);
  b.add(pre + 'face', 'm', paint(up, d.beak));
  const lo = cone(1, 1, 8);
  lo.scale(bw * 0.78, bl * 0.62, bw * 0.55);
  lo.rotateX(Math.PI / 2 + 0.22);
  if (o.lowBeak) {
    lo.translate(0, -bw * 0.12, bl * 0.24);
    b.add(pre + 'beakLow', 'm', paint(lo, shade(d.beak, 0.86)));
  } else {
    lo.translate(0, beakY - bw * 0.32, bz + bl * 0.22);
    b.add(pre + 'face', 'm', paint(lo, shade(d.beak, 0.86)));
  }
  for (const side of [-1, 1]) {
    const { p, n } = egg.at(side * 0.66, d.eyeUp * 0.15 - 0.14, 0.74);
    const ck = ell(R * 0.13, R * 0.08, R * 0.03, 12, 8);
    place(ck, p.addScaledVector(n, -R * 0.012), n);
    b.add(pre + 'face', 'm', paint(ck, d.cheek));
  }
  if (o.curl) {
    const c = torus(R * 0.1, R * 0.034, 6, 14, Math.PI * 1.35);
    c.rotateY(Math.PI / 2);
    c.rotateX(0.35);
    c.translate(0, top + R * 0.06, -R * 0.05);
    b.add(pre + 'face', 'm', paint(c, o.curlCol ?? shade(d.body, 0.68)));
  }
  // the shadow copy's stitched beak
  for (const k of [-1, 1]) {
    const g = capsule(R * 0.03, R * 0.34, 3, 6);
    g.rotateZ(k * 0.78);
    g.translate(0, beakY, bz + bl * 0.62);
    b.add(pre + 'stitch', 'm', paint(g, '#efe6d2', 0.6));
  }
  // wings: folded flat against the sides, hanging from the shoulder
  const WL = d.wing * R * 1.25, WW = R * 0.46, WT = R * 0.17;
  const shoulder: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const { p, n } = egg.at(side, 0.14, 0.06);
    p.addScaledVector(n, -R * 0.09);
    shoulder.push(p);
    if (o.wings !== false) {
      const part = pre + (side < 0 ? 'wingL' : 'wingR');
      b.add(part, 'm', paint(at(ell(WT / 2, WL / 2, WW / 2, 12, 10), 0, -WL / 2, 0), shade(d.body, 0.88)));
      for (const k of [-1, 0, 1]) {
        const f = ell(WT * 0.4, WL * 0.17, WW * 0.15, 8, 6);
        f.rotateX(k * 0.35);
        f.translate(0, -WL * 0.92, k * WW * 0.22);
        b.add(part, 'm', paint(f, shade(d.body, 0.72)));
      }
    }
  }
  return { egg, d, top, eyeY, eyeZ, e, s, shoulder, wingLen: WL, beakY, beakZ: bz };
}

/** Turn a bird's bins into the standard hierarchy under `parent`. */
export function assembleBird(b: Bins, B: Bird, parent: THREE.Object3D, pre = ''): THREE.Group {
  b.into(pre + 'body', parent);
  const hc = new THREE.Vector3(0, B.egg.cy, 0);
  const head = grp(pre + 'head', 0, B.egg.cy, 0);
  parent.add(head);
  b.into(pre + 'face', head, hc);
  const ef = grp(pre + 'eyeFrame', 0, B.eyeY - B.egg.cy, B.eyeZ);
  head.add(ef);
  ef.add(b.into(pre + 'eyes', grp(pre + 'eyes'), undefined, false));
  const lf = grp(pre + 'lidFrame');
  lf.scale.set(1, 1.15, 0.55);
  ef.add(lf);
  lf.add(b.into(pre + 'lids', grp(pre + 'lids'), undefined, false));
  for (const k of ['happy', 'squeeze']) {
    const g = b.into(pre + k, grp(pre + k), undefined, false);
    g.visible = false;
    ef.add(g);
  }
  for (const [k, side] of [['dizzyL', -1], ['dizzyR', 1]] as const) {
    const g = b.into(pre + k, grp(pre + k, side * B.s, 0, 0), undefined, false);
    g.visible = false;
    ef.add(g);
  }
  const st = b.into(pre + 'stitch', grp(pre + 'stitch'), hc, false);
  st.visible = false;
  head.add(st);
  if (b.has(pre + 'beakLow')) head.add(b.into(pre + 'beakLow', grp(pre + 'beakLow', 0, B.beakY - B.egg.cy - B.d.R * 0.03, B.beakZ), undefined, false));
  for (const [k, i] of [['wingL', 0], ['wingR', 1]] as const) {
    if (!b.has(pre + k)) continue;
    const p = B.shoulder[i];
    const g = b.into(pre + k, grp(pre + k, p.x, p.y, p.z));
    g.rotation.z = (i ? 1 : -1) * WING_REST;
    parent.add(g);
  }
  return head;
}

const WING_REST = 0.12;

/** Hold pose per kind: [left forward, left raise, right forward, right raise] */
const HOLD: Record<TowerKind, [number, number, number, number]> = {
  harp: [0.55, -0.42, 0.55, -0.42],
  drum: [0.5, 0.1, 0.5, 0.1],
  bell: [-0.1, 0.32, 1.45, 0.16],
  shaker: [1.35, 0.55, 1.35, 0.55],
  crystal: [0.5, 0.5, 0.5, 0.5],
  horn: [0.75, -0.2, 0.75, -0.2],
  choir: [0, 0, 0, 0],
  bass: [0.7, 0.38, 0.95, -0.32],
};
function holdFor(kind: TowerKind, level: number): [number, number, number, number] {
  if (kind === 'bell' && level >= 1) return [1.45, 0.16, 1.45, 0.16];
  return HOLD[kind];
}

/** Rotate an item built upright at the origin so it stays upright in the wing's hold pose. */
function holdFix(g: Geo, side: number, fwd: number, raise: number): Geo {
  g.rotateX(fwd);
  g.rotateZ(-side * (WING_REST + raise));
  return g;
}

// ───────────────────────────── costumes and instruments ─────────────────────────────

const GOLD = '#f2c84e';
const WOOD = '#b27a46';
const WOOD_D = '#7a5034';

/** A hand bell: handle top at the origin, the bell hanging below (built upright). */
function handBell(b: Bins, part: string, k: number, metal: Col, fix: (g: Geo) => Geo, dy = 0) {
  const prof: THREE.Vector2[] = [];
  const pts: [number, number][] = [[0.0, 0.125], [0.03, 0.124], [0.044, 0.105], [0.05, 0.07], [0.058, 0.035], [0.078, 0.008], [0.086, 0.0], [0.08, -0.004]];
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r * k, y * k));
  const T = (g: Geo) => fix(g.translate(0, -0.2 * k + dy, 0));
  const mc = new THREE.Color(metal);
  b.add(part, 'x', T(paint(new THREE.LatheGeometry(prof, 20), (p) => _c.copy(mc).multiplyScalar(0.8 + 0.3 * clamp01(p.y / (0.125 * k))))));
  b.add(part, 'g', T(paint(at(cyl(0.013 * k, 0.016 * k, 0.07 * k, 8), 0, 0.16 * k, 0), WOOD_D)));
  b.add(part, 'g', T(paint(at(sph(0.022 * k, 10, 8), 0, 0.2 * k, 0), WOOD)));
  b.add(part, 'x', T(paint(at(sph(0.02 * k, 8, 6), 0, 0.012 * k, 0), '#5a3a1a')));
  b.add(part, 'f', T(paint(at(torus(0.082 * k, 0.007 * k, 5, 22).rotateX(Math.PI / 2), 0, 0.0, 0), '#bff0ff', 1)));
}

/** Lira's harp, in its own frame (strings plane = xy). */
function harp(b: Bins, L: number) {
  const wood = L >= 2 ? '#f1c04a' : L >= 1 ? '#c98d4a' : '#b47a42';
  const trim = L >= 1 ? GOLD : '#8a5a32';
  const mk: MK = L >= 2 ? 'x' : 'g';
  // soundbox from P0 (bottom front) up to P1 (top back)
  const P0 = new THREE.Vector2(0.1, 0.035), P1 = new THREE.Vector2(-0.17, 0.43);
  const len = P0.distanceTo(P1), ang = Math.atan2(P1.y - P0.y, P1.x - P0.x);
  const sb = cyl(0.022, 0.042, len, 4);
  sb.rotateY(Math.PI / 4);
  sb.scale(1, 1, 1.5);
  sb.rotateZ(ang - Math.PI / 2);
  sb.translate((P0.x + P1.x) / 2, (P0.y + P1.y) / 2, 0);
  b.add('harp', mk, paint(sb, wood));
  // pillar with a finial
  b.add('harp', mk, paint(at(cyl(0.016, 0.022, 0.44, 8), 0.135, 0.22, 0), wood));
  b.add('harp', 'x', paint(at(sph(0.026, 10, 8), 0.135, 0.455, 0), trim));
  b.add('harp', 'x', paint(at(torus(0.022, 0.007, 5, 12).rotateX(Math.PI / 2), 0.135, 0.06, 0), trim));
  // base foot
  b.add('harp', mk, paint(at(scl(sph(0.05, 12, 8), 1.4, 0.5, 1), 0.11, 0.015, 0), shade(wood, 0.85)));
  // the neck: a gentle S from the soundbox top to the pillar top
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.19, 0.43, 0), new THREE.Vector3(-0.1, 0.445, 0), new THREE.Vector3(0.0, 0.41, 0), new THREE.Vector3(0.08, 0.43, 0), new THREE.Vector3(0.145, 0.46, 0),
  ]);
  b.add('harp', mk, paint(new THREE.TubeGeometry(curve, 24, 0.016, 6, false), wood));
  if (L >= 1) b.add('harp', 'x', paint(new THREE.TubeGeometry(curve, 24, 0.019, 6, false).translate(0, 0.008, 0).scale(1, 1, 0.6), trim));
  // strings: vertical, from the neck down to the soundbox
  const pts = curve.getPoints(60);
  const neckY = (x: number) => {
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    return best.y;
  };
  const n = 5 + L * 2;
  for (let i = 0; i < n; i++) {
    const x = -0.13 + (0.22 * i) / (n - 1);
    const y0 = P0.y + ((P0.x - x) / (P0.x - P1.x)) * (P1.y - P0.y) + 0.012;
    const y1 = neckY(x) - 0.012;
    b.add('strings', 'f', paint(at(cyl(0.0045, 0.0045, y1 - y0, 4), x, (y0 + y1) / 2, 0), L >= 2 ? '#ffe08a' : '#fff1c8', 0.9));
  }
  if (L >= 2) b.add('harp', 'f', paint(at(new THREE.OctahedronGeometry(0.03, 0), 0.135, 0.5, 0), '#ffe08a', 1));
}

/** Bumbo's bass drum (axis x) at the origin. */
function bassDrum(b: Bins, L: number) {
  const r = 0.17 + L * 0.012, w = 0.15;
  const shellC = L >= 2 ? '#e8b23e' : '#c9382f';
  const hoop = L >= 1 ? GOLD : '#efe2c4';
  b.add('drum', L >= 2 ? 'x' : 'g', paint(cyl(r, r, w, 26).rotateZ(Math.PI / 2), shellC));
  for (const sx of [-1, 1]) {
    b.add('drum', L >= 1 ? 'x' : 'g', paint(at(torus(r + 0.006, 0.014, 6, 26).rotateY(Math.PI / 2), (sx * w) / 2, 0, 0), hoop));
    b.add('skin', 'f', paint(at(cyl(r * 0.97, r * 0.97, 0.006, 26).rotateZ(Math.PI / 2), sx * (w / 2 + 0.002), 0, 0), '#f6ecd6', 0.25));
  }
  // rope zigzag
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const g = box(0.012, w * 0.95, 0.012);
    g.rotateZ(Math.PI / 2);
    g.rotateY(i % 2 ? 0.45 : -0.45);
    g.translate(0, Math.cos(a) * (r + 0.004), Math.sin(a) * (r + 0.004));
    b.add('drum', 'm', paint(g, '#f4e6c2'));
  }
  if (L >= 2) b.add('drum', 'f', paint(at(new THREE.OctahedronGeometry(0.05, 0).scale(0.4, 1, 1), 0, 0, r + 0.01).rotateY(0), '#fff3b0', 0.8));
}

/** Grave's double bass, upright in its own frame, front +z. */
function doubleBass(b: Bins, L: number) {
  const v0 = L >= 2 ? '#f0b04a' : '#c8622a', v1 = L >= 2 ? '#a8641e' : '#6a2812';
  const varnish: Painter = (p) => _c.copy(new THREE.Color(v0)).lerp(new THREE.Color(v1), smooth(0.05, 0.19, Math.abs(p.x)) * 0.85);
  b.add('bass', 'g', paint(at(ell(0.19, 0.2, 0.065, 20, 14), 0, 0.24, 0), varnish));
  b.add('bass', 'g', paint(at(ell(0.145, 0.16, 0.06, 18, 12), 0, 0.52, 0), varnish));
  b.add('bass', 'g', paint(at(ell(0.12, 0.12, 0.06, 16, 10), 0, 0.38, 0), varnish));
  for (const sx of [-1, 1]) {
    const f = capsule(0.006, 0.07, 3, 5);
    f.rotateZ(sx * 0.18);
    f.translate(sx * 0.075, 0.33, 0.058);
    b.add('bass', 'm', paint(f, '#1a0e0a'));
  }
  b.add('bass', 'g', paint(at(box(0.036, 0.52, 0.014), 0, 0.62, 0.068), '#17121a'));
  b.add('bass', 'g', paint(at(box(0.03, 0.2, 0.034), 0, 0.82, 0.04), shade(v1, 1.2)));
  b.add('bass', 'g', paint(at(torus(0.024, 0.011, 6, 12, Math.PI * 1.6).rotateY(Math.PI / 2), 0, 0.94, 0.04), shade(v1, 1.2)));
  const peg = L >= 1 ? GOLD : '#2a1d18';
  for (let i = 0; i < 4; i++) {
    const sx = i % 2 ? 1 : -1;
    b.add('bass', L >= 1 ? 'x' : 'g', paint(at(cyl(0.007, 0.007, 0.05, 5).rotateZ(Math.PI / 2), sx * 0.035, 0.85 + Math.floor(i / 2) * 0.04, 0.04), peg));
  }
  b.add('bass', 'g', paint(at(box(0.07, 0.03, 0.01), 0, 0.27, 0.072), '#e8cf9a'));
  b.add('bass', L >= 1 ? 'x' : 'g', paint(at(box(0.046, 0.1, 0.012), 0, 0.16, 0.068), L >= 1 ? GOLD : '#17121a'));
  b.add('bass', 'g', paint(at(cyl(0.006, 0.004, 0.06, 5), 0, 0.03, 0), '#c8c8d0'));
  for (let i = 0; i < 4; i++) b.add('bstrings', 'f', paint(at(box(0.0035, 0.64, 0.0035), -0.016 + i * 0.011, 0.53, 0.082), '#f0e8ff', 0.5));
}

// ───────────────────────────── templates ─────────────────────────────

interface Template {
  root: THREE.Group;
  height: number;
}

const templates = new Map<string, Template>();

function template(kind: TowerKind, level: number): Template {
  const key = `${kind}:${level}`;
  let t = templates.get(key);
  if (!t) {
    const root = buildTemplate(kind, level);
    const bb = new THREE.Box3().setFromObject(root);
    t = { root, height: Math.max(0.3, bb.max.y) };
    templates.set(key, t);
  }
  return t;
}

function buildTemplate(kind: TowerKind, L: number): THREE.Group {
  const root = grp('rig');
  const b = new Bins();
  const d = BIRD[kind];
  const R = d.R;
  const [lf, lr, rf, rr] = holdFor(kind, L);
  switch (kind) {
    // ── Lira: tiny, shy, a leaf on her head, a harp taller than herself ──
    case 'harp': {
      const B = bird(b, d);
      const top = B.top;
      const leafA = new THREE.Color('#3a8a33'), leafB = new THREE.Color('#8ad35e');
      b.add('leaf', 'd', paint(at(ell(0.052, 0.105, 0.012, 12, 8), 0, 0.105, 0), (p) => _c.copy(leafA).lerp(leafB, clamp01(p.y / 0.2))));
      b.add('leaf', 'd', paint(at(box(0.006, 0.17, 0.016), 0, 0.1, 0), '#2f6f2a'));
      b.add('leaf', 'd', paint(at(cyl(0.006, 0.008, 0.04, 5), 0, 0.012, 0), '#4f8a3a'));
      if (L >= 1) {
        const fl = [[-0.55, 0.72, 0.42, '#ff8fb8'], [-0.25, 0.85, 0.5, '#ffffff'], [-0.7, 0.62, 0.0, '#ffd84a']] as const;
        for (const [x, y, z, c] of fl) {
          const { p, n } = B.egg.at(x, y, z);
          const f: Geo[] = [];
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            f.push(paint(at(ell(0.017, 0.017, 0.006, 8, 6), Math.cos(a) * 0.018, Math.sin(a) * 0.018, 0), L >= 2 ? '#fff2c0' : c, L >= 2 ? 0.4 : 0));
          }
          f.push(paint(at(sph(0.011, 8, 6), 0, 0, 0.005), L >= 2 ? GOLD : '#ffd23a', L >= 2 ? 0.6 : 0.1));
          b.add('face', 'm', place(merge(f), p.addScaledVector(n, 0.004), n));
        }
      }
      harp(b, L);
      assembleBird(b, B, root);
      const head = root.getObjectByName('head')!;
      const leaf = b.into('leaf', grp('leaf', 0.012, top - B.egg.cy - 0.014, -0.012));
      leaf.rotation.set(-0.45, 0, -0.5);
      head.add(leaf);
      const instr = grp('instr', 0.23, 0, 0.13);
      instr.rotation.y = -0.62;
      instr.scale.setScalar(1.22);
      b.into('harp', instr);
      instr.add(b.into('strings', grp('strings'), undefined, false));
      instr.add(grp('muzzle', -0.02, 0.27, 0));
      root.add(instr);
      break;
    }
    // ── Bumbo: big, red, a marching shako with a plume, a bass drum on the belly ──
    case 'drum': {
      const B = bird(b, d);
      const top = B.top, cy = B.egg.cy;
      const navy = '#283a72', hy = top - R * 0.2;
      const hat: Geo[] = [];
      hat.push(paint(at(cyl(0.136, 0.152, 0.26, 22), 0, hy + 0.13, 0), (p) => _c.set(navy).multiplyScalar(0.8 + 0.35 * clamp01((p.y - hy) / 0.26))));
      hat.push(paint(at(cyl(0.155, 0.155, 0.042, 22), 0, hy + 0.024, 0), GOLD));
      hat.push(paint(at(torus(0.137, 0.012, 6, 26).rotateX(Math.PI / 2), 0, hy + 0.26, 0), GOLD));
      hat.push(paint(at(cyl(0.134, 0.134, 0.01, 22), 0, hy + 0.262, 0), '#1c284f'));
      hat.push(paint(at(scl(sph(0.04, 10, 8), 1, 1.25, 0.35), 0, hy + 0.14, 0.142), GOLD, 0.2));
      for (let i = 0; i < 3 + L; i++) {
        const p = ell(0.03 + L * 0.004, 0.09 + L * 0.02, 0.03, 10, 8);
        p.translate(0, 0.085 + L * 0.015, 0);
        p.rotateZ((i - (2 + L) / 2) * 0.22);
        p.rotateX(-0.28);
        p.translate(0, hy + 0.265, 0.05);
        const lo = new THREE.Color(L >= 2 ? '#ffd75a' : '#ffffff'), hi = new THREE.Color('#e2453c');
        hat.push(paint(p, (q) => _c.copy(lo).lerp(hi, smooth(hy + 0.33, hy + 0.42, q.y))));
      }
      const vis = new THREE.CylinderGeometry(0.168, 0.168, 0.014, 16, 1, false, -Math.PI / 2, Math.PI);
      vis.rotateX(0.24);
      vis.translate(0, hy + 0.006, 0.012);
      const pivot = new THREE.Vector3(0, hy, 0);
      for (const g of hat) b.add('face', 'm', turnAbout(g, pivot, -0.1));
      b.add('face', 'g', turnAbout(paint(vis, '#15141d'), pivot, -0.1));
      // two straps from the drum up to the shoulders
      for (const sd of [-1, 1]) {
        const pts = [
          new THREE.Vector3(sd * 0.075, 0.37, R * 0.86 + 0.06),
          (() => { const { p, n } = B.egg.at(sd * 0.45, -0.05, 0.85); return p.addScaledVector(n, 0.012); })(),
          (() => { const { p, n } = B.egg.at(sd * 0.85, 0.12, 0.45); return p.addScaledVector(n, 0.012); })(),
          (() => { const { p, n } = B.egg.at(sd * 0.75, 0.55, -0.2); return p.addScaledVector(n, 0.008); })(),
        ];
        b.add('body', 'm', paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.016, 5, false), L >= 2 ? GOLD : '#f7f1e3'));
      }
      if (L >= 1) {
        // golden epaulettes with fringes on the wing roots
        for (const side of [-1, 1]) {
          const part = side < 0 ? 'wingL' : 'wingR';
          b.add(part, 'x', paint(at(scl(sph(0.05, 12, 8), 1, 0.45, 1), 0, 0.005, 0), GOLD));
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            b.add(part, 'x', paint(at(cyl(0.005, 0.005, 0.04, 4), Math.cos(a) * 0.045, -0.02, Math.sin(a) * 0.045), GOLD));
          }
        }
      }
      bassDrum(b, L);
      // mallets
      for (const side of [-1, 1]) {
        const part = side < 0 ? 'wingL' : 'wingR';
        const fix = (g: Geo) => holdFix(g, side, side < 0 ? lf : rf, side < 0 ? lr : rr).translate(0, -B.wingLen * 0.95, 0);
        const stick = cyl(0.008, 0.009, 0.2, 6);
        stick.rotateZ(Math.PI / 2);
        stick.translate(-side * 0.09, 0, 0.03);
        stick.rotateY(side * 0.35);
        b.add(part, 'g', paint(fix(stick), WOOD_D));
        const head = sph(0.036, 10, 8);
        head.translate(-side * 0.19, 0, 0.03);
        head.rotateY(side * 0.35);
        b.add(part, 'm', paint(fix(head), L >= 2 ? '#ffd75a' : '#f6ecd6'));
      }
      assembleBird(b, B, root);
      const instr = grp('instr', 0, 0.2, R * 0.86 + 0.085);
      b.into('drum', instr);
      instr.add(b.into('skin', grp('skin'), undefined, false));
      instr.add(grp('muzzle', 0, 0.2, 0));
      root.add(instr);
      break;
    }
    // ── Dona Badalo: old blue owl-bird, round glasses, shawl, hand bell(s) ──
    case 'bell': {
      const R0 = d.R, cy = d.leg + R0 * d.sy;
      const e = d.eye * R0, s = d.spread * R0, ey = cy + d.eyeUp * R0 * d.sy;
      const dirs = [-1, 1].map((sd) => new THREE.Vector3(sd * s, ey - cy, R0 * 0.9).normalize());
      const B = bird(b, d, { paint: bellyPaint(d.body, d.belly, { disc: { col: '#d6e5f8', dirs, k0: 0.9, k1: 0.965 } }) });
      const top = B.top;
      for (const sd of [-1, 1]) {
        const t = cone(0.05, 0.14, 6);
        t.translate(0, 0.07, 0);
        t.rotateZ(-sd * 0.42);
        t.rotateX(-0.12);
        t.translate(sd * 0.12, top - 0.05, 0.0);
        b.add('face', 'm', paint(t, (p) => _c.set('#3d6bb5').lerp(new THREE.Color('#9fc0ee'), smooth(top + 0.02, top + 0.12, p.y))));
        // glasses
        b.add('face', 'x', paint(at(torus(e * 1.42, 0.0065, 6, 24), sd * s, ey, B.eyeZ + e * 0.62), GOLD));
        const tm = cyl(0.005, 0.005, 0.14, 4);
        tm.rotateX(Math.PI / 2);
        tm.translate(sd * (s + e * 1.38), ey + 0.005, B.eyeZ - 0.05);
        b.add('face', 'x', paint(tm, GOLD));
      }
      b.add('face', 'x', paint(at(torus(s - e * 1.42, 0.006, 5, 10, Math.PI), 0, ey + e * 0.1, B.eyeZ + e * 0.66), GOLD));
      b.add('face', 'c', paint(at(scl(sph(e * 1.38, 14, 10), 1, 1, 0.12), -s, ey, B.eyeZ + e * 0.6), '#e8f4ff', 0.05));
      b.add('face', 'c', paint(at(scl(sph(e * 1.38, 14, 10), 1, 1, 0.12), s, ey, B.eyeZ + e * 0.6), '#e8f4ff', 0.05));
      // a crocheted shawl over the shoulders (open at the front)
      const prof = [
        new THREE.Vector2(R0 * 0.66, cy + R0 * d.sy * 0.66), new THREE.Vector2(R0 * 0.88, cy + R0 * d.sy * 0.42), new THREE.Vector2(R0 * 1.03, cy + R0 * d.sy * 0.14),
        new THREE.Vector2(R0 * 1.06, cy - R0 * d.sy * 0.08), new THREE.Vector2(R0 * 1.02, cy - R0 * d.sy * 0.2),
      ];
      const shawlA = new THREE.Color('#a983c9'), shawlB = new THREE.Color('#7d5aa6');
      b.add('body', 'd', paint(new THREE.LatheGeometry(prof, 30, 0.55, Math.PI * 2 - 1.1), (p) => _c.copy(shawlA).lerp(shawlB, smooth(cy, cy - R0 * 0.2, p.y) * 0.8)));
      for (let i = 0; i < 16; i++) {
        const a = 0.6 + (i / 15) * (Math.PI * 2 - 1.2);
        b.add('body', 'm', paint(at(sph(0.022, 8, 6), Math.sin(a) * R0 * 1.02, cy - R0 * d.sy * 0.21, Math.cos(a) * R0 * 1.02), shawlB));
      }
      if (L >= 1) b.add('body', 'x', paint(at(scl(sph(0.03, 10, 8), 1, 1, 0.5), 0, cy + R0 * d.sy * 0.42, B.egg.zAt(0, cy + R0 * d.sy * 0.42) + 0.01), GOLD, 0.2));
      const metal = L >= 2 ? '#f2c24a' : '#d29a46';
      handBell(b, 'wingR', 0.88 + L * 0.07, metal, (g) => holdFix(g, 1, rf, rr).translate(0, -B.wingLen * 0.98, 0));
      if (L >= 1) handBell(b, 'wingL', 0.76 + L * 0.06, metal, (g) => holdFix(g, -1, lf, lr).translate(0, -B.wingLen * 0.98, 0));
      assembleBird(b, B, root);
      if (L >= 2) {
        // a little belfry behind her with a big bell
        const fr = new Bins();
        for (const sx of [-1, 1]) fr.add('frame', 'g', paint(at(cyl(0.02, 0.026, 0.66, 8), sx * 0.21, 0.33, 0), WOOD_D));
        fr.add('frame', 'g', paint(at(box(0.52, 0.045, 0.06), 0, 0.665, 0), WOOD));
        fr.add('frame', 'm', paint(at(cone(0.34, 0.14, 4).rotateY(Math.PI / 4).scale(1, 1, 0.45), 0, 0.76, 0), '#c9473d'));
        const frame = fr.into('frame', grp('belfry', 0, 0, -0.3));
        root.add(frame);
        const bb = new Bins();
        handBell(bb, 'big', 1.9, '#f2c24a', (g) => g);
        frame.add(bb.into('big', grp('bigBell', 0, 0.64, 0)));
      }
      const instr = grp('instr');
      root.add(instr);
      root.getObjectByName('wingR')!.add(grp('muzzle', 0, -B.wingLen - 0.1, 0.05));
      break;
    }
    // ── Chocalho: sandy yellow, a striped scarf, desert goggles, two maracas ──
    case 'shaker': {
      const B = bird(b, d);
      const top = B.top, cy = B.egg.cy;
      const hS = cy + R * d.sy * 0.36, rS = B.egg.rAt(hS);
      const teal = new THREE.Color('#2aa39b'), cream = new THREE.Color('#f6ecd2'), fringe = new THREE.Color(L >= 1 ? GOLD : '#f6ecd2');
      b.add('body', 'm', paint(at(torus(rS + 0.012, 0.036, 8, 30).rotateX(Math.PI / 2), 0, hS, 0), (p) => (Math.floor((Math.atan2(p.z, p.x) + Math.PI) / 0.45) % 2 ? teal : cream)));
      for (const k of [0, 1]) {
        const strip = box(0.07, 0.24 - k * 0.05, 0.016);
        strip.translate(0, -(0.24 - k * 0.05) / 2, 0);
        strip.rotateZ((k ? -1 : 1) * 0.18);
        strip.translate((k ? 1 : -1) * 0.03, 0, -k * 0.01);
        b.add('scarf', 'd', paint(strip, (p) => (Math.floor(-p.y / 0.045) % 2 ? cream : teal)));
        for (let i = 0; i < 4; i++) b.add('scarf', 'm', paint(at(box(0.008, 0.03, 0.008), (k ? 1 : -1) * 0.03 + (k ? 1 : -1) * Math.sin(0.18) * (0.24 - k * 0.05) + (i - 1.5) * 0.016, -(0.24 - k * 0.05) - 0.012, -k * 0.01), fringe));
      }
      if (L < 2) {
        // goggles pushed up on the forehead
        const gy = top - 0.07, gz = B.egg.zAt(0, gy);
        b.add('face', 'm', paint(at(torus(B.egg.rAt(gy) + 0.006, 0.012, 5, 28).rotateX(Math.PI / 2 - 0.25), 0, gy - 0.005, -0.004), '#7a4e2a'));
        for (const sd of [-1, 1]) {
          const rim = cyl(0.042, 0.042, 0.026, 14);
          rim.rotateX(Math.PI / 2 - 0.5);
          rim.translate(sd * 0.055, gy + 0.012, gz - 0.008);
          b.add('face', 'm', paint(rim, '#8a5a32'));
          b.add('face', 'g', paint(at(scl(sph(0.034, 12, 8), 1, 1, 0.35), sd * 0.055, gy + 0.018, gz + 0.006).rotateX(0), '#ffc95a', 0.25));
        }
      } else {
        const hy = top - 0.04;
        const straw = new THREE.Color('#ecd27f');
        const st: Painter = (p) => _c.copy(straw).multiplyScalar(0.92 + 0.12 * Math.sin(Math.hypot(p.x, p.z) * 120));
        const hp = new THREE.Vector3(0, hy, 0);
        b.add('face', 'm', turnAbout(paint(at(cyl(0.22, 0.22, 0.012, 28), 0, hy, 0), st), hp, -0.08, 0, 0.1));
        b.add('face', 'm', turnAbout(paint(at(cyl(0.1, 0.115, 0.1, 20), 0, hy + 0.05, 0), st), hp, -0.08, 0, 0.1));
        b.add('face', 'm', turnAbout(paint(at(cyl(0.117, 0.117, 0.026, 20), 0, hy + 0.018, 0), '#d8403a'), hp, -0.08, 0, 0.1));
        b.add('face', 'm', turnAbout(paint(at(sph(0.03, 10, 8), 0.1, hy + 0.04, 0.05), '#ff7ab0'), hp, -0.08, 0, 0.1));
      }
      // maracas
      for (const side of [-1, 1]) {
        const part = side < 0 ? 'wingL' : 'wingR';
        const fix = (g: Geo) => holdFix(g, side, side < 0 ? lf : rf, side < 0 ? lr : rr).translate(0, -B.wingLen * 0.96, 0);
        const head = side < 0 ? (L >= 2 ? GOLD : '#e5534b') : L >= 2 ? GOLD : '#3aa6d8';
        const band = side < 0 ? (L >= 2 ? '#e5534b' : '#ffffff') : L >= 2 ? '#2aa39b' : '#ffd84a';
        const hc = new THREE.Color(head), bc = new THREE.Color(band);
        b.add(part, L >= 2 ? 'x' : 'g', fix(paint(at(ell(0.052, 0.064, 0.052, 14, 10), 0, 0.1, 0), (p) => (Math.abs(Math.sin(Math.atan2(p.z, p.x) * 4) * 0.02 - (p.y - 0.1)) < 0.013 ? bc : hc))));
        b.add(part, 'g', fix(paint(at(cyl(0.009, 0.012, 0.075, 6), 0, 0.03, 0), WOOD_D)));
        if (L >= 1) b.add(part, 'x', fix(paint(at(torus(0.014, 0.005, 5, 10).rotateX(Math.PI / 2), 0, 0.045, 0), GOLD)));
      }
      assembleBird(b, B, root);
      const scarf = b.into('scarf', grp('scarf', -rS * 0.45, hS, -rS * 0.82));
      scarf.rotation.set(0.35, -0.5, 0);
      root.add(scarf);
      root.add(grp('instr'));
      root.add(grp('muzzle', 0, B.egg.cy + 0.25, 0.15));
      break;
    }
    // ── Cristalina: lilac, lashes, a translucent crystal crest, a floating crystal ──
    case 'crystal': {
      const B = bird(b, d);
      const top = B.top, cy = B.egg.cy, e = B.e;
      for (const sd of [-1, 1]) {
        for (const a0 of [0.3, 0.75, 1.2]) {
          const a = sd > 0 ? a0 : Math.PI - a0;
          const l = capsule(0.0045, 0.03, 2, 4);
          l.translate(0, 0.016, 0);
          l.rotateZ(a - Math.PI / 2);
          l.translate(sd * B.s + Math.cos(a) * e * 0.95, B.eyeY + Math.sin(a) * e * 1.08, B.eyeZ + e * 0.2);
          b.add('face', 'm', paint(l, '#2a1640'));
        }
      }
      const n = 3 + L;
      const crA = new THREE.Color(L >= 2 ? '#fff1c4' : '#d9f2ff'), crB = new THREE.Color(L >= 2 ? '#ffc94a' : '#b98cff');
      for (let i = 0; i < n; i++) {
        const u = n > 1 ? i / (n - 1) - 0.5 : 0;
        const h = (0.2 + L * 0.025) * (1 - Math.abs(u) * 0.8);
        const w = 0.034 * (1 - Math.abs(u) * 0.5);
        const prism = cyl(w, w, h * 0.62, 6);
        prism.translate(0, h * 0.31, 0);
        const tip = cone(w, h * 0.38, 6);
        tip.translate(0, h * 0.62 + h * 0.19, 0);
        const foot = cone(w, 0.03, 6).rotateX(Math.PI).translate(0, -0.015, 0);
        const sh = merge([prism, tip, foot].map((g) => paint(g, (p) => _c.copy(crB).lerp(crA, clamp01(p.y / h)), 0.9)));
        glowBy(sh, (p) => 0.25 + 1.1 * clamp01(p.y / h));
        sh.rotateZ(-u * 1.25);
        sh.rotateX(-0.22);
        sh.translate(0, top - 0.035, -0.04);
        b.add('crest', 'c', sh);
        if (L >= 1) b.add('crest', 'x', paint(at(torus(w * 1.05, 0.006, 5, 8).rotateX(Math.PI / 2), 0, 0.012, 0).rotateZ(-u * 1.25).rotateX(-0.22).translate(0, top - 0.035, -0.04), GOLD));
      }
      const ny = cy + R * d.sy * 0.45;
      b.add('body', 'x', paint(at(torus(B.egg.rAt(ny) + 0.004, 0.006, 5, 28).rotateX(Math.PI / 2 + 0.25), 0, ny - 0.02, 0), GOLD));
      b.add('body', 'c', paint(at(new THREE.OctahedronGeometry(0.022, 0).scale(1, 1.5, 1), 0, ny - 0.075, B.egg.zAt(0, ny - 0.075) + 0.018), '#e0c8ff', 0.6));
      // the floating crystal
      const cc = new THREE.Color(L >= 2 ? '#fff4d6' : '#c9a0ff');
      const cry = merge([paint(at(cone(0.075 + L * 0.008, 0.14 + L * 0.02, 6), 0, (0.14 + L * 0.02) / 2, 0), cc, 0.8), paint(at(cone(0.075 + L * 0.008, 0.09, 6).rotateX(Math.PI), 0, -0.045, 0), cc, 0.8)]);
      b.add('cry', 'c', cry);
      if (L >= 1) {
        for (let i = 0; i < L; i++) b.add('orbit', 'x', paint(at(torus(0.13 + i * 0.03, 0.006, 5, 36).rotateX(Math.PI / 2 + 0.5 - i), 0, 0.02, 0), GOLD));
        for (let i = 0; i < L; i++) b.add('orbit', 'c', paint(at(new THREE.OctahedronGeometry(0.022, 0).scale(1, 1.5, 1), Math.cos(i * Math.PI) * 0.15, 0.02, Math.sin(i * Math.PI) * 0.15), '#f2e2ff', 0.8));
      }
      assembleBird(b, B, root);
      root.getObjectByName('head')!.add(b.into('crest', grp('crest'), new THREE.Vector3(0, cy, 0), false));
      const instr = grp('instr', 0, cy + 0.03, R + 0.15);
      const cg = b.into('cry', grp('crystal'), undefined, false);
      instr.add(cg);
      if (L >= 1) instr.add(b.into('orbit', grp('orbit'), undefined, false));
      instr.add(grp('muzzle'));
      root.add(instr);
      break;
    }
    // ── Trompa: fluffy white, knitted striped hat with a pom-pom, a big brass horn ──
    case 'horn': {
      const B = bird(b, d);
      const top = B.top, cy = B.egg.cy;
      // fluff all around (not on the face, not under the hat)
      const N = 34;
      for (let i = 0; i < N; i++) {
        const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996;
        const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        if (dir.y > 0.42 || (dir.z > 0.45 && Math.abs(dir.x) < 0.75 && dir.y > -0.55)) continue;
        const { p, n } = B.egg.at(dir.x, dir.y, dir.z);
        const rr = R * (0.2 + 0.06 * Math.sin(i * 7.1));
        b.add('body', 'm', paint(at(sph(rr, 10, 8), p.x - n.x * rr * 0.55, p.y - n.y * rr * 0.55, p.z - n.z * rr * 0.55), i % 3 ? '#f3efe5' : '#e8e2d4'));
      }
      // knitted beanie
      const capA = 1.12;
      const red = new THREE.Color(L >= 2 ? GOLD : '#d8453e'), crm = new THREE.Color('#f3ead8');
      const cap = new THREE.SphereGeometry(R * 1.05, 26, 12, 0, Math.PI * 2, 0, capA).scale(1, d.sy, 0.99).translate(0, cy, 0);
      b.add('face', 'm', paint(cap, (p) => (Math.floor((p.y - cy) / 0.045) % 2 ? red : crm)));
      const brimY = cy + R * 1.05 * d.sy * Math.cos(capA), brimR = R * 1.05 * Math.sin(capA);
      b.add('face', 'm', paint(at(torus(brimR, 0.032, 6, 32).rotateX(Math.PI / 2), 0, brimY, 0), (p) => _c.copy(crm).multiplyScalar(0.86 + 0.14 * Math.abs(Math.sin(Math.atan2(p.z, p.x) * 18)))));
      const pom: Geo[] = [paint(at(sph(0.068, 12, 10), 0, top + 0.05, 0), L >= 2 ? GOLD : '#f6efe0')];
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        pom.push(paint(at(sph(0.032, 8, 6), Math.cos(a) * 0.05, top + 0.05 + Math.sin(i * 1.7) * 0.04, Math.sin(a) * 0.05), i % 2 ? (L >= 2 ? GOLD : '#f6efe0') : '#d8453e'));
      }
      b.add('face', 'm', ...pom);
      // the horn: a coil at the chest, the bell flaring forward and up
      const brass = L >= 2 ? '#f6c84a' : '#e0a636';
      const hornB = new Bins();
      hornB.add('horn', 'x', paint(torus(0.085, 0.019, 8, 30), brass));
      hornB.add('horn', 'x', paint(at(torus(0.06, 0.012, 6, 24), 0, 0, 0.005), shade(brass, 0.85)));
      const prof: THREE.Vector2[] = [];
      const bellR = 0.105 + L * 0.015;
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        prof.push(new THREE.Vector2(0.019 + bellR * Math.pow(t, 3.4), t * 0.3));
      }
      const bell = new THREE.LatheGeometry(prof, 26);
      const bellRot = new THREE.Euler(-0.2, 0.7, 0, 'YXZ');
      bell.rotateX(Math.PI / 2);
      bell.applyQuaternion(new THREE.Quaternion().setFromEuler(bellRot));
      bell.translate(0.08, 0.0, 0.0);
      hornB.add('horn', 'x', paint(bell, brass));
      const mouth = new THREE.Vector3(0, 0, 0.3).applyEuler(bellRot);
      const disc = new THREE.CircleGeometry(bellR * 0.7, 20);
      place(disc, new THREE.Vector3(0.08, 0.0, 0).addScaledVector(mouth, 0.8), mouth.clone().normalize());
      hornB.add('hornGlow', 'f', paint(disc, '#7a5418', 1.6));
      const mp = cyl(0.008, 0.008, 0.12, 6);
      mp.rotateX(0.9);
      mp.translate(0, 0.11, 0.03);
      hornB.add('horn', 'x', paint(mp, brass));
      if (L >= 1) {
        const ban = box(0.15, 0.1, 0.004);
        ban.translate(0.16, -0.1, 0.12);
        hornB.add('horn', 'd', paint(ban, (p) => (p.y < -0.13 ? new THREE.Color(GOLD) : new THREE.Color('#c9383d'))));
        hornB.add('horn', 'x', paint(at(scl(sph(0.018, 8, 6), 1, 0.8, 0.4), 0.16, -0.095, 0.124), GOLD, 0.3));
      }
      assembleBird(b, B, root);
      const instr = grp('instr', 0.04, cy - 0.11, R * 0.86);
      const horn = hornB.into('horn', grp('horn'));
      horn.add(hornB.into('hornGlow', grp('hornGlow'), undefined, false));
      horn.add(grp('muzzle', 0.08 + mouth.x, mouth.y, mouth.z));
      instr.add(horn);
      root.add(instr);
      break;
    }
    // ── the Coralitos: three tiny pink chicks on a little riser ──
    case 'choir': {
      const riser = L >= 2 ? '#f2c24a' : L >= 1 ? '#f4eee2' : '#b98652';
      const xs = [-0.16, 0, 0.16], hs = [0.05, 0.1, 0.05];
      const rz = new Bins();
      for (let i = 0; i < 3; i++) {
        rz.add('riser', L >= 2 ? 'x' : 'm', paint(at(box(0.155, hs[i], 0.19), xs[i], hs[i] / 2, 0), riser));
        if (L >= 1) rz.add('riser', 'x', paint(at(box(0.158, 0.012, 0.193), xs[i], hs[i] - 0.004, 0), GOLD));
      }
      root.add(rz.into('riser', grp('instr')));
      for (let i = 0; i < 3; i++) {
        const cb = new Bins();
        const dd = { ...d, R: i === 1 ? 0.125 : 0.108 };
        const B = bird(cb, dd, { wings: false, lowBeak: true });
        const r = dd.R, cy = B.egg.cy, top = B.top;
        for (const sd of [-1, 1]) {
          const w = ell(r * 0.13, r * 0.38, r * 0.26, 10, 8);
          w.rotateZ(sd * 0.35);
          w.translate(sd * r * 0.92, cy - r * 0.05, 0);
          cb.add('body', 'm', paint(w, shade(dd.body, 0.86)));
        }
        if (i === 0) cb.add('face', 'm', paint(at(torus(r * 0.16, r * 0.05, 6, 14, Math.PI * 1.4).rotateY(Math.PI / 2).rotateX(0.3), 0, top + r * 0.1, -r * 0.05), shade(dd.body, 0.7)));
        if (i === 1) for (const a of [-0.45, 0, 0.45]) cb.add('face', 'm', paint(at(cone(r * 0.09, r * 0.32, 6).translate(0, r * 0.16, 0).rotateZ(a), 0, top - r * 0.06, 0), shade(dd.body, 0.72)));
        if (i === 2) {
          for (const sd of [-1, 1]) cb.add('face', 'm', paint(at(cone(r * 0.12, r * 0.24, 6).rotateZ(sd * Math.PI / 2), sd * r * 0.13, top + r * 0.04, r * 0.1), '#e2445a'));
          cb.add('face', 'm', paint(at(sph(r * 0.07, 8, 6), 0, top + r * 0.04, r * 0.1), '#c2304a'));
        }
        if (L >= 1) {
          const ny = cy - r * 0.42;
          for (let k = 0; k < 14; k++) {
            const a = (k / 14) * Math.PI * 2;
            const rr = B.egg.rAt(ny) + r * 0.04;
            cb.add('body', 'm', paint(at(sph(r * 0.11, 6, 5), Math.cos(a) * rr, ny + (k % 2) * r * 0.04, Math.sin(a) * rr), '#ffffff'));
          }
        }
        if (L >= 2) {
          const prof = [new THREE.Vector2(r * 0.95, cy - r * 0.3), new THREE.Vector2(r * 1.08, cy - r * 0.7), new THREE.Vector2(r * 1.16, dd.leg + r * 0.05)];
          cb.add('body', 'd', paint(new THREE.LatheGeometry(prof, 20), (p) => (p.y < dd.leg + r * 0.18 ? new THREE.Color(GOLD) : new THREE.Color('#ff6fa8'))));
        }
        const chick = grp(`chick${i}`, xs[i], hs[i], i === 1 ? -0.02 : 0.02);
        assembleBird(cb, B, chick);
        root.add(chick);
      }
      if (L >= 2) {
        const hb = new Bins();
        hb.add('halo', 'f', paint(torus(0.2, 0.012, 6, 40).rotateX(Math.PI / 2), '#ffe08a', 1));
        root.add(hb.into('halo', grp('halo', 0, 0.52, 0), undefined, false));
      }
      root.add(grp('muzzle', 0, 0.42, 0.05));
      break;
    }
    // ── Grave: huge purple, top hat and bow tie, an upright double bass ──
    case 'bass': {
      const B = bird(b, d);
      const top = B.top, cy = B.egg.cy;
      const hy = top - R * 0.17, hp = new THREE.Vector3(0, hy, 0);
      const band = L >= 2 ? GOLD : '#8b5bd6';
      const hat = [
        paint(at(cyl(0.126, 0.114, 0.25, 22), 0, hy + 0.125, 0), (p) => _c.set('#241e2e').multiplyScalar(0.8 + 0.4 * clamp01((p.y - hy) / 0.25))),
        paint(at(cyl(0.128, 0.128, 0.048, 22), 0, hy + 0.04, 0), band),
        paint(at(cyl(0.21, 0.21, 0.016, 28), 0, hy + 0.008, 0), '#1d1824'),
        paint(at(torus(0.205, 0.012, 6, 32).rotateX(Math.PI / 2), 0, hy + 0.016, 0), '#1d1824'),
        paint(at(scl(sph(0.026, 10, 8), 1, 1.3, 0.4), 0.05, hy + 0.05, 0.12), GOLD, 0.25),
      ];
      for (const g of hat) b.add('face', 'm', turnAbout(g, hp, -0.06, 0, -0.13));
      const by = cy - R * d.sy * 0.3, bz = B.egg.zAt(0, by) + 0.004;
      for (const sd of [-1, 1]) {
        const w = cone(0.05, 0.085, 3);
        w.rotateY(Math.PI / 6);
        w.rotateZ(sd * Math.PI / 2);
        w.scale(1, 1, 0.45);
        w.translate(sd * 0.048, by, bz);
        b.add('body', 'g', paint(w, '#9a1f33'));
      }
      b.add('body', 'g', paint(at(scl(sph(0.024, 10, 8), 1, 1, 0.7), 0, by, bz + 0.008), '#6e1424'));
      if (L >= 1) {
        b.add('face', 'x', paint(at(torus(B.e * 1.4, 0.0065, 6, 22), B.s, B.eyeY, B.eyeZ + B.e * 0.6), GOLD));
        const ch = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(B.s + B.e * 1.3, B.eyeY - B.e * 0.4, B.eyeZ + B.e * 0.5), new THREE.Vector3(B.s + B.e * 1.6, B.eyeY - 0.12, B.eyeZ), new THREE.Vector3(R * 0.82, cy - 0.02, R * 0.45)]), 10, 0.003, 4);
        b.add('face', 'x', paint(ch, GOLD));
      }
      if (L >= 2) {
        const prof = [new THREE.Vector2(R * 0.86, cy + R * 0.55), new THREE.Vector2(R * 1.08, cy), new THREE.Vector2(R * 1.25, 0.03)];
        b.add('body', 'd', paint(new THREE.LatheGeometry(prof, 26, Math.PI / 2 + 0.25, Math.PI - 0.5), (p) => (p.y < 0.07 ? new THREE.Color(GOLD) : new THREE.Color('#40246e'))));
      }
      doubleBass(b, L);
      // the bow, in the right wing
      const fix = (g: Geo) => holdFix(g, 1, rf, rr).translate(0, -B.wingLen * 0.95, 0);
      const stick = cyl(0.006, 0.006, 0.38, 5);
      stick.rotateZ(Math.PI / 2);
      stick.translate(-0.15, 0, 0.0);
      b.add('wingR', 'g', paint(fix(stick), '#4a2a18'));
      b.add('wingR', 'm', paint(fix(at(box(0.34, 0.012, 0.004), -0.15, -0.02, 0)), '#f4efe2'));
      b.add('wingR', 'g', paint(fix(at(box(0.035, 0.03, 0.018), 0.02, -0.012, 0)), '#1b1418'));
      assembleBird(b, B, root);
      const instr = grp('instr', -0.34, 0, 0.13);
      instr.rotation.set(0, 0.5, -0.1);
      b.into('bass', instr);
      instr.add(b.into('bstrings', grp('bstrings'), undefined, false));
      instr.add(grp('muzzle', 0, 0.35, 0.1));
      root.add(instr);
      break;
    }
  }
  return root;
}

// ───────────────────────────── the musician ─────────────────────────────

/** gestures per beat in the 'play' pose */
const RATE: Record<TowerKind, number> = { harp: 2, drum: 1, bell: 0.5, shaker: 2, crystal: 1, horn: 0.5, choir: 0.5, bass: 0.5 };
/** gesture length (s) */
const DUR: Record<TowerKind, number> = { harp: 0.3, drum: 0.32, bell: 0.62, shaker: 0.44, crystal: 0.42, horn: 0.66, choir: 0.78, bass: 0.95 };

interface Params {
  lift: number;
  lean: number;
  tilt: number;
  turn: number;
  sq: number;
  lf: number;
  lr: number;
  rf: number;
  rr: number;
  lid: number;
  eyeS: number;
  nod: number;
  htilt: number;
}
const ZERO: Params = { lift: 0, lean: 0, tilt: 0, turn: 0, sq: 1, lf: 0, lr: 0, rf: 0, rr: 0, lid: 0, eyeS: 1, nod: 0, htilt: 0 };

/** a quick attack then a slower release, 0..1 over g in 0..1 */
const strike = (g: number) => (g < 0 || g > 1 ? 0 : g < 0.2 ? g / 0.2 : 1 - (g - 0.2) / 0.8);
const bump = (g: number) => (g < 0 || g > 1 ? 0 : Math.sin(Math.PI * g));

let seedN = 0;

interface Nodes {
  rig: THREE.Object3D;
  head?: THREE.Object3D;
  eyes?: THREE.Object3D;
  lids?: THREE.Object3D;
  happy?: THREE.Object3D;
  squeeze?: THREE.Object3D;
  dizzyL?: THREE.Object3D;
  dizzyR?: THREE.Object3D;
  stitch?: THREE.Object3D;
  wingL?: THREE.Object3D;
  wingR?: THREE.Object3D;
  instr?: THREE.Object3D;
  muzzle: THREE.Object3D;
  x: Record<string, THREE.Object3D>;
  chicks: { root: THREE.Object3D; head: THREE.Object3D; eyes: THREE.Object3D; lids: THREE.Object3D; happy: THREE.Object3D; squeeze: THREE.Object3D; dizzyL: THREE.Object3D; dizzyR: THREE.Object3D; beak: THREE.Object3D; stitch: THREE.Object3D }[];
}

export class MusicianView {
  readonly group = new THREE.Group();
  pose: MusicianPose = 'idle';
  mood: MusicianMood = 'normal';
  level: number;
  /** the whole character's materials (one set per musician) */
  readonly mats: CharMats;
  private n!: Nodes;
  private height = 1;
  private frozen = 0;
  private ink = 0;
  private hit = 0;
  private gest = 9;
  private side = 1;
  private at = 0;
  private seed: number;
  private P: Params = { ...ZERO };
  private blinkT = 0;
  private nextBlink = 2;
  private lastStep: number | null = null;
  private grey = 0;
  private readonly wp = new THREE.Vector3();
  private readonly ws = new THREE.Vector3();

  constructor(readonly kind: TowerKind, opts: { scale?: number; level?: number } = {}) {
    this.level = opts.level ?? 0;
    this.seed = (seedN++ * 1.618) % 7;
    this.mats = new CharMats('#fff1d6', 0.16);
    this.build();
    this.group.scale.setScalar(opts.scale ?? 1);
    this.P.lid = BIRD[kind].lid;
  }

  private build() {
    if (this.n) this.group.remove(this.n.rig);
    const tpl = template(this.kind, this.level);
    const rig = tpl.root.clone(true);
    this.height = tpl.height;
    this.mats.apply(rig);
    const f = (name: string) => rig.getObjectByName(name) ?? undefined;
    const x: Record<string, THREE.Object3D> = {};
    for (const k of ['leaf', 'strings', 'skin', 'scarf', 'crest', 'crystal', 'orbit', 'horn', 'hornGlow', 'halo', 'bstrings', 'bigBell', 'belfry']) {
      const o = f(k);
      if (o) x[k] = o;
    }
    const chicks: Nodes['chicks'] = [];
    for (let i = 0; i < 3; i++) {
      const c = f(`chick${i}`);
      if (!c) break;
      const g = (n: string) => c.getObjectByName(n)!;
      chicks.push({ root: c, head: g('head'), eyes: g('eyes'), lids: g('lids'), happy: g('happy'), squeeze: g('squeeze'), dizzyL: g('dizzyL'), dizzyR: g('dizzyR'), beak: g('beakLow'), stitch: g('stitch') });
    }
    const one = (name: string) => (chicks.length ? undefined : f(name));
    this.n = {
      rig, head: one('head'), eyes: one('eyes'), lids: one('lids'), happy: one('happy'), squeeze: one('squeeze'), dizzyL: one('dizzyL'), dizzyR: one('dizzyR'), stitch: one('stitch'),
      wingL: f('wingL'), wingR: f('wingR'), instr: chicks.length ? undefined : f('instr'), muzzle: f('muzzle') ?? rig, x, chicks,
    };
    for (const o of Object.values(x)) o.userData.rest = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
    if (this.n.instr) this.n.instr.userData.rest = { p: this.n.instr.position.clone(), r: this.n.instr.rotation.clone(), s: this.n.instr.scale.clone() };
    for (const c of chicks) c.root.userData.rest = { p: c.root.position.clone() };
    this.group.add(rig);
  }

  /** where its notes leave from (instrument) */
  get muzzle(): THREE.Object3D {
    return this.n.muzzle;
  }

  /** model height at scale 1 (hat included) */
  get size(): number {
    return this.height;
  }

  /** a note/hit on the beat: a quick strike/pluck/blow gesture */
  play(strength = 1): void {
    if (this.frozen > 0.6) return;
    this.hit = Math.min(1.2, strength);
    this.gest = 0;
    this.side = -this.side;
  }

  /** 0 alive … 1 grey stone statue (rescue scenes); the colour comes back from the head down */
  setFrozen(k: number): void {
    this.frozen = clamp01(k);
    this.mats.u.uStone.value = this.frozen;
  }

  /** towers: 0 … 2 (bigger, golden instrument, costume details) */
  setLevel(l: number): void {
    if (l === this.level) return;
    this.level = l;
    this.build();
  }

  setMood(m: MusicianMood): void {
    this.mood = m;
  }

  /** 0 … 1: a shadow copy made of ink (the Mimic), with glowing blank eyes and a stitched beak */
  setInk(k: number): void {
    this.ink = clamp01(k);
    this.mats.u.uInk.value = this.ink;
    this.mats.u.uRim.value.set('#fff1d6').multiplyScalar(0.16).lerp(new THREE.Color('#8a6aff').multiplyScalar(0.35), this.ink);
  }

  dispose(): void {
    this.mats.dispose();
  }

  update(dt: number, _t: number, beat: number): void {
    const live = 1 - smooth(0.05, 0.35, this.frozen);
    const adt = dt * live;
    this.at += adt;
    const t = this.at + this.seed;
    const kind = this.kind;
    const mood = this.mood;
    // the 'play' pose plays by itself on the beat
    if (this.pose === 'play' && live > 0.5 && mood === 'normal') {
      const step = Math.floor(beat * RATE[kind] + 1e-4);
      if (step !== this.lastStep) {
        if (this.lastStep !== null) this.play(0.8);
        this.lastStep = step;
      }
    } else this.lastStep = null;
    this.gest += adt;
    this.hit = Math.max(0, this.hit - adt * 0.6);
    const bp = beat - Math.floor(beat);
    const pulse = Math.exp(-bp * 6) * live;
    const beatS = Math.abs(Math.sin(beat * Math.PI)) * live;
    const d = BIRD[kind];
    const [hlf, hlr, hrf, hrr] = holdFor(kind, this.level);
    // ── pose targets (eased) ──
    const T: Params = { ...ZERO, lf: hlf, lr: hlr, rf: hrf, rr: hrr, lid: d.lid };
    // ── direct motion (not eased) ──
    const M: Params = { ...ZERO, sq: 0 };
    let happy = false, squeeze = false, dizzy = false;
    let grey = 0;
    let instrDrop = 0;
    const pose = this.pose;
    if (mood === 'muted') {
      T.lf = 0.25;
      T.rf = 0.25;
      T.lr = 2.45;
      T.rr = 2.45;
      T.lean = -0.06;
      T.lid = 0;
      squeeze = true;
      grey = 0.5;
      M.tilt = Math.sin(t * 31) * 0.02;
      M.nod = Math.sin(t * 2.2) * 0.05;
    } else if (mood === 'disabled') {
      T.lf = 0.1;
      T.rf = 0.1;
      T.lr = -0.05;
      T.rr = -0.05;
      T.lean = 0.32;
      T.tilt = 0.16;
      T.lift = -0.025;
      T.sq = 0.94;
      T.nod = 0.15;
      dizzy = true;
      grey = 0.82;
      instrDrop = 1;
    } else {
      switch (pose) {
        case 'idle':
        case 'play':
          this.personality(T, M, t, beat, beatS, pulse);
          if (pose === 'play') M.lift += beatS * 0.015;
          break;
        case 'cheer':
          T.lf = 0.2;
          T.rf = 0.2;
          T.lr = 2.55;
          T.rr = 2.55;
          M.lr = Math.sin(t * 10) * 0.25;
          M.rr = -Math.sin(t * 10) * 0.25;
          M.lift = beatS * 0.12;
          happy = true;
          break;
        case 'wave':
          T.rf = 0.3;
          T.rr = 2.3;
          M.rr = Math.sin(t * 9) * 0.35;
          T.tilt = -0.08;
          happy = Math.sin(t * 1.3) > -0.6;
          break;
        case 'sleep':
          T.lf = 0.05;
          T.rf = 0.05;
          T.lr = 0.02;
          T.rr = 0.02;
          T.lid = 1;
          T.lean = 0.24;
          T.tilt = 0.12;
          T.nod = 0.18;
          M.sq = Math.sin(t * 1.4) * 0.025;
          instrDrop = 0.5;
          break;
        case 'scared':
          T.lf = 0.75;
          T.rf = 0.75;
          T.lr = 2.05;
          T.rr = 2.05;
          T.lean = -0.16;
          T.eyeS = 1.3;
          T.lid = 0;
          M.tilt = Math.sin(t * 38) * 0.03;
          M.turn = Math.sin(t * 27) * 0.03;
          break;
        case 'bow':
          T.lean = 0.58;
          T.rf = 1.0;
          T.rr = -0.55;
          T.lf = -0.5;
          T.lr = 0.55;
          T.lid = 0.85;
          T.nod = 0.1;
          break;
        case 'jump':
          M.lift = beatS * 0.26;
          T.lr = 1.2;
          T.rr = 1.2;
          M.lr = Math.sin(t * 16) * 0.6;
          M.rr = Math.sin(t * 16) * 0.6;
          M.sq = (1 - beatS) * -0.06 + beatS * 0.05;
          happy = beatS > 0.3;
          break;
      }
    }
    // ── the instrument gesture ──
    const g = this.gest / DUR[kind];
    const s = this.hit;
    let flash = 0;
    if (g < 1 && mood === 'normal') flash = this.gesture(M, g, s, t);
    // ── ease and apply ──
    const k = 1 - Math.exp(-12 * dt);
    const P = this.P;
    for (const key of Object.keys(P) as (keyof Params)[]) P[key] += (T[key] - P[key]) * k;
    const n = this.n;
    const rig = n.rig;
    rig.position.y = P.lift + M.lift;
    rig.rotation.set(P.lean + M.lean, P.turn + M.turn, P.tilt + M.tilt);
    const sq = P.sq + M.sq;
    const sxz = 1 + (1 - sq) * 0.5;
    rig.scale.set(sxz, sq, sxz);
    if (n.head) n.head.rotation.set(P.nod + M.nod, 0, P.htilt + M.htilt);
    if (n.wingL) n.wingL.rotation.set(-(P.lf + M.lf), 0, -(WING_REST + P.lr + M.lr));
    if (n.wingR) n.wingR.rotation.set(-(P.rf + M.rf), 0, WING_REST + P.rr + M.rr);
    // eyes
    this.nextBlink -= adt;
    if (this.nextBlink < 0) {
      this.blinkT = 0.13;
      this.nextBlink = 1.6 + ((this.seed * 13.7 + this.at * 3.1) % 3.4);
    }
    if (this.blinkT > 0) this.blinkT -= adt;
    const lid = Math.max(clamp01(P.lid + M.lid), this.blinkT > 0 ? 1 : 0);
    const inkEyes = this.ink > 0.5;
    const setEyes = (e: { eyes?: THREE.Object3D; lids?: THREE.Object3D; happy?: THREE.Object3D; squeeze?: THREE.Object3D; dizzyL?: THREE.Object3D; dizzyR?: THREE.Object3D; stitch?: THREE.Object3D }, hap: boolean, l: number) => {
      const alt = hap || squeeze || dizzy;
      if (e.eyes) {
        e.eyes.visible = !alt;
        e.eyes.scale.setScalar(P.eyeS);
      }
      if (e.lids) {
        e.lids.visible = !alt;
        e.lids.rotation.x = -1.75 + (inkEyes ? Math.min(l, 0.35) : l) * 3.2;
      }
      if (e.happy) e.happy.visible = hap && !squeeze && !dizzy;
      if (e.squeeze) e.squeeze.visible = squeeze;
      if (e.dizzyL) {
        e.dizzyL.visible = dizzy;
        e.dizzyL.rotation.z = -t * 5;
      }
      if (e.dizzyR) {
        e.dizzyR.visible = dizzy;
        e.dizzyR.rotation.z = t * 5;
      }
      if (e.stitch) e.stitch.visible = inkEyes;
    };
    setEyes(n, happy, lid);
    // kind-specific parts
    const x = n.x;
    const rest = (o: THREE.Object3D) => o.userData.rest as { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 };
    if (n.instr && n.instr.userData.rest) {
      const r = rest(n.instr);
      this.instrDrop = THREE.MathUtils.lerp(this.instrDrop, instrDrop, k);
      n.instr.rotation.set(r.r.x + this.instrDrop * 0.12, r.r.y, r.r.z + this.instrDrop * (kind === 'bass' ? -0.25 : 0.3));
    }
    if (x.leaf) {
      const r = rest(x.leaf);
      const droop = mood !== 'normal' || pose === 'sleep' ? 0.9 : pose === 'scared' ? -0.3 : 0;
      x.leaf.rotation.set(r.r.x + droop * 0.6 + Math.sin(t * 2.1) * 0.06, 0, r.r.z + droop * 0.5 + Math.sin(t * 1.7) * 0.1 + (happy ? Math.sin(t * 12) * 0.2 : 0));
    }
    if (x.scarf) {
      const r = rest(x.scarf);
      x.scarf.rotation.set(r.r.x + 0.15 + Math.sin(t * 3.1) * 0.15 + beatS * 0.1, r.r.y, Math.sin(t * 2.3) * 0.18);
    }
    if (x.crest) x.crest.position.y = Math.sin(t * 2) * 0.004;
    if (x.crystal) {
      const r = rest(x.crystal);
      x.crystal.position.y = r.p.y + Math.sin(t * 1.9) * 0.02 - this.instrDrop * 0.08;
      x.crystal.rotation.y = t * 0.9 + (g < 1 ? bump(g) * 3 : 0);
    }
    if (x.orbit) x.orbit.rotation.y = t * 1.8;
    if (x.halo) {
      x.halo.rotation.y = t * 0.6;
      x.halo.position.y = 0.52 + Math.sin(t * 1.5) * 0.015;
    }
    // chicks (the choir)
    n.chicks.forEach((c, i) => {
      const rp = c.root.userData.rest.p as THREE.Vector3;
      const gi = clamp01((g - i * 0.12) / 0.62);
      const sing = mood === 'normal' && g < 1 ? bump(gi) * s : 0;
      let lift = 0, tl = Math.sin(t * 2.2 + i * 0.7) * 0.08, sy = 1 + sing * 0.14 + Math.sin(t * 2.2 + i) * 0.01, lean = 0;
      if (mood === 'disabled') {
        lean = 0.3;
        tl = 0.2 * (i - 1);
      }
      if (mood === 'muted') tl = Math.sin(t * 31 + i) * 0.03;
      if (pose === 'cheer' || pose === 'jump') lift = Math.abs(Math.sin(beat * Math.PI + i * 0.9)) * (pose === 'jump' ? 0.12 : 0.07) * live;
      if (pose === 'bow') lean = 0.5;
      if (pose === 'sleep') {
        lean = 0.2;
        tl = (i - 1) * 0.2;
      }
      c.root.position.set(rp.x, rp.y + lift + (pose === 'idle' || pose === 'play' ? Math.abs(Math.sin(beat * Math.PI + i * 2.1)) * 0.012 * live : 0), rp.z);
      c.root.rotation.set(lean, Math.sin(t * 0.9 + i * 2) * 0.12, tl);
      c.root.scale.set(1, sy, 1);
      c.beak.rotation.x = sing * 0.75 + (happy ? 0.35 : 0);
      setEyes(c, happy || sing > 0.3, pose === 'sleep' ? 1 : this.blinkT > 0 && i === Math.floor(this.at) % 3 ? 1 : 0);
    });
    // ── colour state ──
    this.grey = THREE.MathUtils.lerp(this.grey, grey, 1 - Math.exp(-5 * dt));
    this.mats.u.uGrey.value = this.grey;
    this.mats.flashK.value = (0.35 + flash) * (1 - this.grey * 0.7);
    if (this.frozen > 0.001) {
      this.group.updateWorldMatrix(true, false);
      this.group.getWorldPosition(this.wp);
      this.group.getWorldScale(this.ws);
      const H = this.height * this.ws.y;
      this.mats.u.uStoneLine.value = this.wp.y + H * (this.frozen * 1.22 - 0.1);
      this.mats.u.uStoneBand.value = H * 0.045;
    }
  }
  private instrDrop = 0;

  /** idle personality of each musician */
  private personality(T: Params, M: Params, t: number, beat: number, beatS: number, pulse: number) {
    switch (this.kind) {
      case 'harp': {
        M.tilt = Math.sin(t * 1.1) * 0.05;
        M.nod = Math.sin(t * 0.7) * 0.06 + 0.05;
        // now and then she peeks out from behind the harp
        const peek = smooth(0.75, 0.95, Math.sin(t * 0.45 + 1));
        T.turn = -0.25 * peek;
        T.htilt = 0.18 * peek;
        if (this.pose === 'play') {
          T.rf = 0.75;
          T.rr = 0.12;
          T.lr = -0.2;
        }
        break;
      }
      case 'drum':
        M.lift = beatS * 0.035;
        M.tilt = Math.sin(beat * Math.PI) * 0.07;
        T.lean = -0.06;
        break;
      case 'bell':
        T.lean = 0.12;
        M.nod = Math.sin(t * 0.9) * 0.07;
        M.htilt = Math.sin(t * 0.5) * 0.06;
        break;
      case 'shaker':
        M.lift = beatS * 0.04;
        M.turn = Math.sin(beat * Math.PI) * 0.28;
        M.lf = Math.sin(t * 13) * 0.06;
        M.rf = -Math.sin(t * 13) * 0.06;
        break;
      case 'crystal':
        M.turn = Math.sin(t * 0.6) * 0.2;
        M.lift = 0.012 + Math.sin(t * 1.6) * 0.012;
        M.htilt = Math.sin(t * 0.8) * 0.08;
        break;
      case 'horn':
        M.sq = pulse * 0.05;
        M.htilt = Math.sin(t * 1.3) * 0.1;
        break;
      case 'choir':
        break;
      case 'bass':
        M.tilt = Math.sin(t * 0.55) * 0.04;
        M.sq = Math.sin(t * 1.2) * 0.012;
        M.nod = Math.sin(t * 0.55) * 0.03;
        break;
    }
    void T;
  }

  /** the playing gesture of each instrument; returns the flash of glowing parts */
  private gesture(M: Params, g: number, s: number, t: number): number {
    const x = this.n.x;
    switch (this.kind) {
      case 'harp': {
        const e = strike(g) * s;
        M.rf += 0.5 * e;
        M.rr -= 0.4 * e;
        M.lean += 0.06 * e;
        if (x.strings) x.strings.position.x = Math.sin(t * 90) * 0.004 * e;
        return 2.6 * e;
      }
      case 'drum': {
        const e = strike(g) * s;
        if (this.side > 0) M.rr -= 0.6 * e;
        else M.lr -= 0.6 * e;
        M.sq -= 0.04 * e;
        const drum = this.n.instr;
        if (drum) drum.scale.set(1 + 0.06 * e, 1 - 0.08 * e, 1 + 0.06 * e);
        return 2.2 * e;
      }
      case 'bell': {
        const sw = Math.sin(g * Math.PI * 2) * (1 - g) * s;
        M.rf += 0.55 * sw;
        if (this.level >= 1) M.lf -= 0.45 * sw;
        M.nod += 0.05 * sw;
        if (x.bigBell) x.bigBell.rotation.z = Math.sin(g * Math.PI * 3) * 0.45 * (1 - g) * s;
        return 2.4 * Math.exp(-g * 4) * s;
      }
      case 'shaker': {
        const env = bump(g) * s;
        M.lf += Math.sin(g * Math.PI * 8) * 0.38 * env;
        M.rf -= Math.sin(g * Math.PI * 8) * 0.38 * env;
        M.turn += Math.sin(g * Math.PI * 4) * 0.12 * env;
        M.lift += 0.02 * env;
        return 0.8 * env;
      }
      case 'crystal': {
        const e = strike(g) * s;
        M.lf += 0.55 * e;
        M.rf += 0.55 * e;
        M.lr -= 0.3 * e;
        M.rr -= 0.3 * e;
        M.lean += 0.08 * e;
        if (x.crystal) x.crystal.scale.setScalar(1 + 0.25 * e);
        return 3 * e;
      }
      case 'horn': {
        const e = bump(clamp01(g * 1.35)) * s;
        M.sq += 0.07 * e;
        M.lean -= 0.08 * e;
        if (x.horn) {
          x.horn.position.z = 0.03 * e;
          x.horn.scale.setScalar(1 + 0.08 * e);
        }
        return 2.6 * e;
      }
      case 'choir':
        return 1.2 * bump(g) * s;
      case 'bass': {
        const e = bump(g) * s;
        M.rr += 0.55 * e;
        M.rf -= 0.15 * e;
        M.tilt += 0.05 * e;
        M.lift -= 0.012 * strike(g * 3) * s;
        if (x.bstrings) x.bstrings.position.x = Math.sin(t * 60) * 0.003 * e;
        return 2.2 * e;
      }
    }
    return 0;
  }
}
