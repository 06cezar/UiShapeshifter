// Datele de test se țin între ele: cantitățile din specs/12, id-urile din specs/04, legături valide.

import { describe, expect, test } from "vitest";
import {
  DEMO_CONTACTS,
  DEMO_MESSAGES,
  DEMO_PHOTOS,
  latestMessagePerContact,
  messagesWith,
  photoById,
  unreadCount,
} from "./index";

const SPEC_CONTACT_IDS = ["ana", "ion", "maria-v", "dr-popescu"];
/** Id-ul ajunge în data-agent-id (photos.item.<id>, chat.<id>): fără puncte sau spații. */
const SAFE_ID = /^[a-z0-9-]+$/;

const unique = (ids: string[]) => new Set(ids).size === ids.length;

describe("datele de test", () => {
  test("cantitățile din specs/12: 4 contacte, 10 mesaje, 12 poze", () => {
    expect(DEMO_CONTACTS).toHaveLength(4);
    expect(DEMO_MESSAGES).toHaveLength(10);
    expect(DEMO_PHOTOS).toHaveLength(12);
  });

  test("contactele au id-urile din specs/04", () => {
    expect(DEMO_CONTACTS.map((c) => c.id)).toEqual(SPEC_CONTACT_IDS);
  });

  test("id-urile sunt unice și se pot pune în data-agent-id", () => {
    for (const ids of [DEMO_CONTACTS.map((c) => c.id), DEMO_MESSAGES.map((m) => m.id), DEMO_PHOTOS.map((p) => p.id)]) {
      expect(unique(ids)).toBe(true);
      for (const id of ids) expect(id).toMatch(SAFE_ID);
    }
  });

  test("mesajele și pozele trimit doar spre contacte și poze care există", () => {
    const contactIds = new Set(DEMO_CONTACTS.map((c) => c.id));
    for (const message of DEMO_MESSAGES) {
      expect(contactIds.has(message.contactId)).toBe(true);
      if (message.photoId) expect(photoById(message.photoId)).toBeDefined();
    }
    for (const photo of DEMO_PHOTOS) {
      if (photo.fromContactId) expect(contactIds.has(photo.fromContactId)).toBe(true);
    }
  });

  test("fiecare poză și avatar e o imagine SVG, iar pozele au descriere pentru cititorul de ecran", () => {
    for (const photo of DEMO_PHOTOS) {
      expect(photo.src).toMatch(/^data:image\/svg\+xml/);
      expect(decodeURIComponent(photo.src)).toContain("<svg");
      expect(photo.alt.length).toBeGreaterThan(10);
      expect(photo.title.length).toBeGreaterThan(0);
    }
    for (const contact of DEMO_CONTACTS) expect(contact.avatar).toMatch(/^data:image\/svg\+xml/);
  });

  test("datele sunt ISO valide", () => {
    for (const date of [...DEMO_MESSAGES.map((m) => m.sentAt), ...DEMO_PHOTOS.map((p) => p.takenAt)]) {
      expect(Number.isNaN(Date.parse(date))).toBe(false);
    }
  });
});

describe("ajutoarele pentru ecrane", () => {
  test("conversația cu Ana e în ordine și se termină cu mesajul necitit", () => {
    const chat = messagesWith("ana");
    expect(chat.map((m) => m.id)).toEqual(["m06", "m07", "m08", "m09", "m10"]);
    expect(unreadCount("ana")).toBe(1);
  });

  test("lista de conversații are câte un rând pe contact, cele mai recente primele", () => {
    const list = latestMessagePerContact();
    expect(list.map((m) => m.contactId)).toEqual(["ana", "ion", "maria-v", "dr-popescu"]);
  });
});
