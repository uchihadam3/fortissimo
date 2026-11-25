/**
 * Wordless tutorial for journeys: a white glove points at the one thing to do next, and disappears
 * as soon as the player does it. It never blocks the game.
 */
import type { JourneyBattle } from './journeyBattle';
import type { TutorialId } from '../sim/journey';

type Signal = 'slotOpen' | 'built' | 'go' | 'towerOpen' | 'upgraded' | 'ff' | 'ffReady' | 'pickup';

interface Step {
  where: () => { x: number; y: number } | null;
  until: Signal;
  when?: () => boolean;
  timeout?: number;
}

export class JourneyTutorial {
  private steps: Step[] = [];
  private shown = 0;

  constructor(private b: JourneyBattle, ids: TutorialId[]) {
    const sim = b.sim;
    const view = b.view;
    const hud = b.hud;
    const slotScreen = (i: number, y = 1.2) => {
      const s = view.screen(view.slotWorld(i, y));
      return s.behind ? null : { x: s.x, y: s.y };
    };
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
        if (!pv) continue;
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
      if (id === 'ff') {
        this.steps.push({ when: () => sim.ffReady(), where: byId('#ff-btn'), until: 'ff', timeout: 20 });
      }
    }
  }

  notify(sig: Signal) {
    const s = this.steps[0];
    if (s && s.until === sig) {
      this.steps.shift();
      this.shown = 0;
      this.b.hud.hand(null);
    }
  }

  update(dt: number) {
    const s = this.steps[0];
    if (!s || this.b.isPaused) {
      this.b.hud.hand(null);
      return;
    }
    if (s.when && !s.when()) {
      this.b.hud.hand(null);
      return;
    }
    const p = s.where();
    this.b.hud.hand(p);
    if (p) this.shown += dt;
    if (s.timeout && this.shown > s.timeout) {
      this.steps.shift();
      this.shown = 0;
      this.b.hud.hand(null);
    }
  }

  dispose() {
    this.b.hud.hand(null);
  }
}
