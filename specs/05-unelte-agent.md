# Agentul: bucla, promptul și uneltele

Tipurile și definițiile pentru model: `packages/contracts/src/tools.ts` (`TOOL_DEFINITIONS`, `TOOL_RUNS_ON`).
Jurnalul: `packages/contracts/src/journal.ts`.

## Bucla (server, `apps/server/src/agent/`)

```
run(goal, origin):
  profile = loadProfile(userId)
  messages = [system(prompt, profile), user(goal)]
  for step in 0..RUN_LIMITS.maxSteps:
    response = openrouter(messages, TOOL_DEFINITIONS)           # un singur tool call pe pas (parallel_tool_calls: false)
    call = response.tool_calls[0]  (fără tool call => tratat ca say + finish)
    result = TOOL_RUNS_ON[call.name] == "web" ? await webTool(call) : await serverTool(call)
    journal.append({ observation, decision, reason, tool, args, result })
    messages += [response, tool(result)]
    if call.name == "finish": break
  dacă s-a atins maxSteps: finish(success=false, rezumat cu ce s-a reușit)
```

- `reason`: modelul scrie înainte de fiecare tool call un rând scurt „Observ: …. Fac: …. Pentru că: …”
  (în `content`). Serverul îl desparte în `observation` / `decision` / `reason` pentru jurnal.
- Rezultatele mari (snapshot) se compactează înainte să intre în `messages`.
- O rulare nouă a aceluiași utilizator o anulează pe cea veche (sau o pune în coadă, dacă e din adaptare).

## Promptul de sistem (idei obligatorii)

- Cine ești: vulpița din UI Shapeshifter; vorbești în română, scurt, cald, fără jargon.
- Profilul utilizatorului (rezumat) și pragurile lui (font minim, contrast, ținte).
- **Observă înainte să schimbi** (`get_ui_snapshot`), **verifică după** (`audit_ui` după orice schimbare vizuală).
- Accesibilitatea are prioritate față de orice cerere de stil: dacă o cerere ar coborî fontul sub minim,
  explici și propui o alternativă.
- Schimbările mari (șablon nou, module ascunse, modul nou) trec prin `propose_changes`. Cele mici și sigure
  (ex. +2px font, etichete la meniu) se pot aplica direct, anunțate cu `say`.
- Informație lipsă („care Ana?”, „cât de mare?”) → `ask_user` cu variante, nu ghicești.
- Ghidaj: `point_at` → `wait_for_user_click` → dacă `correct: false`, spui ce a apăsat și arăți din nou;
  dacă `NOT_VISIBLE`, întâi `navigate` sau deschizi meniul.
- Salvezi în profil (`update_profile`) doar ce ai observat, cu dovezi.
- Termini mereu cu `finish` și un rezumat de 1–2 propoziții.

## Uneltele: semantica și erorile

| Unealtă | Unde | Ce face | Erori tipice și ce face agentul |
|---|---|---|---|
| `get_ui_snapshot` | web | snapshot compact (`04`) | – |
| `patch_config` | web | aplică prin poarta de limite (`02`) | `LIMIT_VIOLATION` → citește încălcările, alege alte valori |
| `apply_template` | web | schimbă structura | – |
| `generate_component` | web | validează și randează (`03`) | `INVALID_ARGS` → corectează specificația |
| `remove_component` | web | șterge un element generat | `ELEMENT_NOT_FOUND` |
| `navigate` | web | deschide modulul | `ELEMENT_NOT_FOUND` (modul ascuns) → îl face vizibil sau întreabă |
| `point_at` | web | mascota arată elementul (`04`) | `NOT_VISIBLE` → navighează / deschide meniul, apoi din nou |
| `wait_for_user_click` | web | așteaptă click-ul | `TIMEOUT` → întreabă dacă are nevoie de ajutor |
| `ask_user` | web | întrebare cu variante, în bula mascotei + chat | `USER_CANCELLED` |
| `propose_changes` | web | aplică ca previzualizare, Păstrez/Anulez; Anulez = undo la revizia dinainte | decizia `undo` → notează în profil, nu insistă |
| `audit_ui` | web | raportul de accesibilitate (`07`) | issues → repară cu `patch_config` (folosind `fix` dacă există) |
| `say` | web | mesaj în bulă, starea mascotei | – |
| `get_profile` | server | profilul | – |
| `update_profile` | server | fapte + patch în profil | `INVALID_ARGS` |
| `finish` | server | închide rularea | – |

## Eșecuri: regula generală

- O unealtă eșuată intră în jurnal ca pas eșuat (roșu în panou), nu oprește rularea.
- Aceeași unealtă cu aceleași argumente nu se repetă după eșec. După `RUN_LIMITS.maxToolRetries` eșecuri
  la aceeași unealtă: alt plan sau `ask_user`.
- O unealtă din frontend care nu răspunde în `RUN_LIMITS.toolTimeoutMs` → `TIMEOUT`.
- Eroare de la OpenRouter (rețea, 429, 5xx): 2 reîncercări cu pauză (1 s, 3 s), apoi `agent_message` „Am o
  problemă de conexiune, încerc din nou imediat” și rularea se oprește curat.

## Reglaje pentru demo

- `temperature` mică (0.2).
- Un mod `AGENT_FAKE=1` cu răspunsuri înregistrate (fără OpenRouter), ca frontend-ul să se poată dezvolta
  și demo-ul să aibă o rezervă fără rețea.
