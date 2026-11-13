// Motorul de rețete v1 (B5, specs/02): aplică CSS-ul validat al agentului într-un <style> al extensiei, ține reviziile,
// salvează rețeta pe site și o reaplică fără AI. Etapa 1 folosește doar `css`; DomOp vine în B6.

import {
  RECIPE_LIMITS,
  type ApplyCssData,
  type CssDropped,
  type RecipeRevision,
  type ToolResult,
} from "@uishapeshifter/contracts";
import { validateCss } from "../../validation";
import type { RecipeView } from "../page-registry/registry";
import { clearRecipe, loadRecipe, saveRecipe, type RecipeStorage, type StoredRecipe } from "./recipe-store";

/** Id-ul <style>-ului rețetei: conține „uishapeshifter”, deci CSS-ul agentului nu-l poate ținti. */
export const RECIPE_STYLE_ID = "uishapeshifter-recipe";
/** Cel mult atâția selectori „care nu găsesc nimic” în răspunsul către agent (specs/02). */
const MAX_UNMATCHED = 10;

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
  /** „Revino la original”: golește rețeta gazdei. */
  reset(): Promise<void>;
  /** Ce a scris alt tab sau popup-ul în stocare: aplicăm aici fără să salvăm din nou. */
  adopt(stored: StoredRecipe): void;
  view(): RecipeView;
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

  function render() {
    const style = styleElement();
    if (style.textContent !== stored.recipe.css) style.textContent = stored.recipe.css;
  }

  // Unele site-uri își rescriu <head>-ul: dacă ne scot foaia, o punem la loc (specs/02, „Reaplicarea fără AI”).
  const keeper = new MutationObserver(() => {
    if (stored.recipe.css && !doc.getElementById(RECIPE_STYLE_ID)) render();
  });
  keeper.observe(doc.documentElement, { childList: true, subtree: true });

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
        recipe: { host: options.host, revision, css: nextCss, updatedAt: at },
        revisions: [
          ...previous.revisions,
          { revision, css: nextCss, reason, runId, at } satisfies RecipeRevision,
        ].slice(-RECIPE_LIMITS.maxRevisions),
      };
      render();

      if (options.isOurUiVisible && !options.isOurUiVisible()) {
        stored = previous;
        render();
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

    async reset() {
      stored = { recipe: { host: options.host, revision: 0, css: "", updatedAt: now().toISOString() }, revisions: [] };
      render();
      await clearRecipe(options.storage, options.host);
    },

    adopt(next) {
      stored = next;
      render();
    },

    view() {
      return {
        revision: stored.recipe.revision,
        css: stored.recipe.css,
        styleElement: doc.getElementById(RECIPE_STYLE_ID) as HTMLStyleElement | null,
      };
    },
  };
}
