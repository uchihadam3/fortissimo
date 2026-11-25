/**
 * The Silence: a being as tall as a mountain, made of dark ink and torn cloth that ripples like smoke,
 * with a cracked porcelain mask whose mouth is stitched shut with an X, long thin hands, and five broken
 * staff lines floating around its head like a broken crown (docs/STORY.md).
 *
 * CONTRACT (docs/DESIGN-v2.md §6). This file is a PLACEHOLDER: the art pass replaces it with the real
 * model and animation but keeps this API. Scale 1 ≈ 3.3 units tall (the boss); cinematics scale it up.
 */
import * as THREE from 'three';
import { cone, sph, stdMat } from './kit';

export type SilencePose = 'loom' | 'reach' | 'grasp' | 'recoil' | 'kneel' | 'small';

export class SilenceView {
  readonly group = new THREE.Group();
  /** 0 hidden … 1 fully risen (it rises out of mist / the ground) */
  emerge = 1;
  /** 0 solid … 1 dissolved into ink and stars */
  dissolve = 0;
  pose: SilencePose = 'loom';
  private reachTo: THREE.Vector3 | null = null;
  private body = new THREE.Group();

  constructor(opts: { scale?: number } = {}) {
    const cloak = new THREE.Mesh(cone(1.1, 2.9, 24), stdMat('#1d1a2b', 0.9));
    cloak.position.y = 1.45;
    const mask = new THREE.Mesh(sph(0.42, 20, 14), stdMat('#f2f0f7', 0.3));
    mask.position.set(0, 2.9, 0.2);
    this.body.add(cloak, mask);
    this.group.add(this.body);
    this.group.scale.setScalar(opts.scale ?? 1);
  }

  /** stretch a hand toward a world point (null: lower it) */
  reach(target: THREE.Vector3 | null): void {
    this.reachTo = target ? target.clone() : null;
  }

  /** turn the mask toward a world point */
  lookAt(p: THREE.Vector3): void {
    this.group.lookAt(p.x, this.group.position.y, p.z);
  }

  update(_dt: number, t: number): void {
    this.body.position.y = (this.emerge - 1) * 3.4 + Math.sin(t * 1.2) * 0.05;
    this.body.visible = this.emerge > 0.01 && this.dissolve < 0.99;
    void this.reachTo;
  }
}
