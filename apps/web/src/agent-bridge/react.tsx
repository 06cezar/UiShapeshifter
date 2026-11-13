// Puntea și registrul în React (specs/04, „Puntea agentului”): AgentBridgeProvider se pune o singură dată, în App;
// colegii folosesc useAgentBridge() și useRegistry().

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { RegistryProvider } from "../ui/registry-context";
import type { AgentBridge, AgentRegistry } from "./index";

const BridgeContext = createContext<AgentBridge | null>(null);

export function AgentBridgeProvider({
  bridge,
  registry,
  children,
}: {
  bridge: AgentBridge;
  registry: AgentRegistry;
  children: ReactNode;
}) {
  return (
    <BridgeContext.Provider value={bridge}>
      <RegistryProvider registry={registry}>{children}</RegistryProvider>
    </BridgeContext.Provider>
  );
}

export function useAgentBridge(): AgentBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error("Lipsește AgentBridgeProvider deasupra componentei (îl pune App.tsx).");
  return bridge;
}
