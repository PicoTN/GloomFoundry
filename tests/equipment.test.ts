import { describe, expect, it } from "vitest";
import { capacity, checkEquip, freesEnough, inventoryUsed, smallOverflow, swapRule, type Gear } from "../src/module/rules/equipment.ts";

const g = (id: string, slot: Gear["slot"], equipped: boolean, extra: Partial<Gear> = {}): Gear => ({ id, name: id, slot, equipped, ...extra });

describe("equip slots (p. 87)", () => {
  it("allows two one-handed items, not a third", () => {
    const gear = [g("a", "hand", true), g("b", "hand", true), g("c", "hand", false)];
    const r = checkEquip(gear[2]!, 1, gear);
    expect(r.ok).toBe(false);
    expect(r.free).toBe(1);
    expect(r.candidates.map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("a two-handed item needs both hands", () => {
    const gear = [g("a", "hand", true), g("bow", "hand", false, { hands: 2 })];
    const r = checkEquip(gear[1]!, 1, gear);
    expect(r.ok).toBe(false);
    expect(r.free).toBe(1);
    expect(checkEquip(gear[1]!, 1, [gear[1]!]).ok).toBe(true);
  });
  it("one head item", () => {
    const gear = [g("helm", "head", true), g("hood", "head", false)];
    expect(checkEquip(gear[1]!, 1, gear).ok).toBe(false);
  });
  it("Small slots grow with level and pockets", () => {
    expect(capacity("small", 1, [])).toBe(1);
    expect(capacity("small", 4, [])).toBe(2);
    expect(capacity("small", 1, [g("cloak", "body", true, { smallSlots: 2 })])).toBe(3);
    expect(capacity("small", 1, [g("cloak", "body", false, { smallSlots: 2 })])).toBe(1);
  });
  it("detects Small overflow when the cloak comes off", () => {
    const gear = [g("cloak", "body", false, { smallSlots: 2 }), g("s1", "small", true), g("s2", "small", true)];
    expect(smallOverflow(1, gear)).toBe(1);
  });
  it("checks that a swap frees enough", () => {
    expect(freesEnough([g("a", "hand", true)], 2)).toBe(false);
    expect(freesEnough([g("a", "hand", true), g("b", "hand", true)], 2)).toBe(true);
    expect(freesEnough([g("bow", "hand", true, { hands: 2 })], 2)).toBe(true);
  });
  it("other items can't be equipped", () => {
    expect(checkEquip(g("rope", "none", false), 1, []).ok).toBe(false);
  });
});

describe("inventory and swaps", () => {
  it("counts unequipped space with fractions and quantities", () => {
    const gear = [g("rations", "none", false, { space: 0.5, quantity: 3 }), g("torch", "none", false, { space: 0.2 }), g("sword", "hand", true)];
    expect(inventoryUsed(gear)).toBe(1.7);
  });
  it("limits swaps in combat (p. 87)", () => {
    expect(swapRule("body", false, false)).toBe("free");
    expect(swapRule("hand", true, false)).toBe("primary");
    expect(swapRule("small", true, false)).toBe("primary");
    expect(swapRule("head", true, false)).toBe("forbidden");
    expect(swapRule("hand", true, true)).toBe("stunned");
  });
});
