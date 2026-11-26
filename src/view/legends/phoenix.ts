/**
 * Fênix Negra (forge secret path): a black-ink phoenix with lava veins pulsing on the beat, a crest of
 * flame feathers, a sewn beak, great black wings whose feathers burn at the edges, and long burning
 * tail plumes (a fire ribbon shader) streaming behind it; embers rise all around.
 *   phase 2: it DIES AND IS REBORN: it burns down into an ember egg, the egg bursts, and it rises again
 *            brighter, with a white-hot core shining through its chest
 *   phase 3: wings of fire: every feather burns, flame curtains stream from the wings
 */
import * as THREE from 'three';
import { capsule, clamp01, cone, sph } from '../kit';
import { ell } from '../musicians';
import { type ActS, type Geo, GlowPoints, type LU, NOISE, P, type Rig, V, curtain, glowAlong, legendMat, legendUniforms, merge, mergeAR, rng, smooth, xStitch } from './common';

const _c = new THREE.Color();
const INK = new THREE.Color('#0b0709'), INK2 = new THREE.Color('#24141a'), EMBER = new THREE.Color('#ff6a2a'), HOT = new THREE.Color('#ffd27a');

const inkPaint = (p: THREE.Vector3, n: THREE.Vector3) => _c.copy(INK).lerp(INK2, smooth(-0.2, 0.8, n.y) * 0.7);

// ───────────────────────────── shapes ─────────────────────────────

/** a feather blade lying in the xz plane, root at the origin, pointing −z (length len, width w) */
function feather(len: number, w: number, burn = 0.35): Geo {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.15, 0);
  s.bezierCurveTo(-w * 0.6, len * 0.3, -w * 0.55, len * 0.8, 0, len);
  s.bezierCurveTo(w * 0.45, len * 0.75, w * 0.5, len * 0.3, w * 0.15, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(Math.PI / 2); // shape y → −z
  const out = P(g, (p) => _c.copy(INK).lerp(INK2, smooth(0, len, -p.z) * 0.5).lerp(EMBER, smooth(len * (1 - burn), len, -p.z)), 1.4, 0.4);
  glowAlong(out, (p) => smooth(len * (1 - burn * 1.1), len, -p.z));
  return out;
}

function bodyGeo(): Geo {
  const parts: Geo[] = [];
  // torso: a deep chest tilted forward
  parts.push(P(ell(0.66, 0.85, 1.25, 26, 18).rotateX(0.45).translate(0, 0, 0.05), inkPaint));
  parts.push(P(ell(0.6, 0.62, 0.7, 20, 14).translate(0, -0.35, -0.85), inkPaint));
  // breast feathers: overlapping scales
  for (let r = 0; r < 4; r++)
    for (let k = -2; k <= 2; k++) {
      const f = ell(0.2, 0.05, 0.3, 8, 4).rotateX(-0.9).translate(k * 0.24 + (r % 2) * 0.12, 0.35 - r * 0.32, 1.0 - r * 0.08 - Math.abs(k) * 0.12);
      parts.push(P(f, (p) => _c.copy(INK2).lerp(EMBER, 0.08)));
    }
  // the neck: an S rising to the head
  const neck = new THREE.CatmullRomCurve3([V(0, 0.5, 0.7), V(0, 1.15, 1.0), V(0, 1.7, 0.95), V(0, 2.05, 1.25)]);
  const ng = new THREE.TubeGeometry(neck, 20, 0.3, 12, false);
  const np = ng.attributes.position, uv = ng.attributes.uv;
  for (let i = 0; i < np.count; i++) {
    const t = uv.getX(i);
    const c = neck.getPointAt(t);
    const k = 1 - t * 0.35;
    np.setXYZ(i, c.x + (np.getX(i) - c.x) * k, c.y + (np.getY(i) - c.y) * k, c.z + (np.getZ(i) - c.z) * k);
  }
  ng.computeVertexNormals();
  parts.push(P(ng, inkPaint));
  // the white-hot core (dim in phase 1; visible through a crack in the chest)
  parts.push(P(sph(0.34, 18, 12).translate(0, 0.1, 0.62), '#fff1c8', 1.2, 1));
  return merge(parts);
}

function headGeo(): Geo {
  const parts: Geo[] = [];
  parts.push(P(ell(0.3, 0.3, 0.36, 18, 14).translate(0, 0, 0), inkPaint));
  // the beak: upper and lower, sewn together
  parts.push(P(cone(0.13, 0.7, 8).rotateX(Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.0, 0.58), (p) => _c.set('#1b1214').lerp(new THREE.Color('#5a2a1e'), smooth(0.3, 0.9, p.z))));
  parts.push(P(cone(0.09, 0.5, 8).rotateX(Math.PI / 2).scale(1, 0.6, 1).translate(0, -0.11, 0.48), '#120a0c'));
  parts.push(xStitch(0.16, 0.016, '#ffb070', 0.6, 1).rotateY(Math.PI / 2).translate(0.1, -0.06, 0.5));
  parts.push(xStitch(0.16, 0.016, '#ffb070', 0.6, 1).rotateY(-Math.PI / 2).translate(-0.1, -0.06, 0.5));
  parts.push(xStitch(0.14, 0.015, '#ffb070', 0.6, 1).translate(0, -0.06, 0.86));
  for (const sd of [-1, 1]) {
    // white-hot eyes with a dark ring
    parts.push(P(sph(0.075, 12, 10).translate(sd * 0.2, 0.08, 0.2), '#fff4d0', 3.0, 1));
    parts.push(P(new THREE.TorusGeometry(0.085, 0.02, 5, 14).rotateY(sd * 1.1).translate(sd * 0.21, 0.08, 0.2), '#2a1010'));
  }
  // the crest: flame feathers sweeping back
  for (let k = 0; k < 5; k++) {
    const len = 1.0 + (k === 2 ? 0.5 : k === 1 || k === 3 ? 0.25 : 0);
    const f = feather(len, 0.28, 0.7);
    f.rotateX(-0.55 - k * 0.05).rotateY(Math.PI + (k - 2) * 0.28);
    f.translate((k - 2) * 0.05, 0.2, -0.05);
    parts.push(f);
  }
  return merge(parts);
}

/** fire ribbons: additive curtains, white-yellow at the root → orange → red → smoke */
function fireMat(u: LU) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uTime: u.uTime, uBeat: u.uBeat, uTell: u.uTell, uAppear: u.uAppear, uHeat: { value: 1 }, uGain: { value: 1 }, uWave: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aR; uniform float uTime; uniform float uWave; varying vec3 vR;
      void main(){
        vec3 p = position; float v = aR.y; float ph = aR.x * 2.3;
        p.x += sin(v * 5.0 - uTime * 4.0 + ph) * 0.3 * v * uWave;
        p.y += (sin(v * 4.0 - uTime * 3.3 + ph) * 0.35 + 0.25) * v * uWave;
        vR = aR.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uTell; uniform float uAppear; uniform float uHeat; uniform float uGain; varying vec3 vR;
      ${NOISE}
      void main(){
        float v = vR.y, w = vR.z;
        float n = lF(vec3(w * 3.0 + vR.x * 1.7, v * 4.0 - uTime * 3.2, vR.x));
        float body = smoothstep(0.0, 0.25, w) * smoothstep(1.0, 0.75, w);
        float flame = smoothstep(0.32 + v * 0.4, 0.62 + v * 0.4, n + (1.0 - v) * 0.22) * body;
        vec3 c = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.32, 0.05), smoothstep(0.0, 0.25, v));
        c = mix(c, vec3(0.75, 0.12, 0.05), smoothstep(0.35, 0.8, v));
        c = mix(c, vec3(1.0, 1.0, 0.9), clamp(uHeat - 1.0, 0.0, 1.0) * (1.0 - v) * 0.5);
        c = mix(c, vec3(1.0, 0.15, 0.08), uTell * 0.5);
        float a = flame * (1.0 - smoothstep(0.7, 1.0, v)) * (0.8 + uBeat * 0.5) * uGain;
        gl_FragColor = vec4(c * a * uAppear * 0.95, 1.0);
      }`,
  });
}

interface Wing {
  sd: number;
  root: THREE.Group;
  hand: THREE.Group;
  tip: THREE.Object3D;
}

function buildWing(sd: number, inkMat: THREE.Material, featherMat: THREE.Material): Wing {
  const root = new THREE.Group();
  const hand = new THREE.Group();
  const elbow = V(2.1 * sd, 0.25, 0.05);
  hand.position.copy(elbow);
  root.add(hand);
  const arm = merge([P(capsule(0.17, 2.0, 3, 8).rotateZ(Math.PI / 2).translate(sd * 1.0, 0.12, 0), inkPaint), P(ell(0.45, 0.32, 0.5, 14, 10).translate(sd * 0.3, 0.05, 0), inkPaint)]);
  const am = new THREE.Mesh(arm, inkMat);
  am.castShadow = true;
  root.add(am);
  // secondaries along the arm, coverts above
  const sec: Geo[] = [];
  for (let k = 0; k < 9; k++) {
    const x = (0.25 + k * 0.22) * sd;
    const f = feather(1.9 + k * 0.05, 0.62).rotateY(sd * (0.08 * k - 0.1)).rotateX(-0.18).translate(x, 0.02 - k * 0.01, 0.05);
    sec.push(f);
    sec.push(feather(1.05, 0.5, 0.2).rotateX(-0.08).rotateY(sd * 0.05 * k).translate(x + sd * 0.1, 0.12, 0.12));
  }
  const sm = new THREE.Mesh(merge(sec), featherMat);
  sm.castShadow = true;
  root.add(sm);
  // the hand and the primaries fanning out
  const prim: Geo[] = [P(capsule(0.13, 1.8, 3, 8).rotateZ(Math.PI / 2).translate(sd * 0.9, 0.08, 0.05), inkPaint)];
  for (let k = 0; k < 10; k++) {
    const q = k / 9;
    const len = 2.1 + q * 1.3;
    const f = feather(len, 0.66).rotateX(-0.12).rotateY(sd * (0.15 + q * 1.15));
    f.translate(sd * (0.15 + q * 1.75), 0.06 + q * 0.06, 0.05 + q * 0.12);
    prim.push(f);
  }
  const pm = new THREE.Mesh(merge(prim), featherMat);
  pm.castShadow = true;
  hand.add(pm);
  // the wing tip (embers stream from it in phase 3)
  const tip = new THREE.Object3D();
  tip.position.set(sd * 3.4, 0.2, -1.2);
  hand.add(tip);
  return { sd, root, hand, tip };
}

// ───────────────────────────── the phoenix ─────────────────────────────

export function phoenixRig(): Rig {
  const u = legendUniforms(new THREE.Color('#ff7a3a').multiplyScalar(0.3), '#ffb347');
  u.uTellCol.value.set('#ff3020');
  const root = new THREE.Group();
  const fly = new THREE.Group(); // hover, entrance, sink
  root.add(fly);
  root.scale.setScalar(1.25);
  const body = new THREE.Group(); // the bird (rebirth scales it)
  fly.add(body);
  const LAVA = /* glsl */ `
    { // lava veins: cracks in the ink that glow, brighter after the rebirth
      float n = lN(vObj * 2.4 + vec3(0.0, -uTime * 0.15, 0.0));
      float m = lN(vObj * 5.3 + 3.0);
      float heat = uK;
      float cw = 0.035 + 0.025 * clamp(heat - 1.0, 0.0, 1.0);
      float crack = smoothstep(cw, 0.0, abs(n - 0.5)) + smoothstep(cw * 0.7, 0.0, abs(m - 0.5)) * 0.6;
      vec3 lava = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.75, 0.3), clamp(heat - 1.0, 0.0, 1.0));
      lava = mix(lava, vec3(1.0, 0.95, 0.85), clamp(heat - 1.6, 0.0, 1.0));
      totalEmissiveRadiance += mix(lava, uTellCol * 1.3, uTell * 0.6) * crack * (0.5 + 1.6 * uBeat) * heat * step(vGlow, 0.01);
    }`;
  const inkMat = legendMat(u, { rough: 0.35, metal: 0.2, key: 'phoenix-ink', emissive: LAVA });
  const featherMat = legendMat(u, {
    rough: 0.45,
    metal: 0.1,
    side: THREE.DoubleSide,
    key: 'phoenix-feather',
    emissive: /* glsl */ `
      { // wings of fire (phase 3): the whole feather burns, flickering from the root to the tip
        float f = lF(vec3(vObj.x * 2.0, vObj.z * 2.5 + uTime * 3.0, vObj.y * 2.0));
        vec3 fire = mix(vec3(0.9, 0.12, 0.02), vec3(1.0, 0.55, 0.12), f * f);
        float tip = smoothstep(0.0, 2.5, length(vObj.xz));
        totalEmissiveRadiance += fire * uK2 * (0.35 + 0.8 * f) * (0.75 + uBeat * 0.5) * (0.6 + tip * 0.6);
      }`,
  });
  u.uK.value = 1;
  const tailFire = fireMat(u);
  const mats: THREE.Material[] = [inkMat, featherMat, tailFire];
  // ── body, head
  const torso = new THREE.Mesh(bodyGeo(), inkMat);
  torso.castShadow = true;
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 2.1, 1.3);
  body.add(head);
  const hm = new THREE.Mesh(headGeo(), inkMat);
  hm.castShadow = true;
  head.add(hm);
  hm.scale.setScalar(1.5);
  // ── wings
  const wings: Wing[] = [];
  for (const sd of [-1, 1]) {
    const w = buildWing(sd, inkMat, featherMat);
    w.root.position.set(sd * 0.55, 0.5, 0.25);
    body.add(w.root);
    wings.push(w);
  }
  // ── tail: black plumes and long burning trails
  const tail = new THREE.Group();
  tail.position.set(0, -0.35, -1.25);
  body.add(tail);
  {
    const tf: Geo[] = [];
    for (let k = -3; k <= 3; k++) {
      const len = 2.6 - Math.abs(k) * 0.25;
      tf.push(feather(len, 0.5, 0.45).rotateX(-0.35).rotateY(k * 0.16).translate(k * 0.06, 0, 0));
    }
    const tm = new THREE.Mesh(merge(tf), featherMat);
    tm.castShadow = true;
    tail.add(tm);
    const strips: Geo[] = [];
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.22;
      const dir = V(Math.sin(a) * 0.6, -0.42, -1).normalize();
      strips.push(curtain(V(Math.sin(a) * 1.2 - 0.4, 0, -Math.cos(a) * 1.6), V(Math.sin(a) * 1.2 + 0.4, 0, -Math.cos(a) * 1.6), dir, 1, () => 7.5 - Math.abs(k - 2) * 1.0, 30 + k));
    }
    const trails = new THREE.Mesh(mergeAR(strips), tailFire);
    trails.frustumCulled = false;
    trails.renderOrder = 7;
    tail.add(trails);
  }
  // ── the white-hot core shining through the chest (phase 2+)
  const core = new GlowPoints(3, { soft: 1.3 });
  core.points.renderOrder = 9;
  body.add(core.points);
  const CORE = new THREE.Color('#fff2d0'), CORE2 = new THREE.Color('#ffb060');
  // ── the ember egg (rebirth)
  const eggMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb060').multiplyScalar(2.2), transparent: true, opacity: 1, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
  mats.push(eggMat);
  const egg = new THREE.Mesh(sph(1, 28, 20).scale(0.8, 1.0, 0.8), eggMat);
  egg.visible = false;
  fly.add(egg);
  // ── embers
  const NE = 170;
  const gp = new GlowPoints(NE, { soft: 1.6 });
  fly.add(gp.points);
  const rnd = rng(41);
  const emb = Array.from({ length: NE }, () => ({ x: (rnd() - 0.5) * 7, z: (rnd() - 0.5) * 5 - 1, h: rnd(), s: 0.5 + rnd(), w: rnd() * 6.28, a: rnd() * 6.28, r: 1 + rnd() * 4 }));
  const C1 = new THREE.Color('#ffb347'), C2 = new THREE.Color('#ff5a1a'), C3 = new THREE.Color('#fff0c0');

  const strikeAt = new THREE.Vector3();
  const tips = [new THREE.Vector3(), new THREE.Vector3()];
  let rebirth = false;
  let lastPhase = 1;

  const rig: Rig = {
    root,
    u,
    height: 7.0 * 1.25,
    strikeAt,
    enterDur: 3.6,
    phaseDur: 3.4,
    setPhase(n) {
      if (n === 2 && lastPhase === 1) rebirth = true;
      if (n !== 2) rebirth = false;
      lastPhase = n;
    },
    update(s: ActS) {
      const { t, beat } = s;
      const ph2 = clamp01(s.phase - 1), ph3 = clamp01(s.phase - 2);
      const w = s.windup * s.telling, st = s.strike, rc = s.recoil, sg = s.stagger, sm = s.summon;
      const fx = s.phaseFx;
      // ── rebirth: burns down (0–.3), an ember egg (.3–.55), bursts and rises again (.55–1)
      let bodyK = 1, eggK = 0, burst = 0;
      if (fx >= 0 && rebirth) {
        bodyK = fx < 0.3 ? 1 - smooth(0.05, 0.3, fx) : fx < 0.55 ? 0 : smooth(0.55, 0.85, fx) * (1 + 0.15 * Math.sin(smooth(0.55, 1, fx) * Math.PI));
        eggK = smooth(0.15, 0.32, fx) * (1 - smooth(0.52, 0.6, fx));
        burst = fx > 0.55 ? 1 - smooth(0.55, 0.9, fx) : 0;
      }
      // ── hover: one wing beat every two beats, the downstroke on the beat
      const fl = Math.cos(beat * Math.PI);
      const e = 1 - s.enter;
      fly.position.set(0, 3.0 - fl * 0.2 - sg * 1.0 + e * e * 18 - s.sink * 8, st * 3.2 - rc * 1.2 - e * e * 12);
      fly.rotation.set(-w * 0.45 + st * 0.55 - rc * 0.4 + sg * 0.2 + e * 0.6, 0, Math.sin(s.staggerAge * 4) * 0.25 * sg + (fx >= 0 && !rebirth ? Math.sin(fx * Math.PI * 2) * 0.2 : 0));
      body.scale.setScalar(Math.max(0.001, bodyK));
      body.visible = bodyK > 0.002;
      egg.visible = eggK > 0.01 || burst > 0.01;
      egg.scale.setScalar(Math.max(0.01, eggK * (1 + s.pulse * 0.15) + burst * 5));
      eggMat.opacity = Math.max(eggK, burst * 0.7);
      eggMat.color.set(burst > 0 ? '#fff4d8' : '#ffb060').multiplyScalar(2.2);
      // ── head
      head.rotation.set(0.15 + w * 0.35 - st * 0.45 + sg * 0.5 + Math.sin(beat * Math.PI) * 0.06, Math.sin(beat * Math.PI * 0.5) * 0.2, 0);
      // ── wings
      wings.forEach((wg) => {
        let lift = 0.15 + fl * 0.55, sweep = 0, fold = 0.1 + Math.max(0, -fl) * 0.35;
        lift += w * 0.85 - st * 0.9 + rc * 0.5 + sm * 0.5 - sg * 0.7 + ph3 * 0.1;
        sweep += -w * 0.45 + st * 0.75 - rc * 0.25;
        fold += -w * 0.1 + st * -0.1 + sg * 0.5 - sm * 0.2;
        if (burst > 0) lift += burst * 0.6;
        wg.root.rotation.set(0, wg.sd * -sweep, wg.sd * lift, 'YXZ');
        wg.hand.rotation.set(0, wg.sd * fold, wg.sd * (0.1 - fold * 0.5 + Math.max(0, fl) * 0.15));
      });
      tail.rotation.set(-0.15 + w * 0.3 + Math.sin(beat * Math.PI) * 0.06, Math.sin(t * 0.9) * 0.1, 0);
      // ── heat, glow, fire
      const heat = (1 + ph2 * 0.9 + ph3 * 0.3) * (1 - sg * 0.5) + sm * 0.4 + w * 0.3;
      u.uK.value = heat;
      u.uK2.value = ph3 * (0.85 + s.pulse * 0.3) + sm * 0.2;
      u.uGlow.value.set(0.9 + ph2 * 0.8 + sm + (fx >= 0 ? Math.sin(fx * Math.PI) : 0), 0.8);
      tailFire.uniforms.uHeat.value = heat;
      tailFire.uniforms.uGain.value = 0.9 + ph2 * 0.3 + sm * 0.5;
      // ── appear: the rebirth burns the ink away and back
      if (fx >= 0 && rebirth) u.uAppear.value = Math.min(u.uAppear.value, fx < 0.4 ? 1 - smooth(0.02, 0.28, fx) : smooth(0.55, 0.8, fx));
      u.uEdge.value.set(fx >= 0 ? '#fff0c0' : '#ffb347');
      // ── the core
      const ck = ph2 * (1 - sg * 0.5) * (1 + s.pulse * 0.35) + w * 0.6;
      core.set(0, 0, 0.15, 1.15, 1.4 * ck + 0.3, Math.min(1, ck), _c.copy(CORE).multiplyScalar(1.6));
      core.set(1, 0, 0.15, 1.2, 3.2 * ck + 0.5, Math.min(1, ck) * 0.6, _c.copy(CORE2).multiplyScalar(0.9));
      core.set(2, 0, 2.1, 1.7, 0.01, 0, _c);
      core.commit();
      // ── strike point
      fly.updateMatrix();
      body.updateMatrix();
      strikeAt.set(0, 2.1, 2.4).applyMatrix4(body.matrix).applyMatrix4(fly.matrix);
      // ── embers: rise from the body, burst outward on the rebirth
      fly.updateMatrixWorld(true);
      wings.forEach((wg, k) => {
        wg.tip.getWorldPosition(tips[k]);
        fly.worldToLocal(tips[k]);
      });
      for (let i = 0; i < NE; i++) {
        const d = emb[i];
        const k = (d.h + t * 0.22 * d.s) % 1;
        let x = d.x * (0.6 + k * 0.6) + Math.sin(t * 1.3 + d.w) * 0.3;
        let y = -1.5 + k * 6;
        let z = d.z - k * 1.5;
        const bb = burst > 0 ? burst : fx >= 0 && rebirth && fx < 0.3 ? smooth(0.05, 0.3, fx) : 0;
        if (bb > 0) {
          const r = d.r * (1.2 - bb) * 2;
          x = Math.cos(d.a) * r;
          y = Math.sin(d.a) * r * 0.8 + 0.3;
          z = Math.sin(d.a * 2.3) * r * 0.6;
        }
        if (ph3 > 0.01 && i % 5 < 2) {
          // wings of fire: embers stream off the burning wings
          const wt = tips[i % 2];
          const q = (i * 0.618) % 1;
          const kk = (d.h + t * 0.6 * d.s) % 1;
          x = wt.x * q + Math.sin(t * 2 + d.w) * 0.2 * kk;
          y = 0.5 + (wt.y - 0.5) * q + kk * 1.5;
          z = 0.2 + (wt.z - 0.2) * q - kk * 2.5;
        }
        const life = Math.sin(k * Math.PI);
        _c.copy(i % 5 === 0 ? C3 : i % 2 ? C1 : C2).multiplyScalar((0.8 + s.pulse * 0.8) * (1 + ph2 * 0.5));
        gp.set(i, x, y, z, 0.1 + d.s * 0.08 + bb * 0.1, life * Math.min(1, u.uAppear.value + bb + e), _c);
      }
      gp.mat.uniforms.uClipY.value = u.uClipY.value;
      gp.commit();
    },
    dispose() {
      for (const m of mats) m.dispose();
      gp.mat.dispose();
      gp.points.geometry.dispose();
      core.mat.dispose();
      core.points.geometry.dispose();
    },
  };
  return rig;
}
