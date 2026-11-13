/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// Cale relativă, nu "@uishapeshifter/contracts": Vite încarcă config-ul cu Node, care nu poate importa
// pachetul .ts din node_modules; fișierul relativ e inclus în config la încărcare.
import { WEB_PORT } from "../../packages/contracts/src/protocol";

export default defineConfig({
  plugins: [react()],
  server: { port: WEB_PORT, strictPort: true },
  test: { environment: "happy-dom" },
});
