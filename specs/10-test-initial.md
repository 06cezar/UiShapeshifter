# Testul inițial (onboarding)

Cod: `apps/web/src/onboarding/` (C3), servit ca **pagină a extensiei**, deschisă la instalare (E5). Rezultatul:
`OnboardingResult` → `PUT /api/profile/:userId/onboarding` (și în stocarea locală, ca să meargă fără server).

Cerința mentorilor: un test **la început**, care calibrează produsul pe om. Pornește la prima deschidere (profil fără
`onboarding.completed` și fără `skipped`), durează sub 2 minute. Pe **fiecare** ecran e butonul **„Omite”**, mare și
vizibil, care lasă profilul cu valori implicite (`skipped: true`). Pe pagina de test vorbește mascota, într-o propoziție
pe pas. Textele sunt în română, scurte.

## Pașii

| # | Pas | Ce măsoară | Rezultat |
|---|---|---|---|
| 1 | „Bună! Te ajut să-ți faci site-urile pe gustul tău.” | – | – |
| 2 | **Lizibilitate:** aceeași propoziție la 14, 16, 18, 20, 24, 28px. „Pe care o citești ușor, fără să te apleci?” | fontul minim comod | `needs.minFontPx` = alegerea, niciodată sub 16 |
| 3 | **Contrast:** două carduri, normal și contrast mare. „Care se vede mai bine?” | contrastul preferat | `needs.contrast` |
| 4 | **Atingere:** 5 ținte care apar pe rând, din ce în ce mai mici (72 → 40px); omul le apasă | ratări și timp | `needs.minTargetPx` = cea mai mică țintă apăsată din prima, rotunjită în sus, minim 44 |
| 5 | **Ce te deranjează pe site-uri?** (alegere multiplă, cu desene și text): rezumate AI, clipuri scurte, Stories, bannere și promoții, aglomerație, ferestre care apar, redare automată | preferințe generale | `OnboardingResult.dislikes` → `generalPreferences` (`PreferenceCategory`) |
| 6 | **Ce site-uri cunoști bine?** O listă de site-uri populare (în demo: cele alese pentru demo) și un câmp „altul”; fără logo-uri, doar nume | site-uri familiare | `OnboardingResult.familiarSites` → `familiarSites` |
| 7 | **Cât de obișnuit ești cu calculatorul?** puțin / mediu / mult | confort | `persona.techComfort` |
| 8 | (opțional) **Vocea:** „Vrei să-mi vorbești în loc să scrii?” | – | `needs.prefersVoice` |
| 9 | Rezumat: „Am pregătit așa: text de 20px, butoane mari, fără rezumate AI. Poți schimba oricând.” | – | – |

Pașii 5–7 sunt cei noi față de versiunea pentru aplicația veche; „ce folosești” și „structura familiară” au căzut,
fiindcă acum structura o aduce un site pe care omul îl cunoaște deja (pasul 6).

## După test

1. Rezultatul se salvează local și pe server, iar serverul îl transformă în profil (`dislikes` → `generalPreferences`
   cu `source: "onboarding"`, `familiarSites`).
2. **Preferințele de bază** (font, contrast, ținte) se aplică imediat, **pe orice site**, fără AI (`07`, C4).
3. Pe fiecare site nou, mascota propune singură preferințele generale (`general-preferences`, `09`).
4. Nu pornește nicio rulare a agentului de la test: primul exemplu de agent în acțiune e prima cerere a omului.

## Accesibilitatea testului însuși

Testul pornește deja cu font de 20px și ținte de 56px. Se poate parcurge doar cu tastatura și cu cititor de ecran
(etichete pe toate opțiunile). „Omite” e primul element care primește focusul.
