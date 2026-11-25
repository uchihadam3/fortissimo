/**
 * Headless checks: campaign integrity and lengths, simulation determinism (and independence from
 * how often it is advanced), checkpoint replays, the band (harmony, duets and their effects), every
 * creature ability, the bots' verdicts (the good bot wins every main journey, the novice gets
 * through the first land, a one-instrument band falls from m3 on) and save codes.
 * Run with `npm test`.
 */
import { CAMPAIGN, LEVEL_BY_ID, endlessDef } from '../src/data/campaign';
import { Journey, SUB, SUBS_PER_BAR, type Enemy, type JourneyDef, type SimEvent, type Tower } from '../src/sim/journey';
import { BAND, ENEMIES, SONGS, TOWERS, TOWER_KINDS, type EnemyKind, type TowerKind } from '../src/sim/defs';
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
const meadow = new Set(CAMPAIGN.filter((l) => l.world === 'meadow').flatMap((l) => l.def.waves.flatMap((w) => w.groups.map((g) => g.kind))));
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
  // a live game, frozen as it reaches a point well inside the third movement
  const live = playBot(d, 'good', { until: (j) => j.movement >= 2 && j.journeyBar! >= j.movements[2].bar + 3 });
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

section('bots');
// ───────────────────────────── the bots ─────────────────────────────
const tb = Date.now();
for (const l of CAMPAIGN) {
  if (l.kind !== 'main' && l.kind !== 'boss') continue;
  const r = playBot(l.def, 'good');
  check(`good bot wins ${l.id}`, r.j.outcome === 'victory' && r.j.stars() >= 2, `${r.j.outcome} ${r.j.lives} lives`);
}
for (const id of ['m1', 'm2', 'm3', 'm4']) {
  const r = playBot(LEVEL_BY_ID.get(id)!.def, 'novice');
  check(`novice gets through ${id}`, r.j.outcome === 'victory', `${r.j.outcome} ${r.j.lives}`);
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
