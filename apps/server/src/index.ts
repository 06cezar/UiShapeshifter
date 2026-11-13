// Punctul de intrare al serverului: Express pentru /api, pe același server HTTP pe care A1 pune WebSocket-ul (/ws).
// Protocolul: specs/06-protocol.md.

import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { SERVER_PORT, WEB_PORT } from "@uishapeshifter/contracts";

// .env e opțional: fără el, serverul pornește (agentul fals nu are nevoie de cheie).
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // lipsește apps/server/.env
}

const app = express();
app.use(cors({ origin: `http://localhost:${WEB_PORT}` }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Rutele din specs/06 se adaugă aici de proprietarii lor (A: runs, config; E: profile).

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta nu există" });
});

export const httpServer = createServer(app);

httpServer.listen(SERVER_PORT, () => {
  console.log(`server: http://localhost:${SERVER_PORT}/api/health`);
});
