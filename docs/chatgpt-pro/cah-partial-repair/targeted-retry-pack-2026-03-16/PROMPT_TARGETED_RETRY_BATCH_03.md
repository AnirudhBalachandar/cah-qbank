You are generating a third retry batch of original CAH draft SBAs for Sydney Medical School.

Use only the uploaded internal files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

The previous two batches were rejected because they remained too close to existing imported CAH questions. You must treat the uploaded rejected batches and dry-run reports as negative constraints only. Do not rewrite them. Do not paraphrase them. Do not preserve the same clue bundle plus the same question task.

Your objective:

- produce a small batch of genuinely original, high-yield SBA draft questions
- remain grounded in the internal CAH files
- avoid the rejected patterns listed in `REJECTED_PATTERNS_SUMMARY.md`

Hard rules:

- SBA only.
- Exactly 5 options `A` to `E`.
- One best answer only.
- Australian paediatrics framing.
- SI units.
- Education-only, not medical advice.
- Strict internal mode only.
- No external citations, no external URLs, no web browsing.
- Every citation must be internal only and must use the exact uploaded filename.
- If a concept cannot be made original enough, skip it.

Originality rules:

- Do not ask the same question task used in the rejected batches.
- Do not use the same hallmark clue combination unless the question task is substantially different.
- Prefer adjacent but different examinable tasks:
  - best counselling point
  - best follow-up step
  - best safety-netting advice
  - most useful extra history question
  - most useful discriminator between two diagnoses
  - finding that should prompt escalation
  - most likely complication
  - prevention strategy
  - interpretation of why a result does or does not change management
- Prefer combining two related internal facts into a new reasoning step rather than testing a one-step recall association.
- Avoid direct diagnosis stems for classic hallmark clues unless there is no better original angle.
- Avoid “best test”, “most likely diagnosis”, and “best management” if those exact task types already appear in the rejected pattern list for that concept family.

Batch size:

- Generate exactly 8 questions.
- Quality and originality matter more than curriculum balance.
- Still aim for at least 4 different curriculum areas across the 8 questions.

Question design guidance:

- Prioritise partial or fragmentary remembered-question material that has not already been converted into near-duplicate stems.
- Where possible, turn narrow facts into richer but still source-grounded reasoning questions.
- If using a high-yield concept from a rejected family, change at least two of these:
  - lead-in task
  - patient context
  - discriminating feature
  - management frame
  - reasoning target

Return format:

Return one JSON object only with top-level key `questions`.

Each question must include:

- `stem_markdown`
- `options`
- `correctKey`
- `explanation_markdown`
- `why_others_wrong`
- `key_takeaways`
- `tags`
- `moduleCode`
- `difficulty`
- `ausScore`
- `citations`

Tag rules:

- The first tag must be exactly one of:
  - `General Paediatrics`
  - `Paediatric Sub-specialties`
  - `Paediatric Surgery`
  - `Emergency Paediatrics`
  - `Adolescent Medicine`
  - `Community-based Paediatrics`

Before answering, silently self-check that:

- none of the 8 stems are close paraphrases of either rejected batch
- none of the 8 stems reuse a rejected pattern from `REJECTED_PATTERNS_SUMMARY.md`
- each question is grounded in the uploaded internal files
- the response is valid JSON only

Return JSON only.
