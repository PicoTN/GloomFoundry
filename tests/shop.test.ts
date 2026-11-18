import { describe, expect, it } from "vitest";
import {
  buyPrice, defaultDisplayCount, goldPerMercenary, highestRarity, levelAllows, minProsperity, rarityMarkup, rollStock, sellPrice,
} from "../src/module/rules/shop.ts";

describe("shop inventories (p. 269)", () => {
  it("maps Prosperity to the highest rarity", () => {
    expect([1, 2, 3, 4, 5].map(highestRarity)).toEqual(["common", "common", "uncommon", "rare", "masterwork"]);
  });
  it("finds the Prosperity a rarity needs", () => {
    expect(minProsperity("common")).toBe(1);
    expect(minProsperity("uncommon")).toBe(3);
    expect(minProsperity("rare")).toBe(4);
    expect(minProsperity("masterwork")).toBe(5);
    expect(minProsperity("legendary")).toBeNull();
  });
  it("charges 10 g per missing Prosperity step", () => {
    expect(rarityMarkup("rare", 2)).toBe(20);
    expect(rarityMarkup("rare", 4)).toBe(0);
    expect(rarityMarkup("common", 1)).toBe(0);
  });
  it("rolls display counts in range", () => {
    expect(defaultDisplayCount(1, () => 0)).toBe(4);
    expect(defaultDisplayCount(1, () => 0.99)).toBe(5);
    expect(defaultDisplayCount(4, () => 0.99)).toBe(8);
  });
  it("rolls distinct items within the shop's rarity", () => {
    const catalog = [
      { name: "A", rarity: "common" }, { name: "B", rarity: "uncommon" }, { name: "C", rarity: "rare" },
      { name: "D", rarity: "legendary" }, { name: "A", rarity: "common" },
    ];
    expect(rollStock(catalog, 3, 10).map((i) => i.name).sort()).toEqual(["A", "B"]);
    expect(rollStock(catalog, 5, 10).map((i) => i.name).sort()).toEqual(["A", "B", "C"]);
    expect(rollStock(catalog, 5, 1)).toHaveLength(1);
  });
});

describe("prices", () => {
  it("applies markup, discounts and the rarity markup", () => {
    expect(buyPrice({ cost: 30, rarity: "uncommon", prosperity: 3 })).toBe(30);
    expect(buyPrice({ cost: 30, rarity: "uncommon", prosperity: 3, discount: 20 })).toBe(24);
    expect(buyPrice({ cost: 30, rarity: "uncommon", prosperity: 3, markup: 10 })).toBe(33);
    expect(buyPrice({ cost: 30, rarity: "rare", prosperity: 2 })).toBe(50);
  });
  it("rounds fractional costs up to whole gold", () => {
    expect(buyPrice({ cost: 0.2, rarity: "common", prosperity: 1 })).toBe(1);
    expect(buyPrice({ cost: 0.2, rarity: "common", prosperity: 1, quantity: 5 })).toBe(1);
    expect(buyPrice({ cost: 0.2, rarity: "common", prosperity: 1, quantity: 6 })).toBe(2);
    expect(buyPrice({ cost: 0, rarity: "common", prosperity: 1 })).toBe(0);
  });
  it("sells for half, rounded down", () => {
    expect(sellPrice(25)).toBe(12);
    expect(sellPrice(30, 2)).toBe(30);
    expect(sellPrice(1)).toBe(0);
  });
  it("gates rarities by level (p. 93)", () => {
    expect(levelAllows("rare", 3)).toBe(false);
    expect(levelAllows("rare", 4)).toBe(true);
    expect(levelAllows("masterwork", 6)).toBe(false);
    expect(levelAllows("masterwork", 7)).toBe(true);
    expect(levelAllows("legendary", 10)).toBe(false);
  });
});

describe("mission rewards", () => {
  it("sums the reward lines per mercenary", () => {
    expect(goldPerMercenary([{ label: "Mission", perMercenary: 15 }, { label: "Better Contracts", perMercenary: 10 }])).toBe(25);
    expect(goldPerMercenary([{ label: "x", perMercenary: -3 }])).toBe(0);
  });
});
