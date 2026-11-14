// Modul expert (experiment `run_js`, specs/05): plasa dinaintea aprobării. Codul care ar citi sau ar trimite datele
// omului (rețea, cookie-uri, stocare) e refuzat din start, fără să i se arate omului. E o plasă, nu o garanție: un cod
// ascuns (`window["fe" + "tch"]`) poate trece; garanția e omul, care vede codul și apasă „Rulează”.

import { RUN_JS_LIMITS } from "@uishapeshifter/contracts";

/** Ce nu are voie să apară în cod, cu motivul pentru model. Căutate în textul codului, fără să-l rulăm. */
const FORBIDDEN: readonly { pattern: RegExp; what: string }[] = [
  // din specificație: rețea și datele omului
  { pattern: /\bfetch\b/, what: "fetch (rețea)" },
  { pattern: /\bXMLHttpRequest\b/, what: "XMLHttpRequest (rețea)" },
  { pattern: /\bsendBeacon\b/, what: "sendBeacon (rețea)" },
  { pattern: /\bWebSocket\b/, what: "WebSocket (rețea)" },
  { pattern: /\bcookie\b/i, what: "cookie-uri" },
  { pattern: /\blocalStorage\b/, what: "localStorage" },
  // aceleași lucruri pe alte uși
  { pattern: /\bsessionStorage\b/, what: "sessionStorage" },
  { pattern: /\bindexedDB\b/, what: "indexedDB" },
  { pattern: /\bEventSource\b/, what: "EventSource (rețea)" },
  { pattern: /\bnew\s+Image\b/, what: "new Image (rețea)" },
  { pattern: /\bimport\s*\(/, what: "import() (cod din afară)" },
  { pattern: /\beval\b/, what: "eval (cod construit din text)" },
  { pattern: /\bFunction\s*\(/, what: "Function() (cod construit din text)" },
  { pattern: /\b(?:setTimeout|setInterval)\s*\(\s*["'`]/, what: "setTimeout cu text (cod construit din text)" },
  { pattern: /\\u[0-9a-fA-F{]|\\x[0-9a-fA-F]/, what: "secvențe \\u sau \\x (nume ascunse)" },
  // parole și formulare: codul nu citește ce scrie omul în câmpuri sensibile și nu trimite formulare
  { pattern: /type\s*=\s*["']?password|\[type=["']?password/i, what: "câmpuri de parolă" },
  { pattern: /\.submit\s*\(|requestSubmit/, what: "trimiterea formularelor" },
];

export type RunJsValidation = { ok: true; code: string; purpose: string } | { ok: false; message: string };

/** Verifică argumentele lui `run_js` înainte să le vadă omul. Nu aruncă; refuzul are motivul pentru model. */
export function validateRunJs(args: unknown): RunJsValidation {
  const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  if (typeof a.code !== "string" || !a.code.trim()) return refuse("run_js cere code (JavaScript-ul de rulat).");
  if (typeof a.purpose !== "string" || !a.purpose.trim()) {
    return refuse("run_js cere purpose: ce face codul, într-o propoziție pentru om.");
  }
  if (a.code.length > RUN_JS_LIMITS.maxCodeChars) {
    return refuse(
      `Codul are ${a.code.length} de caractere; maximul e ${RUN_JS_LIMITS.maxCodeChars}. Fă doar ce s-a cerut.`,
    );
  }
  const found = FORBIDDEN.filter(({ pattern }) => pattern.test(a.code as string)).map(({ what }) => what);
  if (found.length > 0) {
    return refuse(
      `Codul folosește ${found.join(", ")}. Modul expert nu citește și nu trimite datele omului; ` +
        "scrie codul fără ele sau fă schimbarea cu apply_css / apply_ops.",
    );
  }
  return { ok: true, code: a.code, purpose: a.purpose.trim() };
}

/** Rezultatul (sau eroarea) codului, tăiat cât să încapă în răspunsul către model. */
export function truncateRunJsText(text: string): string {
  return text.length > RUN_JS_LIMITS.maxResultChars ? `${text.slice(0, RUN_JS_LIMITS.maxResultChars - 1)}…` : text;
}

function refuse(message: string): RunJsValidation {
  return { ok: false, message };
}
