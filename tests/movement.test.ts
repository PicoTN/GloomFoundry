import { describe, expect, it } from "vitest";
import { checkMove, type MoveCheck } from "../src/module/rules/movement.ts";

const base: MoveCheck = {
  inCombat: true, phase: "action", isCurrent: true, immobilized: false, stunned: false,
  action: "walk", cost: 2, used: 0, grants: [{ amount: 3 }],
};

describe("movement in combat", () => {
  it("is free outside combat", () => {
    expect(checkMove({ ...base, inCombat: false, grants: [] }).ok).toBe(true);
  });
  it("needs the action phase and your turn", () => {
    expect(checkMove({ ...base, phase: "planning" })).toEqual({ ok: false, reason: "planning" });
    expect(checkMove({ ...base, isCurrent: false })).toEqual({ ok: false, reason: "notYourTurn" });
  });
  it("needs a Move ability and stays within it", () => {
    expect(checkMove({ ...base, grants: [] })).toEqual({ ok: false, reason: "noMove" });
    expect(checkMove(base).ok).toBe(true);
    expect(checkMove({ ...base, cost: 4 })).toEqual({ ok: false, reason: "tooFar", left: 3 });
    expect(checkMove({ ...base, used: 2, cost: 2 })).toEqual({ ok: false, reason: "tooFar", left: 1 });
    expect(checkMove({ ...base, grants: [{ amount: 3 }, { amount: 2 }], used: 3, cost: 2 }).ok).toBe(true);
  });
  it("checks conditions and movement types", () => {
    expect(checkMove({ ...base, immobilized: true }).ok).toBe(false);
    expect(checkMove({ ...base, stunned: true }).ok).toBe(false);
    expect(checkMove({ ...base, action: "jump" })).toEqual({ ok: false, reason: "noJump" });
    expect(checkMove({ ...base, action: "jump", grants: [{ amount: 3, jump: true }] }).ok).toBe(true);
    expect(checkMove({ ...base, action: "fly" })).toEqual({ ok: false, reason: "noFly" });
    expect(checkMove({ ...base, action: "blink" }).ok).toBe(false);
    expect(checkMove({ ...base, action: "displace", grants: [] }).ok).toBe(true);
  });
});
