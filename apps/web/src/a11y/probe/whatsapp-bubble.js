// Sondă doar de citire, pentru WhatsApp Web (găsit de E): structura unei bule cu mesaj editat, fără textul mesajelor.
// Rulează în consola paginii (extensia pornită, font 20px) și lipește rezultatul în PR-ul lui C.
(() => {
  const keep = (text) => (/^(Editat|Edited|\d{1,2}:\d{2})$/.test(text) ? text : `[${text.length} caractere]`);
  const marker = [...document.querySelectorAll("span, div")].find(
    (element) => element.childElementCount === 0 && /^(Editat|Edited)$/.test((element.textContent || "").trim()),
  );
  if (!marker) return "Nu găsesc «Editat» pe ecran: deschide o conversație cu un mesaj editat.";
  let bubble = marker;
  for (let i = 0; i < 8 && bubble.parentElement; i++) bubble = bubble.parentElement;
  const lines = [];
  const walk = (element, depth) => {
    const cs = getComputedStyle(element);
    const r = element.getBoundingClientRect();
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === 3 && node.textContent.trim())
      .map((node) => keep(node.textContent.trim()))
      .join(" ");
    lines.push(
      `${"  ".repeat(depth)}<${element.localName}${element.getAttribute("aria-hidden") ? " aria-hidden" : ""}> ` +
        `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} ` +
        `d=${cs.display} p=${cs.position} f=${cs.cssFloat} w=${cs.width} m=${cs.margin} pad=${cs.padding} ` +
        `fs=${cs.fontSize}${element.style.fontSize ? "(inline)" : ""} lh=${cs.lineHeight} v=${cs.visibility} ` +
        `ws=${cs.whiteSpace}${own ? ` «${own}»` : ""}`,
    );
    for (const child of element.children) walk(child, depth + 1);
  };
  walk(bubble, 0);
  return lines.join("\n");
})();
