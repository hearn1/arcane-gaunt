import * as THREE from "three";
import { RunStats } from "./RunStats.js";
import { Currency } from "./Currency.js";
import { AudioSys } from "./Audio.js";
import { VFX } from "./VFX.js";
import { Input } from "./Input.js";
import { DEFAULT_SETTINGS, getStorageMeta, sanitizeSettings, saveSettings } from "./Settings.js";
import {
  cloneDefaultProfile,
  createRunRecord,
  recordRunCompleted,
  recordRunStarted,
  resetProfile,
  sanitizeProfile,
  saveProfile,
} from "./Profile.js";
import { applyDamage, setRunStats } from "./Damage.js";
import {
  findSafeDestination,
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
import { HitResolver } from "../projectile/HitResolver.js";
import { preloadEnemyModels } from "../enemies/Enemy.js";
import { EnemyManager } from "../enemies/EnemyManager.js";
import { LevelManager } from "../level/LevelManager.js";
import { ObjectiveManager } from "../level/ObjectiveManager.js";
import { LayoutEventManager } from "../level/LayoutEventManager.js";
import { RewardGenerator } from "../rewards/RewardGenerator.js";
import { UpgradeManager } from "../spells/UpgradeManager.js";
import { SPELL_DEFINITIONS, STARTER_SPELL_ID } from "../spells/spellDefinitions.js";
import { castSpell } from "../spells/Effects.js";
import { UI } from "../ui/ui.js";
import { Onboarding } from "../ui/Onboarding.js";
import { reportFatal } from "./ErrorReporting.js";

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
  });
}

export class Game {
  constructor(initialSettings = DEFAULT_SETTINGS, initialProfile = cloneDefaultProfile()) {
    this.state = STATE.MENU;
    this.arenaBounds = { half: 40, h: 14, obstacles: [], hazards: [] };
    this.selectedSpellId = STARTER_SPELL_ID;
    this.settings = sanitizeSettings(initialSettings);
    this.profile = sanitizeProfile(initialProfile);
    this.storageMeta = null;
    this._runProfileFinalized = true;

    // Renderer / scene / camera.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.setSize(innerWidth, innerHeight);
    document.getElementById("app").appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a14);
    this.scene.fog = new THREE.Fog(0x0a0a14, 45, 110);

    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.1, 400);

    this._buildArena();

    // Systems.
    this.runStats = new RunStats();
    setRunStats(this.runStats);
    this.currency = new Currency(this.runStats);
    this.audio = new AudioSys(this.settings.audio);
    this.vfx = new VFX(this.scene);
    this.vfx.setDensity(this.settings.performance.vfxDensity);
    this.input = new Input(this.renderer.domElement);
    this.player = new PlayerController(this.camera, this.arenaBounds);
    this.player.setMouseSensitivity(this.settings.controls.mouseSensitivity);
    this.caster = new SpellCaster(this.player);
    this.block = new Block(this.player.health);
    this.player.block = this.block;
    this.player.health.mitigation = (amt) => this.block.mitigate(amt);
    this.ui = new UI();
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
      get blink() { return self.blink; },
      get arenaLayoutName() { return self.arenaLayoutName; },
      get enemyManager() { return self.enemyManager; },
      get objectiveManager() { return self.objectiveManager; },
      get hitResolver() { return self.hitResolver; },
      get levelManager() { return self.levelManager; },
      get layoutEvents() { return self.layoutEvents; },
      get upgrades() { return self.upgrades; },
      get ui() { return self.ui; },
      get currentWaveModifier() { return self.currentWaveModifier; },
      set currentWaveModifier(mod) { self.currentWaveModifier = mod; },
      get currentBossPattern() { return self.currentBossPattern; },
      set currentBossPattern(p) { self.currentBossPattern = p; },
      serviceOptions: () => self.serviceOptions(),
      getEnemies: () => self.enemyManager.aliveList(),
      getObjectiveTargets: () => self.objectiveManager?.targets() || [],
      castEnemySpell: (spell, from, dir) => castSpell(self.world, spell, from, dir, "enemy"),
      after: (sec, fn) => self.timers.push({ t: sec, fn }),
      layoutToast: (msg, ms = 1200) => self.ui.toast(msg, ms),
      isPlayerAlive: () => self.isPlayerAlive(),
      onPlayerHurt: () => { self.ui.hurtFlash(); self.audio.playerHurt(); },
      openReward: (lvl, gold) => self.openReward(lvl, gold),
      onWaveStarted: (lvl, modifier, bossPattern, objective) => {
        self._warnedHazardThisWave = false;
        self.ui.showWaveBanner(lvl, modifier, self.arenaLayoutName, bossPattern, objective);
        if (bossPattern) {
          self.vfx.shock(self.player.position, 0xff5edb, 5.2, 0.45);
          self.audio?.telegraphSurge?.();
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
    this.objectiveManager = new ObjectiveManager(this.world);
    this.layoutEvents = new LayoutEventManager(this.world);
    this.levelManager = new LevelManager(this.world);
    this.rewardGen = new RewardGenerator(this.world);
    this.upgrades = new UpgradeManager(this.world);

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

    this.showMainMenu();

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

  _buildArena() {
    const half = this.arenaBounds.half;
    this.scene.add(new THREE.HemisphereLight(0x9088c0, 0x141022, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(20, 40, 12);
    this.scene.add(dir);

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
    this.scene.add(floor);
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
    this.arenaBounds.layoutFeatures = { gates: [], hazards: this.arenaBounds.hazards };
    this._hazardMeshes = [];
    this._inHazardLast = false;

    const layouts = ["lanes", "cross", "cover", "gates", "rift"];
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
    } else {
      addPillar(-16, -16);
      addPillar(16, -16);
      addPillar(-16, 16);
      addPillar(16, 16);
    }
  }

  // --- Flow ---------------------------------------------------------------

  clearInputState() {
    this.input?.clearKeys();
  }

  showMainMenu() {
    this.clearInputState();
    this.ui.mainMenu(
      (spellId) => this.startRun(spellId),
      this.selectedSpellId,
      () => this.openSettings(() => this.showMainMenu()),
      this.profile,
      () => this.confirmResetProfile(),
    );
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
    this._applyRendererSettings();
  }

  updateSettings(nextSettings) {
    const previousFullscreen = !!this.settings.display?.fullscreen;
    this.settings = deepMergeSettings(this.settings, nextSettings);
    this.applySettings();
    if (previousFullscreen !== !!this.settings.display?.fullscreen) {
      this.applyFullscreenPreference();
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
    this.ui.settingsMenu(
      this.settings,
      (settings) => this.updateSettings(settings),
      () => {
        this.flushSettings();
        onBack();
      },
      this.storageMeta,
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
        this.ui.toast("Run records reset. Settings kept.", 1800);
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
    this.caster.reset(this.selectedSpellId);
    this.block.reset();
    this.blink.cooldown = this.blink.baseCooldown;
    this.blink.reset();
    this.layoutEvents?.clear();
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
    this.levelManager.reset();
    this.upgrades.reset();
    this.onboarding?.startRun();
    this._onboardingMoveTriggered = false;
    this._onboardingLookTriggered = false;
    this._onboardingCastTriggered = false;
    this._onboardingBlockTriggered = false;
    this._onboardingBlinkTriggered = false;
    this.ui.buildSpellSlots(this.caster.loadout);

    this._pendingStart = true;
    this.state = STATE.FOCUS;
    this.showFocusPrompt("Enter the Arena");
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
    this.player.feet.set(safe.x, 0, safe.z);
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
    this.ui.toast(`+${gold} gold`);
    this._rewardLevel = level;
    this._rewardRerolls = 0;
    this._upgradeCountBeforeReward = this._totalUpgradesBought();
    this._rewardChoices = this.rewardGen.generate(3);
    this.renderReward();
  }

  rewardRerollCost() {
    return 20 + this._rewardLevel * 7 + this._rewardRerolls * 16;
  }

  renderReward() {
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
      },
      this.world,
    );
  }

  rerollReward() {
    const cost = this.rewardRerollCost();
    if (!this.currency.spend(cost)) {
      this.ui.toast("Not enough gold");
      this.renderReward();
      return;
    }
    this._rewardRerolls += 1;
    this._rewardChoices = this.rewardGen.generate(3);
    this.audio.reward();
    this.ui.toast(`Rerolled rewards (-${cost}g)`);
    this.renderReward();
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

  openUpgradePanel() {
    this.state = STATE.REWARD;
    this.clearInputState();
    this.ui.upgradePanel(
      this.world,
      (spellId, nodeId) => this.buyUpgrade(spellId, nodeId),
      (serviceId) => this.buyService(serviceId),
      () => this.resumeFromUpgrade(),
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
    this.openUpgradePanel(); // re-render with fresh gold / state
  }

  serviceOptions() {
    const level = this.levelManager.level;
    const missingHp = Math.max(0, this.player.health.max - this.player.health.current);
    const healAmount = Math.min(this.player.health.max, 35 + level * 3);

    const options = [
      {
        id: "heal",
        title: "Field Dressing",
        description: `Restore ${healAmount} health before the next wave.`,
        cost: 26 + level * 7,
        disabled: missingHp <= 0,
      },
    ];

    const hasAutoFire = this.caster.loadout.some((s) => s.autoFire);
    const forwardMode = this.combat.autocastTargetMode === "forward";
    if (hasAutoFire && forwardMode) {
      options.push({
        id: "sharpen",
        title: "Sharpen Auto-Cast",
        description: "Your Auto-Casts now target the lowest-HP enemy in range.",
        cost: 42 + level * 6,
        disabled: false,
      });
    } else {
      // Fall back to Stance Drill in slot 2 so the panel keeps three identity options
      // when Sharpen isn't applicable.
      options.push({
        id: "stance",
        title: "Stance Drill",
        description: "This wave only: perfect blocks heal 8 HP.",
        cost: 44 + level * 6,
        disabled: this.combat.perfectHealNext > 0,
      });
    }

    // Battlefield Read: cull the most dangerous enemy from the (already spawned) next wave.
    const enemies = this.enemyManager ? this.enemyManager.aliveList() : [];
    const archetypeOf = (e) => e.constructor.name.replace("Enemy", "").toLowerCase();
    const cullPriority = ["mage", "linebreaker", "ranged", "dasher", "melee"];
    const cullTarget = cullPriority.map((t) => enemies.find((e) => archetypeOf(e) === t)).find(Boolean);
    const safeToCull = !!cullTarget && enemies.length > 2;
    options.push({
      id: "cull",
      title: "Battlefield Read",
      description: cullTarget
        ? `Remove one ${archetypeOf(cullTarget)} from the next wave before it begins.`
        : "Remove one of the most dangerous enemies from the next wave.",
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
      this.openUpgradePanel();
      return;
    }
    if (!this.currency.spend(option.cost)) {
      this.ui.toast("Not enough gold");
      this.openUpgradePanel();
      return;
    }
    if (serviceId === "heal") {
      const level = this.levelManager.level;
      this.player.health.heal(35 + level * 3);
      this.ui.toast("Health restored");
    } else if (serviceId === "sharpen") {
      this.combat.autocastTargetMode = "lowestHp";
      this.ui.toast("Auto-Cast sharpened");
    } else if (serviceId === "stance") {
      this.combat.perfectHealNext = 8;
      this.ui.toast("Stance drilled — perfect blocks heal 8 HP this wave");
    } else if (serviceId === "cull") {
      const enemies = this.enemyManager.aliveList();
      const archetypeOf = (e) => e.constructor.name.replace("Enemy", "").toLowerCase();
      const cullPriority = ["mage", "linebreaker", "ranged", "dasher", "melee"];
      const target = cullPriority.map((t) => enemies.find((e) => archetypeOf(e) === t)).find(Boolean);
      if (target) {
        target.forceRemove();
        this.ui.toast(`Battlefield read — one ${archetypeOf(target)} removed`);
      }
    }
    this.audio.reward();
    this.openUpgradePanel();
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
            this.world.onCombatProc?.("Hollow Sigil — focus rewarded");
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
    this.showFocusPrompt("Continue");
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
    this._runProfileFinalized = true;
    this.onboarding?.finalizeRun(this.profile);
    const highestWave = Math.max(1, Math.round(this.levelManager?.level || this.runStats.levelsCleared + 1));
    const record = createRunRecord(this.runStats, this.selectedSpellId, highestWave);
    this.persistProfile(recordRunCompleted(this.profile, record));
  }

  _queueDeathCleanup() {
    if (this._deathCleanupQueued) return;
    this._deathCleanupQueued = true;
    queueMicrotask(() => {
      this._deathCleanupQueued = false;
      if (this.state !== STATE.GAMEOVER && this.state !== STATE.SUMMARY && this.state !== STATE.MENU) return;
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
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
      this.block.update(dt, this.input);
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
      this.player.update(dt, this.input);
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
      this._updateArenaHazards(dt);
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
      this.layoutEvents.update(dt);
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
      this.caster.update(dt, this.input, this.world);
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
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
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
      this.objectiveManager.update(dt);
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
      this.hitResolver.update(dt);
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const tm = this.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { tm.fn(); this.timers.splice(i, 1); }
      }
      if (this.state !== STATE.PLAYING) return this.renderer.render(this.scene, this.camera);
      this.vfx.update(dt);
      this.ui.updateHud(this.world);
    } else {
      this.vfx.update(Math.min(dt, 0.033));
    }

    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  _targetPixelRatio() {
    const scale = this.settings.performance?.renderScale ?? 1;
    return Math.max(0.6, Math.min(2, devicePixelRatio * scale));
  }

  _applyRendererSettings() {
    if (!this.renderer) return;
    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.setSize(innerWidth, innerHeight);
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
    if (!this.arenaBounds.hazards.length) { this._inHazardLast = false; return; }
    const feet = this.player.feet;
    const hazardsAtFeet = this.arenaBounds.hazards.filter((h) => rectContainsPoint(feet, h));
    if (!hazardsAtFeet.length) { this._inHazardLast = false; return; }
    if (!this._inHazardLast) {
      this._inHazardLast = true;
      this.vfx.shock(this.player.position, 0x47ffd2, 1.6, 0.35);
      this.vfx.ring(this.player.position, 1.2, 0x7fffe6, 0.55);
      if (!this._warnedHazardThisWave) {
        this._warnedHazardThisWave = true;
        this.ui.toast("Rift damage — move!", 900);
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
    if (this._hazardTick > 0) return;
    this._hazardTick = 0.45;
    const damageMult = Math.max(1, ...hazardsAtFeet.map((h) => h.dynamicDamageMult || 1));
    const spellName = damageMult > 1 ? "Rift Surge" : "Phase Rift";
    applyDamage(this.player, (4 + this.levelManager.level * 0.35) * damageMult, {
      owner: "enemy",
      spellId: "arena_rift",
      spellName,
    });
    this.world.onPlayerHurt?.();
    this.vfx.flash(this.player.position, 0x7fffe6, 1.4, 0.22);
    this.vfx.shock(this.player.position, 0x7fffe6, 2.2, 0.28);
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

  }
}
