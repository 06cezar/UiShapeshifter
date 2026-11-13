# Arhitectura

După schimbarea de direcție (vineri 17:00, `DECISIONS.md`): o **extensie Chrome (Manifest V3)** + **serverul agentului**.
Codul extensiei rămâne în `apps/web/src`, în aceleași foldere și cu aceiași proprietari, ca PR-urile deschise să nu se
strice. Se adaugă doar punctele de intrare ale extensiei.

```
apps/web  (React + Vite + TypeScript, Zustand, Framer Motion)  → se construiește ca extensie
  ├─ extension/   manifestul, content script, service worker, popup, stocarea locală        (E, scheletul)
  ├─ ui/          motorul de rețete: aplică operațiile pe pagină, poarta de limite, undo     (B)
  │               + registrul paginii: id-uri stabile, selectori, snapshot                   (B)
  ├─ generated/   elementele generate din catalog, puse în pagină și legate de cele reale    (B)
  ├─ validation/  validarea a ce scrie agentul: CSS și HTML, funcții pure                    (C)
  ├─ a11y/        auditul pe DOM-ul paginii, reparațiile, preferințele de bază fără AI       (C)
  ├─ onboarding/  testul inițial (pagina extensiei, deschisă la instalare)                   (C)
  ├─ mascot/      mascota care se plimbă prin pagină și arată                                (D)
  ├─ chat/        chat text + voce                                                           (D)
  ├─ journal/     panoul de control: pași, Păstrez/Anulez, „Revino la original”              (D)
  ├─ signals/     semnalele de utilizare                                                     (E)
  ├─ sync/        contul opțional și sincronizarea profilului și a rețetelor                 (E)
  └─ agent-bridge/ executorul uneltelor care ating pagina                                    (B, cu A)

apps/server  (Node 20 + Express + ws + TypeScript, rulat cu tsx)          port 8787
  ├─ agent/       bucla agentului, promptul, apelurile OpenRouter, uneltele „server”         (A)
  ├─ runs/        jurnalul rulărilor                                                         (A)
  ├─ recipes/     rețetele pe utilizator și site (înlocuiește config/)                       (A)
  ├─ profile/     profilul (memoria)                                                         (E)
  ├─ accounts/    conturile opționale, legarea datelor anonime de cont                       (E)
  └─ adaptation/  regulile pe semnale, declanșatoarele                                       (E)

apps/test-site       site-ul nostru de test, aglomerat intenționat, servit local             (E)
packages/contracts   tipurile comune (singura sursă de adevăr)                               (D)
data/                profiles/, recipes/, accounts/, runs/ (git-ignored)                     (E)
```

## Părțile extensiei

| Parte | Unde rulează | Ce face |
|---|---|---|
| **Content script** | în fiecare pagină | aplică rețeta salvată, ține registrul paginii, execută uneltele, colectează semnale, montează interfața noastră |
| **Interfața noastră** (mascotă, chat, panou) | în pagină, într-un **shadow DOM** | izolată de stilurile site-ului, ca site-ul să nu ne strice și noi să nu-l stricăm |
| **Service worker** | în fundal | ține un singur WebSocket cu serverul pentru toate tab-urile, ca legătura să nu depindă de regulile fiecărui site (CSP); trimite mesajele între pagini și server |
| **Pagina de test inițial** | pagină a extensiei | se deschide la instalare; refolosește `onboarding/` |
| **Popup** | butonul extensiei | pornit/oprit pe site-ul curent, „Revino la original”, cont |

## Ideea centrală: rețeta site-ului

Agentul **schimbă pagina liber**: nu alege dintr-o listă fixă de aranjamente. „Fă site-ul ăsta să arate ca cel cu care
sunt obișnuit” trebuie să se poată. Are trei feluri de a schimba pagina, toate salvate în rețetă:

```
SiteRecipe { host, revision, css, ops: DomOp[] }

css   = foaie de stil scrisă de agent, pentru site-ul acesta. Face cea mai mare parte din „arată altfel”:
        așezare (grid, flex, ordine, poziții), culori, fonturi, colțuri, spațiere, ce se ascunde.

DomOp = schimbări de structură, pe elemente alese din snapshot (după id):
          remove / hide     scoate un element sau un grup
        | move              mută un element în alt loc din pagină
        | wrap              pune elemente într-un container nou (ca să poată fi așezate împreună)
        | setText / setAttr schimbă un text sau un atribut dintr-o listă permisă (ex. etichete)
        | insertHtml        adaugă HTML scris de agent, curățat, lângă un element
        | bind              leagă un element adăugat de unul real: apăsarea lui îl declanșează pe cel real
        | inject            o componentă din catalogul nostru (plăci, scurtături), pentru cazurile obișnuite
```

Forma exactă se stabilește în `packages/contracts`: partea de CSS în **D7** (etapa 1), `DomOp` în **D8** (etapele 2–4).
Până atunci, schița de mai sus e orientativă. Construim din aproape în aproape: etapa 1 folosește doar `css`.

**Ce nu face niciodată: nu rulează JavaScript scris de model.** Chrome nu lasă o extensie MV3 să execute cod generat
pe loc, iar cod scris de un model pe site-ul unei bănci e un risc pe care nu-l luăm. Comportamentul elementelor
adăugate vine doar din `bind` și din componentele catalogului.

**Validarea** (cod determinist, înainte de aplicare):

- CSS: fără `url()`, `@import` și `expression` (ca să nu trimită date în afară); fără selectori spre interfața noastră.
- HTML: doar etichete și atribute dintr-o listă permisă; fără `<script>`, `<iframe>`, atribute `on*`, `javascript:`.
- Elementele din snapshot devin selectori stabili (rol, text, structură), nu nume de clase generate.

**Limitele de accesibilitate se verifică după aplicare, nu înainte:** cu CSS liber nu putem ști dinainte rezultatul.
După fiecare schimbare rulează auditul (`specs/07`); ce cade sub `HARD_LIMITS` se repară sau se anulează, iar
preferințele de bază din profil (fontul minim) se aplică **ultimele**, peste orice a scris agentul.
- **Reaplicarea fără AI:** la încărcarea paginii, content script-ul citește rețeta din stocarea locală și o aplică
  înainte să se vadă pagina (CSS la `document_start`), apoi din nou când pagina își schimbă singură conținutul.
- **Undo:** fiecare rulare e o revizie; „Anulez” scoate ultima revizie, „Revino la original” golește rețeta.
- **Un selector care nu mai găsește nimic** (site-ul s-a schimbat) nu strică pagina: operația e sărită și notată.

## Snapshot-ul paginii

O pagină reală are mii de elemente. Registrul trimite agentului un **rezumat**: zonele paginii, titlurile și elementele
interactive vizibile, cu text scurt, rol și id stabil, cu un număr maxim de elemente. Agentul poate cere detalii pentru
o zonă. Fără asta, cererea către model e prea mare și prea lentă.

## Fluxul unei cereri

```
Om, pe un site de video: „nu vreau Shorts”
  pagină ──user_message──▶ service worker ──▶ server: pornește o rulare, încarcă profilul și rețeta site-ului
  model: get_page_snapshot        server ──tool_call──▶ pagină: registrul face rezumatul ──tool_result──▶ server
  model: apply_css / apply_ops    pagina validează și aplică, revizia crește
  model: get_page_snapshot        verifică: au dispărut? a rămas ceva? s-a stricat altceva?
  model: apply_css / apply_ops    repară ce a scăpat
  model: propose_changes          omul vede previzualizarea: Păstrez / Anulez
  model: update_profile           „nu vrea clipuri scurte” devine preferință generală
  model: finish                   rețeta se salvează local (și pe server, dacă are cont)
  după fiecare pas: server ──step──▶ pagină (panoul de control)

La următoarea vizită: content script-ul aplică rețeta singur. Niciun apel la server.
```

## Salvare: local întâi, cont opțional

- **Local:** `chrome.storage.local` ține profilul, rețetele pe site și un `userId` anonim generat la instalare.
- **Server:** aceleași date sub `userId`, ca agentul să aibă profilul în context.
- **Cont (opțional):** nume + parolă. La login, datele anonime se leagă de cont; pe alt dispozitiv, după login, se
  descarcă. Parola se ține doar ca hash; fără servicii externe de autentificare.

## Decizii

- **LLM:** OpenRouter (API compatibil OpenAI, `tools`). Modelul prin `OPENROUTER_MODEL`. Cheia doar în
  `apps/server/.env`, niciodată în extensie, în loguri sau în git.
- **Fără AI acolo unde nu trebuie:** reaplicarea rețetelor, auditul, limitele, regulile de adaptare, preferințele de
  bază (font minim pe orice site) sunt cod determinist. Modelul doar decide.
- **Stocare pe server:** fișiere JSON în `data/`. Fără bază de date.
- **Monorepo cu npm workspaces.** Pagina de probă de pe 5173 rămâne ca banc de lucru; nu mai e interfața principală.
- **Demo:** site-uri reale + un site de test al nostru, servit local, ca rezervă fără internet.

## Convenții

- Textele noastre pentru utilizator sunt în **română**, scurte, fără jargon.
- Elementele **noastre** interactive au `data-agent-id`. Elementele **site-ului** primesc id din registru; nu le
  modificăm atributele mai mult decât e nevoie.
- În interfața noastră, nicio culoare sau mărime hardcodată: totul din temă (variabile CSS).
- Fișierele fiecăruia: tabelul de mai sus. În afara lor se cere prin `git comms send`.
- O schimbare în `packages/contracts` = schimbare de contract (vezi `specs/README.md`).
