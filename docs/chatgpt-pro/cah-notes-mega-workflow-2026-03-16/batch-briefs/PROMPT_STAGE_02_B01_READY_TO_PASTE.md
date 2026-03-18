Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **one batch only** from the master batch plan.

This batch is:

- batch id: `B01`
- curriculum area: `Adolescent Medicine`
- topic cluster: `Adolescent foundations and interview structure`
- exact subtopics: `resilience; parenting style; developmental tasks of adolescence; HEEADSS assessment; adolescent brain maturation and risk-taking`
- target question count: `12`
- preferred question style mix: `A`
- source priority notes: `Louisa - Adolescent Health opening block`
- overlap-risk notes: `Low; keep items applied and avoid simple list recall`

Task:

- generate only this requested batch
- do not drift into other subtopics
- keep the questions grounded in the note PDFs first
- do not imitate or paraphrase past-question stems
- avoid the rejected pattern families in `REJECTED_PATTERNS_SUMMARY.md`

Hard rules:

- SBA only
- exactly 5 options `A` to `E`
- one best answer only
- Australian paediatrics framing
- SI units
- education-only, not medical advice
- all citations internal only
- prefer note-PDF citations over question-zip citations

Originality rules:

- prefer counselling, follow-up, discriminator, interpretation, explanation, prevention, and complication questions
- avoid using classic clue bundles from the question zip unless the reasoning task is clearly different
- if a concept feels too close to past-question wording, skip it and replace it with another subtopic item from the same batch

Style mix `A` target:

- 4 counselling/explanation
- 3 screening/red-flag recognition
- 3 management/follow-up
- 2 diagnostic discrimination

Output requirements:

- return **one JSON object only**
- top-level key must be `questions`
- each question must follow `OUTPUT_SPEC.md`
- generate exactly `12` questions

Before answering, silently self-check that:

- this batch is grounded in the notes first
- the batch does not feel like a rewrite of the question zip
- the response is valid JSON only

Return JSON only.
