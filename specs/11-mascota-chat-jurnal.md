# Mascota, conversația și panoul de control

Cod: `apps/web/src/mascot/`, `apps/web/src/chat/`, `apps/web/src/journal/`.

## Mascota (pui de vulpe, SVG + Framer Motion)

| Stare (`MascotState`) | Când | Animație |
|---|---|---|
| `idle` | nimic de făcut | respiră, clipește, coada se mișcă rar |
| `listening` | microfonul e pornit sau omul scrie | urechi ridicate |
| `thinking` | rulare în curs, între pași | privește în sus, „…” |
| `speaking` | `agent_message`, `say` | gura se mișcă, bula apare |
| `pointing` | `point_at` | se mută lângă element, lăbuța întinsă spre el |
| `happy` | `finish` cu succes, „Păstrez” | sare puțin |
| `confused` | eroare, `TIMEOUT`, cerere neclară | capul înclinat |

- SVG desenat de noi (corp, cap, urechi, coadă, lăbuță separate), animat cu variante Framer Motion. Fără Rive sau 3D.
- Stă în colțul de jos, nu acoperă navigația. Se poate trage în alt colț. Cu `reducedMotion`, doar schimbări statice.
- API: `mascot.setState(state)`, `mascot.say(text, ms?)`, `mascot.pointAt(elementId, message) → Promise<Rect>`
  (folosește `04-registru-si-snapshot.md`).

## Conversația

- Chat text (obligatoriu): un câmp mare, buton „Trimite” ≥ minTargetPx, istoricul mesajelor.
- Voce (bonus): butonul microfon, `webkitSpeechRecognition` cu `lang = "ro-RO"`, rezultatul intermediar afișat în câmp;
  la final se trimite automat. Dacă API-ul lipsește (alt browser decât Chrome), butonul nu apare.
- Răspunsurile vorbite (opțional): `speechSynthesis` cu o voce `ro-RO`, dacă `needs.prefersVoice`.
- `ask_user` apare ca bulă la mascotă + butoane mari cu variantele + câmp liber.

## Panoul de control (jurnal)

Panou lateral, care se poate ascunde, cu ce face agentul acum. Acoperă criteriul „utilizare și control”.

- **Live:** fiecare `step` ca un rând: iconița uneltei, „Observ / Fac / Pentru că”, rezultatul (verde / roșu),
  cu detalii la click (argumente, rezultat JSON).
- **Scorul de accesibilitate** înainte și după rulare.
- **Oprește** (`cancel_run`) în timpul rulării.
- **Propunerile:** previzualizarea se aplică pe loc, cu o bară discretă „Păstrez / Anulez” și un rezumat.
  Anulez = undo la revizia dinainte.
- **Istoric:** lista reviziilor config-ului (cine, de ce), cu „Revino aici”.
- **Reluare pas cu pas:** pentru o rulare terminată (`GET /api/runs/:runId`), butoanele ⏮ ◀ ▶ ⏭ arată fiecare pas
  și reaplică config-ul de la revizia acelui pas (doar vizual, fără să modifice config-ul real).
- **„Ce știe vulpița despre mine”:** profilul, pe înțeles, cu „Șterge”.
