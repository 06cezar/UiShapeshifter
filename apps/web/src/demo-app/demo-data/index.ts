// Datele de test ale aplicației demo: 4 contacte, 10 mesaje, 12 poze (specs/12, „Ce pregătim”).
// B4 le importă de aici (demo-app/demo-data; „data/” e ignorat de .gitignore); id-urile sunt cele din specs/04.

export type { Contact, Message, Photo } from "./types";
export { DEMO_CONTACTS } from "./contacts";
export { DEMO_MESSAGES } from "./messages";
export { DEMO_PHOTOS } from "./photos";

import { DEMO_CONTACTS } from "./contacts";
import { DEMO_MESSAGES } from "./messages";
import { DEMO_PHOTOS } from "./photos";
import type { Contact, Message, Photo } from "./types";

export function contactById(id: string): Contact | undefined {
  return DEMO_CONTACTS.find((contact) => contact.id === id);
}

export function photoById(id: string): Photo | undefined {
  return DEMO_PHOTOS.find((photo) => photo.id === id);
}

/** Conversația cu un contact, de la cel mai vechi la cel mai nou mesaj. */
export function messagesWith(contactId: string): Message[] {
  return DEMO_MESSAGES.filter((message) => message.contactId === contactId).sort((a, b) =>
    a.sentAt.localeCompare(b.sentAt),
  );
}

/** Lista de conversații: ultimul mesaj de la fiecare contact, cele mai recente primele. */
export function latestMessagePerContact(): Message[] {
  const latest = new Map<string, Message>();
  for (const message of DEMO_MESSAGES) {
    const current = latest.get(message.contactId);
    if (!current || message.sentAt > current.sentAt) latest.set(message.contactId, message);
  }
  return [...latest.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export function unreadCount(contactId: string): number {
  return DEMO_MESSAGES.filter((message) => message.contactId === contactId && !message.read).length;
}
