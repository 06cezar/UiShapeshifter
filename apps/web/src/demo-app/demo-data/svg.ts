// Imaginile datelor de test sunt desene SVG generate în cod: fără fișiere, fără persoane reale (CLAUDE.md).
// Culorile de aici sunt conținutul pozelor, nu ale interfeței, deci nu vin din temă.

/** Ce intră într-un <img src>: SVG-ul codat ca data URI. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PHOTO_WIDTH = 400;
const PHOTO_HEIGHT = 300;
const AVATAR_SIZE = 120;

export function photoSvg(body: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PHOTO_WIDTH} ${PHOTO_HEIGHT}">${body}</svg>`,
  );
}

/** Avatar: cerc colorat, o siluetă simplă și inițialele, ca omul să recunoască persoana și fără poză. */
export function avatarSvg(initials: string, background: string, accent: string): string {
  const half = AVATAR_SIZE / 2;
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}">` +
      `<circle cx="${half}" cy="${half}" r="${half}" fill="${background}"/>` +
      `<circle cx="${half}" cy="46" r="22" fill="${accent}" opacity="0.55"/>` +
      `<path d="M22 112 Q${half} 62 98 112 Z" fill="${accent}" opacity="0.55"/>` +
      `<text x="${half}" y="${half + 12}" text-anchor="middle" font-family="sans-serif" font-size="36" ` +
      `font-weight="700" fill="#1a1a1a">${initials}</text>` +
      `</svg>`,
  );
}

// ---------- piese de decor refolosite în poze ----------

export const sky = (top: string, bottom: string) =>
  `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/>` +
  `<stop offset="1" stop-color="${bottom}"/></linearGradient></defs>` +
  `<rect width="${PHOTO_WIDTH}" height="${PHOTO_HEIGHT}" fill="url(#sky)"/>`;

export const sun = (cx: number, cy: number, r: number, color = "#ffd34d") =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;

export const ground = (y: number, color: string) =>
  `<rect y="${y}" width="${PHOTO_WIDTH}" height="${PHOTO_HEIGHT - y}" fill="${color}"/>`;

export const flower = (x: number, y: number, petal: string) =>
  `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 40}" stroke="#3d8b3d" stroke-width="4"/>` +
  [0, 72, 144, 216, 288]
    .map(
      (angle) =>
        `<ellipse cx="${x}" cy="${y - 10}" rx="7" ry="13" fill="${petal}" transform="rotate(${angle} ${x} ${y})"/>`,
    )
    .join("") +
  `<circle cx="${x}" cy="${y}" r="6" fill="#f5c542"/>`;

export const tree = (x: number, y: number, crown = "#3f8f4a") =>
  `<rect x="${x - 6}" y="${y}" width="12" height="40" fill="#7a5230"/>` +
  `<circle cx="${x}" cy="${y - 10}" r="32" fill="${crown}"/>`;
