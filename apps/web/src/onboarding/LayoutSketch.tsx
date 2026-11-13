// Pasul 6 (specs/10): desene simple ale celor trei structuri, fără nume sau culori de aplicații reale.
// Doar cutii colorate din temă; desenul e decorativ, eticheta butonului spune ce e.

import type { LayoutTemplate } from "@uishapeshifter/contracts";

export const LAYOUT_NAMES: Record<LayoutTemplate, string> = {
  "sidebar-feed": "Meniu în lateral",
  "bottom-nav-stories": "Meniu jos, cu noutăți sus",
  "simple-tiles": "Plăci mari, fără meniu ascuns",
};

export function LayoutSketch({ template }: { template: LayoutTemplate }) {
  return (
    <div className={`onboarding__sketch onboarding__sketch--${template}`} aria-hidden="true">
      {template === "sidebar-feed" && (
        <>
          <span className="onboarding__sketch-side" />
          <span className="onboarding__sketch-main">
            <span className="onboarding__sketch-line" />
            <span className="onboarding__sketch-line" />
            <span className="onboarding__sketch-line" />
          </span>
        </>
      )}
      {template === "bottom-nav-stories" && (
        <>
          <span className="onboarding__sketch-dots">
            <span className="onboarding__sketch-dot" />
            <span className="onboarding__sketch-dot" />
            <span className="onboarding__sketch-dot" />
          </span>
          <span className="onboarding__sketch-main">
            <span className="onboarding__sketch-line" />
            <span className="onboarding__sketch-line" />
          </span>
          <span className="onboarding__sketch-bar" />
        </>
      )}
      {template === "simple-tiles" && (
        <span className="onboarding__sketch-tiles">
          <span className="onboarding__sketch-tile" />
          <span className="onboarding__sketch-tile" />
          <span className="onboarding__sketch-tile" />
          <span className="onboarding__sketch-tile" />
        </span>
      )}
    </div>
  );
}
