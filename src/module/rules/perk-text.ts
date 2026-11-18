/**
 * Structured perk wording, like the class chapters: "Replace one (−2)(1) card with one
 * (+0)(Wound)(2) card." Built from the perk's own steps, so it works for any perk.
 * Effect texts are split into words and icon tokens (conditions, elements, stats).
 */
import { BASE_DECK, type AttackKind } from "./modifier.ts";
import type { PerkStep } from "./perks.ts";
import { formatCardCode, parseCardList } from "./playing-cards.ts";

export interface CardFace {
  attack: { kind: AttackKind; value: number };
  attribute: number | null;
  effect: string;
}
export interface FaceGroup { face: CardFace; count: number }
export interface PerkLine { verb: "replace" | "remove" | "add"; removed: (FaceGroup | string)[]; added: FaceGroup[] }

const faceKey = (f: CardFace) => `${f.attack.kind}:${f.attack.value}:${f.attribute}:${f.effect}`;

/** Card code -> face: the base deck, plus every card added by the given perks. */
export function knownFaces(perks: { steps: PerkStep[] }[]): Map<string, CardFace> {
  const map = new Map<string, CardFace>();
  for (const c of BASE_DECK) {
    map.set(formatCardCode(c.playingCard), { attack: { ...c.attack }, attribute: c.attribute, effect: c.effect });
  }
  for (const p of perks) for (const s of p.steps) for (const a of s.add) {
    const [card] = parseCardList(a.card).cards;
    if (card) map.set(formatCardCode(card), { attack: { kind: a.attackKind, value: a.attackValue }, attribute: a.attribute, effect: a.effect });
  }
  return map;
}

function group<T>(items: T[], key: (t: T) => string): { item: T; count: number }[] {
  const out = new Map<string, { item: T; count: number }>();
  for (const item of items) {
    const k = key(item);
    const g = out.get(k);
    if (g) g.count++;
    else out.set(k, { item, count: 1 });
  }
  return [...out.values()];
}

/** One line per distinct step (boxes doing the same thing collapse into one line). */
export function describePerk(steps: PerkStep[], known: Map<string, CardFace>): PerkLine[] {
  const lines: PerkLine[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    const { cards, invalid } = parseCardList(step.remove);
    const removedFaces = cards.map((c) => known.get(formatCardCode(c)) ?? formatCardCode(c));
    const removed = group(removedFaces, (f) => (typeof f === "string" ? f : faceKey(f)))
      .map((g) => (typeof g.item === "string" ? g.item : { face: g.item, count: g.count }));
    removed.push(...invalid);
    const added = group(step.add.map((a) => ({
      attack: { kind: a.attackKind, value: a.attackValue }, attribute: a.attribute, effect: a.effect,
    }) as CardFace), faceKey).map((g) => ({ face: g.item, count: g.count }));
    if (!removed.length && !added.length) continue;
    const verb = removed.length && added.length ? "replace" : removed.length ? "remove" : "add";
    const line: PerkLine = { verb, removed, added };
    const key = JSON.stringify(line);
    if (!seen.has(key)) { seen.add(key); lines.push(line); }
  }
  return lines;
}

export type EffectToken = { text: string } | { icon: string; label: string } | { infuse: string[]; label: string };

const CONDITIONS = ["Bless", "Curse", "Immobilize", "Invisible", "Muddle", "Pacify", "Poison", "Regenerate", "Safeguard", "Strengthen", "Stun", "Ward", "Wound"];
const STATS = ["Attack", "Damage", "Heal", "Jump", "Move", "Pierce", "Pull", "Push", "Range", "Retaliate", "Shield", "Target", "Persistent", "Taunt"];
const ELEMENTS = ["Air", "Dark", "Earth", "Fire", "Ice", "Light"];
const EL = `(?:${ELEMENTS.join("|")})`;

/**
 * Keywords that get icons: capitalized game terms only ("Attack 2", "Wound", "Infuse Fire or Air"),
 * so ordinary prose ("when an enemy attacks", "suffer damage") stays text.
 */
export const ICON_WORDS = new RegExp(`\\b(Infuse\\s+${EL}(?:\\s*(?:/|or)\\s*${EL})*|${[...CONDITIONS, ...STATS].join("|")})\\b`, "g");

/** Split a text into plain text and icon tokens ("condition.wound", "stat.heal", infused elements). */
export function tokenizeEffect(text: string): EffectToken[] {
  const tokens: EffectToken[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(ICON_WORDS.source, "g"))) {
    if (m.index! > last) tokens.push({ text: text.slice(last, m.index) });
    const word = m[0];
    if (word.startsWith("Infuse")) {
      tokens.push({ infuse: [...word.matchAll(new RegExp(EL, "g"))].map((e) => e[0].toLowerCase()), label: word });
    } else {
      tokens.push({ icon: `${CONDITIONS.includes(word) ? "condition" : "stat"}.${word.toLowerCase()}`, label: word });
    }
    last = m.index! + word.length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}
