// Pagina de previzualizare B1, doar pentru `npm run dev`: http://localhost:5173/src/ui/preview.html
// Arată LayoutRenderer cu store-ul real, înainte ca App.tsx să treacă pe el. Se șterge la îngheț.
//   ?template=sidebar-feed | bottom-nav-stories | simple-tiles
//   ?user=maria   pragurile Mariei (20px, contrast 7, ținte 56px), config ajustat după profil
// În consolă: uiStore.getState().applyPatch([...], { by: "user", reason: "test" })

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_CONFIG, DEFAULT_PROFILE_NEEDS } from "@uishapeshifter/contracts";
import type { LayoutTemplate, UserNeeds } from "@uishapeshifter/contracts";
import { configForNeeds, createAppConfigStore } from "./a11y-binding";
import type { ConfigStore } from "./config-store";
import { ConfigStoreProvider } from "./config-store-context";
import { LayoutRenderer } from "./LayoutRenderer";
import { bindThemeToRoot } from "./theme-sync";

const MARIA_NEEDS: UserNeeds = {
  minFontPx: 20,
  contrast: "high",
  minTargetPx: 56,
  reducedMotion: false,
  prefersVoice: true,
};
const TEMPLATES: LayoutTemplate[] = ["sidebar-feed", "bottom-nav-stories", "simple-tiles"];

const params = new URLSearchParams(location.search);
const needs = params.get("user") === "maria" ? MARIA_NEEDS : DEFAULT_PROFILE_NEEDS;
const store = createAppConfigStore(needs, configForNeeds(DEFAULT_CONFIG, needs));
const template = params.get("template") as LayoutTemplate | null;
if (template && TEMPLATES.includes(template)) {
  store.getState().applyTemplate(template, { by: "system", reason: "Previzualizare" });
}
bindThemeToRoot(store);

declare global {
  interface Window {
    uiStore: ConfigStore;
  }
}
window.uiStore = store;

const root = document.getElementById("root");
if (!root) throw new Error("Lipsește #root din preview.html");
createRoot(root).render(
  <StrictMode>
    <ConfigStoreProvider store={store}>
      <LayoutRenderer />
    </ConfigStoreProvider>
  </StrictMode>,
);
