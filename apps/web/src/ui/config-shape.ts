// Verifică forma ÎNTREGULUI config după patch: tipurile câmpurilor, enumerările, culorile, listele, id-uri unice.
// E singurul loc care decide „tipul valorii e greșit” (specs/02, punctul 3), indiferent de operația care l-a produs.
// Conținutul din `components` nu se verifică aici: îl validează B3 după catalogul din specs/03.

import type {
  LayoutTemplate,
  ModuleConfig,
  ModuleType,
  NavConfig,
  NavPosition,
  Palette,
  Theme,
  UIConfig,
  ComponentPlacement,
} from "@uishapeshifter/contracts";
import type { ConfigViolation } from "./config-violation";

/** Culorile din temă: doar #rgb sau #rrggbb, singura formă pe care o acceptă și funcțiile de contrast fără surprize. */
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Enumerările ca Record, ca TypeScript să ne spună dacă în contracte apare o valoare nouă.
const TEMPLATES: Record<LayoutTemplate, true> = { "sidebar-feed": true, "bottom-nav-stories": true, "simple-tiles": true };
const NAV_POSITIONS: Record<NavPosition, true> = { left: true, top: true, bottom: true };
const MODULE_TYPES: Record<ModuleType, true> = {
  messages: true,
  photos: true,
  contacts: true,
  calls: true,
  stories: true,
  feed: true,
  settings: true,
  generated: true,
};
const MODULE_SIZES: Record<ModuleConfig["size"], true> = { s: true, m: true, l: true };
const PLACEMENT_POSITIONS: Record<ComponentPlacement["position"], true> = { top: true, bottom: true };

type Check = (value: unknown, path: string, out: ConfigViolation[]) => void;
interface Field {
  check: Check;
  optional?: boolean;
}

export function validateConfigShape(candidate: unknown): ConfigViolation[] {
  const out: ConfigViolation[] = [];
  objectOf(ROOT_FIELDS)(candidate, "", out);
  if (isRecord(candidate) && Array.isArray(candidate.modules)) checkUniqueModuleIds(candidate.modules, out);
  return out;
}

// ---------- verificări simple ----------

const isString: Check = (v, path, out) => {
  if (typeof v !== "string") out.push(wrongType(path, v, "text"));
};

const isBoolean: Check = (v, path, out) => {
  if (typeof v !== "boolean") out.push(wrongType(path, v, "true sau false"));
};

const isFiniteNumber: Check = (v, path, out) => {
  if (typeof v !== "number" || !Number.isFinite(v)) out.push(wrongType(path, v, "număr"));
};

const isColor: Check = (v, path, out) => {
  if (typeof v !== "string" || !HEX_COLOR.test(v)) out.push(wrongType(path, v, "culoare #rgb sau #rrggbb"));
};

const isPlainObject: Check = (v, path, out) => {
  if (!isRecord(v)) out.push(wrongType(path, v, "obiect"));
};

function oneOf(allowed: Record<string, true>): Check {
  const names = Object.keys(allowed);
  return (v, path, out) => {
    if (typeof v !== "string" || !Object.hasOwn(allowed, v)) out.push(wrongType(path, v, `una din: ${names.join(", ")}`));
  };
}

function listOf(item: Check): Check {
  return (v, path, out) => {
    if (!Array.isArray(v)) return void out.push(wrongType(path, v, "listă"));
    v.forEach((element, i) => item(element, `${path}/${i}`, out));
  };
}

function objectOf(fields: Record<string, Field>): Check {
  return (v, path, out) => {
    if (!isRecord(v)) return void out.push(wrongType(path, v, "obiect"));
    for (const [key, field] of Object.entries(fields)) {
      const fieldPath = `${path}/${key}`;
      if (!Object.hasOwn(v, key)) {
        if (!field.optional) out.push({ rule: "invalid-type", path: fieldPath, received: undefined, message: `Lipsește ${fieldPath}.` });
        continue;
      }
      field.check(v[key], fieldPath, out);
    }
    for (const key of Object.keys(v)) {
      if (!Object.hasOwn(fields, key)) {
        out.push({
          rule: "invalid-path",
          path: `${path}/${key}`,
          received: v[key],
          message: `Câmpul ${path}/${key} nu există în configurație.`,
        });
      }
    }
  };
}

const required = (check: Check): Field => ({ check });
const optional = (check: Check): Field => ({ check, optional: true });

// ---------- forma UIConfig (cheile verificate de TypeScript cu `satisfies`) ----------

const PALETTE_FIELDS = {
  background: required(isColor),
  surface: required(isColor),
  text: required(isColor),
  textMuted: required(isColor),
  primary: required(isColor),
  onPrimary: required(isColor),
  danger: required(isColor),
  focus: required(isColor),
} satisfies Record<keyof Palette, Field>;

const THEME_FIELDS = {
  palette: required(objectOf(PALETTE_FIELDS)),
  baseFontPx: required(isFiniteNumber),
  scale: required(isFiniteNumber),
  lineHeight: required(isFiniteNumber),
  fontFamily: required(isString),
  radiusPx: required(isFiniteNumber),
  spacingPx: required(isFiniteNumber),
  highContrast: required(isBoolean),
  reducedMotion: required(isBoolean),
} satisfies Record<keyof Theme, Field>;

const NAV_FIELDS = {
  position: required(oneOf(NAV_POSITIONS)),
  showLabels: required(isBoolean),
  iconSizePx: required(isFiniteNumber),
  items: required(listOf(isString)),
} satisfies Record<keyof NavConfig, Field>;

const MODULE_FIELDS = {
  id: required(isString),
  type: required(oneOf(MODULE_TYPES)),
  title: required(isString),
  visible: required(isBoolean),
  order: required(isFiniteNumber),
  size: required(oneOf(MODULE_SIZES)),
  pinned: optional(isBoolean),
  componentId: optional(isString),
} satisfies Record<keyof ModuleConfig, Field>;

const PLACEMENT_FIELDS = {
  componentId: required(isString),
  moduleId: required(isString),
  position: required(oneOf(PLACEMENT_POSITIONS)),
} satisfies Record<keyof ComponentPlacement, Field>;

const ROOT_FIELDS = {
  version: required(isString),
  revision: required(isFiniteNumber),
  template: required(oneOf(TEMPLATES)),
  nav: required(objectOf(NAV_FIELDS)),
  theme: required(objectOf(THEME_FIELDS)),
  modules: required(listOf(objectOf(MODULE_FIELDS))),
  components: required(isPlainObject),
  placements: required(listOf(objectOf(PLACEMENT_FIELDS))),
  minTargetPx: required(isFiniteNumber),
} satisfies Record<keyof UIConfig, Field>;

// ---------- reguli între câmpuri ----------

/** Id-ul modulului e cheia pentru /modules/@<id>, navigație și data-agent-id: două module cu același id le-ar încurca. */
function checkUniqueModuleIds(modules: unknown[], out: ConfigViolation[]): void {
  const seen = new Set<string>();
  modules.forEach((m, i) => {
    if (!isRecord(m) || typeof m.id !== "string") return;
    if (seen.has(m.id)) {
      out.push({
        rule: "duplicate-id",
        path: `/modules/${i}/id`,
        received: m.id,
        message: `Există deja un modul cu id-ul „${m.id}”; alege alt id.`,
      });
    }
    seen.add(m.id);
  });
}

function wrongType(path: string, received: unknown, expected: string): ConfigViolation {
  return {
    rule: "invalid-type",
    path: path || "/",
    received,
    limit: expected,
    message: `${path || "Configurația"} trebuie să fie ${expected}.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
