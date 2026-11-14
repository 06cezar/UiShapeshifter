# UI Shapeshifter

**Orice site se schimbă după tine, nu tu după el.**
UiPath Future Forward Hackathon 2026 · Agents in Action

## Problema

Site-urile sunt făcute pentru toată lumea, deci pentru nimeni anume. În aplicațiile dense (facturi, tichete, CRM),
butonul de care ai nevoie e îngropat sub meniuri și bannere. Unii nu vor clipuri scurte sau rezumate AI și nu le pot
scoate. Alții văd greu, nimeresc greu butoanele sau sunt obișnuiți cu alt site. Azi omul se adaptează la site.

## Soluția

O extensie Chrome cu un agent AI care reface interfața site-urilor pe care le folosești deja, după ce îi spui, scris sau
vorbit, în română:

- **Scoate:** „nu vreau Shorts”: ascunde elemente și funcții.
- **Ajustează:** „fă textul mai mare”: font, contrast, butoane, fundal.
- **Adaugă:** „pune butonul de plată sus”: elemente noi, legate de butoanele reale.
- **Reface:** „fă-l să arate ca site-ul cu care sunt obișnuit”: mută și restilizează liber.

Schimbarea se salvează ca **rețeta site-ului** și se reaplică la fiecare vizită **fără AI**: repede și fără cost.
O mascotă (un raton) îți arată unde să apeși.

**Cazul principal:** pe aplicațiile folosite zilnic, „vreau doar să plătesc factura” lasă pagina doar cu ce contează,
cu butonul de plată sus.

## De ce e agent, nu filtru CSS

Lucrează în buclă pe o pagină pe care n-o controlăm: **observă** (snapshot-ul paginii), **decide** ce înseamnă cererea
acolo, **acționează** (CSS și operații pe DOM), **verifică** (snapshot nou și audit de accesibilitate) și **repară** ce a
ieșit prost. Fiecare pas apare în panou cât rulează și rămâne în jurnalul rulării. AI-ul e folosit doar la decizie.

## Se mulează pe om

Testul inițial la instalare (cu „Omite” pe fiecare ecran), cererile scrise sau vorbite, un profil care te urmează de la
un site la altul și adaptarea automată: după câteva click-uri ratate, propune butoane mai mari. Fără cont, totul rămâne
pe dispozitiv; cu cont, preferințele apar și pe alt calculator.

## Control și siguranță

- **Nu rulează cod:** scrie doar CSS și HTML validate. Excepția e Modul expert: oprit implicit, vezi codul și apeși tu
  „Rulează”.
- **Ascultă doar de tine:** textul site-ului e doar informație; o preferință nouă intră în profil doar cu cuvintele tale.
- **Limite tari:** font minim 16px, butoane de cel puțin 44px, contrast WCAG; auditul rulează după fiecare schimbare.
- **Tu decizi:** pași live, Oprește, Păstrez sau Anulez, și „Revino la original” pe orice site.

## Măsurat, nu estimat

- Eșecul reparat live: **3 din 3** rulări (auditul găsește butonul tăiat, agentul repară, auditul iese curat; 26–40 s).
- Texte sub fontul minim, fără AI: **7220 → 171** pe Wikipedia, 296 → 49 pe Google.
- **21 din 23** de cereri reușite pe modelul real, timp median 22 s.

## Modelul de afaceri

Gratuit pentru om, local și fără cont. **Pro:** sincronizarea pe toate dispozitivele și Modul expert. **Echipe:** aceeași
interfață curățată pentru toți angajații care lucrează zilnic în Jira sau într-un CRM. Nu blocăm reclamele pentru toată
lumea și nu schimbăm nimic pe serverele site-ului: fiecare om își aranjează propria pagină, în browserul lui.

## Ce urmează

Un consilier anti-înșelătorii care marchează pe pagină ofertele suspecte, cu sursele găsite; drumul spre telefon;
rețete pregătite o dată pentru o echipă întreagă.

## Echipa

Cinci oameni, fiecare cu agentul lui Claude: Mihnea (bucla agentului), Ștefan R. (motorul care schimbă pagina),
Adelin (validarea și accesibilitatea), Cezar (contractele, chatul, vocea, mascota, panoul, integrarea), Iulia (extensia,
profilul, adaptarea, conturile). Agenții și-au scris mesaje și un bot a ținut la zi graful de taskuri, din etapă în etapă.

Mascota: raton de null-painter-error, CC-BY 4.0.
