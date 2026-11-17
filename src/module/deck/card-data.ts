import { cardArtPath } from "../config.ts";
import {
  attackLabel, faceKey, playingCardKey, playingCardLabel, type ModifierCardData, type PlayingCardId,
} from "../rules/modifier.ts";

const RANK_VALUE: Record<PlayingCardId["rank"], number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, joker: 0,
};

export function cardName(card: ModifierCardData): string {
  switch (card.category) {
    case "bless":
      return game.i18n!.localize("GLOOM.Card.bless");
    case "curse":
      return game.i18n!.localize("GLOOM.Card.curse");
  }
  if (card.attack.kind === "critical") return game.i18n!.localize("GLOOM.Card.critical");
  if (card.attack.kind === "null") return game.i18n!.localize("GLOOM.Card.null");
  return `${attackLabel(card)} / ${card.attribute ?? "-"}`;
}

/** Foundry `Card` creation data for a modifier card. */
export function toCardCreateData(card: ModifierCardData, sort = 0): Card.CreateData {
  return {
    name: cardName(card),
    type: "modifier",
    system: card,
    suit: card.playingCard.suit,
    value: RANK_VALUE[card.playingCard.rank],
    description: playingCardLabel(card.playingCard),
    faces: [{ name: cardName(card), img: cardArtPath(faceKey(card)), text: card.effect }],
    face: 0,
    back: { name: "", img: cardArtPath("back"), text: "" },
    drawn: false,
    sort,
    flags: { gloomfoundry: { key: playingCardKey(card.playingCard) } },
  } as Card.CreateData;
}
