/**
 * The creatures' modelling kit (shared by the bestiary in enemies.ts and the mini-bosses in
 * minibosses.ts): painted lathes, eyes, the X-stitched mouth, membranes, tapered tubes, drips, and
 * the template record every creature kind is built into.
 */
import * as THREE from 'three';
import { at, capsule, scl, sph } from './kit';
import { Bins, merge, paint, place, smooth, type MK, type Painter } from './musicians';

export type Geo = THREE.BufferGeometry;
export type Col = THREE.ColorRepresentation;

export const _c = new THREE.Color();
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** vertical gradient */
export const grad = (a: Col, b: Col, y0: number, y1: number): Painter => {
  const A = new THREE.Color(a), B = new THREE.Color(b);
  return (p) => _c.copy(A).lerp(B, smooth(y0, y1, p.y));
};

/** a lathe body from [radius, height] pairs */
export function lathe(pts: number[][], seg = 26): Geo {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** radius of a lathe profile at height y */
export function profR(pts: number[][], y: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  }
  return pts[0][0];
}

/** faceted (flat-shaded) version of a geometry */
export function facet(g: Geo): Geo {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('normal');
  n.computeVertexNormals();
  return n;
}

/** two creature eyes facing +z centred at (±s, y, z) */
export function eyes2(
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
export function stitchX(b: Bins, part: string, mk: MK, x: number, y: number, z: number, s: number, o: { pitch?: number; yaw?: number; col?: Col; hole?: Col; n?: THREE.Vector3 } = {}) {
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
export function fan(outline0: [number, number][], color: (t: number, x: number, z: number) => THREE.Color, glow: (t: number) => number = () => 0, rings0 = 4): Geo {
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
export function taperTube(curve: THREE.Curve<THREE.Vector3>, segs: number, r0: number, r1: number, radial = 8): Geo {
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
export function drips(b: Bins, part: string, mk: MK, list: [number, number, number, number][], col: Col) {
  for (const [x, y, z, l] of list) {
    b.add(part, mk, paint(at(capsule(l * 0.12, l, 3, 6), x, y - l / 2, z), col));
    b.add(part, mk, paint(at(sph(l * 0.2, 8, 6), x, y - l, z), col));
  }
}

// ───────────────────────────── templates ─────────────────────────────

export type Style = 'hop' | 'run' | 'fly' | 'float' | 'spin' | 'march' | 'crawl' | 'static';

export interface Tpl {
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
  /** bosses: how far in front of the origin its face / weapon is (sparks, strike point) */
  front?: number;
  /** bosses: how much of the generic whole-body act motion (lean, lunge) it takes (0 … 1) */
  actK?: number;
}

/** the boss duel's gestures (docs/DESIGN-v5.md §3) */
export type BossAct = 'enter' | 'tell' | 'blow' | 'parried' | 'stagger' | 'phase' | 'summon' | 'burrow' | 'emerge';

/**
 * What a boss is doing right now, as continuous channels (0 … 1) the per-kind animation reads:
 * EnemyView.bossAct() starts the envelopes, every creature turns them into its own gestures.
 */
export interface BossCh {
  /** tell: the wind-up held until the blow lands */
  wind: number;
  /** blow: the strike toward the colossus */
  strike: number;
  /** parried: thrown back */
  recoil: number;
  /** stagger: dizzy */
  dizzy: number;
  /** enter: the arrival roar */
  roar: number;
  /** phase: the transformation flourish */
  flourish: number;
  /** summon: calling its minions */
  summon: number;
  /** burrow: diving into the ground (stays 1 while under) */
  dive: number;
  /** emerge: bursting out of the ground */
  erupt: number;
  /** the current phase (setPhase) */
  phase: number;
  /** a pulse on every beat (1 on the beat, decaying) */
  pulse: number;
  /** the gargoyle: 0 alive … 1 stone */
  stone: number;
  /** how far it has sunk into the ground (0 … 1 of its height × 0.9) */
  sink: number;
}

export const noBossCh = (): BossCh => ({ wind: 0, strike: 0, recoil: 0, dizzy: 0, roar: 0, flourish: 0, summon: 0, dive: 0, erupt: 0, phase: 0, pulse: 0, stone: 0, sink: 0 });

/** orient a geometry built along +y so that +y points along `dir`, then move it to `p` */
export function alongY(g: Geo, p: THREE.Vector3, dir: THREE.Vector3): Geo {
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  return g.translate(p.x, p.y, p.z);
}

/** a point on the surface of an ellipsoid (centre c, radii r) seen from direction (dx, dy, dz), and its normal */
export function ellAt(c: THREE.Vector3, r: THREE.Vector3, dx: number, dy: number, dz: number): { p: THREE.Vector3; n: THREE.Vector3 } {
  const d = new THREE.Vector3(dx, dy, dz).normalize();
  const k = 1 / Math.sqrt((d.x / r.x) ** 2 + (d.y / r.y) ** 2 + (d.z / r.z) ** 2);
  const q = d.multiplyScalar(k);
  const n = new THREE.Vector3(q.x / (r.x * r.x), q.y / (r.y * r.y), q.z / (r.z * r.z)).normalize();
  return { p: q.add(c), n };
}

/** a glowing X glyph (the Silence's mark) facing `n` at `p` */
export function xGlyph(b: Bins, part: string, p: THREE.Vector3, n: THREE.Vector3, s: number, col: Col = '#b48cff', glow = 1.3) {
  const parts: Geo[] = [];
  for (const k of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(s, s * 0.2, s * 0.06).rotateZ(k * 0.78), col, glow));
  b.add(part, 'f', place(merge(parts), p, n));
}

/**
 * Make every triangle's winding agree with its vertex normals. Flat membranes (fans) mirrored with
 * scale(-1, 1, 1), or drawn clockwise, would otherwise show their back face with flipped normals on
 * double-sided materials: unlit, and washed out by the rim light.
 */
export function fixWinding(g: Geo): void {
  const pos = g.attributes.position, nor = g.attributes.normal;
  if (!nor) return;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), f = new THREE.Vector3();
  const tri = (i0: number, i1: number, i2: number) => {
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    f.subVectors(c, b).cross(a.clone().sub(b));
    if (f.lengthSq() < 1e-14) return false;
    n.fromBufferAttribute(nor, i0).add(b.fromBufferAttribute(nor, i1)).add(c.fromBufferAttribute(nor, i2));
    return f.normalize().dot(n.normalize()) < -0.3;
  };
  if (g.index) {
    const idx = g.index;
    for (let t = 0; t + 2 < idx.count; t += 3) {
      if (tri(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2))) {
        const s = idx.getX(t + 1);
        idx.setX(t + 1, idx.getX(t + 2));
        idx.setX(t + 2, s);
      }
    }
    idx.needsUpdate = true;
  } else {
    const attrs = Object.values(g.attributes) as THREE.BufferAttribute[];
    for (let t = 0; t + 2 < pos.count; t += 3) {
      if (!tri(t, t + 1, t + 2)) continue;
      for (const at of attrs) {
        for (let k = 0; k < at.itemSize; k++) {
          const s = at.getComponent(t + 1, k);
          at.setComponent(t + 1, k, at.getComponent(t + 2, k));
          at.setComponent(t + 2, k, s);
        }
        at.needsUpdate = true;
      }
    }
  }
}
