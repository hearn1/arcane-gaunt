# Credits & Asset Licenses

## Game code

Original implementation for the **ArcaneGaunt** prototype.

## Third-party libraries

| Library | Version | Source | License | Usage |
|---------|---------|--------|---------|-------|
| three.js | 0.160.0 | https://github.com/mrdoob/three.js (fetched via unpkg) | MIT | 3D rendering, GLTF loading, and skinned model cloning. Vendored locally under `vendor/` so the game runs fully offline. |

## Art & audio assets

All assets below are **CC0 1.0 Public Domain** - free to use for any purpose,
commercial or not, no attribution required. Source pages verified at fetch
time; files were hand-picked from larger CC0 packs and the rest discarded.

### Audio (Kenney.nl, CC0)

Source packs:

- Kenney **Sci-Fi Sounds** - https://kenney.nl/assets/sci-fi-sounds (CC0)
- Kenney **Impact Sounds** - https://kenney.nl/assets/impact-sounds (CC0)
- Kenney **Interface Sounds** - https://kenney.nl/assets/interface-sounds (CC0)

| File in repo | Original filename | Source pack | Author | License |
|---|---|---|---|---|
| `assets/audio/cast_arcane.ogg` | `laserSmall_001.ogg` | Sci-Fi Sounds | Kenney | CC0 1.0 |
| `assets/audio/cast_fire.ogg` | `laserLarge_000.ogg` | Sci-Fi Sounds | Kenney | CC0 1.0 |
| `assets/audio/cast_frost.ogg` | `forceField_000.ogg` | Sci-Fi Sounds | Kenney | CC0 1.0 |
| `assets/audio/cast_poison.ogg` | `slime_000.ogg` | Sci-Fi Sounds | Kenney | CC0 1.0 |
| `assets/audio/cast_chain.ogg` | `laserRetro_002.ogg` | Sci-Fi Sounds | Kenney | CC0 1.0 |
| `assets/audio/cast_meteor.ogg` | `lowFrequency_explosion_000.ogg` | Sci-Fi Sounds | Kenney | CC0 1.0 |
| `assets/audio/explosion.ogg` | `explosionCrunch_001.ogg` | Sci-Fi Sounds | Kenney | CC0 1.0 |
| `assets/audio/blink.ogg` | `forceField_002.ogg` | Sci-Fi Sounds | Kenney | CC0 1.0 |
| `assets/audio/enemy_hit.ogg` | `impactPunch_medium_002.ogg` | Impact Sounds | Kenney | CC0 1.0 |
| `assets/audio/enemy_death.ogg` | `impactSoft_heavy_001.ogg` | Impact Sounds | Kenney | CC0 1.0 |
| `assets/audio/player_hurt.ogg` | `impactPunch_heavy_000.ogg` | Impact Sounds | Kenney | CC0 1.0 |
| `assets/audio/reward.ogg` | `confirmation_002.ogg` | Interface Sounds | Kenney | CC0 1.0 |
| `assets/audio/wave_clear.ogg` | `bong_001.ogg` | Interface Sounds | Kenney | CC0 1.0 |
| `assets/audio/game_over.ogg` | `error_006.ogg` | Interface Sounds | Kenney | CC0 1.0 |

### Textures (ambientCG, CC0)

| File in repo | Asset name | Source | Author | License |
|---|---|---|---|---|
| `assets/textures/floor_stone.jpg` | PavingStones070 (Color, 1K) | https://ambientcg.com/view?id=PavingStones070 | ambientCG | CC0 1.0 |
| `assets/textures/wall_stone.jpg` | Bricks075A (Color, 1K) | https://ambientcg.com/view?id=Bricks075A | ambientCG | CC0 1.0 |
| `assets/textures/pillar_stone.jpg` | Rock029 (Color, 1K) | https://ambientcg.com/view?id=Rock029 | ambientCG | CC0 1.0 |

### Models (Quaternius, CC0)

Source pack: Quaternius **Ultimate Monsters** - https://quaternius.com/packs/ultimatemonsters.html (CC0)

| File in repo | Original asset | Author | License |
|---|---|---|---|
| `assets/models/enemy_melee.glb` | `Blob/glTF/Orc.gltf` | Quaternius | CC0 1.0 |
| `assets/models/enemy_ranged.glb` | `Blob/glTF/GreenSpikyBlob.gltf` | Quaternius | CC0 1.0 |
| `assets/models/enemy_dasher.glb` | `Blob/glTF/Ninja.gltf` | Quaternius | CC0 1.0 |
| `assets/models/enemy_mage.glb` | `Blob/glTF/Wizard.gltf` | Quaternius | CC0 1.0 |
| `assets/models/enemy_elite.glb` | `Big/glTF/Yeti.gltf` | Quaternius | CC0 1.0 |

CC0 license text: https://creativecommons.org/publicdomain/zero/1.0/

### Still procedural (not externally sourced)

- **Player mesh** - first-person controller with no visible external mesh.
- **Spell / impact VFX** - procedural `Points` bursts, rings, beams
  (`src/core/VFX.js`).
- **UI** - plain HTML/CSS (`index.html`, `src/ui/ui.js`).
- **Skybox / fog** - flat fog color; no CC0 cubemap was sourced.
- **`audio.impact()`** - defined but uncalled in the game; left procedural.

### Icon art (original work)

| File in repo | Description | Author | License |
|---|---|---|---|
| `assets/icons/` (all files) | App icon — stylised "AG" monogram on purple-to-blue gradient. Source SVG at `assets/icons/icon_sources/arcane.svg`. | Original work for ArcaneGaunt | UNLICENSED (project-private) |

If any sample fails to load (404, decode error), `AudioSys` silently falls back
to the original procedural Web Audio synth path for that slot. Same for
arena textures and enemy models - the Lambert color/capsule fallback stays
visible if the JPG or GLB fails. The game boots with zero assets present.
