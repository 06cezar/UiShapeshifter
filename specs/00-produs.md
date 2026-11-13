# UI Shapeshifter: produsul

> „Orice site se schimbă după tine, nu tu după el.”

UiPath Future Forward Hackathon 2026, tema **Agents in Action**. Fereastra: **vineri 13 nov. 14:00 → sâmbătă 14 nov. 14:00**.
Commit-urile de după 14:00 sâmbătă nu contează. Livrăm pe Slack (`#uipath-hackathon-future-forward-2026`): link la repo,
descriere de o pagină cu cel puțin un screenshot, pitch de 5 minute și demo (live sau înregistrat) de cel mult 5 minute.

**Direcția s-a schimbat vineri la 17:00** (vezi `DECISIONS.md`): nu mai construim o aplicație a noastră care se adaptează,
ci o **extensie care reface interfața site-urilor existente**. Ideea principală e **schimbarea de UI (de DOM)** după ce
vrea omul. Accesibilitatea rămâne o parte din ce știe să facă, nu tot produsul.

## Ce e

O extensie de browser (Chrome) cu un agent AI. Pe orice site, omul îi spune agentului ce vrea, iar agentul modifică
pagina: scoate, ajustează, adaugă, reface. Modificările se salvează pe site și se reaplică la fiecare vizită.

## Pentru cine

**Pentru oricine**, nu pentru un grup anume. Produsul se mulează pe om din testul inițial și din cereri. Exemple:

- „Nu-mi plac clipurile scurte.” → butoanele și rafturile de Shorts dispar de pe site-ul de video și rămân dispărute.
- „Nu vreau AI în site-uri.” → rezumatele și butoanele AI dispar din căutare și de oriunde le mai întâlnește.
- „E prima dată când intru aici și nu mă descurc.” → pagina rămâne doar cu ce îi trebuie, cu pașii arătați de mascotă.
- „Sunt obișnuit cu alt site.” → meniul și structura se așază cum îi sunt familiare.
- „Văd greu.” → font minim, contrast și butoane mari, pe orice site.

## Ce fel de schimbări face

| Nivel | Ce | Exemple | Prioritate |
|---|---|---|---|
| 1. **Scoate** | ascunde elemente și funcții | Shorts, butoane și rezumate AI, bannere, coloane de umplutură | P0 |
| 2. **Ajustează** | schimbă aspectul a ce rămâne | font minim, contrast, ținte mai mari, spațiere | P0 |
| 3. **Adaugă** | elemente generate la cerere, din catalog, legate de elementele reale ale site-ului | placa „Plătește factura”, o scurtătură fixă spre coș | P0 |
| 4. **Reface** | mută, restructurează și restilizează liber | „fă-l să arate ca site-ul cu care sunt obișnuit”, meniul în altă parte, o pagină simplă făcută din ce contează | P1 („wow”) |

Cât de departe merge depinde de cerere: „scoate Shorts” e nivelul 1; „fă-l simplu, nu m-am descurcat niciodată aici”
ajunge la nivelul 4. Agentul nu alege dintr-o listă fixă de aranjamente: scrie CSS și HTML pentru pagina din fața lui
(validate, fără JavaScript; vezi `01-arhitectura.md`). Asemănarea cu un alt site e de structură și stil, nu o copie.

**Limită tehnică:** o extensie schimbă **paginile web**, nu interfața browserului. Rezumatele și „modul AI” din pagina
de căutare se pot scoate; butoanele din bara browserului, nu.

## Cum află ce vrea omul

1. **Testul inițial**, la instalare: ce text citește comod, cât de mari îi trebuie butoanele, ce site-uri cunoaște bine,
   ce îl deranjează (AI, clipuri scurte, aglomerație), cât de obișnuit e cu calculatorul. „Omite” pe fiecare ecran.
2. **Cererile** către agent: chat scris și voce, din bula mascotei, peste orice site.
3. **Profilul** (memorie tip ICP): nevoi, preferințe, ce site-uri îi sunt familiare și **preferințe generale** care
   se aplică peste tot („fără AI”, „text de cel puțin 20px”). Pe un site nou, agentul le propune singur.
4. **Semnalele de utilizare**: click-uri ratate, zoom, întoarceri repetate, ce folosește des → agentul pornește singur.

## Salvare și conturi

- Ce a schimbat agentul pe un site devine o **rețetă a site-ului**: o listă de operații (ascunde, stilizează, mută,
  adaugă). La următoarea vizită, extensia o reaplică **fără AI**, înainte să se vadă pagina. Rezistă la reîncărcare.
- **Fără cont:** profilul și rețetele stau pe dispozitiv (stocarea extensiei).
- **Cu cont** (opțional): aceleași date se sincronizează pe server; pe alt dispozitiv, după login, preferințele apar.
- „Revino la original” pentru orice site, oricând.

## Ce ne-au cerut mentorii (după discuție)

| Cerință | Ce înseamnă la noi | Prioritate | Unde |
|---|---|---|---|
| **Test inițial la început** | Pagină deschisă la instalare: lizibilitate, atingere, familiaritate, ce te deranjează; „Omite” vizibil | P0 | `10-test-initial.md` |
| **Modificarea UI-ului ≫ accesibilitate** | Ideea principală e refacerea UI-ului după om; accesibilitatea e unul dintre lucrurile pe care le face, cu limite pe care nu le încalcă | P0 | `02`, `07` |
| **Generare de elemente DOM la cerere** | Agentul adaugă în pagina site-ului elemente noi (HTML curățat sau componente din catalog), legate de elementele reale; nu rulează JavaScript generat | P0 | `03-componente-generate.md` |
| **Cât mai seamless** | Fără reîncărcare, schimbări animate, rețeta reaplicată înainte să se vadă pagina, „Anulez” oricând | P0 | `02`, `11` |
| **Partea de vorbit cu agentul** | Chat text + voce (Web Speech API), mascota răspunde în bulă, peste orice site | P0 | `11-mascota-chat-jurnal.md` |
| **Memorie pentru profil, ca un ICP** | Profil persistent, pe dispozitiv și (cu cont) pe server; preferințe generale care trec de la un site la altul | P0 | `08-profil-si-memorie.md` |
| **Să facă automat după ce folosești mai mult** | Semnale → reguli fără AI → agentul pornește singur; preferințele generale propuse pe site-uri noi | P1 | `09-semnale-si-adaptare.md` |
| **Criteriu de accesibilitate: fonturile minime** | Font minim din profil, aplicat pe orice site, fără AI și peste orice a scris agentul; auditul de după fiecare schimbare prinde ce cade sub `HARD_LIMITS` | P0 | `07-accesibilitate.md` |

### Accentele din discuția cu mentorii (cele mai importante)

- **Aplicații complexe, tip Jira:** agentul scoate boilerplate-ul și lasă doar ce folosește omul, deci aplicația e mai
  ușor de folosit și omul e mai rapid. E cazul-vedetă pentru „valoare pentru utilizator”: demo-ul îl arată pe site-ul
  nostru de test cu aspect de aplicație densă (date de test), cu cifre înainte/după (elemente scoase, click-uri până la
  o acțiune). Fraza de pitch: „pe aplicațiile pe care le folosești zilnic, agentul păstrează doar ce folosești tu”.
- **Mai multe site-uri, un singur profil:** preferințele generale și profilul trec de la un site la altul. Se arată
  explicit în demo: o preferință spusă pe un site apare propusă pe alt site.
- **Stories:** exemplul unui mentor: scos „Stories” de pe Instagram. E un caz de nivelul 1 („Scoate”), la fel ca Shorts.
- **Pe mobil:** un mentor ar vrea extensia și pe telefon. Chrome pe Android nu rulează extensii, deci acum rămâne în
  afara scopului (vezi mai jos); în pitch o spunem ca direcție viitoare, nu ca funcție.

## Cum bifăm criteriile de jurizare (100 de puncte)

| Criteriu | Puncte | Cum |
|---|---|---|
| Rezultat care merge | 30 | Scenariul demo merge cap-coadă pe site-uri reale și pe site-ul nostru de test; rezultatul se inspectează: pagina înainte/după, rețeta salvată, jurnalul pașilor |
| Valoare pentru utilizator | 25 | Cifre măsurate: câte elemente a scos, câte click-uri până la o acțiune înainte/după, scorul de audit înainte/după |
| Designul agentului | 20 | Bucla observă–decide–acționează–verifică pe un DOM pe care nu-l controlăm; tratează: element negăsit, operație refuzată de limite, pagina care se schimbă singură, cerere neclară (`ask_user`) |
| Originalitate | 15 | Reface site-uri existente, nu doar le tematizează; rețete reaplicate fără AI; elemente generate legate de cele reale; profil care trece între site-uri |
| Utilizare și control | 10 | Pași live, previzualizare cu Păstrez/Anulez, „Revino la original”, oprire oricând, reluarea unei rulări |

## De ce agent, nu program fix sau un singur apel LLM

- Un **program fix** (liste de filtre, stiluri scrise de mână) merge doar pe site-urile pentru care a scris cineva reguli.
  Agentul citește pagina din fața lui și găsește singur ce înseamnă „Shorts” sau „funcții AI” acolo.
- Un **singur apel LLM** nu vede rezultatul: nu află că a ascuns și butonul de căutare sau că pagina a rămas goală.
  Agentul verifică după fiecare schimbare (snapshot nou, audit) și repară.
- **Se vede și rămâne în jurnal:** ca să nu pară un filtru CSS, în demo bucla rulează pe ecran, pas cu pas, în panou
  (cu cel puțin un eșec reparat, de exemplu un audit picat care duce la o corecție), iar aceiași pași sunt înregistrați în
  jurnalul rulării și se pot reda ulterior. Ecranul e pentru juriu, jurnalul e dovada inspectabilă.
- **AI doar la decizie:** odată găsită, rețeta se reaplică fără model, deci repede și fără cost la fiecare vizită.

## Cum construim: din aproape în aproape

Nu construim tot și integrăm la sfârșit. Construim în etape, iar fiecare etapă se termină cu un **punct de control**:
echipa încarcă extensia și vede că merge cap-coadă. Abia apoi începe etapa următoare (`dag/tasks.yaml`, M0–M4).

| Etapa | Până la | Ce vedem la punctul de control |
|---|---|---|
| 0. **Se vede** | vin 19:30 | extensia apare pe orice site și un mesaj de probă ajunge la server și înapoi |
| 1. **Ascunde și ține minte** | vin 22:00 | scriu „ascunde X”, dispare, rămâne dispărut după reîncărcare; „Revino la original” îl aduce înapoi |
| 2. **Schimbă structura și arată** | sâm 01:00 | „mută X sus” merge și rămâne; mascota merge la element; pașii se văd; „Anulez” readuce pagina |
| 3. **Te cunoaște și adaugă** | sâm 03:30 | instalare → test inițial → profil; un site nou are fontul minim fără AI; o scurtătură generată merge; cererea vorbită merge |
| 4. **Wow** | sâm 06:30 | „fă-l să arate ca site-ul X”; propunere automată după click-uri ratate; preferințele apar pe alt dispozitiv după login |
| 5. **Integrare și demo** | sâm 09:00 | scenariul de demo merge de 3 ori la rând |

După fiecare punct de control avem un produs care merge și se poate arăta. Dacă o etapă întârzie, se taie din etapele
de la coadă, nu din cea curentă: cu etapele 1–3 gata, demo-ul există și fără „wow”.

## Schița de demo (se rescrie în `12-demo.md`, taskul D8)

1. Instalare → testul inițial → profilul.
2. Site de video: „nu vreau Shorts” → dispar; reîncărcare → tot dispărute, fără AI.
3. Căutare: „scoate tot ce e AI” → dispar rezumatele; preferința devine generală și e propusă pe alt site.
4. Site necunoscut și aglomerat (site-ul nostru de test): „vreau doar să plătesc factura” → pagina refăcută, mascota
   merge până la buton.
5. Fără cerere: click-uri ratate → „Măresc butoanele?” → Păstrez.
6. Login pe alt profil de browser → preferințele apar. Panoul de control: pași, Anulez, „Revino la original”.

Demo-ul live pe site-uri reale depinde de internet și de structura lor din ziua aceea. De aceea avem un **site de test
al nostru** (aglomerat intenționat, cu date de test) și un **video de rezervă**.

## În afara scopului (nu facem)

Interfața browserului (în afara paginilor), aplicații mobile native, alte browsere decât Chrome, blocarea reclamelor la
nivel de rețea, ocolirea plăților sau a autentificării, modele locale. Interfața **noastră** (mascota, chatul, panoul,
elementele generate) nu copiază nume, logo-uri sau culori ale altor produse. Pe site-ul nostru de test și în capturile
de ecran folosim doar date de test.
