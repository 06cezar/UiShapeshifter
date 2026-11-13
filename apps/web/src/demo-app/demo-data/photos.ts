// Cele 12 poze de test (specs/12): scene desenate, fără persoane. Id-urile sunt stabile: photos.item.<id>.

import { flower, ground, photoSvg, sky, sun, tree } from "./svg";
import type { Photo } from "./types";

export const DEMO_PHOTOS: Photo[] = [
  {
    id: "p01-gradina",
    title: "Grădina",
    alt: "Flori roșii, galbene și mov într-o grădină, sub cerul albastru.",
    src: photoSvg(
      sky("#8fd3ff", "#d8f1ff") +
        sun(330, 60, 30) +
        ground(200, "#6dbb5a") +
        flower(80, 190, "#e53935") +
        flower(150, 205, "#fdd835") +
        flower(220, 190, "#8e24aa") +
        flower(290, 210, "#e53935"),
    ),
    takenAt: "2026-06-14T10:20:00.000Z",
    fromContactId: "ana",
  },
  {
    id: "p02-mare",
    title: "La mare",
    alt: "Marea albastră cu valuri mici, nisip galben și soarele sus.",
    src: photoSvg(
      sky("#5ec2ff", "#cdeeff") +
        sun(80, 70, 34) +
        `<rect y="160" width="400" height="70" fill="#1e88e5"/>` +
        `<path d="M0 175 Q25 165 50 175 T100 175 T150 175 T200 175 T250 175 T300 175 T350 175 T400 175" ` +
        `stroke="#bbdefb" stroke-width="4" fill="none"/>` +
        ground(230, "#f2d388"),
    ),
    takenAt: "2026-08-02T15:00:00.000Z",
    fromContactId: "ion",
  },
  {
    id: "p03-munte",
    title: "La munte",
    alt: "Munți înalți cu vârfuri albe de zăpadă și o pădure de brazi la poale.",
    src: photoSvg(
      sky("#9ecbff", "#eef6ff") +
        `<polygon points="0,250 110,80 220,250" fill="#7d8fa3"/>` +
        `<polygon points="150,250 270,60 400,250" fill="#5f7187"/>` +
        `<polygon points="110,80 135,118 85,118" fill="#ffffff"/>` +
        `<polygon points="270,60 298,104 242,104" fill="#ffffff"/>` +
        ground(240, "#3f7d46"),
    ),
    takenAt: "2026-07-20T09:00:00.000Z",
    fromContactId: "ion",
  },
  {
    id: "p04-tort",
    title: "Tortul Anei",
    alt: "Un tort roz cu trei lumânări aprinse, pe o masă de lemn.",
    src: photoSvg(
      `<rect width="400" height="300" fill="#fff4e6"/>` +
        ground(230, "#b9834a") +
        `<rect x="120" y="150" width="160" height="80" rx="10" fill="#f48fb1"/>` +
        `<rect x="120" y="150" width="160" height="18" rx="8" fill="#fce4ec"/>` +
        [160, 200, 240]
          .map(
            (x) =>
              `<rect x="${x - 4}" y="118" width="8" height="32" fill="#90caf9"/>` +
              `<ellipse cx="${x}" cy="110" rx="6" ry="10" fill="#ffb300"/>`,
          )
          .join(""),
    ),
    takenAt: "2026-10-05T17:30:00.000Z",
    fromContactId: "ana",
  },
  {
    id: "p05-pisica",
    title: "Pisica Mițu",
    alt: "O pisică portocalie stă pe o pernă albastră.",
    src: photoSvg(
      `<rect width="400" height="300" fill="#f3efe7"/>` +
        `<ellipse cx="200" cy="250" rx="140" ry="30" fill="#5c8dd6"/>` +
        `<ellipse cx="200" cy="200" rx="80" ry="55" fill="#f0a04b"/>` +
        `<circle cx="200" cy="125" r="45" fill="#f0a04b"/>` +
        `<polygon points="165,95 175,55 195,90" fill="#f0a04b"/>` +
        `<polygon points="205,90 225,55 235,95" fill="#f0a04b"/>` +
        `<circle cx="185" cy="122" r="6" fill="#2b2b2b"/><circle cx="215" cy="122" r="6" fill="#2b2b2b"/>` +
        `<polygon points="194,138 206,138 200,146" fill="#d4566b"/>`,
    ),
    takenAt: "2026-09-11T12:00:00.000Z",
    fromContactId: "maria-v",
  },
  {
    id: "p06-casa",
    title: "Casa de la țară",
    alt: "O casă albă cu acoperiș roșu și un măr în curte.",
    src: photoSvg(
      sky("#a8dcff", "#e6f6ff") +
        ground(220, "#78c26a") +
        `<rect x="140" y="140" width="140" height="90" fill="#fafafa"/>` +
        `<polygon points="125,145 210,85 295,145" fill="#c62828"/>` +
        `<rect x="195" y="180" width="30" height="50" fill="#8d6e63"/>` +
        `<rect x="155" y="160" width="28" height="24" fill="#90caf9"/>` +
        `<rect x="240" y="160" width="28" height="24" fill="#90caf9"/>` +
        tree(70, 190),
    ),
    takenAt: "2026-05-01T11:00:00.000Z",
    fromContactId: "ion",
  },
  {
    id: "p07-apus",
    title: "Apus",
    alt: "Soarele apune portocaliu peste un câmp de grâu.",
    src: photoSvg(sky("#ff8a50", "#ffe0b2") + sun(200, 200, 60, "#ff7043") + ground(200, "#d4a843")),
    takenAt: "2026-08-25T19:40:00.000Z",
  },
  {
    id: "p08-flori-vaza",
    title: "Flori de ziua mea",
    alt: "Un buchet de flori roșii și galbene într-o vază albastră.",
    src: photoSvg(
      `<rect width="400" height="300" fill="#fdf6ec"/>` +
        flower(170, 100, "#e53935") +
        flower(200, 85, "#fdd835") +
        flower(230, 100, "#e53935") +
        `<path d="M160 150 L240 150 L225 260 L175 260 Z" fill="#3f6fd8"/>`,
    ),
    takenAt: "2026-03-08T09:30:00.000Z",
    fromContactId: "ana",
  },
  {
    id: "p09-brad",
    title: "Bradul de Crăciun",
    alt: "Un brad verde împodobit cu globuri colorate și o stea galbenă în vârf.",
    src: photoSvg(
      `<rect width="400" height="300" fill="#1f3a5f"/>` +
        ground(260, "#f5f5f5") +
        `<polygon points="200,50 120,160 280,160" fill="#2e7d32"/>` +
        `<polygon points="200,100 100,240 300,240" fill="#2e7d32"/>` +
        `<rect x="188" y="240" width="24" height="25" fill="#6d4c41"/>` +
        `<polygon points="200,30 207,48 226,48 211,59 217,77 200,66 183,77 189,59 174,48 193,48" fill="#ffd54f"/>` +
        [
          [170, 140, "#e53935"],
          [225, 130, "#29b6f6"],
          [150, 210, "#fdd835"],
          [205, 190, "#e53935"],
          [250, 215, "#ab47bc"],
        ]
          .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="9" fill="${c}"/>`)
          .join(""),
    ),
    takenAt: "2025-12-24T18:00:00.000Z",
    fromContactId: "ion",
  },
  {
    id: "p10-lac",
    title: "Barca pe lac",
    alt: "O barcă mică de lemn pe un lac liniștit, cu copaci pe mal.",
    src: photoSvg(
      sky("#b3e5fc", "#e1f5fe") +
        ground(130, "#4caf50") +
        `<rect y="160" width="400" height="140" fill="#4fa3d9"/>` +
        tree(60, 110) +
        tree(340, 110, "#2f7a3b") +
        `<path d="M150 210 L250 210 L235 235 L165 235 Z" fill="#8d5a33"/>` +
        `<line x1="200" y1="150" x2="200" y2="210" stroke="#5d4037" stroke-width="4"/>` +
        `<polygon points="203,155 203,200 240,200" fill="#fafafa"/>`,
    ),
    takenAt: "2026-07-04T16:15:00.000Z",
  },
  {
    id: "p11-parc",
    title: "Banca din parc",
    alt: "O bancă verde în parc, între doi copaci, toamna.",
    src: photoSvg(
      sky("#c5e1ff", "#f3f9ff") +
        ground(210, "#8bc34a") +
        tree(80, 170, "#e08a2e") +
        tree(320, 170, "#d84315") +
        `<rect x="140" y="190" width="120" height="12" fill="#2e7d32"/>` +
        `<rect x="140" y="170" width="120" height="10" fill="#2e7d32"/>` +
        `<rect x="148" y="202" width="8" height="28" fill="#424242"/>` +
        `<rect x="244" y="202" width="8" height="28" fill="#424242"/>`,
    ),
    takenAt: "2026-10-18T14:00:00.000Z",
    fromContactId: "maria-v",
  },
  {
    id: "p12-catel",
    title: "Cățelul Azor",
    alt: "Un cățel maro cu urechi lungi, pe iarbă, cu o minge roșie.",
    src: photoSvg(
      sky("#bfe6ff", "#effaff") +
        ground(200, "#7cc46b") +
        `<ellipse cx="200" cy="200" rx="70" ry="40" fill="#8d6e63"/>` +
        `<circle cx="150" cy="150" r="38" fill="#8d6e63"/>` +
        `<ellipse cx="125" cy="160" rx="12" ry="28" fill="#5d4037"/>` +
        `<ellipse cx="175" cy="160" rx="12" ry="28" fill="#5d4037"/>` +
        `<circle cx="140" cy="145" r="5" fill="#212121"/><circle cx="160" cy="145" r="5" fill="#212121"/>` +
        `<circle cx="150" cy="162" r="6" fill="#212121"/>` +
        `<circle cx="300" cy="230" r="18" fill="#e53935"/>`,
    ),
    takenAt: "2026-11-01T10:00:00.000Z",
    fromContactId: "ana",
  },
];
