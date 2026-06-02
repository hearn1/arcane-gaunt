import * as THREE from "three";

const GOLD = 0xffc34a;
// Max opacities — keep the shield readable without filling the screen
const RIM_MAX_OPACITY   = 0.82;
const FACE_MAX_OPACITY  = 0.18;
const GLOW_MAX_OPACITY  = 0.14;

export class ShieldView {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    // Shared material options for all shield parts
    const baseOpts = {
      color: GOLD,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    };

    // --- Rim: torus ring that reads unmistakably as a circular shield edge ---
    const rimGeo = new THREE.TorusGeometry(0.32, 0.022, 8, 56);
    this._rimMat = new THREE.MeshBasicMaterial({ ...baseOpts });
    this.rim = new THREE.Mesh(rimGeo, this._rimMat);
    // Left-arm hold: slightly left of centre, low in view, angled toward player
    this.rim.position.set(-0.2, -0.22, -0.52);
    this.rim.rotation.x = 0.22;   // tilt top away from viewer
    this.rim.rotation.y = -0.08;  // turn slightly right so left edge is visible
    this.rim.renderOrder = 998;
    this.group.add(this.rim);

    // --- Face: very transparent disc inside the rim ---
    const faceGeo = new THREE.CircleGeometry(0.31, 48);
    this._faceMat = new THREE.MeshBasicMaterial({ ...baseOpts, side: THREE.DoubleSide });
    this.face = new THREE.Mesh(faceGeo, this._faceMat);
    this.face.position.copy(this.rim.position);
    this.face.rotation.copy(this.rim.rotation);
    this.face.renderOrder = 997;
    this.group.add(this.face);

    // --- Outer glow halo (larger ring, fades outward) ---
    const glowGeo = new THREE.TorusGeometry(0.38, 0.055, 8, 56);
    this._glowMat = new THREE.MeshBasicMaterial({ ...baseOpts });
    this.glow = new THREE.Mesh(glowGeo, this._glowMat);
    this.glow.position.copy(this.rim.position);
    this.glow.rotation.copy(this.rim.rotation);
    this.glow.renderOrder = 996;
    this.group.add(this.glow);

    this._alpha = 0;
    this._pulseTimer = 0;
    this._blockPulse = 0;
    // legacy alias used by external code that references mesh2
    this.mesh2 = this.face;
    this.mesh  = this.face;
  }

  attach(camera) {
    camera.add(this.group);
  }

  update(dt, block) {
    const target = block.blocking ? 1 : 0;
    this._alpha += (target - this._alpha) * Math.min(1, dt * 12);
    this._pulseTimer  = Math.max(0, this._pulseTimer  - dt);
    this._blockPulse  = Math.max(0, this._blockPulse  - dt);

    const visible = this._alpha > 0.01;
    this.group.visible = visible;
    if (!visible) {
      this._rimMat.opacity  = 0;
      this._faceMat.opacity = 0;
      this._glowMat.opacity = 0;
      return;
    }

    let pulse = 0;
    if (this._pulseTimer > 0) pulse = Math.sin(this._pulseTimer * 28) * 0.28;
    if (this._blockPulse > 0) pulse = Math.max(pulse, Math.sin(this._blockPulse * 18) * 0.14);

    const a = this._alpha;
    this._rimMat.opacity  = Math.min(RIM_MAX_OPACITY,  a * RIM_MAX_OPACITY  + pulse * 0.35);
    this._faceMat.opacity = Math.min(FACE_MAX_OPACITY, a * FACE_MAX_OPACITY + pulse * 0.08);
    this._glowMat.opacity = Math.min(GLOW_MAX_OPACITY, a * GLOW_MAX_OPACITY + pulse * 0.18);

    // Subtle scale breathe on the whole group
    const s = 1 + pulse * 0.06;
    this.group.scale.setScalar(s);
  }

  notePerfect() { this._pulseTimer = 0.42; }
  noteBlock()   { this._blockPulse = 0.28; }
}
