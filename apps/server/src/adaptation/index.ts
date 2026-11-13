// Adaptarea automată (E3) legată la server: semnalele și deciziile vin prin WebSocket (ws/connection.ts),
// propunerile pleacă în tab-ul omului, iar „Da” pornește agentul cu origin „adaptation”.

import { startRun } from "../agent/run-manager";
import { profileStore } from "../profile";
import { setSignalsHandler, setSuggestionDecisionHandler } from "../ws/connection";
import { latestSessionOf, sendToSession } from "../ws/sessions";
import { createAdaptationEngine } from "./engine";
import { DEMO_THRESHOLDS, THRESHOLDS } from "./rules";

export { createAdaptationEngine } from "./engine";

export function startAdaptation(): void {
  const engine = createAdaptationEngine({
    store: profileStore,
    send: (userId, message) => {
      const session = latestSessionOf(userId);
      return session ? sendToSession(session, message) : false;
    },
    startRun: (userId, goal) => startRun(userId, goal, "adaptation"),
    // ADAPT_DEMO=1: praguri mai mici pentru demo (2 ratări în loc de 3), specs/09
    thresholds: process.env.ADAPT_DEMO === "1" ? DEMO_THRESHOLDS : THRESHOLDS,
  });

  setSignalsHandler((userId, signals, page) => {
    // E2: loturile se văd în log; E3: regulile se uită la ele
    console.log(`signals: ${userId} a trimis ${signals.length}: ${signals.map((s) => s.kind).join(", ")}`);
    engine
      .onSignals(userId, signals, page)
      .catch((error) => console.error("adaptare: semnalele n-au putut fi citite", error));
  });
  setSuggestionDecisionHandler((userId, suggestionId, decision) => {
    console.log(`suggestion: ${userId} a ales ${decision} pentru ${suggestionId}`);
    engine
      .onDecision(userId, suggestionId, decision)
      .catch((error) => console.error("adaptare: decizia n-a putut fi aplicată", error));
  });
}
