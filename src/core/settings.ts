/** Player settings (persisted separately from saves). */
import type { Quality } from './engine';

export interface Settings {
  lang: 'pt' | 'en';
  quality: Quality;
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  showFps: boolean;
  shake: boolean;
}

const KEY = 'fortissimo.settings';

export const DEFAULT_SETTINGS: Settings = { lang: 'pt', quality: 'high', master: 0.9, music: 0.8, sfx: 0.85, ambience: 0.6, showFps: false, shake: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  const s = { ...DEFAULT_SETTINGS };
  if (typeof navigator !== 'undefined' && !navigator.language?.toLowerCase().startsWith('pt')) s.lang = 'en';
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) s.quality = 'medium';
  return s;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
