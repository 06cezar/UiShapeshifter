# Elemente generate la cerere și structura paginii (etapele 2–3)

Tipurile: `packages/contracts/src/dom-ops.ts` (`DomOp`, `PageComponentSpec`, `PageAction`, `ALLOWED_HTML_TAGS`,
`DOM_OP_LIMITS`). Unealta: `apply_ops` (`05`). Cine aplică: motorul de rețete (B6 pentru remove/move/wrap/setText/
setAttr, în `apps/web/src/ui/recipes/dom-ops.ts`; B3 pentru insertHtml/bind/inject). Cine validează: `apps/web/src/validation/`
(C5) pentru HTML și CSS, `dom-ops.ts` pentru forma operațiilor.

Agentul poate **adăuga** în pagina unui site elemente care nu existau (o scurtătură spre pagina de plată, un card cu
trei pași, un bloc „Ce contează azi”) și **reorganiza** ce există. **Nu scrie JavaScript.** Comportamentul vine doar din
`bind` și din acțiunile componentelor din catalog; HTML-ul și CSS-ul trec prin validare.

## Operațiile (`DomOp`)

| `op` | Ce face | Note |
|---|---|---|
| `remove` | **ascunde** elementul: atributul `data-uishapeshifter-hidden` + `display: none !important` dintr-un `<style>` al motorului | **nu** îl scoate din DOM: site-urile cu React se strică la noduri detașate. Pentru agent arată la fel; „Anulez” scoate atributul. Toate potrivirile |
| `move` | mută elementul în `to` (`before` / `after` / `prepend` / `append` față de un selector) | mutare reală; pe locul vechi rămâne un marcaj (comentariu HTML) pentru „Anulez”. Un singur element; `SELECTOR_AMBIGUOUS` dacă selectorul sau ținta prind mai multe |
| `wrap` | pune elementele într-un container nou cu `id` | ca să poată fi așezate cu grid / flex din CSS; fiecare selector prinde exact un element, cu marcaj pe locul vechi |
| `setText` | schimbă textul | ≤ `maxTextChars`; fără HTML; toate potrivirile; doar pe elemente fără alte elemente înăuntru (altfel `INVALID`) |
| `setAttr` | schimbă `aria-label`, `title`, `alt` sau `placeholder` | nu `href`, `src`, `style`, `on*`; toate potrivirile; „Anulez” pune valoarea veche sau scoate atributul |
| `insertHtml` | adaugă HTML scris de agent, curățat | lista permisă de mai jos; rezultatul are `id` |
| `bind` | apăsarea elementului adăugat (`from` = un `id`) apasă elementul real `to` | doar click; asta le dă viață elementelor adăugate |
| `inject` | o componentă din catalog (`PageComponentSpec`) în loc de HTML scris | pentru cazurile obișnuite |

`id`-ul unui element adăugat (`wrap`, `insertHtml`, `inject`) devine `data-shape="<id>"`; agentul îl stilizează cu
`[data-shape="<id>"]` în `apply_css`. Sunt litere mici, cifre și `-`, cel mult `maxShapeIdChars`.

## HTML curățat (`insertHtml`)

Lista permisă: `ALLOWED_HTML_TAGS` (div, span, section, nav, aside, header, footer, main, h1–h4, p, ul, ol, li, a,
button, strong, em, br, hr) și `ALLOWED_HTML_ATTRS` (class, role, title, href, aria-label, aria-hidden, lang).

- O etichetă sau un atribut din afara listei se **scoate**, iar `htmlDropped` spune ce și de ce.
- O `href` care nu începe cu `/`, `#` sau `https://` (ex. `javascript:`, `data:`) **respinge operația întreagă**.
- Fără `<script>`, `<iframe>`, `<img>`, `<video>`, `<form>`, `<input>`, fără `style` și fără atribute `on*`: nu încărcăm
  resurse din afară și nu rulăm cod.
- Cel mult `maxHtmlBytes`. Un `<a>` adăugat duce doar spre aceeași origine sau `https://`; apăsarea lui obișnuită e
  navigare, nu cod.
- Elementul adăugat se pune în DOM-ul site-ului (ca să poată fi stilizat de CSS-ul rețetei și așezat în layout), nu în
  shadow DOM-ul nostru; are atributul `data-shape` și e urmărit de motor.

## Componentele din catalog (`inject`)

Catalogul din `components.ts`, fără `contactTile`, `list` și `image` (ținteau aplicația veche): `stack`, `row`, `grid`,
`card`, `heading`, `text`, `button`, `shortcut`, `badge`, `divider`. Aceleași limite ca la HTML (`COMPONENT_LIMITS`:
adâncime ≤ 4, ≤ 30 de noduri, text ≤ 120 de caractere).

Acțiuni (`PageAction`), doar acestea:

- `click { selector }`: apasă elementul real al site-ului (ca `bind`);
- `navigate { path }`: o pagină a aceluiași site (cale care începe cu `/`);
- `askAgent { goal }`: pornește agentul cu un scop.

Randare: componentele noastre se randează cu stilul nostru (tema), în DOM-ul site-ului, izolate de CSS-ul lui prin
`all: revert-layer` pe rădăcina lor, ca să arate la fel pe orice site. Fiecare are `data-agent-id="gen.<id>"`.

## Exemple

Scurtătură spre „Plătește factura”, legată de butonul real:

```json
{
  "ops": [
    { "op": "inject", "id": "pay-shortcut",
      "component": { "id": "pay", "type": "shortcut",
        "props": { "label": "Plătește factura", "icon": "send", "size": "xl", "tone": "primary" },
        "action": { "kind": "click", "selector": "a[href='/billing/pay']" } },
      "at": { "selector": "main", "position": "prepend" } }
  ],
  "reason": "Omul vrea doar să plătească factura; butonul real e îngropat în meniu."
}
```

Mutarea căutării sus și împachetarea a două blocuri:

```json
{
  "ops": [
    { "op": "move", "selector": "[role='search']", "to": { "selector": "body", "position": "prepend" } },
    { "op": "wrap", "selectors": ["#sidebar-recent", "#sidebar-saved"], "id": "side-group" }
  ],
  "reason": "Căutarea e lucrul principal; blocurile din coloană le grupez ca să le pot așeza împreună."
}
```

## Reaplicarea și ce nu merge

- Operațiile sunt în `SiteRecipe.ops`, în ordinea aplicării. În rețetă intră **doar operațiile aplicate**; cele sărite
  sunt în `skipped`. Dacă nu s-a aplicat niciuna, `apply_ops` răspunde tot `ok`, cu `applied: 0`, iar revizia nu crește.
- **Sincronizare completă** la încărcare, „Anulez” (`revertTo`), „Revino la original” și o rețetă venită din alt tab sau
  din popup: motorul anulează tot ce a aplicat (în ordine inversă), apoi aplică toată lista, în ordine.
- **Pagina își schimbă singură conținutul** (`MutationObserver`, după `REAPPLY_DEBOUNCE_MS`): motorul NU anulează tot,
  ci aplică, în ordinea din rețetă, doar operațiile care lipsesc. Schimbările făcute de motor nu-l pornesc din nou.
- **Limita anti-buclă** numără doar refacerile: o operație deja aplicată pe care site-ul a stricat-o (ex. și-a randat
  din nou elementul). Peste `MAX_REPAIRS_PER_WINDOW` în `REPAIR_WINDOW_MS`, motorul lasă stricăciunea până la următoarea
  schimbare a rețetei. O operație al cărei element nu există încă pe pagină (ex. căutarea pe o altă pagină a site-ului)
  se reîncearcă la fiecare schimbare, fără să consume limita.
- O operație al cărei selector nu mai găsește nimic e **sărită** (nu strică pagina); rețeta rămâne.
- Aceeași operație aplicată de două ori → `ALREADY_APPLIED` (nu se dublează elementele).
- Un element adăugat poartă un mic semn „creat de agent” (tooltip cu `reason`), ca omul să știe ce e nou; se poate
  scoate cerând agentului sau din panou.
