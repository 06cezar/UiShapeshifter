// Testul inițial (specs/10), ca pagină a extensiei: intrarea e page.tsx (onboarding.html), deschisă la instalare.
export { Onboarding, type OnboardingProps } from "./Onboarding";
export { fetchProfile, submitOnboarding } from "./api";
export { ONBOARDING_STORAGE_KEY } from "./storage-key";
export { buildOnboardingResult, needsOnboarding, normalizeHost, skippedResult, summaryText } from "./result";
