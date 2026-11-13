# Decizii

Deciziile luate în timpul hackathonului, cele mai noi sus. Alegerile de arhitectură de la început sunt în
`specs/01-arhitectura.md` („Decizii”); aici intră ce se hotărăște pe parcurs: fire comms închise, interpretări ale
specificațiilor, ce tăiem la îngheț, renunțări din ultimele două ore.

Cum adaugi una: o scrii aici (sus), în același PR cu codul sau separat, apoi `git comms close <id> --saved-to DECISIONS.md`.
Nu editezi intrările vechi; dacă o decizie se schimbă, adaugi una nouă care o înlocuiește și o numești.

Formatul:

```
## AAAA-LL-ZZ HH:MM · <titlu scurt> · decis de: <cine> (+ cine a fost de acord)
Decizia: o propoziție.
De ce: o propoziție.
Afectează: specs/0X, fluxurile …
```

---

## 2026-11-13 18:00 · Construim din aproape în aproape, cu puncte de control · decis de: D (Cezar)
Decizia: planul e împărțit în etape (0–5); fiecare se termină cu un punct de control (M0–M4 în `dag/tasks.yaml`) la care
echipa încarcă extensia și vede că merge cap-coadă; taskurile etapei următoare depind de punctul de control dinainte.
De ce: vrem să vedem cum funcționează pe măsură ce construim, nu abia la integrarea de la sfârșit; după fiecare etapă
rămâne un produs care se poate arăta, iar întârzierile taie din coadă, nu din ce merge deja.
Afectează: toate fluxurile. `dag/tasks.yaml` (taskuri noi: M0–M4, C5, E7, D8, D9, D10, B6, A6, E8), `CLAUDE.md`
(„Din aproape în aproape”), `specs/00` (tabelul etapelor), `docs/agenti/`.

## 2026-11-13 17:45 · Agentul scrie CSS și HTML liber, validat; nu rulează JavaScript · decis de: D (Cezar)
Decizia: agentul nu e ținut la o listă fixă de operații: scrie CSS și bucăți de HTML pentru pagina din fața lui și
mută/împachetează/scoate elemente; totul e validat de cod determinist și salvat în rețeta site-ului.
De ce: „fă site-ul ăsta să arate ca altul” nu se poate face din câteva aranjamente dinainte; JavaScript generat rămâne
interzis, fiindcă Chrome MV3 nu-l lasă să ruleze și e un risc pe site-urile cu date sensibile.
Afectează: înlocuiește regula veche „agentul nu scrie cod sau HTML”. Limitele de accesibilitate se verifică după
aplicare (audit), nu înainte; fontul minim din profil se aplică ultimul. `CLAUDE.md`, `specs/01`, D7, A2, A4, B3, B4, B5, C2, C4.

## 2026-11-13 17:00 · Schimbare de direcție: extensie care reface site-uri existente · decis de: D (Cezar, cu echipa)
Decizia: produsul nu mai e o aplicație de mesaje a noastră pentru vârstnici, ci o extensie Chrome cu un agent care
reface interfața site-urilor existente după ce vrea omul (scoate, ajustează, adaugă, reface), pentru oricine.
De ce: ideea echipei e schimbarea de UI, nu un instrument de accesibilitate sau un simplu ajutor;
accesibilitatea rămâne o parte, cu aceleași limite tari.
Afectează: toate fluxurile. `README.md`, `specs/00`, `specs/01` și `dag/tasks.yaml` sunt rescrise; `specs/02`–`06` și
`12` se rescriu în D7. Înlocuiește „Cerințele mentorilor sunt criteriile de prioritizare” doar la interpretarea
punctului „UI ≫ accesibilitate”. Regula „fără aplicații reale terțe” (pusă de noi în specificațiile de la început, nu
de organizatori) cade: modificăm site-uri reale în browserul omului; doar interfața noastră nu copiază alte produse.
Mascota nu mai e neapărat o vulpe: un animal din asset-uri cu licență liberă.

## 2026-11-13 15:10 · /api/config e al lui A · decis de: D (la întrebarea lui A)
Decizia: `GET/PUT /api/config/:userId` (specs/06, stocare `data/configs/`) îl face A în A1, lângă serverul WebSocket.
De ce: ruta n-avea proprietar în plan; serverul HTTP e al lui A, iar B rămâne pe store-ul din browser.
Afectează: A1 (nota din `dag/tasks.yaml`), B (store-ul încarcă și salvează prin ruta asta). `/api/profile` rămâne la E (E1).

## 2026-11-13 · Stilul de cod comun · decis de: D
Decizia: regulile din `CLAUDE.md` („Stil de cod”, „Gata înseamnă”) se aplică tuturor fluxurilor.
De ce: cinci agenți scriu cod în paralel; fără reguli comune, fiecare își face stilul lui și integrarea costă ore.
Afectează: toate fluxurile.

## 2026-11-13 · Cerințele mentorilor sunt criteriile de prioritizare · decis de: D
Decizia: cele 8 cerințe din `specs/00-produs.md` („Ce ne-au cerut juriul și mentorii”) decid ce facem întâi: P0 înainte
de P1, iar o funcție care nu servește niciuna dintre ele se taie prima la îngheț (sâmbătă 09:00).
De ce: mentorii au confirmat ce se punctează: test inițial, accesibilitate pe primul loc, elemente generate la cerere,
seamless, vorbitul cu agentul, profil tip ICP, adaptare automată, fontul minim.
Afectează: toate fluxurile; `specs/12-demo.md` trebuie să arate fiecare cerință P0.
