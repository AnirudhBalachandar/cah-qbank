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

- do **not** make any confidentiality question
- do **not** make any HEEADSS checklist or consultation-structure question
- do **not** make a developmental-domain label question
- do **not** make a stage-of-adolescence label question
- do **not** make a generic risk-taking neurodevelopment explanation question
- do **not** make a parenting-style-best-answer question
- do **not** make a resilience single-factor or low-resilience-profile question
- do **not** make an internal-locus-of-control counselling question
- do **not** make a substance-use brain-vulnerability question

Prefer one of these safer angles:

- a parent-counselling question about **normal experimentation with roles** versus pathology, without asking for the domain label
- a question about **peer influence and separation from parents** as expected change, without asking “which domain”
- a question about **late adolescent regulatory maturation** and how that changes behaviour or counselling, without asking for a stage label
- a question about **future planning and abstract thinking** used in a practical school/work/life decision, but clearly different from the already accepted consultation-planning item

Important:

- do not ask “which developmental domain” or “which stage”
- do not ask “why is confidentiality discussed”
- do not ask “what is HEEADSS”
- make the item more about **interpretation or counselling** than taxonomy

Hard rules:

- SBA only
- exactly 5 options `A` to `E`
- one best answer only
- Australian paediatrics framing
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
- the question is not a label-matching taxonomy item
- the response is valid JSON only

Return JSON only.
