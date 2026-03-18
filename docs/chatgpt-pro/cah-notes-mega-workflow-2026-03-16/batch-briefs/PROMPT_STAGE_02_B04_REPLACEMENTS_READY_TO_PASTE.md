Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **replacement questions only** for batch `B04`.

Context:

- `B04` target was `12` questions
- `6` questions were already accepted
- `6` questions need replacement because they were too similar to other items in the same batch or existing local content

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Alcohol, vaping, cannabis, and screening`
- exact subtopics: `alcohol and other drugs; e-cigarettes; cannabis harms and withdrawal; CRAFFT and AUDIT-C; brief intervention / 5 A's`

Task:

- generate exactly `6` new replacement questions only
- stay inside the same `B04` topic scope
- do not repeat accepted or rejected angles
- do not imitate or paraphrase past-question stems
- keep the questions grounded in the note PDFs first

Do **not** reuse these already accepted angles:

- vaping still matters because e-cigarettes are rising and linked to later traditional cigarette uptake
- the CRAFFT `Car` item about riding with an impaired driver
- AUDIT-C as the alcohol-specific tool rather than CRAFFT
- multiple positive CRAFFT responses prompting fuller assessment
- after Ask + Assess + Advise, the next plan is Assist + Arrange
- conjunctival injection as an acute cannabis effect rather than withdrawal

Do **not** reuse these rejected or overlapping angle families:

- “party drinking is still a health issue” / social drinking as a generic alcohol-risk counselling stem
- cannabis used to self-medicate anxiety or depression
- early experimentation matters because adolescence is peak initiation and the brain is vulnerable
- the exact next step after Ask + Assess in the 5 A’s sequence
- a comprehensive adolescent drug-and-alcohol assessment for multisubstance use with school decline
- classic cannabis withdrawal presentation with irritability, poor appetite, restlessness, vivid dreams
- the previously rejected parental-alcohol-supply pattern family

Prefer fresh note-grounded angles such as:

- counselling about e-cigarette trends or normalisation using a different applied scenario
- alcohol harms framed through binge drinking, mixing substances, or withdrawal risk in a new way
- cannabis harms framed through cognition, concentration, psychosis, or withdrawal recognition using a different presentation
- use of CRAFFT or AUDIT-C in a different clinically applied situation
- brief intervention / 5 A’s questions that do not simply ask for the next step in sequence
- broader interpretation of adolescent substance-use burden, trends, or risk framing without copying rejected stems

Originality rules:

- prefer counselling, screening, follow-up, interpretation, and management-heavy questions
- avoid pure checklist recall unless the task is clearly clinically applied
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
- the set feels clinically applied rather than sentence-rewrite-heavy
- the response is valid JSON only

Return JSON only.
