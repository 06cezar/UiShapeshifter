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
