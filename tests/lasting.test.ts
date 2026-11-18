import { describe, expect, it } from "vitest";
import { endsAtRoundEnd, parseLasting } from "../src/module/rules/lasting.ts";

describe("lasting effects (p. 78)", () => {
  it("reads round effects", () => {
    expect(parseLasting("Add +1 attack to all your attacks this round.")).toEqual({ kind: "round", uses: null, rounds: null, lose: false });
  });
  it("reads uses", () => {
    expect(parseLasting("The next 2 times you attack, add +2 attack. Lose this Skill.")).toEqual({ kind: "persistent", uses: 2, rounds: null, lose: true });
    expect(parseLasting("The next three times an ally attacks...")?.uses).toBe(3);
    expect(parseLasting("The next time you are attacked, gain Shield 2.")?.uses).toBe(1);
  });
  it("reads rounds and persistent", () => {
    expect(parseLasting("For the next 2 rounds, gain Retaliate 1.")?.rounds).toBe(2);
    expect(parseLasting("Mark a space. This is a persistent effect.")).toEqual({ kind: "persistent", uses: null, rounds: null, lose: false });
    expect(parseLasting("Attack 3, range 2.")).toBeNull();
  });
  it("ends round and multi-round effects", () => {
    expect(endsAtRoundEnd({ kind: "round", rounds: null }, 2, 2)).toBe(true);
    expect(endsAtRoundEnd({ kind: "persistent", rounds: 2 }, 2, 3)).toBe(false);
    expect(endsAtRoundEnd({ kind: "persistent", rounds: 2 }, 2, 4)).toBe(true);
    expect(endsAtRoundEnd({ kind: "persistent", rounds: null }, 2, 9)).toBe(false);
  });
});
