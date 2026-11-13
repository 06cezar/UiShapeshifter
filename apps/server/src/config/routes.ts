// GET/PUT /api/config/:userId (specs/06, DECISIONS.md 2026-11-13 15:10). Store-ul web (B1) încarcă la pornire
// și salvează după fiecare schimbare.

import { Router } from "express";
import { isSafeId } from "../storage/json-files";
import { isUIConfig, loadConfig, saveConfig } from "./config-store";

export const configRouter = Router();

configRouter.get("/config/:userId", async (req, res, next) => {
  try {
    if (!isSafeId(req.params.userId)) {
      res.status(400).json({ error: "userId nu e valid." });
      return;
    }
    res.json(await loadConfig(req.params.userId));
  } catch (error) {
    next(error);
  }
});

configRouter.put("/config/:userId", async (req, res, next) => {
  try {
    if (!isSafeId(req.params.userId)) {
      res.status(400).json({ error: "userId nu e valid." });
      return;
    }
    if (!isUIConfig(req.body)) {
      res.status(400).json({ error: "Corpul nu e un UIConfig (vezi packages/contracts/src/ui-config.ts)." });
      return;
    }
    await saveConfig(req.params.userId, req.body);
    res.json({ revision: req.body.revision });
  } catch (error) {
    next(error);
  }
});
