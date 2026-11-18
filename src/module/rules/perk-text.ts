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

export type EffectToken = { text: string } | { icon: string; label: string };

const CONDITIONS = ["bless", "curse", "immobilize", "invisible", "muddle", "pacify", "poison", "regenerate", "safeguard", "strengthen", "stun", "ward", "wound"];
const STATS = ["attack", "damage", "heal", "jump", "move", "pierce", "pull", "push", "range", "retaliate", "shield", "target", "persistent"];
const ELEMENTS = ["air", "dark", "earth", "fire", "ice", "light"];
const WORD = new RegExp(`\\b(infuse\\s+(?:(?:${ELEMENTS.join("|")})(?:\\s*/\\s*)?)+|${[...CONDITIONS, ...STATS].join("|")})\\b`, "gi");

/** Split an effect text into plain text and icon keys ("condition.wound", "element.fire", "stat.heal"). */
export function tokenizeEffect(text: string): EffectToken[] {
  const tokens: EffectToken[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index! > last) tokens.push({ text: text.slice(last, m.index) });
    const word = m[0];
    const lower = word.toLowerCase();
    if (lower.startsWith("infuse")) {
      tokens.push({ text: word.slice(0, 6) + " " });
      const els = lower.slice(6).split("/").map((e) => e.trim()).filter(Boolean);
      els.forEach((el, i) => {
        if (i) tokens.push({ text: "/" });
        tokens.push({ icon: `element.${el}`, label: el[0]!.toUpperCase() + el.slice(1) });
      });
    } else {
      tokens.push({ icon: `${CONDITIONS.includes(lower) ? "condition" : "stat"}.${lower}`, label: word });
    }
    last = m.index! + word.length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}
