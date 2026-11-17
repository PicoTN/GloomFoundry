import { SYSTEM_ID, templatePath } from "../config.ts";
import type { DrawnCard } from "../deck/modifier-deck.ts";
import { attackLabel, playingCardLabel, SUIT_SYMBOLS, type ModifierCardData } from "../rules/modifier.ts";

export interface CardView {
  category: ModifierCardData["category"];
  /** CSS modifier: num | critical | null | bless | curse */
  kind: string;
  /** Sign of a numeric attack modifier: pos | neg | zero (colour coding). */
  sign: string;
  attack: string;
  attribute: number | null;
  effect: string;
  rank: string;
  suitSymbol: string;
  red: boolean;
  playingCard: string;
  img: string;
  kept: boolean;
  discarded: boolean;
}

export function cardView(card: DrawnCard, kept: boolean, discarded = false): CardView {
  const d = card.data;
  const kind = d.category === "bless" || d.category === "curse"
    ? d.category
    : d.attack.kind === "number" ? "num" : d.attack.kind;
  const pc = d.playingCard;
  return {
    category: d.category,
    kind,
    sign: kind !== "num" || d.attack.value === 0 ? "zero" : d.attack.value > 0 ? "pos" : "neg",
    attack: attackLabel(d),
    attribute: d.attribute,
    effect: d.effect,
    rank: pc.rank === "joker" ? "★" : pc.rank,
    suitSymbol: pc.rank === "joker" ? "" : SUIT_SYMBOLS[pc.suit],
    red: pc.suit === "hearts" || pc.suit === "diamonds" || pc.suit === "red",
    playingCard: playingCardLabel(pc),
    img: card.img,
    kept,
    discarded,
  };
}

export interface DrawMessageContext {
  title: string;
  subtitle?: string;
  cards: CardView[];
  mode: string;
  modeLabel?: string;
  tie: boolean;
  /** Lines like "Total: 7 vs TN 6". */
  details: { label: string; value: string }[];
  outcome?: { label: string; css: string };
}

export async function postDrawMessage(
  context: DrawMessageContext,
  speakerActor: Actor.Implementation | null,
  flags: Record<string, unknown> = {},
): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(templatePath("chat/draw.hbs"), context as never);
  await ChatMessage.create({
    content,
    speaker: speakerActor
      ? ChatMessage.getSpeaker({ actor: speakerActor as Actor.Stored })
      : { alias: game.i18n!.localize("GLOOM.Deck.gmDeck") },
    flags: { [SYSTEM_ID]: flags },
  } as never);
}
