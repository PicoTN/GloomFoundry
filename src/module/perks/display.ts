/**
 * Perk wording as HTML: attack values in a circle, Attribute values in a hexagon (the system's
 * own style), and effect keywords as icons when the loaded icon pack has them.
 */
import { describePerk, knownFaces, tokenizeEffect, type CardFace, type FaceGroup } from "../rules/perk-text.ts";
import type { PerkStep } from "../rules/perks.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Effect text with icons from the icon pack (plain words when the pack lacks them). */
export function effectHTML(text: string): string {
  return tokenizeEffect(text).map((tok) => {
    if ("text" in tok) return escape(tok.text);
    const src = CONFIG.GLOOM?.icons[tok.icon];
    return src
      ? `<img class="gloom-inline-icon" src="${escape(src)}" alt="${escape(tok.label)}" data-tooltip="${escape(tok.label)}">`
      : escape(tok.label);
  }).join("");
}

function attackText(face: CardFace): string {
  if (face.attack.kind === "critical") return "×2";
  if (face.attack.kind === "null") return t("GLOOM.Card.null");
  return face.attack.value < 0 ? `−${-face.attack.value}` : `+${face.attack.value}`;
}

export function faceHTML(face: CardFace): string {
  const kind = face.attack.kind === "number" ? (face.attack.value > 0 ? "pos" : face.attack.value < 0 ? "neg" : "zero") : face.attack.kind;
  return `<span class="gloom-face"><span class="atk ${kind}">${attackText(face)}</span>${
    face.effect ? `<span class="effect">${effectHTML(face.effect)}</span>` : ""}${
    face.attribute !== null ? `<span class="attr">${face.attribute}</span>` : ""}</span>`;
}

function groupsHTML(groups: (FaceGroup | string)[]): string {
  return groups.map((g) => {
    if (typeof g === "string") return escape(g);
    const n = t(`GLOOM.PerkText.count.${g.count}`).startsWith("GLOOM.") ? String(g.count) : t(`GLOOM.PerkText.count.${g.count}`);
    return f(g.count > 1 ? "GLOOM.PerkText.cards" : "GLOOM.PerkText.card", { n, card: faceHTML(g.face) });
  }).join(t("GLOOM.PerkText.and"));
}

/** HTML description of a perk from its steps; "" if it has no cards. */
export function perkHTML(steps: PerkStep[], allPerks: { steps: PerkStep[] }[]): string {
  const lines = describePerk(steps, knownFaces(allPerks));
  return lines.map((line) => {
    const removed = groupsHTML(line.removed);
    const added = groupsHTML(line.added);
    return f(`GLOOM.PerkText.${line.verb}`, { removed, added });
  }).join(" / ");
}
