import { SPELL_DEFINITIONS, STARTER_SPELL_ID } from "../spells/spellDefinitions.js";
import { DIFFICULTY_TIERS, SPELL_UNLOCK_LEVELS } from "../core/Difficulty.js";
import { attach } from "./uiNav.js";
import { t, format, setLang } from "../core/i18n.js";
import { DEFAULT_SETTINGS } from "../core/Settings.js";

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

function tierUnlockText(tier) {
  if (!tier.unlock) return "";
  const prereq = DIFFICULTY_TIERS[tier.unlock.tierId - 1];
  if (!prereq) return "";
  return format("ui.tier_unlock", { level: tier.unlock.level, tier: prereq.name });
}

// Styled hover/focus card markup for a difficulty tier: stat multipliers,
// mutator count + explanation, and (if locked) the unlock requirement.
function diffCardHtml(tier, unlocked) {
  const stat = (label, mult) => `<span class="info-stat">${label} <b>&times;${mult.toFixed(2)}</b></span>`;
  const stats = `<div class="info-stats">
      ${stat(t("ui.diff_hp"), tier.hpMult)}
      ${stat(t("ui.diff_damage"), tier.damageMult)}
      ${stat(t("ui.diff_spawn"), tier.spawnMult)}
      ${stat(t("ui.diff_gold"), tier.goldMult)}
    </div>`;
  const mutators = tier.mutatorCount > 0
    ? `<div class="info-mut">${format("ui.mutators_per_wave", { count: tier.mutatorCount })}</div>
       <div class="info-note">${t("ui.mutators_note")}</div>`
    : `<div class="info-mut">${t("ui.mutators_none")}</div>`;
  const lock = !unlocked
    ? `<div class="info-lock"><span class="info-lock-label">${t("ui.locked")}</span>${tierUnlockText(tier)}</div>`
    : "";
  return `<span class="info-card-head">${tier.name} <span class="info-card-tier">${t("ui.tier")} ${tier.level}</span></span>
    ${stats}${mutators}${lock}`;
}

// Styled hover/focus card markup for a spell: name, description and (if locked)
// the required cleared-wave level plus a note on what "level" means.
function spellCardHtml(def, unlocked, required) {
  const lock = !unlocked && required
    ? `<div class="info-lock"><span class="info-lock-label">${t("ui.locked")}</span>${format("ui.unlocks_at_level", { level: required })}</div>
       <div class="info-note">${t("ui.spell_unlock_note")}</div>`
    : "";
  return `<span class="info-card-head">${def.displayName}</span>
    <div class="info-note">${def.description}</div>${lock}`;
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
    if (this.wbTitleEl) this.wbTitleEl.textContent = `${t("ui.wave")} ${level}`;
    if (this.wbLayoutEl) this.wbLayoutEl.textContent = layoutName ? `${t("ui.arena")}: ${layoutName}` : "";
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
    this.bossBarName.textContent = pat.name + (bosses.length > 1 ? `  (${bosses.length})` : "") + `  ${t("ui.cc_immune")}`;
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

  mainMenu(onStart, selectedSpellId = STARTER_SPELL_ID, onSettings = null, profile = null, onResetProfile = null, difficultyLevel = 1, onDifficultyChange = null) {
    this.setHud(false);
    const unlockedSpells = profile?.unlockedSpells || ["arcane_bolt"];
    const unlockedTiers = profile?.unlocks?.unlockedTiers || [1];

    const difficultyOptions = DIFFICULTY_TIERS.map((tier) => {
      const unlocked = unlockedTiers.includes(tier.level);
      // Locked pills stay focusable (no `disabled`) so keyboard/gamepad nav can
      // land on them and surface the unlock requirement card; clicks are guarded below.
      return `
        <button class="diff-pill ${tier.level === difficultyLevel ? "selected" : ""} ${unlocked ? "" : "locked"}" data-diff="${tier.level}" data-nav ${unlocked ? "" : 'aria-disabled="true"'}>
          <span class="diff-pill-name">${unlocked ? "" : '<span class="lock-icon">&#128274;</span>'}${tier.name}</span>
          <span class="diff-pill-level">${t("ui.tier")} ${tier.level}</span>
        </button>
      `;
    }).join("");

    const spellOptions = Object.values(SPELL_DEFINITIONS).map((def) => {
      const unlocked = unlockedSpells.includes(def.id);
      const lockHtml = !unlocked ? '<span class="lock-icon">&#128274;</span>' : "";
      return `
        <button class="spell-choice ${def.id === selectedSpellId ? "selected" : ""} ${unlocked ? "" : "locked"}" data-spell="${def.id}" data-nav ${unlocked ? "" : 'aria-disabled="true"'}>
          <span class="spell-choice-name">${lockHtml}${def.displayName}</span>
          <span class="spell-choice-desc">${def.description}</span>
        </button>
      `;
    }).join("");
    const hasMulti = Object.keys(SPELL_DEFINITIONS).length > 1;
const settingsButton = onSettings
      ? `<button class="btn secondary" id="btn-settings" data-nav>${t("ui.settings")}</button>`
      : "";
    const resetButton = onResetProfile
      ? `<button class="btn secondary" id="btn-reset-profile" data-nav>${t("ui.reset_records")}</button>`
      : "";
    const records = this._profileSnapshot(profile);
    this._show(`
      <h1 class="title">${t("ui.arcane_gaunt_title")}</h1>
      <div class="subtitle">${t("ui.choose_difficulty")}</div>
      <div id="difficulty-select">${difficultyOptions}</div>
      <div id="current-diff-label" class="current-diff-label">${t("ui.current_difficulty")}: ${DIFFICULTY_TIERS.find((d) => d.level === difficultyLevel)?.name ?? DIFFICULTY_TIERS[0].name} (${t("ui.tier")} ${difficultyLevel})</div>
      <div class="subtitle">${t("ui.choose_run_spell")}</div>
      <div id="spell-select">${spellOptions}</div>
      <div class="profile-strip">
        <div><span class="profile-label">${t("ui.best")}</span><b>${records.best}</b></div>
        <div><span class="profile-label">${t("ui.runs")}</span><b>${records.runs}</b></div>
        <div><span class="profile-label">${t("ui.kills")}</span><b>${records.kills}</b></div>
        <div><span class="profile-label">${t("ui.damage")}</span><b>${records.damage}</b></div>
      </div>
      <div class="btn-row">
        <button class="btn" id="btn-start" data-nav>${t("ui.start_run")}</button>
        ${settingsButton}
        ${resetButton}
      </div>
      <div class="hint">
        <b>${devicePrompt("move")}</b> ${t("ui.move")} &nbsp;&middot;&nbsp; <b>${devicePrompt("look")}</b> ${t("ui.look")} &nbsp;&middot;&nbsp;
        <b>${devicePrompt("cast")}</b> ${t("ui.cast")} &nbsp;&middot;&nbsp; <b>${devicePrompt("block")}</b> ${t("ui.block")}<br/>
        <b>${devicePrompt("jump")}</b> ${t("ui.jump")} &nbsp;&middot;&nbsp; <b>${devicePrompt("blink")}</b> ${t("ui.blink")} &nbsp;&middot;&nbsp;
        <b>${devicePrompt("pause")}</b> ${hasMulti ? t("ui.release_mouse_pause") : t("ui.release_mouse")}
      </div>
      <div class="credits-note">${t("ui.credits_note")}</div>
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
    });
    let selected = SPELL_DEFINITIONS[selectedSpellId] ? selectedSpellId : STARTER_SPELL_ID;
    let selectedDiff = difficultyLevel;

    // Shared info-card popover, shown on hover AND keyboard/gamepad focus so the
    // difficulty/spell details are not mouse-only. Positioned just outside the menu
    // flow (document body) to avoid being clipped by the scrollable spell grid.
    const popover = document.createElement("div");
    popover.className = "menu-popover";
    popover.setAttribute("role", "tooltip");
    popover.setAttribute("aria-hidden", "true");
    document.body.appendChild(popover);
    const showCard = (el, html) => {
      popover.innerHTML = html;
      popover.classList.add("show");
      popover.setAttribute("aria-hidden", "false");
      const r = el.getBoundingClientRect();
      const pr = popover.getBoundingClientRect();
      let left = r.left + r.width / 2 - pr.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
      let top = r.top - pr.height - 10;
      if (top < 8) top = r.bottom + 10;
      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(top)}px`;
    };
    const hideCard = () => {
      popover.classList.remove("show");
      popover.setAttribute("aria-hidden", "true");
    };
    const bindCard = (el, html) => {
      el.addEventListener("mouseenter", () => showCard(el, html));
      el.addEventListener("focus", () => showCard(el, html));
      el.addEventListener("mouseleave", hideCard);
      el.addEventListener("blur", hideCard);
    };
    // Remove the popover when this screen is torn down (next _show / nav detach).
    const navDetach = this._navDetach;
    this._navDetach = () => { hideCard(); popover.remove(); navDetach?.(); };

    const diffLabelEl = document.getElementById("current-diff-label");
    this.root.querySelectorAll(".diff-pill").forEach((el) => {
      const level = parseInt(el.dataset.diff, 10);
      const tier = DIFFICULTY_TIERS.find((d) => d.level === level);
      if (tier) bindCard(el, diffCardHtml(tier, unlockedTiers.includes(level)));
      el.onclick = () => {
        if (el.classList.contains("locked")) return;
        selectedDiff = level;
        if (onDifficultyChange) onDifficultyChange(level);
        this.root.querySelectorAll(".diff-pill").forEach((pill) => {
          pill.classList.toggle("selected", pill === el);
        });
        if (diffLabelEl) {
          diffLabelEl.textContent = `${t("ui.current_difficulty")}: ${tier?.name} (${t("ui.tier")} ${level})`;
        }
      };
    });

    this.root.querySelectorAll(".spell-choice").forEach((el) => {
      const id = el.dataset.spell;
      const def = SPELL_DEFINITIONS[id];
      if (def) bindCard(el, spellCardHtml(def, unlockedSpells.includes(id), SPELL_UNLOCK_LEVELS[id]));
      el.onclick = () => {
        if (el.classList.contains("locked")) return;
        selected = id;
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
        ? `${t("ui.wave")} ${best.highestWave || best.levelsCleared + 1} / ${best.levelsCleared || 0} ${t("ui.cleared")}`
        : t("ui.no_runs_yet"),
      runs: `${totals.runsCompleted || 0}/${totals.runsStarted || 0}`,
      kills: this._fmt(totals.enemiesKilled || 0),
      damage: this._fmt(totals.totalDamage || 0),
    };
  }

  _fmt(value) {
    return Math.max(0, Math.round(Number(value) || 0)).toLocaleString();
  }

  focusPrompt(onFocus, label = t("ui.click_to_play"), actions = {}) {
    this.setHud(false);
    const settingsButton = actions.onSettings
      ? `<button class="btn secondary" id="btn-focus-settings" data-nav>${t("ui.settings")}</button>`
      : "";
    const menuButton = actions.onMenu
      ? `<button class="btn secondary" id="btn-focus-menu" data-nav>${t("ui.main_menu")}</button>`
      : "";
    this._show(`
      <h1 class="title" style="font-size:42px;">${t("ui.arcane_gaunt")}</h1>
      <div class="btn-row">
        <button class="btn" id="btn-focus" data-nav>${label}</button>
        ${settingsButton}
        ${menuButton}
      </div>
      <div class="hint">${t("ui.press_hint_capture")} <b>${devicePrompt("confirm")}</b> ${t("ui.to_capture_mouse")} &nbsp;&middot;&nbsp; <b>${devicePrompt("pause")}</b> ${t("ui.releases_it")}.</div>
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
      <h1 class="title" style="font-size:42px;">${t("ui.paused")}</h1>
      <div class="btn-row">
        <button class="btn" id="btn-pause-resume" data-nav>${t("ui.resume")}</button>
        <button class="btn secondary" id="btn-pause-settings" data-nav>${t("ui.settings")}</button>
        <button class="btn secondary" id="btn-pause-menu" data-nav>${t("ui.main_menu")}</button>
      </div>
      <div class="hint">${t("ui.combat_paused_hint")} <b>${devicePrompt("back")}</b> ${t("ui.to_resume")}.</div>
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
      <h1 class="title" style="font-size:40px;color:#ffcf4d;-webkit-text-fill-color:#ffcf4d;">${t("ui.reset_records_title")}</h1>
      <div class="reset-copy">
        ${t("ui.reset_records_copy")} ${totals.runsStarted || 0} ${t("ui.runs_started")}.
        ${t("ui.settings_not_changed")}
      </div>
      <div class="btn-row">
        <button class="btn danger" id="btn-reset-confirm" data-nav>${t("ui.reset_run_records")}</button>
        <button class="btn secondary" id="btn-reset-cancel" data-nav>${t("ui.cancel")}</button>
      </div>
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
      onBack: onCancel,
    });
    document.getElementById("btn-reset-confirm").onclick = onConfirm;
    document.getElementById("btn-reset-cancel").onclick = onCancel;
  }

  _buildKeyBindingsHtml(settings) {
    const bindings = settings.controls?.keyBindings || {};
    const actions = [
      { key: "cast", label: t("binding.cast"), default: "Mouse0" },
      { key: "block", label: t("binding.block"), default: "Mouse2" },
      { key: "blink", label: t("binding.blink"), default: "ShiftLeft" },
      { key: "pause", label: t("binding.pause"), default: "Escape" },
    ];
    return actions.map((a) => `
      <div class="keybinding-row" data-action="${a.key}">
        <span class="kb-label">${a.label}</span>
        <span class="kb-key" id="kb-${a.key}" tabindex="0">${bindings[a.key] || a.default}</span>
      </div>
    `).join("");
  }

  privacyPrompt(onAccept, onDecline) {
    this.setHud(false);
    this._show(`
      <h1 class="title" style="font-size:36px;">${t("ui.privacy_title")}</h1>
      <div class="privacy-copy">${t("ui.privacy_copy")}</div>
      <div class="btn-row">
        <button class="btn" id="btn-privacy-yes" data-nav>${t("ui.privacy_yes")}</button>
        <button class="btn secondary" id="btn-privacy-no" data-nav>${t("ui.privacy_no")}</button>
      </div>
      <div class="hint">
        <a href="#" id="lnk-privacy-policy" style="color:var(--gold);">${t("ui.privacy_learn_more")}</a>
      </div>
    `);
    this._navDetach = attach(this.root, {
      onActivate: (el) => el?.click(),
    });
    document.getElementById("btn-privacy-yes").onclick = onAccept;
    document.getElementById("btn-privacy-no").onclick = onDecline;
    document.getElementById("lnk-privacy-policy").onclick = (e) => {
      e.preventDefault();
      window.open("https://hearn1.github.io/arcane-gaunt/PRIVACY_POLICY.md", "_blank");
    };
  }

  settingsMenu(settings, onChange, onBack, storageMeta = null, onPresetApply = null, onResetTutorial = null, onResetTelemetryUuid = null, onOpenPrivacyPolicy = null) {
    this.setHud(false);
    const volumePct = Math.round((settings.audio?.volume ?? 0.35) * 100);
    const musicVolumePct = Math.round((settings.audio?.musicVolume ?? 0.25) * 100);
    const sensitivityPct = Math.round((settings.controls?.mouseSensitivity ?? 1) * 100);
    const stickSensPct = Math.round((settings.controls?.stickLookSensitivity ?? 1) * 100);
    const invertY = !!settings.controls?.invertY;
    const muted = !!settings.audio?.muted;
    const fullscreen = !!settings.display?.fullscreen;
    const viewmodel = settings.display?.viewmodel !== false;
    const preset = settings.performance?.preset || "high";
    const renderScale = settings.performance?.renderScale ?? 1;
    const vfxDensity = settings.performance?.vfxDensity || "full";
    const fov = settings.display?.fov ?? 78;
    const colorblind = !!settings.display?.colorblindMode;
    const screenShake = settings.display?.screenShake !== false;
    const bloom = settings.display?.bloom !== false;
    const shadows = settings.display?.shadows !== false;
    const captions = !!settings.display?.captions;
    const reducedMotion = !!settings.display?.reducedMotion;
    const storageText = storageMeta?.path
      ? format("ui.storage_path", { path: storageMeta.path })
      : format("ui.storage_path", { path: storageMeta?.key || "local settings" });
    this._show(`
      <h1 class="title" style="font-size:40px;">${t("ui.settings")}</h1>
      <div id="settings-panel">
        <label class="settings-toggle">
          <input type="checkbox" id="set-muted" ${muted ? "checked" : ""}/>
          <span>${t("ui.mute_audio")}</span>
        </label>
        <div class="settings-row">
          <label for="set-volume">${t("ui.volume")}</label>
          <input id="set-volume" type="range" min="0" max="100" step="1" value="${volumePct}"/>
          <span class="settings-value" id="set-volume-value">${volumePct}%</span>
        </div>
        <div class="settings-row">
          <label for="set-music-volume">${t("ui.music_volume")}</label>
          <input id="set-music-volume" type="range" min="0" max="100" step="1" value="${musicVolumePct}"/>
          <span class="settings-value" id="set-music-volume-value">${musicVolumePct}%</span>
        </div>
        <div class="settings-row">
          <label for="set-sensitivity">${t("ui.mouse_sensitivity")}</label>
          <input id="set-sensitivity" type="range" min="30" max="200" step="5" value="${sensitivityPct}"/>
          <span class="settings-value" id="set-sensitivity-value">${sensitivityPct}%</span>
        </div>
        <div class="settings-row">
          <label for="set-stick-sensitivity">${t("ui.stick_look_sensitivity")}</label>
          <input id="set-stick-sensitivity" type="range" min="30" max="200" step="5" value="${stickSensPct}"/>
          <span class="settings-value" id="set-stick-sensitivity-value">${stickSensPct}%</span>
        </div>
        <label class="settings-toggle">
          <input type="checkbox" id="set-invert-y" ${invertY ? "checked" : ""}/>
          <span>${t("ui.invert_y")}</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="set-fullscreen" ${fullscreen ? "checked" : ""}/>
          <span>${t("ui.fullscreen")}</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="set-viewmodel" ${viewmodel ? "checked" : ""}/>
          <span>${t("ui.show_weapon")}</span>
        </label>
        <div class="settings-row select-row">
          <label for="set-preset">${t("ui.preset")}</label>
          <select id="set-preset">
            <option value="low" ${preset === "low" ? "selected" : ""}>${t("ui.preset_low")}</option>
            <option value="medium" ${preset === "medium" ? "selected" : ""}>${t("ui.preset_medium")}</option>
            <option value="high" ${preset === "high" ? "selected" : ""}>${t("ui.preset_high")}</option>
            <option value="custom" ${preset === "custom" ? "selected" : ""}>${t("ui.preset_custom")}</option>
          </select>
          <span class="settings-value" id="set-preset-value">${preset === "custom" ? t("ui.preset_custom") : preset.charAt(0).toUpperCase() + preset.slice(1)}</span>
        </div>
        <div class="settings-row select-row">
          <label for="set-render-scale">${t("ui.render_scale")}</label>
          <select id="set-render-scale">
            <option value="1" ${renderScale >= 0.95 ? "selected" : ""}>${t("ui.percent_100")}</option>
            <option value="0.85" ${renderScale >= 0.8 && renderScale < 0.95 ? "selected" : ""}>${t("ui.percent_85")}</option>
            <option value="0.7" ${renderScale < 0.8 ? "selected" : ""}>${t("ui.percent_70")}</option>
          </select>
          <span class="settings-value" id="set-render-scale-value">${Math.round(renderScale * 100)}%</span>
        </div>
        <div class="settings-row select-row">
          <label for="set-vfx-density">${t("ui.effects")}</label>
          <select id="set-vfx-density">
            <option value="full" ${vfxDensity === "full" ? "selected" : ""}>${t("ui.full")}</option>
            <option value="reduced" ${vfxDensity === "reduced" ? "selected" : ""}>${t("ui.reduced")}</option>
          </select>
          <span class="settings-value" id="set-vfx-density-value">${vfxDensity === "reduced" ? t("ui.reduced") : t("ui.full")}</span>
        </div>
        <div class="settings-row">
          <label for="set-fov">${t("ui.fov")}</label>
          <input id="set-fov" type="range" min="60" max="110" step="1" value="${fov}"/>
          <span class="settings-value" id="set-fov-value">${fov}°</span>
        </div>
        <label class="settings-toggle">
          <input type="checkbox" id="set-colorblind" ${colorblind ? "checked" : ""}/>
          <span>${t("ui.colorblind_mode")}</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="set-screenshake" ${screenShake ? "checked" : ""}/>
          <span>${t("ui.screen_shake")}</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="set-bloom" ${bloom ? "checked" : ""}/>
          <span>${t("ui.bloom")}</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="set-shadows" ${shadows ? "checked" : ""}/>
          <span>${t("ui.shadows")}</span>
        </label>
        <h3 class="settings-subhead">${t("ui.accessibility")}</h3>
        <label class="settings-toggle">
          <input type="checkbox" id="set-captions" ${captions ? "checked" : ""}/>
          <span>${t("ui.captions")}</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="set-reduced-motion" ${reducedMotion ? "checked" : ""}/>
          <span>${t("ui.reduced_motion")}</span>
        </label>
        ${onResetTutorial ? `<button class="btn secondary" id="btn-reset-tutorial" data-nav>${t("ui.reset_tutorial_hints")}</button>` : ""}
        <div class="settings-storage">${storageText}</div>
        <h3 class="settings-subhead">${t("ui.privacy_section")}</h3>
        <label class="settings-toggle">
          <input type="checkbox" id="set-telemetry" ${settings.privacy?.telemetryEnabled ? "checked" : ""}/>
          <span>${t("ui.telemetry_toggle")}</span>
        </label>
        <div style="font-size:12px;color:var(--text-dim);padding:0 4px 8px 4px;">${t("ui.telemetry_disclaimer")}</div>
        <div class="settings-row">
          <span style="font-size:13px;">${format("ui.telemetry_uuid", { uuid: settings.privacy?.telemetryUuid || "—" })}</span>
          ${onResetTelemetryUuid ? `<button class="btn secondary" id="btn-reset-uuid" style="font-size:12px;padding:3px 10px;" data-nav>${t("ui.telemetry_reset_uuid")}</button>` : ""}
        </div>
        ${onOpenPrivacyPolicy ? `<div class="hint" style="margin:4px 0;"><a href="#" id="lnk-settings-privacy" style="color:var(--gold);font-size:13px;">${t("ui.privacy_learn_more")}</a></div>` : ""}
        <div class="keybindings-section">
          <h3>${t("ui.key_bindings")}</h3>
          ${this._buildKeyBindingsHtml(settings)}
          <button class="btn secondary" id="btn-reset-bindings" style="margin-top:8px;" data-nav>Reset Defaults</button>
        </div>
      </div>
      <button class="btn secondary" id="btn-settings-back" data-nav>${t("ui.back")}</button>
    `);

    const mutedEl = document.getElementById("set-muted");
    const volumeEl = document.getElementById("set-volume");
    const musicVolumeEl = document.getElementById("set-music-volume");
    const sensitivityEl = document.getElementById("set-sensitivity");
    const stickSensEl = document.getElementById("set-stick-sensitivity");
    const invertYEl = document.getElementById("set-invert-y");
    const fullscreenEl = document.getElementById("set-fullscreen");
    const viewmodelEl = document.getElementById("set-viewmodel");
    const presetEl = document.getElementById("set-preset");
    const renderScaleEl = document.getElementById("set-render-scale");
    const vfxDensityEl = document.getElementById("set-vfx-density");
    const fovEl = document.getElementById("set-fov");
    const colorblindEl = document.getElementById("set-colorblind");
    const screenShakeEl = document.getElementById("set-screenshake");
    const bloomEl = document.getElementById("set-bloom");
    const shadowsEl = document.getElementById("set-shadows");
    const captionsEl = document.getElementById("set-captions");
    const reducedMotionEl = document.getElementById("set-reduced-motion");
    const volumeValue = document.getElementById("set-volume-value");
    const musicVolumeValue = document.getElementById("set-music-volume-value");
    const sensitivityValue = document.getElementById("set-sensitivity-value");
    const stickSensValue = document.getElementById("set-stick-sensitivity-value");
    const fovValue = document.getElementById("set-fov-value");
    const presetValue = document.getElementById("set-preset-value");
    const renderScaleValue = document.getElementById("set-render-scale-value");
    const vfxDensityValue = document.getElementById("set-vfx-density-value");

    const telemetryEl = document.getElementById("set-telemetry");
    const _keyBindingsPending = { ...(settings.controls?.keyBindings || {}) };

    const emit = (flipPreset) => {
      const nextVolume = Number(volumeEl.value);
      const nextMusicVolume = Number(musicVolumeEl.value);
      const nextSensitivity = Number(sensitivityEl.value);
      const nextStickSens = Number(stickSensEl.value);
      const nextFov = Number(fovEl.value);
      const nextRenderScale = Number(renderScaleEl.value);
      const nextVfxDensity = vfxDensityEl.value;
      volumeValue.textContent = `${nextVolume}%`;
      if (musicVolumeValue) musicVolumeValue.textContent = `${nextMusicVolume}%`;
      sensitivityValue.textContent = `${nextSensitivity}%`;
      stickSensValue.textContent = `${nextStickSens}%`;
      fovValue.textContent = `${nextFov}°`;
      renderScaleValue.textContent = `${Math.round(nextRenderScale * 100)}%`;
      vfxDensityValue.textContent = nextVfxDensity === "reduced" ? t("ui.reduced") : t("ui.full");
      let p = presetEl.value;
      if (flipPreset) p = "custom";
      if (presetValue) presetValue.textContent = p === "custom" ? t("ui.preset_custom") : p.charAt(0).toUpperCase() + p.slice(1);
      onChange({
        audio: {
          muted: mutedEl.checked,
          volume: nextVolume / 100,
          musicVolume: nextMusicVolume / 100,
        },
        controls: {
          mouseSensitivity: nextSensitivity / 100,
          stickLookSensitivity: nextStickSens / 100,
          invertY: invertYEl.checked,
          keyBindings: { ..._keyBindingsPending },
        },
        display: {
          fullscreen: fullscreenEl.checked,
          viewmodel: viewmodelEl.checked,
          fov: nextFov,
          colorblindMode: colorblindEl.checked,
          screenShake: screenShakeEl.checked,
          bloom: bloomEl?.checked !== false,
          shadows: shadowsEl?.checked !== false,
          captions: captionsEl?.checked ?? false,
          reducedMotion: reducedMotionEl?.checked ?? false,
        },
        performance: {
          renderScale: nextRenderScale,
          vfxDensity: nextVfxDensity,
          preset: p,
        },
        privacy: {
          telemetryEnabled: telemetryEl?.checked ?? false,
        },
      });
    };

    mutedEl.onchange = () => emit();
    volumeEl.oninput = () => emit();
    musicVolumeEl.oninput = () => emit();
    sensitivityEl.oninput = () => emit();
    stickSensEl.oninput = () => emit();
    invertYEl.onchange = () => emit();
    fullscreenEl.onchange = () => emit();
    viewmodelEl.onchange = () => emit(true);
    renderScaleEl.onchange = () => emit(true);
    vfxDensityEl.onchange = () => emit(true);
    fovEl.oninput = () => emit();
    colorblindEl.onchange = () => emit();
    screenShakeEl.onchange = () => emit(true);
    if (bloomEl) bloomEl.onchange = () => emit(true);
    if (shadowsEl) shadowsEl.onchange = () => emit(true);
    if (captionsEl) captionsEl.onchange = () => emit();
    if (reducedMotionEl) reducedMotionEl.onchange = () => emit();
    if (telemetryEl) telemetryEl.onchange = () => emit();

    const resetUuidBtn = document.getElementById("btn-reset-uuid");
    if (resetUuidBtn && onResetTelemetryUuid) resetUuidBtn.onclick = onResetTelemetryUuid;
    const privacyLink = document.getElementById("lnk-settings-privacy");
    if (privacyLink && onOpenPrivacyPolicy) {
      privacyLink.onclick = (e) => {
        e.preventDefault();
        onOpenPrivacyPolicy("https://hearn1.github.io/arcane-gaunt/PRIVACY_POLICY.md");
      };
    }

    presetEl.onchange = () => {
      if (onPresetApply) onPresetApply(presetEl.value);
    };

    // Key rebind: click a key span, then capture next keydown or mousedown.
    document.querySelectorAll(".keybinding-row .kb-key").forEach((el) => {
      el.onclick = () => {
        const action = el.closest(".keybinding-row").dataset.action;
        el.textContent = t("ui.keybinding_listening");
        el.classList.add("listening");

        const finish = (code) => {
          el.classList.remove("listening");
          if (!code) return;
          const conflictAction = Object.keys(_keyBindingsPending).find(
            (a) => a !== action && _keyBindingsPending[a] === code,
          );
          if (conflictAction) {
            const conflictLabel = el.closest(".keybinding-row").parentElement
              .querySelector(`[data-action="${conflictAction}"] .kb-label`)?.textContent || conflictAction;
            if (!confirm(`"${code}" is bound to "${conflictLabel}". Swap them?`)) return;
            _keyBindingsPending[conflictAction] = _keyBindingsPending[action];
            const conflictEl = document.getElementById("kb-" + conflictAction);
            if (conflictEl) conflictEl.textContent = _keyBindingsPending[action] || "";
          }
          _keyBindingsPending[action] = code;
          el.textContent = code;
          emit();
        };

        const onKey = (e) => {
          e.preventDefault();
          removeListeners();
          finish(e.code || e.key);
        };
        const onMouse = (e) => {
          if (e.button === undefined) return;
          e.preventDefault();
          e.stopPropagation();
          removeListeners();
          finish("Mouse" + e.button);
        };
        const removeListeners = () => {
          el.removeEventListener("keydown", onKey);
          document.removeEventListener("mousedown", onMouse, true);
        };
        el.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onMouse, true);
        el.focus();
      };
    });

    // Reset bindings to defaults.
    const resetBtn = document.getElementById("btn-reset-bindings");
    if (resetBtn) {
      resetBtn.onclick = () => {
        const defaults = DEFAULT_SETTINGS.controls.keyBindings;
        Object.keys(defaults).forEach((k) => { _keyBindingsPending[k] = defaults[k]; });
        document.querySelectorAll(".keybinding-row").forEach((row) => {
          const action = row.dataset.action;
          const keyEl = row.querySelector(".kb-key");
          if (keyEl && action in defaults) keyEl.textContent = defaults[action];
        });
        emit();
      };
    }

    const resetTutorialBtn = document.getElementById("btn-reset-tutorial");
    if (resetTutorialBtn && onResetTutorial) resetTutorialBtn.onclick = onResetTutorial;

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
        ${r.spellName ? `<div class="r-spell">${t("ui.affects")}: ${r.spellName}</div>` : ""}
        ${r.tip ? `<div class="r-tip">${r.tip}</div>` : ""}
      </div>`).join("");
    const hasUnlock = rewards.some((r) => r.type === "Spell Unlock");
    const nudge = !hasUnlock && world && world.caster?.loadout?.some((s) => !s.autoFire)
      ? `<div class="reward-hint">${t("ui.tip_auto_cast")}</div>`
      : "";
    this._show(`
      <h1 class="title" style="font-size:40px;">${t("ui.level")} ${level} ${t("ui.cleared")}</h1>
      <div class="subtitle">${t("ui.choose_reward")}</div>
      ${nudge}
      <div id="reward-cards">${cards}</div>
      ${economy ? `<button class="btn secondary" id="btn-reroll" data-nav ${economy.canReroll ? "" : "disabled"}>${t("ui.reroll_rewards")} &middot; ${economy.rerollCost}g</button>
      <div class="hint">${t("ui.gold")}: <b style="color:var(--gold);">${economy.gold}</b> &nbsp;&middot;&nbsp; <b>${devicePrompt("confirm")}</b> ${t("ui.pick")} &nbsp;&middot;&nbsp; <b>${devicePrompt("back")}</b> ${t("ui.back")}</div>` : ""}
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
        <button class="up-buy svc-buy" data-svc="${svc.id}" data-nav ${svc.disabled || gold < svc.cost ? "disabled" : ""}>${t("ui.buy")} &middot; ${svc.cost}g</button>
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
            btn = `<span class="up-tag owned">${t("ui.owned")}</span>`;
          } else if (st === "available") {
            btn = `<button class="up-buy" data-sp="${id}" data-nd="${node.id}" data-nav ${affordable ? "" : "disabled"}>${t("ui.buy")} &middot; ${node.cost}g</button>`;
          } else {
            btn = `<span class="up-tag locked">${t("ui.locked")} &middot; ${node.cost}g</span>`;
          }
          const capstoneTag = node.capstone ? `<span class="up-capstone-tag">${t("ui.capstone")}</span>` : "";
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
      <h1 class="title" style="font-size:36px;">${t("ui.upgrade_spell")}</h1>
      <div class="subtitle">${t("ui.gold")}: <b style="color:var(--gold);">${gold}</b> &nbsp;&middot;&nbsp; ${t("ui.spend_before_next_wave")}</div>
      <div id="service-panel">${services}</div>
      <div id="upgrade-panel">${spells || `<div class="up-empty">${t("ui.no_upgrades_available")}</div>`}</div>
      <button class="btn" id="btn-up-continue" data-nav>${t("ui.continue_to_next_wave")}</button>
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

    if (services) world.onboarding?.note(world, "services");
    if (spells) world.onboarding?.note(world, "upgrade_tree");
  }

  gameOver(onSummary, onRestart, onMenu) {
    this.setHud(false);
    this._show(`
      <h1 class="title" style="color:#ff5566;-webkit-text-fill-color:#ff5566;">${t("ui.you_died")}</h1>
      <div class="subtitle">${t("ui.arena_claims_another")}</div>
      <div class="btn-row">
        <button class="btn" id="btn-summary" data-nav>${t("ui.view_run_summary")}</button>
        <button class="btn secondary" id="btn-restart" data-nav>${t("ui.restart")}</button>
        <button class="btn secondary" id="btn-menu" data-nav>${t("ui.main_menu")}</button>
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
      : `<div class="dmg-row"><span class="dn">${t("ui.no_damage_dealt")}</span><span class="dv">0</span></div>`;
    const best = profile?.bestRun || {};
    const totals = profile?.totals || {};

    const waveReached = Math.max(1, stats.levelsCleared + 1);
    const bestWave = best.highestWave || 0;
    const bestLabel = bestWave > 0
      ? `${t("ui.best_wave")} ${bestWave}`
      : t("ui.best_no_completed_runs");

    const perfectBlocks = stats.perfectBlocks || 0;
    const spellsUnlocked = world?.caster?.loadout?.length - 1 || 0;
    const goldSpent = world?.currency?.lifetimeSpent || 0;
    const highlights = [];
    if (perfectBlocks > 0) highlights.push(`${t("ui.perfect_blocks")}: ${perfectBlocks}`);
    if (spellsUnlocked > 0) highlights.push(`${t("ui.spells_unlocked")}: ${spellsUnlocked}`);
    if (goldSpent > 0) highlights.push(`${t("ui.gold_spent")}: ${goldSpent}`);

    const lifetimeKills = this._fmt(totals.enemiesKilled || 0);
    const lifetimeDamage = this._fmt(totals.totalDamage || 0);
    const lifetimeGold = this._fmt(totals.goldEarned || 0);

    const highlightsHtml = highlights.length
      ? `<div class="summary-highlights">${highlights.map((h) => `<div class="hl-row">${h}</div>`).join("")}</div>`
      : "";

    this._show(`
      <h1 class="title" style="font-size:40px;">${t("ui.run_summary")}</h1>
      <div class="summary-wave">${t("ui.wave")} ${waveReached} ${t("ui.reached")}</div>
      <div class="summary-best">${bestLabel}</div>
      <div class="summary-grid">
        <div class="lbl">${t("ui.levels_cleared")}</div><div class="num">${stats.levelsCleared}</div>
        <div class="lbl">${t("ui.enemies_killed")}</div><div class="num">${stats.enemiesKilled}</div>
        <div class="lbl">${t("ui.gold_earned")}</div><div class="num">${stats.goldEarned}</div>
        <div class="lbl">${t("ui.total_damage")}</div><div class="num">${Math.round(stats.totalDamage)}</div>
      </div>
      ${highlightsHtml}
      <button class="btn secondary" id="btn-toggle-details" data-nav>${t("ui.show_details")}</button>
      <div id="dmg-breakdown">${list}</div>
      <div class="lifetime-totals">${t("ui.lifetime")}: ${lifetimeKills} ${t("ui.kills_lower")} &middot; ${lifetimeDamage} ${t("ui.damage_lower")} &middot; ${lifetimeGold} ${t("ui.gold_lower")}</div>
      <button class="btn secondary" id="btn-back" data-nav>${t("ui.back")}</button>
    `);
    const dmgEl = document.getElementById("dmg-breakdown");
    const toggleBtn = document.getElementById("btn-toggle-details");
    let detailsVisible = false;
    if (dmgEl) dmgEl.style.display = "none";
    toggleBtn.onclick = () => {
      detailsVisible = !detailsVisible;
      if (dmgEl) dmgEl.style.display = detailsVisible ? "" : "none";
      toggleBtn.textContent = detailsVisible ? t("ui.hide_details") : t("ui.show_details");
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
      const key = s.autoFire ? t("ui.auto") : (manualCount > 1 ? i + 1 : t("ui.run_spell"));
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
    const modName = world.currentWaveModifier?.name || t("ui.modifier_none");
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
      if (key) key.textContent = s.autoFire ? t("ui.auto") : (manualCount > 1 ? i + 1 : t("ui.run_spell"));
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
      this.stamText.textContent = `${Math.ceil(blk.stamina)} / ${blk.maxStamina} ${t("ui.stamina")}`;
      this.blockInd.classList.toggle("active", blk.blocking);
      this.blockInd.classList.toggle("perfect", blk.perfectPulse > 0);
      this.blockInd.textContent = blk.perfectPulse > 0 ? t("ui.perfect") : (blk.perfectActive() ? t("ui.parry_window") : t("ui.blocking"));
      const reducedMotion = world.settings?.display?.reducedMotion;
      this.crosshair.classList.toggle("blocking", blk.blocking);
      this.crosshair.classList.toggle("perfect-window", blk.perfectActive());
      this.crosshair.classList.toggle("perfect-hit", reducedMotion ? false : blk.perfectPulse > 0);
      this.crosshair.classList.toggle("block-hit", blk.blockPulse > 0);
      this.crosshair.style.setProperty("--perfect-ratio", reducedMotion ? "0" : blk.perfectRatio().toFixed(3));
    }

    if (world.blink.ready) {
      this.blinkEl.textContent = t("ui.blink_ready");
      this.blinkEl.classList.remove("cooling");
    } else {
      this.blinkEl.textContent = `${t("ui.blink")} ${world.blink.timer.toFixed(1)}s`;
      this.blinkEl.classList.add("cooling");
    }
  }
}
