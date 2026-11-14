# UI Shapeshifter

> Orice site se schimbă după tine, nu tu după el.

UiPath Future Forward Hackathon 2026, tema **Agents in Action**.

O **extensie Chrome** cu un agent AI care **reface interfața site-urilor existente** după omul din fața ecranului.
Îi spui ce vrei, scris sau vorbit, iar agentul schimbă pagina pe loc, o verifică și ține minte schimbarea.

**Pe aplicațiile pe care le folosești zilnic, agentul păstrează doar ce folosești tu.**

## Problema

Site-urile sunt făcute pentru toată lumea, deci pentru nimeni anume. Aplicațiile dense (facturi, tichete, administrație)
îngroapă singurul buton de care ai nevoie sub meniuri și bannere. Unii nu vor clipuri scurte sau rezumate AI, alții văd
greu, alții sunt obișnuiți cu alt site. Azi fiecare se adaptează la site. Noi facem invers.

## Ce face

| | Ce | Exemple |
|---|---|---|
| **Scoate** | ascunde elemente și funcții | „nu vreau Shorts”, „scoate tot ce e AI de pe toate site-urile” |
| **Ajustează** | schimbă aspectul a ce rămâne | text mai mare, butoane mai mari, contrast, fundalul paginii |
| **Adaugă** | elemente noi, legate de butoanele reale ale site-ului | scurtătura „Plătește factura” în antet |
| **Reface** | mută și restilizează liber | „vreau doar să plătesc factura”, „fă-l să arate ca site-ul cu care sunt obișnuit” |

Cum află ce vrei:

- un **test inițial** la instalare (ce citești comod, ce site-uri cunoști, ce te deranjează), cu „Omite” pe fiecare ecran;
- **cererile tale**, în chat sau cu vocea (ro-RO), din bula mascotei;
- un **profil** (memorie tip ICP) care te urmează de la un site la altul: o preferință spusă „peste tot” e propusă pe
  site-urile noi;
- **singur**, din felul în care folosești paginile: după câteva click-uri ratate, propune butoane mai mari.

Schimbările devin **rețeta site-ului** și se reaplică la fiecare vizită **fără AI**, înainte să se vadă pagina. Merge
**fără cont** (totul pe dispozitiv); **cu cont**, preferințele te urmează pe alt profil de browser sau alt calculator.

Un raton animat se plimbă prin pagină și îți arată unde să apeși.

## De ce e agent, nu filtru CSS

Agentul lucrează pe un DOM pe care nu-l controlăm, în buclă: **observă** (snapshot-ul paginii), **decide**,
**acționează** (CSS și operații pe DOM), **verifică** (snapshot nou și audit de accesibilitate) și **repară**.
Fiecare pas apare **pe ecran**, în panou, cât rulează, și rămâne în **jurnalul rulării**, cu rezultatul care a schimbat
pasul următor: scorul de audit, elementul negăsit, operația refuzată.

Exemplu din demo: pe site-ul de test agentul pune „Plătește factura” în antet. Auditul vede butonul tăiat de cutia
antetului, agentul repară cu CSS, auditul iese curat și omul alege **Păstrez** sau **Anulez**.

Controlul rămâne la om: pași live, **Oprește** oricând, previzualizare cu **Păstrez / Anulez**, istoricul cererilor de pe
site, reluarea unei rulări pas cu pas și **„Revino la original”** pentru orice site.

## Siguranța

- **În afara Modului expert, agentul nu rulează cod.** Scrie CSS și bucăți de HTML, mută, împachetează și scoate
  elemente. Totul trece prin validare (fără JavaScript, fără `url()`/`@import`, fără atribute `on*`).
- **Modul expert** (experiment) e singurul loc unde agentul poate propune un comportament în JavaScript (de exemplu
  „citește-mi articolul”). Are mai multe plase:
  - e oprit implicit, și în extensie, și pe server (`AGENT_JS=1`);
  - codul cu rețea, cookie-uri sau stocare (`fetch`, `document.cookie`, `localStorage` etc.) e refuzat înainte să-l
    vadă omul;
  - codul rulează doar după ce omul îl citește și apasă **Rulează**; aprobarea stă într-un shadow root închis, deci
    pagina nu o poate da în locul omului.

  Plasele nu sunt o garanție: garanția e omul care vede codul ([`specs/05`](specs/05-unelte-agent.md)).
- **Limite tari de accesibilitate** (`HARD_LIMITS`): font minim 16px (mai mare din profil), ținte de cel puțin 44px,
  contrast WCAG. Fontul minim se aplică ultimul, peste orice a scris agentul.
- **Ascultă doar de tine:** textul site-ului e doar informație pentru agent. O preferință generală nouă intră în profil
  doar cu un citat din cererea omului, ca o pagină să nu-și poată scrie singură reguli.
- **Nu e ad blocker:** reclamele le ascunde doar la cerere și nu ocolește zidurile anti-adblock.
- Cheia OpenRouter stă doar pe server, niciodată în extensie.

## Cum e făcut

```
apps/web             extensia (Manifest V3, React + TypeScript): content script, service worker, popup,
                     motorul de rețete, validarea, auditul, testul inițial, mascota, chatul, panoul
apps/server          serverul agentului (Node + Express + ws): bucla, OpenRouter, uneltele, jurnalul,
                     rețetele, profilul, adaptarea automată, conturile
apps/test-site       site-ul nostru de test: o aplicație de facturi aglomerată intenționat, doar date de test
packages/contracts   tipurile comune dintre extensie și server (sursa de adevăr)
```

Interfața noastră stă într-un shadow DOM, ca stilurile site-ului să nu o strice. Un singur WebSocket, ținut de service
worker, leagă toate tab-urile de server. Detalii: [`specs/01-arhitectura.md`](specs/01-arhitectura.md).

## Pornire

Ai nevoie de Node 20.12 sau mai nou și de Chrome 116 sau mai nou.

```bash
npm install
```

Copiază `apps/server/.env.example` în `apps/server/.env` și completează:

| Variabilă | Ce |
|---|---|
| `OPENROUTER_API_KEY` | cheia OpenRouter (doar aici, niciodată în git) |
| `OPENROUTER_MODEL` | gol = Claude Opus 5.5; Claude Haiku 5.5 e mult mai ieftin pentru repetiții |
| `AGENT_FAKE` | în exemplu e `1` (agent fals, fără rețea); pune `0` pentru modelul real |
| `AGENT_STAGE` | `3`: toate uneltele, inclusiv profilul |
| `AGENT_JS` | `1` pornește Modul expert pe server (în extensie se pornește separat) |
| `ADAPT_DEMO` | `1`: adaptarea automată pornește după 2 click-uri ratate în loc de 3 |

Pornește serverul și site-ul de test:

```bash
npm run dev
```

```bash
npm run dev -w @uishapeshifter/test-site
```

Serverul e pe http://localhost:8787 (`/api/health`), site-ul de test pe http://localhost:5180.

### Extensia în Chrome

1. Construiește extensia:
   ```bash
   node apps/web/src/extension/build.mjs
   ```
   Iese în `apps/web/dist/extension` (cu `--watch` se reface la fiecare salvare).
2. Deschide `chrome://extensions`, pornește **Developer mode**, apasă **Load unpacked** și alege `apps/web/dist/extension`.
3. Se deschide testul inițial. După el, pe orice site apare ratonul; scrie-i sau vorbește-i în bulă.
4. Butonul extensiei din bara Chrome: „Nu schimba acest site”, „Revino la original”, contul, Modul expert și
   **„Resetează demo-ul”** (profil, rețete și rulări de la zero).
   Modul expert cere în plus Chrome 138 sau mai nou și comutatorul **„Allow User Scripts”** din detaliile extensiei
   (`chrome://extensions` → Details); fără el, codul nu poate rula.
5. După o reconstruire, apasă ↻ pe cardul extensiei și reîncarcă pagina.

### Verificări

```bash
npm run check
```

```bash
npm test
```

`check` verifică tipurile în toate pachetele; `test` rulează testele (Vitest, cu happy-dom în `apps/web`).

## Demo

Scenariul de 5 minute, pas cu pas, cu ce demonstrează fiecare pas: [`specs/12-demo.md`](specs/12-demo.md). Pe scurt:
testul inițial → „nu vreau Shorts” pe un site de video → „scoate tot ce e AI de pe toate site-urile” și preferința
propusă pe alt site → „vreau doar să plătesc factura” pe site-ul de test, cu eșecul reparat → adaptarea după click-uri
ratate → panoul, Anulez și login pe alt profil de browser.

## Unde găsești ce

| Ce | Unde |
|---|---|
| Produsul, cerințele mentorilor, criteriile juriului | [`specs/00-produs.md`](specs/00-produs.md) |
| Arhitectura și cine ce face | [`specs/01-arhitectura.md`](specs/01-arhitectura.md) |
| Uneltele agentului (inclusiv Modul expert) | [`specs/05-unelte-agent.md`](specs/05-unelte-agent.md) |
| Accesibilitatea și limitele | [`specs/07-accesibilitate.md`](specs/07-accesibilitate.md) |
| Contractele (tipurile comune) | [`packages/contracts/src/`](packages/contracts/src/) și [`specs/`](specs/README.md) |
| Deciziile luate pe parcurs | [`DECISIONS.md`](DECISIONS.md) |
| Planul și graful de taskuri | [`dag/tasks.yaml`](dag/tasks.yaml), branch-ul `dag` |
| Cum a lucrat echipa (5 oameni, fiecare cu agentul lui) | [`docs/CUM-LUCRAM.md`](docs/CUM-LUCRAM.md) |

## Limite

O extensie schimbă paginile web, nu interfața browserului. Chrome pe Android nu rulează extensii, deci mobilul rămâne
direcție viitoare. Site-urile reale își schimbă structura; rețeta salvată se reaplică, iar ce nu se mai găsește se
raportează, nu se ghicește.

## Echipa

A Mihnea · B Ștefan R. · C Adelin · D Cezar (lider) · E Iulia

## Atribuiri

Raccoon art by null-painter-error ([opengameart.org/node/81109](https://opengameart.org/node/81109)), CC-BY 4.0.
Detalii și ce am schimbat: [`apps/web/src/mascot/LICENSE-ASSETS.md`](apps/web/src/mascot/LICENSE-ASSETS.md).
