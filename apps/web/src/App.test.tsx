import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

test("randează meniul din config chiar dacă serverul nu are încă rutele (404)", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: "Ruta nu există" }), { status: 404 })),
  );
  const container = document.createElement("div");
  await act(async () => createRoot(container).render(<App />));
  // Încărcarea e asincronă: lăsăm promisiunile să se termine.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(container.querySelector("[data-agent-id='nav.messages']")).not.toBeNull();
});
