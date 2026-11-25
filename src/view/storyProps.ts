/**
 * Set pieces and effects for the story scenes (docs/STORY.md): villagers, the prisons the Silence left
 * the musicians in (stone pedestal, ink-thorn cage, ice block, grey crystal, sand, chained cart), the
 * night camp, the five dark stars, the ink that wraps the Voices, shards and threads of light, streams of
 * notes, grey gusts, fireflies, the redeemed guardians, the mirror pond, marble stairs, the lava bridge,
 * the rest glyph and the broken staff lines. Everything is procedural.
 *
 * Props that should "get their colour back with the music" use world-colour materials (they obey the
 * Silence's grey and the colour waves exactly like the terrain does).
 */
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { at, box, capsule, clamp01, cone, cyl, damp, easeOutCubic, eye, glowMat, mergeParts, painted, sph, stdMat, torus } from './kit';
import { applyWorldColor } from './worldColor';
import { noteMesh } from './models';
import { Rng } from '../core/rng';

// ───────────────────────────── materials ─────────────────────────────

const wcCache = new Map<string, THREE.MeshStandardMaterial>();
/** a standard material that obeys the world colour (grey under the Silence, colour where music plays) */
export function wcMat(color: string, rough = 0.75, metal = 0, vertexColors = false): THREE.MeshStandardMaterial {
  const key = `${color}:${rough}:${metal}:${vertexColors}`;
  let m = wcCache.get(key);
  if (!m) {
    m = applyWorldColor(new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal, vertexColors }), `story-${vertexColors ? 'vc' : 'c'}`);
    wcCache.set(key, m);
  }
  return m;
}

/** the Silence's ink: dark, a faint violet sheen */
export const inkMat = () => stdMat('#1b1726', 0.32, 0.25);

/** a per-instance glowing material (its opacity/colour are animated) */
export function glow(color: string, intensity = 1.6, opacity = 1, additive = true): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, opacity, depthWrite: false, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
}

function shadows(o: THREE.Object3D, cast = true, receive = true) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
  return o;
}

/** A soft round glow texture for sprites (shared). */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** A star glyph texture (four long rays + a soft halo). */
let starTex: THREE.Texture | null = null;
function starTexture(): THREE.Texture {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.12, 'rgba(255,255,255,0.5)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.08)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 60 : 9;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  starTex = new THREE.CanvasTexture(c);
  return starTex;
}

export function glowSprite(color: string, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  s.scale.setScalar(size);
  return s;
}

// ───────────────────────────── villagers ─────────────────────────────

/** A tiny note-bird of the village-orchestra (the Maestro's kind): they dance at festivals. */
export class Villager {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private seed: number;
  /** 0 standing … 1 dancing */
  dance = 1;
  /** 0 visible … 1 hidden away (scurried into a house) */
  hide = 0;
  constructor(color: string, accent: string, seed = 0) {
    this.seed = seed;
    const bodyM = new THREE.Mesh(sph(0.2, 16, 12), stdMat(color, 0.55));
    bodyM.scale.set(1, 1.1, 0.95);
    bodyM.position.y = 0.23;
    const belly = new THREE.Mesh(sph(0.13, 12, 10), stdMat('#fff4e0', 0.6));
    belly.scale.set(1, 1, 0.5);
    belly.position.set(0, 0.2, 0.13);
    const beak = new THREE.Mesh(cone(0.04, 0.09, 6), stdMat('#ffb347', 0.5));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.3, 0.21);
    const eL = eye(0.042);
    eL.position.set(-0.07, 0.35, 0.16);
    const eR = eye(0.042);
    eR.position.set(0.07, 0.35, 0.16);
    const hatKind = seed % 3;
    let hat: THREE.Object3D;
    if (hatKind === 0) {
      hat = new THREE.Mesh(cone(0.09, 0.2, 10), stdMat(accent, 0.6));
      hat.position.y = 0.5;
    } else if (hatKind === 1) {
      const g = new THREE.Group();
      const brim = new THREE.Mesh(cyl(0.13, 0.13, 0.02, 14), stdMat(accent, 0.6));
      const crown = new THREE.Mesh(cyl(0.08, 0.09, 0.1, 14), stdMat(accent, 0.6));
      crown.position.y = 0.06;
      g.add(brim, crown);
      g.position.y = 0.44;
      hat = g;
    } else {
      hat = new THREE.Mesh(sph(0.06, 10, 8), stdMat(accent, 0.6));
      hat.position.y = 0.47;
    }
    const fm = stdMat('#ffb347', 0.6);
    const fl = new THREE.Mesh(sph(0.05, 8, 6), fm);
    fl.scale.set(1, 0.5, 1.4);
    fl.position.set(-0.08, 0.025, 0.03);
    const fr = fl.clone();
    fr.position.x = 0.08;
    this.body.add(bodyM, belly, beak, eL, eR, hat, fl, fr);
    this.group.add(this.body);
    shadows(this.group, true, false);
  }
  update(_dt: number, t: number, beat: number) {
    const b = beat + this.seed * 0.37;
    const hop = Math.abs(Math.sin(b * Math.PI)) * 0.14 * this.dance;
    this.body.position.y = hop;
    this.body.rotation.z = Math.sin(b * Math.PI) * 0.22 * this.dance;
    this.body.rotation.y = this.dance * (Math.floor(b / 4) % 2 ? Math.sin(t * 2 + this.seed) * 0.6 : 0);
    const s = 1 - this.hide;
    this.group.visible = s > 0.02;
    this.body.scale.setScalar(Math.max(0.01, s));
  }
}

// ───────────────────────────── generic debris (shatter, crumble, smash) ─────────────────────────────

/** Pieces that fly apart with gravity, spin and fade (ice, crystal, planks, thorns, plates). */
export class Debris {
  readonly group = new THREE.Group();
  private parts: { m: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; life: number }[] = [];
  private floor: number;
  constructor(pieces: THREE.Object3D[], center: THREE.Vector3, opts: { speed?: number; up?: number; floor?: number; life?: number } = {}) {
    const rng = new Rng(pieces.length * 13 + 7);
    this.floor = opts.floor ?? -1e9;
    for (const m of pieces) {
      const d = m.position.clone().sub(center);
      if (d.lengthSq() < 1e-4) d.set(rng.range(-1, 1), 0.5, rng.range(-1, 1));
      d.normalize();
      const sp = (opts.speed ?? 4) * rng.range(0.5, 1.3);
      const v = d.multiplyScalar(sp);
      v.y += (opts.up ?? 3) * rng.range(0.6, 1.4);
      this.parts.push({ m, v, w: new THREE.Vector3(rng.range(-6, 6), rng.range(-6, 6), rng.range(-6, 6)), life: (opts.life ?? 2.2) * rng.range(0.7, 1.2) });
      this.group.add(m);
    }
  }
  /** returns false when every piece is gone */
  update(dt: number): boolean {
    let alive = false;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= 9.8 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < this.floor) {
        p.m.position.y = this.floor;
        p.v.multiplyScalar(0.4);
        p.v.y = Math.abs(p.v.y) * 0.3;
      }
      p.m.rotation.x += p.w.x * dt;
      p.m.rotation.y += p.w.y * dt;
      p.m.rotation.z += p.w.z * dt;
      const k = clamp01(p.life / 0.5);
      p.m.scale.setScalar(Math.max(0.001, k));
      if (p.life > 0) alive = true;
      else p.m.visible = false;
    }
    return alive;
  }
}

// ───────────────────────────── prisons of the Silence ─────────────────────────────

/** A cobbled village square with grey houses and a pedestal in the middle (Bumbo's statue). */
export class VillageSquare {
  readonly group = new THREE.Group();
  /** local top of the pedestal */
  readonly pedestalTop: THREE.Vector3;
  constructor(seed = 3) {
    const rng = new Rng(seed);
    const stone = '#b9ab92';
    const parts: THREE.BufferGeometry[] = [];
    // cobbles
    parts.push(painted(at(cyl(7.2, 7.4, 0.3, 40), 0, 0.05, 0), '#a89d8a'));
    for (let i = 0; i < 90; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 6.8;
      const g = cyl(0.32, 0.34, 0.12, 6);
      g.rotateY(rng.range(0, 1));
      parts.push(painted(at(g, Math.cos(a) * r, 0.22, Math.sin(a) * r), new THREE.Color(stone).offsetHSL(0, 0, rng.range(-0.08, 0.06))));
    }
    // the pedestal
    parts.push(painted(at(cyl(1.25, 1.4, 0.35, 8), 0, 0.35, 0), '#cfc3ab'));
    parts.push(painted(at(cyl(0.95, 1.05, 0.9, 8), 0, 0.95, 0), '#d9cdb6'));
    parts.push(painted(at(cyl(1.1, 1.0, 0.18, 8), 0, 1.48, 0), '#cfc3ab'));
    this.pedestalTop = new THREE.Vector3(0, 1.57, 0);
    const ground = new THREE.Mesh(mergeParts(parts), wcMat('#ffffff', 0.85, 0, true));
    this.group.add(ground);
    // houses around the square (leaving the side toward the road open)
    const walls = ['#f1e4cc', '#eadbc0', '#f4e9d6'];
    const roofs = ['#c9473d', '#3f7ec0', '#e0a63a', '#6b4fa8', '#3f9a6b'];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.15 + (i / 5) * Math.PI * 0.95 + rng.range(-0.08, 0.08);
      const r = 9.5 + rng.range(-0.6, 0.8);
      const h = new THREE.Group();
      const w = rng.range(2.4, 3.2), hh = rng.range(2.2, 3.0), d = rng.range(2.4, 3.0);
      const hp: THREE.BufferGeometry[] = [];
      hp.push(painted(at(box(w, hh, d), 0, hh / 2, 0), walls[i % 3]));
      const roof = cone(Math.max(w, d) * 0.78, 1.8, 4);
      roof.rotateY(Math.PI / 4);
      hp.push(painted(at(roof, 0, hh + 0.9, 0), roofs[i % roofs.length]));
      hp.push(painted(at(box(0.6, 1.1, 0.06), 0, 0.55, d / 2 + 0.02), '#6b4426'));
      hp.push(painted(at(box(0.5, 0.5, 0.06), w * 0.28, hh * 0.62, d / 2 + 0.02), '#7fb6d9'));
      hp.push(painted(at(box(0.5, 0.5, 0.06), -w * 0.28, hh * 0.62, d / 2 + 0.02), '#7fb6d9'));
      hp.push(painted(at(box(0.36, 1.0, 0.36), w * 0.25, hh + 1.1, -0.3), '#8a6b55'));
      const hm = new THREE.Mesh(mergeParts(hp), wcMat('#ffffff', 0.8, 0, true));
      h.add(hm);
      h.position.set(Math.cos(a) * r, 0, -Math.sin(a) * r);
      h.lookAt(0, 0, 0);
      this.group.add(h);
    }
    // two lamp posts and a little tree
    for (const s of [-1, 1]) {
      const lp: THREE.BufferGeometry[] = [];
      lp.push(painted(at(cyl(0.08, 0.1, 3.2, 8), 0, 1.6, 0), '#4a3a2a'));
      lp.push(painted(at(sph(0.25, 10, 8), 0, 3.3, 0), '#ffe6a0'));
      const m = new THREE.Mesh(mergeParts(lp), wcMat('#ffffff', 0.6, 0, true));
      m.position.set(s * 4.6, 0, -3.2);
      this.group.add(m);
    }
    shadows(this.group);
  }
}

/** A slender belfry beside the road (Dona Badalo's cage hangs in it). */
export class BellTower {
  readonly group = new THREE.Group();
  /** local point where the cage hangs */
  readonly hang = new THREE.Vector3(0, 8.4, 0);
  constructor() {
    const p: THREE.BufferGeometry[] = [];
    const st = '#cdbfa4', dk = '#a8987c';
    p.push(painted(at(box(3.4, 0.6, 3.4), 0, 0.3, 0), dk));
    p.push(painted(at(box(2.6, 6.4, 2.6), 0, 3.6, 0), st));
    for (let i = 0; i < 5; i++) p.push(painted(at(box(2.75, 0.12, 2.75), 0, 1.2 + i * 1.25, 0), dk));
    p.push(painted(at(box(0.7, 1.2, 0.05), 0, 1.0, 1.31), '#6b4426'));
    p.push(painted(at(box(3.0, 0.35, 3.0), 0, 6.95, 0), dk));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.push(painted(at(box(0.42, 2.6, 0.42), x * 1.2, 8.4, z * 1.2), st));
    p.push(painted(at(box(3.1, 0.35, 3.1), 0, 9.8, 0), dk));
    const roof = cone(2.6, 2.8, 4);
    roof.rotateY(Math.PI / 4);
    p.push(painted(at(roof, 0, 11.4, 0), '#8a4a3a'));
    p.push(painted(at(sph(0.22, 10, 8), 0, 12.9, 0), '#e9b949'));
    const m = new THREE.Mesh(mergeParts(p), wcMat('#ffffff', 0.8, 0, true));
    this.group.add(m);
    shadows(this.group);
  }
}

/** A cage of black ink thorns (it crumbles when the music plays). */
export class ThornCage {
  readonly group = new THREE.Group();
  private thorns: THREE.Group[] = [];
  private mat: THREE.MeshStandardMaterial;
  /** 0 whole … 1 crumbled away */
  crumble = 0;
  constructor(radius = 0.85, height = 1.9) {
    this.mat = new THREE.MeshStandardMaterial({ color: '#1b1726', roughness: 0.3, metalness: 0.3, emissive: new THREE.Color('#2a1240'), emissiveIntensity: 0.6 });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const g = new THREE.Group();
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        const r = radius * (1 - Math.pow(u, 2.2) * 0.85);
        pts.push(new THREE.Vector3(r, u * height, Math.sin(u * 5 + i) * 0.08));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.07, 6, false);
      // taper toward the top
      const pa = tube.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pa.count; v++) {
        const y = pa.getY(v) / height;
        const cx = radius * (1 - Math.pow(y, 2.2) * 0.85);
        const ox = pa.getX(v) - cx, oz = pa.getZ(v);
        const k = 1 - y * 0.7;
        pa.setX(v, cx + ox * k);
        pa.setZ(v, oz * k);
      }
      tube.computeVertexNormals();
      g.add(new THREE.Mesh(tube, this.mat));
      // little spikes
      for (let k = 1; k < 6; k++) {
        const u = k / 6.5;
        const sp = new THREE.Mesh(cone(0.05, 0.28, 5), this.mat);
        const r = radius * (1 - Math.pow(u, 2.2) * 0.85);
        sp.position.set(r + 0.08, u * height, 0);
        sp.rotation.z = -Math.PI / 2 + (k % 2 ? 0.5 : -0.3);
        g.add(sp);
      }
      g.rotation.y = a;
      this.group.add(g);
      this.thorns.push(g);
    }
    const ring = new THREE.Mesh(torus(radius, 0.1, 6, 24), this.mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    this.group.add(ring);
    this.thorns.push(ring as unknown as THREE.Group);
    shadows(this.group, true, false);
  }
  update(_dt: number, t: number) {
    this.thorns.forEach((g, i) => {
      const k = clamp01(this.crumble * 1.6 - (i / this.thorns.length) * 0.6);
      g.visible = k < 0.99;
      g.scale.setScalar(Math.max(0.01, 1 - k));
      g.position.y = -k * 0.4;
    });
    this.mat.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.15 + this.crumble * 2;
    this.mat.emissive.setRGB(0.16 + this.crumble * 0.6, 0.07 + this.crumble * 0.5, 0.25 + this.crumble * 0.2);
  }
}

/** A translucent block of ice with cracks that spread (Trompa). */
export class IceBlock {
  readonly group = new THREE.Group();
  private block: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private cracks: THREE.LineSegments;
  private crackMat: THREE.LineBasicMaterial;
  private size: THREE.Vector3;
  /** 0 … 1 cracked all over */
  crack = 0;
  /** heat glow from the drum (0…1) */
  heat = 0;
  constructor(w = 1.8, h = 2.1, d = 1.8, tint = '#cfefff') {
    this.size = new THREE.Vector3(w, h, d);
    this.mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.55, emissive: new THREE.Color('#5fb8ff'), emissiveIntensity: 0.25, depthWrite: false });
    const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
    const rng = new Rng(5);
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      pa.setXYZ(i, pa.getX(i) * (1 + rng.range(-0.05, 0.05)), pa.getY(i) * (1 + rng.range(-0.04, 0.04)), pa.getZ(i) * (1 + rng.range(-0.05, 0.05)));
    }
    g.computeVertexNormals();
    g.translate(0, h / 2, 0);
    this.block = new THREE.Mesh(g, this.mat);
    this.block.renderOrder = 3;
    this.group.add(this.block);
    // crack lines on the faces
    const pts: number[] = [];
    for (let c = 0; c < 26; c++) {
      const face = c % 4;
      let x = rng.range(-w / 2, w / 2), y = rng.range(0, h), z = rng.range(-d / 2, d / 2);
      if (face === 0) z = d / 2 + 0.01;
      else if (face === 1) z = -d / 2 - 0.01;
      else if (face === 2) x = w / 2 + 0.01;
      else x = -w / 2 - 0.01;
      for (let s = 0; s < 4; s++) {
        const nx = face >= 2 ? x : x + rng.range(-0.35, 0.35);
        const nz = face < 2 ? z : z + rng.range(-0.35, 0.35);
        const ny = y + rng.range(-0.4, 0.4);
        pts.push(x, y, z, nx, ny, nz);
        x = nx;
        y = ny;
        z = nz;
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.crackMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false });
    this.cracks = new THREE.LineSegments(cg, this.crackMat);
    this.group.add(this.cracks);
  }
  update(_dt: number, t: number) {
    const n = (this.cracks.geometry.attributes.position as THREE.BufferAttribute).count;
    this.cracks.geometry.setDrawRange(0, Math.floor((n * clamp01(this.crack)) / 2) * 2);
    this.crackMat.opacity = Math.min(1, this.crack * 3);
    this.mat.emissive.setRGB(0.37 + this.heat * 0.6, 0.72 - this.heat * 0.2, 1 - this.heat * 0.7);
    this.mat.emissiveIntensity = 0.25 + this.heat * 0.9 * (0.8 + Math.sin(t * 9) * 0.2);
    const j = this.crack > 0.5 ? (this.crack - 0.5) * 0.06 : 0;
    this.block.position.set(Math.sin(t * 61) * j, 0, Math.cos(t * 53) * j);
  }
  /** break into chunks; returns the debris (add it to the scene, update it) */
  shatter(world: THREE.Vector3): Debris {
    this.group.visible = false;
    const pieces: THREE.Object3D[] = [];
    const rng = new Rng(11);
    const m = new THREE.MeshStandardMaterial({ color: '#dff4ff', roughness: 0.08, transparent: true, opacity: 0.75, emissive: new THREE.Color('#7fd0ff'), emissiveIntensity: 0.4 });
    for (let i = 0; i < 26; i++) {
      const s = rng.range(0.18, 0.5);
      const c = new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), m);
      c.position.set(world.x + rng.range(-1, 1) * this.size.x * 0.5, world.y + rng.range(0.1, 1) * this.size.y, world.z + rng.range(-1, 1) * this.size.z * 0.5);
      pieces.push(c);
    }
    return new Debris(pieces, world.clone().setY(world.y + this.size.y * 0.4), { speed: 5, up: 3, floor: world.y, life: 2.4 });
  }
}

/** A cluster of grey crystal around a musician (Cristalina): it vibrates with the music and cracks. */
export class CrystalPrison {
  readonly group = new THREE.Group();
  private mat: THREE.MeshStandardMaterial;
  private inner = new THREE.Group();
  /** 0 still … 1 shaking hard */
  shake = 0;
  /** 0 grey … 1 glowing lilac (about to break) */
  charge = 0;
  constructor() {
    this.mat = new THREE.MeshStandardMaterial({ color: '#8f8aa3', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.72, flatShading: true, emissive: new THREE.Color('#c58bff'), emissiveIntensity: 0, depthWrite: false });
    const rng = new Rng(9);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const hgt = rng.range(1.4, 2.6);
      const g = new THREE.CylinderGeometry(0.0, 0.32, 0.6, 6);
      g.translate(0, 0.3, 0);
      const body = new THREE.CylinderGeometry(0.32, 0.36, hgt, 6);
      body.translate(0, -hgt / 2, 0);
      const crystal = mergeParts([painted(g, '#ffffff'), painted(body, '#ffffff')]);
      crystal.translate(0, hgt, 0);
      const m = new THREE.Mesh(crystal, this.mat);
      m.renderOrder = 3;
      m.position.set(Math.cos(a) * 0.62, -0.1, Math.sin(a) * 0.62);
      m.rotation.set(Math.sin(a) * 0.35, rng.range(0, 1), -Math.cos(a) * 0.35);
      this.inner.add(m);
    }
    this.group.add(this.inner);
  }
  update(_dt: number, t: number) {
    const s = this.shake * 0.05;
    this.inner.position.set(Math.sin(t * 70) * s, Math.abs(Math.sin(t * 45)) * s * 0.5, Math.cos(t * 63) * s);
    this.mat.emissiveIntensity = this.charge * (1.2 + Math.sin(t * 20) * 0.3);
    this.mat.color.setRGB(0.56 + this.charge * 0.25, 0.54 + this.charge * 0.1, 0.64 + this.charge * 0.3);
  }
  shatter(world: THREE.Vector3): Debris {
    this.group.visible = false;
    const pieces: THREE.Object3D[] = [];
    const rng = new Rng(3);
    const m = new THREE.MeshStandardMaterial({ color: '#e2c8ff', roughness: 0.1, emissive: new THREE.Color('#c58bff'), emissiveIntensity: 1.2, flatShading: true });
    for (let i = 0; i < 24; i++) {
      const g = new THREE.OctahedronGeometry(rng.range(0.12, 0.3), 0);
      g.scale(0.6, 1.6, 0.6);
      const c = new THREE.Mesh(g, m);
      c.position.set(world.x + rng.range(-0.8, 0.8), world.y + rng.range(0.2, 2.2), world.z + rng.range(-0.8, 0.8));
      pieces.push(c);
    }
    return new Debris(pieces, world.clone().setY(world.y + 1), { speed: 6, up: 2.5, floor: world.y, life: 2 });
  }
}

/** A sand mound with only a head poking out (Chocalho). */
export class SandMound {
  readonly group = new THREE.Group();
  constructor(color = '#e8cf98') {
    const g = sph(1.4, 24, 12);
    g.scale(1, 0.42, 1);
    const m = new THREE.Mesh(g, wcMat(color, 0.95));
    m.position.y = -0.05;
    this.group.add(m);
    const rng = new Rng(4);
    for (let i = 0; i < 7; i++) {
      const r = sph(rng.range(0.2, 0.45), 10, 8);
      r.scale(1, 0.5, 1);
      const a = rng.range(0, Math.PI * 2);
      const mm = new THREE.Mesh(r, wcMat(color, 0.95));
      mm.position.set(Math.cos(a) * rng.range(1, 1.6), 0, Math.sin(a) * rng.range(1, 1.6));
      this.group.add(mm);
    }
    shadows(this.group, false, true);
  }
}

/** A wooden cart loaded with stones, and a chain that ties a musician to it (Grave). */
export class StoneCart {
  readonly group = new THREE.Group();
  private cart = new THREE.Group();
  private links: THREE.Mesh[] = [];
  /** local anchor of the chain on the cart */
  readonly chainFrom = new THREE.Vector3(1.6, 0.9, 0);
  constructor() {
    const wood = wcMat('#7a5236', 0.85);
    const dark = wcMat('#4a3322', 0.85);
    const p: THREE.Mesh[] = [];
    const bed = new THREE.Mesh(box(3, 0.25, 1.9), wood);
    bed.position.y = 0.9;
    p.push(bed);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(box(3, 0.7, 0.14), wood);
      side.position.set(0, 1.3, s * 0.9);
      p.push(side);
      const end = new THREE.Mesh(box(0.14, 0.7, 1.9), wood);
      end.position.set(s * 1.45, 1.3, 0);
      p.push(end);
      for (const wx of [-0.9, 0.9]) {
        const wheel = new THREE.Mesh(cyl(0.6, 0.6, 0.18, 14), dark);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.6, s * 1.05);
        p.push(wheel);
      }
    }
    const rng = new Rng(21);
    const rock = wcMat('#8d887e', 0.9);
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rng.range(0.32, 0.5), 0), rock);
      r.position.set(rng.range(-1.1, 1.1), 1.35 + rng.range(0, 0.5), rng.range(-0.6, 0.6));
      r.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
      p.push(r);
    }
    for (const m of p) this.cart.add(m);
    this.group.add(this.cart);
    shadows(this.group);
  }
  /** lay a chain from the cart to a local point (the musician) */
  chainTo(local: THREE.Vector3) {
    for (const l of this.links) l.removeFromParent();
    this.links = [];
    const iron = stdMat('#5a5560', 0.35, 0.8);
    const a = this.chainFrom, b = local;
    const n = Math.max(4, Math.round(a.distanceTo(b) / 0.22));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = a.clone().lerp(b, u);
      p.y -= Math.sin(u * Math.PI) * 0.35;
      const l = new THREE.Mesh(torus(0.1, 0.03, 5, 10), iron);
      l.position.copy(p);
      l.lookAt(b);
      l.rotation.z = i % 2 ? Math.PI / 2 : 0;
      this.group.add(l);
      this.links.push(l);
    }
  }
  /** the chain snaps: its links fly */
  breakChain(world: THREE.Vector3): Debris {
    const pieces = this.links.map((l) => {
      const w = l.getWorldPosition(new THREE.Vector3());
      l.removeFromParent();
      l.position.copy(w);
      return l as THREE.Object3D;
    });
    this.links = [];
    return new Debris(pieces, world, { speed: 4, up: 2, floor: world.y - 0.9, life: 1.8 });
  }
  /** the cart bursts apart */
  smash(world: THREE.Vector3): Debris {
    const pieces = [...this.cart.children].map((c) => {
      const w = c.getWorldPosition(new THREE.Vector3());
      const q = c.getWorldQuaternion(new THREE.Quaternion());
      c.removeFromParent();
      c.position.copy(w);
      c.quaternion.copy(q);
      return c;
    });
    return new Debris(pieces, world, { speed: 7, up: 4, floor: world.y + 0.2, life: 2.6 });
  }
}

/** A campfire: crossed logs, a ring of stones, flickering flames and light. */
export class Campfire {
  readonly group = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private light: THREE.PointLight;
  /** 0 out … 1 burning */
  fire = 1;
  constructor() {
    const p: THREE.BufferGeometry[] = [];
    const rng = new Rng(2);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const g = new THREE.DodecahedronGeometry(0.22, 0);
      p.push(painted(at(g, Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75), new THREE.Color('#8d887e').offsetHSL(0, 0, rng.range(-0.06, 0.06))));
    }
    for (let i = 0; i < 3; i++) {
      const g = cyl(0.09, 0.11, 1.2, 8);
      g.rotateZ(Math.PI / 2 - 0.35);
      g.rotateY((i / 3) * Math.PI * 2);
      p.push(painted(at(g, 0, 0.25, 0), '#5a3a22'));
    }
    this.group.add(new THREE.Mesh(mergeParts(p), stdMat('#ffffff', 0.9)));
    (this.group.children[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const cols = ['#ff8a2a', '#ffb347', '#ffe08a'];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(cone(0.38 - i * 0.1, 1.1 - i * 0.2, 8), glow(cols[i], 1.6 + i * 0.4, 0.85));
      f.position.y = 0.5;
      this.group.add(f);
      this.flames.push(f);
    }
    this.light = new THREE.PointLight('#ffa040', 6, 14, 1.6);
    this.light.position.y = 1;
    this.group.add(this.light);
  }
  update(_dt: number, t: number) {
    this.flames.forEach((f, i) => {
      const n = Math.sin(t * (9 + i * 3)) * 0.12 + Math.sin(t * (17 + i)) * 0.08;
      f.scale.set((1 + n * 0.5) * this.fire, (1 + n) * this.fire, (1 - n * 0.4) * this.fire);
      f.position.y = 0.5 + 0.05 * i + n * 0.05;
      f.rotation.y = t * (1 + i);
      f.visible = this.fire > 0.02;
    });
    this.light.intensity = (5 + Math.sin(t * 13) * 0.8 + Math.sin(t * 29) * 0.5) * this.fire;
  }
}

// ───────────────────────────── sky signs ─────────────────────────────

/** Five big stars in the sky: the five shards. Dark until their shard comes home. */
export class FiveStars {
  readonly group = new THREE.Group();
  private stars: { s: THREE.Sprite; halo: THREE.Sprite; lit: number; want: number; color: THREE.Color }[] = [];
  constructor(colors: string[], size = 14) {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i / 5) * Math.PI * 2;
      const mat = new THREE.SpriteMaterial({ map: starTexture(), color: new THREE.Color('#5c5a70'), transparent: true, opacity: 0.9, depthWrite: false, fog: false, toneMapped: false });
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(size);
      s.position.set(Math.cos(a) * size * 1.6, Math.sin(a) * size * 1.6, 0);
      const halo = glowSprite(colors[i], size * 2.2, 0);
      halo.position.copy(s.position);
      this.group.add(halo, s);
      this.stars.push({ s, halo, lit: 0, want: 0, color: new THREE.Color(colors[i]) });
    }
  }
  /** how many stars shine (the first n) */
  set(n: number, instant = false) {
    this.stars.forEach((st, i) => {
      st.want = i < n ? 1 : 0;
      if (instant) st.lit = st.want;
    });
  }
  light(i: number) {
    if (this.stars[i]) this.stars[i].want = 1;
  }
  update(dt: number, t: number) {
    this.stars.forEach((st, i) => {
      st.lit = damp(st.lit, st.want, 2.5, dt);
      const mat = st.s.material as THREE.SpriteMaterial;
      mat.color.setRGB(0.36 + (st.color.r * 2.2 - 0.36) * st.lit, 0.35 + (st.color.g * 2.2 - 0.35) * st.lit, 0.44 + (st.color.b * 2.2 - 0.44) * st.lit);
      (st.halo.material as THREE.SpriteMaterial).opacity = st.lit * (0.55 + Math.sin(t * 2 + i) * 0.1);
      st.s.material.rotation = Math.sin(t * 0.3 + i) * 0.1;
    });
  }
}

// ───────────────────────────── light, shards, notes ─────────────────────────────

const THREAD_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const THREAD_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uGrow; uniform float uFlow;
  varying vec2 vUv;
  void main(){
    float u = vUv.x;
    if (u > uGrow) discard;
    float dash = smoothstep(0.35, 0.5, fract(u * 18.0 - uTime * uFlow)) * smoothstep(0.85, 0.6, fract(u * 18.0 - uTime * uFlow));
    float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
    float tip = smoothstep(uGrow, uGrow - 0.04, u);
    float a = (0.45 + dash * 0.8) * (0.4 + 0.6 * edge) * uOpacity * tip;
    gl_FragColor = vec4(uColor * (1.0 + dash), a);
  }`;

/** A glowing thread of light arcing between two moving points (the Voices linked to the Heart). */
export class LightThread {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private lastA = new THREE.Vector3(1e9, 0, 0);
  private lastB = new THREE.Vector3(1e9, 0, 0);
  constructor(color: string, private r0 = 0.12, private r1 = 1.1, private lift = 0.35) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(1.6) }, uTime: { value: 0 }, uOpacity: { value: 1 }, uGrow: { value: 1 }, uFlow: { value: 1.2 } },
      vertexShader: THREAD_VS,
      fragmentShader: THREAD_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  /** a → b, rebuilt when the ends move */
  set(a: THREE.Vector3, b: THREE.Vector3) {
    if (a.distanceToSquared(this.lastA) < 0.04 && b.distanceToSquared(this.lastB) < 0.04) return;
    this.lastA.copy(a);
    this.lastB.copy(b);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += a.distanceTo(b) * this.lift;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    const geo = new THREE.TubeGeometry(curve, 64, 1, 6, false);
    const pa = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      const u = uv.getX(i);
      curve.getPoint(u, c);
      const r = this.r1 + (this.r0 - this.r1) * u;
      pa.setXYZ(i, c.x + (pa.getX(i) - c.x) * r, c.y + (pa.getY(i) - c.y) * r, c.z + (pa.getZ(i) - c.z) * r);
    }
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
  update(t: number) {
    this.mat.uniforms.uTime.value = t;
  }
}

/** A shard of the Heart: a glowing crystal with a halo; it flies along arcs leaving a trail. */
export class ShardView {
  readonly group = new THREE.Group();
  private crystal: THREE.Mesh;
  private halo: THREE.Sprite;
  readonly color: string;
  constructor(color: string, private size = 1) {
    this.color = color;
    const g = new THREE.OctahedronGeometry(0.22 * size, 0);
    g.scale(0.8, 2.4, 0.62);
    this.crystal = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 2.2, roughness: 0.1, flatShading: true }));
    this.halo = glowSprite(color, 2.2 * size, 0.9);
    this.group.add(this.crystal, this.halo);
  }
  update(_dt: number, t: number) {
    this.crystal.rotation.y = t * 2.4;
    this.halo.scale.setScalar(this.size * (2 + Math.sin(t * 8) * 0.25));
  }
}

/** Notes streaming from many points to a target (the theft, the swallowing, the gift back). */
export class NoteStream {
  readonly group = new THREE.Group();
  private notes: { m: THREE.Mesh; from: THREE.Vector3; ctrl: THREE.Vector3; t0: number; dur: number; spin: number; size: number }[] = [];
  constructor(private target: () => THREE.Vector3) {}
  add(from: THREE.Vector3, t0: number, dur: number, color: string, size = 0.35, lift = 4) {
    const m = noteMesh(size, color, 2.2);
    m.visible = false;
    this.group.add(m);
    const tg = this.target();
    const ctrl = from.clone().lerp(tg, 0.35);
    ctrl.y += lift;
    this.notes.push({ m, from: from.clone(), ctrl, t0, dur, spin: 3 + Math.random() * 5, size });
  }
  update(_dt: number, t: number) {
    const tg = this.target();
    const p = new THREE.Vector3();
    for (const n of this.notes) {
      const k = (t - n.t0) / n.dur;
      n.m.visible = k > 0 && k < 1;
      if (!n.m.visible) continue;
      const e = k * k * (3 - 2 * k);
      // quadratic bezier from → ctrl → target
      p.copy(n.from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(n.ctrl, 2 * (1 - e) * e).addScaledVector(tg, e * e);
      n.m.position.copy(p);
      n.m.rotation.y = t * n.spin;
      n.m.scale.setScalar(Math.min(1, k * 6) * (1 - Math.pow(k, 6)));
    }
  }
  get size() {
    return this.notes.length;
  }
}

/** Long streaks of a grey gust blowing across an area. */
export class Gust {
  readonly mesh: THREE.InstancedMesh;
  private items: { p: THREE.Vector3; v: number; off: number; len: number }[] = [];
  private mat: THREE.MeshBasicMaterial;
  /** 0 calm … 1 full gale */
  strength = 0;
  constructor(private center: () => THREE.Vector3, private dir: THREE.Vector3, private radius = 18, n = 160, color = '#c9c4dc') {
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.0, depthWrite: false, fog: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 0.06), this.mat, n);
    this.mesh.frustumCulled = false;
    const rng = new Rng(77);
    for (let i = 0; i < n; i++) this.items.push({ p: new THREE.Vector3(rng.range(-1, 1) * radius, rng.range(0, 9), rng.range(-1, 1) * radius), v: rng.range(18, 34), off: rng.range(0, 100), len: rng.range(1.5, 4.5) });
    this.dir.normalize();
  }
  update(dt: number, t: number) {
    this.mat.opacity = this.strength * 0.55;
    this.mesh.visible = this.strength > 0.01;
    if (!this.mesh.visible) return;
    const c = this.center();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.dir);
    const m = new THREE.Matrix4();
    const R = this.radius;
    this.items.forEach((it, i) => {
      it.p.addScaledVector(this.dir, it.v * dt * (0.4 + this.strength));
      // wrap around the area
      const rel = it.p.clone();
      const along = rel.dot(this.dir);
      if (along > R) it.p.addScaledVector(this.dir, -2 * R);
      const y = it.p.y + Math.sin(t * 3 + it.off) * 0.4;
      m.compose(new THREE.Vector3(c.x + it.p.x, c.y + y, c.z + it.p.z), q, new THREE.Vector3(it.len * (0.5 + this.strength), 1, 1));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A swarm of fireflies wandering around a point. */
export class Fireflies {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  constructor(n = 90, radius = 10, height = 4, color = '#ffe98a') {
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 4);
    const rng = new Rng(8);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * radius;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rng.range(0.3, height);
      pos[i * 3 + 2] = Math.sin(a) * r;
      for (let k = 0; k < 4; k++) rnd[i * 4 + k] = rng.next();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aR', new THREE.BufferAttribute(rnd, 4));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color).multiplyScalar(2.2) }, uAlpha: { value: 1 }, uSize: { value: 70 } },
      vertexShader: /* glsl */ `attribute vec4 aR; uniform float uTime; uniform float uSize; varying float vA;
        void main(){ vec3 p = position; float t = uTime * (0.3 + aR.x * 0.5) + aR.y * 6.28;
          p += vec3(sin(t) * 1.2, sin(t * 1.7 + aR.z * 6.0) * 0.5, cos(t * 0.8) * 1.2);
          vA = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.5 + aR.w * 2.0) + aR.x * 20.0), 3.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * (0.5 + aR.w) / -mv.z; }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uAlpha; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(uColor, a * a * vA * uAlpha); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  set alpha(a: number) {
    this.mat.uniforms.uAlpha.value = a;
  }
  update(t: number) {
    this.mat.uniforms.uTime.value = t;
  }
}

/** Petals (or snow, or ash) falling over an area for a while. */
export class Fall {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private t0 = -1;
  constructor(colors: [string, string], n = 700, radius = 26, height = 26, size = 34, speed = 2.2) {
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 4);
    const rng = new Rng(31);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * radius;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rng.range(0, height);
      pos[i * 3 + 2] = Math.sin(a) * r;
      for (let k = 0; k < 4; k++) rnd[i * 4 + k] = rng.next();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aR', new THREE.BufferAttribute(rnd, 4));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uC1: { value: new THREE.Color(colors[0]) }, uC2: { value: new THREE.Color(colors[1]) }, uAlpha: { value: 0 }, uH: { value: height }, uSize: { value: size }, uSpeed: { value: speed } },
      vertexShader: /* glsl */ `attribute vec4 aR; uniform float uTime; uniform float uH; uniform float uSize; uniform float uSpeed; varying vec4 vR;
        void main(){ vR = aR; vec3 p = position; p.y = mod(p.y - uTime * uSpeed * (0.6 + aR.x * 0.8), uH);
          p.x += sin(uTime * (1.0 + aR.y) + aR.z * 6.28) * 0.9; p.z += cos(uTime * (0.8 + aR.w) + aR.x * 6.28) * 0.7;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(24.0, uSize * (0.6 + aR.w * 0.8) / -mv.z); }`,
      fragmentShader: /* glsl */ `uniform vec3 uC1; uniform vec3 uC2; uniform float uAlpha; varying vec4 vR;
        void main(){ vec2 d = gl_PointCoord - 0.5; d.x *= 1.0 + vR.z; float a = smoothstep(0.5, 0.2, length(d)); if (a < 0.02) discard; gl_FragColor = vec4(mix(uC1, uC2, vR.y), a * uAlpha); }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  set alpha(a: number) {
    this.mat.uniforms.uAlpha.value = a;
  }
  get alpha() {
    return this.mat.uniforms.uAlpha.value;
  }
  update(_dt: number, t: number) {
    if (this.t0 < 0) this.t0 = t;
    this.mat.uniforms.uTime.value = t - this.t0;
  }
}

/** A firework of notes: a rocket climbs, then bursts into a ring of glowing notes. */
export class NoteFirework {
  readonly group = new THREE.Group();
  private rocket: THREE.Sprite;
  private notes: { m: THREE.Mesh; d: THREE.Vector3 }[] = [];
  private halo: THREE.Sprite;
  done = false;
  constructor(private from: THREE.Vector3, private to: THREE.Vector3, private t0: number, private color: string, private rise = 1.4) {
    this.rocket = glowSprite(color, 1.4, 1);
    this.group.add(this.rocket);
    this.halo = glowSprite(color, 1, 0);
    this.group.add(this.halo);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8 + 0.15, Math.sin(a * 3) * 0.4).normalize();
      const m = noteMesh(0.7, i % 2 ? color : '#fff4c8', 2.6);
      m.visible = false;
      this.group.add(m);
      this.notes.push({ m, d });
    }
  }
  update(t: number, camQ: THREE.Quaternion) {
    const k = (t - this.t0) / this.rise;
    if (k < 0) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    if (k < 1) {
      const e = easeOutCubic(k);
      this.rocket.position.lerpVectors(this.from, this.to, e);
      this.rocket.visible = true;
      return;
    }
    this.rocket.visible = false;
    const b = (t - this.t0 - this.rise) / 2.2;
    if (b > 1) {
      this.group.visible = false;
      this.done = true;
      return;
    }
    const e = easeOutCubic(Math.min(1, b * 1.4));
    this.halo.position.copy(this.to);
    this.halo.scale.setScalar(4 + e * 16);
    (this.halo.material as THREE.SpriteMaterial).opacity = (1 - b) * 0.9;
    for (const n of this.notes) {
      n.m.visible = true;
      n.m.position.copy(this.to).addScaledVector(n.d, e * 9);
      n.m.position.y -= b * b * 3;
      n.m.quaternion.copy(camQ);
      n.m.scale.setScalar(Math.max(0.01, (1 - Math.pow(b, 3)) * (0.6 + e * 0.6)));
    }
  }
}

// ───────────────────────────── the Silence's marks ─────────────────────────────

/**
 * The Silence's storm front: a wall of ink-smoke rising on the horizon over an arc around a point, with
 * a ragged, boiling top edge. Seen from inside (it surrounds the colossus on one side).
 */
export class InkStorm {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  constructor(radius = 200, height = 150, arc = Math.PI * 0.7, color = '#120d1e') {
    const g = new THREE.CylinderGeometry(radius, radius, height, 96, 1, true, -arc / 2, arc);
    g.translate(0, height / 2 - 8, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uRise: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uRise; uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n2(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
        void main(){
          float y = vUv.y;
          vec2 q = vec2(vUv.x * 16.0, y * 4.0 - uTime * 0.22);
          float n = fbm(q + fbm(q * 0.7 + uTime * 0.05) * 1.4);
          float top = uRise * (0.62 + 0.5 * n);
          float a = smoothstep(top, top - 0.22, y);
          a *= smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
          vec3 c = uColor * (0.55 + 0.9 * n) + vec3(0.18, 0.1, 0.32) * pow(n, 3.0) * 0.6;
          gl_FragColor = vec4(c, a * uOpacity);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = -50;
    this.mesh.frustumCulled = false;
  }
  update(_dt: number, t: number) {
    this.mat.uniforms.uTime.value = t;
    this.mesh.visible = this.mat.uniforms.uRise.value > 0.001 && this.mat.uniforms.uOpacity.value > 0.001;
  }
}

/** Ink tendrils coiled around a tall landmark (the Great Blot hugging the Bell). */
export class InkCoil {
  readonly group = new THREE.Group();
  private tubes: THREE.Mesh[] = [];
  private mat: THREE.MeshStandardMaterial;
  /** 0 none … 1 fully wrapped */
  grow = 1;
  constructor(radius = 6.5, height = 22, n = 4) {
    // the Silence's ink does not fade into the haze: it stays ink-black even on a far Voice
    this.mat = new THREE.MeshStandardMaterial({ color: '#1d1a2b', roughness: 0.28, metalness: 0.3, emissive: new THREE.Color('#2a1648'), emissiveIntensity: 0.4, fog: false });
    for (let i = 0; i < n; i++) {
      const pts: THREE.Vector3[] = [];
      const turns = 1.6 + i * 0.25;
      for (let k = 0; k <= 40; k++) {
        const u = k / 40;
        const a = u * turns * Math.PI * 2 + (i / n) * Math.PI * 2;
        const r = radius * (1.05 - u * 0.35) + Math.sin(u * 13 + i) * 0.4;
        pts.push(new THREE.Vector3(Math.cos(a) * r, u * height * (0.75 + i * 0.08), Math.sin(a) * r));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 1, 8, false);
      // thick at the base, thin at the tip
      const pa = geo.attributes.position as THREE.BufferAttribute;
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const curve = new THREE.CatmullRomCurve3(pts);
      const c = new THREE.Vector3();
      for (let v = 0; v < pa.count; v++) {
        const u = uv.getX(v);
        curve.getPoint(u, c);
        const r = 1.1 * (1 - u * 0.85);
        pa.setXYZ(v, c.x + (pa.getX(v) - c.x) * r, c.y + (pa.getY(v) - c.y) * r, c.z + (pa.getZ(v) - c.z) * r);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.mat);
      m.castShadow = true;
      this.group.add(m);
      this.tubes.push(m);
    }
  }
  update(_dt: number, t: number) {
    for (const m of this.tubes) {
      const n = m.geometry.index!.count;
      const k = clamp01(this.grow);
      m.geometry.setDrawRange(0, Math.floor((n * k) / 6) * 6);
      m.visible = k > 0.01;
    }
    this.mat.emissiveIntensity = 0.35 + Math.sin(t * 2) * 0.1;
    this.group.rotation.y = Math.sin(t * 0.4) * 0.03;
  }
}

/** The quarter rest (𝄽) drawn in light: the breath between notes. */
export class RestGlyph {
  readonly group = new THREE.Group();
  readonly mat: THREE.MeshBasicMaterial;
  constructor(color = '#fff4c8', size = 1, intensity = 2.2) {
    const s = size;
    const pts = [
      new THREE.Vector3(-0.12, 0.5, 0), new THREE.Vector3(0.14, 0.24, 0), new THREE.Vector3(-0.1, 0.04, 0), new THREE.Vector3(0.12, -0.18, 0),
      new THREE.Vector3(-0.08, -0.22, 0), new THREE.Vector3(-0.12, -0.36, 0), new THREE.Vector3(0.0, -0.5, 0),
    ].map((p) => p.multiplyScalar(s));
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, opacity: 1, toneMapped: false, depthWrite: false });
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3), 48, 0.055 * s, 8, false);
    this.group.add(new THREE.Mesh(tube, this.mat));
    const halo = glowSprite(color, 1.8 * s, 0.35);
    this.group.add(halo);
  }
  set opacity(a: number) {
    this.mat.opacity = a;
    this.group.visible = a > 0.01;
    (this.group.children[1] as THREE.Sprite).material.opacity = a * 0.35;
  }
}

/** Five staff lines arched around a head like a broken crown; they can snap and fly apart. */
export class StaffCrown {
  readonly group = new THREE.Group();
  private pieces: { m: THREE.Mesh; dir: THREE.Vector3 }[] = [];
  private mat: THREE.MeshBasicMaterial;
  /** 0 whole … 1 shattered and gone */
  snap = 0;
  constructor(radius = 1, color = '#d9d3ff') {
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, toneMapped: false, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const r = radius * (1 + i * 0.07);
      const segs = 3;
      for (let k = 0; k < segs; k++) {
        const a0 = (k / segs) * Math.PI * 2 + i * 0.4, a1 = a0 + (Math.PI * 2) / segs - 0.35;
        const g = new THREE.TorusGeometry(r, 0.025 * radius, 4, 24, a1 - a0);
        g.rotateZ(a0);
        g.rotateX(Math.PI / 2);
        const m = new THREE.Mesh(g, this.mat);
        m.position.y = (i - 2) * 0.14 * radius;
        this.group.add(m);
        const mid = (a0 + a1) / 2;
        this.pieces.push({ m, dir: new THREE.Vector3(Math.cos(mid), (i - 2) * 0.3, -Math.sin(mid)).normalize() });
      }
    }
  }
  update(_dt: number, t: number) {
    const k = clamp01(this.snap);
    this.group.rotation.y = t * 0.3;
    for (const p of this.pieces) {
      p.m.position.x = p.dir.x * k * 3;
      p.m.position.z = p.dir.z * k * 3;
      p.m.rotation.y = k * 1.2;
    }
    this.mat.opacity = 1 - k * k;
    this.group.visible = k < 0.99;
  }
}

/** Makes a dark, silent copy of a figure (the Shadows of the Citadel). Materials are replaced, not shared. */
export function shadowify(o: THREE.Object3D, color = '#120f1c') {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.9, metalness: 0.0, emissive: new THREE.Color('#2a1a48'), emissiveIntensity: 0.25 });
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.material = mat;
    const s = c as THREE.Sprite;
    if (s.isSprite) s.visible = false;
  });
  return mat;
}

// ───────────────────────────── the redeemed guardians ─────────────────────────────

/** The Scarab, freed: an ordinary golden beetle that walks off, calm (and dances at the end). */
/** turn a prop whose head points down its local -z toward (x, z) (Object3D.lookAt points +z) */
function faceToward(o: THREE.Object3D, x: number, z: number) {
  const dx = x - o.position.x, dz = z - o.position.z;
  if (dx * dx + dz * dz > 1e-6) o.rotation.y = Math.atan2(-dx, -dz);
}

export class GoldenScarab {
  readonly group = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private body = new THREE.Group();
  walk = 0;
  dance = 0;
  /** turn its head toward a world point (on the ground plane) */
  faceTo(x: number, z: number) {
    faceToward(this.group, x, z);
  }
  constructor() {
    const gold = stdMat('#e9b949', 0.25, 0.85);
    const dark = stdMat('#7a5a1a', 0.4, 0.6);
    const shell = new THREE.Mesh(sph(0.9, 24, 16), gold);
    shell.scale.set(1, 0.62, 1.25);
    shell.position.y = 0.75;
    const seam = new THREE.Mesh(box(0.04, 0.05, 2.1), dark);
    seam.position.y = 1.31;
    const head = new THREE.Mesh(sph(0.42, 16, 12), dark);
    head.position.set(0, 0.7, -1.15);
    head.scale.set(1.1, 0.8, 0.9);
    const eL = eye(0.12);
    eL.position.set(-0.22, 0.82, -1.45);
    eL.rotation.y = Math.PI;
    const eR = eye(0.12);
    eR.position.set(0.22, 0.82, -1.45);
    eR.rotation.y = Math.PI;
    this.body.add(shell, seam, head, eL, eR);
    for (const s of [-1, 1]) {
      const ant = new THREE.Mesh(capsule(0.025, 0.5, 4, 6), dark);
      ant.position.set(s * 0.16, 1.05, -1.4);
      ant.rotation.set(-0.8, 0, s * 0.4);
      this.body.add(ant);
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Mesh(capsule(0.06, 0.7, 4, 6), dark);
        leg.position.set(s * 0.85, 0.42, -0.55 + i * 0.55);
        leg.rotation.z = s * 1.0;
        this.body.add(leg);
        this.legs.push(leg);
      }
    }
    const shine = glowSprite('#ffe9a8', 3.5, 0.25);
    shine.position.y = 1;
    this.body.add(shine);
    this.group.add(this.body);
    shadows(this.group, true, false);
  }
  update(_dt: number, t: number, beat: number) {
    this.legs.forEach((l, i) => {
      const ph = (i % 2 ? Math.PI : 0) + Math.floor(i / 3) * 0.5;
      l.rotation.x = Math.sin(t * 12 + ph) * 0.45 * this.walk;
    });
    const hop = Math.abs(Math.sin(beat * Math.PI)) * 0.35 * this.dance;
    this.body.position.y = hop + Math.abs(Math.sin(t * 12)) * 0.04 * this.walk;
    this.body.rotation.z = Math.sin(beat * Math.PI) * 0.25 * this.dance;
  }
}

/** The Moth Queen, freed: her wings take the colours of the aurora. */
export class AuroraMoth {
  readonly group = new THREE.Group();
  private wings: THREE.Mesh[] = [];
  private wingMat: THREE.ShaderMaterial;
  /** 0 grey dust … 1 aurora colours */
  aurora = 1;
  flap = 1;
  /** turn its head toward a world point (on the ground plane) */
  faceTo(x: number, z: number) {
    faceToward(this.group, x, z);
  }
  constructor(span = 7) {
    this.wingMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAurora: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform float uAurora; varying vec2 vUv;
        void main(){ vec2 p = vUv - vec2(0.0, 0.5); float r = length(p * vec2(1.0, 1.4));
          float shape = smoothstep(1.0, 0.92, r) * smoothstep(0.0, 0.06, vUv.x);
          if (shape < 0.01) discard;
          float band = sin(vUv.x * 9.0 - uTime * 1.5 + vUv.y * 4.0) * 0.5 + 0.5;
          vec3 au = mix(vec3(0.2, 1.0, 0.62), vec3(0.62, 0.35, 1.0), band);
          au = mix(au, vec3(0.5, 0.85, 1.0), smoothstep(0.6, 1.0, vUv.x) * 0.5);
          float spot = smoothstep(0.14, 0.08, length(vUv - vec2(0.55, 0.55)));
          vec3 grey = vec3(0.55, 0.55, 0.62) * (0.8 + band * 0.2);
          vec3 c = mix(grey, au * 1.6, uAurora);
          c = mix(c, vec3(1.0, 0.95, 0.8) * (1.0 + uAurora), spot * 0.8);
          float edge = smoothstep(0.92, 0.8, r);
          gl_FragColor = vec4(c * (0.6 + 0.4 * edge), shape * 0.95); }`,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const body = new THREE.Mesh(capsule(0.28, 1.4, 6, 12), stdMat('#d9d3e6', 0.9));
    body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(sph(0.34, 14, 10), stdMat('#e6e0f0', 0.9));
    head.position.z = -1.0;
    const eL = eye(0.12);
    eL.position.set(-0.18, 0.1, -1.25);
    eL.rotation.y = Math.PI;
    const eR = eye(0.12);
    eR.position.set(0.18, 0.1, -1.25);
    eR.rotation.y = Math.PI;
    this.group.add(body, head, eL, eR);
    for (const s of [-1, 1]) {
      for (const [len, z, ang] of [[span * 0.5, -0.3, 0.15], [span * 0.36, 0.45, -0.35]] as [number, number, number][]) {
        const g = new THREE.PlaneGeometry(len, len * 0.75, 1, 1);
        g.translate(len / 2, 0, 0);
        g.rotateX(-Math.PI / 2);
        const w = new THREE.Mesh(g, this.wingMat);
        w.position.set(s * 0.2, 0.05, z);
        w.scale.x = s;
        w.rotation.y = s * ang;
        this.group.add(w);
        this.wings.push(w);
      }
      const ant = new THREE.Mesh(capsule(0.03, 0.9, 4, 6), stdMat('#e6e0f0', 0.9));
      ant.position.set(s * 0.15, 0.4, -1.5);
      ant.rotation.set(-0.9, 0, s * 0.5);
      this.group.add(ant);
    }
  }
  update(_dt: number, t: number) {
    this.wingMat.uniforms.uTime.value = t;
    this.wingMat.uniforms.uAurora.value = this.aurora;
    const f = Math.sin(t * 6) * 0.55 * this.flap;
    this.wings.forEach((w, i) => {
      const s = i < 2 ? -1 : 1;
      w.rotation.z = s * f * (i % 2 ? 0.8 : 1);
    });
  }
}

/** The Forge Golem, freed: a gentle stone blacksmith with a mossy beard and a warm smile. */
export class GentleGolem {
  readonly group = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  private body = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  pose: 'idle' | 'wave' | 'clap' | 'strike' | 'bow' = 'idle';
  private clapT = 0;
  constructor() {
    const stone = stdMat('#8a7f76', 0.85);
    const stone2 = stdMat('#a39789', 0.85);
    const moss = stdMat('#6f9a4a', 0.9);
    const apron = stdMat('#7a4a2a', 0.8);
    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 1), stone);
    torso.scale.set(1.25, 1.15, 0.95);
    torso.position.y = 3.2;
    const belly = new THREE.Mesh(box(1.9, 1.6, 0.3), apron);
    belly.position.set(0, 2.6, 1.25);
    belly.rotation.x = -0.1;
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 1), stone2);
    head.position.set(0, 5.05, 0.2);
    const beard = new THREE.Mesh(sph(0.75, 14, 10), moss);
    beard.scale.set(1.05, 0.75, 0.55);
    beard.position.set(0, 4.55, 0.72);
    const hair = new THREE.Mesh(sph(0.7, 14, 10), moss);
    hair.scale.set(1.1, 0.45, 1);
    hair.position.set(0, 5.62, 0.1);
    const nose = new THREE.Mesh(sph(0.22, 10, 8), stone2);
    nose.position.set(0, 5.0, 0.98);
    this.body.add(torso, belly, head, beard, hair, nose);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(sph(0.13, 10, 8), glowMat('#ffd27a', 2.4));
      e.position.set(s * 0.32, 5.22, 0.86);
      this.body.add(e);
      this.eyes.push(e);
      const brow = new THREE.Mesh(box(0.42, 0.12, 0.2), moss);
      brow.position.set(s * 0.32, 5.45, 0.86);
      brow.rotation.z = -s * 0.15;
      this.body.add(brow);
      const leg = new THREE.Mesh(cyl(0.55, 0.65, 2.2, 10), stone);
      leg.position.set(s * 0.8, 1.1, 0);
      const foot = new THREE.Mesh(sph(0.75, 12, 8), stone2);
      foot.scale.set(1, 0.5, 1.3);
      foot.position.set(s * 0.8, 0.2, 0.25);
      this.body.add(leg, foot);
    }
    const mkArm = (arm: THREE.Group, s: number) => {
      const up = new THREE.Mesh(cyl(0.45, 0.4, 1.8, 10), stone);
      up.position.y = -0.9;
      const hand = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), stone2);
      hand.position.y = -2.05;
      arm.add(up, hand);
      arm.position.set(s * 2.05, 4.0, 0);
      arm.rotation.z = s * 0.25;
      this.body.add(arm);
    };
    mkArm(this.armL, -1);
    mkArm(this.armR, 1);
    // the blacksmith's hammer in the right hand
    const hammer = new THREE.Group();
    const handle = new THREE.Mesh(cyl(0.08, 0.1, 1.6, 8), stdMat('#6b4426', 0.8));
    const headH = new THREE.Mesh(box(0.9, 0.5, 0.5), stdMat('#4a4550', 0.4, 0.7));
    headH.position.y = 0.8;
    hammer.add(handle, headH);
    hammer.position.y = -2.1;
    hammer.rotation.x = Math.PI / 2;
    this.armR.add(hammer);
    this.group.add(this.body);
    shadows(this.group, true, false);
  }
  update(dt: number, t: number, beat: number) {
    const bp = beat - Math.floor(beat);
    let lz = -0.25, rz = 0.25, lx = 0, rx = 0, lean = 0;
    switch (this.pose) {
      case 'wave':
        rz = 2.6 + Math.sin(t * 6) * 0.35;
        break;
      case 'clap': {
        const c = Math.exp(-bp * 6);
        lz = -1.2 + c * 0.55;
        rz = 1.2 - c * 0.55;
        lx = rx = -1.1;
        this.clapT += dt;
        break;
      }
      case 'strike':
        rx = -2.2 + Math.exp(-bp * 7) * 2.0;
        break;
      case 'bow':
        lean = 0.5;
        break;
    }
    this.armL.rotation.z = damp(this.armL.rotation.z, lz, 10, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, rz, 10, dt);
    this.armL.rotation.x = damp(this.armL.rotation.x, lx, 10, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, rx, 10, dt);
    this.body.rotation.x = damp(this.body.rotation.x, lean, 4, dt);
    this.body.position.y = Math.abs(Math.sin(beat * Math.PI)) * 0.08;
    for (const e of this.eyes) e.scale.y = Math.sin(t * 0.7) > 0.985 ? 0.15 : 1;
  }
}

// ───────────────────────────── places ─────────────────────────────

/**
 * A frozen pond that mirrors the world (Mirror Lake). `ghosts` are only visible in the reflection
 * (the Silence standing behind the Maestro).
 */
export class MirrorPond {
  readonly group = new THREE.Group();
  readonly mirror: Reflector;
  readonly ghosts: THREE.Object3D[] = [];
  constructor(radius = 7, res = 512) {
    this.mirror = new Reflector(new THREE.CircleGeometry(radius, 48), { textureWidth: res, textureHeight: res, color: 0x9fb8d6, clipBias: 0.003 });
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.y = 0.02;
    this.group.add(this.mirror);
    const rim = new THREE.Mesh(torus(radius, 0.55, 8, 48), stdMat('#f4f8ff', 0.9));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.5;
    this.group.add(rim);
    const frost = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
    frost.rotation.x = -Math.PI / 2;
    frost.position.y = 0.04;
    this.group.add(frost);
    // things that exist only in the reflection
    const prev = this.mirror.onBeforeRender;
    this.mirror.onBeforeRender = (...args) => {
      for (const g of this.ghosts) g.visible = true;
      prev.apply(this.mirror, args);
      for (const g of this.ghosts) g.visible = false;
    };
  }
  dispose() {
    this.mirror.dispose();
  }
}

/**
 * A monumental straight staircase of grey marble climbing along the road (the Citadel). Also gives the
 * height the colossus should walk on (`heightAt`).
 */
export class MarbleStairs {
  readonly group = new THREE.Group();
  constructor(readonly steps = 40, readonly rise = 0.55, readonly run = 2.2, readonly width = 18) {
    const p: THREE.BufferGeometry[] = [];
    const rng = new Rng(17);
    for (let i = 0; i < steps; i++) {
      const g = box(width, rise * (i + 1) + 2, run);
      p.push(painted(at(g, 0, (rise * (i + 1) + 2) / 2 - 2, -i * run - run / 2), new THREE.Color('#d7d3dc').offsetHSL(0, 0, rng.range(-0.04, 0.03))));
      // balustrade posts every few steps
      if (i % 3 === 0) {
        for (const s of [-1, 1]) {
          p.push(painted(at(box(0.5, 1.6, 0.5), s * (width / 2 - 0.4), rise * (i + 1) + 0.8, -i * run - run / 2), '#c9c5cf'));
          p.push(painted(at(sph(0.32, 8, 6), s * (width / 2 - 0.4), rise * (i + 1) + 1.75, -i * run - run / 2), '#e1dde6'));
        }
      }
      if (i % 8 === 4) {
        for (const s of [-1, 1]) {
          const col = cyl(0.7, 0.8, 9, 10);
          p.push(painted(at(col, s * (width / 2 + 1.5), rise * (i + 1) + 4.5, -i * run - run / 2), '#bcb8c4'));
          p.push(painted(at(box(2, 0.5, 2), s * (width / 2 + 1.5), rise * (i + 1) + 9.2, -i * run - run / 2), '#a09caa'));
        }
      }
    }
    const m = new THREE.Mesh(mergeParts(p), wcMat('#ffffff', 0.55, 0.05, true));
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
  }
  /** height of the step under a point in the stairs' local frame (null outside) */
  localHeight(x: number, z: number): number | null {
    if (Math.abs(x) > this.width / 2 + 2) return null;
    const i = Math.floor(-z / this.run);
    if (z > 0.5 || i >= this.steps) return null;
    return this.rise * (Math.max(0, i) + 1);
  }
}

/** A stone bridge over a river of lava. Gives the height of its deck (`localHeight`). */
export class LavaBridge {
  readonly group = new THREE.Group();
  constructor(readonly length = 26, readonly width = 12, readonly deckY = 1.2) {
    const p: THREE.BufferGeometry[] = [];
    const st = '#4a4044', dk = '#2f2729';
    p.push(painted(at(box(width, 0.8, length), 0, deckY - 0.4, 0), st));
    for (const s of [-1, 1]) {
      p.push(painted(at(box(0.7, 1.2, length), s * (width / 2 - 0.35), deckY + 0.6, 0), dk));
      for (let i = 0; i < 7; i++) p.push(painted(at(box(0.9, 0.5, 0.9), s * (width / 2 - 0.35), deckY + 1.4, -length / 2 + 2 + i * ((length - 4) / 6)), '#5c4a42'));
    }
    // piers and arches
    for (const z of [-length / 2 + 2, -length / 6, length / 6, length / 2 - 2]) {
      p.push(painted(at(box(width * 0.9, 6, 2.2), 0, deckY - 3.8, z), dk));
    }
    const m = new THREE.Mesh(mergeParts(p), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    // a glow on the underside, from the lava below
    const l = new THREE.PointLight('#ff7a2a', 30, 30, 1.5);
    l.position.y = deckY - 3;
    this.group.add(l);
  }
  localHeight(x: number, z: number): number | null {
    if (Math.abs(x) > this.width / 2 + 1.5 || Math.abs(z) > this.length / 2) return null;
    return this.deckY;
  }
}

/** A great anvil (the Anvil of the Forge). */
export function giantAnvil(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const iron = stdMat('#3a3438', 0.45, 0.7);
  const p: THREE.Mesh[] = [];
  const base = new THREE.Mesh(box(4, 1.2, 3), iron);
  base.position.y = 0.6;
  const waist = new THREE.Mesh(box(2.2, 2, 1.8), iron);
  waist.position.y = 2.2;
  const top = new THREE.Mesh(box(6, 1.3, 2.6), iron);
  top.position.y = 3.8;
  const horn = new THREE.Mesh(cone(1.1, 3, 12), iron);
  horn.rotation.z = Math.PI / 2;
  horn.position.set(-4.4, 3.8, 0);
  p.push(base, waist, top, horn);
  for (const m of p) g.add(m);
  const glowL = new THREE.PointLight('#ff6a1f', 20, 20, 1.6);
  glowL.position.y = 5;
  g.add(glowL);
  g.scale.setScalar(scale);
  shadows(g);
  return g;
}

/** A dark obelisk carved with the Silence's X (rises from the sand). */
export function muteObelisk(h = 6): THREE.Group {
  const g = new THREE.Group();
  const st = stdMat('#4a465c', 0.7);
  const shaft = new THREE.Mesh(cyl(0.45, 0.8, h, 4), st);
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = h / 2;
  const tip = new THREE.Mesh(cone(0.55, 1.1, 4), st);
  tip.rotation.y = Math.PI / 4;
  tip.position.y = h + 0.5;
  g.add(shaft, tip);
  const xm = glowMat('#b9a6ff', 2.2);
  for (const r of [0.7, -0.7]) {
    const bar = new THREE.Mesh(box(0.9, 0.14, 0.05), xm);
    bar.rotation.z = r;
    bar.position.set(0, h * 0.62, 0.62);
    g.add(bar);
  }
  shadows(g);
  return g;
}

/** A long ribbon of light across the sky (the road to the Citadel). */
export function skyPath(from: THREE.Vector3, to: THREE.Vector3, color = '#ffe9a8', lift = 0.25): LightThread {
  const th = new LightThread(color, 3.5, 1.2, lift);
  th.set(from, to);
  th.mat.uniforms.uFlow.value = 0.6;
  return th;
}

/** Notes rising softly from a musician as it plays (the music made visible). */
export class MusicMotes {
  readonly group = new THREE.Group();
  private items: { m: THREE.Mesh; color: string; t0: number; base: THREE.Vector3; dx: number; dz: number }[] = [];
  emit(at: THREE.Vector3, t: number, color: string, size = 0.22) {
    let it = this.items.find((i) => i.color === color && (t - i.t0 > 1.6 || t < i.t0));
    if (!it) {
      if (this.items.length > 80) return;
      const m = noteMesh(size, color, 2.2);
      this.group.add(m);
      it = { m, color, t0: t, base: at.clone(), dx: 0, dz: 0 };
      this.items.push(it);
    }
    it.t0 = t;
    it.base.copy(at);
    it.dx = (Math.random() - 0.5) * 0.8;
    it.dz = (Math.random() - 0.5) * 0.8;
  }
  update(t: number, camQ: THREE.Quaternion) {
    for (const it of this.items) {
      const k = (t - it.t0) / 1.6;
      it.m.visible = k >= 0 && k < 1;
      if (!it.m.visible) continue;
      it.m.position.set(it.base.x + it.dx * k, it.base.y + easeOutCubic(k) * 1.6, it.base.z + it.dz * k);
      it.m.quaternion.copy(camQ);
      it.m.scale.setScalar(Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - Math.pow(k, 4)));
    }
  }
}
