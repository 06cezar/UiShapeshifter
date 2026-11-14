# Profilul omului, memoria agentului și conturile (etapele 3–4)

Tipurile: `packages/contracts/src/profile.ts` (`UserProfile`, `GeneralPreference`, `FamiliarSite`, `PreferenceCategory`) și
`accounts.ts`. Stocare: pe dispozitiv (`chrome.storage.local`, cheia = `userId`) și pe server
(`data/profiles/<userId>.json`, `apps/server/src/profile/`). Sincronizarea: `apps/web/src/sync/`.

Profilul e ca un **ICP** (ideal customer profile), dar pentru o singură persoană: cine e, ce poate, ce vrea, ce știe,
ce îl deranjează. Agentul îl citește la începutul fiecărei rulări și îl îmbogățește în timp. Îl **urmează de la un
site la altul**: ce a spus omul pe un site nu mai trebuie explicat pe următorul.

| Parte | Ce ține | De unde vine |
|---|---|---|
| `needs` | font minim, contrast, ținte minime, mișcare redusă, preferă vocea | testul inițial; ajustat din semnale |
| `preferences` | structuri familiare, ce ascunde / fixează | testul inițial; deciziile Păstrez / Anulez |
| `generalPreferences` | ce vrea omul **pe orice site** („fără rezumate AI”, „fără clipuri scurte”) | testul („ce te deranjează”); cereri repetate |
| `familiarSites` | site-uri pe care le cunoaște bine, sursă pentru „fă-l să arate ca…” | testul („ce site-uri cunoști”); utilizare |
| `persona` | confort cu tehnologia, scopuri, sarcini frecvente, dificultăți | testul, conversație, utilizare |
| `facts` | lucruri învățate, fiecare cu dovezi și încredere | agentul (`update_profile`), regulile de adaptare |
| `trust` | câte propuneri păstrate / anulate; aplicare automată pentru schimbări mici | deciziile omului |

`generalPreferences` și `familiarSites` sunt opționale în tip (profilurile vechi nu le au); se tratează ca liste goale.

## Reguli

- **Dovezi obligatorii.** Un `fact` și o `GeneralPreference` din conversație sau utilizare fără `evidence` sunt refuzate.
  Dovezile sunt id-uri de rulări, de semnale sau citate scurte.
- **Preferința generală se naște dintr-o cerere care sună general** („nu vreau AI în site-uri”) sau din aceeași cerere
  pe ≥ 2 site-uri (`repeat-request`, `09`). Agentul o scrie cu `update_profile`; ce a făcut deja pe site-ul curent e rețeta lui.
- **Aplicarea pe un site nou:** serverul vede un site fără rețetă și un om cu preferințe generale neaplicate acolo
  (`appliedOn`) → trimite o `Suggestion` („Pe site-ul ăsta: scot și rezumatele AI?”). Fără „Da”, nu se schimbă nimic.
- **Încrederea** crește când un fapt e confirmat din nou și scade când omul anulează o schimbare bazată pe el.
- **Nevoile nu scad singure.** `minFontPx` și `minTargetPx` pot crește din semnale; scad doar dacă omul o cere explicit.
- **Ce intră în prompt:** un rezumat de cel mult ~150 de cuvinte, generat determinist din profil (nevoi, preferințe
  generale, site-uri familiare, cele mai sigure 5 fapte), nu tot JSON-ul.
- **Confidențialitate:** doar date de test în demo; profilul se poate vedea și șterge din panou („Ce știe agentul despre mine”).
- **„Nu schimba acest site”** (popup): `chrome.storage.local`, cheia `excludedSites` = listă de host-uri (fără „www.”).
  Pe un site din listă extensia nu aplică singură nimic: nici rețeta salvată, nici preferințele de bază (C4, fontul
  minim), nici ascunderile fără AI din testul inițial. Chatul și mascota rămân. Lista nu pleacă pe server.

## Profil de demo: `demo-fresh` și `maria`-ul vechi

`demo-fresh` pornește fără profil, ca să se vadă testul inițial. Pentru demo-ul nou se folosește un profil de test cu
text de 20px, contrast mare și preferințele „fără rezumate AI”, „fără clipuri scurte” (în `data/` de test, E4).
Profilul `maria` din versiunea veche rămâne în teste, ca exemplu de `needs` ridicate.

## Conturile (opționale, E6)

Merge **fără cont**: totul rămâne pe dispozitiv, sub un `userId` anonim generat la instalare. **Cu cont**, profilul și
rețetele trec pe alt dispozitiv.

1. `POST /api/accounts/register` și `/login` (`RegisterRequest` / `LoginRequest`: `username`, `password`,
   `anonymousUserId`) → `AuthResult { token, account, userId }`.
2. **Parola:** la server doar ca hash (scrypt cu sare); nu apare în loguri, în jurnal sau în răspunsuri. Fără servicii
   externe de autentificare. Limite în `ACCOUNT_LIMITS`.
3. **Legarea datelor anonime:** la `register`, datele lui `anonymousUserId` devin ale contului. La `login` pe alt
   dispozitiv, datele anonime de acolo se **îmbină** cu cele ale contului.
4. **Îmbinarea:** per rețetă (host), câștigă cea cu `updatedAt` mai nou; la profil se unesc `facts`, `generalPreferences`
   și `familiarSites` după `id` / `host`, iar `needs` iau valoarea **mai mare** (nu coborâm un font minim la îmbinare).
   **Istoricul urmează rețeta:** istoricul gazdei se ia întreg din aceeași parte cu rețeta câștigătoare; nu se amestecă
   revizii de pe două dispozitive.
5. **Sincronizarea:** `GET /api/sync` / `PUT /api/sync` cu `Authorization: Bearer <token>` și `SyncBundle`
   (`profile` + `recipes` + `history?`). Extensia trimite după fiecare schimbare (cu pauză de 2 s) și descarcă la login.
   - `history` absent la `PUT` (client vechi): serverul păstrează istoricul pe care îl are. Prezent: se îmbină pe gazdă (pct. 4).
   - **De făcut după îngheț** (nu e în cod azi): cel mult o intrare și `RECIPE_LIMITS.maxRevisions` revizii pe gazdă
     (serverul păstrează azi 50), istoricul unei gazde fără rețetă aruncat, și o limită de mărime a pachetului sub 1 MB-ul
     primit de server, cu istoricul scurtat primul (azi un pachet prea mare e refuzat și sincronizarea nu se face).
6. Token-ul stă în `chrome.storage.local`; „Ieși din cont” îl scoate și lasă datele locale.
7. După login, extensia folosește `AuthResult.userId` ca `userId` activ.
