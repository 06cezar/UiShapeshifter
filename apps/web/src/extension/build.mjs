// Construiește extensia în apps/web/dist/extension (ignorat de git), gata de încărcat „unpacked” în Chrome.
// Rulare din rădăcina repo-ului:  node apps/web/src/extension/build.mjs        (o dată, build de dezvoltare)
//                                  node apps/web/src/extension/build.mjs --watch (la fiecare salvare)
//                                  node apps/web/src/extension/build.mjs --prod  (fără ajutoarele de depanare)
// Folosim esbuild (vine deja cu Vite): content script-ul nu poate fi modul ES, deci fiecare intrare e un IIFE.

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = join(here, "../../dist/extension");
const watch = process.argv.includes("--watch");
const prod = process.argv.includes("--prod");

const options = {
  entryPoints: {
    "service-worker": join(here, "service-worker.ts"),
    "content-script": join(here, "content-script.ts"),
    popup: join(here, "popup.ts"),
  },
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome116",
  sourcemap: prod ? false : "inline",
  // __UIS_DEV__: ajutoare de depanare (ex. motorul de rețete în consolă); în build-ul --prod codul lor dispare
  define: { __UIS_DEV__: prod ? "false" : "true" },
  minifySyntax: prod, // scoate ramurile `if (false)`
  logLevel: "info",
};

await mkdir(outdir, { recursive: true });
for (const file of ["manifest.json", "popup.html"]) await copyFile(join(here, file), join(outdir, file));

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log(`extensie: urmăresc schimbările, ies în ${outdir}`);
} else {
  await build(options);
  console.log(`extensie: gata în ${outdir}`);
}
