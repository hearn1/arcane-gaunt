// Data-driven VFX emit recipes for projectile impacts, explosions, and trails.
//
// Each entry maps a vfxId → a function that fires vfx calls against the
// world's vfx system.  Callers pass a resolved `color` (already colorblind-
// corrected) and the relevant context.  No spell-id switches live here —
// HitResolver selects the correct recipe by looking up spell.impactVfxId /
// spell.explodeVfxId and falling back to "default_impact" / "default_explode".
// Projectile._emitTrail() selects the trail recipe by spell.trailVfxId.
//
// Colorblind: callers must resolve the color BEFORE calling into VfxLibrary.
// Use resolveColor(spell, settings) to get the correct hex value.
// Density / reducedMotion are read directly from world.vfx at emit time.

/**
 * Resolve the display color for a spell, applying colorblind correction.
 * @param {object} spell - SpellInstance or SPELL_DEFINITIONS entry
 * @param {object} settings - current game settings object
 * @returns {number} hex color
 */
export function resolveColor(spell, settings) {
  if (settings?.display?.colorblindMode && spell.colorblindColor != null) {
    return spell.colorblindColor;
  }
  return spell.color;
}

// ---------------------------------------------------------------------------
// Trail recipes (per-frame/interval trail emission while projectile is alive)
// ---------------------------------------------------------------------------
// Each recipe is: (vfx, lastPos, pos, color) => void
//   vfx     — the VFX instance (world.vfx)
//   lastPos — THREE.Vector3 previous position
//   pos     — THREE.Vector3 current position
//   color   — already-resolved hex color
//
// Under reducedMotion the VFX primitives themselves (embers/spiral/mist) skip
// motion and fall back to a brief static marker — no per-recipe guard needed.

const TRAIL_RECIPES = {
  // Arcane Bolt — tight shrinking corkscrew of tiny flash spheres, energy
  // spiraling in. Replaces the per-frame beam that allocates new geometry.
  arcane_spiral: (vfx, lastPos, pos, color) => {
    vfx.spiral(lastPos, pos, color, 5);
  },

  // Fireball — trailing ember particles that fall and fade (gravity bias).
  // Only the trail; the impact is the existing _explodeVisual path.
  fire_embers: (vfx, lastPos, pos, color) => {
    vfx.embers(pos, 0xff7a33, 4, 0.55);
    // Orange accent — a second smaller ember burst for heat shimmer.
    if (Math.random() < 0.5) vfx.embers(pos, 0xffc45a, 2, 0.35);
  },

  // Frost Bolt — drifting ice-mist along the path (slower-decaying than arcane).
  frost_mist: (vfx, lastPos, pos, color) => {
    vfx.mist(pos, 0xbdefff, 0.5, 0.55, 4);
  },

  // Poison Bolt — thick, green-tinged mist, larger radius, longer fade.
  // Longest trail interval (it's a DoT — slow, oppressive, not snappy).
  poison_cloud: (vfx, lastPos, pos, color) => {
    vfx.mist(pos, color, 0.85, 0.75, 7);
  },

  default_trail: (vfx, lastPos, pos, color) => {
    vfx.flash(pos, color, 0.14, 0.16);
  },
};

// ---------------------------------------------------------------------------
// Impact recipes (projectile hits wall or enemy)
// ---------------------------------------------------------------------------
// Each recipe is: (vfx, pos, color, ctx) => void
//   vfx    — the VFX instance (world.vfx)
//   pos    — THREE.Vector3 impact position
//   color  — already-resolved hex color
//   ctx    — { projectile } (may be null)

const IMPACT_RECIPES = {
  // Arcane Bolt — thin fast expanding ring (precision read) + burst + one-frame
  // white core flash. Charged tell: brighter secondary burst at cadenceStacks>=3.
  arcane_pop: (vfx, pos, color, ctx) => {
    vfx.shock(pos, color, 1.8, 0.20);
    vfx.burst(pos, color, 14, 8, 0.34, 0.16);
    vfx.flash(pos, 0xffffff, 0.22, 0.08);
    if (ctx?.projectile && ctx.projectile.cadenceStacks >= 3) {
      vfx.burst(pos, 0xf2eaff, 20, 10, 0.5, 0.12);
    }
  },

  // Keep the legacy recipe keyed on definitionId for any callers using the old path.
  arcane_bolt: (vfx, pos, color, ctx) => {
    vfx.shock(pos, color, 1.8, 0.24);
    vfx.burst(pos, color, 14, 8, 0.34, 0.16);
    if (ctx?.projectile && ctx.projectile.cadenceStacks >= 3) {
      vfx.burst(pos, 0xf2eaff, 20, 10, 0.5, 0.12);
    }
  },

  // Frost Bolt — branching ice shard sparks (shatter silhouette) + chill flash.
  // Shatter palette stays fixed for readability independent of colorblind mode.
  frost_shatter: (vfx, pos, _color) => {
    vfx.shards(pos, 0xbdefff, 6, 1.8);
    vfx.shock(pos, 0x5cc8ff, 2.0, 0.30);
    vfx.flash(pos, _color, 0.55, 0.18);
  },

  // Keep the legacy recipe keyed on definitionId.
  frost_bolt: (vfx, pos, _color) => {
    vfx.shock(pos, 0xbdefff, 2.2, 0.34);
    vfx.burst(pos, 0xdff8ff, 18, 7, 0.48, 0.14);
    vfx.flash(pos, _color, 0.55, 0.18);
  },

  // Poison Bolt — lingering mist cloud (bigger, longer than the trail puff) that
  // footprints the contagion radius, plus a small wet burst. The cloud is the
  // identity — still fading when the next bolt lands.
  poison_lingering: (vfx, pos, color) => {
    vfx.mist(pos, color, 2.4, 1.4, 22);
    vfx.burst(pos, 0xb6ff76, 10, 4.0, 0.40, 0.14);
    vfx.flash(pos, color, 0.45, 0.16);
  },

  // Keep the legacy recipe keyed on definitionId.
  poison_bolt: (vfx, pos, color) => {
    vfx.mist(pos, color, 1.9, 0.95, 18);
    vfx.burst(pos, 0xb6ff76, 12, 4.5, 0.45, 0.16);
  },

  default_impact: (vfx, pos, color) => {
    vfx.burst(pos, color, 12, 7, 0.35);
  },
};

// ---------------------------------------------------------------------------
// Explode recipes (projectile_aoe detonation)
// ---------------------------------------------------------------------------
// Each recipe is: (vfx, pos, color, radius) => void

const EXPLODE_RECIPES = {
  fireball: (vfx, pos, _color, radius) => {
    vfx.shock(pos, 0xff7a33, radius, 0.42);
    vfx.flash(pos, 0xffd36a, radius * 0.34, 0.18);
    vfx.burst(pos, 0xff7a33, 30, 13, 0.62, 0.24);
    vfx.burst(pos, 0xffd36a, 14, 9, 0.42, 0.18);
  },

  meteor: (vfx, pos, _color, radius) => {
    vfx.shock(pos, 0xff5530, radius * 1.08, 0.58);
    vfx.flash(pos, 0xffc45a, radius * 0.48, 0.2);
    vfx.burst(pos, 0xff6a2a, 38, 16, 0.72, 0.26);
    vfx.mist(pos, 0x3b3340, radius * 0.42, 1.1, 20);
  },

  default_explode: (vfx, pos, color, radius) => {
    vfx.shock(pos, color, radius, 0.45);
    vfx.burst(pos, color, 26, 12, 0.6, 0.24);
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit trail VFX for a live projectile (called on interval by Projectile.update).
 *
 * @param {object} vfx     - VFX instance (world.vfx)
 * @param {object} spell   - SpellInstance
 * @param {object} lastPos - THREE.Vector3 previous trail position
 * @param {object} pos     - THREE.Vector3 current position
 * @param {number} color   - already colorblind-resolved hex
 */
export function emitTrail(vfx, spell, lastPos, pos, color) {
  const id = spell.trailVfxId ?? (spell.definitionId ?? spell.id);
  const recipe = TRAIL_RECIPES[id] ?? TRAIL_RECIPES.default_trail;
  recipe(vfx, lastPos, pos, color);
}

/**
 * Emit impact VFX for a projectile hit.
 *
 * @param {object} vfx     - VFX instance (world.vfx)
 * @param {object} spell   - SpellInstance
 * @param {object} pos     - THREE.Vector3 hit position
 * @param {number} color   - already colorblind-resolved hex
 * @param {object|null} projectile - the Projectile (may be null for wall hits)
 */
export function emitImpact(vfx, spell, pos, color, projectile = null) {
  const id = spell.impactVfxId ?? (spell.definitionId ?? spell.id);
  const recipe = IMPACT_RECIPES[id] ?? IMPACT_RECIPES.default_impact;
  recipe(vfx, pos, color, { projectile });
}

/**
 * Emit explosion VFX for a projectile_aoe detonation.
 *
 * @param {object} vfx    - VFX instance (world.vfx)
 * @param {object} spell  - SpellInstance
 * @param {object} pos    - THREE.Vector3 detonation position
 * @param {number} color  - already colorblind-resolved hex
 * @param {number} radius - explosion radius
 */
export function emitExplode(vfx, spell, pos, color, radius) {
  const id = spell.definitionId ?? spell.id;
  const recipe = EXPLODE_RECIPES[id] ?? EXPLODE_RECIPES.default_explode;
  recipe(vfx, pos, color, radius);
}
