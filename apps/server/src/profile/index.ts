// Ce folosesc ceilalți din profil: serverul (rutele), agentul A3 (rezumatul, update_profile), adaptarea E3.

export { createProfileRouter, ONBOARDING_GOAL, type ProfileRouterHooks } from "./routes";
export { createProfileStore, DEFAULT_PROFILES_DIR, type ProfileStore } from "./store";
export { profileSummary, MAX_SUMMARY_WORDS } from "./summary";
export { applyOnboarding, applyProfileUpdate } from "./update";
export { DEMO_USER_ID, FRESH_USER_ID } from "./defaults";
