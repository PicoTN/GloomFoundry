import { describe, expect, it } from "vitest";
import { cubeDistance, cubeKey, cubeLine, forcedMoves, pathThrough, type Cube } from "../src/module/rules/hex.ts";

const c = (q: number, r: number): Cube => ({ q, r, s: -q - r });

describe("hex lines", () => {
  it("draws straight lines", () => {
    expect(cubeLine(c(0, 0), c(3, 0)).map(cubeKey)).toEqual(["0,0", "1,0", "2,0", "3,0"]);
    expect(cubeLine(c(0, 0), c(0, 0))).toHaveLength(1);
  });
  it("lines are connected", () => {
    const line = cubeLine(c(0, 0), c(4, -2));
    for (let i = 1; i < line.length; i++) expect(cubeDistance(line[i - 1]!, line[i]!)).toBe(1);
  });
  it("paths through waypoints skip the start", () => {
    expect(pathThrough([c(0, 0), c(2, 0), c(2, 1)]).map(cubeKey)).toEqual(["1,0", "2,0", "2,1"]);
  });
});

describe("forced movement (p. 76)", () => {
  it("push moves away, up to X spaces", () => {
    const moves = forcedMoves(c(1, 0), c(0, 0), 2, "push", new Set());
    expect(moves.has("1,0")).toBe(true);
    for (const { cell, path } of moves.values()) {
      expect(path.length).toBeLessThanOrEqual(2);
      expect(cubeDistance(cell, c(0, 0))).toBe(1 + path.length);
    }
    expect(moves.has("3,0")).toBe(true);
  });
  it("pull moves closer and never into the puller", () => {
    const moves = forcedMoves(c(3, 0), c(0, 0), 5, "pull", new Set());
    expect(moves.has("0,0")).toBe(false);
    expect(moves.has("1,0")).toBe(true);
  });
  it("walls stop a step", () => {
    const wall = (a: Cube, b: Cube) => !(cubeKey(a) === "1,0" && cubeKey(b) === "2,0");
    const moves = forcedMoves(c(1, 0), c(0, 0), 1, "push", new Set(), { canStep: wall });
    expect(moves.has("2,0")).toBe(false);
    expect(moves.size).toBeGreaterThan(1);
  });
  it("a flying target crosses characters but doesn't end on them", () => {
    const moves = forcedMoves(c(1, 0), c(0, 0), 2, "push", new Set(), { noEnd: new Set(["2,0"]) });
    expect(moves.has("2,0")).toBe(false);
    expect(moves.has("3,0")).toBe(true);
  });
  it("blocked spaces stop the movement", () => {
    const moves = forcedMoves(c(1, 0), c(0, 0), 1, "push", new Set(["2,0", "2,-1", "1,1"]));
    expect([...moves.keys()]).toEqual(["1,0"]);
  });
});
