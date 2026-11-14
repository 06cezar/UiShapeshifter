// Memoria scurtă a conversației: fiecare mesaj al omului pornește o rulare nouă, deci fără ea agentul nu știe ce
// i s-a cerut înainte („fă textul mai mare”, apoi „și mai mult”; „nu găsesc contactul”, apoi „pune-l pe Agenții”).
// Ținem în memorie ultimele cereri ale omului pe același site; la repornirea serverului conversația începe din nou.

/** O cerere a omului și ce i-a răspuns agentul la final. */
export interface ConversationTurn {
  goal: string;
  summary: string;
  host?: string;
  finishedAt: number;
}

/** Câte cereri anterioare vede agentul: destule pentru „și mai mult”, puține ca promptul să rămână mic. */
export const MAX_TURNS = 3;
/** După atât timp, o cerere veche nu mai e „conversația de acum”. */
export const CONVERSATION_WINDOW_MS = 20 * 60_000;

const turnsByUser = new Map<string, ConversationTurn[]>();

export function recordTurn(userId: string, turn: ConversationTurn): void {
  const turns = [...(turnsByUser.get(userId) ?? []), turn];
  turnsByUser.set(userId, turns.slice(-MAX_TURNS));
}

/** Cererile recente ale omului pe același site, cele mai vechi primele. */
export function recentTurns(userId: string, host: string | undefined, now: number = Date.now()): ConversationTurn[] {
  return (turnsByUser.get(userId) ?? []).filter(
    (turn) => turn.host === host && now - turn.finishedAt <= CONVERSATION_WINDOW_MS,
  );
}

/** Pentru teste: o conversație nouă. */
export function forgetConversations(): void {
  turnsByUser.clear();
}
