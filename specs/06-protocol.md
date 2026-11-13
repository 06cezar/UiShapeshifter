# Protocolul frontend ↔ server

Tipurile: `packages/contracts/src/protocol.ts` (`ClientMessage`, `ServerMessage`). Porturi: web 5173, server 8787.

## WebSocket `ws://localhost:8787/ws`

1. La conectare, frontend-ul trimite `hello { userId, sessionId }`. Fără `hello` în 5 s, serverul închide socket-ul.
2. `user_message` pornește o rulare: serverul răspunde `run_started`, apoi pași.
3. Pentru o unealtă `web`, serverul trimite `tool_call { callId, name, args }`; frontend-ul o execută prin
   `agent-bridge` și răspunde `tool_result { callId, result }`. Un singur `tool_call` în zbor pe rulare.
4. După fiecare pas, serverul trimite `step` (inclusiv pentru uneltele `server`).
5. `agent_message` = ce spune mascota (bulă + chat), cu starea ei.
6. `run_finished` încheie rularea; panoul afișează rezumatul și butonul „Reia pas cu pas”.
7. `signals` (loturi, cel mult o dată la 5 s) hrănesc adaptarea automată (`09`).
8. `cancel_run`: serverul oprește bucla după pasul curent și răspunde `run_finished { success: false }`.

```
web                                   server                               OpenRouter
 │ hello ───────────────────────────▶ │
 │ user_message ────────────────────▶ │ run_started ─▶ web
 │                                    │ ─────────── chat.completions ────▶ │
 │                                    │ ◀─────────── tool_call ─────────── │
 │ ◀────────────────────── tool_call  │
 │ tool_result ────────────────────▶  │ step ─▶ web
 │                                    │ ─────────── chat.completions ────▶ │  …
 │ ◀────────────────── run_finished   │
```

## Reconectare

- Frontend-ul se reconectează automat (1 s, 2 s, 5 s), retrimite `hello`.
- Un `tool_call` fără răspuns la deconectare devine `TIMEOUT` pe server.

## HTTP

| Metodă și cale | Corp | Răspuns |
|---|---|---|
| `GET /api/health` | – | `{ ok: true }` |
| `GET /api/profile/:userId` | – | `UserProfile` (creat cu valori implicite dacă lipsește) |
| `PUT /api/profile/:userId/onboarding` | `OnboardingResult` | `UserProfile` |
| `GET /api/config/:userId` | – | `UIConfig` |
| `PUT /api/config/:userId` | `UIConfig` | `{ revision }` |
| `GET /api/runs?userId=` | – | `RunListItem[]` |
| `GET /api/runs/:runId` | – | `AgentRun` |

Erori HTTP: `{ error: string }` cu 400 / 404 / 500. CORS deschis pentru `http://localhost:5173`.
