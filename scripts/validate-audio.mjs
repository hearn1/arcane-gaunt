import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const AUDIO_FILES = [
  "assets/audio/cast_arcane.ogg",
  "assets/audio/cast_fire.ogg",
  "assets/audio/cast_frost.ogg",
  "assets/audio/cast_poison.ogg",
  "assets/audio/cast_chain.ogg",
  "assets/audio/cast_meteor.ogg",
  "assets/audio/explosion.ogg",
  "assets/audio/enemy_hit.ogg",
  "assets/audio/enemy_death.ogg",
  "assets/audio/player_hurt.ogg",
  "assets/audio/blink.ogg",
  "assets/audio/reward.ogg",
  "assets/audio/wave_clear.ogg",
  "assets/audio/game_over.ogg",
  "assets/audio/music/menu_loop.ogg",
  "assets/audio/music/arena_calm.ogg",
  "assets/audio/music/arena_combat.ogg",
  "assets/audio/music/boss_bed.ogg",
  "assets/audio/music/boss_enrage.ogg",
];

let failures = 0;

for (const rel of AUDIO_FILES) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`FAIL  ${rel} — file not found`);
    failures++;
    continue;
  }
  const size = statSync(abs).size;
  if (size === 0) {
    console.error(`FAIL  ${rel} — 0 bytes`);
    failures++;
    continue;
  }
  console.log(`  OK  ${rel} (${(size / 1024).toFixed(1)} KB)`);
}

if (failures > 0) {
  console.error(`\n${failures} audio file(s) failed validation`);
  process.exit(1);
}
console.log(`\nAll ${AUDIO_FILES.length} audio files are present and non-empty.`);
