import { ONBOARDING_PROMPTS } from "./onboardingPrompts.js";

export class Onboarding {
  constructor(meta) {
    this.tutorialSeen = (meta && meta.tutorialSeen) ? { ...meta.tutorialSeen } : {};
    this.firstRunAt = (meta && meta.firstRunAt) || null;
    this.seenThisRun = new Set();
  }

  startRun() {
    this.seenThisRun.clear();
  }

  note(world, eventName) {
    this.triggerIf(world, eventName);
  }

  triggerIf(world, eventName) {
    const prompt = ONBOARDING_PROMPTS.find((p) => p.trigger === eventName);
    if (!prompt) return;
    if (this.tutorialSeen[prompt.persistKey]) return;
    if (this.seenThisRun.has(prompt.id)) return;
    this.seenThisRun.add(prompt.id);
    world.ui.showOnboardingToast(prompt.text);
  }

  finalizeRun(profile) {
    for (const id of this.seenThisRun) {
      const prompt = ONBOARDING_PROMPTS.find((p) => p.id === id);
      if (prompt) this.tutorialSeen[prompt.persistKey] = true;
    }
    profile.meta.tutorialSeen = { ...this.tutorialSeen };
    if (!profile.meta.firstRunAt) {
      profile.meta.firstRunAt = new Date().toISOString();
    }
    return profile;
  }
}
