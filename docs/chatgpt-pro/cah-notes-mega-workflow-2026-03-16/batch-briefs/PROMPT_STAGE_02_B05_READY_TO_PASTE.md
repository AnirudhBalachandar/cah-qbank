Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **one batch only** from the master batch plan.

This batch is:

- batch id: `B05`
- curriculum area: `Adolescent Medicine`
- topic cluster: `Sleep, chronic illness, and transition`
- exact subtopics: `chronic illness in adolescence; adolescent sleep regulation; delayed sleep phase disorder; narcolepsy; transition principles and services`
- target question count: `12`
- preferred question style mix: `D`
- source priority notes: `Louisa - Chronic Illness and Disability; Adolescent Sleep Disorders; Transition`
- overlap-risk notes: `Low; strong note density and low past-paper pull`

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

- prefer longitudinal management, follow-up, counselling, monitoring, adherence, and diagnostic discrimination questions
- avoid turning the batch into isolated one-line definitions or sleep-fact recall
- keep the scenarios clinically applied and adolescent-centred
- if a concept feels too close to old exam wording, skip it and replace it with another subtopic item from the same batch

Style mix `D` target:

- 3 long-term management/follow-up
- 3 counselling/adherence/prevention
- 3 monitoring/complication
- 3 diagnostic discrimination

Good angle examples for this batch:

- counselling about transition readiness and self-management
- long-term follow-up for adolescents with chronic illness
- discriminating delayed sleep phase disorder from other sleep complaints
- recognising when fatigue suggests narcolepsy rather than lifestyle sleep deprivation
- practical management and monitoring questions rather than rote sleep physiology recall

Output requirements:

- return **one JSON object only**
- top-level key must be `questions`
- each question must follow `OUTPUT_SPEC.md`
- generate exactly `12` questions

Before answering, silently self-check that:

- this batch is grounded in the notes first
- the batch does not feel like a rewrite of the question zip
- the questions are clinically applied and longitudinal rather than recall-heavy
- the response is valid JSON only

Return JSON only.
