# feature_6 — Upgrade Tree & Relic Expansion

## Rationale

README and todofeature.md state that Arcane Bolt and Fireball have deeper
upgrade trees but the other four starter spells (Frost Bolt, Poison Bolt,
Chain Lightning, Meteor) have smaller, thinner trees. Replay variety also
needs more build-defining relics beyond the five that exist today. Without
this, runs feel samey by wave 6 because every spell converges on the same
generic damage/cooldown buffs.

This feature adds _content only_ — new upgrade nodes, new relic reward
entries, and the catalog wiring to surface them. Numeric balance of new
content lands in feature_5's next pass; this feature ships content at
plausible starting numbers and is iterated by the next balance session.

## Depends On

- **feature_5 (Balance Pass)** strongly recommended first so the base
  curve is stable before adding new content. Not a hard block — if
  feature_5 hasn't landed, new content here uses placeholder values and
  feature_5's next iteration will tune them.

## Files Touched

### Modified

- `src/spells/upgradeTrees.js` — Expand the four underfilled trees toward
  parity with Arcane Bolt / Fireball. Target 10–20 nodes per spell with
  at least one branching fork and one mutually-exclusive pair per spell.
- `src/rewards/rewardDefinitions.js` — Add new relic reward builders to
  the rare pool. Existing five relics (Duelist Sigil, Blinkstrike Ember,
  Parry Dynamo, Adrenal Lens, Glass Focus) remain. Add 4–6 new ones.
- `src/core/CombatBonuses.js` — Hook up any new per-cast / per-block /
  per-blink behavior the new relics need. Existing helpers
  (`preparePlayerCast`, etc.) get new branches; no new modules.
- `src/spells/UpgradeManager.js` — Verify `requires` and `excludes`
  fork logic handles any new mutually exclusive pairs. Likely no code
  change, only validation.
- `BALANCE_NOTES.md` (from feature_5) — Append a section documenting the
  intended role of each new relic and the upgrade tree expansions.

### Possibly modified

- `src/rewards/RewardGenerator.js` — If new relics need a new eligibility
  predicate (e.g., a relic that only appears when the player owns a
  homing spell), extend the existing filter chain. Do not change the
  filter contract.
- `src/spells/SpellInstance.js` — If a new upgrade introduces a new
  runtime stat (e.g., `shockwaveRadius`), add it to the instance's
  initial stat copy. Default should be zero/null so existing spells
  aren't affected.

### Not modified

- No new files in `src/`. All new content slots into existing catalogs.
- No changes to `Game.js`, `Effects.js`, `HitResolver.js`, `Damage.js`,
  `Health.js`, `Currency.js`, or any UI screen — the data-driven hooks
  already exist.
- No changes to enemy archetypes or wave composition.

## Implementation Plan

1. Per spell, design new upgrade tree nodes targeting 10–20 total:
   - **Frost Bolt**: slow stacking depth, freeze chance at low HP,
     icicle splinter on impact, fork between long-slow / hard-shatter.
   - **Poison Bolt**: DoT scaling, plague spread on death, fork between
     wide-spread / deep-stack, capstone "Necrotic Bloom" AoE on kill.
   - **Chain Lightning**: chain count, jump distance, overcharge first
     target, fork between chains-favor-low-HP and chains-favor-elites.
   - **Meteor**: secondary impacts, scorched-earth lingering DoT, fork
     between blast radius and travel speed.
2. Add each node to `upgradeTrees.js` with a starting cost and the
   appropriate `requires`/`excludes` predicate. Confirm cost ramps
   follow the existing tier structure.
3. Per new relic, design a single high-impact passive:
   - **Embered Footing** — Standing still 1.5s grants the next cast
     +35% damage. Rewards positional play.
   - **Stormwitness** — Each chain target hit reduces blink cooldown by
     0.3s. Synergy with Chain Lightning / chains.
   - **Frostbitten Crown** — Slowed enemies take +20% damage from all
     sources. Synergy with Frost.
   - **Vermilion Catalyst** — Every 5th cast adds +50% damage and a
     small AoE. Rewards consistent casting.
   - **Hollow Sigil** — Picking up no upgrades for two consecutive
     reward screens grants a permanent +15% damage. Rewards focus.
   - **Riftborn Mantle** — Standing in a rift hazard heals 1HP/s but
     casts cost +20% cooldown. High-risk identity choice.
4. Each new relic is a builder in `rewardDefinitions.js` matching the
   existing relic builder shape. Set `rarity: "rare"` and add to the
   rare pool.
5. For each relic that requires runtime hooks:
   - Add a branch in `CombatBonuses.preparePlayerCast` for cast-time
     modifiers (Vermilion Catalyst, Frostbitten Crown).
   - Add a branch in the appropriate combat event helper for
     block/blink-triggered effects.
   - Wire the relic state via `world.combat` fields the same way
     existing relics do (e.g., `world.combat.castCounter`).
6. Validate `UpgradeManager.canBuy` correctly respects the new fork
   nodes with `excludes`.
7. Add a "New content" subsection to `BALANCE_NOTES.md` listing every
   new node's starting cost and stat numbers, so the next balance pass
   has a reference.

## Verification

### Automated

- `?smoke=boot-start-menu` and the feature_2 wave/reward/death scenarios
  all continue to pass — they don't assert specific reward / upgrade
  IDs.
- Optional: add a `?smoke=catalog-validate` scenario that enumerates
  `rewardDefinitions` and `upgradeTrees`, asserts each entry has the
  required shape (`id`, `apply`/`description`, `cost`, no duplicates),
  and confirms every `requires` / `excludes` reference resolves to a
  known node id.

### Manual

- For each starter spell, start a run with infinite gold (temporarily
  set `currency.gold = 9999` via DevTools) and confirm:
  - Upgrade panel renders every new node correctly.
  - Mutually exclusive forks lock the opposing branch after buy.
  - Each `apply` modifies the expected `SpellInstance.stats` field
    without throwing.
- Force each new relic to drop (temporarily bias the rare pool) and
  confirm:
  - Toast / log entries reflect the relic name.
  - The relic's effect fires (e.g., test Embered Footing by standing
    still 2s then casting; expect damage telemetry to show the +35%).

### Console / logs

- No new error log entries.
- Optional: add a console warning when a relic's runtime hook references
  an undefined `world.combat.*` field — helpful during development.

## Guardrails

- **Content only.** This feature does not tune existing nodes/relics or
  rebalance the base curve. Those changes live in feature_5.
- Do not modify the `RewardGenerator` filter contract (filters in, list
  out). New filters extend, never replace.
- Do not change the `UpgradeManager.canBuy` / `state` / `apply`
  contract. New nodes must work through the existing `requires` /
  `excludes` mechanism.
- Do not freeze new mutable runtime stats — `Object.freeze` is reserved
  for static definitions in `spellDefinitions.js`.
- Do not introduce a relic that touches `Damage.applyDamage`'s control
  flow. Relics may modify multipliers via `world.combat` flags but
  must not branch the damage path.
- Do not add a relic that requires a new save field — feature_8
  (Steamworks) is where persistent unlock state belongs, not here.
- Each new relic must have a self-contained description string short
  enough to fit a reward card without truncation.
