/**
 * Atmosphere.js — issue #97
 *
 * 97a (static, set once per arena build):
 *   - Star Points in the upper skybox hemisphere, twinkling via bucketed sin()
 *   - Fog hue tint per layout (colour shifted on the existing FogExp2)
 *   - Layout-specific hemisphere rim light (very faint, cosmetic only)
 *
 * 97b (per-frame, buffer-reuse):
 *   - Slow-drifting edge-spawned ambient motes — dedicated emitter, NOT impact mist.
 *   - Counts driven by vfx.density + reducedMotion; frozen drift under reducedMotion.
 *   - No per-frame allocation in the hot loop (all buffers pre-allocated).
 *
 * Design contracts:
 *   - Static 97a renders even when motes are disabled.
 *   - Motes scale down to MOTE_MIN_COUNT under "reduced" density (never 0 while
 *     the emitter is active).  Under reducedMotion OR density="reduced" motes are
 *     fully disabled (emitter hidden).
 *   - No per-frame allocation; positions mutated in-place on the pre-built Float32Array.
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Atmosphere presets — one per layout name.
// fog:  hex colour for scene.fog.  Keep it a very dark tint so combat VFX
//       remain readable; only the hue shifts, not the value.
// rim:  hex colour for the faint hemisphere rim light (sky = rim, ground = 0x000000).
// rimI: rim light intensity (very low — purely mood lighting).
// mote: hex colour for the drifting ambient motes.
// pit:  true → add a faint upward purple point light under each pit (rift/sinkhole).
// ---------------------------------------------------------------------------
const PRESETS = {
  lanes:       { fog: 0x060c18, rim: 0x1a3080, rimI: 0.18, mote: 0x2244aa },
  cross:       { fog: 0x080810, rim: 0x201840, rimI: 0.14, mote: 0x443366 },
  cover:       { fog: 0x0a0a14, rim: 0x282040, rimI: 0.12, mote: 0x484060 },
  gates:       { fog: 0x0d0808, rim: 0x402018, rimI: 0.14, mote: 0x663322 },
  rift:        { fog: 0x0a0514, rim: 0x4a1a88, rimI: 0.22, mote: 0x7033cc, pit: true },
  elevated:    { fog: 0x060c10, rim: 0x163050, rimI: 0.16, mote: 0x224466 },
  ramparts:    { fog: 0x080c08, rim: 0x183018, rimI: 0.14, mote: 0x335533 },
  tower_court: { fog: 0x0a0a10, rim: 0x242040, rimI: 0.14, mote: 0x404060 },
  sinkhole:    { fog: 0x080510, rim: 0x3a1460, rimI: 0.18, mote: 0x5a2299, pit: true },
  towers:      { fog: 0x060a10, rim: 0x182840, rimI: 0.16, mote: 0x2a3a66 },
};
const DEFAULT_PRESET = { fog: 0x0a0a14, rim: 0x242040, rimI: 0.12, mote: 0x404060, pit: false };

// Mote emitter constants.
const MOTE_MAX_COUNT = 60;   // full density
const MOTE_MIN_COUNT = 20;   // floor under reduced density
const MOTE_SIZE      = 0.09;
const MOTE_LIFE_MIN  = 6.0;  // seconds — long-lived, few replacements per frame
const MOTE_LIFE_MAX  = 12.0;
const MOTE_DRIFT_XZ  = 0.3;  // world-units/s lateral drift
const MOTE_DRIFT_Y   = 0.18; // world-units/s upward drift
const MOTE_EDGE_BAND = 6;    // spawn within EDGE_BAND units of the half-extent

// Star constants.
const STAR_COUNT     = 250;
const STAR_OPACITY_MIN = 0.35;
const STAR_OPACITY_MAX = 0.90;
// Three opacity buckets (avoid per-vertex CPU work per frame).
const STAR_BUCKET_COUNT = 3;

export class Atmosphere {
  /**
   * @param {THREE.Scene}  scene
   * @param {THREE.Object3D} skyboxMesh  - the sky sphere so stars follow it
   * @param {THREE.FogExp2} fog          - scene.fog (mutated in place)
   * @param {{ density: number, _reducedMotion: boolean }} vfx - VFX ref for settings
   * @param {{ half: number, hazards: Array }} arenaBounds
   */
  constructor(scene, skyboxMesh, fog, vfx, arenaBounds) {
    this._scene       = scene;
    this._skyboxMesh  = skyboxMesh;
    this._fog         = fog;
    this._vfx         = vfx;
    this._bounds      = arenaBounds;

    // Runtime state.
    this._rimLight    = null;  // THREE.HemisphereLight (per layout)
    this._pitLights   = [];    // THREE.PointLight[] under pits
    this._starPts     = null;  // THREE.Points added to skybox mesh
    this._starMats    = [];    // one PointsMaterial per bucket
    this._starOffsets = [];    // Float32 phase offsets per star for twinkle
    this._starBuckets = [];    // which bucket each star belongs to
    this._motePts     = null;  // THREE.Points persistent mote cloud
    this._moteGeo     = null;  // THREE.BufferGeometry (pre-allocated)
    this._moteMat     = null;  // THREE.PointsMaterial
    this._moteData    = [];    // { x, y, z, vx, vz, vy, life, maxLife }[]
    this._moteCount   = 0;     // active mote count this layout
    this._moteEnabled = false;
    this._time        = 0;

    this._buildStars();
    // Mote geometry allocated to MOTE_MAX_COUNT (reused across all layouts).
    this._buildMoteGeometry();
  }

  // -------------------------------------------------------------------------
  // 97a — Static setup (call once per arena (re)build)
  // -------------------------------------------------------------------------

  /**
   * Apply atmosphere for a given layout.
   * Tears down previous rim light / pit lights, sets fog colour, adds new lights.
   * Must be called after _buildArenaLayout so arenaBounds.hazards is populated.
   *
   * @param {string} layoutName  - e.g. "rift", "lanes", …
   */
  applyLayout(layoutName) {
    const p = PRESETS[layoutName] || DEFAULT_PRESET;

    // --- Fog hue ---
    if (this._fog) {
      this._fog.color.setHex(p.fog);
    }

    // --- Remove previous rim / pit lights ---
    if (this._rimLight) {
      this._scene.remove(this._rimLight);
      this._rimLight.dispose?.();
      this._rimLight = null;
    }
    for (const pl of this._pitLights) {
      this._scene.remove(pl);
      pl.dispose?.();
    }
    this._pitLights = [];

    // --- Rim hemisphere light ---
    const rim = new THREE.HemisphereLight(p.rim, 0x000000, p.rimI);
    this._scene.add(rim);
    this._rimLight = rim;

    // --- Pit glow lights (rift / sinkhole) ---
    if (p.pit && this._bounds.hazards) {
      const pits = this._bounds.hazards.filter((h) => h.isPit);
      for (const pit of pits) {
        // Faint upward purple point light just below the pit rim.
        const pl = new THREE.PointLight(0x7a30c8, 0.9, 14, 2);
        pl.position.set(pit.x, -0.8, pit.z);
        this._scene.add(pl);
        this._pitLights.push(pl);
      }
    }

    // --- Mote emitter ---
    this._configureMotes(p);
  }

  // -------------------------------------------------------------------------
  // Stars (97a — static mesh, per-frame twinkle via bucket materials)
  // -------------------------------------------------------------------------

  _buildStars() {
    // One PointsMaterial per bucket so we update opacity once per bucket,
    // not per star — avoids per-vertex CPU work.
    const positions = new Float32Array(STAR_COUNT * 3);
    const R = 320; // slightly inside the skybox sphere (r=350)

    for (let i = 0; i < STAR_COUNT; i++) {
      // Random point in upper hemisphere (y > 0).
      const theta = Math.acos(1 - Math.random()); // 0 .. PI/2 (upper hemi)
      const phi   = Math.random() * Math.PI * 2;
      const y     = R * Math.cos(theta);
      const r     = R * Math.sin(theta);
      positions[i * 3]     = r * Math.cos(phi);
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = r * Math.sin(phi);

      // Random phase offset so stars twinkle asynchronously.
      this._starOffsets.push(Math.random() * Math.PI * 2);
      // Assign to a bucket (round-robin).
      this._starBuckets.push(i % STAR_BUCKET_COUNT);
    }

    // Build one Points object per bucket.
    const bucketGroups = new THREE.Group();
    for (let b = 0; b < STAR_BUCKET_COUNT; b++) {
      const indices  = this._starBuckets.reduce((acc, bkt, idx) => { if (bkt === b) acc.push(idx); return acc; }, []);
      const bPos     = new Float32Array(indices.length * 3);
      for (let j = 0; j < indices.length; j++) {
        const i = indices[j];
        bPos[j * 3]     = positions[i * 3];
        bPos[j * 3 + 1] = positions[i * 3 + 1];
        bPos[j * 3 + 2] = positions[i * 3 + 2];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.8 + Math.random() * 1.4,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        sizeAttenuation: false,
      });
      this._starMats.push({ mat, phaseOffset: (b / STAR_BUCKET_COUNT) * Math.PI * 2 });
      bucketGroups.add(new THREE.Points(geo, mat));
    }

    this._starPts = bucketGroups;
    // Stars parented to skybox mesh so they move with it (always in the background).
    this._skyboxMesh.add(bucketGroups);
  }

  // -------------------------------------------------------------------------
  // Motes (97b — per-frame drift, buffer reuse)
  // -------------------------------------------------------------------------

  _buildMoteGeometry() {
    // Pre-allocate for MOTE_MAX_COUNT — reused across all layouts.
    const positions = new Float32Array(MOTE_MAX_COUNT * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // Only draw the active slice.
    geo.setDrawRange(0, 0);

    const mat = new THREE.PointsMaterial({
      color: 0x404060,
      size: MOTE_SIZE,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this._scene.add(pts);

    this._moteGeo = geo;
    this._moteMat = mat;
    this._motePts = pts;
  }

  _configureMotes(preset) {
    const reduced  = this._vfx?.density < 1;   // density=0.55 → "reduced"
    const noMotion = this._vfx?._reducedMotion;

    // Disable motes entirely under reduced density or reduced motion.
    if (reduced || noMotion) {
      this._moteEnabled = false;
      this._moteCount   = 0;
      if (this._moteMat) this._moteMat.opacity = 0;
      if (this._moteGeo) this._moteGeo.setDrawRange(0, 0);
      return;
    }

    this._moteEnabled = true;
    this._moteCount   = MOTE_MAX_COUNT;
    if (this._moteMat) {
      this._moteMat.color.setHex(preset.mote);
      this._moteMat.opacity = 0.45;
    }

    // Re-initialise mote data — scatter near arena edges at random heights.
    const half   = this._bounds.half || 40;
    this._moteData = [];
    for (let i = 0; i < MOTE_MAX_COUNT; i++) {
      this._moteData.push(this._randomMote(half));
    }
    this._writeMotePositions();
    this._moteGeo.setDrawRange(0, MOTE_MAX_COUNT);
  }

  _randomMote(half) {
    // Spawn near an edge — not in the center play area.
    const edgeMin = half - MOTE_EDGE_BAND;
    // Pick a random edge side: 0=+x, 1=-x, 2=+z, 3=-z
    const side = Math.floor(Math.random() * 4);
    let x, z;
    if (side === 0) { x =  edgeMin + Math.random() * MOTE_EDGE_BAND; z = (Math.random() - 0.5) * half * 2; }
    else if (side === 1) { x = -(edgeMin + Math.random() * MOTE_EDGE_BAND); z = (Math.random() - 0.5) * half * 2; }
    else if (side === 2) { z =  edgeMin + Math.random() * MOTE_EDGE_BAND; x = (Math.random() - 0.5) * half * 2; }
    else                 { z = -(edgeMin + Math.random() * MOTE_EDGE_BAND); x = (Math.random() - 0.5) * half * 2; }

    const life    = MOTE_LIFE_MIN + Math.random() * (MOTE_LIFE_MAX - MOTE_LIFE_MIN);
    const maxLife = life;
    // Randomise starting age so motes don't all appear/vanish at once.
    const age     = Math.random() * maxLife;

    return {
      x, z,
      y: 0.5 + Math.random() * 8.0,     // 0.5 – 8.5 m height
      vx: (Math.random() - 0.5) * MOTE_DRIFT_XZ,
      vz: (Math.random() - 0.5) * MOTE_DRIFT_XZ,
      vy: MOTE_DRIFT_Y * (0.5 + Math.random() * 0.5),
      life: maxLife - age,               // start at random point in its lifetime
      maxLife,
    };
  }

  _writeMotePositions() {
    const arr = this._moteGeo.attributes.position.array;
    for (let i = 0; i < this._moteCount; i++) {
      const m = this._moteData[i];
      arr[i * 3]     = m.x;
      arr[i * 3 + 1] = m.y;
      arr[i * 3 + 2] = m.z;
    }
    this._moteGeo.attributes.position.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Per-frame update (called from Game._frame())
  // -------------------------------------------------------------------------

  update(dt) {
    this._time += dt;

    // --- Star twinkle (bucket opacity, O(STAR_BUCKET_COUNT) not O(STAR_COUNT)) ---
    // Under reducedMotion: freeze opacity at mid-range (stars static but visible).
    const noMotion = this._vfx?._reducedMotion;
    for (let b = 0; b < this._starMats.length; b++) {
      const { mat, phaseOffset } = this._starMats[b];
      if (noMotion) {
        mat.opacity = (STAR_OPACITY_MIN + STAR_OPACITY_MAX) * 0.5;
      } else {
        const s = Math.sin(this._time * 0.9 + phaseOffset);
        mat.opacity = STAR_OPACITY_MIN + (s * 0.5 + 0.5) * (STAR_OPACITY_MAX - STAR_OPACITY_MIN);
      }
    }

    // --- Mote drift ---
    if (!this._moteEnabled || this._moteCount === 0) return;

    const half = this._bounds.half || 40;
    let dirty = false;
    for (let i = 0; i < this._moteCount; i++) {
      const m = this._moteData[i];
      m.life -= dt;
      if (m.life <= 0) {
        // Respawn at a new edge position — no allocation (mutate existing object).
        const next = this._randomMote(half);
        m.x = next.x; m.z = next.z; m.y = next.y;
        m.vx = next.vx; m.vz = next.vz; m.vy = next.vy;
        m.life = next.maxLife;
        m.maxLife = next.maxLife;
      } else {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.z += m.vz * dt;
        // Clamp Y so motes don't drift above the skybox.
        if (m.y > 12) { m.y = 12; m.vy = -Math.abs(m.vy); }
        if (m.y < 0.3) { m.y = 0.3; m.vy = Math.abs(m.vy); }
      }
      dirty = true;
    }
    if (dirty) this._writeMotePositions();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Called when the arena tears down or the game exits.
   * Removes stars from the skybox group and motes from the scene.
   */
  dispose() {
    // Stars
    if (this._starPts && this._skyboxMesh) {
      this._skyboxMesh.remove(this._starPts);
    }
    if (this._starPts) {
      this._starPts.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      this._starPts = null;
    }
    this._starMats = [];

    // Rim lights
    if (this._rimLight) {
      this._scene.remove(this._rimLight);
      this._rimLight.dispose?.();
      this._rimLight = null;
    }
    for (const pl of this._pitLights) {
      this._scene.remove(pl);
      pl.dispose?.();
    }
    this._pitLights = [];

    // Motes
    if (this._motePts) {
      this._scene.remove(this._motePts);
      this._moteGeo?.dispose?.();
      this._moteMat?.dispose?.();
      this._motePts = null;
    }
  }

  /**
   * Re-read density / reducedMotion from vfx after settings change.
   * Call from Game.applySettings().
   *
   * @param {string} layoutName - current layout (to re-apply preset mote colour)
   */
  applySettings(layoutName) {
    const p = PRESETS[layoutName] || DEFAULT_PRESET;
    this._configureMotes(p);
  }
}
