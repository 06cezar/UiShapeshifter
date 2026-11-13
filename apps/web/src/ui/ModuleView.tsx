// Piesele de conținut ale șabloanelor: placa unui modul pe ecranul principal și ecranul-substitut al modulului.
// Ecranele reale (mesaje, poze, contacte…) vin în B4; până atunci fiecare modul arată doar titlul.

import type { ModuleConfig } from "@uishapeshifter/contracts";
import { useConfigStoreApi } from "./config-store-context";

/** Placa de pe ecranul principal: un buton mare care deschide modulul (`home.<moduleId>`, specs/04). */
export function ModuleTile({ module }: { module: ModuleConfig }) {
  const store = useConfigStoreApi();
  return (
    <button
      type="button"
      className={`ui-tile ui-size-${module.size}`}
      data-agent-id={`home.${module.id}`}
      onClick={() => store.getState().navigate(module.id)}
    >
      <span className="ui-tile-title">{module.title}</span>
    </button>
  );
}

/** Ecranul-substitut al unui modul, până la B4. */
export function ModulePlaceholder({ module }: { module: ModuleConfig }) {
  return (
    <section className="ui-module" aria-labelledby={`module-title-${module.id}`} data-module-id={module.id}>
      <h1 id={`module-title-${module.id}`} className="ui-module-title">
        {module.title}
      </h1>
      <p className="ui-module-note">Ecranul „{module.title}” vine în curând.</p>
    </section>
  );
}
