# Registrul de elemente, snapshot-ul și coordonatele pentru mascotă

Tipurile: `packages/contracts/src/snapshot.ts`.

## Convenția `data-agent-id`

Fiecare element pe care agentul trebuie să-l vadă sau să-l arate are `data-agent-id="<modul>.<element>"`.

| Id | Ce e |
|---|---|
| `nav.<moduleId>` | intrarea din meniu spre modul (`nav.messages`, `nav.photos`…) |
| `nav.home` | intrarea „Acasă” din meniu; în `simple-tiles`, butonul „Înapoi la ecranul principal” |
| `home.<moduleId>` | placa modulului pe ecranul principal |
| `messages.list`, `messages.compose`, `messages.send`, `messages.attach-photo` | ecranul de mesaje |
| `chat.<contactId>` | conversația cu un contact; `chat.<contactId>.input`, `chat.<contactId>.send` |
| `photos.grid`, `photos.item.<photoId>`, `photos.share` | pozele |
| `contacts.<contactId>`, `contacts.<contactId>.call` | contactele |
| `calls.list`, `calls.<contactId>` | apelurile |
| `settings.font`, `settings.contrast`, `settings.reset` | setările |
| `menu.more` | meniul „Mai mult” (când navigația ascunde module) |
| `gen.<componentId>` | elemente generate |
| `mascot`, `chat-panel`, `journal-panel` | interfața agentului (excluse din audit) |

Contactele de test: `ana` (nepoata), `ion` (fiul), `maria-v` (vecina), `dr-popescu` (medicul).

## Registrul (frontend)

```ts
// hook folosit de orice componentă interactivă
function useAgentElement(id: string, meta?: { role?: string; label?: string; moduleId?: string }): React.RefCallback<HTMLElement>;

// API-ul registrului
registry.get(id): HTMLElement | undefined
registry.ids(): string[]
registry.snapshot(opts?: { moduleId?: string }): UISnapshot
registry.rectOf(id): DOMRect | undefined           // coordonate în viewport, actualizate la cerere
registry.ensureVisible(id): Promise<"visible" | "scrolled" | "hidden">
```

- Componentele se înregistrează la montare și se scot la demontare.
- Ca rezervă, `snapshot()` caută și `document.querySelectorAll("[data-agent-id]")`, ca nimic să nu scape.
- `snapshot()` calculează pentru fiecare element: `rect` (`getBoundingClientRect`), `visible`, `inViewport`,
  `fontPx`/`fontWeight`/`color` (`getComputedStyle`), `background` (primul strămoș cu fundal opac), `contrast`
  (formula WCAG), `clipped` (`scrollWidth > clientWidth + 1` sau `scrollHeight > clientHeight + 1`, dar nu pe
  o axă care derulează, cu `overflow` `auto`/`scroll`: o listă care derulează nu e text tăiat).
- Snapshot-ul trimis modelului se compactează: doar elementele vizibile din modulul curent + navigația,
  numere rotunjite, cel mult 80 de elemente.

## Coordonatele pentru `point_at`

1. `registry.ensureVisible(id)`: dacă elementul e într-un meniu închis sau alt modul → `NOT_VISIBLE`
   (agentul trebuie să deschidă întâi meniul sau să navigheze); dacă e în afara ecranului → `scrollIntoView({ block: "center" })`.
2. `rect = registry.rectOf(id)`; ținta lăbuței = marginea elementului cea mai apropiată de mascotă, nu centrul,
   ca lăbuța să nu acopere textul.
3. Mascota se mută lângă element (rămâne în ecran), se rotește spre țintă, iar elementul primește un contur
   pulsatoriu (`outline` cu `--color-focus`, 3px), fără să-i schimbe layout-ul.
4. Pe `resize`, `scroll` și la schimbarea reviziei config-ului, poziția se recalculează (`requestAnimationFrame`).
5. Rezultatul: `{ scrolledIntoView, rect }`.

## Puntea agentului (frontend)

Tipurile: `apps/web/src/agent-bridge/index.ts` (fișierul lui B). Puntea ține **singurul** WebSocket al aplicației
(`specs/06`) și registrul de elemente; colegii nu deschid alt socket.

```ts
// în React, sub <AgentBridgeProvider> (pus în App.tsx)
const bridge = useAgentBridge();      // AgentBridge
const registry = useRegistry();       // AgentRegistry

bridge.send(message): boolean          // user_message, cancel_run, signals; false = deconectat (fără coadă)
bridge.on(type, handler): () => void   // ex. "step", "agent_message", "run_started", "run_finished"
bridge.registerTool(name, handler): () => void
bridge.status(): "connecting" | "open" | "closed";  bridge.onStatus(listener): () => void
```

- **Registrul e public:** în React prin `useRegistry()`, în handler-ele de unelte prin `ctx.registry`. Pe lângă
  API-ul de mai sus are `compactSnapshot(opts?)` (snapshot-ul pentru model) și `register(id, el, meta?)` (folosit
  de `useAgentElement`). `snapshot()` e complet (pentru audit și semnale).
- **Handler-ul unei unelte** primește `args: unknown` (vin de la model, serverul nu le verifică) și
  `ctx = { runId, callId, store, registry }`; întoarce `ToolResult<ToolData[name]>` (sau o promisiune).
  Verifică argumentele și întoarce `INVALID_ARGS` dacă nu se potrivesc. O excepție devine `INTERNAL`, fără să
  închidă socket-ul. O unealtă fără handler întoarce `INTERNAL` („nu e încă disponibilă în interfață”).
- **O singură unealtă pe nume:** o a doua înregistrare o înlocuiește pe prima, cu avertisment în consolă.

| Unealta web | Cine o înregistrează |
|---|---|
| `get_ui_snapshot`, `patch_config`, `apply_template`, `navigate` | B (puntea, B2) |
| `generate_component`, `remove_component` | B (B3) |
| `audit_ui` | C |
| `point_at`, `say`, `ask_user`, `propose_changes`, `wait_for_user_click` | D |

```tsx
// exemplu (D): unealta say, înregistrată cât timp e montat chatul
const bridge = useAgentBridge();
useEffect(() => bridge.registerTool("say", (args) => {
  if (!isRecord(args) || typeof args.message !== "string")
    return { ok: false, error: { code: "INVALID_ARGS", message: "say are nevoie de message (text)." } };
  showBubble(args.message);
  return { ok: true, data: { shown: true } };
}), [bridge]);
```
