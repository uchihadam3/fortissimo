/** Theme registry: SongId (and internal cinematic tracks) → a fresh composition. */
import type { Theme, TrackId } from '../music';
import { BossTheme, CitadelTheme, DesertTheme, FinaleTheme, ForgeTheme, IceTheme, MeadowTheme } from './battle';
import { AloneTheme, BloomTheme, DawnTheme, FallTheme, FestivalTheme } from './cinema';
import { CreditsTheme } from './credits';
import { MapTheme, MenuTheme } from './menu';

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
    case 'ending': return new BloomTheme();
    case 'cine:dawn': return new DawnTheme();
    case 'cine:festival': return new FestivalTheme();
    case 'cine:fall': return new FallTheme();
    case 'cine:alone': return new AloneTheme();
    case 'cine:bloom': return new BloomTheme();
    default: return null;
  }
}
