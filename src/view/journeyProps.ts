/** Journey set pieces: the landmark on the horizon, note pickups, Silence mists. */
import * as THREE from 'three';
import type { LandmarkKind } from '../sim/journey';
import { cone, cyl, glowMat, sph, stdMat, torus } from './kit';
import { noteMesh } from './models';

// ───────────────────────────── landmarks ─────────────────────────────

export class Landmark {
  readonly group = new THREE.Group();
  private bell: THREE.Object3D | null = null;
  private glow: THREE.PointLight;
  private rays: THREE.Mesh;
  private rayMat: THREE.MeshBasicMaterial;
  private strings: THREE.MeshBasicMaterial[] = [];
  awake = 0;
  private ringT = -1;

  constructor(readonly kind: LandmarkKind) {
    const stone = stdMat('#d9cdb6', 0.85);
    const stoneDark = stdMat('#b9ab92', 0.85);
    switch (kind) {
      case 'bell': {
        const base = new THREE.Mesh(cyl(7, 8, 1.6, 10), stoneDark);
        base.position.y = 0.4;
        this.group.add(base);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 19, 1.6), stone);
          p.position.set(Math.cos(a) * 4, 10.4, Math.sin(a) * 4);
          this.group.add(p);
        }
        const ring = new THREE.Mesh(cyl(5.4, 5.4, 1.4, 4), stoneDark);
        ring.rotation.y = Math.PI / 4;
        ring.position.y = 20.4;
        this.group.add(ring);
        const roof = new THREE.Mesh(cone(6.2, 7, 4), stdMat('#8a4a3a', 0.7));
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 24.6;
        this.group.add(roof);
        const finial = new THREE.Mesh(sph(0.6, 12, 8), stdMat('#e9b949', 0.3, 0.8));
        finial.position.y = 28.4;
        this.group.add(finial);
        // the great bell
        const prof: THREE.Vector2[] = [];
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          prof.push(new THREE.Vector2(0.6 + 3.0 * Math.pow(t, 1.7) + (t > 0.85 ? (t - 0.85) * 2.2 : 0), 3.4 - t * 6.2));
        }
        const bell = new THREE.Group();
        const bm = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), stdMat('#b8862a', 0.32, 0.85));
        (bm.material as THREE.Material).side = THREE.DoubleSide;
        bell.add(bm);
        const clap = new THREE.Mesh(sph(0.7, 14, 10), stdMat('#5a3a1a', 0.5, 0.5));
        clap.position.y = -2.2;
        bell.add(clap);
        bell.position.y = 17.4;
        this.group.add(bell);
        this.bell = bell;
        break;
      }
      case 'harp': {
        const base = new THREE.Mesh(cyl(6, 7.5, 2.2, 12), stdMat('#d9a46b', 0.85));
        base.position.y = 0.6;
        this.group.add(base);
        const gold = stdMat('#e9b949', 0.28, 0.85);
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(torus(9, 0.75, 10, 40, Math.PI * 0.55), gold);
          arm.rotation.z = s > 0 ? Math.PI * 0.2 : Math.PI * 0.25;
          arm.scale.x = s;
          arm.position.set(s * 0.6, 3, 0);
          this.group.add(arm);
        }
        const top = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 1.4), gold);
        top.position.y = 21;
        this.group.add(top);
        for (let i = 0; i < 9; i++) {
          const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0b8'), toneMapped: false, transparent: true, opacity: 0.35 });
          this.strings.push(m);
          const st = new THREE.Mesh(cyl(0.08, 0.08, 18, 6), m);
          st.position.set(-5 + i * 1.25, 11.6, 0);
          this.group.add(st);
        }
        break;
      }
      case 'organ': {
        const base = new THREE.Mesh(cyl(7, 9, 3, 10), stdMat('#9fb6cc', 0.6));
        base.position.y = 1;
        this.group.add(base);
        const ice = new THREE.MeshStandardMaterial({ color: '#cfefff', emissive: new THREE.Color('#5fb8ff'), emissiveIntensity: 0.35, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.92 });
        const heights = [10, 14, 19, 24, 28, 24, 19, 14, 10];
        heights.forEach((hh, i) => {
          const p = new THREE.Mesh(cyl(0.9, 0.9, hh, 14), ice);
          p.position.set(-8 + i * 2, 2.5 + hh / 2, Math.abs(i - 4) * 0.6);
          this.group.add(p);
          const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.3), stdMat('#2a4a6a', 0.4));
          mouth.position.set(-8 + i * 2, 4.5, Math.abs(i - 4) * 0.6 + 0.9);
          this.group.add(mouth);
        });
        break;
      }
      case 'chimes': {
        const iron = stdMat('#3a3034', 0.5, 0.6);
        const base = new THREE.Mesh(cyl(6, 7, 2, 8), stdMat('#2a2224', 0.9));
        base.position.y = 0.5;
        this.group.add(base);
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 20, 1.4), iron);
          post.position.set(s * 8, 11, 0);
          this.group.add(post);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(18, 1.4, 1.6), iron);
        beam.position.y = 21;
        this.group.add(beam);
        const gong = new THREE.Group();
        const disc = new THREE.Mesh(cyl(7, 7, 0.6, 40), stdMat('#c9822f', 0.3, 0.85));
        disc.rotation.x = Math.PI / 2;
        const boss = new THREE.Mesh(sph(1.6, 20, 14), stdMat('#e0a040', 0.25, 0.9));
        boss.scale.z = 0.5;
        boss.position.z = 0.3;
        gong.add(disc, boss);
        gong.position.y = 12;
        this.group.add(gong);
        this.bell = gong;
        break;
      }
      case 'spire': {
        const dark = stdMat('#1d1a2b', 0.6);
        const base = new THREE.Mesh(cyl(8, 10, 3, 6), stdMat('#3a3650', 0.8));
        base.position.y = 1;
        this.group.add(base);
        const spire = new THREE.Mesh(cone(4.5, 40, 6), dark);
        spire.position.y = 22;
        this.group.add(spire);
        const mask = new THREE.Mesh(sph(2.4, 24, 16), stdMat('#f2f0f7', 0.25));
        mask.scale.set(0.9, 1.15, 0.5);
        mask.position.set(0, 26, 2.4);
        this.group.add(mask);
        break;
      }
    }
    this.glow = new THREE.PointLight('#ffd98a', 0, 80, 1.5);
    this.glow.position.y = 16;
    this.group.add(this.glow);
    this.rayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2c2'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.rays = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 9, 120, 24, 1, true), this.rayMat);
    this.rays.position.y = 70;
    this.group.add(this.rays);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.Material).transparent) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  /** The colossus arrived: ring! */
  ring() {
    this.ringT = 0;
  }

  update(dt: number, t: number) {
    if (this.ringT >= 0) {
      this.ringT += dt;
      this.awake = Math.min(1, this.awake + dt * 0.8);
    }
    const k = this.awake;
    if (this.bell) {
      if (this.kind === 'chimes') this.bell.rotation.x = Math.sin(this.ringT * 4) * 0.25 * Math.exp(-Math.max(0, this.ringT) * 0.3) * k;
      else this.bell.rotation.z = Math.sin(this.ringT * 3.2) * 0.4 * Math.exp(-Math.max(0, this.ringT) * 0.25) * k;
    }
    this.glow.intensity = k * 900;
    this.rayMat.opacity = k * (0.18 + Math.sin(t * 2) * 0.04);
    this.rays.rotation.y = t * 0.2;
    for (const s of this.strings) s.opacity = 0.35 + k * 0.6 * (0.6 + 0.4 * Math.sin(t * 6));
  }
}

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
