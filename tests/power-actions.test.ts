import { describe, expect, it } from "vitest";
import { parsePowerActions } from "../src/module/rules/power-actions.ts";

describe("parsePowerActions", () => {
  it("attacks with range, targets, area and conditions", () => {
    expect(parsePowerActions("Attack 2, 3-space cluster, range 3, Wound.")).toEqual([{
      kind: "attack", value: 2, relative: false, range: 3, targets: 1, pierce: 0,
      area: { shape: "cluster", size: 3 }, conditions: ["Wound"],
    }]);
    const [a] = parsePowerActions("Move +0. Attack +0, range 4.").filter((x) => x.kind === "attack");
    expect(a).toMatchObject({ value: 0, relative: true, range: 4 });
    expect(parsePowerActions("Attack 3, target 2, range 4, Pierce 3")[0]).toMatchObject({ targets: 2, pierce: 3 });
  });

  it("heals self or at range", () => {
    expect(parsePowerActions("Heal 2, yourself")[0]).toMatchObject({ kind: "heal", value: 2, self: true });
    expect(parsePowerActions("Heal 3, range 3, Safeguard")[0]).toMatchObject({ kind: "heal", self: false, range: 3, conditions: ["Safeguard"] });
  });

  it("traps, obstacles, summons", () => {
    expect(parsePowerActions("Create one damage 3, Poison trap in any empty adjacent space.")[0])
      .toEqual({ kind: "trap", count: 1, damage: 3, effects: ["Poison"] });
    expect(parsePowerActions("Create two damage 2, Immobilize traps in any empty spaces within range 2.")[0])
      .toMatchObject({ count: 2, damage: 2, effects: ["Immobilize"] });
    expect(parsePowerActions("Create a 1-space obstacle in any adjacent empty space.")[0]).toEqual({ kind: "obstacle", count: 1 });
    expect(parsePowerActions("Summon 1 option from the summon list.")[0]).toEqual({ kind: "summon" });
  });

  it("infusions and loose conditions", () => {
    expect(parsePowerActions("Infuse Fire or Air")).toEqual([{ kind: "infuse", elements: ["fire", "air"], either: true }]);
    expect(parsePowerActions("Grant 1 ally within range 3: Strengthen.")).toEqual([{ kind: "condition", id: "strengthen", self: false }]);
    expect(parsePowerActions("Ward, yourself.")).toEqual([{ kind: "condition", id: "ward", self: true }]);
  });
});
