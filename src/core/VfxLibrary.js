// Data-driven VFX emit recipes for projectile impacts and explosions.
//
// Each entry maps a vfxId → a function that fires vfx calls against the
// world's vfx system.  Callers pass a resolved `color` (already colorblind-
// corrected) and the relevant context.  No spell-id switches live here —
// HitResolver selects the correct recipe by looking up spell.impactVfxId /
// spell.explodeVfxId and falling back to "default_impact" / "default_explode".
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
// Impact recipes (projectile hits wall or enemy)
// ---------------------------------------------------------------------------
// Each recipe is: (vfx, pos, color, ctx) => void
//   vfx    — the VFX instance (world.vfx)
//   pos    — THREE.Vector3 impact position
//   color  — already-resolved hex color
//   ctx    — { projectile } (may be null)

const IMPACT_RECIPES = {
  arcane_bolt: (vfx, pos, color, ctx) => {
    vfx.shock(pos, color, 1.8, 0.24);
    vfx.burst(pos, color, 14, 8, 0.34, 0.16);
    if (ctx?.projectile && ctx.projectile.cadenceStacks >= 3) {
      vfx.burst(pos, 0xf2eaff, 20, 10, 0.5, 0.12);
    }
  },

  frost_bolt: (vfx, pos, _color) => {
    // Frost bolt always uses its canonical ice colors regardless of CB mode —
    // the colorblind correction replaces the overall tint (spell.color) but
    // the secondary shatter palette stays fixed for readability.
    vfx.shock(pos, 0xbdefff, 2.2, 0.34);
    vfx.burst(pos, 0xdff8ff, 18, 7, 0.48, 0.14);
    vfx.flash(pos, _color, 0.55, 0.18);
  },

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
 * Emit impact VFX for a projectile hit.
 *
 * @param {object} vfx     - VFX instance (world.vfx)
 * @param {object} spell   - SpellInstance
 * @param {object} pos     - THREE.Vector3 hit position
 * @param {number} color   - already colorblind-resolved hex
 * @param {object|null} projectile - the Projectile (may be null for wall hits)
 */
export function emitImpact(vfx, spell, pos, color, projectile = null) {
  const id = spell.definitionId ?? spell.id;
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
