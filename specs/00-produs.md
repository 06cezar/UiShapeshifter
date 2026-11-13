# UI Shapeshifter: produsul

> „Aplicația care se schimbă după tine, nu tu după ea.”

UiPath Future Forward Hackathon 2026, tema **Agents in Action**. Fereastra: **vineri 13 nov. 14:00 → sâmbătă 14 nov. 14:00**.
Commit-urile de după 14:00 sâmbătă nu contează. Livrăm pe Slack (`#uipath-hackathon-future-forward-2026`): link la repo,
descriere de o pagină cu cel puțin un screenshot, pitch de 5 minute și demo (live sau înregistrat) de cel mult 5 minute.

## Utilizatorul

**Maria, 72 de ani**, vede greu, apasă des pe lângă butoane, folosește telefonul ca să vorbească cu nepoata Ana și să vadă
poze de la familie. Aplicația de demo e o aplicație de **mesaje, poze, contacte și apeluri**, cu date de test.

## Ce face agentul

Un agent, reprezentat de o mascotă (pui de vulpe), îl ajută pe utilizator să-și atingă un **scop** în interfață, în mai mulți
pași: observă interfața randată, decide, acționează printr-o unealtă, verifică rezultatul și repetă. Exemple de scopuri:

- „Fă-mi aplicația ușoară, văd greu și folosesc doar mesajele și pozele.”
- „Vreau să o sun pe Ana mai repede.” → generează o placă mare „Sună-o pe Ana” pe ecranul principal.
- „Arată-mi cum îi trimit o poză Anei.” → ghidaj pas cu pas, cu lăbuța, care se adaptează când omul greșește.
- (fără cerere) Maria a ratat de 4 ori butonul „Trimite” → agentul propune singur butoane mai mari.

## Ce ne-au cerut juriul și mentorii (după discuție)

| Cerință | Ce înseamnă la noi | Prioritate | Unde |
|---|---|---|---|
| **Test inițial la început** | Onboarding cu test de lizibilitate (fontul minim pe care îl citește comod), test de atingere (mărimea țintelor), preferințe; „Omite” vizibil | P0 | `10-test-initial.md` |
| **Modificarea UI-ului ≫ accesibilitate** | Accesibilitatea e criteriul principal al oricărei schimbări: agentul nu poate face nimic care o strică (limite tari + audit după fiecare schimbare) | P0 | `07-accesibilitate.md` |
| **Generare de elemente DOM la cerere** | Agentul compune elemente noi (plăci, scurtături, liste, mini-funcții) dintr-un catalog sigur, nu HTML liber | P0 | `03-componente-generate.md` |
| **Cât mai seamless** | Schimbări animate, fără reîncărcare; propuneri discrete prin mascotă; „Anulez” oricând; fără ferestre care întrerup | P1 | `11-mascota-chat-jurnal.md` |
| **Partea de vorbit cu agentul** | Chat text (obligatoriu) + voce (Web Speech API, Chrome), mascota răspunde în bulă | P0 | `11-mascota-chat-jurnal.md` |
| **Memorie pentru profilul utilizatorului, ca un ICP** | Profil persistent: nevoi, preferințe, persona (cine e, ce face des, cu cine vorbește), fapte învățate cu dovezi | P0 | `08-profil-si-memorie.md` |
| **Să facă automat după ce folosești mai mult** | Semnale de utilizare → reguli fără AI → agentul pornește singur cu un scop; după încredere câștigată aplică singur schimbările mici | P1 | `09-semnale-si-adaptare.md` |
| **Criteriu de accesibilitate: fonturile minime** | Font minim global 16px, ridicat de profil (ex. 20px pentru Maria); nicio schimbare nu trece sub el | P0 | `07-accesibilitate.md` |

## Cum bifăm criteriile de jurizare (100 de puncte)

| Criteriu | Puncte | Cum |
|---|---|---|
| Rezultat care merge | 30 | Scenariul din `12-demo.md` merge cap-coadă; rezultatul se inspectează: interfața nouă, raportul de audit înainte/după, jurnalul pașilor |
| Valoare pentru utilizator | 25 | Maria, cu cifre: scor de accesibilitate 54 → 96, click-uri pentru „sună-o pe Ana” 4 → 1, ratări de click 4 → 0 |
| Designul agentului | 20 | Bucla observă–decide–acționează–verifică; tratează: patch refuzat de limite, element ascuns, click greșit al omului, informație lipsă (ask_user), unealtă care nu răspunde |
| Originalitate | 15 | Elemente generate la cerere dintr-un catalog sigur + adaptare din semnale de utilizare + mascota care arată cu lăbuța |
| Utilizare și control | 10 | Panou jurnal live, previzualizare cu Păstrez/Anulez, istoricul schimbărilor, oprire oricând, reluarea unei rulări pas cu pas |

## De ce agent, nu program fix sau un singur apel LLM

- Un **program fix** nu știe ce înseamnă „ușor” pentru Maria: depinde de profilul ei și de ce e pe ecran acum.
- Un **singur apel LLM** nu vede rezultatul: nu află că fontul nou a tăiat textul sau că butonul a ieșit din ecran.
  Agentul nostru rulează auditul după fiecare schimbare și repară ce a stricat.
- În **ghidaj**, următorul pas depinde de ce a apăsat omul: dacă a apăsat greșit, agentul observă și reorientează.

## În afara scopului (nu facem)

Aplicații reale terțe (Facebook, WhatsApp etc.), conturi reale, apeluri sau mesaje reale, aplicație mobilă nativă,
modele locale. Șabloanele de structură nu copiază culori, logo-uri sau nume de aplicații.
