import { describe, expect, it } from "vitest";

import { angleFamilySimilarity, deriveAngleFamily } from "../scripts/generation/lib/angle-family";

const questionA = {
  stem_markdown: "A 16-year-old presents with delayed sleep phase disorder and keeps reverting to a late sleep schedule on weekends. What counselling point is best?",
  options: [
    { key: "A" as const, text: "Weekend reversion can undermine treatment" },
    { key: "B" as const, text: "Late weekend sleep is always recommended" },
    { key: "C" as const, text: "Morning light should be stopped" },
    { key: "D" as const, text: "This proves narcolepsy" },
    { key: "E" as const, text: "School attendance should stop" }
  ],
  correctKey: "A" as const,
  explanation_markdown: "Weekend and holiday reversion can undo progress in delayed sleep phase disorder.",
  why_others_wrong: {
    "B": "The notes advise against routine reversion.",
    "C": "Morning light remains part of treatment.",
    "D": "The stem still fits delayed sleep phase disorder.",
    "E": "The notes support treatment, not abandoning school."
  },
  key_takeaways: ["Consistency matters.", "Weekend reversion can undermine treatment.", "Morning light remains useful."],
  tags: ["Adolescent Medicine", "sleep", "delayed sleep phase disorder"],
  citations: [{ type: "internal" as const, source: "Louisa.pdf", title: "Louisa.pdf", page: 130 }]
};

const questionB = {
  ...questionA,
  stem_markdown: "A teenager with delayed sleep phase disorder has improved during the week but returns to a late sleep schedule on holidays. What is the key management message?"
};

describe("angle family helpers", () => {
  it("derives stable note/topic-grounded angle families", () => {
    const family = deriveAngleFamily(questionA);
    expect(family).toContain("adolescent-medicine");
    expect(family).toContain("sleep");
  });

  it("scores very similar teaching points as high-similarity families", () => {
    const familyA = deriveAngleFamily(questionA);
    const familyB = deriveAngleFamily(questionB);

    expect(angleFamilySimilarity(familyA, familyB)).toBeGreaterThan(0.5);
  });
});
