Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating the **last 1 replacement question only** for batch `B01`.

Context:

- `B01` target was `12` questions
- `11` questions are already accepted
- only `1` more question is needed

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Adolescent foundations and interview structure`
- exact subtopics: `resilience; parenting style; developmental tasks of adolescence; HEEADSS assessment; adolescent brain maturation and risk-taking`

Task:

- generate exactly `1` new replacement question only
- stay inside the same `B01` topic scope
- do not repeat accepted or rejected angles
- do not imitate or paraphrase past-question stems
- keep the question grounded in the note PDFs first

Hard exclusions:

- do **not** make a developmental-domain label question
- do **not** make a HEEADSS checklist-completion question
- do **not** make a generic “why see the adolescent alone / why confidentiality matters” question
- do **not** make another risk-taking neurodevelopment explanation question
- do **not** make another parenting-style-best-answer question
- do **not** make another resilience single-factor question
- do **not** make another `internal locus of control` counselling question
- do **not** make another substance-use brain-vulnerability question

Prefer a safer angle like:

- the **best opening phrase** a clinician should use when explaining the structure of an adolescent review to both parent and young person
- the **best next step** after rapport is established but before moving into sensitive psychosocial questions
- how to **reconvene the parent** after part of the review is done alone, while preserving adolescent engagement
- a **consultation-structure** question rather than a purpose-of-confidentiality question

Important:

- make the task about **what the clinician should say or do next**
- avoid stems that ask for the **reason** or **purpose** of confidentiality, because those are overlapping too much with accepted items

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
- generate exactly `1` question

Before answering, silently self-check that:

- this is clearly different from the previous 11 accepted items
- the question is about **consultation structure or wording**, not checklist recall or generic confidentiality rationale
- the question feels note-first rather than question-bank-derived
- the response is valid JSON only

Return JSON only.
