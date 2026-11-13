# Testul inițial (onboarding)

Cod: `apps/web/src/onboarding/`. Rezultatul: `OnboardingResult` → `PUT /api/profile/:userId/onboarding`.

Pornește la prima deschidere (profil fără `onboarding.completed` și fără `skipped`). Durează sub 2 minute.
Pe **fiecare** ecran există butonul **„Omite”**, mare și vizibil, care duce direct în aplicația implicită
(`skipped: true`, profil cu valori implicite). Mascota prezintă fiecare pas, într-o propoziție.

## Pașii

| # | Pas | Ce măsoară | Rezultat |
|---|---|---|---|
| 1 | „Bună! Eu sunt vulpița. Te ajut să-ți faci aplicația pe gustul tău.” | – | – |
| 2 | **Lizibilitate:** aceeași propoziție scurtă la 14, 16, 18, 20, 24, 28px. „Pe care o citești ușor, fără să te apleci?” | fontul minim comod | `needs.minFontPx` = alegerea, niciodată sub 16 |
| 3 | **Contrast:** două carduri, normal și contrast mare. „Care se vede mai bine?” | preferința de contrast | `needs.contrast` |
| 4 | **Atingere:** 5 ținte care apar pe rând, din ce în ce mai mici (72 → 40px); omul le apasă | ratări și timp | `needs.minTargetPx` = cea mai mică țintă apăsată din prima, rotunjită în sus, minim 44 |
| 5 | **Ce folosești:** carduri mari „Mesaje”, „Poze”, „Apeluri”, „Noutăți de la alții” (alegere multiplă) | sarcini frecvente | `persona.frequentTasks`, `preferences.pinnedModules` |
| 6 | **Cu ce ești obișnuit:** desene simple ale celor trei structuri (meniu lateral, meniu jos, plăci mari), fără nume de aplicații | structura familiară | `preferences.familiarLayouts`, `template` |
| 7 | **Meniul:** „Unde vrei meniul?” jos / sus / în stânga | poziția | `preferences.navPosition` |
| 8 | (opțional) **Vocea:** „Vrei să-mi vorbești în loc să scrii?” | – | `needs.prefersVoice` |
| 9 | Rezumat: „Am pregătit aplicația așa: text de 20px, butoane mari, meniul jos. Poți schimba oricând.” | – | – |

## După test

Rezultatul se trimite serverului, apoi pornește **o rulare a agentului** cu `origin: "onboarding"` și scopul
„Adaptează interfața la profilul nou”. Agentul aplică șablonul, tema și modulele, rulează auditul și arată,
cu lăbuța, cele 2–3 lucruri importante. Așa testul inițial e și primul exemplu de agent în acțiune.

## Accesibilitatea testului însuși

Testul pornește deja cu font de 20px și ținte de 56px. Se poate parcurge doar cu tastatura și cu cititor de ecran
(etichete pe toate opțiunile).
