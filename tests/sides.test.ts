import { describe, expect, it } from "vitest";
import { areOpposed, DISPOSITION as D } from "../src/module/rules/sides.ts";

describe("areOpposed", () => {
  it("opposes Friendly and Hostile both ways", () => {
    expect(areOpposed(D.FRIENDLY, D.HOSTILE)).toBe(true);
    expect(areOpposed(D.HOSTILE, D.FRIENDLY)).toBe(true);
  });
  it("never opposes the same side, Neutral, Secret or unknown", () => {
    expect(areOpposed(D.FRIENDLY, D.FRIENDLY)).toBe(false);
    expect(areOpposed(D.HOSTILE, D.HOSTILE)).toBe(false);
    expect(areOpposed(D.NEUTRAL, D.HOSTILE)).toBe(false);
    expect(areOpposed(D.FRIENDLY, D.SECRET)).toBe(false);
    expect(areOpposed(undefined, D.HOSTILE)).toBe(false);
  });
});
