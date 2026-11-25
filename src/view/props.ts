/**
 * Low-poly prop geometry (trees, rocks, flowers, landmarks) built from primitives with baked vertex
 * colours. Every builder returns a single merged BufferGeometry with its base at y = 0.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';

export type PropKind =
  | 'treeRound' | 'treePine' | 'bush' | 'rock' | 'flower' | 'grass' | 'mushroom' | 'windmill' | 'house' | 'fence'
  | 'palm' | 'cactus' | 'dryBush' | 'mesa' | 'column' | 'arch' | 'pot'
  | 'pineSnow' | 'iceCrystal' | 'snowBush' | 'iceSpire'
  | 'deadTree' | 'obsidian' | 'lavaRock' | 'anvil' | 'chimney'
  | 'statue' | 'shard' | 'greyTree' | 'brokenColumn';

const C = (c: string | number) => new THREE.Color(c);

/** A stable pseudo-random value in [0,1) for a position and a salt. Per-vertex variation comes from
 *  this (not from the shared Rng), so the far, lighter version of a prop (fewer vertices) keeps
 *  exactly the same shape, sizes and colours as the near one. */
function hash3(x: number, y: number, z: number, salt: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + salt * 0.1234) * 43758.5453;
  return v - Math.floor(v);
}

// ── level of detail: far props are built with fewer segments (same silhouette) ──
let LODF = 1;
const segs = (n: number, min: number) => (LODF < 1 ? Math.max(min, Math.round(n * LODF)) : n);
const sphG = (r: number, w = 32, h = 16, ...rest: number[]) => new THREE.SphereGeometry(r, segs(w, 5), segs(h, 3), ...rest);
const cylG = (rt: number, rb: number, h: number, rs = 32, hs = 1, ...rest: [boolean?, number?, number?]) => new THREE.CylinderGeometry(rt, rb, h, segs(rs, 5), segs(hs, 1), ...rest);
const coneG = (r: number, h: number, rs = 32, hs = 1, ...rest: [boolean?, number?, number?]) => new THREE.ConeGeometry(r, h, segs(rs, 5), segs(hs, 1), ...rest);
const icoG = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, LODF < 1 ? Math.max(0, d - 1) : d);
const capG = (r: number, l: number, cs = 4, rs = 8) => new THREE.CapsuleGeometry(r, l, segs(cs, 2), segs(rs, 5));

/** Paint a geometry with one colour (optionally jittered per face for a hand-made look). */
export function paint(geo: THREE.BufferGeometry, color: THREE.Color | string, jitter = 0, rng?: Rng): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const base = typeof color === 'string' ? C(color) : color;
  const c = new THREE.Color();
  const pa = g.attributes.position as THREE.BufferAttribute;
  const salt = jitter ? (rng ? rng.next() : Math.random()) * 1000 : 0;
  for (let i = 0; i < n; i += 3) {
    c.copy(base);
    if (jitter) c.offsetHSL(0, 0, (hash3(pa.getX(i), pa.getY(i), pa.getZ(i), salt) - 0.5) * jitter);
    for (let k = 0; k < 3 && i + k < n; k++) {
      col[(i + k) * 3] = c.r;
      col[(i + k) * 3 + 1] = c.g;
      col[(i + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

/** Displace vertices randomly (keeps shared positions together by hashing them). */
export function jitter(geo: THREE.BufferGeometry, amount: number, rng: Rng): THREE.BufferGeometry {
  const p = geo.attributes.position as THREE.BufferAttribute;
  // shared positions move together because the offset is a function of the position itself
  const salt = rng.next() * 1000;
  for (let i = 0; i < p.count; i++) {
    const x = Math.round(p.getX(i) * 1000) / 1000, y = Math.round(p.getY(i) * 1000) / 1000, z = Math.round(p.getZ(i) * 1000) / 1000;
    const d = [(hash3(x, y, z, salt) - 0.5) * amount, (hash3(x, y, z, salt + 1.7) - 0.5) * amount, (hash3(x, y, z, salt + 3.1) - 0.5) * amount];
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  p.needsUpdate = true;
  return geo;
}

/** Paint by height: bottom colour → top colour, plus a little noise (painterly shading). */
export function gradient(geo: THREE.BufferGeometry, bottom: THREE.Color | string, top: THREE.Color | string, y0: number, y1: number, rng?: Rng, jitterAmt = 0.04): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position as THREE.BufferAttribute;
  const b = typeof bottom === 'string' ? C(bottom) : bottom;
  const t = typeof top === 'string' ? C(top) : top;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const salt = rng ? rng.next() * 1000 : 0;
  for (let i = 0; i < p.count; i++) {
    const k = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    c.copy(b).lerp(t, k * k * (3 - 2 * k));
    if (rng) c.offsetHSL(0, 0, (hash3(p.getX(i), p.getY(i), p.getZ(i), salt) - 0.5) * jitterAmt);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

/** Smoothly displace a sphere-ish geometry with low-frequency noise (soft, organic blobs). */
function lumpy(geo: THREE.BufferGeometry, amount: number, rng: Rng): THREE.BufferGeometry {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const ox = rng.range(0, 100), oz = rng.range(0, 100);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 4.1 + ox) * Math.cos(z * 3.7 + oz) * 0.5 + Math.sin(y * 5.3 + ox * 0.3) * 0.5;
    const k = 1 + n * amount;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const fixed = parts.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') x.deleteAttribute(k);
    if (!x.attributes.normal) x.computeVertexNormals();
    return x;
  });
  const m = mergeGeometries(fixed, false)!;
  m.computeVertexNormals();
  return m;
}

const T = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

/** Build a prop; `lod` 1 = the lighter far version (same shape and colours, about a quarter of the triangles). */
export function buildProp(kind: PropKind, pal: { leaves: string[]; trunk: string; flowers: string[]; rock: string[]; accent: string }, seed: number, lod = 0): THREE.BufferGeometry {
  LODF = lod ? 0.5 : 1;
  try {
    return buildPropAt(kind, pal, seed);
  } finally {
    LODF = 1;
  }
}

function buildPropAt(kind: PropKind, pal: { leaves: string[]; trunk: string; flowers: string[]; rock: string[]; accent: string }, seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const leaf = () => C(rng.pick(pal.leaves));
  const rock = () => C(rng.pick(pal.rock));
  switch (kind) {
    case 'treeRound': {
      // a soft, puffy, painterly tree: curved trunk, a few branches, a cluster of round leaf masses
      const trunkG = cylG(0.045, 0.1, 0.62, 8, 4);
      const tp = trunkG.attributes.position as THREE.BufferAttribute;
      const bend = rng.range(-0.08, 0.08);
      for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + Math.pow((tp.getY(i) + 0.31) / 0.62, 2) * bend);
      const parts = [paint(T(trunkG, 0, 0.31, 0), pal.trunk, 0.04, rng)];
      for (let b = 0; b < 2; b++) {
        const br = cylG(0.02, 0.035, 0.3, 6);
        br.translate(0, 0.15, 0);
        br.rotateZ((b ? 1 : -1) * rng.range(0.6, 0.9));
        parts.push(paint(T(br, bend, 0.42, 0), pal.trunk, 0.04, rng));
      }
      const lc = leaf();
      const dark = lc.clone().offsetHSL(0.01, 0.05, -0.12);
      const light = lc.clone().offsetHSL(-0.02, 0.05, 0.14);
      const blobs = rng.int(5, 7);
      for (let i = 0; i < blobs; i++) {
        const r = i === 0 ? rng.range(0.3, 0.36) : rng.range(0.17, 0.27);
        const a = rng.range(0, Math.PI * 2);
        const off = i === 0 ? 0 : rng.range(0.16, 0.3);
        const y = 0.72 + (i === 0 ? 0.04 : rng.range(-0.12, 0.16));
        const g = lumpy(sphG(r, 14, 10), 0.08, rng);
        g.translate(Math.cos(a) * off + bend, y, Math.sin(a) * off);
        parts.push(gradient(g, dark, light, y - r, y + r * 0.8, rng, 0.03));
      }
      return merge(parts);
    }
    case 'treePine':
    case 'pineSnow': {
      const parts = [paint(T(cylG(0.035, 0.07, 0.36, 8), 0, 0.18, 0), pal.trunk, 0.04, rng)];
      const lc = leaf();
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const r = 0.36 - i * 0.075, hgt = 0.4 - i * 0.05;
        const y = 0.24 + i * 0.2;
        const g = coneG(r, hgt, 14, 2);
        g.translate(0, y + hgt / 2, 0);
        parts.push(gradient(g, lc.clone().offsetHSL(0, 0, -0.1), lc.clone().offsetHSL(0, 0.04, 0.08), y, y + hgt, rng, 0.03));
        if (kind === 'pineSnow') {
          const sn = coneG(r * 0.78, hgt * 0.45, 14, 1);
          sn.translate(0, y + hgt * 0.78, 0);
          parts.push(paint(sn, '#f4f9ff', 0.02, rng));
        }
      }
      return merge(parts);
    }
    case 'bush':
    case 'snowBush': {
      const parts: THREE.BufferGeometry[] = [];
      const lc = kind === 'snowBush' ? C('#e9f2fb') : leaf();
      for (let i = 0; i < 4; i++) {
        const r = rng.range(0.11, 0.18);
        const g = lumpy(sphG(r, 12, 9), 0.08, rng);
        const y = r * 0.75;
        g.translate(rng.range(-0.15, 0.15), y, rng.range(-0.15, 0.15));
        parts.push(gradient(g, lc.clone().offsetHSL(0, 0, -0.1), lc.clone().offsetHSL(0, 0.03, 0.1), 0, y + r, rng, 0.03));
      }
      return merge(parts);
    }
    case 'rock':
    case 'lavaRock':
    case 'obsidian': {
      const parts: THREE.BufferGeometry[] = [];
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const r = rng.range(0.12, 0.24) * (i === 0 ? 1.25 : 0.8);
        const g = lumpy(icoG(r, 2), 0.12, rng);
        g.scale(1, kind === 'obsidian' ? rng.range(1.6, 2.6) : rng.range(0.5, 0.75), 1);
        g.translate(rng.range(-0.15, 0.15), r * 0.3, rng.range(-0.15, 0.15));
        const c = kind === 'obsidian' ? C('#1d1720') : rock();
        // moss on top for normal rocks
        const topC = kind === 'rock' ? c.clone().lerp(C(pal.leaves[0]), 0.45) : c.clone().offsetHSL(0, 0, 0.06);
        parts.push(gradient(g, c.clone().offsetHSL(0, 0, -0.08), topC, -r * 0.2, r * 0.9, rng, 0.03));
        if (kind === 'lavaRock' && i === 0) parts.push(paint(T(icoG(r * 0.35, 1), 0, r * 0.7, 0), '#ff6a1f', 0, rng));
      }
      return merge(parts);
    }
    case 'flower': {
      const fc = C(rng.pick(pal.flowers));
      const parts = [paint(T(cylG(0.008, 0.01, 0.16, 3), 0, 0.08, 0), '#4f8f3a', 0, rng)];
      const petals = 5;
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        const g = sphG(0.035, 4, 3);
        g.scale(1, 0.4, 0.6);
        parts.push(paint(T(g, Math.cos(a) * 0.035, 0.165, Math.sin(a) * 0.035), fc, 0.05, rng));
      }
      parts.push(paint(T(sphG(0.022, 5, 4), 0, 0.17, 0), '#ffd54a', 0, rng));
      return merge(parts);
    }
    case 'grass': {
      const parts: THREE.BufferGeometry[] = [];
      const gc = leaf().offsetHSL(0, 0.05, 0.08);
      for (let i = 0; i < 4; i++) {
        const g = coneG(0.022, rng.range(0.12, 0.22), 3);
        g.rotateZ(rng.range(-0.3, 0.3));
        g.rotateX(rng.range(-0.3, 0.3));
        parts.push(paint(T(g, rng.range(-0.05, 0.05), 0.07, rng.range(-0.05, 0.05)), gc, 0.08, rng));
      }
      return merge(parts);
    }
    case 'mushroom': {
      const parts = [
        paint(T(cylG(0.025, 0.03, 0.1, 6), 0, 0.05, 0), '#f3ead8', 0, rng),
        paint(T(sphG(0.07, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.09, 0), '#e5484d', 0.04, rng),
      ];
      for (let i = 0; i < 4; i++) parts.push(paint(T(sphG(0.012, 4, 3), Math.cos(i * 1.7) * 0.04, 0.14, Math.sin(i * 1.7) * 0.04), '#ffffff', 0, rng));
      return merge(parts);
    }
    case 'windmill': {
      const parts = [
        paint(T(cylG(0.22, 0.34, 1.2, 8), 0, 0.6, 0), '#efe3cf', 0.05, rng),
        paint(T(coneG(0.3, 0.42, 8), 0, 1.4, 0), '#c0473d', 0.05, rng),
        paint(T(new THREE.BoxGeometry(0.16, 0.26, 0.04), 0, 0.2, 0.33), '#7a5236', 0, rng),
        paint(T(new THREE.BoxGeometry(0.12, 0.12, 0.04), 0, 0.75, 0.27), '#7fb8e6', 0, rng),
      ];
      return merge(parts);
    }
    case 'house': {
      const wall = rng.pick(['#f1e6d2', '#efe0c8', '#f6efe2']);
      const roof = rng.pick(['#c0473d', '#3f7ec0', '#b8743d']);
      const body = new THREE.BoxGeometry(0.55, 0.38, 0.45);
      const r = cylG(0.01, 0.4, 0.3, 4, 1);
      r.rotateY(Math.PI / 4);
      r.scale(1.05, 1, 0.85);
      const parts = [
        paint(T(body, 0, 0.19, 0), wall, 0.03, rng),
        paint(T(r, 0, 0.53, 0), roof, 0.05, rng),
        paint(T(new THREE.BoxGeometry(0.12, 0.2, 0.02), 0.1, 0.1, 0.23), '#7a5236', 0, rng),
        paint(T(new THREE.BoxGeometry(0.1, 0.1, 0.02), -0.14, 0.22, 0.23), '#ffd77a', 0, rng),
        paint(T(new THREE.BoxGeometry(0.07, 0.18, 0.07), 0.16, 0.6, -0.08), '#8a6b55', 0, rng),
      ];
      return merge(parts);
    }
    case 'fence': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = -1; i <= 1; i++) parts.push(paint(T(new THREE.BoxGeometry(0.04, 0.22, 0.04), i * 0.22, 0.11, 0), '#9a7350', 0.06, rng));
      parts.push(paint(T(new THREE.BoxGeometry(0.5, 0.035, 0.025), 0, 0.15, 0), '#a88058', 0.04, rng));
      parts.push(paint(T(new THREE.BoxGeometry(0.5, 0.035, 0.025), 0, 0.07, 0), '#a88058', 0.04, rng));
      return merge(parts);
    }
    case 'palm': {
      const parts: THREE.BufferGeometry[] = [];
      const segs = 5;
      let x = 0, y = 0;
      const lean = rng.range(0.03, 0.06);
      for (let i = 0; i < segs; i++) {
        parts.push(paint(T(cylG(0.045, 0.055, 0.2, 6), x, y + 0.1, 0), i % 2 ? '#a07a52' : '#8a6542', 0.04, rng));
        x += lean;
        y += 0.19;
      }
      const lc = leaf();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const f = coneG(0.07, 0.55, 4);
        f.rotateZ(Math.PI / 2 - 0.35);
        f.translate(0.27, -0.05, 0);
        f.rotateY(a);
        parts.push(paint(T(f, x, y, 0), lc, 0.06, rng));
      }
      parts.push(paint(T(icoG(0.06, 0), x, y - 0.04, 0), '#6b4a2c', 0, rng));
      return merge(parts);
    }
    case 'cactus': {
      const g = '#5d9b4a';
      const parts = [paint(T(capG(0.08, 0.55, 3, 8), 0, 0.35, 0), g, 0.05, rng)];
      const arms = rng.int(1, 2);
      for (let i = 0; i < arms; i++) {
        const s = i === 0 ? 1 : -1;
        parts.push(paint(T(capG(0.05, 0.14, 3, 6).rotateZ(Math.PI / 2), s * 0.13, 0.32 + i * 0.1, 0), g, 0.05, rng));
        parts.push(paint(T(capG(0.05, 0.18, 3, 6), s * 0.2, 0.43 + i * 0.1, 0), g, 0.05, rng));
      }
      if (rng.chance(0.5)) parts.push(paint(T(sphG(0.04, 5, 4), 0, 0.72, 0), '#ff5a7a', 0, rng));
      return merge(parts);
    }
    case 'dryBush': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 7; i++) {
        const g = cylG(0.006, 0.012, 0.28, 3);
        g.rotateZ(rng.range(-0.8, 0.8));
        g.rotateY(rng.range(0, Math.PI));
        parts.push(paint(T(g, 0, 0.1, 0), '#9a7a4a', 0.1, rng));
      }
      return merge(parts);
    }
    case 'mesa': {
      const parts: THREE.BufferGeometry[] = [];
      const layers = rng.int(3, 4);
      let r = rng.range(0.42, 0.55);
      let y = 0;
      const cols = ['#d98d57', '#c4723f', '#e5a66d', '#b8643a'];
      for (let i = 0; i < layers; i++) {
        const hgt = rng.range(0.18, 0.3);
        parts.push(paint(T(jitter(cylG(r * 0.94, r, hgt, 8), 0.05, rng), 0, y + hgt / 2, 0), cols[i % cols.length], 0.05, rng));
        y += hgt;
        r *= rng.range(0.85, 0.97);
      }
      return merge(parts);
    }
    case 'column':
    case 'brokenColumn': {
      const hgt = kind === 'column' ? 1.1 : rng.range(0.35, 0.7);
      const c = kind === 'column' ? '#efe3cc' : '#d8d4cf';
      const parts = [
        paint(T(new THREE.BoxGeometry(0.34, 0.08, 0.34), 0, 0.04, 0), c, 0.04, rng),
        paint(T(cylG(0.12, 0.13, hgt, 10), 0, 0.08 + hgt / 2, 0), c, 0.04, rng),
      ];
      if (kind === 'column') parts.push(paint(T(new THREE.BoxGeometry(0.32, 0.08, 0.32), 0, 0.12 + hgt, 0), c, 0.04, rng));
      else parts.push(paint(T(jitter(cylG(0.12, 0.12, 0.12, 10), 0.08, rng).rotateZ(1.3), 0.25, 0.08, 0.1), c, 0.04, rng));
      return merge(parts);
    }
    case 'arch': {
      const c = '#e2c79c';
      const parts = [
        paint(T(new THREE.BoxGeometry(0.22, 0.9, 0.22), -0.42, 0.45, 0), c, 0.05, rng),
        paint(T(new THREE.BoxGeometry(0.22, 0.9, 0.22), 0.42, 0.45, 0), c, 0.05, rng),
        paint(T(new THREE.BoxGeometry(1.1, 0.2, 0.26), 0, 1.0, 0), c, 0.05, rng),
      ];
      return merge(parts);
    }
    case 'pot': {
      const g = sphG(0.11, 8, 6);
      g.scale(1, 1.15, 1);
      const parts = [paint(T(g, 0, 0.12, 0), '#c2703f', 0.05, rng), paint(T(cylG(0.06, 0.07, 0.06, 8), 0, 0.25, 0), '#b0623a', 0, rng)];
      return merge(parts);
    }
    case 'iceCrystal':
    case 'shard': {
      const parts: THREE.BufferGeometry[] = [];
      const n = rng.int(2, 4);
      const c = kind === 'shard' ? C('#cfc6ff') : C('#9be8ff');
      for (let i = 0; i < n; i++) {
        const hgt = rng.range(0.35, 0.8) * (i === 0 ? 1.3 : 1);
        const g = new THREE.OctahedronGeometry(0.1, 0);
        g.scale(1, hgt / 0.2, 1);
        g.rotateZ(rng.range(-0.35, 0.35));
        g.rotateX(rng.range(-0.35, 0.35));
        parts.push(paint(T(g, rng.range(-0.1, 0.1), hgt * 0.42, rng.range(-0.1, 0.1)), c.clone().offsetHSL(0, 0, rng.range(-0.05, 0.08)), 0.08, rng));
      }
      return merge(parts);
    }
    case 'iceSpire': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) {
        const hgt = rng.range(0.8, 1.8) * (i === 0 ? 1.4 : 1);
        const g = coneG(rng.range(0.12, 0.22), hgt, 5);
        g.rotateZ(rng.range(-0.25, 0.25));
        parts.push(paint(T(g, rng.range(-0.25, 0.25), hgt / 2, rng.range(-0.25, 0.25)), i % 2 ? '#bfefff' : '#8fdcff', 0.08, rng));
      }
      return merge(parts);
    }
    case 'deadTree':
    case 'greyTree': {
      const c = kind === 'deadTree' ? '#2b2122' : '#8d8996';
      const parts = [paint(T(cylG(0.035, 0.07, 0.6, 5), 0, 0.3, 0), c, 0.06, rng)];
      for (let i = 0; i < 4; i++) {
        const g = cylG(0.012, 0.03, rng.range(0.22, 0.36), 4);
        g.translate(0, 0.14, 0);
        g.rotateZ(rng.range(0.5, 1.0) * (i % 2 ? 1 : -1));
        g.rotateY(rng.range(0, Math.PI * 2));
        parts.push(paint(T(g, 0, rng.range(0.3, 0.55), 0), c, 0.06, rng));
      }
      if (kind === 'greyTree') parts.push(paint(T(jitter(icoG(0.22, 0), 0.08, rng), 0, 0.72, 0), '#b5b1bd', 0.08, rng));
      return merge(parts);
    }
    case 'anvil': {
      const parts = [
        paint(T(new THREE.BoxGeometry(0.18, 0.16, 0.14), 0, 0.08, 0), '#3a3436', 0.05, rng),
        paint(T(new THREE.BoxGeometry(0.34, 0.08, 0.16), 0.03, 0.2, 0), '#4a4446', 0.05, rng),
        paint(T(coneG(0.06, 0.14, 4).rotateZ(-Math.PI / 2), 0.25, 0.2, 0), '#4a4446', 0, rng),
      ];
      return merge(parts);
    }
    case 'chimney': {
      const parts = [
        paint(T(cylG(0.2, 0.28, 1.3, 7), 0, 0.65, 0), '#3b302f', 0.08, rng),
        paint(T(cylG(0.24, 0.22, 0.12, 7), 0, 1.32, 0), '#2a2224', 0.05, rng),
        paint(T(new THREE.BoxGeometry(0.18, 0.14, 0.05), 0, 0.25, 0.25), '#ff7a2a', 0, rng),
      ];
      return merge(parts);
    }
    case 'statue': {
      const c = '#d9d5df';
      const parts = [
        paint(T(new THREE.BoxGeometry(0.4, 0.2, 0.4), 0, 0.1, 0), '#a8a4ad', 0.04, rng),
        paint(T(capG(0.11, 0.32, 3, 8), 0, 0.42, 0), c, 0.04, rng),
        paint(T(sphG(0.1, 8, 6), 0, 0.73, 0), c, 0.04, rng),
        paint(T(cylG(0.015, 0.015, 0.36, 4).rotateZ(0.9), 0.18, 0.62, 0), '#ffd36b', 0, rng),
      ];
      return merge(parts);
    }
  }
}
