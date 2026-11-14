// Pagina testului inițial în extensie (onboarding.html), deschisă la instalare de service worker.
// Ia userId-ul anonim al extensiei, salvează rezultatul în chrome.storage.local și îl trimite la server.

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { OnboardingResult } from "@uishapeshifter/contracts";
import { getOrCreateUserId } from "../extension/storage";
import { Onboarding, ONBOARDING_STYLE } from "./Onboarding";
import { localWritesAfterTest, ONBOARDING_STORAGE_KEY } from "./storage-key";

/** Ce spune ultimul ecran: după „Omite” nu pretindem că am pregătit ceva după alegerile omului. */
const DONE_TEXT = {
  saved: "Deschide orice site: îl pregătesc după cum ai ales. Poți schimba oricând.",
  skipped: "Am păstrat site-urile cum sunt. Îmi poți cere oricând schimbări din chat.",
};

function OnboardingPage({ userId }: { userId: string }) {
  const [done, setDone] = useState<"saved" | "skipped" | null>(null);
  /** Ultimul rezultat salvat local; la final scriem lângă el și profilul întors de server. */
  const lastResult = useRef<OnboardingResult | null>(null);

  if (done) {
    return (
      <main className="onboarding" style={ONBOARDING_STYLE} aria-labelledby="onboarding-done">
        <h1 id="onboarding-done" className="onboarding__title">
          Gata!
        </h1>
        <p className="onboarding__mascot">{done === "skipped" ? DONE_TEXT.skipped : DONE_TEXT.saved}</p>
        <button type="button" className="onboarding__primary" onClick={() => window.close()}>
          Închide pagina
        </button>
      </main>
    );
  }
  return (
    <Onboarding
      userId={userId}
      saveLocal={(result: OnboardingResult) => {
        lastResult.current = result;
        return chrome.storage.local.set({ [ONBOARDING_STORAGE_KEY]: result });
      }}
      onDone={(profile) => {
        const result = lastResult.current;
        if (result) void chrome.storage.local.set(localWritesAfterTest(userId, result, profile));
        setDone(result?.skipped ? "skipped" : "saved");
      }}
    />
  );
}

async function start(): Promise<void> {
  const userId = await getOrCreateUserId(chrome.storage.local);
  const container = document.getElementById("root");
  if (!container) throw new Error("onboarding.html nu are #root");
  createRoot(container).render(<OnboardingPage userId={userId} />);
}

void start();
