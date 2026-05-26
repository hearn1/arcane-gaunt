import { SPELL_DEFINITIONS, STARTER_SPELL_ID } from "../spells/spellDefinitions.js";
import { attach } from "./uiNav.js";

const PROMPTS = {
  move: { kbm: "WASD", gamepad: "Left Stick" },
  look: { kbm: "Mouse", gamepad: "Right Stick" },
  cast: { kbm: "Left Click", gamepad: "RT" },
  block: { kbm: "Right Click (hold)", gamepad: "LT (hold)" },
  blink: { kbm: "Shift / Q", gamepad: "B" },
  jump: { kbm: "Space", gamepad: "A" },
  pause: { kbm: "Esc", gamepad: "Start" },
  cycle: { kbm: "Mouse Wheel", gamepad: "LB / RB" },
  select: { kbm: "Number Keys", gamepad: "D-Pad" },
  confirm: { kbm: "Left Click", gamepad: "A" },
  back: { kbm: "Esc", gamepad: "B" },
};

function devicePrompt(key) {
  const game = window.__arcaneGame;
  const device = game?.input?.lastInputDevice || "kbm";
  return PROMPTS[key]?.[device] || PROMPTS[key]?.kbm || key;
}

// All DOM/CSS UI. Reads state and calls back into managers via callbacks.
// Contains no gameplay logic.
export class UI {
  constructor() {
    this.root = document.getElementById("ui-root");
    this.hud = document.getElementById("hud");
    this.crosshair = document.getElementById("crosshair");
    this.toastEl = document.getElementById("toast");
    this.onboardingToastEl = document.getElementById("onboarding-toast");
    this.vignette = document.getElementById("vignette");

    this.hpFill = document.getElementById("hp-fill");
    this.hpText = document.getElementById("hp-text");
    this.stamFill = document.getElementById("stam-fill");
    this.stamText = document.getElementById("stam-text");
    this.blockInd = document.getElementById("block-ind");
    this.lvlEl = document.getElementById("hud-level");
    this.goldEl = document.getElementById("hud-gold");
    this.enemyEl = document.getElementById("hud-enemies");
    this.modEl = document.getElementById("hud-modifier");
    this.modDescEl = document.getElementById("hud-modifier-desc");
    this.objEl = document.getElementById("hud-objective");
    this.objDescEl = document.getElementById("hud-objective-desc");
    this.spellsEl = document.getElementById("hud-spells");
    this.blinkEl = document.getElementById("blink-ind");

    this.waveBannerEl = document.getElementById("wave-banner");
    this.wbTitleEl = this.waveBannerEl?.querySelector(".wb-title");
    this.wbLayoutEl = this.waveBannerEl?.querySelector(".wb-layout");
    this.wbModNameEl = this.waveBannerEl?.querySelector(".wb-mod-name");
    this.wbModDescEl = this.waveBannerEl?.querySelector(".wb-mod-desc");
    this.wbBossNameEl = this.waveBannerEl?.querySelector(".wb-boss-name");
    this.wbBossSubEl = this.waveBannerEl?.querySelector(".wb-boss-sub");
    this.wbObjNameEl = this.waveBannerEl?.querySelector(".wb-obj-name");
    this.wbObjDescEl = this.waveBannerEl?.querySelector(".wb-obj-desc");

    this.bossBarEl = document.getElementById("boss-bar");
    this.bossBarFill = document.getElementById("bb-fill");
    this.bossBarName = document.getElementById("bb-name");

    this._navDetach = null;
    this._spellSlots = [];
  }

  showWaveBanner(level, modifier, layoutName = "", bossPattern = null, objective = null) {
    if (!this.waveBannerEl) return;
    if (this.wbTitleEl) this.wbTitleEl.textContent = `Wave ${level}`;
    if (this.wbLayoutEl) this.wbLayoutEl.textContent = layoutName ? `Arena: ${layoutName}` : "";
    if (this.wbModNameEl) this.wbModNameEl.textContent = modifier?.name || "";
    if (this.wbModDescEl) this.wbModDescEl.textContent = modifier?.description || "";
    if (this.wbBossNameEl) this.wbBossNameEl.textContent = bossPattern?.name || "";
    if (this.wbBossSubEl) this.wbBossSubEl.textContent = bossPattern?.subtitle || "";
    if (this.wbObjNameEl) this.wbObjNameEl.textContent = objective?.name || "";
    if (this.wbObjDescEl) this.wbObjDescEl.textContent = objective?.description || "";
    this.waveBannerEl.classList.toggle("has-mod", !!modifier);
    this.waveBannerEl.classList.toggle("has-boss", !!bossPattern);
    this.waveBannerEl.classList.toggle("has-objective", !!objective);
    this.waveBannerEl.classList.add("show");
    clearTimeout(this._wb);
    this._wb = setTimeout(() => this.waveBannerEl.classList.remove("show"), bossPattern ? 3000 : 2500);
  }

  updateBossBar(world) {
    if (!this.bossBarEl) return;
    const pat = world.currentBossPattern;
    if (!pat) { this.bossBarEl.classList.remove("show"); return; }
    const bosses = world.enemyManager.aliveList().filter((e) => e.isBoss);
    if (bosses.length === 0) { this.bossBarEl.classList.remove("show"); return; }
    const cur = bosses.reduce((s, e) => s + e.health.current, 0);
    const max = bosses.reduce((s, e) => s + e.health.max, 0);
    const pct = max > 0 ? Math.max(0, (cur / max) * 100) : 0;
    this.bossBarFill.style.width = pct + "%";
    this.bossBarName.textContent = pat.name + (bosses.length > 1 ? `  (${bosses.length})` : "");
    this.bossBarEl.classList.add("show");
  }

  _detachNav() { this._navDetach?.(); this._navDetach = null; }
  _show(html) { this._detachNav(); this.root.classList.remove("hidden"); this.root.innerHTML = html; }
  hideOverlay() { this._detachNav(); this.root.classList.add("hidden"); this.root.innerHTML = ""; }
  setHud(on) {
    this.hud.classList.toggle("active", on);
    this.crosshair.classList.toggle("active", on);
  }

  rebuildHints() {
    // Stub: device-aware prompts are resolved at render time via devicePrompt().
    // If the device changes while a static screen is shown, re-render that screen.
    // Currently no overlay screens are long-lived enough to need this.
  }

  clearTransientCombatUi() {
    this._detachNav();
    clearTimeout(this._wb);
    clearTimeout(this._tt);
    clearTimeout(this._ot);
    this.waveBannerEl?.classList.remove("show", "has-mod", "has-boss", "has-objective");
    this.bossBarEl?.classList.remove("show");
    this.toastEl?.classList.remove("show");
    this.onboardingToastEl?.classList.remove("show");
    this.blockInd?.classList.remove("active", "perfect");
    this.crosshair?.classList.remove("blocking", "perfect-window", "perfect-hit", "block-hit");
  }

  toast(msg, ms = 1800) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toastEl.classList.remove("show"), ms);
  }

  showOnboardingToast(text) {
    if (!this.onboardingToastEl) return;
    this.onboardingToastEl.textContent = text;
    this.onboardingToastEl.classList.add("show");
    clearTimeout(this._ot);
    this._ot = setTimeout(() => this.onboardingToastEl.classList.remove("show"), 4000);
  }

  dismissOnboardingToast() {
    if (!this.onboardingToastEl) return;
    clearTimeout(this._ot);
    this.onboardingToastEl.classList.remove("show");
  }

  hurtFlash() {
    this.vignette.style.boxShadow = "inset 0 0 220px 70px rgba(180,20,40,0.55)";
    clearTimeout(this._vt);
    this._vt = setTimeout(() => {
      this.vignette.style.boxShadow = "inset 0 0 220px 60px rgba(180,20,40,0)";
    }, 160);
  }

  // --- Screens ------------------------------------------------------------

  mainMenu(onStart, selectedSpellId = STARTER_SPELL_ID, onSettings = null, profile = null, onResetProfile = null) {
    this.setHud(false);
    const spellOptions = Object.values(SPELL_DEFINITIONS).map((def) => `
      <button class="spell-choice ${def.id === selectedSpellId ? "selected" : ""}" data-spell="${def.id}" data-nav>
        <span class="spell-choice-name">${def.displayName}</span>
        <span class="spell-choice-desc">${def.description}</span>
      </button>
    `).join("");
    const hasMulti = Object.keys(SPELL_DEFINITIONS).length > 1;
    const settingsButton = onSettings
      ? `<button class="btn secondary" id="btn-settings" data-nav>Settings</button>`
      : "";
    const resetButton = onResetProfile
      ? `<button class="btn secondary" id="btn-reset-profile" data-nav>Reset Records</button>`
      : "";
    const records = this._profileSnapshot(profile);
    this._show(`
      <h1 class="title">ARCANEGAUNT</h1>
      <div class="subtitle">Choose your run spell</div>
      <div id="spell-select">${spellOptions}</div>
      <div class="profile-strip">
        <div><span class="profile-label">Best</span><b>${records.best}</b></div>
        <div><span class="profile-label">Runs</span><b>${records.runs}</b></div>
        <div><span class="profile-label">Kills</span><b>${records.kills}</b></div>
        <div><span class="profile-label">Damage</span><b>${records.damage}</b></div>
      </div>
      <div class="btn-row">
        <button class="btn" id="btn-start" data-nav>Start Run</button>
        ${settingsButton}
        ${resetButton}
      </div>
      <div class="hint">
        <b>${devicePrompt("move")}</b> move &nbsp;&middot;&nbsp; <b>${devicePrompt("look")}</b> look &nbsp;&middot;&nbsp;
        <b>${devicePrompt("cast")}</b> cast &nbsp;&middot;&nbsp; <b>${devicePrompt("block")}</b> block<br/>
        <b>${devicePrompt("jump")}</b> jump &nbsp;&middot;&nbsp; <b>${devicePrompt("blink")}</b> blink &nbsp;&middot;&nbsp;
        <b>${devicePrompt("pause")}</b> ${hasMulti ? "release mouse / pause" : "release mouse"}
      </div>
      <div class="credits-note">Audio, arena textures, and enemy models: Kenney.nl, ambientCG, and Quaternius (CC0). See CREDITS.md.</div>
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
    });
    let selected = SPELL_DEFINITIONS[selectedSpellId] ? selectedSpellId : STARTER_SPELL_ID;
    this.root.querySelectorAll(".spell-choice").forEach((el) => {
      el.onclick = () => {
        selected = el.dataset.spell;
        this.root.querySelectorAll(".spell-choice").forEach((card) => {
          card.classList.toggle("selected", card === el);
        });
      };
    });
    document.getElementById("btn-start").onclick = () => onStart(selected);
    const btnSettings = document.getElementById("btn-settings");
    if (btnSettings && onSettings) btnSettings.onclick = onSettings;
    const btnReset = document.getElementById("btn-reset-profile");
    if (btnReset && onResetProfile) btnReset.onclick = onResetProfile;
  }

  _profileSnapshot(profile) {
    const totals = profile?.totals || {};
    const best = profile?.bestRun || {};
    return {
      best: best.levelsCleared > 0 || best.highestWave > 0
        ? `Wave ${best.highestWave || best.levelsCleared + 1} / ${best.levelsCleared || 0} cleared`
        : "No runs yet",
      runs: `${totals.runsCompleted || 0}/${totals.runsStarted || 0}`,
      kills: this._fmt(totals.enemiesKilled || 0),
      damage: this._fmt(totals.totalDamage || 0),
    };
  }

  _fmt(value) {
    return Math.max(0, Math.round(Number(value) || 0)).toLocaleString();
  }

  focusPrompt(onFocus, label = "Click to play", actions = {}) {
    this.setHud(false);
    const settingsButton = actions.onSettings
      ? `<button class="btn secondary" id="btn-focus-settings" data-nav>Settings</button>`
      : "";
    const menuButton = actions.onMenu
      ? `<button class="btn secondary" id="btn-focus-menu" data-nav>Main Menu</button>`
      : "";
    this._show(`
      <h1 class="title" style="font-size:42px;">ArcaneGaunt</h1>
      <div class="btn-row">
        <button class="btn" id="btn-focus" data-nav>${label}</button>
        ${settingsButton}
        ${menuButton}
      </div>
      <div class="hint">Press <b>${devicePrompt("confirm")}</b> to capture mouse &nbsp;&middot;&nbsp; <b>${devicePrompt("pause")}</b> releases it.</div>
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
    });
    document.getElementById("btn-focus").onclick = onFocus;
    const btnSettings = document.getElementById("btn-focus-settings");
    if (btnSettings && actions.onSettings) btnSettings.onclick = actions.onSettings;
    const btnMenu = document.getElementById("btn-focus-menu");
    if (btnMenu && actions.onMenu) btnMenu.onclick = actions.onMenu;
  }

  pauseMenu(onResume, onSettings, onMenu) {
    this.setHud(false);
    this._show(`
      <h1 class="title" style="font-size:42px;">Paused</h1>
      <div class="btn-row">
        <button class="btn" id="btn-pause-resume" data-nav>Resume</button>
        <button class="btn secondary" id="btn-pause-settings" data-nav>Settings</button>
        <button class="btn secondary" id="btn-pause-menu" data-nav>Main Menu</button>
      </div>
      <div class="hint">Combat is paused while this menu is open. <b>${devicePrompt("back")}</b> to resume.</div>
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
      onBack: onResume,
    });
    document.getElementById("btn-pause-resume").onclick = onResume;
    document.getElementById("btn-pause-settings").onclick = onSettings;
    document.getElementById("btn-pause-menu").onclick = onMenu;
  }

  confirmResetProfile(profile, onConfirm, onCancel) {
    this.setHud(false);
    const totals = profile?.totals || {};
    this._show(`
      <h1 class="title" style="font-size:40px;color:#ffcf4d;-webkit-text-fill-color:#ffcf4d;">Reset Records?</h1>
      <div class="reset-copy">
        This clears best run and lifetime totals (${totals.runsStarted || 0} runs started).
        Settings are not changed.
      </div>
      <div class="btn-row">
        <button class="btn danger" id="btn-reset-confirm" data-nav>Reset Run Records</button>
        <button class="btn secondary" id="btn-reset-cancel" data-nav>Cancel</button>
      </div>
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
      onBack: onCancel,
    });
    document.getElementById("btn-reset-confirm").onclick = onConfirm;
    document.getElementById("btn-reset-cancel").onclick = onCancel;
  }

  settingsMenu(settings, onChange, onBack, storageMeta = null) {
    this.setHud(false);
    const volumePct = Math.round((settings.audio?.volume ?? 0.35) * 100);
    const sensitivityPct = Math.round((settings.controls?.mouseSensitivity ?? 1) * 100);
    const stickSensPct = Math.round((settings.controls?.stickLookSensitivity ?? 1) * 100);
    const invertY = !!settings.controls?.invertY;
    const muted = !!settings.audio?.muted;
    const fullscreen = !!settings.display?.fullscreen;
    const renderScale = settings.performance?.renderScale ?? 1;
    const vfxDensity = settings.performance?.vfxDensity || "full";
    const storageText = storageMeta?.path
      ? `Storage: ${storageMeta.path}`
      : `Storage: ${storageMeta?.key || "local settings"}`;
    this._show(`
      <h1 class="title" style="font-size:40px;">Settings</h1>
      <div id="settings-panel">
        <label class="settings-toggle">
          <input type="checkbox" id="set-muted" ${muted ? "checked" : ""}/>
          <span>Mute audio</span>
        </label>
        <div class="settings-row">
          <label for="set-volume">Volume</label>
          <input id="set-volume" type="range" min="0" max="100" step="1" value="${volumePct}"/>
          <span class="settings-value" id="set-volume-value">${volumePct}%</span>
        </div>
        <div class="settings-row">
          <label for="set-sensitivity">Mouse Sensitivity</label>
          <input id="set-sensitivity" type="range" min="30" max="200" step="5" value="${sensitivityPct}"/>
          <span class="settings-value" id="set-sensitivity-value">${sensitivityPct}%</span>
        </div>
        <div class="settings-row">
          <label for="set-stick-sensitivity">Stick Look Sensitivity</label>
          <input id="set-stick-sensitivity" type="range" min="30" max="200" step="5" value="${stickSensPct}"/>
          <span class="settings-value" id="set-stick-sensitivity-value">${stickSensPct}%</span>
        </div>
        <label class="settings-toggle">
          <input type="checkbox" id="set-invert-y" ${invertY ? "checked" : ""}/>
          <span>Invert Y-Axis</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="set-fullscreen" ${fullscreen ? "checked" : ""}/>
          <span>Fullscreen</span>
        </label>
        <div class="settings-row select-row">
          <label for="set-render-scale">Render Scale</label>
          <select id="set-render-scale">
            <option value="1" ${renderScale >= 0.95 ? "selected" : ""}>100%</option>
            <option value="0.85" ${renderScale >= 0.8 && renderScale < 0.95 ? "selected" : ""}>85%</option>
            <option value="0.7" ${renderScale < 0.8 ? "selected" : ""}>70%</option>
          </select>
          <span class="settings-value" id="set-render-scale-value">${Math.round(renderScale * 100)}%</span>
        </div>
        <div class="settings-row select-row">
          <label for="set-vfx-density">Effects</label>
          <select id="set-vfx-density">
            <option value="full" ${vfxDensity === "full" ? "selected" : ""}>Full</option>
            <option value="reduced" ${vfxDensity === "reduced" ? "selected" : ""}>Reduced</option>
          </select>
          <span class="settings-value" id="set-vfx-density-value">${vfxDensity === "reduced" ? "Reduced" : "Full"}</span>
        </div>
        <div class="settings-storage">${storageText}</div>
      </div>
      <button class="btn secondary" id="btn-settings-back" data-nav>Back</button>
    `);

    const mutedEl = document.getElementById("set-muted");
    const volumeEl = document.getElementById("set-volume");
    const sensitivityEl = document.getElementById("set-sensitivity");
    const stickSensEl = document.getElementById("set-stick-sensitivity");
    const invertYEl = document.getElementById("set-invert-y");
    const fullscreenEl = document.getElementById("set-fullscreen");
    const renderScaleEl = document.getElementById("set-render-scale");
    const vfxDensityEl = document.getElementById("set-vfx-density");
    const volumeValue = document.getElementById("set-volume-value");
    const sensitivityValue = document.getElementById("set-sensitivity-value");
    const stickSensValue = document.getElementById("set-stick-sensitivity-value");
    const renderScaleValue = document.getElementById("set-render-scale-value");
    const vfxDensityValue = document.getElementById("set-vfx-density-value");

    const emit = () => {
      const nextVolume = Number(volumeEl.value);
      const nextSensitivity = Number(sensitivityEl.value);
      const nextStickSens = Number(stickSensEl.value);
      const nextRenderScale = Number(renderScaleEl.value);
      const nextVfxDensity = vfxDensityEl.value;
      volumeValue.textContent = `${nextVolume}%`;
      sensitivityValue.textContent = `${nextSensitivity}%`;
      stickSensValue.textContent = `${nextStickSens}%`;
      renderScaleValue.textContent = `${Math.round(nextRenderScale * 100)}%`;
      vfxDensityValue.textContent = nextVfxDensity === "reduced" ? "Reduced" : "Full";
      onChange({
        audio: {
          muted: mutedEl.checked,
          volume: nextVolume / 100,
        },
        controls: {
          mouseSensitivity: nextSensitivity / 100,
          stickLookSensitivity: nextStickSens / 100,
          invertY: invertYEl.checked,
        },
        display: {
          fullscreen: fullscreenEl.checked,
        },
        performance: {
          renderScale: nextRenderScale,
          vfxDensity: nextVfxDensity,
        },
      });
    };

    mutedEl.onchange = emit;
    volumeEl.oninput = emit;
    sensitivityEl.oninput = emit;
    stickSensEl.oninput = emit;
    invertYEl.onchange = emit;
    fullscreenEl.onchange = emit;
    renderScaleEl.onchange = emit;
    vfxDensityEl.onchange = emit;
    this._navDetach = attach(this.root, {
      onBack: onBack,
    });
    document.getElementById("btn-settings-back").onclick = onBack;
  }

  reward(level, rewards, onPick, economy = null, world = null) {
    this.setHud(false);
    const cards = rewards.map((r, i) => `
      <div class="reward-card" data-i="${i}" data-nav>
        <div class="r-type"><span>${r.type}</span><span class="r-rarity ${r.rarity || "common"}">${r.rarity || "common"}</span></div>
        <div class="r-title">${r.title}</div>
        <div class="r-desc">${r.description}</div>
        ${r.spellName ? `<div class="r-spell">Affects: ${r.spellName}</div>` : ""}
        ${r.tip ? `<div class="r-tip">${r.tip}</div>` : ""}
      </div>`).join("");
    const hasUnlock = rewards.some((r) => r.type === "Spell Unlock");
    const nudge = !hasUnlock && world && world.caster?.loadout?.some((s) => !s.autoFire)
      ? `<div class="reward-hint">Tip: take Auto-Cast on an owned spell to unlock a new manual spell next reward.</div>`
      : "";
    this._show(`
      <h1 class="title" style="font-size:40px;">Level ${level} Cleared</h1>
      <div class="subtitle">Choose a Reward</div>
      ${nudge}
      <div id="reward-cards">${cards}</div>
      ${economy ? `<button class="btn secondary" id="btn-reroll" data-nav ${economy.canReroll ? "" : "disabled"}>Reroll Rewards &middot; ${economy.rerollCost}g</button>
      <div class="hint">Gold: <b style="color:var(--gold);">${economy.gold}</b> &nbsp;&middot;&nbsp; <b>${devicePrompt("confirm")}</b> pick &nbsp;&middot;&nbsp; <b>${devicePrompt("back")}</b> back</div>` : ""}
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
    });
    this.root.querySelectorAll(".reward-card").forEach((el) => {
      el.onclick = () => onPick(rewards[parseInt(el.dataset.i, 10)]);
    });
    const reroll = document.getElementById("btn-reroll");
    if (reroll && economy?.onReroll) reroll.onclick = economy.onReroll;
  }

  upgradePanel(world, onBuy, onService, onContinue) {
    this.setHud(false);
    const gold = world.currency.gold;
    const services = (world.serviceOptions?.() || []).map((svc) => `
      <div class="svc-card ${svc.disabled ? "disabled" : ""}">
        <div class="svc-info">
          <div class="svc-title">${svc.title}</div>
          <div class="svc-desc">${svc.description}</div>
        </div>
        <button class="up-buy svc-buy" data-svc="${svc.id}" data-nav ${svc.disabled || gold < svc.cost ? "disabled" : ""}>Buy &middot; ${svc.cost}g</button>
      </div>
    `).join("");
    const spells = world.caster.loadout
      .filter((s) => world.upgrades.treeFor(s.definitionId).length > 0)
      .map((s) => {
        const id = s.definitionId;
        const tree = world.upgrades.treeFor(id);
        const owned = world.upgrades.ownedCount(id);
        const depths = world.upgrades.depths(id);
        const rows = {};
        let maxDepth = 0;
        for (const node of tree) {
          const d = depths[node.id] || 0;
          (rows[d] || (rows[d] = [])).push(node);
          if (d > maxDepth) maxDepth = d;
        }
        const renderNode = (node) => {
          const st = world.upgrades.state(id, node);
          const affordable = world.upgrades.canBuy(id, node);
          let btn;
          if (st === "owned") {
            btn = `<span class="up-tag owned">Owned</span>`;
          } else if (st === "available") {
            btn = `<button class="up-buy" data-sp="${id}" data-nd="${node.id}" data-nav ${affordable ? "" : "disabled"}>Buy &middot; ${node.cost}g</button>`;
          } else {
            btn = `<span class="up-tag locked">Locked &middot; ${node.cost}g</span>`;
          }
          const capstoneTag = node.capstone ? `<span class="up-capstone-tag">Capstone</span>` : "";
          return `<div class="up-node ${st} ${node.capstone ? "capstone" : ""}">
            <div class="up-node-info">
              <div class="up-node-title">${node.title}${capstoneTag}</div>
              <div class="up-node-desc">${node.description}</div>
            </div>
            ${btn}
          </div>`;
        };
        const rowHtml = [];
        for (let d = 0; d <= maxDepth; d++) {
          const arr = rows[d];
          if (!arr || !arr.length) continue;
          rowHtml.push(`<div class="up-depth-row">${arr.map(renderNode).join("")}</div>`);
        }
        return `<div class="up-spell">
          <div class="up-spell-head">${s.displayName}<span class="up-tier">${owned}/${tree.length}</span></div>
          ${rowHtml.join("")}
        </div>`;
      }).join("");
    this._show(`
      <h1 class="title" style="font-size:36px;">Upgrade Spell</h1>
      <div class="subtitle">Gold: <b style="color:var(--gold);">${gold}</b> &nbsp;&middot;&nbsp; Spend before the next wave</div>
      <div id="service-panel">${services}</div>
      <div id="upgrade-panel">${spells || `<div class="up-empty">No upgrades available for this spell yet.</div>`}</div>
      <button class="btn" id="btn-up-continue" data-nav>Continue to Next Wave</button>
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
    });
    this.root.querySelectorAll(".up-buy").forEach((el) => {
      if (el.classList.contains("svc-buy")) return;
      el.onclick = () => onBuy(el.dataset.sp, el.dataset.nd);
    });
    this.root.querySelectorAll(".svc-buy").forEach((el) => {
      el.onclick = () => onService(el.dataset.svc);
    });
    document.getElementById("btn-up-continue").onclick = onContinue;
  }

  gameOver(onSummary, onRestart, onMenu) {
    this.setHud(false);
    this._show(`
      <h1 class="title" style="color:#ff5566;-webkit-text-fill-color:#ff5566;">YOU DIED</h1>
      <div class="subtitle">The arena claims another wizard</div>
      <div class="btn-row">
        <button class="btn" id="btn-summary" data-nav>View Run Summary</button>
        <button class="btn secondary" id="btn-restart" data-nav>Restart</button>
        <button class="btn secondary" id="btn-menu" data-nav>Main Menu</button>
      </div>
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
    });
    document.getElementById("btn-summary").onclick = onSummary;
    document.getElementById("btn-restart").onclick = onRestart;
    document.getElementById("btn-menu").onclick = onMenu;
  }

  summary(stats, profile, world, onBack) {
    this.setHud(false);
    const rows = stats.damageRows();
    const list = rows.length
      ? rows.map((r) => `<div class="dmg-row"><span class="dn">${r.name}</span><span class="dv">${r.damage}</span></div>`).join("")
      : `<div class="dmg-row"><span class="dn">No damage dealt</span><span class="dv">0</span></div>`;
    const best = profile?.bestRun || {};
    const totals = profile?.totals || {};

    const waveReached = Math.max(1, stats.levelsCleared + 1);
    const bestWave = best.highestWave || 0;
    const bestLabel = bestWave > 0
      ? `Best: wave ${bestWave}`
      : "Best: no completed runs";

    const perfectBlocks = stats.perfectBlocks || 0;
    const spellsUnlocked = world?.caster?.loadout?.length - 1 || 0;
    const goldSpent = world?.currency?.lifetimeSpent || 0;
    const highlights = [];
    if (perfectBlocks > 0) highlights.push(`Perfect blocks: ${perfectBlocks}`);
    if (spellsUnlocked > 0) highlights.push(`Spells unlocked: ${spellsUnlocked}`);
    if (goldSpent > 0) highlights.push(`Gold spent: ${goldSpent}`);

    const lifetimeKills = this._fmt(totals.enemiesKilled || 0);
    const lifetimeDamage = this._fmt(totals.totalDamage || 0);
    const lifetimeGold = this._fmt(totals.goldEarned || 0);

    const highlightsHtml = highlights.length
      ? `<div class="summary-highlights">${highlights.map((h) => `<div class="hl-row">${h}</div>`).join("")}</div>`
      : "";

    this._show(`
      <h1 class="title" style="font-size:40px;">Run Summary</h1>
      <div class="summary-wave">Wave ${waveReached} reached</div>
      <div class="summary-best">${bestLabel}</div>
      <div class="summary-grid">
        <div class="lbl">Levels Cleared</div><div class="num">${stats.levelsCleared}</div>
        <div class="lbl">Enemies Killed</div><div class="num">${stats.enemiesKilled}</div>
        <div class="lbl">Gold Earned</div><div class="num">${stats.goldEarned}</div>
        <div class="lbl">Total Damage Dealt</div><div class="num">${Math.round(stats.totalDamage)}</div>
      </div>
      ${highlightsHtml}
      <button class="btn secondary" id="btn-toggle-details" data-nav>Show Details</button>
      <div id="dmg-breakdown">${list}</div>
      <div class="lifetime-totals">Lifetime: ${lifetimeKills} kills &middot; ${lifetimeDamage} damage &middot; ${lifetimeGold} gold</div>
      <button class="btn secondary" id="btn-back" data-nav>Back</button>
    `);
    const dmgEl = document.getElementById("dmg-breakdown");
    const toggleBtn = document.getElementById("btn-toggle-details");
    let detailsVisible = false;
    if (dmgEl) dmgEl.style.display = "none";
    toggleBtn.onclick = () => {
      detailsVisible = !detailsVisible;
      if (dmgEl) dmgEl.style.display = detailsVisible ? "" : "none";
      toggleBtn.textContent = detailsVisible ? "Hide Details" : "Show Details";
    };
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
      onBack: onBack,
    });
    document.getElementById("btn-back").onclick = onBack;
  }

  // --- HUD update ---------------------------------------------------------

  buildSpellSlots(loadout) {
    this.spellsEl.innerHTML = "";
    const manualCount = loadout.filter((s) => !s.autoFire).length;
    this._spellSlots = loadout.map((s, i) => {
      const el = document.createElement("div");
      el.className = "spell-slot";
      if (s.autoFire) el.classList.add("passive");
      const key = s.autoFire ? "AUTO" : (manualCount > 1 ? i + 1 : "Run Spell");
      el.innerHTML = `<span class="key">${key}</span><span class="nm">${s.displayName}</span><div class="cd-fill"></div>`;
      this.spellsEl.appendChild(el);
      return el;
    });
  }

  updateHud(world) {
    this.updateBossBar(world);
    const h = world.player.health;
    const pct = Math.max(0, Math.round(h.ratio * 100));
    this.hpFill.style.width = pct + "%";
    this.hpText.textContent = `${Math.max(0, Math.ceil(h.current))} / ${h.max}`;
    this.lvlEl.textContent = world.levelManager.level;
    this.goldEl.textContent = world.currency.gold;
    this.enemyEl.textContent = world.enemyManager.aliveCount;
    const modName = world.currentWaveModifier?.name || "None";
    const layout = world.arenaLayoutName ? world.arenaLayoutName.toUpperCase() : "";
    this.modEl.textContent = layout ? `${modName} · ${layout}` : modName;
    if (this.modDescEl) this.modDescEl.textContent = world.currentWaveModifier?.description || "";
    const objective = world.objectiveManager?.hudText?.();
    if (this.objEl) {
      this.objEl.textContent = objective ? objective.name : "";
      const row = this.objEl.closest(".objective");
      if (row) row.style.display = objective ? "" : "none";
    }
    if (this.objDescEl) {
      this.objDescEl.textContent = objective ? objective.status : "";
      this.objDescEl.classList.toggle("complete", !!objective?.complete);
      this.objDescEl.style.display = objective ? "" : "none";
    }

    const lo = world.caster.loadout;
    if (this._spellSlots.length !== lo.length) this.buildSpellSlots(lo);
    const manualCount = lo.filter((s) => !s.autoFire).length;
    lo.forEach((s, i) => {
      const el = this._spellSlots[i];
      el.classList.toggle("equipped", i === world.caster.equipped && !s.autoFire);
      el.classList.toggle("passive", !!s.autoFire);
      const key = el.querySelector(".key");
      if (key) key.textContent = s.autoFire ? "AUTO" : (manualCount > 1 ? i + 1 : "Run Spell");
      const ratio = world.caster.cdRatio(s); // 1 = ready
      el.querySelector(".cd-fill").style.height = `${(1 - ratio) * 100}%`;
    });

    const blk = world.player.block;
    if (blk) {
      this.stamFill.style.width = Math.max(0, Math.round(blk.staminaRatio * 100)) + "%";
      this.stamFill.classList.toggle("low", blk.staminaLow);
      this.stamFill.classList.toggle("draining", blk.blocking && !blk.staminaLow && blk.staminaRatio < 0.6);
      this.stamFill.classList.toggle("perfect", blk.perfectActive());
      this.stamFill.classList.toggle("hit", blk.blockPulse > 0);
      this.stamText.textContent = `${Math.ceil(blk.stamina)} / ${blk.maxStamina} Stamina`;
      this.blockInd.classList.toggle("active", blk.blocking);
      this.blockInd.classList.toggle("perfect", blk.perfectPulse > 0);
      this.blockInd.textContent = blk.perfectPulse > 0 ? "PERFECT" : (blk.perfectActive() ? "PARRY WINDOW" : "BLOCKING");
      this.crosshair.classList.toggle("blocking", blk.blocking);
      this.crosshair.classList.toggle("perfect-window", blk.perfectActive());
      this.crosshair.classList.toggle("perfect-hit", blk.perfectPulse > 0);
      this.crosshair.classList.toggle("block-hit", blk.blockPulse > 0);
      this.crosshair.style.setProperty("--perfect-ratio", blk.perfectRatio().toFixed(3));
    }

    if (world.blink.ready) {
      this.blinkEl.textContent = "Blink ready";
      this.blinkEl.classList.remove("cooling");
    } else {
      this.blinkEl.textContent = `Blink ${world.blink.timer.toFixed(1)}s`;
      this.blinkEl.classList.add("cooling");
    }
  }
}
