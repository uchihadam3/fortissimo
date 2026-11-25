/**
 * FORTÍSSIMO — entry point. Uchihadam Production.
 */
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel-decorative/900.css';
import './ui/ui.css';
import { App } from './game/app';
import { journeyScene, turtleScene } from './dev/scenes';
import type { WorldId } from './sim/defs';

declare global {
  interface Window {
    __ready?: boolean;
    __app?: App;
  }
}

async function boot() {
  const p = new URLSearchParams(location.search);
  const container = document.getElementById('app')!;
  if (p.get('scene') === 'turtle') return turtleScene(container);
  if (p.get('scene') === 'journey') return journeyScene(container, (p.get('world') as WorldId) ?? 'meadow', { t: Number(p.get('t') ?? 40), cam: p.get('cam') ?? 'chase' });
  await Promise.all([
    document.fonts.load('900 40px "Cinzel Decorative"'),
    document.fonts.load('700 40px "Cinzel"'),
    document.fonts.load('800 16px "Nunito"'),
  ]).catch(() => {});
  const app = new App(container);
  window.__app = app;
  window.__ready = true;
  // the installed game: offline copy + automatic updates (hosted site only)
  let top = false;
  try {
    top = window.top === window.self;
  } catch {
    top = false;
  }
  const secure = location.protocol === 'https:' || location.hostname === 'localhost';
  if (import.meta.env.PROD && 'serviceWorker' in navigator && secure && top) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (had) app.screens.toast(app.screens.t('updateReady'));
    });
  }
  try {
    const prev = localStorage.getItem('fortissimo.version');
    if (prev && prev !== __BUILD__) setTimeout(() => app.screens.toast(app.screens.t('updated')), 9000);
    localStorage.setItem('fortissimo.version', __BUILD__);
  } catch {
    /* storage blocked */
  }
  // developer shortcuts: ?skip (no intro), ?play=m1 (straight into a journey)
  if (p.has('play')) {
    const { newSave } = await import('./core/save');
    app.save = newSave(2);
    app.save.flags.intro = true;
    for (const id of (p.get('done') ?? '').split(',').filter(Boolean)) app.save.levels[id] = { stars: 3 };
    await app.boot(true);
    await app.playLevel(p.get('play') || 'm1', 'normal');
    return;
  }
  if (p.has('map')) {
    const { newSave } = await import('./core/save');
    app.save = newSave(2);
    for (const id of (p.get('done') ?? '').split(',').filter(Boolean)) app.save.levels[id] = { stars: 2 + (id.length % 2) };
    app.save.current = p.get('map') || 'm1';
    await app.boot(true);
    await app.openMap();
    return;
  }
  if (p.has('cine')) {
    const { playCutscene } = await import('./game/cutscenes');
    await app.boot(true);
    await playCutscene(app, p.get('cine') === 'ending' ? 'ending' : 'intro');
    return;
  }
  await app.boot(p.has('skip'));
}

boot().catch((e) => {
  console.error(e);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:20px;color:#f88;font:12px monospace;white-space:pre-wrap;z-index:999';
  el.textContent = 'FORTÍSSIMO failed to start:\n' + (e?.stack ?? e);
  document.body.appendChild(el);
});
