# Asset-urile mascotei

| Fișiere | Ce sunt | Autor | Sursa | Licența |
|---|---|---|---|---|
| `assets/raccoon/*.webp` | cadrele ratonului (idle, walk, crouch, ko, dance) | **null-painter-error** | „Cute raccoon 2d game sprite and animations”, [opengameart.org/node/81109](https://opengameart.org/node/81109) (`raccoon-assets.zip`) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

- **Atribuirea e obligatorie** (CC-BY): „Raccoon art by null-painter-error (opengameart.org/node/81109), CC-BY 4.0”.
  O trecem și în README și în descrierea proiectului.
- Ce am schimbat: din cadrele originale (PNG, 800×800 px) am luat animațiile idle, walk, crouch, ko și victory-dance
  (redenumită `dance`), le-am tăiat la cutia comună în care încape ratonul și le-am micșorat la 200 px înălțime, în WebP.
  `mascot-sprites.ts` le conține ca base64, generat cu `node apps/web/src/mascot/build-sprites.mjs`.
