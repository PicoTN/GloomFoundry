import { describe, expect, it } from "vitest";
import {
  campaignLevel, computeNpcStats, threatDifficulty, threatMaximum, type NpcStatInput, type StatRow,
} from "../src/module/rules/npc.ts";

const row = (hp: number, move: number, attack: number, other: number, defense = "", offense = ""): StatRow =>
  ({ hp, move, attack, other, defense, offense });

// Archers (p. 274), CL 0-2 only, enough for the tests.
const archers: NpcStatInput = {
  category: "normal",
  level: 0,
  normal: [row(4, 2, 3, 0), row(5, 2, 3, 1, "", "✦"), row(6, 2, 4, 1, "", "✦")],
  elite: [row(6, 2, 4, 0), row(6, 2, 4, 1, "■", "✦"), row(7, 2, 4, 1, "■", "✦")],
  columns: { move: ["intuition", "grit"], attack: ["cunning", "finesse"], other: ["logic", "understanding"] },
  threat: { normal: 2, elite: 4 },
  adversaryBoost: "attack",
  mercenaries: 4,
  nemesisActions: 1,
};

describe("computeNpcStats", () => {
  it("reads the normal row and spreads Attributes over their columns", () => {
    const s = computeNpcStats({ ...archers, level: 1 });
    expect([s.hpMax, s.move, s.attack, s.threat]).toEqual([5, 2, 3, 2]);
    expect(s.attributes).toEqual({ intuition: 2, grit: 2, cunning: 3, finesse: 3, logic: 1, understanding: 1 });
    expect(s.offense).toBe("✦");
  });

  it("uses the elite row and Threat", () => {
    const s = computeNpcStats({ ...archers, category: "elite", level: 2 });
    expect([s.hpMax, s.attack, s.threat, s.defense]).toEqual([7, 4, 4, "■"]);
  });

  it("clamps the level to the table", () => {
    expect(computeNpcStats({ ...archers, level: 7 }).hpMax).toBe(6);
    expect(computeNpcStats({ ...archers, level: -3 }).hpMax).toBe(4);
  });

  it("adversary: +half HP, +quarter move or attack, Threat +2", () => {
    const s = computeNpcStats({ ...archers, category: "adversary", level: 2 });
    expect([s.hpMax, s.move, s.attack, s.threat]).toEqual([9, 2, 5, 4]);
    const m = computeNpcStats({ ...archers, category: "adversary", level: 2, adversaryBoost: "move" });
    expect([m.move, m.attack]).toEqual([3, 4]);
  });

  it("nemesis: elite HP ×M, move/attack +1, Threat (elite+2)×M plus extra unique actions", () => {
    const s = computeNpcStats({ ...archers, category: "nemesis", level: 2, nemesisActions: 3 });
    expect([s.hpMax, s.move, s.attack]).toEqual([28, 3, 5]);
    expect(s.threat).toBe((4 + 2) * 4 + 2 * 4);
  });
});

describe("campaign level and Threat", () => {
  it("CL is half the average mercenary level, rounded up", () => {
    expect(campaignLevel([3, 3, 3])).toBe(2);
    expect(campaignLevel([1, 2])).toBe(1);
    expect(campaignLevel([9, 9])).toBe(5);
    expect(campaignLevel([])).toBe(0);
  });

  it("Threat maximum is 6/8/10/12 × M", () => {
    expect(threatMaximum("normal", 4)).toBe(32);
    expect(threatDifficulty(30, 4)).toBe("normal");
    expect(threatDifficulty(24, 4)).toBe("easy");
    expect(threatDifficulty(49, 4)).toBe("beyond");
  });
});
