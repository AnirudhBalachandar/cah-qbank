import dotenv from "dotenv";

import { validateGeneratedPayload } from "../../app/src/lib/server/generation/validator";

dotenv.config();

const strictPayload = {
  questions: [
    {
      stem_markdown: "A 2-year-old with bronchiolitis has poor feeding, tachypnoea, and mild hypoxia. What is the next best management step?",
      options: [
        { key: "A", text: "Discharge without review" },
        { key: "B", text: "Start supportive care and reassess severity" },
        { key: "C", text: "Immediate oral steroids for all patients" },
        { key: "D", text: "Routine antibiotics only" },
        { key: "E", text: "No treatment unless a rash appears" },
      ],
      correctKey: "B",
      explanation_markdown: "Bronchiolitis management is centred on supportive care and severity-based monitoring.",
      why_others_wrong: {
        A: "Unsafe for a symptomatic child.",
        C: "Not routine first-line treatment in bronchiolitis.",
        D: "Antibiotics are not first-line without evidence of bacterial infection.",
        E: "The trigger is clinically irrelevant.",
      },
      key_takeaways: [
        "Assess hydration and work of breathing.",
        "Use supportive management first.",
        "Escalate care based on severity.",
      ],
      tags: ["CAH 03 > Respiratory > Bronchiolitis"],
      moduleCode: "CAH 03",
      difficulty: "Intermediate",
      ausScore: 4,
      citations: [
        {
          type: "internal",
          source: "CAH respiratory teaching pack.pdf",
          page: 42,
        },
      ],
    },
  ],
};

const strictResult = validateGeneratedPayload(strictPayload, "strict_internal");
if (!strictResult.valid) {
  console.error("Strict schema validation failed", strictResult.errors);
  process.exit(1);
}

const invalidStrictPayload = {
  questions: [
    {
      ...strictPayload.questions[0],
      citations: [
        {
          type: "external",
          url: "https://example.org",
          title: "Example",
        },
      ],
    },
  ],
};

const invalidResult = validateGeneratedPayload(invalidStrictPayload, "strict_internal");
if (invalidResult.valid) {
  console.error("Strict mode should reject external citations.");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      strictValid: strictResult.valid,
      strictExternalRejected: !invalidResult.valid,
      errors: invalidResult.errors,
    },
    null,
    2,
  ),
);
