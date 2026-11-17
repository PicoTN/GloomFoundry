/**
 * A Modifier Deck backed by two core `Cards` documents: a deck (draw pile) and a
 * pile (discard pile). Each mercenary owns one; the GM has a single shared one.
 *
 * Rules (Core Rulebook p. 63-64, 72):
 *  - drawn cards go face up to the discard pile;
 *  - Bless/Curse return to the supply once drawn (we delete them);
 *  - drawing Critical/Null schedules a reshuffle: at the end of the round in combat,
 *    immediately otherwise;
 *  - all decks are shuffled at the start and end of combat.
 */
import { SYSTEM_ID } from "../config.ts";
import {
  BASE_DECK, MAX_BLESS, MAX_CURSE, makeBless, makeCurse, triggersReshuffle,
  type ModifierCardData,
} from "../rules/modifier.ts";
import { toCardCreateData } from "./card-data.ts";

export type TemporaryKind = "bless" | "curse";

const PENDING_FLAG = `flags.${SYSTEM_ID}.reshufflePending`;
const QUIET = { chatNotification: false } as const;

export interface DeckCounts {
  remaining: number;
  discarded: number;
  bless: number;
  curse: number;
  reshufflePending: boolean;
}

export interface DrawnCard {
  data: ModifierCardData;
  img: string;
}

function modifierData(card: Card.Implementation): ModifierCardData | null {
  if (card.type !== "modifier") return null;
  return (card.system as { toRules(): ModifierCardData }).toRules();
}

export class ModifierDeck {
  constructor(
    readonly drawPile: Cards.Stored,
    readonly discardPile: Cards.Stored,
    /** The owning actor, or `null` for the GM deck. */
    readonly actor: Actor.Stored | null,
  ) {}

  get label(): string {
    return this.actor?.name ?? game.i18n!.localize("GLOOM.Deck.gmDeck");
  }

  /** Whether the current user may modify this deck directly (otherwise go through the GM socket). */
  get canModify(): boolean {
    return this.drawPile.isOwner && this.discardPile.isOwner;
  }

  private get undrawn(): Card.Implementation[] {
    return this.drawPile.cards.contents.filter((c) => !c.drawn);
  }

  private countCategory(category: ModifierCardData["category"]): number {
    return this.undrawn.filter((c) => modifierData(c)?.category === category).length;
  }

  get reshufflePending(): boolean {
    return Boolean(this.drawPile.getFlag(SYSTEM_ID as never, "reshufflePending" as never));
  }

  counts(): DeckCounts {
    return {
      remaining: this.undrawn.length,
      discarded: this.discardPile.cards.size,
      bless: this.countCategory("bless"),
      curse: this.countCategory("curse"),
      reshufflePending: this.reshufflePending,
    };
  }

  /** Most recently discarded cards, newest first. */
  recentDiscards(limit = 5): DrawnCard[] {
    return this.discardPile.cards.contents
      .slice()
      .sort((a, b) => (b.sort ?? 0) - (a.sort ?? 0))
      .slice(0, limit)
      .flatMap((c) => {
        const data = modifierData(c);
        return data ? [{ data, img: c.img ?? "" }] : [];
      });
  }

  /**
   * Draw `count` cards (2 for advantage/disadvantage). An empty deck is reshuffled
   * before drawing (house rule: the rulebook does not cover running out of cards).
   */
  async draw(count: number, { inCombat = false }: { inCombat?: boolean } = {}): Promise<DrawnCard[]> {
    const drawn: DrawnCard[] = [];
    for (let i = 0; i < count; i++) {
      if (this.undrawn.length === 0) await this.reshuffle();
      if (this.undrawn.length === 0) break;
      const top = this.undrawn.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0]!;
      const data = modifierData(top);
      if (!data) continue;
      // Pass to the discard pile and stamp a monotonically increasing sort so the newest is last.
      const nextSort = Math.max(0, ...this.discardPile.cards.map((c) => c.sort ?? 0)) + 1;
      await this.drawPile.pass(this.discardPile, [top.id!], { ...QUIET, action: "draw", updateData: { sort: nextSort } });
      drawn.push({ data, img: top.img ?? "" });
    }
    await this.settleDrawn(drawn, inCombat);
    return drawn;
  }

  /** Remove drawn Bless/Curse and handle Critical/Null reshuffles. */
  private async settleDrawn(drawn: DrawnCard[], inCombat: boolean): Promise<void> {
    if (drawn.some((d) => d.data.category === "bless" || d.data.category === "curse")) {
      const isTemp = (c: Card.Implementation) => {
        const cat = modifierData(c)?.category;
        return cat === "bless" || cat === "curse";
      };
      const inDeck = this.drawPile.cards.contents.filter((c) => c.drawn && isTemp(c)).map((c) => c.id!);
      const inDiscard = this.discardPile.cards.contents.filter(isTemp).map((c) => c.id!);
      if (inDiscard.length) await this.discardPile.deleteEmbeddedDocuments("Card", inDiscard);
      if (inDeck.length) await this.drawPile.deleteEmbeddedDocuments("Card", inDeck);
    }
    if (drawn.some((d) => triggersReshuffle(d.data))) {
      if (inCombat) await this.drawPile.update({ [PENDING_FLAG]: true } as never);
      else await this.reshuffle();
    }
  }

  /** Return the discard pile to the deck and shuffle. */
  async reshuffle(): Promise<void> {
    await this.drawPile.recall(QUIET);
    await this.drawPile.shuffle(QUIET);
    if (this.reshufflePending) await this.drawPile.update({ [PENDING_FLAG]: false } as never);
  }

  /** Shuffle only if a Critical/Null was drawn this round (cleanup phase, p. 72). */
  async reshuffleIfPending(): Promise<boolean> {
    if (!this.reshufflePending) return false;
    await this.reshuffle();
    return true;
  }

  /**
   * Shuffle Bless/Curse cards into the deck, respecting the cap of 6.
   * @returns how many cards were actually added.
   */
  async addTemporary(kind: TemporaryKind, count = 1): Promise<number> {
    const max = kind === "bless" ? MAX_BLESS : MAX_CURSE;
    const existing = this.countCategory(kind);
    const toAdd = Math.max(0, Math.min(count, max - existing));
    if (toAdd === 0) return 0;
    const make = kind === "bless" ? makeBless : makeCurse;
    const data = Array.from({ length: toAdd }, (_, i) => toCardCreateData(make(existing + i)));
    await this.drawPile.createEmbeddedDocuments("Card", data);
    // Shuffling also reorders drawn cards, which is harmless: they are recalled before reuse.
    await this.drawPile.shuffle(QUIET);
    return toAdd;
  }

  /** Remove all Bless and Curse cards (Full Rest, p. 64). */
  async removeTemporary(kind?: TemporaryKind): Promise<number> {
    const kinds = kind ? [kind] : ["bless", "curse"];
    const ids = this.drawPile.cards.contents
      .filter((c) => kinds.includes(modifierData(c)?.category ?? ""))
      .map((c) => c.id!);
    if (ids.length) await this.drawPile.deleteEmbeddedDocuments("Card", ids);
    return ids.length;
  }

  /** Throw away every card and rebuild the deck from the base composition (+ perks, later). */
  async rebuild(cards: readonly ModifierCardData[] = BASE_DECK): Promise<void> {
    const discardIds = this.discardPile.cards.map((c) => c.id!);
    if (discardIds.length) await this.discardPile.deleteEmbeddedDocuments("Card", discardIds);
    const deckIds = this.drawPile.cards.map((c) => c.id!);
    if (deckIds.length) await this.drawPile.deleteEmbeddedDocuments("Card", deckIds);
    await this.drawPile.createEmbeddedDocuments("Card", cards.map((c, i) => toCardCreateData(c, i)));
    await this.drawPile.shuffle(QUIET);
  }
}
