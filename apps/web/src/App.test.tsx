import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

test("arată serverul pornit când /api/health răspunde ok", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve({ ok: true }) }));
  const container = document.createElement("div");
  await act(async () => createRoot(container).render(<App />));
  expect(container.textContent).toContain("Server: pornit");
});
