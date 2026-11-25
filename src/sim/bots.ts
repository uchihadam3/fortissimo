/**
 * Headless players for balancing and tests (never bundled into the game).
 *
 * - good:   builds a varied band, plans duets on neighbouring plates, places by threat direction,
 *           reacts to what is coming (fliers, armour, invisible, swarms, deflectors, mimics), taps
 *           every golden note, upgrades, and saves FORTÍSSIMO for crowds and guardians. 5 decisions/s.
 * - novice: slow (one decision every few seconds) and obvious: the next instrument of the list on the
 *           first free plate, otherwise the weakest tower grows; taps some notes that come close.
 * - spam:   plays like the good bot with one single instrument.
 */
import { Journey, type JourneyDef, type Mode, type SimEvent, type Tower } from './journey';
import { ENEMIES, SONGS, TOWERS, SECTION_OF, duetOf, type EnemyKind, type TowerKind } from './defs';
import { SLOTS, SLOT_NEIGHBOURS } from './shell';

export type BotKind = 'good' | 'novice' | 'spam';

export interface BotResult {
  j: Journey;
  /** seconds of journey (from the first step to the end) */
  time: number;
}

interface Threats {
  air: number;
  armor: number;
  camo: number;
  swarm: number;
  deflect: number;
  heavy: number;
  mimic: number;
  total: number;
}

const FIGHTERS: TowerKind[] = ['harp', 'drum', 'bell', 'crystal', 'horn', 'bass'];

/** what is coming in the next bars (and what is already here), as fractions of threat */
function threats(j: Journey, ahead = 16): Threats {
  const t: Threats = { air: 0, armor: 0, camo: 0, swarm: 0, deflect: 0, heavy: 0, mimic: 0, total: 0 };
  const add = (k: EnemyKind, n: number) => {
    const d = ENEMIES[k];
    const w = d.threat * n;
    t.total += w;
    if (d.flying) t.air += w;
    if (d.armor >= 0.4) t.armor += w;
    if (d.camo) t.camo += w;
    if (d.pack || d.split || k === 'blotling' || k === 'blot') t.swarm += w;
    if (d.deflect) t.deflect += w;
    if (d.threat >= 6 || d.boss) t.heavy += w;
    if (d.mimic) t.mimic += w;
  };
  const jb = j.journeyBar ?? 0;
  for (const w of j.waves) {
    if (w.bar < jb - 1 || w.bar > jb + ahead) continue;
    for (const g of w.groups) add(g.kind, g.count * (g.hp ?? 1));
  }
  if (j.def.boss && j.def.boss.bar <= jb + ahead && !j.enemies.some((e) => e.def.boss)) add(j.def.boss.kind, 1);
  for (const e of j.enemies) if (e.alive && !e.structure) add(e.kind, 0.5);
  if (t.total > 0) {
    t.air /= t.total;
    t.armor /= t.total;
    t.camo /= t.total;
    t.swarm /= t.total;
    t.deflect /= t.total;
    t.heavy /= t.total;
    t.mimic /= t.total;
  }
  return t;
}

function count(j: Journey, k: TowerKind) {
  let n = 0;
  for (const t of j.towers) if (t.kind === k) n++;
  return n;
}

function fightersNear(j: Journey, slot: number, r: number): number {
  let near = 0;
  const a = SLOTS[slot];
  for (const tw of j.towers) {
    if (tw.kind === 'choir' || tw.kind === 'shaker' || tw.slot === slot) continue;
    const b = SLOTS[tw.slot];
    if (Math.hypot(a.x - b.x, a.z - b.z) <= r + 1e-6) near += 1 + tw.level * 0.6;
  }
  return near;
}

/** how much a tower of this kind helps against what is coming (copies already on the shell: `n`) */
function kindValue(j: Journey, k: TowerKind, th: Threats, slot: number, n: number): number {
  const detectors = count(j, 'bell') + count(j, 'choir');
  const blind = detectors === 0 ? th.camo : 0;
  const barsLeft = j.def.bars - (j.journeyBar ?? 0);
  let v = 0;
  switch (k) {
    case 'harp':
      v = 1.0 * (1 - 0.9 * th.deflect) * (1 - 0.4 * th.armor) * (1 - 0.7 * blind);
      break;
    case 'drum':
      v = 1.1 * (1 - th.air) * (0.6 + 1.0 * th.swarm) * (1 - 0.3 * th.armor) * (1 - 0.7 * blind);
      break;
    case 'bell':
      v = 0.55 + (count(j, 'bell') === 0 ? 0.9 * th.swarm : 0) + (detectors === 0 ? 2.6 * th.camo : 0) + 0.3 * th.armor;
      if (n >= 1) v *= 0.45;
      break;
    case 'crystal':
      v = 1.2 * (0.8 + 0.5 * th.swarm) * (1 - 0.4 * th.armor) * (1 - 0.6 * blind);
      break;
    case 'horn':
      v = 1.3 * (1 - th.air) * (0.7 + 0.6 * th.swarm) * (1 - 0.9 * th.deflect) * (1 - 0.6 * blind);
      break;
    case 'bass':
      v = 1.4 * (1 - th.air) * (0.6 + 1.0 * th.armor + 0.6 * th.heavy) * (1 - 0.6 * blind);
      break;
    case 'choir':
      v = 0.22 * fightersNear(j, slot, TOWERS.choir.levels[0].range) + (detectors === 0 ? 2.2 * th.camo : 0);
      if (n >= 1) v *= 0.5;
      break;
    case 'shaker': {
      let fighters = 0;
      for (const t of j.towers) if (t.kind !== 'shaker') fighters++;
      v = barsLeft > 80 && fighters >= 3 && n < (j.towers.length >= 8 ? 2 : 1) ? 0.9 : 0;
      break;
    }
  }
  // a varied band: every copy is worth less (much less when Mimics are about)
  v *= 1 / (1 + (0.45 + 4 * th.mimic + (j.def.world === 'citadel' ? 0.3 : 0)) * n);
  return Math.max(0, v);
}

/** duets a tower of kind k would form on this slot */
function duetsAt(j: Journey, slot: number, k: TowerKind): number {
  let d = 0;
  for (const nb of SLOT_NEIGHBOURS[slot]) {
    const t = j.towerAt(nb);
    if (t && t.slot !== slot && duetOf(k, t.kind)) d++;
  }
  return d;
}

/** how well a slot faces the coming threats (−1…1) */
function facing(j: Journey, slot: number): number {
  const jb = j.journeyBar ?? 0;
  let vx = 0, vz = 0;
  for (const w of j.waves) {
    if (w.bar < jb || w.bar > jb + 8) continue;
    for (const g of w.groups) {
      const a = (g.dir * Math.PI) / 180;
      vx += Math.sin(a) * g.count * ENEMIES[g.kind].threat;
      vz += -Math.cos(a) * g.count * ENEMIES[g.kind].threat;
    }
  }
  const l = Math.hypot(vx, vz);
  if (l < 1e-6) return 0;
  const s = SLOTS[slot];
  const sl = Math.hypot(s.x, s.z) || 1;
  return (s.x * vx + s.z * vz) / (l * sl);
}

interface Option {
  score: number;
  cost: number;
  run: () => boolean;
}

function options(j: Journey, kinds: TowerKind[], th: Threats): Option[] {
  const out: Option[] = [];
  for (let slot = 0; slot < j.slotsOpen; slot++) {
    if (j.towerAt(slot)) continue;
    for (const k of kinds) {
      const cost = TOWERS[k].levels[0].cost;
      let v = kindValue(j, k, th, slot, count(j, k));
      if (v <= 0) continue;
      v *= 1 + 0.35 * duetsAt(j, slot, k);
      // plan the layout: leave free neighbours for future partners, park soloists where they block nothing
      const freeNb = SLOT_NEIGHBOURS[slot].filter((s) => s < j.slotsMax && !j.towerAt(s)).length;
      const partners = kinds.some((o) => duetOf(k, o));
      v *= partners ? 1 + 0.1 * freeNb : 1 - 0.06 * freeNb;
      if (!j.towers.some((t) => SECTION_OF[t.kind] === SECTION_OF[k])) v *= 1.3;
      // the inner ring sees farther; short-range instruments like the side the threats come from
      if (SLOTS[slot].ring === 1) v *= 1.05;
      if (k === 'bell' || k === 'drum' || k === 'harp') v *= 1 + 0.08 * facing(j, slot);
      // a free plate is precious: filling it beats most upgrades
      v *= 1.3;
      out.push({ score: v / Math.sqrt(cost / 100), cost, run: () => !!j.build(slot, k) });
    }
  }
  const late = j.def.bars - (j.journeyBar ?? 0) < 50;
  for (const t of j.towers) {
    const cost = j.upgradeCost(t);
    if (cost === null) continue;
    let v: number;
    if (t.kind === 'shaker') v = late ? 0 : 0.6;
    else v = kindValue(j, t.kind, th, t.slot, count(j, t.kind) - 1) * 0.85;
    v *= 1 + 0.25 * t.partners.length;
    if (v <= 0) continue;
    out.push({ score: v / Math.sqrt(cost / 100), cost, run: () => j.upgrade(t) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function tapNotes(j: Journey, reach: number, pick: (id: number) => boolean = () => true) {
  for (const p of j.pickups) {
    if (p.taken || p.lost) continue;
    if (Math.hypot(p.x - j.turtle.x, p.z - j.turtle.z) < reach && pick(p.id)) j.collect(p.id);
  }
}

function useFF(j: Journey) {
  if (process.env.NOFF) return;
  if (!j.ffReady()) return;
  let near = 0;
  let big = false;
  for (const e of j.enemies) {
    if (!e.alive || e.structure) continue;
    const d = Math.hypot(e.x - j.turtle.x, e.z - j.turtle.z);
    if (d < 16) near += e.def.threat >= 3 ? 2 : 1;
    if (d < 19 && (e.def.boss || e.elite)) big = true;
  }
  if (near >= 8 || big || (near >= 3 && j.lives <= 8)) j.unleash();
}

/** one decision of the good (or spam) bot */
function goodStep(j: Journey, kinds: TowerKind[]) {
  tapNotes(j, 30);
  useFF(j);
  const th = threats(j);
  for (let guard = 0; guard < 4; guard++) {
    const opts = options(j, kinds, th);
    if (!opts.length) return;
    const best = opts[0];
    if (best.cost <= j.coins) {
      if (!best.run()) return;
      continue;
    }
    // can't pay for the best yet: something nearly as good that is affordable now, or save up
    const alt = opts.find((o) => o.cost <= j.coins && o.score >= best.score * 0.72);
    if (alt && alt.run()) continue;
    return;
  }
}

/** one decision of the novice */
function noviceStep(j: Journey, state: { next: number; tick: number }) {
  state.tick++;
  if (state.tick % 2 === 0) tapNotes(j, 20, (id) => (id * 7919) % 10 < 6);
  if (j.ffReady() && j.aliveCount() >= 4) j.unleash();
  const kinds = j.def.towers;
  for (let s = 0; s < j.slotsOpen; s++) {
    if (j.towerAt(s)) continue;
    const k = kinds[state.next % kinds.length];
    if (j.coins >= TOWERS[k].levels[0].cost && j.build(s, k)) state.next++;
    return;
  }
  const t = j.towers.slice().sort((a, b) => a.level - b.level)[0];
  if (t && (j.upgradeCost(t) ?? Infinity) <= j.coins) j.upgrade(t);
}

export function playBot(def: JourneyDef, kind: BotKind, opts: { mode?: Mode; spam?: TowerKind; limit?: number; onTick?: (j: Journey) => void; until?: (j: Journey) => boolean; onEvents?: (evs: SimEvent[], j: Journey) => void } = {}): BotResult {
  const j = new Journey(def, SONGS[def.song].bpm, { mode: opts.mode ?? 'normal' });
  const kinds = kind === 'spam' ? [opts.spam ?? 'harp'] : def.towers;
  const nov = { next: 0, tick: 0 };
  const dt = kind === 'novice' ? 4 : 0.2;
  // before setting off
  if (kind === 'novice') noviceStep(j, nov);
  else for (let i = 0; i < 6; i++) goodStep(j, kinds);
  j.begin();
  let t = 0;
  const limit = opts.limit ?? 1500;
  while (j.outcome === 'playing' && t < limit) {
    t += dt;
    j.advance(t);
    const evs = j.drain();
    opts.onEvents?.(evs, j);
    if (kind === 'novice') noviceStep(j, nov);
    else goodStep(j, kinds);
    opts.onTick?.(j);
    if (opts.until?.(j)) break;
  }
  return { j, time: t };
}

/** the strongest single-instrument band for a journey (the spam bot tries each fighter) */
export function playSpam(def: JourneyDef, mode: Mode = 'normal'): BotResult & { kind: TowerKind } {
  let best: (BotResult & { kind: TowerKind }) | null = null;
  const score = (r: BotResult) => (r.j.outcome === 'victory' ? 1000 + r.j.lives : r.j.progress * 100);
  for (const k of FIGHTERS) {
    if (!def.towers.includes(k)) continue;
    const r = playBot(def, 'spam', { mode, spam: k });
    if (!best || score(r) > score(best)) best = { ...r, kind: k };
  }
  return best!;
}

export type { Tower };
