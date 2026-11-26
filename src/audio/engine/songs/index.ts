/**
 * Theme registry: SongId and the cinematic moods → a fresh composition.
 * Moods are `mood:<name>` or `mood:<name>@<world>` (coloured by that land).
 */
import type { WorldId } from '../../../sim/defs';
import { FULL_BAND, type Theme, type TrackId } from '../music';
import { Battle } from './battle';
import { BossTheme } from './boss';
import { makeBossScore } from './bossfight';
import { AfterglowMood, AfterRestMood, AloneMood, ApproachMood, BloomMood, DawnMood, FallMood, FestivalMood, GreyMood, HopeMood } from './cinema';
import { CitadelTheme } from './citadel';
import { CreditsTheme } from './credits';
import { DesertTheme } from './desert';
import { FinaleTheme } from './finale';
import { ForgeTheme } from './forge';
import { IceTheme } from './ice';
import { MeadowTheme } from './meadow';
import { MapTheme, MenuTheme } from './menu';
import { makeMood } from './moods';

Battle.bossFactory = makeBossScore;

const WORLDS: WorldId[] = ['meadow', 'desert', 'ice', 'forge', 'citadel'];

function landSong(w: WorldId): Theme {
  const s = w === 'meadow' ? new MeadowTheme() : w === 'desert' ? new DesertTheme() : w === 'ice' ? new IceTheme() : w === 'forge' ? new ForgeTheme() : new CitadelTheme();
  // the chapter opening: the land's own song in its calm form (its breakdown), the full orchestra
  s.fixedBand = FULL_BAND;
  return s;
}

export function makeTheme(id: TrackId): Theme | null {
  switch (id) {
    case 'menu': return new MenuTheme();
    case 'map': return new MapTheme();
    case 'meadow': return new MeadowTheme();
    case 'desert': return new DesertTheme();
    case 'ice': return new IceTheme();
    case 'forge': return new ForgeTheme();
    case 'citadel': return new CitadelTheme();
    case 'boss': return new BossTheme();
    case 'finale': return new FinaleTheme();
    case 'credits': return new CreditsTheme();
    // 'ending' as a song: the bloom (the cues drive the full ending score)
    case 'ending': return new BloomMood();
  }
  if (!id.startsWith('mood:')) return null;
  const [name, w] = id.slice(5).split('@');
  const world = WORLDS.includes(w as WorldId) ? (w as WorldId) : null;
  switch (name) {
    case 'dawn': return new DawnMood();
    case 'festival': return new FestivalMood();
    case 'approach': return new ApproachMood();
    case 'grey': return new GreyMood();
    case 'hope': return new HopeMood();
    case 'afterglow': return new AfterglowMood();
    case 'fall': return new FallMood();
    case 'alone': return new AloneMood();
    case 'after': return new AfterRestMood();
    case 'bloom': return new BloomMood();
    case 'land': return landSong(world ?? 'meadow');
  }
  return makeMood(name, world);
}
