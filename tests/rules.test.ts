import { describe, expect, it } from "vitest";
import {
  BASE_DECK, BLESS_PLAYING_CARDS, CURSE_PLAYING_CARDS, makeBless, makeCurse, playingCardKey,
  triggersReshuffle, type ModifierCardData,
} from "../src/module/rules/modifier.ts";
import { combineModes, resolveAttack, resolveContest, resolveTest } from "../src/module/rules/resolution.ts";

const find = (label: string): ModifierCardData => {
  const [rank, suit] = label.split("-");
  const card = BASE_DECK.find((c) => c.playingCard.rank === rank && c.playingCard.suit === suit);
  if (!card) throw new Error(`no card ${label}`);
  return card;
};
const NULL = find("joker-red");
const CRIT = find("joker-black");

describe("base deck", () => {
  it("has 20 cards with unique playing cards", () => {
    expect(BASE_DECK).toHaveLength(20);
    expect(new Set(BASE_DECK.map((c) => playingCardKey(c.playingCard))).size).toBe(20);
  });

  it("matches the rulebook distribution (p. 64)", () => {
    const count = (atk: number) => BASE_DECK.filter((c) => c.attack.kind === "number" && c.attack.value === atk).length;
    expect([count(-2), count(-1), count(0), count(1), count(2)]).toEqual([1, 5, 6, 5, 1]);
    expect(BASE_DECK.filter((c) => c.attack.kind === "critical")).toHaveLength(1);
    expect(BASE_DECK.filter((c) => c.attack.kind === "null")).toHaveLength(1);
    const attr = (v: number) => BASE_DECK.filter((c) => c.attribute === v).length;
    expect([1, 2, 3, 4, 5, 6].map(attr)).toEqual([2, 3, 4, 4, 3, 2]);
  });

  it("uses black face cards for Bless and red ones for Curse", () => {
    expect(BLESS_PLAYING_CARDS).toHaveLength(6);
    expect(CURSE_PLAYING_CARDS).toHaveLength(6);
    expect(BLESS_PLAYING_CARDS.every((p) => p.suit === "spades" || p.suit === "clubs")).toBe(true);
    expect(CURSE_PLAYING_CARDS.every((p) => p.suit === "hearts" || p.suit === "diamonds")).toBe(true);
  });

  it("only Critical/Null (not Bless/Curse) trigger reshuffle", () => {
    expect(triggersReshuffle(CRIT)).toBe(true);
    expect(triggersReshuffle(NULL)).toBe(true);
    expect(triggersReshuffle(makeBless())).toBe(false);
    expect(triggersReshuffle(makeCurse())).toBe(false);
    expect(triggersReshuffle(find("6-spades"))).toBe(false);
  });
});

describe("attribute tests", () => {
  it("adds score, bonus and attribute modifier", () => {
    const r = resolveTest({ score: 3, bonus: 1, tn: 7, mode: "normal" }, [find("3-clubs")]);
    expect(r.total).toBe(7);
    expect(r.outcome).toBe("success");
  });

  it("fails below the TN", () => {
    expect(resolveTest({ score: 1, bonus: 0, tn: 5, mode: "normal" }, [find("A-hearts")]).outcome).toBe("failure");
  });

  it("has no outcome when the TN is hidden", () => {
    const r = resolveTest({ score: 1, bonus: 0, tn: null, mode: "normal" }, [find("A-hearts")]);
    expect(r.total).toBe(2);
    expect(r.outcome).toBeNull();
  });

  it("Critical / Bless are critical successes, Null / Curse critical failures", () => {
    const input = { score: 0, bonus: 0, tn: 99, mode: "normal" as const };
    expect(resolveTest(input, [CRIT]).outcome).toBe("criticalSuccess");
    expect(resolveTest(input, [makeBless()]).outcome).toBe("criticalSuccess");
    expect(resolveTest({ ...input, tn: 0 }, [NULL]).outcome).toBe("criticalFailure");
    expect(resolveTest({ ...input, tn: 0 }, [makeCurse()]).outcome).toBe("criticalFailure");
  });

  it("advantage keeps the better card, disadvantage the worse", () => {
    const cards = [find("A-hearts"), find("6-spades")];
    expect(resolveTest({ score: 0, bonus: 0, tn: null, mode: "advantage" }, cards).keptIndex).toBe(1);
    expect(resolveTest({ score: 0, bonus: 0, tn: null, mode: "disadvantage" }, cards).keptIndex).toBe(0);
    expect(resolveTest({ score: 0, bonus: 0, tn: null, mode: "advantage" }, [NULL, find("A-hearts")]).keptIndex).toBe(1);
  });

  it("flags ties between different cards", () => {
    const r = resolveTest({ score: 0, bonus: 0, tn: null, mode: "advantage" }, [find("3-hearts"), find("3-clubs")]);
    expect(r.tie).toBe(false); // same attribute value and no effect: interchangeable for a test
    const perk: ModifierCardData = { ...find("3-clubs"), category: "perk", effect: "Wound" };
    expect(resolveTest({ score: 0, bonus: 0, tn: null, mode: "advantage" }, [find("3-clubs"), perk]).tie).toBe(true);
  });

  it("contests: ties go to the active character", () => {
    const a = resolveTest({ score: 2, bonus: 0, tn: null, mode: "normal" }, [find("3-clubs")]);
    const b = resolveTest({ score: 1, bonus: 0, tn: null, mode: "normal" }, [find("4-clubs")]);
    expect(resolveContest(a, b)).toBe("success");
  });
});

describe("attacks", () => {
  it("applies bonuses, then the card, then Shield", () => {
    const r = resolveAttack({ base: 3, bonus: 1, shield: 2, mode: "normal" }, [find("6-spades")]);
    expect(r.attackValue).toBe(6);
    expect(r.damage).toBe(4);
  });

  it("never deals negative damage", () => {
    expect(resolveAttack({ base: 1, bonus: 0, shield: 0, mode: "normal" }, [find("A-hearts")]).damage).toBe(0);
  });

  it("Critical doubles, Null deals 0", () => {
    expect(resolveAttack({ base: 3, bonus: 1, shield: 1, mode: "normal" }, [CRIT]).damage).toBe(7);
    const n = resolveAttack({ base: 5, bonus: 0, shield: 0, mode: "normal" }, [NULL]);
    expect(n.damage).toBe(0);
    expect(n.null).toBe(true);
  });

  it("advantage picks the higher attack value; Null is always worst", () => {
    expect(resolveAttack({ base: 2, bonus: 0, shield: 0, mode: "advantage" }, [find("A-hearts"), CRIT]).keptIndex).toBe(1);
    expect(resolveAttack({ base: 0, bonus: 0, shield: 0, mode: "disadvantage" }, [find("A-hearts"), NULL]).keptIndex).toBe(1);
  });
});

describe("modes", () => {
  it("advantage and disadvantage cancel out", () => {
    expect(combineModes(true, true)).toBe("normal");
    expect(combineModes(true, false)).toBe("advantage");
    expect(combineModes(false, true)).toBe("disadvantage");
  });
});
