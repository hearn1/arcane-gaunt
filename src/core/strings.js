// Key naming convention: area.subarea.purpose
//   e.g. "menu.title", "hud.stamina", "toast.spell_unlocked", "onboarding.first_move"
// Frozen so callers can iterate / validate keys at import time.
export const EN_STRINGS = Object.freeze({
  // --- Main menu ---
  "ui.arcane_gaunt": "Arcane Gaunt",
  "ui.arcane_gaunt_title": "ARCANE GAUNT",
  "ui.choose_difficulty": "Choose Difficulty",
  "ui.choose_run_spell": "Choose Spell",
  "ui.start_run": "Start Run",
  "ui.settings": "Settings",
  "ui.main_menu": "Main Menu",
  "ui.reset_records": "Reset Records",
  "ui.credits_note": "A game by Matt Hearn",
  "ui.click_to_play": "Click to Play",
  "ui.enter_arena": "Enter the Arena",
  "ui.continue": "Continue",

  // --- HUD ---
  "ui.wave": "Wave",
  "ui.arena": "Arena",
  "ui.level": "Level",
  "ui.cleared": "Cleared",
  "ui.gold": "Gold",
  "ui.stamina": "Stamina",
  "ui.run_spell": "Run Spell",
  "ui.auto": "AUTO",
  "ui.modifier_none": "None",
  "ui.best": "Best",
  "ui.runs": "Runs",
  "ui.kills": "Kills",
  "ui.damage": "Damage",
  "ui.no_runs_yet": "No runs yet",

  // --- HUD: controls hint ---
  "ui.move": "Move",
  "ui.look": "Look",
  "ui.cast": "Cast",
  "ui.block": "Block",
  "ui.jump": "Jump",
  "ui.blink": "Blink",
  "ui.release_mouse_pause": "Releases mouse / pauses",
  "ui.release_mouse": "Releases mouse",
  "ui.press_hint_capture": "Press",
  "ui.to_capture_mouse": "to capture mouse",
  "ui.releases_it": "releases it",

  // --- HUD: boss bar ---
  "ui.cc_immune": "[CC immune]",

  // --- HUD: blink ---
  "ui.blink_ready": "BLINK READY",

  // --- HUD: block ---
  "ui.blocking": "BLOCKING",
  "ui.perfect": "PERFECT!",
  "ui.parry_window": "PARRY WINDOW",

  // --- Focus / Pause ---
  "ui.paused": "PAUSED",
  "ui.resume": "Resume",
  "ui.combat_paused_hint": "Combat paused.",
  "ui.to_resume": "to resume",

  // --- Reset Records ---
  "ui.reset_records_title": "RESET RECORDS",
  "ui.reset_records_copy": "All progress will be lost after $runs runs started.",
  "ui.runs_started": "runs started",
  "ui.settings_not_changed": "Settings will not be changed.",
  "ui.reset_run_records": "Reset Run Records",
  "ui.cancel": "Cancel",
  "ui.back": "Back",

  // --- Settings ---
  "ui.mute_audio": "Mute Audio",
  "ui.volume": "Volume",
  "ui.music_volume": "Music Volume",
  "ui.mouse_sensitivity": "Mouse Sensitivity",
  "ui.stick_look_sensitivity": "Stick Look Sensitivity",
  "ui.invert_y": "Invert Y-Axis",
  "ui.fullscreen": "Fullscreen",
  "ui.show_weapon": "Show Weapon",
  "ui.preset": "Graphics Preset",
  "ui.preset_low": "Low",
  "ui.preset_medium": "Medium",
  "ui.preset_high": "High",
  "ui.preset_custom": "Custom",
  "ui.render_scale": "Render Scale",
  "ui.percent_100": "100%",
  "ui.percent_85": "85%",
  "ui.percent_70": "70%",
  "ui.effects": "Effects",
  "ui.full": "Full",
  "ui.reduced": "Reduced",
  "ui.fov": "Field of View",
  "ui.colorblind_mode": "Colorblind Mode",
  "ui.screen_shake": "Screen Shake",
  "ui.accessibility": "Accessibility",
  "ui.captions": "Captions",
  "ui.reduced_motion": "Reduced Motion",
  "ui.reset_tutorial_hints": "Reset Tutorial Hints",
  "ui.key_bindings": "Key Bindings",
  "ui.storage_path": "Storage: $path",

  // --- Keybinding labels ---
  "binding.cast": "Cast",
  "binding.block": "Block",
  "binding.blink": "Blink",
  "binding.pause": "Pause",
  "ui.keybinding_listening": "...",

  // --- Reward ---
  "ui.choose_reward": "Choose a reward",
  "ui.affects": "Affects",
  "ui.reroll_rewards": "Reroll Rewards",
  "ui.pick": "to pick",
  "ui.tip_auto_cast": "Tip: auto-cast spells fire themselves; use them to focus on movement.",
  "ui.unlock_required": "Unlock: Reach level $level on any difficulty",

  // --- Upgrade Panel ---
  "ui.upgrade_spell": "Upgrade Spell",
  "ui.spend_before_next_wave": "Spend before the next wave",
  "ui.no_upgrades_available": "No upgrades available for this spell.",
  "ui.buy": "Buy",
  "ui.owned": "Owned",
  "ui.locked": "Locked",
  "ui.capstone": "Capstone",
  "ui.continue_to_next_wave": "Continue to Next Wave",
  "ui.tier": "Tier",

  // --- Game Over ---
  "ui.you_died": "YOU DIED",
  "ui.arena_claims_another": "The arena claims another challenger.",
  "ui.view_run_summary": "View Run Summary",
  "ui.restart": "Restart",

  // --- Summary ---
  "ui.run_summary": "Run Summary",
  "ui.reached": "reached",
  "ui.levels_cleared": "Levels Cleared",
  "ui.enemies_killed": "Enemies Killed",
  "ui.gold_earned": "Gold Earned",
  "ui.total_damage": "Total Damage",
  "ui.best_wave": "Best: Wave $wave",
  "ui.best_no_completed_runs": "Best: no completed runs",
  "ui.no_damage_dealt": "No damage dealt",
  "ui.perfect_blocks": "Perfect Blocks",
  "ui.spells_unlocked": "Spells Unlocked",
  "ui.gold_spent": "Gold Spent",
  "ui.show_details": "Show Details",
  "ui.hide_details": "Hide Details",
  "ui.lifetime": "Lifetime",
  "ui.kills_lower": "kills",
  "ui.damage_lower": "damage",
  "ui.gold_lower": "gold",

<<<<<<< HEAD
  // --- Privacy / Telemetry ---
  "ui.privacy_title": "Help Improve Arcane Gaunt",
  "ui.privacy_copy": "Help improve Arcane Gaunt by sending anonymous crash reports and run data? No personal information is collected. You can change this anytime in Settings.",
  "ui.privacy_yes": "Yes, help improve",
  "ui.privacy_no": "No thanks",
  "ui.privacy_learn_more": "Read privacy policy",
  "ui.privacy_section": "Privacy",
  "ui.telemetry_toggle": "Share anonymous data",
  "ui.telemetry_uuid": "Device ID: $uuid",
  "ui.telemetry_reset_uuid": "Reset ID",
  "ui.telemetry_disclaimer": "Anonymous crash reports and run data sent via Sentry. No PII collected.",

  "toast.telemetry_uuid_reset": "Telemetry ID reset",

=======
>>>>>>> origin/master
  // --- Toasts ---
  "toast.tutorial_hints_reset": "Tutorial hints reset",
  "toast.records_reset": "Run records reset. Settings kept.",
  "toast.gold_earned": "+$gold gold",
  "toast.not_enough_gold": "Not enough gold",
  "toast.rerolled_rewards": "Rerolled rewards (-$cost g)",
  "toast.health_restored": "Health restored",
  "toast.auto_cast_sharpened": "Auto-Cast sharpened",
  "toast.stance_drilled": "Stance drilled — perfect blocks heal 8 HP this wave",
  "toast.battlefield_read": "Battlefield read — one $archetype removed",
  "toast.hollow_sigil": "Hollow Sigil — focus rewarded",
  "toast.rift_damage": "Rift damage — move!",
  "toast.critical_health": "Critical health!",
  "toast.spell_unlocked": "New spell unlocked: $names!",
  "toast.difficulty_unlocked": "New difficulty unlocked: $names!",
  "toast.tier_n": "Tier $n",

  // --- Layout Events ---
  "toast.gate_shift": "Gate shift: openings forming",
  "toast.rift_surge_leave": "Rift surge: leave the glowing strips",
  "toast.gate_open": "Gate open: new lane available",
  "toast.gate_closing": "Gate closing: clear the archway",
  "toast.rift_surge_active": "Rift surge active",

  // --- Services ---
  "service.heal_title": "Field Dressing",
  "service.heal_desc": "Restore $health health before the next wave.",
  "service.sharpen_title": "Sharpen Auto-Cast",
  "service.sharpen_desc": "Your Auto-Casts now target the lowest-HP enemy in range.",
  "service.stance_title": "Stance Drill",
  "service.stance_desc": "This wave only: perfect blocks heal 8 HP.",
  "service.cull_title": "Battlefield Read",
  "service.cull_desc_specific": "Remove one $archetype from the next wave before it begins.",
  "service.cull_desc_generic": "Remove one of the most dangerous enemies from the next wave.",

  // --- Onboarding prompts ---
  "onboarding.move_first_keypress": "Move with WASD / left-stick",
  "onboarding.look_first_mouse": "Look around with the mouse / right-stick",
  "onboarding.cast_first_fire": "Left-click / RT casts your spell",
  "onboarding.block_first_incoming": "Hold right-click / LT to block. Time it just before a hit for a perfect block.",
  "onboarding.blink_first_low_hp": "Blink (Shift/Q/B) to dash through danger.",
  "onboarding.objective_first_active": "Objective active! Read the banner.",
  "onboarding.hazard_first_step": "Rift surge — get out!",
  "onboarding.boss_first_spawn": "Boss wave. Watch the health bar.",
  "onboarding.autocast_first_unlock": "Auto-Cast unlocked. You can take a new spell next reward.",
  "onboarding.perfect_block_first": "Perfect block! Time your block just before a hit to reflect damage.",
  "onboarding.blink_telegraph_first": "Blink (Shift/Q/B) to dodge incoming attacks.",
  "onboarding.autocast_hold_first": "Holding cast on an auto-fire spell will keep it firing.",
  "onboarding.wave_modifier_first": "This wave has a modifier — check the banner for effects.",
  "onboarding.objectives_first": "Objective active! Complete it for bonus rewards.",
  "onboarding.services_first": "Services offer healing and tactical upgrades between waves.",
  "onboarding.upgrade_tree_first": "Upgrade tree — spend gold to unlock permanent spell upgrades.",
  "onboarding.spell_switching_first": "You can switch spells with number keys or mouse wheel.",
});

export const FORMAT_RE = /\$(\w+)/g;
