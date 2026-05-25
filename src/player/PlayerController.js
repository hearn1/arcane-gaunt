import * as THREE from "three";
import { Health } from "../core/Health.js";
import { resolveCircleAgainstObstacles } from "../core/ArenaCollision.js";

const EYE = 1.7;
const SPEED = 9.5;
const ACCEL = 60;
const GRAVITY = 26;
const JUMP_V = 9;
const BASE_LOOK_SENS = 0.0022;
const STICK_DEADZONE = 0.18;

// First-person movement + mouse look. Owns the camera and a Health. Knows
// nothing about spells/projectiles/damage rules.
export class PlayerController {
  constructor(camera, arenaBounds) {
    this.camera = camera;
    this.bounds = arenaBounds;
    this.yaw = 0;
    this.pitch = 0;
    this.feet = new THREE.Vector3(0, 0, 8);
    this.velY = 0;
    this.grounded = true;
    this.radius = 0.8;
    this.vel = new THREE.Vector3();
    this.lookSens = BASE_LOOK_SENS;
    this.stickLookSensitivity = 1;
    this.invertY = false;

    this.health = new Health(100, "player");
    this._syncCamera();
  }

  setMouseSensitivity(multiplier = 1) {
    const safe = THREE.MathUtils.clamp(Number(multiplier) || 1, 0.3, 2);
    this.lookSens = BASE_LOOK_SENS * safe;
  }

  reset() {
    this.feet.set(0, 0, 8);
    this.yaw = 0; this.pitch = 0;
    this.velY = 0; this.vel.set(0, 0, 0);
    this.health.max = 100;
    this.health.current = 100;
    this.health.isDead = false;
    this._syncCamera();
  }

  get position() {
    return new THREE.Vector3(this.feet.x, this.feet.y + EYE, this.feet.z);
  }

  forward() {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return d.normalize();
  }

  _syncCamera() {
    this.camera.position.set(this.feet.x, this.feet.y + EYE, this.feet.z);
    this.camera.rotation.set(0, 0, 0, "YXZ");
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }

  update(dt, input) {
    if (this.health.isDead) return;

    const m = input.consumeMouse();
    const s = input.consumeStickLook(dt);
    const stickSens = this.lookSens * this.stickLookSensitivity;
    const yawDelta = m.x * this.lookSens + s.x * stickSens;
    let pitchDelta = m.y * this.lookSens + s.y * stickSens;
    if (this.invertY) pitchDelta = -pitchDelta;
    this.yaw -= yawDelta;
    this.pitch -= pitchDelta;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);

    // Horizontal move relative to yaw.
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (input.down("KeyW")) wish.add(fwd);
    if (input.down("KeyS")) wish.sub(fwd);
    if (input.down("KeyD")) wish.add(right);
    if (input.down("KeyA")) wish.sub(right);
    // Left-stick movement when keys are not pressed (keys win when both active)
    if (wish.lengthSq() === 0) {
      const sx = input.leftStickX;
      const sy = input.leftStickY;
      if (Math.abs(sx) > STICK_DEADZONE || Math.abs(sy) > STICK_DEADZONE) {
        wish.add(right.clone().multiplyScalar(sx));
        wish.add(fwd.clone().multiplyScalar(-sy));
      }
    }
    let moveMul = this.block && this.block.blocking ? 0.55 : 1;
    // Brief speed pulse right after a perfect block (rides the existing 0.42s VFX timer).
    if (this.block && this.block.perfectPulse > 0) moveMul *= 1.2;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(SPEED * moveMul);

    this.vel.x = THREE.MathUtils.damp(this.vel.x, wish.x, ACCEL / SPEED, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, wish.z, ACCEL / SPEED, dt);

    this.feet.x += this.vel.x * dt;
    this._resolveArena();
    this.feet.z += this.vel.z * dt;
    this._resolveArena();

    // Jump + gravity.
    if (input.down("Space") && this.grounded) {
      this.velY = JUMP_V; this.grounded = false;
    }
    this.velY -= GRAVITY * dt;
    this.feet.y += this.velY * dt;
    if (this.feet.y <= 0) { this.feet.y = 0; this.velY = 0; this.grounded = true; }

    // Arena collision (stay inside walls).
    const lim = this.bounds.half - this.radius;
    this.feet.x = THREE.MathUtils.clamp(this.feet.x, -lim, lim);
    this.feet.z = THREE.MathUtils.clamp(this.feet.z, -lim, lim);
    this._resolveArena();

    this._syncCamera();
  }

  _resolveArena() {
    resolveCircleAgainstObstacles(this.feet, this.radius, this.bounds.obstacles || []);
  }
}
