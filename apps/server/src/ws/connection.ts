// Un socket WebSocket pe /ws, de la „hello” până la închidere (specs/06).

import type { UsageSignal } from "@uishapeshifter/contracts";
import type { WebSocket } from "ws";
import { cancelRun, startRunInSession } from "../agent/run-manager";
import { parseClientMessage } from "./parse-client-message";
import { bindSession, receiveToolResult, sendToSession, unbindSocket, type Session } from "./sessions";

const HELLO_TIMEOUT_MS = 5000;
const CLOSE_NO_HELLO = 4000; // cod de închidere al aplicației (4000–4999)

export type SignalsHandler = (userId: string, signals: UsageSignal[]) => void;

// adaptarea automată (E3) își pune aici handler-ul; până atunci doar le vedem în log (E2: „se văd în log”)
let signalsHandler: SignalsHandler = (userId, signals) => {
  console.log(`signals: ${userId} a trimis ${signals.length}: ${signals.map((s) => s.kind).join(", ")}`);
};

export function setSignalsHandler(handler: SignalsHandler): void {
  signalsHandler = handler;
}

function sendError(socket: WebSocket, message: string): void {
  socket.send(JSON.stringify({ type: "error", message }));
}

export function handleConnection(socket: WebSocket): void {
  let session: Session | null = null;
  const helloTimer = setTimeout(() => {
    if (!session) socket.close(CLOSE_NO_HELLO, "hello lipsă");
  }, HELLO_TIMEOUT_MS);

  socket.on("message", (data) => {
    const message = parseClientMessage(data.toString());
    if (!message) return sendError(socket, "Mesaj nerecunoscut (vezi specs/06-protocol.md).");

    if (message.type === "hello") {
      clearTimeout(helloTimer);
      session = bindSession(message.sessionId, message.userId, socket);
      return;
    }
    if (!session) return sendError(socket, "Trimite întâi hello { userId, sessionId }.");

    switch (message.type) {
      case "user_message":
        startRunInSession(session, message.text, "user");
        return;
      case "tool_result":
        if (!receiveToolResult(session, message.callId, message.result)) {
          console.warn(`ws: tool_result pentru un callId pe care nu-l mai așteaptă nimeni: ${message.callId}`);
        }
        return;
      case "cancel_run":
        if (!cancelRun(session.userId, message.runId)) {
          sendToSession(session, { type: "error", message: `Nu există o rulare activă ${message.runId}.` });
        }
        return;
      case "signals":
        signalsHandler(session.userId, message.signals);
        return;
    }
  });

  socket.on("close", () => {
    clearTimeout(helloTimer);
    if (session) unbindSocket(session, socket);
  });
}
