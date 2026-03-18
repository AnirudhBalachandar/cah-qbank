Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **one batch only** from the master batch plan.

This batch is:

- batch id: `B02`
- curriculum area: `Adolescent Medicine`
- topic cluster: `Consent, confidentiality, and service access`
- exact subtopics: `mature minor / Gillick competence; consent in emergencies; refusal and conflict; special medical treatment; Medicare access for adolescents`
- target question count: `12`
- preferred question style mix: `A`
- source priority notes: `Louisa - Adolescent Health consent + Medicare block`
- overlap-risk notes: `Low; avoid legal trivia-only items`

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

- prefer counselling, follow-up, explanation, conflict-resolution, service-access, and practical next-step questions
- avoid statute-number trivia, isolated legal definition recall, or rote legal lists without clinical application
- avoid using classic clue bundles from the question zip unless the reasoning task is clearly different
- if a concept feels too close to past-question wording, skip it and replace it with another subtopic item from the same batch

Style mix `A` target:

- 4 counselling/explanation
- 3 screening/red-flag recognition
- 3 management/follow-up
- 2 diagnostic discrimination

Good angle examples for this batch:

- explaining confidentiality boundaries to an adolescent or parent
- deciding the next step when adolescent and parent disagree
- identifying when emergency treatment can proceed
- recognising when special medical treatment needs escalation
- practical service-access or Medicare-use scenarios

Output requirements:

- return **one JSON object only**
- top-level key must be `questions`
- each question must follow `OUTPUT_SPEC.md`
- generate exactly `12` questions

Before answering, silently self-check that:

- this batch is grounded in the notes first
- the batch does not feel like a rewrite of the question zip
- the batch is clinically applied rather than legal-trivia-heavy
- the response is valid JSON only

Return JSON only.
