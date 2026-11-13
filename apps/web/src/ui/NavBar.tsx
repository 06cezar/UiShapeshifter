// Meniul (navigația) din `sidebar-feed` și `bottom-nav-stories`. Intrările vin din `nav.items`, fiecare cu
// `data-agent-id="nav.<moduleId>"` (specs/04). Fără etichete (`showLabels: false`), titlul rămâne ca aria-label.

import type { CSSProperties } from "react";
import { useConfigState, useConfigStoreApi } from "./config-store-context";
import { HOME_ID, moduleIdOfRoute, navModules } from "./layout-model";
import { useAgentElement } from "./registry-context";

export function NavBar() {
  const store = useConfigStoreApi();
  const config = useConfigState((s) => s.config);
  const activeId = moduleIdOfRoute(useConfigState((s) => s.route));
  const entries = navModules(config);
  // Mărimea iconiței stă în nav, nu în temă; o dăm CSS-ului ca variabilă locală.
  const style = { "--nav-icon": `${config.nav.iconSizePx}px` } as CSSProperties;

  return (
    <nav className="ui-nav" data-nav-position={config.nav.position} aria-label="Meniu" style={style}>
      <NavItem
        moduleId={HOME_ID}
        title="Acasă"
        active={activeId === HOME_ID}
        showLabel={config.nav.showLabels}
        onSelect={() => store.getState().navigate(HOME_ID)}
      />
      {entries.map((m) => (
        <NavItem
          key={m.id}
          moduleId={m.id}
          title={m.title}
          active={activeId === m.id}
          showLabel={config.nav.showLabels}
          onSelect={() => store.getState().navigate(m.id)}
        />
      ))}
    </nav>
  );
}

interface NavItemProps {
  moduleId: string;
  title: string;
  active: boolean;
  showLabel: boolean;
  onSelect: () => void;
}

/** O intrare din meniu: `nav.<moduleId>`, înregistrată în registru. */
function NavItem({ moduleId, title, active, showLabel, onSelect }: NavItemProps) {
  const agentId = `nav.${moduleId}`;
  const ref = useAgentElement(agentId);
  return (
    <button
      ref={ref}
      type="button"
      className="ui-nav-item"
      data-agent-id={agentId}
      aria-current={active ? "page" : undefined}
      aria-label={title}
      onClick={onSelect}
    >
      <span className="ui-nav-icon" aria-hidden="true">
        {initialOf(title)}
      </span>
      {showLabel && <span className="ui-nav-label">{title}</span>}
    </button>
  );
}

/** Iconița-substitut: inițiala titlului (iconițele reale vin odată cu ecranele din B4). */
function initialOf(title: string): string {
  return title.charAt(0).toLocaleUpperCase("ro");
}
