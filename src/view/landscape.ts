/**
 * The journey's landscape: a long winding route through generated terrain (rolling meadows,
 * canyons, rivers, lakes, forests) that the colossus walks along. Everything is built at level
 * load: terrain chunks, water, trees and rocks. The grass is a separate GPU field (grass.ts).
 */
import * as THREE from 'three';
import { fbm2, noise2 } from '../core/noise';
import { Rng } from '../core/rng';
import type { WorldId } from '../sim/defs';
import { buildProp, type PropKind } from './props';
import { JourneyPath } from '../sim/path';
export { JourneyPath };
import { applyWorldColor } from './worldColor';

export type FeatureKind = 'canyon' | 'river' | 'lake' | 'forest' | 'hills' | 'ruins' | 'meadow';

export interface Feature {
  kind: FeatureKind;
  /** path distance where it starts and ends */
  from: number;
  to: number;
  /** -1 left, 1 right, 0 both */
  side?: number;
}

export interface LandStyle {
  grass: string[];
  dry: string;
  dirt: string;
  rock: string[];
  sand: string;
  snow: boolean;
  water: string;
  waterDeep: string;
  lava: boolean;
  frozen: boolean;
  trees: PropKind[];
  bushes: PropKind[];
  rocks: PropKind[];
  small: PropKind[];
  ruins: PropKind[];
  leaves: string[];
  trunk: string;
  flowers: string[];
  accent: string;
  hilliness: number;
  treeDensity: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Landscape {
  group: THREE.Group;
  path: JourneyPath;
  heightAt(x: number, z: number): number;
  /** surface kind at a point */
  waterAt(x: number, z: number): number | null;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  waterMats: THREE.ShaderMaterial[];
  update(t: number): void;
  dispose(): void;
  /** grass density 0..1 at a point */
  grassAt(x: number, z: number): number;
}

export function buildLandscape(world: WorldId, style: LandStyle, length: number, features: Feature[], seed: number, sunDir: THREE.Vector3, pathIn?: JourneyPath): Landscape {
  const path = pathIn ?? new JourneyPath(length, seed, world === 'citadel' ? 0.6 : 1);
  const so = (seed % 997) * 0.731;
  const tmpN = { s: 0, d: 0 };
  const featureAt = (s: number, kind: FeatureKind) => {
    let w = 0;
    for (const f of features) {
      if (f.kind !== kind) continue;
      const k = smooth(f.from - 12, f.from + 6, s) * (1 - smooth(f.to - 6, f.to + 12, s));
      w = Math.max(w, k);
    }
    return w;
  };
  const featureSide = (s: number, kind: FeatureKind) => {
    for (const f of features) if (f.kind === kind && s > f.from - 14 && s < f.to + 14) return f.side ?? 0;
    return 0;
  };
  const elevation = (s: number) => fbm2(s * 0.006 + so, 3.3, 3) * 6;

  // water bodies: rivers cross the route, lakes lie beside it
  const waters: { kind: 'river' | 'lake'; s: number; side: number; level: number; from: number; to: number }[] = [];
  for (const f of features) {
    if (f.kind === 'river') waters.push({ kind: 'river', s: (f.from + f.to) / 2, side: 0, level: elevation((f.from + f.to) / 2) - 0.9, from: f.from, to: f.to });
    if (f.kind === 'lake') waters.push({ kind: 'lake', s: (f.from + f.to) / 2, side: f.side ?? 1, level: elevation((f.from + f.to) / 2) - 0.7, from: f.from, to: f.to });
  }

  const heightRaw = (x: number, z: number): number => {
    const n = path.nearest(x, z, tmpN);
    const s = Math.max(0, Math.min(path.length + 60, n.s));
    const d = n.d;
    const ad = Math.abs(d);
    const base = elevation(s);
    let y = base;
    // rolling hills away from the route
    const hills = fbm2(x * 0.016 + so, z * 0.016 - so, 4) * 10 + fbm2(x * 0.05, z * 0.05 + 7, 3) * 2.4;
    const amp = style.hilliness * (1 + featureAt(s, 'hills') * 1.2);
    const corridor = smooth(9, 36, ad);
    y += hills * corridor * amp;
    // far mountains rise at the edge of the world
    y += smooth(70, 160, ad) * (14 + fbm2(x * 0.01, z * 0.01, 3) * 18) * amp;
    // the route itself: gentle undulation
    y += noise2(x * 0.12 + so, z * 0.12) * 0.25 * (1 - corridor * 0.5);
    // canyon walls
    const cw = featureAt(s, 'canyon');
    if (cw > 0) {
      const side = featureSide(s, 'canyon');
      const wallL = side <= 0 ? smooth(13, 17, -d) : 0;
      const wallR = side >= 0 ? smooth(13, 17, d) : 0;
      const wall = Math.max(wallL, wallR);
      y += wall * cw * (13 + fbm2(x * 0.08, z * 0.08) * 3.5);
    }
    // water basins
    for (const w of waters) {
      if (w.kind === 'river') {
        const k = Math.exp(-Math.pow((s - w.s) / 4.2, 2));
        if (k > 0.001) y = y * (1 - k) + (w.level - 1.0) * k;
      } else {
        const ds = (s - w.s) / Math.max(10, (w.to - w.from) / 2);
        const dd = (d * w.side - 26) / 12;
        const r = Math.hypot(ds, dd);
        if (r < 1.6) {
          const k = 1 - smooth(0.7, 1.25, r);
          y = y * (1 - k) + (w.level - 1.2) * k;
        }
      }
    }
    return y;
  };

  // cache heights on a grid for fast queries (sim, grass, decor)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of path.pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const PAD = 130;
  minX -= PAD;
  maxX += PAD;
  minZ -= PAD;
  maxZ += PAD;
  const R = 1; // grid spacing
  const gw = Math.ceil((maxX - minX) / R) + 1, gh = Math.ceil((maxZ - minZ) / R) + 1;
  const H = new Float32Array(gw * gh);
  const D = new Float32Array(gw * gh); // lateral distance (unsigned)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = minX + i * R, z = minZ + j * R;
      H[j * gw + i] = heightRaw(x, z);
      D[j * gw + i] = Math.abs(tmpN.d);
    }
  }
  const sampleGrid = (arr: Float32Array, x: number, z: number) => {
    const fx = (x - minX) / R, fz = (z - minZ) / R;
    const i = Math.max(0, Math.min(gw - 2, Math.floor(fx))), j = Math.max(0, Math.min(gh - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const a = arr[j * gw + i], b = arr[j * gw + i + 1], c = arr[(j + 1) * gw + i], e = arr[(j + 1) * gw + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz;
  };
  const heightAt = (x: number, z: number) => sampleGrid(H, x, z);
  const latAt = (x: number, z: number) => sampleGrid(D, x, z);
  const waterAt = (x: number, z: number): number | null => {
    const n = path.nearest(x, z, tmpN);
    for (const w of waters) {
      if (w.kind === 'river' && Math.abs(n.s - w.s) < 5.5) return w.level;
      if (w.kind === 'lake') {
        const ds = (n.s - w.s) / Math.max(10, (w.to - w.from) / 2);
        const dd = (n.d * w.side - 26) / 12;
        if (Math.hypot(ds, dd) < 1.0) return w.level;
      }
    }
    return null;
  };

  const group = new THREE.Group();

  // ── terrain mesh (one big grid, split into chunks for culling) ──
  const cGrass = style.grass.map((c) => new THREE.Color(c));
  const cDry = new THREE.Color(style.dry);
  const cDirt = new THREE.Color(style.dirt);
  const cRock = style.rock.map((c) => new THREE.Color(c));
  const cSand = new THREE.Color(style.sand);
  const cSnow = new THREE.Color('#f4f8ff');
  const tmp = new THREE.Color();
  const CH = 48; // chunk size in grid cells
  const mat = applyWorldColor(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), 'land');
  const grassDensity = new Float32Array(gw * gh);
  for (let cj = 0; cj < gh - 1; cj += CH) {
    for (let ci = 0; ci < gw - 1; ci += CH) {
      const nx = Math.min(CH, gw - 1 - ci) + 1, nz = Math.min(CH, gh - 1 - cj) + 1;
      // skip chunks far from the route
      const cx = minX + (ci + nx / 2) * R, cz = minZ + (cj + nz / 2) * R;
      if (latAt(cx, cz) > 175) continue;
      const pos = new Float32Array(nx * nz * 3);
      const col = new Float32Array(nx * nz * 3);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const gi = ci + i, gj = cj + j;
          const x = minX + gi * R, z = minZ + gj * R;
          const y = H[gj * gw + gi];
          const k = j * nx + i;
          pos[k * 3] = x;
          pos[k * 3 + 1] = y;
          pos[k * 3 + 2] = z;
        }
      }
      // colours need slope: finite differences on the grid
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const gi = ci + i, gj = cj + j;
          const x = minX + gi * R, z = minZ + gj * R;
          const y = H[gj * gw + gi];
          const hx = H[gj * gw + Math.min(gw - 1, gi + 1)] - H[gj * gw + Math.max(0, gi - 1)];
          const hz = H[Math.min(gh - 1, gj + 1) * gw + gi] - H[Math.max(0, gj - 1) * gw + gi];
          const slope = Math.hypot(hx, hz) / (2 * R);
          const g = (fbm2(x * 0.03 + so, z * 0.03, 3) + 1) / 2;
          const gi2 = Math.min(cGrass.length - 1, Math.floor(g * cGrass.length));
          tmp.copy(cGrass[gi2]).lerp(cGrass[Math.min(cGrass.length - 1, gi2 + 1)], smooth(0.2, 0.8, g * cGrass.length - gi2));
          tmp.offsetHSL(0, 0, noise2(x * 0.7, z * 0.7) * 0.03);
          const dry = smooth(0.25, 0.7, fbm2(x * 0.045 - 30, z * 0.045 + so, 2));
          tmp.lerp(cDry, dry * 0.45);
          let gd = 1 - dry * 0.4;
          // worn trail under the colossus' feet
          const lat = D[gj * gw + gi];
          if (lat < 3.2) {
            const t = 1 - smooth(1.2, 3.2, lat);
            tmp.lerp(cDirt, t * 0.35);
            gd *= 1 - t * 0.55;
          }
          // rock on steep slopes and high ground
          if (slope > 0.55) {
            const r = smooth(0.55, 1.1, slope);
            tmp.lerp(cRock[(gi + gj) % cRock.length], r);
            gd *= 1 - r;
          }
          // water edges
          const wl = waterAt(x, z);
          if (wl !== null && y < wl + 0.6) {
            const t = smooth(wl + 0.6, wl - 0.1, y);
            tmp.lerp(cSand, t);
            gd *= 1 - t;
          }
          if (style.snow && y > 10) tmp.lerp(cSnow, smooth(10, 16, y));
          col[(j * nx + i) * 3] = tmp.r;
          col[(j * nx + i) * 3 + 1] = tmp.g;
          col[(j * nx + i) * 3 + 2] = tmp.b;
          grassDensity[gj * gw + gi] = Math.max(0, gd);
        }
      }
      const idx: number[] = [];
      for (let j = 0; j < nz - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      group.add(m);
    }
  }
  // a wide hazy ground far away so the world never ends abruptly
  const far = new THREE.Mesh(new THREE.CircleGeometry(1200, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: cGrass[0].clone().lerp(new THREE.Color('#9fb7c9'), 0.55), fog: true }));
  far.position.set((minX + maxX) / 2, -14, (minZ + maxZ) / 2);
  group.add(far);

  // ── water ──
  const waterMats: THREE.ShaderMaterial[] = [];
  for (const w of waters) {
    const at = path.at(w.s);
    let geo: THREE.BufferGeometry;
    if (w.kind === 'river') geo = new THREE.PlaneGeometry(260, 14, 1, 1);
    else geo = new THREE.CircleGeometry(Math.max(24, (w.to - w.from) * 0.7), 40);
    geo.rotateX(-Math.PI / 2);
    const wm = makeWater(style, sunDir);
    waterMats.push(wm);
    const mesh = new THREE.Mesh(geo, wm);
    if (w.kind === 'river') {
      mesh.position.set(at.x, w.level, at.z);
      mesh.rotation.y = -Math.atan2(at.dz, at.dx) + Math.PI / 2 + Math.PI / 2;
    } else {
      const rx = -at.dz, rz = at.dx;
      mesh.position.set(at.x + rx * 26 * w.side, w.level, at.z + rz * 26 * w.side);
      mesh.scale.set(1, 1, 0.6);
      mesh.rotation.y = -Math.atan2(at.dz, at.dx);
    }
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  // ── trees, rocks, ruins ──
  const rng = new Rng(seed * 101 + 7);
  const placements = new Map<string, THREE.Matrix4[]>();
  const add = (kind: PropKind, variant: number, x: number, z: number, scale: number, yOff = 0) => {
    const key = `${kind}:${variant}`;
    let l = placements.get(key);
    if (!l) placements.set(key, (l = []));
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
    l.push(new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) + yOff, z), q, new THREE.Vector3(scale, scale * rng.range(0.9, 1.15), scale)));
  };
  const areaW = maxX - minX, areaH = maxZ - minZ;
  const tries = Math.floor(areaW * areaH * 0.03 * style.treeDensity);
  for (let i = 0; i < tries; i++) {
    const x = minX + rng.next() * areaW, z = minZ + rng.next() * areaH;
    const lat = latAt(x, z);
    if (lat < 12 || lat > 150) continue;
    const n = path.nearest(x, z, tmpN);
    const forest = featureAt(n.s, 'forest');
    const dens = smooth(-0.1, 0.4, fbm2(x * 0.03 + seed, z * 0.03, 3)) * 0.6 + forest * 0.9;
    if (rng.next() > dens) continue;
    if (waterAt(x, z) !== null) continue;
    const y = heightAt(x, z);
    const hx = heightAt(x + 1, z) - heightAt(x - 1, z), hz = heightAt(x, z + 1) - heightAt(x, z - 1);
    if (Math.hypot(hx, hz) > 1.4) continue;
    void y;
    const big = lat > 30 ? rng.range(2.6, 4.2) : rng.range(2.0, 3.0);
    add(rng.pick(style.trees), rng.int(0, 4), x, z, big);
  }
  // rocks and bushes nearer the route
  for (let i = 0; i < tries * 0.8; i++) {
    const x = minX + rng.next() * areaW, z = minZ + rng.next() * areaH;
    const lat = latAt(x, z);
    if (lat < 7 || lat > 120) continue;
    if (waterAt(x, z) !== null) continue;
    if (rng.next() < 0.55) add(rng.pick(style.bushes), rng.int(0, 4), x, z, rng.range(1.8, 3));
    else add(rng.pick(style.rocks), rng.int(0, 4), x, z, rng.range(2, 4.5), -0.2);
  }
  // ruins and features
  for (const f of features) {
    if (f.kind !== 'ruins') continue;
    for (let s = f.from; s < f.to; s += rng.range(5, 9)) {
      const p = path.at(s);
      const side = rng.chance(0.5) ? 1 : -1;
      const off = rng.range(9, 16) * side;
      const x = p.x - p.dz * off, z = p.z + p.dx * off;
      add(rng.pick(style.ruins), rng.int(0, 3), x, z, rng.range(2.2, 3.2));
    }
  }
  const propMat = applyWorldColor(treeMaterial(), 'tree');
  for (const [key, mats] of placements) {
    const [kind, variant] = key.split(':') as [PropKind, string];
    const geo = buildProp(kind, { leaves: style.leaves, trunk: style.trunk, flowers: style.flowers, rock: style.rock, accent: style.accent }, seed * 13 + Number(variant) * 97 + kind.length);
    const mesh = new THREE.InstancedMesh(geo, propMat, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return {
    group, path, heightAt, waterAt,
    bounds: { minX, maxX, minZ, maxZ },
    waterMats,
    grassAt: (x: number, z: number) => sampleGrid(grassDensity, x, z),
    update(t: number) {
      for (const w of waterMats) w.uniforms.uTime.value = t;
      treeUniforms.uTime.value = t;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      mat.dispose();
      propMat.dispose();
      for (const w of waterMats) w.dispose();
    },
  };
}

export const treeUniforms = { uTime: { value: 0 }, uBeat: { value: 0 } };

/** Trees and props: soft wrap lighting, a little rim glow, swaying canopies. */
function treeMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = treeUniforms.uTime;
    sh.uniforms.uBeat = treeUniforms.uBeat;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uBeat;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 ip = vec2(0.0);
        #endif
        float hh = max(0.0, transformed.y - 0.35);
        float ph = ip.x * 0.13 + ip.y * 0.11;
        float gust = sin(uTime * 0.7 + ip.x * 0.05) * 0.5 + 0.5;
        transformed.x += sin(uTime * 1.3 + ph) * 0.03 * hh * hh * (0.6 + gust);
        transformed.z += cos(uTime * 1.1 + ph) * 0.02 * hh * hh * (0.6 + gust);
        `,
      );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       float rim = pow(1.0 - max(0.0, dot(normalize(vViewPosition), normal)), 3.0);
       gl_FragColor.rgb += rim * vec3(1.0, 0.93, 0.75) * 0.1;`,
    );
  };
  m.customProgramCacheKey = () => 'tree-sway';
  return m;
}

function makeWater(style: LandStyle, sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: !style.lava,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(style.water) },
      uDeep: { value: new THREE.Color(style.waterDeep) },
      uSun: { value: sunDir.clone().normalize() },
      uLava: { value: style.lava ? 1 : 0 },
      uFrozen: { value: style.frozen ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uSun; uniform float uLava; uniform float uFrozen;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        vec3 view = normalize(cameraPosition - vW);
        if (uLava > 0.5) {
          float flow = vn(p*0.35 + vec2(uTime*0.05, uTime*0.02)) * 0.6 + vn(p*0.9 - vec2(uTime*0.08, 0.0)) * 0.4;
          float crust = smoothstep(0.5, 0.68, vn(p*0.6 + vec2(uTime*0.02, -uTime*0.015)));
          vec3 c = mix(uShallow, uDeep, flow) * 2.4;
          c = mix(c, vec3(0.07,0.035,0.035), crust * 0.85);
          gl_FragColor = vec4(c, 1.0);
        } else if (uFrozen > 0.5) {
          float cr = smoothstep(0.025, 0.0, abs(vn(p*0.8) - 0.5)) * 0.5 + smoothstep(0.02, 0.0, abs(vn(p*1.9 + 3.0) - 0.5)) * 0.3;
          vec3 c = mix(uDeep, uShallow, 0.6) + cr * 0.5;
          float fr = pow(1.0 - max(0.0, view.y), 3.0);
          c = mix(c, vec3(0.92, 0.96, 1.0), fr * 0.5);
          c += pow(vn(p*6.0 + uTime*0.03), 20.0) * 1.5;
          gl_FragColor = vec4(c, 0.97);
        } else {
          float r1 = vn(p*0.55 + vec2(uTime*0.18, uTime*0.09));
          float r2 = vn(p*1.3 - vec2(uTime*0.14, -uTime*0.17));
          vec3 n = normalize(vec3((r1 - 0.5) * 0.35, 1.0, (r2 - 0.5) * 0.35));
          float fres = pow(1.0 - max(0.0, dot(view, n)), 4.0);
          vec3 sky = vec3(0.62, 0.78, 0.95);
          vec3 c = mix(uDeep, uShallow, 0.35 + r1 * 0.25);
          c = mix(c, sky, fres * 0.65);
          vec3 h = normalize(uSun + view);
          c += pow(max(0.0, dot(n, h)), 180.0) * vec3(1.0, 0.95, 0.85) * 2.2;
          float caust = smoothstep(0.06, 0.0, abs(r1 - r2)) * 0.12;
          c += caust;
          gl_FragColor = vec4(c, 0.9);
        }
        #include <fog_fragment>
      }`,
  });
}
