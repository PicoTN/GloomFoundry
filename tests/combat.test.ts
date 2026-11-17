import { describe, expect, it } from "vitest";
import {
  allowedSpeeds, decay, displayInitiative, emptyBoard, endTurn, enemyInitiative, expiresAtTurnEnd, infuse,
  isActive, setState, summonInitiative, timelinePosition,
} from "../src/module/rules/combat.ts";

describe("elements", () => {
  it("infusing in combat becomes strong at the end of the turn", () => {
    let b = infuse(emptyBoard(), "fire", true);
    expect(b.states.fire).toBe(0);
    expect(b.pending).toEqual(["fire"]);
    b = endTurn(b);
    expect(b.states.fire).toBe(2);
    expect(b.pending).toEqual([]);
  });

  it("infusing outside combat is immediate", () => {
    expect(infuse(emptyBoard(), "ice", false).states.ice).toBe(2);
  });

  it("decays strong → waning → inert at the end of each round", () => {
    let b = setState(emptyBoard(), "air", 2);
    b = decay(b);
    expect(b.states.air).toBe(1);
    expect(isActive(b.states.air)).toBe(true);
    b = decay(decay(b));
    expect(b.states.air).toBe(0);
  });

  it("a pending infusion survives the end-of-round decay", () => {
    const b = decay(infuse(emptyBoard(), "dark", true));
    expect(b.pending).toEqual(["dark"]);
  });

  it("setting a state clears a pending infusion", () => {
    const b = setState(infuse(emptyBoard(), "light", true), "light", 0);
    expect(b.pending).toEqual([]);
  });
});

describe("initiative", () => {
  it("cannot repeat the previous speed", () => {
    expect(allowedSpeeds("fast")).toEqual(["normal", "slow"]);
    expect(allowedSpeeds(null)).toEqual(["fast", "normal", "slow"]);
  });

  it("elites act before normals, summons before their controller, display is the printed value", () => {
    expect(enemyInitiative(45, true)).toBeLessThan(enemyInitiative(45, false));
    expect(summonInitiative(30, 0)).toBeLessThan(summonInitiative(30, 1));
    expect(summonInitiative(30, 1)).toBeLessThan(30);
    expect(summonInitiative(30, 0)).toBeGreaterThan(29);
    expect(displayInitiative(enemyInitiative(45, true))).toBe("45");
    expect(displayInitiative(summonInitiative(30, 2))).toBe("30");
    expect(displayInitiative(null)).toBe("");
  });
});

describe("condition durations", () => {
  const start = timelinePosition(2, 3);
  it("expires at the end of the next turn when gained before the turn started", () => {
    expect(expiresAtTurnEnd(timelinePosition(2, 1), start)).toBe(true);
    expect(expiresAtTurnEnd(timelinePosition(1, 5), start)).toBe(true);
    expect(expiresAtTurnEnd(null, start)).toBe(true);
  });
  it("survives the turn it was gained in", () => {
    expect(expiresAtTurnEnd(timelinePosition(2, 3), start)).toBe(false);
  });
});
