/**
 * Plays every journey headless with a reasonable bot and reports the outcome.
 *   npx tsx tools/balance.ts [levelId…] [--mode virtuoso] [--lazy]
 */
import { CAMPAIGN } from '../src/data/campaign';
import { Journey, type JourneyDef, type Mode } from '../src/sim/journey';
import { SONGS, TOWERS, type TowerKind } from '../src/sim/defs';

function play(def: JourneyDef, mode: Mode, skill: 'good' | 'lazy') {
  const j = new Journey(def, SONGS[def.song].bpm, { mode });
  const prio: TowerKind[] = ['harp', 'drum', 'bell', 'crystal', 'harp', 'horn', 'bass', 'choir', 'drum', 'crystal', 'horn', 'bass'];
  const want = prio.filter((k) => def.towers.includes(k));
  let wi = 0;
  const shaker = def.towers.includes('shaker') && skill === 'good';
  const step = () => {
    // economy first on bigger maps
    if (shaker && !j.towers.some((t) => t.kind === 'shaker') && j.slotsOpen >= 6 && j.coins >= 60) {
      for (let s = j.slotsOpen - 1; s >= 0; s--) if (!j.towerAt(s)) {
        j.build(s, 'shaker');
        break;
      }
    }
    // a good player keeps a few strong towers rather than many weak ones
    const fighters = j.towers.filter((t) => t.kind !== 'shaker');
    const weak = fighters.filter((t) => t.level === 0).length;
    const preferUpgrade = skill === 'good' && fighters.length >= 4 && weak >= 2;
    if (!preferUpgrade) {
      for (let s = 0; s < j.slotsOpen; s++) {
        if (j.towerAt(s)) continue;
        const k = want[wi % want.length];
        if (j.coins >= TOWERS[k].levels[0].cost) {
          if (j.build(s, k)) wi++;
        }
        break;
      }
    }
    if (j.towers.length >= j.slotsOpen || preferUpgrade || (skill === 'good' && j.coins > 260)) {
      const t = fighters.slice().sort((a, b) => a.level - b.level).find((x) => (j.upgradeCost(x) ?? Infinity) <= j.coins);
      if (t) j.upgrade(t);
    }
    if (skill === 'good') {
      for (const p of j.pickups) if (!p.taken && !p.lost && Math.hypot(p.x - j.turtle.x, p.z - j.turtle.z) < 32) j.collect(p.id);
      if (j.ffReady()) {
        const near = j.enemies.filter((e) => e.alive && Math.hypot(e.x - j.turtle.x, e.z - j.turtle.z) < 16).length;
        if (near >= 6 || j.bossAlive()) j.unleash();
      }
    }
  };
  for (let i = 0; i < 8; i++) step();
  j.begin();
  let t = 0;
  while (j.outcome === 'playing' && t < 1200) {
    t += 0.1;
    j.advance(t);
    j.drain();
    step();
  }
  return { j, t };
}

const args = process.argv.slice(2);
const mode: Mode = args.includes('--mode') ? (args[args.indexOf('--mode') + 1] as Mode) : 'normal';
const skill = args.includes('--lazy') ? 'lazy' : 'good';
const ids = args.filter((a) => !a.startsWith('--') && a !== mode);
for (const l of CAMPAIGN) {
  if (ids.length && !ids.includes(l.id)) continue;
  const { j, t } = play(l.def, mode, skill);
  const threat = l.def.waves.reduce((a, w) => a + w.groups.reduce((b, g) => b + g.count, 0), 0);
  console.log(
    `${l.id.padEnd(3)} ${l.kind.padEnd(6)} ${j.outcome.padEnd(8)} lives ${String(j.lives).padStart(2)}/${j.maxLives} stars ${j.stars()} t ${t.toFixed(0).padStart(4)}s ` +
      `kills ${String(j.stats.kills).padStart(3)} spawned≈${threat} towers ${j.towers.map((x) => x.kind[0] + x.level).join(' ')} coins ${j.coins}`,
  );
}
