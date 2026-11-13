// Ce module apar unde, calculat doar din config (specs/02, „Șabloanele”). Funcții pure, ca șabloanele React să fie
// simple și regulile să poată fi testate fără DOM.

import type { ModuleConfig, UIConfig } from "@uishapeshifter/contracts";
import { HOME_ROUTE } from "./config-store";

/** Modulul care ocupă banda de sus în `bottom-nav-stories`. */
export const STORIES_MODULE_ID = "stories";
/** Id-ul ecranului principal: în rute ("home") și în data-agent-id-ul butonului de întoarcere (`nav.home`). */
export const HOME_ID = HOME_ROUTE;

/** Modulele vizibile, în ordinea din config. */
export function visibleModules(config: UIConfig): ModuleConfig[] {
  return config.modules.filter((m) => m.visible).sort((a, b) => a.order - b.order);
}

/** Intrările din meniu: ordinea din `nav.items`, doar modulele care există și sunt vizibile. */
export function navModules(config: UIConfig): ModuleConfig[] {
  const byId = new Map(visibleModules(config).map((m) => [m.id, m]));
  return config.nav.items.flatMap((id) => byId.get(id) ?? []);
}

/** Banda de povești din `bottom-nav-stories`, dacă modulul e vizibil. */
export function storiesModule(config: UIConfig): ModuleConfig | undefined {
  return visibleModules(config).find((m) => m.id === STORIES_MODULE_ID);
}

/**
 * Ce apare pe ecranul principal, în ordine:
 * - `simple-tiles`: toate modulele vizibile, cele generate primele;
 * - `bottom-nav-stories`: modulele vizibile fără banda de povești (ea stă separat, sus);
 * - `sidebar-feed`: modulele vizibile, în ordine.
 */
export function homeModules(config: UIConfig): ModuleConfig[] {
  const modules = visibleModules(config);
  switch (config.template) {
    case "simple-tiles":
      return [...modules.filter((m) => m.type === "generated"), ...modules.filter((m) => m.type !== "generated")];
    case "bottom-nav-stories":
      return modules.filter((m) => m.id !== STORIES_MODULE_ID);
    case "sidebar-feed":
      return modules;
  }
}

/** "chat:ana" → "chat", "messages" → "messages". Ruta poate avea un detaliu după „:”. */
export function moduleIdOfRoute(route: string): string {
  return route.split(":")[0];
}

/** Modulul afișat pentru rută, sau `undefined` pe ecranul principal ori dacă modulul nu (mai) e vizibil. */
export function currentModule(config: UIConfig, route: string): ModuleConfig | undefined {
  const id = moduleIdOfRoute(route);
  return id === HOME_ID ? undefined : visibleModules(config).find((m) => m.id === id);
}
