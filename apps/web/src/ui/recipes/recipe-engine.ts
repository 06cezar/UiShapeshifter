// Motorul de rețete v1 (B5, specs/02): aplică CSS-ul validat al agentului într-un <style> al extensiei, ține reviziile,
// salvează rețeta pe site și o reaplică fără AI. Etapa 1 folosește doar `css`; DomOp vine în B6.

import {
  DOM_OP_LIMITS,
  RECIPE_LIMITS,
  type ApplyCssData,
  type ApplyOpsData,
  type DomOp,
  type SkippedOp,
  type CssDropped,
  type RecipeRevision,
  type ToolResult,
} from "@uishapeshifter/contracts";
import {
  recipeWithoutRequest,
  requestHistory,
  UNDO_RUN_PREFIX,
  validateCss,
  type RequestEntry,
} from "../../validation";
import type { RecipeView } from "../page-registry/registry";
import { BASE_STYLE_ID } from "../../a11y/base-preferences";
import { DISLIKES_STYLE_ID } from "../../a11y/dislike-rules";
import { checkOps, createDomOpsApplier, HIDDEN_STYLE_ID } from "./dom-ops";
import { fadeOut, measureLeaving } from "./fade";
import { clearRecipe, loadRecipe, saveRecipe, type RecipeStorage, type StoredRecipe } from "./recipe-store";

/** Id-ul <style>-ului rețetei: conține „uishapeshifter”, deci CSS-ul agentului nu-l poate ținti. */
export const RECIPE_STYLE_ID = "uishapeshifter-recipe";
/** Foile extensiei (rețeta, preferințele de bază, ce te deranjează) au id-uri cu prefixul ăsta. */
const OUR_STYLE_ID_PREFIX = "uishapeshifter-";
/**
 * Foile noastre care trebuie să vină după rețetă: ascunderile motorului, ce te deranjează, mișcarea redusă. Foaia
 * preferințelor generale (`uishapeshifter-general`, #137) NU e aici: ea stă înaintea rețetei, ca agentul s-o poată bate.
 */
const AFTER_RECIPE_STYLE_IDS = [HIDDEN_STYLE_ID, DISLIKES_STYLE_ID, BASE_STYLE_ID];

/** Pagina a adăugat o foaie de stil (`<style>` sau `<link rel="stylesheet">`)? Doar atunci verificăm ordinea. */
function addsStyleSheet(record: MutationRecord): boolean {
  return [...record.addedNodes].some(
    (node) =>
      node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.relList.contains("stylesheet")),
  );
}
/** Cel mult atâția selectori „care nu găsesc nimic” în răspunsul către agent (specs/02). */
const MAX_UNMATCHED = 10;
/** Cât așteptăm după ultima schimbare a paginii înainte să reaplicăm operațiile (site-urile schimbă în rafale). */
export const REAPPLY_DEBOUNCE_MS = 150;
/**
 * Limita anti-buclă: cel mult atâtea REFACERI (operații deja aplicate, stricate de site) într-o fereastră. Peste ea,
 * site-ul „se luptă” cu noi: lăsăm stricăciunea până la următoarea schimbare a rețetei. Operațiile care așteaptă
 * doar să apară elementul nu intră la socoteală.
 */
export const MAX_REPAIRS_PER_WINDOW = 10;
export const REPAIR_WINDOW_MS = 5000;

export interface RecipeEngineOptions {
  host: string;
  storage: RecipeStorage;
  doc?: Document;
  now?: () => Date;
  /**
   * Interfața noastră mai e vizibilă? Dacă o regulă nouă a ascuns-o (ceva ce validarea nu poate vedea, ex. `div {…}`),
   * revizia se anulează și agentul primește `targets-our-ui`.
   */
  isOurUiVisible?: () => boolean;
  /** Acțiunea `askAgent` a unei componente adăugate (B3): content script-ul trimite scopul ca o cerere nouă. */
  askAgent?: (goal: string) => void;
}

export interface RecipeEngine {
  /** Citește rețeta salvată și o pune în pagină. Fără server, fără model. */
  load(): Promise<void>;
  applyCss(args: {
    css: string;
    mode?: "append" | "replace";
    reason: string;
    runId?: string;
  }): Promise<ToolResult<ApplyCssData>>;
  /**
   * Schimbări de structură (specs/02, 03): validate, aplicate după CSS, adăugate la `recipe.ops` într-o revizie nouă.
   * În rețetă intră doar operațiile aplicate; cele sărite sunt în `skipped`. Dacă nu s-a aplicat niciuna, răspunsul
   * e tot `ok`, cu `applied: 0` și revizia neschimbată.
   */
  applyOps(args: { ops: unknown[]; reason: string; runId?: string }): Promise<ToolResult<ApplyOpsData>>;
  /**
   * „Anulez”: rețeta devine exact cea de la `revision`, iar reviziile de după ea se șterg (revizia coboară, specs/02).
   * `revertTo(0)` = rețeta goală. O revizie care nu mai e în istoric întoarce INVALID_ARGS și nu schimbă nimic.
   */
  revertTo(revision: number): Promise<ToolResult<{ revision: number }>>;
  /** Cererile care încă au efect pe site-ul acesta, în ordine: lista „Ce ai cerut aici” din panou. */
  history(): RequestEntry[];
  /**
   * Scoate o singură cerere; cele de dinainte și de după rămân (C, `recipeWithoutRequest`). Rezultatul intră ca
   * revizie nouă, deci „Anulez” al rulării sau „Revino la original” merg ca înainte. `droppedOps` = operații de după
   * care țineau de un element adăugat de cererea scoasă.
   */
  undoRequest(
    requestId: string,
  ): Promise<{ ok: true; revision: number; droppedOps: number } | { ok: false; message: string }>;
  /** „Revino la original”: golește rețeta gazdei. */
  reset(): Promise<void>;
  /** Ce a scris alt tab sau popup-ul în stocare: aplicăm aici fără să salvăm din nou. */
  adopt(stored: StoredRecipe): void;
  view(): RecipeView;
  /** Oprește urmărirea paginii (observer, reaplicarea în așteptare). Pagina rămâne cum e. */
  dispose(): void;
  /** Oprește foaia rețetei și întoarce funcția care o repornește (auditul „cum era înainte de agent”, C2). */
  pause(): () => void;
}

/**
 * Selectorii regulilor obișnuite (și din @media/@supports), fără pseudo-elemente, ca să-i putem căuta în pagină.
 * Primește CSS deja trecut prin validateCss, deci bine format.
 */
export function selectorsOf(css: string): string[] {
  const selectors: string[] = [];
  let pos = 0;
  while (pos < css.length) {
    const open = css.indexOf("{", pos);
    if (open === -1) break;
    const close = closingBrace(css, open);
    const prelude = css
      .slice(pos, open)
      .replace(/^[\s;}]+/, "")
      .trim();
    if (/^@(media|supports)/i.test(prelude)) selectors.push(...selectorsOf(css.slice(open + 1, close)));
    else if (!prelude.startsWith("@")) selectors.push(...splitSelectorList(prelude));
    pos = close + 1;
  }
  return selectors.map((s) => s.replace(PSEUDO_ELEMENTS, "").trim()).filter(Boolean);
}

/** Pseudo-elementele nu se pot căuta cu querySelector; le scoatem și căutăm elementul gazdă. */
const PSEUDO_ELEMENTS = /::?(before|after|placeholder|marker|selection|first-line|first-letter|backdrop)\b/gi;

function closingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i;
  }
  return css.length - 1;
}

/** „a, b:not(.x, .y)” → ["a", "b:not(.x, .y)"]: virgulele din paranteze nu despart. */
function splitSelectorList(prelude: string): string[] {
  const parts: string[] = [];
  let parens = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    if (prelude[i] === "(") parens++;
    else if (prelude[i] === ")") parens--;
    else if (prelude[i] === "," && parens === 0) {
      parts.push(prelude.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(prelude.slice(start).trim());
  return parts.filter(Boolean);
}

/** `ops` pe o revizie doar dacă există, ca rețetele din etapa 1 să rămână cum erau. */
function opsField(ops: DomOp[] | undefined): { ops?: DomOp[] } {
  return ops ? { ops } : {};
}

function opsInvalid(message: string, skipped: SkippedOp[]): ToolResult<ApplyOpsData> {
  return { ok: false, error: { code: "INVALID_ARGS", message, details: { skipped } } };
}

function invalid(message: string, dropped: CssDropped[]): ToolResult<ApplyCssData> {
  return { ok: false, error: { code: "INVALID_ARGS", message, details: { dropped } } };
}

export function createRecipeEngine(options: RecipeEngineOptions): RecipeEngine {
  const doc = options.doc ?? document;
  const now = options.now ?? (() => new Date());
  let stored: StoredRecipe = {
    recipe: { host: options.host, revision: 0, css: "", updatedAt: now().toISOString() },
    revisions: [],
  };

  /** <style>-ul rețetei, creat la nevoie; la document_start <head> poate lipsi, deci îl punem pe <html>. */
  function styleElement(): HTMLStyleElement {
    const existing = doc.getElementById(RECIPE_STYLE_ID);
    if (existing instanceof HTMLStyleElement) return existing;
    const style = doc.createElement("style");
    style.id = RECIPE_STYLE_ID;
    (doc.head ?? doc.documentElement).appendChild(style);
    return style;
  }

  function renderCss() {
    const style = styleElement();
    if (style.textContent !== stored.recipe.css) style.textContent = stored.recipe.css;
    // Și la aplicare: stilul site-ului poate fi deja în pagină, pus după foaia noastră încă goală.
    if (stored.recipe.css) keepRecipeAfterSiteSheets();
  }

  /**
   * La aceeași putere (`!important`, aceiași selectori) câștigă foaia de mai jos: Bing pune `<style id="iotd-lite-bg">`
   * cu imaginea de fundal după rețetă și o bate. Dacă o foaie a site-ului a ajuns după a noastră, o mutăm după ea.
   * Foile noastre (`uishapeshifter-*`, ex. preferințele de bază) rămân unde sunt: ele trebuie să vină ultimele.
   */
  function keepRecipeAfterSiteSheets() {
    const style = doc.getElementById(RECIPE_STYLE_ID);
    if (!style) return;
    const siteSheets = [...doc.querySelectorAll('style, link[rel~="stylesheet"]')].filter(
      (sheet) => !sheet.id.startsWith(OUR_STYLE_ID_PREFIX),
    );
    const last = siteSheets.at(-1);
    if (!last?.parentElement || !(style.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
    // Foile care trebuie să rămână ultimele (AFTER_RECIPE_STYLE_IDS) vin după rețetă, în ordinea lor din pagină,
    // altfel le-ar bate rețeta mutată peste ele.
    const afterRecipe = [...doc.querySelectorAll("style[id]")].filter((sheet) =>
      AFTER_RECIPE_STYLE_IDS.includes(sheet.id),
    );
    let previous: Element = style;
    last.parentElement.insertBefore(style, last.nextSibling);
    for (const sheet of afterRecipe) {
      previous.after(sheet);
      previous = sheet;
    }
  }

  const domOps = createDomOpsApplier({ doc, askAgent: (goal) => options.askAgent?.(goal) });
  let reapplyTimer: ReturnType<typeof setTimeout> | undefined;
  let repairTimes: number[] = [];
  let warnedLoop = false;

  /** Ce schimbă motorul însuși nu e „pagina s-a schimbat”: scoatem din observer înregistrările noastre. */
  function mutate(change: () => void) {
    change();
    observer.takeRecords();
  }

  /** Pagina adusă exact la rețetă: foaia de stil, apoi operațiile (anulează tot ce era aplicat, aplică tot în ordine). */
  function render() {
    clearTimeout(reapplyTimer);
    repairTimes = []; // o schimbare a rețetei pornește o fereastră nouă pentru limita anti-buclă
    warnedLoop = false;
    mutate(() => {
      renderCss();
      domOps.sync(stored.recipe.ops ?? []);
    });
  }

  /** Doar ce lipsește, în ordinea din rețetă; refacerile sunt limitate. */
  function reapply() {
    const ops = stored.recipe.ops ?? [];
    if (ops.length === 0) return;
    const at = now().getTime();
    repairTimes = repairTimes.filter((t) => at - t < REPAIR_WINDOW_MS);
    const allowRepair = repairTimes.length < MAX_REPAIRS_PER_WINDOW;
    let result = { added: 0, repaired: 0, brokenLeft: 0 };
    mutate(() => (result = domOps.reconcile(ops, { allowRepair })));
    for (let i = 0; i < result.repaired; i++) repairTimes.push(at);
    if (result.brokenLeft > 0 && !warnedLoop) {
      warnedLoop = true;
      console.warn(
        "[rețete] Site-ul strică mereu schimbările; nu le mai refac până la următoarea schimbare a rețetei.",
      );
    }
  }

  function scheduleReapply() {
    clearTimeout(reapplyTimer);
    reapplyTimer = setTimeout(reapply, REAPPLY_DEBOUNCE_MS);
  }

  // Pagina se schimbă singură: foaia scoasă din <head> se pune la loc imediat (specs/02), operațiile după debounce.
  const observer = new MutationObserver((records) => {
    if (stored.recipe.css && !doc.getElementById(RECIPE_STYLE_ID)) mutate(renderCss);
    if (stored.recipe.css && records.some(addsStyleSheet)) mutate(keepRecipeAfterSiteSheets);
    if (stored.recipe.ops?.length) scheduleReapply();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  // La document_start corpul paginii încă lipsește: când e gata, încercăm imediat ce n-a putut fi aplicat.
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", reapply, { once: true });

  function unmatched(css: string): string[] {
    const missing: string[] = [];
    for (const selector of selectorsOf(css)) {
      try {
        if (!doc.querySelector(selector)) missing.push(selector);
      } catch {
        missing.push(selector);
      }
      if (missing.length >= MAX_UNMATCHED) break;
    }
    return missing;
  }

  return {
    async load() {
      stored = await loadRecipe(options.storage, options.host, now().toISOString());
      render();
    },

    async applyCss({ css, mode = "append", reason, runId }) {
      const { css: kept, dropped } = validateCss(css);
      if (!kept.trim()) {
        return invalid("Nu a rămas nimic de aplicat după validare; vezi dropped pentru motive.", dropped);
      }
      const nextCss = mode === "replace" || !stored.recipe.css ? kept : `${stored.recipe.css}\n${kept}`;
      const bytes = new TextEncoder().encode(nextCss).length;
      if (bytes > RECIPE_LIMITS.maxCssBytes) {
        return invalid(
          `Foaia rețetei ar avea ${bytes} octeți, peste limita de ${RECIPE_LIMITS.maxCssBytes}. Scurtează sau folosește mode „replace”.`,
          dropped,
        );
      }

      const previous = stored;
      const at = now().toISOString();
      const revision = previous.recipe.revision + 1;
      stored = {
        recipe: { ...previous.recipe, revision, css: nextCss, updatedAt: at },
        revisions: [
          ...previous.revisions,
          { revision, css: nextCss, ...opsField(previous.recipe.ops), reason, runId, at } satisfies RecipeRevision,
        ].slice(-RECIPE_LIMITS.maxRevisions),
      };
      mutate(renderCss);

      if (options.isOurUiVisible && !options.isOurUiVisible()) {
        stored = previous;
        mutate(renderCss);
        return invalid(
          "Regulile noi ascundeau interfața extensiei; revizia a fost anulată. Țintește doar elementele site-ului.",
          [
            ...dropped,
            {
              snippet: kept.slice(0, 120),
              reason: "targets-our-ui",
              message:
                "O regulă largă (ex. div, html > *) a ascuns mascota sau panoul. Folosește selectori din snapshot.",
            },
          ],
        );
      }

      await saveRecipe(options.storage, stored);
      return {
        ok: true,
        data: { revision, cssBytes: bytes, dropped, unmatchedSelectors: unmatched(kept) },
      };
    },

    async applyOps({ ops, reason, runId }) {
      if (ops.length === 0 || ops.length > DOM_OP_LIMITS.maxOpsPerCall) {
        return opsInvalid(`apply_ops primește între 1 și ${DOM_OP_LIMITS.maxOpsPerCall} operații pe apel.`, []);
      }
      const current = stored.recipe.ops ?? [];
      const { accepted, skipped, htmlDropped } = checkOps(ops, current, doc);
      if (current.length + accepted.length > DOM_OP_LIMITS.maxOpsPerRecipe) {
        return opsInvalid(
          `Rețeta ar avea ${current.length + accepted.length} operații, peste limita de ${DOM_OP_LIMITS.maxOpsPerRecipe}. ` +
            "Scoate ce nu mai trebuie (Anulez) sau folosește CSS.",
          skipped,
        );
      }

      // Ce ascund operațiile noi și se vede acum: măsurat înainte, pentru urma vizuală de după (fade.ts).
      const leaving = measureLeaving(
        accepted.flatMap(({ op }) => (op.op === "remove" ? [...doc.querySelectorAll(op.selector)] : [])),
      );

      // Aplicăm rețeta de acum plus operațiile noi; în rețetă rămân doar cele noi care chiar s-au aplicat.
      let outcomes: ReturnType<typeof domOps.sync> = [];
      mutate(() => (outcomes = domOps.sync([...current, ...accepted.map((a) => a.op)])));
      const added: DomOp[] = [];
      accepted.forEach(({ index, op }, i) => {
        const outcome = outcomes[current.length + i]!;
        if (outcome.ok) added.push(op);
        else skipped.push({ index, reason: outcome.reason, message: outcome.message });
      });
      skipped.sort((a, b) => a.index - b.index);
      const nextOps = [...current, ...added];
      if (added.length !== accepted.length) mutate(() => domOps.sync(nextOps)); // fără cele sărite, ca pozițiile să corespundă

      if (added.length === 0) {
        return { ok: true, data: { revision: stored.recipe.revision, applied: 0, skipped, htmlDropped } };
      }
      if (options.isOurUiVisible && !options.isOurUiVisible()) {
        mutate(() => domOps.sync(current));
        return opsInvalid(
          "Schimbarea ascundea interfața extensiei; am anulat-o. Țintește doar elementele site-ului.",
          skipped,
        );
      }

      const at = now().toISOString();
      const revision = stored.recipe.revision + 1;
      stored = {
        recipe: { ...stored.recipe, revision, ops: nextOps, updatedAt: at },
        revisions: [
          ...stored.revisions,
          { revision, css: stored.recipe.css, ops: nextOps, reason, runId, at } satisfies RecipeRevision,
        ].slice(-RECIPE_LIMITS.maxRevisions),
      };
      // Elementele sunt deja ascunse (snapshot-ul le vede `hiddenBy: "recipe"`); peste locul lor rămâne o urmă care se
      // stinge. Doar la schimbările agentului: la încărcare și la reaplicare, rețeta apare fără animație.
      fadeOut(
        leaving.filter(({ element }) => element.isConnected && getComputedStyle(element).display === "none"),
        doc,
      );
      await saveRecipe(options.storage, stored);
      return { ok: true, data: { revision, applied: added.length, skipped, htmlDropped } };
    },

    async revertTo(revision) {
      if (!Number.isInteger(revision) || revision < 0) {
        return {
          ok: false,
          error: { code: "INVALID_ARGS", message: `Revizia trebuie să fie un număr întreg ≥ 0, nu ${revision}.` },
        };
      }
      const at = now().toISOString();
      let next: StoredRecipe;
      if (revision === 0) {
        next = { recipe: { host: options.host, revision: 0, css: "", updatedAt: at }, revisions: [] };
      } else {
        const target = stored.revisions.find((r) => r.revision === revision);
        if (!target) {
          const kept = stored.revisions.map((r) => r.revision);
          return {
            ok: false,
            error: {
              code: "INVALID_ARGS",
              message: `Revizia ${revision} nu mai e în istoric (păstrate: ${kept.length ? kept.join(", ") : "niciuna"}, plus 0 = rețeta goală).`,
            },
          };
        }
        next = {
          recipe: {
            host: options.host,
            revision,
            css: target.css,
            ...(target.ops ? { ops: target.ops } : {}),
            updatedAt: at,
          },
          revisions: stored.revisions.filter((r) => r.revision <= revision),
        };
      }
      stored = next;
      render();
      await saveRecipe(options.storage, stored);
      return { ok: true, data: { revision } };
    },

    history() {
      return requestHistory(stored.revisions);
    },

    async undoRequest(requestId) {
      const entry = requestHistory(stored.revisions).find((request) => request.requestId === requestId);
      if (!entry) return { ok: false, message: "Cererea nu mai e în istoricul acestui site." };
      const result = recipeWithoutRequest(stored.revisions, requestId);
      if (!result.ok) return result;
      const { css, ops, droppedOps } = result.recipe;
      const at = now().toISOString();
      const revision = stored.recipe.revision + 1;
      stored = {
        recipe: { host: options.host, revision, css, ...opsField(ops), updatedAt: at },
        revisions: [
          ...stored.revisions,
          {
            revision,
            css,
            ...opsField(ops),
            reason: `Anulat: ${entry.reason}`,
            runId: `${UNDO_RUN_PREFIX}${requestId}`,
            at,
          } satisfies RecipeRevision,
        ].slice(-RECIPE_LIMITS.maxRevisions),
      };
      render();
      await saveRecipe(options.storage, stored);
      return { ok: true, revision, droppedOps: droppedOps.length };
    },

    async reset() {
      stored = { recipe: { host: options.host, revision: 0, css: "", updatedAt: now().toISOString() }, revisions: [] };
      render(); // fără ops: anulează tot ce era aplicat
      await clearRecipe(options.storage, options.host);
    },

    adopt(next) {
      stored = next;
      render();
    },

    dispose() {
      clearTimeout(reapplyTimer);
      observer.disconnect();
    },

    pause() {
      const sheet = (doc.getElementById(RECIPE_STYLE_ID) as HTMLStyleElement | null)?.sheet;
      if (!sheet) return () => {};
      sheet.disabled = true;
      return () => {
        sheet.disabled = false;
      };
    },

    view() {
      return {
        revision: stored.recipe.revision,
        css: stored.recipe.css,
        styleElement: doc.getElementById(RECIPE_STYLE_ID) as HTMLStyleElement | null,
        requests: requestHistory(stored.revisions).map(({ requestId, reason, at }) => ({ requestId, reason, at })),
      };
    },
  };
}
