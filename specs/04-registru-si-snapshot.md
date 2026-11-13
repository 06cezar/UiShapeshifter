# Registrul paginii și snapshot-ul (etapa 1)

Tipurile: `packages/contracts/src/page-snapshot.ts` (`PageSnapshot`, `PageRegion`, `PageElement`, `SNAPSHOT_LIMITS`).
`snapshot.ts` (`UISnapshot`, `data-agent-id` pe elementele aplicației vechi) rămâne cât mai există aplicația veche.

## Id-uri

- **Elementele site-ului** nu au atributele noastre. Registrul le dă id-uri în memorie: `e.<n>` pentru elemente, `r.<nume>`
  pentru zone. Un id rămâne același cât timp elementul e același (registrul ține un `WeakMap` element → id), chiar dacă
  pagina se schimbă. Nu scriem atribute pe elementele site-ului.
- **Elementele noastre** (mascota, chatul, panoul, plăcile generate) au `data-agent-id` și stau în shadow DOM-ul extensiei.
  Auditul și snapshot-ul le exclud.
- Id-urile sunt valabile doar în pagina curentă și nu se salvează în rețetă. Rețeta salvează **selectori**.

## Selectorul

Fiecare `PageElement` are un `selector` pe care agentul îl pune în CSS. Registrul îl construiește în ordinea:

1. `#id`, dacă id-ul pare scris de om (nu are cifre lungi sau fragmente aleatoare);
2. rol și etichetă: `[aria-label="…"]`, `[role="…"]`, `[data-testid="…"]`, `a[href^="/shorts"]`;
3. etichetă + poziție structurală: `nav > ul > li:nth-child(3)`.

Nu folosește clase generate (`.css-1x2y3z`, `.sc-abc`), fiindcă se schimbă la fiecare publicare a site-ului. Dacă n-are
nimic stabil, `selector` e calea structurală; agentul știe că e fragilă din faptul că începe cu `body >`.

## Rezumatul (`get_page_snapshot`)

Pagina are mii de elemente; modelul primește un rezumat:

1. **Zone** (`regions`): `banner`, `navigation`, `main`, `complementary`, `contentinfo`, `region`, după rol ARIA sau
   etichetă HTML5; fiecare cu `elementCount` (câte elemente conține, și cele netrimise).
2. **Elemente** (`elements`): titlurile și elementele interactive (linkuri, butoane, câmpuri) **vizibile**, cu text
   scurt (`SNAPSHOT_LIMITS.labelMaxChars`), cel mult `SNAPSHOT_LIMITS.maxElements`. Ordinea: în viewport întâi, apoi
   după zonă. Dacă sunt mai multe, `truncated: true`.
3. **Detalii pe zonă:** `get_page_snapshot({ regionId })` întoarce doar zona aceea, tot cu limita de elemente.
4. **Rețeta curentă:** `recipe.revision` și `recipe.css` (tăiat la `SNAPSHOT_LIMITS.maxRecipeCssChars`), ca agentul să
   știe ce a schimbat deja.
5. **Elementele ascunse de rețetă** apar cu `visible: false` și `hiddenBy: "recipe"`: așa vede agentul, după
   `apply_css`, că ce voia ascuns a dispărut, și așa deosebește „ascuns de mine” de „ascuns de site”.

Rotunjim coordonatele la întreg. Textul se curăță (spații multiple, taiat la limită). Nu trimitem conținut de câmpuri de
parolă, nici valorile câmpurilor de formular, doar eticheta lor.

## Ce nu intră în snapshot

- elementele noastre și cele din shadow DOM-ul extensiei;
- `<script>`, `<style>`, `<noscript>`, iframe-uri din alt domeniu;
- valorile câmpurilor (`<input>`, `<textarea>`), în special cele de tip `password`.

## Coordonate pentru mascotă

`point_at`, mutarea mascotei și conturul pulsatoriu vin în etapa 2 (D2, B6); se descriu atunci, în D8.
