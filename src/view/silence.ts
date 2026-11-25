/**
 * The Silence: a being as tall as a mountain, made of dark ink and torn cloth that ripples like smoke,
 * with a cracked porcelain mask whose mouth is stitched shut with an X, long thin hands, and five broken
 * staff lines floating around its head like a broken crown (docs/STORY.md).
 *
 *   - robe and ribbons: one ink material animated in the vertex shader (the hem and dozens of torn
 *     ribbons ripple like smoke in water), frayed edges, a violet rim light
 *   - mask: porcelain with cracks and a chipped edge, hollow eyes with a faint violet glow, the X
 *   - arms: shoulder, elbow and wrist joints, four long fingers and a thumb that open and close
 *   - crown: five staff lines broken into pieces, each turning at its own pace, note fragments
 *   - mist at its base, ink dripping from the hem, and (dissolve) a burst of stars and ink
 *
 * CONTRACT (docs/DESIGN-v2.md §6): `.group`, `emerge`, `dissolve`, `pose`, `reach(target|null)`,
 * `lookAt(p)`, `update(dt, t)`. Scale 1 ≈ 3.3 units tall (the battle boss); cinematics scale it up.
 * Extras: `flash` (hit), `eyeGlow` (0 … 1+), `dispose()`.
 */
import * as THREE from 'three';
import { capsule, clamp01, cone, damp, sph } from './kit';
import { merge, paint, smooth } from './musicians';

export type SilencePose = 'loom' | 'reach' | 'grasp' | 'recoil' | 'kneel' | 'small';

type Geo = THREE.BufferGeometry;

const _c = new THREE.Color();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ───────────────────────────── the ink material ─────────────────────────────

interface InkU {
  uTime: { value: number };
  uDissolve: { value: number };
  uClipY: { value: number };
  uFlash: { value: THREE.Color };
  uRim: { value: THREE.Color };
}

const INK_VERT_PARS = /* glsl */ `
uniform float uTime; uniform float uRipple;
attribute vec4 aRib;
varying vec3 vObj; varying float vAlong; varying vec3 vWPosS;
`;
const INK_VERT = /* glsl */ `
vObj = position;
vAlong = aRib.y;
if (uRipple > 0.5) {
  float ang = atan(position.z, position.x);
  float k = 1.0 - smoothstep(0.0, 1.35, position.y);
  float w = sin(ang * 5.0 + uTime * 1.6 + position.y * 3.0);
  transformed.x += cos(ang) * w * 0.075 * k;
  transformed.z += sin(ang) * w * 0.075 * k;
  transformed.y += sin(ang * 7.0 - uTime * 2.1) * 0.04 * k;
}
if (aRib.z > 0.0) {
  float a = pow(aRib.y, 1.35) * aRib.z;
  transformed.x += sin(uTime * 1.3 + aRib.x + aRib.y * 3.2) * a * 0.24;
  transformed.z += cos(uTime * 1.05 + aRib.x * 1.7 + aRib.y * 2.6) * a * 0.24;
  transformed.y += (sin(uTime * 0.8 + aRib.x) * 0.5 + 0.5) * a * 0.16;
}
`;
const INK_FRAG_PARS = /* glsl */ `
uniform float uTime; uniform float uDissolve; uniform float uClipY; uniform vec3 uFlash; uniform vec3 uRim; uniform float uTear; uniform float uGlowK;
varying vec3 vObj; varying float vAlong; varying vec3 vWPosS;
float sH(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float sN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sH(i), sH(i + vec3(1,0,0)), f.x), mix(sH(i + vec3(0,1,0)), sH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sH(i + vec3(0,0,1)), sH(i + vec3(1,0,1)), f.x), mix(sH(i + vec3(0,1,1)), sH(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const INK_FRAG_CLIP = /* glsl */ `
if (vWPosS.y < uClipY) discard;
float sEdge = 0.0;
if (uDissolve > 0.001) {
  float dn = sN(vObj * 5.0) * 0.6 + sN(vObj * 13.0) * 0.4;
  float th = uDissolve * 1.25 - 0.12;
  if (dn < th) discard;
  sEdge = 1.0 - smoothstep(0.0, 0.07, dn - th);
}
if (uTear > 0.5) {
  float ang = atan(vObj.z, vObj.x);
  float hem = sN(vec3(ang * 4.0, 0.0, 3.0)) * 0.32 + sN(vec3(ang * 13.0, 1.0, 7.0)) * 0.16;
  if (vObj.y < hem - 0.06) discard;
}
if (vAlong > 0.0) {
  float fr = sN(vObj * 24.0);
  if (vAlong > 0.72 + fr * 0.3) discard;
}
`;
const INK_FRAG_COLOR = /* glsl */ `
{ float st = sN(vec3(vObj.x * 5.0, vObj.y * 1.6 + uTime * 0.25, vObj.z * 5.0));
  diffuseColor.rgb *= 0.82 + 0.36 * st * uTear; }
`;
const INK_FRAG_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += uFlash;
totalEmissiveRadiance += mix(vec3(1.0, 0.82, 0.5), vec3(0.7, 0.5, 1.0), sEdge) * sEdge * 3.0;
`;

function inkMat(u: InkU, o: { ripple?: boolean; tear?: boolean; rough?: number; metal?: number; side?: THREE.Side; streaks?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.rough ?? 0.78, metalness: o.metal ?? 0.0, side: o.side ?? THREE.FrontSide });
  const ripple = { value: o.ripple ? 1 : 0 }, tear = { value: o.tear ? 1 : 0 }, glowK = { value: 0 };
  const streaks = o.streaks !== false;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uRipple: ripple, uTear: tear, uGlowK: glowK });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${INK_VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${INK_VERT}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWPosS = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${INK_FRAG_PARS}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${INK_FRAG_CLIP}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${streaks ? INK_FRAG_COLOR : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${INK_FRAG_EMISSIVE}`)
      .replace(
        '#include <opaque_fragment>',
        `{ float rf = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.6);
           outgoingLight += uRim * rf; }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `silence-ink1${streaks ? '' : '-p'}`;
  return m;
}

// ───────────────────────────── shapes ─────────────────────────────

/** the robe's profile [radius, height] from the hem to the neck */
const ROBE: [number, number][] = [[0.82, 0.0], [0.72, 0.28], [0.58, 0.6], [0.47, 0.92], [0.39, 1.22], [0.37, 1.5], [0.42, 1.8], [0.49, 2.06], [0.53, 2.24], [0.48, 2.4], [0.3, 2.52], [0.12, 2.58], [0.0, 2.6]];
const robeR = (y: number) => {
  for (let i = 0; i < ROBE.length - 1; i++) {
    const [r0, y0] = ROBE[i], [r1, y1] = ROBE[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return y < 0 ? ROBE[0][0] : 0;
};
/** the forward hunch of the upper body */
const hunch = (y: number) => 0.26 * Math.pow(Math.max(0, y) / 2.6, 2);

function robeGeo(): Geo {
  const curve = new THREE.SplineCurve(ROBE.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(44).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
  const g = new THREE.LatheGeometry(pts, 56);
  const p = g.attributes.position;
  const ink0 = new THREE.Color('#040308'), ink1 = new THREE.Color('#0e0a1c'), ink2 = new THREE.Color('#1e1734');
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    const y = p.getY(i);
    const ang = Math.atan2(z, x);
    // vertical folds of heavy cloth, deeper toward the hem
    const fold = Math.sin(ang * 9 + y * 1.3) * 0.5 + Math.sin(ang * 4 - y * 0.7) * 0.5;
    const fk = 1 + fold * 0.05 * smooth(2.3, 0.4, y);
    x *= fk;
    z *= fk * 0.82;
    z += hunch(y);
    p.setXYZ(i, x, y, z);
    _c.copy(ink0).lerp(ink1, smooth(0, 1.4, y)).lerp(ink2, smooth(1.6, 2.5, y));
    _c.multiplyScalar(0.8 + 0.4 * (fold * 0.5 + 0.5));
    col.set([_c.r, _c.g, _c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** a strip of torn cloth hanging from `root` along `dir`, length L, width w (attributes for the ripple shader) */
function ribbon(root: THREE.Vector3, out: THREE.Vector3, L: number, w: number, phase: number, amp: number, hug: boolean): Geo {
  const seg = 12;
  const g = new THREE.PlaneGeometry(w, L, 1, seg);
  const p = g.attributes.position;
  const along = new Float32Array(p.count * 4);
  const side = new THREE.Vector3(-out.z, 0, out.x).normalize();
  const col = new Float32Array(p.count * 3);
  const c0 = new THREE.Color('#120e24'), c1 = new THREE.Color('#030207');
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i), ly = p.getY(i);
    const a = clamp01((L / 2 - ly) / L);
    const taper = 1 - a * 0.7;
    const y = root.y - a * L;
    let push = 0.03;
    if (hug) push += Math.max(0, robeR(Math.max(0, y)) - robeR(root.y)) + (y < 0 ? -y * 0.3 : 0);
    const pos = root.clone().addScaledVector(side, lx * taper).addScaledVector(out, push + a * a * 0.12);
    pos.y = y;
    if (hug) pos.z += hunch(Math.max(0, y)) - hunch(root.y);
    p.setXYZ(i, pos.x, pos.y, pos.z);
    along.set([phase, a, amp, 0], i * 4);
    _c.copy(c0).lerp(c1, a);
    col.set([_c.r, _c.g, _c.b], i * 3);
  }
  g.setAttribute('aRib', new THREE.BufferAttribute(along, 4));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function ribbons(): Geo {
  const list: Geo[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 40; i++) {
    // mostly at the sides and the back (the front shows the robe)
    let ang = rnd() * Math.PI * 2;
    if (Math.abs(Math.sin(ang) - 1) < 0.25) ang += Math.PI * 0.6;
    const y0 = 0.55 + rnd() * 1.75;
    const r = robeR(y0);
    const out = V(Math.cos(ang), 0, Math.sin(ang) * 0.82).normalize();
    const root = V(Math.cos(ang) * r, y0, Math.sin(ang) * r * 0.82 + hunch(y0));
    const L = 0.6 + rnd() * (y0 * 0.55 + 0.5);
    list.push(ribbon(root, out, L, 0.1 + rnd() * 0.13, rnd() * 6.28, 0.5 + rnd() * 0.9, true));
  }
  // long trailing tails from the hem at the back, drifting like smoke
  for (let i = 0; i < 9; i++) {
    const ang = -Math.PI / 2 + (i - 4) * 0.32 + (rnd() - 0.5) * 0.2;
    const root = V(Math.cos(ang) * 0.7, 0.35, Math.sin(ang) * 0.7 * 0.82);
    const out = V(Math.cos(ang), 0, Math.sin(ang)).normalize();
    list.push(ribbon(root, out, 1.0 + rnd() * 0.8, 0.12 + rnd() * 0.08, rnd() * 6.28, 1.4, true));
  }
  return merge(list);
}

/** a mask point on the porcelain ellipsoid (face frame) */
const MASK = { rx: 0.19, ry: 0.27, rz: 0.12, cx: 0, cy: 0.27, cz: 0.13 };
function onMask(x: number, y: number, lift = 0.004): THREE.Vector3 {
  const u = 1 - ((x - MASK.cx) / MASK.rx) ** 2 - ((y - MASK.cy) / MASK.ry) ** 2;
  const z = MASK.cz + MASK.rz * Math.sqrt(Math.max(0, u));
  return V(x, y, z + lift);
}

// ───────────────────────────── the Silence ─────────────────────────────

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  fingers: { base: THREE.Group; mid: THREE.Group; spread: number }[];
  thumb: { base: THREE.Group; mid: THREE.Group };
  rest: THREE.Vector3;
}

interface PoseT {
  lean: number;
  drop: number;
  chest: number;
  headX: number;
  headY: number;
  headZ: number;
  /** shoulder euler (x forward-up, z out) and elbow bend per arm: [l, r] */
  shX: [number, number];
  shZ: [number, number];
  shY: [number, number];
  elbow: [number, number];
  wrist: [number, number];
  curl: [number, number];
  spread: [number, number];
  crown: number;
  crownTilt: number;
  ribbons: number;
}

const POSES: Record<SilencePose, PoseT> = {
  loom: { lean: 0.16, drop: 0, chest: 0.12, headX: 0.22, headY: 0, headZ: 0, shX: [-0.45, -0.45], shZ: [-0.8, 0.8], shY: [0.2, -0.2], elbow: [0.55, 0.55], wrist: [0.35, 0.35], curl: [0.35, 0.35], spread: [0.45, 0.45], crown: 1, crownTilt: -0.28, ribbons: 1 },
  reach: { lean: 0.26, drop: -0.05, chest: 0.2, headX: 0.2, headY: 0, headZ: 0, shX: [0.25, -1.2], shZ: [-0.55, 0.3], shY: [0.3, 0], elbow: [0.6, 0.12], wrist: [0.3, -0.1], curl: [0.4, 0.08], spread: [0.4, 0.75], crown: 1.05, crownTilt: -0.32, ribbons: 1.3 },
  grasp: { lean: 0.34, drop: -0.1, chest: 0.26, headX: 0.25, headY: 0, headZ: 0, shX: [0.3, -1.15], shZ: [-0.6, 0.25], shY: [0.3, 0], elbow: [0.65, 0.35], wrist: [0.3, 0.25], curl: [0.45, 1], spread: [0.4, 0.1], crown: 1.22, crownTilt: -0.4, ribbons: 1.6 },
  recoil: { lean: -0.32, drop: -0.1, chest: -0.2, headX: -0.35, headY: 0.5, headZ: 0.15, shX: [-2.0, -2.15], shZ: [-0.35, 0.25], shY: [0.4, -0.4], elbow: [1.55, 1.4], wrist: [-0.3, -0.3], curl: [0.15, 0.2], spread: [0.85, 0.85], crown: 1.1, crownTilt: 0.1, ribbons: 1.8 },
  kneel: { lean: 0.5, drop: -0.95, chest: 0.32, headX: 0.6, headY: 0, headZ: 0.08, shX: [-0.25, -0.3], shZ: [-0.18, 0.15], shY: [0, 0], elbow: [0.15, 0.2], wrist: [0.2, 0.2], curl: [0.3, 0.3], spread: [0.25, 0.25], crown: 0.82, crownTilt: 0.45, ribbons: 0.6 },
  small: { lean: 0.22, drop: -0.25, chest: 0.3, headX: 0.32, headY: 0.15, headZ: 0.28, shX: [-0.95, -0.85], shZ: [0.42, -0.42], shY: [0.5, -0.5], elbow: [1.9, 1.95], wrist: [0.1, 0.1], curl: [0.4, 0.4], spread: [0.15, 0.15], crown: 0.7, crownTilt: 0.25, ribbons: 0.4 },
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);

export class SilenceView {
  readonly group = new THREE.Group();
  /** 0 hidden … 1 fully risen (it rises out of mist / the ground) */
  emerge = 1;
  /** 0 solid … 1 dissolved into ink and stars */
  dissolve = 0;
  pose: SilencePose = 'loom';
  /** hit flash 0..1 */
  flash = 0;
  /** brightness of the violet glow in its hollow eyes */
  eyeGlow = 1;
  private reachTo: THREE.Vector3 | null = null;
  private lookPt: THREE.Vector3 | null = null;
  private body = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private crown = new THREE.Group();
  private crownLines: THREE.Mesh[] = [];
  private crownMat: THREE.MeshBasicMaterial;
  private eyeMat: THREE.MeshBasicMaterial;
  private arms: Arm[] = [];
  private u: InkU;
  private mats: THREE.Material[] = [];
  private P: PoseT;
  private mist: THREE.Points;
  private mistMat: THREE.ShaderMaterial;
  private drips: THREE.Points;
  private dripMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starMat: THREE.ShaderMaterial;
  private bodyYaw = 0;
  private headYaw = 0;
  private headPitch = 0;
  private time = 0;
  private ribT = 0;
  private notes: THREE.Object3D[] = [];
  private shadowCasters: THREE.Mesh[] = [];
  private readonly wp = new THREE.Vector3();
  private readonly ws = new THREE.Vector3();

  constructor(opts: { scale?: number } = {}) {
    this.u = { uTime: { value: 0 }, uDissolve: { value: 0 }, uClipY: { value: -1e5 }, uFlash: { value: new THREE.Color(0, 0, 0) }, uRim: { value: new THREE.Color('#8d6cff').multiplyScalar(0.24) } };
    const cloth = inkMat(this.u, { ripple: true, tear: true, side: THREE.DoubleSide });
    const sleeveMat = inkMat(this.u, { ripple: true, side: THREE.DoubleSide });
    const hoodMat = inkMat(this.u, { side: THREE.DoubleSide, rough: 0.8 });
    const strips = inkMat(this.u, { side: THREE.DoubleSide, rough: 0.85 });
    const skin = inkMat(this.u, { rough: 0.45, metal: 0.1 });
    const porcelain = inkMat(this.u, { rough: 0.22, streaks: false });
    const voidMat = new THREE.MeshBasicMaterial({ color: '#000000' });
    this.mats.push(cloth, sleeveMat, hoodMat, strips, skin, porcelain, voidMat);
    this.P = { ...POSES.loom, shX: [...POSES.loom.shX], shZ: [...POSES.loom.shZ], shY: [...POSES.loom.shY], elbow: [...POSES.loom.elbow], wrist: [...POSES.loom.wrist], curl: [...POSES.loom.curl], spread: [...POSES.loom.spread] };

    const mesh = (g: Geo, m: THREE.Material, shadow = true) => {
      const o = new THREE.Mesh(g, m);
      o.castShadow = shadow;
      o.receiveShadow = false;
      if (shadow) this.shadowCasters.push(o);
      return o;
    };
    this.group.add(this.body);
    // the robe and its ribbons
    this.body.add(mesh(robeGeo(), cloth));
    this.body.add(mesh(ribbons(), strips, false));
    // the upper body bends at the chest
    this.chest.position.set(0, 1.75, hunch(1.75));
    this.body.add(this.chest);
    // shoulders: a dark mantle
    const mantle = new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1.15, 0.7, 0.95);
    paint(mantle, (p) => _c.set('#1d1636').lerp(new THREE.Color('#0b0816'), smooth(0.3, 0.0, p.y)));
    mantle.translate(0, 0.55, hunch(2.3) - hunch(1.75) - 0.02);
    this.chest.add(mesh(mantle, hoodMat));
    // the head: a deep hood, the void inside, the porcelain mask
    this.head.position.set(0, 0.78, hunch(2.55) - hunch(1.75) + 0.02);
    this.chest.add(this.head);
    const hood = new THREE.SphereGeometry(0.3, 30, 20, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.82);
    {
      const p = hood.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const peak = Math.max(0, y - 0.14);
        p.setXYZ(i, x * 1.02, y * 1.15 + peak * 0.35, z * 1.05 - peak * 0.75);
      }
      paint(hood, (pp, n) => _c.set('#141026').lerp(new THREE.Color('#030207'), smooth(0.2, -0.5, n.z)));
      hood.translate(0, 0.27, -0.06);
      hood.computeVertexNormals();
    }
    this.head.add(mesh(hood, hoodMat));
    this.head.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14).scale(0.24, 0.31, 0.16).translate(0, 0.27, -0.03), voidMat));
    const maskG = new THREE.SphereGeometry(1, 36, 28, Math.PI / 2 - 1.15, 2.3, Math.PI * 0.1, Math.PI * 0.8);
    {
      const p = maskG.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const chin = y < 0 ? 1 - Math.min(0.3, -y * 0.35) : 1;
        p.setXYZ(i, x * MASK.rx * chin, y * MASK.ry, z * MASK.rz);
      }
      maskG.computeVertexNormals();
      const white = new THREE.Color('#f5f2ec'), cool = new THREE.Color('#b9b6c8'), blush = new THREE.Color('#d9c4dc');
      paint(maskG, (pp, n) => {
        _c.copy(white).lerp(cool, smooth(0.55, 0.15, n.z) * 0.8);
        const under = Math.max(0, 1 - Math.hypot(Math.abs(pp.x) - 0.075, pp.y + 0.02) / 0.06);
        return _c.lerp(blush, under * 0.5);
      });
      maskG.translate(MASK.cx, MASK.cy, MASK.cz);
    }
    this.head.add(mesh(maskG, porcelain));
    // hollow eyes (sad almonds), the stitched mouth, cracks and a chipped edge
    const detail: Geo[] = [];
    for (const sd of [-1, 1]) {
      // an almond whose outer corner droops: hollow and sad
      const sh = new THREE.Shape();
      const cx = sd * 0.07, cy = 0.305;
      const inner = [cx - sd * 0.05, cy + 0.008], outer = [cx + sd * 0.055, cy - 0.022];
      sh.moveTo(inner[0], inner[1]);
      sh.quadraticCurveTo(cx, cy + 0.058, outer[0], outer[1]);
      sh.quadraticCurveTo(cx - sd * 0.008, cy - 0.045, inner[0], inner[1]);
      const eg = new THREE.ShapeGeometry(sh, 12);
      const ep = eg.attributes.position;
      for (let i = 0; i < ep.count; i++) {
        const q = onMask(ep.getX(i), ep.getY(i), 0.004);
        ep.setXYZ(i, q.x, q.y, q.z);
      }
      eg.computeVertexNormals();
      detail.push(paint(eg, '#030206'));
    }
    const thread = '#1d1424';
    const mc = onMask(0, 0.16, 0.002);
    for (const k of [-1, 1]) {
      const st = capsule(0.0105, 0.13, 3, 6);
      st.rotateZ(k * 0.8);
      st.translate(mc.x, mc.y, mc.z + 0.006);
      detail.push(paint(st, thread));
      for (let j = -2; j <= 2; j++) {
        if (!j) continue;
        const tk = capsule(0.004, 0.022, 2, 4);
        tk.rotateZ(k * 0.8 + Math.PI / 2);
        const d = j * 0.027;
        tk.translate(mc.x + Math.sin(-k * 0.8) * d * -1, mc.y + Math.cos(k * 0.8) * d, mc.z + 0.007);
        detail.push(paint(tk, thread));
      }
    }
    detail.push(paint(capsule(0.004, 0.12, 2, 4).rotateZ(Math.PI / 2).translate(mc.x, mc.y, mc.z + 0.003), '#4a3a50'));
    const crack = (pts: [number, number][], r: number) => {
      const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => onMask(x, y, 0.003)), false, 'catmullrom', 0.1);
      detail.push(paint(new THREE.TubeGeometry(c, pts.length * 6, r, 4, false), '#1b1426'));
    };
    crack([[0.03, 0.5], [0.0, 0.44], [-0.03, 0.41], [-0.045, 0.36], [-0.06, 0.33]], 0.0045);
    crack([[-0.085, 0.285], [-0.095, 0.24], [-0.085, 0.2], [-0.1, 0.15], [-0.095, 0.1]], 0.004);
    crack([[0.0, 0.44], [0.035, 0.42], [0.05, 0.39]], 0.003);
    crack([[-0.095, 0.24], [-0.12, 0.23], [-0.135, 0.2]], 0.0028);
    crack([[0.11, 0.45], [0.1, 0.4], [0.115, 0.37]], 0.003);
    // the chip: a jagged dark gap on the upper right edge
    {
      const chip = new THREE.Shape();
      chip.moveTo(0.1, 0.47);
      chip.lineTo(0.125, 0.43);
      chip.lineTo(0.112, 0.41);
      chip.lineTo(0.135, 0.38);
      chip.lineTo(0.155, 0.4);
      chip.lineTo(0.15, 0.46);
      chip.lineTo(0.1, 0.47);
      const cg = new THREE.ShapeGeometry(chip);
      const p = cg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const q = onMask(p.getX(i), p.getY(i), 0.004);
        p.setXYZ(i, q.x, q.y, q.z);
      }
      cg.computeVertexNormals();
      detail.push(paint(cg, '#0a0710'));
    }
    this.head.add(mesh(merge(detail), porcelain, false));
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#a77bff').multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const sd of [-1, 1]) {
      const c = onMask(sd * 0.072, 0.3, 0.008);
      const g = new THREE.Mesh(sph(0.011, 10, 8), this.eyeMat);
      g.position.copy(c);
      g.scale.set(1, 0.8, 0.4);
      this.head.add(g);
    }
    // the broken crown: five staff lines
    this.crownMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#dcd2ff').multiplyScalar(1.2), transparent: true, opacity: 1, toneMapped: false, depthWrite: false });
    this.crown.position.set(0, 0.66, -0.06);
    this.head.add(this.crown);
    let s = 3;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < 5; i++) {
      const R = 0.37;
      const parts: Geo[] = [];
      let a = rnd() * 6.28;
      const n = 2 + (i % 2);
      for (let k = 0; k < n; k++) {
        const len = ((Math.PI * 2) / n) * (0.55 + rnd() * 0.3);
        const arc = new THREE.TorusGeometry(R, 0.0068, 4, 48, len).rotateX(Math.PI / 2).rotateY(-a);
        parts.push(paint(arc, '#ffffff'));
        // jagged broken ends
        for (const end of [a, a + len]) {
          const tip = cone(0.012, 0.05, 4);
          tip.rotateZ(Math.PI / 2);
          tip.rotateY(-end + (end === a ? Math.PI / 2 : -Math.PI / 2));
          tip.translate(Math.cos(end) * R, (rnd() - 0.5) * 0.02, Math.sin(end) * R);
          parts.push(paint(tip, '#ffffff'));
        }
        a += len + 0.25 + rnd() * 0.5;
      }
      const line = new THREE.Mesh(merge(parts), this.crownMat);
      line.position.y = (i - 2) * 0.05;
      line.rotation.x = (rnd() - 0.5) * 0.12;
      line.userData.speed = (i % 2 ? 1 : -1) * (0.15 + rnd() * 0.2);
      this.crown.add(line);
      this.crownLines.push(line);
    }
    // note fragments drifting around the crown
    for (let i = 0; i < 7; i++) {
      const nc = i % 3 ? '#ffffff' : '#1a1430';
      const g = merge([paint(sph(0.028, 10, 8).scale(1.3, 0.9, 0.7).rotateZ(0.4), nc), paint(capsule(0.005, 0.07, 2, 4).translate(0.03, 0.045, 0), nc)]);
      const m = new THREE.Mesh(g, i % 3 ? this.crownMat : skin);
      m.userData.a = (i / 7) * Math.PI * 2;
      m.userData.r = 0.5 + rnd() * 0.12;
      m.userData.y = (rnd() - 0.5) * 0.25;
      this.crown.add(m);
      this.notes.push(m);
    }
    // arms
    for (const sd of [-1, 1]) this.arms.push(this.buildArm(sd, skin, sleeveMat, strips));
    // mist, drips and stars
    const pm = this.particles();
    this.mist = pm.mist;
    this.mistMat = pm.mistMat;
    this.drips = pm.drips;
    this.dripMat = pm.dripMat;
    this.stars = pm.stars;
    this.starMat = pm.starMat;
    this.group.add(this.mist, this.drips, this.stars);
    this.group.scale.setScalar(opts.scale ?? 1);
  }

  private buildArm(sd: number, skin: THREE.Material, cloth: THREE.Material, strips: THREE.Material): Arm {
    const shoulder = new THREE.Group();
    const rest = V(sd * 0.5, 0.5, hunch(2.25) - hunch(1.75));
    shoulder.position.copy(rest);
    this.chest.add(shoulder);
    const add = (parent: THREE.Object3D, g: Geo, m: THREE.Material, shadow = true) => {
      const o = new THREE.Mesh(g, m);
      o.castShadow = shadow;
      if (shadow) this.shadowCasters.push(o);
      parent.add(o);
      return o;
    };
    const skinC = (g: Geo) => paint(g, (p) => _c.set('#140f24').lerp(new THREE.Color('#2a2148'), smooth(-0.6, 0, p.y)));
    add(shoulder, skinC(capsule(0.052, 0.7, 4, 10).translate(0, -0.38, 0)), skin);
    // a torn sleeve flaring from the shoulder to below the elbow
    const sleeve = new THREE.LatheGeometry([new THREE.Vector2(0.09, 0.05), new THREE.Vector2(0.1, -0.2), new THREE.Vector2(0.12, -0.5), new THREE.Vector2(0.15, -0.78), new THREE.Vector2(0.17, -0.9)], 18);
    paint(sleeve, (p) => _c.set('#110d20').lerp(new THREE.Color('#030207'), smooth(-0.2, -0.9, p.y)));
    add(shoulder, sleeve, cloth);
    const sl: Geo[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + sd;
      sl.push(ribbon(V(Math.cos(a) * 0.15, -0.85, Math.sin(a) * 0.15), V(Math.cos(a), 0, Math.sin(a)), 0.45 + (i % 3) * 0.22, 0.07, i * 1.7, 0.8, false));
    }
    add(shoulder, merge(sl), strips, false);
    const elbow = new THREE.Group();
    elbow.position.y = -0.78;
    shoulder.add(elbow);
    add(elbow, skinC(capsule(0.042, 0.62, 4, 10).translate(0, -0.33, 0)), skin);
    const wrist = new THREE.Group();
    wrist.position.y = -0.68;
    elbow.add(wrist);
    add(wrist, skinC(sph(1, 14, 10).scale(0.085, 0.12, 0.034).translate(0, -0.095, 0)), skin);
    const fingers: Arm['fingers'] = [];
    for (let i = 0; i < 4; i++) {
      const spread = (i - 1.5) * 0.17;
      const base = new THREE.Group();
      base.position.set((i - 1.5) * 0.038, -0.19, 0);
      wrist.add(base);
      add(base, skinC(capsule(0.0165, 0.12 + (i === 1 || i === 2 ? 0.02 : 0), 3, 6).translate(0, -0.07, 0)), skin);
      const mid = new THREE.Group();
      mid.position.y = -0.15;
      base.add(mid);
      add(mid, paint(cone(0.0145, 0.16 + (i === 1 || i === 2 ? 0.02 : 0), 6).rotateX(Math.PI).translate(0, -0.08, 0), '#2a2148'), skin);
      fingers.push({ base, mid, spread });
    }
    const tb = new THREE.Group();
    tb.position.set(sd * -0.055, -0.06, 0.012);
    tb.rotation.z = sd * 0.7;
    wrist.add(tb);
    add(tb, skinC(capsule(0.013, 0.08, 3, 6).translate(0, -0.05, 0)), skin);
    const tm = new THREE.Group();
    tm.position.y = -0.1;
    tb.add(tm);
    add(tm, paint(cone(0.011, 0.1, 6).rotateX(Math.PI).translate(0, -0.05, 0), '#2a2148'), skin);
    return { shoulder, elbow, wrist, fingers, thumb: { base: tb, mid: tm }, rest };
  }

  private particles() {
    // mist: soft violet-grey puffs around the base
    const nM = 46;
    const mp = new Float32Array(nM * 3), mr = new Float32Array(nM * 4);
    for (let i = 0; i < nM; i++) {
      const a = (i / nM) * Math.PI * 2 + Math.sin(i * 7.3) * 0.4, r = 0.4 + ((i * 37) % 17) / 17 * 1.4;
      mp.set([Math.cos(a) * r, 0.05 + ((i * 13) % 7) / 7 * 0.45, Math.sin(a) * r], i * 3);
      mr.set([Math.sin(i * 3.1) * 0.5 + 0.5, Math.cos(i * 1.7) * 0.5 + 0.5, (i % 5) / 5, (i % 3) / 3], i * 4);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('aR', new THREE.BufferAttribute(mr, 4));
    const mistMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.5 }, uScale: { value: 1 }, uColor: { value: new THREE.Color('#bdb4d6') } },
      vertexShader: /* glsl */ `
        attribute vec4 aR; uniform float uTime; uniform float uScale; varying float vA;
        void main(){
          vec3 p = position;
          float a = uTime * (0.08 + aR.x * 0.1) + aR.y * 6.28;
          p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
          p.y += sin(uTime * 0.5 + aR.z * 6.28) * 0.08;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (90.0 + aR.w * 120.0) * uScale / -mv.z;
          vA = 0.55 + 0.45 * aR.z;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; uniform vec3 uColor; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a * a * uAlpha * vA); }`,
    });
    const mist = new THREE.Points(mg, mistMat);
    mist.frustumCulled = false;
    mist.renderOrder = 6;
    // ink dripping from the hem
    const nD = 40;
    const dp = new Float32Array(nD * 3), dr = new Float32Array(nD * 2);
    for (let i = 0; i < nD; i++) {
      const a = i * 2.39996, r = 0.55 + (i % 4) * 0.06;
      const y = 0.2 + ((i * 7) % 11) / 11 * 1.4;
      const rr = robeR(y) + 0.02;
      dp.set(i % 3 ? [Math.cos(a) * rr, y, Math.sin(a) * rr * 0.82 + hunch(y)] : [Math.cos(a) * r, 0.2, Math.sin(a) * r * 0.82], i * 3);
      dr.set([((i * 31) % 13) / 13, 0.6 + ((i * 17) % 7) / 7], i * 2);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dg.setAttribute('aR', new THREE.BufferAttribute(dr, 2));
    const dripMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec2 aR; uniform float uTime; uniform float uScale; varying float vA;
        void main(){
          float k = fract(uTime * 0.35 * aR.y + aR.x);
          vec3 p = position;
          p.y -= k * k * 1.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 14.0 * uScale * (1.0 - k * 0.4) / -mv.z;
          vA = smoothstep(0.0, 0.1, k) * (1.0 - smoothstep(0.75, 1.0, k)) * step(-0.05, p.y);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; d.y *= 0.7; float a = smoothstep(0.5, 0.3, length(d)); if (a * vA < 0.02) discard;
          gl_FragColor = vec4(0.05, 0.03, 0.1, a * vA * uAlpha); }`,
    });
    const drips = new THREE.Points(dg, dripMat);
    drips.frustumCulled = false;
    // stars and ink for the dissolve
    const nS = 420;
    const sp = new Float32Array(nS * 3), sr = new Float32Array(nS * 4);
    for (let i = 0; i < nS; i++) {
      const y = ((i * 0.6180339) % 1) * 3.2;
      const a = i * 2.39996;
      const r = (y < 2.6 ? robeR(y) : 0.25) * (0.6 + ((i * 7) % 5) / 10);
      sp.set([Math.cos(a) * r, y, Math.sin(a) * r * 0.82 + hunch(Math.min(y, 2.6))], i * 3);
      sr.set([Math.cos(a), ((i * 13) % 17) / 17, Math.sin(a), i % 4 === 0 ? 0 : 1], i * 4);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aR', new THREE.BufferAttribute(sr, 4));
    const starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uD: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 aR; uniform float uTime; uniform float uD; uniform float uScale; varying float vA; varying float vStar;
        void main(){
          vec3 p = position;
          float d = uD;
          p.xz += vec2(aR.x, aR.z) * d * (1.2 + aR.y * 2.2);
          p.y += d * d * (1.5 + aR.y * 3.5) * aR.w - d * (1.0 - aR.w) * 1.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.6 + 0.4 * sin(uTime * (3.0 + aR.y * 5.0) + aR.y * 40.0);
          gl_PointSize = (aR.w > 0.5 ? 9.0 : 13.0) * uScale * tw / -mv.z;
          vA = smoothstep(0.02, 0.12, d) * (1.0 - smoothstep(0.75, 1.0, d));
          vStar = aR.w;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vStar;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
          float a = smoothstep(0.5, 0.0, r);
          float cross = max(smoothstep(0.08, 0.0, abs(d.x)) , smoothstep(0.08, 0.0, abs(d.y))) * smoothstep(0.5, 0.1, r);
          vec3 c = vStar > 0.5 ? vec3(1.0, 0.92, 0.7) * (a + cross) * 1.6 : vec3(0.55, 0.42, 1.0) * a;
          if (vA * a < 0.01) discard;
          gl_FragColor = vec4(c * vA, 1.0); }`,
    });
    const stars = new THREE.Points(sg, starMat);
    stars.frustumCulled = false;
    stars.visible = false;
    return { mist, mistMat, drips, dripMat, stars, starMat };
  }

  /** stretch a hand toward a world point (null: lower it) */
  reach(target: THREE.Vector3 | null): void {
    this.reachTo = target ? target.clone() : null;
  }

  /** turn the mask toward a world point */
  lookAt(p: THREE.Vector3): void {
    this.lookPt = p.clone();
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    this.crownMat.dispose();
    this.eyeMat.dispose();
    this.mistMat.dispose();
    this.dripMat.dispose();
    this.starMat.dispose();
  }

  update(dt: number, t: number): void {
    this.time = t;
    const T = POSES[this.pose];
    const P = this.P;
    const k = 1 - Math.exp(-dt * (this.pose === 'grasp' ? 7 : 3.2));
    const lerpA = (a: [number, number], b: [number, number]) => {
      a[0] += (b[0] - a[0]) * k;
      a[1] += (b[1] - a[1]) * k;
    };
    for (const key of ['lean', 'drop', 'chest', 'headX', 'headY', 'headZ', 'crown', 'crownTilt', 'ribbons'] as const) P[key] += (T[key] - P[key]) * k;
    lerpA(P.shX, T.shX);
    lerpA(P.shZ, T.shZ);
    lerpA(P.shY, T.shY);
    lerpA(P.elbow, T.elbow);
    lerpA(P.wrist, T.wrist);
    lerpA(P.curl, T.curl);
    lerpA(P.spread, T.spread);
    const breathe = Math.sin(t * 0.9);
    const H = 3.3;
    // emerge from below, dissolve into ink and stars
    const em = clamp01(this.emerge);
    this.body.position.y = (em - 1) * H * 1.08 + P.drop + breathe * 0.025;
    this.body.rotation.x = P.lean + breathe * 0.01;
    this.chest.rotation.x = P.chest;
    // look toward a point: most of the turn in the head, the rest in the body
    this.group.updateWorldMatrix(true, false);
    if (this.lookPt) {
      const local = this.group.worldToLocal(_v.copy(this.lookPt));
      const yaw = Math.atan2(local.x, local.z);
      const flat = Math.hypot(local.x, local.z);
      const pitch = Math.atan2(2.9 - local.y, Math.max(0.5, flat));
      this.bodyYaw = damp(this.bodyYaw, THREE.MathUtils.clamp(yaw * 0.5, -0.9, 0.9), 2.5, dt);
      this.headYaw = damp(this.headYaw, THREE.MathUtils.clamp(yaw - this.bodyYaw, -0.8, 0.8), 3.5, dt);
      this.headPitch = damp(this.headPitch, THREE.MathUtils.clamp(pitch - P.lean - P.chest, -0.6, 0.7), 3, dt);
    } else {
      this.bodyYaw = damp(this.bodyYaw, 0, 2, dt);
      this.headYaw = damp(this.headYaw, 0, 2, dt);
      this.headPitch = damp(this.headPitch, 0, 2, dt);
    }
    this.body.rotation.y = this.bodyYaw;
    this.head.rotation.set(P.headX + this.headPitch * 0.8 + Math.sin(t * 0.7) * 0.02, P.headY + this.headYaw, P.headZ + Math.sin(t * 0.43) * 0.03, 'YXZ');
    // arms
    this.body.updateWorldMatrix(true, true);
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      _e.set(P.shX[i] + Math.sin(t * 0.8 + i) * 0.03, P.shY[i], P.shZ[i] + Math.sin(t * 0.6 + i * 2) * 0.04, 'XYZ');
      _q.setFromEuler(_e);
      // the right hand reaches for its target
      if (i === 1 && this.reachTo && (this.pose === 'reach' || this.pose === 'grasp')) {
        const parent = arm.shoulder.parent!;
        _m.copy(parent.matrixWorld).invert();
        const local = _v.copy(this.reachTo).applyMatrix4(_m).sub(arm.shoulder.position).normalize();
        _q2.setFromUnitVectors(DOWN, local);
        _q.copy(_q2);
      }
      arm.shoulder.quaternion.slerp(_q, Math.min(1, k * 1.4));
      arm.elbow.rotation.x = -P.elbow[i];
      arm.wrist.rotation.x = -P.wrist[i] + Math.sin(t * 1.3 + i) * 0.04;
      arm.fingers.forEach((f, j) => {
        const c = P.curl[i] + Math.sin(t * 1.7 + j * 0.9 + i) * 0.04;
        f.base.rotation.set(c * 1.25, 0, f.spread * P.spread[i] * 2.2);
        f.mid.rotation.x = c * 1.4;
      });
      arm.thumb.base.rotation.x = P.curl[i] * 0.9;
      arm.thumb.base.rotation.z = side * (0.7 - P.curl[i] * 0.5);
      arm.thumb.mid.rotation.x = P.curl[i] * 1.1;
    });
    // the crown
    this.crown.rotation.x = P.crownTilt;
    this.crown.scale.setScalar(P.crown * (1 + Math.sin(t * 1.2) * 0.015));
    this.crownLines.forEach((l, i) => {
      l.rotation.y = t * (l.userData.speed as number);
      l.position.y = (i - 2) * 0.05 * P.crown + Math.sin(t * 0.9 + i) * 0.006;
    });
    this.notes.forEach((n, i) => {
      const a = (n.userData.a as number) + t * (0.12 + i * 0.01);
      const r = n.userData.r as number;
      n.position.set(Math.cos(a) * r, (n.userData.y as number) + Math.sin(t * 0.8 + i) * 0.04, Math.sin(a) * r);
      n.rotation.set(Math.sin(t + i) * 0.5, -a, Math.cos(t * 0.7 + i) * 0.5);
    });
    const dis = clamp01(this.dissolve);
    const crownK = (this.pose === 'kneel' || this.pose === 'small' ? 0.55 : this.pose === 'grasp' ? 1.35 : 1) * (1 - dis);
    this.crownMat.color.set('#d6ccf6').multiplyScalar(0.95 * crownK * smooth(0.7, 1, em));
    this.crownMat.opacity = smooth(0.6, 0.95, em) * (1 - smooth(0.2, 0.6, dis));
    // eyes
    const pulse = 0.75 + 0.25 * Math.sin(t * 1.6);
    this.eyeMat.color.set('#a77bff').multiplyScalar(2 * this.eyeGlow * pulse * (1 - dis) * (this.pose === 'grasp' ? 1.6 : 1));
    // uniforms
    this.ribT += dt * (0.4 + P.ribbons * 0.6);
    this.u.uTime.value = this.ribT;
    this.u.uDissolve.value = dis;
    this.u.uFlash.value.setScalar(this.flash * 0.6);
    this.group.getWorldPosition(this.wp);
    this.group.getWorldScale(this.ws);
    const sc = this.ws.y;
    this.u.uClipY.value = em < 0.999 ? this.wp.y - 0.02 * sc : -1e5;
    // particles
    this.mistMat.uniforms.uTime.value = t;
    this.mistMat.uniforms.uScale.value = sc * 6;
    this.mistMat.uniforms.uAlpha.value = (0.3 + 0.5 * Math.sin(Math.PI * Math.min(1, em * 1.1)) + 0.15) * (1 - dis * 0.6);
    this.dripMat.uniforms.uTime.value = t;
    this.dripMat.uniforms.uScale.value = sc * 6;
    this.dripMat.uniforms.uAlpha.value = smooth(0.8, 1, em) * (1 - dis);
    this.drips.position.y = this.body.position.y;
    this.stars.visible = dis > 0.001 && dis < 0.999;
    this.starMat.uniforms.uTime.value = t;
    this.starMat.uniforms.uD.value = dis;
    this.starMat.uniforms.uScale.value = sc * 6;
    this.stars.position.y = this.body.position.y;
    const solid = dis < 0.05 && em > 0.95;
    for (const m of this.shadowCasters) m.castShadow = solid;
    this.body.visible = em > 0.005 && dis < 0.999;
  }
}
