import { describe, expect, it } from "vitest";
import { describePerk, knownFaces, tokenizeEffect } from "../src/module/rules/perk-text.ts";
import type { PerkStep } from "../src/module/rules/perks.ts";

const add = (card: string, value: number, attribute: number, effect = "") =>
  ({ card, attackKind: "number" as const, attackValue: value, attribute, effect });

describe("describePerk", () => {
  it("replace one base card with one perk card", () => {
    const steps: PerkStep[] = [{ remove: "A♥", add: [add("7♥", 0, 2)] }];
    const [line] = describePerk(steps, knownFaces([{ steps }]));
    expect(line!.verb).toBe("replace");
    expect(line!.removed).toEqual([{ face: { attack: { kind: "number", value: -2 }, attribute: 1, effect: "" }, count: 1 }]);
    expect(line!.added[0]!.face.attack.value).toBe(0);
  });

  it("collapses identical boxes and groups identical cards", () => {
    const steps: PerkStep[] = [
      { remove: "3♦ 4♦", add: [add("8♥", 1, 4), add("8♦", 1, 4)] },
      { remove: "3♣ 4♣", add: [add("8♣", 1, 4), add("8♠", 1, 4)] },
    ];
    const lines = describePerk(steps, knownFaces([{ steps }]));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.removed).toHaveLength(2);
    expect(lines[0]!.added).toEqual([{ face: { attack: { kind: "number", value: 1 }, attribute: 4, effect: "" }, count: 2 }]);
  });

  it("add only / remove only", () => {
    expect(describePerk([{ remove: "", add: [add("10♠", 3, 4)] }], new Map())[0]!.verb).toBe("add");
    expect(describePerk([{ remove: "A♥", add: [] }], knownFaces([]))[0]!.verb).toBe("remove");
  });
});

describe("tokenizeEffect", () => {
  it("finds conditions, stats and infusions", () => {
    expect(tokenizeEffect("Wound")).toEqual([{ icon: "condition.wound", label: "Wound" }]);
    expect(tokenizeEffect("Heal 1, yourself")).toEqual([{ icon: "stat.heal", label: "Heal" }, { text: " 1, yourself" }]);
    expect(tokenizeEffect("Infuse Air/Dark")).toEqual([{ infuse: ["air", "dark"], label: "Infuse Air/Dark" }]);
    expect(tokenizeEffect("Infuse Fire or Ice")).toEqual([{ infuse: ["fire", "ice"], label: "Infuse Fire or Ice" }]);
  });

  it("leaves prose alone", () => {
    expect(tokenizeEffect("Gain a random item")).toEqual([{ text: "Gain a random item" }]);
    expect(tokenizeEffect("suffer damage 2 to add +2 attack")).toEqual([{ text: "suffer damage 2 to add +2 attack" }]);
    expect(tokenizeEffect("When an enemy attacks you")).toEqual([{ text: "When an enemy attacks you" }]);
  });
});
