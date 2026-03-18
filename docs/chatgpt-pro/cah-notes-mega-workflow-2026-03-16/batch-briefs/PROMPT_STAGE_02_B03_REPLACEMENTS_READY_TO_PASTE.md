Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **replacement questions only** for batch `B03`.

Context:

- `B03` target was `12` questions
- `6` questions were already accepted
- `6` questions need replacement because they were too similar to other items in the same batch or existing local content

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Sexual health and risky sexual behaviour`
- exact subtopics: `sexual health framing; age of consent in NSW; adolescent sexual behaviour; risky sexual behaviour; counselling and follow-up`

Task:

- generate exactly `6` new replacement questions only
- stay inside the same `B03` topic scope
- do not repeat accepted or rejected angles
- do not imitate or paraphrase past-question stems
- keep the questions grounded in the note PDFs first

Do **not** reuse these already accepted angles:

- close-in-age defence in NSW when both people are 14 or over and the age difference is 2 years or less
- `about 50% feel good after intercourse` plus the conclusion that emotional impact should still be assessed
- ADHD / impulsivity as an exacerbating factor for risky sexual behaviour
- multiple partners plus inconsistent condom use leading to broader follow-up
- HIV knowledge being high while STI knowledge is poor
- identifying the scenario least consistent with risky sexual behaviour

Do **not** reuse these rejected or overlapping angle families:

- broad parent explanation of `why sexuality is asked about in routine review`
- older adolescents in relationships may have more unprotected intercourse
- social-media exposure has a sketchy / bidirectional relationship with sexual behaviour
- pattern-recognition question listing the psychosocial predictors of risky sexual behaviour
- `sexual act involving a person under 14 years old` as the clearest legal red flag
- `sex without pleasure affecting wellbeing` as the direct reason for follow-up

Prefer fresh note-grounded angles such as:

- counselling that sexual health is broader than infection and pregnancy, but using a different applied scenario from the rejected parent question
- nuanced communication about the legal framework in NSW without repeating the close-in-age or under-14 stems
- follow-up after risky sexual behaviour using wellbeing, pleasure, protection, or relationship context in a new way
- explanation of the increasing gap between first sexual experience and monogamy, or how improved sexual education may coexist with rising STI rates and stable teen births
- adolescent sexual behaviour trends or parent/clinician communication framed in a more original scenario
- CAH Bible predictor content used for counselling, prevention, or support planning rather than pure pattern recognition

Originality rules:

- prefer counselling/explanation, prevention, follow-up, and communication-heavy questions
- avoid legal-trivia-only recall
- avoid simply restating a note sentence as a stem
- if a concept feels too close to an accepted or rejected family, skip it and replace it with another subtopic item from the same batch

Hard rules:

- SBA only
- exactly 5 options `A` to `E`
- one best answer only
- Australian paediatrics framing
- SI units where relevant
- education-only, not medical advice
- all citations internal only
- prefer note-PDF citations over question-zip citations

Output requirements:

- return **one JSON object only**
- top-level key must be `questions`
- each question must follow `OUTPUT_SPEC.md`
- generate exactly `6` questions

Before answering, silently self-check that:

- these are replacements, not paraphrases of prior items
- the set feels counselling-heavy rather than sentence-rewrite-heavy
- the response is valid JSON only

Return JSON only.
