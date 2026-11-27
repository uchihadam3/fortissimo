/**
 * Headless checks: campaign integrity and lengths, simulation determinism (and independence from
 * how often it is advanced), checkpoint replays, the band (harmony, duets and their effects), every
 * creature ability, the viradas (patterns, cue, rewards, the bosses' truce), the flawless run (every
 * life kept), the bots' verdicts (the good bot wins every main journey, the novice gets
 * through the first land, a one-instrument band falls from m3 on) and save codes.
 * Run with `npm test`.
 */
import { CAMPAIGN, LEVEL_BY_ID, endlessDef } from '../src/data/campaign';
import { Journey, SUB, SUBS_PER_BAR, type Blow, type Enemy, type JourneyDef, type SimEvent, type Tower } from '../src/sim/journey';
import { BOSSES, DUEL, MID_BOSSES, parryQuality, shieldOf } from '../src/sim/bosses';
import { BAND, ENEMIES, SONGS, TOWERS, TOWER_KINDS, WORLDS, type EnemyKind, type TowerKind } from '../src/sim/defs';
import { Power, RHYTHM, VIRADA, grooveOf, nearestGrid, powerMul, quality, viradaMarks, viradaPattern, viradaReward, viradaSpan } from '../src/sim/rhythm';
import { SLOTS, SLOT_NEIGHBOURS } from '../src/sim/shell';
import { playBot, playSpam } from '../src/sim/bots';
import { checkpointOf, newSave, rememberCheckpoint, saveFromCode, saveToCode, validate } from '../src/core/save';
import type { Checkpoint } from '../src/sim/journey';
import { Rng } from '../src/core/rng';

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else {
    failed++;
    console.error(`✗ ${name} ${detail}`);
  }
}
const t0 = Date.now();
let tSec = Date.now();
/** progress (VERBOSE=1 prints how long each part takes) */
function section(name: string) {
  if (process.env.VERBOSE) console.log(`… ${name} (${((Date.now() - tSec) / 1000).toFixed(1)} s)`);
  tSec = Date.now();
}

// ───────────────────────────── campaign integrity ─────────────────────────────
const ids = new Set<string>();
for (const l of CAMPAIGN) {
  const d = l.def;
  check(`unique id ${l.id}`, !ids.has(l.id));
  ids.add(l.id);
  check(`${l.id} has waves`, d.waves.length > 0);
  for (const r of l.requires) check(`${l.id} requires ${r}`, LEVEL_BY_ID.has(r));
  check(`${l.id} map pos`, l.map[0] >= 0 && l.map[0] <= 160 && l.map[1] >= 0 && l.map[1] <= 90);
  check(`${l.id} slots`, d.slots >= 1 && d.slots <= SLOTS.length);
  check(`${l.id} song`, !!SONGS[d.song]);
  for (const w of d.waves) for (const g of w.groups) check(`${l.id} enemy ${g.kind}`, !!ENEMIES[g.kind] && g.count > 0 && g.every > 0);
  for (const k of d.towers) check(`${l.id} tower ${k}`, !!TOWERS[k]);
  // movements: 3 to 5, breathers of 6 to 10 bars, every wave inside the journey
  const mv = d.movements ?? [];
  check(`${l.id} movements`, mv.length >= 3 && mv.length <= 5, `${mv.length}`);
  check(`${l.id} first movement at 0`, mv[0]?.bar === 0 && mv[0]?.rest === 0);
  for (let k = 1; k < mv.length; k++) check(`${l.id} breather ${k}`, mv[k].rest >= 6 && mv[k].rest <= 10 && mv[k].bar > mv[k - 1].bar);
  check(`${l.id} waves inside`, d.waves.every((w) => w.bar >= 0 && w.bar < d.bars));
  check(`${l.id} waves sorted`, d.waves.every((w, i) => i === 0 || d.waves[i - 1].bar <= w.bar));
  check(`${l.id} plates grow`, Math.min(12, d.slots + mv.length - 1) > d.slots);
  // no wave during a breather
  for (let k = 1; k < mv.length; k++) {
    const inRest = d.waves.some((w) => w.bar >= mv[k].bar - mv[k].rest && w.bar < mv[k].bar);
    check(`${l.id} breather ${k} is calm`, !inRest);
  }
  if (d.boss) check(`${l.id} guardian in the last movement`, d.boss.bar >= mv[mv.length - 1].bar);
  // lengths (minutes at the song's tempo)
  const min = (d.bars * 4) / SONGS[d.song].bpm;
  const range: [number, number] = l.id === 'm1' ? [3.6, 4.6] : l.id === 'cx' ? [9.3, 10.7] : l.kind === 'boss' || l.kind === 'extra' ? [7, 9.2] : [5, 7];
  check(`${l.id} length ${min.toFixed(1)} min`, min >= range[0] && min <= range[1], `${range}`);
}
check('first journey is open', CAMPAIGN[0].requires.length === 0);
check('endless def', endlessDef('meadow').waves.length > 20);
// the families live where the story puts them
const familyOf: Partial<Record<EnemyKind, string>> = { scorpion: 'desert', whirl: 'desert', wolf: 'ice', phantom: 'ice', muffler: 'ice', ember: 'forge', slug: 'forge', mender: 'forge', mimic: 'citadel', knight: 'citadel', conductor: 'citadel' };
for (const [kind, world] of Object.entries(familyOf)) {
  const first = CAMPAIGN.find((l) => l.def.waves.some((w) => w.groups.some((g) => g.kind === kind)));
  check(`${kind} first appears in ${world}`, first?.world === world, first?.id);
}
const meadow = new Set(CAMPAIGN.filter((l) => l.world === 'meadow').flatMap((l) => l.def.waves.flatMap((w) => w.groups.filter((g) => !ENEMIES[g.kind].boss).map((g) => g.kind))));
check('meadow family', [...meadow].every((k) => ['blot', 'scurry', 'bubble', 'moth'].includes(k)), [...meadow].join(','));

// ───────────────────────────── helpers ─────────────────────────────
const T8: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];
function arenaDef(o: Partial<JourneyDef> = {}): JourneyDef {
  return {
    id: 'test', world: 'meadow', song: 'meadow', name: { pt: '', en: '' }, bars: 60, slots: 12, coins: 100000, towers: T8,
    waves: [], features: [], pickups: 0, seed: 3, ...o,
  };
}
type Spawner = { addEnemy(kind: EnemyKind, x: number, z: number, hpMul: number, wave: number, t: number): Enemy };
/** a creature `d` units in front of the colossus */
function spawn(j: Journey, kind: EnemyKind, d = 12, side = 0, hp = 1): Enemy {
  const T = j.turtle;
  return (j as unknown as Spawner).addEnemy(kind, T.x + T.dx * d - T.dz * side, T.z + T.dz * d + T.dx * side, hp, -1, j.time);
}
function run(j: Journey, seconds: number, each?: (evs: SimEvent[]) => void) {
  const end = j.time + seconds;
  while (j.time < end - 1e-9 && j.outcome === 'playing') {
    // (always a little forward: the simulation only stops on its sub-step grid)
    j.advance(j.time + 0.1);
    const evs = j.drain();
    each?.(evs);
  }
}
const bpm = SONGS.meadow.bpm;

section('determinism');
// ───────────────────────────── determinism ─────────────────────────────
{
  const d = LEVEL_BY_ID.get('m3')!.def;
  const a = playBot(d, 'good'), b = playBot(d, 'good');
  check('deterministic outcome', a.j.fingerprint() === b.j.fingerprint(), `${a.j.lives}/${b.j.lives}`);
  check('m1 first contact: the glove\'s single harp', (() => {
    const j = new Journey(LEVEL_BY_ID.get('m1')!.def, SONGS.meadow.bpm);
    j.build(0, 'harp');
    j.begin();
    const firstWaveEnd = (j.startBar! + LEVEL_BY_ID.get('m1')!.def.waves[1].bar) * j.barDur;
    run(j, firstWaveEnd);
    return j.stats.leaks === 0 && j.stats.kills >= 2;
  })());
}

// the state never depends on how often the simulation is advanced (frames of any size)
{
  const d = LEVEL_BY_ID.get('d1')!.def;
  const live = playBot(d, 'good', { until: (j) => j.journeyBar !== null && j.journeyBar > 70 });
  const target = live.j.sub;
  const actions = live.j.log.filter((a) => a.sub <= target);
  const odd = new Journey(d, SONGS[d.song].bpm);
  const rng = new Rng(12345);
  const rnd = () => rng.next();
  for (const a of actions) {
    // ragged frames up to the action, then exactly onto its sub-step
    while (odd.time < a.sub * odd.subDur - 0.05) odd.advance(Math.min(a.sub * odd.subDur, odd.time + rnd() * 0.09 + 0.001));
    odd.advanceToSub(a.sub);
    odd.apply(a);
    odd.drain();
  }
  while (odd.time < target * odd.subDur - 0.05) odd.advance(Math.min(target * odd.subDur, odd.time + rnd() * 0.07));
  odd.advanceToSub(target);
  check('frame size does not matter', odd.fingerprint() === live.j.fingerprint(), `\n  ${odd.fingerprint().slice(0, 160)}\n  ${live.j.fingerprint().slice(0, 160)}`);
}

section('checkpoints');
// ───────────────────────────── checkpoints ─────────────────────────────
let someCp: Checkpoint | null = null;
for (const id of ['m3', 'i2', 'c1']) {
  const d = LEVEL_BY_ID.get(id)!.def;
  const bpmL = SONGS[d.song].bpm;
  // a live game (keeping the beat), frozen as it reaches a point well inside the third movement
  const live = playBot(d, 'good', { rhythm: 0.6, until: (j) => j.movement >= 2 && j.journeyBar! >= j.movements[2].bar + 3 });
  const L = live.j;
  const cp = L.checkpoint();
  check(`${id} checkpoint exists`, !!cp && cp.movement === 2, JSON.stringify(cp && { m: cp.movement, s: cp.sub }));
  if (!cp) continue;
  check(`${id} checkpoint on a bar line`, cp.sub % SUBS_PER_BAR === 0);
  check(`${id} checkpoint belongs to this journey`, Journey.canResume(d, cp) && !Journey.canResume({ ...d, waves: d.waves.slice(1) }, cp));
  someCp = cp;
  // replaying up to the live moment gives exactly the live state
  const now = Journey.replay(d, bpmL, { ...cp, sub: L.sub, actions: L.log.filter((a) => a.sub <= L.sub) });
  check(`${id} replay == live`, now.fingerprint() === L.fingerprint(), `\n  ${now.fingerprint().slice(0, 200)}\n  ${L.fingerprint().slice(0, 200)}`);
  // the checkpoint itself: the breather of the third movement, and it can be played on to the end
  const at = Journey.replay(d, bpmL, cp);
  check(`${id} replay stops at the checkpoint`, at.sub === cp.sub && at.movement === 2 && at.inBreather(), `${at.sub}/${cp.sub} m${at.movement}`);
  check(`${id} replay keeps the log`, at.log.length === cp.actions.length);
  // playing on from the checkpoint with the same actions as the live game reaches the same moment
  for (const a of L.log.filter((x) => x.sub > cp.sub)) {
    at.advanceToSub(a.sub);
    at.apply(a);
  }
  at.advanceToSub(L.sub);
  check(`${id} checkpoint + play on == live`, at.fingerprint() === L.fingerprint());
}
{
  // falling in the first movement: no checkpoint (only a full restart)
  const j = new Journey(LEVEL_BY_ID.get('d1')!.def, SONGS.desert.bpm);
  j.begin();
  run(j, 10);
  check('no checkpoint in the first movement', j.checkpoint() === null);
}

section('band');
// ───────────────────────────── the band ─────────────────────────────
{
  const j = new Journey(arenaDef(), bpm);
  const evs: SimEvent[] = [];
  const h = j.build(0, 'harp')!;
  const dr = j.build(1, 'drum')!;
  evs.push(...j.drain());
  check('adjacent slots 0-1', SLOT_NEIGHBOURS[0].includes(1));
  check('march duet formed', j.band.duets.some((d) => d.id === 'march' && d.a === h.id && d.b === dr.id));
  check('duet event', evs.some((e) => e.type === 'duet' && e.id === 'march' && e.formed));
  check('band event', evs.some((e) => e.type === 'band'));
  check('harmony 1 (strings + percussion)', j.band.harmony === 1 && j.band.sections.strings === 1 && j.band.sections.percussion === 1);
  check('harmony multiplier', Math.abs(j.harmonyMul - (1 + BAND.harmonyStep)) < 1e-9);
  j.build(2, 'bell');
  j.build(4, 'horn');
  j.build(5, 'choir');
  j.build(3, 'bass');
  check('harmony 5 with all six sections', j.band.harmony === 5, `${j.band.harmony}`);
  const ids = new Set(j.band.duets.map((d) => d.id));
  // 0 harp, 1 drum, 2 bell, 3 bass, 4 horn, 5 choir: 0-1 march, 1-4 fanfare, 0-5 serenade, 2-5 hymn
  check('duets on the inner ring', ['march', 'fanfare', 'serenade', 'hymn'].every((x) => ids.has(x as never)), [...ids].join(','));
  // a silenced tower leaves the band
  const bell = j.towerAt(2)!;
  bell.frozenUntil = j.time + 10;
  run(j, 0.5);
  check('frozen tower muted', bell.muted && bell.muteCause === 'freeze');
  check('muted tower leaves the band', j.band.sections.bells === 0 && !j.band.duets.some((d) => d.id === 'hymn'));
  j.sell(dr);
  const after = j.drain();
  check('selling breaks duets', after.some((e) => e.type === 'duet' && e.id === 'march' && !e.formed) && !j.band.duets.some((d) => d.id === 'march'));
}

/** damage a lone tower setup deals to a stream of creatures in front of the colossus */
function trial(build: [number, TowerKind, number?][], enemy: EnemyKind, seconds = 12, opts: { hp?: number; every?: number; side?: number; d?: number } = {}) {
  const j = new Journey(arenaDef(), bpm);
  for (const [slot, kind, level] of build) {
    const t = j.build(slot, kind)!;
    for (let i = 0; i < (level ?? 0); i++) j.upgrade(t);
  }
  j.drain();
  const evs: SimEvent[] = [];
  let next = 0;
  const end = j.time + seconds;
  while (j.time < end) {
    if (j.time >= next) {
      spawn(j, enemy, opts.d ?? 9, opts.side ?? 0, opts.hp ?? 3);
      next = j.time + (opts.every ?? 1.2);
    }
    j.advance(j.time + 0.1);
    evs.push(...j.drain());
  }
  const harp = j.towers.find((t) => t.kind === 'harp');
  return { j, evs, harpShots: harp?.shots ?? 0, dmg: (k: TowerKind) => j.stats.damageByKind[k] ?? 0 };
}
{
  // march: the harp plucks along with every drum hit
  const solo = trial([[0, 'harp']], 'blot');
  const duo = trial([[0, 'harp'], [1, 'drum']], 'blot');
  const apart = trial([[0, 'harp'], [3, 'drum']], 'blot');
  check('march: more harp notes beside a drum', duo.harpShots > solo.harpShots * 1.3, `${solo.harpShots} → ${duo.harpShots}`);
  check('march: only on adjacent plates', apart.harpShots < duo.harpShots, `${apart.harpShots}`);
  // groundwork: creatures stumble
  const gw = trial([[1, 'drum'], [4, 'bass']], 'shell');
  check('groundwork: stumbles', gw.evs.some((e) => e.type === 'stumble'));
  check('groundwork: none without the partner', !trial([[1, 'drum'], [3, 'bass']], 'shell').evs.some((e) => e.type === 'stumble'));
  // shimmer: longer, chilling chains
  const chainHits = (r: ReturnType<typeof trial>) => {
    let n = 0, s = 0;
    for (const e of r.evs) if (e.type === 'impact' && e.shot.kind === 'crystal') {
      n += e.shot.hits.length;
      s++;
    }
    return n / Math.max(1, s);
  };
  const cr = trial([[3, 'crystal']], 'blot', 14, { every: 0.25, hp: 6 });
  const sh = trial([[3, 'crystal'], [2, 'bell']], 'blot', 14, { every: 0.25, hp: 6 });
  check('shimmer: chains reach more creatures', chainHits(sh) > chainHits(cr), `${chainHits(cr).toFixed(2)} → ${chainHits(sh).toFixed(2)}`);
  // fanfare: stronger horn
  const hornAlone = trial([[4, 'horn']], 'shell', 14);
  const fanfare = trial([[4, 'horn'], [1, 'drum']], 'shell', 14);
  const perShot = (r: ReturnType<typeof trial>) => {
    const s = r.evs.filter((e) => e.type === 'fire' && e.shot.kind === 'horn');
    return s.length ? s.reduce((a, e) => a + (e.type === 'fire' ? e.shot.damage : 0), 0) / s.length : 0;
  };
  check('fanfare: horn waves hit harder', perShot(fanfare) > perShot(hornAlone) * 1.2, `${perShot(hornAlone).toFixed(1)} → ${perShot(fanfare).toFixed(1)}`);
  // serenade: chords splash
  const ser = trial([[0, 'harp'], [5, 'choir']], 'blotling', 12, { every: 0.2, hp: 3 });
  const splash = ser.evs.some((e) => e.type === 'impact' && e.shot.kind === 'harp' && e.shot.hits.length > 1);
  check('serenade: harp chords hit neighbours', splash);
  // thunder: a bass drop calls the crystal's chain
  const th = trial([[3, 'crystal'], [4, 'bass']], 'shell', 16, { every: 0.6 });
  const thAlone = trial([[3, 'crystal'], [9, 'bass']], 'shell', 16, { every: 0.6 });
  check('thunder: crystal joins the bass drops', th.dmg('crystal') > thAlone.dmg('crystal') * 1.2, `${Math.round(thAlone.dmg('crystal'))} → ${Math.round(th.dmg('crystal'))}`);
  // groove: richer shaker
  const income = (slots: [number, TowerKind][]) => {
    const j = new Journey(arenaDef(), bpm);
    for (const [s, k] of slots) j.build(s, k);
    j.begin();
    let got = 0;
    run(j, 30, (evs) => evs.forEach((e) => e.type === 'income' && (got += e.amount)));
    return got;
  };
  check('groove: more notes per bar', income([[0, 'shaker'], [1, 'drum']]) > income([[0, 'shaker'], [3, 'drum']]) * 1.3);
  // hymn: the colossus heals (capped)
  {
    const j = new Journey(arenaDef({ bars: 120 }), bpm);
    j.build(2, 'bell');
    j.build(5, 'choir');
    j.lives = 10;
    j.begin();
    run(j, 140);
    check('hymn heals the colossus', j.lives > 10 && j.stats.heals > 0 && j.stats.heals <= BAND.hymnCap, `${j.lives} (${j.stats.heals})`);
  }
  // harmony: a varied band hits harder than the same towers in unison
  const mixed = trial([[0, 'harp'], [3, 'bell'], [4, 'horn'], [7, 'bass']], 'blot', 6);
  check('harmony multiplies damage', mixed.j.harmonyMul > 1.3);
}

section('bestiary');
// ───────────────────────────── the bestiary ─────────────────────────────
{
  // deflect: a whirl ignores harp notes, not the drum
  const harp = trial([[0, 'harp', 2]], 'whirl', 10, { hp: 1 });
  const drum = trial([[0, 'drum', 2]], 'whirl', 10, { hp: 1 });
  check('deflect: harp passes through the whirl', harp.dmg('harp') === 0 && harp.evs.some((e) => e.type === 'deflect' || e.type === 'leak'));
  check('deflect: the drum hurts it', drum.dmg('drum') > 0);
  // aura: a whirl pushes its neighbours on
  const pace = (withWhirl: boolean) => {
    const j = new Journey(arenaDef(), bpm);
    const b = spawn(j, 'blot', 25);
    if (withWhirl) spawn(j, 'whirl', 25.5, 1.2);
    const z0 = Math.hypot(b.x - j.turtle.x, b.z - j.turtle.z);
    run(j, 1.5);
    return z0 - Math.hypot(b.x - j.turtle.x, b.z - j.turtle.z);
  };
  check('aura: whirl speeds its neighbours', pace(true) > pace(false) * 1.15, `${pace(false).toFixed(2)} → ${pace(true).toFixed(2)}`);
  // conductor: creatures near it surge on the downbeat
  const surge = (withConductor: boolean) => {
    const j = new Journey(arenaDef(), bpm);
    const b = spawn(j, 'blot', 28);
    if (withConductor) spawn(j, 'conductor', 29, 2);
    const z0 = Math.hypot(b.x - j.turtle.x, b.z - j.turtle.z);
    run(j, j.barDur * 2);
    return z0 - Math.hypot(b.x - j.turtle.x, b.z - j.turtle.z);
  };
  check('aura: the conductor drives them on the downbeat', surge(true) > surge(false) * 1.1);
  // echo: comes back once, at half health, one bar later
  {
    const j = new Journey(arenaDef(), bpm);
    const e = spawn(j, 'echo', 14);
    (j as unknown as { damage(e: Enemy, a: number, t: string, tw: Tower | null, at: number): void }).damage(e, 9999, 'bass', null, j.time);
    let back: Enemy | null = null;
    let backT = 0;
    const tDeath = j.time;
    run(j, j.barDur * 1.5, (evs) => evs.forEach((ev) => {
      if (ev.type === 'echo') {
        back = ev.enemy;
        backT = ev.t;
      }
    }));
    check('echo returns', !!back, '');
    const b2 = back as Enemy | null;
    check('echo returns one bar later, at half health', !!b2 && Math.abs(backT - tDeath - j.barDur) < j.stepDur + 1e-6 && Math.abs(b2.maxHp - ENEMIES.echo.hp * ENEMIES.echo.echo!) < 1e-6);
    if (b2) {
      (j as unknown as { damage(e: Enemy, a: number, t: string, tw: Tower | null, at: number): void }).damage(b2, 9999, 'bass', null, j.time);
      let again = false;
      run(j, j.barDur * 1.5, (evs) => evs.forEach((ev) => ev.type === 'echo' && (again = true)));
      check('echo returns only once', !again);
    }
  }
  // burrow: a scorpion dives, untouchable, one bar of every four
  {
    const j = new Journey(arenaDef(), bpm);
    const s = spawn(j, 'scorpion', 30);
    let dove = 0, rose = 0, hitWhileUnder = false;
    j.build(0, 'harp');
    for (let i = 0; i < 160 && s.alive; i++) {
      j.advance(j.time + 0.1);
      for (const ev of j.drain()) {
        if (ev.type === 'burrow' && ev.enemy === s) ev.on ? dove++ : rose++;
        if (ev.type === 'damage' && ev.enemy === s && s.burrowed) hitWhileUnder = true;
      }
    }
    check('burrow: dives and surfaces', dove >= 1 && rose >= 1, `${dove}/${rose}`);
    check('burrow: untouchable underground', !hitWhileUnder);
  }
  // pack: wolves come in packs
  const wolfGroups = CAMPAIGN.flatMap((l) => l.def.waves.flatMap((w) => w.groups)).filter((g) => g.kind === 'wolf');
  check('pack: wolves in packs', wolfGroups.length > 0 && wolfGroups.every((g) => g.every <= 0.5) && wolfGroups.filter((g) => g.count >= 4).length > wolfGroups.length * 0.6);
  // disable: a lava slug's bite puts out the nearest plate
  {
    const j = new Journey(arenaDef(), bpm);
    const near = j.build(6, 'harp')!;
    j.build(11, 'drum');
    spawn(j, 'slug', 8);
    let ev: SimEvent | null = null;
    for (let i = 0; i < 300 && !ev; i++) {
      j.advance(j.time + 0.1);
      for (const e of j.drain()) if (e.type === 'disable') ev = e;
    }
    const d = ev as (SimEvent & { type: 'disable' }) | null;
    check('disable: the bite silences the nearest tower', !!d && d.tower === near && Math.abs(d.until - d.t - ENEMIES.slug.disable! * j.barDur) < 1e-6);
    run(j, 0.3);
    check('disable: muted, out of the band', near.muted && near.muteCause === 'disable' && j.band.sections.strings === 0);
    run(j, ENEMIES.slug.disable! * j.barDur + 0.5);
    check('disable: plays again afterwards', !near.muted);
  }
  // mimic: copies the most common instrument and silences all of them while it lives
  {
    const j = new Journey(arenaDef(), bpm);
    const harps = [j.build(0, 'harp')!, j.build(1, 'harp')!, j.build(2, 'harp')!];
    const drum = j.build(4, 'drum')!;
    j.drain();
    const m = spawn(j, 'mimic', 30);
    const evs = j.drain();
    check('mimic: copies the most common instrument', m.mimicKind === 'harp');
    check('mimic: event with the copied towers', evs.some((e) => e.type === 'mimic' && e.kind === 'harp' && e.towers.length === 3));
    check('mimic: every copied tower falls silent', harps.every((h) => h.muted && h.muteCause === 'mimic') && !drum.muted);
    check('mimic: the band loses that section', j.band.sections.strings === 0);
    const late = j.build(3, 'harp')!;
    check('mimic: a new copy is silent too', late.muted);
    const m2 = spawn(j, 'mimic', 30, 3);
    check('mimic: a second one copies something else', m2.mimicKind === 'drum');
    (j as unknown as { damage(e: Enemy, a: number, t: string, tw: Tower | null, at: number): void }).damage(m, 9999, 'bass', null, j.time);
    run(j, 0.3);
    check('mimic: they play again when it falls', harps.every((h) => !h.muted) && drum.muted);
  }
  // steady: bells cannot slow a knight
  {
    const j = new Journey(arenaDef(), bpm);
    j.build(0, 'bell');
    const k = spawn(j, 'knight', 8);
    const b = spawn(j, 'blot', 8, 2);
    run(j, 3);
    check('steady: the knight is not slowed', k.slowUntil <= j.time - 1 || k.slow === 1);
    check('steady: the blot is', b.slowUntil > 0 && b.slow < 1);
  }
  // guardians stalk at arm's length before they charge
  {
    const j = new Journey(arenaDef({ bars: 200 }), bpm);
    j.begin();
    run(j, j.barDur * 2);
    const g = spawn(j, 'bossBlot', 30);
    run(j, j.barDur * 10);
    const d = Math.hypot(g.x - j.turtle.x, g.z - j.turtle.z);
    check('guardian stalks', g.alive && !g.charging && d > 8 && d < 14, d.toFixed(1));
  }
}

section('plates');
// ───────────────────────────── plates, notes, movements ─────────────────────────────
{
  // (an empty road: only the music, the breathers and the plates)
  const d = { ...LEVEL_BY_ID.get('m2')!.def, waves: [] };
  const j = new Journey(d, SONGS[d.song].bpm);
  check('plates start few', j.slotsOpen === d.slots && j.slotsMax === Math.min(12, d.slots + d.movements!.length - 1));
  const golden = j.pickups.filter((p) => p.breather !== undefined);
  check('golden notes for every breather', golden.length >= (d.movements!.length - 1) * 6);
  j.begin();
  const plates: number[] = [];
  const moves: number[] = [];
  run(j, (d.movements![2].bar + 2) * j.barDur + 4, (evs) => evs.forEach((e) => {
    if (e.type === 'plate') plates.push(e.slot);
    if (e.type === 'movement') moves.push(e.index);
  }));
  check('a plate lights up at each breather', plates.join(',') === `${d.slots},${d.slots + 1}`, plates.join(','));
  check('movement events', moves.join(',') === '0,1,2', moves.join(','));
  check('cannot build on a sleeping plate', !j.canBuild(j.slotsOpen, 'harp'));
}

section('rhythm');
// ───────────────────────────── the player's rhythm (v3) ─────────────────────────────
{
  const spb = 60 / bpm;
  // judgement windows against the beat as heard
  check('perfect within 75 ms', quality(0.074) === 'perfect' && quality(-0.074) === 'perfect');
  check('good within 150 ms', quality(0.1) === 'good' && quality(-0.149) === 'good');
  check('miss beyond', quality(0.16) === 'miss' && quality(-0.2) === 'miss');
  check('quarters below groove 3', nearestGrid(spb * 0.5 + 0.01, spb, 2).grid === spb);
  check('eighths from groove 3', nearestGrid(spb * 0.5 + 0.01, spb, 3).grid === spb / 2 && quality(nearestGrid(spb * 0.5 + 0.01, spb, 3).delta) === 'perfect');
  // the power meter: on-beat taps fill it (perfect more than good), the combo lifts the gains
  const g = new Power();
  const levels: number[] = [];
  for (let i = 0; i < 60; i++) {
    g.tap((i + 1) * spb + 0.02, spb);
    levels.push(g.power);
  }
  check('perfect taps fill the meter', levels[0] > 0 && levels[9] > levels[4] && levels[59] > 80 && levels[59] < 100, levels.filter((_, i) => i % 10 === 9).map((x) => x.toFixed(0)).join(','));
  check('the combo counts', g.combo === 60 && g.best === 60 && g.perfects === 60 && g.accuracy === 1);
  check('groove levels from the meter', grooveOf(19) === 0 && grooveOf(20) === 1 && grooveOf(45) === 2 && grooveOf(70) === 3 && grooveOf(90) === 4);
  const gp = new Power(), gg = new Power();
  for (let i = 0; i < 8; i++) {
    gp.tap((i + 1) * spb, spb);
    gg.tap((i + 1) * spb + 0.09, spb);
  }
  check('perfect fills more than good', gp.power > gg.power * 1.6 && gg.goods === 8, `${gp.power.toFixed(1)} ${gg.power.toFixed(1)}`);
  check('band multiplier ×1 → ×1.6', powerMul(0) === 1 && Math.abs(powerMul(100) - 1.6) < 1e-9 && powerMul(50) > 1.29);
  // hammering one target on one beat is a miss; two targets on one beat are fine
  const g2 = new Power(50);
  g2.tap(spb * 5, spb);
  check('a grid point counts once per target', g2.tap(spb * 5 + 0.03, spb).q === 'miss' && g2.combo === 0);
  const g5 = new Power(50);
  g5.tap(spb * 5, spb, 'baton');
  check('two fingers on one beat', g5.tap(spb * 5 + 0.01, spb, 'coin').q === 'perfect' && g5.combo === 2);
  // a miss takes a clear chunk and breaks the combo
  const g3 = new Power(60);
  g3.tap(spb * 3, spb);
  const before = g3.power;
  check('a miss costs power and the combo', g3.tap(spb * 4 + 0.2, spb).q === 'miss' && g3.power === before - RHYTHM.lossMiss && g3.combo === 0);
  // quiet, it fades a little every beat, never under the crescendo floor
  const g4 = new Power(60);
  g4.tap(10 * spb, spb);
  check('no fade while playing', !g4.idle(10 * spb + 5 * spb, spb) && g4.power > 60);
  const p0 = g4.power;
  check('fades when quiet', g4.idle(10 * spb + 7 * spb, spb) && g4.power === p0 - RHYTHM.fadePerBeat);
  g4.floor = 55;
  for (let k = 8; k < 60; k++) g4.idle(10 * spb + k * spb, spb);
  check('never under the floor', g4.power === 55);
  // creatures, like the baton, count the eighths from groove 3
  const g6 = new Power(80);
  check('creatures on the eighths at a high groove', g6.tap(spb * 5.5, spb, 'creature').q === 'perfect' && new Power(10).tap(spb * 5.5, spb, 'creature').q === 'miss');
  // the viradas: slow and clear, one stroke every two beats, 4–6 marks, the last on beat 3 of the last bar
  for (const w of WORLDS) {
    for (let lv = 0; lv <= 2; lv++) {
      for (const hard of [false, true]) {
        for (let k = 1; k <= 12; k++) {
          const p = viradaPattern(w, 7, k, lv, hard);
          const span = viradaSpan(p.length) * 16;
          const ok = p.length === viradaMarks(w, lv, hard) && p.length >= 4 && p.length <= 6 && p.every((x, i) => Number.isInteger(x) && x >= 0 && x < span && (i === 0 || x - p[i - 1] === VIRADA.spacing)) && p[p.length - 1] === span - 8;
          if (!ok) check(`virada ${w} lv${lv} ${hard ? 'hard' : ''} k${k}`, false, p.join());
        }
      }
    }
  }
  check('a stroke every two beats', VIRADA.spacing === 8 && viradaPattern('meadow', 1, 1, 0).join() === '0,8,16,24' && viradaSpan(4) === 2 && viradaSpan(6) === 3);
  check('each mark rises one stroke ahead (only one at a time)', VIRADA.lead * 4 === VIRADA.spacing);
  check('a chain adds a mark', viradaMarks('meadow', 0) === 4 && viradaMarks('meadow', 1) === 5 && viradaMarks('meadow', 2) === 6 && viradaMarks('desert', 2) === 6);
  check('same journey, same viradas', viradaPattern('ice', 11, 3, 1).join() === viradaPattern('ice', 11, 3, 1).join());
  const full = viradaReward('desert', 0, 5, 5, 2), perf = viradaReward('desert', 0, 5, 5, 5), half = viradaReward('desert', 0, 3, 5, 3), few = viradaReward('desert', 0, 2, 5, 2);
  check('a full virada rewards', full.full && full.coins > 0 && full.boost > 1 && full.ff > 0 && full.power >= 15, JSON.stringify(full));
  check('all perfect rewards more', perf.perfect && perf.coins > full.coins && perf.boost > full.boost && perf.power > full.power);
  check('half the marks: a few notes', !half.full && half.coins > 0 && half.coins < full.coins && half.boost === 1 && half.power === 0 && half.ff === 0);
  check('fewer: nothing', few.coins === 0 && few.boost === 1 && few.ff === 0);
  check('a bigger chain, a bigger reward', viradaReward('desert', 2, 6, 6, 0).coins > full.coins && viradaReward('desert', 2, 6, 6, 0).boost > full.boost);
}
{
  // power makes the band stronger (and is recorded)
  const dmgWith = (power: number) => {
    const j = new Journey(arenaDef(), bpm);
    j.build(0, 'harp');
    j.setPower(power, 1, 1);
    for (let i = 0; i < 6; i++) spawn(j, 'blot', 9, (i - 2.5) * 1.5, 20);
    run(j, 4);
    return j.towers[0].damage;
  };
  const d0 = dmgWith(0), d100 = dmgWith(100);
  check('full power hits ×1.6', Math.abs(d100 / d0 - 1.6) < 0.03, `${(d100 / d0).toFixed(3)}`);
  const j = new Journey(arenaDef(), bpm);
  check('setPower logs', j.setPower(72.4, 10, 9) && !j.setPower(72, 10, 9) && j.log.some((a) => a.a === 'power' && a.p === 72 && a.judged === 10 && a.hits === 9) && j.groove === 3);
  check('power is clamped', j.setPower(140, 11, 10) && j.power === 100 && j.groove === 4);
  check('accuracy from the tally', Math.abs(j.accuracy - 10 / 11) < 1e-9);
  // v3 checkpoints: a groove level replays as its power threshold
  check('v3 groove action replays', j.apply({ sub: j.sub, a: 'groove', level: 2 }) && j.power === RHYTHM.thresholds[1]);
}
{
  // solos: they charge, glow, and only fire when charged
  const j = new Journey(arenaDef({ bars: 400 }), bpm);
  const h = j.build(0, 'harp')!;
  check('no solo uncharged', !j.canSolo(h) && j.solo(h, true) === null);
  j.setPower(100, 1, 1);
  j.begin();
  const ready: SimEvent[] = [];
  run(j, j.barDur * 32, (evs) => ready.push(...evs.filter((e) => e.type === 'soloReady')));
  check('passive charge with the power', h.solo >= 1 && ready.length === 1, `${h.solo.toFixed(2)}`);
  const j2 = new Journey(arenaDef({ bars: 400 }), bpm);
  const h2 = j2.build(0, 'harp')!;
  j2.begin();
  run(j2, j2.barDur * 32);
  check('slow without power', h2.solo < 0.5, h2.solo.toFixed(2));
}
/** the solo of a lone musician of `kind` against creatures, charged by hand; returns what it did */
function soloTrial(kind: TowerKind, perfect: boolean, enemy: EnemyKind = 'blot', n = 6, d = 8) {
  const j = new Journey(arenaDef({ bars: 200 }), bpm);
  const tw = j.build(0, kind)!;
  j.begin();
  run(j, j.barDur * 2);
  const foes: Enemy[] = [];
  for (let i = 0; i < n; i++) foes.push(spawn(j, enemy, d, (i - (n - 1) / 2) * 1.6, 40));
  tw.solo = 1;
  const evs: SimEvent[] = [];
  const coins0 = j.coins;
  const dmg0 = tw.damage;
  const r = j.solo(tw, perfect);
  evs.push(...j.drain());
  run(j, j.barDur * 1.3, (e) => evs.push(...e));
  return { j, tw, r, evs, foes, dmg: tw.damage - dmg0, coins: j.coins - coins0 };
}
{
  const a = soloTrial('harp', false, 'shell', 6, 12);
  check('solo starts on a beat, lasts a bar', !!a.r && Math.abs(a.r[0] / a.j.spb - Math.round(a.r[0] / a.j.spb)) < 1e-9 && Math.abs(a.r[1] - a.r[0] - a.j.barDur) < 1e-9);
  check('solo event', a.evs.some((e) => e.type === 'solo' && e.tower === a.tw));
  check('solo uses the charge', a.tw.solo < 0.3 && a.tw.soloFrom === -1 && a.j.stats.solos === 1);
  check('harp solo: a rapid volley', a.evs.filter((e) => e.type === 'fire' && e.shot.solo).length >= 12);
  check('solo logged', a.j.log.some((x) => x.a === 'solo' && x.slot === 0 && !x.perfect));
  const p = soloTrial('harp', true, 'shell', 6, 12);
  check('a perfect solo is stronger', p.dmg > a.dmg * 1.15, `${p.dmg.toFixed(0)} vs ${a.dmg.toFixed(0)}`);
  const dr = soloTrial('drum', false, 'shell', 6, 9);
  const waves = dr.evs.filter((e) => e.type === 'soloHit' && e.kind === 'drum') as Extract<SimEvent, { type: 'soloHit' }>[];
  check('drum solo: shockwaves on every beat', waves.length === 4 && waves.reduce((n, w) => n + w.hits.length, 0) >= 8, `${waves.length}`);
  check('drum solo: they are pushed back', dr.foes.some((e) => e.kx * (e.x - dr.j.turtle.x) + e.kz * (e.z - dr.j.turtle.z) > 0 || Math.hypot(e.x - dr.j.turtle.x, e.z - dr.j.turtle.z) > 9));
  const be = soloTrial('bell', false, 'blot', 4, 9);
  check('bell solo: a great slowing ring', be.evs.some((e) => e.type === 'soloHit' && e.kind === 'bell' && e.hits.length >= 3) && be.foes.filter((e) => e.alive).every((e) => e.slow <= 0.41));
  const sh = soloTrial('shaker', false, 'blot', 0);
  check('shaker solo: a shower of notes', sh.coins >= 16 && sh.evs.filter((e) => e.type === 'income').length >= 8, `${sh.coins}`);
  const cr = soloTrial('crystal', false, 'shell', 6, 12);
  check('crystal solo: a chain storm', cr.evs.filter((e) => e.type === 'fire' && e.shot.solo).length >= 6 && cr.dmg > 0);
  const ho = soloTrial('horn', false, 'whirl', 3, 8);
  check('horn solo: pierces even a whirl', ho.dmg > 0 && !ho.evs.some((e) => e.type === 'deflect' && e.shot.solo));
  const ch = (() => {
    const j = new Journey(arenaDef({ bars: 200 }), bpm);
    const c = j.build(0, 'choir')!;
    const h = j.build(6, 'harp')!;
    j.begin();
    run(j, j.barDur * 2);
    spawn(j, 'phantom', 12);
    const before = (j as unknown as { towerMul(t: Tower, at: number): number }).towerMul(h, j.time);
    c.solo = 1;
    j.solo(c, false);
    run(j, j.barDur * 0.5);
    const after = (j as unknown as { towerMul(t: Tower, at: number): number }).towerMul(h, j.time);
    return { before, after, revealed: j.enemies.some((e) => e.kind === 'phantom' && e.revealedUntil > j.time) };
  })();
  check('choir solo: the whole band plays stronger, nothing hides', ch.after > ch.before * 1.15 && ch.revealed, `${ch.before.toFixed(2)}→${ch.after.toFixed(2)}`);
  const ba = soloTrial('bass', false, 'shell', 3, 9);
  check('bass solo: huge drops, they stumble', ba.evs.filter((e) => e.type === 'soloHit' && e.kind === 'bass').length === 2 && ba.dmg > TOWERS.bass.levels[0].damage * 2);
  // a muted musician cannot solo
  const j = new Journey(arenaDef(), bpm);
  const m = j.build(0, 'harp')!;
  m.solo = 1;
  m.frozenUntil = 99;
  run(j, 0.2);
  check('a silenced musician cannot solo', !j.canSolo(m));
}
{
  // the viradas (off in the game for now; the machinery is tested switched on): every breather has them; on a streak at a phrase end, not too often; recorded
  VIRADA.enabled = true;
  const d = LEVEL_BY_ID.get('m2')!.def;
  const j = new Journey(d, SONGS[d.song].bpm);
  j.build(0, 'harp');
  j.build(1, 'drum');
  j.begin();
  /** advances to the bar line before journey bar `jb` (+ a hair) */
  const toBar = (jb: number) => run(j, Math.max(0, (j.startBar! + jb) * j.barDur + 0.01 - j.time));
  toBar(1);
  check('no virada off a phrase end', !j.viradaDue(j.journeyBar! + VIRADA.cueBars, true) || (j.journeyBar! + VIRADA.cueBars + 1) % VIRADA.phrase === 0);
  // a streak: the virada lands on the last bar of a phrase
  let vb = -1;
  for (let jb = 1; jb < 12 && vb < 0; jb++) {
    toBar(jb);
    if (j.viradaDue(jb + VIRADA.cueBars, true)) vb = jb + VIRADA.cueBars;
    else check(`no streak virada at ${jb + VIRADA.cueBars} without a streak flag`, !j.viradaDue(jb + VIRADA.cueBars, false) || j.inBreather());
  }
  check('a streak brings a virada at a phrase end', vb > 0 && (vb + 1) % VIRADA.phrase === 0, `${vb}`);
  const v = j.viradaCue(vb)!;
  check('a cued virada: its strokes two beats apart, the last two beats before its end', !!v && v.times.length >= 4 && v.times.every((t, i) => i === 0 || Math.abs(t - v.times[i - 1] - 2 * j.spb) < 1e-9) && Math.abs(v.end - v.times[v.times.length - 1] - 2 * j.spb) < 1e-9 && v.start === v.times[0] && Math.abs((v.end / j.barDur) - (j.startBar! + vb + 1)) < 1e-9);
  check('cued once', j.viradaCue(vb) === null && !j.viradaDue(vb, true));
  check('the cue is recorded', j.log.some((a) => a.a === 'viradaCue' && a.bar === vb));
  check('not before its bar', !j.virada(v.steps.length, v.steps.length, v.steps.length));
  run(j, v.end - j.time + 0.01);
  const c0 = j.coins, ff0 = j.ff;
  const evs: SimEvent[] = [];
  check('a full virada', j.virada(v.steps.length, v.steps.length, 0));
  evs.push(...j.drain());
  check('…brings notes, the boost, FORTÍSSIMO, a chain', j.coins > c0 && j.ff > ff0 && j.viradaBoostUntil > j.time + 3 * j.barDur && j.viradaBoostMul >= VIRADA.boost - 1e-9 && j.viradaLevel === 1 && j.stats.viradaFull === 1 && evs.some((e) => e.type === 'virada' && e.full));
  check('…recorded', j.log.some((a) => a.a === 'virada' && a.hits === v.steps.length));
  check('no second report', !j.virada(1, 1, 1));
  // the band plays stronger under the boost
  const mul = (j as unknown as { towerMul(t: Tower, at: number): number }).towerMul(j.towers[0], j.time);
  check('the virada boost lifts the band', mul > (j as unknown as { towerMul(t: Tower, at: number): number }).towerMul(j.towers[0], j.viradaBoostUntil + 1) * (VIRADA.boost - 0.01));
  // not again too soon
  check('not too soon after', !j.viradaDue(vb + VIRADA.phrase, true));
  // every breather has its viradas (whatever the streak), the second one ends on the movement's downbeat
  const m1 = d.movements![1];
  const due: number[] = [];
  for (let jb = vb; jb < m1.bar; jb++) {
    toBar(jb);
    // a virada over: told (a miss in it)
    const p = j.viradaPending();
    if (p && j.time >= p.end) j.virada(1, p.steps.length, 0);
    const at = jb + VIRADA.cueBars;
    if (j.viradaDue(at, false)) {
      due.push(at);
      j.viradaCue(at);
    }
  }
  const last = j.viradaPending();
  if (last) {
    run(j, last.end - j.time + 0.01);
    j.virada(1, last.steps.length, 0);
  }
  check('two viradas in a breather', due.length === 2 && due[1] === m1.bar - 1 && due[0] === m1.bar - 5, due.join());
  check('a virada with misses resets the chain', j.viradaLevel === 0 && j.stats.viradas === 3);
}
{
  // a boss holds its blows around a cued virada
  VIRADA.enabled = true;
  const { j } = duelArena('toad');
  let cued: number | null = null;
  const blows: number[] = [];
  for (let i = 0; i < 24; i++) {
    run(j, j.barDur, (evs) => evs.forEach((e) => e.type === 'bossAttack' && blows.push(...e.blows.map((b) => b.t))));
    const jb = j.journeyBar!;
    if (cued === null && j.blows.every((b) => b.resolved) && j.viradaCue(jb + VIRADA.cueBars)) cued = jb + VIRADA.cueBars;
  }
  const v = j.viradas[0];
  check('a virada cued in a duel', !!v && cued !== null);
  if (v) check('no blow lands in a virada', blows.length > 0 && !blows.some((t) => t > v.start - j.spb && t < v.end), blows.map((t) => (t / j.barDur).toFixed(2)).join(' '));
  VIRADA.enabled = false;
}
{
  // rhythm actions replay exactly (checkpoints), and saves keep them
  const d = LEVEL_BY_ID.get('d2')!.def;
  const live = playBot(d, 'good', { rhythm: 0.7, until: (j) => j.movement >= 2 && j.journeyBar! >= j.movements[2].bar + 3 });
  const L = live.j;
  check('rhythm bot plays solos, strikes, notes, power (no viradas while they are off)', L.stats.solos > 0 && L.stats.viradas === 0 && L.stats.strikes > 0 && L.stats.onBeatNotes > 0 && L.log.some((a) => a.a === 'power'), `${L.stats.solos} ${L.stats.viradas} ${L.stats.strikes}`);
  const cp = L.checkpoint()!;
  const now = Journey.replay(d, SONGS[d.song].bpm, { ...cp, sub: L.sub, actions: L.log.filter((a) => a.sub <= L.sub) });
  check('rhythm replay == live', now.fingerprint() === L.fingerprint(), `\n  ${now.fingerprint().slice(0, 160)}\n  ${L.fingerprint().slice(0, 160)}`);
  const at = Journey.replay(d, SONGS[d.song].bpm, cp);
  check('power restored at the checkpoint', at.power === (cp.actions.filter((a) => a.a === 'power').pop() as { p: number } | undefined)?.p);
  for (const a of L.log.filter((x) => x.sub > cp.sub)) {
    at.advanceToSub(a.sub);
    at.apply(a);
  }
  at.advanceToSub(L.sub);
  check('rhythm checkpoint + play on == live', at.fingerprint() === L.fingerprint());
  const sv = newSave(1);
  rememberCheckpoint(sv, cp.id, cp);
  const again = validate(JSON.parse(JSON.stringify(sv)))!;
  check('save keeps rhythm actions', JSON.stringify(again.checkpoints[cp.id]) === JSON.stringify(cp));
  // and the same rhythm bot game twice is the same game
  const b = playBot(d, 'good', { rhythm: 0.7 }), c = playBot(d, 'good', { rhythm: 0.7 });
  check('rhythm bot deterministic', b.j.fingerprint() === c.j.fingerprint());
}

{
  // golden notes on the beat: perfect ×1.5, off the beat half (and recorded with their quality)
  const d = { ...LEVEL_BY_ID.get('m2')!.def, waves: [] };
  const take = (q?: 'perfect' | 'good' | 'miss') => {
    const j = new Journey(d, SONGS[d.song].bpm);
    const p = j.pickups[0];
    const v = j.collect(p.id, q);
    return { v, base: p.value, j };
  };
  const pf = take('perfect'), ms = take('miss'), plain = take();
  check('a note on the beat is worth more', pf.v === Math.round(pf.base * 1.5) && pf.j.stats.onBeatNotes === 1);
  check('off the beat, half', ms.v === Math.max(1, Math.round(ms.base * 0.5)) && ms.j.stats.onBeatNotes === 0);
  check('notes keep their quality in the log', pf.j.log.some((a) => a.a === 'collect' && a.q === 'perfect') && plain.v === plain.base);
}
{
  // the colossus strikes a creature tapped on the beat: damage with the power, a push, a cooldown
  const strikeOn = (power: number, perfect: boolean) => {
    const j = new Journey(arenaDef(), bpm);
    j.setPower(power, 1, 1);
    const e = spawn(j, 'shell', 14, 0, 10);
    const hp = e.hp;
    const dealt = j.strike(e.id, perfect);
    return { j, e, hp, dealt, lost: hp - e.hp };
  };
  const s0 = strikeOn(0, false), s100 = strikeOn(100, false), sp = strikeOn(0, true);
  check('a strike hurts', s0.lost > 0 && s0.j.stats.strikes === 1 && s0.j.log.some((a) => a.a === 'strike'));
  check('power doubles a strike', Math.abs(s100.lost / s0.lost - 2) < 0.01, `${(s100.lost / s0.lost).toFixed(2)}`);
  check('a perfect strike is stronger', Math.abs(sp.lost / s0.lost - 1.3) < 0.01);
  check('a strike pushes back', s0.e.kx * (s0.e.x - s0.j.turtle.x) + s0.e.kz * (s0.e.z - s0.j.turtle.z) > 0);
  check('a cooldown per creature', !s0.j.canStrike(s0.e) && s0.j.strike(s0.e.id, true) === 0);
  run(s0.j, s0.j.barDur * 2.05);
  check('then it can be struck again', !s0.e.alive || s0.j.canStrike(s0.e));
  const far = new Journey(arenaDef(), bpm);
  const fe = spawn(far, 'shell', 60);
  check('out of reach', far.strike(fe.id, true) === 0);
  const ev = (() => {
    const j = new Journey(arenaDef(), bpm);
    const e = spawn(j, 'blot', 12);
    j.drain();
    j.strike(e.id, true);
    return j.drain();
  })();
  check('strike event', ev.some((e) => e.type === 'strike' && e.perfect && e.amount > 0));
}
{
  // a glowing musician tapped off the beat still solos, weaker
  const off = soloTrial('harp', false, 'shell', 6, 12);
  void off;
  const j = new Journey(arenaDef({ bars: 200 }), bpm);
  const h = j.build(0, 'harp')!;
  h.solo = 1;
  j.solo(h, 'miss');
  check('an off-beat solo plays weaker', h.soloQ === 0.6 && j.log.some((a) => a.a === 'solo' && a.q === 'miss'));
}
{
  // a movement played with a high power earns a crescendo star (the band stays stronger)
  const d = { ...LEVEL_BY_ID.get('m2')!.def, waves: [] };
  const hot = new Journey(d, SONGS[d.song].bpm);
  hot.setPower(80, 10, 10);
  hot.begin();
  const evs: SimEvent[] = [];
  const m1 = d.movements![1];
  run(hot, (m1.bar - m1.rest + 2) * hot.barDur + 1, (e) => evs.push(...e));
  check('a crescendo star for a movement at high power', hot.crescendo === 1 && evs.some((e) => e.type === 'crescendo' && e.stars === 1 && e.average >= 79));
  const cold = new Journey(d, SONGS[d.song].bpm);
  cold.setPower(30, 10, 10);
  cold.begin();
  run(cold, (m1.bar - m1.rest + 2) * cold.barDur + 1);
  check('none at low power', cold.crescendo === 0);
  const mulHot = (hot as unknown as { towerMul(t: Tower, at: number): number });
  const tw = hot.build(0, 'harp')!;
  hot.setPower(0, 10, 10);
  check('a crescendo star lifts the band', Math.abs(mulHot.towerMul(tw, hot.time) / (tw.buff * hot.harmonyMul) - 1.05) < 1e-9);
}
{
  // three stars need the rhythm too
  const d = LEVEL_BY_ID.get('m1')!.def;
  const noRhythm = playBot(d, 'good');
  const rhythm = playBot(d, 'good', { rhythm: 0.8 });
  check('no rhythm: at most 2★', noRhythm.j.outcome === 'victory' && noRhythm.j.stars() <= 2);
  check('good rhythm and no bites: 3★', rhythm.j.stars() === 3 && rhythm.j.accuracy >= 0.85, `${rhythm.j.stars()} ${rhythm.j.accuracy.toFixed(2)}`);
}

section('duel');
// ───────────────────────────── v5: the bosses' duel on the beat ─────────────────────────────
{
  // every boss has a duel; every main journey ends with its mini-boss, the extras with a legend
  for (const k of Object.keys(ENEMIES) as EnemyKind[]) {
    const d = ENEMIES[k];
    if (!d.boss) continue;
    const spec = BOSSES[k];
    check(`${k} has a duel`, !!spec && spec.phases.length === spec.at.length + 1 && spec.phases.every((ph) => ph.length > 0 && ph.every((a) => a.length > 0 && a.every((o) => o >= 0 && o <= 7))));
    if (d.mini) check(`${k}: 1–2 phases`, spec!.phases.length <= 2);
    if (d.legend) check(`${k}: 3 phases`, spec!.phases.length === 3);
  }
  for (const l of CAMPAIGN) {
    if (l.kind === 'main') check(`${l.id} ends with a mini-boss`, !!l.def.boss && !!ENEMIES[l.def.boss.kind].mini, l.def.boss?.kind);
    if (l.kind === 'extra' || l.kind === 'secret') check(`${l.id} ends with a legend`, !!l.def.boss && !!ENEMIES[l.def.boss.kind].legend, l.def.boss?.kind);
    if (l.kind === 'boss') {
      const minis = l.def.waves.flatMap((w) => w.groups).filter((g) => ENEMIES[g.kind].mini).map((g) => g.kind);
      check(`${l.id}: two minis mid-fight`, minis.length === 2 && minis.join() === MID_BOSSES[l.world].join(), minis.join());
    }
  }
  // parry windows: perfect ≤ 60 ms, good ≤ 120 ms, a little wider with a long combo
  check('parry perfect', parryQuality(0.05, 0) === 'perfect' && parryQuality(-0.06, 0) === 'perfect');
  check('parry good', parryQuality(0.1, 0) === 'good' && parryQuality(0.16, 0) === 'miss');
  check('a long combo widens the window', parryQuality(0.17, 30) === 'good' && parryQuality(0.17, 0) === 'miss');
  check('far from the beat is no parry', parryQuality(0.4, 0) === null);
  check('shield of sound', shieldOf(0) === 0 && Math.abs(shieldOf(100) - DUEL.shield) < 1e-9);
}
/** a boss fight in the arena: the boss right in front, the walk under way */
function duelArena(kind: EnemyKind, hp = 1) {
  const j = new Journey(arenaDef({ bars: 300 }), bpm);
  j.begin();
  run(j, j.barDur * 2);
  const b = spawn(j, kind, 20, 0, hp);
  return { j, b };
}
{
  // the boss winds up on its tell bar and its blows land on the beat grid of the next bar
  const { j, b } = duelArena('toad');
  const evs: SimEvent[] = [];
  run(j, j.barDur * (DUEL.entrance + 2), (e) => evs.push(...e));
  const atk = evs.find((e) => e.type === 'bossAttack') as Extract<SimEvent, { type: 'bossAttack' }> | undefined;
  check('a boss attacks after its entrance', !!atk && atk.enemy === b);
  if (atk) {
    const eighth = j.spb / 2;
    check('tells on the beats of the tell bar', atk.tells.length === 4 && atk.tells.every((t, i) => Math.abs(t - (atk.t + i * j.spb)) < 1e-9));
    check('blows on the grid of the next bar', atk.blows.every((bl) => bl.t >= atk.t + j.barDur - 1e-9 && bl.t < atk.t + 2 * j.barDur && Math.abs(bl.t / eighth - Math.round(bl.t / eighth)) < 1e-6));
  }
  // unparried: it lands (lives), the nearest musician is stunned
  const k = new Journey(arenaDef({ bars: 300 }), bpm);
  const h = k.build(0, 'harp')!;
  k.begin();
  run(k, k.barDur * 2);
  spawn(k, 'toad', 20, 0, 50);
  const lives0 = k.lives;
  const ev2: SimEvent[] = [];
  run(k, k.barDur * (DUEL.entrance + 3), (e) => ev2.push(...e));
  const hit = ev2.find((e) => e.type === 'bossBlow') as Extract<SimEvent, { type: 'bossBlow' }> | undefined;
  check('an unparried blow lands', !!hit && hit.lives === 1 && k.lives < lives0 && k.stats.blowsTaken >= 1);
  check('…and stuns a musician', !!hit && hit.stunned.includes(h.id) && h.frozenUntil > hit.t);
  // with full power, the shield of sound makes it bounce off
  const sh = new Journey(arenaDef({ bars: 300 }), bpm);
  sh.setPower(100, 1, 1);
  sh.begin();
  run(sh, sh.barDur * 2);
  spawn(sh, 'toad', 20, 0, 50);
  const ev3: SimEvent[] = [];
  run(sh, sh.barDur * (DUEL.entrance + 3), (e) => ev3.push(...e));
  const soft = ev3.find((e) => e.type === 'bossBlow') as Extract<SimEvent, { type: 'bossBlow' }> | undefined;
  check('full power: the blow bounces off the shield', !!soft && soft.lives === 0 && soft.absorbed >= 0.7 && sh.lives === sh.maxLives);
}
{
  // parries: perfect reflects (damage, a stagger), good blocks; recorded; a miss is no parry
  const { j, b } = duelArena('drumBeetle', 3);
  let bl: Blow | null = null;
  for (let i = 0; i < 200 && !bl; i++) {
    run(j, 0.1);
    bl = j.nextBlow();
  }
  check('a blow is coming', !!bl);
  if (bl) {
    j.advance(bl.t + 0.02);
    j.drain();
    const hp = b.hp;
    check('a miss is no parry', !j.parry(bl.id, 'miss'));
    check('a perfect parry', j.parry(bl.id, 'perfect') && b.hp < hp && b.stunUntil > j.time && j.stats.reflects === 1 && j.log.some((a) => a.a === 'parry' && a.blow === bl!.id && a.q === 'perfect'));
    check('a blow is parried once', !j.parry(bl.id, 'good'));
    const lives = j.lives;
    const nb = j.nextBlow();
    if (nb) {
      j.advance(nb.t);
      check('a good parry blocks', j.parry(nb.id, 'good') && j.stats.parries === 2);
      run(j, j.spb * 2);
      check('…and nothing lands', j.lives === lives);
    }
  }
}
{
  // phases at the hp thresholds
  const { j, b } = duelArena('bossBlot');
  const evs: SimEvent[] = [];
  const hurt = (f: number) => (j as unknown as { damage(e: Enemy, a: number, t: string, tw: Tower | null, at: number): void }).damage(b, b.maxHp * f, 'bass', null, j.time);
  hurt(0.4);
  evs.push(...j.drain());
  check('phase 2 at two thirds', b.duelPhase === 1 && evs.some((e) => e.type === 'bossPhase' && e.phase === 1));
  hurt(0.35);
  evs.push(...j.drain());
  check('phase 3 at one third', b.duelPhase === 2 && evs.some((e) => e.type === 'bossPhase' && e.phase === 2));
  // the echoing yeti doubles its blows; the twins come two at once
  const y = duelArena('yeti');
  const ye: SimEvent[] = [];
  run(y.j, y.j.barDur * (DUEL.entrance + 2), (e) => ye.push(...e));
  const ya = ye.find((e) => e.type === 'bossAttack') as Extract<SimEvent, { type: 'bossAttack' }> | undefined;
  check('the yeti echoes its blows', !!ya && ya.blows.some((x) => x.echo));
  const d = { ...LEVEL_BY_ID.get('c3')!.def, waves: [] };
  const tj = new Journey(d, SONGS[d.song].bpm);
  tj.begin();
  run(tj, (d.boss!.bar + 1) * tj.barDur + 1);
  check('the twin knights come two at once', tj.enemies.filter((e) => e.alive && e.kind === 'twin').length === 2);
  // the black phoenix burns down at its last phase and is reborn once (immune for a moment)
  const ph = duelArena('phoenix', 0.05);
  ph.j.drain();
  const hurtP = (x: number) => (ph.j as unknown as { damage(e: Enemy, a: number, t: string, tw: Tower | null, at: number): void }).damage(ph.b, x, 'bass', null, ph.j.time);
  hurtP(1e9);
  check('the phoenix is reborn', ph.b.alive && ph.b.duelPhase === 2 && Math.abs(ph.b.hp / ph.b.maxHp - DUEL.rebirthHp) < 1e-6 && ph.b.invulnUntil > ph.j.time);
  const hp0 = ph.b.hp;
  hurtP(100);
  check('immune while it rises', ph.b.hp === hp0);
  run(ph.j, DUEL.rebirthTime + 0.2);
  hurtP(1e9);
  check('reborn only once', !ph.b.alive);
}
{
  // a whole boss level with the rhythm bot: deterministic, and a checkpoint replays through the duel
  const d = LEVEL_BY_ID.get('m4')!.def;
  const a = playBot(d, 'good', { rhythm: 0.6 }), b = playBot(d, 'good', { rhythm: 0.6 });
  check('duel deterministic', a.j.fingerprint() === b.j.fingerprint() && a.j.stats.parries > 0, `${a.j.stats.parries}`);
  const live = playBot(d, 'good', { rhythm: 0.6, until: (j) => j.stats.parries >= 6 && j.enemies.some((e) => e.alive && e.def.boss) });
  const L = live.j;
  const cp = L.checkpoint();
  check('a checkpoint before the duel', !!cp);
  if (cp) {
    const now = Journey.replay(d, SONGS[d.song].bpm, { ...cp, sub: L.sub, actions: L.log.filter((x) => x.sub <= L.sub) });
    check('replay through the duel == live', now.fingerprint() === L.fingerprint(), `\n  ${now.fingerprint().slice(0, 160)}\n  ${L.fingerprint().slice(0, 160)}`);
    const sv = newSave(1);
    rememberCheckpoint(sv, cp.id, cp);
    check('save keeps parries', JSON.stringify(validate(JSON.parse(JSON.stringify(sv)))!.checkpoints[cp.id]) === JSON.stringify(cp));
  }
}

section('bots');
// ───────────────────────────── the bots ─────────────────────────────
const tb = Date.now();
// v4, a true rhythm game: the better the rhythm, the more you win.
//   virtuoso (0.9: almost every tap perfect) · conductor (0.6) · sloppy (0.3) · no rhythm at all
// The conductor and the virtuoso win everything (main road with 2–3★, the legends too); the sloppy
// hand still gets through the main journeys (not the guardians' duels); a band with no rhythm
// struggles from the second land on; the virtuoso beats the sloppy hand by a clear margin in stars.
const SK = { virtuoso: 0.9, conductor: 0.6, sloppy: 0.3, none: 0 };
/**
 * A verdict over most of three hands (the bots' timing dice, salts 0–2): a close journey can turn on
 * one roll of the dice, a verdict should not. `first` is the hand already played (salt 0).
 */
function most(def: JourneyDef, rhythm: number, first: ReturnType<typeof playBot>, ok: (r: ReturnType<typeof playBot>) => boolean): boolean {
  let yes = ok(first) ? 1 : 0;
  for (let salt = 1; salt <= 2 && yes < 2 && yes + (3 - salt) >= 2; salt++) if (ok(playBot(def, 'good', { rhythm, salt }))) yes++;
  return yes >= 2;
}
const starsBy: Record<string, number> = { virtuoso: 0, conductor: 0, sloppy: 0, none: 0 };
let noneLost = 0;
for (const l of CAMPAIGN) {
  const main = l.kind === 'main' || l.kind === 'boss';
  const r: Record<string, ReturnType<typeof playBot>> = {};
  for (const [name, sk] of Object.entries(SK)) {
    r[name] = playBot(l.def, 'good', sk ? { rhythm: sk } : {});
    starsBy[name] += r[name].j.stars();
  }
  check(`virtuoso wins ${l.id}`, r.virtuoso.j.outcome === 'victory' && (!main || r.virtuoso.j.stars() >= 2), `${r.virtuoso.j.outcome} ${r.virtuoso.j.lives}`);
  check(`conductor wins ${l.id}`, most(l.def, SK.conductor, r.conductor, (x) => x.j.outcome === 'victory' && (!main || x.j.stars() >= 2)), `${r.conductor.j.outcome} ${r.conductor.j.lives}`);
  if (l.kind === 'main') check(`sloppy rhythm still wins ${l.id}`, most(l.def, SK.sloppy, r.sloppy, (x) => x.j.outcome === 'victory'), `${r.sloppy.j.outcome} ${r.sloppy.j.lives}`);
  if (l.world === 'meadow' && main) check(`no rhythm still wins ${l.id}`, r.none.j.outcome === 'victory', `${r.none.j.outcome}`);
  else if (r.none.j.outcome !== 'victory') noneLost++;
  // (over three hands when one roll of the dice says otherwise)
  const helps = (v: number, s: number) => v >= r.none.j.lives && v >= s - 2;
  const mean = (sk: number, first: ReturnType<typeof playBot>) => (first.j.lives + playBot(l.def, 'good', { rhythm: sk, salt: 1 }).j.lives + playBot(l.def, 'good', { rhythm: sk, salt: 2 }).j.lives) / 3;
  check(`rhythm helps in ${l.id}`, helps(r.virtuoso.j.lives, r.sloppy.j.lives) || helps(mean(SK.virtuoso, r.virtuoso), mean(SK.sloppy, r.sloppy)), `${r.virtuoso.j.lives} ${r.conductor.j.lives} ${r.sloppy.j.lives} ${r.none.j.lives}`);
}
check('the virtuoso beats the sloppy hand by far', starsBy.virtuoso >= starsBy.sloppy + 20, JSON.stringify(starsBy));
check('more rhythm, more stars', starsBy.virtuoso >= starsBy.conductor && starsBy.conductor > starsBy.sloppy && starsBy.sloppy > starsBy.none, JSON.stringify(starsBy));
check('no rhythm struggles from the second land on', noneLost >= 6, `${noneLost}`);
// v7: a flawless run is always possible (perfect rhythm, a strike on every beat, every blow parried, every virada)
for (const id of ['m1', 'mx', 'i1', 'd4']) {
  const r = playBot(LEVEL_BY_ID.get(id)!.def, 'flawless');
  check(`flawless keeps every life in ${id}`, r.j.outcome === 'victory' && r.j.lives === r.j.maxLives, `${r.j.outcome} ${r.j.lives}`);
}
{
  const st = (sk: number) => {
    const j = playBot(LEVEL_BY_ID.get('f2')!.def, 'good', { rhythm: sk }).j;
    return j.stats.powerSum / j.stats.walkBars;
  };
  const p3 = st(0.3), p6 = st(0.6), p9 = st(0.9);
  check('power follows the skill', p3 < 40 && p6 > 45 && p6 < 80 && p9 > 82, `${p3.toFixed(0)} ${p6.toFixed(0)} ${p9.toFixed(0)}`);
}
for (const id of ['m1', 'm2', 'm3', 'm4']) {
  const r = playBot(LEVEL_BY_ID.get(id)!.def, 'novice');
  check(`novice (shaky rhythm) gets through ${id}`, r.j.outcome === 'victory', `${r.j.outcome} ${r.j.lives}`);
}
for (const id of ['m3', 'd1', 'i1', 'f1', 'c1']) {
  const r = playSpam(LEVEL_BY_ID.get(id)!.def);
  check(`a one-instrument band falls in ${id}`, r.j.outcome === 'defeat', `${r.kind} ${r.j.outcome} ${r.j.lives}`);
}
const tbots = Date.now() - tb;

section('saves');
// ───────────────────────────── saves ─────────────────────────────
const s = newSave(1);
s.levels.m1 = { stars: 3 };
s.knownTowers = ['harp'];
const back = saveFromCode(saveToCode(s));
check('save code round-trip', !!back && back.levels.m1.stars === 3 && back.knownTowers[0] === 'harp');
check('save rejects junk', validate({ nope: 1 }) === null && saveFromCode('FF1:%%%') === null);
if (someCp) {
  const sv = newSave(2);
  rememberCheckpoint(sv, someCp.id, someCp);
  const again = validate(JSON.parse(JSON.stringify(sv)))!;
  check('save keeps a checkpoint', JSON.stringify(again.checkpoints[someCp.id]) === JSON.stringify(someCp));
  check('checkpoint per mode', !!checkpointOf(again, someCp.id, 'normal') && !checkpointOf(again, someCp.id, 'virtuoso'));
  check('checkpoints stay on the device', !saveFromCode(saveToCode(sv))!.checkpoints[someCp.id]);
  const broken = validate({ ...JSON.parse(JSON.stringify(sv)), checkpoints: { [someCp.id]: { ...someCp, actions: [{ sub: 'x', a: 'build' }] } } })!;
  check('broken checkpoints are dropped', !broken.checkpoints[someCp.id]);
  rememberCheckpoint(sv, someCp.id, null);
  check('a win forgets it', !sv.checkpoints[someCp.id]);
}
void TOWER_KINDS;
void SUB;

console.log(`${passed} passed, ${failed} failed (${((Date.now() - t0) / 1000).toFixed(1)} s, bots ${(tbots / 1000).toFixed(1)} s)`);
if (failed) process.exit(1);
