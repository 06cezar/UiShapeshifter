// Propunerea mascotei (E3, specs/09): o bulă discretă, fără fereastră care blochează, cu „Da” și „Nu” mari.
// „Da” → serverul pornește agentul (origin „adaptation”); „Nu” → regula nu se mai repetă. Textul vine de la server
// și intră cu textContent, niciodată ca HTML.

import type { Suggestion } from "@uishapeshifter/contracts";
import type { OurRoot } from "./shadow-root";

/** Fără răspuns în atât, bula dispare singură (omul a ales s-o ignore; serverul o poate propune mai târziu). */
export const SUGGESTION_TIMEOUT_MS = 45_000;

const BUBBLE_CSS = `
.suggestion {
  /* în dreapta, deasupra mascotei care o propune; chatul stă în stânga, deci nu-i acoperim câmpul (nota lui B, D5) */
  position: fixed; right: calc(var(--uis-space) * 2); bottom: calc(var(--uis-target) * 3);
  width: min(calc(var(--uis-target) * 7), calc(100vw - var(--uis-space) * 4)); box-sizing: border-box;
  display: flex; flex-direction: column; gap: var(--uis-space);
  padding: calc(var(--uis-space) * 2); background: var(--uis-bg); color: var(--uis-fg);
  font: var(--uis-font-size)/1.5 var(--uis-font); border-radius: calc(var(--uis-space) * 2);
  box-shadow: var(--uis-shadow);
}
.suggestion[hidden] { display: none; }
.suggestion-actions { display: flex; gap: var(--uis-space); }
.suggestion button {
  flex: 1; min-height: var(--uis-target); font: inherit; border: none; border-radius: var(--uis-radius); cursor: pointer;
}
.suggestion .yes { background: var(--uis-accent); color: var(--uis-bg); }
.suggestion .no { background: transparent; color: var(--uis-fg); outline: 2px solid var(--uis-muted); }
.suggestion button:focus-visible { outline: 3px solid var(--uis-fg); outline-offset: 2px; }
`;

export interface SuggestionBubble {
  show(suggestion: Suggestion): void;
}

export function mountSuggestionBubble(
  root: OurRoot,
  options: {
    decide(suggestionId: string, decision: "accept" | "dismiss"): void;
    /** Mascota „vorbește” cât e bula deschisă (opțional). */
    onShow?(): void;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
  },
): SuggestionBubble {
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as number));
  root.addStyle(BUBBLE_CSS);

  const bubble = document.createElement("section");
  bubble.className = "suggestion";
  bubble.hidden = true;
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");
  bubble.innerHTML = `
    <p class="suggestion-text"></p>
    <div class="suggestion-actions">
      <button type="button" class="yes" data-agent-id="suggestion.accept">Da</button>
      <button type="button" class="no" data-agent-id="suggestion.dismiss">Nu</button>
    </div>`;
  root.shadow.appendChild(bubble);
  const text = bubble.querySelector<HTMLElement>(".suggestion-text")!;
  const yes = bubble.querySelector<HTMLButtonElement>(".yes")!;
  const no = bubble.querySelector<HTMLButtonElement>(".no")!;

  let current: Suggestion | null = null;
  let timer: unknown = null;

  function close() {
    current = null;
    bubble.hidden = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function answer(decision: "accept" | "dismiss") {
    if (!current) return;
    const id = current.id;
    close();
    options.decide(id, decision);
  }

  yes.addEventListener("click", () => answer("accept"));
  no.addEventListener("click", () => answer("dismiss"));

  return {
    show(suggestion) {
      // O propunere nouă o înlocuiește pe cea veche, fără răspuns (nu le stivuim peste pagină).
      if (timer !== null) clearTimer(timer);
      current = suggestion;
      text.textContent = suggestion.text;
      bubble.hidden = false;
      options.onShow?.();
      timer = setTimer(close, SUGGESTION_TIMEOUT_MS);
    },
  };
}
