# Scenariul demo (cel mult 5 minute)

Scris acum ca să construim spre el. Fiecare pas trebuie să meargă și înregistrat (rezervă), și live.
Utilizator: `demo-fresh` pentru pasul 1, apoi `maria`.

| # | Timp | Ce se vede | Ce demonstrează |
|---|---|---|---|
| 1 | 0:00–0:50 | **Testul inițial:** Maria alege 20px, contrast mare, ratează ținta de 40px. „Omite” e vizibil. La final, agentul transformă interfața: plăci mari, meniul jos cu etichete, scor de accesibilitate 54 → 96 | test inițial, profil, agent cap-coadă |
| 2 | 0:50–1:40 | **Generare la cerere:** „Vreau s-o sun pe Ana mai repede.” Agentul: snapshot → `generate_component` (placa „Sună-o pe Ana”) → audit găsește că placa e prea mică pentru 56px → repară → arată placa cu lăbuța | elemente DOM la cerere, buclă cu verificare |
| 3 | 1:40–2:30 | **Limita de accesibilitate:** „Fă textul mai mic, să încapă mai mult.” Patch-ul e refuzat (`LIMIT_VIOLATION`), agentul explică și propune: ascunde modulul „Noutăți” ca să încapă mai mult → previzualizare → Păstrez | font minim, tratarea eșecului, control |
| 4 | 2:30–3:30 | **Ghidaj:** „Cum îi trimit o poză Anei?” Lăbuța arată Mesaje → Maria apasă greșit pe Poze → agentul observă, explică, arată din nou → butonul de atașat e ascuns în „Mai mult” → îl deschide întâi → poza ajunge | adaptare la acțiunile omului, element ascuns |
| 5 | 3:30–4:20 | **Adaptare automată:** Maria ratează de 2–3 ori butonul „Trimite” (`ADAPT_DEMO=1`). Fără cerere, mascota: „Butoanele par greu de apăsat. Le măresc?” → Păstrez. Profilul are un fapt nou, cu dovezi | „face automat după ce folosești mai mult”, memorie |
| 6 | 4:20–5:00 | **Control:** panoul jurnal, reluarea pas cu pas a rulării de la pasul 2, istoricul cu „Revino aici”, „Ce știe vulpița despre mine” | transparență, corectare |

## Ce pregătim

- Datele de test: 4 contacte cu poze (generate, fără persoane reale), 10 mesaje, 12 poze.
- Un buton ascuns „Resetează demo-ul” (profiluri, config, rulări) și `AGENT_FAKE=1` ca rezervă fără rețea.
- Videoul de rezervă, înregistrat până sâmbătă la 11:00.
- Cifrele pentru pitch, măsurate, nu inventate: scorul de audit înainte/după, click-urile pentru „sună-o pe Ana”
  înainte/după, ratările de click înainte/după.
