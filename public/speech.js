// Spoken versions of what the screen shows in short form, in the current language. The screen keeps
// "13 min" and "2,5 km"; the "Voorlezen" button and screen readers get "13 minuten" and "2,5 kilometer".
import { dict, t } from "./i18n.js";

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export function forSpeech(text) {
  let s = String(text).replace(/\p{Extended_Pictographic}️?/gu, ""); // emoji
  const num = "(\\d+(?:[.,]\\d+)?)";
  s = s.replace(new RegExp(`\\b1\\s?${escRe(dict()["u.min"])}(?![\\p{L}])`, "gu"), t("sp.oneMin"));
  // Units, longest first (km/u before km before m), only right after a number.
  for (const [abbr, word] of dict().speech) {
    s = s.replace(new RegExp(`${num}\\s?${escRe(abbr)}(?![\\p{L}\\p{N}])`, "gu"), `$1 ${word}`);
  }
  return s
    .replace(/\((\d+) Bft\)/g, (_, n) => `(${t("sp.bft", { n })})`)
    .replace(/\bca\.\s?/g, `${t("sp.about")} `)
    .replace(/(\d+)\s?×\s?/g, "$1 ")
    .replace(/(\d+)\s?%/g, `$1 ${t("sp.percent")}`)
    .replace(/\s*→\s*/g, ` ${t("sp.to")} `)
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
