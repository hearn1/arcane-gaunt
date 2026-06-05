import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RunStats } from "./RunStats.js";
import { Currency } from "./Currency.js";
import { AudioSys } from "./Audio.js";
import { VFX } from "./VFX.js";
import { Input } from "./Input.js";
import { DEFAULT_SETTINGS, getStorageMeta, sanitizeSettings, saveSettings } from "./Settings.js";
import { applyPreset } from "./perfPresets.js";
import {
  cloneDefaultProfile,
  createRunRecord,
  recordRunCompleted,
  recordRunProgress,
  recordRunStarted,
  resetProfile,
  sanitizeProfile,
  saveProfile,
} from "./Profile.js";
import { applyDamage, setRunStats, setEventBus } from "./Damage.js";
import { EventBus } from "./EventBus.js";
import {
  findSafeDestination,
  getElevationAt,
  isCircleClear,
  pointInRect,
  rectContainsPoint,
  resolveCircleAgainstObstacles,
  segmentHitsObstacles,
} from "./ArenaCollision.js";
import { PlayerController } from "../player/PlayerController.js";
import { SpellCaster } from "../player/SpellCaster.js";
import { Blink } from "../player/Blink.js";
import { Block } from "../player/Block.js";
import { ShieldView } from "../player/ShieldView.js";
import { StaffView } from "../player/StaffView.js";
import { HitResolver } from "../projectile/HitResolver.js";
import { preloadEnemyModels } from "../enemies/Enemy.js";
import { EnemyManager } from "../enemies/EnemyManager.js";
import { EnemyVfxHandler } from "../enemies/EnemyVfxHandler.js";
import { LevelManager } from "../level/LevelManager.js";
import { ObjectiveManager } from "../level/ObjectiveManager.js";
import { LayoutEventManager } from "../level/LayoutEventManager.js";
import { RewardGenerator } from "../rewards/RewardGenerator.js";
import { UpgradeManager } from "../spells/UpgradeManager.js";
import { SPELL_DEFINITIONS, STARTER_SPELL_ID } from "../spells/spellDefinitions.js";
import { DIFFICULTY_TIERS, getDifficultyTier } from "./Difficulty.js";
import { castSpell } from "../spells/Effects.js";
import { t, format } from "./i18n.js";
import { UI } from "../ui/ui.js";
import { Captions } from "../ui/Captions.js";
import { Onboarding } from "../ui/Onboarding.js";
import { reportFatal } from "./ErrorReporting.js";
import { init as telemetryInit, setEnabled as telemetrySetEnabled, track as telemetryTrack } from "./Telemetry.js";
import { ScreenEffects } from "./ScreenEffects.js";
import { WorldProjector } from "../ui/WorldProjector.js";
import { StatusIconLayer } from "../ui/StatusIconLayer.js";
import { DamageNumberLayer } from "../ui/DamageNumberLayer.js";

const STATE = {
  MENU: "menu", FOCUS: "focus", PLAYING: "playing",
  REWARD: "reward", GAMEOVER: "gameover", SUMMARY: "summary",
};

function deepMergeSettings(current, next) {
  return sanitizeSettings({
    ...current,
    ...next,
    audio: { ...current.audio, ...next.audio },
    controls: { ...current.controls, ...next.controls },
    display: { ...current.display, ...next.display },
    performance: { ...current.performance, ...next.performance },
    privacy: { ...current.privacy, ...next.privacy },
  });
}

export class Game {
  constructor(initialSettings = DEFAULT_SETTINGS, initialProfile = cloneDefaultProfile()) {
    this.state = STATE.MENU;
    this.arenaBounds = { half: 40, h: 14, obstacles: [], hazards: [], walkableSurfaces: [] };
    this.selectedSpellId = STARTER_SPELL_ID;
    this.difficultyLevel = 1;
    this.settings = sanitizeSettings(initialSettings);
    this.profile = sanitizeProfile(initialProfile);
    this.storageMeta = null;
    this._runProfileFinalized = true;

    // Renderer / scene / camera.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = this.settings.display?.shadows !== false;
    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.setSize(innerWidth, innerHeight);
    document.getElementById("app").appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this._buildSkybox();
    this.scene.fog = new THREE.FogExp2(0x0a0a14, 0.005);

    this.camera = new THREE.PerspectiveCamera(this.settings.display.fov, innerWidth / innerHeight, 0.1, 400);
    this.scene.add(this.camera);

    this.shieldView = new ShieldView();
    this.shieldView.attach(this.camera);

    this.staffView = new StaffView();
    this.staffView.attach(this.camera);
    this.staffView.group.visible = false;

    this._buildArena();

    this._composer = new EffectComposer(this.renderer);
    this._composer.addPass(new RenderPass(this.scene, this.camera));
    this._bloomPass = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      0.6, 0.4, 0.85,
    );
    this._bloomPass.enabled = this.settings.display?.bloom !== false;
    this._composer.addPass(this._bloomPass);

    // Systems.
    this.runStats = new RunStats();
    setRunStats(this.runStats);
    this.events = new EventBus();
    setEventBus(this.events);
    this.currency = new Currency(this.runStats);
    this.audio = new AudioSys(this.settings.audio);
    this.vfx = new VFX(this.scene);
    this.vfx.setDensity(this.settings.performance.vfxDensity);
    this.input = new Input(this.renderer.domElement, this.settings);
    this.player = new PlayerController(this.camera, this.arenaBounds);
    this.player.setMouseSensitivity(this.settings.controls.mouseSensitivity);
    this.caster = new SpellCaster(this.player);
    this.caster.unlockedSpells = this.profile.unlockedSpells;
    this.block = new Block(this.player.health);
    this.player.block = this.block;
    this.player.health.mitigation = (amt) => this.block.mitigate(amt);
    this._origBlockPerfect = this.block.notePerfect.bind(this.block);
    this.block.notePerfect = () => {
      this._origBlockPerfect();
      this.shieldView?.notePerfect();
      this.screenEffects?.perfectBlockShake();
    };
    this._origBlockNote = this.block.noteBlock.bind(this.block);
    this.block.noteBlock = () => {
      this._origBlockNote();
      this.shieldView?.noteBlock();
    };
    this.ui = new UI();
    // ScreenEffects: vignette compositor (94a) + camera shake accumulator (94b).
    // Instantiated after vfx (for screenShake/reducedMotion flags) and after the
    // vignette element exists (UI constructor sets up #vignette via this.ui.vignette).
    this.screenEffects = new ScreenEffects(
      document.getElementById("vignette"),
      this.camera,
      this.vfx,
    );
    this.captions = new Captions();
    this.captions.setEnabled(this.settings.display.captions);
    // WorldProjector: shared 3D→screen projection + DOM pool (issue #103).
    // Appended to #hud so pool nodes sit inside the HUD overlay coordinate space.
    // Exposed on world.projector for consumers #96 (status icons) and #99 (damage numbers).
    this.projector = new WorldProjector(document.getElementById("hud"), this.camera);
    // StatusIconLayer: floating status-effect icons above enemies (issue #96).
    // Consumes world.projector — no private pool; soft cap of 24 concurrent nodes.
    this.statusIcons = new StatusIconLayer();
    this.timers = [];
    this.relics = new Set();
    this.combat = { nextCastDamageMult: 1, nextCastLabel: "", blinkStrikeTimer: 0, guardTraining: 0, autocastTargetMode: "forward", perfectHealNext: 0, castCounter: 0, standingTimer: 0, consecutiveSkips: 0, hollowSigilApplied: false, vermillionAoE: false, emberedFootingReady: false };
    this.currentWaveModifier = null;
    this.currentBossPattern = null;

    // World context shared across systems.
    const self = this;
    this.world = {
      scene: this.scene,
      vfx: this.vfx,
      events: this.events,
      settings: this.settings,
      audio: this.audio,
      runStats: this.runStats,
      currency: this.currency,
      relics: this.relics,
      combat: this.combat,
      player: this.player,
      caster: this.caster,
      arenaBounds: this.arenaBounds,
      resolveArenaCollision: (pos, radius) => resolveCircleAgainstObstacles(pos, radius, self.arenaBounds.obstacles),
      isArenaPointClear: (pos, radius = 0.8) => isCircleClear(pos, radius, self.arenaBounds.obstacles),
      segmentHitsArenaObstacle: (from, to, radius = 0.1) => segmentHitsObstacles(from, to, radius, self.arenaBounds.obstacles),
      hasLineOfSight: (from, to, radius = 0.1) => !segmentHitsObstacles(from, to, radius, self.arenaBounds.obstacles),
      findSafeBlinkDestination: (from, to, radius) => findSafeDestination(from, to, radius, self.arenaBounds.obstacles),
      getElevationAt: (x, z) => getElevationAt(x, z, self.arenaBounds.walkableSurfaces),
      get blink() { return self.blink; },
      get shieldView() { return self.shieldView; },
      get staffView() { return self.staffView; },
      get arenaLayoutName() { return self.arenaLayoutName; },
      get enemyManager() { return self.enemyManager; },
      get objectiveManager() { return self.objectiveManager; },
      get hitResolver() { return self.hitResolver; },
      get levelManager() { return self.levelManager; },
      get layoutEvents() { return self.layoutEvents; },
      get upgrades() { return self.upgrades; },
      get ui() { return self.ui; },
      get difficultyTier() { return getDifficultyTier(self.difficultyLevel); },
      get currentWaveModifier() { return self.currentWaveModifier; },
      set currentWaveModifier(mod) { self.currentWaveModifier = mod; },
      get currentBossPattern() { return self.currentBossPattern; },
      set currentBossPattern(p) { self.currentBossPattern = p; },
      get onboarding() { return self.onboarding; },
      get captions() { return self.captions; },
      get screenEffects() { return self.screenEffects; },
      get projector() { return self.projector; },
      serviceOptions: () => self.serviceOptions(),
      getEnemies: () => self.enemyManager.aliveList(),
      getObjectiveTargets: () => self.objectiveManager?.targets() || [],
      castEnemySpell: (spell, from, dir) => castSpell(self.world, spell, from, dir, "enemy"),
      after: (sec, fn) => self.timers.push({ t: sec, fn }),
      layoutToast: (msg, ms = 1200) => self.ui.toast(msg, ms),
      isPlayerAlive: () => self.isPlayerAlive(),
      onPlayerHurt: () => {
        // Vignette hurt flash goes through the compositor (94a) so it merges
        // cleanly with the persistent low-HP base layer. Not gated by reducedMotion
        // (it's a state indicator, not motion — see design §4).
        self.screenEffects?.hurtFlash();
        self.audio.playerHurt();
      },
      openReward: (lvl, gold) => self.openReward(lvl, gold),
      onWaveStarted: (lvl, modifier, bossPattern, objective) => {
        self._warnedHazardThisWave = false;
        self.ui.showWaveBanner(lvl, modifier, self.arenaLayoutName, bossPattern, objective);
        // Wave-start forward/back camera ease (94b). Gated internally by
        // reducedMotion and screenShake. Sin-ease: 0 → peak → 0 over 0.4s.
        self.screenEffects?.startWavePulse();
        if (bossPattern) {
          self.vfx.shock(self.player.position, 0xff5edb, 5.2, 0.45);
          self.audio?.telegraphSurge?.();
          self.audio?.playMusic("boss_bed", { loop: true, fadeIn: 1.0 });
          self._isBossWave = true;
        } else {
          self.audio?.playMusic("arena_combat", { loop: true, fadeIn: self._isBossWave ? 0.8 : 0.5 });
          self._isBossWave = false;
        }
        if (bossPattern) self.onboarding?.triggerIf(self.world, "boss_spawn");
        if (objective) self.onboarding?.triggerIf(self.world, "objective_active");
        self.layoutEvents?.startWave(lvl, self.arenaLayoutName, bossPattern);
      },
      onObjectiveComplete: () => self.levelManager?._onObjectiveComplete(),
      onCombatProc: (msg) => self.ui.toast(msg, 900),
      onRewardTaken: (reward) => {},
      onPanelClosed: (purchasedCount) => {},
    };

    this.block.world = this.world; // perfectHealNext lookup inside Block.notePerfect
    this.blink = new Blink(this.player, this.world);
    this.hitResolver = new HitResolver(this.world);
    this.enemyManager = new EnemyManager(this.world);
    this.enemyVfxHandler = new EnemyVfxHandler(this.world);
    this.objectiveManager = new ObjectiveManager(this.world);
    this.layoutEvents = new LayoutEventManager(this.world);
    this.levelManager = new LevelManager(this.world);
    this.rewardGen = new RewardGenerator(this.world);
    this.upgrades = new UpgradeManager(this.world);

    // DamageNumberLayer: floating hit numbers driven from world.events.onDamageDealt (#99).
    // Instantiated after world and projector are ready; update() called each frame below.
    this.damageNumbers = new DamageNumberLayer(this.world);

    // Wire crosshair hit/kill flash and damage-direction indicator to the event
    // bus now that both UI and events are ready. World is passed for #101's
    // damage-direction nearest-enemy lookup in the onDamageDealt handler.
    this.ui.attachBus(this.events, this.settings, this.world);

    // Wire cast shake (94b) — subscribe to onPlayerCast so cast-site code
    // stays clean. Amplitude is read from SPELL_DEFINITIONS[id].castShake
    // (data-driven per spell). arcane_bolt.castShake = 0 so it's a no-op.
    this.events.on("onPlayerCast", (ev) => {
      if (this.state === STATE.PLAYING) {
        const id = ev.spell?.definitionId || ev.spell?.id || "";
        const amp = SPELL_DEFINITIONS[id]?.castShake ?? 0;
        if (amp > 0) this.screenEffects?.castShake(id, amp);
      }
    });

    this.player.health.onDeath = () => this.onPlayerDeath();
    this.input.onBlink = () => { if (this.state === STATE.PLAYING) this.blink.trigger(); };
    this.input.onPause = () => { if (this.state === STATE.PLAYING) this.pauseGame(true); };
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this._lastInputDevice = "kbm";
    this.onboarding = new Onboarding(this.profile.meta);
    this._onboardingMoveTriggered = false;
    this._onboardingLookTriggered = false;
    this._onboardingCastTriggered = false;
    this._onboardingBlockTriggered = false;
    this._onboardingBlinkTriggered = false;
    getStorageMeta().then((meta) => { this.storageMeta = meta; });

    addEventListener("resize", () => this._resize());
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.state === STATE.PLAYING) {
        e.preventDefault();
        this.pauseGame(true);
      }
    });

    if (!this.settings.privacy?.telemetryPrompted) {
      this.ui.privacyPrompt(
        () => this._onPrivacyAccept(),
        () => this._onPrivacyDecline(),
      );
    } else {
      telemetryInit(this.settings);
      this.showMainMenu();
    }

    this._last = performance.now();
    this.renderer.setAnimationLoop(() => {
      try {
        this._frame();
      } catch (err) {
        this._handleFatalError(err, "render-loop");
      }
    });
  }

  _handleFatalError(err, source = "game") {
    if (this._fatalErrorReported) return;
    this._fatalErrorReported = true;
    this.state = STATE.GAMEOVER;
    this.renderer?.setAnimationLoop(null);
    this.input?.exitLock();
    this.clearInputState();
    this.layoutEvents?.clear();
    this.objectiveManager?.clear();
    this.enemyManager?.clearAll();
    this.hitResolver?.clear();
    this.vfx?.clear();
    this.staffView?.dispose();
    this.damageNumbers?.destroy();
    this.ui?.clearTransientCombatUi?.();
    this.ui?.setHud(false);
    reportFatal(err, source);
  }

  isPlayerAlive() {
    const health = this.player?.health;
    return !!health && !health.isDead && health.current > 0;
  }

  isPlayerLocationSafe() {
    if (!this.player) return false;
    const radius = this.player.radius || 0.8;
    const feet = this.player.feet;
    const lim = this.arenaBounds.half - radius;
    const finite =
      Number.isFinite(feet.x) &&
      Number.isFinite(feet.y) &&
      Number.isFinite(feet.z);
    if (!finite) return false;
    if (Math.abs(feet.x) > lim || Math.abs(feet.z) > lim) return false;
    if (feet.y < -0.05 || feet.y > this.arenaBounds.h) return false;
    if (!isCircleClear(feet, radius, this.arenaBounds.obstacles)) return false;
    return !this.arenaBounds.hazards.some((h) => pointInRect(feet, h, radius));
  }

  ensurePlayerLocationSafe() {
    if (this.isPlayerLocationSafe()) return true;
    this._placePlayerAtSafeStart();
    return this.isPlayerLocationSafe();
  }

  ensurePlayerReadyForRunBoundary() {
    if (!this.isPlayerAlive()) return false;
    return this.ensurePlayerLocationSafe();
  }

  _buildSkybox() {
    // Procedural gradient skybox — single mesh, no textures.
    const g = new THREE.SphereGeometry(350, 40, 40);
    const positions = g.attributes.position.array;
    const colors = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const h = (y / 350 + 1) * 0.5; // 0..1 from bottom to top
      let r, g, b;
      if (h > 0.6) {
        // dark purple top
        const t = (h - 0.6) / 0.4;
        r = 0.10 + t * 0.05;
        g = 0.04 + t * 0.02;
        b = 0.14 + t * 0.08;
      } else if (h > 0.25) {
        // deep blue middle
        r = 0.05;
        g = 0.05;
        b = 0.12;
      } else {
        // dark ground
        r = 0.02;
        g = 0.02;
        b = 0.04;
      }
      colors[i] = r;
      colors[i + 1] = g;
      colors[i + 2] = b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(g, mat);
    sky.renderOrder = -1;
    this.scene.add(sky);
    this._skyboxMesh = sky;
  }

  _buildArena() {
    const half = this.arenaBounds.half;
    this.scene.add(new THREE.HemisphereLight(0x9088c0, 0x141022, 1.3));
    const dir = new THREE.DirectionalLight(0xffeed0, 1.0);
    dir.position.set(20, 40, 12);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 100;
    dir.shadow.camera.left = -50;
    dir.shadow.camera.right = 50;
    dir.shadow.camera.top = 50;
    dir.shadow.camera.bottom = -50;
    dir.shadow.bias = -0.001;
    this.scene.add(dir);
    this._dirLight = dir;

    const texLoader = new THREE.TextureLoader();
    const applyTex = (mat, url, repeat = 4) => {
      texLoader.load(
        url,
        tex => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(repeat, repeat);
          if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
          mat.map = tex;
          mat.needsUpdate = true;
        },
        undefined,
        err => console.warn("[texture] load failed", url, err?.message ?? err)
      );
    };

    const floorMat = new THREE.MeshLambertMaterial({ color: 0x6a6478 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // Kept so the floor geometry can be rebuilt with cut-outs over pit footprints
    // (see _rebuildFloor) — otherwise the solid plane occludes the sunken pit.
    this._floor = floor;
    applyTex(floorMat, "assets/textures/floor_stone.jpg", 16);

    const grid = new THREE.GridHelper(half * 2, 32, 0x4a3f7a, 0x2a2548);
    grid.position.y = 0.02;
    this.scene.add(grid);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x6a5a4a });
    const h = this.arenaBounds.h;
    const mk = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, h / 2, z);
      this.scene.add(m);
    };
    const t = 2;
    mk(half * 2 + t, t, 0, -half);
    mk(half * 2 + t, t, 0, half);
    mk(t, half * 2 + t, -half, 0);
    mk(t, half * 2 + t, half, 0);
    applyTex(wallMat, "assets/textures/wall_stone.jpg", 6);

    this._coverMat = new THREE.MeshLambertMaterial({ color: 0x807060 });
    this._gateMat = new THREE.MeshLambertMaterial({ color: 0x5c526d });
    this._hazardMat = new THREE.MeshBasicMaterial({
      color: 0x36e8c8,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._hazardEdgeMat = new THREE.LineBasicMaterial({
      color: 0x7fffe6,
      transparent: true,
      opacity: 0.85,
    });
    this._hazardMeshes = [];
    applyTex(this._coverMat, "assets/textures/pillar_stone.jpg", 2);
    applyTex(this._gateMat, "assets/textures/wall_stone.jpg", 4);
    this._buildArenaLayout("focus");
  }

  _clearArenaLayout() {
    if (!this._arenaLayout) return;
    this.scene.remove(this._arenaLayout);
    this._arenaLayout.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.userData?.disposeMaterial) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose?.();
      }
    });
  }

  _buildArenaLayout(forced = null) {
    this.layoutEvents?.clear();
    this._clearArenaLayout();
    const group = new THREE.Group();
    this._arenaLayout = group;
    this.scene.add(group);
    this.arenaBounds.obstacles = [];
    this.arenaBounds.hazards = [];
    this.arenaBounds.walkableSurfaces = [];
    this.arenaBounds.layoutFeatures = { gates: [], hazards: this.arenaBounds.hazards };
    this._hazardMeshes = [];
    this._inHazardLast = false;

    const layouts = ["lanes", "cross", "cover", "gates", "rift", "elevated", "ramparts", "tower_court", "sinkhole", "towers"];
    const kind = forced || layouts[Math.floor(Math.random() * layouts.length)];
    this.arenaLayoutName = kind;

    const addBlocker = ({ x, z, w, d, h = 4.2, mat = this._coverMat, dynamicGate = false }) => {
      const material = dynamicGate ? mat.clone() : mat;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.userData.disposeMaterial = dynamicGate;
      mesh.position.set(x, h / 2, z);
      group.add(mesh);
      const obstacle = {
        x, z, w, d, h,
        mesh,
        baseY: h / 2,
        baseColor: material.color?.getHex?.() || 0x5c526d,
        dynamicGate,
      };
      this.arenaBounds.obstacles.push(obstacle);
      if (dynamicGate) this.arenaBounds.layoutFeatures.gates.push(obstacle);
      return obstacle;
    };
    const addPillar = (x, z, r = 1.7) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 5.4, 18), this._coverMat);
      mesh.position.set(x, 2.7, z);
      group.add(mesh);
      this.arenaBounds.obstacles.push({ x, z, w: r * 2, d: r * 2, h: 5.4 });
    };
    const addHazard = ({ x, z, w, d }) => {
      const geo = new THREE.PlaneGeometry(w, d);
      const mat = this._hazardMat.clone();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.disposeMaterial = true;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.045, z);
      group.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this._hazardEdgeMat);
      edges.rotation.x = -Math.PI / 2;
      edges.position.set(x, 0.05, z);
      group.add(edges);
      const hazard = { x, z, w, d, dynamicWarn: false, dynamicActive: false, dynamicDamageMult: 1 };
      this._hazardMeshes.push({ mesh, mat, baseOpacity: 0.45, hazard });
      this.arenaBounds.hazards.push(hazard);
      return hazard;
    };
    // Sunken pit — a depression in the floor with negative elevation. Entities walk
    // down into the pit, taking damage over time. Projectiles pass over pits since
    // they fly at caster eye height well above the pit floor.
    const addPit = ({ x, z, w, d, depth = 2.0 }) => {
      // Solid recess: a floor at -depth plus four vertical walls down from the rim.
      // The arena floor is cut open over this footprint (see _rebuildFloor) so the
      // depression is visible from ground level; the walls + opaque floor mean no
      // see-through to the void when the camera drops below y=0 inside the pit.
      const pitFloorMat = new THREE.MeshLambertMaterial({
        color: 0x3a2a52, emissive: 0x1a1030, emissiveIntensity: 0.7,
      });
      const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pitFloorMat);
      pitFloor.userData.disposeMaterial = true;
      pitFloor.rotation.x = -Math.PI / 2;
      pitFloor.position.set(x, -depth, z);
      pitFloor.receiveShadow = true;
      group.add(pitFloor);

      // Inward-facing vertical walls (DoubleSide so they read from both sides and
      // never cull to void). Rim-lit material keeps the recess legible in shadow.
      const wallMat = new THREE.MeshLambertMaterial({
        color: 0x4a3a66, emissive: 0x241636, emissiveIntensity: 0.55,
        side: THREE.DoubleSide,
      });
      const mkWall = (ww, px, pz, ry) => {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(ww, depth), wallMat);
        wall.userData.disposeMaterial = true;
        wall.position.set(px, -depth / 2, pz);
        wall.rotation.y = ry;
        wall.receiveShadow = true;
        group.add(wall);
      };
      mkWall(w, x, z - d / 2, 0);            // north
      mkWall(w, x, z + d / 2, Math.PI);      // south
      mkWall(d, x - w / 2, z, Math.PI / 2);  // west
      mkWall(d, x + w / 2, z, -Math.PI / 2); // east

      // Bright rim outline at ground level plus a fainter outline at the pit floor
      // for a clear depth read from above.
      const rimGeo = new THREE.PlaneGeometry(w, d);
      const topEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(rimGeo),
        new THREE.LineBasicMaterial({ color: 0xb56cff, transparent: true, opacity: 0.95 }),
      );
      topEdges.userData.disposeMaterial = true;
      topEdges.rotation.x = -Math.PI / 2;
      topEdges.position.set(x, 0.03, z);
      group.add(topEdges);
      const botEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(rimGeo),
        new THREE.LineBasicMaterial({ color: 0x7a40b0, transparent: true, opacity: 0.7 }),
      );
      botEdges.userData.disposeMaterial = true;
      botEdges.rotation.x = -Math.PI / 2;
      botEdges.position.set(x, -depth + 0.02, z);
      group.add(botEdges);
      rimGeo.dispose();

      this.arenaBounds.walkableSurfaces.push({ type: "pit", x, z, w, d, elevation: -depth });
      this.arenaBounds.hazards.push({ x, z, w, d, dynamicWarn: false, dynamicActive: false, dynamicDamageMult: 1, isPit: true });
    };
    // Raised flat platform. The box body is a solid obstacle at floor level; entities
    // whose Y >= elevation bypass horizontal collision (they are standing on top).
    const addPlatform = ({ x, z, w, d, elevation }) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, elevation, d), this._coverMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(x, elevation / 2, z);
      group.add(mesh);
      const obstacle = { x, z, w, d, h: elevation, platformTop: elevation };
      this.arenaBounds.obstacles.push(obstacle);
      this.arenaBounds.walkableSurfaces.push({ type: "platform", x, z, w, d, elevation });
    };
    // Ramp connecting two elevations linearly along one axis.
    // elevStart is the elevation at the negative-axis end; elevEnd at the positive-axis end.
    // The mesh's sloped (hypotenuse) face is built along the run axis so that its
    // horizontal projection spans exactly the run length (w for axis "x", d for
    // axis "z") and its vertical rise spans h — matching getElevationAt's linear
    // interpolation over that same axis. (Computing the tilt from the off-axis
    // dimension makes the visible slab float below the walkable surface.)
    const addRamp = ({ x, z, w, d, axis, elevStart, elevEnd }) => {
      const h = Math.abs(elevStart - elevEnd);
      const yCenter = (elevStart + elevEnd) / 2;
      const runLen = axis === "z" ? d : w;
      const slopeLen = Math.sqrt(runLen * runLen + h * h);
      const tiltAngle = Math.atan2(h, runLen);
      const geo = axis === "z"
        ? new THREE.BoxGeometry(w, 0.22, slopeLen)   // run along Z
        : new THREE.BoxGeometry(slopeLen, 0.22, d);  // run along X
      const rampMesh = new THREE.Mesh(geo, this._coverMat);
      rampMesh.castShadow = true;
      rampMesh.receiveShadow = true;
      rampMesh.position.set(x, yCenter, z);
      // Positive X rotation raises the negative-Z end; negative Z rotation raises
      // the negative-X end → both match the elevStart > elevEnd (high at the
      // negative-axis end) convention.
      rampMesh.rotation.x = (axis === "z")
        ? (elevStart > elevEnd ? tiltAngle : -tiltAngle)
        : 0;
      rampMesh.rotation.z = (axis === "x")
        ? (elevStart > elevEnd ? -tiltAngle : tiltAngle)
        : 0;
      group.add(rampMesh);
      this.arenaBounds.walkableSurfaces.push({ type: "ramp", x, z, w, d, axis, elevStart, elevEnd });
    };

    if (kind === "lanes") {
      addBlocker({ x: -13, z: -4, w: 4, d: 24, mat: this._gateMat });
      addBlocker({ x: 13, z: 4, w: 4, d: 24, mat: this._gateMat });
      addBlocker({ x: 0, z: -19, w: 16, d: 3.5 });
      addBlocker({ x: 0, z: 19, w: 16, d: 3.5 });
      addHazard({ x: 0, z: 0, w: 5, d: 28 });
    } else if (kind === "cross") {
      addBlocker({ x: -18, z: 0, w: 12, d: 3.5 });
      addBlocker({ x: 18, z: 0, w: 12, d: 3.5 });
      addBlocker({ x: 0, z: -18, w: 3.5, d: 12 });
      addBlocker({ x: 0, z: 18, w: 3.5, d: 12 });
      addPillar(-11, -11);
      addPillar(11, 11);
    } else if (kind === "cover") {
      for (const [x, z] of [[-18, -16], [17, -15], [-16, 17], [18, 16], [0, -22], [0, 22]]) addPillar(x, z, 1.55);
      addBlocker({ x: -8, z: 2, w: 10, d: 3.2 });
      addBlocker({ x: 8, z: -2, w: 10, d: 3.2 });
    } else if (kind === "gates") {
      addBlocker({ x: -20, z: -9, w: 4, d: 18, mat: this._gateMat, dynamicGate: true });
      addBlocker({ x: -20, z: 17, w: 4, d: 12, mat: this._gateMat, dynamicGate: true });
      addBlocker({ x: 20, z: 9, w: 4, d: 18, mat: this._gateMat, dynamicGate: true });
      addBlocker({ x: 20, z: -17, w: 4, d: 12, mat: this._gateMat, dynamicGate: true });
      addBlocker({ x: 0, z: 0, w: 14, d: 3.5 });
      addHazard({ x: 0, z: -12, w: 22, d: 3.4 });
    } else if (kind === "rift") {
      addBlocker({ x: -15, z: -15, w: 12, d: 3.3 });
      addBlocker({ x: 15, z: 15, w: 12, d: 3.3 });
      addBlocker({ x: -15, z: 15, w: 3.3, d: 12 });
      addBlocker({ x: 15, z: -15, w: 3.3, d: 12 });
      addHazard({ x: 0, z: 0, w: 34, d: 3.2 });
      addHazard({ x: 0, z: 0, w: 3.2, d: 34 });
    } else if (kind === "elevated") {
      // Raised platform (z=-22 to -14) connected to the floor by a south ramp (z=-14 to -10).
      // The platform body blocks horizontal movement at floor level; entities on top (Y≥3)
      // pass through its collision via the platformTop field.
      addPlatform({ x: 0, z: -18, w: 16, d: 8, elevation: 3.0 });
      // South ramp: elevStart=3 at z=-14 (negative-Z end), elevEnd=0 at z=-10 (positive-Z end).
      addRamp({ x: 0, z: -12, w: 10, d: 4, axis: "z", elevStart: 3.0, elevEnd: 0.0 });
      // Floor-level cover giving players shelter before approaching the ramp.
      addBlocker({ x: -22, z: 5, w: 6, d: 3.2 });
      addBlocker({ x: 22, z: 5, w: 6, d: 3.2 });
      addPillar(-14, -5, 1.6);
      addPillar(14, -5, 1.6);
    } else if (kind === "ramparts") {
      // Two raised flanking platforms (west and east) at elevation 3.0, each connected
      // to the central ground by a ramp along the X axis. Central blockers create
      // cover and force routing through the ramp approaches.
      addPlatform({ x: -26, z: 0, w: 12, d: 22, elevation: 3.0 });
      // West ramp: elevStart=3 at x=-20 (west/negative-x end), elevEnd=0 at x=-14 (east end).
      addRamp({ x: -17, z: 0, w: 6, d: 12, axis: "x", elevStart: 3.0, elevEnd: 0.0 });
      addPlatform({ x: 26, z: 0, w: 12, d: 22, elevation: 3.0 });
      // East ramp: elevStart=0 at x=14 (west end), elevEnd=3 at x=20 (east/positive-x end).
      addRamp({ x: 17, z: 0, w: 6, d: 12, axis: "x", elevStart: 0.0, elevEnd: 3.0 });
      // Central ground cover — line-of-sight blockers between the two ramp mouths.
      addBlocker({ x: 0, z: -12, w: 10, d: 3.2 });
      addBlocker({ x: 0, z: 12, w: 10, d: 3.2 });
    } else if (kind === "tower_court") {
      // North tower (elevation 3.5) with a staircase ramp on its south face,
      // and a lower south platform (elevation 2.5) with a north ramp.
      // Central corridor between them is flanked by cover blockers.
      addPlatform({ x: 0, z: -22, w: 14, d: 8, elevation: 3.5 });
      // North stairs: elevStart=3.5 at z=-18 (north/negative-z end), elevEnd=0 at z=-12 (south end).
      addRamp({ x: 0, z: -15, w: 8, d: 6, axis: "z", elevStart: 3.5, elevEnd: 0.0 });
      addPlatform({ x: 0, z: 22, w: 12, d: 8, elevation: 2.5 });
      // South ramp: elevStart=0 at z=14 (north/negative-z end), elevEnd=2.5 at z=18 (south end).
      addRamp({ x: 0, z: 16, w: 8, d: 4, axis: "z", elevStart: 0.0, elevEnd: 2.5 });
      // Flank cover in the central corridor.
      addBlocker({ x: -20, z: 0, w: 6, d: 3.2 });
      addBlocker({ x: 20, z: 0, w: 6, d: 3.2 });
      addPillar(-10, -6, 1.6);
      addPillar(10, -6, 1.6);
    } else if (kind === "sinkhole") {
      addPit({ x: 0, z: 0, w: 16, d: 12, depth: 2.5 });
      addPlatform({ x: -20, z: -16, w: 10, d: 8, elevation: 2.5 });
      addRamp({ x: -20, z: -10, w: 10, d: 4, axis: "z", elevStart: 2.5, elevEnd: 0.0 });
      addPlatform({ x: 20, z: 16, w: 10, d: 8, elevation: 2.5 });
      addRamp({ x: 20, z: 10, w: 10, d: 4, axis: "z", elevStart: 0.0, elevEnd: 2.5 });
      addBlocker({ x: 0, z: -20, w: 3.2, d: 6 });
      addBlocker({ x: 0, z: 20, w: 3.2, d: 6 });
      addPillar(-18, 0, 1.6);
      addPillar(18, 0, 1.6);
    } else if (kind === "towers") {
      // Two flanking spiral towers (west and east). Each is a concentric 3-tier
      // ziggurat — base(3) / mid(6) / top(9), footprints shrinking with height —
      // whose connecting ramps sit on three DIFFERENT faces so the climb wraps
      // counter-clockwise around the tower (south → east → north) rather than
      // running straight up one face. Coordinates below are local to the tower
      // centre; spiralTower translates them by cx.
      //
      // getElevationAt returns the max elevation of all surfaces covering an XZ
      // point, so the concentric platforms + their ramps compose correctly: a
      // higher tier (or the ramp climbing onto it) always wins over the wider
      // tier beneath. Each ramp's inner edge clears the next tier's wall by ≥0.8
      // (the player radius) so the climber is never wedged against it.
      const spiralTower = (cx) => {
        const X = (lx) => cx + lx;
        // Concentric tiers (centred on the tower): base 24², mid 16², top 8².
        // Each higher tier leaves a 4-wide ledge on the tier below — wide enough
        // for the player (radius 0.8) to walk clear of the next tier's wall.
        addPlatform({ x: X(0), z: 0, w: 24, d: 24, elevation: 3.0 });
        addPlatform({ x: X(0), z: 0, w: 16, d: 16, elevation: 6.0 });
        addPlatform({ x: X(0), z: 0, w: 8,  d: 8,  elevation: 9.0 });
        // Ramp A — SOUTH face, floor(0) → base(3). Climbs north onto the base.
        addRamp({ x: X(0), z: 15, w: 8, d: 6, axis: "z", elevStart: 3.0, elevEnd: 0.0 });
        // Ramp B — EAST ledge of the base, base(3) → mid(6). Climbs north; the
        // climber steps west onto the mid tier at its high (north) end.
        addRamp({ x: X(10), z: 1, w: 4, d: 6, axis: "z", elevStart: 6.0, elevEnd: 3.0 });
        // Ramp C — NORTH ledge of the mid tier, mid(6) → top(9). Climbs west (its
        // low/east end is where the ramp-B climber arrives); steps south onto the
        // top tier at its high (north-west) end. South→east→north winding gives
        // the spiral its wrap.
        addRamp({ x: X(0), z: -6, w: 8, d: 4, axis: "x", elevStart: 9.0, elevEnd: 6.0 });
      };
      spiralTower(-22); // west tower
      spiralTower(22);  // east tower
      // Central ground cover so the floor between towers still plays.
      addBlocker({ x: 0, z: -8, w: 9, d: 3.2 });
      addBlocker({ x: 0, z: 8, w: 9, d: 3.2 });
      addPillar(0, 0, 1.7);
    } else {
      addPillar(-16, -16);
      addPillar(16, -16);
      addPillar(-16, 16);
      addPillar(16, 16);
    }
    this._rebuildFloor();
  }

  // Rebuilds the arena floor mesh, cutting a hole over each pit footprint so the
  // sunken pit (its walls and floor) is visible from ground level instead of being
  // hidden behind the solid floor plane. With no pits this is a plain full plane.
  _rebuildFloor() {
    const floor = this._floor;
    if (!floor) return;
    const half = this.arenaBounds.half;
    const pits = (this.arenaBounds.walkableSurfaces || []).filter((s) => s.type === "pit");
    floor.geometry?.dispose?.();

    let geo;
    if (pits.length === 0) {
      geo = new THREE.PlaneGeometry(half * 2, half * 2);
    } else {
      const shape = new THREE.Shape();
      shape.moveTo(-half, -half);
      shape.lineTo(half, -half);
      shape.lineTo(half, half);
      shape.lineTo(-half, half);
      shape.lineTo(-half, -half);
      for (const p of pits) {
        // The floor mesh is rotated x=-90°, which maps shape-space Y to world -Z,
        // so a pit at world z uses shape-space y = -z.
        const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2;
        const y0 = -p.z - p.d / 2, y1 = -p.z + p.d / 2;
        const hole = new THREE.Path();
        hole.moveTo(x0, y0);
        hole.lineTo(x1, y0);
        hole.lineTo(x1, y1);
        hole.lineTo(x0, y1);
        hole.lineTo(x0, y0);
        shape.holes.push(hole);
      }
      geo = new THREE.ShapeGeometry(shape);
      // Normalize UVs to 0..1 across the arena so the tiled texture (repeat 16)
      // lines up the same as the original PlaneGeometry.
      const pos = geo.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) + half) / (half * 2);
        uv[i * 2 + 1] = (pos.getY(i) + half) / (half * 2);
      }
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }
    floor.geometry = geo;
  }

  // --- Flow ---------------------------------------------------------------

  clearInputState() {
    this.input?.clearKeys();
  }

  showMainMenu() {
    this.audio?.playMusic("menu_loop", { loop: true, fadeIn: 0.5 });
    this.clearInputState();
    if (this.shieldView) this.shieldView.group.visible = false;
    if (this.staffView) this.staffView.group.visible = false;
    this.ui.mainMenu(
      (spellId) => this.startRun(spellId),
      this.selectedSpellId,
      () => this.openSettings(() => this.showMainMenu()),
      this.profile,
      () => this.confirmResetProfile(),
      this.difficultyLevel,
      (level) => { this.difficultyLevel = level; },
    );
  }

  _onPrivacyAccept() {
    this.settings.privacy.telemetryEnabled = true;
    this.settings.privacy.telemetryUuid = crypto.randomUUID();
    this.settings.privacy.telemetryPrompted = true;
    saveSettings(this.settings);
    telemetryInit(this.settings);
    this.showMainMenu();
  }

  _onPrivacyDecline() {
    this.settings.privacy.telemetryEnabled = false;
    this.settings.privacy.telemetryPrompted = true;
    saveSettings(this.settings);
    this.showMainMenu();
  }

  persistProfile(profile) {
    this.profile = sanitizeProfile(profile);
    saveProfile(this.profile);
  }

  applySettings() {
    this.audio?.setSettings(this.settings.audio);
    this.player?.setMouseSensitivity(this.settings.controls.mouseSensitivity);
    this.player.stickLookSensitivity = this.settings.controls.stickLookSensitivity ?? 1;
    this.player.invertY = this.settings.controls.invertY ?? false;
    this.vfx?.setDensity(this.settings.performance.vfxDensity);
    this.vfx?.setScreenShake(this.settings.display.screenShake);
    this.captions?.setEnabled(this.settings.display.captions);
    this._reducedMotion = !!this.settings.display?.reducedMotion;
    this.vfx?.setReducedMotion(this._reducedMotion);
    if (this._bloomPass) {
      this._bloomPass.enabled = this.settings.display?.bloom !== false;
    }
    if (this.renderer) {
      this.renderer.shadowMap.enabled = this.settings.display?.shadows !== false;
    }
    if (this._dirLight) {
      this._dirLight.castShadow = this.settings.display?.shadows !== false;
    }
    this._applyRendererSettings();
    if (this.camera && this.settings.display?.fov) {
      this.camera.fov = this.settings.display.fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.input) {
      this.input.setBindings(this.settings.controls?.keyBindings);
    }
  }

  updateSettings(nextSettings) {
    const previousFullscreen = !!this.settings.display?.fullscreen;
    const previousTelemetry = !!this.settings.privacy?.telemetryEnabled;
    this.settings = deepMergeSettings(this.settings, nextSettings);
    this.applySettings();
    if (previousFullscreen !== !!this.settings.display?.fullscreen) {
      this.applyFullscreenPreference();
    }
    if (previousTelemetry !== !!this.settings.privacy?.telemetryEnabled) {
      telemetrySetEnabled(this.settings);
    }
    clearTimeout(this._settingsSaveTimer);
    this._settingsSaveTimer = setTimeout(() => {
      saveSettings(this.settings);
    }, 150);
  }

  flushSettings() {
    clearTimeout(this._settingsSaveTimer);
    saveSettings(this.settings);
  }

  openSettings(onBack) {
    this.clearInputState();
    const self = this;
    this.ui.settingsMenu(
      this.settings,
      (settings) => this.updateSettings(settings),
      () => {
        this.flushSettings();
        onBack();
      },
      this.storageMeta,
      (presetId) => {
        self.settings = sanitizeSettings(applyPreset(self.settings, presetId));
        saveSettings(self.settings);
        self.applySettings();
        self.openSettings(onBack);
      },
      () => {
        self.onboarding.tutorialSeen = {};
        self.profile.meta.tutorialSeen = {};
        self.persistProfile(self.profile);
        self.ui.toast(t("toast.tutorial_hints_reset"), 1800);
        self.openSettings(onBack);
      },
      () => {
        self.settings.privacy.telemetryUuid = crypto.randomUUID();
        self.flushSettings();
        self.ui.toast(t("toast.telemetry_uuid_reset"), 1800);
        self.openSettings(onBack);
      },
      (url) => {
        window.open(url, "_blank");
      },
    );
  }

  confirmResetProfile() {
    this.state = STATE.MENU;
    this.input.exitLock();
    this.clearInputState();
    this.ui.confirmResetProfile(
      this.profile,
      async () => {
        this.clearInputState();
        this.profile = await resetProfile();
        this.ui.toast(t("toast.records_reset"), 1800);
        this.showMainMenu();
      },
      () => this.showMainMenu(),
    );
  }

  showFocusPrompt(label = "Click to play") {
    this.ui.focusPrompt(
      () => {
        this.audio.ensure();
        this.input.requestLock();
      },
      label,
      {
        onSettings: () => this.openSettings(() => this.showFocusPrompt(label)),
        onMenu: () => this.toMenu(),
      },
    );
  }

  showPauseMenu() {
    this.state = STATE.FOCUS;
    this.clearInputState();
    this.ui.pauseMenu(
      () => this.resumeFromPause(),
      () => this.openSettings(() => this.showPauseMenu()),
      () => this.toMenu(),
    );
  }

  pauseGame(exitPointer = true) {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.FOCUS;
    this._pendingStart = false;
    this.clearInputState();
    if (this.staffView) this.staffView.group.visible = false;
    this.ui.setHud(false);
    this.ui.clearTransientCombatUi();
    if (exitPointer) this.input.exitLock();
    this.showPauseMenu();
  }

  resumeFromPause() {
    this.state = STATE.FOCUS;
    this._pendingStart = false;
    this.audio.ensure();
    this.input.requestLock();
  }

  startRun(spellId = this.selectedSpellId) {
    telemetryTrack("run_start", {
      spellId,
      difficultyLevel: this.difficultyLevel,
      difficultyTier: getDifficultyTier(this.difficultyLevel)?.name,
      starterSpell: SPELL_DEFINITIONS[spellId]?.displayName,
    });
    this.clearInputState();
    this.ui.clearTransientCombatUi();
    this.selectedSpellId = SPELL_DEFINITIONS[spellId] ? spellId : STARTER_SPELL_ID;
    preloadEnemyModels();
    this.audio.ensure();
    this.runStats.reset();
    this._runProfileFinalized = false;
    this.persistProfile(recordRunStarted(this.profile));
    this.currency.reset();
    this.player.reset();
    this.caster.unlockedSpells = this.profile.unlockedSpells;
    this.caster.reset(this.selectedSpellId);
    this.block.reset();
    this.blink.cooldown = this.blink.baseCooldown;
    this.blink.reset();
    this.layoutEvents?.clear();
    this.statusIcons?.clear(this.world);
    this.enemyManager.clearAll();
    this.objectiveManager.clear();
    this.hitResolver.clear();
    this.vfx.clear();
    this._buildArenaLayout();
    this._placePlayerAtSafeStart(true);
    this.timers.length = 0;
    this.relics.clear();
    this.combat.nextCastDamageMult = 1;
    this.combat.nextCastLabel = "";
    this.combat.blinkStrikeTimer = 0;
    this.combat.guardTraining = 0;
    this.combat.autocastTargetMode = "forward";
    this.combat.perfectHealNext = 0;
    this.combat.castCounter = 0;
    this.combat.standingTimer = 0;
    this.combat.consecutiveSkips = 0;
    this.combat.hollowSigilApplied = false;
    this.combat.vermillionAoE = false;
    this.combat.emberedFootingReady = false;
    this.currentWaveModifier = null;
    this.currentBossPattern = null;
    this._hazardTick = 0;
    this._isBossWave = false;
    this.levelManager.reset();
    this.upgrades.reset();
    this.onboarding?.startRun();
    this._onboardingMoveTriggered = false;
    this._onboardingLookTriggered = false;
    this._onboardingCastTriggered = false;
    this._onboardingBlockTriggered = false;
    this._onboardingBlinkTriggered = false;
    this._onboardingBlinkTelegraphTriggered = false;
    this._criticalHealthWarned = false;
    this.ui.buildSpellSlots(this.caster.loadout);

    this._pendingStart = true;
    this.state = STATE.FOCUS;
    this.showFocusPrompt(t("ui.enter_arena"));
  }

  _placePlayerAtSafeStart(force = false) {
    const radius = this.player.radius || 0.8;
    const clear = (p) =>
      isCircleClear(p, radius, this.arenaBounds.obstacles) &&
      !this.arenaBounds.hazards.some((h) => pointInRect(p, h, radius));

    const current = { x: this.player.feet.x, z: this.player.feet.z };
    if (!force && clear(current)) return;

    const candidates = [
      { x: 0, z: 28 },
      { x: 0, z: -28 },
      { x: -24, z: 0 },
      { x: 24, z: 0 },
      { x: -22, z: 22 },
      { x: 22, z: -22 },
    ];
    const safe = candidates.find(clear) || { x: 0, z: 0 };
    const safeElev = getElevationAt(safe.x, safe.z, this.arenaBounds.walkableSurfaces);
    this.player.feet.set(safe.x, safeElev, safe.z);
    this.player.vel.set(0, 0, 0);
    this.player.velY = 0;
    this.player._syncCamera();
  }

  async beginPlaying(firstStart) {
    if (!this.ensurePlayerReadyForRunBoundary()) {
      this.onPlayerDeath();
      return;
    }
    this.state = STATE.PLAYING;
    this.ui.hideOverlay();
    this.ui.setHud(true);
    if (firstStart) this.audio?.playMusic("arena_calm", { loop: true, fadeIn: 1.5 });
    if (firstStart) {
      await preloadEnemyModels();
      this.levelManager.startRun();
    }
  }

  onLockChange(locked) {
    if (locked) {
      if (this.state === STATE.FOCUS) {
        const first = this._pendingStart;
        this._pendingStart = false;
        this.beginPlaying(first);
      }
    } else {
      // Lost the mouse mid-combat -> pause to a resume prompt.
      if (this.state === STATE.PLAYING) {
        this.pauseGame(false);
      }
    }
  }

  openReward(level, gold) {
    if (!this.ensurePlayerReadyForRunBoundary()) return;
    this.state = STATE.REWARD;
    this.input.exitLock();
    this.clearInputState();
    this.audio.reward();
    this.ui.toast(format("toast.gold_earned", { gold }));
    this._rewardLevel = level;
    this._rewardRerolls = 0;
    this._upgradeCountBeforeReward = this._totalUpgradesBought();
    this._rewardChoices = this.rewardGen.generate(3);
    this.renderReward();
  }

  rewardRerollCost() {
    return 20 + this._rewardLevel * 7 + this._rewardRerolls * 16;
  }

  renderReward(isReroll = false) {
    const cost = this.rewardRerollCost();
    this.ui.reward(
      this._rewardLevel,
      this._rewardChoices,
      (r) => this.pickReward(r),
      {
        gold: this.currency.gold,
        rerollCost: cost,
        canReroll: this.currency.gold >= cost,
        onReroll: () => this.rerollReward(),
        isReroll,
      },
      this.world,
    );
  }

  rerollReward() {
    const cost = this.rewardRerollCost();
    if (!this.currency.spend(cost)) {
      this.ui.toast(t("toast.not_enough_gold"));
      this.renderReward(false);
      return;
    }
    this._rewardRerolls += 1;
    this._rewardChoices = this.rewardGen.generate(3);
    this.audio.reward();
    this.ui.toast(format("toast.rerolled_rewards", { cost }));
    this.renderReward(true);
  }

  pickReward(reward) {
    if (!this.ensurePlayerReadyForRunBoundary()) {
      this.onPlayerDeath();
      return;
    }
    reward.apply(this.world);
    this.world.onRewardTaken?.(reward);
    this.ui.buildSpellSlots(this.caster.loadout);
    this.audio.reward();
    this.levelManager.continueAfterReward();
    // Spend gold on per-spell upgrades before resuming the (already spawned)
    // next wave. State stays REWARD; pointer remains released.
    this.openUpgradePanel();
  }

  openUpgradePanel(lastBoughtNode = null, lastBoughtSvc = null) {
    this.state = STATE.REWARD;
    this.clearInputState();
    this.ui.upgradePanel(
      this.world,
      (spellId, nodeId) => this.buyUpgrade(spellId, nodeId),
      (serviceId) => this.buyService(serviceId),
      () => this.resumeFromUpgrade(),
      lastBoughtNode,
      lastBoughtSvc,
    );
  }

  buyUpgrade(spellId, nodeId) {
    if (this.upgrades.buy(spellId, nodeId)) {
      this.audio.reward();
      this.ui.buildSpellSlots(this.caster.loadout);
      if (this.caster.loadout.some((s) => s.autoFire)) {
        this.onboarding?.triggerIf(this.world, "autocast_unlock");
      }
    }
    this.openUpgradePanel(nodeId, null); // re-render with fresh gold / state
  }

  serviceOptions() {
    const level = this.levelManager.level;
    const missingHp = Math.max(0, this.player.health.max - this.player.health.current);
    const healAmount = Math.min(this.player.health.max, 35 + level * 3);

    const options = [
      {
        id: "heal",
        title: t("service.heal_title"),
        description: format("service.heal_desc", { health: healAmount }),
        cost: 26 + level * 7,
        disabled: missingHp <= 0,
      },
    ];

    const hasAutoFire = this.caster.loadout.some((s) => s.autoFire);
    const forwardMode = this.combat.autocastTargetMode === "forward";
    if (hasAutoFire && forwardMode) {
      options.push({
        id: "sharpen",
        title: t("service.sharpen_title"),
        description: t("service.sharpen_desc"),
        cost: 42 + level * 6,
        disabled: false,
      });
    } else {
      options.push({
        id: "stance",
        title: t("service.stance_title"),
        description: t("service.stance_desc"),
        cost: 44 + level * 6,
        disabled: this.combat.perfectHealNext > 0,
      });
    }

    const enemies = this.enemyManager ? this.enemyManager.aliveList() : [];
    const archetypeOf = (e) => e.constructor.name.replace("Enemy", "").toLowerCase();
    const cullPriority = ["mage", "linebreaker", "ranged", "dasher", "melee"];
    const cullTarget = cullPriority.map((at) => enemies.find((e) => archetypeOf(e) === at)).find(Boolean);
    const safeToCull = !!cullTarget && enemies.length > 2;
    options.push({
      id: "cull",
      title: t("service.cull_title"),
      description: cullTarget
        ? format("service.cull_desc_specific", { archetype: archetypeOf(cullTarget) })
        : t("service.cull_desc_generic"),
      cost: 48 + level * 7,
      disabled: !safeToCull,
    });

    // If Sharpen was added but the player already has Stance Drill active for the next wave,
    // swap in a disabled Stance Drill card so its state stays readable. (Skipped to keep
    // the panel at three slots max; current order is heal + (sharpen|stance) + cull.)
    return options;
  }

  buyService(serviceId) {
    const option = this.serviceOptions().find((s) => s.id === serviceId);
    if (!option || option.disabled) {
      this.openUpgradePanel(null, null);
      return;
    }
    if (!this.currency.spend(option.cost)) {
      this.ui.toast(t("toast.not_enough_gold"));
      this.openUpgradePanel(null, null);
      return;
    }
    if (serviceId === "heal") {
      const level = this.levelManager.level;
      this.player.health.heal(35 + level * 3);
      this.ui.toast(t("toast.health_restored"));
    } else if (serviceId === "sharpen") {
      this.combat.autocastTargetMode = "lowestHp";
      this.ui.toast(t("toast.auto_cast_sharpened"));
    } else if (serviceId === "stance") {
      this.combat.perfectHealNext = 8;
      this.ui.toast(t("toast.stance_drilled"));
    } else if (serviceId === "cull") {
      const enemies = this.enemyManager.aliveList();
      const archetypeOf = (e) => e.constructor.name.replace("Enemy", "").toLowerCase();
      const cullPriority = ["mage", "linebreaker", "ranged", "dasher", "melee"];
      const target = cullPriority.map((at) => enemies.find((e) => archetypeOf(e) === at)).find(Boolean);
      if (target) {
        target.forceRemove();
        this.ui.toast(format("toast.battlefield_read", { archetype: archetypeOf(target) }));
      }
    }
    this.audio.reward();
    this.openUpgradePanel(null, serviceId); // re-render with bought service highlighted
  }

  resumeFromUpgrade() {
    if (!this.ensurePlayerReadyForRunBoundary()) {
      this.onPlayerDeath();
      return;
    }
    // Report how many upgrades were purchased this reward cycle.
    const totalAfter = this._totalUpgradesBought();
    const purchasedThisCycle = Math.max(0, totalAfter - (this._upgradeCountBeforeReward || 0));
    this.world.onPanelClosed?.(purchasedThisCycle);

    // Hollow Sigil: 2 consecutive cycles with zero upgrades -> +15% damage.
    if (this.relics.has("hollow_sigil") && !this.combat.hollowSigilApplied) {
      if (purchasedThisCycle === 0) {
        this.combat.consecutiveSkips = (this.combat.consecutiveSkips || 0) + 1;
        if (this.combat.consecutiveSkips >= 2) {
          const spell = this.caster.current;
          if (spell) {
            spell.stats.damage = Math.round(spell.stats.damage * 1.15);
            if (spell.stats.dotDamage > 0) spell.stats.dotDamage = Math.round(spell.stats.dotDamage * 1.15);
            this.combat.hollowSigilApplied = true;
            this.combat.consecutiveSkips = 0;
            this.world.onCombatProc?.(t("toast.hollow_sigil"));
          }
        }
      } else {
        this.combat.consecutiveSkips = 0;
      }
    }

    // The button click is a user gesture -> re-acquire pointer lock now.
    // Keep a Continue prompt as fallback in case the lock request is rejected.
    this.state = STATE.FOCUS;
    this._pendingStart = false;
    this.clearInputState();
    this.showFocusPrompt(t("ui.continue"));
    this.input.requestLock();
  }

  _totalUpgradesBought() {
    return Object.values(this.upgrades.purchased).reduce((sum, nodes) => sum + nodes.length, 0);
  }

  onPlayerDeath() {
    if (this.state === STATE.GAMEOVER || this.state === STATE.SUMMARY) return;
    this.state = STATE.GAMEOVER;
    this.finalizeProfileRun();
    this.block.reset();
    if (this.staffView) this.staffView.group.visible = false;
    this.input.exitLock();
    this.clearInputState();
    this.layoutEvents?.clear();
    this.objectiveManager.clear();
    this._queueDeathCleanup();
    this.audio.gameOver();
    this.ui.setHud(false);
    this.ui.clearTransientCombatUi();
    this.ui.gameOver(
      () => this.showSummary(),
      () => this.startRun(this.selectedSpellId),
      () => this.toMenu()
    );
  }

  finalizeProfileRun() {
    if (this._runProfileFinalized) return;
    telemetryTrack("run_complete", {
      levelsCleared: this.runStats.levelsCleared,
      goldEarned: this.runStats.goldEarned,
      enemiesKilled: this.runStats.enemiesKilled,
      totalDamage: Math.round(this.runStats.totalDamage),
      highestWave: Math.max(1, Math.round(this.levelManager?.level || this.runStats.levelsCleared + 1)),
      starterSpell: SPELL_DEFINITIONS[this.selectedSpellId]?.displayName,
      difficultyLevel: this.difficultyLevel,
      difficultyTier: getDifficultyTier(this.difficultyLevel)?.name,
    });
    this._runProfileFinalized = true;
    this.onboarding?.finalizeRun(this.profile);
    const highestWave = Math.max(1, Math.round(this.levelManager?.level || this.runStats.levelsCleared + 1));
    const record = createRunRecord(this.runStats, this.selectedSpellId, highestWave);

    const levelsCleared = this.runStats.levelsCleared;
    const progressResult = recordRunProgress(this.profile, levelsCleared, this.difficultyLevel);
    const finalProfile = recordRunCompleted(progressResult.profile, record, this.relics.size);
    this.persistProfile(finalProfile);

    const toasts = [];
    if (progressResult.newlyUnlocked.length > 0) {
      const names = progressResult.newlyUnlocked.map(
        (id) => SPELL_DEFINITIONS[id]?.displayName || id
      );
      toasts.push(format("toast.spell_unlocked", { names: names.join(", ") }));
    }
    if (progressResult.newlyUnlockedTiers?.length > 0) {
      const names = progressResult.newlyUnlockedTiers.map(
        (tl) => DIFFICULTY_TIERS.find((tier) => tier.level === tl)?.name || format("toast.tier_n", { n: tl })
      );
      toasts.push(format("toast.difficulty_unlocked", { names: names.join(", ") }));
    }
    if (toasts.length > 0) {
      this.ui.toast(toasts.join("  "), 3000);
    }
  }

  _queueDeathCleanup() {
    if (this._deathCleanupQueued) return;
    this._deathCleanupQueued = true;
    queueMicrotask(() => {
      this._deathCleanupQueued = false;
      if (this.state !== STATE.GAMEOVER && this.state !== STATE.SUMMARY && this.state !== STATE.MENU) return;
      this.statusIcons?.clear(this.world);
      this.enemyManager.clearAll();
      this.hitResolver.clear();
      this.vfx.clear();
      this.timers.length = 0;
    });
  }

  showSummary() {
    this.state = STATE.SUMMARY;
    this.clearInputState();
    this.ui.summary(this.runStats, this.profile, this.world, () => {
      this.state = STATE.GAMEOVER;
      this.clearInputState();
      this.ui.gameOver(
        () => this.showSummary(),
        () => this.startRun(this.selectedSpellId),
        () => this.toMenu()
      );
    });
  }

  toMenu() {
    this.state = STATE.MENU;
    this.input.exitLock();
    this.clearInputState();
    this.statusIcons?.clear(this.world);
    this.enemyManager.clearAll();
    this.layoutEvents?.clear();
    this.objectiveManager.clear();
    this.hitResolver.clear();
    this.vfx.clear();
    this.timers.length = 0;
    this.ui.setHud(false);
    this.ui.clearTransientCombatUi();
    this.showMainMenu();
  }

  // --- Loop ---------------------------------------------------------------

  _render() {
    if (this._composer && this._bloomPass?.enabled) {
      this._composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _frame() {
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.05) dt = 0.05; // clamp tab-out spikes

    this.input.pump(dt);

    if (this.input.lastInputDevice !== this._lastInputDevice) {
      this._lastInputDevice = this.input.lastInputDevice;
      // Re-render hint glyphs if a menu overlay is visible
      if (this.state !== STATE.PLAYING && this.state !== STATE.FOCUS) {
        this.ui.rebuildHints?.(this.input.lastInputDevice);
      }
    }

    if (this.state === STATE.PLAYING) {
      this._checkOnboardingTriggers();
      this._checkCriticalHealth();
      if (this.state !== STATE.PLAYING) return this._render();
      this.block.update(dt, this.input);
      this.shieldView?.update(dt, this.block);
      if (this.state !== STATE.PLAYING) return this._render();
      if (this.settings.display?.viewmodel !== false) {
        this.staffView?.update(dt, this.input, this.block);
        this.staffView.group.visible = true;
      } else {
        this.staffView.group.visible = false;
      }
      this.player.update(dt, this.input);
      if (this.state !== STATE.PLAYING) return this._render();
      this._updateArenaHazards(dt);
      if (this.state !== STATE.PLAYING) return this._render();
      this.layoutEvents.update(dt);
      if (this.state !== STATE.PLAYING) return this._render();
      this.caster.update(dt, this.input, this.world);
      if (this.state !== STATE.PLAYING) return this._render();
      this.blink.update(dt);
      if (this.combat.blinkStrikeTimer > 0) {
        this.combat.blinkStrikeTimer = Math.max(0, this.combat.blinkStrikeTimer - dt);
      }
      // Embered Footing: accumulate standing timer while stationary
      if (this.relics.has("embered_footing")) {
        const vel = this.player.vel;
        if (vel && Math.abs(vel.x) < 0.01 && Math.abs(vel.z) < 0.01) {
          this.combat.standingTimer = Math.min(3, (this.combat.standingTimer || 0) + dt);
        } else {
          this.combat.standingTimer = 0;
        }
      }
      this.enemyManager.update(dt);
      if (this.state !== STATE.PLAYING) return this._render();
      this.objectiveManager.update(dt);
      if (this.state !== STATE.PLAYING) return this._render();
      this.hitResolver.update(dt);
      if (this.state !== STATE.PLAYING) return this._render();
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const tm = this.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { tm.fn(); this.timers.splice(i, 1); }
      }
      if (this.state !== STATE.PLAYING) return this._render();
      this.vfx.update(dt);
      this.projector.updatePool(dt);
      // Status icons: project floating effect indicators above enemies (#96).
      // Called after enemy positions update (enemyManager.update above) and
      // before render so icons sit at correct screen positions this frame.
      this.statusIcons.update(this.world, this.camera);
      this.damageNumbers?.update(dt);
      this.ui.updateHud(this.world);
      // Vignette compositor: drive persistent low-HP layer (94a).
      // ESCALATION-LADDER SEAM — #101 (HUD polish) reads _lowHealthIntensity
      // from this same setHealthRatio() call to pulse the HP bar at ≤30%/≤25%.
      this.screenEffects?.setHealthRatio(this.player.health.ratio);
    } else {
      this.vfx.update(Math.min(dt, 0.033));
    }

    // Screen effects update applies shake offset to camera BEFORE render (94b).
    // removeShakeOffset() strips it after — the authoritative camera.position
    // is never permanently mutated, so aim/verticality are unaffected.
    this.screenEffects?.update(dt);
    this._render();
    this.screenEffects?.removeShakeOffset();
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (this._composer) this._composer.setSize(innerWidth, innerHeight);
    this.projector?.resize();
  }

  _targetPixelRatio() {
    const scale = this.settings.performance?.renderScale ?? 1;
    return Math.max(0.6, Math.min(2, devicePixelRatio * scale));
  }

  _applyRendererSettings() {
    if (!this.renderer) return;
    const pr = this._targetPixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight);
    if (this._composer) this._composer.setPixelRatio(pr);
  }

  applyFullscreenPreference() {
    const wantsFullscreen = !!this.settings.display?.fullscreen;
    const bridge = window.arcaneWindow;

    if (bridge?.setFullscreen) {
      bridge.setFullscreen(wantsFullscreen).catch(() => {});
      return;
    }

    if (wantsFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch?.(() => {});
    } else if (!wantsFullscreen && document.fullscreenElement) {
      document.exitFullscreen?.().catch?.(() => {});
    }
  }

  _updateArenaHazards(dt) {
    if (this._hazardMeshes && this._hazardMeshes.length) {
      const t = performance.now() * 0.001;
      for (const h of this._hazardMeshes) {
        const hazard = h.hazard;
        const active = hazard?.dynamicActive;
        const warn = hazard?.dynamicWarn;
        const speed = active ? 8 : warn ? 6 : 3;
        const pulse = active
          ? 0.72 + Math.sin(t * speed) * 0.18
          : warn
            ? 0.58 + Math.sin(t * speed) * 0.16
            : 0.35 + Math.sin(t * speed) * 0.15;
        h.mat.opacity = pulse;
        h.mat.color.setHex(active ? 0x8ffff1 : warn ? 0xffcf4d : 0x36e8c8);
      }
    }
    this._hazardTick = Math.max(0, (this._hazardTick || 0) - dt);
    this._pitTick = Math.max(0, (this._pitTick || 0) - dt);
    if (!this.arenaBounds.hazards.length) { this._inHazardLast = false; return; }
    const feet = this.player.feet;

    // --- Rift hazard damage (player only) ---
    const rifts = this.arenaBounds.hazards.filter((h) => !h.isPit);
    const riftsAtFeet = rifts.length ? rifts.filter((h) => rectContainsPoint(feet, h)) : [];
    if (riftsAtFeet.length) {
      if (!this._inHazardLast) {
        this._inHazardLast = true;
        this.vfx.shock(this.player.position, 0x47ffd2, 1.6, 0.35);
        this.vfx.ring(this.player.position, 1.2, 0x7fffe6, 0.55);
        if (!this._warnedHazardThisWave) {
          this._warnedHazardThisWave = true;
          this.ui.toast(t("toast.rift_damage"), 900);
          this.onboarding?.triggerIf(this.world, "hazard_step");
        }
      }
      // Riftborn Mantle: heal 1 HP/s while standing in a rift hazard
      if (this.relics.has("riftborn_mantle")) {
        this.combat.hazardHealAccum = (this.combat.hazardHealAccum || 0) + dt;
        if (this.combat.hazardHealAccum >= 1) {
          this.combat.hazardHealAccum -= 1;
          this.player.health.heal(1);
        }
      }
      if (this._hazardTick <= 0) {
        this._hazardTick = 0.45;
        const damageMult = Math.max(1, ...riftsAtFeet.map((h) => h.dynamicDamageMult || 1));
        const spellName = damageMult > 1 ? "Rift Surge" : "Phase Rift";
        applyDamage(this.player, (4 + this.levelManager.level * 0.35) * damageMult, {
          owner: "enemy", spellId: "arena_rift", spellName,
        });
        this.world.onPlayerHurt?.();
        this.vfx.flash(this.player.position, 0x7fffe6, 1.4, 0.22);
        this.vfx.shock(this.player.position, 0x7fffe6, 2.2, 0.28);
      }
    } else {
      this._inHazardLast = false;
    }

    // --- Pit damage (player + enemies) ---
    const pits = this.arenaBounds.hazards.filter((h) => h.isPit);
    if (pits.length && this._pitTick <= 0) {
      this._pitTick = 0.7;
      const pitDmg = 3 + this.levelManager.level * 0.25;
      // Player in pit
      if (pits.some((h) => rectContainsPoint(feet, h))) {
        applyDamage(this.player, pitDmg, { owner: "enemy", spellId: "arena_pit", spellName: "Pit" });
        this.world.onPlayerHurt?.();
      }
      // Enemies in pit
      if (this.enemyManager) {
        for (const e of this.enemyManager.aliveList()) {
          if (pits.some((h) => rectContainsPoint(e.mesh.position, h))) {
            applyDamage(e, pitDmg, { owner: "enemy", spellId: "arena_pit", spellName: "Pit" });
            this.world.vfx.burst(e.mesh.position, 0x7a30a0, 4, 2, 0.4, 0.12);
          }
        }
      }
    }
  }

  _checkCriticalHealth() {
    if (!this._criticalHealthWarned && this.player?.health?.ratio < 0.25) {
      this._criticalHealthWarned = true;
      this.captions?.show(t("toast.critical_health"));
    }
    if (this._criticalHealthWarned && this.player?.health?.ratio >= 0.5) {
      this._criticalHealthWarned = false;
    }
  }

  _checkOnboardingTriggers() {
    if (this.state !== STATE.PLAYING) return;

    if (!this._onboardingMoveTriggered) {
      const moving = this.input.down("KeyW") || this.input.down("KeyA") ||
                     this.input.down("KeyS") || this.input.down("KeyD") ||
                     Math.abs(this.input.leftStickX) > 0.18 ||
                     Math.abs(this.input.leftStickY) > 0.18;
      if (moving) {
        this._onboardingMoveTriggered = true;
        this.onboarding?.triggerIf(this.world, "first_move");
      }
    }

    if (!this._onboardingLookTriggered) {
      const looking = this.input.mouseDX !== 0 || this.input.mouseDY !== 0;
      if (looking) {
        this._onboardingLookTriggered = true;
        this.onboarding?.triggerIf(this.world, "first_look");
      }
    }

    if (!this._onboardingCastTriggered && this.input.firing) {
      this._onboardingCastTriggered = true;
      this.onboarding?.triggerIf(this.world, "first_cast");
    }

    if (!this._onboardingBlockTriggered) {
      const projs = this.hitResolver?.projectiles;
      if (projs && projs.some((p) => p.faction !== "player")) {
        this._onboardingBlockTriggered = true;
        this.onboarding?.triggerIf(this.world, "block_incoming");
      }
    }

    if (!this._onboardingBlinkTriggered) {
      const hp = this.player?.health;
      if (hp && hp.current > 0 && hp.ratio < 0.6) {
        this._onboardingBlinkTriggered = true;
        this.onboarding?.triggerIf(this.world, "blink_low_hp");
      }
    }

    if (!this._onboardingBlinkTelegraphTriggered) {
      const dasherCount = this.combat.dasherTelegraphCount || 0;
      const blinkUsed = this.blink.timer > 0;
      if (dasherCount >= 3 && !blinkUsed) {
        this._onboardingBlinkTelegraphTriggered = true;
        this.onboarding?.note(this.world, "blink_telegraph");
      }
    }

  }
}
