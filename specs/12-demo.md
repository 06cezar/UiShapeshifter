# Scenariul demo (cel mult 5 minute)

Scris acum ca să construim spre el; se ajustează la punctele de control. Fiecare pas trebuie să meargă și **înregistrat**
(rezervă), și **live**. Pe site-ul nostru de test și în capturi: doar date de test, fără persoane reale.

**Ideea de spus în primele 20 de secunde:** „Pe aplicațiile pe care le folosești zilnic, agentul păstrează doar ce folosești
tu.” Fiecare pas arată bucla agentului (observă, decide, acționează, verifică, repară) **în panou, pe ecran**, nu doar
rezultatul, și cel puțin un pas arată un **eșec reparat**.

| # | Timp | Ce se vede | Ce demonstrează |
|---|---|---|---|
| 1 | 0:00–0:40 | **Instalare și test inițial:** ce citești comod, ce te deranjează (rezumate AI, clipuri scurte), ce site-uri cunoști. „Omite” e vizibil. Profil gata; fontul minim se aplică deja pe orice site, fără AI | test inițial, profil, preferințe de bază |
| 2 | 0:40–1:30 | **Scoate:** pe un site de video, „nu vreau Shorts” (și Stories) → agentul vede pagina, ascunde, verifică (un snapshot nou), repară ce a scăpat; reîncarci → tot dispărute, **fără AI**, fără clipire; „Revino la original” le aduce înapoi | agent cu verificare, rețetă reaplicată, control |
| 3 | 1:30–2:20 | **Un profil, mai multe site-uri:** pe un motor de căutare, „scoate tot ce e AI **de pe toate site-urile**” (sau „peste tot”; fără mențiune, schimbarea rămâne doar pe site-ul ăsta) → rezumatele dispar; devine preferință generală; pe un **alt site** mascota propune singură aceeași preferință | profil care trece între site-uri |
| 4 | 2:20–3:30 | **Aplicația densă (cazul-vedetă):** pe site-ul nostru de test cu aspect de aplicație complexă, aglomerată intenționat: „vreau doar să plătesc factura” → agentul scoate boilerplate-ul, mută și adaugă o scurtătură legată de butonul real; auditul găsește o țintă prea mică, agentul **repară**; mascota merge până la buton. Cifre: elemente scoase, click-uri până la plată înainte/după | schimbare de UI, structură, elemente generate, valoare |
| 5 | 3:30–4:10 | **Reface:** „fă-l să arate ca site-ul cu care sunt obișnuit” pe perechea aleasă pentru demo → așezare și stil noi, pagina rămâne folosibilă (se taie primul dacă etapa 4 întârzie) | restructurare |
| 6 | 4:10–4:40 | **Automat:** ratezi de 2–3 ori un buton (`ADAPT_DEMO=1`) → mascota: „Le măresc?” → Păstrez; profilul are un fapt nou, cu dovezi | adaptare automată, memorie |
| 7 | 4:40–5:00 | **Control și cont:** panoul cu pașii, reluarea pas cu pas, „Anulez”; login pe alt profil de browser → preferințele apar | transparență, sincronizare |

Dacă timpul nu ajunge, pașii 5 și 7 se taie; 1–4 și 6 rămân. Cu etapele 1–3 gata, demo-ul există și fără „wow”.

## Ce pregătim

- **Site-ul de test** (E7): aglomerat intenționat, cu aspect de aplicație densă, un „plătește factura” îngropat, date de test.
- Site-uri reale alese pentru pașii 2, 3 și 5, verificate în ziua demo-ului (internetul și structura lor pot varia).
- Un buton „Resetează demo-ul” (profiluri, rețete, rulări) și `AGENT_FAKE=1` ca rezervă fără rețea.
- Videoul de rezervă, înregistrat până sâmbătă la 11:00.
- **Cifre măsurate, nu inventate:** elemente scoase, click-uri până la o acțiune înainte/după, scorul de audit înainte/după,
  ratările de click înainte/după.
- **Pitch:** problemă (site-uri făcute pentru toți, nu pentru tine), soluție, demo, impact. Monetizarea e un singur slide
  (sincronizare pe cont, planuri pentru echipe). Reclamele nu le „blocăm”: curățăm pagina după preferințele omului. Mobilul
  e direcție viitoare (Chrome pe Android nu rulează extensii).
