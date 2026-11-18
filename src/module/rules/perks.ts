/**
 * Perks permanently change a mercenary's Modifier Deck (Core Rulebook p. 63).
 *
 * A perk has one or more checkboxes. Each checkbox is a *step*: a set of cards to
 * remove and a set of cards to add. Ticking N boxes applies the first N steps.
 * Perk contents are entered by players from their own book; none is bundled.
 */
import { BASE_DECK, type AttackKind, type ModifierCardData } from "./modifier.ts";
import { formatCardCode, parseCardCode, parseCardList, sameCard } from "./playing-cards.ts";
import type { PowerAction } from "./power-actions.ts";

export interface PerkCardSpec {
  /** Playing-card code, e.g. "7♥". */
  card: string;
  attackKind: AttackKind;
  attackValue: number;
  attribute: number | null;
  effect: string;
  /** The effect as structured actions. */
  actions?: PowerAction[];
}

export interface PerkStep {
  /** Codes of the cards to remove, e.g. "3♦ 4♦". */
  remove: string;
  add: PerkCardSpec[];
}

export interface PerkInput {
  name: string;
  steps: PerkStep[];
  /** Number of ticked boxes. */
  taken: number;
}

export type ComposeIssueKind = "invalidCode" | "missingCard" | "duplicateCard";

export interface ComposeIssue {
  perk: string;
  /** 1-based checkbox number. */
  step: number;
  kind: ComposeIssueKind;
  code: string;
}

export interface ComposedDeck {
  cards: ModifierCardData[];
  issues: ComposeIssue[];
}

export function specToCard(spec: PerkCardSpec): ModifierCardData | null {
  const playingCard = parseCardCode(spec.card);
  if (!playingCard) return null;
  return {
    category: "perk",
    attack: { kind: spec.attackKind, value: spec.attackKind === "number" ? spec.attackValue : spec.attackKind === "critical" ? 2 : 0 },
    attribute: spec.attribute ?? null,
    effect: spec.effect.trim(),
    ...(spec.actions?.length ? { actions: spec.actions } : {}),
    playingCard,
  };
}

/** Apply ticked perk steps, in order, to the base deck. */
export function composeDeck(perks: readonly PerkInput[], base: readonly ModifierCardData[] = BASE_DECK): ComposedDeck {
  const cards = base.map((c) => ({ ...c, attack: { ...c.attack }, playingCard: { ...c.playingCard } }));
  const issues: ComposeIssue[] = [];

  for (const perk of perks) {
    const taken = Math.max(0, Math.min(perk.taken, perk.steps.length));
    for (let i = 0; i < taken; i++) {
      const step = perk.steps[i]!;
      const issue = (kind: ComposeIssueKind, code: string) => issues.push({ perk: perk.name, step: i + 1, kind, code });

      const { cards: toRemove, invalid } = parseCardList(step.remove);
      invalid.forEach((code) => issue("invalidCode", code));
      for (const pc of toRemove) {
        const index = cards.findIndex((c) => sameCard(c.playingCard, pc));
        if (index === -1) issue("missingCard", formatCardCode(pc));
        else cards.splice(index, 1);
      }

      for (const spec of step.add) {
        const card = specToCard(spec);
        if (!card) {
          issue("invalidCode", spec.card || "?");
          continue;
        }
        if (cards.some((c) => sameCard(c.playingCard, card.playingCard))) {
          issue("duplicateCard", formatCardCode(card.playingCard));
        }
        cards.push(card);
      }
    }
  }
  return { cards, issues };
}
