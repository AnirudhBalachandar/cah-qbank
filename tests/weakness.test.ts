import { describe, expect, it } from "vitest";

import { calculateWeaknessScores, getRecommendedWeaknessMix } from "../app/src/lib/server/weakness";

describe("weakness scoring", () => {
  it("ranks lower mastery topics higher", () => {
    const now = new Date("2026-02-12T00:00:00Z");
    const scores = calculateWeaknessScores(
      [
        {
          tagId: "a",
          tagName: "Hypertension",
          attempts: 20,
          masteryScore: 0.35,
          lastAttemptAt: new Date("2026-02-10T00:00:00Z"),
          moduleWeight: 0.8,
        },
        {
          tagId: "b",
          tagName: "Contraception",
          attempts: 20,
          masteryScore: 0.78,
          lastAttemptAt: new Date("2026-02-10T00:00:00Z"),
          moduleWeight: 0.8,
        },
      ],
      now,
    );

    expect(scores[0].tagId).toBe("a");
    expect(scores[0].weaknessScore).toBeGreaterThan(scores[1].weaknessScore);
  });

  it("gives a slight confidence penalty when attempts are sparse", () => {
    const now = new Date("2026-02-12T00:00:00Z");
    const scores = calculateWeaknessScores(
      [
        {
          tagId: "few",
          tagName: "Few attempts",
          attempts: 2,
          masteryScore: 0.55,
          lastAttemptAt: now,
          moduleWeight: 0.5,
        },
        {
          tagId: "many",
          tagName: "Many attempts",
          attempts: 20,
          masteryScore: 0.55,
          lastAttemptAt: now,
          moduleWeight: 0.5,
        },
      ],
      now,
    );

    expect(scores.find((entry) => entry.tagId === "few")?.confidencePenalty).toBeGreaterThan(0);
    expect(scores.find((entry) => entry.tagId === "many")?.confidencePenalty).toBe(0);
  });

  it("returns the configured recommended mix", () => {
    const mix = getRecommendedWeaknessMix();
    expect(mix.weakTagsPortion).toBe(0.6);
    expect(mix.retentionPortion).toBe(0.4);
  });

  it("is deterministic when weakness scores tie", () => {
    const now = new Date("2026-02-12T00:00:00Z");
    const input = [
      {
        tagId: "tag-b",
        tagName: "Beta",
        attempts: 4,
        masteryScore: 0.5,
        lastAttemptAt: now,
        moduleWeight: 0.6,
      },
      {
        tagId: "tag-a",
        tagName: "Alpha",
        attempts: 4,
        masteryScore: 0.5,
        lastAttemptAt: now,
        moduleWeight: 0.6,
      },
    ];

    const first = calculateWeaknessScores(input, now).map((entry) => entry.tagId);
    const second = calculateWeaknessScores(input, now).map((entry) => entry.tagId);

    expect(first).toEqual(["tag-a", "tag-b"]);
    expect(second).toEqual(first);
  });
});
