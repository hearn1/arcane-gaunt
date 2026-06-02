import * as THREE from "three";

const DEFAULT_GEM_COLOR = 0x9a6cff;
const STAFF_WOOD = 0x9b6b3a;
const BASE_TILT_Z = 0.35; // positive = top leans left = bottom-right to upper-left diagonal

function _particleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

export class StaffView {
  constructor() {
    this.group = new THREE.Group();
    // Bottom of shaft anchors below/right of screen; gem sits at centre-right
    // z=-0.72 puts geometry far enough back that it reads as a held staff, not a wall
    this.group.position.set(0.62, -0.75, -0.9);
    this.group.rotation.z = BASE_TILT_Z;

    const shaftGeo = new THREE.CylinderGeometry(0.04, 0.058, 0.65, 10);
    const shaftMat = new THREE.MeshBasicMaterial({
      color: STAFF_WOOD,
      depthTest: false,
      depthWrite: false,
    });
    this.shaft = new THREE.Mesh(shaftGeo, shaftMat);
    this.shaft.position.y = 0.325;
    this.shaft.renderOrder = 999;
    this.group.add(this.shaft);

    const gemGeo = new THREE.SphereGeometry(0.075, 14, 14);
    this._gemMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_GEM_COLOR,
      depthTest: false,
      depthWrite: false,
    });
    this.gem = new THREE.Mesh(gemGeo, this._gemMat);
    this.gem.position.y = 0.70;
    this.gem.renderOrder = 999;
    this.group.add(this.gem);

    this._tipHelper = new THREE.Object3D();
    this._tipHelper.position.y = 0.78;
    this.group.add(this._tipHelper);

    this._time = 0;
    this._recoilTimer = 0;
    this._flashTimer = 0;
    this._flashColor = DEFAULT_GEM_COLOR;
    this._targetY = -0.75;
    this._targetZ = -0.9;
    this._bobPhase = 0;

    this._particleTex = _particleTexture();
    this._particles = [];
  }

  attach(camera) {
    camera.add(this.group);
  }

  update(dt, input, block) {
    this._time += dt;

    const moving = !!(input.down("KeyW") || input.down("KeyA") ||
      input.down("KeyS") || input.down("KeyD") ||
      Math.abs(input.leftStickX) > 0.18 ||
      Math.abs(input.leftStickY) > 0.18);

    if (moving) {
      this._bobPhase += dt * 10;
    } else {
      this._bobPhase = 0;
    }

    const bobY = moving ? Math.sin(this._bobPhase) * 0.015 : 0;
    const bobRot = moving ? Math.sin(this._bobPhase * 0.5) * 0.02 : 0;

    const blocking = !!(block && block.blocking);
    const targetY = blocking ? -0.85 : -0.75;
    const targetZ = blocking ? -0.78 : -0.9;

    this._targetY += (targetY - this._targetY) * Math.min(1, dt * 12);
    this._targetZ += (targetZ - this._targetZ) * Math.min(1, dt * 12);

    if (this._recoilTimer > 0) {
      this._recoilTimer -= dt;
      const progress = this._recoilTimer / 0.18;
      this.group.position.z = this._targetZ + Math.sin(progress * Math.PI) * 0.08;
    } else {
      this.group.position.z = this._targetZ;
    }

    this.group.position.y = this._targetY + bobY;
    this.group.rotation.x = bobRot + Math.sin(this._time * 1.2) * 0.015;
    this.group.rotation.z = BASE_TILT_Z + Math.sin(this._time * 0.7) * 0.01;

    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      const t = Math.max(0, this._flashTimer / 0.15);
      const r = ((this._flashColor >> 16) & 0xff) * t + ((DEFAULT_GEM_COLOR >> 16) & 0xff) * (1 - t);
      const g = ((this._flashColor >> 8) & 0xff) * t + ((DEFAULT_GEM_COLOR >> 8) & 0xff) * (1 - t);
      const b = (this._flashColor & 0xff) * t + (DEFAULT_GEM_COLOR & 0xff) * (1 - t);
      this._gemMat.color.setRGB(r / 255, g / 255, b / 255);
    } else {
      this._gemMat.color.setHex(DEFAULT_GEM_COLOR);
    }

    this._updateParticles(dt);
  }

  playCast(spellColor) {
    this._recoilTimer = 0.18;
    this._flashTimer = 0.15;
    this._flashColor = spellColor;
    this._spawnParticles(spellColor);
  }

  tipWorldPos() {
    this._tipHelper.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    this._tipHelper.getWorldPosition(pos);
    return pos;
  }

  _spawnParticles(color) {
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this._particleTex,
        color,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      // Scale to ~0.04 world units — default sprite scale of 1 is enormous at z=-0.9
      sprite.scale.setScalar(0.045);
      sprite.position.set(0, 0.70, 0); // gem tip
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        Math.random() * 0.6 + 0.2,
        (Math.random() - 0.5) * 0.8,
      );
      const life = 0.25 + Math.random() * 0.15;
      this.group.add(sprite);
      this._particles.push({ sprite, vel, life, maxLife: life, mat });
    }
  }

  _updateParticles(dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        p.mat.dispose();
        this._particles.splice(i, 1);
        continue;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.mat.opacity = Math.max(0, p.life / p.maxLife);
    }
  }

  dispose() {
    for (const p of this._particles) {
      this.group.remove(p.sprite);
      p.mat.dispose();
    }
    this._particles.length = 0;
    this.shaft.geometry.dispose();
    this.shaft.material.dispose();
    this.gem.geometry.dispose();
    this._gemMat.dispose();
    this._particleTex.dispose();
    this.group.removeFromParent();
  }
}
