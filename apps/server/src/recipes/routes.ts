// /api/recipes (specs/06): GET lista, GET / PUT / DELETE pe un site. Le folosește sincronizarea (E6).

import { Router, type Response } from "express";
import { isSafeHost, isSafeId } from "../storage/json-files";
import { checkRecipe, deleteRecipe, listRecipes, loadRecipe, saveRecipe } from "./recipe-store";

export const recipesRouter = Router();

function badRequest(res: Response, error: string): void {
  res.status(400).json({ error });
}

recipesRouter.get("/recipes/:userId", async (req, res, next) => {
  try {
    if (!isSafeId(req.params.userId)) return badRequest(res, "userId nu e valid.");
    res.json(await listRecipes(req.params.userId));
  } catch (error) {
    next(error);
  }
});

recipesRouter.get("/recipes/:userId/:host", async (req, res, next) => {
  try {
    const { userId, host } = req.params;
    if (!isSafeId(userId) || !isSafeHost(host)) return badRequest(res, "userId sau host nu e valid.");
    const recipe = await loadRecipe(userId, host);
    if (!recipe) {
      res.status(404).json({ error: "Nu există o rețetă pentru site-ul ăsta." });
      return;
    }
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

recipesRouter.put("/recipes/:userId/:host", async (req, res, next) => {
  try {
    const { userId, host } = req.params;
    if (!isSafeId(userId) || !isSafeHost(host)) return badRequest(res, "userId sau host nu e valid.");
    const problem = checkRecipe(req.body);
    if (problem) return badRequest(res, problem);
    if (req.body.host !== host) return badRequest(res, "host din corp diferă de cel din adresă.");
    await saveRecipe(userId, req.body);
    res.json({ revision: req.body.revision });
  } catch (error) {
    next(error);
  }
});

recipesRouter.delete("/recipes/:userId/:host", async (req, res, next) => {
  try {
    const { userId, host } = req.params;
    if (!isSafeId(userId) || !isSafeHost(host)) return badRequest(res, "userId sau host nu e valid.");
    await deleteRecipe(userId, host);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
