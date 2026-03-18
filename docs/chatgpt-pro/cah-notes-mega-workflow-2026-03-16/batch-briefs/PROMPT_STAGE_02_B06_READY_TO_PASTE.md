Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **one batch only** from the master batch plan.

This batch is:

- batch id: `B06`
- curriculum area: `Paediatric Sub-specialties`
- topic cluster: `Dentistry foundations and prevention`
- exact subtopics: `dental anatomy; saliva and oral tissues; oro-facial infections; eruption cyst; natal tooth; ankyloglossia; dental caries risk and prevention; normal dental development`
- target question count: `12`
- preferred question style mix: `A`
- source priority notes: `Louisa - Dentistry pp.132-133`
- overlap-risk notes: `Low; highly note-specific`

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

- prefer counselling, follow-up, discriminator, interpretation, explanation, prevention, and complication questions
- avoid turning the batch into isolated anatomy-fact recall
- keep the items clinically applied and family/practice relevant where possible
- if a concept feels too close to past-question wording, skip it and replace it with another subtopic item from the same batch

Style mix `A` target:

- 4 counselling/explanation
- 3 screening/red-flag recognition
- 3 management/follow-up
- 2 diagnostic discrimination

Good angle examples for this batch:

- prevention counselling around early caries risk and oral-health protection
- distinguishing normal dental development from pathology in infancy
- recognising when oral or facial swelling suggests a dental or oro-facial infection issue
- applied management questions around natal tooth, eruption cyst, or ankyloglossia
- explanation questions linking saliva, oral tissues, and caries protection in practical scenarios

Output requirements:

- return **one JSON object only**
- top-level key must be `questions`
- each question must follow `OUTPUT_SPEC.md`
- generate exactly `12` questions

Before answering, silently self-check that:

- this batch is grounded in the notes first
- the batch does not feel like a rewrite of the question zip
- the questions are clinically applied rather than recall-heavy
- the response is valid JSON only

Return JSON only.
