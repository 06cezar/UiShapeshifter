// Validarea CSS-ului scris de agent, înainte să ajungă în pagină sau în rețetă (specs/01, „Validarea”).
// Ce oprim: tot ce încarcă ceva din afară (url, @import, image-set) — un selector de atribut plus un url() poate trimite
// date din pagină unui server străin —, vechile căi de a rula cod din CSS și orice țintește interfața noastră.
// Ce NU oprim aici: CSS care strică aspectul sau coboară fontul. Asta prinde auditul de după aplicare (specs/07).

import { excerptOf, type CssValidation, type Rejection, type RejectionRule } from "./result";

/** Mai lung de atât nu e o rețetă de site, e o greșeală a modelului; și ar încetini fiecare încărcare. */
export const MAX_CSS_CHARS = 50_000;

/**
 * Semnele interfeței noastre: elementul-gazdă al shadow DOM-ului are în nume „uishapeshifter”, elementele noastre au
 * `data-agent-id`. CSS-ul site-ului nu are voie să le atingă (să ne ascundă mascota sau butonul „Anulez”).
 */
export const OUR_INTERFACE_MARKERS = ["uishapeshifter", "data-agent-id", ":host", "::part", "::slotted"] as const;

/** Funcții CSS care încarcă o resursă după adresă. */
const LOADING_FUNCTIONS = ["url(", "image-set(", "-webkit-image-set(", "src(", "image("] as const;
const SCRIPT_SCHEMES = ["javascript:", "vbscript:"] as const;
/** Căi vechi (IE, Firefox vechi) prin care CSS rula cod. Nu merg în Chrome, dar nu le lăsăm în rețetă. */
const LEGACY_BINDINGS = ["-moz-binding", "behavior:"] as const;

export function validateCss(css: string): CssValidation {
  if (css.length > MAX_CSS_CHARS) {
    return reject([
      {
        rule: "css-too-long",
        message: `CSS-ul are ${css.length} caractere; maximul e ${MAX_CSS_CHARS}. Scrie doar regulile necesare.`,
      },
    ]);
  }

  const rejected: Rejection[] = [];
  // Verificăm forma pe care o citește browserul: fără comentarii, cu escape-urile decodate (`u\72 l(` e tot `url(`).
  const readable = decodeEscapes(stripComments(css)).toLowerCase();
  // Fără spații, ca `url (` sau `java script:` scrise ciudat să nu scape.
  const compact = readable.replace(/\s+/g, "");

  // Prima funcție găsită ajunge: `-webkit-image-set(` conține și `image-set(`, iar agentului îi trebuie un singur motiv.
  const loading = LOADING_FUNCTIONS.find((fn) => compact.includes(fn));
  if (loading) {
    add(
      rejected,
      "css-url",
      `${loading}) încarcă ceva din afara paginii. Folosește doar culori și forme.`,
      readable,
      loading,
    );
  }
  if (compact.includes("@import")) {
    add(
      rejected,
      "css-import",
      "@import încarcă o foaie de stil din afară. Scrie regulile direct.",
      readable,
      "@import",
    );
  }
  if (compact.includes("expression(")) {
    add(rejected, "css-expression", "expression() rulează cod. Nu e permis.", readable, "expression");
  }
  for (const scheme of SCRIPT_SCHEMES) {
    if (compact.includes(scheme)) {
      add(rejected, "css-script-url", `${scheme} rulează cod. Nu e permis.`, readable, scheme.slice(0, -1));
    }
  }
  for (const binding of LEGACY_BINDINGS) {
    if (compact.includes(binding)) {
      add(rejected, "css-legacy-binding", `${binding.replace(":", "")} rulează cod. Nu e permis.`, readable, binding);
    }
  }
  for (const marker of OUR_INTERFACE_MARKERS) {
    if (readable.includes(marker)) {
      add(
        rejected,
        "css-our-interface",
        `„${marker}” ține de interfața extensiei (mascota, chatul, panoul). Schimbă doar elementele site-ului.`,
        readable,
        marker,
      );
    }
  }
  if (readable.includes("<")) {
    add(
      rejected,
      "css-html-tag",
      "CSS-ul conține „<”: probabil HTML amestecat. Trimite doar reguli CSS.",
      readable,
      "<",
    );
  }
  if (!bracesBalanced(stripStrings(stripComments(css)))) {
    rejected.push({
      rule: "css-unbalanced",
      message: "Acoladele { } nu se închid toate. Verifică fiecare regulă.",
    });
  }

  return rejected.length > 0 ? reject(rejected) : { ok: true, css };
}

function reject(rejected: Rejection[]): CssValidation {
  return { ok: false, rejected };
}

function add(rejected: Rejection[], rule: RejectionRule, message: string, text: string, needle: string): void {
  if (rejected.some((r) => r.rule === rule && r.message === message)) return;
  const at = text.indexOf(needle);
  rejected.push({ rule, message, excerpt: at >= 0 ? excerptOf(text.slice(Math.max(0, at - 20), at + 40)) : undefined });
}

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
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\uFFFD";
    },
  );
}

/** Textele dintre ghilimele pot avea acolade (`content: "{"`); nu contează la numărat. */
function stripStrings(css: string): string {
  return css.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, '""');
}

function bracesBalanced(css: string): boolean {
  let depth = 0;
  for (const char of css) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}
