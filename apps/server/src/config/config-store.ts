// Ultimul UIConfig salvat de frontend: data/configs/<userId>.json (specs/02, „Persistență”).
// Limitele de accesibilitate le verifică poarta din store-ul web; aici doar forma, ca să nu salvăm gunoi.

import { DEFAULT_CONFIG, type UIConfig } from "@uishapeshifter/contracts";
import { dataPath, readJson, writeJson } from "../storage/json-files";

function configPath(userId: string): string {
  return dataPath("configs", `${userId}.json`);
}

export function isUIConfig(value: unknown): value is UIConfig {
  const config = value as UIConfig | null;
  return (
    typeof config === "object" &&
    config !== null &&
    typeof config.version === "string" &&
    Number.isInteger(config.revision) &&
    typeof config.template === "string" &&
    typeof config.nav === "object" &&
    config.nav !== null &&
    typeof config.theme === "object" &&
    config.theme !== null &&
    typeof config.theme.baseFontPx === "number" &&
    Array.isArray(config.modules) &&
    typeof config.components === "object" &&
    Array.isArray(config.placements) &&
    typeof config.minTargetPx === "number"
  );
}

/** Config-ul salvat; fără unul, DEFAULT_CONFIG (ajustarea după profil o face frontend-ul, specs/02). */
export async function loadConfig(userId: string): Promise<UIConfig> {
  const saved = await readJson(configPath(userId));
  return isUIConfig(saved) ? saved : structuredClone(DEFAULT_CONFIG);
}

export async function saveConfig(userId: string, config: UIConfig): Promise<void> {
  await writeJson(configPath(userId), config);
}
