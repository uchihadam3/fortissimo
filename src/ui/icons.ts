/** Hand-drawn SVG icons (no text anywhere: the game teaches with pictures). */
import type { EnemyKind, TowerKind } from '../sim/defs';

const svg = (body: string, vb = '0 0 64 64') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

const OUT = 'stroke="#2a1d14" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';

export const TOWER_ICON: Record<TowerKind, string> = {
  harp: svg(`
    <path d="M20 52 C10 40 12 18 22 12 C26 22 24 34 28 40" fill="none" ${OUT} />
    <path d="M44 52 C54 40 52 18 42 12 C38 22 40 34 36 40" fill="none" ${OUT} />
    <path d="M20 52 C10 40 12 18 22 12 C26 22 24 34 28 40" fill="none" stroke="#f2c14e" stroke-width="5" stroke-linecap="round"/>
    <path d="M44 52 C54 40 52 18 42 12 C38 22 40 34 36 40" fill="none" stroke="#f2c14e" stroke-width="5" stroke-linecap="round"/>
    <rect x="16" y="49" width="32" height="8" rx="3" fill="#9a6a42" ${OUT}/>
    <rect x="19" y="18" width="26" height="5" rx="2.5" fill="#9a6a42" ${OUT}/>
    <path d="M26 23 V49 M30 23 V49 M34 23 V49 M38 23 V49" stroke="#fff3c4" stroke-width="1.8"/>
    <circle cx="32" cy="12" r="4" fill="#ffd36b" ${OUT}/>`),
  drum: svg(`
    <ellipse cx="32" cy="46" rx="20" ry="7" fill="#b8402f" ${OUT}/>
    <path d="M12 26 V46 A20 7 0 0 0 52 46 V26" fill="#d4493a" ${OUT}/>
    <path d="M14 30 L22 44 L30 30 L38 44 L46 30 L50 40" fill="none" stroke="#f6e2b0" stroke-width="2.4" stroke-linejoin="round"/>
    <ellipse cx="32" cy="26" rx="20" ry="7" fill="#f6ecd6" ${OUT}/>
    <path d="M40 6 L28 22" stroke="#7a5034" stroke-width="4" stroke-linecap="round"/>
    <circle cx="42" cy="6" r="5" fill="#f6ecd6" ${OUT}/>`),
  bell: svg(`
    <path d="M32 8 C20 8 18 22 18 32 C18 40 14 44 12 48 H52 C50 44 46 40 46 32 C46 22 44 8 32 8 Z" fill="#d39a45" ${OUT}/>
    <path d="M24 16 C22 22 22 30 22 36" stroke="#f6d48a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="53" r="5" fill="#6b4422" ${OUT}/>
    <path d="M48 10 l3 6 l6 3 l-6 3 l-3 6 l-3 -6 l-6 -3 l6 -3 z" fill="#bff0ff" stroke="#3a7ea8" stroke-width="1.6"/>`),
  shaker: svg(`
    <ellipse cx="30" cy="24" rx="15" ry="17" fill="#ffcf3a" ${OUT}/>
    <path d="M38 38 L50 56" stroke="#7a5034" stroke-width="7" stroke-linecap="round"/>
    <path d="M38 38 L50 56" stroke="#9a6a42" stroke-width="4" stroke-linecap="round"/>
    <circle cx="24" cy="20" r="2.4" fill="#d6303f"/><circle cx="32" cy="16" r="2.4" fill="#3f8ad6"/><circle cx="34" cy="26" r="2.4" fill="#d6303f"/>
    <circle cx="25" cy="30" r="2.4" fill="#3fb06a"/>
    <path d="M50 14 a6 6 0 0 1 0 8 M54 10 a11 11 0 0 1 0 16" fill="none" stroke="#ffe9a8" stroke-width="2.4" stroke-linecap="round"/>`),
  crystal: svg(`
    <path d="M32 4 L44 22 L32 50 L20 22 Z" fill="#b57bff" ${OUT}/>
    <path d="M32 4 L32 50 M20 22 L44 22" stroke="#e7d4ff" stroke-width="1.8"/>
    <rect x="26" y="50" width="12" height="10" rx="2" fill="#5a5470" ${OUT}/>
    <path d="M48 30 L56 30 L50 40 L58 40 L46 56 L50 44 L44 44 Z" fill="#fff3a0" stroke="#7a5aa8" stroke-width="1.8" stroke-linejoin="round"/>`),
  horn: svg(`
    <path d="M10 38 C24 38 30 30 34 22 L52 8 C56 20 56 36 52 50 L34 38 C30 44 22 46 10 46 Z" fill="#e2a93a" ${OUT}/>
    <ellipse cx="53" cy="29" rx="4.5" ry="21" fill="#f6d27a" ${OUT}/>
    <circle cx="18" cy="42" r="5" fill="none" stroke="#2a1d14" stroke-width="2.6"/>
    <path d="M58 12 q5 4 0 8 M60 24 q5 5 0 10" fill="none" stroke="#ffe2a0" stroke-width="2.4" stroke-linecap="round"/>`),
  choir: svg(`
    <path d="M8 56 C8 44 14 40 20 40 C26 40 32 44 32 56 Z" fill="#ece2cf" ${OUT}/>
    <path d="M32 56 C32 44 38 40 44 40 C50 40 56 44 56 56 Z" fill="#ece2cf" ${OUT}/>
    <path d="M20 58 C20 42 26 36 32 36 C38 36 44 42 44 58 Z" fill="#f6f0e4" ${OUT}/>
    <circle cx="20" cy="32" r="7" fill="#ffe1c4" ${OUT}/><circle cx="44" cy="32" r="7" fill="#ffe1c4" ${OUT}/>
    <circle cx="32" cy="26" r="8" fill="#ffe1c4" ${OUT}/>
    <ellipse cx="20" cy="35" rx="2" ry="2.6" fill="#5a2a2a"/><ellipse cx="44" cy="35" rx="2" ry="2.6" fill="#5a2a2a"/><ellipse cx="32" cy="29.5" rx="2.4" ry="3.2" fill="#5a2a2a"/>
    <ellipse cx="32" cy="12" rx="12" ry="3.5" fill="none" stroke="#ffd36b" stroke-width="3"/>`),
  bass: svg(`
    <rect x="12" y="8" width="40" height="50" rx="5" fill="#2a2533" ${OUT}/>
    <circle cx="32" cy="38" r="13" fill="#3d3550" stroke="#151219" stroke-width="3"/>
    <circle cx="32" cy="38" r="5" fill="#9b7bd0"/>
    <circle cx="32" cy="17" r="5" fill="#3d3550" stroke="#151219" stroke-width="2"/>
    <path d="M56 26 q6 12 0 24 M8 26 q-6 12 0 24" fill="none" stroke="#b48cff" stroke-width="2.6" stroke-linecap="round"/>`),
};

const ENEMY_BODY: Partial<Record<EnemyKind, string>> = {
  blot: '#463d63', blotling: '#6a5f8c', scurry: '#4f6185', shell: '#6b6880', moth: '#cfc6e6', shield: '#3d4a6b', bubble: '#b9b0e6',
  phantom: '#e9e4ff', muffler: '#7d7890', mender: '#3f5a52', bossBlot: '#3a3158', bossScarab: '#a8742e', bossMoth: '#8a9fc6', bossGolem: '#3d3436', silence: '#1d1a2b',
};

/** A tiny portrait: body colour, two eyes and the X tape. */
export function enemyIcon(kind: EnemyKind): string {
  const c = ENEMY_BODY[kind] ?? '#463d63';
  const extra: Record<string, string> = {
    moth: '<path d="M6 24 C2 10 18 8 24 22 M58 24 C62 10 46 8 40 22" fill="#cfc6e6" stroke="#2a1d14" stroke-width="2"/>',
    shield: '<circle cx="46" cy="42" r="11" fill="#d6dde8" stroke="#2a1d14" stroke-width="2.4"/>',
    shell: '<path d="M10 34 C10 14 54 14 54 34 Z" fill="#8f8ca3" stroke="#2a1d14" stroke-width="2.4"/>',
    muffler: '<circle cx="12" cy="30" r="7" fill="#f08aa8" stroke="#2a1d14" stroke-width="2"/><circle cx="52" cy="30" r="7" fill="#f08aa8" stroke="#2a1d14" stroke-width="2"/><path d="M12 24 C14 8 50 8 52 24" fill="none" stroke="#c45a7a" stroke-width="3"/>',
    mender: '<circle cx="52" cy="14" r="6" fill="#7dff9a" stroke="#2a1d14" stroke-width="2"/>',
    scurry: '<path d="M20 14 L16 2 L26 10 M44 14 L48 2 L38 10" fill="#4f6185" stroke="#2a1d14" stroke-width="2"/>',
    phantom: '',
    bossBlot: '<path d="M18 14 L22 4 L28 12 L32 2 L36 12 L42 4 L46 14" fill="#ffd36b" stroke="#2a1d14" stroke-width="2"/>',
    silence: '<ellipse cx="32" cy="32" rx="14" ry="17" fill="#f2f0f7" stroke="#2a1d14" stroke-width="2"/>',
  };
  const isSilence = kind === 'silence';
  return svg(`
    ${extra[kind] && kind !== 'silence' && kind !== 'muffler' && kind !== 'mender' && kind !== 'shield' ? extra[kind] : ''}
    <circle cx="32" cy="36" r="${kind === 'blotling' ? 17 : 22}" fill="${c}" stroke="#1b1630" stroke-width="2.6" ${kind === 'phantom' || kind === 'bubble' ? 'opacity="0.85"' : ''}/>
    ${kind === 'muffler' || kind === 'mender' || kind === 'shield' || isSilence ? extra[kind] : ''}
    ${isSilence ? '<ellipse cx="26" cy="30" rx="3" ry="5" fill="#0a0812"/><ellipse cx="38" cy="30" rx="3" ry="5" fill="#0a0812"/>' : `
    <circle cx="25" cy="32" r="6" fill="#fff"/><circle cx="39" cy="32" r="6" fill="#fff"/>
    <circle cx="26" cy="33" r="3.2" fill="#1b1630"/><circle cx="40" cy="33" r="3.2" fill="#1b1630"/>
    <path d="M27 42 L37 48 M37 42 L27 48" stroke="#e9e2d2" stroke-width="3.2" stroke-linecap="round"/>`}`);
}

export const ICON = {
  turtle: svg(`<ellipse cx="32" cy="36" rx="22" ry="15" fill="#c4823f" stroke="#4a2c14" stroke-width="3"/><path d="M20 30 L26 24 L38 24 L44 30 L38 36 L26 36 Z" fill="#d9a35a" stroke="#4a2c14" stroke-width="2"/><circle cx="56" cy="34" r="7" fill="#4f957c" stroke="#1f4a3a" stroke-width="3"/><circle cx="58" cy="32" r="1.8" fill="#1b1630"/><ellipse cx="16" cy="50" rx="5" ry="4" fill="#4f957c" stroke="#1f4a3a" stroke-width="2.4"/><ellipse cx="46" cy="50" rx="5" ry="4" fill="#4f957c" stroke="#1f4a3a" stroke-width="2.4"/>`),
  bell: svg(`<path d="M32 6 C20 6 18 20 18 30 C18 38 14 42 12 46 H52 C50 42 46 38 46 30 C46 20 44 6 32 6 Z" fill="#e9b949" stroke="#6a4310" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="52" r="5" fill="#6a4310"/><path d="M8 20 q-4 8 0 16 M56 20 q4 8 0 16" fill="none" stroke="#ffe9a8" stroke-width="3" stroke-linecap="round"/>`),
  heart: svg(`<path d="M32 56 C10 40 4 28 8 18 C12 8 26 6 32 18 C38 6 52 8 56 18 C60 28 54 40 32 56 Z" fill="#ff5a6a" stroke="#4a1020" stroke-width="3" stroke-linejoin="round"/>
    <path d="M16 18 C18 13 23 12 26 15" fill="none" stroke="#ffd0d6" stroke-width="3.4" stroke-linecap="round"/>`),
  coin: svg(`<circle cx="32" cy="32" r="27" fill="#f2b630" stroke="#6a4310" stroke-width="3"/><circle cx="32" cy="32" r="21" fill="#ffd36b" stroke="#c88a1a" stroke-width="2"/>
    <ellipse cx="27" cy="41" rx="7" ry="5.4" transform="rotate(-24 27 41)" fill="#6a4310"/><path d="M33 40 V18 C37 22 42 22 42 28" fill="none" stroke="#6a4310" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  wave: svg(`<circle cx="32" cy="34" r="22" fill="#463d63" stroke="#1b1630" stroke-width="3"/><circle cx="25" cy="30" r="6" fill="#fff"/><circle cx="39" cy="30" r="6" fill="#fff"/>
    <circle cx="26" cy="31" r="3" fill="#1b1630"/><circle cx="40" cy="31" r="3" fill="#1b1630"/><path d="M27 41 L37 47 M37 41 L27 47" stroke="#e9e2d2" stroke-width="3.4" stroke-linecap="round"/>`),
  play: svg(`<path d="M22 14 L50 32 L22 50 Z" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>`),
  pause: svg(`<rect x="16" y="13" width="11" height="38" rx="3" fill="currentColor"/><rect x="37" y="13" width="11" height="38" rx="3" fill="currentColor"/>`),
  next: svg(`<path d="M12 16 L32 32 L12 48 Z M32 16 L52 32 L32 48 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`),
  up: svg(`<path d="M32 8 L54 34 H41 V56 H23 V34 H10 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`),
  sell: svg(`<circle cx="32" cy="32" r="22" fill="#ffd36b" stroke="#6a4310" stroke-width="3"/><path d="M22 32 H42 M32 22 V42" stroke="#6a4310" stroke-width="0" /><path d="M24 26 L32 18 L40 26 M32 18 V44" fill="none" stroke="#6a4310" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" transform="rotate(180 32 31)"/>`),
  close: svg(`<path d="M18 18 L46 46 M46 18 L18 46" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>`),
  restart: svg(`<path d="M46 20 A18 18 0 1 0 50 34" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M40 10 L50 20 L38 26" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`),
  map: svg(`<path d="M8 14 L24 8 L40 14 L56 8 V50 L40 56 L24 50 L8 56 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 8 V50 M40 14 V56" stroke="currentColor" stroke-width="3"/>`),
  gear: svg(`<path d="M32 20 a12 12 0 1 0 0.01 0 Z" fill="none" stroke="currentColor" stroke-width="5"/><path d="M32 4 V12 M32 52 V60 M4 32 H12 M52 32 H60 M12 12 L18 18 M46 46 L52 52 M12 52 L18 46 M46 18 L52 12" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`),
  star: svg(`<path d="M32 4 L40 23 L60 24 L44 37 L50 57 L32 46 L14 57 L20 37 L4 24 L24 23 Z" fill="currentColor" stroke="#6a4310" stroke-width="2.6" stroke-linejoin="round"/>`),
  crown: svg(`<path d="M8 48 L12 18 L24 32 L32 12 L40 32 L52 18 L56 48 Z" fill="currentColor" stroke="#6a4310" stroke-width="3" stroke-linejoin="round"/><rect x="8" y="48" width="48" height="8" rx="2" fill="currentColor" stroke="#6a4310" stroke-width="3"/>`),
  lock: svg(`<rect x="14" y="28" width="36" height="28" rx="5" fill="currentColor"/><path d="M22 28 V20 A10 10 0 0 1 42 20 V28" fill="none" stroke="currentColor" stroke-width="6"/>`),
  check: svg(`<path d="M12 34 L26 48 L52 18" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`),
  ff: svg(`<text x="32" y="46" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="700" font-size="40" fill="currentColor">ff</text>`),
  speaker: svg(`<path d="M10 24 H22 L36 12 V52 L22 40 H10 Z" fill="currentColor"/><path d="M44 22 q8 10 0 20 M50 16 q14 16 0 32" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`),
  infinity: svg(`<path d="M32 32 C24 20 10 20 10 32 C10 44 24 44 32 32 C40 20 54 20 54 32 C54 44 40 44 32 32 Z" fill="none" stroke="currentColor" stroke-width="6"/>`),
  hand: svg(`<path d="M24 58 C18 50 12 42 10 36 C8 31 14 28 18 33 L22 38 V12 C22 7 29 7 29 12 V30 L30 26 C30 21 37 21 37 26 V31 C37 26 44 26 44 31 V34 C44 29 51 29 51 34 V44 C51 52 46 58 40 58 Z" fill="#fff" stroke="#2a1d14" stroke-width="3" stroke-linejoin="round"/>`),
  wing: svg(`<path d="M8 40 C8 20 30 10 56 12 C48 18 52 22 44 26 C50 28 46 34 38 34 C42 38 36 42 28 40 C22 46 14 46 8 40 Z" fill="#cfc6e6" stroke="#2a1d14" stroke-width="3" stroke-linejoin="round"/>`),
  eyeOff: svg(`<path d="M6 32 C16 18 48 18 58 32 C48 46 16 46 6 32 Z" fill="#fff" stroke="#2a1d14" stroke-width="3"/><circle cx="32" cy="32" r="8" fill="#2a1d14"/><path d="M10 54 L54 10" stroke="#ff5a6a" stroke-width="6" stroke-linecap="round"/>`),
  shieldI: svg(`<path d="M32 6 L54 14 V30 C54 44 44 54 32 58 C20 54 10 44 10 30 V14 Z" fill="#d6dde8" stroke="#2a1d14" stroke-width="3" stroke-linejoin="round"/>`),
  armor: svg(`<path d="M10 36 C10 16 54 16 54 36 Z" fill="#8f8ca3" stroke="#2a1d14" stroke-width="3"/><path d="M18 34 C18 24 46 24 46 34" fill="none" stroke="#d9d6e6" stroke-width="2.6"/><rect x="8" y="36" width="48" height="8" rx="3" fill="#6b6880" stroke="#2a1d14" stroke-width="3"/>`),
  speed: svg(`<path d="M8 22 H30 M4 32 H26 M10 42 H32" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M34 14 L58 32 L34 50 Z" fill="currentColor"/>`),
  split: svg(`<circle cx="32" cy="20" r="12" fill="#b9b0e6" stroke="#2a1d14" stroke-width="3"/><circle cx="16" cy="46" r="8" fill="#6a5f8c" stroke="#2a1d14" stroke-width="3"/><circle cx="32" cy="50" r="8" fill="#6a5f8c" stroke="#2a1d14" stroke-width="3"/><circle cx="48" cy="46" r="8" fill="#6a5f8c" stroke="#2a1d14" stroke-width="3"/>`),
  mute: svg(`<path d="M10 24 H22 L36 12 V52 L22 40 H10 Z" fill="#cfd3e6" stroke="#2a1d14" stroke-width="3" stroke-linejoin="round"/><path d="M44 22 L58 42 M58 22 L44 42" stroke="#ff5a6a" stroke-width="6" stroke-linecap="round"/>`),
  healI: svg(`<path d="M24 8 H40 V24 H56 V40 H40 V56 H24 V40 H8 V24 H24 Z" fill="#7dff9a" stroke="#1d4a2a" stroke-width="3" stroke-linejoin="round"/>`),
  noAir: svg(`<path d="M8 40 C8 20 30 10 56 12 C48 18 52 22 44 26 C50 28 46 34 38 34 C42 38 36 42 28 40 C22 46 14 46 8 40 Z" fill="#cfc6e6" stroke="#2a1d14" stroke-width="3"/><path d="M8 56 L56 8" stroke="#ff5a6a" stroke-width="6" stroke-linecap="round"/>`),
  sword: svg(`<path d="M44 6 L58 6 L58 20 L26 52 L12 38 Z" fill="#d6dde8" stroke="#2a1d14" stroke-width="3" stroke-linejoin="round"/><path d="M10 40 L24 54 M6 58 L14 50" stroke="#2a1d14" stroke-width="5" stroke-linecap="round"/>`),
  range: svg(`<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="6 6"/><circle cx="32" cy="32" r="6" fill="currentColor"/>`),
  boost: svg(`<path d="M32 4 L38 24 L58 24 L42 36 L48 56 L32 44 L16 56 L22 36 L6 24 L26 24 Z" fill="#ffd36b" stroke="#6a4310" stroke-width="2.6" stroke-linejoin="round"/>`),
  income: svg(`<circle cx="32" cy="36" r="20" fill="#ffd36b" stroke="#6a4310" stroke-width="3"/><path d="M32 4 V20 M24 12 L32 4 L40 12" fill="none" stroke="#3fb06a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),
};
