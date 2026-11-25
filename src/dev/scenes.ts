/** Developer test scenes (?scene=journey&world=meadow). */
import * as THREE from 'three';
import { Engine } from '../core/engine';
import type { WorldId } from '../sim/defs';
import { LOOKS } from '../view/styles';
import { buildLandscape, type Feature, treeUniforms } from '../view/landscape';
import { Sky } from '../view/sky';
import { Grass } from '../view/grass';
import { Turtle } from '../view/turtle';
import { TowerView } from '../view/towers';
import { EnemyView } from '../view/enemies';
import { setSources, worldColor } from '../view/worldColor';
import type { TowerKind, EnemyKind } from '../sim/defs';

export function journeyScene(app: HTMLElement, world: WorldId, opts: { t?: number; cam?: string } = {}) {
  const engine = new Engine(app);
  const look = LOOKS[world];
  const cam = engine.camera;
  cam.far = 5000;
  cam.fov = 42;
  cam.updateProjectionMatrix();
  engine.renderer.toneMappingExposure = look.exposure;
  const scene = engine.scene;
  scene.fog = new THREE.FogExp2(new THREE.Color(look.fog), look.fogDensity);
  const sunDir = new THREE.Vector3(...look.sky.sunDir).normalize();
  const features: Feature[] = [
    { kind: 'meadow', from: 0, to: 60 },
    { kind: 'lake', from: 40, to: 90, side: 1 },
    { kind: 'forest', from: 70, to: 120, side: -1 },
    { kind: 'river', from: 120, to: 130 },
    { kind: 'canyon', from: 150, to: 200 },
    { kind: 'ruins', from: 210, to: 250 },
  ];
  const land = buildLandscape(world, look.land, 280, features, 7, sunDir);
  scene.add(land.group);
  const sky = new Sky(look.sky, 7);
  scene.add(sky.group);
  const grass = new Grass(land, look.grass, 90000, 100);
  scene.add(grass.mesh);
  // light
  const sun = new THREE.DirectionalLight(new THREE.Color(look.sun), look.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -40;
  sc.right = 40;
  sc.top = 40;
  sc.bottom = -40;
  sc.near = 1;
  sc.far = 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(new THREE.Color(look.hemiSky), new THREE.Color(look.hemiGround), look.hemiIntensity));

  const turtle = new Turtle();
  scene.add(turtle.group);
  // a few towers on the shell
  const kinds: TowerKind[] = ['harp', 'drum', 'bell', 'crystal', 'horn', 'choir', 'bass', 'shaker'];
  const towers: { tv: TowerView; slot: number }[] = [];
  [0, 2, 4, 6, 8, 10, 1, 9].forEach((slot, i) => {
    const tv = new TowerView(kinds[i], i % 3, i + 1);
    tv.group.scale.setScalar(1);
    turtle.shell.add(tv.group);
    tv.group.position.copy(turtle.slots[slot].pos);
    tv.scaleMul = 2.4;
    towers.push({ tv, slot });
  });
  // enemies scattered ahead
  const enemies: EnemyView[] = [];
  const ek: EnemyKind[] = ['blot', 'blot', 'scurry', 'shell', 'moth', 'blot', 'shield', 'bubble', 'phantom', 'muffler', 'mender', 'blot'];
  const speed = 0.42; // tiles per beat
  const bpm = 100;
  const spb = 60 / bpm;
  const startBeat = opts.t ?? 40;
  const tmpM = new THREE.Matrix4();
  const poseAt = (beat: number, out: THREE.Matrix4) => {
    const s = Math.max(0, beat * speed);
    const p = land.path.at(s);
    const f = land.path.at(s + 3);
    const b = land.path.at(Math.max(0, s - 3));
    const yf = land.heightAt(f.x, f.z), yb = land.heightAt(b.x, b.z);
    const y = (yf + yb + land.heightAt(p.x, p.z) * 2) / 4;
    const yaw = Math.atan2(-p.dx, -p.dz);
    const pitch = Math.atan2(yf - yb, 6) * 0.8;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    out.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(1, 1, 1));
    return out;
  };
  ek.forEach((k, i) => {
    const e = new EnemyView(i + 100, k);
    e.group.visible = true;
    scene.add(e.group);
    enemies.push(e);
  });
  const enemyPos = (i: number, beat: number) => {
    const s = beat * speed + 14 + (i % 4) * 3;
    const p = land.path.at(s);
    const side = (i % 2 ? 1 : -1) * (6 + (i * 3.7) % 9);
    return { x: p.x - p.dz * side, z: p.z + p.dx * side };
  };
  const look3 = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let first = true;
  engine.onUpdate((dt, t) => {
    const beat = startBeat + t / spb;
    turtle.update(dt, t, beat, poseAt, land.heightAt, true);
    poseAt(beat, tmpM);
    const tp = new THREE.Vector3().setFromMatrixPosition(tmpM);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(tmpM);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(tmpM);
    const view = opts.cam ?? 'chase';
    const desired = view === 'side'
      ? tp.clone().addScaledVector(right, -22).addScaledVector(fwd, 4).add(new THREE.Vector3(0, 7, 0))
      : view === 'front'
        ? tp.clone().addScaledVector(fwd, 26).add(new THREE.Vector3(0, 9, 0)).addScaledVector(right, 6)
        : tp.clone().addScaledVector(fwd, -21).add(new THREE.Vector3(0, 12, 0)).addScaledVector(right, 10);
    const lookAt = view === 'chase' ? tp.clone().addScaledVector(fwd, 16).add(new THREE.Vector3(0, 2.5, 0)) : tp.clone().add(new THREE.Vector3(0, 3, 0));
    if (first) {
      camPos.copy(desired);
      look3.copy(lookAt);
      first = false;
    }
    camPos.lerp(desired, 1 - Math.exp(-dt * 3));
    look3.lerp(lookAt, 1 - Math.exp(-dt * 4));
    cam.position.copy(camPos);
    cam.lookAt(look3);
    sky.follow(cam);
    sky.update(t);
    sun.position.copy(tp).addScaledVector(sunDir, 80);
    sun.target.position.copy(tp);
    grass.follow(tp.x + fwd.x * 10, tp.z + fwd.z * 10);
    grass.update(t);
    land.update(t);
    treeUniforms.uTime.value = t;
    const pushers = [{ x: tp.x, z: tp.z, r: 5.2, s: 1 }];
    grass.setPushers(pushers);
    // colour: around the colossus and in its wake
    const src: { x: number; z: number; r: number; s: number }[] = [{ x: tp.x, z: tp.z, r: 26, s: 1.08 }];
    for (let k = 1; k < 10; k++) {
      const p = land.path.at(Math.max(0, beat * speed - k * 12));
      src.push({ x: p.x, z: p.z, r: 30, s: 1.05 });
    }
    setSources(src);
    worldColor.uWorldSat.value = Number(new URLSearchParams(location.search).get('sat') ?? 0.3);
    for (const { tv } of towers) tv.update(dt, t, beat);
    enemies.forEach((e, i) => {
      const p = enemyPos(i, beat);
      e.push(t, p.x, p.z);
      e.update(dt, t, beat, (x, z) => land.heightAt(x, z), (x, z, y, out) => out.set(x, y, z), cam.quaternion);
      e.group.scale.setScalar(2.2);
    });
  });
  engine.start();
  (window as unknown as { __ready: boolean }).__ready = true;
}

export function turtleScene(app: HTMLElement) {
  const engine = new Engine(app);
  const scene = engine.scene;
  scene.background = new THREE.Color('#8fb8d8');
  scene.add(new THREE.HemisphereLight('#cfe4ff', '#6f8f45', 1.0));
  const sun = new THREE.DirectionalLight('#fff0d2', 2.5);
  sun.position.set(10, 20, 8);
  scene.add(sun);
  const t = new Turtle();
  scene.add(t.group);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7fb850' }));
  scene.add(ground);
  const cam = engine.camera;
  cam.position.set(-16, 8, -14);
  cam.lookAt(0, 3, -2);
  const m = new THREE.Matrix4();
  engine.onUpdate((dt, time) => {
    t.update(dt, time, time * 1.6, (b, out) => out.compose(new THREE.Vector3(0, 0, -b * 0.4), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)), () => 0, true);
    void m;
    const z = -time * 1.6 * 0.4;
    if (new URLSearchParams(location.search).get('cam') === 'side') {
      cam.position.set(-21, 3.2, z - 1);
      cam.lookAt(0, 2.4, z - 1);
    } else {
      cam.position.set(-16, 8, -14 + z);
      cam.lookAt(0, 3, -2 + z);
    }
  });
  engine.start();
  (window as unknown as { __ready: boolean }).__ready = true;
}
