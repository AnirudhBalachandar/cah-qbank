Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **one batch only** from the master batch plan.

This batch is:

- batch id: `B04`
- curriculum area: `Adolescent Medicine`
- topic cluster: `Alcohol, vaping, cannabis, and screening`
- exact subtopics: `alcohol and other drugs; e-cigarettes; cannabis harms and withdrawal; CRAFFT and AUDIT-C; brief intervention / 5 A's`
- target question count: `12`
- preferred question style mix: `A`
- source priority notes: `Louisa - Alcohol and Other Drugs block`
- overlap-risk notes: `Moderate; avoid the rejected parental-alcohol-supply pattern family`

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
- SI units where relevant
- education-only, not medical advice
- all citations internal only
- prefer note-PDF citations over question-zip citations

Originality rules:

- prefer counselling, screening, brief intervention, follow-up, withdrawal recognition, and practical next-step questions
- avoid the old parental-alcohol-supply long-term-dependence angle that was previously rejected in the workflow
- avoid pure checklist recall unless the question is clearly clinically applied
- if a concept feels too close to older exam wording, skip it and replace it with another subtopic item from the same batch

Style mix `A` target:

- 4 counselling/explanation
- 3 screening/red-flag recognition
- 3 management/follow-up
- 2 diagnostic discrimination

Good angle examples for this batch:

- how to interpret or use CRAFFT / AUDIT-C in an applied scenario
- how to counsel about vaping or cannabis harms without turning the item into rote recall
- recognising withdrawal or impairment patterns
- how brief intervention / 5 A's would guide next-step management
- explaining why substance use matters even when it feels “social” or “normalised”

Output requirements:

- return **one JSON object only**
- top-level key must be `questions`
- each question must follow `OUTPUT_SPEC.md`
- generate exactly `12` questions

Before answering, silently self-check that:

- this batch is grounded in the notes first
- the batch does not feel like a rewrite of the question zip
- the questions are clinically applied rather than checklist-heavy
- the response is valid JSON only

Return JSON only.
