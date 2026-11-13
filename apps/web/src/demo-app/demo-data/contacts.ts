// Cele 4 contacte de test din specs/04. Nume inventate, numere de test, avatare desenate.

import { avatarSvg } from "./svg";
import type { Contact } from "./types";

export const DEMO_CONTACTS: Contact[] = [
  {
    id: "ana",
    name: "Ana",
    relation: "nepoata",
    avatar: avatarSvg("A", "#ffd6e0", "#c2185b"),
    phone: "0700 000 001",
    favorite: true,
  },
  {
    id: "ion",
    name: "Ion",
    relation: "fiul",
    avatar: avatarSvg("I", "#d6e8ff", "#1565c0"),
    phone: "0700 000 002",
    favorite: true,
  },
  {
    id: "maria-v",
    name: "Maria V.",
    relation: "vecina",
    avatar: avatarSvg("MV", "#e2f5d6", "#2e7d32"),
    phone: "0700 000 003",
    favorite: false,
  },
  {
    id: "dr-popescu",
    name: "Dr. Popescu",
    relation: "medicul de familie",
    avatar: avatarSvg("DP", "#fff1cc", "#b26a00"),
    phone: "0700 000 004",
    favorite: false,
  },
];
