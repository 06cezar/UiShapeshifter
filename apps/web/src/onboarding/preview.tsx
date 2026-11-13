// Pagina de previzualizare C3, doar pentru `npm run dev`: http://localhost:5173/src/onboarding/preview.html
// Arată testul inițial înainte ca App.tsx să-l monteze. Se șterge la îngheț.
//   implicit      server simulat în pagină: rezultatul apare în consolă și pe ecran la final
//   ?server=1     serverul real (PUT /api/profile/demo-fresh/onboarding)
// Tema: DEFAULT_CONFIG scris ca variabile CSS. După B1, varianta corectă e bindThemeToRoot din ui/theme-sync.ts.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import type { OnboardingResult } from "@uishapeshifter/contracts";
import { Onboarding } from "./Onboarding";

const USER_ID = "demo-fresh";
const { theme, minTargetPx } = DEFAULT_CONFIG;

const vars: Record<string, string> = {
  "--font-base": `${theme.baseFontPx}px`,
  "--font-step-2": `${theme.baseFontPx * theme.scale ** 2}px`,
  "--line-height": String(theme.lineHeight),
  "--font-family": theme.fontFamily,
  "--radius": `${theme.radiusPx}px`,
  "--spacing": `${theme.spacingPx}px`,
  "--min-target": `${minTargetPx}px`,
  "--color-background": theme.palette.background,
  "--color-surface": theme.palette.surface,
  "--color-text": theme.palette.text,
  "--color-text-muted": theme.palette.textMuted,
  "--color-primary": theme.palette.primary,
  "--color-on-primary": theme.palette.onPrimary,
  "--color-danger": theme.palette.danger,
  "--color-focus": theme.palette.focus,
};
for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);

/** Serverul simulat: întoarce un profil minim și ține rezultatul pentru afișare. */
const simulatedFetch: typeof fetch = async (_input, init) => {
  const result = JSON.parse(String(init?.body)) as OnboardingResult;
  console.info("OnboardingResult trimis:", result);
  return Response.json({
    userId: USER_ID,
    onboarding: { completed: !result.skipped, skipped: result.skipped },
    result,
  });
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
