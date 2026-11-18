import { describe, expect, it } from "vitest";
import { failuresToDrop, recordRequest, startingTierForLevel, successesToAdvance } from "../src/module/rules/factions.ts";

const member = (tier: number, successes = 0, failures = 0) => ({ tier, member: true, successes, failures });

describe("faction reputation", () => {
  it("needs as many successes as the current tier to rise", () => {
    expect([1, 2, 3, 4].map((t) => successesToAdvance(member(t)))).toEqual([1, 2, 3, 4]);
    expect(successesToAdvance(member(5))).toBeNull();
    expect(successesToAdvance({ tier: 1, member: false })).toBeNull();
  });

  it("drops after as many failures as the tier below; T1 members turn Hostile after 3", () => {
    expect([1, 2, 3, 4, 5].map((t) => failuresToDrop(member(t)))).toEqual([3, 1, 2, 3, 4]);
    expect(failuresToDrop({ tier: 2, member: false })).toBeNull();
  });

  it("rises and resets both tallies", () => {
    expect(recordRequest(member(2, 1, 0), true)).toEqual(member(3));
    expect(recordRequest(member(3, 0, 1), true)).toEqual(member(3, 1, 1));
  });

  it("falls and resets both tallies", () => {
    expect(recordRequest(member(3, 2, 1), false)).toEqual(member(2));
    expect(recordRequest(member(2), false)).toEqual(member(1));
    expect(recordRequest(member(1, 0, 2), false)).toEqual(member(0));
  });

  it("ignores non-members' requests", () => {
    const s = { tier: 1, member: false, successes: 0, failures: 0 };
    expect(recordRequest(s, false)).toEqual(s);
    expect(recordRequest(s, true)).toEqual(s);
  });

  it("starting tier by level", () => {
    expect([1, 2, 3, 4, 5, 7, 8, 9].map(startingTierForLevel)).toEqual([2, 2, 3, 3, 4, 4, 5, 5]);
  });
});
