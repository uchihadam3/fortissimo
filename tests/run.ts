/**
 * Headless checks: campaign integrity, simulation determinism, the first journeys are winnable,
 * save codes round-trip. Run with `npm test`.
 */
import { CAMPAIGN, LEVEL_BY_ID, endlessDef } from '../src/data/campaign';
import { Journey } from '../src/sim/journey';
import { ENEMIES, SONGS, TOWERS, type TowerKind } from '../src/sim/defs';
import { SLOTS } from '../src/sim/shell';
import { newSave, saveFromCode, saveToCode, validate } from '../src/core/save';

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else {
    failed++;
    console.error(`✗ ${name} ${detail}`);
  }
}

// ── campaign integrity ──
const ids = new Set<string>();
for (const l of CAMPAIGN) {
  check(`unique id ${l.id}`, !ids.has(l.id));
  ids.add(l.id);
  check(`${l.id} has waves`, l.def.waves.length > 0);
  for (const r of l.requires) check(`${l.id} requires ${r}`, LEVEL_BY_ID.has(r));
  check(`${l.id} map pos`, l.map[0] >= 0 && l.map[0] <= 160 && l.map[1] >= 0 && l.map[1] <= 90);
  check(`${l.id} slots`, l.def.slots >= 1 && l.def.slots <= SLOTS.length);
  check(`${l.id} song`, !!SONGS[l.def.song]);
  for (const w of l.def.waves) for (const g of w.groups) check(`${l.id} enemy ${g.kind}`, !!ENEMIES[g.kind] && g.count > 0);
  for (const k of l.def.towers) check(`${l.id} tower ${k}`, !!TOWERS[k]);
}
check('first journey is open', CAMPAIGN[0].requires.length === 0);
check('endless def', endlessDef('meadow').waves.length > 20);

// ── determinism: same inputs → same outcome ──
function run(id: string, seedTowers: TowerKind[]) {
  const l = LEVEL_BY_ID.get(id)!;
  const j = new Journey(l.def, SONGS[l.def.song].bpm);
  let k = 0;
  const step = () => {
    for (let s = 0; s < j.slotsOpen; s++) {
      if (j.towerAt(s)) continue;
      const kind = seedTowers[k % seedTowers.length];
      if (j.coins >= TOWERS[kind].levels[0].cost && j.build(s, kind)) k++;
      break;
    }
    const t = j.towers.slice().sort((a, b) => a.level - b.level).find((x) => (j.upgradeCost(x) ?? Infinity) <= j.coins);
    if (t && j.towers.length >= j.slotsOpen) j.upgrade(t);
    for (const p of j.pickups) if (!p.taken && !p.lost && Math.hypot(p.x - j.turtle.x, p.z - j.turtle.z) < 30) j.collect(p.id);
  };
  for (let i = 0; i < 6; i++) step();
  j.begin();
  let t = 0;
  while (j.outcome === 'playing' && t < 600) {
    t += 0.1;
    j.advance(t);
    j.drain();
    step();
  }
  return j;
}
const a = run('m1', ['harp']);
const b = run('m1', ['harp']);
check('deterministic outcome', a.outcome === b.outcome && a.lives === b.lives && a.coins === b.coins, `${a.lives}/${b.lives} ${a.coins}/${b.coins}`);
check('m1 winnable', a.outcome === 'victory', a.outcome);
check('m2 winnable', run('m2', ['harp', 'drum']).outcome === 'victory');
check('m3 winnable', run('m3', ['harp', 'harp', 'drum', 'harp', 'bell']).outcome === 'victory');

// ── saves ──
const s = newSave(1);
s.levels.m1 = { stars: 3 };
s.knownTowers = ['harp'];
const back = saveFromCode(saveToCode(s));
check('save code round-trip', !!back && back.levels.m1.stars === 3 && back.knownTowers[0] === 'harp');
check('save rejects junk', validate({ nope: 1 }) === null && saveFromCode('FF1:%%%') === null);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
