Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **replacement questions only** for batch `B05`.

Context:

- `B05` target was `12` questions
- `6` questions were already accepted
- `6` questions need replacement because they were too similar to other items in the same batch or existing local content

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Sleep, chronic illness, and transition`
- exact subtopics: `chronic illness in adolescence; adolescent sleep regulation; delayed sleep phase disorder; narcolepsy; transition principles and services`

Task:

- generate exactly `6` new replacement questions only
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

Do **not** reuse these rejected or overlapping angle families:

- early transition preparation from about 14 years, building self-management confidence, and re-educating the adolescent about their condition
- proactive follow-up of transition no-shows
- normal adolescent sleep shift to eveningness / reduced slow-wave sleep as the explanation for later sleep onset
- actigraphy as the tool that objectively estimates home sleep-wake timing and activity
- the classic delayed sleep phase disorder diagnostic vignette with normal sleep quality, later weekend sleep, and trouble waking for school
- narcolepsy follow-up focused on behavioural problems, mood disorders, or quality of life

Prefer fresh note-grounded angles such as:

- transition framed through readiness, continuity, checklist-style planning, adolescent involvement, or the role of primary care in a new applied scenario
- consequences of poor sleep other than the learner-driver accident stem, using mood, school functioning, risk-taking, or other note-based impacts in a fresh scenario
- delayed sleep phase disorder management or adherence counselling that focuses on avoiding weekend/holiday reversion, morning light, melatonin use, or school-function planning without repeating the classic diagnosis or hospital-rescheduling stem
- narcolepsy recognised through other REM-related symptoms such as sleep paralysis or hallucinations, or by distinguishing it from ordinary sleep deprivation in a clinically applied way
- sleep assessment using a different applied question that does not simply ask for actigraphy
- chronic illness counselling or follow-up questions that stay within this batch scope without drifting into sexual-health-only material

Originality rules:

- prefer longitudinal management, follow-up, counselling, monitoring, adherence, and diagnostic discrimination questions
- avoid sentence-rewrite versions of the notes
- avoid making the batch feel like isolated fact recall
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
- the set feels clinically applied and longitudinal rather than recall-heavy
- the response is valid JSON only

Return JSON only.
