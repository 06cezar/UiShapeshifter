// Pune cadrele mascotei (assets/raccoon/<animație>-<nn>.webp) în mascot-sprites.ts, ca base64.
// Rulare din rădăcina repo-ului:  node apps/web/src/mascot/build-sprites.mjs
// De ce base64 în cod și nu fișiere: content script-ul e un singur bundle (extension/build.mjs), iar mascota decodează
// cadrele din octeți (createImageBitmap), deci nu cere nimic prin URL și nu se lovește de CSP-ul site-ului (img-src).
// Cadrele din assets/raccoon sunt cele originale (800×800 px), tăiate la cutia comună și micșorate la 200 px înălțime.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const folder = join(here, "assets/raccoon");
const FRAME_FILE = /^([a-z]+)-(\d+)\.webp$/;

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
  "// Generat de build-sprites.mjs din assets/raccoon/ (licența: LICENSE-ASSETS.md). Nu edita de mână.",
  "",
  "/** Cadrele mascotei, în base64; toate au aceeași mărime și ratonul în aceeași poziție. */",
  'export const MASCOT_SPRITE_TYPE = "image/webp";',
  "export const MASCOT_SPRITES = {",
];
for (const [name, frames] of sheets) lines.push(`  ${name}: [${frames.map((f) => `"${f}"`).join(", ")}],`);
lines.push("} as const;", "", "export type SpriteSheet = keyof typeof MASCOT_SPRITES;", "");

await writeFile(join(here, "mascot-sprites.ts"), lines.join("\n"));
console.log(`mascota: mascot-sprites.ts scris (${[...sheets].map(([n, f]) => `${n} ${f.length}`).join(", ")})`);
