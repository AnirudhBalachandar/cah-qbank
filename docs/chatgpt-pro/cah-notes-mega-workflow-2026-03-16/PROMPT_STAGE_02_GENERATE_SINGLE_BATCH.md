Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **one batch only** from the master batch plan.

Inputs for this batch will be:

- batch id
- curriculum area
- exact subtopics
- target question count
- source priority notes
- overlap-risk notes

Task:

- generate only the requested batch
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

Output requirements:

- return **one JSON object only**
- top-level key must be `questions`
- each question must follow `OUTPUT_SPEC.md`
- generate exactly the batch target question count

Before answering, silently self-check that:

- this batch is grounded in the notes first
- the batch does not feel like a rewrite of the question zip
- the response is valid JSON only

Return JSON only.
