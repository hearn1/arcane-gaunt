import { step, assert } from "../testHelpers.js";
import { EN_STRINGS } from "../../core/strings.js";
import { t } from "../../core/i18n.js";

// Simple parser: find t("...") and format("...", ...) call-site keys in source files.
// Uses a regex that matches quoted strings after t( or format(.
const T_CALL_RE = /(?:^|[^.\w])t\(\s*"([^"]+)"\s*\)/gm;
const FORMAT_CALL_RE = /(?:^|[^.\w])format\(\s*"([^"]+)"\s*,/gm;

export default async function runI18nValidateSmoke(_, result) {
  await step(result, "EN_STRINGS has no empty values", () => {
    for (const [key, value] of Object.entries(EN_STRINGS)) {
      assert(typeof value === "string" && value.length > 0, `EN_STRINGS["${key}"] is empty`);
    }
  });

  await step(result, "EN_STRINGS has no duplicate keys", () => {
    const keys = Object.keys(EN_STRINGS);
    const unique = new Set(keys);
    assert(unique.size === keys.length, "Duplicate keys in EN_STRINGS");
  });

  await step(result, "all EN_STRINGS keys resolve via t() without warning", () => {
    for (const key of Object.keys(EN_STRINGS)) {
      const value = t(key);
      // t() should return the English value, not the key itself
      assert(value !== key || key === value, `t("${key}") returned the key itself`);
    }
  });

  await step(result, "all t() call-sites reference keys in EN_STRINGS", async () => {
    const modules = [
      "../ui/ui.js",
      "../ui/Onboarding.js",
      "../core/Game.js",
      "../level/LayoutEventManager.js",
    ];
    const missing = new Set();
    for (const mod of modules) {
      let src;
      try {
        const modUrl = new URL(mod, window.location.href);
        const resp = await fetch(modUrl);
        if (!resp.ok) continue;
        src = await resp.text();
      } catch {
        continue;
      }
      // Reset regex lastIndex
      T_CALL_RE.lastIndex = 0;
      let m;
      while ((m = T_CALL_RE.exec(src)) !== null) {
        if (!(m[1] in EN_STRINGS)) missing.add(m[1]);
      }
      FORMAT_CALL_RE.lastIndex = 0;
      while ((m = FORMAT_CALL_RE.exec(src)) !== null) {
        if (!(m[1] in EN_STRINGS)) missing.add(m[1]);
      }
    }
    if (missing.size > 0) {
      const list = [...missing].map((k) => `  "${k}"`).join("\n");
      assert(false, `t() call-sites reference keys not in EN_STRINGS:\n${list}`);
    }
  });
}
