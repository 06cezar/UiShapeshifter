// Registrul pus la dispoziția componentelor: useRegistry() pentru colegi (C, D, E) și useAgentElement() pentru
// orice element interactiv (specs/04). Fără RegistryProvider, useAgentElement nu face nimic: data-agent-id din
// JSX rămâne, iar registrul găsește elementul prin rezerva din DOM.

import { createContext, useCallback, useContext, useRef } from "react";
import type { ReactNode, RefCallback } from "react";
import type { AgentRegistry, ElementMeta } from "../agent-bridge";

const RegistryContext = createContext<AgentRegistry | null>(null);

export function RegistryProvider({ registry, children }: { registry: AgentRegistry; children: ReactNode }) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): AgentRegistry {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error("Lipsește AgentBridgeProvider (sau RegistryProvider) deasupra componentei.");
  return registry;
}

/** Înregistrează elementul la montare și îl scoate la demontare. Pune-l ca `ref` pe elementul cu data-agent-id. */
export function useAgentElement(id: string, meta?: ElementMeta): RefCallback<HTMLElement> {
  const registry = useContext(RegistryContext);
  const unregister = useRef<(() => void) | null>(null);
  const role = meta?.role;
  const label = meta?.label;
  const moduleId = meta?.moduleId;
  return useCallback(
    (element: HTMLElement | null) => {
      unregister.current?.();
      unregister.current = null;
      if (element && registry) unregister.current = registry.register(id, element, { role, label, moduleId });
    },
    [registry, id, role, label, moduleId],
  );
}
