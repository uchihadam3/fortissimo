/**
 * The colossus: a giant, gentle turtle carrying a music town on its shell.
 * - Sculpted dome with hexagonal scutes (some are tower slots), scalloped rim, mossy edges.
 * - A little village: houses, lanterns with string lights, flags, the Heart crystal on top.
 * - Procedural walk: one foot plants on every beat (feet stay put on the ground while planted),
 *   the body sways and dips with each step, the head looks around and blinks.
 */
import * as THREE from 'three';
import { capsule, cone, cyl, damp, glowMat, mergeParts, painted, sph, stdMat, torus } from './kit';
import { noise2 } from '../core/noise';

import { SHELL, HEX_R, hexCenter, domeY, SLOT_DEFS } from '../sim/shell';
export { SHELL };

export interface Slot {
  id: number;
  /** local position on the shell (top of the pad) */
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  ring: number;
}

/** Which hex (q, r) a point belongs to, and its distance to the hex border (0 on the edge). */
function hexOf(x: number, z: number): { q: number; r: number; edge: number; cx: number; cz: number } {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * z) / HEX_R;
  const r = ((2 / 3) * z) / HEX_R;
  // cube rounding
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry - (-q - r));
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  const [cx, cz] = hexCenter(rx, rz);
  // distance to the hex edge: apothem minus the max projection on the 3 axes
  const px = x - cx, pz = z - cz;
  const ap = (HEX_R * Math.sqrt(3)) / 2;
  let m = 0;
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    m = Math.max(m, Math.abs(px * Math.cos(a) + pz * Math.sin(a)));
  }
  return { q: rx, r: rz, edge: ap - m, cx, cz };
}

function domeNormal(x: number, z: number): THREE.Vector3 {
  const e = 0.05;
  const hx = (domeY(x + e, z) - domeY(x - e, z)) / (2 * e);
  const hz = (domeY(x, z + e) - domeY(x, z - e)) / (2 * e);
  return new THREE.Vector3(-hx, 1, -hz).normalize();
}

export class Turtle {
  readonly group = new THREE.Group();
  /** everything that moves with the body (shell, head, village) */
  readonly body = new THREE.Group();
  readonly shell = new THREE.Group();
  readonly slots: Slot[] = [];
  private legs: { hip: THREE.Vector3; mesh: THREE.Mesh; lower: THREE.Mesh; elbow: THREE.Mesh; foot: THREE.Group; front: boolean; side: number; phase: number; plant: THREE.Vector3; from: THREE.Vector3; swinging: boolean; to: THREE.Vector3 }[] = [];
  private head = new THREE.Group();
  private neck: THREE.Mesh;
  private lids: THREE.Mesh[] = [];
  private pupils: THREE.Object3D[] = [];
  private tail = new THREE.Group();
  private flags: THREE.Mesh[] = [];
  private lanterns: THREE.Mesh[] = [];
  private heart: THREE.Mesh;
  private heartRings: THREE.Mesh[] = [];
  private blinkT = 0;
  private nextBlink = 2;
  private lookYaw = 0;
  private lookGoal = 0;
  private lookPitch = 0;
  private flinch = 0;
  private joy = 0;
  /** stomp: 0 = normal, rising = rearing up, 1 = slam */
  rear = 0;
  private lastBeat = -1;
  /** 0 awake … 1 asleep (lies down, eyes closed) */
  sleep = 0;
  /** village lights 0..1 */
  lights = 1;
  /** the Heart crystal's glow 0..1 */
  heartGlow = 1;
  private heartMat!: THREE.MeshStandardMaterial;
  private heartLight!: THREE.PointLight;
  /** called when a foot hits the ground (world position) */
  onStep: (pos: THREE.Vector3, front: boolean) => void = () => {};
  /** a point of interest the head should look at (world), or null */
  lookAt: THREE.Vector3 | null = null;
  readonly skinMat: THREE.MeshStandardMaterial;

  constructor() {
    this.group.add(this.body);
    this.body.add(this.shell);
    const skin = new THREE.Color('#4f957c');
    this.skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62, metalness: 0 });
    this.skinMat.onBeforeCompile = (sh) => {
      // soft mottled spots on the skin
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vObjPos;
          float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
          float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x), f.y),
                       mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x), f.y), f.z); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float sp = smoothstep(0.58, 0.68, n3(vObjPos * 2.3));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.86, 0.84), sp * 0.8);`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float rim = pow(1.0 - max(0.0, dot(normalize(vViewPosition), normal)), 3.0);
          gl_FragColor.rgb += rim * vec3(1.0, 0.95, 0.8) * 0.22;`);
    };
    this.skinMat.customProgramCacheKey = () => 'turtle-skin';
    this.buildShell();
    this.buildVillage();
    this.neck = this.buildHead(skin);
    this.buildLegs();
    this.buildTail();
    this.heart = this.buildHeart();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  // ───────────────────────────── shell ─────────────────────────────

  private buildShell() {
    const RAD = 46, SEG = 120;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const scuteCols = [new THREE.Color('#c4823f'), new THREE.Color('#b37334'), new THREE.Color('#cf9550'), new THREE.Color('#a9692f'), new THREE.Color('#bd7a3a')];
    const groove = new THREE.Color('#4e3119');
    const moss = new THREE.Color('#7f9b45');
    const c = new THREE.Color();
    for (let i = 0; i <= RAD; i++) {
      const u = i / RAD;
      for (let j = 0; j <= SEG; j++) {
        const v = (j / SEG) * Math.PI * 2;
        const x = Math.cos(v) * SHELL.rx * u;
        const z = Math.sin(v) * SHELL.rz * u;
        let y = domeY(x, z);
        const hx = hexOf(x, z);
        const n = domeNormal(x, z);
        // grooves between scutes, a bevel toward the edges of each plate
        const g = 1 - Math.min(1, hx.edge / 0.16);
        const bevel = Math.min(1, hx.edge / 0.5);
        const off = -0.1 * g * g + 0.05 * bevel;
        const px = x + n.x * off, py = y + n.y * off, pz = z + n.z * off;
        pos.push(px, SHELL.y0 + py, pz);
        const id = Math.abs((hx.q * 7 + hx.r * 13) % scuteCols.length);
        c.copy(scuteCols[id]);
        // radial gradient and growth rings on each plate
        const dc = Math.hypot(x - hx.cx, z - hx.cz) / HEX_R;
        c.offsetHSL(0, 0, 0.08 * (1 - dc) - 0.03);
        c.offsetHSL(0, 0, Math.sin(dc * 22) * 0.012);
        c.lerp(groove, g * 0.9);
        // moss creeping up from the rim
        const rim = u;
        const mossy = Math.max(0, noise2(x * 0.9, z * 0.9) * 0.6 + 0.2) * Math.pow(Math.max(0, rim - 0.72) / 0.28, 1.4);
        c.lerp(moss, Math.min(0.85, mossy));
        col.push(c.r, c.g, c.b);
        void y;
      }
    }
    for (let i = 0; i < RAD; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = i * (SEG + 1) + j, b = a + 1, cc = a + SEG + 1, d = cc + 1;
        idx.push(a, b, cc, b, d, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
    const dome = new THREE.Mesh(geo, mat);
    this.shell.add(dome);

    // scalloped rim (marginal scutes)
    const rimParts: THREE.BufferGeometry[] = [];
    const nM = 28;
    for (let k = 0; k < nM; k++) {
      const a = (k / nM) * Math.PI * 2;
      const g = sph(1, 12, 8);
      g.scale(0.72, 0.3, 0.42);
      g.rotateY(-a + Math.PI / 2);
      const x = Math.cos(a) * SHELL.rx * 1.02, z = Math.sin(a) * SHELL.rz * 1.02;
      g.translate(x, SHELL.y0 - 0.05, z);
      rimParts.push(painted(g, k % 2 ? '#a7652c' : '#b9773a'));
    }
    const rim = new THREE.Mesh(mergeParts(rimParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    this.shell.add(rim);
    // belly
    const belly = new THREE.Mesh(sph(1, 32, 16), stdMat('#e8d9b0', 0.7));
    belly.scale.set(SHELL.rx * 0.92, 0.9, SHELL.rz * 0.92);
    belly.position.y = SHELL.y0 - 0.25;
    this.shell.add(belly);

    // slots
    SLOT_DEFS.forEach(([q, r], id) => {
      const [x, z] = hexCenter(q, r);
      const y = domeY(x, z);
      this.slots.push({ id, pos: new THREE.Vector3(x, SHELL.y0 + y + 0.08, z), normal: domeNormal(x, z), ring: Math.abs(q) + Math.abs(r) + Math.abs(-q - r) > 2 ? 2 : 1 });
    });
  }

  /** Little houses, lanterns, string lights and flags on the scutes that are not slots. */
  private buildVillage() {
    const used = new Set(SLOT_DEFS.map(([q, r]) => `${q},${r}`));
    used.add('0,0');
    const spots: [number, number][] = [];
    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        if (used.has(`${q},${r}`)) continue;
        const [x, z] = hexCenter(q, r);
        if (Math.hypot(x / SHELL.rx, z / SHELL.rz) > 0.86) continue;
        spots.push([x, z]);
      }
    }
    const roofs = ['#c9473d', '#3f7ec0', '#e0a63a', '#6b4fa8', '#3f9a6b'];
    const walls = ['#f6ecdc', '#efe2c8', '#f3e6d4'];
    spots.forEach(([x, z], i) => {
      const y = SHELL.y0 + domeY(x, z);
      const n = domeNormal(x, z);
      const g = new THREE.Group();
      g.position.set(x, y - 0.05, z);
      // a little stone footing that sits flat on the curved plate
      const foot = new THREE.Mesh(cyl(0.55, 0.62, 0.35, 10), stdMat('#b9ab92', 0.8));
      foot.position.y = 0.05;
      g.add(foot);
      if (i % 3 !== 2) {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.56), stdMat(walls[i % walls.length], 0.8));
        body.position.y = 0.48;
        const roof = new THREE.Mesh(cone(0.58, 0.48, 4), stdMat(roofs[i % roofs.length], 0.6));
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 0.98;
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.02), stdMat('#6b4426', 0.7));
        door.position.set(0, 0.35, 0.29);
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.02), glowMat('#ffd98a', 1.4));
        win.position.set(0.18, 0.55, 0.29);
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), stdMat('#8a6b55', 0.8));
        chimney.position.set(-0.16, 1.08, -0.1);
        g.add(body, roof, door, win, chimney);
        g.rotation.y = Math.atan2(x, z) + Math.PI;
      } else {
        // a tiny tree with a swing of lanterns
        const trunk = new THREE.Mesh(cyl(0.06, 0.09, 0.7, 6), stdMat('#7a5236', 0.8));
        trunk.position.y = 0.5;
        const crown = new THREE.Mesh(sph(0.42, 12, 10), stdMat('#5fae4a', 0.8));
        crown.position.y = 1.05;
        crown.scale.set(1, 0.85, 1);
        g.add(trunk, crown);
      }
      g.rotation.x = Math.atan2(n.z, 1) * 0.0;
      this.shell.add(g);
    });
    // lantern posts with glowing bulbs around the shell, strung together
    const bulbs: THREE.Vector3[] = [];
    const posts = 10;
    for (let k = 0; k < posts; k++) {
      const a = (k / posts) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * SHELL.rx * 0.8, z = Math.sin(a) * SHELL.rz * 0.8;
      const y = SHELL.y0 + domeY(x, z);
      const post = new THREE.Mesh(cyl(0.035, 0.045, 1.2, 6), stdMat('#5a3c24', 0.7));
      post.position.set(x, y + 0.55, z);
      this.shell.add(post);
      const lamp = new THREE.Mesh(sph(0.11, 10, 8), glowMat('#ffcf7a', 2.2));
      lamp.position.set(x, y + 1.2, z);
      this.shell.add(lamp);
      this.lanterns.push(lamp);
      bulbs.push(new THREE.Vector3(x, y + 1.15, z));
      if (k % 3 === 0) {
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3, 6, 1), new THREE.MeshStandardMaterial({ color: roofs[k % roofs.length], side: THREE.DoubleSide, roughness: 0.7 }));
        flag.position.set(x + 0.27, y + 1.0, z);
        flag.geometry.translate(0.25, 0, 0);
        flag.position.x = x;
        this.shell.add(flag);
        this.flags.push(flag);
      }
    }
    // string lights between posts (catenary of small bulbs)
    const bulbGeo = sph(0.05, 6, 4);
    const bulbMats = ['#ffe9a8', '#ffb3cf', '#bfe9ff', '#d9ffb8'].map((c) => glowMat(c, 2.4));
    for (let k = 0; k < bulbs.length; k++) {
      const a = bulbs[k], b = bulbs[(k + 1) % bulbs.length];
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.32;
        // keep above the dome surface
        p.y = Math.max(p.y, SHELL.y0 + domeY(p.x, p.z) + 0.25);
        const m = new THREE.Mesh(bulbGeo, bulbMats[(k + i) % bulbMats.length]);
        m.position.copy(p);
        this.shell.add(m);
      }
    }
  }

  private buildHeart(): THREE.Mesh {
    const top = SHELL.y0 + domeY(0, 0);
    const base = new THREE.Mesh(cyl(0.55, 0.75, 0.5, 8), stdMat('#efe6d6', 0.6));
    base.position.y = top + 0.1;
    this.shell.add(base);
    const ped = new THREE.Mesh(cyl(0.18, 0.3, 0.8, 8), stdMat('#e9b949', 0.3, 0.8));
    ped.position.y = top + 0.7;
    this.shell.add(ped);
    const g = new THREE.OctahedronGeometry(0.42, 0);
    g.scale(1, 1.6, 1);
    this.heartMat = new THREE.MeshStandardMaterial({ color: '#c9efff', emissive: new THREE.Color('#7fd6ff'), emissiveIntensity: 1.6, roughness: 0.1, flatShading: true });
    const m = new THREE.Mesh(g, this.heartMat);
    m.position.y = top + 1.75;
    this.shell.add(m);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(torus(0.7 + i * 0.1, 0.03, 6, 48), stdMat('#e9b949', 0.3, 0.85));
      r.position.y = top + 1.75;
      this.shell.add(r);
      this.heartRings.push(r);
    }
    const light = new THREE.PointLight('#9fe0ff', 4, 9, 1.8);
    light.position.y = top + 1.8;
    this.shell.add(light);
    this.heartLight = light;
    return m;
  }

  // ───────────────────────────── head, legs, tail ─────────────────────────────

  private buildHead(skin: THREE.Color): THREE.Mesh {
    // neck: a tapered tube from the body to the head
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.3, -3.8),
      new THREE.Vector3(0, 2.6, -5.0),
      new THREE.Vector3(0, 3.0, -5.9),
    ]);
    const neckGeo = new THREE.TubeGeometry(curve, 16, 0.95, 18, false);
    // taper + wrinkles
    const p = neckGeo.attributes.position as THREE.BufferAttribute;
    const center = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const t = Math.min(1, Math.max(0, (-v.z - 3.8) / 2.1));
      curve.getPoint(t, center);
      const off = v.clone().sub(center);
      const k = 1 - t * 0.22 + Math.sin(t * 30) * 0.025;
      v.copy(center).add(off.multiplyScalar(k));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    neckGeo.computeVertexNormals();
    const neck = new THREE.Mesh(neckGeo, this.skinMat);
    this.body.add(neck);

    const H = this.head;
    H.position.set(0, 3.15, -6.15);
    H.scale.setScalar(1.18);
    this.body.add(H);
    const skull = new THREE.Mesh(sph(1, 36, 26), this.skinMat);
    skull.scale.set(1.12, 0.98, 1.38);
    H.add(skull);
    // snout
    const snout = new THREE.Mesh(sph(1, 28, 20), this.skinMat);
    snout.scale.set(0.82, 0.6, 0.75);
    snout.position.set(0, -0.22, -0.95);
    H.add(snout);
    // cream chin
    const chin = new THREE.Mesh(sph(1, 24, 16), stdMat('#e8d9b0', 0.7));
    chin.scale.set(0.8, 0.42, 0.85);
    chin.position.set(0, -0.55, -0.55);
    H.add(chin);
    // eyes: big and kind
    for (const s of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(s * 0.55, 0.26, -0.92);
      eg.rotation.y = s * 0.38;
      const white = new THREE.Mesh(sph(0.36, 24, 18), stdMat('#fbfaf3', 0.25));
      const iris = new THREE.Mesh(sph(0.22, 20, 14), stdMat('#5a3a22', 0.25));
      iris.position.z = -0.17;
      iris.scale.set(1, 1.05, 0.55);
      const pupil = new THREE.Mesh(sph(0.13, 16, 12), stdMat('#120c08', 0.2));
      pupil.position.z = -0.27;
      pupil.scale.set(1, 1.05, 0.45);
      const hl = new THREE.Mesh(sph(0.06, 8, 6), glowMat('#ffffff', 1.6));
      hl.position.set(s * -0.08, 0.1, -0.33);
      const hl2 = new THREE.Mesh(sph(0.03, 8, 6), glowMat('#ffffff', 1.4));
      hl2.position.set(s * 0.06, -0.07, -0.33);
      const look = new THREE.Group();
      look.add(iris, pupil, hl, hl2);
      eg.add(white, look);
      this.pupils.push(look);
      // eyelid: a cap that closes over the eye
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.385, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.skinMat);
      lid.rotation.x = -Math.PI / 2 - 0.9;
      lid.userData.open = -Math.PI / 2 - 0.9;
      lid.visible = false;
      eg.add(lid);
      this.lids.push(lid);
      // brow ridge
      const brow = new THREE.Mesh(capsule(0.08, 0.32, 4, 8), this.skinMat);
      brow.rotation.z = Math.PI / 2 + s * 0.15;
      brow.position.set(0, 0.36, -0.12);
      eg.add(brow);
      H.add(eg);
      // blush
      const blush = new THREE.Mesh(sph(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff9fae', transparent: true, opacity: 0.45 }));
      blush.position.set(s * 0.78, -0.22, -0.85);
      blush.scale.set(1, 0.55, 0.4);
      blush.rotation.y = s * 0.6;
      H.add(blush);
      // nostril
      const nos = new THREE.Mesh(sph(0.05, 8, 6), stdMat('#2a3a34', 0.6));
      nos.position.set(s * 0.18, 0.03, -1.66);
      H.add(nos);
    }
    // smile
    const smile = new THREE.Mesh(torus(0.42, 0.028, 6, 24, Math.PI * 0.7), stdMat('#2a3a34', 0.6));
    smile.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI + Math.PI * 0.15);
    smile.position.set(0, -0.36, -1.3);
    H.add(smile);
    void skin;
    return neck;
  }

  private buildLegs() {
    const defs: [number, number, number, boolean][] = [
      // x, z, phase (beat index within the bar when it plants), front
      [-3.15, -2.6, 0, true],
      [3.0, 2.9, 1, false],
      [3.15, -2.6, 2, true],
      [-3.0, 2.9, 3, false],
    ];
    for (const [x, z, ph, front] of defs) {
      const hip = new THREE.Vector3(x * 0.78, 2.2, z * 0.92);
      const geo = new THREE.CylinderGeometry(0.95, 0.82, 1, 20, 4);
      geo.translate(0, -0.5, 0);
      const leg = new THREE.Mesh(geo, this.skinMat);
      this.body.add(leg);
      const lgeo = new THREE.CylinderGeometry(0.82, 0.92, 1, 20, 4);
      lgeo.translate(0, -0.5, 0);
      const lower = new THREE.Mesh(lgeo, this.skinMat);
      this.body.add(lower);
      const elbow = new THREE.Mesh(sph(0.86, 20, 14), this.skinMat);
      this.body.add(elbow);
      const foot = new THREE.Group();
      const pad = new THREE.Mesh(sph(1, 20, 12), this.skinMat);
      pad.scale.set(0.98, 0.5, 1.1);
      pad.position.y = 0.32;
      foot.add(pad);
      for (let k = -1; k <= 1; k++) {
        const nail = new THREE.Mesh(sph(0.2, 10, 8), stdMat('#f3ead2', 0.5));
        nail.scale.set(1, 0.7, 1.2);
        nail.position.set(k * 0.42, 0.18, -0.92 + Math.abs(k) * 0.12);
        foot.add(nail);
      }
      this.group.add(foot);
      this.legs.push({ hip, mesh: leg, lower, elbow, foot, front, side: Math.sign(x), phase: ph, plant: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), swinging: false });
    }
  }

  private buildTail() {
    const t = new THREE.Mesh(cone(0.42, 1.5, 14), this.skinMat);
    t.rotation.x = Math.PI / 2 + 0.35;
    t.position.z = 0.6;
    this.tail.add(t);
    this.tail.position.set(0, 2.0, 5.0);
    this.body.add(this.tail);
  }

  // ───────────────────────────── animation ─────────────────────────────

  /** Local → world for a point on the body (after update). */
  slotWorld(id: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = this.slots[id];
    return this.shell.localToWorld(out.copy(s.pos));
  }

  hurt() {
    this.flinch = 1;
  }

  cheer() {
    this.joy = 1;
  }

  /**
   * @param beatPos  song position in beats (the walk is locked to it)
   * @param poseAt   world transform of the body at a given beat (for planting feet ahead)
   * @param ground   ground height at a world xz
   * @param walking  false when the colossus stands still
   */
  update(dt: number, t: number, beatPos: number, poseAt: (beat: number, out: THREE.Matrix4) => void, ground: (x: number, z: number) => number, walking: boolean) {
    const m = new THREE.Matrix4();
    poseAt(beatPos, m);
    m.decompose(this.group.position, this.group.quaternion, this.group.scale);
    this.group.updateMatrixWorld(true);
    // feet: each one swings during the beat before its plant beat
    let dip = 0;
    let roll = 0;
    const swingLen = 0.85;
    for (const L of this.legs) {
      const cycle = 4;
      const b = beatPos - L.phase;
      const k = Math.floor(b / cycle);
      const plantBeat = k * cycle + L.phase + cycle; // next plant
      const swingStart = plantBeat - swingLen;
      const hipAt = (beat: number) => {
        const mm = new THREE.Matrix4();
        poseAt(beat, mm);
        const hp = L.hip.clone().applyMatrix4(mm);
        // reach a little forward of the hip
        const fwd = new THREE.Vector3(0, 0, -1).transformDirection(mm);
        hp.addScaledVector(fwd, L.front ? 0.5 : 0.3);
        hp.x += L.side * 0.0;
        hp.y = ground(hp.x, hp.z);
        return hp;
      };
      // never let a foot stay far behind (after a jump in time, a pause or a teleport)
      if (L.plant.lengthSq()) {
        const hp0 = hipAt(beatPos);
        if (Math.hypot(L.plant.x - hp0.x, L.plant.z - hp0.z) > 3.2) {
          L.plant.copy(hp0);
          L.swinging = false;
        }
      }
      if (!walking) {
        const hp = hipAt(beatPos);
        L.plant.lerp(hp, Math.min(1, dt * 4));
        L.foot.position.copy(L.plant);
      } else if (beatPos >= swingStart) {
        const s = (beatPos - swingStart) / swingLen;
        if (!L.swinging) {
          L.swinging = true;
          L.from.copy(L.plant.lengthSq() ? L.plant : hipAt(beatPos));
          L.to.copy(hipAt(plantBeat));
        }
        const e = s * s * (3 - 2 * s);
        L.foot.position.lerpVectors(L.from, L.to, e);
        L.foot.position.y += Math.sin(s * Math.PI) * 0.75;
        roll += L.side * Math.sin(s * Math.PI) * 0.02;
      } else {
        if (L.swinging) {
          L.swinging = false;
          L.plant.copy(L.to);
          this.onStep(L.plant.clone(), L.front);
        }
        if (!L.plant.lengthSq()) L.plant.copy(hipAt(beatPos));
        L.foot.position.copy(L.plant);
        // body dips right after a plant
        const since = beatPos - (plantBeat - cycle);
        if (since >= 0 && since < 1) dip += Math.exp(-since * 5) * 0.12;
      }
      // a stomp lifts the front feet
      if (this.rear > 0 && L.front) L.foot.position.y += this.rear * 1.4;
      // orient the foot along the body
      L.foot.quaternion.copy(this.group.quaternion);
      // leg: from hip (in body space) to the foot
      const hipW = L.hip.clone();
      this.body.localToWorld(hipW);
      const footTop = L.foot.position.clone();
      footTop.y += 0.45;
      const dir = footTop.clone().sub(hipW);
      const len = dir.length();
      void len;
      const hipLocal = this.body.worldToLocal(hipW.clone());
      const footLocal = this.body.worldToLocal(footTop.clone());
      // elbow bends outward, like a tortoise's sturdy legs
      const elbow = hipLocal.clone().lerp(footLocal, 0.5);
      elbow.x += L.side * 0.75;
      elbow.y += 0.25;
      const down = new THREE.Vector3(0, -1, 0);
      const setSeg = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
        m.position.copy(a);
        const dd = b.clone().sub(a);
        m.scale.set(1, Math.max(0.1, dd.length()), 1);
        m.quaternion.setFromUnitVectors(down, dd.normalize());
      };
      setSeg(L.mesh, hipLocal, elbow);
      setSeg(L.lower, elbow, footLocal);
      L.elbow.position.copy(elbow);
    }
    // body bob, sway and rearing (and lying down to sleep)
    this.body.position.y = damp(this.body.position.y, -dip + this.rear * 0.9 - this.sleep * 1.5, 14, dt);
    this.body.rotation.z = damp(this.body.rotation.z, roll * 4, 6, dt);
    this.body.rotation.x = damp(this.body.rotation.x, this.rear * 0.28, 8, dt);
    // head: looks around, or at something interesting
    this.nextBlink -= dt;
    if (this.nextBlink < 0) {
      this.nextBlink = 2.5 + Math.random() * 3.5;
      this.blinkT = 0.16;
    }
    this.blinkT -= dt;
    if (Math.random() < dt * 0.25) this.lookGoal = (Math.random() - 0.5) * 0.7;
    let goalYaw = this.lookGoal, goalPitch = 0;
    if (this.lookAt) {
      const lp = this.head.parent!.worldToLocal(this.lookAt.clone());
      const rel = lp.sub(this.head.position);
      goalYaw = Math.max(-0.8, Math.min(0.8, Math.atan2(-rel.x, -rel.z)));
      goalPitch = Math.max(-0.3, Math.min(0.25, Math.atan2(rel.y, Math.hypot(rel.x, rel.z))));
    }
    this.lookYaw = damp(this.lookYaw, goalYaw, 3, dt);
    this.lookPitch = damp(this.lookPitch, goalPitch, 3, dt);
    this.flinch = Math.max(0, this.flinch - dt * 1.6);
    this.joy = Math.max(0, this.joy - dt * 0.4);
    const bp = beatPos - Math.floor(beatPos);
    this.head.rotation.y = this.lookYaw;
    this.head.rotation.x = this.lookPitch - Math.exp(-bp * 4) * 0.04 + this.flinch * 0.25 - this.joy * Math.abs(Math.sin(t * 6)) * 0.2;
    this.head.position.z = -6.15 + this.flinch * 0.5;
    this.head.position.y = 3.15 + Math.sin(beatPos * Math.PI) * 0.05;
    const closed = this.blinkT > 0 || this.flinch > 0.6 || this.sleep > 0.5;
    for (const lid of this.lids) {
      const open = lid.userData.open as number;
      lid.rotation.x = damp(lid.rotation.x, closed ? -0.15 : open, 25, dt);
      lid.visible = lid.rotation.x > open + 0.08;
    }
    for (const p of this.pupils) {
      p.rotation.y = this.lookYaw * 0.4;
      p.rotation.x = -this.lookPitch * 0.5;
    }
    this.tail.rotation.y = Math.sin(t * 1.7) * 0.25 + this.joy * Math.sin(t * 12) * 0.4;
    // village life
    this.flags.forEach((f, i) => (f.rotation.y = Math.sin(t * 3 + i) * 0.4 + 0.3));
    this.lanterns.forEach((l, i) => (l.scale.setScalar((1 + Math.exp(-bp * 4) * 0.25 + Math.sin(t * 2 + i) * 0.04) * (0.2 + 0.8 * this.lights))));
    this.heartMat.emissiveIntensity = 0.15 + 1.5 * this.heartGlow * (1 + Math.exp(-bp * 5) * 0.3);
    this.heartLight.intensity = 4 * this.heartGlow;
    this.heart.rotation.y = t * 0.7;
    this.heart.scale.setScalar(1 + Math.exp(-bp * 5) * 0.08);
    this.heartRings.forEach((r, i) => {
      r.rotation.x = t * (0.5 + i * 0.3) + i;
      r.rotation.y = t * (0.35 + i * 0.2);
    });
    if (this.lastBeat !== Math.floor(beatPos)) this.lastBeat = Math.floor(beatPos);
  }
}
