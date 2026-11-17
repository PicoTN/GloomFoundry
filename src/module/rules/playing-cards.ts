/**
 * Parsing and formatting of playing-card codes, used to identify modifier cards
 * when editing perks: "7♥", "7H", "10s", "a♣", "RJ" (red joker), "BJ" (black joker).
 */
import type { JokerColor, PlayingCardId, Rank, Suit } from "./modifier.ts";

const SUIT_BY_CHAR: Record<string, Suit> = {
  "♥": "hearts", "♡": "hearts", h: "hearts",
  "♦": "diamonds", "♢": "diamonds", d: "diamonds",
  "♣": "clubs", "♧": "clubs", c: "clubs",
  "♠": "spades", "♤": "spades", s: "spades",
};

const SUIT_CHAR: Record<Suit, string> = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };

const RANKS = new Set<Rank>(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);

/** Parse one card code; returns `null` if it is not a valid card. */
export function parseCardCode(code: string): PlayingCardId | null {
  const raw = code.trim().replace(/️/g, ""); // strip emoji variation selectors (♥️)
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const joker: Record<string, JokerColor> = { RJ: "red", BJ: "black", "JOKER-RED": "red", "JOKER-BLACK": "black" };
  if (upper in joker) return { rank: "joker", suit: joker[upper]! };

  const suitChar = raw.slice(-1).toLowerCase();
  const suit = SUIT_BY_CHAR[suitChar];
  if (!suit) return null;
  let rank = raw.slice(0, -1).toUpperCase();
  if (rank === "1") rank = "A";
  if (rank === "T") rank = "10";
  return RANKS.has(rank as Rank) ? { rank: rank as Rank, suit } : null;
}

/** Parse a list of codes separated by spaces, commas, "+" or "/". */
export function parseCardList(text: string): { cards: PlayingCardId[]; invalid: string[] } {
  const cards: PlayingCardId[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,+/;]+/).filter(Boolean)) {
    const card = parseCardCode(token);
    if (card) cards.push(card);
    else invalid.push(token);
  }
  return { cards, invalid };
}

/** Canonical display code, e.g. "7♥", "RJ". */
export function formatCardCode(card: PlayingCardId): string {
  if (card.rank === "joker") return card.suit === "red" ? "RJ" : "BJ";
  return `${card.rank}${SUIT_CHAR[card.suit as Suit]}`;
}

export function sameCard(a: PlayingCardId, b: PlayingCardId): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}
