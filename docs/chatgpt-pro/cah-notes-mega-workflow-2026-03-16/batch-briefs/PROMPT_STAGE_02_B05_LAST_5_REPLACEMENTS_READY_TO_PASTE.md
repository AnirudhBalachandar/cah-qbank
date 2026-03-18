Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **replacement questions only** for batch `B05`.

Context:

- `B05` target was `12` questions
- `7` questions are already accepted
- `5` questions still need replacement because they were too similar to other items in the same batch or existing local content

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Sleep, chronic illness, and transition`
- exact subtopics: `chronic illness in adolescence; adolescent sleep regulation; delayed sleep phase disorder; narcolepsy; transition principles and services`

Task:

- generate exactly `5` new replacement questions only
- stay inside the same `B05` topic scope
- do not repeat accepted or rejected angles
- do not imitate or paraphrase past-question stems
- keep the questions grounded in the note PDFs first

Do **not** reuse these already accepted angles:

- SCHN Trapeze eligibility for a young person with complex chronic illness and an unclear transition pathway
- poor transition leading to loss of illness control and life-threatening presentation such as DKA
- adolescents with chronic illness being more likely to engage in risk behaviours
- driving accidents as the key poor-sleep consequence to highlight for a learner driver
- hospital admission for sleep rescheduling in difficult delayed sleep phase disorder
- narcolepsy with cataplexy identified from laughter-triggered buckling with preserved consciousness
- rising adolescent chronic illness because survival has improved, prevalence has increased, and some conditions appear earlier

Do **not** reuse these rejected or overlapping angle families:

- early transition preparation from about 14 years, building self-management confidence, and re-educating the adolescent about their condition
- proactive follow-up of transition no-shows
- shared paediatric and adult clinics as the key answer
- normal adolescent sleep shift to eveningness / reduced slow-wave sleep as the explanation for later sleep onset
- poor sleep and mental health having a bidirectional relationship
- actigraphy as the tool that objectively estimates home sleep-wake timing and activity
- the classic delayed sleep phase disorder diagnostic vignette with normal sleep quality, later weekend sleep, and trouble waking for school
- weekend/holiday reversion undermining delayed sleep phase disorder treatment
- ADHD and depression as the common comorbidities of delayed sleep phase disorder
- narcolepsy diagnosed from hypnagogic hallucinations and sleep paralysis
- narcolepsy follow-up focused on behavioural problems, mood disorders, or quality of life

Prefer fresh note-grounded angles such as:

- chronic illness definitions, developmental impact, or counselling framed in a new applied scenario
- transition continuity framed through readiness, adolescent involvement, long-term follow-up planning, or primary-care linkage without using checklist-variant wording
- poor-sleep consequences using school absenteeism, academics, mood impact, or risk-taking in a fresh scenario that does not recycle the bidirectional or learner-driver stems
- sleep assessment using sleep diary, polysomnography, or another note-supported tool in a clinically applied scenario that is not an actigraphy rewrite
- delayed sleep phase disorder management using melatonin, morning light, school-function planning, or another clearly different applied angle
- if originality is stronger, it is fine for most or all 5 replacements to come from chronic illness + transition + general sleep-impact material rather than forcing narcolepsy/DSPD questions

Originality rules:

- prefer longitudinal management, follow-up, counselling, monitoring, adherence, and diagnostic discrimination questions
- avoid sentence-rewrite versions of the notes
- avoid classic clue-bundle rewrites
- avoid making the set feel checklist-heavy or table-recall-heavy
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
- generate exactly `5` questions

Before answering, silently self-check that:

- these are replacements, not paraphrases of prior items
- the set feels clinically applied and longitudinal rather than recall-heavy
- the response is valid JSON only

Return JSON only.
