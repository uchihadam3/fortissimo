/**
 * Tower models (one instrument each, three looks per level) and their animation: build pop,
 * aiming, dancing on the beat, firing kicks, muted state.
 */
import * as THREE from 'three';
import type { TowerKind } from '../sim/defs';
import { TOWERS } from '../sim/defs';
import {
  at, box, capsule, clamp01, cone, cyl, damp, easeOutBack, eye, glowMat, mergeParts, mesh, painted, rotX, rotZ, sph, stdMat, torus, vcMat,
} from './kit';
import { noteMesh } from './models';

interface Built {
  base: THREE.Object3D;
  head: THREE.Group;
  muzzle: THREE.Object3D;
  /** kind-specific animated parts */
  parts: Record<string, THREE.Object3D>;
  /** materials that flash when firing */
  flash: THREE.MeshBasicMaterial[];
}

const GOLD = '#e9b949';
const WOOD = '#9a6a42';
const WOOD_D = '#7a5034';
const STONE = '#d9cfc0';

function plinth(color: string, level: number, h = 0.22): THREE.BufferGeometry {
  const parts = [
    painted(at(cyl(0.3, 0.34, h, 12), 0, h / 2, 0), color),
    painted(at(cyl(0.32, 0.32, 0.04, 12), 0, h, 0), level >= 1 ? GOLD : new THREE.Color(color).offsetHSL(0, 0, -0.1)),
  ];
  if (level >= 2) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(painted(at(sph(0.035, 8, 6), Math.cos(a) * 0.31, h * 0.5, Math.sin(a) * 0.31), GOLD));
    }
  }
  return mergeParts(parts);
}

function pennant(color: string, y: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(painted(at(cyl(0.012, 0.012, 0.42, 5), 0, 0.21, 0), WOOD_D), vcMat()));
  const flag = new THREE.Mesh(at(box(0.2, 0.12, 0.01), 0.1, 0.36, 0), stdMat(color, 0.6));
  flag.castShadow = true;
  g.add(flag);
  g.position.y = y;
  g.userData.flag = flag;
  return g;
}

function build(kind: TowerKind, level: number): Built {
  const head = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const flash: THREE.MeshBasicMaterial[] = [];
  const muzzle = new THREE.Object3D();
  let base: THREE.Object3D;
  const L = level;
  switch (kind) {
    case 'harp': {
      base = mesh(plinth(WOOD, L, 0.26), vcMat());
      head.position.y = 0.26;
      // lyre frame
      const frame = mergeParts([
        painted(at(rotZ(torus(0.2, 0.035, 8, 20, Math.PI * 0.9), Math.PI * 0.55), -0.02, 0.36, 0), L >= 1 ? GOLD : WOOD),
        painted(at(rotZ(torus(0.2, 0.035, 8, 20, Math.PI * 0.9), Math.PI * 0.55), 0.02, 0.36, 0).rotateY(Math.PI), L >= 1 ? GOLD : WOOD),
        painted(at(box(0.34, 0.05, 0.08), 0, 0.12, 0), WOOD_D),
        painted(at(box(0.3, 0.045, 0.06), 0, 0.56, 0), L >= 2 ? GOLD : WOOD_D),
        painted(at(cyl(0.06, 0.08, 0.1, 8), 0, 0.05, 0), WOOD_D),
      ]);
      const fr = mesh(frame, L >= 1 ? vcMat('metal') : vcMat());
      fr.rotation.y = Math.PI / 2;
      head.add(fr);
      const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1c2').multiplyScalar(0.9), toneMapped: false });
      flash.push(sm);
      const n = 4 + L;
      const strings = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const s = new THREE.Mesh(cyl(0.006, 0.006, 0.42, 4), sm);
        s.position.set(0, 0.34, -0.11 + (0.22 * i) / (n - 1));
        strings.add(s);
      }
      head.add(strings);
      parts.strings = strings;
      if (L >= 2) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), glowMat('#ffd36b', 2));
        gem.position.y = 0.66;
        head.add(gem);
        parts.gem = gem;
      }
      muzzle.position.set(0, 0.36, 0.12);
      break;
    }
    case 'drum': {
      base = mesh(plinth('#b5553f', L, 0.16), vcMat());
      head.position.y = 0.16;
      const r = 0.25 + L * 0.03;
      const drum = new THREE.Group();
      const shell = mergeParts([
        painted(at(cyl(r, r * 0.92, 0.34, 20), 0, 0.17, 0), L >= 2 ? '#c8352f' : '#d4493a'),
        painted(at(torus(r + 0.01, 0.022, 6, 24), 0, 0.33, 0).rotateX(0), GOLD),
        painted(at(cyl(r * 0.94, r * 0.94, 0.01, 20), 0, 0.345, 0), '#f6ecd6'),
        painted(at(torus(r * 0.93, 0.02, 6, 24).rotateX(Math.PI / 2), 0, 0.02, 0), GOLD),
      ]);
      // rope zigzag
      const rope: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const g = box(0.015, 0.32, 0.015);
        g.rotateZ(i % 2 ? 0.35 : -0.35);
        g.rotateY(-a);
        rope.push(painted(at(g, Math.cos(a) * (r + 0.005), 0.17, Math.sin(a) * (r + 0.005)), '#f2e2b8'));
      }
      drum.add(mesh(mergeParts([shell, ...rope]), vcMat()));
      // the skin flashes on hit
      const skinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8a'), transparent: true, opacity: 0, toneMapped: false });
      flash.push(skinMat);
      const skin = new THREE.Mesh(rotX(new THREE.CircleGeometry(r * 0.93, 24), -Math.PI / 2), skinMat);
      skin.position.y = 0.352;
      drum.add(skin);
      head.add(drum);
      parts.drum = drum;
      // mallet arm
      const mallet = new THREE.Group();
      const stick = new THREE.Mesh(cyl(0.015, 0.015, 0.36, 6), stdMat(WOOD_D, 0.6));
      stick.rotation.z = Math.PI / 2;
      stick.position.x = 0.18;
      const ball = new THREE.Mesh(sph(0.06, 10, 8), stdMat('#f6ecd6', 0.6));
      ball.position.x = 0.36;
      mallet.add(stick, ball);
      mallet.position.set(-r - 0.02, 0.44, 0);
      mallet.rotation.z = 0.5;
      head.add(mallet);
      parts.mallet = mallet;
      if (L >= 2) {
        const p = pennant('#ffcf5a', 0.3);
        p.position.set(0, 0.34, -r);
        head.add(p);
      }
      muzzle.position.set(0, 0.42, 0);
      break;
    }
    case 'bell': {
      base = mesh(plinth(STONE, L, 0.12), vcMat());
      head.position.y = 0.12;
      const arch = mergeParts([
        painted(at(box(0.09, 0.62, 0.12), -0.24, 0.31, 0), STONE),
        painted(at(box(0.09, 0.62, 0.12), 0.24, 0.31, 0), STONE),
        painted(at(box(0.62, 0.08, 0.16), 0, 0.64, 0), new THREE.Color(STONE).offsetHSL(0, 0, -0.06)),
        painted(at(cone(0.08, 0.16, 4), 0, 0.76, 0), L >= 1 ? '#8fd8ff' : STONE),
      ]);
      head.add(mesh(arch, vcMat('flat')));
      if (L >= 1) {
        const ice = mergeParts([
          painted(at(rotZ(cone(0.05, 0.2, 5), 0.2), -0.3, 0.12, 0.06), '#bfefff'),
          painted(at(rotZ(cone(0.04, 0.16, 5), -0.3), 0.3, 0.1, -0.05), '#bfefff'),
        ]);
        head.add(mesh(ice, vcMat('flat')));
      }
      const bellG = new THREE.Group();
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const r = 0.05 + 0.13 * Math.pow(t, 1.6) + (t > 0.85 ? (t - 0.85) * 0.25 : 0);
        prof.push(new THREE.Vector2(r * (1 + L * 0.08), 0.2 - t * 0.26));
      }
      const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), stdMat('#c98a3a', 0.35, 0.8));
      bell.castShadow = true;
      const clapper = new THREE.Mesh(sph(0.035, 8, 6), stdMat('#5a3a1a', 0.5, 0.4));
      clapper.position.y = -0.08;
      bellG.add(bell, clapper);
      bellG.position.y = 0.5;
      head.add(bellG);
      parts.bell = bellG;
      const rim = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bff0ff'), transparent: true, opacity: 0, toneMapped: false });
      flash.push(rim);
      const glowRing = new THREE.Mesh(torus(0.2 + L * 0.015, 0.02, 6, 24).rotateX(Math.PI / 2), rim);
      glowRing.position.y = -0.06;
      bellG.add(glowRing);
      muzzle.position.set(0, 0.4, 0);
      break;
    }
    case 'shaker': {
      base = mesh(plinth('#8a6a4a', L, 0.1), vcMat());
      head.position.y = 0.1;
      const tree = new THREE.Group();
      tree.add(mesh(mergeParts([
        painted(at(cyl(0.04, 0.07, 0.42, 7), 0, 0.21, 0), WOOD),
        painted(at(rotZ(cyl(0.02, 0.03, 0.2, 5), 0.8), 0.08, 0.36, 0), WOOD),
        painted(at(rotZ(cyl(0.02, 0.03, 0.2, 5), -0.8), -0.08, 0.38, 0), WOOD),
      ]), vcMat()));
      const crown = mesh(mergeParts([
        painted(at(sph(0.22, 10, 8), 0, 0.55, 0), L >= 2 ? '#c9b84a' : '#6dbb4a'),
        painted(at(sph(0.16, 10, 8), 0.15, 0.48, 0.05), L >= 2 ? '#d8c85a' : '#7cc75a'),
        painted(at(sph(0.15, 10, 8), -0.15, 0.5, -0.04), L >= 2 ? '#b8a83a' : '#5fae44'),
      ]), vcMat('flat'));
      tree.add(crown);
      const fruits = new THREE.Group();
      const nf = 3 + L * 2;
      for (let i = 0; i < nf; i++) {
        const a = (i / nf) * Math.PI * 2;
        const m = new THREE.Group();
        const ball = new THREE.Mesh(sph(0.045, 10, 8), stdMat('#ffcf3a', 0.3, 0.6));
        ball.scale.y = 1.25;
        const handle = new THREE.Mesh(cyl(0.008, 0.008, 0.06, 4), stdMat(WOOD_D, 0.6));
        handle.position.y = 0.06;
        m.add(ball, handle);
        m.position.set(Math.cos(a) * 0.2, 0.42 + (i % 2) * 0.06, Math.sin(a) * 0.2);
        fruits.add(m);
      }
      tree.add(fruits);
      head.add(tree);
      parts.tree = tree;
      parts.fruits = fruits;
      muzzle.position.set(0, 0.7, 0);
      break;
    }
    case 'crystal': {
      base = mesh(plinth('#5a5470', L, 0.14), vcMat());
      head.position.y = 0.14;
      head.add(mesh(mergeParts([
        painted(at(cyl(0.07, 0.12, 0.5, 8), 0, 0.25, 0), '#4a4560'),
        painted(at(cyl(0.1, 0.1, 0.03, 12), 0, 0.5, 0), GOLD),
      ]), vcMat('metal')));
      const rings = new THREE.Group();
      for (let i = 0; i <= L; i++) {
        const r = new THREE.Mesh(torus(0.13 - i * 0.015, 0.016, 6, 24).rotateX(Math.PI / 2), stdMat('#b9b2d6', 0.3, 0.8));
        r.position.y = 0.16 + i * 0.13;
        rings.add(r);
      }
      head.add(rings);
      parts.rings = rings;
      const cm = new THREE.MeshStandardMaterial({ color: '#c58bff', emissive: new THREE.Color('#a45bff'), emissiveIntensity: 1.2, roughness: 0.15, flatShading: true });
      const cg = new THREE.OctahedronGeometry(0.11 + L * 0.015, 0);
      cg.scale(1, 1.6, 1);
      const crystal = new THREE.Mesh(cg, cm);
      crystal.position.y = 0.74;
      crystal.castShadow = true;
      head.add(crystal);
      parts.crystal = crystal;
      parts.crystalMat = crystal as THREE.Object3D;
      if (L >= 2) {
        const orbit = new THREE.Group();
        for (let i = 0; i < 2; i++) {
          const g = new THREE.OctahedronGeometry(0.05, 0);
          g.scale(1, 1.5, 1);
          const m = new THREE.Mesh(g, glowMat('#d9b8ff', 1.8));
          m.position.set(Math.cos(i * Math.PI) * 0.22, 0, Math.sin(i * Math.PI) * 0.22);
          orbit.add(m);
        }
        orbit.position.y = 0.74;
        head.add(orbit);
        parts.orbit = orbit;
      }
      muzzle.position.set(0, 0.74, 0);
      break;
    }
    case 'horn': {
      base = mesh(plinth('#6a4a3a', L, 0.18), vcMat());
      head.position.y = 0.18;
      head.add(mesh(mergeParts([
        painted(at(cyl(0.13, 0.16, 0.12, 10), 0, 0.06, 0), '#4a3a30'),
        painted(at(box(0.06, 0.28, 0.06), -0.1, 0.22, 0), '#4a3a30'),
        painted(at(box(0.06, 0.28, 0.06), 0.1, 0.22, 0), '#4a3a30'),
      ]), vcMat()));
      const horn = new THREE.Group();
      const brass = stdMat('#e2a93a', 0.28, 0.85);
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        prof.push(new THREE.Vector2(0.035 + 0.2 * Math.pow(t, 3.2) * (1 + L * 0.12), t * 0.55));
      }
      const bellM = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), brass);
      bellM.material = brass;
      (bellM.material as THREE.Material).side = THREE.DoubleSide;
      bellM.rotation.x = Math.PI / 2;
      bellM.position.z = -0.12;
      bellM.castShadow = true;
      const coil = new THREE.Mesh(torus(0.1, 0.025, 8, 24), brass);
      coil.position.set(0, 0, -0.2);
      coil.rotation.y = Math.PI / 2;
      horn.add(bellM, coil);
      const inner = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2a0'), transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide });
      flash.push(inner);
      const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.2 + L * 0.02, 20), inner);
      glowDisc.position.z = 0.43;
      horn.add(glowDisc);
      horn.position.y = 0.4;
      if (L >= 2) {
        const h2 = horn.clone();
        h2.scale.setScalar(0.7);
        h2.position.set(0, 0.62, -0.05);
        head.add(h2);
        parts.horn2 = h2;
      }
      head.add(horn);
      parts.horn = horn;
      muzzle.position.set(0, 0.4, 0.42);
      break;
    }
    case 'choir': {
      base = mesh(plinth('#e8dfcf', L, 0.1), vcMat());
      head.position.y = 0.1;
      head.add(mesh(painted(at(cyl(0.3, 0.32, 0.06, 16), 0, 0.03, 0), '#f3ecdf'), vcMat()));
      const singers = new THREE.Group();
      const n = 3 + L;
      for (let i = 0; i < n; i++) {
        const s = new THREE.Group();
        const robe = new THREE.Mesh(cone(0.09, 0.26, 12), stdMat(i % 2 ? '#f6f0e4' : '#ece2cf', 0.6));
        robe.position.y = 0.13;
        const hd = new THREE.Mesh(sph(0.07, 12, 10), stdMat('#ffe1c4', 0.6));
        hd.position.y = 0.31;
        const mouth = new THREE.Mesh(sph(0.018, 8, 6), stdMat('#5a2a2a', 0.6));
        mouth.position.set(0, 0.29, 0.065);
        mouth.scale.set(1, 1.3, 0.5);
        const e1 = new THREE.Mesh(sph(0.01, 6, 4), stdMat('#2a2030', 0.4));
        e1.position.set(-0.025, 0.33, 0.062);
        const e2 = e1.clone();
        e2.position.x = 0.025;
        s.add(robe, hd, mouth, e1, e2);
        const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, n - 1));
        s.position.set(Math.cos(a) * 0.17, 0.06, -Math.sin(a) * 0.17 + 0.06);
        s.userData.mouth = mouth;
        singers.add(s);
      }
      head.add(singers);
      parts.singers = singers;
      const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(L >= 2 ? '#ffd36b' : '#fff1c2'), transparent: true, opacity: 0.5, toneMapped: false });
      flash.push(haloMat);
      const halo = new THREE.Mesh(torus(0.22, 0.012, 6, 32).rotateX(Math.PI / 2), haloMat);
      halo.position.y = 0.58;
      head.add(halo);
      parts.halo = halo;
      muzzle.position.set(0, 0.5, 0);
      break;
    }
    case 'bass': {
      base = mesh(plinth('#3a3346', L, 0.14), vcMat());
      head.position.y = 0.14;
      const cab = new THREE.Group();
      const n = 1 + Math.min(2, L);
      const cones: THREE.Object3D[] = [];
      for (let i = 0; i < n; i++) {
        const sz = 0.44 - i * 0.06;
        const c = new THREE.Group();
        c.add(mesh(mergeParts([
          painted(at(box(sz, sz, 0.3), 0, 0, 0), '#2a2533'),
          painted(at(box(sz + 0.02, 0.025, 0.31), 0, sz / 2, 0), L >= 1 ? GOLD : '#4a4258'),
          painted(at(box(sz + 0.02, 0.025, 0.31), 0, -sz / 2, 0), L >= 1 ? GOLD : '#4a4258'),
        ]), vcMat('gloss')));
        const sc = new THREE.Group();
        const surround = new THREE.Mesh(torus(sz * 0.34, 0.025, 8, 24), stdMat('#151219', 0.6));
        const cn = new THREE.Mesh(cone(sz * 0.32, 0.08, 24, ), stdMat('#3d3550', 0.5));
        cn.rotation.x = -Math.PI / 2;
        cn.position.z = -0.02;
        const dust = new THREE.Mesh(sph(sz * 0.09, 12, 8), stdMat('#7a6aa0', 0.3, 0.6));
        dust.position.z = 0.03;
        sc.add(surround, cn, dust);
        sc.position.z = 0.155;
        c.add(sc);
        c.position.y = 0.26 + i * (0.44 - i * 0.03);
        cab.add(c);
        cones.push(sc);
      }
      const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#b48cff'), transparent: true, opacity: 0, toneMapped: false });
      flash.push(ringMat);
      const ring = new THREE.Mesh(torus(0.15, 0.02, 6, 24), ringMat);
      ring.position.set(0, 0.26, 0.18);
      cab.add(ring);
      head.add(cab);
      parts.cab = cab;
      parts.cones = new THREE.Group();
      (parts.cones as THREE.Group).userData.list = cones;
      muzzle.position.set(0, 0.26, 0.3);
      break;
    }
  }
  if (level >= 2 && kind !== 'drum') {
    // a crown of light at max level
    const crown = new THREE.Mesh(torus(0.36, 0.012, 6, 36).rotateX(Math.PI / 2), glowMat(TOWERS[kind].color, 1.6, 0.7));
    crown.position.y = 0.05;
    (base as THREE.Object3D).add(crown);
  }
  head.add(muzzle);
  base.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return { base, head, muzzle, parts, flash };
}

export class TowerView {
  readonly group = new THREE.Group();
  private inner = new THREE.Group();
  private built!: Built;
  level: number;
  private aim = 0;
  private aimTarget = 0;
  private kick = 0;
  private pulseT = 0;
  private buildT = 0;
  private upT = 1;
  muted = false;
  private muteIcon: THREE.Group;
  boosted = false;
  private boostRing: THREE.Mesh;
  private flashT = 0;
  private range: THREE.Mesh | null = null;
  /** overall size multiplier (towers on the colossus are big) */
  scaleMul = 1;

  constructor(readonly kind: TowerKind, level: number, readonly id: number) {
    this.level = level;
    this.group.add(this.inner);
    this.rebuild();
    this.aim = this.aimTarget = Math.PI / 2;
    // a little "silenced" sign: crossed note
    this.muteIcon = new THREE.Group();
    const n = noteMesh(0.16, '#cfd3e6', 1.2);
    const bar = new THREE.Mesh(box(0.32, 0.035, 0.02), glowMat('#ff5a6a', 1.6));
    bar.rotation.z = -0.8;
    bar.position.set(0.04, 0.08, 0.02);
    this.muteIcon.add(n, bar);
    this.muteIcon.position.y = 1.15;
    this.muteIcon.visible = false;
    this.group.add(this.muteIcon);
    this.boostRing = new THREE.Mesh(torus(0.42, 0.03, 6, 40).rotateX(Math.PI / 2), glowMat('#ffd36b', 2.2, 0.8));
    this.boostRing.position.y = 0.1;
    this.boostRing.visible = false;
    this.group.add(this.boostRing);
  }

  private rebuild() {
    this.inner.clear();
    this.built = build(this.kind, this.level);
    this.inner.add(this.built.base, this.built.head);
    const s = 1 + this.level * 0.07;
    this.inner.scale.setScalar(s);
  }

  setLevel(l: number) {
    if (l === this.level) return;
    this.level = l;
    this.rebuild();
    this.upT = 0;
  }

  /** aim angle in tile space (atan2(dz, dx)) */
  aimAt(a: number) {
    this.aimTarget = Math.PI / 2 - a;
  }

  fire() {
    this.kick = 1;
    this.flashT = 1;
    const p = this.built.parts;
    if (p.mallet) p.mallet.rotation.z = -0.5;
  }

  pulse() {
    this.pulseT = 1;
    this.flashT = 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.muteIcon.visible = m;
  }

  showRange(show: boolean, scene?: THREE.Object3D) {
    void scene;
    const r = TOWERS[this.kind].levels[this.level].range;
    if (show && r > 0) {
      if (!this.range) {
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(TOWERS[this.kind].color), transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
        this.range = new THREE.Mesh(rotX(new THREE.RingGeometry(r - 0.06, r, 64), -Math.PI / 2), mat);
        const fill = new THREE.Mesh(rotX(new THREE.CircleGeometry(r, 64), -Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(TOWERS[this.kind].color), transparent: true, opacity: 0.07, depthWrite: false }));
        this.range.add(fill);
        this.range.position.y = 0.06;
        this.range.renderOrder = 3;
        this.group.add(this.range);
      }
      this.range.visible = true;
    } else if (this.range) {
      this.group.remove(this.range);
      this.range = null;
    }
  }

  muzzleWorld(out = new THREE.Vector3()) {
    return this.built.muzzle.getWorldPosition(out);
  }

  update(dt: number, t: number, beatPos: number) {
    const bp = beatPos - Math.floor(beatPos);
    // build pop
    this.buildT = Math.min(1, this.buildT + dt * 2.2);
    this.upT = Math.min(1, this.upT + dt * 2.5);
    const pop = easeOutBack(clamp01(this.buildT)) * (0.85 + 0.15 * easeOutBack(clamp01(this.upT)));
    const dance = this.muted ? 0 : Math.exp(-bp * 6) * 0.05;
    const S = pop * this.scaleMul;
    this.group.scale.set(S * (1 + dance * 0.5), S * (1 - dance), S * (1 + dance * 0.5));
    // aim
    if (this.kind !== 'bell' && this.kind !== 'choir' && this.kind !== 'shaker') {
      let d = this.aimTarget - this.aim;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.aim += d * Math.min(1, dt * 10);
      this.built.head.rotation.y = this.aim;
    }
    this.kick = Math.max(0, this.kick - dt * 6);
    this.pulseT = Math.max(0, this.pulseT - dt * 2.2);
    this.flashT = Math.max(0, this.flashT - dt * 5);
    for (const m of this.built.flash) {
      if (m.transparent) m.opacity = this.flashT * 0.9;
      else m.color.setScalar(0.9 + this.flashT * 2.5);
    }
    const p = this.built.parts;
    switch (this.kind) {
      case 'harp':
        this.built.head.position.z = -this.kick * 0.04;
        if (p.strings) p.strings.children.forEach((s, i) => (s.position.x = Math.sin(t * 60 + i) * 0.008 * this.kick));
        if (p.gem) p.gem.rotation.y = t * 2;
        break;
      case 'drum':
        if (p.mallet) p.mallet.rotation.z = damp(p.mallet.rotation.z, 0.5 + Math.sin(t * 2) * 0.05, 8, dt);
        if (p.drum) p.drum.scale.set(1 + this.kick * 0.08, 1 - this.kick * 0.12, 1 + this.kick * 0.08);
        break;
      case 'bell':
        if (p.bell) p.bell.rotation.z = Math.sin(t * 9) * 0.5 * this.pulseT;
        break;
      case 'shaker':
        if (p.tree) p.tree.rotation.z = Math.sin(t * 30) * 0.05 * this.pulseT;
        if (p.fruits) p.fruits.children.forEach((f, i) => (f.rotation.z = Math.sin(t * 40 + i) * 0.4 * this.pulseT));
        break;
      case 'crystal':
        if (p.crystal) {
          p.crystal.rotation.y += dt * (1 + this.kick * 12);
          p.crystal.position.y = 0.74 + Math.sin(t * 2) * 0.04;
          const cm = (p.crystal as THREE.Mesh).material as THREE.MeshStandardMaterial;
          cm.emissiveIntensity = 1 + this.kick * 3;
        }
        if (p.rings) p.rings.children.forEach((r, i) => (r.rotation.z = Math.sin(t * 3 + i) * 0.1));
        if (p.orbit) p.orbit.rotation.y = t * 2.5;
        break;
      case 'horn':
        if (p.horn) {
          p.horn.scale.setScalar(1 + this.kick * 0.18);
          p.horn.position.z = -this.kick * 0.08;
        }
        break;
      case 'choir':
        if (p.singers)
          p.singers.children.forEach((s, i) => {
            s.position.y = 0.06 + Math.abs(Math.sin(t * 3 + i)) * 0.02 * (0.3 + this.pulseT);
            const m = s.userData.mouth as THREE.Mesh;
            m.scale.y = 1 + this.pulseT * 1.6;
          });
        if (p.halo) {
          p.halo.rotation.y = t;
          p.halo.scale.setScalar(1 + this.pulseT * 0.25);
        }
        break;
      case 'bass': {
        const list = (p.cones?.userData.list ?? []) as THREE.Object3D[];
        list.forEach((c) => (c.position.z = 0.155 + this.kick * 0.06));
        if (p.cab) p.cab.position.z = -this.kick * 0.05;
        break;
      }
    }
    // muted towers droop and stop dancing
    this.inner.rotation.z = damp(this.inner.rotation.z, this.muted ? 0.12 : 0, 6, dt);
    this.muteIcon.position.y = 1.15 + Math.sin(t * 3) * 0.05;
    this.muteIcon.rotation.y = t;
    this.boostRing.visible = this.boosted;
    if (this.boosted) this.boostRing.scale.setScalar(1 + Math.exp(-bp * 5) * 0.15);
  }
}

void capsule;
void eye;
