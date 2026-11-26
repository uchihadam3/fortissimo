/**
 * PLACEHOLDER — the legends (wyrm, djinn, aurora, phoenix, abyssKing) are modelled in this file by
 * another agent; this stand-in only keeps the contract so EnemyView compiles and shows something:
 *
 *   new LegendView(kind) · .group · update(dt, t, beat) · act(act, k?) · setPhase(n) · hit() · dispose()
 *
 * A glowing crystal heart wrapped in a ring, sized and tinted per legend.
 */
import * as THREE from 'three';

export type LegendKind = 'wyrm' | 'djinn' | 'aurora' | 'phoenix' | 'abyssKing';
export type BossAct = 'enter' | 'tell' | 'blow' | 'parried' | 'stagger' | 'phase' | 'summon' | 'burrow' | 'emerge';

const LOOK: Record<LegendKind, { col: string; size: number }> = {
  wyrm: { col: '#d8ff6a', size: 1.6 },
  djinn: { col: '#ffcf6a', size: 1.9 },
  aurora: { col: '#7affd8', size: 2.1 },
  phoenix: { col: '#ff4a8a', size: 2.1 },
  abyssKing: { col: '#8a6aff', size: 2.4 },
};

export class LegendView {
  readonly group = new THREE.Group();
  private core: THREE.Mesh;
  private ring: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private flash = 0;
  private actT = 0;
  private act0: BossAct | null = null;
  private phase = 0;

  constructor(readonly kind: LegendKind) {
    const L = LOOK[kind];
    this.mat = new THREE.MeshStandardMaterial({ color: L.col, emissive: L.col, emissiveIntensity: 0.6, roughness: 0.3, flatShading: true });
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.col).multiplyScalar(1.6), toneMapped: false });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(L.size * 0.5, 1), this.mat);
    this.core.position.y = L.size * 1.1;
    this.core.castShadow = true;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(L.size * 0.8, L.size * 0.05, 6, 40), this.ringMat);
    this.ring.position.y = L.size * 1.1;
    this.group.add(this.core, this.ring);
  }

  update(dt: number, t: number, beat: number): void {
    this.actT += dt;
    const pulse = Math.exp(-(beat - Math.floor(beat)) * 5);
    this.core.rotation.y = t * 0.6;
    this.core.scale.setScalar(1 + pulse * 0.06 + (this.act0 === 'tell' ? 0.15 : 0));
    this.ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.8) * 0.3;
    this.ring.rotation.z = t * (0.5 + this.phase * 0.4);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.emissiveIntensity = 0.6 + this.phase * 0.3 + this.flash + (this.act0 === 'tell' ? 0.6 * pulse : 0);
    if (this.act0 && this.actT > 1.5) this.act0 = null;
  }

  act(act: BossAct, _k?: number): void {
    this.act0 = act;
    this.actT = 0;
    if (act === 'parried' || act === 'blow') this.flash = 1;
  }

  setPhase(n: number): void {
    this.phase = n;
  }

  hit(): void {
    this.flash = 1;
  }

  dispose(): void {
    this.core.geometry.dispose();
    this.ring.geometry.dispose();
    this.mat.dispose();
    this.ringMat.dispose();
  }
}
