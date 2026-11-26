#!/usr/bin/env node
/**
 * A/B harness: renders the SAME battle scenario (tools/audio-ab-scenario.js: 32 bars, 8 towers,
 * waves at intensity 1–2, enemies dying, a simulated player tapping the baton on every beat with
 * ≈85% accuracy, collecting coins, a few strikes, groove and power following the taps; optionally a
 * boss fight) in several versions of the game and prints, per version and song:
 *   LUFS · peak · hot (‰ of samples above −3 dBFS) · music alone vs everything else (song/SFX, dB)
 *   · glue / limiter gain reduction · spectral flatness (%, higher = noisier) · onsets per second
 *   · share of pitched energy on chord tones / on the scale · peak voices
 *
 * Usage: node tools/audio-ab.mjs [--rev f444cc0,b5a54d4] [--song meadow,desert] [--boss toad --world meadow]
 *        [--breakdown]   (towers alone and the player's sounds alone too)
 * The current tree is always measured ("here"); every --rev is exported with `git archive` into a
 * temporary folder (node_modules linked) and served on its own port. AUDIO_PORT = the base port.
 */
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const revs = opt('--rev', '').split(',').filter(Boolean);
const songs = opt('--song', 'meadow,desert').split(',');
const boss = opt('--boss', null);
const world = opt('--world', null);
const breakdown = argv.includes('--breakdown');
const base = Number(process.env.AUDIO_PORT ?? 5174);
const scenario = readFileSync(resolve(root, 'tools/audio-ab-scenario.js'), 'utf8');

const trees = [['here', root]];
for (const rev of revs) {
  const dir = mkdtempSync(join(tmpdir(), `ab-${rev}-`));
  execSync(`git archive ${rev} | tar -x -C ${dir}`, { cwd: root, stdio: 'inherit' });
  symlinkSync(resolve(root, 'node_modules'), join(dir, 'node_modules'));
  // the scenario needs the probe tool of that version (present since v2)
  trees.push([rev, dir]);
}
const work = mkdtempSync(join(tmpdir(), 'ab-scen-'));
mkdirSync(work, { recursive: true });
const rows = [];
trees.forEach(([name, dir], i) => {
  for (const song of songs) {
    const head = `const SONG = '${song}'; const BARS = 32; ${breakdown ? 'const BREAK = 1;' : ''} ${boss ? `const BOSSK = '${boss}';` : ''} ${world ? `const WORLD = '${world}';` : ''}`;
    const file = join(work, `${name}-${song}.js`);
    writeFileSync(file, `(async () => { ${head} return await ${scenario}; })()`);
    const r = spawnSync(process.execPath, [join(dir, 'tools/audio-probe.mjs'), '--file', file], { cwd: dir, env: { ...process.env, AUDIO_PORT: String(base + 20 + i) }, encoding: 'utf8', timeout: 1800000 });
    const txt = r.stdout ?? '';
    try {
      const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      rows.push({ name, ...j });
    } catch {
      console.log(`${name} ${song}: no result\n${txt.slice(0, 600)}`);
    }
  }
});
const cols = ['lufs', 'peak', 'hot', 'musicLU', 'othersLU', 'songToSfx', 'glueMean', 'limMean', 'flatness', 'flatMusic', 'onsets', 'inChord', 'inScale', 'voices', ...(breakdown ? ['towersLU', 'playerLU'] : [])];
console.log(`\nversion   song     ${cols.map((c) => c.padStart(9)).join('')}`);
for (const r of rows) console.log(`${r.name.padEnd(9)} ${r.song.padEnd(8)} ${cols.map((c) => String(r[c] ?? '-').padStart(9)).join('')}`);
