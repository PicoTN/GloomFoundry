import { describe, expect, it } from "vitest";
import { BASE_DECK } from "../src/module/rules/modifier.ts";
import { composeDeck, type PerkCardSpec, type PerkInput } from "../src/module/rules/perks.ts";
import { formatCardCode, parseCardCode, parseCardList } from "../src/module/rules/playing-cards.ts";

const add = (card: string, attackValue = 0, attribute: number | null = 3, effect = ""): PerkCardSpec => ({
  card, attackKind: "number", attackValue, attribute, effect,
});

describe("card codes", () => {
  it("parses symbols, letters, tens and jokers", () => {
    expect(parseCardCode("7♥")).toEqual({ rank: "7", suit: "hearts" });
    expect(parseCardCode("10s")).toEqual({ rank: "10", suit: "spades" });
    expect(parseCardCode("aC")).toEqual({ rank: "A", suit: "clubs" });
    expect(parseCardCode("1d")).toEqual({ rank: "A", suit: "diamonds" });
    expect(parseCardCode("Q♥️")).toEqual({ rank: "Q", suit: "hearts" });
    expect(parseCardCode("rj")).toEqual({ rank: "joker", suit: "red" });
    expect(parseCardCode("11h")).toBeNull();
    expect(parseCardCode("7x")).toBeNull();
  });

  it("parses lists with mixed separators", () => {
    const { cards, invalid } = parseCardList("3♦ + 4♦, 2H/zz");
    expect(cards.map(formatCardCode)).toEqual(["3♦", "4♦", "2♥"]);
    expect(invalid).toEqual(["zz"]);
  });
});

describe("composeDeck", () => {
  const perk = (steps: PerkInput["steps"], taken: number): PerkInput => ({ name: "Test perk", steps, taken });

  it("returns the base deck without perks", () => {
    const { cards, issues } = composeDeck([]);
    expect(cards).toHaveLength(BASE_DECK.length);
    expect(issues).toEqual([]);
  });

  it("applies only ticked steps, in order", () => {
    const steps = [
      { remove: "2♥", add: [add("7♥", 0, 3, "Heal 1, yourself")] },
      { remove: "2♦", add: [add("7♦")] },
      { remove: "2♣", add: [add("7♣")] },
    ];
    const { cards, issues } = composeDeck([perk(steps, 2)]);
    expect(issues).toEqual([]);
    const codes = cards.map((c) => formatCardCode(c.playingCard));
    expect(codes).not.toContain("2♥");
    expect(codes).not.toContain("2♦");
    expect(codes).toContain("2♣");
    expect(codes).toContain("7♥");
    expect(codes).not.toContain("7♣");
    const seven = cards.find((c) => formatCardCode(c.playingCard) === "7♥")!;
    expect(seven).toMatchObject({ category: "perk", attribute: 3, effect: "Heal 1, yourself" });
  });

  it("supports pure removals, pure additions and critical perk cards", () => {
    const { cards } = composeDeck([
      perk([{ remove: "A♥", add: [] }], 1),
      perk([{ remove: "", add: [{ card: "10♠", attackKind: "critical", attackValue: 0, attribute: 4, effect: "" }] }], 1),
    ]);
    expect(cards).toHaveLength(BASE_DECK.length);
    const crit = cards.find((c) => formatCardCode(c.playingCard) === "10♠")!;
    expect(crit.attack).toEqual({ kind: "critical", value: 2 });
    expect(crit.attribute).toBe(4);
  });

  it("reports invalid codes, missing and duplicate cards", () => {
    const { issues } = composeDeck([
      perk([{ remove: "zz 8♥", add: [add("3♠"), add("??")] }], 1),
    ]);
    expect(issues.map((i) => [i.kind, i.code])).toEqual([
      ["invalidCode", "zz"],
      ["missingCard", "8♥"],
      ["duplicateCard", "3♠"],
      ["invalidCode", "??"],
    ]);
  });

  it("lets a later perk remove a card added by an earlier one", () => {
    const { cards, issues } = composeDeck([
      perk([{ remove: "", add: [add("9♦", 2)] }], 1),
      perk([{ remove: "9♦", add: [] }], 1),
    ]);
    expect(issues).toEqual([]);
    expect(cards.map((c) => formatCardCode(c.playingCard))).not.toContain("9♦");
  });
});
