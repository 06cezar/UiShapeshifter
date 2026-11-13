# Arhitectura

```
apps/web  (React + Vite + TypeScript, Zustand, Framer Motion)            port 5173
  ├─ ui/          store-ul UIConfig, LayoutRenderer, șabloane, registrul de elemente      (B)
  ├─ generated/   ComponentRenderer pentru elementele generate la cerere                  (B)
  ├─ demo-app/    ecranele aplicației: mesaje, poze, contacte, apeluri + date de test     (B)
  ├─ a11y/        auditul de accesibilitate și reparațiile                                (C)
  ├─ onboarding/  testul inițial                                                          (C)
  ├─ mascot/      mascota, point_at                                                       (D)
  ├─ chat/        chat text + voce                                                        (D)
  ├─ journal/     panoul jurnal, aprobări, istoric, reluare                               (D)
  ├─ signals/     colectarea semnalelor de utilizare                                      (E)
  └─ agent-bridge/ clientul WebSocket + executorul uneltelor "web"                        (B, cu A)

apps/server  (Node 20 + Express + ws + TypeScript, rulat cu tsx)          port 8787
  ├─ agent/       bucla agentului, promptul, apelurile OpenRouter, uneltele "server"       (A)
  ├─ profile/     profilul (memoria), stocare JSON                                         (E)
  ├─ adaptation/  regulile pe semnale, declanșatoarele                                     (E)
  └─ runs/        jurnalul rulărilor, stocare JSON                                         (A)

packages/contracts   tipurile comune (singura sursă de adevăr)                             (D)
data/                profiles/<userId>.json, configs/<userId>.json, runs/<runId>.json     (git-ignored)
```

## Fluxul unei cereri

```
Maria: „vreau s-o sun pe Ana mai repede”
  web ──user_message──▶ server: pornește o rulare (run_started), încarcă profilul
  server ──▶ OpenRouter: prompt de sistem + profil + scop + unelte
  model: get_ui_snapshot           server ──tool_call──▶ web: registrul face snapshot ──tool_result──▶ server
  model: generate_component(...)   server ──tool_call──▶ web: validează, randează, întoarce elementIds
  model: audit_ui                  web măsoară DOM-ul: „butonul nou are 40px < 48px”
  model: patch_config(...)         web aplică, revizia crește
  model: audit_ui                  ok
  model: point_at("gen.call-ana")  mascota arată placa nouă
  model: finish(...)               server ──run_finished──▶ web
  după fiecare pas: server ──step──▶ web (panoul jurnal)
```

Serverul ține bucla și cheia. Frontend-ul execută uneltele care ating DOM-ul și răspunde cu `tool_result`.
Detalii: `06-protocol.md`.

## Decizii

- **LLM:** OpenRouter (API compatibil OpenAI, `POST https://openrouter.ai/api/v1/chat/completions`, `tools`).
  Modelul se alege prin `OPENROUTER_MODEL`; recomandat un model rapid cu tool calling bun. Cheia doar în `apps/server/.env`
  (`OPENROUTER_API_KEY`), niciodată în browser sau în git. `.env.example` e comis, `.env` nu.
- **Fără AI acolo unde nu trebuie:** auditul, limitele, regulile de adaptare, randarea sunt cod determinist. Modelul doar decide.
- **Stocare:** fișiere JSON în `data/`. Fără bază de date.
- **Un singur utilizator de demo:** `userId = "maria"`, plus `"demo-fresh"` pentru onboarding de la zero.
- **Monorepo cu npm workspaces:** `npm install` din rădăcină; `npm run dev` pornește web + server.
  Importurile comune: `import type { UIConfig } from "@uishapeshifter/contracts"`.

## Convenții

- Toate textele pentru utilizator sunt în **română**, scurte, fără jargon.
- Orice element interactiv are `data-agent-id` (vezi `04-registru-si-snapshot.md`). Fără el, agentul nu îl vede.
- Nicio culoare, mărime sau font hardcodat în componente: totul vine din `theme` (variabile CSS generate din config).
- Fișierele fiecăruia: tabelul de mai sus. În afara lor se cere prin `git comms send`.
- O schimbare în `packages/contracts` = schimbare de contract (vezi `specs/README.md`).
