// Store-ul UIConfig (specs/02, regulile 2–4): singurul loc care schimbă config-ul. Orice schimbare trece prin poarta de
// limite, crește `revision` și intră în `history`. Contrastul și pragurile vin ca dependențe, ca testele să nu
// depindă de a11y/; legarea de funcțiile reale stă în a11y-binding.ts.

import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import type { AuditThresholds, JsonPatchOp, LayoutTemplate, NavPosition, UIConfig } from "@uishapeshifter/contracts";
import type { ConfigViolation } from "./config-violation";
import { applyPatchWithLimits, checkLimits } from "./limit-gate";
import type { ContrastFn } from "./limit-gate";

/** Cine a cerut schimbarea și de ce. Contractele nu au un tip pentru asta; câmpurile urmează AgentStep (journal.ts). */
export interface ChangeMeta {
  by: "agent" | "user" | "adaptation" | "system";
  reason: string;
  runId?: string;
  proposalId?: string;
}

export interface HistoryEntry {
  revision: number;
  at: string; // ISO
  meta: ChangeMeta;
  config: UIConfig;
}

/** La succes, aceeași formă ca ToolData.patch_config; la refuz, încălcările pentru LIMIT_VIOLATION. */
export type ChangeResult =
  { ok: true; revision: number; applied: number } | { ok: false; violations: ConfigViolation[] };

export interface ConfigState {
  config: UIConfig;
  thresholds: AuditThresholds;
  history: HistoryEntry[];
  /** Ecranul curent, în formatul din UISnapshot.route: "home", "messages", "chat:ana". Nu e în UIConfig. */
  route: string;
  /** Meniuri sau dialoguri deschise (UISnapshot.openOverlays). */
  openOverlays: string[];

  applyPatch(ops: readonly JsonPatchOp[], meta: ChangeMeta): ChangeResult;
  applyTemplate(template: LayoutTemplate, meta: ChangeMeta): ChangeResult;
  /** Repune conținutul reviziei cerute ca revizie NOUĂ, ca `revision` să crească mereu și jurnalul să rămână liniar. */
  undo(toRevision: number, meta?: ChangeMeta): ChangeResult;
  setThresholds(thresholds: AuditThresholds): void;
  navigate(route: string): void;
  openOverlay(id: string): void;
  closeOverlay(id: string): void;
}

export interface ConfigStoreDeps {
  contrastRatio: ContrastFn;
  thresholds: AuditThresholds;
  initial?: UIConfig;
  now?: () => string;
}

export type ConfigStore = StoreApi<ConfigState>;

export const HOME_ROUTE = "home";
const INITIAL_META: ChangeMeta = { by: "system", reason: "Configurația de pornire" };
const UNDO_META: ChangeMeta = { by: "user", reason: "Anulare" };

/** Meniul pe care îl presupune fiecare șablon; `simple-tiles` nu are meniu, deci păstrează poziția. */
const TEMPLATE_NAV_POSITION: Record<LayoutTemplate, NavPosition | null> = {
  "sidebar-feed": "left",
  "bottom-nav-stories": "bottom",
  "simple-tiles": null,
};

export function createConfigStore(deps: ConfigStoreDeps): ConfigStore {
  const now = deps.now ?? (() => new Date().toISOString());
  const initial = structuredClone(deps.initial ?? DEFAULT_CONFIG);

  return createStore<ConfigState>()((set, get) => {
    /** Pune un config deja verificat ca revizie nouă. */
    function commit(next: UIConfig, meta: ChangeMeta, applied: number): ChangeResult {
      const revision = get().config.revision + 1;
      const config = { ...next, revision };
      set((state) => ({ config, history: [...state.history, { revision, at: now(), meta, config }] }));
      return { ok: true, revision, applied };
    }

    return {
      config: initial,
      thresholds: deps.thresholds,
      history: [{ revision: initial.revision, at: now(), meta: INITIAL_META, config: initial }],
      route: HOME_ROUTE,
      openOverlays: [],

      applyPatch(ops, meta) {
        const result = applyPatchWithLimits(get().config, ops, get().thresholds, deps.contrastRatio);
        return result.ok ? commit(result.config, meta, ops.length) : result;
      },

      applyTemplate(template, meta) {
        const ops: JsonPatchOp[] = [{ op: "replace", path: "/template", value: template }];
        const position = TEMPLATE_NAV_POSITION[template];
        if (position) ops.push({ op: "replace", path: "/nav/position", value: position });
        return get().applyPatch(ops, meta);
      },

      undo(toRevision, meta = UNDO_META) {
        const entry = get().history.find((h) => h.revision === toRevision);
        if (!entry) {
          return {
            ok: false,
            violations: [
              {
                rule: "invalid-path",
                path: "/revision",
                received: toRevision,
                message: `Revizia ${toRevision} nu există în istoric.`,
              },
            ],
          };
        }
        // Pragurile pot fi urcat între timp (profil nou): și o revizie veche trece prin poartă.
        const violations = checkLimits(entry.config, get().thresholds, deps.contrastRatio);
        if (violations.length > 0) return { ok: false, violations };
        return commit(structuredClone(entry.config), meta, 0);
      },

      setThresholds(thresholds) {
        set({ thresholds });
      },

      navigate(route) {
        set({ route, openOverlays: [] });
      },

      openOverlay(id) {
        if (!get().openOverlays.includes(id)) set((s) => ({ openOverlays: [...s.openOverlays, id] }));
      },

      closeOverlay(id) {
        set((s) => ({ openOverlays: s.openOverlays.filter((o) => o !== id) }));
      },
    };
  });
}
