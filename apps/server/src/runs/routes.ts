// GET /api/runs?userId=…  și  GET /api/runs/:runId (specs/06), pentru panou și reluarea pas cu pas.

import { Router } from "express";
import { isSafeId } from "../storage/json-files";
import { listRuns, loadRun } from "./run-store";

export const runsRouter = Router();

runsRouter.get("/runs", async (req, res, next) => {
  try {
    const userId = req.query.userId;
    if (typeof userId !== "string" || !isSafeId(userId)) {
      res.status(400).json({ error: "Lipsește userId (sau nu e valid)." });
      return;
    }
    res.json(await listRuns(userId));
  } catch (error) {
    next(error);
  }
});

runsRouter.get("/runs/:runId", async (req, res, next) => {
  try {
    const run = await loadRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Rularea nu există." });
      return;
    }
    res.json(run);
  } catch (error) {
    next(error);
  }
});
