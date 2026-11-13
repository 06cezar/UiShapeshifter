# Rețeta site-ului: CSS, validare, revizii, undo (etapa 1)

Tipurile: `packages/contracts/src/site-recipe.ts` (`SiteRecipe`, `RecipeRevision`, `RECIPE_LIMITS`, `CssDropped`).
Numele fișierului rămâne `02-ui-config.md` ca linkurile să nu se strice; `UIConfig` e al aplicației vechi, iar
pentru site-uri reale rețeta o înlocuiește. `DomOp` (mută, împachetează, adaugă) vine în D8, ca adăugare.

## Ce e o rețetă

`SiteRecipe { host, revision, css, updatedAt }`: foaia de stil pe care a scris-o agentul pentru un site. Se aplică pe
toate paginile gazdei (`youtube.com`, fără `www.`). `revision` începe de la 0 (rețetă goală) și crește cu 1 la fiecare
schimbare aplicată.

## Cine face ce

| Parte | Unde | Ce face |
|---|---|---|
| **Motorul de rețete** (B) | content script | ține rețeta gazdei, pune `css` într-un `<style>` al extensiei, ține istoricul reviziilor |
| **Validarea CSS** (C) | funcție pură, `apps/web/src/validation/` | `validateCss(css) → { css, dropped }`: scoate ce nu e voie, nu aruncă |
| **Stocarea** (E) | service worker / `chrome.storage.local` | cheia = host; valoarea = `{ recipe, revisions }` |
| **Unealta `apply_css`** (B, cu A) | `agent-bridge` | validează, aplică, răspunde cu `ApplyCssData` |

## Validarea CSS

Se face înainte de aplicare și scoate **regula** care încalcă, nu toată foaia:

| Motiv (`CssDropReason`) | Ce scoate |
|---|---|
| `url-function` | orice `url(...)` (ar putea trimite date în afară) |
| `import` | `@import` |
| `expression` | `expression(...)`, `behavior:`, `-moz-binding` |
| `targets-our-ui` | selectori spre interfața noastră: rădăcina shadow a extensiei, `[data-agent-id]` |
| `unsupported-at-rule` | orice `@` în afară de `@media`, `@supports`, `@keyframes` |
| `syntax` | ce nu se poate citi |

Dacă **nu rămâne nimic** de aplicat, `apply_css` întoarce `INVALID_ARGS` cu lista `dropped` în `details`. Dacă foaia
rezultată depășește `RECIPE_LIMITS.maxCssBytes`, la fel (`INVALID_ARGS`), ca modelul să scurteze. Altfel răspunsul e `ok`
și `dropped` poate fi nenul: ce a rămas s-a aplicat.

## Aplicarea

1. `mode: "append"` (implicit): regulile se adaugă la sfârșitul foii; `"replace"`: foaia se înlocuiește cu totul
   (agentul îl folosește la reparații, ca să scoată o regulă greșită).
2. Se creează revizia `revision + 1` cu `reason` și `runId` și se pune foaia în pagină. Fără reîncărcare.
3. `unmatchedSelectors`: cel mult 10 selectori din regulile noi care nu se potrivesc cu niciun element (agentul își
   verifică singur ghicitul fără alt snapshot). Nu e eroare.
4. O regulă care nu se potrivește cu nimic nu strică pagina; rămâne în rețetă, fiindcă site-ul poate încărca elementul
   mai târziu.

## Reaplicarea fără AI

- La încărcarea paginii, content script-ul citește rețeta gazdei din stocare și pune `<style>` la `document_start`,
  înainte să se vadă pagina. Fără apel la server, fără model.
- Site-urile care își schimbă singure conținutul (aplicații de o pagină) nu au nevoie de reaplicare: o foaie de stil
  se aplică și elementelor apărute după.
- Dacă gazda are o rețetă dar `<style>` a fost scos de site, motorul îl pune la loc (observer pe `<head>`).

## Istoric și undo

- Se păstrează cel mult `RECIPE_LIMITS.maxRevisions` revizii (`RecipeRevision`) pe gazdă, cele vechi se aruncă.
- **Anulez** (etapa 2, panoul): scoate ultima revizie; rețeta devine cea de la `revision - 1`.
- **Revino la original** (etapa 1): golește rețeta gazdei (`revision` 0, `css` gol) și șterge istoricul. Merge oricând,
  inclusiv din popup.
- Fiecare pas din jurnal poartă `recipeRevisionBefore` și `recipeRevisionAfter`, deci panoul știe la ce revizie se
  întoarce.

## Preferințele de bază

Fontul minim, țintele și contrastul din profil se aplică **ultimele**, ca o foaie separată a extensiei, peste ce a scris
agentul, fără AI (`07-accesibilitate.md`, se rescrie în D8). Nu fac parte din rețeta agentului.
