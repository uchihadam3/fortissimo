/**
 * Creatures of the Silence: sounds it stole and turned into ink. Every one of them has its mouth
 * sewn shut with an X; defeated, they turn back into golden notes. Each land has its family:
 *
 *   meadow  blot (ink droplet with a curl) · blotling · scurry (ink mouse, big ears, long tail) ·
 *           bubble (soap bubble with little blots swirling inside) · moth (dusty eyespot wings)
 *   dunes   scorpion (sand armour, tail over the back) · whirl (dust devil with a mask inside) ·
 *           echo (ghost of sound rings with a fading double) · obelisk (carved X glyph)
 *   peaks   wolf (ink and ice shards) · shell (ice beetle) · phantom (foggy ghost) ·
 *           muffler (snow owl with earmuffs)
 *   forge   ember (fire bat) · slug (lava slug with a crusted back) · shield (squire with an
 *           anvil shield) · mender (living bellows)
 *   citadel mimic (ink copy of one of your musicians) · knight (porcelain mask, tower shield) ·
 *           conductor (shadow maestro with a black baton)
 *   guardians  the Great Blot (coiled ink, green shard) · the Scarab (orange shard on its back) ·
 *           the Moth Queen (dusty wings, ice crown, cyan shard) · the Forge Golem (ink armour
 *           plates, red shard in its chest) · the Silence (SilenceView)
 *
 * Geometry is built once per kind (template) and shared; every instance has its own small set of
 * materials (hit flash, icy tint when slowed, camouflage).
 */
import * as THREE from 'three';
import type { EnemyKind, TowerKind } from '../sim/defs';
import { ENEMIES } from '../sim/defs';
import { at, box, capsule, clamp01, cone, cyl, damp, scl, sph, torus } from './kit';
import { Bins, CharMats, MusicianView, assembleBird, bird, ell, glowBy, grp, merge, paint, place, smooth, type BirdDef, type MK, type Painter } from './musicians';
import { SilenceView } from './silence';

type Geo = THREE.BufferGeometry;
type Col = THREE.ColorRepresentation;

const _c = new THREE.Color();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** vertical gradient */
const grad = (a: Col, b: Col, y0: number, y1: number): Painter => {
  const A = new THREE.Color(a), B = new THREE.Color(b);
  return (p) => _c.copy(A).lerp(B, smooth(y0, y1, p.y));
};

/** a lathe body from [radius, height] pairs */
function lathe(pts: number[][], seg = 26): Geo {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** radius of a lathe profile at height y */
function profR(pts: number[][], y: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  }
  return pts[0][0];
}

/** faceted (flat-shaded) version of a geometry */
function facet(g: Geo): Geo {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('normal');
  n.computeVertexNormals();
  return n;
}

/** two creature eyes facing +z centred at (±s, y, z) */
function eyes2(
  b: Bins, part: string, mk: MK, s: number, y: number, z: number, e: number,
  o: { pupil?: Col; white?: Col; brow?: number; browCol?: Col; glow?: number; yaw?: number; small?: number; lid?: Col; lidK?: number } = {},
) {
  for (const sd of [-1, 1]) {
    const parts: Geo[] = [
      paint(scl(sph(e, 14, 10), 1, 1.1, 0.55), o.white ?? '#f6f2ea', o.glow ?? 0.12),
      paint(at(scl(sph(e * (o.small ?? 0.56), 12, 8), 1, 1.1, 0.4), 0, -e * 0.06, e * 0.38), o.pupil ?? '#120d1c', o.pupil && o.glow ? o.glow : 0),
      paint(at(scl(sph(e * 0.18, 8, 6), 1, 1, 0.5), e * 0.2, e * 0.24, e * 0.56), '#ffffff', 1),
    ];
    if (o.lid) {
      // a heavy upper lid: grumpy, sleepy or wise
      const lid = new THREE.SphereGeometry(e * 1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI * (o.lidK ?? 0.42));
      lid.rotateX(0.55);
      lid.scale(1, 1.1, 0.6);
      parts.push(paint(lid, o.lid));
    }
    if (o.brow) {
      const br = capsule(e * 0.16, e * 1.25, 3, 6);
      br.rotateZ(Math.PI / 2 + sd * o.brow);
      br.translate(sd * -e * 0.05, e * 1.2, e * 0.28);
      parts.push(paint(br, o.browCol ?? '#0d0915'));
    }
    const g = merge(parts);
    if (o.yaw) g.rotateY(sd * o.yaw);
    g.translate(sd * s, y, z);
    b.add(part, mk, g);
  }
}

/** the mark of the Silence: a mouth sewn shut with an X */
function stitchX(b: Bins, part: string, mk: MK, x: number, y: number, z: number, s: number, o: { pitch?: number; yaw?: number; col?: Col; hole?: Col; n?: THREE.Vector3 } = {}) {
  const parts: Geo[] = [];
  for (const k of [-1, 1]) {
    const g = capsule(s * 0.17, s * 1.25, 3, 6);
    g.rotateZ(k * 0.78);
    parts.push(paint(g, o.col ?? '#f1e6cf', 0.35));
  }
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(paint(at(sph(s * 0.1, 6, 4), dx * s * 0.6, dy * s * 0.6, -s * 0.04), o.hole ?? '#2a1d30'));
  const g = merge(parts);
  if (o.n) place(g, V(x, y, z), o.n);
  else {
    if (o.pitch) g.rotateX(o.pitch);
    if (o.yaw) g.rotateY(o.yaw);
    g.translate(x, y, z);
  }
  b.add(part, mk, g);
}

/**
 * A flat fan in the xz plane from the root (0,0) out to an outline (wings, membranes), with rings
 * of inner vertices so it can be painted from the root (t = 0) to the edge (t = 1).
 */
function fan(outline0: [number, number][], color: (t: number, x: number, z: number) => THREE.Color, glow: (t: number) => number = () => 0, rings0 = 4): Geo {
  // resample the outline densely so painted details (eyespots, glowing edges) have vertices to live on
  const outline: [number, number][] = [];
  const ext = Math.max(...outline0.map(([x, z]) => Math.hypot(x, z)));
  const step = Math.max(0.03, ext / 40);
  for (let i = 0; i < outline0.length - 1; i++) {
    const [x0, z0] = outline0[i], [x1, z1] = outline0[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let k = 0; k < steps; k++) outline.push([x0 + ((x1 - x0) * k) / steps, z0 + ((z1 - z0) * k) / steps]);
  }
  outline.push(outline0[outline0.length - 1]);
  const rings = Math.max(rings0, Math.min(18, Math.ceil(ext / 0.045)));
  const pos: number[] = [0, 0, 0], col: number[] = [], gl: number[] = [], idx: number[] = [];
  const c0 = color(0, 0, 0);
  col.push(c0.r, c0.g, c0.b);
  gl.push(glow(0));
  const n = outline.length;
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    for (let i = 0; i < n; i++) {
      const x = outline[i][0] * t, z = outline[i][1] * t;
      pos.push(x, 0, z);
      const c = color(t, x, z);
      col.push(c.r, c.g, c.b);
      gl.push(glow(t));
    }
  }
  const v = (r: number, i: number) => (r === 0 ? 0 : 1 + (r - 1) * n + i);
  for (let i = 0; i < n - 1; i++) idx.push(0, v(1, i), v(1, i + 1));
  for (let r = 1; r < rings; r++) for (let i = 0; i < n - 1; i++) idx.push(v(r, i), v(r + 1, i), v(r, i + 1), v(r, i + 1), v(r + 1, i), v(r + 1, i + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(gl, 1));
  g.setIndex(idx);
  return g;
}

/** a tube along a curve whose radius goes from r0 to r1 */
function taperTube(curve: THREE.Curve<THREE.Vector3>, segs: number, r0: number, r1: number, radial = 8): Geo {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * Math.pow(i / segs, 0.85);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** a few ink drips running down a surface */
function drips(b: Bins, part: string, mk: MK, list: [number, number, number, number][], col: Col) {
  for (const [x, y, z, l] of list) {
    b.add(part, mk, paint(at(capsule(l * 0.12, l, 3, 6), x, y - l / 2, z), col));
    b.add(part, mk, paint(at(sph(l * 0.2, 8, 6), x, y - l, z), col));
  }
}

// ───────────────────────────── templates ─────────────────────────────

type Style = 'hop' | 'run' | 'fly' | 'float' | 'spin' | 'march' | 'crawl' | 'static';

interface Tpl {
  root: THREE.Group;
  height: number;
  style: Style;
  hop: number;
  hops: number;
  rim: Col;
  rimK: number;
  glass: number;
  flap: number;
  hover: number;
}

function buildTemplate(kind: EnemyKind): Tpl {
  const root = grp('root');
  const body = grp('body');
  root.add(body);
  const b = new Bins();
  const t: Tpl = { root, height: 0.7, style: 'hop', hop: 0.16, hops: 1, rim: '#c4b2ff', rimK: 0.55, glass: 0.6, flap: 22, hover: 0 };
  const node = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true, pivot = false) => {
    const g = b.into(name, grp(name, x, y, z), pivot ? V(x, y, z) : undefined, shadow);
    parent.add(g);
    return g;
  };
  switch (kind) {
    // ── meadow: sounds of the countryside ──
    case 'blot':
    case 'blotling': {
      const k = kind === 'blot' ? 1 : 0.62;
      const prof = [[0, 0], [0.2, 0.015], [0.27, 0.09], [0.29, 0.2], [0.265, 0.32], [0.2, 0.44], [0.12, 0.54], [0.05, 0.61], [0, 0.63]].map(([r, y]) => [r * k, y * k]);
      const top = kind === 'blot' ? '#54438c' : '#8a76d0', bot = kind === 'blot' ? '#151029' : '#3d2f72';
      b.add('b', 'g', paint(lathe(prof, 28), grad(bot, top, 0, 0.62 * k)));
      // a curl of ink on top, like a wave crest
      const crest = torus(0.075 * k, 0.032 * k, 6, 14, Math.PI * 1.3);
      crest.rotateY(Math.PI / 2);
      crest.rotateX(0.5);
      crest.translate(0, 0.66 * k, -0.05 * k);
      b.add('b', 'g', paint(crest, top));
      const e = kind === 'blot' ? 0.085 : 0.075;
      const ey = 0.31 * k, er = profR(prof, ey), es = 0.105 * k;
      eyes2(b, 'b', 'g', es, ey, Math.sqrt(er * er - es * es) - e * 0.15, e);
      stitchX(b, 'b', 'g', 0, 0.165 * k, profR(prof, 0.165 * k) - 0.004, 0.065 * k, { pitch: -0.15 });
      if (kind === 'blot') for (const sd of [-1, 1]) b.add('b', 'g', paint(at(ell(0.07, 0.04, 0.09), sd * 0.11, 0.02, 0.14), '#0f0b1d'));
      for (let i = 0; i < 3; i++) {
        const a = i * 2.2 + 0.5;
        b.add('b', 'g', paint(at(ell(0.06 * k, 0.012, 0.05 * k), Math.cos(a) * 0.3 * k, 0.006, Math.sin(a) * 0.3 * k), bot));
      }
      node('b', body);
      t.height = 0.72 * k;
      t.hop = kind === 'blot' ? 0.16 : 0.12;
      t.hops = kind === 'blot' ? 1 : 2;
      break;
    }
    case 'scurry': {
      const ink: Painter = grad('#1a2243', '#4a63a3', 0.05, 0.42);
      b.add('b', 'g', paint(at(ell(0.17, 0.15, 0.25, 20, 14), 0, 0.17, -0.03), ink));
      b.add('b', 'g', paint(at(sph(0.14, 18, 12), 0, 0.25, 0.15), ink));
      b.add('b', 'g', paint(at(cone(0.075, 0.15, 12).rotateX(Math.PI / 2), 0, 0.22, 0.3), '#4a63a3'));
      b.add('b', 'g', paint(at(sph(0.03, 8, 6), 0, 0.225, 0.38), '#0d0a16'));
      eyes2(b, 'b', 'g', 0.066, 0.3, 0.255, 0.052, { small: 0.62 });
      stitchX(b, 'b', 'g', 0, 0.165, 0.29, 0.034, { pitch: -0.5 });
      for (const sd of [-1, 1]) {
        for (const a of [-0.25, 0, 0.25]) {
          const w = capsule(0.004, 0.12, 2, 4);
          w.rotateZ(Math.PI / 2 + a);
          w.translate(sd * 0.09, 0.215 + a * 0.05, 0.31);
          b.add('b', 'g', paint(w, '#e8e1f4'));
        }
        b.add('b', 'g', paint(at(ell(0.05, 0.03, 0.07), sd * 0.1, 0.02, 0.12), '#0f1426'));
        b.add('b', 'g', paint(at(ell(0.05, 0.03, 0.07), sd * 0.1, 0.02, -0.15), '#0f1426'));
        // big round ears
        const ear = merge([paint(ell(0.135, 0.145, 0.026, 16, 10), '#33467c'), paint(at(ell(0.1, 0.11, 0.02, 14, 8), 0, -0.01, 0.014), '#f39ac0')]);
        ear.rotateY(sd * -0.25);
        ear.rotateZ(sd * -0.32);
        ear.translate(sd * 0.115, 0.43, 0.08);
        b.add('ears', 'g', ear);
      }
      node('b', body);
      node('ears', body, 0, 0.3, 0.12, true, true);
      const tail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0.03, -0.16), V(0.05, 0.12, -0.3), V(0.0, 0.23, -0.36), V(-0.06, 0.24, -0.28), V(-0.03, 0.18, -0.25)]), 30, 0.017, 5, false);
      b.add('tail', 'g', paint(tail, '#2a3866'));
      node('tail', body, 0, 0.15, -0.26);
      t.height = 0.58;
      t.style = 'run';
      t.hop = 0.07;
      t.hops = 2;
      break;
    }
    case 'bubble': {
      const R = 0.42, cy = 0.44;
      const film: Painter = (p, n) => _c.setHSL(0.7 + Math.sin(Math.atan2(n.z, n.x) * 1.5 + n.y * 3) * 0.09, 0.55, 0.62 + n.y * 0.12);
      b.add('film', 'h', paint(at(sph(R, 32, 22), 0, cy, 0), film, 0.12));
      b.add('film', 'h', paint(at(scl(sph(R * 0.22, 12, 8), 1, 0.65, 0.3), -R * 0.42, cy + R * 0.52, R * 0.66), '#ffffff', 1.2));
      eyes2(b, 'face', 'g', 0.12, cy + 0.09, Math.sqrt(R * R - 0.0144 - 0.0081) - 0.01, 0.07);
      stitchX(b, 'face', 'g', 0, cy - 0.07, Math.sqrt(R * R - 0.0049) - 0.004, 0.055);
      // little blots swirling inside, and a ribbon of ink
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const d = merge([paint(lathe([[0, 0], [0.06, 0.01], [0.075, 0.05], [0.05, 0.1], [0.015, 0.13], [0, 0.135]], 12), grad('#1b1433', '#4c3d86', 0, 0.13)), paint(at(sph(0.016, 6, 4), -0.025, 0.07, 0.06), '#ffffff', 0.5), paint(at(sph(0.016, 6, 4), 0.025, 0.07, 0.06), '#ffffff', 0.5)]);
        d.rotateY(-a);
        d.translate(Math.cos(a) * 0.19, -0.08 + (i % 2) * 0.1, Math.sin(a) * 0.19);
        b.add('swirl', 'g', d);
      }
      b.add('swirl', 'g', paint(torus(0.24, 0.022, 6, 36, Math.PI * 1.5).rotateX(Math.PI / 2 - 0.3), '#2a2050'));
      node('film', body, 0, 0, 0, false);
      node('face', body);
      node('swirl', body, 0, cy, 0);
      t.height = 0.9;
      t.hop = 0.1;
      t.glass = 0.42;
      t.rim = '#f0d8ff';
      t.rimK = 0.7;
      break;
    }
    case 'moth': {
      // a plump fuzzy body, a fluffy collar, big dusty wings with eyespots
      b.add('b', 'm', paint(scl(sph(0.105, 16, 12), 1, 1, 1.15), '#5a5078'));
      b.add('b', 'm', paint(at(ell(0.08, 0.08, 0.16, 14, 10), 0, -0.02, -0.17), grad('#3a3258', '#8d84aa', -0.08, 0.05)));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        b.add('b', 'm', paint(at(sph(0.05, 8, 6), Math.cos(a) * 0.09, 0.02 + Math.sin(a) * 0.08, 0.07), '#ece6f8'));
      }
      b.add('b', 'g', paint(at(sph(0.085, 14, 10), 0, 0.03, 0.15), '#2c2546'));
      eyes2(b, 'b', 'g', 0.044, 0.055, 0.21, 0.042);
      stitchX(b, 'b', 'g', 0, -0.012, 0.225, 0.027);
      const base = new THREE.Color('#aa9fc6'), dark = new THREE.Color('#2a2346'), pale = new THREE.Color('#f4efff'), mid = new THREE.Color('#6f6299');
      const dust = (x: number, z: number) => {
        const v = Math.sin(x * 531 + z * 717) * 43758.5;
        return (v - Math.floor(v) - 0.5) * 0.12;
      };
      const spot = (cx: number, cz: number, r: number) => (tt: number, x: number, z: number) => {
        const d = Math.hypot(x - cx, z - cz) / r;
        if (d < 0.4) return _c.copy(pale);
        if (d < 0.78) return _c.copy(dark);
        if (d < 1.0) return _c.copy(mid);
        _c.copy(base).lerp(tt > 0.84 ? pale : dark, tt > 0.84 ? 0.55 : 0.4 * (1 - tt));
        return _c.multiplyScalar(1 + dust(x, z));
      };
      const fore: [number, number][] = [[0, 0.08], [0.17, 0.2], [0.39, 0.23], [0.52, 0.15], [0.55, 0], [0.43, -0.1], [0.22, -0.09], [0.04, -0.04]];
      const hind: [number, number][] = [[0, -0.03], [0.14, -0.09], [0.3, -0.17], [0.36, -0.31], [0.25, -0.38], [0.11, -0.28], [0.03, -0.14]];
      for (const sd of [-1, 1]) {
        const c = new THREE.CatmullRomCurve3([V(sd * 0.03, 0.09, 0.17), V(sd * 0.09, 0.21, 0.24), V(sd * 0.17, 0.27, 0.2)]);
        b.add('b', 'g', paint(new THREE.TubeGeometry(c, 10, 0.007, 4, false), '#2c2546'));
        for (let k = 1; k < 7; k++) {
          const q = c.getPoint(k / 7);
          b.add('b', 'm', paint(at(capsule(0.004, 0.035, 2, 4).rotateZ(sd * 0.9), q.x + sd * 0.01, q.y + 0.01, q.z), '#d8d0ea'));
        }
        const w = merge([fan(fore, spot(0.3, 0.07, 0.1), undefined, 6), fan(hind, spot(0.21, -0.21, 0.07), undefined, 5)]);
        if (sd < 0) w.scale(-1, 1, 1);
        b.add(sd < 0 ? 'wingL' : 'wingR', 'd', w);
      }
      node('b', body);
      node('wingL', body, -0.08, 0.03, 0);
      node('wingR', body, 0.08, 0.03, 0);
      t.height = 0.32;
      t.style = 'fly';
      t.flap = 16;
      t.rim = '#efe6ff';
      break;
    }
    case 'scorpion': {
      const sand = new THREE.Color('#dcb274'), band = new THREE.Color('#a85c2e'), inkC = '#2a1f33';
      b.add('b', 'g', paint(at(ell(0.19, 0.08, 0.3, 18, 10), 0, 0.12, 0), inkC));
      for (let i = 0; i < 4; i++) {
        const z = 0.18 - i * 0.12;
        const cy = 0.17 - i * 0.008;
        b.add('b', 'g', paint(at(ell(0.21 - i * 0.02, 0.09, 0.1, 18, 10), 0, cy, z), (p) => _c.copy(sand).lerp(band, smooth(cy + 0.02, cy - 0.06, p.y))));
      }
      b.add('b', 'g', paint(at(ell(0.15, 0.085, 0.1, 16, 10), 0, 0.16, 0.27), (p) => _c.copy(sand).lerp(band, smooth(0.18, 0.1, p.y))));
      eyes2(b, 'b', 'g', 0.06, 0.225, 0.315, 0.045, { brow: 0.3 });
      stitchX(b, 'b', 'g', 0, 0.12, 0.355, 0.034, { pitch: -0.3 });
      for (const sd of [-1, 1]) {
        const arm = capsule(0.03, 0.13, 3, 6);
        arm.rotateX(Math.PI / 2);
        arm.rotateY(sd * 0.55);
        arm.translate(sd * 0.05, 0, 0.06);
        const up = ell(0.065, 0.032, 0.1, 12, 8);
        up.rotateY(sd * 0.25);
        up.translate(sd * 0.1, 0.012, 0.17);
        const lo = ell(0.04, 0.022, 0.075, 10, 6);
        lo.rotateY(sd * -0.15);
        lo.translate(sd * 0.075, -0.016, 0.18);
        b.add(sd < 0 ? 'clawL' : 'clawR', 'g', paint(arm, band), paint(up, sand), paint(lo, band));
        for (let i = 0; i < 3; i++) {
          const leg = capsule(0.014, 0.16, 2, 5);
          leg.rotateZ(sd * 1.05);
          leg.translate(sd * 0.25, 0.08, 0.1 - i * 0.12);
          b.add(sd < 0 ? 'legsL' : 'legsR', 'g', paint(leg, inkC));
        }
      }
      const pts = [V(0, 0.02, -0.02), V(0, 0.1, -0.1), V(0, 0.2, -0.12), V(0, 0.29, -0.08), V(0, 0.34, 0.0)];
      pts.forEach((p, i) => b.add('tail', 'g', paint(at(sph(0.062 - i * 0.006, 12, 8), p.x, p.y, p.z), (q) => _c.copy(sand).lerp(band, smooth(p.y + 0.02, p.y - 0.05, q.y)))));
      const sting = cone(0.035, 0.12, 8);
      sting.rotateX(Math.PI / 2 + 0.7);
      sting.translate(0, 0.31, 0.07);
      b.add('tail', 'g', paint(sting, '#1b1325', 0));
      b.add('tail', 'g', paint(at(sph(0.018, 8, 6), 0, 0.275, 0.11), '#b48cff', 1.5));
      node('b', body);
      node('clawL', body, -0.15, 0.14, 0.3);
      node('clawR', body, 0.15, 0.14, 0.3);
      node('legsL', body);
      node('legsR', body);
      node('tail', body, 0, 0.2, -0.26);
      root.scale.setScalar(1.3);
      t.height = 0.86;
      t.style = 'run';
      t.hop = 0.025;
      t.hops = 3;
      t.rim = '#ffe0b0';
      t.rimK = 0.4;
      break;
    }
    case 'whirl': {
      // a spinning dust devil: three twisting veils of sand, a lost mask turning inside
      const sandA = new THREE.Color('#f6e6bf'), sandB = new THREE.Color('#d0a262'), sandC = new THREE.Color('#8a5f34');
      for (let i = 0; i < 3; i++) {
        const k = 1 - i * 0.2;
        const prof: number[][] = [];
        for (let j = 0; j <= 16; j++) {
          const y = j / 16;
          prof.push([(0.04 + 0.42 * Math.pow(y, 1.35)) * k + Math.sin(y * 11 + i * 2) * 0.018, y * (1.06 - i * 0.08)]);
        }
        const g = lathe(prof, 30);
        const pa = g.attributes.position;
        for (let v = 0; v < pa.count; v++) {
          const y = pa.getY(v);
          if (y > 0.75) pa.setY(v, y + Math.sin(Math.atan2(pa.getZ(v), pa.getX(v)) * 7 + i) * 0.06 * (y - 0.75) * 4);
        }
        g.computeVertexNormals();
        b.add(`spin${i}`, 'h', paint(g, (q) => {
          let v = (Math.atan2(q.z, q.x) / (Math.PI * 2) + q.y * 1.5 + i * 0.33) % 1;
          if (v < 0) v += 1;
          return _c.copy(v < 0.2 ? sandC : v < 0.55 ? sandB : sandA);
        }, 0.04));
        node(`spin${i}`, body, 0, 0, 0, false);
      }
      b.add('mask', 'g', paint(scl(sph(0.15, 18, 12), 1, 1.22, 0.45), (q) => _c.set('#f3e8d2').multiplyScalar(0.85 + 0.2 * smooth(-0.15, 0.15, q.y))));
      for (const sd of [-1, 1]) b.add('mask', 'g', paint(at(scl(sph(0.035, 10, 8), 1, 1.5, 0.5), sd * 0.055, 0.04, 0.06), '#140e1e'));
      stitchX(b, 'mask', 'g', 0, -0.085, 0.06, 0.042, { col: '#2a1d30', hole: '#6a5a46' });
      node('mask', body, 0, 0.5, 0.08);
      for (let i = 0; i < 8; i++) {
        const a = i * 0.9, r = 0.3 + (i % 3) * 0.08;
        b.add('debris', 'g', paint(at(sph(0.022 + (i % 2) * 0.014, 6, 5), Math.cos(a) * r, 0.15 + i * 0.1, Math.sin(a) * r), i % 2 ? '#8a6a48' : '#c9a26a'));
      }
      b.add('debris', 'h', paint(at(torus(0.3, 0.06, 6, 24).rotateX(Math.PI / 2), 0, 0.04, 0), '#d8b884', 0.02));
      node('debris', body, 0, 0, 0, false);
      t.height = 1.1;
      t.style = 'spin';
      t.glass = 0.42;
      t.rim = '#ffe6b8';
      t.rimK = 0.35;
      break;
    }
    case 'echo': {
      const prof = [[0.0, 0.78], [0.12, 0.76], [0.2, 0.69], [0.245, 0.57], [0.255, 0.43], [0.265, 0.3], [0.3, 0.17], [0.33, 0.07], [0.34, 0.03]];
      const shell = () => {
        const g = lathe(prof, 30);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          if (y < 0.12) p.setY(i, y + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 6) * 0.035 * (1 - y / 0.12));
        }
        g.computeVertexNormals();
        return g;
      };
      b.add('ghost', 'h', paint(shell(), grad('#7fd8c4', '#d6fff4', 0.05, 0.75), 0.25));
      node('ghost', body, 0, 0, 0, false);
      eyes2(b, 'face', 'g', 0.085, 0.53, 0.205, 0.055);
      stitchX(b, 'face', 'g', 0, 0.37, profR(prof, 0.37) - 0.004, 0.045);
      node('face', body);
      [0.16, 0.33, 0.5].forEach((y, i) => {
        b.add(`ring${i}`, 'f', paint(torus(profR(prof, y) + 0.012, 0.011, 5, 32).rotateX(Math.PI / 2), '#eafff8', 1.1));
        node(`ring${i}`, body, 0, y, 0, false);
      });
      b.add('echo2', 'c', paint(shell(), '#bff5e8', 0.4));
      node('echo2', body, 0, 0, -0.06, false);
      t.height = 0.8;
      t.style = 'float';
      t.hover = 0.08;
      t.glass = 0.5;
      t.rim = '#d8fff4';
      t.rimK = 0.8;
      break;
    }
    case 'obelisk': {
      const stone = new THREE.Color('#c49a64'), inkC = new THREE.Color('#2a2038');
      b.add('b', 'g', paint(at(box(0.95, 0.16, 0.95), 0, 0.08, 0), '#9c7a52'));
      b.add('b', 'g', paint(at(box(0.72, 0.14, 0.72), 0, 0.23, 0), '#b08a5c'));
      const shaft = cyl(0.2, 0.32, 2.3, 4, ).rotateY(Math.PI / 4);
      shaft.translate(0, 1.45, 0);
      b.add('b', 'g', paint(facet(shaft), (p) => {
        _c.copy(stone).lerp(inkC, smooth(1.4, 2.6, p.y) * 0.85);
        if (Math.abs(p.y - 0.85) < 0.025 || Math.abs(p.y - 2.15) < 0.025) _c.multiplyScalar(0.6);
        return _c;
      }));
      b.add('b', 'g', paint(facet(cone(0.21, 0.32, 4).rotateY(Math.PI / 4).translate(0, 2.76, 0)), '#1e1830', 0.15));
      // carved X glyphs on the four faces
      for (let f = 0; f < 4; f++) {
        const a = (f * Math.PI) / 2;
        const glyph: Geo[] = [];
        for (const k of [-1, 1]) glyph.push(paint(box(0.34, 0.05, 0.02).rotateZ(k * 0.8), '#b394ff', 1.3));
        const g = merge(glyph);
        g.rotateX(-0.052);
        g.translate(0, 1.5, 0.187);
        g.rotateY(a);
        b.add('glyph', 'f', g);
      }
      // ink running down from the top
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3, r = 0.19;
        b.add('b', 'g', paint(at(capsule(0.018, 0.4 + (i % 3) * 0.25, 3, 5), Math.cos(a) * r, 2.25 - (i % 3) * 0.14, Math.sin(a) * r), '#1a1428'));
      }
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        b.add('b', 'm', paint(at(ell(0.28, 0.07, 0.2), Math.cos(a) * 0.5, 0.03, Math.sin(a) * 0.5), '#e0c08a'));
      }
      node('b', body);
      node('glyph', body, 0, 0, 0, false);
      b.add('tip', 'g', paint(new THREE.OctahedronGeometry(0.2, 0).scale(1, 1.7, 1), '#2a2050', 0.7));
      node('tip', body, 0, 3.15, 0);
      t.height = 3.4;
      t.style = 'static';
      t.rim = '#b9a0ff';
      t.rimK = 0.35;
      break;
    }
    // ── peaks: cold ──
    case 'wolf': {
      const ink: Painter = grad('#10152b', '#3a4876', 0.2, 0.55);
      b.add('b', 'g', paint(at(ell(0.13, 0.135, 0.27, 18, 12), 0, 0.34, -0.03), ink));
      b.add('b', 'g', paint(at(ell(0.15, 0.17, 0.15, 16, 12), 0, 0.37, 0.12), ink));
      b.add('b', 'g', paint(at(sph(0.12, 16, 12), 0, 0.47, 0.27), ink));
      b.add('b', 'g', paint(at(ell(0.06, 0.055, 0.12, 12, 8), 0, 0.43, 0.39), '#2c385f'));
      b.add('b', 'g', paint(at(sph(0.026, 8, 6), 0, 0.452, 0.505), '#05040a'));
      for (const sd of [-1, 1]) {
        const ear = cone(0.05, 0.13, 4);
        ear.rotateZ(sd * -0.3);
        ear.rotateX(-0.2);
        ear.translate(sd * 0.07, 0.6, 0.24);
        b.add('b', 'g', paint(ear, '#1c2444'));
      }
      eyes2(b, 'b', 'g', 0.056, 0.5, 0.36, 0.038, { small: 0.45, brow: 0.45, white: '#eaf8ff', glow: 0.35 });
      stitchX(b, 'b', 'g', 0, 0.395, 0.455, 0.034, { pitch: -0.35 });
      for (let i = 0; i < 7; i++) {
        const sh = cone(0.036 + (i < 3 ? 0.01 : 0), 0.21 - i * 0.016, 5);
        sh.translate(0, (0.21 - i * 0.016) / 2, 0);
        sh.rotateX(-0.75);
        sh.rotateZ((i % 2 ? 1 : -1) * 0.2);
        sh.translate(0, 0.5 - i * 0.02, 0.2 - i * 0.075);
        b.add('ice', 'c', paint(sh, (p) => _c.set('#7fcdff').lerp(new THREE.Color('#ffffff'), smooth(0.48, 0.68, p.y)), 0.7));
      }
      node('b', body);
      node('ice', body, 0, 0, 0, false);
      b.add('tail', 'g', paint(at(ell(0.06, 0.06, 0.17, 12, 8), 0, 0.03, -0.14), '#2c385f'));
      b.add('tail', 'c', paint(at(cone(0.03, 0.12, 5).rotateX(-1.6), 0, 0.05, -0.3), '#cfeeff', 0.5));
      node('tail', body, 0, 0.4, -0.27);
      for (let i = 0; i < 4; i++) {
        const sx = i % 2 ? 1 : -1, sz = i < 2 ? 0.15 : -0.17;
        b.add(`leg${i}`, 'g', paint(at(capsule(0.032, 0.2, 3, 6), 0, -0.13, 0), '#141a30'), paint(at(ell(0.04, 0.025, 0.055), 0, -0.26, 0.02), '#0a0d1a'));
        node(`leg${i}`, body, sx * 0.08, 0.3, sz);
      }
      t.height = 0.66;
      t.style = 'run';
      t.hop = 0.05;
      t.hops = 2;
      t.rim = '#cfeeff';
      t.rimK = 0.6;
      break;
    }
    case 'shell': {
      b.add('b', 'g', paint(at(ell(0.3, 0.12, 0.38, 18, 10), 0, 0.16, 0), '#1b1f33'));
      const dome = new THREE.SphereGeometry(0.42, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1.15).translate(0, 0.16, -0.04);
      b.add('b', 'g', paint(facet(dome), (p) => _c.set('#5fb0e4').lerp(new THREE.Color('#e2f6ff'), smooth(0.2, 0.55, p.y)), 0.04));
      b.add('b', 'g', paint(at(box(0.025, 0.04, 0.9), 0, 0.515, -0.04), '#20304a'));
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3 + 0.4;
        const { x, z } = { x: Math.cos(a) * 0.26, z: Math.sin(a) * 0.3 - 0.04 };
        b.add('b', 'm', paint(at(ell(0.07, 0.025, 0.06), x, 0.16 + 0.3 * Math.sqrt(Math.max(0, 1 - (x * x) / 0.176 - (z * z) / 0.233)), z), '#ffffff'));
      }
      for (let i = 0; i < 3; i++) b.add('b', 'c', paint(at(cone(0.04, 0.16, 5), 0.06 * (i - 1), 0.56, -0.25 + i * 0.18).rotateZ(0), '#dff6ff', 0.4));
      b.add('b', 'g', paint(at(sph(0.13, 14, 10), 0, 0.2, 0.39), '#1b1f33'));
      b.add('b', 'c', paint(at(cone(0.03, 0.1, 5).rotateX(0.6), 0, 0.33, 0.44), '#e8f8ff', 0.4));
      eyes2(b, 'b', 'g', 0.052, 0.24, 0.485, 0.04);
      stitchX(b, 'b', 'g', 0, 0.15, 0.505, 0.032, { pitch: -0.2 });
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
        const leg = capsule(0.032, 0.1, 2, 5);
        leg.rotateZ(sd * 0.6);
        leg.translate(sd * 0.3, 0.07, 0.15 - i * 0.15);
        b.add(sd < 0 ? 'legsL' : 'legsR', 'g', paint(leg, '#11141f'));
      }
      node('b', body);
      node('legsL', body);
      node('legsR', body);
      t.height = 0.6;
      t.style = 'run';
      t.hop = 0.03;
      t.hops = 1;
      t.rim = '#d8f4ff';
      t.rimK = 0.5;
      break;
    }
    case 'phantom': {
      const prof = [[0, 0.95], [0.12, 0.93], [0.22, 0.86], [0.28, 0.74], [0.29, 0.6], [0.27, 0.45], [0.22, 0.32], [0.15, 0.22], [0.09, 0.13], [0.04, 0.05], [0.0, 0.0]];
      b.add('ghost', 'h', paint(lathe(prof, 28), grad('#b8c2f0', '#f2f4ff', 0.1, 0.85), 0.3));
      for (const sd of [-1, 1]) {
        b.add(sd < 0 ? 'armL' : 'armR', 'h', paint(at(ell(0.055, 0.17, 0.05, 10, 8), 0, -0.14, 0).rotateZ(sd * 0.35), '#dfe4ff', 0.3));
      }
      node('ghost', body, 0, 0, 0, false);
      node('armL', body, -0.24, 0.66, 0, false);
      node('armR', body, 0.24, 0.66, 0, false);
      for (const sd of [-1, 1]) {
        b.add('eyes', 'g', paint(at(scl(sph(0.05, 12, 10), 0.9, 1.4, 0.4), sd * 0.09, 0.72, 0.262), '#141127'));
        b.add('eyes', 'g', paint(at(sph(0.013, 6, 4), sd * 0.09, 0.735, 0.282), '#a9bcff', 1.4));
      }
      stitchX(b, 'eyes', 'g', 0, 0.55, profR(prof, 0.55) - 0.002, 0.045, { col: '#40406a', hole: '#20203a' });
      node('eyes', body);
      t.height = 0.95;
      t.style = 'float';
      t.hover = 0.18;
      t.glass = 0.78;
      t.rim = '#e8ecff';
      t.rimK = 0.7;
      break;
    }
    case 'muffler': {
      const R = 0.33, cy = 0.38;
      const white = new THREE.Color('#f3f2f8'), speck = new THREE.Color('#6f6890');
      const hash = (p: THREE.Vector3) => {
        const v = Math.sin(p.x * 91.7 + p.y * 47.3 + p.z * 63.1) * 43758.5;
        return v - Math.floor(v);
      };
      b.add('b', 'm', paint(at(scl(sph(R, 30, 22), 1, 1.05, 0.96), 0, cy, 0), (p, n) => {
        _c.copy(white);
        if (n.z < 0.6 && hash(p) > 0.93) _c.lerp(speck, 0.8);
        return _c.multiplyScalar(1 - Math.max(0, -n.y) * 0.18);
      }));
      for (const sd of [-1, 1]) {
        const tf = cone(0.06, 0.16, 6);
        tf.translate(0, 0.08, 0);
        tf.rotateZ(sd * -0.5);
        tf.translate(sd * 0.15, cy + R * 0.92, 0.02);
        b.add('b', 'm', paint(tf, '#d9d6e6'));
        b.add('b', 'm', paint(at(ell(0.05, 0.15, 0.12).rotateZ(sd * 0.15), sd * 0.31, cy - 0.04, -0.03), '#e2e0ec'));
        b.add('b', 'm', paint(at(ell(0.05, 0.03, 0.07), sd * 0.1, 0.02, 0.1), '#8a7a6a'));
      }
      eyes2(b, 'b', 'g', 0.12, cy + 0.07, Math.sqrt(R * R - 0.0144 - 0.0049) * 0.96 - 0.012, 0.075, { lid: '#e8e6f0', lidK: 0.4, small: 0.5, pupil: '#1d1a2c' });
      const bk = cone(0.04, 0.08, 6).rotateX(Math.PI / 2 + 0.4);
      bk.translate(0, cy - 0.03, R * 0.98);
      b.add('b', 'm', paint(bk, '#8a8296'));
      stitchX(b, 'b', 'g', 0, cy - 0.04, R * 1.02, 0.05, { col: '#3a2a4a', hole: '#1d1626' });
      // earmuffs: a band over the head and two fuzzy muffs
      b.add('muffs', 'g', paint(torus(0.335, 0.026, 6, 28, Math.PI).translate(0, 0, 0), '#6c4cb0'));
      for (const sd of [-1, 1]) {
        b.add('muffs', 'm', paint(at(sph(0.11, 14, 10), sd * 0.34, 0, 0), '#f08ac6'));
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          b.add('muffs', 'm', paint(at(sph(0.04, 6, 5), sd * 0.4, Math.cos(a) * 0.07, Math.sin(a) * 0.07), '#f7a8d6'));
        }
      }
      node('b', body);
      node('muffs', body, 0, cy + 0.05, -0.01);
      t.height = 0.86;
      t.hop = 0.08;
      t.rim = '#e8e0ff';
      t.rimK = 0.45;
      break;
    }
    // ── forge: fire ──
    case 'ember': {
      const char = new THREE.Color('#241a1e'), lava = new THREE.Color('#ff7a2a');
      const crack = (p: THREE.Vector3) => Math.abs(Math.sin(p.x * 41 + p.z * 13) * Math.sin(p.y * 37 + p.z * 29));
      const eg = paint(sph(0.11, 16, 12), (p) => (crack(p) < 0.12 ? _c.copy(lava) : _c.copy(char)));
      const glowArr = eg.attributes.glow as THREE.BufferAttribute;
      const pa = eg.attributes.position;
      for (let i = 0; i < pa.count; i++) glowArr.setX(i, crack(V(pa.getX(i), pa.getY(i), pa.getZ(i))) < 0.12 ? 1.4 : 0);
      b.add('b', 'g', eg);
      b.add('b', 'g', paint(at(scl(sph(0.08, 12, 8), 1, 0.8, 0.5), 0, -0.04, 0.07), '#ff8a3a', 0.9));
      for (const sd of [-1, 1]) b.add('b', 'g', paint(at(cone(0.035, 0.1, 5).rotateZ(sd * -0.35), sd * 0.06, 0.11, 0.0), '#1c1416'));
      b.add('b', 'f', paint(at(cone(0.035, 0.11, 6), 0, 0.14, -0.02), '#ffc24a', 1.6));
      eyes2(b, 'b', 'g', 0.042, 0.03, 0.09, 0.032, { white: '#fff3a8', glow: 0.8, small: 0.45 });
      stitchX(b, 'b', 'g', 0, -0.03, 0.103, 0.024, { col: '#ffd9a0' });
      const outline: [number, number][] = ([[0, 0.05], [0.12, 0.09], [0.26, 0.07], [0.33, 0.02], [0.27, -0.04], [0.22, -0.01], [0.18, -0.08], [0.12, -0.04], [0.07, -0.09], [0.03, -0.04], [0, -0.05]] as [number, number][]).map(([x, z]) => [x * 1.45, z * 1.45] as [number, number]);
      const mem = new THREE.Color('#4a1418'), edge = new THREE.Color('#ff7a2a');
      for (const sd of [-1, 1]) {
        const w = fan(outline, (tt) => _c.copy(mem).lerp(edge, smooth(0.7, 1, tt)), (tt) => smooth(0.7, 1, tt) * 1.3, 4);
        const fingers: Geo[] = [];
        for (const [x, z] of [[0.48, 0.03], [0.32, -0.015], [0.17, -0.06]]) {
          const l = Math.hypot(x, z);
          const f = capsule(0.006, l, 2, 4);
          f.rotateZ(Math.PI / 2);
          f.rotateY(-Math.atan2(z, x));
          f.translate(x / 2, 0.004, z / 2);
          fingers.push(paint(f, '#120a0c'));
        }
        const g = merge([w, ...fingers]);
        if (sd < 0) g.scale(-1, 1, 1);
        b.add(sd < 0 ? 'wingL' : 'wingR', 'd', g);
      }
      node('b', body);
      node('wingL', body, -0.07, 0.02, 0);
      node('wingR', body, 0.07, 0.02, 0);
      t.height = 0.26;
      t.style = 'fly';
      t.flap = 30;
      t.rim = '#ffb070';
      t.rimK = 0.6;
      break;
    }
    case 'slug': {
      // a long lava slug: glowing skirt, one soft hump, a crust of black rock with burning seams
      const red = new THREE.Color('#3d1a24'), lava = new THREE.Color('#ff6a1f'), belly = new THREE.Color('#6a2a2a');
      const foot = paint(at(ell(0.3, 0.07, 0.74, 28, 10), 0, 0.06, -0.06), (q) => _c.copy(red).lerp(lava, smooth(0.075, 0.0, q.y)));
      glowBy(foot, (q) => smooth(0.075, 0.0, q.y) * 1.6);
      b.add('b', 'g', foot);
      b.add('b', 'g', paint(at(ell(0.25, 0.21, 0.6, 28, 16), 0, 0.17, -0.1), (q, nn) => _c.copy(red).lerp(belly, smooth(0.2, -0.6, nn.y) * 0.6)));
      b.add('b', 'g', paint(at(sph(0.2, 22, 16), 0, 0.27, 0.4), (q, nn) => _c.copy(red).lerp(belly, smooth(0.2, -0.6, nn.y) * 0.6)));
      for (let i = 0; i < 6; i++) {
        const z = -0.52 + i * 0.17;
        const yTop = 0.17 + 0.21 * Math.sqrt(Math.max(0, 1 - ((z + 0.1) / 0.6) ** 2));
        const rock = facet(new THREE.DodecahedronGeometry(0.1 + (i % 2) * 0.025, 0));
        rock.scale(1.35, 0.6, 1.0);
        rock.rotateY(i * 0.7);
        rock.translate((i % 2 ? 0.03 : -0.03), yTop + 0.02, z);
        b.add('crust', 'g', paint(rock, '#231d20'));
        if (i) b.add('crust', 'f', paint(at(sph(0.045, 8, 6).scale(2.2, 0.5, 0.6), 0, yTop - 0.005, z - 0.085), '#ff8a3a', 1.5));
      }
      for (const [x, z] of [[0.24, 0.1], [-0.25, -0.15], [0.2, -0.45], [-0.18, 0.3]]) b.add('b', 'f', paint(at(ell(0.03, 0.05, 0.03), x, 0.1, z), '#ffa040', 1.4));
      node('b', body);
      node('crust', body);
      for (const sd of [-1, 1]) {
        const st = paint(at(capsule(0.022, 0.15, 3, 6), 0, 0.075, 0), '#4a2430');
        const eyeG: Geo[] = [paint(at(sph(0.05, 12, 10), 0, 0.17, 0), '#f6f2ea', 0.15), paint(at(scl(sph(0.03, 10, 8), 1, 1, 0.5), 0, 0.17, 0.035), '#120d1c'), paint(at(sph(0.01, 6, 4), 0.012, 0.185, 0.05), '#ffffff', 1)];
        b.add(sd < 0 ? 'stalkL' : 'stalkR', 'g', st, ...eyeG);
        node(sd < 0 ? 'stalkL' : 'stalkR', body, sd * 0.08, 0.42, 0.42);
      }
      stitchX(b, 'b2', 'g', 0, 0.25, 0.59, 0.075, { pitch: -0.15 });
      b.add('b2', 'f', paint(at(capsule(0.012, 0.05, 2, 5), 0.05, 0.18, 0.585), '#ff8a3a', 1.5));
      node('b2', body);
      t.height = 0.66;
      t.style = 'crawl';
      t.rim = '#ffa060';
      t.rimK = 0.5;
      break;
    }
    case 'shield': {
      // a stout squire in a kettle helm, holding up an anvil as a shield
      const R = 0.25, cy = 0.29;
      b.add('b', 'g', paint(at(scl(sph(R, 24, 18), 1, 1.02, 0.96), 0, cy, 0), grad('#141526', '#394064', 0.1, 0.45)));
      const iron = new THREE.Color('#9aa0b4');
      b.add('b', 'x', paint(at(new THREE.SphereGeometry(0.24, 20, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1), 0, 0.43, 0), (q) => _c.copy(iron).multiplyScalar(0.7 + 0.4 * smooth(0.43, 0.62, q.y))));
      b.add('b', 'x', paint(at(cyl(0.35, 0.35, 0.022, 28), 0, 0.43, 0), '#7c8296'));
      b.add('b', 'x', paint(at(torus(0.35, 0.013, 5, 30).rotateX(Math.PI / 2), 0, 0.432, 0), '#5d6072'));
      b.add('b', 'x', paint(at(box(0.03, 0.03, 0.4), 0, 0.615, 0), '#5d6072'));
      b.add('b', 'g', paint(at(cone(0.035, 0.13, 6), 0, 0.69, -0.03), '#e0592a'));
      eyes2(b, 'b', 'g', 0.085, 0.335, 0.2, 0.06, { brow: 0.22, browCol: '#141526' });
      stitchX(b, 'b', 'g', 0, 0.2, 0.235, 0.045);
      for (const sd of [-1, 1]) b.add('b', 'x', paint(at(ell(0.07, 0.05, 0.1), sd * 0.1, 0.03, 0.04), '#3a3c4a'));
      const steel = new THREE.Color('#5c6072'), face = new THREE.Color('#c5c8d6');
      const anv = (q: THREE.Vector3) => (q.y > 0.175 ? _c.copy(face) : _c.copy(steel));
      b.add('shieldDisc', 'x', paint(at(box(0.46, 0.085, 0.09), 0, 0.14, 0), anv));
      b.add('shieldDisc', 'x', paint(at(cone(0.06, 0.22, 10).rotateZ(Math.PI / 2), -0.33, 0.15, 0), steel));
      b.add('shieldDisc', 'x', paint(at(box(0.06, 0.06, 0.09), 0.255, 0.14, 0), steel));
      b.add('shieldDisc', 'x', paint(at(box(0.17, 0.12, 0.08), 0, 0.04, 0), steel));
      b.add('shieldDisc', 'x', paint(at(box(0.38, 0.07, 0.1), 0, -0.05, 0), steel));
      b.add('shieldDisc', 'f', paint(at(box(0.44, 0.014, 0.094), 0, 0.184, 0), '#ff9a4a', 1.3));
      node('b', body);
      node('shieldDisc', body, 0.06, 0.25, 0.34);
      t.height = 0.78;
      t.hop = 0.08;
      t.rim = '#ffc090';
      t.rimK = 0.35;
      break;
    }
    case 'mender': {
      // a living bellows: two paddle boards hinged at the nozzle, pleated leather between them
      const tear = new THREE.Shape();
      tear.moveTo(0, 0.27);
      tear.bezierCurveTo(0.08, 0.2, 0.22, 0.03, 0.21, -0.13);
      tear.bezierCurveTo(0.2, -0.29, -0.2, -0.29, -0.21, -0.13);
      tear.bezierCurveTo(-0.22, 0.03, -0.08, 0.2, 0, 0.27);
      const wood = new THREE.Color('#4a3226');
      const board = () => paint(new THREE.ExtrudeGeometry(tear, { depth: 0.032, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2).translate(0, 0.032, 0), (q) => _c.copy(wood).multiplyScalar(0.85 + 0.25 * smooth(0, 0.032, q.y)));
      b.add('b', 'g', board().translate(0, 0.08, 0));
      const nozzle = cone(0.045, 0.16, 10).rotateX(Math.PI / 2);
      b.add('b', 'x', paint(at(nozzle, 0, 0.125, 0.33), '#c8913a'));
      b.add('b', 'g', paint(at(torus(0.06, 0.014, 5, 12, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI), 0, 0.098, -0.31), '#2a1d18'));
      for (const sd of [-1, 1]) b.add('b', 'g', paint(at(capsule(0.025, 0.05, 2, 5), sd * 0.1, 0.045, 0.0), '#2a1d18'), paint(at(ell(0.04, 0.02, 0.06), sd * 0.1, 0.012, 0.03), '#2a1d18'));
      // pleated leather: a teardrop column pinched toward the nozzle and folded like an accordion
      const lg = new THREE.ExtrudeGeometry(tear, { depth: 1, bevelEnabled: false, curveSegments: 12, steps: 8 }).rotateX(Math.PI / 2).translate(0, 1, 0);
      paint(lg, '#8a5a40');
      const lp = lg.attributes.position, lc = lg.attributes.color as THREE.BufferAttribute;
      const la = new THREE.Color('#c08a5a'), lb = new THREE.Color('#7a4a30');
      for (let i = 0; i < lp.count; i++) {
        const yn = lp.getY(i), z = lp.getZ(i);
        const h = 0.015 + (0.27 - z) * 0.3;
        const fold = Math.abs(((yn * 4) % 1) - 0.5) * 2;
        const k = 1 + 0.07 * fold;
        lp.setXYZ(i, lp.getX(i) * k, yn * h, z * (z < 0 ? k : 1));
        const c = fold > 0.5 ? la : lb;
        lc.setXYZ(i, c.r, c.g, c.b);
      }
      lg.computeVertexNormals();
      b.add('pleats', 'm', lg);
      stitchX(b, 'pleats', 'g', 0, 0.035, 0.205, 0.04);
      b.add('top', 'g', board().translate(0, 0, -0.25));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add('top', 'x', paint(at(sph(0.016, 6, 5), Math.cos(a) * 0.13, 0.034, Math.sin(a) * 0.15 - 0.35), '#d08a4a'));
      }
      b.add('top', 'g', paint(at(torus(0.06, 0.014, 5, 12, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI), 0, 0.016, -0.56), '#2a1d18'));
      eyes2(b, 'top', 'g', 0.07, 0.07, -0.09, 0.055);
      node('b', body);
      node('pleats', body, 0, 0.112, 0);
      node('top', body, 0, 0.12, 0.25).rotation.x = 0.3;
      b.add('lamp', 'f', paint(sph(0.055, 12, 10), '#7dff9a', 2));
      node('lamp', body, 0, 0.125, 0.45, false);
      root.scale.setScalar(1.35);
      t.height = 0.66;
      t.hop = 0.06;
      t.rim = '#c0ffcf';
      t.rimK = 0.3;
      break;
    }
    case 'mimic': {
      const d: BirdDef = { R: 0.26, sy: 1.08, leg: 0.045, body: '#3a3060', belly: '#4a3f78', beak: '#3a3060', feet: '#2a2346', cheek: '#4a3f78', iris: '#222', eye: 0.24, spread: 0.37, eyeUp: 0.28, wing: 0.7, lid: 0 };
      const B = bird(b, d, { curl: true });
      const g = grp('shadowBird');
      assembleBird(b, B, g);
      g.getObjectByName('stitch')!.visible = true;
      body.add(g);
      t.height = 0.66;
      t.rim = '#9d7bff';
      t.rimK = 0.4;
      break;
    }
    case 'knight': {
      const steel = new THREE.Color('#1d1a29'), trim = '#aa9fd8';
      for (const sd of [-1, 1]) {
        b.add(sd < 0 ? 'legL' : 'legR', 'x', paint(at(cyl(0.06, 0.07, 0.38, 10), 0, -0.2, 0), steel), paint(at(ell(0.08, 0.055, 0.13), 0, -0.4, 0.04), steel));
        node(sd < 0 ? 'legL' : 'legR', body, sd * 0.1, 0.44, 0);
      }
      const prof = [[0.0, 0.42], [0.2, 0.44], [0.25, 0.6], [0.265, 0.78], [0.225, 0.9], [0.12, 0.95], [0, 0.96]];
      b.add('b', 'x', paint(lathe(prof, 22), (p) => _c.copy(steel).multiplyScalar(0.9 + 0.5 * smooth(0.5, 0.85, p.y))));
      for (const y of [0.45, 0.9]) b.add('b', 'x', paint(at(torus(profR(prof, y) + 0.008, 0.016, 5, 26).rotateX(Math.PI / 2), 0, y, 0), trim));
      b.add('b', 'd', paint(at(box(0.22, 0.27, 0.012), 0, 0.62, profR(prof, 0.62) + 0.006), '#3d2470'));
      for (const k of [-1, 1]) b.add('b', 'f', paint(at(box(0.2, 0.03, 0.01).rotateZ(k * 0.85), 0, 0.64, profR(prof, 0.64) + 0.014), '#c3a4ff', 1.2));
      for (const sd of [-1, 1]) b.add('b', 'x', paint(at(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1.1), sd * 0.27, 0.86, 0), steel), paint(at(torus(0.118, 0.012, 5, 18).rotateX(Math.PI / 2), sd * 0.27, 0.865, 0), trim));
      // helmet with the porcelain mask inside
      b.add('b', 'x', paint(at(sph(0.17, 18, 14), 0, 1.09, -0.02), steel));
      b.add('b', 'g', paint(at(scl(sph(0.115, 16, 12), 1, 1.22, 0.45), 0, 1.07, 0.125), '#f3eff6'));
      for (const sd of [-1, 1]) b.add('b', 'g', paint(at(scl(sph(0.025, 8, 6), 1.5, 0.7, 0.4), sd * 0.045, 1.1, 0.172), '#120d1c'));
      for (const sd of [-1, 1]) b.add('b', 'g', paint(at(sph(0.009, 6, 4), sd * 0.045, 1.1, 0.18), '#b48cff', 1.6));
      stitchX(b, 'b', 'g', 0, 1.02, 0.172, 0.035, { col: '#2a2033', hole: '#5a4a6a' });
      for (let i = 0; i < 5; i++) b.add('b', 'g', paint(at(ell(0.035, 0.09 - Math.abs(i - 2) * 0.012, 0.05), 0, 1.25 + Math.sin((i / 4) * Math.PI) * 0.04, 0.08 - i * 0.07).rotateX(0), '#7a4ad8'));
      node('b', body);
      const capeG = box(0.42, 0.62, 0.015, ).translate(0, -0.31, 0);
      const cp = capeG.attributes.position;
      for (let i = 0; i < cp.count; i++) cp.setZ(i, cp.getZ(i) - Math.sin(cp.getX(i) * 9) * 0.02 * (-cp.getY(i)));
      capeG.computeVertexNormals();
      b.add('cape', 'd', paint(capeG, (p) => (p.y < -0.58 ? _c.set('#8d6ad8') : _c.set('#2a1a44'))));
      node('cape', body, 0, 0.92, -0.22);
      const shape = new THREE.Shape();
      shape.moveTo(-0.16, 0.22);
      shape.quadraticCurveTo(0, 0.3, 0.16, 0.22);
      shape.lineTo(0.15, -0.05);
      shape.quadraticCurveTo(0.1, -0.22, 0, -0.3);
      shape.quadraticCurveTo(-0.1, -0.22, -0.15, -0.05);
      shape.lineTo(-0.16, 0.22);
      const sg = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 1 });
      b.add('shieldK', 'x', paint(sg, (p) => (p.z > 0.04 && Math.abs(p.x) < 0.13 && p.y < 0.19 && p.y > -0.22 ? _c.copy(steel) : _c.set(trim))));
      for (const k of [-1, 1]) b.add('shieldK', 'f', paint(at(box(0.25, 0.035, 0.01).rotateZ(k * 0.9), 0, 0, 0.065), '#c3a4ff', 1.3));
      node('shieldK', body, 0.29, 0.62, 0.16).rotation.y = -0.35;
      t.height = 1.36;
      t.style = 'march';
      t.rim = '#b9a6ff';
      t.rimK = 0.55;
      break;
    }
    case 'conductor': {
      // a shadow maestro: long tailcoat, stiff collar, a wild mane, a porcelain half mask, a black baton
      const coat = '#120e1f';
      for (const sd of [-1, 1]) {
        b.add(sd < 0 ? 'legL' : 'legR', 'g', paint(at(cyl(0.03, 0.036, 0.52, 8), 0, -0.26, 0), '#0c0a14'), paint(at(ell(0.05, 0.03, 0.1), 0, -0.52, 0.04), '#0c0a14'), paint(at(cone(0.03, 0.08, 6).rotateX(Math.PI / 2), 0, -0.53, 0.15), '#0c0a14'));
        node(sd < 0 ? 'legL' : 'legR', body, sd * 0.075, 0.55, 0);
      }
      const prof = [[0, 0.5], [0.12, 0.5], [0.14, 0.6], [0.125, 0.76], [0.18, 0.94], [0.27, 1.08], [0.23, 1.16], [0.1, 1.2], [0, 1.21]];
      b.add('b', 'g', paint(lathe(prof, 24), (q, nn) => {
        const v = Math.max(0, (q.y - 0.72) * 0.36);
        if (nn.z > 0.3 && Math.abs(q.x) < v) return _c.set('#8a7fa8');
        return _c.set(coat).multiplyScalar(1 + 0.6 * smooth(0.9, 1.15, q.y));
      }));
      stitchX(b, 'b', 'g', 0, 0.95, profR(prof, 0.95) + 0.004, 0.035, { col: '#d9cff0' });
      for (const sd of [-1, 1]) {
        const col = cone(0.08, 0.24, 4);
        col.translate(0, 0.12, 0);
        col.rotateZ(sd * -0.35);
        col.rotateX(-0.25);
        col.translate(sd * 0.1, 1.17, -0.05);
        b.add('b', 'd', paint(col, (q) => _c.set(coat).lerp(new THREE.Color('#6a4ab8'), smooth(1.2, 1.4, q.y))));
      }
      b.add('b', 'g', paint(at(scl(sph(0.13, 18, 14), 1, 1.2, 1), 0, 1.36, 0.01), '#1a1428'));
      const mask = new THREE.SphereGeometry(0.135, 18, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.18, Math.PI * 0.34).scale(1, 1.2, 1);
      mask.translate(0, 1.36, 0.022);
      b.add('b', 'g', paint(mask, '#f1ecf4'));
      for (const sd of [-1, 1]) b.add('b', 'g', paint(at(scl(sph(0.026, 8, 6), 1.4, 0.75, 0.5), sd * 0.05, 1.4, 0.142), '#0c0814'), paint(at(sph(0.009, 6, 4), sd * 0.05, 1.4, 0.152), '#c9a8ff', 1.8));
      stitchX(b, 'b', 'g', 0, 1.27, 0.13, 0.03, { col: '#e8dff5' });
      for (let i = 0; i < 11; i++) {
        const sp = cone(0.045, 0.24 + (i % 3) * 0.07, 5);
        sp.translate(0, 0.12, 0);
        sp.rotateX(-1.0 - (i % 2) * 0.35);
        sp.rotateZ((i - 5) * 0.2);
        sp.translate(0, 1.47, -0.02);
        b.add('b', 'g', paint(sp, (q) => _c.set('#1a1428').lerp(new THREE.Color('#8a6ae8'), smooth(1.5, 1.75, q.y)), 0.2));
      }
      node('b', body);
      for (const sd of [-1, 1]) b.add('tails', 'd', paint(at(ell(0.07, 0.38, 0.016), sd * 0.06, -0.34, 0).rotateX(0.08).rotateZ(sd * 0.08), (q) => (q.y < -0.62 ? _c.set('#6a4ab8') : _c.set(coat))));
      node('tails', body, 0, 0.7, -0.17);
      for (const sd of [-1, 1]) {
        const part = sd < 0 ? 'armL' : 'armR';
        b.add(part, 'g', paint(at(capsule(0.034, 0.32, 3, 6), 0, -0.18, 0), coat), paint(at(sph(0.042, 10, 8), 0, -0.37, 0), '#d6cfe4'));
        if (sd > 0) {
          b.add(part, 'g', paint(at(cyl(0.006, 0.009, 0.46, 5), 0, -0.6, 0.02), '#06040a'));
          b.add(part, 'f', paint(at(sph(0.024, 8, 6), 0, -0.83, 0.02), '#b48cff', 2.4));
        }
        node(part, body, sd * 0.25, 1.1, 0);
      }
      t.height = 1.75;
      t.style = 'march';
      t.rim = '#b9a6ff';
      t.rimK = 0.6;
      break;
    }
    case 'bossBlot': {
      // the Great Blot: a hill of ink coiled around itself, tentacles curling up, the green shard in its crest
      const prof = [[0, 0], [0.6, 0.04], [0.92, 0.28], [0.98, 0.6], [0.92, 0.98], [0.75, 1.36], [0.5, 1.7], [0.22, 1.95], [0, 2.02]];
      const inkG = grad('#0a0716', '#43357c', 0.1, 2.0);
      b.add('b', 'g', paint(lathe(prof, 40), inkG));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const c = torus(0.15, 0.06, 6, 16, Math.PI * 1.35);
        c.rotateY(Math.PI / 2);
        c.rotateX(0.4);
        c.rotateY(a);
        c.translate(Math.sin(a) * 0.25, 1.95 + (i % 2) * 0.06, Math.cos(a) * 0.25 - 0.06);
        b.add('b', 'g', paint(c, '#5a4a9a'));
      }
      for (const [x, y, z, rz, rx] of [[0, 2.05, 0.18, 0, 0.35], [-0.12, 1.98, 0.2, 0.45, 0.4], [0.13, 1.97, 0.18, -0.5, 0.3]]) b.add('b', 'f', paint(new THREE.OctahedronGeometry(0.14, 0).scale(0.8, 1.9, 0.7).rotateX(rx).rotateZ(rz).translate(x, y + 0.08, z), '#86e05f', 1.7));
      eyes2(b, 'b', 'g', 0.3, 1.2, profR(prof, 1.2) - 0.07, 0.19, { brow: 0.45, small: 0.5 });
      // the mouth: a long seam sewn with three Xs
      b.add('b', 'g', paint(capsule(0.012, 0.7, 2, 4).rotateZ(Math.PI / 2).translate(0, 0.68, profR(prof, 0.68) - 0.005), '#2a1d30'));
      stitchX(b, 'b', 'g', 0, 0.68, profR(prof, 0.68) - 0.01, 0.2);
      for (const k of [-1, 1]) stitchX(b, 'b', 'g', k * 0.33, 0.7, profR(prof, 0.7) - 0.11, 0.12, { yaw: k * 0.4 });
      drips(b, 'b', 'g', [[0.65, 1.05, 0.55, 0.32], [-0.6, 1.15, 0.58, 0.42], [0.82, 0.55, 0.32, 0.28], [-0.25, 1.48, 0.6, 0.36], [-0.86, 0.66, -0.12, 0.3], [0.4, 1.3, -0.6, 0.4]], '#130e24');
      node('b', body);
      // coils of ink around its base
      for (let i = 0; i < 3; i++) {
        const c = torus(1.02 - i * 0.12, 0.15 - i * 0.03, 8, 44, Math.PI * (1.55 - i * 0.2));
        c.rotateX(Math.PI / 2 + 0.12 * (i % 2 ? 1 : -1));
        c.rotateY(i * 2.1);
        c.translate(0, 0.14 + i * 0.18, 0);
        b.add('coils', 'g', paint(c, grad('#120c24', '#3e3170', 0, 0.7)));
      }
      node('coils', body);
      // tentacles spiralling up around it, curling out at the tips
      for (let k = 0; k < 4; k++) {
        const pts: THREE.Vector3[] = [];
        // they sweep around the sides and the back, never across its face
        const a0 = Math.PI / 2 + 0.85 + k * ((Math.PI * 2 - 1.7 - 1.2) / 3);
        for (let i = 0; i <= 10; i++) {
          const s2 = i / 10;
          const a = a0 + s2 * 1.2;
          const r = 1.0 - s2 * 0.15 + Math.max(0, s2 - 0.72) * 1.6;
          pts.push(V(Math.cos(a) * r, 0.12 + s2 * (1.5 + (k % 2) * 0.4) - Math.max(0, s2 - 0.85) * 1.2, Math.sin(a) * r));
        }
        b.add(`tent${k}`, 'g', paint(taperTube(new THREE.CatmullRomCurve3(pts), 40, 0.17, 0.025, 8), grad('#0e0a1e', '#4a3b88', 0, 1.8)));
        node(`tent${k}`, body);
      }
      root.scale.setScalar(1.12);
      t.height = 2.35;
      t.hop = 0.09;
      t.rim = '#b8a2ff';
      t.rimK = 0.5;
      break;
    }
    case 'bossScarab': {
      // the Scarab: a rhinoceros beetle of gold and ink, the orange shard bursting from a crack in its shell
      const gold = new THREE.Color('#d8a440'), deep = new THREE.Color('#8a5a1e'), vein = new THREE.Color('#2a1838');
      const veins = (q: THREE.Vector3) => Math.min(Math.abs(Math.sin(q.z * 3.4 + Math.sin(q.x * 6) * 0.9)), Math.abs(Math.sin(q.x * 8.5 + q.z * 1.7)) * 1.4);
      b.add('b', 'g', paint(at(ell(0.72, 0.3, 0.95, 22, 12), 0, 0.36, 0), '#1c1424'));
      for (const sd of [-1, 1]) {
        const el = new THREE.SphereGeometry(1, 26, 16, sd < 0 ? Math.PI : 0, Math.PI, 0, Math.PI * 0.55);
        el.scale(0.8, 0.66, 1.0);
        el.translate(sd * 0.03, 0.42, -0.12);
        b.add('b', 'x', paint(el, (q) => (veins(q) < 0.07 ? _c.copy(vein) : _c.copy(deep).lerp(gold, smooth(0.45, 1.0, q.y)))));
      }
      b.add('b', 'f', paint(at(box(0.04, 0.05, 1.6), 0, 1.06, -0.15), '#ff9a3a', 1.2));
      for (const [x, y, z, rz, rx, sc] of [[0, 1.2, -0.25, 0, -0.35, 1], [-0.16, 1.12, -0.12, 0.5, -0.2, 0.65], [0.17, 1.13, -0.36, -0.55, -0.45, 0.7], [0.05, 1.12, 0.05, -0.2, 0.1, 0.5]]) {
        b.add('b', 'f', paint(new THREE.OctahedronGeometry(0.2 * sc, 0).scale(0.8, 2.0, 0.7).rotateX(rx).rotateZ(rz).translate(x, y + 0.1 * sc, z), '#ffb347', 1.9));
      }
      // pronotum and head with the great horn
      b.add('b', 'x', paint(at(ell(0.58, 0.34, 0.36, 22, 14), 0, 0.5, 0.82), (q) => (veins(q) < 0.06 ? _c.copy(vein) : _c.copy(deep).lerp(gold, smooth(0.45, 0.8, q.y) * 0.8))));
      b.add('b', 'g', paint(at(sph(0.3, 20, 14), 0, 0.42, 1.12), '#241a20'));
      const horn = new THREE.CatmullRomCurve3([V(0, 0.55, 1.22), V(0, 0.95, 1.42), V(0, 1.35, 1.36), V(0, 1.58, 1.12), V(0, 1.62, 0.95)]);
      b.add('b', 'g', paint(taperTube(horn, 24, 0.19, 0.03, 9), (q) => _c.set('#2a1d18').lerp(gold, smooth(0.7, 1.5, q.y))));
      const pinc = new THREE.CatmullRomCurve3([V(0, 0.82, 0.98), V(0, 1.05, 1.28), V(0, 1.12, 1.55), V(0, 1.02, 1.72)]);
      b.add('b', 'g', paint(taperTube(pinc, 16, 0.08, 0.015, 8), (q) => _c.set('#3a2a20').lerp(gold, smooth(0.9, 1.1, q.y))));
      for (const sd of [-1, 1]) b.add('b', 'g', paint(at(cone(0.06, 0.26, 7).rotateX(Math.PI / 2).rotateY(-sd * 0.55), sd * 0.16, 0.28, 1.36), '#2a1d18'));
      eyes2(b, 'b', 'g', 0.16, 0.5, 1.33, 0.085, { brow: 0.5, small: 0.48 });
      stitchX(b, 'b', 'g', 0, 0.3, 1.39, 0.09, { pitch: -0.35 });
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
        const z = 0.55 - i * 0.5;
        const leg = new THREE.CatmullRomCurve3([V(sd * 0.55, 0.3, z), V(sd * 0.8, 0.5, z + 0.05), V(sd * 0.95, 0.24, z + 0.1), V(sd * 1.0, 0.0, z + 0.16)]);
        b.add(sd < 0 ? 'legsL' : 'legsR', 'g', paint(taperTube(leg, 16, 0.11, 0.05, 7), '#1a1218'));
        b.add(sd < 0 ? 'legsL' : 'legsR', 'g', paint(at(cone(0.04, 0.12, 5).rotateZ(sd * 1.0), sd * 0.86, 0.46, z + 0.07), '#1a1218'));
      }
      node('b', body);
      node('legsL', body);
      node('legsR', body);
      t.height = 1.7;
      t.style = 'run';
      t.hop = 0.03;
      t.hops = 2;
      t.rim = '#ffd890';
      t.rimK = 0.4;
      break;
    }
    case 'bossMoth': {
      // the Moth Queen: a regal white mane, an ice crown with the cyan shard, vast dusty wings with long tails
      b.add('b', 'm', paint(scl(sph(0.3, 20, 14), 1, 1, 1.1), '#e9e6f2'));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        b.add('b', 'm', paint(at(sph(0.11, 10, 8), Math.cos(a) * 0.27, 0.04 + Math.sin(a) * 0.22, 0.17), i % 2 ? '#ffffff' : '#ecebf4'));
      }
      b.add('b', 'g', paint(at(ell(0.18, 0.18, 0.46, 16, 12), 0, -0.04, -0.5), (q) => (Math.floor((q.z + 2) / 0.12) % 2 ? _c.set('#4a4662') : _c.set('#c9c5d8'))));
      b.add('b', 'g', paint(at(sph(0.21, 18, 14), 0, 0.07, 0.36), '#34304a'));
      eyes2(b, 'b', 'g', 0.095, 0.11, 0.5, 0.08, { brow: 0.32, small: 0.5, white: '#f2fbff', glow: 0.35 });
      stitchX(b, 'b', 'g', 0, -0.02, 0.54, 0.065);
      for (let i = 0; i < 7; i++) {
        const h = 0.24 - Math.abs(i - 3) * 0.045;
        b.add('b', 'c', paint(cone(0.036, h, 5).translate(0, h / 2, 0).rotateZ((i - 3) * -0.28).translate((i - 3) * 0.05, 0.25, 0.3), '#cdeeff', 0.75));
      }
      b.add('b', 'f', paint(new THREE.OctahedronGeometry(0.08, 0).scale(1, 1.9, 0.7).translate(0, 0.26, 0.5), '#8fe2ff', 2.0));
      for (const sd of [-1, 1]) {
        const c = new THREE.CatmullRomCurve3([V(sd * 0.08, 0.22, 0.44), V(sd * 0.28, 0.62, 0.58), V(sd * 0.55, 0.74, 0.42)]);
        b.add('b', 'g', paint(new THREE.TubeGeometry(c, 14, 0.016, 5, false), '#34304a'));
        for (let k = 1; k < 10; k++) {
          const q = c.getPoint(k / 10);
          b.add('b', 'm', paint(at(capsule(0.009, 0.1, 2, 4).rotateZ(sd * 0.9), q.x + sd * 0.025, q.y + 0.025, q.z), '#dcd6ea'));
        }
        const base = new THREE.Color('#9e99b4'), dark = new THREE.Color('#3e3a56'), pale = new THREE.Color('#efebf8'), cyan = new THREE.Color('#8fe2ff');
        const K = 1.45;
        const fore = ([[0, 0.12], [0.3, 0.38], [0.7, 0.5], [1.05, 0.42], [1.25, 0.22], [1.2, 0.0], [0.95, -0.12], [0.5, -0.12], [0.1, -0.05]] as [number, number][]).map(([x, z]) => [x * K, z * K] as [number, number]);
        const hind = ([[0, -0.05], [0.3, -0.15], [0.62, -0.3], [0.7, -0.5], [0.55, -0.62], [0.42, -0.95], [0.32, -1.25], [0.26, -0.92], [0.2, -0.55], [0.05, -0.25]] as [number, number][]).map(([x, z]) => [x * K, z * K] as [number, number]);
        const dust = (x: number, z: number) => {
          const v = Math.sin(x * 331 + z * 517) * 43758.5;
          return (v - Math.floor(v) - 0.5) * 0.14;
        };
        const paintW = (cx: number, cz: number, r: number) => (tt: number, x: number, z: number) => {
          const d = Math.hypot(x - cx, z - cz) / r;
          if (d < 0.42) return _c.copy(cyan);
          if (d < 0.78) return _c.copy(dark);
          if (d < 1.0) return _c.copy(pale);
          const vein = Math.abs(Math.sin(Math.atan2(z, x) * 9)) < 0.08 && tt > 0.2 && tt < 0.85;
          _c.copy(base).lerp(tt > 0.86 ? pale : dark, tt > 0.86 ? 0.65 : 0.5 * (1 - tt));
          if (vein) _c.lerp(dark, 0.5);
          return _c.multiplyScalar(1 + dust(x, z));
        };
        const wf = fan(fore, paintW(0.72 * K, 0.17 * K, 0.16 * K), (tt) => (tt > 0.9 ? 0.15 : 0), 6);
        const wh = fan(hind, paintW(0.45 * K, -0.38 * K, 0.12 * K), (tt) => (tt > 0.9 ? 0.15 : 0), 6);
        const w = merge([wf, wh]);
        if (sd < 0) w.scale(-1, 1, 1);
        b.add(sd < 0 ? 'wingL' : 'wingR', 'd', w);
      }
      node('b', body);
      node('wingL', body, -0.24, 0.06, 0);
      node('wingR', body, 0.24, 0.06, 0);
      root.scale.setScalar(1.2);
      t.height = 1.2;
      t.style = 'fly';
      t.flap = 7;
      t.rim = '#e4f6ff';
      t.rimK = 0.3;
      break;
    }
    case 'bossGolem': {
      const stone = new THREE.Color('#5f5450'), lava = new THREE.Color('#ff6a1f');
      const crack = (p: THREE.Vector3) => Math.abs(Math.sin(p.x * 7.3 + p.y * 3.1) * Math.sin(p.z * 6.1 - p.y * 5.7));
      const rock = (g: Geo) => glowBy(paint(facet(g), (p) => (crack(p) < 0.06 ? _c.copy(lava) : _c.copy(stone).multiplyScalar(0.8 + 0.3 * smooth(0, 2.4, p.y))), 1.5), (p) => (crack(p) < 0.06 ? 1 : 0));
      for (const sd of [-1, 1]) {
        b.add(sd < 0 ? 'legL' : 'legR', 'g', rock(new THREE.IcosahedronGeometry(0.28, 1).scale(1, 1.45, 1).translate(0, -0.35, 0)), rock(box(0.46, 0.18, 0.56).translate(0, -0.72, 0.06)));
        node(sd < 0 ? 'legL' : 'legR', body, sd * 0.38, 0.8, 0);
      }
      b.add('b', 'g', rock(new THREE.IcosahedronGeometry(0.78, 1).scale(1.15, 1, 0.85).translate(0, 1.55, 0)));
      b.add('b', 'g', rock(new THREE.DodecahedronGeometry(0.25, 0).translate(0, 2.42, 0.1)));
      for (const sd of [-1, 1]) b.add('b', 'g', paint(at(sph(0.04, 8, 6), sd * 0.09, 2.45, 0.3), '#fff0a0', 1.8));
      stitchX(b, 'b', 'g', 0, 2.33, 0.31, 0.06, { pitch: -0.2 });
      b.add('b', 'f', paint(at(new THREE.OctahedronGeometry(0.17, 0).scale(1, 1.7, 0.7), 0, 1.62, 0.66), '#ff6a3a', 2.2));
      b.add('b', 'f', paint(at(torus(0.2, 0.03, 6, 20), 0, 1.62, 0.62), '#ffb070', 1.4));
      node('b', body);
      for (const sd of [-1, 1]) {
        const part = sd < 0 ? 'armL' : 'armR';
        b.add(part, 'g', rock(new THREE.IcosahedronGeometry(0.26, 0).translate(0, 0, 0)), rock(new THREE.IcosahedronGeometry(0.2, 1).scale(1, 1.6, 1).translate(0, -0.45, 0)), rock(new THREE.IcosahedronGeometry(0.3, 1).translate(0, -0.92, 0.06)));
        node(part, body, sd * 0.95, 2.0, 0);
      }
      t.height = 2.65;
      t.style = 'march';
      t.rim = '#ffb080';
      t.rimK = 0.35;
      break;
    }
    case 'silence':
      break;
  }
  return t;
}

/** the Golem's ink armour plates: separate meshes so they can fall off one by one */
function golemPlates(): THREE.Group {
  const g = grp('plates');
  const spots: [number, number, number, number, number][] = [
    [0.42, 1.35, 0.6, 0.55, 0.0], [-0.42, 1.35, 0.6, -0.55, 0.0], [0.0, 1.95, 0.52, 0, -0.5], [0.82, 2.24, 0.05, 0.5, -1.15], [-0.82, 2.24, 0.05, -0.5, -1.15],
  ];
  for (const [x, y, z, ry, rx] of spots) {
    const hex = facet(new THREE.CylinderGeometry(0.3, 0.36, 0.08, 6).rotateX(Math.PI / 2).scale(1, 1.15, 1));
    const geo = paint(hex, (q) => (Math.hypot(q.x, q.y) > 0.27 || q.z < 0 ? _c.set('#7a5ad8') : _c.set('#150f22')), 0);
    glowBy(geo, () => 0);
    const rim = paint(facet(new THREE.TorusGeometry(0.31, 0.022, 4, 6).scale(1, 1.15, 1).translate(0, 0, 0.045)), '#a98aff', 0.6);
    const gem = paint(new THREE.OctahedronGeometry(0.06, 0).scale(1, 1.4, 0.5).translate(0, 0, 0.05), '#b48cff', 1.2);
    const all = merge([geo, rim, gem]);
    all.rotateX(rx);
    all.rotateY(ry);
    geo.rotateX(rx);
    geo.rotateY(ry);
    const m = new THREE.Mesh(all, undefined);
    m.userData.mk = 'x';
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

const templates = new Map<EnemyKind, Tpl>();
/**
 * Material sets of creatures that left the stage, ready for the next one of the same kind: no
 * shader program is ever released (and recompiled) in the middle of a battle.
 */
const matPool = new Map<EnemyKind, CharMats[]>();
function template(kind: EnemyKind): Tpl {
  let t = templates.get(kind);
  if (!t) {
    t = buildTemplate(kind);
    if (kind === 'bossGolem') t.root.getObjectByName('body')!.add(golemPlates());
    templates.set(kind, t);
  }
  return t;
}

/**
 * The ink each creature bursts into when it turns back into golden notes.
 * INTEGRATION: journeyView's `INK` map (used by `fx.release`) only knows the v1 kinds; it can use this.
 */
export const CREATURE_INK: Record<EnemyKind, string> = {
  blot: '#3b3068', blotling: '#7a68c0', scurry: '#4a63a3', bubble: '#b9a6f0', moth: '#aa9fc6', scorpion: '#c49a5a', whirl: '#d0a262',
  echo: '#9fe6d4', obelisk: '#4a3d6a', wolf: '#3a4876', shell: '#7fc4ec', phantom: '#d9dfff', muffler: '#c9c4dc', ember: '#ff7a2a',
  slug: '#ff6a1f', shield: '#5c6072', mender: '#7dff9a', mimic: '#2a2346', knight: '#3d2470', conductor: '#6a4ab8',
  bossBlot: '#43357c', bossScarab: '#ffb347', bossMoth: '#8fe2ff', bossGolem: '#ff6a3a', silence: '#1d1a2b',
};

// ───────────────────────────── the view ─────────────────────────────

interface Sample {
  t: number;
  x: number;
  z: number;
}

export class EnemyView {
  readonly group: THREE.Group;
  private tpl: Tpl | null = null;
  private mats: CharMats | null = null;
  // INTEGRATION: journeyView can set `view.burrowed = enemy.burrowed` for the scorpions (sim
  // `burrow` ability) like it does for the Scarab, and call `setMimicKind(kind)` once the sim says
  // which instrument a Mimic copies. The Silence boss exposes its SilenceView as `silenceView`
  // (poses / reach / dissolve for its phases).
  private n: Record<string, THREE.Object3D> = {};
  private body!: THREE.Object3D;
  private height: number;
  private silence: SilenceView | null = null;
  private mimic: MusicianView | null = null;
  readonly flying: boolean;
  private hist: Sample[] = [];
  private flash = 0;
  private slowT = 0;
  private dir = 0;
  private hpBar: THREE.Group;
  private hpFill: THREE.Mesh;
  private shieldFill: THREE.Mesh;
  private aura: THREE.Mesh | null = null;
  private bubble: THREE.Mesh | null = null;
  hp = 1;
  shield = 0;
  /** view time at which it died / leaked (null: alive) */
  goneAt: number | null = null;
  leaked = false;
  revealed = true;
  burrowed = false;
  private sink = 0;
  private born = -1;
  private seed = Math.random() * 10;
  private speed = 0;
  readonly radius: number;
  visibleNow = false;
  readonly pos = new THREE.Vector3();

  constructor(readonly id: number, readonly kind: EnemyKind, readonly scale = 1) {
    this.group = new THREE.Group();
    this.flying = ENEMIES[kind].flying;
    this.radius = ENEMIES[kind].radius;
    if (kind === 'silence') {
      this.silence = new SilenceView();
      this.body = this.silence.group;
      this.group.add(this.body);
      this.height = 3.3;
    } else {
      const tpl = template(kind);
      this.tpl = tpl;
      const root = tpl.root.clone(true);
      this.mats = matPool.get(kind)?.pop() ?? new CharMats(tpl.rim, tpl.rimK, tpl.glass);
      this.mats.apply(root);
      root.traverse((o) => {
        if (o.name) this.n[o.name] = o;
      });
      this.body = this.n.body;
      this.group.add(root);
      this.height = tpl.height;
    }
    // ground rings of the creatures that mute towers or lead the others
    const def = ENEMIES[kind];
    const ringR = def.mute ? def.mute : kind === 'conductor' ? def.aura?.radius : undefined;
    if (ringR) {
      const r = ringR / 2.2;
      this.aura = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.06, r, 64),
        new THREE.MeshBasicMaterial({ color: kind === 'conductor' ? '#9d7bff' : '#8f8aa8', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      this.aura.rotation.x = -Math.PI / 2;
      this.aura.position.y = 0.05;
      this.group.add(this.aura);
    }
    if (kind === 'shield') {
      this.bubble = new THREE.Mesh(new THREE.SphereGeometry(2.6 / 2.2, 28, 16), new THREE.MeshBasicMaterial({ color: '#bcd6ff', transparent: true, opacity: 0.08, depthWrite: false }));
      this.bubble.position.y = 0.2;
      this.bubble.scale.y = 0.55;
      this.group.add(this.bubble);
    }
    this.group.scale.setScalar(scale);
    // health bar
    this.hpBar = new THREE.Group();
    const w = def.boss ? 1.6 : 0.6;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.04, 0.09), new THREE.MeshBasicMaterial({ color: '#1a1424', transparent: true, opacity: 0.75, depthTest: false }));
    this.hpFill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.06).translate(w / 2, 0, 0), new THREE.MeshBasicMaterial({ color: '#ff5a6a', depthTest: false, toneMapped: false }));
    this.hpFill.position.x = -w / 2;
    this.shieldFill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.035).translate(w / 2, 0, 0), new THREE.MeshBasicMaterial({ color: '#cfe2ff', depthTest: false, toneMapped: false }));
    this.shieldFill.position.set(-w / 2, 0.06, 0);
    bg.renderOrder = 20;
    this.hpFill.renderOrder = 21;
    this.shieldFill.renderOrder = 21;
    this.hpBar.add(bg, this.hpFill, this.shieldFill);
    this.hpBar.position.y = this.height + 0.25;
    this.hpBar.visible = false;
    this.group.add(this.hpBar);
    this.group.visible = false;
  }

  /** the Mimic becomes a dark copy of one of the player's musicians (null: a nameless shadow bird) */
  setMimicKind(kind: TowerKind | null): void {
    if (this.kind !== 'mimic') return;
    if (this.mimic) {
      this.mimic.group.removeFromParent();
      this.mimic.dispose();
      this.mimic = null;
    }
    const shadow = this.n.shadowBird;
    if (shadow) shadow.visible = !kind;
    if (!kind) return;
    const m = new MusicianView(kind, { level: 0 });
    m.setInk(1);
    m.pose = 'play';
    this.mimic = m;
    this.body.add(m.group);
  }

  /** show or hide the ground ring of a muting creature (cinematics hide it) */
  setAura(on: boolean) {
    if (this.aura) this.aura.visible = on;
  }

  /** the Silence itself (only for kind 'silence'): poses, reach, emerge, dissolve */
  get silenceView(): SilenceView | null {
    return this.silence;
  }
  /** the battle Silence looms and reaches by itself; cinematics set this false and pose it themselves */
  autoPose = true;

  push(t: number, x: number, z: number) {
    const last = this.hist[this.hist.length - 1];
    if (last && t <= last.t) {
      last.x = x;
      last.z = z;
      return;
    }
    this.hist.push({ t, x, z });
    if (this.born < 0) this.born = t;
    // keep about a second of history
    while (this.hist.length > 2 && this.hist[1].t < t - 1.2) this.hist.shift();
  }

  private at(t: number): Sample | null {
    const h = this.hist;
    if (!h.length || t < h[0].t - 1e-6) return null;
    if (t >= h[h.length - 1].t) return h[h.length - 1];
    for (let i = h.length - 2; i >= 0; i--) {
      if (h[i].t <= t) {
        const a = h[i], b = h[i + 1];
        const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return { t, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
      }
    }
    return h[0];
  }

  hit() {
    this.flash = 1;
  }

  slowed() {
    this.slowT = 1;
  }

  /** returns false when the view can be removed */
  update(dt: number, vt: number, beatPos: number, ground: (x: number, z: number) => number, toWorld: (x: number, z: number, y: number, out: THREE.Vector3) => void, camQuat: THREE.Quaternion): boolean {
    const s = this.at(vt);
    if (!s) {
      this.group.visible = false;
      this.visibleNow = false;
      return true;
    }
    if (this.goneAt !== null && vt >= this.goneAt) return false;
    this.group.visible = true;
    this.visibleNow = true;
    // heading and speed from recent motion
    const prev = this.at(vt - 0.12) ?? s;
    const dx = s.x - prev.x, dz = s.z - prev.z;
    const d2 = dx * dx + dz * dz;
    this.speed = damp(this.speed, Math.sqrt(d2) / 0.12, 6, dt);
    if (d2 > 1e-6) {
      const target = Math.atan2(dx, dz);
      let d = target - this.dir;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.dir += d * Math.min(1, dt * 10);
    }
    const age = vt - this.born;
    const appear = clamp01(age * 2.5);
    const bp = beatPos - Math.floor(beatPos);
    let y = ground(s.x, s.z);
    let sq = 1;
    const kind = this.kind;
    const sc = this.scale;
    const slow = 1 - this.slowT * 0.5;
    const tpl = this.tpl;
    const n = this.n;
    const t = vt + this.seed;
    if (this.silence) {
      y += (0.12 + Math.sin(vt * 1.4) * 0.08) * sc;
      const sv = this.silence;
      // it looms, and now and then reaches for what is ahead of it
      if (this.autoPose) {
        const cyc = (vt * 0.12 + this.seed) % 1;
        sv.pose = cyc > 0.72 ? 'reach' : 'loom';
        if (sv.pose === 'reach') {
          const ahead = new THREE.Vector3(Math.sin(this.dir) * 8, -1.5, Math.cos(this.dir) * 8).add(this.group.position);
          sv.reach(ahead);
        } else sv.reach(null);
      }
      sv.flash = this.flash;
      sv.update(dt, vt);
    } else if (tpl) {
      switch (tpl.style) {
        case 'fly': {
          y += (1.2 + Math.sin(vt * 2.2 + this.seed) * 0.12 + (kind === 'bossMoth' ? 0.5 : 0)) * sc;
          const flap = Math.sin(t * tpl.flap);
          const a = kind === 'bossMoth' ? 0.42 + flap * 0.4 : 0.1 + flap * 0.65;
          if (n.wingL) n.wingL.rotation.z = a;
          if (n.wingR) n.wingR.rotation.z = -a;
          this.body.position.y = -flap * 0.03;
          this.body.rotation.x = Math.sin(t * 1.7) * 0.08;
          if (kind === 'ember') {
            this.body.position.x = Math.sin(t * 13) * 0.03;
            this.body.rotation.z = Math.sin(t * 9) * 0.15;
          }
          break;
        }
        case 'float': {
          y += (tpl.hover + Math.sin(t * 2) * 0.05) * sc;
          this.body.rotation.z = Math.sin(t * 1.3) * 0.06;
          this.body.rotation.x = Math.min(0.25, this.speed * 0.05);
          break;
        }
        case 'spin':
          this.body.rotation.z = Math.sin(t * 2.1) * 0.08;
          break;
        case 'static':
          break;
        case 'crawl':
          break;
        case 'march': {
          const ph = beatPos * Math.PI;
          y += Math.abs(Math.sin(ph)) * 0.025 * sc * slow;
          this.body.rotation.z = Math.sin(ph) * 0.05;
          if (n.legL) n.legL.rotation.x = Math.sin(ph) * 0.45 * slow;
          if (n.legR) n.legR.rotation.x = -Math.sin(ph) * 0.45 * slow;
          break;
        }
        default: {
          // hop on the beat; runners take several quick hops per beat
          const ph = (bp * tpl.hops) % 1;
          const hop = Math.sin(ph * Math.PI);
          y += hop * tpl.hop * sc * slow;
          const land = Math.exp(-ph * 8);
          sq = 1 + hop * 0.12 - land * 0.18 * (tpl.style === 'run' ? 0.5 : 1);
        }
      }
      this.animate(t, beatPos, bp, dt);
    }
    if (this.burrowed) this.sink = Math.min(1, this.sink + dt * 2);
    else this.sink = Math.max(0, this.sink - dt * 2);
    y -= this.sink * this.height * 0.9 * sc;
    toWorld(s.x, s.z, y, this.pos);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.dir;
    if (!this.silence) this.body.scale.set(appear * (2 - sq), appear * sq, appear * (2 - sq));
    else this.body.scale.setScalar(appear);
    // hit flash & slow tint
    this.flash = Math.max(0, this.flash - dt * 7);
    this.slowT = Math.max(0, this.slowT - dt * 0.6);
    const u = this.mats?.u;
    if (u) {
      u.uFlash.value.setRGB(this.flash * 0.68, this.flash * 0.62, this.flash * 0.5);
      u.uSlow.value = this.slowT * 0.85;
    }
    if (this.mimic) {
      this.mimic.mats.u.uFlash.value.setRGB(this.flash * 0.68, this.flash * 0.62, this.flash * 0.5);
      this.mimic.mats.u.uSlow.value = this.slowT * 0.85;
      this.mimic.update(dt, vt, beatPos);
    }
    // camouflage: the phantom is a faint shimmer until a bell or the choir reveals it
    if (kind === 'phantom' && this.mats) {
      const m = this.mats.get('h');
      m.opacity = damp(m.opacity, this.revealed ? 0.8 : 0.14, 6, dt);
      if (n.eyes) n.eyes.scale.setScalar(damp(n.eyes.scale.x, this.revealed ? 1 : 0.75, 6, dt));
    }
    if (this.bubble) {
      this.bubble.visible = this.shield > 0.01;
      this.bubble.rotation.y = vt * 0.3;
    }
    if (this.aura) {
      this.aura.rotation.z = vt * 0.4;
      if (kind === 'conductor') {
        const p = Math.exp(-((((beatPos % 4) + 4) % 4) * 3));
        this.aura.scale.setScalar(1 + p * 0.06);
        (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.25 + p * 0.5;
      }
    }
    // health bar faces the camera
    const show = (this.hp < 0.999 || this.shield > 0.001) && this.goneAt === null;
    this.hpBar.visible = show;
    if (show) {
      this.hpBar.quaternion.copy(camQuat);
      this.hpBar.quaternion.premultiply(this.group.quaternion.clone().invert());
      this.hpFill.scale.x = Math.max(0.001, this.hp);
      (this.hpFill.material as THREE.MeshBasicMaterial).color.setHSL(0.0 + this.hp * 0.3, 0.85, 0.58);
      this.shieldFill.scale.x = Math.max(0.001, this.shield);
      this.shieldFill.visible = this.shield > 0.001;
    }
    return true;
  }

  /** what each creature does with its parts */
  private animate(t: number, beat: number, bp: number, _dt: number) {
    const n = this.n;
    const fast = Math.min(2, this.speed * 0.35 + 0.4);
    switch (this.kind) {
      case 'blot':
      case 'blotling':
        break;
      case 'scurry':
        if (n.tail) n.tail.rotation.y = Math.sin(t * 14) * 0.35;
        if (n.ears) n.ears.rotation.x = Math.sin(bp * Math.PI * 4) * 0.12;
        break;
      case 'bubble':
        if (n.swirl) {
          n.swirl.rotation.y = t * 1.6;
          n.swirl.rotation.x = Math.sin(t * 0.7) * 0.4;
        }
        if (n.film) n.film.scale.set(1 + Math.sin(t * 5) * 0.035, 1 - Math.sin(t * 5) * 0.035, 1 + Math.cos(t * 4.3) * 0.03);
        break;
      case 'scorpion': {
        const w = t * 16 * fast;
        if (n.legsL) n.legsL.rotation.x = Math.sin(w) * 0.25;
        if (n.legsR) n.legsR.rotation.x = -Math.sin(w) * 0.25;
        if (n.tail) n.tail.rotation.x = Math.sin(t * 2.2) * 0.12 + 0.05;
        const snap = Math.max(0, Math.sin(t * 3.1)) ** 8;
        if (n.clawL) n.clawL.rotation.y = 0.25 * snap;
        if (n.clawR) n.clawR.rotation.y = -0.25 * Math.max(0, Math.sin(t * 3.1 + 1.5)) ** 8;
        break;
      }
      case 'whirl':
        for (let i = 0; i < 3; i++) if (n[`spin${i}`]) n[`spin${i}`].rotation.y = -t * (9 - i * 2.5);
        if (n.debris) n.debris.rotation.y = -t * 4;
        if (n.mask) {
          n.mask.rotation.y = Math.sin(t * 0.9) * 0.5;
          n.mask.position.y = 0.52 + Math.sin(t * 2.3) * 0.04;
        }
        break;
      case 'echo': {
        for (let i = 0; i < 3; i++) {
          const r = n[`ring${i}`];
          if (r) r.scale.setScalar(1 + Math.max(0, Math.sin(t * 4 - i * 0.9)) * 0.12);
        }
        const k = (t * 0.6) % 1;
        if (n.echo2 && this.mats) {
          n.echo2.scale.setScalar(1.02 + k * 0.35);
          n.echo2.position.z = -0.06 - k * 0.25;
          this.mats.get('c').opacity = 0.42 * (1 - k);
        }
        break;
      }
      case 'obelisk':
        if (n.tip) {
          n.tip.rotation.y = t * 0.8;
          n.tip.position.y = 3.15 + Math.sin(t * 1.5) * 0.1;
        }
        if (this.mats) this.mats.flashK.value = 0.7 + Math.sin(t * 2) * 0.3;
        break;
      case 'wolf': {
        const g = beat * Math.PI * 2 * 2;
        for (let i = 0; i < 4; i++) {
          const l = n[`leg${i}`];
          if (l) l.rotation.x = Math.sin(g + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.5) * 0.7;
        }
        this.body.rotation.x = Math.sin(g) * 0.06;
        if (n.tail) n.tail.rotation.x = 0.2 + Math.sin(g + 1) * 0.2;
        break;
      }
      case 'shell': {
        const w = t * 6;
        if (n.legsL) n.legsL.rotation.x = Math.sin(w) * 0.3;
        if (n.legsR) n.legsR.rotation.x = -Math.sin(w) * 0.3;
        this.body.rotation.z = Math.sin(w) * 0.04;
        break;
      }
      case 'phantom':
        if (n.armL) n.armL.rotation.z = -0.2 + Math.sin(t * 1.6) * 0.25;
        if (n.armR) n.armR.rotation.z = 0.2 - Math.sin(t * 1.6 + 0.7) * 0.25;
        if (n.ghost) n.ghost.rotation.y = Math.sin(t * 1.1) * 0.15;
        break;
      case 'muffler':
        this.body.rotation.z = Math.sin(beat * Math.PI) * 0.1;
        if (n.muffs) n.muffs.scale.setScalar(1 + Math.exp(-bp * 5) * 0.05);
        break;
      case 'ember':
        break;
      case 'slug': {
        const w = Math.sin(t * 2.6);
        if (n.b) n.b.scale.set(1 - w * 0.03, 1 + w * 0.05, 1 + w * 0.07);
        if (n.crust) {
          n.crust.scale.set(1 - w * 0.03, 1 + w * 0.04, 1 + w * 0.07);
          n.crust.position.y = w * 0.012;
        }
        if (n.stalkL) n.stalkL.rotation.z = Math.sin(t * 2.3) * 0.25 + 0.15;
        if (n.stalkR) n.stalkR.rotation.z = Math.sin(t * 2.1 + 1) * 0.25 - 0.15;
        if (this.mats) this.mats.flashK.value = 0.8 + Math.sin(t * 2.5) * 0.3;
        break;
      }
      case 'shield':
        if (n.shieldDisc) n.shieldDisc.position.y = 0.28 + Math.sin(beat * Math.PI) * 0.015;
        break;
      case 'mender': {
        const puff = Math.exp(-bp * 5);
        if (n.top) n.top.rotation.x = 0.3 - puff * 0.2;
        if (n.pleats) n.pleats.scale.y = 1 - puff * 0.6;
        if (n.lamp) n.lamp.scale.setScalar(0.6 + puff * 0.9);
        break;
      }
      case 'mimic':
        break;
      case 'knight':
        if (n.cape) n.cape.rotation.x = 0.12 + Math.sin(t * 2) * 0.06 + Math.min(0.3, this.speed * 0.08);
        if (n.shieldK) n.shieldK.position.y = 0.62 + Math.sin(beat * Math.PI) * 0.015;
        break;
      case 'conductor': {
        // a sharp 4/4 beat pattern with the black baton
        const b4 = ((beat % 4) + 4) % 4;
        const bi = Math.floor(b4), f = b4 - bi;
        const e = 1 - Math.pow(1 - f, 3);
        const P = [[0.2, -2.2], [0.5, -1.2], [-0.4, -1.4], [0.1, -2.6]];
        const a = P[(bi + 3) % 4], c = P[bi];
        if (n.armR) {
          n.armR.rotation.z = a[0] + (c[0] - a[0]) * e;
          n.armR.rotation.x = a[1] + (c[1] - a[1]) * e;
        }
        if (n.armL) {
          n.armL.rotation.z = -0.4 - Math.sin(beat * Math.PI) * 0.2;
          n.armL.rotation.x = -0.6;
        }
        if (n.tails) n.tails.rotation.x = 0.1 + Math.sin(t * 3) * 0.06;
        break;
      }
      case 'bossBlot':
        if (n.coils) {
          n.coils.rotation.y = t * 0.3;
          n.coils.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
        }
        for (let k = 0; k < 4; k++) {
          const tn = n[`tent${k}`];
          if (tn) {
            tn.rotation.y = Math.sin(t * 0.8 + k) * 0.12;
            tn.scale.y = 1 + Math.sin(t * 1.6 + k * 1.3) * 0.06;
          }
        }
        if (this.mats) this.mats.flashK.value = 0.9 + Math.sin(t * 2.4) * 0.3;
        break;
      case 'bossScarab': {
        const w = t * 9 * fast;
        if (n.legsL) n.legsL.rotation.x = Math.sin(w) * 0.2;
        if (n.legsR) n.legsR.rotation.x = -Math.sin(w) * 0.2;
        if (this.mats) this.mats.flashK.value = 0.9 + Math.sin(t * 3) * 0.3;
        break;
      }
      case 'bossMoth':
        if (this.mats) this.mats.flashK.value = 0.9 + Math.sin(t * 2) * 0.3;
        break;
      case 'bossGolem': {
        const ph = beat * Math.PI * 0.5;
        if (n.armL) n.armL.rotation.x = Math.sin(ph) * 0.35;
        if (n.armR) n.armR.rotation.x = -Math.sin(ph) * 0.35;
        if (n.legL) n.legL.rotation.x = Math.sin(ph) * 0.3;
        if (n.legR) n.legR.rotation.x = -Math.sin(ph) * 0.3;
        this.body.rotation.z = Math.sin(ph) * 0.05;
        if (this.mats) this.mats.flashK.value = 0.9 + Math.sin(t * 2.2) * 0.35;
        break;
      }
    }
  }

  /** golem: plates fall off */
  dropPlate(): THREE.Object3D | null {
    const p = this.n.plates as THREE.Group | undefined;
    if (!p || !p.children.length) return null;
    const plate = p.children[p.children.length - 1];
    p.remove(plate);
    return plate;
  }

  dispose() {
    // geometry is shared with the template; the materials go back to the pool, the bar is ours
    if (this.mats) {
      const u = this.mats.u;
      u.uFlash.value.setScalar(0);
      u.uSlow.value = 0;
      if (this.kind === 'phantom') this.mats.get('h').opacity = this.mats.glassOpacity;
      let pool = matPool.get(this.kind);
      if (!pool) matPool.set(this.kind, (pool = []));
      if (pool.length < 48) pool.push(this.mats);
      else this.mats.dispose();
      this.mats = null;
    }
    this.mimic?.dispose();
    this.silence?.dispose();
    if (this.aura) (this.aura.material as THREE.Material).dispose();
    if (this.bubble) (this.bubble.material as THREE.Material).dispose();
    this.hpBar.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
