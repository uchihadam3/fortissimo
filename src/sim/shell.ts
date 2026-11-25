/** Shell geometry shared by the simulation (tower slots) and the view (the turtle model). */
export const SHELL = { rx: 4.3, rz: 5.0, h: 3.1, y0: 2.5 };
export const HEX_R = 1.62;

/** Hex grid (pointy-top axial coords) → centre in the shell's xz plane (forward is −z). */
export function hexCenter(q: number, r: number): [number, number] {
  const x = HEX_R * Math.sqrt(3) * (q + r / 2);
  const z = HEX_R * 1.5 * r;
  return [x, z];
}

/** Dome height above y0 for a point in the shell's xz plane (superellipse profile). */
export function domeY(x: number, z: number): number {
  const r = Math.min(1, Math.hypot(x / SHELL.rx, z / SHELL.rz));
  return SHELL.h * Math.pow(Math.max(0, 1 - Math.pow(r, 2.4)), 0.62);
}

/**
 * Tower slots in unlock order. The first ones are the most forgiving: the high central plates
 * (they see all around), then the edges.
 */
export const SLOT_DEFS: [number, number][] = [
  [0, -1], [1, -1], [-1, 1], [0, 1], [1, 0], [-1, 0],
  [1, -2], [-1, -1], [2, -1], [-2, 1], [1, 1], [-1, 2],
];

export interface SlotLocal {
  id: number;
  x: number;
  y: number;
  z: number;
  /** 1 = high ring (a little more range), 2 = edge ring */
  ring: number;
}

export const SLOTS: SlotLocal[] = SLOT_DEFS.map(([q, r], id) => {
  const [x, z] = hexCenter(q, r);
  const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
  return { id, x, y: SHELL.y0 + domeY(x, z) + 0.08, z, ring };
});

/** Reach: an enemy touching the shell rim bites. */
export const SHELL_REACH = 4.6;
