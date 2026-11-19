import { describe, expect, it } from "vitest";
import { bonusApplies, endsAtRoundEnd, parseLasting, parseLastingBonus } from "../src/module/rules/lasting.ts";

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

describe("lasting attack bonuses", () => {
  it("reads attack bonuses and who gets them", () => {
    expect(parseLastingBonus("You and all allies add +1 attack to all your attacks while in or adjacent to the space. This is a persistent effect."))
      .toEqual({ attack: 1, pierce: 0, advantage: false, conditions: [], who: "selfAndAllies", near: true });
    expect(parseLastingBonus("All allies add +1 attack to all their attacks this round.")?.who).toBe("allies");
    expect(parseLastingBonus("The next 2 times you attack, add +2 attack.")).toMatchObject({ attack: 2, who: "self" });
  });
  it("reads advantage, Pierce and conditions", () => {
    expect(parseLastingBonus("Gain advantage on all your attacks this round.")).toMatchObject({ advantage: true, who: "self" });
    expect(parseLastingBonus("Add Pierce 2 to all your attacks this round.")).toMatchObject({ pierce: 2 });
    expect(parseLastingBonus("The next 4 times you attack, add Stun and Curse. This is a persistent effect.")?.conditions).toEqual(["stun", "curse"]);
    expect(parseLastingBonus("The next 3 times you make an attack, add +1 attack and Poison.")).toMatchObject({ attack: 1, conditions: ["poison"] });
    expect(parseLastingBonus("Move 3. Add Push 2 to all your attacks this round.")).toMatchObject({ push: 2 });
    expect(parseLastingBonus("You and all allies within range 2 add +1 attack and Pierce 1 to all your attacks this round.")).toMatchObject({ attack: 1, pierce: 1, who: "selfAndAllies" });
    expect(parseLastingBonus("Gain advantage and add +1 attack to all your attacks this round.")).toMatchObject({ attack: 1, advantage: true });
    expect(parseLastingBonus("Add Poison to all your attacks this round.")?.conditions).toEqual(["poison"]);
  });
  it("reads who from the bonus sentence only", () => {
    expect(parseLastingBonus("Move 4. Add +1 attack to all your attacks this round. When an adjacent enemy dies this round, give Muddle to all allies.")?.who).toBe("self");
    expect(parseLastingBonus("The next 3 times one of your allies with Poison makes an attack, add +2 attack and Plague.")?.who).toBe("allies");
    expect(parseLastingBonus("All attacks targeting you this round gain disadvantage.")).toBeNull();
    expect(parseLastingBonus("Attack 4; if you have been attacked this round, add +2 attack.")).toBeNull();
  });
  it("reads penalties for enemies", () => {
    expect(parseLastingBonus("Each enemy adds -1 attack to all their attacks this round.")).toMatchObject({ attack: -1, who: "enemies" });
    expect(parseLastingBonus("Move 3. Gain Shield 1.")).toBeNull();
  });
  it("matches who to the attacker", () => {
    expect(bonusApplies("selfAndAllies", "ally")).toBe(true);
    expect(bonusApplies("self", "ally")).toBe(false);
    expect(bonusApplies("enemies", "enemy")).toBe(true);
    expect(bonusApplies("allies", "self")).toBe(false);
  });
});
