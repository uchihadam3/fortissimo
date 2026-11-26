/** Hand-drawn SVG icons (no text anywhere: the game teaches with pictures). */
import type { EnemyKind, TowerKind } from '../sim/defs';

const svg = (body: string, vb = '0 0 64 64') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

const OUT = 'stroke="#2a1d14" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';
const INK = 'stroke="#1b1630" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"';

// ───────────────────────────── shared little faces ─────────────────────────────

/** two cartoon eyes (white, dark pupil, highlight) */
const eyes = (x1: number, x2: number, y: number, r: number, pupil = '#1b1630', white = '#ffffff') => [x1, x2]
  .map((x) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${white}" ${INK}/><circle cx="${x + r * 0.15}" cy="${y + r * 0.12}" r="${r * 0.55}" fill="${pupil}"/><circle cx="${x + r * 0.38}" cy="${y - r * 0.25}" r="${r * 0.22}" fill="#fff"/>`)
  .join('');
/** angry/fierce brows */
const brows = (x1: number, x2: number, y: number, w: number) => `<path d="M${x1 - w} ${y - 2} L${x1 + w} ${y + 1.5} M${x2 + w} ${y - 2} L${x2 - w} ${y + 1.5}" stroke="#1b1630" stroke-width="2.6" stroke-linecap="round"/>`;
/** the mark of the Silence: a mouth sewn shut with an X */
const xmouth = (x: number, y: number, s: number, col = '#f1e6cf') => `<path d="M${x - s} ${y - s} L${x + s} ${y + s} M${x + s} ${y - s} L${x - s} ${y + s}" stroke="#1b1630" stroke-width="${s * 0.95 + 1.6}" stroke-linecap="round"/><path d="M${x - s} ${y - s} L${x + s} ${y + s} M${x + s} ${y - s} L${x - s} ${y + s}" stroke="${col}" stroke-width="${s * 0.75}" stroke-linecap="round"/>`;
/** a glowing shard (the Heart's fragment a guardian holds) */
const shard = (x: number, y: number, s: number, c: string) => `<path d="M${x} ${y - s * 1.6} L${x + s * 0.8} ${y} L${x} ${y + s * 1.1} L${x - s * 0.8} ${y} Z" fill="${c}" stroke="#fff8d0" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${x}" cy="${y - s * 0.2}" r="${s * 2.2}" fill="${c}" opacity=".25"/>`;
/** a note bird's beak */
const beak = (x: number, y: number, s = 4, c = '#f5a43a') => `<path d="M${x - s} ${y - s * 0.5} L${x + s} ${y - s * 0.5} L${x} ${y + s * 0.9} Z" fill="${c}" ${INK}/>`;
const cheeks = (x1: number, x2: number, y: number, c = '#ff9ab0') => `<ellipse cx="${x1}" cy="${y}" rx="3.4" ry="2.2" fill="${c}" opacity=".8"/><ellipse cx="${x2}" cy="${y}" rx="3.4" ry="2.2" fill="${c}" opacity=".8"/>`;

// ───────────────────────────── the band (towers) ─────────────────────────────

export const TOWER_ICON: Record<TowerKind, string> = {
  // Lira: tiny green bird with a leaf, behind her golden harp
  harp: svg(`
    <ellipse cx="22" cy="40" rx="15" ry="16" fill="#7cc96a" ${INK}/>
    <ellipse cx="22" cy="46" rx="10" ry="8" fill="#effad6"/>
    <path d="M22 24 C18 14 22 8 30 6 C30 14 28 20 22 24 Z" fill="#5fb44a" ${INK}/>
    <path d="M22 23 C24 17 27 12 29 8" stroke="#2f6f2a" stroke-width="1.6" fill="none"/>
    ${eyes(16, 27, 38, 4.6)}${beak(21.5, 45, 3)}${cheeks(12, 31, 44)}
    <path d="M36 58 L36 10 C44 10 52 14 58 20 L42 56 Z" fill="none" stroke="#2a1d14" stroke-width="6" stroke-linejoin="round"/>
    <path d="M36 58 L36 10 C44 10 52 14 58 20 L42 56 Z" fill="none" stroke="#f2c84e" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M40 14 V50 M45 15 V44 M50 17 V36 M55 19 V28" stroke="#fff1c8" stroke-width="1.6"/>
    <circle cx="36" cy="8" r="3.2" fill="#f2c84e" ${OUT}/>`),
  // Bumbo: big red bird in a navy shako, bass drum on the belly
  drum: svg(`
    <ellipse cx="32" cy="38" rx="21" ry="20" fill="#e2554b" ${INK}/>
    <path d="M18 22 L19 6 H45 L46 22 Z" fill="#283a72" ${INK}/>
    <rect x="17" y="18" width="30" height="5" fill="#f2c84e" ${INK}/>
    <circle cx="32" cy="12" r="3" fill="#f2c84e"/>
    <path d="M31 6 C29 0 33 -1 34 3 C35 0 38 2 36 6" fill="#fff" stroke="#e2453c" stroke-width="2"/>
    ${eyes(25, 39, 30, 4.4)}${beak(32, 36, 3.4)}
    <rect x="17" y="42" width="30" height="18" rx="4" fill="#c9382f" ${INK}/>
    <path d="M19 45 L25 57 L31 45 L37 57 L43 45" fill="none" stroke="#f4e6c2" stroke-width="2"/>
    <rect x="15" y="42" width="34" height="3.4" rx="1.6" fill="#efe2c4" ${INK}/>
    <rect x="15" y="57" width="34" height="3.4" rx="1.6" fill="#efe2c4" ${INK}/>
    <path d="M10 40 L20 48" stroke="#7a5034" stroke-width="3" stroke-linecap="round"/><circle cx="9" cy="39" r="3.6" fill="#f6ecd6" ${INK}/>`),
  // Dona Badalo: blue owl-bird with round glasses, ringing a bronze hand bell
  bell: svg(`
    <path d="M14 20 L18 8 L24 18 M50 20 L46 8 L40 18" fill="#3d6bb5" ${INK}/>
    <ellipse cx="30" cy="38" rx="20" ry="21" fill="#5b8fd8" ${INK}/>
    <ellipse cx="30" cy="31" rx="15" ry="10" fill="#d6e5f8"/>
    ${eyes(23, 37, 31, 4.6, '#7a4a10', '#fff6dc')}
    <circle cx="23" cy="31" r="6.6" fill="none" stroke="#f2c84e" stroke-width="2"/><circle cx="37" cy="31" r="6.6" fill="none" stroke="#f2c84e" stroke-width="2"/>
    <path d="M29.6 31 H30.4" stroke="#f2c84e" stroke-width="2"/>${beak(30, 38, 3, '#e9b04c')}
    <path d="M12 48 C18 54 42 54 48 48 L46 44 C40 49 20 49 14 44 Z" fill="#a983c9" ${INK}/>
    <path d="M52 30 V36" stroke="#7a5034" stroke-width="4" stroke-linecap="round"/>
    <path d="M52 34 C45 34 45 44 43 50 H61 C59 44 59 34 52 34 Z" fill="#d29a46" ${OUT}/>
    <circle cx="52" cy="53" r="2.6" fill="#5a3a1a"/>
    <path d="M40 38 q-3 4 0 8 M63 38 q3 4 0 8" fill="none" stroke="#bff0ff" stroke-width="2" stroke-linecap="round"/>`),
  // Chocalho: sandy yellow with goggles and a striped scarf, shaking two maracas
  shaker: svg(`
    <ellipse cx="32" cy="38" rx="18" ry="19" fill="#efc95b" ${INK}/>
    <circle cx="26" cy="22" r="4.6" fill="#ffc95a" stroke="#7a4e2a" stroke-width="2.4"/><circle cx="38" cy="22" r="4.6" fill="#ffc95a" stroke="#7a4e2a" stroke-width="2.4"/>
    ${eyes(26, 38, 33, 4.2)}${beak(32, 39, 3, '#f07f35')}${cheeks(20, 44, 40, '#ff9a7e')}
    <path d="M15 45 C22 50 42 50 49 45 L49 49 C42 54 22 54 15 49 Z" fill="#2aa39b" ${INK}/>
    <path d="M21 47.5 V51 M27 49 V52.6 M33 49.4 V53 M39 49 V52.6 M45 47.5 V51" stroke="#f6ecd2" stroke-width="2.2"/>
    <path d="M10 30 L14 40" stroke="#7a5034" stroke-width="3" stroke-linecap="round"/><ellipse cx="8" cy="24" rx="6" ry="7.6" fill="#e5534b" ${INK}/>
    <path d="M54 30 L50 40" stroke="#7a5034" stroke-width="3" stroke-linecap="round"/><ellipse cx="56" cy="24" rx="6" ry="7.6" fill="#3aa6d8" ${INK}/>
    <path d="M2 14 q4 -3 8 0 M54 12 q4 -3 8 0" fill="none" stroke="#ffe9a8" stroke-width="2" stroke-linecap="round"/>`),
  // Cristalina: lilac bird with a crystal crest, a floating crystal before her
  crystal: svg(`
    <path d="M22 18 L19 4 L27 16 M32 15 L32 1 L36 15 M42 18 L46 5 L38 16" fill="#d9f2ff" stroke="#7a5aa8" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="30" cy="36" rx="18" ry="20" fill="#c7a3f7" ${INK}/>
    <ellipse cx="30" cy="44" rx="11" ry="9" fill="#f5ecff"/>
    ${eyes(24, 36, 32, 4.2, '#5a2a9a')}
    <path d="M19 26 l-3 -2 M21 25 l-2 -3 M41 26 l3 -2 M39 25 l2 -3" stroke="#2a1640" stroke-width="1.6" stroke-linecap="round"/>
    ${beak(30, 39, 3, '#f3be7a')}${cheeks(19, 41, 39, '#ff9ed4')}
    <path d="M52 28 L60 40 L52 60 L44 40 Z" fill="#c9a0ff" stroke="#3a2a6a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M52 28 V60 M44 40 H60" stroke="#f2e2ff" stroke-width="1.4"/>
    <path d="M58 22 L62 24 L60 18 Z" fill="#fff3a0"/>`),
  // Trompa: fluffy white bird in a striped beanie, a brass horn
  horn: svg(`
    <path d="M14 34 a5 5 0 0 1 3 -8 a6 6 0 0 1 8 -5 a7 7 0 0 1 14 0 a6 6 0 0 1 8 5 a5 5 0 0 1 3 8 a5 5 0 0 1 -2 9 a6 6 0 0 1 -6 10 a8 8 0 0 1 -20 0 a6 6 0 0 1 -6 -10 a5 5 0 0 1 -2 -9 Z" fill="#f5f2ea" ${INK}/>
    <path d="M14 26 C14 8 50 8 50 26 Z" fill="#d8453e" ${INK}/>
    <path d="M18 16 H46 M15 21 H49" stroke="#f3ead8" stroke-width="3"/>
    <rect x="12" y="24" width="40" height="5" rx="2.5" fill="#f3ead8" ${INK}/>
    <circle cx="32" cy="7" r="5" fill="#f6efe0" ${INK}/>
    ${eyes(25, 38, 34, 4)}${beak(31.5, 40, 3)}${cheeks(19, 44, 40, '#ff8597')}
    <path d="M36 50 C42 50 46 46 50 40 L60 34 C63 42 62 50 58 58 L49 52 C45 55 40 56 34 56 Z" fill="#e0a636" ${OUT}/>
    <ellipse cx="59.5" cy="46" rx="3" ry="12" fill="#f6d27a" ${OUT}/>
    <circle cx="40" cy="53" r="3.4" fill="none" stroke="#2a1d14" stroke-width="2"/>`),
  // the Coralitos: three pink chicks singing
  choir: svg(`
    ${[[14, 40, 9.5], [32, 32, 11], [50, 40, 9.5]].map(([x, y, r]) => `
      <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.1}" fill="#ff9fca" ${INK}/>
      <circle cx="${x - r * 0.36}" cy="${y - r * 0.2}" r="${r * 0.22}" fill="#1b1630"/><circle cx="${x + r * 0.36}" cy="${y - r * 0.2}" r="${r * 0.22}" fill="#1b1630"/>
      <path d="M${x - 3} ${y + r * 0.25} L${x + 3} ${y + r * 0.25} L${x} ${y + r * 0.25 + 2.4} Z" fill="#f7a83a" stroke="#1b1630" stroke-width="1.4" stroke-linejoin="round"/>
      <ellipse cx="${x}" cy="${y + r * 0.55}" rx="2.4" ry="2" fill="#c0304a"/>`).join('')}
    <path d="M32 21 L29 15 M32 21 L32 13 M32 21 L35 15" stroke="#e07aa8" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M50 30 l-4 -3 v6 z M50 30 l4 -3 v6 z" fill="#e2445a"/>
    <rect x="4" y="52" width="56" height="8" rx="2" fill="#b98652" ${OUT}/>
    <ellipse cx="32" cy="8" rx="13" ry="3.4" fill="none" stroke="#ffd36b" stroke-width="2.6"/>`),
  // Grave: huge purple bird in a top hat with a double bass
  bass: svg(`
    <ellipse cx="36" cy="40" rx="22" ry="21" fill="#6c4ca0" ${INK}/>
    <ellipse cx="36" cy="49" rx="13" ry="9" fill="#c6b0e6"/>
    <rect x="23" y="6" width="26" height="15" rx="2" fill="#241e2e" ${INK}/>
    <rect x="16" y="19" width="40" height="4" rx="2" fill="#1d1824" ${INK}/>
    <rect x="23" y="15" width="26" height="4" fill="#8b5bd6"/>
    ${eyes(29, 43, 32, 3.8)}
    <path d="M25 29 H33 M39 29 H47" stroke="#6c4ca0" stroke-width="3.4"/>
    ${beak(36, 38, 3.4, '#e8a03a')}
    <path d="M31 48 l-5 -3 v6 z M41 48 l5 -3 v6 z" fill="#9a1f33" stroke="#1b1630" stroke-width="1.2"/>
    <path d="M10 22 V30 M8 30 C2 34 4 42 8 44 C2 48 2 58 12 60 C20 58 20 48 14 44 C18 42 20 34 12 30 Z" fill="#c8622a" ${OUT}/>
    <path d="M10 6 V30" stroke="#17121a" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M9 32 V58 M12 32 V58" stroke="#f0e8ff" stroke-width="1"/>
    <path d="M2 50 L22 44" stroke="#4a2a18" stroke-width="2.4" stroke-linecap="round"/>`),
};

// ───────────────────────────── the creatures ─────────────────────────────

// v5 bosses without an icon yet fall back to the blot (the art agent adds theirs)
const E: Partial<Record<EnemyKind, string>> & { blot: string } = {
  blot: `<path d="M32 6 C36 16 52 26 52 42 C52 54 43 60 32 60 C21 60 12 54 12 42 C12 26 28 16 32 6 Z" fill="#3b3068" ${INK}/>
    <path d="M32 7 C26 2 22 9 27 12" fill="none" stroke="#54438c" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M18 34 C20 28 24 24 28 22" fill="none" stroke="#6a5aa8" stroke-width="2.4" stroke-linecap="round"/>
    ${eyes(25, 39, 38, 6)}${xmouth(32, 51, 3.4)}`,
  blotling: `<path d="M32 14 C35 22 46 30 46 42 C46 51 40 56 32 56 C24 56 18 51 18 42 C18 30 29 22 32 14 Z" fill="#7a68c0" ${INK}/>
    <path d="M32 15 C28 11 25 16 29 18" fill="none" stroke="#8a76d0" stroke-width="2.6" stroke-linecap="round"/>
    ${eyes(26, 38, 40, 5.4)}${xmouth(32, 50, 2.6)}`,
  scurry: `<circle cx="16" cy="18" r="12" fill="#33467c" ${INK}/><circle cx="48" cy="18" r="12" fill="#33467c" ${INK}/>
    <circle cx="16" cy="18" r="7.4" fill="#f39ac0"/><circle cx="48" cy="18" r="7.4" fill="#f39ac0"/>
    <path d="M14 36 C14 24 50 24 50 36 C50 46 40 52 32 58 C24 52 14 46 14 36 Z" fill="#4a63a3" ${INK}/>
    ${eyes(25, 39, 36, 5)}<circle cx="32" cy="55" r="3" fill="#0d0a16"/>
    <path d="M18 48 L6 46 M18 51 L6 53 M46 48 L58 46 M46 51 L58 53" stroke="#e8e1f4" stroke-width="1.6" stroke-linecap="round"/>${xmouth(32, 47, 2.4)}`,
  bubble: `<circle cx="32" cy="34" r="25" fill="#c9b6f2" opacity=".55" ${INK}/>
    <path d="M14 26 C16 16 26 10 34 10" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M22 44 C24 41 28 41 28 45 C28 48 23 49 22 44 Z M36 46 C38 43 42 43 42 47 C42 50 37 51 36 46 Z" fill="#2a2050"/>
    <path d="M18 40 C26 50 40 50 46 38" fill="none" stroke="#2a2050" stroke-width="2"/>
    ${eyes(25, 39, 28, 4.8)}${xmouth(32, 38, 2.4)}`,
  moth: `<path d="M30 30 C18 10 2 12 4 28 C6 38 18 40 30 34 Z M34 30 C46 10 62 12 60 28 C58 38 46 40 34 34 Z" fill="#aa9fc6" ${INK}/>
    <path d="M30 36 C18 40 10 52 18 56 C24 58 28 48 31 40 Z M34 36 C46 40 54 52 46 56 C40 58 36 48 33 40 Z" fill="#8d84aa" ${INK}/>
    <circle cx="16" cy="24" r="5" fill="#2a2346"/><circle cx="16" cy="24" r="2.2" fill="#f4efff"/><circle cx="48" cy="24" r="5" fill="#2a2346"/><circle cx="48" cy="24" r="2.2" fill="#f4efff"/>
    <ellipse cx="32" cy="38" rx="6" ry="12" fill="#e3dcf2" ${INK}/>
    <path d="M29 26 C26 18 22 16 20 14 M35 26 C38 18 42 16 44 14" fill="none" stroke="#2c2546" stroke-width="2" stroke-linecap="round"/>
    <circle cx="29.5" cy="33" r="2.4" fill="#fff" stroke="#1b1630" stroke-width="1.2"/><circle cx="34.5" cy="33" r="2.4" fill="#fff" stroke="#1b1630" stroke-width="1.2"/>${xmouth(32, 40, 1.8)}`,
  scorpion: `<path d="M44 40 C56 36 58 20 50 12 C46 8 40 10 42 16" fill="none" stroke="#1b1630" stroke-width="8" stroke-linecap="round"/>
    <path d="M44 40 C56 36 58 20 50 12 C46 8 40 10 42 16" fill="none" stroke="#dcb274" stroke-width="5" stroke-linecap="round"/>
    <path d="M42 16 L38 22 L45 20 Z" fill="#1b1325"/><circle cx="40" cy="20" r="1.8" fill="#b48cff"/>
    <ellipse cx="30" cy="44" rx="18" ry="12" fill="#dcb274" ${INK}/>
    <path d="M16 46 C24 50 38 50 46 46" fill="none" stroke="#a85c2e" stroke-width="2.4"/>
    <path d="M14 36 C6 32 4 24 10 20 L14 26 L8 26 C10 30 14 32 18 34" fill="#dcb274" ${INK}/>
    <path d="M14 54 L8 60 M20 55 L16 62 M40 55 L44 62 M46 54 L52 60" stroke="#2a1f33" stroke-width="2.4" stroke-linecap="round"/>
    ${eyes(24, 34, 40, 3.8)}${brows(24, 34, 35, 3.4)}${xmouth(29, 49, 2.2)}`,
  whirl: `<path d="M8 10 C24 6 40 6 56 10 C50 22 40 34 36 48 C35 54 33 58 32 60 C30 52 28 46 24 38 C18 28 12 20 8 10 Z" fill="#ecd29a" ${INK}/>
    <path d="M12 16 C26 20 40 18 52 14 M18 26 C28 30 38 28 46 24 M24 36 C30 40 36 38 40 34" fill="none" stroke="#b9874e" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="32" cy="24" rx="8" ry="10" fill="#f3e8d2" ${INK}/>
    <ellipse cx="29" cy="22" rx="1.8" ry="3" fill="#140e1e"/><ellipse cx="35" cy="22" rx="1.8" ry="3" fill="#140e1e"/>
    <path d="M30 28 L34 32 M34 28 L30 32" stroke="#2a1d30" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="6" cy="30" r="2.2" fill="#8a6a48"/><circle cx="58" cy="36" r="2.6" fill="#c9a26a"/><circle cx="50" cy="48" r="1.8" fill="#8a6a48"/>`,
  echo: `<path d="M38 12 C50 12 56 22 56 32 V54 L52 50 L48 55 L44 50 L40 55 C44 40 44 24 38 12 Z" fill="#bff5e8" opacity=".5"/>
    <path d="M28 10 C40 10 46 20 46 32 V56 L42 52 L37 58 L32 52 L27 58 L22 52 L18 56 V32 C18 20 20 10 28 10 Z" fill="#9fe6d4" ${INK}/>
    <path d="M18 32 C24 35 40 35 46 32 M18 42 C24 45 40 45 46 42" fill="none" stroke="#eafff8" stroke-width="2.6"/>
    ${eyes(26, 38, 24, 4.4)}${xmouth(32, 36, 2.4)}`,
  obelisk: `<path d="M26 58 L28 16 L32 6 L36 16 L38 58 Z" fill="#c49a64" ${INK}/>
    <path d="M28 16 L32 6 L36 16 Z" fill="#1e1830" ${INK}/>
    <path d="M28 16 L36 16 L37 30 L27 30 Z" fill="#3a2d40" opacity=".7"/>
    <path d="M28.5 32 L35.5 42 M35.5 32 L28.5 42" stroke="#b394ff" stroke-width="2.8" stroke-linecap="round"/>
    <rect x="18" y="56" width="28" height="6" rx="1" fill="#9c7a52" ${INK}/>
    <path d="M32 2 l3 3 l-3 3 l-3 -3 Z" fill="#7a5ad8"/>`,
  wolf: `<path d="M14 28 L12 8 L24 18 M50 28 L52 8 L40 18" fill="#1c2444" ${INK}/>
    <path d="M12 30 C12 18 52 18 52 30 C52 40 46 44 40 48 L32 60 L24 48 C18 44 12 40 12 30 Z" fill="#33406b" ${INK}/>
    <path d="M24 48 L32 60 L40 48 C38 44 26 44 24 48 Z" fill="#4b5a8c"/>
    <circle cx="32" cy="50" r="3.2" fill="#05040a"/>
    <path d="M22 18 L26 8 L28 18 M30 16 L33 4 L35 16 M38 18 L42 8 L42 19" fill="#bfeaff" stroke="#3a6a9a" stroke-width="1.6" stroke-linejoin="round"/>
    ${eyes(24, 40, 32, 4.2, '#1b1630', '#eaf8ff')}${brows(24, 40, 27, 4)}${xmouth(32, 43, 2)}`,
  shell: `<path d="M6 40 C6 14 58 14 58 40 Z" fill="#7fc4ec" ${INK}/>
    <path d="M14 30 L22 22 L32 20 L42 22 L50 30" fill="none" stroke="#e2f6ff" stroke-width="2.4"/>
    <path d="M32 18 V40" stroke="#20304a" stroke-width="2.4"/>
    <path d="M24 14 L27 6 L30 15 M34 15 L37 6 L40 14" fill="#dff6ff" stroke="#3a6a9a" stroke-width="1.6"/>
    <ellipse cx="32" cy="46" rx="14" ry="10" fill="#1b1f33" ${INK}/>
    ${eyes(26, 38, 45, 3.6)}${xmouth(32, 52, 1.8)}
    <path d="M8 44 L4 52 M14 48 L10 56 M56 44 L60 52 M50 48 L54 56" stroke="#11141f" stroke-width="2.6" stroke-linecap="round"/>`,
  phantom: `<path d="M32 4 C46 4 54 16 54 30 C54 44 44 52 38 56 C34 60 32 62 30 58 C26 52 12 46 10 30 C10 16 18 4 32 4 Z" fill="#e3e8ff" opacity=".9" ${INK}/>
    <path d="M12 32 C6 34 4 40 8 44 M52 32 C58 34 60 40 56 44" fill="none" stroke="#c3cbf5" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="25" cy="24" rx="4" ry="6.4" fill="#141127"/><ellipse cx="39" cy="24" rx="4" ry="6.4" fill="#141127"/>
    <circle cx="25" cy="25" r="1.3" fill="#a9bcff"/><circle cx="39" cy="25" r="1.3" fill="#a9bcff"/>${xmouth(32, 38, 2.6, '#d9ddf5')}`,
  muffler: `<path d="M18 16 L14 4 L24 12 M46 16 L50 4 L40 12" fill="#d9d6e6" ${INK}/>
    <circle cx="32" cy="34" r="22" fill="#f3f2f8" ${INK}/>
    <circle cx="20" cy="42" r="1.4" fill="#6f6890"/><circle cx="44" cy="44" r="1.4" fill="#6f6890"/><circle cx="38" cy="50" r="1.2" fill="#6f6890"/>
    <path d="M10 30 C10 6 54 6 54 30" fill="none" stroke="#1b1630" stroke-width="6.4"/><path d="M10 30 C10 6 54 6 54 30" fill="none" stroke="#6c4cb0" stroke-width="4"/>
    <circle cx="9" cy="32" r="8" fill="#f08ac6" ${INK}/><circle cx="55" cy="32" r="8" fill="#f08ac6" ${INK}/>
    <circle cx="24" cy="32" r="5.4" fill="#fff" ${INK}/><circle cx="40" cy="32" r="5.4" fill="#fff" ${INK}/>
    <path d="M18.6 31 H29.4 M34.6 31 H45.4" stroke="#e8e6f0" stroke-width="5"/><path d="M18.6 31.6 H29.4 M34.6 31.6 H45.4" stroke="#1b1630" stroke-width="1.6"/>
    <circle cx="24" cy="34.4" r="2" fill="#1d1a2c"/><circle cx="40" cy="34.4" r="2" fill="#1d1a2c"/>${xmouth(32, 43, 2.4, '#f1e6cf')}`,
  ember: `<path d="M30 30 C20 20 8 18 2 22 C6 24 6 28 4 32 C10 30 12 34 12 38 C16 34 22 34 26 36 Z M34 30 C44 20 56 18 62 22 C58 24 58 28 60 32 C54 30 52 34 52 38 C48 34 42 34 38 36 Z" fill="#4a1418" stroke="#ff7a2a" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="32" cy="34" r="12" fill="#241a1e" ${INK}/>
    <path d="M24 30 L28 34 L26 38 M40 29 L36 35 M30 42 L34 40" stroke="#ff7a2a" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M24 24 L22 14 L29 22 M40 24 L42 14 L35 22" fill="#1c1416" ${INK}/>
    <path d="M32 22 C28 16 32 12 32 8 C36 12 36 16 32 22 Z" fill="#ffc24a"/>
    <circle cx="27.5" cy="32" r="3" fill="#fff3a8"/><circle cx="36.5" cy="32" r="3" fill="#fff3a8"/>
    <circle cx="28" cy="32.5" r="1.3" fill="#120d1c"/><circle cx="37" cy="32.5" r="1.3" fill="#120d1c"/>${xmouth(32, 40, 1.8, '#ffd9a0')}`,
  slug: `<path d="M4 54 C4 46 14 42 24 42 C30 34 44 30 52 34 C58 36 60 44 58 54 Z" fill="#3d1a24" ${INK}/>
    <path d="M4 54 H58" stroke="#ff6a1f" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M16 42 L22 36 L28 40 L34 32 L42 34 L46 30" fill="#231d20" stroke="#ff8a3a" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M50 34 L46 18 M56 36 L58 20" stroke="#4a2430" stroke-width="3" stroke-linecap="round"/>
    <circle cx="46" cy="16" r="4.4" fill="#fff" ${INK}/><circle cx="58" cy="18" r="4.4" fill="#fff" ${INK}/>
    <circle cx="47" cy="17" r="2" fill="#120d1c"/><circle cx="59" cy="19" r="2" fill="#120d1c"/>${xmouth(54, 46, 2.6)}`,
  shield: `<ellipse cx="28" cy="40" rx="17" ry="18" fill="#394064" ${INK}/>
    <path d="M12 30 C12 14 44 14 44 30 Z" fill="#9aa0b4" ${INK}/>
    <rect x="4" y="28" width="48" height="4" rx="2" fill="#7c8296" ${INK}/>
    <path d="M28 14 L27 8" stroke="#e0592a" stroke-width="3.4" stroke-linecap="round"/>
    ${eyes(22, 33, 37, 3.8)}${xmouth(27.5, 48, 2.2)}
    <path d="M34 42 H58 L60 46 H54 V52 H60 V58 H36 V52 H42 V46 H36 C30 46 28 44 34 42 Z" fill="#5c6072" ${INK}/>
    <path d="M36 42 H58" stroke="#ff9a4a" stroke-width="2.2"/>`,
  mender: `<path d="M8 40 C8 26 22 20 36 22 L58 32 L36 42 C22 46 8 50 8 40 Z" fill="#c08a5a" ${INK}/>
    <path d="M12 36 L16 46 M18 33 L22 44 M24 31 L28 42 M30 30 L33 40" stroke="#7a4a30" stroke-width="2"/>
    <path d="M6 30 C10 20 24 16 36 20 L56 30 L36 28 C24 26 14 28 6 30 Z" fill="#4a3226" ${INK}/>
    <path d="M56 30 L62 32 L56 34 Z" fill="#c8913a" ${INK}/>
    <circle cx="61" cy="23" r="4" fill="#7dff9a" opacity=".85"/><circle cx="58" cy="17" r="2.6" fill="#7dff9a" opacity=".6"/>
    ${eyes(22, 32, 22, 3.8)}${xmouth(40, 34, 2)}`,
  mimic: `<ellipse cx="32" cy="38" rx="20" ry="21" fill="#1a1530" ${INK}/>
    <path d="M18 22 L19 8 H45 L46 22 Z" fill="#14102a" ${INK}/>
    <ellipse cx="25" cy="32" rx="5" ry="6" fill="#e9e4ff"/><ellipse cx="39" cy="32" rx="5" ry="6" fill="#e9e4ff"/>
    <path d="M28 41 L36 49 M36 41 L28 49" stroke="#f1e6cf" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M12 38 C14 50 20 56 32 59 C44 56 50 50 52 38" fill="none" stroke="#8a6aff" stroke-width="1.6" opacity=".8"/>`,
  knight: `<path d="M18 26 C18 10 46 10 46 26 V40 H18 Z" fill="#1d1a29" ${INK}/>
    <path d="M30 6 C28 2 34 0 36 4 C38 2 40 6 37 8" fill="#7a4ad8" ${INK}/>
    <ellipse cx="32" cy="30" rx="10" ry="12" fill="#f3eff6" ${INK}/>
    <path d="M24.5 27 L29.5 28 M34.5 28 L39.5 27" stroke="#120d1c" stroke-width="2.6" stroke-linecap="round"/>
    ${xmouth(32, 36, 2, '#2a2033')}
    <path d="M10 44 C10 40 54 40 54 44 V58 H10 Z" fill="#1d1a29" ${INK}/>
    <path d="M40 34 H58 V48 C58 56 52 60 49 62 C46 60 40 56 40 48 Z" fill="#aa9fd8" ${INK}/>
    <path d="M44 38 L54 54 M54 38 L44 54" stroke="#c3a4ff" stroke-width="3" stroke-linecap="round"/>`,
  conductor: `<path d="M20 18 L10 4 L24 12 L22 2 L30 12 L34 0 L36 12 L44 2 L42 14 L54 6 L44 20 Z" fill="#1a1428" ${INK}/>
    <ellipse cx="32" cy="28" rx="13" ry="15" fill="#1a1428" ${INK}/>
    <path d="M19 26 C19 14 45 14 45 26 C40 30 24 30 19 26 Z" fill="#f1ecf4" ${INK}/>
    <ellipse cx="26" cy="24" rx="3" ry="2" fill="#0c0814"/><ellipse cx="38" cy="24" rx="3" ry="2" fill="#0c0814"/>
    <circle cx="26" cy="24" r="1" fill="#c9a8ff"/><circle cx="38" cy="24" r="1" fill="#c9a8ff"/>${xmouth(32, 35, 2, '#e8dff5')}
    <path d="M14 62 C14 48 22 42 32 42 C42 42 50 48 50 62 Z" fill="#120e1f" ${INK}/>
    <path d="M28 42 L32 52 L36 42" fill="#8a7fa8"/>
    <path d="M48 48 L62 30" stroke="#06040a" stroke-width="2.4" stroke-linecap="round"/><circle cx="62" cy="30" r="2.4" fill="#b48cff"/>`,
  bossBlot: `<path d="M10 52 C2 46 4 36 12 38 M54 52 C62 46 60 36 52 38" fill="none" stroke="#1b1630" stroke-width="7" stroke-linecap="round"/>
    <path d="M10 52 C2 46 4 36 12 38 M54 52 C62 46 60 36 52 38" fill="none" stroke="#3b3068" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 6 C38 16 56 26 56 42 C56 54 46 60 32 60 C18 60 8 54 8 42 C8 26 26 16 32 6 Z" fill="#2b2250" ${INK}/>
    ${shard(32, 10, 4, '#86e05f')}
    ${eyes(23, 41, 34, 6.4)}${brows(23, 41, 27, 6)}
    <path d="M18 48 H46" stroke="#2a1d30" stroke-width="1.6"/>${xmouth(32, 48, 3.4)}${xmouth(20, 48, 1.8)}${xmouth(44, 48, 1.8)}`,
  bossScarab: `<path d="M24 22 C22 12 26 4 32 2 C30 8 32 14 34 22" fill="#d8a440" ${INK}/>
    <ellipse cx="32" cy="42" rx="26" ry="18" fill="#d8a440" ${INK}/>
    <path d="M32 24 V60" stroke="#1c1424" stroke-width="2.4"/>
    <path d="M12 38 C18 34 22 40 28 36 M52 38 C46 34 42 40 36 36 M14 50 C20 46 24 52 28 48 M50 50 C44 46 40 52 36 48" fill="none" stroke="#2a1838" stroke-width="1.8"/>
    ${shard(32, 36, 5, '#ffb347')}
    <ellipse cx="32" cy="24" rx="12" ry="8" fill="#241a20" ${INK}/>
    ${eyes(26, 38, 23, 3.4)}${brows(26, 38, 19, 3)}${xmouth(32, 29, 1.8)}`,
  bossMoth: `<path d="M28 30 C14 6 -4 10 2 30 C6 42 20 40 28 36 Z M36 30 C50 6 68 10 62 30 C58 42 44 40 36 36 Z" fill="#9e99b4" ${INK}/>
    <path d="M28 38 C16 44 12 60 20 62 C26 62 28 50 30 42 Z M36 38 C48 44 52 60 44 62 C38 62 36 50 34 42 Z" fill="#7a7694" ${INK}/>
    <circle cx="14" cy="24" r="6" fill="#3e3a56"/><circle cx="14" cy="24" r="3" fill="#8fe2ff"/><circle cx="50" cy="24" r="6" fill="#3e3a56"/><circle cx="50" cy="24" r="3" fill="#8fe2ff"/>
    <ellipse cx="32" cy="38" rx="9" ry="14" fill="#ecebf4" ${INK}/>
    <path d="M24 20 L26 12 L29 19 L32 8 L35 19 L38 12 L40 20" fill="#cdeeff" stroke="#3a6a9a" stroke-width="1.4" stroke-linejoin="round"/>
    ${shard(32, 22, 2.6, '#8fe2ff')}
    <circle cx="28.5" cy="32" r="3" fill="#fff" ${INK}/><circle cx="35.5" cy="32" r="3" fill="#fff" ${INK}/>${xmouth(32, 40, 2)}`,
  bossGolem: `<path d="M8 26 C8 14 18 10 24 14 L40 14 C46 10 56 14 56 26 V46 C56 54 48 60 32 60 C16 60 8 54 8 46 Z" fill="#5f5450" ${INK}/>
    <path d="M14 30 L20 40 L16 50 M48 28 L44 38 L50 48" fill="none" stroke="#ff6a1f" stroke-width="2"/>
    <path d="M18 36 L26 32 L28 42 L20 46 Z M46 36 L38 32 L36 42 L44 46 Z" fill="#150f22" stroke="#a98aff" stroke-width="1.8" stroke-linejoin="round"/>
    ${shard(32, 44, 4.4, '#ff6a3a')}
    <path d="M22 6 H42 V20 C42 24 22 24 22 20 Z" fill="#6f6460" ${INK}/>
    <circle cx="27.5" cy="13" r="2.6" fill="#fff0a0"/><circle cx="36.5" cy="13" r="2.6" fill="#fff0a0"/>${xmouth(32, 19, 1.6)}`,
  silence: `<path d="M32 4 C48 4 56 18 56 34 C56 50 50 60 50 62 H14 C14 60 8 50 8 34 C8 18 16 4 32 4 Z" fill="#110d20" ${INK}/>
    <ellipse cx="32" cy="32" rx="14" ry="19" fill="#f5f2ec" ${INK}/>
    <path d="M22 29 C25 26 29 27 30 30 C27 32 24 32 22 29 Z M42 29 C39 26 35 27 34 30 C37 32 40 32 42 29 Z" fill="#050308"/>
    <circle cx="26.5" cy="29.6" r="1" fill="#a77bff"/><circle cx="37.5" cy="29.6" r="1" fill="#a77bff"/>
    <path d="M34 14 L31 20 L33 24 L29 30" fill="none" stroke="#1b1426" stroke-width="1.2"/>
    ${xmouth(32, 42, 3, '#1d1424')}
    <path d="M10 10 C20 4 44 4 54 10 M12 7 C22 1 42 1 52 7" fill="none" stroke="#d6ccf6" stroke-width="1.6" stroke-dasharray="9 3 14 4"/>`,
};

/** A little portrait of every creature of the Silence (all with the X-stitched mouth). */
export function enemyIcon(kind: EnemyKind): string {
  // a soft pale disc behind keeps the inky ones readable on dark panels
  return svg(`<circle cx="32" cy="33" r="30" fill="#f4ecff" opacity=".16"/>${E[kind] ?? E.blot}`);
}

export const ICON = {
  turtle: svg(`<ellipse cx="32" cy="36" rx="22" ry="15" fill="#c4823f" stroke="#4a2c14" stroke-width="3"/><path d="M20 30 L26 24 L38 24 L44 30 L38 36 L26 36 Z" fill="#d9a35a" stroke="#4a2c14" stroke-width="2"/><circle cx="56" cy="34" r="7" fill="#4f957c" stroke="#1f4a3a" stroke-width="3"/><circle cx="58" cy="32" r="1.8" fill="#1b1630"/><ellipse cx="16" cy="50" rx="5" ry="4" fill="#4f957c" stroke="#1f4a3a" stroke-width="2.4"/><ellipse cx="46" cy="50" rx="5" ry="4" fill="#4f957c" stroke="#1f4a3a" stroke-width="2.4"/>`),
  bell: svg(`<path d="M32 6 C20 6 18 20 18 30 C18 38 14 42 12 46 H52 C50 42 46 38 46 30 C46 20 44 6 32 6 Z" fill="#e9b949" stroke="#6a4310" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="52" r="5" fill="#6a4310"/><path d="M8 20 q-4 8 0 16 M56 20 q4 8 0 16" fill="none" stroke="#ffe9a8" stroke-width="3" stroke-linecap="round"/>`),
  heart: svg(`<path d="M32 56 C10 40 4 28 8 18 C12 8 26 6 32 18 C38 6 52 8 56 18 C60 28 54 40 32 56 Z" fill="#ff5a6a" stroke="#4a1020" stroke-width="3" stroke-linejoin="round"/>
    <path d="M16 18 C18 13 23 12 26 15" fill="none" stroke="#ffd0d6" stroke-width="3.4" stroke-linecap="round"/>`),
  coin: svg(`<circle cx="32" cy="32" r="27" fill="#f2b630" stroke="#6a4310" stroke-width="3"/><circle cx="32" cy="32" r="21" fill="#ffd36b" stroke="#c88a1a" stroke-width="2"/>
    <ellipse cx="27" cy="41" rx="7" ry="5.4" transform="rotate(-24 27 41)" fill="#6a4310"/><path d="M33 40 V18 C37 22 42 22 42 28" fill="none" stroke="#6a4310" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  wave: svg(`<path d="M32 6 C36 16 52 26 52 42 C52 54 43 60 32 60 C21 60 12 54 12 42 C12 26 28 16 32 6 Z" fill="#3b3068" stroke="#1b1630" stroke-width="3" stroke-linejoin="round"/><path d="M32 7 C26 2 22 9 27 12" fill="none" stroke="#54438c" stroke-width="3.4" stroke-linecap="round"/><circle cx="25" cy="38" r="6" fill="#fff"/><circle cx="39" cy="38" r="6" fill="#fff"/><circle cx="26" cy="39" r="3" fill="#1b1630"/><circle cx="40" cy="39" r="3" fill="#1b1630"/><path d="M28.5 47.5 L35.5 54.5 M35.5 47.5 L28.5 54.5" stroke="#e9e2d2" stroke-width="3.4" stroke-linecap="round"/>`),
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
  // creature traits (wordless): what makes each of the Silence's creatures special
  /** single shots glance off it (the whirl) */
  deflect: svg(`<path d="M30 52 C14 52 10 40 18 32 C26 24 40 28 40 38 C40 44 32 46 28 42" fill="none" stroke="#d0a262" stroke-width="5" stroke-linecap="round"/>
    <path d="M30 52 C14 52 10 40 18 32 C26 24 40 28 40 38 C40 44 32 46 28 42" fill="none" stroke="#2a1d14" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>
    <path d="M4 14 L30 24" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M30 24 L56 10" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="5 5"/>
    <path d="M50 6 L58 9 L53 16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M26 20 l8 2 l-6 6" fill="#ff5a6a"/>`),
  /** it comes back once (the echo) */
  echo: svg(`<path d="M40 10 C52 10 58 20 58 30 V52 L54 48 L50 53 L46 48 L42 53 C46 40 46 22 40 10 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="4 4" opacity=".7"/>
    <path d="M26 10 C38 10 44 20 44 30 V54 L40 50 L35 56 L30 50 L25 56 L20 50 L16 54 V30 C16 20 18 10 26 10 Z" fill="#9fe6d4" stroke="#1b1630" stroke-width="2.6" stroke-linejoin="round"/>
    <circle cx="24" cy="26" r="3" fill="#1b1630"/><circle cx="35" cy="26" r="3" fill="#1b1630"/>
    <path d="M50 34 a6 6 0 1 1 -6 -6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M42 24 l3 4 l-5 1" fill="currentColor"/>`),
  /** it hides under the sand (the scorpion) */
  burrow: svg(`<path d="M4 42 C14 38 22 44 32 42 C42 40 50 44 60 40 V60 H4 Z" fill="#e0c08a" stroke="#2a1d14" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M18 42 C18 30 46 30 46 42" fill="#dcb274" stroke="#2a1d14" stroke-width="2.6"/>
    <circle cx="27" cy="38" r="2.4" fill="#1b1630"/><circle cx="37" cy="38" r="2.4" fill="#1b1630"/>
    <path d="M32 4 V22 M24 14 L32 22 L40 14" stroke="currentColor" stroke-width="4.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="50" r="1.6" fill="#9c7a52"/><circle cx="50" cy="52" r="1.6" fill="#9c7a52"/>`),
  /** it runs in packs (wolves, embers) */
  pack: svg(`${[[16, 40], [48, 40], [32, 26]].map(([x, y]) => `<path d="M${x - 9} ${y - 2} L${x - 8} ${y - 13} L${x - 3} ${y - 7} H${x + 3} L${x + 8} ${y - 13} L${x + 9} ${y - 2} C${x + 9} ${y + 6} ${x + 4} ${y + 10} ${x} ${y + 13} C${x - 4} ${y + 10} ${x - 9} ${y + 6} ${x - 9} ${y - 2} Z" fill="#33406b" stroke="#1b1630" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${x - 3.4}" cy="${y}" r="1.8" fill="#eaf8ff"/><circle cx="${x + 3.4}" cy="${y}" r="1.8" fill="#eaf8ff"/>`).join('')}
    <path d="M6 58 H58" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7"/>`),
  /** its bite puts out a plate for a while (the lava slug) */
  disable: svg(`<path d="M32 6 L54 18 V44 L32 58 L10 44 V18 Z" fill="#e9dcc0" stroke="#2a1d14" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M10 26 C18 22 18 34 26 30 C32 27 30 38 38 34 C44 31 46 40 54 36 V44 L32 58 L10 44 Z" fill="#231a22"/>
    <circle cx="20" cy="42" r="2" fill="#ff7a2a"/><circle cx="36" cy="46" r="2.4" fill="#ff7a2a"/><circle cx="44" cy="40" r="1.6" fill="#ff7a2a"/>
    <path d="M26 20 q-4 -6 0 -12 M34 18 q4 -6 0 -12" fill="none" stroke="#8d8794" stroke-width="2.6" stroke-linecap="round"/>`),
  /** it becomes a dark copy of one of your musicians and silences all of that kind */
  mimic: svg(`<circle cx="20" cy="36" r="14" fill="#e2554b" stroke="#1b1630" stroke-width="2.4"/><circle cx="16" cy="33" r="2.4" fill="#1b1630"/><circle cx="24" cy="33" r="2.4" fill="#1b1630"/><path d="M17 39 L23 39 L20 43 Z" fill="#f5a43a"/>
    <circle cx="44" cy="36" r="14" fill="#1a1530" stroke="#1b1630" stroke-width="2.4"/><ellipse cx="40" cy="33" rx="2.6" ry="3.2" fill="#e9e4ff"/><ellipse cx="48" cy="33" rx="2.6" ry="3.2" fill="#e9e4ff"/>
    <path d="M41 39 L47 45 M47 39 L41 45" stroke="#f1e6cf" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M28 12 C36 6 44 8 48 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M44 10 l5 4 l-6 2" fill="currentColor"/>`),
  /** bells cannot slow it (the knight) */
  steady: svg(`<path d="M32 8 C22 8 20 20 20 28 C20 34 16 38 14 42 H50 C48 38 44 34 44 28 C44 20 42 8 32 8 Z" fill="#8fd8ff" stroke="#2a1d14" stroke-width="2.6" stroke-linejoin="round"/>
    <circle cx="32" cy="47" r="4" fill="#2a1d14"/>
    <path d="M8 56 L56 8" stroke="#ff5a6a" stroke-width="6" stroke-linecap="round"/>
    <path d="M6 30 h6 M52 30 h6" stroke="#bff0ff" stroke-width="2.6" stroke-linecap="round"/>`),
  /** the creatures around it speed up on the downbeat (the conductor) */
  aura: svg(`<circle cx="32" cy="34" r="10" fill="#1a1428" stroke="#1b1630" stroke-width="2"/>
    <path d="M24 30 C24 24 40 24 40 30 C36 32 28 32 24 30 Z" fill="#f1ecf4"/>
    <circle cx="32" cy="34" r="18" fill="none" stroke="#9d7bff" stroke-width="2.6" stroke-dasharray="5 4"/>
    <circle cx="32" cy="34" r="27" fill="none" stroke="#9d7bff" stroke-width="2" stroke-dasharray="3 6" opacity=".6"/>
    <path d="M42 24 L58 6" stroke="#06040a" stroke-width="2.6" stroke-linecap="round"/><circle cx="58" cy="6" r="3" fill="#b48cff"/>
    <path d="M4 58 H16 M2 52 H12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
};
