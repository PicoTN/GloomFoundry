/**
 * Perk wording as HTML: attack values in a circle, Attribute values in a hexagon (the system's
 * own style), and effect keywords as icons when the loaded icon pack has them.
 */
import { describePerk, ICON_WORDS, knownFaces, tokenizeEffect, type CardFace, type EffectToken, type FaceGroup } from "../rules/perk-text.ts";
import type { PerkStep } from "../rules/perks.ts";

const t = (key: string) => game.i18n!.localize(key);
const f = (key: string, data: Record<string, string>) => game.i18n!.format(key, data);

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Effect text with icons from the icon pack (plain words when the pack lacks them). */
export function effectHTML(text: string): string {
  return tokenizeEffect(text).map(tokenHTML).join("");
}

const img = (src: string, label: string) =>
  `<img class="gloom-inline-icon" src="${escape(src)}" alt="${escape(label)}" data-tooltip="${escape(label)}">`;

function tokenHTML(tok: EffectToken): string {
  if ("text" in tok) return escape(tok.text);
  if ("infuse" in tok) {
    const srcs = tok.infuse.map((e) => CONFIG.GLOOM?.icons[`element.${e}`]);
    if (srcs.some((s) => !s)) return escape(tok.label);
    // Like the book: the element icons alone, "/" meaning either.
    return `<span class="gloom-infuse" data-tooltip="${escape(tok.label)}">${srcs.map((s, i) => img(s!, tok.infuse[i]!)).join("/")}</span>`;
  }
  const src = CONFIG.GLOOM?.icons[tok.icon];
  return src ? img(src, tok.label) : escape(tok.label);
}

/** Item types whose rules text gets icons when enriched. */
const ICON_ITEM_TYPES = new Set(["skill", "talent", "equipment", "npcAction", "perk"]);

/**
 * Text enricher: game keywords in power, item and NPC action texts become icons from the icon
 * pack (only for those items, or when enrichHTML is called with `gloomIcons: true`).
 */
export function registerIconEnricher(): void {
  CONFIG.TextEditor.enrichers.push({
    id: "gloomIcons",
    pattern: new RegExp(ICON_WORDS.source, "g"),
    enricher: async (match: RegExpMatchArray, options?: { relativeTo?: { documentName?: string; type?: string }; gloomIcons?: boolean }) => {
      const rel = options?.relativeTo;
      const wanted = options?.gloomIcons || (rel?.documentName === "Item" && ICON_ITEM_TYPES.has(rel.type ?? ""));
      if (!wanted || !Object.keys(CONFIG.GLOOM?.icons ?? {}).length) return null;
      const html = tokenizeEffect(match[0]).map(tokenHTML).join("");
      if (!html.includes("<img")) return null;
      const span = document.createElement("span");
      span.className = "gloom-iconized";
      span.innerHTML = html;
      return span;
    },
  } as never);
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
