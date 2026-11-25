/**
 * The band's musicians: round "note birds" (the Maestro's kind), each with its own colour, hat and
 * instrument. Used on the shell (every tower is a musician playing) and in the cinematics.
 *
 * CONTRACT (docs/DESIGN-v2.md §6). This file is a PLACEHOLDER: the art pass replaces the body with
 * the real characters but keeps this API.
 */
import * as THREE from 'three';
import type { TowerKind } from '../sim/defs';
import { sph, stdMat } from './kit';

export type MusicianPose = 'idle' | 'play' | 'cheer' | 'wave' | 'sleep' | 'scared' | 'bow' | 'jump';

const COLORS: Record<TowerKind, string> = {
  harp: '#7cc46a', drum: '#e0524a', bell: '#5a8fd6', shaker: '#e8c25a',
  crystal: '#c9a0ff', horn: '#f2efe6', choir: '#ff9ec7', bass: '#6a4a9a',
};

export class MusicianView {
  readonly group = new THREE.Group();
  pose: MusicianPose = 'idle';
  private frozen = 0;
  private hit = 0;
  private mat: THREE.MeshStandardMaterial;

  constructor(readonly kind: TowerKind, opts: { scale?: number } = {}) {
    this.mat = stdMat(COLORS[kind], 0.6);
    const body = new THREE.Mesh(sph(0.42, 20, 14), this.mat);
    body.position.y = 0.45;
    this.group.add(body);
    this.group.scale.setScalar(opts.scale ?? 1);
  }

  /** a note/hit on the beat: a quick strike/pluck/blow gesture */
  play(strength = 1): void {
    this.hit = Math.max(this.hit, strength);
  }

  /** 0 alive … 1 grey stone statue (rescue scenes) */
  setFrozen(k: number): void {
    this.frozen = k;
  }

  update(dt: number, _t: number, beat: number): void {
    this.hit = Math.max(0, this.hit - dt * 6);
    const bob = this.frozen > 0.5 ? 0 : Math.abs(Math.sin(beat * Math.PI)) * 0.05;
    this.group.children[0].position.y = 0.45 + bob + this.hit * 0.05;
  }
}
