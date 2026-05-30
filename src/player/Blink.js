import * as THREE from "three";

// Short-range dash. Collision-safe: clamps the destination inside the arena and
// stops short of walls so the player can never blink out of bounds.
export class Blink {
  constructor(player, world) {
    this.player = player;
    this.world = world;
    this.baseCooldown = 4.0;
    this.cooldown = this.baseCooldown;
    this.distance = 9;
    this.timer = 0;
  }

  reset() { this.timer = 0; }
  get ready() { return this.timer <= 0; }
  get ratio() { return 1 - Math.min(1, this.timer / this.cooldown); }

  update(dt) { if (this.timer > 0) this.timer -= dt; }

  trigger() {
    if (!this.ready || this.player.health.isDead) return;

    // Blink along horizontal look direction (or current motion if mostly idle).
    const f = this.player.forward();
    let dir = new THREE.Vector3(f.x, 0, f.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();

    const feet = this.player.feet;
    const lim = this.world.arenaBounds.half - this.player.radius - 0.2;
    let dest = new THREE.Vector3(
      feet.x + dir.x * this.distance,
      feet.y,
      feet.z + dir.z * this.distance
    );
    dest.x = THREE.MathUtils.clamp(dest.x, -lim, lim);
    dest.z = THREE.MathUtils.clamp(dest.z, -lim, lim);
    if (this.world.findSafeBlinkDestination) {
      dest = this.world.findSafeBlinkDestination(feet, dest, this.player.radius);
      dest.x = THREE.MathUtils.clamp(dest.x, -lim, lim);
      dest.z = THREE.MathUtils.clamp(dest.z, -lim, lim);
    }

    this.world.vfx.flash(this.player.position, 0x9fd8ff, 0.7, 0.22);
    feet.x = dest.x;
    feet.z = dest.z;
    // Snap Y to the walkable surface at the blink destination so the player
    // never lands floating above a ramp or sunk below a platform top.
    if (this.world.getElevationAt) {
      feet.y = this.world.getElevationAt(dest.x, dest.z);
    }
    this.world.vfx.flash(this.player.position, 0x9fd8ff, 0.7, 0.22);
    this.world.audio.blink();
    if (this.world.combat) this.world.combat.blinkStrikeTimer = 1.35;
    this.timer = this.cooldown;
  }
}
