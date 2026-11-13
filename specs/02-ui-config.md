# Configurația interfeței (`UIConfig`)

Tipul: `packages/contracts/src/ui-config.ts`. Valoarea de pornire: `DEFAULT_CONFIG`.

## Reguli

1. **Totul se randează din config.** Layout, navigație, module, ordine, mărimi, temă și elemente generate.
   Nicio componentă nu are stare vizuală proprie care să nu se vadă în config.
2. **Store-ul (Zustand) e singurul loc care schimbă config-ul.** Expune:
   - `applyPatch(ops, meta) → { ok, revision } | { ok: false, violations }`
   - `applyTemplate(template, meta)`
   - `addComponent(spec, placement, meta)` / `removeComponent(id, meta)`
   - `undo(toRevision)` și `history` (lista reviziilor cu `meta`: cine, de ce, `runId`, `proposalId`)
3. **Poarta de limite.** Înainte de aplicare, store-ul calculează config-ul rezultat și îl refuză dacă:
   - `theme.baseFontPx < max(HARD_LIMITS.minFontPx, profile.needs.minFontPx)` sau `> HARD_LIMITS.maxFontPx`
   - `theme.lineHeight < HARD_LIMITS.minLineHeight`
   - `minTargetPx < max(HARD_LIMITS.minTargetPx, profile.needs.minTargetPx)`
   - contrastul `palette.text` / `palette.background`, `onPrimary` / `primary` e sub prag (`07-accesibilitate.md`)
   - un modul `pinned` devine `visible: false`
   - calea nu există sau tipul valorii e greșit

   Refuzul întoarce `LIMIT_VIOLATION` cu lista încălcărilor, ca agentul să încerce altceva.
4. **Fiecare schimbare aplicată crește `revision`** și intră în `history`. Undo = revenire la o revizie anterioară.
5. **Persistență:** după fiecare schimbare, frontend-ul trimite config-ul la `PUT /api/config/:userId` (debounce 1 s).
   La pornire îl citește cu `GET`. Fără config salvat: `DEFAULT_CONFIG` ajustat după profil.
6. **Tema → CSS.** `theme` devine variabile CSS pe `:root` (`--font-base`, `--line-height`, `--color-text`…), iar
   treptele de font se calculează `base * scale^n`. Schimbarea temei nu re-montează componentele.
7. **Tranziții:** schimbările de layout se animă cu Framer Motion (`layout`), cel mult 300 ms;
   cu `theme.reducedMotion` fără animații.

## Exemple de patch

```json
[{ "op": "replace", "path": "/theme/baseFontPx", "value": 20 },
 { "op": "replace", "path": "/nav/showLabels", "value": true }]
```

```json
[{ "op": "replace", "path": "/modules/5/visible", "value": false }]
```

Căile cu index (`/modules/5`) sunt fragile: agentul ia indexul din snapshot-ul curent.
Store-ul acceptă și forma `/modules/@feed/visible` (după `id`), recomandată.

## Șabloanele

| `template` | Navigație | Conținut |
|---|---|---|
| `sidebar-feed` | stânga, cu etichete | coloană centrală, modulele în ordine |
| `bottom-nav-stories` | jos, iconițe + etichete | banda `stories` sus, apoi modulele |
| `simple-tiles` | fără meniu; plăci mari pe ecranul principal | grilă de 2 coloane cu modulele vizibile, plăcile generate primele |

Schimbarea șablonului păstrează `theme`, `modules` (vizibilitate, ordine) și elementele generate.
