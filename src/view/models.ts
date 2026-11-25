/** Level fixtures and characters: build pads, Silence gates, the Heart, route switches, the Maestro. */
import * as THREE from 'three';
import { at, box, capsule, cone, cyl, damp, glowMat, mergeParts, mesh, painted, rotX, rotZ, sph, stdMat, torus, vcMat } from './kit';
import { Bins, CharMats, assembleBird, bird, ell, grp, paint, type Bird, type BirdDef } from './musicians';

// ───────────────────────────── build pad ─────────────────────────────

export class PadView {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private glyph: THREE.Mesh;
  /** 0 idle · 1 affordable pulse · 2 hovered · 3 selected */
  state = 0;
  occupied = false;
  private glow = 0;

  constructor(stone: string, accent: string) {
    const parts = [
      painted(at(cyl(0.44, 0.48, 0.12, 20), 0, 0.06, 0), stone),
      painted(at(cyl(0.38, 0.42, 0.06, 20), 0, 0.14, 0), new THREE.Color(stone).offsetHSL(0, 0, 0.06)),
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(painted(at(box(0.07, 0.07, 0.07), Math.cos(a) * 0.46, 0.06, Math.sin(a) * 0.46), new THREE.Color(stone).offsetHSL(0, 0, -0.08)));
    }
    const base = mesh(mergeParts(parts), vcMat('flat'));
    this.group.add(base);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.2), transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false });
    this.ring = new THREE.Mesh(torus(0.33, 0.018, 6, 40), this.ringMat);
    rotX(this.ring.geometry, Math.PI / 2);
    this.ring.position.y = 0.175;
    this.group.add(this.ring);
    // a little eighth-note glyph engraved in the middle
    const g = mergeParts([
      painted(at(cyl(0.05, 0.05, 0.01, 12), -0.03, 0, 0.05), accent),
      painted(at(box(0.016, 0.01, 0.17), 0.014, 0, -0.03), accent),
      painted(at(box(0.07, 0.01, 0.02), 0.045, 0, -0.11), accent),
    ]);
    this.glyph = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, toneMapped: false }));
    this.glyph.position.y = 0.176;
    this.group.add(this.glyph);
  }

  update(dt: number, t: number, beat: number) {
    const target = this.occupied ? 0 : this.state === 3 ? 1 : this.state === 2 ? 0.85 : this.state === 1 ? 0.45 + 0.35 * Math.exp(-beat * 4) : 0.15;
    this.glow = damp(this.glow, target, 10, dt);
    this.ringMat.opacity = this.glow;
    this.ring.visible = this.glow > 0.02;
    this.glyph.visible = !this.occupied;
    (this.glyph.material as THREE.MeshBasicMaterial).opacity = 0.25 + this.glow * 0.6;
    const s = 1 + (this.state >= 2 && !this.occupied ? 0.06 : 0) + (this.state === 1 ? 0.03 * Math.exp(-beat * 5) : 0);
    this.ring.scale.setScalar(s);
    this.ring.rotation.y = t * 0.3;
  }
}

// ───────────────────────────── Silence gate ─────────────────────────────

export class GateView {
  readonly group = new THREE.Group();
  private vortexMat: THREE.ShaderMaterial;
  private pulse = 0;

  constructor(stone: string) {
    const parts = [
      painted(at(box(0.3, 1.3, 0.3), -0.62, 0.65, 0), stone),
      painted(at(box(0.3, 1.3, 0.3), 0.62, 0.65, 0), stone),
      painted(at(box(1.6, 0.26, 0.36), 0, 1.38, 0), new THREE.Color(stone).offsetHSL(0, 0, -0.05)),
      painted(at(box(0.4, 0.12, 0.4), -0.62, 0.06, 0), new THREE.Color(stone).offsetHSL(0, 0, -0.1)),
      painted(at(box(0.4, 0.12, 0.4), 0.62, 0.06, 0), new THREE.Color(stone).offsetHSL(0, 0, -0.1)),
      painted(at(cone(0.12, 0.22, 4), 0, 1.62, 0), '#2a2638'),
    ];
    this.group.add(mesh(mergeParts(parts), vcMat('flat')));
    this.vortexMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uPulse; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * vec2(1.0, 1.25);
          float r = length(p);
          float a = atan(p.y, p.x);
          float sw = sin(a * 3.0 + r * 14.0 - uTime * 3.0) * 0.5 + 0.5;
          float edge = smoothstep(0.5, 0.36, r);
          vec3 c = mix(vec3(0.03, 0.02, 0.06), vec3(0.42, 0.36, 0.62), sw * smoothstep(0.05, 0.45, r));
          c += vec3(0.7, 0.6, 1.0) * smoothstep(0.42, 0.48, r) * smoothstep(0.52, 0.46, r) * (0.6 + uPulse);
          gl_FragColor = vec4(c, edge * 0.96);
        }`,
    });
    const v = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.15), this.vortexMat);
    v.position.y = 0.62;
    this.group.add(v);
  }

  spawned() {
    this.pulse = 1;
  }

  update(dt: number, t: number) {
    this.pulse = Math.max(0, this.pulse - dt * 2.5);
    this.vortexMat.uniforms.uTime.value = t;
    this.vortexMat.uniforms.uPulse.value = this.pulse;
  }
}

// ───────────────────────────── the Heart ─────────────────────────────

export class HeartView {
  readonly group = new THREE.Group();
  private crystal: THREE.Mesh;
  private crystalMat: THREE.MeshStandardMaterial;
  private rings: THREE.Mesh[] = [];
  private light: THREE.PointLight;
  private hurt = 0;
  private notes: THREE.Mesh[] = [];
  health = 1;
  /** shards restored (0..5): small gems orbiting */
  private shardGroup = new THREE.Group();

  constructor(shards = 0) {
    const gold = '#e9b949';
    const stone = '#efe6d6';
    const base = mergeParts([
      painted(at(cyl(0.62, 0.7, 0.16, 8), 0, 0.08, 0), stone),
      painted(at(cyl(0.5, 0.56, 0.12, 8), 0, 0.22, 0), new THREE.Color(stone).offsetHSL(0, 0, -0.06)),
      painted(at(cyl(0.18, 0.26, 0.5, 8), 0, 0.5, 0), stone),
      painted(at(cyl(0.3, 0.2, 0.1, 8), 0, 0.78, 0), gold),
    ]);
    this.group.add(mesh(base, vcMat('flat')));
    this.crystalMat = new THREE.MeshStandardMaterial({ color: '#bfe9ff', emissive: new THREE.Color('#7fd6ff'), emissiveIntensity: 1.4, roughness: 0.1, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.92 });
    const cg = new THREE.OctahedronGeometry(0.28, 0);
    cg.scale(1, 1.55, 1);
    this.crystal = new THREE.Mesh(cg, this.crystalMat);
    this.crystal.position.y = 1.32;
    this.crystal.castShadow = true;
    this.group.add(this.crystal);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(torus(0.46 + i * 0.07, 0.022, 6, 48), stdMat(gold, 0.3, 0.8));
      r.position.y = 1.32;
      r.castShadow = true;
      this.rings.push(r);
      this.group.add(r);
    }
    this.light = new THREE.PointLight('#9fe0ff', 2.5, 5, 1.6);
    this.light.position.y = 1.4;
    this.group.add(this.light);
    // little notes floating around
    for (let i = 0; i < 4; i++) {
      const n = noteMesh(0.09, '#ffe9a8');
      this.notes.push(n);
      this.group.add(n);
    }
    this.group.add(this.shardGroup);
    this.setShards(shards);
  }

  setShards(n: number) {
    this.shardGroup.clear();
    const cols = ['#7cd35a', '#ffb347', '#8fe2ff', '#ff6a3a', '#ffd36b'];
    for (let i = 0; i < n; i++) {
      const g = new THREE.OctahedronGeometry(0.07, 0);
      g.scale(1, 1.6, 1);
      const m = new THREE.Mesh(g, glowMat(cols[i % 5], 1.8));
      m.userData.i = i;
      this.shardGroup.add(m);
    }
  }

  hit() {
    this.hurt = 1;
  }

  update(dt: number, t: number, beat: number) {
    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    const pulse = Math.exp(-beat * 5);
    const life = Math.max(0.15, this.health);
    this.crystal.rotation.y = t * 0.6;
    this.crystal.position.y = 1.32 + Math.sin(t * 1.6) * 0.04;
    const s = 1 + pulse * 0.06 * life - this.hurt * 0.12;
    this.crystal.scale.setScalar(s);
    this.crystalMat.emissiveIntensity = (0.5 + 1.3 * life) * (1 + pulse * 0.4) + this.hurt * 2;
    this.crystalMat.emissive.setRGB(0.5 + this.hurt * 0.5, 0.84 * (1 - this.hurt * 0.6), 1 * (1 - this.hurt * 0.6));
    this.rings.forEach((r, i) => {
      r.rotation.x = t * (0.5 + i * 0.3) + i;
      r.rotation.y = t * (0.35 + i * 0.2);
      r.scale.setScalar(1 + pulse * 0.03);
    });
    this.light.intensity = (1.2 + 2.2 * life) * (1 + pulse * 0.5);
    this.notes.forEach((n, i) => {
      const a = t * 0.7 + (i / this.notes.length) * Math.PI * 2;
      n.position.set(Math.cos(a) * 0.75, 1.1 + Math.sin(t * 1.3 + i) * 0.25, Math.sin(a) * 0.75);
      n.rotation.y = -a + Math.PI / 2;
      n.visible = life > 0.25 + i * 0.18;
    });
    this.shardGroup.children.forEach((m, i) => {
      const a = -t * 0.9 + (i / Math.max(1, this.shardGroup.children.length)) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.95, 1.55 + Math.sin(t * 2 + i) * 0.08, Math.sin(a) * 0.95);
      m.rotation.y = t * 2;
    });
  }
}

/** An eighth note (♪) mesh: head, stem and flag. Geometry and material are cached and shared. */
const noteGeoCache = new Map<string, THREE.BufferGeometry>();
const noteMatCache = new Map<string, THREE.MeshBasicMaterial>();
export function noteMesh(size: number, color: string, intensity = 1.6): THREE.Mesh {
  const gk = `${size}`;
  let g = noteGeoCache.get(gk);
  if (!g) {
    const head = new THREE.SphereGeometry(size * 0.42, 12, 8);
    head.scale(1.25, 0.9, 0.7);
    head.rotateZ(0.45);
    const stem = at(box(size * 0.1, size * 1.3, size * 0.1), size * 0.42, size * 0.62, 0);
    const flag = at(rotZ(box(size * 0.5, size * 0.12, size * 0.1), -0.7), size * 0.62, size * 1.1, 0);
    g = mergeParts([painted(head, '#ffffff'), painted(stem, '#ffffff'), painted(flag, '#ffffff')]);
    noteGeoCache.set(gk, g);
  }
  const mk = `${color}:${intensity}`;
  let m = noteMatCache.get(mk);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
    noteMatCache.set(mk, m);
  }
  return new THREE.Mesh(g, m);
}

// ───────────────────────────── route switch ─────────────────────────────

export class SwitchView {
  readonly group = new THREE.Group();
  private arrow = new THREE.Group();
  private target = 0;
  private angle = 0;
  private flash = 0;
  private arrowMat: THREE.MeshBasicMaterial;

  constructor(private dirs: { x: number; z: number }[]) {
    const post = mergeParts([
      painted(at(cyl(0.16, 0.2, 0.12, 10), 0, 0.06, 0), '#6b5a4a'),
      painted(at(cyl(0.045, 0.05, 0.7, 8), 0, 0.45, 0), '#8a6b4a'),
      painted(at(sph(0.07, 10, 8), 0, 0.82, 0), '#e9b949'),
    ]);
    this.group.add(mesh(post, vcMat()));
    this.arrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd36b').multiplyScalar(1.4), toneMapped: false });
    const shaft = new THREE.Mesh(box(0.42, 0.06, 0.12), this.arrowMat);
    shaft.position.x = 0.12;
    const head = new THREE.Mesh(rotZ(cone(0.15, 0.22, 3), -Math.PI / 2), this.arrowMat);
    head.position.x = 0.4;
    head.rotation.x = Math.PI / 2;
    this.arrow.add(shaft, head);
    this.arrow.position.y = 0.95;
    this.group.add(this.arrow);
    this.set(0, true);
  }

  set(i: number, instant = false) {
    const d = this.dirs[i] ?? { x: 1, z: 0 };
    this.target = Math.atan2(-d.z, d.x);
    if (instant) this.angle = this.target;
    else this.flash = 1;
  }

  update(dt: number, t: number) {
    let d = this.target - this.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.angle += d * Math.min(1, dt * 12);
    this.arrow.rotation.y = this.angle;
    this.flash = Math.max(0, this.flash - dt * 2);
    this.arrow.scale.setScalar(1 + this.flash * 0.4 + Math.sin(t * 4) * 0.04);
    this.arrow.position.y = 0.95 + Math.sin(t * 2.2) * 0.04;
  }
}

// ───────────────────────────── the Maestro ─────────────────────────────

export type MaestroPose = 'conduct' | 'idle' | 'cheer' | 'sad' | 'point' | 'bow' | 'raise';

/** the Maestro is a note bird too: peach, round, in a tailcoat, with a curl and a glowing baton */
const MAESTRO: BirdDef = {
  R: 0.3, sy: 1.06, leg: 0.085, body: '#ffe1c4', belly: '#fff3e6', beak: '#f4a43a', feet: '#151221', cheek: '#ff9aa8', iris: '#5a3a2a',
  eye: 0.215, spread: 0.37, eyeUp: 0.52, wing: 0.6, lid: 0,
};

let maestroTpl: { root: THREE.Group; bird: Bird } | null = null;
function maestroTemplate() {
  if (maestroTpl) return maestroTpl;
  const b = new Bins();
  const d = MAESTRO;
  const R = d.R, cy = d.leg + R * d.sy;
  const skin = new THREE.Color(d.body), coat = new THREE.Color('#1f1b2e'), lapel = new THREE.Color('#463e60'), shirt = new THREE.Color('#fbf7ef');
  const skinShade = new THREE.Color(d.body).multiplyScalar(0.8);
  // the tailcoat is painted on the egg: skin above the collar, a white shirt in a V at the front
  const tmp = new THREE.Color();
  const painter = (pp: THREE.Vector3, n: THREE.Vector3) => {
    const y = pp.y - cy;
    const collar = 0.02 + 0.13 * Math.min(1, Math.max(0, (0.4 - n.z) / 1.2));
    if (y > collar) return tmp.copy(skin).lerp(skinShade, Math.max(0, -n.y) * 0.3);
    const v = Math.max(0, (y + 0.27) * 0.4);
    const ax = Math.abs(pp.x);
    if (n.z > 0.2 && ax < v) return shirt;
    if (n.z > 0.15 && ax < v + 0.035) return lapel;
    return coat;
  };
  const B = bird(b, d, { tail: false, wings: false, feet: false, curl: true, curlCol: '#3a2a22', paint: painter });
  for (let i = 0; i < 2; i++) {
    const y = cy - 0.11 - i * 0.075;
    b.add('body', 'g', paint(at(sph(0.014, 8, 6), 0, y, B.egg.zAt(0, y) + 0.006), '#2a2438'));
  }
  // red bow tie at the collar
  const by = cy + 0.0, bz = B.egg.zAt(0, by) + 0.008;
  for (const sd of [-1, 1]) {
    const w = cone(0.046, 0.078, 3);
    w.rotateY(Math.PI / 6);
    w.rotateZ(sd * Math.PI / 2);
    w.scale(1, 1, 0.45);
    w.translate(sd * 0.043, by, bz);
    b.add('body', 'g', paint(w, '#d6303f'));
  }
  b.add('body', 'g', paint(at(sph(0.022, 10, 8), 0, by, bz + 0.008), '#a8202e'));
  // coat tails
  for (const sd of [-1, 1]) {
    const t = ell(0.075, 0.18, 0.024, 10, 8);
    t.translate(0, -0.16, 0);
    t.rotateX(0.3);
    t.rotateZ(sd * 0.12);
    t.translate(sd * 0.075, cy - R * 0.32, -R * 0.86);
    b.add('body', 'm', paint(t, coat));
  }
  // polished shoes and trouser legs
  for (const sd of [-1, 1]) {
    b.add('body', 'g', paint(at(ell(0.075, 0.045, 0.11, 12, 8), sd * 0.11, 0.04, 0.05), '#151221'));
    b.add('body', 'm', paint(at(cyl(0.04, 0.045, 0.1, 8), sd * 0.11, 0.09, 0.0), coat));
  }
  const root = grp('rig');
  assembleBird(b, B, root);
  maestroTpl = { root, bird: B };
  return maestroTpl;
}

export class MaestroView {
  readonly group = new THREE.Group();
  readonly body: THREE.Object3D;
  private armR = new THREE.Group();
  private armL = new THREE.Group();
  private baton: THREE.Mesh;
  private tip: THREE.Mesh;
  private tipMat: THREE.MeshBasicMaterial;
  private lids: THREE.Object3D;
  private happy: THREE.Object3D;
  private eyes: THREE.Object3D;
  private blink = 0;
  private nextBlink = 2;
  pose: MaestroPose = 'conduct';
  /** 0..1 strength of the glowing baton tip */
  glow = 1;
  /** materials (rim light, grey, stone…) */
  readonly mats = new CharMats('#fff1d6', 0.16);
  private lidP = 0;

  constructor() {
    const tpl = maestroTemplate();
    const rig = tpl.root.clone(true);
    this.mats.apply(rig);
    this.body = rig;
    this.lids = rig.getObjectByName('lids')!;
    this.happy = rig.getObjectByName('happy')!;
    this.eyes = rig.getObjectByName('eyes')!;
    const coat = stdMat('#1f1b2e', 0.5);
    const glove = stdMat('#ffffff', 0.5);
    const mkArm = (side: number) => {
      const g = new THREE.Group();
      const sleeve = new THREE.Mesh(capsule(0.048, 0.15, 4, 8), coat);
      sleeve.position.y = -0.1;
      const cuff = new THREE.Mesh(torus(0.045, 0.014, 6, 14).rotateX(Math.PI / 2), glove);
      cuff.position.y = -0.19;
      const hand = new THREE.Mesh(sph(0.058, 12, 10), glove);
      hand.position.y = -0.23;
      hand.scale.set(1, 0.92, 0.85);
      g.add(sleeve, cuff, hand);
      g.position.set(side * 0.285, 0.5, 0.02);
      g.rotation.z = side * 0.35;
      return g;
    };
    this.armR = mkArm(1);
    this.armL = mkArm(-1);
    this.baton = new THREE.Mesh(cyl(0.008, 0.014, 0.34, 6), stdMat('#f4efe6', 0.4));
    this.baton.position.set(0, -0.37, 0.05);
    this.baton.rotation.x = -0.4;
    this.tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2b8').multiplyScalar(3), toneMapped: false });
    this.tip = new THREE.Mesh(sph(0.025, 8, 6), this.tipMat);
    this.tip.position.y = -0.17;
    this.baton.add(this.tip);
    this.armR.add(this.baton);
    rig.add(this.armR, this.armL);
    this.group.add(rig);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.mk !== 'e') m.castShadow = true;
    });
  }

  /** The 4/4 conducting figure: down, in, out, up. `beatPos` in beats (fractional). */
  update(dt: number, t: number, beatPos: number) {
    const b = ((beatPos % 4) + 4) % 4;
    const bi = Math.floor(b), f = b - bi;
    const e = 1 - Math.pow(1 - f, 2.2);
    // baton path points for each beat (x, y of the hand)
    const P = [[0.0, 0.32], [-0.18, -0.05], [0.25, 0.0], [0.08, 0.3]];
    const from = P[(bi + 3) % 4], to = P[bi];
    let hx = from[0] + (to[0] - from[0]) * e;
    let hy = from[1] + (to[1] - from[1]) * e - Math.sin(f * Math.PI) * 0.06;
    let bounce = Math.exp(-f * 6) * 0.035;
    let armL = -0.35, lean = 0;
    let happy = false, lid = 0;
    switch (this.pose) {
      case 'idle':
        hx = 0.05;
        hy = -0.1 + Math.sin(t * 2) * 0.02;
        bounce = 0;
        break;
      case 'cheer':
        hx = 0.1;
        hy = 0.55 + Math.sin(t * 9) * 0.05;
        armL = -2.6 + Math.sin(t * 9) * 0.2;
        bounce = Math.abs(Math.sin(t * 6)) * 0.12;
        happy = true;
        break;
      case 'sad':
        hx = 0.02;
        hy = -0.25;
        armL = -0.15;
        lean = 0.25;
        bounce = 0;
        lid = 0.5;
        break;
      case 'point':
        hx = 0.45;
        hy = 0.25;
        bounce = 0;
        break;
      case 'bow':
        hx = 0.05;
        hy = -0.2;
        lean = 0.6 * (0.5 + 0.5 * Math.sin(t * 1.2));
        bounce = 0;
        lid = 0.9;
        break;
      case 'raise':
        hx = 0.05;
        hy = 0.65;
        armL = -0.5;
        bounce = 0;
        break;
    }
    this.armR.rotation.z = 0.35 + hy * 2.2;
    this.armR.rotation.x = -hx * 2.4;
    this.armR.rotation.y = hx * 1.2;
    this.armL.rotation.z = armL - (this.pose === 'conduct' ? Math.sin(beatPos * Math.PI) * 0.15 : 0);
    this.body.position.y = bounce;
    this.body.rotation.x = damp(this.body.rotation.x, lean, 6, dt);
    this.body.scale.y = 1 - bounce * 0.6;
    this.tipMat.color.setScalar(0.6 + this.glow * 2.6 * (1 + Math.exp(-f * 5) * 0.5));
    this.tip.scale.setScalar(0.7 + this.glow * 0.8);
    // blink
    this.nextBlink -= dt;
    if (this.nextBlink < 0) {
      this.blink = 0.14;
      this.nextBlink = 2 + Math.random() * 3;
    }
    if (this.blink > 0) this.blink -= dt;
    this.lidP = damp(this.lidP, lid, 8, dt);
    const l = this.blink > 0 ? 1 : this.lidP;
    this.lids.rotation.x = -1.75 + l * 3.2;
    this.eyes.visible = this.lids.visible = !happy;
    this.happy.visible = happy;
  }

  /** world position of the baton tip */
  tipWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.tip.getWorldPosition(out);
  }
}
