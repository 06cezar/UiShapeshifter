// Construiește extensia în apps/web/dist/extension (ignorat de git), gata de încărcat „unpacked” în Chrome.
// Rulare din rădăcina repo-ului:  node apps/web/src/extension/build.mjs        (o dată, build de dezvoltare)
//                                  node apps/web/src/extension/build.mjs --watch (la fiecare salvare)
//                                  node apps/web/src/extension/build.mjs --prod  (fără ajutoarele de depanare)
// Folosim esbuild (vine deja cu Vite): content script-ul nu poate fi modul ES, deci fiecare intrare e un IIFE.

import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = join(here, "../../dist/extension");
const watch = process.argv.includes("--watch");
const prod = process.argv.includes("--prod");

// Pagina testului inițial (C3, PR #9): o construim doar dacă există, ca build-ul să meargă și înainte de #9.
const onboardingDir = join(here, "../onboarding");
const onboardingPage = join(onboardingDir, "page.tsx");
const withOnboarding = existsSync(onboardingPage);

const options = {
  entryPoints: {
    "service-worker": join(here, "service-worker.ts"),
    "content-script": join(here, "content-script.ts"),
    popup: join(here, "popup.ts"),
    ...(withOnboarding ? { onboarding: onboardingPage } : {}),
  },
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome116",
  sourcemap: prod ? false : "inline",
  // __UIS_DEV__: ajutoare de depanare (ex. motorul de rețete în consolă); în build-ul --prod codul lor dispare
  define: {
    __UIS_DEV__: prod ? "false" : "true",
    // service worker-ul deschide testul inițial la instalare doar dacă pagina lui e în build
    __UIS_ONBOARDING__: withOnboarding ? "true" : "false",
    "process.env.NODE_ENV": JSON.stringify(prod ? "production" : "development"),
  },
  // pagina testului e React (C3): JSX fără import React explicit
  jsx: "automatic",
  minifySyntax: prod, // scoate ramurile `if (false)`
  logLevel: "info",
};

await mkdir(outdir, { recursive: true });
for (const file of ["manifest.json", "popup.html"]) await copyFile(join(here, file), join(outdir, file));
if (withOnboarding) {
  for (const file of ["onboarding.html", "onboarding.css"]) {
    if (existsSync(join(onboardingDir, file))) await copyFile(join(onboardingDir, file), join(outdir, file));
  }
}

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log(`extensie: urmăresc schimbările, ies în ${outdir}`);
} else {
  await build(options);
  console.log(`extensie: gata în ${outdir}`);
}
