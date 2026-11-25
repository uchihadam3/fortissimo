/**
 * A peaceful walk for menus and the map: the colossus strolls through a fully coloured land,
 * stepping on the beat of whatever music is playing, while the camera drifts around it.
 */
import { Journey, type JourneyDef } from '../sim/journey';
import { JourneyView } from '../view/journeyView';
import type { Engine } from '../core/engine';
import { audio } from './sound';
import type { WorldId } from '../sim/defs';
import { SONGS } from '../sim/defs';

export function showcaseDef(world: WorldId): JourneyDef {
  return {
    id: `show-${world}`, world, song: world === 'meadow' ? 'menu' : world, name: { pt: '', en: '' }, bars: 230, slots: 0, coins: 0, towers: [],
    waves: [], pickups: 0, seed: world === 'meadow' ? 11 : 23, curviness: 0.8,
    features: [
      { kind: 'meadow', from: 0, to: 60 },
      { kind: 'lake', from: 40, to: 90, side: 1 },
      { kind: 'forest', from: 90, to: 150, side: -1 },
      { kind: 'river', from: 160, to: 168 },
      { kind: 'hills', from: 170, to: 260 },
      { kind: 'lake', from: 260, to: 320, side: -1 },
    ],
  };
}

export class Showcase {
  readonly sim: Journey;
  readonly view: JourneyView;
  private remove: () => void;
  private t0 = performance.now() / 1000;
  orbitSpeed = 0.035;

  constructor(readonly engine: Engine, world: WorldId = 'meadow', opts: { yaw?: number; pitch?: number; dist?: number; life?: number } = {}) {
    const def = showcaseDef(world);
    this.sim = new Journey(def, SONGS[def.song].bpm);
    this.sim.begin();
    // start a little way in, where the land is pretty
    this.sim.turtle.s = 30;
    this.view = new JourneyView(engine, def, this.sim);
    this.view.lifeTarget = this.view.life = opts.life ?? 1.1;
    this.view.setCamera(opts.yaw ?? 2.3, opts.pitch ?? 0.26, opts.dist ?? 27, true);
    engine.setScene(this.view.scene);
    engine.camera.far = 5000;
    engine.camera.fov = 42;
    engine.camera.updateProjectionMatrix();
    engine.renderer.toneMappingExposure = this.view.look.exposure;
    this.remove = engine.onUpdate((dt, t) => this.update(dt, t));
    this.frame();
    this.onResize = () => this.frame();
    window.addEventListener('resize', this.onResize);
  }

  private onResize: () => void;
  /** shift the picture so the colossus stands beside the menu */
  shift = 0.2;
  private frame() {
    const w = window.innerWidth, h = window.innerHeight;
    const cam = this.engine.camera;
    if (w > h * 1.1) cam.setViewOffset(w, h, -w * this.shift, 0, w, h);
    else cam.clearViewOffset();
  }

  private update(dt: number, t: number) {
    const clock = audio.songClock();
    let beat: number;
    let time: number;
    if (clock) {
      time = audio.now() - audio.latency() - clock.t0;
      beat = time / clock.spb;
    } else {
      time = performance.now() / 1000 - this.t0;
      beat = time / this.sim.spb;
    }
    // walk continuously (the sim has no enemies; it only moves the colossus)
    this.sim.advance(Math.max(this.sim.time, (beat * this.sim.spb)));
    this.sim.drain();
    this.view.addYaw(dt * this.orbitSpeed);
    this.view.update(dt, t, this.sim.time, beat, true);
  }

  dispose() {
    this.remove();
    window.removeEventListener('resize', this.onResize);
    this.engine.camera.clearViewOffset();
    this.view.dispose();
  }
}
