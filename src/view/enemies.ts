/**
 * Creatures of the Silence. Every one of them has its mouth taped shut with an X — they are mute.
 * They hop on the beat, squash when they land, flash when hit, turn icy when slowed.
 */
import * as THREE from 'three';
import type { EnemyKind } from '../sim/defs';
import { ENEMIES } from '../sim/defs';
import { box, capsule, clamp01, cone, cyl, damp, eye, glowMat, sph, stdMat, torus } from './kit';

interface Rig {
  root: THREE.Group;
  body: THREE.Object3D;
  /** materials that flash white when hit / tint when slowed */
  skins: THREE.MeshStandardMaterial[];
  wings?: THREE.Object3D[];
  extra: Record<string, THREE.Object3D>;
  height: number;
}

const INK = '#463d63';

function skin(color: string, rough = 0.55, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal, emissive: new THREE.Color(0, 0, 0) });
}

function tape(size: number): THREE.Group {
  const g = new THREE.Group();
  const m = stdMat('#d9d2c3', 0.8);
  const a = new THREE.Mesh(box(size, size * 0.26, size * 0.06), m);
  a.rotation.z = 0.6;
  const b = new THREE.Mesh(box(size, size * 0.26, size * 0.06), m);
  b.rotation.z = -0.6;
  g.add(a, b);
  return g;
}

function face(body: THREE.Object3D, r: number, y: number, z: number, eyeR = r * 0.26, spread = r * 0.38) {
  const eL = eye(eyeR);
  eL.position.set(-spread, y + r * 0.1, z);
  const eR = eye(eyeR);
  eR.position.set(spread, y + r * 0.1, z);
  const t = tape(r * 0.42);
  t.position.set(0, y - r * 0.32, z + r * 0.02);
  t.rotation.x = -0.25;
  body.add(eL, eR, t);
}

function feet(root: THREE.Object3D, r: number, color: string) {
  const m = stdMat(color, 0.6);
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(sph(r * 0.28, 10, 8), m);
    f.scale.set(1, 0.6, 1.3);
    f.position.set(s * r * 0.42, r * 0.12, r * 0.15);
    root.add(f);
  }
}

function buildRig(kind: EnemyKind): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skins: THREE.MeshStandardMaterial[] = [];
  const extra: Record<string, THREE.Object3D> = {};
  let wings: THREE.Object3D[] | undefined;
  let height = 0.7;
  const blob = (r: number, color: string, y = r * 0.95) => {
    const m = skin(color);
    skins.push(m);
    const b = new THREE.Mesh(sph(r, 24, 18), m);
    b.scale.set(1, 0.92, 1);
    b.position.y = y;
    body.add(b);
    // lighter belly
    const belly = new THREE.Mesh(sph(r * 0.7, 16, 12), stdMat(new THREE.Color(color).offsetHSL(0, -0.05, 0.12).getStyle(), 0.6));
    belly.position.set(0, y - r * 0.18, r * 0.42);
    belly.scale.set(1, 0.85, 0.5);
    body.add(belly);
    return b;
  };
  switch (kind) {
    case 'blot':
    case 'blotling': {
      const r = kind === 'blot' ? 0.3 : 0.2;
      const col = kind === 'blot' ? INK : '#6a5f8c';
      blob(r, col);
      face(body, r, r * 0.95, r * 0.86);
      // a little ink drip on top
      const drip = new THREE.Mesh(cone(r * 0.2, r * 0.45, 10), skins[0]);
      drip.position.y = r * 1.95;
      drip.rotation.z = 0.3;
      body.add(drip);
      feet(root, r, '#2c2542');
      height = r * 2.1;
      break;
    }
    case 'scurry': {
      const r = 0.24;
      const m = skin('#4f6185');
      skins.push(m);
      const b = new THREE.Mesh(sph(r, 20, 14), m);
      b.scale.set(0.9, 0.85, 1.15);
      b.position.y = r;
      body.add(b);
      const tail = new THREE.Mesh(cone(r * 0.5, r * 1.6, 10), m);
      tail.rotation.x = -Math.PI / 2 - 0.3;
      tail.position.set(0, r * 1.05, -r * 1.2);
      body.add(tail);
      extra.tail = tail;
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(cone(r * 0.22, r * 0.9, 8), m);
        ear.position.set(s * r * 0.45, r * 1.85, -r * 0.1);
        ear.rotation.set(-0.5, 0, -s * 0.3);
        body.add(ear);
      }
      face(body, r, r, r * 0.92, r * 0.3, r * 0.36);
      feet(root, r, '#2c3550');
      height = r * 2.2;
      break;
    }
    case 'shell': {
      const r = 0.4;
      const m = skin('#3e3a52');
      skins.push(m);
      const b = new THREE.Mesh(sph(r * 0.8, 20, 14), m);
      b.position.y = r * 0.65;
      body.add(b);
      const shellM = skin('#6b6880', 0.35, 0.55);
      skins.push(shellM);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), shellM);
      dome.position.set(0, r * 0.55, -r * 0.1);
      dome.scale.set(1, 0.95, 1.15);
      body.add(dome);
      // plates
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.Mesh(torus(r * (0.98 - i * 0.18), 0.02, 6, 24, Math.PI), stdMat('#8f8ca3', 0.3, 0.6));
        rib.rotation.set(0, Math.PI / 2, 0);
        rib.position.set(0, r * 0.55, -r * 0.1 + (i - 1) * r * 0.35);
        rib.scale.set(1, 0.95, 1);
        body.add(rib);
      }
      const head = new THREE.Group();
      const hm = new THREE.Mesh(sph(r * 0.42, 16, 12), m);
      head.add(hm);
      face(head, r * 0.42, 0, r * 0.36, r * 0.13, r * 0.17);
      head.position.set(0, r * 0.55, r * 0.75);
      body.add(head);
      for (const s of [-1, 1]) for (const z of [-0.25, 0.25]) {
        const leg = new THREE.Mesh(cyl(0.05, 0.06, 0.18, 6), stdMat('#2a2638', 0.6));
        leg.position.set(s * r * 0.6, 0.09, z);
        root.add(leg);
      }
      height = r * 1.6;
      break;
    }
    case 'moth': {
      const r = 0.2;
      const m = skin('#7c7396');
      skins.push(m);
      const b = new THREE.Mesh(capsule(r * 0.55, r * 1.1, 6, 12), m);
      b.rotation.x = Math.PI / 2;
      body.add(b);
      const fuzz = new THREE.Mesh(sph(r * 0.75, 14, 10), skin('#d9d2ea', 0.9));
      skins.push(fuzz.material as THREE.MeshStandardMaterial);
      fuzz.position.z = r * 0.55;
      body.add(fuzz);
      face(fuzz, r * 0.75, 0, r * 0.62, r * 0.22, r * 0.3);
      wings = [];
      const wm = new THREE.MeshStandardMaterial({ color: '#cfc6e6', roughness: 0.8, side: THREE.DoubleSide, emissive: new THREE.Color(0, 0, 0) });
      skins.push(wm);
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        const w = new THREE.Mesh(sph(r * 1.5, 16, 8), wm);
        w.scale.set(1, 0.06, 0.75);
        w.position.x = s * r * 1.4;
        const spot = new THREE.Mesh(sph(r * 0.3, 10, 6), stdMat('#5a4f7a', 0.7));
        spot.scale.set(1, 0.1, 1);
        spot.position.set(s * r * 1.5, 0.012, 0);
        pivot.add(w, spot);
        pivot.position.set(s * r * 0.3, r * 0.2, 0);
        body.add(pivot);
        wings.push(pivot);
      }
      for (const s of [-1, 1]) {
        const ant = new THREE.Mesh(cyl(0.008, 0.008, r * 1.2, 4), stdMat('#3a3350', 0.6));
        ant.position.set(s * r * 0.25, r * 0.7, r * 0.9);
        ant.rotation.set(0.7, 0, -s * 0.4);
        body.add(ant);
      }
      body.position.y = 0;
      height = r * 2;
      break;
    }
    case 'shield': {
      const r = 0.32;
      blob(r, '#3d4a6b');
      face(body, r, r * 0.95, r * 0.86);
      feet(root, r, '#253047');
      const sh = new THREE.Group();
      const disc = new THREE.Mesh(cyl(r * 0.85, r * 0.85, 0.05, 28), stdMat('#d6dde8', 0.15, 0.95));
      disc.rotation.x = Math.PI / 2;
      const boss = new THREE.Mesh(sph(r * 0.2, 12, 8), stdMat('#9aa6ba', 0.2, 0.9));
      boss.position.z = 0.03;
      sh.add(disc, boss);
      sh.position.set(r * 0.55, r * 0.9, r * 0.95);
      sh.rotation.y = -0.4;
      body.add(sh);
      extra.shieldDisc = sh;
      const bubble = new THREE.Mesh(sph(2.6 / 2.2, 28, 16), new THREE.MeshBasicMaterial({ color: '#bcd6ff', transparent: true, opacity: 0.08, depthWrite: false }));
      bubble.position.y = 0.2;
      bubble.scale.y = 0.55;
      root.add(bubble);
      extra.bubble = bubble;
      height = r * 2.1;
      break;
    }
    case 'bubble': {
      const r = 0.46;
      const m = new THREE.MeshStandardMaterial({ color: '#b9b0e6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, emissive: new THREE.Color(0, 0, 0) });
      skins.push(m);
      const b = new THREE.Mesh(sph(r, 28, 20), m);
      b.position.y = r;
      body.add(b);
      extra.ball = b;
      for (let i = 0; i < 4; i++) {
        const k = new THREE.Mesh(sph(0.1, 12, 8), stdMat('#463d63', 0.6));
        const a = (i / 4) * Math.PI * 2;
        k.position.set(Math.cos(a) * 0.17, r * 0.8 + (i % 2) * 0.12, Math.sin(a) * 0.17);
        body.add(k);
      }
      const hl = new THREE.Mesh(sph(r * 0.18, 10, 8), glowMat('#ffffff', 1.3, 0.8));
      hl.position.set(-r * 0.4, r * 1.45, r * 0.55);
      body.add(hl);
      height = r * 2;
      break;
    }
    case 'phantom': {
      const r = 0.3;
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const a = t * Math.PI * 0.5;
        prof.push(new THREE.Vector2(Math.sin(a) * r * (1 + (t > 0.9 ? 0.1 : 0)), r * 1.6 - (1 - Math.cos(a)) * r * 1.4 - t * r * 0.3));
      }
      prof.reverse();
      const m = new THREE.MeshStandardMaterial({ color: '#e9e4ff', roughness: 0.6, transparent: true, opacity: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color(0, 0, 0) });
      skins.push(m);
      const ghost = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), m);
      ghost.position.y = 0.15;
      body.add(ghost);
      const eL = new THREE.Mesh(sph(r * 0.16, 10, 8), stdMat('#2a2240', 0.4));
      eL.scale.set(1, 1.4, 0.5);
      eL.position.set(-r * 0.32, r * 1.25, r * 0.85);
      const eR = eL.clone();
      eR.position.x = r * 0.32;
      const t = tape(r * 0.4);
      t.position.set(0, r * 0.82, r * 0.92);
      body.add(eL, eR, t);
      extra.ghostMat = ghost;
      height = r * 2.1;
      break;
    }
    case 'muffler': {
      const r = 0.36;
      const m = skin('#7d7890', 0.95);
      skins.push(m);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = new THREE.Mesh(sph(r * 0.55, 14, 10), m);
        p.position.set(Math.cos(a) * r * 0.45, r * 0.95 + Math.sin(i * 2.1) * 0.08, Math.sin(a) * r * 0.45);
        body.add(p);
      }
      const core = new THREE.Mesh(sph(r * 0.8, 20, 14), m);
      core.position.y = r * 1.05;
      body.add(core);
      face(body, r * 0.8, r * 1.05, r * 0.7);
      // earmuffs
      const band = new THREE.Mesh(torus(r * 0.85, 0.03, 6, 20, Math.PI), stdMat('#c45a7a', 0.5));
      band.position.y = r * 1.1;
      body.add(band);
      for (const s of [-1, 1]) {
        const muff = new THREE.Mesh(sph(r * 0.3, 14, 10), stdMat('#f08aa8', 0.9));
        muff.position.set(s * r * 0.85, r * 1.1, 0);
        muff.scale.set(0.7, 1, 1);
        body.add(muff);
      }
      const aura = new THREE.Mesh(new THREE.RingGeometry(ENEMIES.muffler.mute! / 2.2 - 0.05, ENEMIES.muffler.mute! / 2.2, 48), new THREE.MeshBasicMaterial({ color: '#8f8aa8', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 0.05;
      root.add(aura);
      extra.aura = aura;
      height = r * 2.2;
      break;
    }
    case 'mender': {
      const r = 0.3;
      blob(r, '#3f5a52');
      face(body, r, r * 0.95, r * 0.86);
      feet(root, r, '#22352f');
      const stick = new THREE.Mesh(cyl(0.012, 0.012, 0.5, 5), stdMat('#5a4a3a', 0.6));
      stick.position.set(r * 0.85, r * 1.3, 0);
      const lamp = new THREE.Mesh(sph(0.07, 10, 8), glowMat('#7dff9a', 2.2));
      lamp.position.set(r * 0.85, r * 1.6, 0.05);
      body.add(stick, lamp);
      extra.lamp = lamp;
      height = r * 2.1;
      break;
    }
    case 'obelisk': {
      const m = skin('#4a465c', 0.7);
      skins.push(m);
      const base = new THREE.Mesh(box(0.9, 0.3, 0.9), stdMat('#3a3648', 0.8));
      base.position.y = 0.15;
      body.add(base);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 2.4, 4), m);
      pillar.position.y = 1.5;
      pillar.rotation.y = Math.PI / 4;
      body.add(pillar);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: '#1a1726', emissive: new THREE.Color('#6a5f9a'), emissiveIntensity: 0.8, roughness: 0.2 }));
      tip.position.y = 3.0;
      tip.scale.y = 1.6;
      body.add(tip);
      extra.tip = tip;
      // runes: X tapes all the way up
      for (let i = 0; i < 3; i++) {
        const tp = tape(0.28);
        tp.position.set(0, 0.8 + i * 0.6, 0.27);
        body.add(tp);
      }
      const aura = new THREE.Mesh(new THREE.RingGeometry(ENEMIES.obelisk.mute! / 2.2 - 0.06, ENEMIES.obelisk.mute! / 2.2, 64), new THREE.MeshBasicMaterial({ color: '#8f8aa8', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 0.06;
      root.add(aura);
      extra.aura = aura;
      height = 3.4;
      break;
    }
    case 'bossBlot': {
      const r = 0.85;
      blob(r, '#3a3158');
      face(body, r, r * 0.95, r * 0.86, r * 0.22, r * 0.36);
      feet(root, r, '#241d3a');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(cone(r * 0.12, r * 0.45, 8), skins[0]);
        spike.position.set(Math.cos(a) * r * 0.35, r * 1.75, Math.sin(a) * r * 0.35);
        spike.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
        body.add(spike);
      }
      height = r * 2.2;
      break;
    }
    case 'bossScarab': {
      const r = 0.95;
      const shellM = skin('#a8742e', 0.3, 0.6);
      skins.push(shellM);
      const dome = new THREE.Mesh(sph(r, 28, 18), shellM);
      dome.scale.set(0.85, 0.6, 1.15);
      dome.position.y = r * 0.6;
      body.add(dome);
      const seam = new THREE.Mesh(box(0.03, r * 0.5, r * 2.1), stdMat('#3a2a12', 0.5));
      seam.position.y = r * 1.05;
      body.add(seam);
      const head = new THREE.Group();
      const hm = new THREE.Mesh(sph(r * 0.4, 18, 12), skin('#4a3a22', 0.5));
      skins.push(hm.material as THREE.MeshStandardMaterial);
      head.add(hm);
      face(head, r * 0.4, 0.02, r * 0.33, r * 0.12, r * 0.17);
      const horn = new THREE.Mesh(cone(r * 0.1, r * 0.6, 8), stdMat('#d9b26a', 0.3, 0.5));
      horn.position.set(0, r * 0.35, r * 0.2);
      horn.rotation.x = 0.5;
      head.add(horn);
      head.position.set(0, r * 0.55, r * 1.05);
      body.add(head);
      for (const s of [-1, 1]) for (const z of [-0.5, 0, 0.5]) {
        const leg = new THREE.Mesh(cyl(0.05, 0.07, 0.6, 6), stdMat('#3a2a12', 0.6));
        leg.position.set(s * r * 0.85, 0.2, z * r);
        leg.rotation.z = s * 0.8;
        root.add(leg);
      }
      height = r * 1.4;
      break;
    }
    case 'bossMoth': {
      const r = 0.5;
      const m = skin('#8a9fc6');
      skins.push(m);
      const b = new THREE.Mesh(capsule(r * 0.5, r * 1.3, 8, 16), m);
      b.rotation.x = Math.PI / 2;
      body.add(b);
      const fuzz = new THREE.Mesh(sph(r * 0.75, 18, 12), skin('#eef6ff', 0.9));
      skins.push(fuzz.material as THREE.MeshStandardMaterial);
      fuzz.position.z = r * 0.7;
      body.add(fuzz);
      face(fuzz, r * 0.75, 0, r * 0.62, r * 0.2, r * 0.3);
      wings = [];
      const wm = new THREE.MeshStandardMaterial({ color: '#cfe9ff', roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide, emissive: new THREE.Color('#3a6a9a'), emissiveIntensity: 0.3, transparent: true, opacity: 0.92 });
      skins.push(wm);
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        const w = new THREE.Mesh(sph(r * 1.9, 20, 10), wm);
        w.scale.set(1, 0.05, 0.8);
        w.position.x = s * r * 1.7;
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.25, 0), glowMat('#bff0ff', 1.6));
        crystal.position.set(s * r * 2.2, 0.03, 0);
        pivot.add(w, crystal);
        pivot.position.set(s * r * 0.3, r * 0.2, 0);
        body.add(pivot);
        wings.push(pivot);
      }
      const crown = new THREE.Mesh(torus(r * 0.35, 0.03, 6, 20), glowMat('#bff0ff', 1.8));
      crown.position.set(0, r * 0.75, r * 0.65);
      crown.rotation.x = Math.PI / 2 - 0.3;
      body.add(crown);
      height = r * 2;
      break;
    }
    case 'bossGolem': {
      const r = 1.0;
      const rock = skin('#3d3436', 0.85);
      skins.push(rock);
      const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.75, 0), rock);
      torso.position.y = r * 1.05;
      torso.scale.set(1.1, 1, 0.9);
      body.add(torso);
      const lava = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.6, 0), glowMat('#ff6a1f', 2));
      lava.position.y = r * 1.05;
      lava.scale.set(1.2, 1.1, 1.0);
      body.add(lava);
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.32, 0), rock);
      head.position.set(0, r * 1.85, r * 0.15);
      body.add(head);
      face(body, r * 0.32, r * 1.85, r * 0.42, r * 0.09, r * 0.13);
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.3, 0), rock);
        arm.position.set(s * r * 0.95, r * 0.85, 0.1);
        arm.scale.set(0.8, 1.5, 0.8);
        body.add(arm);
        const leg = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.28, 0), rock);
        leg.position.set(s * r * 0.4, r * 0.25, 0);
        root.add(leg);
      }
      // armour plates (break away as it weakens)
      const plates = new THREE.Group();
      const pm = stdMat('#6b5f63', 0.4, 0.6);
      const spots: [number, number, number, number][] = [[0, 1.15, 0.62, 0], [-0.6, 1.2, 0.2, 0.9], [0.6, 1.2, 0.2, -0.9]];
      for (const [x, y, z, ry] of spots) {
        const p = new THREE.Mesh(box(r * 0.6, r * 0.55, 0.1), pm);
        p.position.set(x * r, y * r, z * r);
        p.rotation.y = ry;
        plates.add(p);
      }
      body.add(plates);
      extra.plates = plates;
      height = r * 2.2;
      break;
    }
    case 'silence': {
      const r = 1.1;
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        prof.push(new THREE.Vector2(r * (0.15 + 0.85 * Math.pow(1 - t, 1.4)) + Math.sin(t * 9) * 0.02, t * r * 2.6));
      }
      const cloak = skin('#1d1a2b', 0.9);
      skins.push(cloak);
      const c = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), cloak);
      body.add(c);
      const hood = new THREE.Mesh(sph(r * 0.55, 24, 16), cloak);
      hood.position.set(0, r * 2.55, 0);
      hood.scale.set(1, 1.15, 1);
      body.add(hood);
      const mask = new THREE.Mesh(sph(r * 0.42, 24, 16), stdMat('#f2f0f7', 0.25));
      mask.position.set(0, r * 2.5, r * 0.3);
      mask.scale.set(0.9, 1.15, 0.55);
      body.add(mask);
      for (const s of [-1, 1]) {
        const hole = new THREE.Mesh(sph(r * 0.08, 12, 8), stdMat('#0a0812', 0.5));
        hole.scale.set(1, 1.6, 0.4);
        hole.position.set(s * r * 0.15, r * 2.6, r * 0.52);
        body.add(hole);
        const sleeve = new THREE.Mesh(cone(r * 0.25, r * 1.3, 12), cloak);
        sleeve.position.set(s * r * 0.75, r * 1.6, r * 0.1);
        sleeve.rotation.z = s * 0.6;
        body.add(sleeve);
        extra[s < 0 ? 'sleeveL' : 'sleeveR'] = sleeve;
      }
      const aura = new THREE.Mesh(new THREE.RingGeometry(ENEMIES.silence.mute! / 2.2 - 0.06, ENEMIES.silence.mute! / 2.2, 64), new THREE.MeshBasicMaterial({ color: '#6a6488', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 0.06;
      root.add(aura);
      extra.aura = aura;
      height = r * 3;
      break;
    }
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as THREE.Material).transparent) m.castShadow = true;
  });
  body.name = 'body';
  wings?.forEach((w, i) => (w.name = `wing${i}`));
  for (const [k, o] of Object.entries(extra)) o.name = `x:${k}`;
  return { root, body, skins, wings, extra, height };
}

const templates = new Map<EnemyKind, Rig>();

/** A fresh rig sharing geometry with a cached template; skin materials are per instance. */
function instantiate(kind: EnemyKind): Rig {
  let tpl = templates.get(kind);
  if (!tpl) {
    tpl = buildRig(kind);
    templates.set(kind, tpl);
  }
  const root = tpl.root.clone(true);
  const map = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const skins: THREE.MeshStandardMaterial[] = [];
  for (const m of tpl.skins) {
    const c = m.clone();
    map.set(m, c);
    skins.push(c);
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && map.has(m.material as THREE.Material)) m.material = map.get(m.material as THREE.Material)!;
    // per-instance copies of transparent extras (bubble, aura) so opacity can change
  });
  const body = root.getObjectByName('body')!;
  const wings = tpl.wings ? tpl.wings.map((_, i) => root.getObjectByName(`wing${i}`)!) : undefined;
  const extra: Record<string, THREE.Object3D> = {};
  for (const k of Object.keys(tpl.extra)) extra[k] = root.getObjectByName(`x:${k}`)!;
  return { root, body, skins, wings, extra, height: tpl.height };
}

interface Sample {
  t: number;
  x: number;
  z: number;
}

export class EnemyView {
  readonly group: THREE.Group;
  private rig: Rig;
  readonly flying: boolean;
  private hist: Sample[] = [];
  private flash = 0;
  private slowT = 0;
  private dir = 0;
  private hpBar: THREE.Group;
  private hpFill: THREE.Mesh;
  private shieldFill: THREE.Mesh;
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
  readonly radius: number;
  visibleNow = false;
  readonly pos = new THREE.Vector3();

  constructor(readonly id: number, readonly kind: EnemyKind, readonly scale = 1) {
    this.rig = instantiate(kind);
    this.group = this.rig.root;
    this.group.scale.setScalar(scale);
    this.flying = ENEMIES[kind].flying;
    this.radius = ENEMIES[kind].radius;
    // health bar
    this.hpBar = new THREE.Group();
    const w = ENEMIES[kind].boss ? 1.6 : 0.6;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.04, 0.09), new THREE.MeshBasicMaterial({ color: '#1a1424', transparent: true, opacity: 0.75, depthTest: false }));
    this.hpFill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.06).translate(w / 2, 0, 0), new THREE.MeshBasicMaterial({ color: '#ff5a6a', depthTest: false, toneMapped: false }));
    this.hpFill.position.x = -w / 2;
    this.shieldFill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.035).translate(w / 2, 0, 0), new THREE.MeshBasicMaterial({ color: '#cfe2ff', depthTest: false, toneMapped: false }));
    this.shieldFill.position.set(-w / 2, 0.06, 0);
    bg.renderOrder = 20;
    this.hpFill.renderOrder = 21;
    this.shieldFill.renderOrder = 21;
    this.hpBar.add(bg, this.hpFill, this.shieldFill);
    this.hpBar.position.y = this.rig.height + 0.25;
    this.hpBar.visible = false;
    this.group.add(this.hpBar);
    this.group.visible = false;
  }

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
    // heading from recent motion
    const prev = this.at(vt - 0.12) ?? s;
    const dx = s.x - prev.x, dz = s.z - prev.z;
    if (dx * dx + dz * dz > 1e-6) {
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
    const boss = ENEMIES[this.kind].boss;
    if (this.flying) {
      y = y + (1.2 + Math.sin(vt * 2.2 + this.seed) * 0.12 + (this.kind === 'bossMoth' ? 0.5 : 0)) * this.scale;
      const flap = Math.sin(vt * (this.kind === 'bossMoth' ? 8 : 22) + this.seed);
      if (this.rig.wings) this.rig.wings.forEach((w, i) => (w.rotation.z = (i === 0 ? 1 : -1) * (0.2 + flap * 0.6)));
    } else if (this.kind === 'silence') {
      y += (0.25 + Math.sin(vt * 1.4) * 0.12) * this.scale;
      const e = this.rig.extra;
      if (e.sleeveL) e.sleeveL.rotation.z = -0.6 - Math.sin(vt * 1.1) * 0.15;
      if (e.sleeveR) e.sleeveR.rotation.z = 0.6 + Math.sin(vt * 1.1) * 0.15;
    } else {
      // hop on the beat (scurries take two hops per beat, bosses stomp)
      const hops = this.kind === 'scurry' ? 2 : 1;
      const ph = (bp * hops) % 1;
      const hopH = boss ? 0.08 : this.kind === 'shell' ? 0.05 : this.kind === 'bubble' ? 0.12 : 0.16;
      const hop = Math.sin(ph * Math.PI);
      if (this.kind !== 'obelisk') y += hop * hopH * this.scale * (1 - this.slowT * 0.5);
      else sq = 1;
      // squash on landing, stretch in the air
      const land = Math.exp(-ph * 8);
      sq = 1 + hop * 0.12 - land * 0.18;
    }
    if (this.burrowed) this.sink = Math.min(1, this.sink + dt * 2);
    else this.sink = Math.max(0, this.sink - dt * 2);
    y -= this.sink * this.rig.height * 0.9 * this.scale;
    toWorld(s.x, s.z, y, this.pos);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.dir;
    this.rig.body.scale.set(appear * (2 - sq), appear * sq, appear * (2 - sq));
    // hit flash & slow tint
    this.flash = Math.max(0, this.flash - dt * 7);
    this.slowT = Math.max(0, this.slowT - dt * 0.6);
    for (const m of this.rig.skins) {
      m.emissive.setRGB(this.flash * 0.9 + 0, this.flash * 0.9 + this.slowT * 0.15, this.flash * 0.9 + this.slowT * 0.45);
    }
    // camouflage
    if (this.kind === 'phantom') {
      const mat = (this.rig.extra.ghostMat as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.opacity = damp(mat.opacity, this.revealed ? 0.88 : 0.28, 6, dt);
    }
    if (this.rig.extra.bubble) {
      this.rig.extra.bubble.visible = this.shield > 0.01;
      this.rig.extra.bubble.rotation.y = vt * 0.3;
    }
    if (this.rig.extra.aura) this.rig.extra.aura.rotation.z = vt * 0.4;
    if (this.rig.extra.lamp) this.rig.extra.lamp.scale.setScalar(1 + Math.exp(-bp * 4) * 0.4);
    if (this.rig.extra.tip) {
      this.rig.extra.tip.rotation.y = vt * 0.8;
      this.rig.extra.tip.position.y = 3.0 + Math.sin(vt * 1.5) * 0.1;
    }
    if (this.rig.extra.ball) this.rig.extra.ball.scale.set(1 + Math.sin(vt * 5) * 0.04, 1 - Math.sin(vt * 5) * 0.04, 1);
    if (this.rig.extra.tail) this.rig.extra.tail.rotation.y = Math.sin(vt * 14) * 0.3;
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

  /** golem: plates fall off */
  dropPlate(): THREE.Object3D | null {
    const p = this.rig.extra.plates as THREE.Group | undefined;
    if (!p || !p.children.length) return null;
    const plate = p.children[p.children.length - 1];
    p.remove(plate);
    return plate;
  }

  dispose() {
    // geometry is shared with the template; only the per-instance skins and bar are ours
    for (const m of this.rig.skins) m.dispose();
    this.hpBar.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
