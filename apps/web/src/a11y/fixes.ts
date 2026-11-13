// Reparațiile propuse de audit (specs/07, „Reparațiile (fix)”): patch-uri pe UIConfig, aplicabile cu patch_config.
// Propunem doar când cauza e evident în temă sau în config; altfel issue-ul rămâne fără `fix` și decide agentul.
// Orice reparație de culoare e verificată pe perechile din poarta store-ului (specs/02), ca patch-ul să nu fie refuzat.

import { HARD_LIMITS } from "@uishapeshifter/contracts";
import type {
  AuditIssue,
  AuditReport,
  AuditThresholds,
  ElementInfo,
  JsonPatchOp,
  Palette,
  UIConfig,
  UISnapshot,
} from "@uishapeshifter/contracts";
import { adjustToContrast, contrastRatio, parseColor, requiredTextContrast, toHex } from "./contrast";

/** Perechile pe care le verifică poarta din store (ui/limit-gate.ts): o reparație nu are voie să le strice. */
const GATE_PAIRS: ReadonlyArray<readonly [keyof Palette, keyof Palette]> = [
  ["text", "background"],
  ["onPrimary", "primary"],
];
/** Culorile de text din paletă și fundalurile pe care apar. Textul trebuie să treacă pe toate. */
const TEXT_KEYS: ReadonlyArray<keyof Palette> = ["text", "textMuted"];
const SURFACE_KEYS: ReadonlyArray<keyof Palette> = ["background", "surface"];
/**
 * Ordinea în care căutăm o culoare în paletă: aceeași culoare poate fi în mai multe chei (alb e și `background`,
 * și `onPrimary`), așa că pentru culoarea textului întâi cheile de text, iar pentru fundal întâi cele de fundal.
 */
const FOREGROUND_ORDER: ReadonlyArray<keyof Palette> = ["text", "textMuted", "onPrimary", "primary", "danger", "focus"];
const BACKGROUND_ORDER: ReadonlyArray<keyof Palette> = ["background", "surface", "primary"];

/** Reparația pentru un issue, sau `undefined` când nu e evidentă. `element` vine din snapshot-ul auditat. */
export function proposeFix(
  issue: AuditIssue,
  element: ElementInfo | undefined,
  config: UIConfig,
  t: AuditThresholds,
): JsonPatchOp[] | undefined {
  switch (issue.rule) {
    case "min-font":
      return fixBaseFont(config, t);
    case "target-size":
      return config.minTargetPx < t.minTargetPx ? [replace("/minTargetPx", t.minTargetPx)] : undefined;
    case "line-height":
      return config.theme.lineHeight < t.minLineHeight ? [replace("/theme/lineHeight", t.minLineHeight)] : undefined;
    case "contrast":
      return element ? fixTextContrast(element, config, t) : undefined;
    default:
      // overlap, offscreen, clipped: țin de așezare sau de textul unui element; decide agentul
      return undefined;
  }
}

/** Raportul cu `fix` pus pe fiecare issue care are o reparație evidentă. */
export function withFixes(report: AuditReport, snapshot: UISnapshot, config: UIConfig): AuditReport {
  const byId = new Map(snapshot.elements.map((el) => [el.id, el]));
  return {
    ...report,
    issues: report.issues.map((issue) => {
      const fix = proposeFix(issue, byId.get(issue.elementId), config, report.thresholds);
      return fix ? { ...issue, fix } : issue;
    }),
  };
}

/**
 * Toate reparațiile într-un singur patch, fără căi repetate: mai multe elemente cu același font mic dau un singur
 * `/theme/baseFontPx`. La aceeași cale câștigă valoarea cea mai mare (pentru numere) sau ultima (pentru culori).
 */
export function mergeFixes(issues: Pick<AuditIssue, "fix">[]): JsonPatchOp[] {
  const byPath = new Map<string, JsonPatchOp>();
  for (const op of issues.flatMap((i) => i.fix ?? [])) {
    const previous = byPath.get(op.path);
    const keepPrevious =
      previous && typeof previous.value === "number" && typeof op.value === "number" && previous.value > op.value;
    if (!keepPrevious) byPath.set(op.path, op);
  }
  return [...byPath.values()];
}

// ---------- reparațiile, câte una ----------

function fixBaseFont(config: UIConfig, t: AuditThresholds): JsonPatchOp[] | undefined {
  // Fontul de bază e deja la minim: textul mic vine din altă parte (ex. un element generat), nu din temă.
  if (config.theme.baseFontPx >= t.minFontPx) return undefined;
  // Profilul cere peste maximul permis: nicio valoare nu trece poarta, deci nu propunem una.
  if (t.minFontPx > HARD_LIMITS.maxFontPx) return undefined;
  return [replace("/theme/baseFontPx", t.minFontPx)];
}

/**
 * Contrastul textului unui element, când culorile lui sunt culori din paletă:
 * - text sau textMuted pe background/surface → aceeași nuanță, mai închisă sau mai deschisă, până trece pe ambele;
 * - onPrimary pe primary (butoanele) → schimbăm primary, ca butonul să rămână „alb pe culoare”, doar mai închis;
 * - primary pe background/surface (legături) → schimbăm tot primary.
 * Un issue de contrast la marginea elementului (WCAG 1.4.11) nu are culorile textului sub prag și rămâne fără fix.
 */
function fixTextContrast(el: ElementInfo, config: UIConfig, t: AuditThresholds): JsonPatchOp[] | undefined {
  if (!el.color || !el.background || !parseColor(el.color) || !parseColor(el.background)) return undefined;
  const required = requiredTextContrast(el.fontPx, el.fontWeight, t);
  if (contrastRatio(el.color, el.background) >= required) return undefined; // nu e problema textului

  const palette = config.theme.palette;
  const fg = paletteKeyOf(palette, el.color, FOREGROUND_ORDER);
  const bg = paletteKeyOf(palette, el.background, BACKGROUND_ORDER);
  if (!fg || !bg) return undefined; // culori care nu vin din temă (ex. un element generat): decide agentul

  // Culorile din paletă sunt folosite și de textul mic, deci le reparăm la pragul textului normal.
  const target = Math.max(required, t.minContrastText);
  const next: Palette = { ...palette };

  if (TEXT_KEYS.includes(fg) && SURFACE_KEYS.includes(bg)) {
    next[fg] = SURFACE_KEYS.reduce((color, surface) => adjustToContrast(color, palette[surface], target), palette[fg]);
  } else if (fg === "onPrimary" && bg === "primary") {
    next.primary = adjustToContrast(palette.primary, palette.onPrimary, target);
  } else if (fg === "primary" && SURFACE_KEYS.includes(bg)) {
    next.primary = SURFACE_KEYS.reduce(
      (color, surface) => adjustToContrast(color, palette[surface], target),
      palette.primary,
    );
  } else {
    return undefined;
  }

  const changed = (Object.keys(next) as (keyof Palette)[]).filter((key) => next[key] !== palette[key]);
  if (contrastRatio(next[fg], next[bg]) < required) return undefined;
  if (!touchedGatePairsPass(next, changed, target)) return undefined;
  return changed.map((key) => replace(`/theme/palette/${key}`, next[key]));
}

/**
 * Perechile din poartă atinse de reparație trebuie să treacă. Pe cele neatinse nu le judecăm aici: dacă sunt deja
 * sub prag, au issue-ul și reparația lor, iar mergeFixes le pune în același patch.
 */
function touchedGatePairsPass(palette: Palette, changed: (keyof Palette)[], required: number): boolean {
  return GATE_PAIRS.filter(([fg, bg]) => changed.includes(fg) || changed.includes(bg)).every(
    ([fg, bg]) => contrastRatio(palette[fg], palette[bg]) >= required,
  );
}

/** Cheia din paletă cu exact culoarea asta (comparată ca #RRGGBB, deci `rgb(...)` și `#fff` se potrivesc). */
function paletteKeyOf(palette: Palette, color: string, order: ReadonlyArray<keyof Palette>): keyof Palette | undefined {
  const wanted = normalize(color);
  return order.find((key) => normalize(palette[key]) === wanted);
}

function normalize(color: string): string | undefined {
  const parsed = parseColor(color);
  return parsed ? toHex(parsed) : undefined;
}

function replace(path: string, value: unknown): JsonPatchOp {
  return { op: "replace", path, value };
}
