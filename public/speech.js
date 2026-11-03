// Spoken versions of what the screen shows in short form. The screen keeps "13 min" and "2,5 km";
// the "Voorlezen" button and screen readers get "13 minuten" and "2,5 kilometer".

export function forSpeech(t) {
  return String(t)
    .replace(/\p{Extended_Pictographic}️?/gu, "") // emoji
    .replace(/(\d+(?:,\d+)?)\s?km\/u\b/g, "$1 kilometer per uur")
    .replace(/(\d+(?:,\d+)?)\s?m\/s\b/g, "$1 meter per seconde")
    .replace(/(\d+(?:,\d+)?)\s?km\b/g, "$1 kilometer")
    .replace(/(\d+(?:,\d+)?)\s?m\b/g, "$1 meter")
    .replace(/(\d+)\s?u\b/g, "$1 uur")
    .replace(/\b1\s?min\b/g, "1 minuut")
    .replace(/(\d+)\s?min\b/g, "$1 minuten")
    .replace(/(-?\d+)\s?°C/g, "$1 graden")
    .replace(/\((\d+) Bft\)/g, "(windkracht $1)")
    .replace(/\bca\.\s?/g, "ongeveer ")
    .replace(/(\d+)×\s?/g, "$1 ")
    .replace(/(\d+)\s?%/g, "$1 procent")
    .replace(/\s*→\s*/g, " naar ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The short form for the eye, the written-out form for the ear (hidden on screen).
export const dual = (html, plain) => `<span aria-hidden="true">${html}</span><span class="sr-only">${esc(forSpeech(plain))}</span>`;
export const dualText = (text) => dual(esc(text), text);

// What an element says out loud: its written-out parts, or else its text made speakable.
export function spokenText(el) {
  if (!el || el.hidden) return "";
  const parts = [...el.querySelectorAll(".sr-only")].map((n) => n.textContent);
  return parts.length ? parts.join(" ") : forSpeech(el.textContent);
}
