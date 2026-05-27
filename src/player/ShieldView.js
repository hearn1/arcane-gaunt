import * as THREE from "three";

const GOLD = 0xffc34a;

export class ShieldView {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    const geo = new THREE.SphereGeometry(0.85, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(0, -0.3, -0.55);
    this.mesh.scale.set(1, 0.4, 1);
    this.group.add(this.mesh);

    const glowMat = mat.clone();
    glowMat.opacity = 0.0;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      glowMat
    );
    glow.position.set(0, -0.35, -0.55);
    glow.scale.set(1, 0.3, 1);
    this.group.add(glow);
    this.glow = glow;

    this.mesh2 = this.mesh;
    this._alpha = 0;
    this._pulseTimer = 0;
    this._blockPulse = 0;
  }

  attach(camera) {
    camera.add(this.group);
  }

  update(dt, block) {
    const target = block.blocking ? 1 : 0;
    this._alpha += (target - this._alpha) * Math.min(1, dt * 12);
    this._pulseTimer = Math.max(0, this._pulseTimer - dt);
    this._blockPulse = Math.max(0, this._blockPulse - dt);

    const visible = this._alpha > 0.01;
    this.group.visible = visible;

    if (!visible) {
      this.mesh.material.opacity = 0;
      this.glow.material.opacity = 0;
      return;
    }

    let pulse = 0;
    if (this._pulseTimer > 0) pulse = Math.sin(this._pulseTimer * 28) * 0.25;
    if (this._blockPulse > 0) pulse = Math.max(pulse, Math.sin(this._blockPulse * 18) * 0.12);

    this.mesh.material.opacity = Math.min(1, this._alpha + pulse);
    this.glow.material.opacity = Math.min(0.32, this._alpha * 0.3 + pulse * 0.5);
    this.mesh.scale.setScalar(1 + pulse * 0.08);
  }

  notePerfect() {
    this._pulseTimer = 0.42;
  }

  noteBlock() {
    this._blockPulse = 0.28;
  }
}
