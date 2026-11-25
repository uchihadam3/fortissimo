/** Small modelling kit: painted primitives, shared materials, easing. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const matCache = new Map<string, THREE.Material>();

/** Vertex-coloured standard material (shared). */
export function vcMat(kind: 'matte' | 'flat' | 'metal' | 'gloss' = 'matte'): THREE.MeshStandardMaterial {
  const key = `vc:${kind}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: kind === 'metal' ? 0.32 : kind === 'gloss' ? 0.28 : 0.72,
      metalness: kind === 'metal' ? 0.75 : 0.02,
      flatShading: kind === 'flat',
    });
    matCache.set(key, m);
  }
  return m;
}

/** Emissive glow material (shared per colour/intensity). */
export function glowMat(color: string | number, intensity = 1.6, opacity = 1): THREE.MeshBasicMaterial {
  const key = `glow:${color}:${intensity}:${opacity}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    m = new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });
    matCache.set(key, m);
  }
  return m;
}

/** Standard material (shared per colour + params). */
export function stdMat(color: string | number, rough = 0.6, metal = 0, emissive?: string | number, emissiveIntensity = 1): THREE.MeshStandardMaterial {
  const key = `std:${color}:${rough}:${metal}:${emissive}:${emissiveIntensity}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal });
    if (emissive !== undefined) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = emissiveIntensity;
    }
    matCache.set(key, m);
  }
  return m;
}

export function painted(geo: THREE.BufferGeometry, color: string | number | THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Merge painted parts into one geometry (positions, normals, colours). */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const fixed = parts.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') x.deleteAttribute(k);
    if (!x.attributes.normal) x.computeVertexNormals();
    return x;
  });
  return mergeGeometries(fixed, false)!;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Shorthand transforms that return the geometry. */
export const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
export const rotX = (g: THREE.BufferGeometry, a: number) => g.rotateX(a);
export const rotY = (g: THREE.BufferGeometry, a: number) => g.rotateY(a);
export const rotZ = (g: THREE.BufferGeometry, a: number) => g.rotateZ(a);
export const scl = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.scale(x, y, z);

// primitives
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const sph = (r: number, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
export const cone = (r: number, h: number, seg = 16) => new THREE.ConeGeometry(r, h, seg);
export const torus = (r: number, t: number, rs = 8, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
export const capsule = (r: number, l: number, cs = 4, rs = 12) => new THREE.CapsuleGeometry(r, l, cs, rs);

// easing
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutElastic = (x: number) => {
  const c4 = (2 * Math.PI) / 3;
  return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** A character eye: white sclera, dark pupil, highlight. Returns a group facing +z. */
export function eye(r: number, pupil = '#1b1630', white = '#fbfaf6'): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Mesh(sph(r, 16, 12), stdMat(white, 0.25));
  const p = new THREE.Mesh(sph(r * 0.58, 14, 10), stdMat(pupil, 0.2));
  p.position.z = r * 0.55;
  p.scale.set(1, 1.1, 0.6);
  const hl = new THREE.Mesh(sph(r * 0.2, 8, 6), glowMat('#ffffff', 1.4));
  hl.position.set(r * 0.22, r * 0.28, r * 0.85);
  g.add(s, p, hl);
  g.userData.pupil = p;
  return g;
}
