// A/B scenario (version-agnostic), evaluated in the audio lab of any version by tools/audio-ab.mjs
// (through that version's tools/audio-probe.mjs). SONG and BARS (and BREAK, BOSSK, WORLD) are defined before it.
(async () => {
  const PAT = {
    harp: ['x...x...x...x...', 'x.x.x...x.x.x...'],
    drum: ['x.......x.......', 'x.......x.....x.'],
    bell: ['x.......x.......', 'x.......x.......'],
    shaker: ['..x...x...x...x.', '..x.x.x...x.x.x.'],
    crystal: ['x.x.............', 'x.x.....x.x.....'],
    horn: ['x...............................', 'x...............x...............'],
    choir: ['x...............', 'x...............'],
    bass: ['x...............................', 'x...............x...............'],
  };
  const FLIGHT = { harp: 2, drum: 4, bell: 0, shaker: 0, crystal: 1, horn: 1, choir: 0, bass: 4 };
  const SEC = { harp: 'strings', drum: 'percussion', shaker: 'percussion', bell: 'bells', crystal: 'bells', horn: 'brass', choir: 'voices', bass: 'low' };
  const army = [
    ['harp', 1, -0.5], ['harp', 0, 0.4], ['drum', 1, 0.2], ['bell', 0, 0.6], ['shaker', 1, -0.7], ['crystal', 0, 0.8], ['horn', 0, -0.2], ['bass', 0, 0],
  ].map(([kind, level, pan], i) => ({ kind, level, pan, voice: i + 1 }));
  const bpm = { meadow: 100, desert: 104, ice: 96, forge: 112, citadel: 116, boss: 112, finale: 120 }[SONG];
  const spb = 60 / bpm;
  const sd = spb / 4;
  const barDur = spb * 4;
  const t0 = 0.2;
  const seconds = t0 + BARS * barDur + 1.5;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  async function run(mode) {
    seed = 12345;
    const rig = o.makeRig(seconds);
    const secs = {};
    for (const tw of army) secs[SEC[tw.kind]] = (secs[SEC[tw.kind]] ?? 0) + 1;
    const band = o.bandOf(secs);
    rig.director.band = band;
    rig.towers.setBand(band);
    if (mode === 'music') rig.core.setVolumes({ master: 1, music: 1, sfx: 0, ambience: 0 });
    if (mode === 'others') rig.core.setVolumes({ master: 1, music: 0, sfx: 1, ambience: 0 });
    if (mode === 'full') rig.core.setVolumes({ master: 1, music: 1, sfx: 1, ambience: 0 });
    if (mode === 'towers' || mode === 'player') rig.core.setVolumes({ master: 1, music: 0, sfx: 1, ambience: 0 });
    if (mode === 'player') rig.core.towerBus.gain.value = 0;
    const playerOn = mode !== 'towers';
    const R = rig.rhythm ?? null;
    const D = rig.director;
    if (typeof D.setPower === 'function') D.power = 0;
    if (typeof WORLD !== 'undefined') D.world = WORLD;
    const p = D.play(SONG, t0, 0.05, 0);
    if (typeof BOSSK !== 'undefined' && typeof D.bossTheme === 'function') {
      rig.at(p.barStart(6) - 1.5, () => { const ts = D.bossTheme(BOSSK, p.barStart(6)); if (ts != null) R.bossTransition(ts, true, 1); }, 0);
      rig.at(p.barStart(16) - 1.5, () => { const ts = D.bossPhase(2, p.barStart(16)); if (ts != null) R.bossPhaseHit(ts, 2); }, 0);
      rig.at(p.barStart(24) - 1.5, () => { const ts = D.bossPhase(3, p.barStart(24)); if (ts != null) R.bossPhaseHit(ts, 3); }, 0);
      rig.at(p.barStart(BARS - 3) - 1.5, () => { const ts = D.bossTheme(null, p.barStart(BARS - 3)); if (ts != null) R.bossTransition(ts, false, 1); }, 0);
      for (let bar = 8; bar < BARS - 4; bar += 3) {
        for (let k = 0; k < 4; k++) {
          const t = p.barStart(bar) + k * spb;
          rig.at(t, () => R.bossTell(t, 0.3, k === 3), 0.1);
          if (k === 3) rig.at(t, () => (bar % 2 ? R.parry(t, 'perfect', 0.3) : R.bossBlow(t, 0.3, 1)), 0.1);
        }
      }
    }
    const plan = [[0, 0], [4, 1], [14, 2], [24, 1], [BARS - 2, 0]];
    for (const [bar, lv] of plan) rig.at(p.barStart(bar) - 0.3, () => p.setIntensity(lv, rig.ctx.currentTime), 0);
    // the towers, from bar 4 (with impacts)
    for (const tw of army) {
      const pat = PAT[tw.kind][tw.level];
      for (let s = 4 * 16; s < (BARS - 2) * 16; s++) {
        if (pat[s % pat.length] !== 'x') continue;
        const t = t0 + s * sd;
        rig.at(t, () => rig.towers.shot(tw.kind, tw.level, t, tw.pan, tw.voice), 0.12);
        if (FLIGHT[tw.kind] > 0) rig.at(t + FLIGHT[tw.kind] * sd, () => rig.towers.impact(tw.kind, t + FLIGHT[tw.kind] * sd, tw.pan, 0.7), 0.12);
      }
    }
    // enemies dying, coins
    const kinds = ['blot', 'scurry', 'shell', 'moth', 'bubble', 'blotling'];
    for (let s = 4 * 16; s < (BARS - 2) * 16; s += 2) {
      if (rnd() < 0.18) {
        const t = t0 + s * sd;
        const k = kinds[Math.floor(rnd() * kinds.length)];
        const pan = rnd() * 2 - 1;
        rig.at(t, () => rig.towers.enemyDeath(k, t, pan, (tt) => rig.sfx.bossDeath(tt)), 0.12);
        rig.at(t + 0.3, () => rig.towers.coin(t + 0.3, pan, 3), 0.05);
      }
    }
    // the player: baton taps on every beat (≈85% on the beat), coins on the beat, strikes, groove and power
    let run = 0;
    let groove = 0;
    let power = 0;
    let pick = 0;
    for (let beat = 16; beat < (BARS - 2) * 4; beat++) {
      const t = t0 + beat * spb;
      const x = rnd();
      const q = x < 0.5 ? 'perfect' : x < 0.85 ? 'good' : 'miss';
      const tt = q === 'miss' ? t + 0.07 : t;
      run = q === 'miss' ? 0 : run + 1;
      const g = Math.min(4, Math.floor(run / 4));
      power = Math.max(0, Math.min(1, power + (q === 'perfect' ? 0.04 : q === 'good' ? 0.02 : -0.2)));
      const pw = power;
      const gg = g;
      if (!playerOn) continue;
      if (R && R.beatTap) rig.at(tt, () => R.beatTap(tt, q, -0.35), 0.1);
      if (gg !== groove && typeof D.setGroove === 'function') {
        groove = gg;
        rig.at(t, () => {
          const tl = D.setGroove(gg);
          if (gg === 4 && tl != null && R && R.grooveRise) R.grooveRise(tl);
        }, 0.25);
      }
      if (typeof D.setPower === 'function') rig.at(t, () => D.setPower(pw), 0.1);
      if (q === 'miss' && R && R.powerDrop) rig.at(tt, () => R.powerDrop(tt), 0.1);
      if (beat % 2 === 0 && rnd() < 0.6) {
        const q2 = rnd() < 0.85 ? (rnd() < 0.6 ? 'perfect' : 'good') : 'miss';
        pick = q2 === 'miss' ? 0 : pick + 1;
        const pr = pick;
        if (R && R.pickupTap) rig.at(t, () => R.pickupTap(t, q2, 0.3, pr), 0.1);
      }
      if (beat % 8 === 5 && R && R.strike) rig.at(t, () => R.strike(t, rnd() < 0.85 ? 'good' : 'miss', 0.1), 0.1);
    }
    // the limiter and the glue: gain reduction samples
    const gr = [];
    for (let t = p.barStart(4); t < p.barStart(BARS - 2); t += 0.1) rig.at(t, () => gr.push([rig.core.limiter.reduction, rig.core.glue.reduction]), 0);
    const r = await rig.render();
    return { r, p, gr };
  }

  // ── metrics ──
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const a = (-2 * Math.PI) / len;
      const wr = Math.cos(a);
      const wi = Math.sin(a);
      for (let i = 0; i < n; i += len) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k];
          const ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr;
          im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr;
          im[i + k + len / 2] = ui - vi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
  }
  function spectral(buf, a, b) {
    const sr = buf.sampleRate;
    const L = buf.getChannelData(0);
    const Rr = buf.getChannelData(1);
    const N = 2048;
    const hop = 1024;
    const k0 = Math.floor((150 * N) / sr);
    const k1 = Math.floor((8000 * N) / sr);
    const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    let flatSum = 0;
    let frames = 0;
    let prev = null;
    const flux = [];
    for (let s = Math.floor(a * sr); s + N < Math.floor(b * sr); s += hop) {
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = ((L[s + i] + Rr[s + i]) / 2) * win[i];
      fft(re, im);
      const mag = new Float64Array(k1 - k0);
      let lg = 0;
      let ar = 0;
      for (let k = k0; k < k1; k++) {
        const pw = re[k] * re[k] + im[k] * im[k] + 1e-12;
        mag[k - k0] = Math.sqrt(pw);
        lg += Math.log(pw);
        ar += pw;
      }
      const n = k1 - k0;
      const e = ar / n;
      if (e > 1e-9) {
        flatSum += Math.exp(lg / n) / e;
        frames++;
      }
      let f = 0;
      if (prev) for (let k = 0; k < n; k++) f += Math.max(0, mag[k] - prev[k]);
      flux.push(f);
      prev = mag;
    }
    // onsets: flux peaks above a moving median × 1.6
    let onsets = 0;
    for (let i = 2; i < flux.length - 2; i++) {
      const w = flux.slice(Math.max(0, i - 16), i + 16).sort((x, y) => x - y);
      const med = w[Math.floor(w.length / 2)];
      if (flux[i] > flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] > med * 1.6 + 1e-6) onsets++;
    }
    return { flatness: frames ? flatSum / frames : 0, onsetsPerSec: onsets / (b - a) };
  }

  const extra = {};
  if (typeof BREAK !== 'undefined') {
    for (const m of ['towers', 'player']) {
      const x = await run(m);
      const a0 = x.p.barStart(4);
      const b0 = x.p.barStart(BARS - 2);
      const sr = x.r.buf.sampleRate;
      const n = Math.floor((b0 - a0) * sr);
      const sub = { sampleRate: sr, length: n, numberOfChannels: 2, duration: n / sr, getChannelData: (c) => x.r.buf.getChannelData(c).subarray(Math.floor(a0 * sr), Math.floor(a0 * sr) + n) };
      extra[m + 'LU'] = Math.round(o.measure(sub, 0, 0).lufs * 100) / 100;
    }
  }
  const full = await run('full');
  const music = await run('music');
  const others = await run('others');
  const a = full.p.barStart(4);
  const b = full.p.barStart(BARS - 2);
  const lu = (buf) => {
    const sr = buf.sampleRate;
    const n = Math.floor((b - a) * sr);
    const sub = { sampleRate: sr, length: n, numberOfChannels: 2, duration: n / sr, getChannelData: (c) => buf.getChannelData(c).subarray(Math.floor(a * sr), Math.floor(a * sr) + n) };
    return o.measure(sub, 0, 0);
  };
  const mf = lu(full.r.buf);
  const mm = lu(music.r.buf);
  const mo = lu(others.r.buf);
  const sp = spectral(full.r.buf, a, b);
  const spm = spectral(music.r.buf, a, b);
  const h = o.harmonyCheck(full.r.buf, full.p, 4, BARS - 2);
  const hm = o.harmonyCheck(music.r.buf, music.p, 4, BARS - 2);
  const lim = full.gr.map((x) => -x[0]);
  const glue = full.gr.map((x) => -x[1]);
  const mean = (v) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
  const share = (v, th) => v.filter((x) => x > th).length / Math.max(1, v.length);
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    song: SONG,
    lufs: r2(mf.lufs), peak: r2(mf.peakDb), hot: r2(mf.hot * 1000),
    musicLU: r2(mm.lufs), othersLU: r2(mo.lufs), songToSfx: r2(mm.lufs - mo.lufs),
    limMean: r2(mean(lim)), lim1: r2(share(lim, 1)), lim3: r2(share(lim, 3)), glueMean: r2(mean(glue)), glue3: r2(share(glue, 3)),
    flatness: r2(sp.flatness * 100), flatMusic: r2(spm.flatness * 100), onsets: r2(sp.onsetsPerSec), onsetsMusic: r2(spm.onsetsPerSec),
    inChord: h.inChord, inScale: h.inScale, inChordMusic: hm.inChord,
    voices: full.r.maxVoices,
    ...extra,
  };
})()
