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

describe("higher-level starts and retirement (p. 121)", () => {
  it("follows the higher levels guide", async () => {
    const { higherLevelStart, extraStartingPerks } = await import("../src/module/rules/progression.ts");
    expect(higherLevelStart(1)).toMatchObject({ backgrounds: 4, factionTier: 2, gold: 0, rarity: "common" });
    expect(higherLevelStart(5)).toMatchObject({ perks: 5, backgrounds: 5, factionTier: 4, gold: 150, rarity: "rare" });
    expect(higherLevelStart(9)).toMatchObject({ perks: 10, backgrounds: 6, factionTier: 5, gold: 250 });
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(extraStartingPerks)).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 2]);
  });
  it("stacks retirement benefits", async () => {
    const { retirementBenefits } = await import("../src/module/rules/progression.ts");
    expect(retirementBenefits(0)).toEqual({ perk: 0, background: 0, attributePoint: 0, skillTrade: false, legendaryItem: false });
    expect(retirementBenefits(3)).toEqual({ perk: 1, background: 1, attributePoint: 1, skillTrade: false, legendaryItem: false });
    expect(retirementBenefits(7)).toMatchObject({ skillTrade: true, legendaryItem: true });
  });
});
