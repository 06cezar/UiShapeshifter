# Elemente generate la cerere

Tipurile: `packages/contracts/src/components.ts`.

Agentul poate adăuga în interfață elemente care nu existau: o placă „Sună-o pe Ana”, o listă „Mesaje necitite”,
o grilă cu contactele favorite, un card de ajutor. **Nu scrie HTML, CSS sau JavaScript:** compune un arbore
`ComponentSpec` din catalog, iar `ComponentRenderer` îl randează cu componentele aplicației.

## De ce așa

- **Siguranță:** nu rulăm cod generat de model.
- **Accesibilitate garantată:** componentele din catalog respectă tema, fontul minim, mărimea țintelor și au etichete.
- **Agentul le vede:** fiecare nod primește `data-agent-id="gen.<id>"` și intră în registru.

## Catalogul

| Tip | Props | Acțiune | Note |
|---|---|---|---|
| `stack`, `row` | – | – | containere |
| `grid` | `columns` 1–4 | – | coloanele scad automat pe ecran îngust |
| `card` | `text` (titlu) | – | |
| `heading`, `text` | `text` | – | `text` ≤ 120 caractere |
| `button` | `label`, `icon`, `tone`, `size` | da | `label` obligatoriu |
| `shortcut` | `label`, `icon`, `size` (implicit `xl`) | da | buton mare, pentru acțiunile frecvente |
| `contactTile` | `contactId`, `size` | da (implicit `openChat`) | poza + numele din datele de test |
| `image` | `src`, `alt` | – | `alt` obligatoriu, `src` doar din datele de test |
| `list` | `source`, `limit` | – | legată la date (`contacts.favorites`, `messages.unread`…) |
| `badge`, `divider` | `text` | – | |

Acțiunile permise (`AppAction`): `navigate`, `openChat`, `call`, `sendPhoto`, `openSettings`, `askAgent`.

## Validare (în frontend, înainte de randare)

- adâncime ≤ 4, cel mult 30 de noduri (`COMPONENT_LIMITS`)
- id-uri unice; tip din catalog; `label`/`alt` prezente unde sunt obligatorii
- `contactId`, `moduleId`, `source` există în aplicație
- o greșeală → `INVALID_ARGS` cu mesajul exact („contactId „ana2” nu există; contacte: ana, ion, maria-v”)

## Exemple

Placă pentru apel rapid, pe ecranul principal:

```json
{
  "component": {
    "id": "call-ana", "type": "shortcut",
    "props": { "label": "Sună-o pe Ana", "icon": "phone", "size": "xl", "tone": "primary" },
    "action": { "kind": "call", "contactId": "ana" }
  },
  "placement": { "moduleId": "home", "position": "top" },
  "reason": "Maria o sună des pe Ana; acum îi ia 4 click-uri."
}
```

Modul nou, „Familia”:

```json
{
  "component": {
    "id": "family", "type": "stack",
    "children": [
      { "id": "family-title", "type": "heading", "props": { "text": "Familia" } },
      { "id": "family-grid", "type": "grid", "props": { "columns": 2 }, "children": [
        { "id": "family-ana", "type": "contactTile", "props": { "contactId": "ana", "size": "l" } },
        { "id": "family-ion", "type": "contactTile", "props": { "contactId": "ion", "size": "l" } }
      ]},
      { "id": "family-unread", "type": "list", "props": { "source": "messages.unread", "limit": 3 } }
    ]
  },
  "placement": { "newModule": { "title": "Familia" } },
  "reason": "Vorbește aproape doar cu Ana și Ion."
}
```

## Randare

- Mărimile vin din temă: `size: "xl"` = înălțime ≥ `max(minTargetPx, 64px)`, font `base * scale`.
- Apariția e animată (fade + scale, 200 ms), fără salt de layout.
- Un element generat are în colț un mic semn „creat de vulpiță” (tooltip: de ce a fost creat, din `reason`),
  ca omul să știe ce e nou. Se poate șterge din meniul lui sau cerând mascotei.
