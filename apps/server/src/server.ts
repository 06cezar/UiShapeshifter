// Serverul: Express pentru /api și WebSocket pe /ws, pe același server HTTP. Protocolul: specs/06-protocol.md.
// Separat de index.ts ca testele să-l poată porni pe un port liber.

import { createServer, type Server } from "node:http";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { WebSocketServer } from "ws";
import { WEB_PORT } from "@uishapeshifter/contracts";
import { configRouter } from "./config/routes";
import { createProfileRouter, profileStore } from "./profile";
import { runsRouter } from "./runs/routes";
import { handleConnection } from "./ws/connection";

const WS_PATH = "/ws";

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error("http:", error);
  res.status(500).json({ error: "Eroare pe server." });
};

export function createAppServer(): Server {
  const app = express();
  app.use(cors({ origin: `http://localhost:${WEB_PORT}` }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Rutele din specs/06 se adaugă aici de proprietarii lor (A: runs, config; E: profile).
  app.use("/api", runsRouter);
  app.use("/api", configRouter);
  // Testul inițial nu pornește nicio rulare a agentului (specs/10, „După test”, pct. 4): în extensie ar schimba
  // primul site deschis fără cerere. Preferințele de bază se aplică fără AI (C4).
  app.use("/api/profile", createProfileRouter(profileStore));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Ruta nu există" });
  });
  app.use(handleError);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: WS_PATH });
  wss.on("connection", handleConnection);
  httpServer.on("close", () => wss.close());
  return httpServer;
}
