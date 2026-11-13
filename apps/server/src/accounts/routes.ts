// Rutele conturilor și ale sincronizării (E6, specs/06 și 08):
//   POST /api/accounts/register  <- RegisterRequest -> AuthResult   (datele anonime devin ale contului)
//   POST /api/accounts/login     <- LoginRequest    -> AuthResult   (datele anonime de pe alt dispozitiv se îmbină)
//   GET  /api/sync   (Bearer)                       -> SyncBundle
//   PUT  /api/sync   (Bearer)    <- SyncBundle      -> { updatedAt } (se îmbină, nu se suprascrie)
// Parola nu apare în loguri, în răspunsuri sau în erori.

import { Router, type Request, type Response } from "express";
import type { AuthResult, SiteRecipe, SyncBundle, UserProfile } from "@uishapeshifter/contracts";
import { profileStore, type ProfileStore } from "../profile";
import { parseProfile } from "../profile/validate";
import { checkRecipe, listRecipes, saveRecipe } from "../recipes/recipe-store";
import { isSafeId } from "../storage/json-files";
import { mergeProfiles, mergeRecipes } from "./merge";
import { accountOfToken, checkCredentials, createAccount, issueToken, verifyAccount, type Account } from "./store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
}

/** Profilul anonim are ceva învățat? Unul gol, „de la zero”, nu se îmbină peste cont. */
function knowsSomething(profile: UserProfile): boolean {
  return (
    profile.onboarding.completed ||
    profile.onboarding.skipped ||
    profile.facts.length > 0 ||
    (profile.generalPreferences ?? []).length > 0 ||
    (profile.familiarSites ?? []).length > 0
  );
}

export function createAccountsRouter(store: ProfileStore = profileStore): Router {
  const router = Router();

  async function authResult(account: Account): Promise<AuthResult> {
    return {
      token: await issueToken(account),
      account: { accountId: account.accountId, username: account.username, createdAt: account.createdAt },
      userId: account.userId,
    };
  }

  /** Datele unui userId anonim (profil + rețete) se îmbină în cele ale contului. */
  async function absorb(account: Account, anonymousUserId: string): Promise<void> {
    if (!isSafeId(anonymousUserId) || anonymousUserId === account.userId) return;
    const now = new Date().toISOString();
    const anonymous = await store.get(anonymousUserId);
    if (knowsSomething(anonymous)) {
      await store.save(mergeProfiles(await store.get(account.userId), { ...anonymous, userId: account.userId }, now));
    }
    const merged = mergeRecipes(await listRecipes(account.userId), await listRecipes(anonymousUserId));
    for (const recipe of merged) await saveRecipe(account.userId, recipe);
  }

  router.post("/accounts/register", async (req: Request, res: Response, next) => {
    try {
      const { username, password, anonymousUserId } = (isRecord(req.body) ? req.body : {}) as Record<string, unknown>;
      const invalid = checkCredentials(username, password);
      if (invalid) return void res.status(invalid.status).json({ error: invalid.error });
      if (typeof anonymousUserId !== "string") return void res.status(400).json({ error: "Lipsește anonymousUserId." });
      // La înregistrare, datele anonime de pe acest dispozitiv devin chiar ale contului (același userId).
      const account = await createAccount(username as string, password as string, anonymousUserId);
      if ("error" in account) return void res.status(account.status).json({ error: account.error });
      res.json(await authResult(account));
    } catch (error) {
      next(error);
    }
  });

  router.post("/accounts/login", async (req: Request, res: Response, next) => {
    try {
      const { username, password, anonymousUserId } = (isRecord(req.body) ? req.body : {}) as Record<string, unknown>;
      const invalid = checkCredentials(username, password);
      if (invalid) return void res.status(401).json({ error: "Numele sau parola nu se potrivesc." });
      const account = await verifyAccount(username as string, password as string);
      if ("error" in account) return void res.status(account.status).json({ error: account.error });
      if (typeof anonymousUserId === "string") await absorb(account, anonymousUserId);
      res.json(await authResult(account));
    } catch (error) {
      next(error);
    }
  });

  router.get("/sync", async (req: Request, res: Response, next) => {
    try {
      const account = await accountOfToken(bearer(req));
      if (!account) return void res.status(401).json({ error: "Intră din nou în cont." });
      const bundle: SyncBundle = {
        profile: await store.get(account.userId),
        recipes: await listRecipes(account.userId),
        updatedAt: new Date().toISOString(),
      };
      res.json(bundle);
    } catch (error) {
      next(error);
    }
  });

  router.put("/sync", async (req: Request, res: Response, next) => {
    try {
      const account = await accountOfToken(bearer(req));
      if (!account) return void res.status(401).json({ error: "Intră din nou în cont." });
      const body = isRecord(req.body) ? req.body : {};
      const parsed = parseProfile(isRecord(body.profile) ? { ...body.profile, userId: account.userId } : undefined);
      if (!parsed.ok) return void res.status(400).json({ error: `profile: ${parsed.error}` });
      const recipes = Array.isArray(body.recipes) ? body.recipes : [];
      for (const [i, recipe] of recipes.entries()) {
        const problem = checkRecipe(recipe);
        if (problem) return void res.status(400).json({ error: `recipes[${i}]: ${problem}` });
      }
      const now = new Date().toISOString();
      await store.save(mergeProfiles(await store.get(account.userId), parsed.value, now));
      const merged = mergeRecipes(await listRecipes(account.userId), recipes as SiteRecipe[]);
      for (const recipe of merged) await saveRecipe(account.userId, recipe);
      res.json({ updatedAt: now });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
