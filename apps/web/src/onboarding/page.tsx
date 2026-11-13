// Pagina testului inițial în extensie (onboarding.html), deschisă la instalare de service worker.
// Ia userId-ul anonim al extensiei, salvează rezultatul în chrome.storage.local și îl trimite la server.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { OnboardingResult } from "@uishapeshifter/contracts";
import { getOrCreateUserId } from "../extension/storage";
import { Onboarding, ONBOARDING_STYLE } from "./Onboarding";
import { ONBOARDING_STORAGE_KEY } from "./storage-key";

function OnboardingPage({ userId }: { userId: string }) {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <main className="onboarding" style={ONBOARDING_STYLE} aria-labelledby="onboarding-done">
        <h1 id="onboarding-done" className="onboarding__title">
          Gata!
        </h1>
        <p className="onboarding__mascot">Deschide orice site: îl pregătesc după cum ai ales. Poți schimba oricând.</p>
        <button type="button" className="onboarding__primary" onClick={() => window.close()}>
          Închide pagina
        </button>
      </main>
    );
  }
  return (
    <Onboarding
      userId={userId}
      saveLocal={(result: OnboardingResult) => chrome.storage.local.set({ [ONBOARDING_STORAGE_KEY]: result })}
      onDone={() => setDone(true)}
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
