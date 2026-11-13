// Arată testul inițial la prima deschidere (profil nici terminat, nici omis), altfel aplicația.
// Dacă serverul nu răspunde, intră direct în aplicație: testul nu are voie să blocheze omul.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { UserProfile } from "@uishapeshifter/contracts";
import { fetchProfile } from "./api";
import { Onboarding } from "./Onboarding";
import { needsOnboarding } from "./result";

export interface OnboardingGateProps {
  userId: string;
  children: ReactNode;
  /** Primește profilul după test (sau cel citit, dacă testul nu mai e nevoie). */
  onProfile?: (profile: UserProfile) => void;
  fetchFn?: typeof fetch;
}

type GateState = "loading" | "onboarding" | "app";

export function OnboardingGate({ userId, children, onProfile, fetchFn }: OnboardingGateProps) {
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let current = true;
    fetchProfile(userId, fetchFn)
      .then((profile) => {
        if (!current) return;
        if (needsOnboarding(profile)) setState("onboarding");
        else {
          onProfile?.(profile);
          setState("app");
        }
      })
      .catch(() => current && setState("app"));
    return () => {
      current = false;
    };
    // fără onProfile în dependențe: e un callback al părintelui, nu vrem să recitim profilul când i se schimbă referința
  }, [userId, fetchFn]);

  if (state === "loading") return null;
  if (state === "onboarding") {
    return (
      <Onboarding
        userId={userId}
        fetchFn={fetchFn}
        onDone={(profile) => {
          if (profile) onProfile?.(profile);
          setState("app");
        }}
      />
    );
  }
  return <>{children}</>;
}
