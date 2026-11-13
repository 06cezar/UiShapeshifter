// Ține variabilele CSS de pe :root la zi cu tema din store (specs/02, regula 6). Scrie direct în stil, în afara
// React, ca o schimbare de temă să nu re-randeze și să nu re-monteze componentele: CSS-ul o preia singur.

import type { ConfigStore } from "./config-store";
import { themeToCssVars } from "./theme-css";
import type { CssVars } from "./theme-css";

/** Scrie variabilele acum și după fiecare schimbare din store care le modifică. Întoarce dezabonarea. */
export function bindThemeToRoot(store: ConfigStore, root: HTMLElement = document.documentElement): () => void {
  let written: CssVars = {};
  const sync = () => {
    const { theme, minTargetPx } = store.getState().config;
    const vars = themeToCssVars(theme, minTargetPx);
    // Fiecare patch clonează config-ul, deci comparăm valorile, nu referința la `theme`.
    for (const [name, value] of Object.entries(vars) as [keyof CssVars, string][]) {
      if (written[name] !== value) root.style.setProperty(name, value);
    }
    written = vars;
  };
  sync();
  return store.subscribe(sync);
}
