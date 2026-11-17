/**
 * Pure (Foundry-free) definitions of Modifier Deck cards.
 * Source: Core Rulebook, ch. 2 "The Modifier Deck" (p. 63-64) and
 * Appendix "Playing Cards as Modifiers" (p. 343).
 */

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type JokerColor = "red" | "black";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "joker";

/** The physical playing card a modifier card corresponds to. */
export interface PlayingCardId {
  rank: Rank;
  /** Suit for ranked cards, colour for jokers. */
  suit: Suit | JokerColor;
}

export type AttackKind = "number" | "critical" | "null";
export type ModifierCategory = "base" | "perk" | "bless" | "curse";

export interface ModifierCardData {
  category: ModifierCategory;
  attack: { kind: AttackKind; value: number };
  /** Attribute modifier (1-6). `null` for Critical/Null/Bless/Curse cards. */
  attribute: number | null;
  /** Extra effect printed on the card (perk cards), plain text for now. */
  effect: string;
  playingCard: PlayingCardId;
}

/** Bless & Curse cards are capped at 6 each per deck (p. 64). */
export const MAX_BLESS = 6;
export const MAX_CURSE = 6;

export const SUIT_SYMBOLS: Record<Suit | JokerColor, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
  red: "R",
  black: "B",
};

export function playingCardLabel(pc: PlayingCardId): string {
  if (pc.rank === "joker") return pc.suit === "red" ? "Red Joker" : "Black Joker";
  return `${pc.rank}${SUIT_SYMBOLS[pc.suit]}`;
}

/** Stable key, also used for card art file names, e.g. "A-hearts", "joker-red". */
export function playingCardKey(pc: PlayingCardId): string {
  return `${pc.rank}-${pc.suit}`;
}

/** Card behaves as a Critical (critical success / double damage). */
export function isCriticalLike(card: ModifierCardData): boolean {
  return card.attack.kind === "critical";
}

/** Card behaves as a Null (critical failure / zero damage). */
export function isNullLike(card: ModifierCardData): boolean {
  return card.attack.kind === "null";
}

/** Critical and Null (but not Bless/Curse) trigger a reshuffle of the discard pile. */
export function triggersReshuffle(card: ModifierCardData): boolean {
  return (card.category === "base" || card.category === "perk") && (isCriticalLike(card) || isNullLike(card));
}

/** Bless/Curse are returned to the supply once drawn instead of going to the discard pile. */
export function isTemporary(card: ModifierCardData): boolean {
  return card.category === "bless" || card.category === "curse";
}

function num(rank: Rank, suit: Suit, attack: number, attribute: number): ModifierCardData {
  return {
    category: "base",
    attack: { kind: "number", value: attack },
    attribute,
    effect: "",
    playingCard: { rank, suit },
  };
}

/** The 20-card starting deck, per the Appendix correspondence table (p. 343). */
export const BASE_DECK: readonly ModifierCardData[] = Object.freeze([
  {
    category: "base",
    attack: { kind: "null", value: 0 },
    attribute: null,
    effect: "",
    playingCard: { rank: "joker", suit: "red" },
  },
  num("A", "hearts", -2, 1),
  num("A", "clubs", -1, 1),
  num("2", "clubs", -1, 2),
  num("2", "diamonds", -1, 2),
  num("2", "hearts", -1, 2),
  num("3", "hearts", -1, 3),
  num("3", "clubs", 0, 3),
  num("3", "diamonds", 0, 3),
  num("3", "spades", 0, 3),
  num("4", "clubs", 0, 4),
  num("4", "diamonds", 0, 4),
  num("4", "hearts", 0, 4),
  num("4", "spades", 1, 4),
  num("5", "clubs", 1, 5),
  num("5", "diamonds", 1, 5),
  num("5", "spades", 1, 5),
  num("6", "diamonds", 1, 6),
  num("6", "spades", 2, 6),
  {
    category: "base",
    attack: { kind: "critical", value: 2 },
    attribute: null,
    effect: "",
    playingCard: { rank: "joker", suit: "black" },
  },
]);

const FACE_RANKS: Rank[] = ["J", "Q", "K"];
const BLESS_SUITS: Suit[] = ["spades", "clubs"];
const CURSE_SUITS: Suit[] = ["hearts", "diamonds"];

/** The six black face cards, in a stable order, used as Bless cards. */
export const BLESS_PLAYING_CARDS: readonly PlayingCardId[] = BLESS_SUITS.flatMap((suit) =>
  FACE_RANKS.map((rank) => ({ rank, suit })),
);
/** The six red face cards, in a stable order, used as Curse cards. */
export const CURSE_PLAYING_CARDS: readonly PlayingCardId[] = CURSE_SUITS.flatMap((suit) =>
  FACE_RANKS.map((rank) => ({ rank, suit })),
);

export function makeBless(index = 0): ModifierCardData {
  return {
    category: "bless",
    attack: { kind: "critical", value: 2 },
    attribute: null,
    effect: "",
    playingCard: BLESS_PLAYING_CARDS[index % BLESS_PLAYING_CARDS.length]!,
  };
}

export function makeCurse(index = 0): ModifierCardData {
  return {
    category: "curse",
    attack: { kind: "null", value: 0 },
    attribute: null,
    effect: "",
    playingCard: CURSE_PLAYING_CARDS[index % CURSE_PLAYING_CARDS.length]!,
  };
}

/** Short label for the attack modifier, e.g. "+1", "-2", "×2", "Ø". */
export function attackLabel(card: ModifierCardData): string {
  switch (card.attack.kind) {
    case "critical":
      return "×2";
    case "null":
      return "Ø";
    default:
      return card.attack.value >= 0 ? `+${card.attack.value}` : `${card.attack.value}`;
  }
}

/** Stable art key describing the card's face, e.g. "atk-p1-attr4", "critical", "critical-attr4", "bless". */
export function faceKey(card: ModifierCardData): string {
  if (card.category === "bless" || card.category === "curse") return card.category;
  if (card.attack.kind !== "number") return card.attribute ? `${card.attack.kind}-attr${card.attribute}` : card.attack.kind;
  const sign = card.attack.value >= 0 ? "p" : "m";
  return `atk-${sign}${Math.abs(card.attack.value)}-attr${card.attribute ?? 0}`;
}
