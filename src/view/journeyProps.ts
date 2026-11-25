/** Journey set pieces: the great Voice at the end of the road, note pickups, Silence mists. */
import * as THREE from 'three';
import type { LandmarkKind } from '../sim/journey';
import { box, cone, cyl, glowMat, sph, stdMat, torus } from './kit';
import { noteMesh } from './models';
import { InkCoil } from './storyProps';

// ───────────────────────────── landmarks: the five great Voices ─────────────────────────────

/**
 * A great Voice of Harmonia at the end of the road (docs/STORY.md): the Meadow Bell on its hill, the
 * golden Dune Harp with strings of light, the Crystal Organ of singing ice pipes, the Forge Carillon of
 * anvil-bells over a lava vent, and the Needle of the Citadel. Silent and dim at first; `ring()` (the
 * colossus arrived) and `sing()` (cinematics) make it ring and shine. `setCorrupt` wraps it in ink.
 */
export class Landmark {
  readonly group = new THREE.Group();
  private bell: THREE.Object3D | null = null;
  private swingers: { o: THREE.Object3D; ph: number; amp: number }[] = [];
  private hammers: THREE.Object3D[] = [];
  private glow: THREE.PointLight;
  private rays: THREE.Mesh;
  private rayMat: THREE.MeshBasicMaterial;
  private strings: { mat: THREE.MeshBasicMaterial; mesh: THREE.Mesh; ph: number }[] = [];
  private pipes: { mat: THREE.MeshStandardMaterial; i: number }[] = [];
  private flags: THREE.Mesh[] = [];
  private rings: THREE.Object3D[] = [];
  private lava: THREE.MeshBasicMaterial | null = null;
  private height = 28;
  private coil: InkCoil | null = null;
  awake = 0;
  private waking = false;
  private ringT = -1;
  private singT = -1;

  constructor(readonly kind: LandmarkKind) {
    switch (kind) {
      case 'bell':
        this.buildBell();
        break;
      case 'harp':
        this.buildHarp();
        break;
      case 'organ':
        this.buildOrgan();
        break;
      case 'chimes':
        this.buildChimes();
        break;
      case 'spire':
        this.buildSpire();
        break;
    }
    this.glow = new THREE.PointLight('#ffd98a', 0, 90, 1.5);
    this.glow.position.y = this.height * 0.6;
    this.group.add(this.glow);
    this.rayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(VOICE_COLOR[kind]), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.rays = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 9, 140, 24, 1, true), this.rayMat);
    this.rays.position.y = this.height + 66;
    this.group.add(this.rays);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.Material).transparent) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  // ── the Meadow Bell: a belfry of four arches on a flowered hill, a great bronze bell, banners
  private buildBell() {
    const stone = stdMat('#e3d8c2', 0.85), stoneDark = stdMat('#bfb096', 0.85), roofM = stdMat('#5f9b7a', 0.6, 0.2), gold = stdMat('#e9b949', 0.3, 0.8);
    const hill = new THREE.Mesh(sph(13, 32, 12), stdMat('#7fb85a', 0.95));
    hill.scale.set(1, 0.26, 1);
    hill.position.y = -1.2;
    this.group.add(hill);
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(cyl(8.6 - i * 0.7, 9 - i * 0.7, 0.55, 10), i % 2 ? stone : stoneDark);
      st.position.y = 1.2 + i * 0.55;
      this.group.add(st);
    }
    const y0 = 3.2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const p = new THREE.Mesh(box(1.7, 15, 1.7), stone);
      p.position.set(Math.cos(a) * 4.4, y0 + 7.5, Math.sin(a) * 4.4);
      p.rotation.y = -a;
      this.group.add(p);
      const cap = new THREE.Mesh(box(2.2, 0.6, 2.2), stoneDark);
      cap.position.set(Math.cos(a) * 4.4, y0 + 15.2, Math.sin(a) * 4.4);
      cap.rotation.y = -a;
      this.group.add(cap);
      // an arch between this pillar and the next
      const b = a + Math.PI / 2;
      const mid = new THREE.Vector3((Math.cos(a) + Math.cos(b)) * 2.2, y0 + 13.3, (Math.sin(a) + Math.sin(b)) * 2.2);
      const arch = new THREE.Mesh(torus(2.85, 0.45, 8, 20, Math.PI), stone);
      arch.position.copy(mid);
      arch.lookAt(0, mid.y, 0);
      this.group.add(arch);
    }
    const cornice = new THREE.Mesh(cyl(6.6, 6.6, 1.2, 4), stoneDark);
    cornice.rotation.y = Math.PI / 4;
    cornice.position.y = y0 + 16.2;
    this.group.add(cornice);
    const drum = new THREE.Mesh(cyl(5.2, 5.6, 2.2, 16), stone);
    drum.position.y = y0 + 17.9;
    this.group.add(drum);
    const roof = new THREE.Mesh(cone(5.8, 7.5, 16), roofM);
    roof.position.y = y0 + 22.7;
    this.group.add(roof);
    const fin = new THREE.Mesh(sph(0.7, 12, 8), gold);
    fin.position.y = y0 + 26.8;
    const spike = new THREE.Mesh(cone(0.25, 2, 8), gold);
    spike.position.y = y0 + 28.2;
    this.group.add(fin, spike);
    // banners hanging from the cornice
    const bcol = ['#d6303f', '#3f7ec0', '#e0a63a', '#6b4fa8'];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.2, 1, 6), new THREE.MeshStandardMaterial({ color: bcol[i], side: THREE.DoubleSide, roughness: 0.8 }));
      f.geometry.translate(0, -2.1, 0);
      f.position.set(Math.cos(a) * 6.75, y0 + 15.8, Math.sin(a) * 6.75);
      f.rotation.y = -a + Math.PI / 2;
      this.group.add(f);
      this.flags.push(f);
    }
    // the great bell, with bands, lip and clapper
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      prof.push(new THREE.Vector2(0.5 + 3.0 * Math.pow(t, 1.8) + (t > 0.82 ? (t - 0.82) * 3.2 : 0), 3.6 - t * 6.4));
    }
    const bell = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), stdMat('#c08f2e', 0.3, 0.9));
    (bm.material as THREE.Material).side = THREE.DoubleSide;
    bell.add(bm);
    for (const [y, r] of [[2.2, 1.25], [0.2, 2.05], [-2.25, 3.55]] as [number, number][]) {
      const band = new THREE.Mesh(torus(r, 0.12, 6, 40), stdMat('#e9c25a', 0.25, 0.9));
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      bell.add(band);
    }
    const crown = new THREE.Mesh(torus(0.6, 0.22, 8, 16), stdMat('#a87a22', 0.3, 0.85));
    crown.position.y = 3.9;
    bell.add(crown);
    const clap = new THREE.Mesh(sph(0.75, 14, 10), stdMat('#5a3a1a', 0.5, 0.5));
    clap.position.y = -2.4;
    bell.add(clap);
    bell.position.y = y0 + 11.6;
    this.group.add(bell);
    this.bell = bell;
    this.height = y0 + 28;
  }

  // ── the Dune Harp: a golden harp the size of a hill, with strings of light
  private buildHarp() {
    const gold = stdMat('#e9b949', 0.26, 0.88), goldDark = stdMat('#b8862a', 0.3, 0.85), sand = stdMat('#d9a46b', 0.9), sand2 = stdMat('#e8c08a', 0.9);
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(cyl(9.5 - i * 1.8, 10.5 - i * 1.8, 1.2, 12), i % 2 ? sand2 : sand);
      st.position.y = 0.4 + i * 1.2;
      this.group.add(st);
    }
    const y0 = 3.6;
    // the column (fore-pillar) with a capital
    const col = new THREE.Mesh(cyl(0.75, 0.95, 21, 12), gold);
    col.position.set(-6.5, y0 + 10.5, 0);
    const capital = new THREE.Mesh(sph(1.4, 14, 10), goldDark);
    capital.position.set(-6.5, y0 + 21.3, 0);
    const foot = new THREE.Mesh(cyl(1.4, 1.8, 1.4, 12), goldDark);
    foot.position.set(-6.5, y0 + 0.7, 0);
    this.group.add(col, capital, foot);
    // the neck: an S-curve from the column's top to the soundboard's top
    const neckCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-6.5, y0 + 21.3, 0), new THREE.Vector3(-3, y0 + 23.5, 0), new THREE.Vector3(1.5, y0 + 19.5, 0), new THREE.Vector3(5.5, y0 + 16.5, 0), new THREE.Vector3(7.2, y0 + 18, 0)]);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 48, 0.9, 10, false), gold);
    this.group.add(neck);
    const scroll = new THREE.Mesh(torus(1.0, 0.35, 8, 20, Math.PI * 1.6), gold);
    scroll.position.set(7.4, y0 + 18.8, 0);
    this.group.add(scroll);
    // the soundboard: a slanted box rising from the base to the neck
    const sbCurve = new THREE.LineCurve3(new THREE.Vector3(-4.6, y0 + 0.8, 0), new THREE.Vector3(5.6, y0 + 16.4, 0));
    const sbLen = sbCurve.getLength();
    const sb = new THREE.Mesh(new THREE.BoxGeometry(1.6, sbLen, 2.6), goldDark);
    sb.position.copy(sbCurve.getPoint(0.5));
    sb.rotation.z = -Math.atan2(10.2, 15.6);
    this.group.add(sb);
    // the strings of light between the soundboard and the neck
    const n = 13;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const lo = sbCurve.getPoint(u);
      const x = lo.x;
      let best = neckCurve.getPoint(0), bd = 1e9;
      for (let k = 0; k <= 60; k++) {
        const p = neckCurve.getPoint(k / 60);
        const d = Math.abs(p.x - x);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      const len = best.y - lo.y - 0.6;
      if (len < 1) continue;
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0b8').multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
      const st = new THREE.Mesh(cyl(0.09, 0.09, len, 6), m);
      st.position.set(x, lo.y + 0.3 + len / 2, 0);
      this.group.add(st);
      this.strings.push({ mat: m, mesh: st, ph: i * 0.7 });
    }
    this.height = y0 + 23;
  }

  // ── the Crystal Organ: a façade of ice pipes on a glacier, singing with the aurora
  private buildOrgan() {
    const rock = stdMat('#9fb6cc', 0.7), snow = stdMat('#f4f8ff', 0.9);
    const base = new THREE.Mesh(cyl(9, 11, 3.2, 12), rock);
    base.position.y = 1;
    const cap = new THREE.Mesh(cyl(9.4, 9.2, 0.8, 12), snow);
    cap.position.y = 2.9;
    this.group.add(base, cap);
    const heights = [9, 12, 15, 19, 23, 27, 31, 27, 23, 19, 15, 12, 9];
    heights.forEach((hh, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: '#cfefff', emissive: new THREE.Color('#5fb8ff'), emissiveIntensity: 0.25, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.9 });
      const x = -9 + i * 1.5;
      const z = Math.pow(Math.abs(i - 6) / 6, 2) * 3.5;
      const r = 0.62 + (hh / 31) * 0.25;
      const p = new THREE.Mesh(cyl(r, r, hh, 14), mat);
      p.position.set(x, 3.3 + hh / 2, z);
      this.group.add(p);
      const tip = new THREE.Mesh(cone(r, 1.8, 14), mat);
      tip.position.set(x, 3.3 + hh + 0.9, z);
      this.group.add(tip);
      const mouth = new THREE.Mesh(box(r * 1.2, 0.9, 0.3), stdMat('#2a4a6a', 0.4));
      mouth.position.set(x, 5.6, z + r * 0.85);
      this.group.add(mouth);
      this.pipes.push({ mat, i });
    });
    // icicles along the front of the base
    for (let i = 0; i < 16; i++) {
      const ic = new THREE.Mesh(cone(0.3, 1.6, 6), stdMat('#e6f6ff', 0.2));
      const a = -0.9 + (i / 15) * 1.8;
      ic.position.set(Math.sin(a) * 9.3, 2.2, Math.cos(a) * 9.3);
      ic.rotation.x = Math.PI;
      this.group.add(ic);
    }
    this.height = 36;
  }

  // ── the Forge Carillon: anvil-bells in an iron frame over a vent of the volcano
  private buildChimes() {
    const iron = stdMat('#3a3034', 0.5, 0.6), rock = stdMat('#2a2224', 0.9), bronze = stdMat('#c9822f', 0.3, 0.85);
    const base = new THREE.Mesh(cyl(8, 9.5, 2.4, 9), rock);
    base.position.y = 0.6;
    this.group.add(base);
    // the vent glowing under the frame
    this.lava = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a1f').multiplyScalar(1.6), toneMapped: false });
    const vent = new THREE.Mesh(cyl(3.2, 3.2, 0.3, 20), this.lava);
    vent.position.y = 1.9;
    this.group.add(vent);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(box(1.6, 22, 1.6), iron);
      post.position.set(s * 8, 12, 0);
      const brace = new THREE.Mesh(box(1, 9, 1), iron);
      brace.position.set(s * 6, 5, 0);
      brace.rotation.z = s * 0.6;
      this.group.add(post, brace);
      for (let k = 0; k < 6; k++) {
        const rivet = new THREE.Mesh(sph(0.22, 8, 6), stdMat('#5a4e52', 0.4, 0.8));
        rivet.position.set(s * 8, 4 + k * 3.2, 0.82);
        this.group.add(rivet);
      }
    }
    const beam = new THREE.Mesh(box(19, 1.6, 2), iron);
    beam.position.y = 23;
    this.group.add(beam);
    // anvil-bells of graded sizes, each with a little hammer
    const sizes = [1.5, 2.0, 2.6, 2.0, 1.5];
    sizes.forEach((r, i) => {
      const x = -6 + i * 3;
      const g = new THREE.Group();
      const prof: THREE.Vector2[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        prof.push(new THREE.Vector2(0.3 + r * Math.pow(t, 1.6), -t * r * 2));
      }
      const b = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), bronze);
      (b.material as THREE.Material).side = THREE.DoubleSide;
      const anvilTop = new THREE.Mesh(box(r * 1.5, 0.5, r * 0.8), iron);
      anvilTop.position.y = 0.25;
      const rope = new THREE.Mesh(cyl(0.08, 0.08, 4, 6), iron);
      rope.position.y = 2.2;
      g.add(b, anvilTop, rope);
      g.position.set(x, 18.8, 0);
      this.group.add(g);
      this.swingers.push({ o: g, ph: i * 0.9, amp: 0.25 });
      const ham = new THREE.Group();
      const handle = new THREE.Mesh(cyl(0.1, 0.1, 2.4, 6), stdMat('#6b4426', 0.8));
      handle.position.y = -1.2;
      const head = new THREE.Mesh(box(0.8, 0.5, 0.5), iron);
      head.position.y = -2.4;
      ham.add(handle, head);
      ham.position.set(x + r + 0.6, 21.5, 0);
      this.group.add(ham);
      this.hammers.push(ham);
    });
    this.height = 24;
  }

  // ── the Needle: the spire from which the Song was conducted, ringed by broken staff lines
  private buildSpire() {
    const dark = stdMat('#2a263a', 0.45, 0.2), marble = stdMat('#c9c5cf', 0.5), gold = stdMat('#e9b949', 0.3, 0.8);
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(cyl(10 - i * 1.6, 10.6 - i * 1.6, 1, 6), marble);
      st.position.y = 0.5 + i;
      this.group.add(st);
    }
    const spire = new THREE.Mesh(cone(4.2, 44, 6), dark);
    spire.position.y = 4 + 22;
    this.group.add(spire);
    // spiral ribs climbing the needle
    const rib: THREE.Vector3[] = [];
    for (let k = 0; k <= 80; k++) {
      const u = k / 80;
      const a = u * Math.PI * 6;
      const r = 4.2 * (1 - u) + 0.3;
      rib.push(new THREE.Vector3(Math.cos(a) * r, 4 + u * 42, Math.sin(a) * r));
    }
    this.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rib), 200, 0.22, 6, false), marble));
    // the conductor's balcony near the top, and the porcelain mask that watches the road
    const balcony = new THREE.Mesh(cyl(2.6, 2.2, 0.6, 12), marble);
    balcony.position.y = 33;
    this.group.add(balcony);
    const mask = new THREE.Mesh(sph(2.0, 24, 16), stdMat('#f2f0f7', 0.25));
    mask.scale.set(0.9, 1.15, 0.45);
    mask.position.set(0, 37.5, 2.2);
    this.group.add(mask);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(sph(0.36, 10, 8), stdMat('#120f1c', 0.3));
      eye.scale.set(1, 0.6, 0.4);
      eye.position.set(s * 0.62, 38.0, 3.05);
      this.group.add(eye);
      const st = new THREE.Mesh(box(0.9, 0.12, 0.08), stdMat('#3a3046', 0.5));
      st.rotation.z = s * 0.6;
      st.position.set(0, 36.6, 3.1);
      this.group.add(st);
    }
    const tip = new THREE.Mesh(sph(0.7, 12, 8), gold);
    tip.position.y = 48.3;
    this.group.add(tip);
    // five broken staff rings floating around it
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const arc = new THREE.Mesh(torus(6.5 + i * 0.35, 0.09, 4, 30, Math.PI * 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color('#d9d3ff').multiplyScalar(1.3), toneMapped: false }));
        arc.rotation.z = (k / 3) * Math.PI * 2 + i * 0.5;
        ring.add(arc);
      }
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 26 + i * 0.7;
      this.group.add(ring);
      this.rings.push(ring);
    }
    this.height = 48;
  }

  /** The colossus arrived: ring! */
  ring() {
    this.ringT = 0;
    this.waking = true;
  }

  /** Cinematics: the Voice rings in full glory (it wakes too). */
  sing() {
    this.ring();
    this.singT = 0;
  }

  /** Cinematics: set how awake (glowing) it is, holding there. */
  setAwake(k: number) {
    this.awake = Math.max(0, Math.min(1, k));
    this.waking = false;
  }

  /**
   * Ink wrapped around the Voice (the land's guardian holds it): 0 none … 1 all wrapped. Eased unless
   * `instant` (the ink loosens or tightens over a second or two).
   */
  setCorrupt(k: number, instant = true) {
    if (k > 0 && !this.coil) {
      const r = this.kind === 'spire' ? 6 : this.kind === 'harp' ? 9 : this.kind === 'organ' ? 10 : 8;
      this.coil = new InkCoil(r, this.height * 0.85, 4);
      this.coil.grow = 0;
      this.group.add(this.coil.group);
    }
    this.corruptGoal = k;
    if (instant && this.coil) this.coil.grow = k;
  }
  private corruptGoal = 0;

  /** world position of the top of the Voice (threads of light start there) */
  top(out = new THREE.Vector3()): THREE.Vector3 {
    return this.group.localToWorld(out.set(0, this.height * 0.92, 0));
  }

  update(dt: number, t: number) {
    if (this.ringT >= 0) this.ringT += dt;
    if (this.singT >= 0) this.singT += dt;
    if (this.waking) this.awake = Math.min(1, this.awake + dt * 0.8);
    const k = this.awake;
    const swing = this.ringT >= 0 ? Math.exp(-this.ringT * 0.25) : 0;
    const sing = this.singT >= 0 ? 1 + 0.6 * Math.exp(-this.singT * 0.4) : 1;
    if (this.bell) this.bell.rotation.z = Math.sin(this.ringT * 3.2) * 0.4 * swing * k;
    for (const s of this.swingers) s.o.rotation.x = Math.sin(this.ringT * 4 + s.ph) * s.amp * swing * k;
    this.hammers.forEach((h, i) => (h.rotation.z = k > 0.05 ? -0.5 + Math.max(0, Math.sin(t * 3.4 + i * 1.3)) * 0.9 * k : -0.3));
    for (const s of this.strings) {
      s.mat.opacity = 0.22 + k * 0.7 * (0.6 + 0.4 * Math.sin(t * 9 + s.ph)) * sing;
      s.mesh.position.z = Math.sin(t * 40 + s.ph) * 0.06 * k;
    }
    for (const p of this.pipes) {
      const wave = Math.max(0, Math.sin(t * 2.2 - p.i * 0.45));
      const c = AURORA[(p.i + Math.floor(t * 0.5)) % AURORA.length];
      p.mat.emissive.copy(c);
      p.mat.emissiveIntensity = 0.25 + k * (0.5 + wave * 1.2) * sing;
    }
    this.flags.forEach((f, i) => (f.rotation.x = Math.sin(t * 2.6 + i) * 0.18));
    this.rings.forEach((r, i) => (r.rotation.z = t * (0.12 + i * 0.03) * (i % 2 ? 1 : -1)));
    if (this.lava) this.lava.color.setRGB(1.6 + Math.sin(t * 3) * 0.2, 0.55 + k * 0.4, 0.12);
    this.glow.intensity = k * 900 * sing;
    this.rayMat.opacity = k * (0.16 + Math.sin(t * 2) * 0.04) * sing;
    this.rays.rotation.y = t * 0.2;
    if (this.coil) {
      this.coil.grow += (this.corruptGoal - this.coil.grow) * Math.min(1, dt * 1.6);
      this.coil.update(dt, t);
    }
  }
}

const VOICE_COLOR: Record<LandmarkKind, string> = { bell: '#e9ffd2', harp: '#fff0c8', organ: '#d2f2ff', chimes: '#ffd9b8', spire: '#fff2c2' };
const AURORA = ['#5fffb0', '#5fd8ff', '#9a7aff', '#ff8ad8', '#7affd2'].map((c) => new THREE.Color(c));

// ───────────────────────────── note pickups ─────────────────────────────

export class PickupView {
  readonly group = new THREE.Group();
  private notes: THREE.Mesh[] = [];
  private orb: THREE.Mesh;
  private ring: THREE.Mesh;
  gone = false;
  private goneT = 0;
  readonly hit: THREE.Mesh;

  constructor(readonly id: number, value: number) {
    this.orb = new THREE.Mesh(sph(0.38, 16, 12), glowMat('#ffd36b', 2.2));
    this.group.add(this.orb);
    const halo = new THREE.Mesh(sph(0.75, 16, 12), glowMat('#ffe9a8', 1.2, 0.25));
    this.orb.add(halo);
    const n = Math.min(5, 2 + Math.floor(value / 5));
    for (let i = 0; i < n; i++) {
      const m = noteMesh(0.42, i % 2 ? '#ffe9a8' : '#ffd36b', 2.2);
      this.notes.push(m);
      this.group.add(m);
    }
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd36b').multiplyScalar(1.4), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
    this.group.add(this.ring);
    this.hit = new THREE.Mesh(sph(2.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 2;
    this.hit.userData.pickup = id;
    this.group.add(this.hit);
  }

  take() {
    this.gone = true;
  }

  update(dt: number, t: number, ground: number) {
    const bob = Math.sin(t * 2.2 + this.id) * 0.25;
    this.orb.position.y = 2.1 + bob;
    this.notes.forEach((m, i) => {
      const a = t * 1.6 + (i / this.notes.length) * Math.PI * 2;
      m.position.set(Math.cos(a) * 1.1, 2.1 + bob + Math.sin(t * 3 + i) * 0.3, Math.sin(a) * 1.1);
      m.rotation.y = -a;
    });
    this.ring.position.y = ground - this.group.position.y + 0.08;
    this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    if (this.gone) {
      this.goneT += dt;
      this.group.scale.setScalar(Math.max(0.001, 1 - this.goneT * 3));
    }
  }
}

// ───────────────────────────── Silence mist (where a wave will come from) ─────────────────────────────

export class MistView {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  life = 0;
  ttl: number;

  constructor(ttl: number) {
    this.ttl = ttl;
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uFade; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p); float a = atan(p.y, p.x);
          float sw = sin(a * 3.0 + r * 18.0 - uTime * 2.5) * 0.5 + 0.5;
          float m = smoothstep(0.5, 0.1, r);
          vec3 c = mix(vec3(0.08, 0.06, 0.14), vec3(0.45, 0.42, 0.6), sw * smoothstep(0.0, 0.4, r));
          gl_FragColor = vec4(c, m * (0.5 + 0.5 * sw) * 0.85 * uFade);
        }`,
    });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), this.mat);
    disc.position.y = 0.15;
    this.group.add(disc);
  }

  update(dt: number, t: number) {
    this.life += dt;
    this.mat.uniforms.uTime.value = t;
    const fin = Math.min(1, this.life * 1.5);
    const fout = Math.min(1, Math.max(0, (this.ttl - this.life) * 1.2));
    this.mat.uniforms.uFade.value = fin * fout;
    return this.life < this.ttl;
  }

  dispose() {
    this.mat.dispose();
  }
}
