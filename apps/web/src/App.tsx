// Ecranul de pornire al scheletului (D1): arată doar că web-ul vede serverul și contractele.
// B îl înlocuiește cu LayoutRenderer (specs/02); tema vine din UIConfig, nu de aici.

import { useEffect, useState } from "react";
import { CONTRACT_VERSION } from "@uishapeshifter/contracts";
import { API_URL } from "./server-url";

type ServerState = "verific" | "pornit" | "oprit";

export function App() {
  const [server, setServer] = useState<ServerState>("verific");

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((body: { ok?: boolean }) => setServer(body.ok ? "pornit" : "oprit"))
      .catch(() => setServer("oprit"));
  }, []);

  return (
    <main>
      <h1>UI Shapeshifter</h1>
      <p>Server: {server}</p>
      <p>Contracte: v{CONTRACT_VERSION}</p>
    </main>
  );
}
