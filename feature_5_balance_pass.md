# feature_5 — Difficulty Curve & Balance Tuning

## Rationale

The codebase notes ("Balance is first-pass and will need tuning now that
every spell is a solo archetype") and todofeature.md items 12–17 are all
unaddressed. Players currently experience an unverified difficulty curve,
six spells with no formal solo-viability calibration, untuned reward and
service costs, and objective/layout/boss waves whose pacing has never been
validated. A balance pass is required before any external playtest or
review.

This feature is _numerical tuning only_. It does not add new content; it
adjusts existing numbers and documents the target curve. New upgrade tree
nodes and new relics live in feature_6.

## Depends On

- **feature_2 (Smoke Tests)** strongly recommended — the wave-clear,
  reward-pick, and death scenarios will catch regressions when individual
  numbers move. Not a hard block, but landing this without smoke coverage
  is risky.

## Files Touched

### Created

- `BALANCE_NOTES.md` — Authoritative tuning doc with target run length,
  expected DPS bands per archetype, reward economy budget, objective
  pacing, and boss difficulty intent. Lives at the project root next to
  other design docs. Updated each balance pass.

### Modified

- `src/spells/spellDefinitions.js` — Adjust base `damage`, `cooldown`,
  `projectileSpeed`, `range`, `areaRadius`, `splitCount`, `chainTargets`,
  `dotDuration`, `meteorRadius`, etc. per archetype. Frozen defs stay
  `Object.freeze`'d.
- `src/level/LevelManager.js` — Tune `composition(level)` enemy counts,
  the `LAYOUT_BIAS` per-layout shifts, and level gates if needed.
- `src/level/waveModifiers.js` — Tune modifier roll chance, modifier
  effect magnitudes (speed multipliers, armor amounts, regen rates, etc.).
- `src/enemies/Enemy.js` — Tune per-archetype HP, damage, speed, and AI
  reaction timings (e.g., dasher windup, mage cast cadence, linebreaker
  charge cooldown). 3 boss variants in same file get their own pass.
- `src/enemies/EnemyManager.js` — If spawn pacing changes, adjust
  staggered-spawn delays only. Do not change the overall wave-clear
  contract.
- `src/level/ObjectiveManager.js` — Tune objective trigger thresholds,
  completion durations, and reward bonuses for the 3 objective types
  (Sigil / Rift / Ritual).
- `src/level/LayoutEventManager.js` — Tune gate-shift cadence and
  rift-surge intensity / duration so they remain readable.
- `src/rewards/rewardDefinitions.js` — Tune common/uncommon/rare weights
  in `RARITIES` and the existing buff numbers (damage %, cooldown %,
  pierce, split). Do not add new reward entries here — those belong to
  feature_6.
- `src/core/Game.js`
  - `rewardRerollCost(level)` formula tuning.
  - `serviceOptions(level)` cost / heal amount tuning.
- `src/spells/upgradeTrees.js` — Tune existing node costs only. New nodes
  belong to feature_6.

### Not modified

- No new files in `src/spells/`, `src/rewards/`, or `src/enemies/`.
- No changes to control flow in `Game.js`, `LevelManager.js`,
  `EnemyManager.js`, or `RewardGenerator.js` — only the numbers and the
  composition table.
- No UI changes beyond what is already wired to the numbers (HUD
  enemy count etc. update automatically).

## Implementation Plan

1. Establish the target run length and curve in `BALANCE_NOTES.md`:
   - Target median run: ~12 minutes, 8–12 waves cleared, expected loss
     around level 10–14 for a player on their second or third run.
   - Damage budget: every starter spell must, with no upgrades, clear
     wave 1 in ≤45 seconds and reach wave 4 with full HP ≥40% of runs.
   - Reward economy: a 12-wave run should grant enough gold to buy 4–6
     upgrades, 1 service, and ≤1 reroll without overflowing.
   - Boss pressure: bosses appear on wave 5/10/15, each should be solvable
     in ~60 seconds with one or two upgrades.
2. Walk every spell in `spellDefinitions.js` and adjust base stats so
   each archetype hits the wave-1 clear time. Keep frozen.
3. Walk `LevelManager.composition` and confirm enemy counts increase
   smoothly (≤+2 enemies per wave at level transitions). Adjust the
   `LAYOUT_BIAS` shift values to keep ±2 enemy budget per wave.
4. Walk `Enemy.js` archetype constructors — tune HP/damage/speed so
   melee feels solid, ranged punishes standing still, dasher punishes
   ignoring it, linebreaker punishes cover stacking, mage punishes
   long open lines. Boss HP/damage should make the 60-second target.
5. Walk `waveModifiers.js`:
   - Swift Horde: tune speed multiplier (target +20–30%).
   - Armored: armor amount (target equivalent to +25% effective HP).
   - Volatile: death burst damage and radius.
   - Regenerating: regen rate per second.
   - Elite Vanguard: extra elite count and spawn cap.
   Roll chance ramps with level but caps before wave 10.
6. Walk `ObjectiveManager.js` — tune completion timer and pressure for
   Sigil, Rift, Ritual. Document target completion success rate.
7. Walk `LayoutEventManager.js` — gate-shift cadence and rift-surge
   damage multiplier so they read as fair.
8. Walk `rewardDefinitions.js` — adjust the buff magnitudes only.
   Sanity-check: at 6 upgrades a starter spell should roughly double
   its effective DPS, not triple.
9. Adjust `Game.serviceOptions(level)` costs and heal amount so a
   service feels valuable but not auto-buy at high gold.
10. Adjust `Game.rewardRerollCost` ramp.
11. Adjust `upgradeTrees.js` costs only (no new nodes here).
12. Run the smoke suite and a handful of manual runs to validate the
    new curve. Update `BALANCE_NOTES.md` with the final numbers.

## Verification

### Automated

- All scenarios in feature_2 continue to pass — none of them assert
  specific numerical values; they only assert state transitions and
  presence of HUD elements.
- If a number breaks an invariant (e.g., negative cooldown), the
  `sanitizeSettings`-style guards in `SpellInstance` constructor (if
  any) should clamp; otherwise add an assert in the constructor.

### Manual

- Play three runs with three different starter spells and confirm:
  - Wave 1 clears in target time.
  - Death typically lands between wave 8 and wave 14 with no upgrades
    being grossly OP.
  - Reroll feels useful but not free.
  - Boss waves resolve in ~60 seconds.
- Trigger each of the 5 modifiers at least once and confirm they read
  fairly on the HUD modifier description.
- Trigger each of the 3 objective types at least once and confirm
  completion within the target window.

### Console / logs

- No new error log entries in `renderer.log`.
- Run summary numbers (`damage`, `enemiesKilled`, `gold`) should be
  within ballpark targets documented in `BALANCE_NOTES.md`.

## Guardrails

- **Tuning only.** No new spell definitions, no new upgrade tree nodes,
  no new relics, no new objective types, no new layouts, no new
  modifiers, no new enemy archetypes. Those belong to feature_6.
- Do not refactor any module under `src/`. If a function needs to be
  changed structurally to make tuning possible, that refactor is a
  separate session.
- Do not touch the single damage path (`applyDamage`), `RunStats`,
  `Currency`, `Profile`, `Settings`, or any storage / save code.
- Do not modify the smoke harness to assert numerical values that
  would be brittle as future passes tune again.
- Do not change `SPELL_DEFINITIONS` frozenness. All buffs continue to
  mutate `SpellInstance` runtime stats only.
- Do not change `LayoutEventManager` or `ObjectiveManager` lifecycle
  contracts — only numbers.
- Document every number change in `BALANCE_NOTES.md` before/after so
  future sessions can revert individual tunings without diff
  archaeology.
