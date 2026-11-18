import { describe, expect, it } from "vitest";
import {
  attributeMax, backgroundBonus, HP_BY_LEVEL, maxHp, skillTestBonus, slotCapacity, smallItemSlots,
} from "../src/module/rules/progression.ts";

describe("progression", () => {
  it("has 9 levels per HP track, matching the leveling guide ends", () => {
    for (const track of Object.values(HP_BY_LEVEL)) expect(track).toHaveLength(9);
    expect([maxHp("low", 1), maxHp("low", 9)]).toEqual([6, 14]);
    expect([maxHp("medium", 1), maxHp("medium", 9)]).toEqual([8, 20]);
    expect([maxHp("high", 1), maxHp("high", 9)]).toEqual([10, 26]);
  });

  it("clamps levels", () => {
    expect(maxHp("high", 0)).toBe(10);
    expect(maxHp("high", 12)).toBe(26);
  });

  it("attribute max is 2 + half the level rounded up", () => {
    expect([1, 2, 3, 4, 9].map(attributeMax)).toEqual([3, 3, 4, 4, 7]);
  });

  it("small item slots are half the level rounded up", () => {
    expect([1, 2, 3, 9].map(smallItemSlots)).toEqual([1, 1, 2, 5]);
    expect(slotCapacity("hand", 1)).toBe(2);
    expect(slotCapacity("head", 9)).toBe(1);
  });

  it("skill test bonus is half the skill level rounded up", () => {
    expect([1, 2, 3, 9].map(skillTestBonus)).toEqual([1, 1, 2, 5]);
  });

  it("master occupations give +2", () => {
    expect(backgroundBonus(false)).toBe(1);
    expect(backgroundBonus(true)).toBe(2);
  });
});

describe("levelGains", () => {
  it("follows the Leveling Guide", async () => {
    const { levelGains } = await import("../src/module/rules/progression.ts");
    const classSkillLevels = [2, 3, 4, 5, 6, 7, 8, 9].filter((l) => levelGains(l).classSkill);
    expect(classSkillLevels).toEqual([2, 4, 5, 6, 8, 9]);
    expect([3, 7].every((l) => levelGains(l).passiveTalent && levelGains(l).ancestrySkill)).toBe(true);
    expect(levelGains(5).upgradeTalents).toBe(true);
    expect(levelGains(2)).toMatchObject({ perks: 1, attributePoints: 1, passiveTalent: false });
  });
});
