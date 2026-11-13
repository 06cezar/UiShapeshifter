# Protocolul extensie ↔ server (etapa 1)

Tipurile: `packages/contracts/src/protocol.ts` (`ClientMessage`, `ServerMessage`, `PageInfo`). Server: `ws://localhost:8787/ws`
și HTTP pe 8787. Extensia are **un singur WebSocket**, ținut de service worker pentru toate tab-urile; content script-urile
vorbesc cu el prin mesaje interne ale extensiei (`chrome.runtime`), fiindcă pagina nu poate deschide direct `ws://` pe
site-uri cu CSP strict.

## Drumul unui mesaj

```
pagină (content script) ──chrome.runtime──▶ service worker ──ws──▶ server
                                                                     │ pornește rularea
pagină ◀──────────────── tool_call (get_page_snapshot / apply_css) ◀──┘
pagină ──tool_result──▶ service worker ──▶ server        (un singur tool_call în zbor pe rulare)
pagină ◀── step / agent_message / run_finished ◀── server
```

Service worker-ul ține evidența: `runId → tabId`, ca `tool_call` și `step` să ajungă în tab-ul din care a plecat cererea.
Un tab închis în timpul rulării → `tool_result` cu `TIMEOUT` după `RUN_LIMITS.toolTimeoutMs`.

## Mesaje

1. La conectare, service worker-ul trimite `hello { userId, sessionId }`. Fără `hello` în 5 s, serverul închide socket-ul.
   `userId` e cel anonim generat la instalare; `sessionId` e **unul pe service worker** (un singur socket), ținut în
   `chrome.storage.session`, ca să rămână același când MV3 oprește și repornește worker-ul și o rulare în curs să se
   lege de socket-ul nou. Tab-urile se deosebesc după `runId → tabId`, ținut de service worker.
2. `user_message { text, source, page? }`: pornește o rulare. `page` (`PageInfo { url, host, title }`) spune pe ce site
   e omul; fără el (pagina de probă), agentul lucrează fără rețetă. `host` pleacă fără `www.` și cu litere mici (serverul îl
validează: litere, cifre, `.`, `-`, fiindcă ajunge în calea fișierului rețetei). Serverul răspunde `run_started`.
3. `tool_call { callId, name, args }` pentru uneltele `web` (`get_page_snapshot`, `apply_css`, `say`); pagina răspunde
   `tool_result { callId, result }`.
4. `step` după fiecare pas, inclusiv pentru uneltele `server` (panoul).
5. `agent_message`: ce spune mascota (bulă + chat), cu starea ei.
6. `run_finished` încheie rularea. Pe `success: true`, content script-ul salvează rețeta în stocarea locală (deja
   salvată după fiecare `apply_css`; aici se închide și revizia).
7. `signals { signals, page? }` (loturi, cel mult o dată la 5 s): adaptarea automată (`09`).
7a. `suggestion { suggestion }` (server → pagină): mascota propune singură ceva; omul răspunde cu `suggestion_decision`
   (`accept` | `dismiss`). La `accept`, serverul pornește o rulare cu scopul propunerii (`origin: "adaptation"`).
8. `cancel_run`: serverul oprește bucla după pasul curent și răspunde `run_finished { success: false }`. Rețeta rămâne la
   revizia de acum; „Revino la original” o golește.

## Reconectare

- Service worker-ul se reconectează automat (1 s, 2 s, 5 s) și retrimite `hello`. MV3 poate opri un service worker
  inactiv: primul mesaj nou îl repornește și redeschide socket-ul.
- Un `tool_call` fără răspuns la deconectare devine `TIMEOUT` pe server.
- **Reaplicarea rețetei nu depinde de server:** pagina citește stocarea locală, deci merge și cu serverul oprit.

## HTTP

| Metodă și cale | Corp | Răspuns |
|---|---|---|
| `GET /api/health` | – | `{ ok: true }` |
| `GET /api/profile/:userId` | – | `UserProfile` (creat cu valori implicite dacă lipsește) |
| `PUT /api/profile/:userId/onboarding` | `OnboardingResult` | `UserProfile` |
| `GET /api/runs?userId=` | – | `RunListItem[]` |
| `GET /api/runs/:runId` | – | `AgentRun` |
| `GET /api/recipes/:userId` | – | `SiteRecipe[]` |
| `GET /api/recipes/:userId/:host` | – | `SiteRecipe`, sau 404 |
| `PUT /api/recipes/:userId/:host` | `SiteRecipe` | `{ revision }` |
| `DELETE /api/recipes/:userId/:host` | – | `{ ok: true }` („Revino la original”) |
| `POST /api/accounts/register`, `/login` | `RegisterRequest` / `LoginRequest` | `AuthResult` |
| `GET /api/sync` (Bearer) | – | `SyncBundle` (profil + rețete) |
| `PUT /api/sync` (Bearer) | `SyncBundle` | `{ updatedAt }` |

Rețetele pe server sunt copia pentru cine are cont (sincronizare pe alt dispozitiv, etapa 4); sursa pentru reaplicare e
mereu stocarea locală. `GET/PUT /api/config/:userId` rămâne doar pentru aplicația veche.

Erori HTTP: `{ error: string }` cu 400 / 404 / 500. CORS: extensia are acces la `http://localhost:8787` prin
`host_permissions`; pentru pagina de probă, `http://localhost:5173`.
