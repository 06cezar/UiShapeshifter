// Validarea CSS-ului scris de agent, înainte să ajungă în pagină sau în rețetă (specs/02, „Validarea CSS”).
// Scoate REGULA care încalcă, nu toată foaia, și spune de ce (CssDropped); restul se aplică.
// Ce oprim: tot ce încarcă ceva din afară (url, image-set, @import) — un selector de atribut plus un url() poate trimite
// date din pagină unui server străin —, căile prin care CSS rula cod și orice țintește interfața noastră.
// Ce NU oprim aici: CSS care strică aspectul sau coboară fontul. Asta prinde auditul de după aplicare (specs/07).

import type { CssDropped, CssDropReason } from "@uishapeshifter/contracts";
import { snippetOf, type CssValidation } from "./result";

/**
 * Semnele interfeței noastre: rădăcina shadow a extensiei are în nume „uishapeshifter”, elementele noastre au
 * `data-agent-id`. CSS-ul site-ului nu are voie să le atingă (să ne ascundă mascota sau butonul „Anulez”).
 */
export const OUR_INTERFACE_MARKERS = ["uishapeshifter", "data-agent-id", ":host", "::part", "::slotted"] as const;

/** Singurele @-reguli permise (specs/02). Primele două conțin reguli obișnuite, verificate una câte una. */
const GROUPING_AT_RULES = new Set(["media", "supports"]);
const KEYFRAMES_AT_RULES = new Set(["keyframes", "-webkit-keyframes"]);

/** Funcții CSS care încarcă o resursă după adresă. */
const LOADING_FUNCTIONS = ["url(", "image-set(", "-webkit-image-set(", "src(", "image("] as const;
/** Căi prin care CSS rula cod (IE, Firefox vechi) sau scheme de cod. Nu merg în Chrome, dar nu le lăsăm în rețetă. */
const CODE_PATTERNS = ["expression(", "behavior:", "-moz-binding", "javascript:", "vbscript:"] as const;

const MESSAGES: Record<CssDropReason, string> = {
  "url-function":
    "url() și image-set() încarcă ceva din afara paginii. Folosește doar culori, forme și fonturile site-ului.",
  import: "@import încarcă o foaie de stil din afară. Scrie regulile direct.",
  expression: "expression(), behavior, -moz-binding și javascript: rulează cod. Nu sunt permise.",
  "targets-our-ui": "Regula țintește interfața extensiei (mascota, chatul, panoul). Schimbă doar elementele site-ului.",
  "unsupported-at-rule": "Sunt permise doar @media, @supports și @keyframes.",
  syntax: "Regula nu se poate citi: verifică acoladele, ghilimelele și „;”.",
};

export function validateCss(css: string): CssValidation {
  const dropped: CssDropped[] = [];
  const kept = validateRules(stripComments(css), dropped);
  return { css: kept.join("\n"), dropped };
}

function validateRules(text: string, dropped: CssDropped[]): string[] {
  const kept: string[] = [];
  for (const statement of splitStatements(text)) {
    const result = checkStatement(statement, dropped);
    if (result !== undefined) kept.push(result);
  }
  return kept;
}

/** Ce rămâne din regulă după verificare, sau `undefined` dacă a fost scoasă (motivul e deja în `dropped`). */
function checkStatement(statement: Statement, dropped: CssDropped[]): string | undefined {
  if (statement.kind === "broken") return drop(dropped, statement.text, "syntax");

  const prelude = statement.prelude.trim();
  const readablePrelude = readable(prelude);
  if (statement.kind === "semicolon") {
    // Fără bloc: doar o @-regulă de o linie (@import, @charset…) are sens aici; o declarație rătăcită nu.
    if (!readablePrelude.startsWith("@")) return drop(dropped, statement.text, "syntax");
    return drop(dropped, statement.text, atRuleName(readablePrelude) === "import" ? "import" : "unsupported-at-rule");
  }
  if (prelude === "") return drop(dropped, statement.text, "syntax");

  if (readablePrelude.startsWith("@")) {
    const name = atRuleName(readablePrelude);
    if (name === "import") return drop(dropped, statement.text, "import");
    if (GROUPING_AT_RULES.has(name)) {
      const danger = dangerIn(prelude);
      if (danger) return drop(dropped, statement.text, danger);
      const inner = validateRules(statement.body, dropped);
      return inner.length > 0 ? `${prelude} {\n${inner.join("\n")}\n}` : undefined;
    }
    if (KEYFRAMES_AT_RULES.has(name)) {
      const danger = dangerIn(statement.text);
      return danger ? drop(dropped, statement.text, danger) : `${prelude} {${statement.body}}`;
    }
    return drop(dropped, statement.text, "unsupported-at-rule");
  }

  // Regulă obișnuită. Verificăm toată regula, nu doar selectorul: cu CSS nesting, un selector poate sta și în bloc.
  if (OUR_INTERFACE_MARKERS.some((marker) => readable(statement.text).includes(marker))) {
    return drop(dropped, statement.text, "targets-our-ui");
  }
  const danger = dangerIn(statement.text);
  return danger ? drop(dropped, statement.text, danger) : `${prelude} {${statement.body}}`;
}

/** Primul motiv de a scoate textul, citit ca browserul (escape-uri decodate) și fără spații (`url (`, `java script:`). */
function dangerIn(text: string): CssDropReason | undefined {
  const compact = readable(text).replace(/\s+/g, "");
  if (LOADING_FUNCTIONS.some((fn) => compact.includes(fn))) return "url-function";
  if (compact.includes("@import")) return "import";
  if (CODE_PATTERNS.some((pattern) => compact.includes(pattern))) return "expression";
  return undefined;
}

function drop(dropped: CssDropped[], text: string, reason: CssDropReason): undefined {
  dropped.push({ snippet: snippetOf(text), reason, message: MESSAGES[reason] });
  return undefined;
}

function readable(text: string): string {
  return decodeEscapes(text).toLowerCase();
}

function atRuleName(readablePrelude: string): string {
  return /^@([-a-z0-9_]*)/.exec(readablePrelude)?.[1] ?? "";
}

// ---------- citirea foii: comentarii, escape-uri, reguli ----------

/** Comentariile `/* … *\/` dispar; unul neînchis ține până la capăt, ca în browser. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?(\*\/|$)/g, "");
}

/** Escape-urile CSS: `\75` sau `\000075 ` devin `u`; `\x` devine `x`. Așa le citește și browserul. */
export function decodeEscapes(css: string): string {
  return css.replace(
    /\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g,
    (_match, hex: string | undefined, char: string | undefined) => {
      if (hex === undefined) return char ?? "";
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
    },
  );
}

type Statement =
  | { kind: "block"; text: string; prelude: string; body: string } // `selector { … }` sau `@media … { … }`
  | { kind: "semicolon"; text: string; prelude: string } // `@import …;` sau o declarație rătăcită
  | { kind: "broken"; text: string }; // acoladă în plus, bloc sau text neînchis

/**
 * Împarte foaia în reguli de nivel întâi. Ține cont de ghilimele, paranteze și escape-uri, ca `content: "}"` sau
 * `url(a;b)` să nu taie o regulă în două.
 */
export function splitStatements(css: string): Statement[] {
  const statements: Statement[] = [];
  let start = 0;
  let depth = 0;
  let parens = 0;
  let bodyStart = -1;
  let quote: string | undefined;

  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (char === "\\") {
      i += 1; // caracterul următor e scris „ca atare”
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(") parens += 1;
    else if (char === ")") parens = Math.max(0, parens - 1);
    else if (char === ";" && depth === 0 && parens === 0) {
      const text = css.slice(start, i + 1).trim();
      if (text !== ";" && text !== "") statements.push({ kind: "semicolon", text, prelude: text.slice(0, -1) });
      start = i + 1;
    } else if (char === "{") {
      if (depth === 0) bodyStart = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const text = css.slice(start, i + 1).trim();
        statements.push({
          kind: "block",
          text,
          prelude: css.slice(start, bodyStart),
          body: css.slice(bodyStart + 1, i),
        });
        start = i + 1;
      } else if (depth < 0) {
        statements.push({ kind: "broken", text: css.slice(start, i + 1).trim() });
        depth = 0;
        start = i + 1;
      }
    }
  }
  const rest = css.slice(start).trim();
  if (rest !== "") statements.push({ kind: "broken", text: rest });
  return statements;
}
