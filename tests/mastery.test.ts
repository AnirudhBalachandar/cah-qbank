import { describe, expect, it } from "vitest";

import { applyDecay, confidenceWeight } from "../app/src/lib/server/mastery-math";

describe("mastery math", () => {
  it("decays alpha/beta toward priors over time", () => {
    const then = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-03-01T00:00:00Z");

    const decayed = applyDecay(5, 3, then, now);

    expect(decayed.alpha).toBeLessThan(5);
    expect(decayed.beta).toBeLessThan(3);
    expect(decayed.alpha).toBeGreaterThan(1);
    expect(decayed.beta).toBeGreaterThan(1);
  });

  it("weights higher confidence attempts more", () => {
    expect(confidenceWeight(1)).toBeLessThan(confidenceWeight(5));
    expect(confidenceWeight(null)).toBe(1);
  });
});
