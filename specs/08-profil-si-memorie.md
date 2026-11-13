# Profilul utilizatorului: memoria agentului

Tipurile: `packages/contracts/src/profile.ts`. Stocare: `data/profiles/<userId>.json` (server, `apps/server/src/profile/`).

Profilul e ca un **ICP** (ideal customer profile), dar pentru o singură persoană: cine e, ce poate, ce vrea, ce face des.
Agentul îl citește la începutul fiecărei rulări și îl îmbogățește în timp.

| Parte | Ce ține | De unde vine |
|---|---|---|
| `needs` | font minim, contrast, ținte minime, mișcare redusă, preferă vocea | testul inițial; ajustat din semnale |
| `preferences` | poziția meniului, șablon, structuri familiare, module ascunse/fixate | testul inițial; deciziile Păstrez/Anulez |
| `persona` | vârstă, confort cu tehnologia, scopuri, sarcini frecvente, contacte importante, dificultăți | testul inițial, conversație, utilizare |
| `facts` | lucruri învățate, fiecare cu dovezi și încredere | agentul (`update_profile`), regulile de adaptare |
| `trust` | câte propuneri au fost păstrate / anulate; aplicare automată pentru schimbări mici | deciziile utilizatorului |

## Reguli

- **Dovezi obligatorii.** Un `fact` fără `evidence` e refuzat. Dovezile sunt id-uri de semnale, de pași din jurnal
  sau citate scurte din conversație.
- **Încrederea** crește când un fapt e confirmat din nou (`lastConfirmedAt`, `confidence` + 0.1, maxim 1) și scade
  când utilizatorul anulează o schimbare bazată pe el.
- **Nevoile nu scad singure.** `minFontPx` și `minTargetPx` pot crește din semnale; scad doar dacă omul o cere explicit.
- **Ce intră în prompt:** un rezumat de cel mult ~150 de cuvinte, generat determinist din profil (nevoi, preferințe,
  persona, cele mai sigure 5 fapte), nu tot JSON-ul.
- **Confidențialitate:** doar date de test; profilul se poate vedea și șterge din Setări („Ce știe vulpița despre mine”).

## Profilul de demo: `maria`

```json
{
  "userId": "maria", "displayName": "Maria",
  "onboarding": { "completed": true, "skipped": false },
  "needs": { "minFontPx": 20, "contrast": "high", "minTargetPx": 56, "reducedMotion": false, "prefersVoice": true },
  "preferences": { "navPosition": "bottom", "familiarLayouts": ["bottom-nav-stories"], "hiddenModules": [], "pinnedModules": ["messages"] },
  "persona": {
    "ageRange": "60-74", "techComfort": "low",
    "goals": ["vorbesc cu nepoata Ana", "văd pozele de la familie"],
    "frequentTasks": ["openChat:ana", "call:ana", "sendPhoto"],
    "keyContacts": ["ana", "ion"],
    "painPoints": ["nu găsesc butonul de atașat poza"]
  },
  "facts": [],
  "trust": { "accepted": 0, "undone": 0, "autoApplyLowRisk": false }
}
```

Al doilea utilizator, `demo-fresh`, pornește fără profil, pentru demonstrarea testului inițial.
