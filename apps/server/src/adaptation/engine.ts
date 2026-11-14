// Motorul adaptării automate (E3, specs/09): primește loturile de semnale, rulează regulile, trimite propunerea
// mascotei (Suggestion) și pornește agentul cu origin „adaptation” la „Da”. Ține minte ce a propus (să nu repete),
// ce a refuzat omul (să nu mai propună) și încrederea: după 3 „Păstrez” la rând, schimbările mici se aplică direct.

import { randomUUID } from "node:crypto";
import type { PageInfo, ServerMessage, Suggestion, UsageSignal, UserProfile } from "@uishapeshifter/contracts";
import type { ProfileStore } from "../profile";
import { applyProfileUpdate } from "../profile";
import {
  evaluateRules,
  generalPreferencesFinding,
  THRESHOLDS,
  type Finding,
  type RuleThresholds,
  type SeenSignal,
} from "./rules";

/** Cât ținem minte semnalele unui om (regula cu fereastra cea mai lungă are 5 min). */
const SIGNAL_MEMORY_MS = 10 * 60_000;
/** O regulă nu se mai declanșează pentru același element 10 minute după o propunere (specs/09). */
export const COOLDOWN_MS = 10 * 60_000;
/** După atâtea „Păstrez” la rând, schimbările mici se aplică direct (specs/09). */
export const KEEPS_FOR_AUTO_APPLY = 3;
/** Cât de sigur e faptul „nu vrea propunerea X”: omul a spus-o explicit. */
const DISMISS_FACT_CONFIDENCE = 0.9;

export interface AdaptationDeps {
  store: ProfileStore;
  /** Trimite un mesaj în tab-ul omului; false dacă n-are niciunul deschis. */
  send(userId: string, message: ServerMessage): boolean;
  /**
   * Pornește agentul (origin „adaptation”); null dacă omul n-are tab, „queued” dacă rulează altceva.
   * `page`: site-ul de pe care au venit semnalele, ca agentul să știe unde lucrează (#68).
   */
  startRun(userId: string, goal: string, page?: PageInfo): string | "queued" | null;
  now?: () => number;
  thresholds?: RuleThresholds;
  log?: (line: string) => void;
}

interface UserState {
  seen: SeenSignal[];
  /** cheie → până când nu se mai propune */
  cooldownUntil: Map<string, number>;
  /** chei refuzate cu „Nu”: nu se mai propun (și sunt fapte în profil, ca să supraviețuiască repornirii) */
  dismissed: Set<string>;
  pending: Map<string, { suggestion: Suggestion; key: string; page?: PageInfo }>;
  hostsSeen: Set<string>;
  keepStreak: number;
}

export interface AdaptationEngine {
  onSignals(userId: string, signals: UsageSignal[], page?: PageInfo): Promise<void>;
  onDecision(userId: string, suggestionId: string, decision: "accept" | "dismiss"): Promise<void>;
}

export function createAdaptationEngine(deps: AdaptationDeps): AdaptationEngine {
  const now = deps.now ?? (() => Date.now());
  const thresholds = deps.thresholds ?? THRESHOLDS;
  const log = deps.log ?? ((line: string) => console.log(`adaptare: ${line}`));
  const users = new Map<string, UserState>();

  function stateOf(userId: string): UserState {
    let state = users.get(userId);
    if (!state) {
      state = {
        seen: [],
        cooldownUntil: new Map(),
        dismissed: new Set(),
        pending: new Map(),
        hostsSeen: new Set(),
        keepStreak: 0,
      };
      users.set(userId, state);
    }
    return state;
  }

  /** Refuzurile vechi stau în profil ca fapte („Nu vrea propunerea …”, dovada = cheia), ca să nu revină după repornire. */
  function dismissedInProfile(profile: UserProfile, key: string): boolean {
    return profile.facts.some((fact) => fact.evidence.includes(`suggestion-key:${key}`));
  }

  /** Păstrez / Anulez: încrederea crește la 3 la rând și cade la primul „Anulez” (specs/09). */
  async function updateTrust(userId: string, state: UserState, decisions: ("keep" | "undo")[]) {
    if (decisions.length === 0) return;
    const profile = await deps.store.get(userId);
    const trust = { ...profile.trust };
    for (const decision of decisions) {
      if (decision === "keep") {
        trust.accepted += 1;
        state.keepStreak += 1;
        if (state.keepStreak >= KEEPS_FOR_AUTO_APPLY) trust.autoApplyLowRisk = true;
      } else {
        trust.undone += 1;
        state.keepStreak = 0;
        trust.autoApplyLowRisk = false;
      }
    }
    await deps.store.save({ ...profile, trust });
    log(
      `${userId}: încredere ${trust.accepted} păstrate / ${trust.undone} anulate, aplicare automată: ${trust.autoApplyLowRisk ? "da" : "nu"}`,
    );
  }

  async function act(userId: string, state: UserState, finding: Finding, profile: UserProfile, page?: PageInfo) {
    const t = now();
    if ((state.cooldownUntil.get(finding.key) ?? 0) > t) return;
    if (state.dismissed.has(finding.key) || dismissedInProfile(profile, finding.key)) return;
    // O propunere fără răspuns expiră odată cu pauza: omul a ignorat bula, o putem arăta din nou mai târziu.
    for (const [id, pending] of state.pending) {
      if (t - Date.parse(pending.suggestion.createdAt) > COOLDOWN_MS) state.pending.delete(id);
    }
    if ([...state.pending.values()].some((p) => p.key === finding.key)) return;

    // Schimbare mică și omul a avut încredere de 3 ori la rând: o aplicăm direct, iar agentul anunță ce a făcut.
    if (finding.risk === "low" && profile.trust.autoApplyLowRisk) {
      const goal = `${finding.goal} Omul a acceptat des astfel de schimbări: aplic-o direct.`;
      const started = deps.startRun(userId, goal, page);
      if (started === null) return;
      state.cooldownUntil.set(finding.key, t + COOLDOWN_MS);
      log(`${userId}: ${finding.rule} aplicat direct (încredere)`);
      return;
    }

    const suggestion: Suggestion = {
      id: `sug-${randomUUID().slice(0, 8)}`,
      trigger: finding.rule,
      text: finding.text,
      goal: finding.goal,
      risk: finding.risk,
      ...(finding.host ? { host: finding.host } : {}),
      createdAt: new Date(t).toISOString(),
    };
    if (!deps.send(userId, { type: "suggestion", suggestion })) return; // niciun tab deschis: mai încercăm data viitoare
    state.pending.set(suggestion.id, { suggestion, key: finding.key, page });
    state.cooldownUntil.set(finding.key, t + COOLDOWN_MS);
    log(`${userId}: propun ${finding.rule} (${suggestion.id}): ${suggestion.text}`);
  }

  return {
    async onSignals(userId, signals, page) {
      const state = stateOf(userId);
      const t = now();
      state.seen = [
        ...state.seen.filter((s) => t - s.at <= SIGNAL_MEMORY_MS),
        ...signals.map((signal) => ({ signal, at: t, host: page?.host })),
      ];
      const decisions = signals.flatMap((s) => (s.kind === "proposal_decision" ? [s.decision] : []));
      await updateTrust(userId, state, decisions);

      const profile = await deps.store.get(userId);
      const findings = evaluateRules(state.seen, t, thresholds);
      // Prima dată pe un site: preferințele generale care nu s-au aplicat încă acolo (specs/08).
      if (page && !state.hostsSeen.has(page.host)) {
        state.hostsSeen.add(page.host);
        const general = generalPreferencesFinding(page, profile.generalPreferences ?? []);
        if (general) findings.push(general);
      }
      for (const finding of findings) await act(userId, state, finding, profile, page);
    },

    async onDecision(userId, suggestionId, decision) {
      const state = stateOf(userId);
      const pending = state.pending.get(suggestionId);
      if (!pending) return log(`${userId}: decizie pentru o propunere necunoscută (${suggestionId})`);
      state.pending.delete(suggestionId);
      if (decision === "accept") {
        const started = deps.startRun(userId, pending.suggestion.goal, pending.page);
        log(`${userId}: a acceptat ${pending.suggestion.trigger} → rulare ${started ?? "nepornită (niciun tab)"}`);
        return;
      }
      // „Nu”: nu mai propunem asta; îl ținem minte și în profil, ca fapt cu dovadă (specs/09).
      state.dismissed.add(pending.key);
      const profile = await deps.store.get(userId);
      const updated = applyProfileUpdate(
        profile,
        {
          facts: [
            {
              statement: `Nu vrea propunerea: ${pending.suggestion.text}`,
              evidence: [`suggestion-key:${pending.key}`, suggestionId],
              confidence: DISMISS_FACT_CONFIDENCE,
              source: "usage",
            },
          ],
        },
        new Date(now()).toISOString(),
      );
      if (updated.ok) await deps.store.save(updated.value);
      log(`${userId}: a refuzat ${pending.suggestion.trigger}; nu o mai propun`);
    },
  };
}
