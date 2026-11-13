// Tipurile datelor de test ale aplicației demo (mesaje, poze, contacte). Sunt doar ale frontend-ului,
// nu trec prin server, deci nu sunt în packages/contracts. Id-urile urmează specs/04 (chat.<contactId>,
// photos.item.<photoId>, contacts.<contactId>) și rămân stabile, ca agentul și mascota să le poată arăta.

export interface Contact {
  id: string; // ex. "ana"; folosit în data-agent-id și în acțiunile din catalog (openChat, call)
  name: string;
  relation: string; // „nepoata”, „fiul”… — ajută omul să recunoască persoana
  avatar: string; // imagine generată (data URI SVG), fără persoane reale
  phone: string; // număr de test
  favorite: boolean;
}

export interface Message {
  id: string;
  contactId: string;
  from: "me" | "contact";
  text: string;
  sentAt: string; // ISO
  read: boolean;
  photoId?: string; // poză atașată
}

export interface Photo {
  id: string; // ex. "p04-tort"; folosit în photos.item.<id>
  title: string; // eticheta scurtă de sub poză
  alt: string; // descrierea pentru cititorul de ecran
  src: string; // imagine generată (data URI SVG)
  takenAt: string; // ISO
  fromContactId?: string; // cine a trimis-o
}
