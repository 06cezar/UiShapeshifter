# Contractele echipei

Sursa de adevăr pentru tipuri e **`packages/contracts/src/`**; documentele de aici explică regulile și comportamentul.
Dacă un document și tipurile se contrazic, tipurile câștigă, iar documentul se repară.

> **După schimbarea de direcție (vineri 17:00):** `00` și `01` sunt la zi. `02`–`06` și `12` descriu încă vechea
> aplicație și se rescriu în taskul **D7**; până atunci, la contradicții câștigă `00` și `01`. `07`–`11` rămân valabile
> ca idee și se ajustează de proprietarii lor în taskurile adaptate din `dag/tasks.yaml`.

| Fișier | Despre | Cine îl ține |
|---|---|---|
| [00-produs.md](00-produs.md) | produsul, utilizatorul, cerințele juriului, criteriile | D |
| [01-arhitectura.md](01-arhitectura.md) | foldere, cine ce face, fluxul, decizii, convenții | D |
| [02-ui-config.md](02-ui-config.md) | `UIConfig`, store-ul, poarta de limite, undo, șabloane | B |
| [03-componente-generate.md](03-componente-generate.md) | elementele DOM generate la cerere, catalogul | B |
| [04-registru-si-snapshot.md](04-registru-si-snapshot.md) | `data-agent-id`, registrul, snapshot-ul, coordonatele pentru lăbuță | B |
| [05-unelte-agent.md](05-unelte-agent.md) | bucla, promptul, uneltele, eșecurile | A |
| [06-protocol.md](06-protocol.md) | WebSocket și HTTP între web și server | A |
| [07-accesibilitate.md](07-accesibilitate.md) | limitele, fontul minim, auditul, reparațiile | C |
| [08-profil-si-memorie.md](08-profil-si-memorie.md) | profilul (ICP), memoria, faptele învățate | E |
| [09-semnale-si-adaptare.md](09-semnale-si-adaptare.md) | semnalele de utilizare, regulile de adaptare automată | E |
| [10-test-initial.md](10-test-initial.md) | onboarding-ul cu test și „Omite” | C |
| [11-mascota-chat-jurnal.md](11-mascota-chat-jurnal.md) | mascota, chat/voce, panoul de control | D |
| [12-demo.md](12-demo.md) | scenariul de 5 minute | D, E |

## Cum se schimbă un contract

1. Schimbi tipul în `packages/contracts/src/` și documentul de aici, în același PR.
2. Rulezi `npm run check -w @uishapeshifter/contracts`.
3. Anunți pe cei afectați: `git comms send <cine> "Schimb X în Y, vezi PR #N" --type contract`.
4. Schimbările care strică codul altcuiva se fac doar cu acordul lui. Adăugările (câmp opțional nou) sunt libere.
