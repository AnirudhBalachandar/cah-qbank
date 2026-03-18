Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **one batch only** from the master batch plan.

This batch is:

- batch id: `B03`
- curriculum area: `Adolescent Medicine`
- topic cluster: `Sexual health and risky sexual behaviour`
- exact subtopics: `sexual health framing; age of consent in NSW; adolescent sexual behaviour; risky sexual behaviour; counselling and follow-up`
- target question count: `12`
- preferred question style mix: `A`
- source priority notes: `Louisa - Adolescent Sexual Health block`
- overlap-risk notes: `Low-moderate; keep scenarios counselling-heavy`

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

- prefer counselling, follow-up, explanation, confidentiality-sensitive communication, wellbeing, prevention, and practical next-step questions
- avoid legal-trivia-only questions or raw age-threshold recall unless the task is clearly clinically applied
- avoid past-paper-style stem copying from the question zip
- if a concept feels too close to old exam wording, skip it and replace it with another subtopic item from the same batch

Style mix `A` target:

- 4 counselling/explanation
- 3 screening/red-flag recognition
- 3 management/follow-up
- 2 diagnostic discrimination

Good angle examples for this batch:

- explaining sexual health as part of overall adolescent wellbeing
- counselling after risky sexual behaviour or inconsistent contraception / protection
- applied NSW age-of-consent scenarios framed around safe clinical communication, not legal trivia
- recognising when sexual behaviour is affecting mental health or wellbeing
- follow-up, support, or referral decisions after disclosure of concerning sexual health behaviour

Output requirements:

- return **one JSON object only**
- top-level key must be `questions`
- each question must follow `OUTPUT_SPEC.md`
- generate exactly `12` questions

Before answering, silently self-check that:

- this batch is grounded in the notes first
- the batch does not feel like a rewrite of the question zip
- the questions are clinically applied and counselling-heavy rather than legal-trivia-heavy
- the response is valid JSON only

Return JSON only.
