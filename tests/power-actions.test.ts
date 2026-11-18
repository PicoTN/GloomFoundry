import { describe, expect, it } from "vitest";
import { parsePowerActions } from "../src/module/rules/power-actions.ts";

describe("parsePowerActions", () => {
  it("attacks with range, targets, area and conditions", () => {
    expect(parsePowerActions("Attack 2, 3-space cluster, range 3, Wound.")).toEqual([{
      kind: "attack", value: 2, relative: false, range: 3, targets: 1, pierce: 0,
      area: { shape: "cluster", size: 3, anchor: "range" }, conditions: ["Wound"],
    }]);
    const acts = parsePowerActions("Move +0. Attack +0, range 4.");
    expect(acts[0]).toEqual({ kind: "move", value: 0, relative: true });
    expect(acts[1]).toMatchObject({ kind: "attack", value: 0, relative: true, range: 4 });
    expect(parsePowerActions("Attack 3, target 2, range 4, Pierce 3")[0]).toMatchObject({ targets: 2, pierce: 3 });
    expect(parsePowerActions("Attack 4 on a 2-space line away from you.")[0]).toMatchObject({ area: { shape: "line", size: 2, anchor: "adjacent" } });
  });

  it("element bonuses", () => {
    const [a] = parsePowerActions("Attack 1, target 2, range 3; if Fire is active, add Wound; if Air is active, add Pull 2.");
    expect(a).toMatchObject({ kind: "attack", targets: 2, conditions: [] });
    expect(a!.bonuses).toEqual([{ elements: ["fire"], conditions: ["Wound"] }, { elements: ["air"], pull: 2 }]);
    const [b] = parsePowerActions("Attack 2, range 3; if any element is active, add +1 attack.");
    expect(b!.bonuses).toEqual([{ anyElement: true, attack: 1 }]);
  });

  it("heals, shields, retaliate", () => {
    expect(parsePowerActions("Heal 2, yourself")[0]).toMatchObject({ kind: "heal", value: 2, self: true });
    expect(parsePowerActions("Heal 3, range 3, Safeguard")[0]).toMatchObject({ kind: "heal", self: false, range: 3, conditions: ["Safeguard"] });
    expect(parsePowerActions("Gain Retaliate 2 and Taunt.")).toContainEqual({ kind: "retaliate", value: 2 });
    expect(parsePowerActions("Move 3. Gain Shield 1.")).toContainEqual({ kind: "shield", value: 1, self: true });
  });

  it("traps, obstacles, summons, infusions and loose conditions", () => {
    expect(parsePowerActions("Create one damage 3, Poison trap in any empty adjacent space.")[0])
      .toEqual({ kind: "trap", count: 1, damage: 3, effects: ["Poison"] });
    expect(parsePowerActions("Create a 1-space obstacle in any adjacent empty space.")[0]).toEqual({ kind: "obstacle", count: 1 });
    expect(parsePowerActions("Summon 1 option from the summon list.")[0]).toEqual({ kind: "summon" });
    expect(parsePowerActions("Infuse Fire or Air")).toEqual([{ kind: "infuse", elements: ["fire", "air"], either: true }]);
    expect(parsePowerActions("Infuse any element.")).toEqual([{ kind: "infuse", elements: [], either: true, any: true }]);
    expect(parsePowerActions("Grant 1 ally within range 3: Strengthen.")).toEqual([{ kind: "condition", id: "strengthen", self: false }]);
  });
});

describe("teleport (p. 74)", () => {
  it("parses Teleport X as a teleport move", () => {
    expect(parsePowerActions("Teleport 4. You and all adjacent allies gain Shield 1.")[0]).toEqual({ kind: "move", value: 4, teleport: true });
  });
});
