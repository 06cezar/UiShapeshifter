// Aplicația: încarcă profilul și config-ul utilizatorului (sau valorile implicite, dacă serverul nu răspunde),
// creează store-ul UIConfig și randează interfața doar din config prin LayoutRenderer (specs/02).

import { useEffect, useState } from "react";
import { configForNeeds, createAppConfigStore } from "./ui/a11y-binding";
import { loadInitialConfig, startConfigSaver, userIdFromSearch } from "./ui/config-persistence";
import type { ConfigStore } from "./ui/config-store";
import { ConfigStoreProvider } from "./ui/config-store-context";
import { LayoutRenderer } from "./ui/LayoutRenderer";
import { bindThemeToRoot } from "./ui/theme-sync";
import { API_URL } from "./server-url";

export function App() {
  const [store, setStore] = useState<ConfigStore | null>(null);

  useEffect(() => {
    // În StrictMode efectul rulează de două ori: prima încărcare, oprită, nu mai pornește nimic.
    let stopped = false;
    let stopSync = () => {};
    const userId = userIdFromSearch(window.location.search);
    void loadInitialConfig(userId, { apiUrl: API_URL, adjust: configForNeeds }).then(({ config, needs }) => {
      if (stopped) return;
      const next = createAppConfigStore(needs, config);
      const unbindTheme = bindThemeToRoot(next);
      const stopSaver = startConfigSaver(next, userId, { apiUrl: API_URL });
      stopSync = () => {
        unbindTheme();
        stopSaver();
      };
      setStore(next);
    });
    return () => {
      stopped = true;
      stopSync();
    };
  }, []);

  if (!store) return <p role="status">Se încarcă…</p>;
  return (
    <ConfigStoreProvider store={store}>
      <LayoutRenderer />
    </ConfigStoreProvider>
  );
}
