/**
 * The FORTÍSSIMO logo: a golden shell emblem (seven hex plates, a glowing note at the heart),
 * the "ff" dynamics stamp, and the engraved wordmark. Pure SVG/CSS so it stays crisp anywhere and
 * can be animated piece by piece.
 */

let uid = 0;

export function logoHTML(tagline: string, size: 'big' | 'small' = 'big'): string {
  const id = `lg${uid++}`;
  const hexes: string[] = [];
  const R = 15;
  const centers: [number, number][] = [[0, 0]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    centers.push([Math.cos(a) * R * Math.sqrt(3), Math.sin(a) * R * Math.sqrt(3)]);
  }
  centers.forEach(([x, y], i) => {
    const pts: string[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      pts.push(`${(x + Math.cos(a) * (R - 1.4)).toFixed(2)},${(y + Math.sin(a) * (R - 1.4)).toFixed(2)}`);
    }
    hexes.push(`<polygon class="hex" style="--i:${i}" points="${pts.join(' ')}" fill="url(#${id}-amber)" stroke="#5a3412" stroke-width="1.6"/>`);
  });
  const notes = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 62, y = Math.sin(a) * 62;
    return `<g class="orbit-note" style="--i:${i}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(.55)">
      <ellipse cx="0" cy="6" rx="6" ry="4.4" transform="rotate(-25)" fill="#ffe9a8"/><path d="M5 5 V-14 C9 -10 13 -9 13 -4" fill="none" stroke="#ffe9a8" stroke-width="2.6" stroke-linecap="round"/></g>`;
  }).join('');
  return `<div class="ff-logo ${size}">
  <svg class="emblem" viewBox="-80 -80 160 160" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-amber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2c06a"/><stop offset="0.55" stop-color="#c8823a"/><stop offset="1" stop-color="#8a4f1f"/></linearGradient>
      <linearGradient id="${id}-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset="0.45" stop-color="#f2c14e"/><stop offset="0.75" stop-color="#c88a1a"/><stop offset="1" stop-color="#8a5a12"/></linearGradient>
      <radialGradient id="${id}-glow"><stop offset="0" stop-color="#fff8d8" stop-opacity="1"/><stop offset="0.5" stop-color="#ffd36b" stop-opacity=".55"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="halo" r="78" fill="url(#${id}-glow)" opacity=".5"/>
    <circle class="rim" r="58" fill="none" stroke="url(#${id}-gold)" stroke-width="7"/>
    <circle r="51.5" fill="#24160c" stroke="#5a3412" stroke-width="2"/>
    ${Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return `<circle cx="${(Math.cos(a) * 58).toFixed(2)}" cy="${(Math.sin(a) * 58).toFixed(2)}" r="2.2" fill="#fff2c4"/>`;
    }).join('')}
    <g class="shell">${hexes.join('')}</g>
    <g class="heart-note">
      <circle r="11" fill="url(#${id}-glow)"/>
      <ellipse cx="-3" cy="5" rx="6.2" ry="4.6" transform="rotate(-25 -3 5)" fill="#fffbe8"/>
      <path d="M2.2 4 V-13 C6 -9 10 -8.5 10 -3" fill="none" stroke="#fffbe8" stroke-width="2.6" stroke-linecap="round"/>
    </g>
    <g class="notes">${notes}</g>
  </svg>
  <div class="ff-stamp"><span>ff</span></div>
  <svg class="word" viewBox="0 0 1000 150" aria-label="FORTÍSSIMO">
    <defs>
      <linearGradient id="${id}-wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d6"/><stop offset="0.38" stop-color="#ffd36b"/><stop offset="0.62" stop-color="#e6a12a"/><stop offset="1" stop-color="#9a6214"/></linearGradient>
      <linearGradient id="${id}-shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="${id}-mask"><text x="500" y="112" text-anchor="middle" font-family="'Cinzel Decorative', 'Cinzel', Georgia, serif" font-weight="900" font-size="118" letter-spacing="4" fill="#fff">FORTÍSSIMO</text></mask>
    </defs>
    <text class="w-shadow" x="500" y="120" text-anchor="middle" font-family="'Cinzel Decorative', 'Cinzel', Georgia, serif" font-weight="900" font-size="118" letter-spacing="4" fill="#2a160a" opacity=".85">FORTÍSSIMO</text>
    <text class="w-main" x="500" y="112" text-anchor="middle" font-family="'Cinzel Decorative', 'Cinzel', Georgia, serif" font-weight="900" font-size="118" letter-spacing="4" fill="url(#${id}-wg)" stroke="#5a3412" stroke-width="3" paint-order="stroke">FORTÍSSIMO</text>
    <g mask="url(#${id}-mask)"><rect class="w-shine" x="-300" y="0" width="240" height="150" fill="url(#${id}-shine)" transform="skewX(-20)"/></g>
  </svg>
  <div class="tagline"><i></i><span>${tagline}</span><i></i></div>
</div>`;
}

export const LOGO_CSS = `
#ui .ff-logo { position: relative; display: flex; flex-direction: column; align-items: center; user-select: none; }
#ui .ff-logo .emblem { width: min(210px, 30vh); height: min(210px, 30vh); overflow: visible; filter: drop-shadow(0 10px 24px rgba(0,0,0,.55)); }
#ui .ff-logo.small .emblem { width: min(112px, 16vh); height: min(112px, 16vh); }
#ui .ff-logo .word { width: min(760px, 88vw); height: auto; margin-top: -26px; overflow: visible; filter: drop-shadow(0 6px 14px rgba(0,0,0,.6)); }
#ui .ff-logo.small .word { width: min(440px, 80vw); margin-top: -14px; }
#ui .ff-logo .ff-stamp { position: absolute; top: min(150px, 21.5vh); left: 50%; transform: translateX(-50%) rotate(-8deg); width: 74px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(#3a1f6a, #1d1036); box-shadow: inset 0 0 0 2.5px #ffd36b, 0 6px 14px rgba(0,0,0,.5); z-index: 2; }
#ui .ff-logo.small .ff-stamp { top: min(76px, 11vh); width: 50px; height: 34px; border-radius: 9px; }
#ui .ff-logo .ff-stamp span { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 38px; color: #ffe9a8; text-shadow: 0 0 12px rgba(255,211,107,.8); margin-top: -4px; }
#ui .ff-logo.small .ff-stamp span { font-size: 26px; }
#ui .ff-logo .tagline { display: flex; align-items: center; gap: 14px; margin-top: 4px; font-family: var(--serif); font-weight: 700; letter-spacing: .32em; font-size: 15px; color: #ffe9a8; text-transform: uppercase; text-shadow: 0 2px 6px rgba(0,0,0,.8); }
#ui .ff-logo.small .tagline { font-size: 11px; letter-spacing: .26em; }
#ui .ff-logo .tagline i { width: 46px; height: 2px; background: linear-gradient(90deg, transparent, #ffd36b, transparent); }
#ui .ff-logo .notes { animation: logo-spin 22s linear infinite; transform-origin: 0 0; }
#ui .ff-logo .heart-note { animation: logo-beat 1.2s ease-in-out infinite; transform-origin: 0 0; }
#ui .ff-logo .w-shine { animation: logo-shine 5s ease-in-out infinite 1s; }
@keyframes logo-spin { to { transform: rotate(360deg); } }
@keyframes logo-beat { 0%,100% { transform: scale(1); } 12% { transform: scale(1.18); } 30% { transform: scale(1); } }
@keyframes logo-shine { 0% { transform: skewX(-20deg) translateX(0); } 40%,100% { transform: skewX(-20deg) translateX(1500px); } }

/* reveal sequence */
#ui .ff-logo.pre .emblem, #ui .ff-logo.pre .word, #ui .ff-logo.pre .tagline, #ui .ff-logo.pre .ff-stamp { opacity: 0; }
#ui .ff-logo.reveal .emblem { animation: em-in 1.4s cubic-bezier(.2,1.3,.4,1) both; }
#ui .ff-logo.reveal .hex { animation: hex-in .5s ease both; animation-delay: calc(.35s + var(--i) * .11s); }
#ui .ff-logo.reveal .heart-note { animation: note-in .6s cubic-bezier(.2,1.8,.4,1) both 1.2s, logo-beat 1.2s ease-in-out infinite 2s; }
#ui .ff-logo.reveal .word { animation: word-in 1.1s cubic-bezier(.2,1.2,.4,1) both 1.4s; }
#ui .ff-logo.reveal .ff-stamp { animation: stamp-in .5s cubic-bezier(.3,1.9,.5,1) both 2.4s; }
#ui .ff-logo.reveal .tagline { animation: tag-in 1s ease both 2.8s; }
@keyframes em-in { 0% { opacity: 0; transform: scale(.2) rotate(-200deg); filter: brightness(3) blur(6px); } 70% { filter: brightness(1.4) blur(0); } 100% { opacity: 1; transform: none; } }
@keyframes hex-in { 0% { opacity: 0; transform: scale(.3); } 100% { opacity: 1; transform: none; } }
@keyframes note-in { 0% { opacity: 0; transform: scale(0); } 100% { opacity: 1; transform: none; } }
@keyframes word-in { 0% { opacity: 0; transform: translateY(26px) scale(.92); letter-spacing: .4em; filter: blur(6px); } 100% { opacity: 1; transform: none; filter: none; } }
@keyframes stamp-in { 0% { opacity: 0; transform: translateX(-50%) rotate(-8deg) scale(3); } 100% { opacity: 1; transform: translateX(-50%) rotate(-8deg) scale(1); } }
@keyframes tag-in { 0% { opacity: 0; letter-spacing: .7em; } 100% { opacity: 1; } }
#ui .ff-logo .hex { transform-box: fill-box; transform-origin: center; }
`;
