# FORTÍSSIMO v7: viradas in the world, and a flawless run is always possible

The player's brief (v7, after v5 bosses; the v6 mix change was rolled back because the player
liked the v5 sound better):

1. **A flawless run is always possible.** If you play very well, you can finish every level
   without losing a single life. A perfect-rhythm bot that plays well currently loses 1 life on
   **mx** (a scurry at bar 10) and 1 on **i1** (a wolf at bar 6). The virtuoso (rhythm 0.9) also
   loses lives on **dx** and **i4**.
2. **Replace the Maestro's call bar (the horizontal `#call` sequence near the baton) with
   viradas in the world.** The player wrote: "instead of these sequences appearing there, they
   appear in the world: circles at specific places that close, and when it's the right time you
   tap there and it makes the sound, part of the music, like a *virada* (a drum fill). Five or
   six little balls. When you're on a great streak it appears, closing in sequence, and you keep
   the streak going. When you do the whole sequence, something happens: a stronger power, more
   coins, a boost. Make it really delicious to play: a truly musical rhythm tower defense,
   revolutionary."

Everything stays procedural, wordless, deterministic in the sim and fast on phones.

## 1. The virada

- **When it happens.**
  - **On a streak:** with a combo of about 8 or more, or groove 2 or more, a virada comes at the
    next phrase end, no more often than about once every 8 bars. The gameplay agent tunes this.
  - **In every breather:** this replaces the Maestro's call. The first virada of m1 is a gentle,
    taught one (the glove shows it).
  - **During boss fights:** viradas still happen, and they must not collide with a boss's blows
    (skip or shift one of the two).
- **What you see.** About 1 to 1.5 beats before the first stroke, 4 to 6 golden **marks** appear
  at places in the world:
  - Where: on the ground or in the air around the colossus, spread across the visible screen, away
    from the HUD and from each other, and reachable with a thumb on a phone (tap radius about
    44 px or more).
  - The ring: each mark has an approach ring that shrinks onto it exactly on its stroke.
  - The order: a thin dotted trail links the marks in order, and the next mark pulses.
  - Positions follow the camera, because they are world points projected every frame.
- **Tapping.** Tap mark i when its ring closes. It is judged with the usual windows (RHYTHM
  perfect/good), using a new tap target, `'virada'`.
  - **A hit:** a golden burst, and a note glyph flies to the band. `audio.viradaHit(i, n, t, q, pan)`
    plays that stroke of the fill. It feeds the power meter like any judged tap.
  - **A mark that passes unhit:** a miss. It breaks the combo as usual, and the rest of the
    virada carries on.
- **The patterns are the fill.** The strokes are on 8ths and 16ths across the last bar of a
  phrase and end before the downbeat. Two bars at slow tempos are fine. The patterns come from
  the sim as `viradaPattern(world, seed, k, level)`, so the same journey gives the same viradas.
  Meadow is plain (quarters and 8ths, 4 to 5 marks); later lands add 16ths and syncopation (5 to
  6 marks); legends and bosses use the hardest patterns.
- **Chains.** Full viradas in a row raise the level (0 → 1 → 2): one more mark each time, a bigger
  reward and a bigger sound. A virada with misses resets the level.
- **Rewards (a recorded sim action, `virada(hits, n, perfects)`).**
  - **All marks hit:** a big moment, with a golden shock ring from the colossus and the band
    flaring. Power gets a jump (about +15). A coin shower arrives as a direct bonus scaled by the
    land. The band gets a "virada boost" of about ×1.3 damage for about 4 bars, shown as a glow on
    the shell plates. The FORTÍSSIMO meter gets about +10%.
  - **All perfect:** all of that, a bit more, plus a bigger burst.
  - **Half or more of the marks hit:** a few coins.
  - **Fewer than half:** nothing, and no penalty beyond the misses.
  - The gameplay agent sets the numbers. It must stay a reward, not a requirement to win.
- **Gone.** The old `#call` bar and the HUD's Maestro call and echo UI are removed. The audio
  calls `callNote`, `echoNote` and `echoResult` are no longer used in battles, but the API keeps
  them. Boss "echo" patterns (siren, legends) become in-world marks too: the boss lights its marks
  first (a call), then you answer them. If that is too much for now, they use ordinary viradas.
  The old bar must not appear anywhere.

## 2. Flawless is possible

- Every life lost must be avoidable by playing well:
  - creatures can be struck before they bite, and fast ones need to be reachable in time;
  - every boss blow can be parried;
  - nothing does unavoidable damage.
- Add a `flawless` bot: perfect rhythm, sensible building, a strike every beat (and every eighth
  from groove 3) on the most dangerous creature close to the colossus, every blow parried, every
  virada hit.
- `tools/balance.ts --bots flawless` must show **every level of the campaign at 20/20** in normal
  mode.
- Add a test with a fast subset (at least m1, mx, i1 and one boss level) so this never regresses.
- Fix the leaks by making a great player able to stop them (strike reach, strike damage on a
  small creature, eighth taps). **Do not** make the game easier for the conductor and weak bots:
  their results must stay within their current targets.

## 3. Contracts (on main)

- `src/audio/api.ts` (no-ops now, implemented by the audio agent):
  - `viradaCue(start, end, n, level)`: call it at least 1 bar ahead. The song's drums step back
    from `start` to `end`, and a crash lands on `end`.
  - `viradaHit(i, n, t, q, pan)`: one stroke of the fill at the judged grid time.
  - `viradaEnd(t, hits, n, perfect)`: on the downbeat after the virada.
- **Audio rule:** the player liked the v5 mix and rejected a global rebalance. Outside a virada,
  **nothing in the mix changes**. Fill strokes sit at the level of the song's drums, never louder.
- Sim: `viradaPattern`, the `virada` action (recorded, replayable in checkpoints), the boost and
  its stats (`stats.viradas`, `stats.viradaFull`). Determinism and checkpoints stay exact.

## 4. v7.1 (after the player tried it)

The player found the first viradas too fast and too much "on the screen". Now:
- **Slow and clear:** one stroke every two beats (tan … tan …), 4 to 6 strokes, the last on beat 3
  of a phrase's last bar, then the crash on the downbeat. A virada spans 2 or 3 bars. The beat
  between two strokes is free for the baton. Difficulty grows with where the pads are (farther
  apart in later lands), never with speed.
- **One at a time, really in the world:** each mark is a golden drum pad lying on the ground
  (a three.js object with a note on its skin, a short light column and a flat ring on the ground
  closing onto it). It rises two beats before its stroke, where the screen is free and near the
  pad before it. Struck, it pulses down and sinks; missed, it greys and sinks. Boss calls float
  in the air near the boss, in red.
- **Sound:** during a virada the song's kick, snare and drums step out and its hats or shakers
  keep a soft pulse. A perfect stroke answers itself a 16th later (ta-dum). Outside a virada
  nothing changes.
- **Bosses:** a virada can come during a duel when no blow already on its way would land in it;
  the bosses hold their next tells until it is over.
