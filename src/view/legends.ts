/**
 * The five LEGENDS: the Silence's oldest stolen songs, the bosses of the secret paths
 * (docs/DESIGN-v5.md §2). Each is a huge procedural creature with its own shaders, alive on the beat:
 *
 *   wyrm       Serpente-Vagalume   a night-ink serpent covered in firefly lights, coiling in the air
 *   djinn      Gênio da Miragem    a colossal sand djinn rising from a whirlwind, mirage hands
 *   aurora     Dragão da Aurora    an ice-crystal dragon with wings of flowing aurora ribbons
 *   phoenix    Fênix Negra         a black-ink phoenix with lava veins; dies and is reborn
 *   abyssKing  Rei do Abismo       a towering shadow king, crown of broken instruments, void cloak
 *
 * CONTRACT: `group`, `update(dt, t, beat)`, `act(act, k?)`, `setPhase(n)`, `hit()`, `dispose()`.
 * The body faces +z (like every EnemyView body: EnemyView turns its group toward the heading), so the
 * blows strike toward local +z, where the colossus is. Ground at y = 0 (fliers hover by themselves).
 * Local units (EnemyView scales the group by ENEMY_SCALE): LEGEND_HEIGHT gives each one's height.
 *
 *   tell k    wind-up held k beats: the body rears back, red parts burn and flash on every counted
 *             beat; the wind-up peaks on the landing beat (call 'blow' then)
 *   blow      the strike toward +z (snaps out, recovers)
 *   parried   recoil with golden sparks
 *   stagger   reels, dimmed, for about two seconds
 *   phase k   the transformation flourish into phase k (also sets the persistent look)
 *   summon    a calling gesture (lights / copies / shards go out)
 *   burrow    sinks / dissolves away · emerge: comes back
 *   enter     the huge arrival (about 4 s)
 */
import * as THREE from 'three';
import { clamp01, damp } from './kit';
import { type ActS, type Rig, Sparks, env, smooth } from './legends/common';
import { wyrmRig } from './legends/wyrm';
import { djinnRig } from './legends/djinn';
import { auroraRig } from './legends/aurora';
import { phoenixRig } from './legends/phoenix';
import { abyssRig } from './legends/abyss';

export type LegendKind = 'wyrm' | 'djinn' | 'aurora' | 'phoenix' | 'abyssKing';
export type BossAct = 'enter' | 'tell' | 'blow' | 'parried' | 'stagger' | 'phase' | 'summon' | 'burrow' | 'emerge';

/** each legend's height in local units (for hp bars / camera framing) */
export const LEGEND_HEIGHT: Record<LegendKind, number> = { wyrm: 7.4, djinn: 8.7, aurora: 7.4, phoenix: 8.7, abyssKing: 9.6 };

const BUILD: Record<LegendKind, () => Rig> = { wyrm: wyrmRig, djinn: djinnRig, aurora: auroraRig, phoenix: phoenixRig, abyssKing: abyssRig };

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _s = new THREE.Vector3();

export class LegendView {
  readonly group = new THREE.Group();
  private rig: Rig;
  private sparks = new Sparks();
  private S: ActS;
  private time = 0;
  private beat = 0;
  private lastBeat: number | null = null;
  private spb = 0.6;
  private flash = 0;
  // acts
  private telling = false;
  private tellStart = 0;
  private tellBeats = 2;
  private tellUntil = 0;
  private blowAt = -99;
  private parryAt = -99;
  private staggerAt = -99;
  private phaseAt = -99;
  private summonAt = -99;
  private enterAt = -99;
  private sinkGoal = 0;
  private phaseN = 1;
  private pendingParry = false;

  constructor(readonly kind: LegendKind) {
    this.rig = BUILD[kind]();
    this.group.add(this.rig.root, this.sparks.group);
    this.S = {
      dt: 0, t: 0, beat: 0, bp: 0, pulse: 0, spb: 0.6, windup: 0, telling: 0, tellBeat: 0, strike: 0, blowAge: 99, recoil: 0, stagger: 0, staggerAge: 99,
      phaseFx: -1, phase: 1, summon: 0, enter: 1, sink: 0,
    };
    this.rig.setPhase(1);
  }

  /** the legend's height (local units) */
  get height(): number {
    return this.rig.height;
  }

  act(act: BossAct, k?: number): void {
    const now = this.time;
    switch (act) {
      case 'tell':
        this.telling = true;
        this.tellStart = this.beat;
        this.tellBeats = Math.max(0.5, k ?? 2);
        this.tellUntil = this.beat + this.tellBeats + 1.5;
        break;
      case 'blow':
        this.telling = false;
        this.blowAt = now;
        break;
      case 'parried':
        this.telling = false;
        this.parryAt = now;
        this.pendingParry = true;
        this.flash = 1;
        break;
      case 'stagger':
        this.telling = false;
        this.staggerAt = now;
        break;
      case 'phase': {
        this.telling = false;
        this.phaseAt = now;
        this.setPhase(k ?? this.phaseN + 1);
        break;
      }
      case 'summon':
        this.summonAt = now;
        break;
      case 'burrow':
        this.telling = false;
        this.sinkGoal = 1;
        break;
      case 'emerge':
        this.sinkGoal = 0;
        break;
      case 'enter':
        this.enterAt = now;
        this.sinkGoal = 0;
        this.S.sink = 0;
        break;
    }
  }

  setPhase(n: number): void {
    this.phaseN = Math.max(1, Math.min(3, Math.round(n)));
    this.rig.setPhase(this.phaseN);
  }

  hit(): void {
    this.flash = 1;
  }

  update(dt: number, t: number, beat: number): void {
    this.time = t;
    // seconds per beat from the beat clock
    if (this.lastBeat !== null && dt > 1e-4) {
      const db = beat - this.lastBeat;
      if (db > 1e-4 && db < 2) this.spb = damp(this.spb, THREE.MathUtils.clamp(dt / db, 0.2, 2), 2, dt);
    }
    this.lastBeat = beat;
    this.beat = beat;
    const S = this.S;
    S.dt = dt;
    S.t = t;
    S.beat = beat;
    S.spb = this.spb;
    S.bp = beat - Math.floor(beat);
    S.pulse = Math.exp(-S.bp * 5);
    // the wind-up
    if (this.telling && beat > this.tellUntil) this.telling = false;
    const tk = this.telling ? clamp01((beat - this.tellStart) / this.tellBeats) : 0;
    // a quick first flinch, then a steady rise that peaks on the landing beat
    S.windup = this.telling ? 0.25 * Math.min(1, (beat - this.tellStart) * 3) + 0.75 * smooth(0, 1, tk) : damp(S.windup, 0, 9, dt);
    S.telling = damp(S.telling, this.telling ? 1 : 0, this.telling ? 10 : 6, dt);
    S.tellBeat = this.telling ? Math.exp(-((beat - this.tellStart) % 1) * 4.5) : S.tellBeat * Math.exp(-dt * 8);
    // the strike: out in ~0.12 s, held briefly, back over ~0.7 s
    S.blowAge = t - this.blowAt;
    S.strike = env(S.blowAge, 0.12, 0.95);
    S.recoil = env(t - this.parryAt, 0.09, 1.1);
    S.staggerAge = t - this.staggerAt;
    S.stagger = env(S.staggerAge, 0.25, 2.2);
    const pa = t - this.phaseAt;
    S.phaseFx = pa >= 0 && pa < this.rig.phaseDur ? pa / this.rig.phaseDur : -1;
    // the persistent look follows the phase (the flourish times the change)
    const goal = this.phaseN;
    const rate = S.phaseFx >= 0 ? (S.phaseFx > 0.35 ? 2.2 : 0.2) : 1.5;
    S.phase = Math.abs(S.phase - goal) < 0.002 ? goal : damp(S.phase, goal, rate, dt);
    S.summon = env(t - this.summonAt, 0.35, 1.6);
    const ea = t - this.enterAt;
    S.enter = ea >= 0 && ea < this.rig.enterDur ? ea / this.rig.enterDur : 1;
    S.sink = this.sinkGoal > S.sink ? Math.min(1, S.sink + dt / 1.1) : Math.max(0, S.sink - dt / 1.3);

    const u = this.rig.u;
    u.uTime.value = t;
    u.uBeat.value = S.pulse;
    u.uBeatPos.value = beat;
    u.uTell.value = Math.max(S.telling * (0.35 + 0.65 * S.windup), S.strike * 0.8);
    u.uTellBeat.value = S.tellBeat;
    u.uPhase.value = S.phase;
    this.flash = Math.max(0, this.flash - dt * 6);
    u.uFlash.value.setRGB(this.flash * 0.7, this.flash * 0.6, this.flash * 0.45);
    const enterAppear = S.enter < 1 ? smooth(0.05, 0.55, S.enter) : 1;
    u.uAppear.value = Math.min(enterAppear, 1 - smooth(0.25, 0.95, S.sink));
    // ground clip (world y of the group's ground)
    this.group.getWorldPosition(_v);
    this.group.getWorldScale(_s);
    u.uClipY.value = S.sink > 0.001 ? _v.y - 0.02 * _s.y : -1e5;

    this.rig.update(S);

    if (this.pendingParry) {
      this.pendingParry = false;
      _w.copy(this.rig.strikeAt);
      this.sparks.burst(_w, new THREE.Vector3(0, 0.4, 1).normalize(), 80, 7);
    }
    this.sparks.update(dt);
  }

  dispose(): void {
    this.rig.dispose();
    this.sparks.dispose();
    this.group.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  }
}
