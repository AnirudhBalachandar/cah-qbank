import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  evaluateSimilarities,
  isSimilarityRejected,
  trigramOverlap,
  type SimilarityContext,
} from "../app/src/lib/server/generation/similarity";

describe("similarity guardrails", () => {
  it("applies rejection thresholds at exact boundaries", () => {
    expect(isSimilarityRejected(0.35, 0.1)).toBe(true);
    expect(isSimilarityRejected(0.1, 0.92)).toBe(true);
    expect(isSimilarityRejected(0.3499, 0.9199)).toBe(false);
  });

  it("computes deterministic trigram overlap", () => {
    const a = "Pre-eclampsia assessment includes blood pressure and urine protein.";
    const b = "Assessment for pre eclampsia includes blood pressure and urine protein.";

    const first = trigramOverlap(a, b);
    const second = trigramOverlap(a, b);

    expect(first).toBeGreaterThan(0.5);
    expect(second).toBe(first);
  });

  it("does not over-penalize overlap against a much shorter generic stem", () => {
    const candidate =
      "A 15-year-old increasingly wants private time in clinic and more say in daily routines. Which parental response best supports autonomy?";
    const genericExisting = "Developmental delay";

    expect(trigramOverlap(candidate, genericExisting)).toBeLessThan(0.35);
  });

  it("computes cosine similarity consistently", () => {
    const v1 = [1, 2, 3];
    const v2 = [1, 2, 3];
    const v3 = [-1, -2, -3];

    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1, 8);
    expect(cosineSimilarity(v1, v3)).toBeCloseTo(-1, 8);
  });

  it("short-circuits cosine checks when overlap already exceeds rejection threshold", async () => {
    const context: SimilarityContext = {
      rows: [
        {
          id: "q-1",
          stem: "A 32-year-old at 36 weeks has severe headache, hypertension and proteinuria.",
          source: {},
          embedding: [0.1, 0.2, 0.3],
          embeddingCacheKey: "q-1:hash",
        },
      ],
      client: {} as SimilarityContext["client"],
      model: "test-model",
      candidateEmbeddingCache: new Map(),
    };

    const [result] = await evaluateSimilarities(
      ["A 32 year old at 36 weeks has severe headache hypertension and proteinuria."],
      context,
    );

    expect(result.rejected).toBe(true);
    expect(result.maxOverlap).toBeGreaterThanOrEqual(0.35);
    expect(result.maxCosine).toBe(0);
    expect(result.cosineQuestionId).toBeNull();
  });
});
