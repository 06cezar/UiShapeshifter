// Store-ul UIConfig pus la dispoziția componentelor. Un singur store pe aplicație, creat în App (a11y-binding.ts).

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useStore } from "zustand";
import type { ConfigState, ConfigStore } from "./config-store";

const ConfigStoreContext = createContext<ConfigStore | null>(null);

export function ConfigStoreProvider({ store, children }: { store: ConfigStore; children: ReactNode }) {
  return <ConfigStoreContext.Provider value={store}>{children}</ConfigStoreContext.Provider>;
}

export function useConfigStoreApi(): ConfigStore {
  const store = useContext(ConfigStoreContext);
  if (!store) throw new Error("Lipsește ConfigStoreProvider deasupra componentei.");
  return store;
}

/** Componenta se re-randează doar când se schimbă bucata aleasă din stare. */
export function useConfigState<T>(selector: (state: ConfigState) => T): T {
  return useStore(useConfigStoreApi(), selector);
}
