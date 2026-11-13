// Testul inițial (specs/10). În aplicație se folosește OnboardingGate în jurul interfeței.
export { OnboardingGate, type OnboardingGateProps } from "./OnboardingGate";
export { Onboarding, type OnboardingProps } from "./Onboarding";
export { fetchProfile, submitOnboarding } from "./api";
export { buildOnboardingResult, needsOnboarding, skippedResult, summaryText } from "./result";
