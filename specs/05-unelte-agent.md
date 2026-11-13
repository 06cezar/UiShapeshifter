# Agentul: bucla, promptul și uneltele (etapa 1)

Definițiile pentru model: `packages/contracts/src/tools.ts` (`SITE_TOOL_DEFINITIONS`, `SITE_TOOL_NAMES`, `TOOL_RUNS_ON`).
Jurnalul: `packages/contracts/src/journal.ts`. `TOOL_DEFINITIONS` (aplicația veche) e depășit; rămâne cât timp îl folosește
cineva, iar modelul primește doar `SITE_TOOL_DEFINITIONS`.

## Bucla (server, `apps/server/src/agent/`)

```
run(goal, origin, page):
  profile = loadProfile(userId)
  messages = [system(prompt, profile, page), user(goal)]
  for step in 0..RUN_LIMITS.maxSteps:
    response = openrouter(messages, SITE_TOOL_DEFINITIONS)     # un singur tool call pe pas
    call = response.tool_calls[0]  (fără tool call => tratat ca say + finish)
    result = TOOL_RUNS_ON[call.name] == "web" ? await webTool(call) : await serverTool(call)
    journal.append({ observation, decision, reason, tool, args, result, recipeRevisionBefore/After })
    messages += [response, tool(result)]
    if call.name == "finish": break
  dacă s-a atins maxSteps: finish(success=false, rezumat cu ce s-a reușit)
```

- `reason`: înainte de fiecare tool call, modelul scrie în `content` „Observ: …. Fac: …. Pentru că: …”. Serverul îl
  desparte în `observation` / `decision` / `reason` pentru jurnal (pasul se vede pe ecran, cât rulează).
- Rezultatele mari (snapshot) se compactează înainte să intre în `messages`.
- Rețeta rămâne pe pagină, deci o rulare nouă pornește de la ce a lăsat cea veche (`get_page_snapshot` arată `recipe.css`).
- O rulare nouă a aceluiași om o anulează pe cea veche.

## Promptul de sistem (idei obligatorii)

- Cine ești: agentul UI Shapeshifter, care schimbă interfața site-ului pe care e omul; româna, scurt, fără jargon.
- Pe ce site lucrezi (`page.host`, titlul) și ce preferințe generale are omul (din profil).
- **Observă înainte să schimbi** (`get_page_snapshot`) și **verifică după** (`get_page_snapshot` din nou: au dispărut
  elementele? a rămas pagina utilizabilă? ai ascuns ceva în plus?).
- Schimbi pagina doar cu CSS: `display: none` pentru a scoate, `order`, `grid`, `flex`, culori, fonturi, spațiere.
  Nu scrii JavaScript și nu folosești `url()` sau `@import`: ce nu e voie se scoate și apare în `dropped`.
- Folosește selectorii din snapshot (`selector`), nu clase generate. Dacă `unmatchedSelectors` nu e gol, reiei cu
  alți selectori sau spui că n-ai găsit elementul.
- Nu ascunde elementele din care omul are nevoie ca să folosească pagina (căutarea, autentificarea, coșul) dacă nu a
  cerut asta explicit; la îndoială, întrebi (etapa 2, `ask_user`) sau spui ce ai lăsat.
- Termini mereu cu `finish` și un rezumat de 1–2 propoziții: ce ai scos, ce a rămas.

## Uneltele etapei 1

| Unealtă | Unde | Ce face | Erori tipice și ce face agentul |
|---|---|---|---|
| `get_page_snapshot` | web | rezumatul paginii (`04`) | `ELEMENT_NOT_FOUND` la un `regionId` care nu mai există → cere fără `regionId` |
| `apply_css` | web | validează, aplică, crește revizia (`02`) | `INVALID_ARGS` (nu a rămas nimic sau foaia e prea mare) → corectează după `details.dropped` |
| `say` | web | mesaj în bulă (chat), starea mascotei | – |
| `finish` | server | închide rularea, rețeta se salvează | – |

`apply_css` întoarce `ApplyCssData { revision, cssBytes, dropped, unmatchedSelectors }`. Cu ele agentul verifică și
repară singur fără un snapshot în plus: un selector care nu a găsit nimic apare în `unmatchedSelectors`.

## Eșecuri: regula generală

- O unealtă eșuată intră în jurnal ca pas eșuat (roșu în panou) și nu oprește rularea.
- Aceeași unealtă cu aceleași argumente nu se repetă după eșec. După `RUN_LIMITS.maxToolRetries` eșecuri la aceeași
  unealtă: alt plan sau `finish` cu `success: false` și motivul.
- O unealtă din pagină care nu răspunde în `RUN_LIMITS.toolTimeoutMs` → `TIMEOUT` (tab închis, pagină înghețată).
- Eroare de la OpenRouter (rețea, 429, 5xx): 2 reîncercări cu pauză (1 s, 3 s), apoi `agent_message` „Am o problemă de
  conexiune, încerc din nou imediat” și rularea se oprește curat.

## Reglaje pentru demo

- `temperature` mică (0.2).
- `AGENT_FAKE=1`: răspunsuri înregistrate (fără OpenRouter), ca extensia să se dezvolte și demo-ul să aibă o rezervă fără rețea.

## Vine în etapele următoare (D8)

`propose_changes` (Păstrez/Anulez), `point_at`, `audit_ui`, `ask_user`, `update_profile`, `DomOp` (mută, împachetează,
adaugă, leagă), componentele generate.
