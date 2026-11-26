# FORTÍSSIMO v5 — bosses: every level ends in a duel on the beat

The player's brief (v5, after v4 "everything on the rhythm"):

- Every **main level** ends with a **mini-boss** near the bell: a real, cool battle with its own great
  music.
- Every **guardian level** (x4) has **sub-bosses in the middle of the fight** (the land's mini-bosses
  come back) and a **really big boss** at the end.
- The **secret/extra paths** (mx, dx, ix, fx, cx) have **really strong, unbelievable bosses** —
  musically incredible.
- **The boss attacks you, and you can avoid it because you are doing a great rhythm sequence.**
  Make it incredible, visually and musically.

Everything stays procedural, wordless, deterministic in the sim and fast on phones.

## 1. The duel (core mechanic of every boss)

A boss fight is a duel on the beat. Bosses do not just walk: they **attack the colossus on the
beat** with telegraphed blows, and the player **parries** them with rhythm.

- **Tell**: the boss winds up (visible pose + a ring of warning marks closing in on the baton, one
  per beat, red; the last one is the beat the blow lands). `audio.bossTell(t, pan, last)` per beat.
- **Parry**: tap (baton, or the boss itself) exactly on the landing beat. Perfect → the blow is
  **reflected** back (damage to the boss, it staggers, the camera punches, gold burst,
  `audio.parry(t,'perfect',pan)`); good → blocked (no damage taken, `audio.parry(t,'good',pan)`).
  Missed → the blow lands: lives lost and/or a plate/musician stunned for some bars, the power
  meter drops (`audio.bossBlow`).
- **Your rhythm protects you**: with high power (v4 meter) the colossus has a golden **shield of
  sound** that absorbs part of an unparried blow (the better you are playing, the safer you are);
  a long combo makes parry windows a little more forgiving. The player sees clearly: great
  sequence → the shield glows → the blow bounces off.
- **Patterns** get harder per land and per phase: single blows → double/triple blows → off-beat
  (eighth) blows → syncopated combos → in the legends, call-and-response "duels" where the boss plays
  a rhythm and the player must answer it (the Maestro's echo, now as a fight).
- **Phases**: guardians and legends have 2–3 phases (hp thresholds). Each phase: new attack set,
  new look (cracks, wings open, crown lights), `audio.bossPhase(n, t)`. Mini-bosses have 1–2.
- Bosses still walk toward the colossus and take damage from the band as normal; the duel is on top.
- A boss's HP bar (top, with phase notches) and its name card on entrance (the level's `name`
  style; names are proper nouns, allowed).

## 2. Where the bosses are

| Level | Mini-boss at the end (near the bell) | Notes |
|---|---|---|
| m1 O Despertar | **toad** Sapo-Borrão | gentle teaching duel: slow single blows, glove shows the parry |
| m2 Tambores no Vale | **drumBeetle** Besouro-Bumbo | rolls in, drums on its back; double blows |
| m3 Asas Cinzentas | **crow** Corvo-Cinza | flier, dives on the beat |
| m4 O Grande Borrão | mid: toad (mvt 2), crow (mvt 3); end: **bossBlot** | phases |
| mx Trilha dos Vagalumes | legend **wyrm** Serpente-Vagalume | firefly serpent, coils around the colossus |
| d1 Areias que Cantam | **sandworm** Verme-das-Dunas | burrows; erupts on the beat |
| d2 O Oásis | **croc** Crocodilo-Miragem | splits into mirage copies (only one is real) |
| d3 Obeliscos Mudos | **sphinx** Esfinge Muda | mutes plates, riddle rhythms (syncopated) |
| d4 O Escaravelho | mid: sandworm, sphinx; end: **bossScarab** | |
| dx Miragem | legend **djinn** Gênio da Miragem | giant sand djinn, mirage hands |
| i1 Neve que Ecoa | **yeti** Yeti-Eco | roars that echo (each blow repeats once) |
| i2 O Coro Gelado | **siren** Sereia de Gelo | sings a call you must answer (echo duel) |
| i3 Lago de Espelho | **stag** Cervo-Espelho | mirrored blows (left/right) |
| i4 A Mariposa-Rainha | mid: yeti, siren; end: **bossMoth** | |
| ix Aurora Partida | legend **aurora** Dragão da Aurora | aurora ribbons, colour shifting |
| f1 Brasas | **salamander** Salamandra | fire trails, fast triplets |
| f2 Rios de Lava | **magmaCrab** Caranguejo-de-Magma | heavy armour, claw combos |
| f3 A Bigorna | **smith** Ferreiro Sombrio | hammer on the anvil = the beat itself (tempo pushes) |
| f4 O Golem da Forja | mid: salamander, smith; end: **bossGolem** | |
| fx Coração Vulcânico | legend **phoenix** Fênix Negra | dies and is reborn once (new phase) |
| c1 Degraus de Mármore | **gargoyle** Gárgula | stone ↔ alive on the beat (immune while stone) |
| c2 Ecos Vazios | **organist** Organista Fantasma | its organ plays the attack rhythm |
| c3 A Última Escada | **twin** Cavaleiros Gêmeos (two at once) | alternating blows |
| c4 O Silêncio | mid: gargoyle, organist; end: **silence** | |
| cx O Abismo | legend **abyssKing** Rei do Abismo | the ultimate duel, all patterns |

Mini-bosses fit the story: each is a great stolen sound of its land, sewn shut with an X; defeated
it bursts into a big golden chord (a little musician/instrument spirit flies home). Legends are the
Silence's oldest stolen songs; freeing one is a big moment (short wordless mini-scene allowed).

## 3. Contracts (on main)

- `src/sim/defs.ts`: new `EnemyKind`s (above), placeholder `ENEMIES` entries with `mini` / `legend`
  flags. The gameplay agent owns the numbers, the attack patterns and campaign placement.
- `src/audio/api.ts`: `bossTheme(kind|null, t)`, `bossPhase(n, t)`, `bossTell(t, pan, last)`,
  `parry(t, q, pan)`, `bossBlow(t, pan, strength)` (no-ops until the audio agent implements them).
- `src/view/enemies.ts` `EnemyView` (art agent) adds:
  - `bossAct(act: 'enter' | 'tell' | 'blow' | 'parried' | 'stagger' | 'phase' | 'summon' | 'burrow' | 'emerge', k?: number)`
    — plays the pose/animation (tell = wind-up for k beats; phase = transform to phase k).
  - `setPhase(n: number)` — persistent look per phase.
  - models for every new kind (mini-bosses ≈1.6–2.2× a normal creature's presence, legends huge and
    spectacular, each with a unique silhouette readable on a phone), `CREATURE_INK` colours, icons
    in `src/ui/icons.ts`.
- `src/view/journeyView.ts` (integrator / gameplay): boss HP bar, tell marks on the baton, parry FX,
  sound-shield bubble, camera framing for entrances.
