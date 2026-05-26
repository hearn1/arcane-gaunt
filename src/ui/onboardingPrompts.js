export const ONBOARDING_PROMPTS = [
  {
    id: "move_first_keypress",
    trigger: "first_move",
    text: "Move with WASD / left-stick",
    persistKey: "move_first_keypress",
  },
  {
    id: "look_first_mouse",
    trigger: "first_look",
    text: "Look around with the mouse / right-stick",
    persistKey: "look_first_mouse",
  },
  {
    id: "cast_first_fire",
    trigger: "first_cast",
    text: "Left-click / RT casts your spell",
    persistKey: "cast_first_fire",
  },
  {
    id: "block_first_incoming",
    trigger: "block_incoming",
    text: "Hold right-click / LT to block. Time it just before a hit for a perfect block.",
    persistKey: "block_first_incoming",
  },
  {
    id: "blink_first_low_hp",
    trigger: "blink_low_hp",
    text: "Blink (Shift/Q/B) to dash through danger.",
    persistKey: "blink_first_low_hp",
  },
  {
    id: "objective_first_active",
    trigger: "objective_active",
    text: "Objective active! Read the banner.",
    persistKey: "objective_first_active",
  },
  {
    id: "hazard_first_step",
    trigger: "hazard_step",
    text: "Rift surge — get out!",
    persistKey: "hazard_first_step",
  },
  {
    id: "boss_first_spawn",
    trigger: "boss_spawn",
    text: "Boss wave. Watch the health bar.",
    persistKey: "boss_first_spawn",
  },
  {
    id: "autocast_first_unlock",
    trigger: "autocast_unlock",
    text: "Auto-Cast unlocked. You can take a new spell next reward.",
    persistKey: "autocast_first_unlock",
  },
];
