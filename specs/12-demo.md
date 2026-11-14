# Scenariul demo (cel mult 5 minute)

Scris acum ca să construim spre el; se ajustează la punctele de control. Fiecare pas trebuie să meargă și **înregistrat**
(rezervă), și **live**. Pe site-ul nostru de test și în capturi: doar date de test, fără persoane reale.

**Ideea de spus în primele 20 de secunde:** „Pe aplicațiile pe care le folosești zilnic, agentul păstrează doar ce folosești
tu.” Fiecare pas arată bucla agentului (observă, decide, acționează, verifică, repară) **în panou, pe ecran**, nu doar
rezultatul, și cel puțin un pas arată un **eșec reparat**.

| # | Timp | Ce se vede | Ce demonstrează |
|---|---|---|---|
| 1 | 0:00–0:40 | **Instalare și test inițial:** ce citești comod, ce site-uri cunoști; la „Ce te deranjează” **nu bifăm** rezumatele AI și clipurile scurte (altfel le ascunde deja testul și pașii 2–3 nu mai arată agentul, D5 al lui B). „Omite” e vizibil. Profil gata; fontul minim se aplică deja pe orice site, fără AI | test inițial, profil, preferințe de bază |
| 2 | 0:40–1:30 | **Scoate:** pe un site de video, „nu vreau Shorts” (și Stories) → agentul vede pagina, ascunde, verifică (un snapshot nou), repară ce a scăpat; reîncarci → tot dispărute, **fără AI**, fără clipire; „Revino la original” le aduce înapoi | agent cu verificare, rețetă reaplicată, control |
| 3 | 1:30–2:20 | **Un profil, mai multe site-uri:** pe un motor de căutare, „scoate tot ce e AI **de pe toate site-urile**” (sau „peste tot”; fără mențiune, schimbarea rămâne doar pe site-ul ăsta) → rezumatele dispar; devine preferință generală; pe un **alt site** mascota propune singură aceeași preferință | profil care trece între site-uri |
| 4 | 2:20–3:30 | **Aplicația densă (cazul-vedetă):** pe site-ul nostru de test cu aspect de aplicație complexă, aglomerată intenționat: „vreau doar să plătesc factura” → agentul scoate boilerplate-ul, mută și adaugă o scurtătură legată de butonul real; auditul găsește o țintă prea mică, agentul **repară**; mascota merge până la buton. Cifre: elemente scoase, click-uri până la plată înainte/după | schimbare de UI, structură, elemente generate, valoare |
| 5 | 3:30–4:10 | **Reface:** „fă-l să arate ca site-ul cu care sunt obișnuit” pe perechea aleasă pentru demo → așezare și stil noi, pagina rămâne folosibilă (se taie primul dacă etapa 4 întârzie) | restructurare |
| 6 | 4:10–4:40 | **Automat:** ratezi de 2–3 ori un buton (`ADAPT_DEMO=1`) → mascota: „Le măresc?” → Păstrez; profilul are un fapt nou, cu dovezi | adaptare automată, memorie |
| 7 | 4:40–5:00 | **Control și cont:** panoul cu pașii, reluarea pas cu pas, „Anulez”; login pe alt profil de browser → preferințele apar | transparență, sincronizare |

Dacă timpul nu ajunge, pașii 5 și 7 se taie; 1–4 și 6 rămân. Cu etapele 1–3 gata, demo-ul există și fără „wow”.

## Bonus amuzant: „stalk-ul” pe propriul profil (opțional)

Deschidere relaxantă sau încălzire, nu pas obligatoriu (se taie primul dacă timpul e scurt). **Pe contul propriu al unuia
din echipă, logat, cu consimțământul lui** — nu pe un profil străin, nu cu date de altcineva. Pe pagina unui profil real
de Facebook (al colegului), cererea: *„adună sus, într-un card, tot ce scrie pagina asta despre mine”* (varianta de râs:
*„sunt single?”*).

- Agentul vede pagina, găsește câmpurile **deja vizibile pe profilul curent** (stare relație, oraș, locul de muncă, contact
  din „Despre”) și le `move`/`wrap`/`insertHtml` într-un card lizibil în capul paginii. Pașii apar în panou: observă, decide,
  acționează, verifică. „Anulez” readuce pagina.
- **Ce NU face, și spui asta cu voce tare:** nu citește de pe alte site-uri, nu traversează conturi, nu scoate nimic ascuns
  în pagină, nu rulează cod. Rearanjează doar ce ochiul tău vede deja pe pagina pe care ești, și doar fiindcă tu ai cerut.
  Aceeași poveste de siguranță ca „nu rulează JavaScript”: agentul lucrează pe pagina ta, nu adună date despre oameni.

De ce prinde: e relatabil și amuzant, dar exact prin asta arată limita — „doar ce e pe pagina ta, doar la cererea ta”.
Dacă un jurat întreabă *„deci îmi poate strânge datele de pe FB și Insta?”*, răspunsul e scurt: nu, mută doar ce e pe pagina
pe care te uiți; un agregator peste site-uri n-am construit intenționat.

## Eșecul reparat (sigur, nu la noroc)

Din jurnalele de probă (A, 23+ rulări): live, un eșec reparat apare doar uneori (Shorts 1/3, pasul 4 1/8). Juriul trebuie
să vadă cel puțin unul, deci îl pregătim pe **site-ul de test**, cu o cutie strâmtă, ca pe multe site-uri reale:

- La pasul 4, pe site-ul de test, secțiunea Facturi (`#facturi`), unde agentul pune scurtătura „Plătește factura”
  (A, 3/3 rulări), are înălțimea fixă exact cât conținutul și `overflow: hidden`. Butonul nou iese tăiat: `audit_ui` îl raportează ca problemă nouă (`clipped`, `introduced`).
  Preferințele de bază (C4) nu repară tăierile, deci se întâmplă de fiecare dată.
- Agentul repară cu CSS (ex. `height: auto` pe secțiune) și verifică din nou cu `audit_ui`. În panou: auditul care a găsit
  tăierea, reparația, auditul curat (propunerea lui C, 14 nov.).
- Live, dacă apare și un eșec natural (selector negăsit, operație sărită), îl arătăm pe acela; cazul pregătit rămâne
  rezerva sigură. Videoul de rezervă îl conține.

**Decizia de la 07:20 (D, după probele lui A pe main):** niciun caz nu iese sigur live (`#facturi` strâmt 1/3, antet
strâmt + „pune butonul în antet” 2/3). La demo cerem **„Vreau doar să plătesc factura; pune butonul sus, în antet”**
(2/3), iar dacă reparația nu apare live, o arătăm din **videoul de rezervă** (E4), înregistrat cu o rulare în care apare.
**07:25:** cu #115 (tăierea din cutia în care a pus agentul e „introduced”), A: 3/3 live: auditul găsește tăierea →
agentul repară → audit 0 → Păstrez, 26–40 s. Videoul rămâne doar rezervă.

## Ce pregătim

- **Site-ul de test** (E7): aglomerat intenționat, cu aspect de aplicație densă, un „plătește factura” îngropat, date de test.
- Site-uri reale alese pentru pașii 2, 3 și 5, verificate în ziua demo-ului (internetul și structura lor pot varia).
- Un buton „Resetează demo-ul” (profiluri, rețete, rulări) și `AGENT_FAKE=1` ca rezervă fără rețea.
- Videoul de rezervă, înregistrat până sâmbătă la 11:00.
- **Cifre măsurate, nu inventate:** elemente scoase, click-uri până la o acțiune înainte/după, scorul de audit înainte/după,
  ratările de click înainte/după.
- **Pitch:** problemă (site-uri făcute pentru toți, nu pentru tine), soluție, demo, impact. Monetizarea e un singur slide
  (sincronizare pe cont, Modul expert, planuri pentru echipe). Reclamele nu le „blocăm”: curățăm pagina după preferințele
  omului. Mobilul e direcție viitoare (Chrome pe Android nu rulează extensii).
- **La „e un plugin care face orice?”:** „Face aproape orice îi ceri pe pagină, implicit fără cod, numai cu operații pe
  care le verificăm, și ascultă doar de tine, nu de ce scrie pe site.” Două limite: operațiile validate (`specs/01`; codul
  doar în Modul expert, cu aprobarea omului) și cine poate cere (doar omul; o preferință generală nouă intră doar cu citat
  din cererea lui, #132, #140).

### Frazele pentru întrebările juriului (din notițele de la mentori și juriu)

- **Legal / reclamele:** „Nu blocăm reclamele pentru toată lumea și nu schimbăm nimic pe serverele site-ului. Fiecare om
  își aranjează propria pagină, în browserul lui, cum face deja cu zoom-ul sau cu un cititor de ecran. Nu copiem și nu
  republicăm nimic din site, iar rețeta rămâne a omului.”
- **Monetizarea:** „Pentru om e gratuit, local și fără cont. Plătești pentru sincronizarea pe toate dispozitivele, pentru
  Modul expert și pentru echipe: o firmă care lucrează zilnic în Jira sau într-un CRM dă tuturor angajaților aceeași
  interfață curățată.”
- **JavaScript / Modul expert:** „Implicit, agentul nu rulează cod: scrie CSS și HTML pe care le verificăm, așa că nu
  poate strica pagina. Pentru ce nu se poate face așa există Modul expert, oprit până îl pornești tu. Agentul îți arată ce
  vrea să facă și codul exact, iar codul rulează doar când apeși «Rulează». Modelul are deja limitele lui de siguranță.
  Peste ele punem una a noastră: codul care trimite date afară sau citește cookie-urile ori datele salvate de site e oprit
  înainte să ajungă la tine.”
  Doar dacă `x-mod-js` e unit pe `main` (DECISIONS.md, 14 nov. 11:45). În demo arătăm fereastra de aprobare cu codul la
  vedere. Spunem cinstit: codul rulat nu intră în rețetă, nu se reaplică la reîncărcare și „Anulez” nu îl dă înapoi.
  Altfel, Modul expert e direcție viitoare, la fel ca mobilul.
