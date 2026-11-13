# Mascota, conversația și panoul de control (etapele 2–3)

Cod: `apps/web/src/mascot/`, `apps/web/src/chat/`, `apps/web/src/journal/` (D). Toată interfața noastră stă în
**shadow DOM-ul extensiei** (`apps/web/src/extension/`, E5), ca site-ul să nu ne strice stilul și noi să nu-l stricăm pe al lui.
Culorile și mărimile vin din temă (variabile CSS), niciuna hardcodată.

## Mascota

Un **animal animat** (nu neapărat vulpe), din asset-uri cu licență liberă; licența și sursa se notează în repo
(`apps/web/src/mascot/LICENSE-ASSETS.md`). Se plimbă prin pagină și arată unde să apeși.

| Stare (`MascotState`) | Când | Animație |
|---|---|---|
| `idle` | nimic de făcut | respiră, clipește, stă într-un colț |
| `listening` | microfonul e pornit sau omul scrie | urechile / capul ridicate |
| `thinking` | rulare în curs, între pași | privește în sus, „…” |
| `speaking` | `agent_message`, `say` | gura se mișcă, bula apare |
| `pointing` | `point_at` | merge lângă element, arată spre el |
| `happy` | `finish` cu succes, „Păstrez” | sare puțin |
| `confused` | eroare, `TIMEOUT`, cerere neclară | capul înclinat |

- Stă în colțul de jos, nu acoperă navigația site-ului; se poate trage în alt colț. Cu `reducedMotion`, doar schimbări statice.
- API: `mascot.setState(state)`, `mascot.say(text, ms?)`, `mascot.pointAt(elementId, message) → Promise<Rect>`.

### Coordonatele pentru `point_at`

1. `registry.ensureVisible(id)` (`04`): ascuns într-un meniu închis → `NOT_VISIBLE` (agentul deschide întâi meniul); în afara
   ecranului → `scrollIntoView({ block: "center" })`.
2. `rect = registry.rectOf(id)`. Ținta e marginea elementului cea mai apropiată de mascotă, nu centrul, ca să nu acopere textul.
3. Mascota **merge** până lângă element (rămâne în ecran), iar elementul primește un contur pulsatoriu în stratul nostru
   (un chenar `position: fixed` desenat în shadow DOM, nu `outline` pe elementul site-ului: nu-i atingem stilul).
4. Pe `scroll`, `resize` și când pagina își schimbă singură layout-ul, poziția se recalculează (`requestAnimationFrame`).
5. Rezultatul: `{ scrolledIntoView, rect }`.

## Conversația

- Chat text (obligatoriu): câmp mare, buton „Trimite” ≥ `minTargetPx`, istoricul mesajelor. Trimite `user_message` cu `page`.
- Voce (etapa 3, D10): butonul microfon, `webkitSpeechRecognition` cu `lang = "ro-RO"`, rezultatul intermediar în câmp, trimis
  automat la final. Fără API (alt browser decât Chrome), butonul nu apare.
- Răspunsuri vorbite (opțional): `speechSynthesis` cu o voce `ro-RO`, dacă `needs.prefersVoice`.
- `ask_user` apare ca bulă la mascotă, cu butoane mari pentru variante și un câmp liber.
- **Propunerile** mascotei (`Suggestion`, `09`): bulă discretă cu „Da” / „Nu”.

## Panoul de control (jurnal)

Panou lateral peste site, care se poate ascunde. Arată **bucla agentului pas cu pas, pe ecran**, cât rulează (regula
din `CLAUDE.md`): ce a observat, ce a decis, ce a verificat și ce a reparat. Acoperă „utilizare și control” și „designul agentului”.

- **Live:** fiecare `step` ca un rând: iconița uneltei, „Observ / Fac / Pentru că”, rezultat verde sau roșu, detalii la
  click (argumente, rezultat JSON, `recipeRevisionBefore → recipeRevisionAfter`). Un pas eșuat și reparat se vede ca atare.
- **Scorul de accesibilitate** înainte și după rulare (din pașii `audit_ui`).
- **Oprește** (`cancel_run`) în timpul rulării.
- **Previzualizare:** schimbările se aplică pe pagină, iar o bară discretă arată rezumatul și „Păstrez / Anulez”.
  „Anulez” readuce rețeta la revizia dinainte de rulare.
- **Revino la original:** golește rețeta site-ului curent (și din popup).
- **Istoric:** reviziile rețetei site-ului (cine, de ce), cu „Revino aici” (`RecipeRevision`).
- **Reluare pas cu pas:** pentru o rulare terminată (`GET /api/runs/:runId`), ⏮ ◀ ▶ ⏭ arată fiecare pas și reaplică vizual
  rețeta de la revizia pasului, fără să schimbe rețeta salvată.
- **„Ce știe agentul despre mine”:** profilul pe înțeles (preferințe generale, site-uri familiare, fapte), cu „Șterge”.
- **Cifre:** câte elemente a scos rularea, scorul înainte/după, click-urile până la acțiune (pentru pitch, `12`).
