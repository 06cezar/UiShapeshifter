// Pagina de previzualizare C3, doar pentru `npm run dev`: http://localhost:5173/src/onboarding/preview.html
// Arată testul inițial exact cum îl montează OnboardingGate: fără temă pe :root (testul și-o pune singur).
// Se șterge la îngheț.
//   implicit      server simulat în pagină: rezultatul apare în consolă și pe ecran la final
//   ?server=1     serverul real (PUT /api/profile/demo-fresh/onboarding)

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_PROFILE_NEEDS } from "@uishapeshifter/contracts";
import type { OnboardingResult, UserProfile } from "@uishapeshifter/contracts";
import { Onboarding } from "./Onboarding";

const USER_ID = "demo-fresh";

/** Serverul simulat: aplică rezultatul pe un profil gol, ca serverul real (E1), și îl întoarce. */
const simulatedFetch: typeof fetch = async (_input, init) => {
  const result = JSON.parse(String(init?.body)) as OnboardingResult;
  console.info("OnboardingResult trimis:", result);
  const now = new Date().toISOString();
  const profile: UserProfile = {
    userId: USER_ID,
    displayName: "Prieten nou",
    createdAt: now,
    updatedAt: now,
    onboarding: { completed: !result.skipped, skipped: result.skipped, at: now },
    needs: { ...DEFAULT_PROFILE_NEEDS, ...result.needs },
    preferences: { familiarLayouts: [], hiddenModules: [], pinnedModules: [], ...result.preferences },
    persona: {
      techComfort: "medium",
      goals: [],
      frequentTasks: [],
      keyContacts: [],
      painPoints: [],
      ...result.persona,
    },
    facts: [],
    trust: { accepted: 0, undone: 0, autoApplyLowRisk: false },
  };
  return Response.json(profile);
};

const useServer = new URLSearchParams(location.search).get("server") === "1";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Lipsește #root din preview.html");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <Onboarding
      userId={USER_ID}
      fetchFn={useServer ? undefined : simulatedFetch}
      onDone={(profile) => root.render(<pre data-agent-id="preview.result">{JSON.stringify(profile, null, 2)}</pre>)}
    />
  </StrictMode>,
);
