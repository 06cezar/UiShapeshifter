// Textele popup-ului care depind de un număr: româna acordă diferit la 1, 2–19 și de la 20 în sus („de”).

/** „o schimbare salvată”, „2 schimbări salvate”, „20 de schimbări salvate”. */
export function savedChangesText(count: number): string {
  if (count === 1) return "o schimbare salvată";
  const rest = count % 100;
  return rest === 0 || rest >= 20 ? `${count} de schimbări salvate` : `${count} schimbări salvate`;
}
