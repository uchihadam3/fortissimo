/**
 * The whole game: intro → menu → journeys (save slots) → world map → battles → results,
 * cutscenes and the ending. Owns the engine, the screens, the save and the settings.
 */
import { Engine } from '../core/engine';
import { Screens } from '../ui/screens';
import { audio } from './sound';
import { Showcase } from './showcase';
import { JourneyBattle, type BattleResult } from './journeyBattle';
import { CAMPAIGN, LEVEL_BY_ID, endlessDef } from '../data/campaign';
import { loadSettings, saveSettings, type Settings } from '../core/settings';
import { deleteSlot, exportFile, lastSlot, loadSlot, newSave, saveFromCode, saveToCode, writeSlot, type SaveData } from '../core/save';
import type { WorldId } from '../sim/defs';
import type { Mode } from '../sim/journey';
import { isLevelOpen } from '../ui/screens';
import { listSlots } from '../core/save';
import { SCENES, chapterDue, flagOf, playStory, sceneAfter, sceneTitle, seen, shardsOf, unlocked, type SceneDef } from './story';

export const INSTALL_URL = 'https://uchihadam3.github.io/fortissimo/';

type InstallEvt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export class App {
  readonly engine: Engine;
  readonly screens: Screens;
  readonly uiRoot: HTMLElement;
  settings: Settings;
  save: SaveData | null = null;
  private showcase: Showcase | null = null;
  private battle: JourneyBattle | null = null;
  private installEvt: InstallEvt | null = null;
  private playClock = 0;
  private fpsEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.uiRoot = document.createElement('div');
    this.uiRoot.id = 'ui';
    document.body.appendChild(this.uiRoot);
    this.engine = new Engine(container);
    this.screens = new Screens(this.uiRoot);
    this.settings = loadSettings();
    this.applySettings();
    this.screens.sounds = {
      hover: () => audio.uiHover(),
      click: () => audio.uiClick(),
      back: () => audio.uiBack(),
      studio: () => audio.studioSting(),
      title: () => audio.titleReveal(),
      star: (i) => audio.star(i),
      unlock: () => audio.newTower(),
    };
    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps';
    document.body.appendChild(this.fpsEl);
    setInterval(() => {
      this.fpsEl.textContent = this.settings.showFps ? `${Math.round(this.engine.fps)} fps` : '';
      if (this.save && this.battle) this.playClock += 0.5;
    }, 500);
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvt = e as InstallEvt;
    });
    window.addEventListener('appinstalled', () => {
      this.installEvt = null;
      this.screens.toast(this.screens.t('installed'));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.battle && !this.battle.isPaused) this.openPause();
        this.persist();
      }
    });
    window.addEventListener('beforeunload', () => this.persist());
  }

  private applySettings() {
    const s = this.settings;
    audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, ambience: s.ambience });
    if (this.engine.quality !== s.quality) this.engine.setQuality(s.quality);
    this.screens.lang = s.lang;
    document.documentElement.lang = s.lang === 'pt' ? 'pt-BR' : 'en';
  }

  // ───────────────────────────── boot ─────────────────────────────

  async boot(skipIntro = false) {
    this.engine.start();
    this.engine.paused = true;
    if (!skipIntro) {
      await this.screens.gate();
      await Promise.race([audio.unlock(), new Promise((r) => setTimeout(r, 1500))]);
      await this.screens.studio();
      await this.screens.title();
    } else {
      await Promise.race([audio.unlock(), new Promise((r) => setTimeout(r, 500))]);
    }
    await this.menu(true);
  }

  // ───────────────────────────── menu ─────────────────────────────

  private setShowcase(world: WorldId | null) {
    if (this.showcase) {
      this.showcase.dispose();
      this.showcase = null;
    }
    if (world) {
      this.showcase = new Showcase(this.engine, world);
      // the Heart on the shell shows the shards already home (the journey in progress)
      const last = lastSlot();
      this.showcase.view.turtle.setShards(shardsOf(this.save ?? (last !== null ? loadSlot(last) : null)));
      this.engine.paused = false;
    }
  }

  async menu(fromIntro = false) {
    this.disposeBattle();
    audio.playSong('menu', { fade: 2 });
    audio.setAmbience('menu', 0.6);
    audio.setIntensity(0);
    this.setShowcase('meadow');
    const last = lastSlot();
    this.screens.menu({
      canContinue: last !== null,
      installable: installMode(!!this.installEvt) !== 'installed',
      version: typeof __BUILD__ === 'string' ? __BUILD__.split('-').slice(0, 1).join('') : 'dev',
      onContinue: () => {
        const d = last !== null ? loadSlot(last) : null;
        if (d) this.startSave(d, false);
      },
      onNew: () => this.slots('new'),
      onLoad: () => this.slots('load'),
      onOptions: () => this.screens.options(this.settings, (s) => this.changeSettings(s), () => this.menu()),
      onStory: listSlots().some((s) => s.data?.flags.intro) ? () => this.storyGallery() : undefined,
      onCredits: () => this.screens.credits(() => this.menu()),
      onInstall: () => this.install(),
    });
    if (fromIntro) {
      this.screens.fadeTo(1, 0);
      await new Promise((r) => setTimeout(r, 60));
      await this.screens.fadeTo(0, 1400);
    }
  }

  private changeSettings(s: Settings) {
    const langChanged = s.lang !== this.screens.lang;
    this.settings = { ...s };
    saveSettings(this.settings);
    this.applySettings();
    void langChanged;
  }

  private slots(mode: 'new' | 'load') {
    this.screens.slots(mode, {
      pick: (slot) => {
        if (mode === 'new') {
          const d = newSave(slot);
          writeSlot(d);
          this.startSave(d, true);
        } else {
          const d = loadSlot(slot);
          if (d) this.startSave(d, false);
        }
      },
      del: (slot) => deleteSlot(slot),
      exp: (slot) => {
        const d = loadSlot(slot);
        if (!d) return;
        this.screens.saveCode(saveToCode(d), () => false, () => exportFile(d));
      },
      imp: () => {
        this.screens.saveCode(null, (code) => {
          const d = saveFromCode(code);
          if (!d) {
            this.screens.toast(this.screens.t('importBad'));
            return false;
          }
          // into the first empty slot (or the chosen slot number of the save)
          let slot = [0, 1, 2].find((i) => !loadSlot(i));
          if (slot === undefined) slot = d.slot ?? 0;
          d.slot = slot;
          writeSlot(d);
          this.screens.toast(this.screens.t('importOk'));
          this.slots(mode);
          return true;
        }, () => {});
      },
      back: () => this.menu(),
    });
  }

  private async startSave(d: SaveData, isNew: boolean) {
    this.save = d;
    this.playClock = d.playTime;
    await this.screens.fadeTo(1, 700);
    this.screens.clear();
    if (isNew && !d.flags.intro) {
      this.setShowcase(null);
      await playStory(this, 'intro');
      d.flags.intro = true;
      this.persist();
      // the first land's chapter opening plays on the way into the first journey
      await this.playLevel('m1', 'normal');
      return;
    }
    await this.openMap();
  }

  /** Play a story scene once and remember it was seen (it ends on a black screen). */
  private async storyScene(s: SceneDef) {
    this.disposeBattle();
    this.setShowcase(null);
    await playStory(this, s.id);
    if (this.save) {
      this.save.flags[flagOf(s)] = true;
      this.persist();
    }
  }

  // ───────────────────────────── the story gallery ─────────────────────────────

  /** Every story scene, to watch again; locked ones show only their place in the story. */
  storyGallery() {
    this.disposeBattle();
    if (!this.showcase) this.setShowcase('meadow');
    audio.playSong('menu', { fade: 2 });
    const saves = listSlots().map((s) => s.data).filter((d): d is SaveData => !!d);
    const entries = SCENES.map((s) => ({
      id: s.id,
      kind: s.kind,
      world: s.world,
      title: sceneTitle(s, this.screens.lang),
      open: saves.some((d) => unlocked(d, s)),
    }));
    this.screens.storyGallery(entries, async (id) => {
      await this.screens.fadeTo(1, 600);
      this.screens.clear();
      this.setShowcase(null);
      await playStory(this, id);
      this.setShowcase('meadow');
      audio.playSong('menu', { fade: 2 });
      this.storyGallery();
      await this.screens.fadeTo(0, 900);
    }, () => this.menu());
  }

  /** Clear menus and background scenes before a cinematic. */
  enterCinematic() {
    this.screens.clear();
    this.disposeBattle();
    this.setShowcase(null);
  }

  persist() {
    if (!this.save) return;
    this.save.playTime = this.playClock;
    writeSlot(this.save);
  }

  // ───────────────────────────── map ─────────────────────────────

  async openMap() {
    this.disposeBattle();
    this.setShowcase(null);
    this.engine.paused = true;
    audio.playSong('map', { fade: 2 });
    audio.setAmbience('none');
    const save = this.save!;
    this.screens.map(save, {
      play: (id, mode) => this.playLevel(id, mode),
      endless: (w) => this.playEndless(w),
      back: () => {
        this.persist();
        this.menu();
      },
      options: () => this.screens.options(this.settings, (s) => this.changeSettings(s), () => {}, true),
    });
    await this.screens.fadeTo(0, 600);
  }

  // ───────────────────────────── battles ─────────────────────────────

  private disposeBattle() {
    if (this.battle) {
      this.battle.dispose();
      this.battle = null;
    }
  }

  async playLevel(id: string, mode: Mode): Promise<void> {
    const entry = LEVEL_BY_ID.get(id);
    if (!entry || !this.save) return;
    await this.screens.fadeTo(1, 500);
    this.screens.clear();
    // the first time the band enters a land: its chapter opening
    if (chapterDue(this.save, entry.world)) {
      const ch = SCENES.find((s) => s.kind === 'chapter' && s.world === entry.world);
      if (ch) await this.storyScene(ch);
    }
    this.screens.loading(true);
    this.setShowcase(null);
    this.disposeBattle();
    await new Promise((r) => setTimeout(r, 50));
    const save = this.save;
    save.current = id;
    const b = new JourneyBattle(this.engine, entry.def, {
      mode,
      known: save.knownTowers,
      seenEnemies: save.seenEnemies,
      tutorials: true,
      onEnemySeen: () => this.persist(),
    }, this.uiRoot);
    this.battle = b;
    b.view.turtle.setShards(shardsOf(save));
    this.markVoice(b, entry.world, entry.kind === 'boss');
    b.onPauseRequest = () => this.openPause();
    this.engine.paused = false;
    this.screens.loading(false);
    await this.screens.fadeTo(0, 900);
    const r = await b.done;
    await this.afterBattle(id, mode, r);
  }

  /**
   * The land's great Voice at the end of the road stays wrapped in ink until its guardian is beaten.
   * Arriving loosens the ink a little; arriving at the guardian's journey frees it.
   */
  private markVoice(b: JourneyBattle, world: WorldId, boss: boolean) {
    const guardian = CAMPAIGN.find((l) => l.world === world && l.kind === 'boss');
    if (!guardian || !this.save || (this.save.levels[guardian.id]?.stars ?? 0) > 0) return;
    const lm = b.view.landmark;
    lm.setCorrupt(1);
    const ring = lm.ring.bind(lm);
    lm.ring = () => {
      ring();
      lm.setCorrupt(boss ? 0 : 0.6, false);
    };
  }

  private async playEndless(world: WorldId): Promise<void> {
    if (!this.save) return;
    await this.screens.fadeTo(1, 500);
    this.screens.clear();
    this.screens.loading(true);
    this.disposeBattle();
    await new Promise((r) => setTimeout(r, 50));
    const def = endlessDef(world);
    const b = new JourneyBattle(this.engine, def, { mode: 'normal', known: this.save.knownTowers, seenEnemies: this.save.seenEnemies, tutorials: false }, this.uiRoot);
    this.battle = b;
    b.view.turtle.setShards(shardsOf(this.save));
    b.onPauseRequest = () => this.openPause();
    this.engine.paused = false;
    this.screens.loading(false);
    await this.screens.fadeTo(0, 900);
    const r = await b.done;
    const waves = b.sim.wavesBegun();
    const key = `bis-${world}`;
    const rec = this.save.levels[key] ?? { stars: 0 };
    rec.best = Math.max(rec.best ?? 0, waves);
    this.save.levels[key] = rec;
    this.persist();
    if (r.outcome === 'quit') {
      const again = this.restartRequested;
      this.restartRequested = null;
      if (again) return this.playEndless(world);
      return this.openMap();
    }
    await this.screens.results({
      victory: r.outcome === 'victory', stars: 0, kills: r.kills, collected: r.collected, time: r.time, crown: false, endless: waves,
      retry: () => this.playEndless(world), map: () => this.openMap(),
    });
  }

  private async afterBattle(id: string, mode: Mode, r: BattleResult): Promise<void> {
    const save = this.save!;
    const entry = LEVEL_BY_ID.get(id)!;
    if (r.outcome === 'quit') {
      this.persist();
      const again = this.restartRequested;
      this.restartRequested = null;
      if (again && LEVEL_BY_ID.has(again.id)) return this.playLevel(again.id, again.mode);
      await this.screens.fadeTo(1, 400);
      return this.openMap();
    }
    const victory = r.outcome === 'victory';
    let firstClear = false;
    if (victory) {
      const rec = save.levels[id] ?? { stars: 0 };
      firstClear = rec.stars === 0;
      rec.stars = Math.max(rec.stars, r.stars);
      if (mode === 'virtuoso') rec.crown = true;
      save.levels[id] = rec;
      // the next journey on the main road becomes the current one
      const next = CAMPAIGN.find((l) => (l.kind === 'main' || l.kind === 'boss') && l.requires.includes(id));
      if (next && isLevelOpen(save, next)) save.current = next.id;
    }
    this.persist();
    void firstClear;
    // story moments: the ending after the Silence, the epilogue after the Abyss (with the cast credits)
    const scene = victory ? sceneAfter(id) : undefined;
    if (scene && !seen(save, scene) && (scene.kind === 'ending' || scene.kind === 'epilogue')) {
      await this.screens.fadeTo(1, 900);
      this.screens.clear();
      await this.storyScene(scene);
      return this.openMap();
    }
    // the interlude plays the first time on the way out of the results (later it can be watched again)
    const pending = scene && !seen(save, scene) ? scene : null;
    const withStory = (go: () => Promise<void> | void) => async () => {
      if (pending) {
        await this.screens.fadeTo(1, 600);
        this.screens.clear();
        await this.storyScene(pending);
      }
      await go();
    };
    const nextEntry = CAMPAIGN.find((l) => (l.kind === 'main' || l.kind === 'boss') && l.requires.includes(id));
    await this.screens.results({
      victory,
      stars: r.stars,
      kills: r.kills,
      collected: r.collected,
      time: r.time,
      crown: victory && mode === 'virtuoso',
      next: victory && nextEntry && isLevelOpen(save, nextEntry) ? withStory(() => this.playLevel(nextEntry.id, 'normal')) : undefined,
      retry: () => this.playLevel(id, mode),
      map: withStory(() => this.openMap()),
      scene: scene && !pending ? async () => {
        await this.screens.fadeTo(1, 600);
        this.screens.clear();
        await this.storyScene(scene);
        await this.openMap();
      } : undefined,
      sceneNew: !!pending,
    });
  }

  private restartRequested: { id: string; mode: Mode } | null = null;

  private openPause() {
    const b = this.battle;
    if (!b || b.isPaused) return;
    b.pause();
    audio.uiOpen();
    this.showPauseMenu(b);
  }

  /** The pause menu (the battle is already paused). */
  private showPauseMenu(b: JourneyBattle) {
    if (this.battle !== b) return;
    this.screens.pause({
      resume: () => b.resume(),
      restart: () => {
        this.restartRequested = { id: b.def.id, mode: b.sim.mode };
        b.quit();
      },
      options: () => this.screens.options(this.settings, (s) => this.changeSettings(s), () => this.showPauseMenu(b), true),
      map: () => b.quit(),
    });
  }

  // ───────────────────────────── install ─────────────────────────────

  private async install() {
    const mode = installMode(!!this.installEvt);
    if (mode === 'prompt' && this.installEvt) {
      try {
        await this.installEvt.prompt();
        const c = await this.installEvt.userChoice;
        if (c.outcome === 'accepted') this.installEvt = null;
      } catch {
        /* the browser refused to show it again */
      }
      return;
    }
    if (mode === 'installed') return;
    this.screens.install(mode, INSTALL_URL);
  }
}

/** How this copy can be installed: already installed, the browser's prompt, iPhone steps, or elsewhere. */
export function installMode(hasPrompt: boolean): 'installed' | 'prompt' | 'ios' | 'elsewhere' | 'unsupported' {
  const nav = navigator as Navigator & { standalone?: boolean };
  const app = matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches || (matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement);
  if (app || nav.standalone) return 'installed';
  if (hasPrompt) return 'prompt';
  let embedded = false;
  try {
    embedded = window.top !== window.self;
  } catch {
    embedded = true;
  }
  const official = location.protocol === 'https:' && location.href.startsWith(INSTALL_URL.replace(/\/$/, ''));
  if (embedded || !official) return 'elsewhere';
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'unsupported';
}
