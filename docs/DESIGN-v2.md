# FORTÍSSIMO v2 — design and contracts

What the player asked for (the brief for this version):

1. **A real story**, told without words, discovered while playing: an interlude after **every** level,
   a chapter opening for every land, a much better opening and a giant Silence that looks great.
   See `docs/STORY.md`: it is the source of truth for the narrative.
2. **Much longer levels** (today 1.5–2.5 min; target 4–9 min) with **real challenge**.
3. **Build a band**: every tower is a musician; combining instruments makes the music richer **and**
   the band stronger; the music evolves with the band.
4. **Many truly different enemies**, each part of the story and of its land.
5. A different, great theme for every land (exists; must be checked and made more distinct).
6. Camera, feet and phone-portrait fixes (done in commit 7357636).

Everything stays procedural (no image or audio files), wordless (no text that explains rules),
deterministic in the simulation, and fast on phones.

---

## 1. The band (the core new mechanic)

### Sections and harmony
Every instrument belongs to a **section** (`SECTION_OF` in `src/sim/defs.ts`):

| Section | Instruments |
|---|---|
| strings | harp |
| percussion | drum, shaker |
| bells | bell, crystal |
| brass | horn |
| voices | choir |
| low | bass |

`harmony = (number of distinct sections on the shell) − 1`, so 0…5. Harmony multiplies the damage of
every tower (proposal: `1 + 0.07 × harmony`, tune with the bots) and is shown in the HUD as five little
lights (wordless). Each new section is also a **new layer of the music** (see §5).

### Duets (neighbours on the shell)
Two towers on **adjacent plates** whose kinds match a duet form it (a tower can be in several duets).
Proposal (the gameplay agent tunes the numbers; effects must be visible and audible):

| Duet | Pair | Effect |
|---|---|---|
| march | harp + drum | the harp also fires on the drum's hits (more shots) |
| groundwork | drum + bass | ground hits make creatures stumble (brief stop) |
| shimmer | bell + crystal | crystal chains jump farther and slow |
| fanfare | horn + drum | horn waves are wider and stronger |
| hymn | choir + bell | reveal reaches farther; the colossus heals a little every few bars (cap) |
| serenade | harp + choir | harp notes become chords (+damage) |
| groove | shaker + drum | more notes (coins) per bar |
| thunder | crystal + bass | every bass drop also fires a chain |

The build radial hints duets wordlessly: an instrument that would form a duet with a neighbour of the
chosen plate glows/sparkles. On the shell, partners are joined by a glowing ribbon in the duet's colour.
A duet forming plays a short musical flourish.

### Counter-play
Creatures push the player to vary the band: fliers (only harp, bell, crystal, choir reach the sky),
armour (bass and bell ignore it), invisibility (bell and choir reveal), the Whirl (deflects single
shots), the Mimic (mutes every instrument of the kind it copies), mutes and the Slug's disabled plates.
A one-instrument band must lose from the middle of the first land onward.

## 2. Long journeys, in movements

A level is a journey in **movements** (3 to 5), like a symphony. Each movement has its waves; between
movements there is a **breather** (6–10 bars: calm music, a burst of golden notes to collect, and
**one more plate of the shell lights up**). Levels start with few plates and grow the band while you play.

Target length (at the world's tempo, ≈100–116 bpm): first level ≈ 4 min; main levels 5–7 min;
guardians 7–9 min; extras 7–9 min; the Abyss ≈ 10 min. Roughly `bars` ×3 of today.

Mid-level variety: an elite or mini-guardian in a middle movement, ambushes from behind in canyons,
fliers in open plains, the landscape features (`features` in the def) matching the action.

**Checkpoints**: on defeat the player may restart **from the start of the movement where they fell**
(the sim is deterministic: record the player's actions with their sim time; a retry replays them
headlessly up to the movement's start, then plays on). Full restart stays available.

**Real challenge** (the player asked for it): the good bot (diverse band, duets, pickups, upgrades)
should win every main level with 2–3★, the extras with 1–2★; a simple "one kind spam" bot should lose
from m3 on; a novice bot (follows the glove, slow decisions) should still win world 1 with ≥1★.
3★ needs excellent play. Keep `npm test` and `npm run balance` green and meaningful.

## 3. Bestiary

Ids in `EnemyKind` (`src/sim/defs.ts`). Looks are for the art agent; abilities for the gameplay agent.
Every creature is a **stolen sound turned into ink**, with an X-stitched mouth; defeated, it turns back
into golden notes. Each land has its family (see STORY.md).

| id | Name (pt) | Land | Ability (sim) | Look |
|---|---|---|---|---|
| blot | Borrão | prado | basic, hops on the beat | ink droplet with a little crest |
| blotling | Borrinho | — | from the Bolhão | tiny droplet |
| scurry | Corredor | prado | fast | ink mouse with big ears, long tail |
| bubble | Bolhão | prado | splits into blotlings | soap bubble of ink, swirling inside |
| moth | Mariposa | prado | flies | grey moth, dusty wings |
| scorpion | Escorpião-de-Areia | dunas | armoured; burrows (untargetable) 1 bar of every 4 | sand scorpion, raised tail |
| whirl | Redemoinho | dunas | **deflects** single shots (harp, horn); pushes neighbours faster | spinning dust devil with a mask inside |
| echo | Eco | dunas | returns **once** (half hp) one bar after dying | translucent double-outlined ghost of sound rings |
| obelisk | Obelisco Mudo | dunas | structure; mutes towers near it | carved obelisk with an X glyph |
| wolf | Lobo-de-Geada | picos | very fast, comes in packs | frost wolf of ink and ice shards |
| shell | Casco | picos | armoured, slow | ice beetle with a heavy shell |
| phantom | Fantasma | picos | invisible until revealed | foggy ghost |
| muffler | Abafador | picos | mutes towers around it | snow owl with earmuffs |
| ember | Brasa | forja | flies, swarms | fire bat |
| slug | Lesma-de-Lava | forja | huge hp, slow; its bite **disables a plate** for some bars | lava slug with a crusted back |
| shield | Escudeiro | forja | shields neighbours | knight with an anvil shield |
| mender | Fole | forja | heals neighbours | living bellows that puffs |
| mimic | Sombra | cidadela | copies a tower kind on the shell and **mutes every tower of that kind** while alive | dark copy of a musician with an X mouth |
| knight | Cavaleiro do Silêncio | cidadela | heavy armour + shield, immune to slow | tall knight, porcelain mask |
| conductor | Regente Sombrio | cidadela | elite: creatures near it speed up on the downbeat | shadow conductor with a black baton |
| bossBlot … silence | guardians | — | as today (tune for long levels) | redesign; the Silence uses `SilenceView` |

New ability fields in `EnemyDef` are declared (optional) in `defs.ts`; the gameplay agent implements and
tunes them. New trait icons (`ICON.deflect`, `ICON.echo`, `ICON.burrow`, `ICON.pack`, `ICON.disable`,
`ICON.mimic`, `ICON.steady`, `ICON.aura`) exist as placeholders in `src/ui/icons.ts`.

## 4. Cinematics

See STORY.md. Opening v2 (≈90–110 s), a chapter opening per land (8–14 s, with the land's name as a
title card), an interlude after every level (8–18 s), memories of the Silence after the extras, the
guardian scenes (shard returns, the Voice rings, colour wave), the ending v2 (with the full band) and
the Abyss epilogue. All skippable (hold), all replayable from a **story gallery** in the menu. The
Heart on the shell shows how many shards came home (5 facets).

## 5. Music

- Every land keeps its own battle theme (meadow pastoral; desert Phrygian/Hijaz; ice Lydian
  glass; forge heavy taiko/brass; citadel dark choir/organ; boss; finale). Make each one unmistakable.
- **The music evolves with the band** (`audio.setBand`): each section on the shell adds its layer to
  the arrangement (percussion → groove; strings → ostinato; bells → shimmer; brass → pads/swells;
  voices → choir; low → bass line); harmony makes the arrangement fuller (counter-melodies).
  Duets change how partners play together (e.g. march: the harp locks to the drum's rhythm).
- **Long-form**: levels last up to ~9 min, so the songs need sections and variations (A/B/C, bridge,
  key lifts per movement, breakdowns in breathers) so they never feel like a loop.
- Story cues (moods) that sustain until the next cue (see `CinematicCue` in `src/audio/api.ts`).

---

## 6. Contracts (already in the code at the start of v2)

- `src/sim/defs.ts`: `Section`, `SECTION_OF`, `DuetId`, `DUETS`, `BandState`, new `EnemyKind`s with
  placeholder `ENEMIES` entries, optional ability fields in `EnemyDef`.
- `src/audio/api.ts`: `setBand(mix)`, `duet(id, t, pan)`, `movement(index, total, t)`,
  `plateUnlock(t, pan)`, `joinMotif(kind)`, new `CinematicCue`s (`story:*`, `land:*`). The engine has
  no-op implementations until the audio agent replaces them.
- `src/view/musicians.ts`: `MusicianView` (placeholder; the art agent implements it). API:
  `new MusicianView(kind, {scale?})`, `.group`, `.pose`, `play(strength?)`, `setFrozen(k)`,
  `update(dt, t, beat)`.
- `src/view/silence.ts`: `SilenceView` (placeholder; the art agent implements it). API:
  `.group`, `emerge`, `dissolve`, `pose`, `reach(target|null)`, `lookAt(p)`, `update(dt, t)`.
- `src/view/journeyView.ts`: `setDuets(list)` (the integrator implements the ribbons).

## 7. Who owns what (parallel work)

| Agent | Owns (edits only these) |
|---|---|
| audio | `src/audio/**`, `tools/audio-*` |
| gameplay | `src/sim/**`, `src/data/campaign.ts`, `tools/balance.ts`, `tests/run.ts`, `src/game/journeyBattle.ts`, `src/game/journeyTutorial.ts`, `src/ui/hud.ts`, `src/ui/harmony.css` (new), `src/core/save.ts` |
| art | `src/view/musicians.ts`, `src/view/silence.ts`, `src/view/enemies.ts`, `src/view/towers.ts`, `src/view/models.ts`, `src/ui/icons.ts` |
| story | `src/game/cutscenes.ts`, `src/game/story.ts` (new), `src/view/storyProps.ts` (new), `src/game/app.ts`, `src/ui/screens.ts`, `src/ui/i18n.ts`, `src/view/turtle.ts` (the Heart only), `src/view/journeyProps.ts`, `docs/STORY.md` |
| integrator (main session) | `src/view/journeyView.ts`, `src/view/landscape.ts`, `src/view/grass.ts`, `src/view/sky.ts`, `src/game/showcase.ts`, `src/ui/ui.css`, merging, glue, prints |

If an agent needs something outside its files, it codes against the contract and leaves a short
`// INTEGRATION:` note; the integrator wires it.
