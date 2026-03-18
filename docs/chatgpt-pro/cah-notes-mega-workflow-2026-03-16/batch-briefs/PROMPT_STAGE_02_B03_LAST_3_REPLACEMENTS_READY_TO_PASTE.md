Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating the **last 3 replacement questions only** for batch `B03`.

Context:

- `B03` target was `12` questions
- `9` questions are already accepted
- only `3` more questions are needed

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Sexual health and risky sexual behaviour`
- exact subtopics: `sexual health framing; age of consent in NSW; adolescent sexual behaviour; risky sexual behaviour; counselling and follow-up`

Task:

- generate exactly `3` new replacement questions only
- stay inside the same `B03` topic scope
- avoid all accepted and rejected angle families
- do not imitate or paraphrase prior stems
- keep the questions grounded in the note PDFs first

Already accepted angles to avoid:

- close-in-age defence in NSW when both people are 14 or over and age difference is 2 years or less
- only about half feel good after intercourse, so emotional impact should still be assessed
- ADHD / impulsivity as an exacerbating factor
- multiple partners plus inconsistent condom use leading to broader follow-up
- HIV knowledge high but STI knowledge poor
- least-consistent-with-risky-sexual-behaviour discriminator
- stable teen birth rates do not mean risk is falling because STIs are rising
- broad psychosocial follow-up for early dating, time home alone, poor school engagement, low self-esteem, and other risky behaviours
- sexual health still applies even without sexual activity when sexuality-related distress is affecting wellbeing

Rejected / overlapping angle families to avoid completely:

- broad parent explanation of why sexuality is asked about in routine review
- older adolescents in relationships may have more unprotected intercourse
- social-media exposure has a sketchy / bidirectional relationship with sexual behaviour
- direct pattern-recognition question listing psychosocial predictors of risky sexual behaviour
- `sexual act involving a person under 14` as the main legal red flag
- `sex without pleasure affecting wellbeing` as the direct follow-up scenario
- `16 with a 17-year-old partner` asking if consensual sex is automatically illegal
- `only oral / not intercourse yet, so counselling can wait`
- `first sex usually coincides with monogamy`
- contraception is reliable so relationship stress still counts as sexual health
- `15-year-old with 18-year-old boyfriend` asking for reassurance because she agreed
- single sexual experience months ago means there is nothing else to cover
- sex only when drinking at parties means it is just an alcohol problem

Prefer only fresh angle families like:

- applied age-of-consent communication in a different NSW scenario from all prior ones
- counselling or follow-up after risky sexual behaviour using a different trigger from intercourse count, condom use, first sex, or alcohol-at-sex
- wellbeing- or sexuality-related counselling framed in a new scenario that does not reuse accepted or rejected wording

Originality rules:

- prefer counselling, prevention, follow-up, and communication-heavy questions
- avoid legal-trivia-only recall
- avoid sentence-level rewrites of the notes
- if a concept feels close to a banned family, replace it with another

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
- generate exactly `3` questions

Before answering, silently self-check that:

- none of the 3 questions paraphrase accepted or rejected items
- the response is valid JSON only

Return JSON only.
