// Aplicația: încarcă profilul și config-ul utilizatorului (sau valorile implicite, dacă serverul nu răspunde),
// creează store-ul UIConfig, registrul și puntea agentului (singurul WebSocket), apoi randează interfața doar din
// config prin LayoutRenderer (specs/02, specs/04).

import { useEffect, useState } from "react";
import { AgentBridgeProvider, startAgentBridge } from "./agent-bridge";
import { registerAuditTool } from "./a11y";
import type { AgentBridge, AgentRegistry } from "./agent-bridge";
import { configForNeeds, createAppConfigStore } from "./ui/a11y-binding";
import { loadInitialConfig, startConfigSaver, userIdFromSearch } from "./ui/config-persistence";
import type { ConfigStore } from "./ui/config-store";
import { ConfigStoreProvider } from "./ui/config-store-context";
import { LayoutRenderer } from "./ui/LayoutRenderer";
import { createRegistry } from "./ui/registry";
import { bindThemeToRoot } from "./ui/theme-sync";
import { API_URL, WS_URL } from "./server-url";

interface Session {
  store: ConfigStore;
  registry: AgentRegistry;
  bridge: AgentBridge;
}

declare global {
  interface Window {
    /** Doar în dev, pentru verificarea manuală din consolă. */
    agentBridge?: AgentBridge;
    uiStore?: ConfigStore;
  }
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // În StrictMode efectul rulează de două ori: prima încărcare, oprită, nu mai pornește nimic.
    let stopped = false;
    let stopSync = () => {};
    const userId = userIdFromSearch(window.location.search);
    void loadInitialConfig(userId, { apiUrl: API_URL, adjust: configForNeeds }).then(({ config, needs }) => {
      if (stopped) return;
      const store = createAppConfigStore(needs, config);
      const registry = createRegistry(store);
      const bridge = startAgentBridge({ url: WS_URL, userId, store, registry });
      const unregisterAudit = registerAuditTool(bridge);
      const unbindTheme = bindThemeToRoot(store);
      const stopSaver = startConfigSaver(store, userId, { apiUrl: API_URL });
      if (import.meta.env.DEV) {
        window.agentBridge = bridge;
        window.uiStore = store;
      }
      stopSync = () => {
        unregisterAudit();
        bridge.stop();
        unbindTheme();
        stopSaver();
      };
      setSession({ store, registry, bridge });
    });
    return () => {
      stopped = true;
      stopSync();
    };
  }, []);

  if (!session) return <p role="status">Se încarcă…</p>;
  return (
    <ConfigStoreProvider store={session.store}>
      <AgentBridgeProvider bridge={session.bridge} registry={session.registry}>
        <LayoutRenderer />
      </AgentBridgeProvider>
    </ConfigStoreProvider>
  );
}
