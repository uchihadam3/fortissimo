/**
 * Plays every journey headless with three bots and reports the outcome.
 *   npx tsx tools/balance.ts [levelId…] [--mode virtuoso] [--bots good,novice,spam] [--detail]
 *   npx tsx tools/balance.ts --tune [levelId…]   (prints difficulty factors per movement for TUNE)
 *
 * good:   varied band, duets, golden notes, upgrades, placement by threat direction
 * novice: slow decisions, obvious moves (the next instrument on the first free plate)
 * spam:   one instrument only (the best of all single-instrument bands is shown)
 */
import { CAMPAIGN, TUNE, rebuildDef, tunable, type LevelEntry } from '../src/data/campaign';
import type { JourneyDef, Mode } from '../src/sim/journey';
import { SONGS } from '../src/sim/defs';
import { playBot, playSpam, type BotResult } from '../src/sim/bots';

const args = process.argv.slice(2);
const mode: Mode = args.includes('--mode') ? (args[args.indexOf('--mode') + 1] as Mode) : 'normal';
const bots = (args.includes('--bots') ? args[args.indexOf('--bots') + 1] : 'good,novice,spam').split(',');
const detail = args.includes('--detail');
const skip = new Set([mode, bots.join(',')]);
const ids = args.filter((a) => !a.startsWith('--') && !skip.has(a));

/** lives the good bot may lose over a whole journey when it plays at the edge of its skill */
function targetLives(l: LevelEntry): number {
  if (l.id === 'm1') return 0;
  if (l.id === 'm2') return 1;
  if (l.id === 'm3') return 2;
  if (l.id === 'm4') return 3;
  if (l.kind === 'extra') return l.world === 'meadow' ? 9 : 12;
  if (l.kind === 'secret') return 13;
  if (l.kind === 'boss') return 8;
  return 7;
}

/**
 * Lives taken by the creatures of each movement (cumulative), wherever they bite, and the movement
 * of a defeat. Plays on until a whole movement after `stopAfter` has passed, so stragglers count.
 */
function perMovement(def: JourneyDef, stopAfter: number) {
  const lost: number[] = def.movements!.map(() => 0);
  const r = playBot(def, 'good', {
    mode,
    onEvents: (evs, j) => {
      for (const ev of evs) {
        if (ev.type !== 'leak') continue;
        const w = ev.enemy.wave >= 0 ? j.waves[ev.enemy.wave] : null;
        const k = w ? j.movementAt(w.bar) : j.movement;
        lost[k] += ev.lives;
      }
    },
    until: (j) => j.movement > stopAfter + 1,
  });
  const j = r.j;
  const marks: number[] = [];
  let acc = 0;
  for (let k = 0; k < lost.length; k++) marks[k] = acc += lost[k];
  return { marks, defeat: j.outcome === 'defeat' ? j.movement : -1, j };
}

if (args.includes('--tune')) {
  // each generated movement in turn: the largest difficulty the good bot survives within its share of lives
  const out: Record<string, number[]> = {};
  for (const l of CAMPAIGN) {
    if (ids.length && !ids.includes(l.id)) continue;
    const gen = tunable(l.id);
    const M = gen.length;
    const tune = gen.map((_, k) => TUNE[l.id]?.[k] ?? 1);
    const total = targetLives(l);
    // later movements may cost more lives than the first ones (weights 1, 2, 3…)
    const wsum = (M * (M + 1)) / 2;
    for (let k = 0; k < M; k++) {
      if (!gen[k]) continue;
      // its own share of the lives (at least one: a single slip is noise)
      const cap = Math.max(1, Math.round((total * (k + 1)) / wsum));
      const ok = (s: number) => {
        tune[k] = s;
        const r = perMovement(rebuildDef(l.id, tune), k);
        return !((r.defeat >= 0 && r.defeat <= k) || r.marks[k] - (k > 0 ? r.marks[k - 1] : 0) > cap);
      };
      // a smooth ramp: a movement is at most 2.5× the one before
      const prev = gen.slice(0, k).lastIndexOf(true);
      const hi = prev >= 0 ? tune[prev] * 2.5 : 12;
      // coarse steps up from easy (the largest of two successes in a row; three failures end the
      // scan), then finer steps past it
      let best = 0.25;
      let prevOk = false;
      let fails = 0;
      for (let s = 0.25; s <= hi * 1.001; s *= 1.25) {
        const good = ok(s);
        if (good && (prevOk || s === 0.25)) best = s;
        fails = good ? 0 : fails + 1;
        prevOk = good;
        if (fails >= 3) break;
      }
      const top = Math.min(hi, best * 1.24);
      for (let s = best * 1.06; s <= top; s *= 1.06) {
        if (!ok(s)) break;
        best = s;
      }
      tune[k] = best;
    }
    out[l.id] = tune.map((x) => Math.round(x * 100) / 100);
    console.log(`  ${l.id}: [${out[l.id].join(', ')}],`);
  }
  process.exit(0);
}

const cell = (r: BotResult | null) => {
  if (!r) return '—'.padEnd(17);
  const j = r.j;
  const out = j.outcome === 'victory' ? `win ${j.stars()}★` : j.outcome === 'defeat' ? `LOSE m${j.movement + 1}` : 'timeout';
  return `${out.padEnd(8)} ${String(j.lives).padStart(2)}/${j.maxLives}`.padEnd(17);
};

console.log(`mode ${mode}`);
console.log('id  kind    bars  min  mov plates  | good              novice            spam (best kind)');
for (const l of CAMPAIGN) {
  if (ids.length && !ids.includes(l.id)) continue;
  const d = l.def;
  const min = (d.bars * 4) / SONGS[d.song].bpm;
  const movs = d.movements?.length ?? 1;
  const plates = `${d.slots}→${Math.min(12, d.slots + movs - 1)}`;
  const g = bots.includes('good') ? playBot(d, 'good', { mode }) : null;
  const n = bots.includes('novice') ? playBot(d, 'novice', { mode }) : null;
  const s = bots.includes('spam') ? playSpam(d, mode) : null;
  console.log(
    `${l.id.padEnd(3)} ${l.kind.padEnd(6)} ${String(d.bars).padStart(4)} ${min.toFixed(1).padStart(4)} ${String(movs).padStart(4)} ${plates.padStart(6)}  | ${cell(g)} ${cell(n)} ${cell(s)}${s ? ` ${s.kind}` : ''}`,
  );
  if (detail && g) {
    const j = g.j;
    const dmg = Object.entries(j.stats.damageByKind).map(([k, v]) => `${k} ${Math.round(v! / 1000)}k`).join(' ');
    console.log(`      good: towers ${j.towers.map((x) => x.kind.slice(0, 2) + x.level).join(' ')} · harmony ${j.band.harmony} duets ${j.band.duets.map((x) => x.id).join(',')} · coins ${j.coins} · kills ${j.stats.kills} · ff ${j.stats.ffUses} · heals ${j.stats.heals} · ${dmg}`);
  }
}
