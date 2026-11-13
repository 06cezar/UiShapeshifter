// Rutele HTTP ale profilului (specs/06): GET / PUT profil, PUT onboarding și DELETE pentru „Șterge ce știe vulpița”.
// Erorile: { error } cu 400 / 404 / 500.

import { Router, type Response } from "express";
import type { UserProfile } from "@uishapeshifter/contracts";
import type { ProfileStore } from "./store";
import { applyOnboarding } from "./update";
import { isValidUserId, parseOnboardingResult, parseProfile } from "./validate";

function badRequest(res: Response, error: string): void {
  res.status(400).json({ error });
}

export function createProfileRouter(store: ProfileStore): Router {
  const router = Router();

  // Toate rutele au :userId; îl verificăm o dată, fiindcă ajunge în numele fișierului.
  router.param("userId", (_req, res, next, userId: string) => {
    if (isValidUserId(userId)) next();
    else badRequest(res, "userId invalid: doar litere, cifre și cratimă");
  });

  router.get("/:userId", async (req, res, next) => {
    try {
      res.json(await store.get(req.params.userId));
    } catch (error) {
      next(error);
    }
  });

  /** Profilul întreg, din Setări. Omul poate cere orice, dar tot în HARD_LIMITS (validarea le aplică). */
  router.put("/:userId", async (req, res, next) => {
    try {
      const parsed = parseProfile(req.body);
      if (!parsed.ok) return badRequest(res, parsed.error);
      if (parsed.value.userId !== req.params.userId) return badRequest(res, "userId din corp diferă de cel din adresă");
      const current = await store.get(req.params.userId);
      const profile: UserProfile = { ...parsed.value, createdAt: current.createdAt };
      res.json(await store.save(profile));
    } catch (error) {
      next(error);
    }
  });

  router.put("/:userId/onboarding", async (req, res, next) => {
    try {
      const result = parseOnboardingResult(req.body);
      if (!result.ok) return badRequest(res, result.error);
      const current = await store.get(req.params.userId);
      const updated = applyOnboarding(current, result.value, new Date().toISOString());
      if (!updated.ok) return badRequest(res, updated.error);
      res.json(await store.save(updated.value));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:userId", async (req, res, next) => {
    try {
      res.json(await store.reset(req.params.userId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
