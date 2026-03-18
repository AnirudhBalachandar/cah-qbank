Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating the **last 4 replacement questions only** for batch `B03`.

Context:

- `B03` target was `12` questions
- `8` questions are already accepted
- only `4` more questions are needed

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Sexual health and risky sexual behaviour`
- exact subtopics: `sexual health framing; age of consent in NSW; adolescent sexual behaviour; risky sexual behaviour; counselling and follow-up`

Task:

- generate exactly `4` new replacement questions only
- stay inside the same `B03` topic scope
- do not repeat accepted or rejected angles
- do not imitate or paraphrase prior stems
- keep the questions grounded in the note PDFs first

Do **not** reuse these already accepted angles:

- close-in-age defence in NSW when both people are 14 or over and age difference is 2 years or less
- only about half feel good after intercourse, so emotional impact should still be assessed
- ADHD / impulsivity as an exacerbating factor
- multiple partners plus inconsistent condom use leading to broader follow-up
- HIV knowledge high but STI knowledge poor
- least-consistent-with-risky-sexual-behaviour discriminator
- stable teen birth rates do not mean risk is falling because STIs are rising
- broad psychosocial follow-up for early dating, home alone, poor school engagement, low self-esteem, and other risky behaviour

Do **not** reuse these rejected or overlapping angle families:

- broad parent explanation of why sexuality is asked about in routine review
- older adolescents in relationships may have more unprotected intercourse
- social-media exposure has a sketchy / bidirectional relationship with sexual behaviour
- pattern-recognition question listing the psychosocial predictors of risky sexual behaviour
- `sexual act involving a person under 14` as the main legal red flag
- `sex without pleasure affecting wellbeing` as the direct follow-up scenario
- `16 with a 17-year-old partner` asking if consensual sex is automatically illegal
- `only oral / not intercourse yet, so counselling can wait`
- `first sex usually coincides with monogamy`

Prefer fresh note-grounded angles such as:

- another applied sexual-health-as-wellbeing question, but in a different scenario from the rejected contraception/relationship-stress item
- age-of-consent communication framed in a different NSW scenario that does not reuse the close-in-age defence or the 16-with-17 pair
- follow-up or prevention questions using trends, wellbeing, pleasure, or relationship context in a new way
- counselling around the gap between first sexual experience and monogamy, but from a different applied angle than the rejected GP note
- CAH Bible material used for prevention planning rather than a direct predictor list

Originality rules:

- prefer counselling, prevention, follow-up, and communication-heavy questions
- avoid legal-trivia-only recall
- avoid restating a note sentence as the stem
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
- generate exactly `4` questions

Before answering, silently self-check that:

- these are replacements, not paraphrases of prior items
- the set feels counselling-heavy rather than sentence-rewrite-heavy
- the response is valid JSON only

Return JSON only.
