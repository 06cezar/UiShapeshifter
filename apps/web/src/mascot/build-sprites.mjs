// Pune cadrele vulpii (assets/sunny-land-fox/player-<animație>-<n>.png) în fox-sprites.ts, ca base64.
// Rulare din rădăcina repo-ului:  node apps/web/src/mascot/build-sprites.mjs
// De ce base64 în cod și nu fișiere: content script-ul e un singur bundle (extension/build.mjs), iar mascota decodează
// cadrele din octeți (createImageBitmap), deci nu cere nimic prin URL și nu se lovește de CSP-ul site-ului (img-src).

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const folder = join(here, "assets/sunny-land-fox");
const FRAME_FILE = /^player-([a-z]+)-(\d+)\.png$/;

/** animație → cadrele ei, în ordine */
const sheets = new Map();
for (const file of (await readdir(folder)).sort()) {
  const match = FRAME_FILE.exec(file);
  if (!match) continue;
  const [, name, index] = match;
  const frames = sheets.get(name) ?? [];
  frames[Number(index) - 1] = (await readFile(join(folder, file))).toString("base64");
  sheets.set(name, frames);
}

const lines = [
  "// Generat de build-sprites.mjs din assets/sunny-land-fox/ (licența: LICENSE-ASSETS.md). Nu edita de mână.",
  "",
  "/** Cadrele vulpii, PNG în base64, câte 33×32 px. */",
  "export const FOX_SPRITES = {",
];
for (const [name, frames] of sheets) lines.push(`  ${name}: [${frames.map((f) => `"${f}"`).join(", ")}],`);
lines.push("} as const;", "", "export type FoxSheet = keyof typeof FOX_SPRITES;", "");

await writeFile(join(here, "fox-sprites.ts"), lines.join("\n"));
console.log(`mascota: fox-sprites.ts scris (${[...sheets].map(([n, f]) => `${n} ${f.length}`).join(", ")})`);
