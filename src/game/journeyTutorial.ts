/**
 * Wordless tutorial for journeys: a white glove points at the one thing to do next, and disappears
 * as soon as the player does it. It never blocks the game.
 *
 * v2: in the first land, when a breather lights up a new plate of the shell, the glove points at
 * it once (until the plate is opened, or for a few seconds).
 *
 * v3 (the player conducts): after the first wave of the first journey the glove taps the baton in
 * time with its beat ring (until the groove rises); in the second journey it taps a glowing musician
 * on the beat (a solo).
 *
 * v4: after the baton, the glove shows the power meter rising and the musicians brighter for it,
 * then taps a golden note on the beat and a creature on the beat (the colossus strikes it).
 * v5: in the toad's duel at the end of the first journey it taps the baton on the blow's beat (a parry).
 * v7: the first virada (in the first breather): the glove taps each golden mark as its ring closes.
 */
import type { JourneyBattle } from './journeyBattle';
import type { TutorialId } from '../sim/journey';
import { TOWERS } from '../sim/defs';

type Signal = 'slotOpen' | 'built' | 'go' | 'towerOpen' | 'upgraded' | 'ff' | 'ffReady' | 'pickup' | 'plate' | 'baton' | 'groove' | 'solo' | 'virada' | 'coinBeat' | 'strike' | 'parry' | 'none';

interface Step {
  where: () => { x: number; y: number } | null;
  until: Signal;
  /** only this slot's signal counts */
  slot?: number;
  when?: () => boolean;
  timeout?: number;
  /** the glove taps in time: how far its finger is down (0…1) */
  press?: () => number;
}

export class JourneyTutorial {
  private steps: Step[] = [];
  private shown = 0;
  /** seconds since the player last built, upgraded or opened a plate */
  private idle = 0;
  private slotScreen: (i: number, y?: number) => { x: number; y: number } | null;
  /** plates the glove already pointed at */
  private plates = new Set<number>();

  constructor(private b: JourneyBattle, ids: TutorialId[], private nudges = false) {
    const sim = b.sim;
    const view = b.view;
    const hud = b.hud;
    const slotScreen = (i: number, y = 1.2) => {
      const s = view.screen(view.slotWorld(i, y));
      return s.behind ? null : { x: s.x, y: s.y };
    };
    this.slotScreen = slotScreen;
    const radial = (index: number, count: number) => {
      const el = hud.root.querySelector('#radial') as HTMLElement | null;
      if (!el || !hud.radialOpen) return null;
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
      if (!m) return null;
      const R = count <= 1 ? 0 : count <= 4 ? 82 : 96;
      const a = count === 1 ? -Math.PI / 2 : -Math.PI / 2 + (index / count) * Math.PI * 2;
      return { x: +m[1] + Math.cos(a) * R, y: +m[2] + Math.sin(a) * R };
    };
    const byId = (sel: string) => () => {
      const el = hud.root.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const nearestPickup = () => {
      let best: { x: number; y: number } | null = null;
      let bd = Infinity;
      for (const p of sim.pickups) {
        if (p.taken || p.lost) continue;
        const pv = view.pickups.get(p.id);
        if (!pv || !pv.group.visible) continue;
        const wp = pv.group.position.clone();
        wp.y += 2;
        const s = view.screen(wp);
        if (s.behind || s.x < 40 || s.y < 80 || s.x > window.innerWidth - 40 || s.y > window.innerHeight - 40) continue;
        const d = Math.hypot(p.x - sim.turtle.x, p.z - sim.turtle.z);
        if (d < bd && d < 34) {
          bd = d;
          best = { x: s.x, y: s.y };
        }
      }
      return best;
    };
    for (const id of ids) {
      if (id === 'basics') {
        this.steps.push({ where: () => (hud.radialOpen ? null : slotScreen(0)), until: 'slotOpen' });
        this.steps.push({ where: () => radial(0, b.def.towers.length), until: 'built', timeout: 25 });
        this.steps.push({ where: () => (sim.started ? null : byId('#go')()), until: 'go' });
      }
      if (id === 'pickup') {
        this.steps.push({ when: () => sim.started, where: nearestPickup, until: 'pickup', timeout: 14 });
      }
      if (id === 'upgrade') {
        this.steps.push({
          when: () => sim.towers.some((t) => (sim.upgradeCost(t) ?? Infinity) <= sim.coins),
          where: () => {
            if (hud.radialOpen) return null;
            const t = sim.towers.find((x) => (sim.upgradeCost(x) ?? Infinity) <= sim.coins);
            return t ? slotScreen(t.slot, 2.4) : null;
          },
          until: 'towerOpen',
          timeout: 15,
        });
        this.steps.push({
          where: () => {
            if (!hud.radialOpen) return null;
            const el = hud.root.querySelector('#radial') as HTMLElement;
            const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
            return m ? { x: +m[1], y: +m[2] - 88 } : null;
          },
          until: 'upgraded',
          timeout: 12,
        });
      }
      if (id === 'baton') {
        // after the first wave: the glove keeps the beat on the baton until the groove rises
        this.steps.push({
          when: () => sim.started && sim.stats.kills >= 2 && sim.aliveCount() === 0,
          where: () => hud.batonCenter(),
          press: () => b.beatPress(),
          until: 'groove',
          timeout: 30,
        });
      }
      if (id === 'baton') {
        // what it does: the meter rises, and the musicians shine brighter with it
        this.steps.push({ when: () => sim.power >= 15, where: byId('#power .bar'), until: 'none', timeout: 2.6 });
        this.steps.push({
          when: () => sim.towers.length > 0,
          where: () => (hud.radialOpen || !sim.towers.length ? null : slotScreen(sim.towers[0].slot, 2.4)),
          until: 'none',
          timeout: 2,
        });
      }
      if (id === 'coin') {
        // a golden note, tapped on the beat
        this.steps.push({ when: () => sim.started, where: nearestPickup, press: () => b.beatPress(), until: 'coinBeat', timeout: 16 });
      }
      if (id === 'strike') {
        // a creature close to the colossus, tapped on the beat
        const nearestFoe = () => {
          let best: { x: number; y: number } | null = null;
          let bd = 20;
          for (const e of sim.enemies) {
            if (!e.alive || e.structure || e.burrowed) continue;
            const d = Math.hypot(e.x - sim.turtle.x, e.z - sim.turtle.z);
            const v = view.enemies.get(e.id);
            if (d >= bd || !v || !v.visibleNow) continue;
            const sc = view.screen(v.pos.clone().setY(v.pos.y + 1.2));
            if (sc.behind || sc.x < 30 || sc.y < 60 || sc.x > window.innerWidth - 30 || sc.y > window.innerHeight - 30) continue;
            bd = d;
            best = { x: sc.x, y: sc.y };
          }
          return best;
        };
        this.steps.push({ when: () => sim.started, where: nearestFoe, press: () => b.beatPress(), until: 'strike', timeout: 14 });
      }
      if (id === 'parry') {
        // the duel: the glove taps the baton right on the beat the boss's blow lands
        this.steps.push({
          when: () => b.nextBlowTime() !== null,
          where: () => (b.nextBlowTime() !== null ? hud.batonCenter() : null),
          press: () => {
            const t = b.nextBlowTime();
            return t === null ? 0 : b.pressAt(t);
          },
          until: 'parry',
          timeout: 24,
        });
      }
      if (id === 'virada') {
        // the first virada: the glove taps each golden mark right as its ring closes
        this.steps.push({
          when: () => b.viradaGuide() !== null,
          where: () => {
            const g = b.viradaGuide();
            return g ? { x: g.x, y: g.y } : null;
          },
          press: () => {
            const g = b.viradaGuide();
            return g ? b.pressAt(g.t) : 0;
          },
          until: 'virada',
          timeout: 30,
        });
      }
      if (id === 'solo') {
        // a musician glows: the glove taps it on the beat
        const glowing = () => sim.towers.find((t) => sim.canSolo(t));
        this.steps.push({
          when: () => !!glowing() && !hud.radialOpen,
          where: () => {
            const t = glowing();
            return t ? slotScreen(t.slot, 2.4) : null;
          },
          press: () => b.beatPress(),
          until: 'solo',
          timeout: 20,
        });
      }
      if (id === 'ff') {
        this.steps.push({ when: () => sim.ffReady(), where: byId('#ff-btn'), until: 'ff', timeout: 20 });
      }
    }
  }

  notify(sig: Signal, slot?: number) {
    if (sig === 'built' || sig === 'upgraded' || sig === 'slotOpen' || sig === 'towerOpen' || sig === 'go') this.idle = 0;
    // a plate lit up: in the first land the glove shows it once (ahead of anything else)
    if (sig === 'plate' && this.nudges && slot !== undefined && !this.plates.has(slot)) {
      this.plates.add(slot);
      const { hud, sim } = this.b;
      this.steps.unshift({ where: () => (hud.radialOpen || sim.towerAt(slot) ? null : this.slotScreen(slot)), until: 'slotOpen', slot, timeout: 8 });
      this.shown = 0;
      return;
    }
    const s = this.steps[0];
    if (s && s.until === sig && (s.slot === undefined || s.slot === slot)) {
      this.steps.shift();
      this.shown = 0;
      this.b.hud.hand(null);
    }
  }

  update(dt: number) {
    if (this.b.isPaused) {
      this.b.hud.hand(null);
      return;
    }
    this.idle += dt;
    const s = this.steps[0];
    let p: { x: number; y: number } | null = null;
    let press: number | undefined;
    if (s && (!s.when || s.when())) {
      p = s.where();
      if (p && s.press) press = s.press();
      if (p) this.shown += dt;
      if (s.timeout && this.shown > s.timeout) {
        this.steps.shift();
        this.shown = 0;
        p = null;
      }
    }
    if (!p && this.nudges) p = this.nudge();
    this.b.hud.hand(p, p ? press : undefined);
  }

  /** an idle player with notes to spend: the free plate (or, with no free plate, a tower that can grow) */
  private nudge(): { x: number; y: number } | null {
    const { sim, hud } = this.b;
    if (!sim.started || hud.radialOpen || this.idle < 6) return null;
    const cheapest = Math.min(...this.b.def.towers.map((k) => TOWERS[k].levels[0].cost));
    if (sim.coins >= cheapest) {
      for (let i = 0; i < sim.slotsOpen; i++) if (!sim.towerAt(i)) return this.slotScreen(i);
    }
    if (this.idle >= 10) {
      const t = sim.towers.find((x) => (sim.upgradeCost(x) ?? Infinity) <= sim.coins);
      if (t) return this.slotScreen(t.slot, 2.4);
    }
    return null;
  }

  dispose() {
    this.b.hud.hand(null);
  }
}
