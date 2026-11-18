import { describe, expect, it } from "vitest";
import { activeStates, addToCounter, availablePoolItems, countersCover, playInSlot, type Mechanic } from "../src/module/rules/class-mechanics.ts";

const berserk: Mechanic = { type: "state", id: "berserk", label: "Berserk", rule: "hpHalfOrLess" };
const notes: Extract<Mechanic, { type: "counters" }> = { type: "counters", id: "notes", label: "Notes", max: 4, counters: [{ id: "bass", label: "Bass" }, { id: "treble", label: "Treble" }] };

describe("class mechanics", () => {
  it("Berserk at half HP or less (rounded down)", () => {
    expect(activeStates([berserk], { value: 5, max: 10 }).has("berserk")).toBe(true);
    expect(activeStates([berserk], { value: 6, max: 11 }).has("berserk")).toBe(false);
    expect(activeStates([berserk], { value: 5, max: 11 }).has("berserk")).toBe(true);
  });

  it("counters share a maximum", () => {
    let r = addToCounter(notes, { bass: 2, treble: 1 }, "treble", 3);
    expect(r).toEqual({ counters: { bass: 2, treble: 2 }, gained: 1 });
    r = addToCounter(notes, r.counters, "bass", -5);
    expect(r.counters.bass).toBe(0);
    expect(countersCover({ bass: 2, treble: 1 }, { bass: 2, treble: 1 })).toBe(true);
    expect(countersCover({ bass: 1 }, { bass: 2 })).toBe(false);
  });

  it("slots drop the oldest when full", () => {
    expect(playInSlot(1, [{ name: "A" }], { name: "B" })).toEqual({ list: [{ name: "B" }], removed: [{ name: "A" }] });
    expect(playInSlot(2, [{ name: "A" }], { name: "B" }).removed).toEqual([]);
  });

  it("pool items available", () => {
    const pool = { type: "pool", id: "supply", label: "Supply", items: [{ name: "Iron Plate", text: "" }, { name: "Sharpened Dirk", text: "" }] } as const;
    expect(availablePoolItems(pool as never, { "Iron Plate": "Actor.x" }).map((i) => i.name)).toEqual(["Sharpened Dirk"]);
  });
});
