/**
 * Art gallery (developer): ?scene=gallery&show=band|poses|towers|shell|bestiary|guardians|silence|giant
 *
 *   &pose=idle|play|cheer|wave|sleep|scared|bow|jump   musicians' pose (band) / the Silence's pose
 *   &kind=drum           one musician in every pose (show=poses) · one creature (show=bestiary)
 *   &t=1.3               time of the frame (s); the scene is simulated up to it, then drawn once
 *   &live=1              keep animating (turntable)
 *   &yaw=0.4&pitch=0.25&dist=6  camera
 *   &state=muted|disabled|frozen|ink   towers / musicians state
 *   &scale=1             the Silence (show=silence|giant)
 *   &labels=0            hide the name labels
 */
import * as THREE from 'three';
import { Engine } from '../core/engine';
import { TOWER_KINDS, type EnemyKind, type TowerKind } from '../sim/defs';
import { MusicianView, type MusicianPose } from '../view/musicians';
import { MaestroView } from '../view/models';
import { TowerView } from '../view/towers';
import { EnemyView } from '../view/enemies';
import { SilenceView, type SilencePose } from '../view/silence';
import { Turtle } from '../view/turtle';
import { ICON, TOWER_ICON, enemyIcon } from '../ui/icons';

type Item = { obj: THREE.Object3D; label?: string; update: (dt: number, t: number, beat: number) => void };

const POSES: MusicianPose[] = ['idle', 'play', 'cheer', 'wave', 'sleep', 'scared', 'bow', 'jump'];
const NAMES: Record<TowerKind, string> = {
  harp: 'Lira', drum: 'Bumbo', bell: 'Dona Badalo', shaker: 'Chocalho', crystal: 'Cristalina', horn: 'Trompa', choir: 'Coralitos', bass: 'Grave',
};
const LANDS: EnemyKind[][] = [
  ['blot', 'blotling', 'scurry', 'bubble', 'moth'],
  ['scorpion', 'whirl', 'echo', 'obelisk'],
  ['wolf', 'shell', 'phantom', 'muffler'],
  ['ember', 'slug', 'shield', 'mender'],
  ['mimic', 'knight', 'conductor'],
];
const GUARDIANS: EnemyKind[] = ['bossBlot', 'bossScarab', 'bossMoth', 'bossGolem', 'silence'];

export function gallery(app: HTMLElement, p: URLSearchParams) {
  if (p.get('show') === 'icons') return iconSheet(app);
  const engine = new Engine(app);
  engine.autoResolution = false;
  const scene = engine.scene;
  const show = p.get('show') ?? 'band';
  const num = (k: string, d: number) => (p.has(k) ? Number(p.get(k)) : d);
  const state = p.get('state') ?? '';
  const giant = show === 'giant';
  // painted backdrop
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color(giant ? '#3a3a6a' : '#5f9ad8') }, uHor: { value: new THREE.Color(giant ? '#c9b2c8' : '#e6eef2') }, uGround: { value: new THREE.Color('#b9c79a') } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGround; varying vec3 vP;
        void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(uHor, uTop, pow(y, 0.6)) : mix(uHor, uGround, smoothstep(0.0, -0.1, y)); gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(giant ? '#b9a8c2' : '#dfe8ea', giant ? 160 : 40, giant ? 700 : 120);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(giant ? 600 : 60, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: giant ? '#8a9a6a' : '#a9bf7c', roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(new THREE.HemisphereLight('#dcebff', '#6f7f4a', 1.1));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
  sun.position.set(6, 12, 9).multiplyScalar(giant ? 12 : 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  const ext = giant ? 160 : 14;
  sc.left = -ext;
  sc.right = ext;
  sc.top = ext;
  sc.bottom = -ext;
  sc.near = 0.5;
  sc.far = giant ? 800 : 60;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  engine.renderer.toneMappingExposure = 1.02;

  const items: Item[] = [];
  const cam = engine.camera;
  cam.fov = num('fov', 30);
  cam.near = 0.05;
  cam.far = 3000;
  let target = new THREE.Vector3(0, 0.5, 0);
  let dist = 6, yaw = 0, pitch = 0.18;
  const grid = (n: number, cols: number, dx: number, dz: number) => (i: number) => {
    const c = i % cols, r = Math.floor(i / cols);
    return new THREE.Vector3((c - (cols - 1) / 2) * dx, 0, (r - (Math.ceil(n / cols) - 1) / 2) * dz);
  };
  const musician = (k: TowerKind, pose: MusicianPose, at: THREE.Vector3, level = 0, label?: string) => {
    const m = new MusicianView(k, { level });
    m.pose = pose;
    if (state === 'muted') m.setMood('muted');
    if (state === 'disabled') m.setMood('disabled');
    if (state === 'ink') m.setInk(1);
    m.group.position.copy(at);
    scene.add(m.group);
    if (state === 'frozen') m.setFrozen(num('frozen', 1));
    items.push({ obj: m.group, label, update: (dt, t, beat) => m.update(dt, t, beat) });
    return m;
  };

  switch (show) {
    case 'band': {
      const pose = (p.get('pose') ?? 'idle') as MusicianPose;
      const kinds = TOWER_KINDS;
      kinds.forEach((k, i) => musician(k, pose, new THREE.Vector3((i - 3.5) * 0.95, 0, 0), num('level', 0), NAMES[k]));
      const ma = new MaestroView();
      ma.group.position.set(4.3, 0, 0);
      ma.pose = 'conduct';
      scene.add(ma.group);
      items.push({ obj: ma.group, label: 'Maestro', update: (dt, t, beat) => ma.update(dt, t, beat) });
      target = new THREE.Vector3(0.4, 0.42, 0);
      dist = 10;
      pitch = 0.16;
      break;
    }
    case 'poses': {
      const k = (p.get('kind') ?? 'drum') as TowerKind;
      POSES.forEach((pose, i) => musician(k, pose, new THREE.Vector3((i - 3.5) * 0.95, 0, 0), num('level', 0), pose));
      target = new THREE.Vector3(0, 0.45, 0);
      dist = 9;
      break;
    }
    case 'levels': {
      TOWER_KINDS.forEach((k, i) => {
        for (let l = 0; l < 3; l++) musician(k, (p.get('pose') ?? 'idle') as MusicianPose, new THREE.Vector3((i - 3.5) * 1.0, 0, (l - 1) * 1.3), l, l === 0 ? NAMES[k] : undefined);
      });
      target = new THREE.Vector3(0, 0.3, 0);
      dist = 12;
      pitch = 0.42;
      break;
    }
    case 'towers': {
      const st = state;
      TOWER_KINDS.forEach((k, i) => {
        for (let l = 0; l < 3; l++) {
          const tv = new TowerView(k, l, i * 3 + l);
          tv.group.position.set((i - 3.5) * 1.05, 0, (l - 1) * 1.25);
          if (st === 'muted') tv.setMuted(true);
          if (st === 'disabled') tv.setDisabled(true);
          scene.add(tv.group);
          items.push({ obj: tv.group, label: l === 0 ? NAMES[k] : undefined, update: (dt, t, beat) => tv.update(dt, t, beat) });
        }
      });
      target = new THREE.Vector3(0, 0.3, 0);
      dist = 12;
      pitch = 0.42;
      break;
    }
    case 'shell': {
      const turtle = new Turtle();
      scene.add(turtle.group);
      const slots = [0, 1, 2, 3, 4, 5, 6, 7];
      const towers: TowerView[] = [];
      TOWER_KINDS.forEach((k, i) => {
        const tv = new TowerView(k, Number(p.get('level') ?? i % 3), i);
        tv.scaleMul = 2.3;
        tv.group.position.copy(turtle.slots[slots[i]].pos);
        turtle.shell.add(tv.group);
        towers.push(tv);
        if (state === 'muted' && i % 2) tv.setMuted(true);
      });
      items.push({
        obj: turtle.group,
        update: (dt, t, beat) => {
          turtle.update(dt, t, beat, (b, out) => out.compose(new THREE.Vector3(0, 0, -b * 0.0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)), () => 0, false);
          for (const tv of towers) {
            tv.update(dt, t, beat);
            if (Math.floor(beat * 2) !== Math.floor((beat - dt / 0.6) * 2)) tv.fire();
          }
        },
      });
      target = new THREE.Vector3(0, 5, 0);
      dist = 24;
      pitch = 0.5;
      yaw = 0.5;
      break;
    }
    case 'bestiary': {
      // one row per land (&row=0..4 shows a single row, closer)
      const rows = p.has('row') ? [LANDS[Number(p.get('row'))]] : LANDS;
      const kinds = p.get('kind') ? [[p.get('kind') as EnemyKind]] : rows;
      kinds.forEach((row, r) => {
        row.forEach((k, i) => {
          const e = new EnemyView(1000 + r * 10 + i, k, 1);
          e.setAura(false);
          if (k === 'mimic') e.setMimicKind(TOWER_KINDS[Number(p.get('mimic') ?? 1) % 8]);
          const at = new THREE.Vector3((i - (row.length - 1) / 2) * 1.9, 0, (r - (kinds.length - 1) / 2) * 2.3);
          scene.add(e.group);
          if (state === 'slow') e.slowed();
          if (state === 'hidden') e.revealed = false;
          items.push({
            obj: e.group,
            label: k,
            update: (dt, t, beat) => {
              e.push(t, at.x, at.z + t * 0.0004);
              e.update(dt, t, beat, () => 0, (x, z, y, out) => out.set(x, y, z), cam.quaternion);
              e.group.rotation.y = num('face', 0.35);
            },
          });
        });
      });
      const big = kinds.length === 1;
      target = new THREE.Vector3(0, big ? 0.45 : 0.3, 0);
      dist = big ? (kinds[0].length > 1 ? 7.5 : 3.2) : 17;
      pitch = big ? 0.2 : 0.62;
      break;
    }
    case 'guardians': {
      const kinds = p.get('kind') ? [p.get('kind') as EnemyKind] : GUARDIANS;
      kinds.forEach((k, i) => {
        const e = new EnemyView(2000 + i, k, 1);
        const at = new THREE.Vector3((i - (kinds.length - 1) / 2) * 4.6, 0, 0);
        scene.add(e.group);
        items.push({
          obj: e.group,
          label: k,
          update: (dt, t, beat) => {
            e.push(t, at.x, at.z + t * 0.0004);
            e.update(dt, t, beat, () => 0, (x, z, y, out) => out.set(x, y, z), cam.quaternion);
            e.group.rotation.y = num('face', 0.3);
          },
        });
      });
      target = new THREE.Vector3(0, 1.6, 0);
      dist = kinds.length > 1 ? 24 : 10;
      pitch = 0.16;
      break;
    }
    case 'silences': {
      // every pose side by side (and an emerging and a dissolving one)
      const list: { pose: SilencePose; emerge?: number; dissolve?: number }[] = [
        { pose: 'loom' }, { pose: 'reach' }, { pose: 'grasp' }, { pose: 'recoil' }, { pose: 'kneel' }, { pose: 'small' }, { pose: 'loom', emerge: 0.55 }, { pose: 'loom', dissolve: 0.5 },
      ];
      list.forEach((o, i) => {
        const s = new SilenceView({ scale: 1 });
        s.pose = o.pose;
        s.emerge = o.emerge ?? 1;
        s.dissolve = o.dissolve ?? 0;
        s.group.position.set((i - (list.length - 1) / 2) * 3.4, 0, 0);
        scene.add(s.group);
        const tgt = new THREE.Vector3(s.group.position.x + 0.8, 0.6, 4);
        if (o.pose === 'reach' || o.pose === 'grasp') s.reach(tgt);
        s.lookAt(new THREE.Vector3(s.group.position.x, 1.5, 8));
        items.push({ obj: s.group, label: o.emerge ? 'emerge .55' : o.dissolve ? 'dissolve .5' : o.pose, update: (dt, t) => s.update(dt, t) });
      });
      target = new THREE.Vector3(0, 1.7, 0);
      dist = 30;
      pitch = 0.08;
      break;
    }
    case 'silence':
    case 'giant': {
      const s = new SilenceView({ scale: num('scale', giant ? 20 : 1) });
      s.pose = (p.get('pose') ?? 'loom') as SilencePose;
      s.emerge = num('emerge', 1);
      s.dissolve = num('dissolve', 0);
      scene.add(s.group);
      const H = 3.3 * num('scale', giant ? 20 : 1);
      // something to reach for: a little turtle-sized marker in front
      const tgt = new THREE.Vector3(num('tx', 0), num('ty', 0.5), num('tz', H * 0.9));
      if (s.pose === 'reach' || s.pose === 'grasp') s.reach(tgt);
      s.lookAt(new THREE.Vector3(0, num('ly', giant ? 6 : 1.5), num('lz', H * 2)));
      if (giant) {
        const turtle = new Turtle();
        turtle.group.position.set(0, 0, H * 0.75);
        turtle.group.rotation.y = Math.PI;
        scene.add(turtle.group);
        items.push({ obj: turtle.group, update: (dt, t, beat) => turtle.update(dt, t, beat, (_b, out) => out.compose(turtle.group.position, turtle.group.quaternion, new THREE.Vector3(1, 1, 1)), () => 0, false) });
      }
      items.push({ obj: s.group, update: (dt, t) => s.update(dt, t) });
      target = new THREE.Vector3(0, H * 0.55, 0);
      dist = H * 2.6;
      pitch = 0.1;
      yaw = 0.35;
      break;
    }
  }
  yaw = num('yaw', yaw);
  pitch = num('pitch', pitch);
  dist = num('dist', dist);
  if (p.has('tx0')) target.set(num('tx0', 0), num('ty0', target.y), num('tz0', 0));
  const placeCam = (y: number) => {
    cam.position.set(target.x + Math.sin(y) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(y) * Math.cos(pitch) * dist);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
  };
  placeCam(yaw);

  // name labels
  const labels: { el: HTMLElement; obj: THREE.Object3D }[] = [];
  if (p.get('labels') !== '0') {
    for (const it of items) {
      if (!it.label) continue;
      const el = document.createElement('div');
      el.textContent = it.label;
      el.style.cssText = 'position:fixed;transform:translate(-50%,0);font:600 13px system-ui,sans-serif;color:#1d1a2b;background:rgba(255,255,255,.7);padding:1px 6px;border-radius:8px;pointer-events:none;z-index:5';
      document.body.appendChild(el);
      labels.push({ el, obj: it.obj });
    }
  }
  const placeLabels = () => {
    for (const l of labels) {
      const v = l.obj.getWorldPosition(new THREE.Vector3()).project(cam);
      l.el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
      l.el.style.top = `${((1 - v.y) / 2) * window.innerHeight + 6}px`;
    }
  };

  const bpm = 100;
  const T = num('t', 1.3);
  const step = 1 / 30;
  let simT = 0;
  const advance = (to: number) => {
    while (simT < to - 1e-6) {
      const dt = Math.min(step, to - simT);
      simT += dt;
      for (const it of items) it.update(dt, simT, (simT * bpm) / 60);
    }
  };
  advance(T);
  placeLabels();
  engine.renderOnce();
  (window as unknown as { __ready: boolean }).__ready = true;
  (window as unknown as { __gallery: unknown }).__gallery = { advance, render: () => engine.renderOnce(), items, cam, placeCam };
  if (p.get('live') === '1') {
    let spin = yaw;
    engine.onUpdate((dt) => {
      advance(simT + dt);
      if (p.get('spin') === '1') {
        spin += dt * 0.4;
        placeCam(spin);
      }
      placeLabels();
    });
    engine.start();
  }
}

/** every icon on one page: the band, the creatures, the traits */
function iconSheet(app: HTMLElement) {
  const cell = (svg: string, name: string, size: number) => `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:${size}px;height:${size}px;color:#ffe9b8">${svg}</div><figcaption style="font:600 12px system-ui;color:#e8e0f0">${name}</figcaption></figure>`;
  const row = (title: string, cells: string[]) => `<h3 style="font:700 14px system-ui;color:#ffd36b;margin:10px 0 6px">${title}</h3><div style="display:flex;flex-wrap:wrap;gap:14px">${cells.join('')}</div>`;
  const kinds: EnemyKind[] = [...LANDS.flat(), ...GUARDIANS];
  app.innerHTML = `<div style="position:fixed;inset:0;overflow:auto;background:#2a2340;padding:14px 18px">
    ${row('band', TOWER_KINDS.map((k) => cell(TOWER_ICON[k], NAMES[k], 72)))}
    ${row('creatures', kinds.map((k) => cell(enemyIcon(k), k, 60)))}
    ${row('small (hud)', kinds.map((k) => cell(enemyIcon(k), '', 26)))}
    ${row('traits', (['deflect', 'echo', 'burrow', 'pack', 'disable', 'mimic', 'steady', 'aura', 'wing', 'speed', 'armor', 'shieldI', 'split', 'eyeOff', 'mute', 'healI', 'wave'] as const).map((k) => cell(ICON[k], k, 48)))}
  </div>`;
  (window as unknown as { __ready: boolean }).__ready = true;
}
