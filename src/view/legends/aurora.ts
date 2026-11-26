/**
 * Dragão da Aurora (ice secret path): an ice-crystal dragon (faceted, translucent blue with glowing
 * veins and a crystal heart) whose wings are flowing aurora ribbons hanging from crystal spars
 * (an additive curtain shader shifting cyan → green → violet), crystal shards orbiting it. It flies
 * in place, one wing beat every two beats, the tail swaying.
 *   phase 2: the aurora splits: a second pair of wings in other hues, the ribbons tear into strands
 *   phase 3: the wings open fully, a sky-wide aurora curtain glows behind it
 */
import * as THREE from 'three';
import { capsule, clamp01, cone } from '../kit';
import { ell } from '../musicians';
import { type ActS, type Frame, type Geo, GlowPoints, type LU, NOISE, P, type Rig, Spine, V, curtain, legendMat, legendUniforms, merge, mergeAR, newFrame, rng, smooth, xStitch } from './common';

const L = 10.5;
const NB = 26;
const _c = new THREE.Color();
const DEEP = new THREE.Color('#1d3f8c'), MID = new THREE.Color('#58b4ee'), PALE = new THREE.Color('#d4f6ff');

const rad = (u: number) =>
  1.25 * (0.05 + 0.48 * smooth(0.0, 0.34, u) + 0.22 * Math.exp(-(((u - 0.6) / 0.1) ** 2)) - 0.3 * smooth(0.66, 0.82, u) - 0.04 * smooth(0.9, 1, u));

const ice = (p: THREE.Vector3, n: THREE.Vector3) => _c.copy(DEEP).lerp(MID, smooth(0.8, -0.3, n.y) * 0.8).lerp(PALE, smooth(-0.4, -0.95, n.y) * 0.45);

// ───────────────────────────── geometry ─────────────────────────────

function bodyGeo(): Geo {
  const NZ = 90, NR = 8;
  const rnd = rng(5);
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= NZ; j++) {
    const z = (j / NZ) * L;
    const r = rad(z / L);
    const tw = (j % 2) * (Math.PI / NR);
    for (let i = 0; i <= NR; i++) {
      const a = (i / NR) * Math.PI * 2 + tw;
      const jit = i === NR ? 0 : (rnd() - 0.5) * 0.12;
      const s = Math.sin(a);
      // a diamond cross-section with a dorsal ridge
      const rr = r * (1 + jit + (s > 0.9 ? 0.25 : 0));
      pos.push(Math.cos(a) * rr * 0.9, s * rr, z);
    }
  }
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NR; i++) {
      const a = j * (NR + 1) + i, b = a + NR + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const tube = g.toNonIndexed();
  tube.computeVertexNormals();
  const parts: Geo[] = [P(tube, ice)];
  // crystal shards along the spine
  for (let z = 0.6; z < L - 0.2; z += 0.42) {
    const u = z / L;
    const r = rad(u);
    const h = 0.25 + r * 0.9 + (u > 0.45 && u < 0.7 ? 0.25 : 0);
    const sh = new THREE.OctahedronGeometry(0.12 + r * 0.18, 0).scale(0.6, h / (0.12 + r * 0.18), 0.8).rotateX(-0.5);
    sh.translate(0, r * 1.15 + h * 0.35, z);
    parts.push(P(sh, (p) => _c.copy(MID).lerp(PALE, smooth(r, r + h, p.y) * 0.7), 0.35, 0.3));
    if (u > 0.3 && u < 0.7 && Math.round(z / 0.42) % 2 === 0)
      for (const sd of [-1, 1]) {
        const s2 = new THREE.OctahedronGeometry(0.09, 0).scale(0.6, 2.4, 0.7).rotateZ(-sd * 1.0).translate(sd * r * 0.85, r * 0.55, z);
        parts.push(P(s2, MID, 0.3));
      }
  }
  // a crystal fan at the tail tip
  for (let k = -2; k <= 2; k++) {
    const f = new THREE.OctahedronGeometry(0.16, 0).scale(0.5, 4.0 - Math.abs(k) * 0.7, 0.4).translate(0, 0.55, 0).rotateX(-Math.PI / 2 - 0.2).rotateY(k * 0.35).translate(0, 0, 0.15);
    parts.push(P(f, (p) => _c.copy(MID).lerp(PALE, smooth(-0.3, -1.4, p.z)), 0.9, 0.2));
  }
  // the crystal heart in the chest (it burns red on the wind-up)
  parts.push(P(new THREE.OctahedronGeometry(0.34, 0).scale(1, 1.4, 0.8).translate(0, -0.12, 0.6 * L), '#9ff4ff', 2.2, 1));
  return merge(parts);
}

function headGeo(): Geo {
  const parts: Geo[] = [];
  parts.push(P(ell(0.38, 0.3, 0.52, 8, 6).translate(0, 0.08, 0.2), ice));
  parts.push(P(ell(0.27, 0.19, 0.66, 8, 6).translate(0, 0.02, 0.88), ice));
  parts.push(P(ell(0.25, 0.1, 0.58, 8, 5).translate(0, -0.16, 0.72), (p, n) => _c.copy(PALE).lerp(MID, smooth(-0.5, 0.5, n.y))));
  for (const sd of [-1, 1]) {
    // horns sweeping back, a smaller pair below
    parts.push(P(cone(0.11, 1.6, 6).translate(0, 0.8, 0).rotateX(-1.95).rotateZ(-sd * 0.35).translate(sd * 0.2, 0.36, 0.1), (p) => _c.copy(MID).lerp(PALE, smooth(0.3, 1.2, -p.z)), 0.4, 0.4));
    parts.push(P(cone(0.07, 0.9, 5).translate(0, 0.45, 0).rotateX(-2.1).rotateZ(-sd * 0.9).translate(sd * 0.3, 0.05, 0.05), PALE, 0.3));
    // brow ridge and glowing eyes
    parts.push(P(ell(0.14, 0.06, 0.26, 6, 4).rotateY(sd * 0.3).translate(sd * 0.2, 0.25, 0.55), DEEP));
    parts.push(P(ell(0.09, 0.05, 0.13, 10, 8).rotateY(sd * 0.4).translate(sd * 0.23, 0.17, 0.6), '#e8ffff', 2.8, 1));
    // the sewn jaw: a seam with stitches
    const seam = new THREE.CatmullRomCurve3([V(sd * 0.27, -0.07, 0.4), V(sd * 0.24, -0.09, 0.85), V(sd * 0.12, -0.08, 1.3)]);
    parts.push(P(new THREE.TubeGeometry(seam, 10, 0.014, 4, false), '#0b1640', 0, 0.6));
    for (let k = 0; k < 3; k++) {
      const q = seam.getPointAt(0.15 + k * 0.3);
      parts.push(P(capsule(0.012, 0.1, 2, 4).translate(q.x, q.y, q.z), '#0b1640', 0, 1));
    }
    // cheek shards
    parts.push(P(new THREE.OctahedronGeometry(0.07, 0).scale(0.6, 2.6, 0.6).rotateZ(-sd * 1.3).rotateY(sd * 0.4).translate(sd * 0.42, -0.02, 0.2), PALE, 0.5));
  }
  // crest of shards along the skull
  for (let k = 0; k < 4; k++) parts.push(P(new THREE.OctahedronGeometry(0.08, 0).scale(0.6, 3 - k * 0.4, 0.8).rotateX(-0.9).translate(0, 0.38 - k * 0.04, 0.35 - k * 0.25), PALE, 0.6));
  parts.push(xStitch(0.26, 0.022, '#0b1640', 0, 1).translate(0, -0.06, 1.5));
  return merge(parts);
}

/** a folded leg with crystal claws (bone-local) */
function legGeo(sd: number, big: boolean): Geo {
  const k = big ? 1.25 : 1;
  const parts: Geo[] = [];
  parts.push(P(capsule(0.16 * k, 0.7 * k, 3, 6).translate(0, -0.35 * k, 0).rotateX(big ? 0.9 : -0.6), ice));
  const knee = big ? V(0, -0.55 * k, 0.55 * k) : V(0, -0.5 * k, -0.4 * k);
  parts.push(P(capsule(0.12 * k, 0.65 * k, 3, 6).translate(0, -0.32 * k, 0).rotateX(big ? -0.7 : 0.9).translate(knee.x, knee.y, knee.z), ice));
  const foot = knee.clone().add(big ? V(0, -0.5 * k, -0.4 * k) : V(0, -0.45 * k, 0.5 * k));
  for (let c = -1; c <= 1; c++) parts.push(P(cone(0.05 * k, 0.32 * k, 5).rotateX(Math.PI / 2 + 0.5).rotateY(c * 0.35).translate(foot.x + c * 0.07, foot.y, foot.z + 0.1), PALE, 0.4));
  const g = merge(parts);
  g.translate(sd * 0.42, -0.25, 0);
  return g;
}

// ───────────────────────────── aurora ribbons ─────────────────────────────

function auroraMat(u: LU, hue: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uTime: u.uTime, uBeat: u.uBeat, uTell: u.uTell, uAppear: u.uAppear, uPhase: u.uPhase,
      uHue: { value: hue }, uSplit: { value: 0 }, uGain: { value: 1 }, uWave: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aR; // ribbon id, along (0 root … 1 tip), across (0 … 1), length
      uniform float uTime; uniform float uWave; varying vec3 vR; varying float vId;
      void main(){
        vec3 p = position;
        float v = aR.y;
        float ph = aR.x * 1.7;
        // the curtain ripples and streams back like a flag in the wind
        p.x += sin(v * 4.0 - uTime * 2.2 + ph) * 0.35 * v * uWave;
        p.z += (sin(v * 3.0 - uTime * 1.6 + ph * 1.3) * 0.3 - 0.25) * v * uWave;
        p.y += sin(aR.z * 6.0 + uTime * 1.3 + ph) * 0.06 * v;
        vR = aR.xyz; vId = aR.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uTell; uniform float uAppear; uniform float uPhase; uniform float uHue; uniform float uSplit; uniform float uGain;
      varying vec3 vR; varying float vId;
      ${NOISE}
      vec3 aurora(float h){
        h = fract(h);
        vec3 c1 = vec3(0.0, 0.72, 1.0), c2 = vec3(0.05, 0.95, 0.35), c3 = vec3(0.58, 0.08, 1.0);
        return h < 0.333 ? mix(c1, c2, h * 3.0) : h < 0.666 ? mix(c2, c3, h * 3.0 - 1.0) : mix(c3, c1, h * 3.0 - 2.0);
      }
      void main(){
        float v = vR.y, w = vR.z;
        // vertical rays drifting sideways, the folds of a curtain
        float rays = lN(vec3(w * 9.0 + vId * 3.1 - uTime * 0.6, v * 1.5 - uTime * 0.3, vId));
        rays = 0.55 + 0.45 * smoothstep(0.25, 0.85, rays);
        float fine = 0.75 + 0.25 * sin(w * 60.0 + uTime * 2.0 + vId * 5.0);
        // bright at the spar, fading to the tip; soft edges
        float a = (1.0 - smoothstep(0.55, 1.0, v)) * smoothstep(0.0, 0.08, v) * smoothstep(0.0, 0.18, w) * smoothstep(1.0, 0.82, w);
        float edge = exp(-v * 6.0) * 0.9;
        // the split (phase 2): the curtain tears into strands
        float strand = smoothstep(0.35, 0.55, abs(fract(w * 3.0 + vId * 0.37) - 0.5) * 2.0);
        a *= mix(1.0, strand, uSplit);
        vec3 c = aurora(uHue + v * 0.55 + uTime * 0.07 + vId * 0.06);
        c = mix(c, vec3(1.0, 0.18, 0.08), uTell * 0.85);
        float I = (rays * fine + edge) * (0.8 + uBeat * 0.45);
        c *= 0.75 + 0.45 * I * uGain;
        gl_FragColor = vec4(c, clamp(a * (0.3 + I * 0.75) * uGain, 0.0, 0.95) * uAppear);
      }`,
  });
}

interface Wing {
  sd: number;
  root: THREE.Group;
  fore: THREE.Group;
  mats: THREE.ShaderMaterial[];
  scale: number;
}

function buildWing(sd: number, scale: number, sparMat: THREE.Material, ribbon: THREE.ShaderMaterial, id0: number): Wing {
  const root = new THREE.Group();
  const fore = new THREE.Group();
  // the arm: shoulder → elbow along +x (mirrored for the left)
  const elbow = V(2.0 * sd, 0.35, -0.2);
  fore.position.copy(elbow);
  root.add(fore);
  const spar = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const d = b.clone().sub(a);
    const g = cone(r, d.length(), 6).translate(0, d.length() / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()));
    return P(g.translate(a.x, a.y, a.z), (p) => _c.copy(MID).lerp(PALE, 0.5), 0.5, 0.2);
  };
  // humerus (with a knuckle shard)
  const hum = merge([spar(V(0, 0, 0), elbow, 0.16), P(new THREE.OctahedronGeometry(0.2, 0).scale(1, 1.6, 1).translate(elbow.x, elbow.y + 0.15, elbow.z), PALE, 0.8)]);
  root.add(new THREE.Mesh(hum, sparMat));
  // forearm and three fingers fanning back
  const wrist = V(2.3 * sd, 0.55, 0.25);
  const tips = [V(4.4 * sd, 0.9, -0.6), V(3.6 * sd, 0.2, -1.7), V(2.2 * sd, -0.2, -2.3)];
  const fg = [spar(V(0, 0, 0), wrist, 0.12), ...tips.map((t) => spar(wrist, t, 0.08)), P(new THREE.OctahedronGeometry(0.15, 0).scale(1, 1.8, 1).translate(wrist.x, wrist.y + 0.12, wrist.z), PALE, 0.8)];
  for (const t of tips) fg.push(P(new THREE.OctahedronGeometry(0.12, 0).scale(1, 2.2, 1).translate(t.x, t.y, t.z), PALE, 1.0, 0.5));
  fore.add(new THREE.Mesh(merge(fg), sparMat));
  // the aurora: curtains hanging from the arm and from each finger, streaming down and back
  const down = V(0.1 * sd, -1, -0.35).normalize();
  const inner = new THREE.Mesh(curtain(V(0, 0, 0), elbow, down, 4, (k) => 2.6 + k * 0.6, id0), ribbon);
  root.add(inner);
  const outerG: Geo[] = [curtain(V(0, 0, 0), wrist, down, 3, (k) => 3.2 + k * 0.3, id0 + 4)];
  tips.forEach((t, i) => outerG.push(curtain(wrist, t, down, 4, (k) => 3.6 - i * 0.4 - k * 0.5, id0 + 7 + i * 4)));
  const og = mergeAR(outerG);
  const outer = new THREE.Mesh(og, ribbon);
  fore.add(outer);
  for (const m of [inner, outer]) {
    m.frustumCulled = false;
    m.renderOrder = 6;
  }
  root.scale.setScalar(scale);
  return { sd, root, fore, mats: [ribbon], scale };
}

// ───────────────────────────── the dragon ─────────────────────────────

export function auroraRig(): Rig {
  const u = legendUniforms(new THREE.Color('#9feaff').multiplyScalar(0.38), '#8fe2ff');
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(1.15);
  const mat = legendMat(u, {
    rough: 0.18,
    metal: 0.15,
    flat: true,
    key: 'aurora',
    emissive: /* glsl */ `
      { // glowing veins inside the ice, pulsing on the beat
        float n = lN(vObj * vec3(2.2, 2.2, 0.9) + vec3(0.0, 0.0, -uTime * 0.25));
        float vein = smoothstep(0.035, 0.0, abs(n - 0.5)) * step(vGlow, 0.01);
        vec3 vc = mix(vec3(0.3, 0.95, 1.0), vec3(0.55, 1.0, 0.6), lN(vObj * 0.5 + uTime * 0.1));
        vc = mix(vc, vec3(0.75, 0.4, 1.0), clamp(uPhase - 1.0, 0.0, 1.0) * 0.4);
        totalEmissiveRadiance += mix(vc, uTellCol, uTell * 0.7) * vein * (0.35 + 1.4 * uBeat) * uK;
        totalEmissiveRadiance += vec3(0.02, 0.07, 0.16) * uK;
      }`,
  });
  u.uK.value = 1;
  const spine = new Spine(bodyGeo(), NB, L, mat);
  body.add(spine.mesh);
  const head = new THREE.Mesh(headGeo(), mat);
  head.scale.setScalar(1.35);
  head.castShadow = true;
  spine.bones[NB - 1].add(head);
  const fi = Math.round(0.6 * (NB - 1)), hi = Math.round(0.34 * (NB - 1));
  for (const sd of [-1, 1]) {
    spine.bones[fi].add(new THREE.Mesh(legGeo(sd, false), mat));
    spine.bones[hi].add(new THREE.Mesh(legGeo(sd, true), mat));
  }
  // ── wings: two pairs (the second appears when the aurora splits)
  const wings: Wing[] = [];
  const auroraMats: THREE.ShaderMaterial[] = [];
  const wi = Math.round(0.63 * (NB - 1));
  for (const pair of [0, 1]) {
    const am = auroraMat(u, pair ? 0.62 : 0.0);
    auroraMats.push(am);
    for (const sd of [-1, 1]) {
      const w = buildWing(sd, pair ? 0.72 : 1.0, mat, am, pair * 40 + (sd > 0 ? 20 : 0));
      const holder = new THREE.Group();
      holder.position.set(sd * 0.45, pair ? -0.1 : 0.35, pair ? -0.9 : 0);
      holder.add(w.root);
      spine.bones[pair ? wi - 2 : wi].add(holder);
      if (pair) holder.visible = false;
      wings.push(w);
    }
  }
  // ── the sky-wide curtain (phase 3)
  const skyMat = auroraMat(u, 0.2);
  skyMat.uniforms.uWave.value = 2.5;
  auroraMats.push(skyMat);
  const sky = new THREE.Mesh(
    (() => {
      // a wide arc of curtains behind and above the dragon
      const n = 26;
      const pts: Geo[] = [];
      for (let k = 0; k < n; k++) {
        const a0 = Math.PI + 0.35 + (k / n) * (Math.PI - 0.7), a1 = Math.PI + 0.35 + ((k + 1.1) / n) * (Math.PI - 0.7);
        const R = 13;
        pts.push(curtain(V(Math.cos(a0) * R, 12.5, Math.sin(a0) * R), V(Math.cos(a1) * R, 12.5, Math.sin(a1) * R), V(0, -1, 0.15).normalize(), 1, () => 9 + Math.sin(k * 1.3) * 1.5, 100 + k));
      }
      return mergeAR(pts);
    })(),
    skyMat,
  );
  sky.frustumCulled = false;
  sky.renderOrder = 2;
  sky.visible = false;
  root.add(sky);
  // ── orbiting shards
  const NS = 22;
  const shardGeo = P(new THREE.OctahedronGeometry(0.2, 0).scale(0.7, 2.6, 0.7), (p) => _c.copy(MID).lerp(PALE, smooth(-0.3, 0.5, p.y) * 0.6), 0.45, 1);
  const shards = new THREE.InstancedMesh(shardGeo, mat, NS);
  shards.frustumCulled = false;
  root.add(shards);
  const rnd = rng(77);
  const shardD = Array.from({ length: NS }, (_, i) => ({ a: (i / NS) * Math.PI * 2, r: 3.6 + rnd() * 1.4, y: 3.4 + (rnd() - 0.5) * 2.4, s: 0.7 + rnd() * 0.7, sp: 0.35 + rnd() * 0.3, tilt: (rnd() - 0.5) * 0.6 }));
  // ── frost sparkles
  const NP = 90;
  const gp = new GlowPoints(NP, { star: true, soft: 2.2 });
  root.add(gp.points);
  const sparkD = Array.from({ length: NP }, () => ({ x: (rnd() - 0.5) * 10, y: rnd() * 8, z: (rnd() - 0.5) * 9, s: rnd(), w: 1 + rnd() * 3 }));
  const SPK = new THREE.Color('#d8fbff');

  const ctrl = Array.from({ length: 10 }, () => new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const up = V(0, 1, 0);
  const hf: Frame = newFrame();
  const cf: Frame = newFrame();
  const strikeAt = new THREE.Vector3();
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), T3 = new THREE.Vector3(), E = new THREE.Euler();
  let phase = 1;

  const rig: Rig = {
    root,
    u,
    height: 6.4 * 1.15,
    strikeAt,
    enterDur: 4.2,
    phaseDur: 2.4,
    setPhase(n) {
      phase = n;
    },
    update(s: ActS) {
      const { t, beat } = s;
      const split = clamp01(s.phase - 1), open = clamp01(s.phase - 2);
      const w = s.windup * s.telling, st = s.strike, rc = s.recoil, sg = s.stagger, sm = s.summon;
      // one wing beat every two beats: the downstroke lands on the beat
      const fl = Math.cos(beat * Math.PI);
      const bob = -fl * 0.18;
      // ── spine path (tail → head)
      const lean = -w * 0.6 + st * 0.45 - rc * 0.35;
      const by = 3.3 + bob - sg * 0.8;
      const tailSw = (k: number) => Math.sin(k * 1.1 - t * 1.8) * 0.35 * (1 - k / 6) * (1 + sg);
      const pts: [number, number, number][] = [
        [tailSw(0) * 1.6, 1.4 - w * 0.6, -6.2],
        [tailSw(1) * 1.3, 1.9 - w * 0.4, -5.0],
        [tailSw(2), 2.55, -3.8],
        [tailSw(3) * 0.6, 3.0, -2.6],
        [0, by, -1.4 - w * 0.2],
        [0, by + 0.05, -0.2],
        [0, by + 0.15 - lean * 0.5, 1.0 + st * 0.5],
        [Math.sin(beat * Math.PI * 0.5) * 0.2, by + 0.75 - lean * 1.2 + rc * 0.3, 1.8 - w * 0.6 + st * 1.6 - rc * 0.5],
        [Math.sin(beat * Math.PI * 0.5) * 0.35, by + 1.6 + w * 0.7 - st * 1.1 + rc * 0.6 - sg * 1.0 + sm * 0.5, 2.1 - w * 1.2 + st * 3.0 - rc * 1.2],
        [Math.sin(beat * Math.PI * 0.5) * 0.4 + Math.sin(s.staggerAge * 5) * 0.5 * sg, by + 2.0 + w * 1.1 - st * 1.6 + rc * 0.9 - sg * 1.4 + sm * 0.8, 2.95 - w * 1.4 + st * 4.0 - rc * 1.6],
      ];
      pts.forEach((p, i) => ctrl[i].set(p[0], p[1], p[2]));
      curve.updateArcLengths();
      up.set(0, 1, -0.2 - w * 0.5 + st * 0.6).normalize();
      spine.pose(curve, up, (q) => 1 + (q > 0.5 && q < 0.7 ? s.pulse * 0.04 : 0));
      spine.frame(1, hf);
      // ── whole body: entrance (dives down from high above), phase flourish (a roll), sink
      const e = 1 - s.enter;
      const fx = s.phaseFx;
      body.position.set(0, e * e * 16 - s.sink * 7, -e * e * 8);
      body.rotation.set(-e * 0.6, 0, fx >= 0 ? Math.sin(fx * Math.PI) * 0.35 : 0);
      body.updateMatrix();
      strikeAt.copy(hf.p).addScaledVector(hf.t, 1.6).applyMatrix4(body.matrix);
      // ── wings
      const spreadZ = 0.15 + open * 0.25;
      wings.forEach((wg, i) => {
        const pair = i >> 1;
        const flap = pair ? Math.cos(beat * Math.PI + 0.9) : fl;
        // lift (around the body axis), sweep (forward/back), fold of the outer wing
        let lift = 0.35 + flap * 0.5 + open * 0.15;
        let sweep = -0.1 + open * 0.1;
        let fold = 0.25 - open * 0.25 + Math.max(0, -flap) * 0.2;
        lift += w * 0.6 - st * 0.9 + rc * 0.5 + sm * 0.4 - sg * 0.6;
        sweep += w * 0.5 + st * 0.6 - rc * 0.3;
        fold += w * 0.5 - st * 0.2 + sg * 0.6;
        wg.root.rotation.set(sweep * 0.6, wg.sd * -sweep, wg.sd * lift, 'YXZ');
        wg.fore.rotation.set(0, wg.sd * fold * 0.8, wg.sd * (spreadZ - fold * 0.5));
        const sc = wg.scale * (1 + open * 0.3);
        wg.root.scale.setScalar(sc);
        if (pair) {
          const on = smooth(0, 1, split * 1.3);
          (wg.root.parent as THREE.Object3D).visible = on > 0.01;
          wg.root.scale.setScalar(sc * Math.max(0.01, on));
        }
      });
      auroraMats.forEach((m, i) => {
        m.uniforms.uSplit.value = i < 2 ? split * 0.75 : 0;
        m.uniforms.uGain.value = i === 2 ? smooth(0, 1, open) * 0.8 : 1 + open * 0.5 + sm * 0.8 + (fx >= 0 ? Math.sin(fx * Math.PI) * 1.2 : 0);
      });
      sky.visible = open > 0.01;
      sky.position.copy(body.position);
      // ── shards: orbit; gather in front of the chest on the wind-up; volley on the blow
      spine.frame(0.62, cf);
      for (let i = 0; i < NS; i++) {
        const d = shardD[i];
        const a = d.a + t * d.sp * (1 + sm * 2);
        let x = Math.cos(a) * d.r, z = Math.sin(a) * d.r * 0.8 - 0.5, y = d.y + Math.sin(t * 0.9 + i) * 0.25 + Math.sin(a * 2) * d.tilt;
        const g = smooth(0, 1, w * 1.3);
        if (g > 0) {
          const ga = (i / NS) * Math.PI * 2 + t * 2;
          x += (Math.cos(ga) * 1.6 - x) * g;
          y += (cf.p.y + 0.5 + Math.sin(ga) * 1.6 - y) * g;
          z += (cf.p.z + 2.6 - z) * g;
        }
        if (s.blowAge < 1.2) {
          const k = smooth(0, 0.18, s.blowAge) * (1 - smooth(0.4, 1.2, s.blowAge));
          x += (strikeAt.x + (i % 5 - 2) * 0.4 - x) * k;
          y += (strikeAt.y - 1.5 + ((i * 7) % 5) * 0.3 - y) * k;
          z += (strikeAt.z + 2.5 + (i % 3) - z) * k;
        }
        y += (body.position.y) - s.sink * 0;
        const scl = d.s * (1 + s.pulse * 0.15) * (1 + open * 0.3);
        E.set(t * d.sp * 2 + i, a, 0.3 + g * 1.2);
        Q.setFromEuler(E);
        if (g > 0.5 || s.blowAge < 0.8) Q.setFromUnitVectors(V(0, 1, 0), T3.set(0, -0.1, 1).normalize());
        M.compose(T3.set(x, y, z + body.position.z), Q, S3.setScalar(scl * u.uAppear.value));
        shards.setMatrixAt(i, M);
      }
      shards.instanceMatrix.needsUpdate = true;
      // ── glow and sparkles
      u.uGlow.value.set(0.9 + sm + open * 0.5 + (fx >= 0 ? Math.sin(fx * Math.PI) * 1.5 : 0), 0.7);
      u.uK.value = 1 - sg * 0.6;
      for (let i = 0; i < NP; i++) {
        const d = sparkD[i];
        const tw = Math.max(0, Math.sin(t * d.w + d.s * 30));
        const yy = (d.y - t * 0.3 * (0.3 + d.s)) % 8;
        _c.copy(SPK).multiplyScalar(0.6 + tw * 1.4 + open);
        gp.set(i, d.x * (1 + open * 0.4), (yy < 0 ? yy + 8 : yy) + body.position.y, d.z + body.position.z, 0.1 + d.s * 0.12, tw * u.uAppear.value, _c);
      }
      gp.mat.uniforms.uClipY.value = u.uClipY.value;
      gp.commit();
      void phase;
    },
    dispose() {
      for (const m of auroraMats) m.dispose();
      gp.mat.dispose();
      gp.points.geometry.dispose();
    },
  };
  return rig;
}
