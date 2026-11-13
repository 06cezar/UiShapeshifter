// Meniul (navigația) din `sidebar-feed` și `bottom-nav-stories`. Intrările vin din `nav.items`, fiecare cu
// `data-agent-id="nav.<moduleId>"` (specs/04). Fără etichete (`showLabels: false`), titlul rămâne ca aria-label.

import type { CSSProperties } from "react";
import { useConfigState, useConfigStoreApi } from "./config-store-context";
import { HOME_ID, moduleIdOfRoute, navModules } from "./layout-model";

export function NavBar() {
  const store = useConfigStoreApi();
  const config = useConfigState((s) => s.config);
  const activeId = moduleIdOfRoute(useConfigState((s) => s.route));
  const entries = navModules(config);
  // Mărimea iconiței stă în nav, nu în temă; o dăm CSS-ului ca variabilă locală.
  const style = { "--nav-icon": `${config.nav.iconSizePx}px` } as CSSProperties;

  return (
    <nav className="ui-nav" data-nav-position={config.nav.position} aria-label="Meniu" style={style}>
      <button
        type="button"
        className="ui-nav-item"
        data-agent-id={`nav.${HOME_ID}`}
        aria-current={activeId === HOME_ID ? "page" : undefined}
        aria-label="Acasă"
        onClick={() => store.getState().navigate(HOME_ID)}
      >
        <span className="ui-nav-icon" aria-hidden="true">
          {initialOf("Acasă")}
        </span>
        {config.nav.showLabels && <span className="ui-nav-label">Acasă</span>}
      </button>
      {entries.map((m) => (
        <button
          key={m.id}
          type="button"
          className="ui-nav-item"
          data-agent-id={`nav.${m.id}`}
          aria-current={activeId === m.id ? "page" : undefined}
          aria-label={m.title}
          onClick={() => store.getState().navigate(m.id)}
        >
          <span className="ui-nav-icon" aria-hidden="true">
            {initialOf(m.title)}
          </span>
          {config.nav.showLabels && <span className="ui-nav-label">{m.title}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Iconița-substitut: inițiala titlului (iconițele reale vin odată cu ecranele din B4). */
function initialOf(title: string): string {
  return title.charAt(0).toLocaleUpperCase("ro");
}
