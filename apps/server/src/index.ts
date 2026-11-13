// Punctul de intrare al serverului. Aplicația (rutele /api și WebSocket-ul /ws) e în server.ts.
// Protocolul: specs/06-protocol.md.

import "./load-env";
import { SERVER_PORT } from "@uishapeshifter/contracts";
import { createAppServer } from "./server";

export const httpServer = createAppServer();

httpServer.listen(SERVER_PORT, () => {
  console.log(`server: http://localhost:${SERVER_PORT}/api/health  ·  ws://localhost:${SERVER_PORT}/ws`);
});
