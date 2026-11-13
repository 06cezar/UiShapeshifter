// Sesiunile WebSocket: un tab = o sesiune (sessionId din „hello”). La reconectare, același sessionId
// se leagă de socket-ul nou, iar rulările merg mai departe pe el.
// Aici trăiesc și apelurile de unelte „web” aflate în zbor: callId → cine așteaptă rezultatul.

import { randomUUID } from "node:crypto";
import {
  RUN_LIMITS,
  type ServerMessage,
  type ToolArgs,
  type ToolName,
  type ToolResult,
} from "@uishapeshifter/contracts";
import { WebSocket } from "ws";

// uneltele care așteaptă omul (click, răspuns, Păstrez/Anulez) primesc mai mult timp decât restul
const WAITS_FOR_HUMAN: ReadonlySet<ToolName> = new Set(["wait_for_user_click", "ask_user", "propose_changes"]);
// peste timeout-ul cerut de model, ca frontend-ul să apuce să răspundă el cu timedOut: true
const CLICK_TIMEOUT_GRACE_MS = 2000;

interface PendingCall {
  runId: string;
  message: ServerMessage; // tool_call-ul, păstrat ca să-l trimitem după o reconectare
  sent: boolean; // a plecat spre un socket (care poate să răspundă)
  resolve: (result: ToolResult) => void;
  timer: NodeJS.Timeout;
}

export interface Session {
  sessionId: string;
  userId: string;
  socket: WebSocket | null;
  lastSeen: number;
  pending: Map<string, PendingCall>;
}

const sessions = new Map<string, Session>();

function timeoutFor(name: ToolName, args: unknown): number {
  if (name === "wait_for_user_click") {
    const asked = (args as { timeoutMs?: unknown } | null)?.timeoutMs;
    const wanted = typeof asked === "number" && asked > 0 ? asked : RUN_LIMITS.waitForClickMaxMs;
    return Math.min(wanted, RUN_LIMITS.waitForClickMaxMs) + CLICK_TIMEOUT_GRACE_MS;
  }
  return WAITS_FOR_HUMAN.has(name) ? RUN_LIMITS.waitForClickMaxMs : RUN_LIMITS.toolTimeoutMs;
}

function settle(session: Session, callId: string, result: ToolResult): boolean {
  const call = session.pending.get(callId);
  if (!call) return false;
  clearTimeout(call.timer);
  session.pending.delete(callId);
  call.resolve(result);
  return true;
}

export function bindSession(sessionId: string, userId: string, socket: WebSocket): Session {
  const existing = sessions.get(sessionId);
  if (existing && existing.userId === userId) {
    existing.socket = socket;
    existing.lastSeen = Date.now();
    flushUnsent(existing);
    return existing;
  }
  const session: Session = { sessionId, userId, socket, lastSeen: Date.now(), pending: new Map() };
  sessions.set(sessionId, session);
  return session;
}

/** Socket-ul s-a închis: ce aștepta un răspuns de la el devine TIMEOUT (specs/06, „Reconectare”). */
export function unbindSocket(session: Session, socket: WebSocket): void {
  if (session.socket !== socket) return; // s-a reconectat deja pe alt socket
  session.socket = null;
  for (const [callId, call] of [...session.pending]) {
    if (!call.sent) continue; // n-a plecat încă: așteaptă reconectarea, în limita timeout-ului
    settle(session, callId, {
      ok: false,
      error: { code: "TIMEOUT", message: "Interfața s-a deconectat înainte să răspundă." },
    });
  }
}

/** Trimite dacă socket-ul e deschis; întoarce dacă a plecat. */
export function sendToSession(session: Session, message: ServerMessage): boolean {
  if (session.socket?.readyState !== WebSocket.OPEN) return false;
  session.socket.send(JSON.stringify(message));
  return true;
}

function flushUnsent(session: Session): void {
  for (const call of session.pending.values()) {
    if (!call.sent) call.sent = sendToSession(session, call.message);
  }
}

/**
 * Trimite un tool_call frontend-ului și așteaptă tool_result (sau TIMEOUT). Dacă tab-ul e deconectat chiar acum,
 * tool_call-ul pleacă la reconectare (frontend-ul revine în 1–5 s), tot în limita timeout-ului.
 */
export function callWebTool(session: Session, runId: string, name: ToolName, args: unknown): Promise<ToolResult> {
  const callId = randomUUID();
  const timeoutMs = timeoutFor(name, args);
  return new Promise((resolve) => {
    const timer = setTimeout(
      () =>
        settle(session, callId, {
          ok: false,
          error: { code: "TIMEOUT", message: `Interfața n-a răspuns la ${name} în ${Math.round(timeoutMs / 1000)} s.` },
        }),
      timeoutMs,
    );
    const message: ServerMessage = { type: "tool_call", runId, callId, name, args: args as ToolArgs[ToolName] };
    session.pending.set(callId, { runId, message, sent: false, resolve, timer });
    flushUnsent(session);
  });
}

/** Rezultatul venit de la frontend; false dacă nu aștepta nimeni callId-ul ăsta (întârziat sau necunoscut). */
export function receiveToolResult(session: Session, callId: string, result: ToolResult): boolean {
  return settle(session, callId, result);
}

/** La oprirea unei rulări, unealta în zbor nu mai e așteptată. */
export function abandonCallsOfRun(runId: string): void {
  for (const session of sessions.values()) {
    for (const [callId, call] of session.pending) {
      if (call.runId === runId) {
        settle(session, callId, { ok: false, error: { code: "USER_CANCELLED", message: "Rularea a fost oprită." } });
      }
    }
  }
}

/** Sesiunea conectată cel mai recent a utilizatorului (pentru rulările pornite de server, ex. adaptarea). */
export function latestSessionOf(userId: string): Session | null {
  let latest: Session | null = null;
  for (const session of sessions.values()) {
    if (session.userId === userId && session.socket && (!latest || session.lastSeen > latest.lastSeen)) {
      latest = session;
    }
  }
  return latest;
}
