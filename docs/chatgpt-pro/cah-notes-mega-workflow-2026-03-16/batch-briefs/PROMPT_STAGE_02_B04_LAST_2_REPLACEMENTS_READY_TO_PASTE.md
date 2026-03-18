Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating the **last 2 replacement questions only** for batch `B04`.

Context:

- `B04` target was `12` questions
- `10` questions are already accepted
- only `2` more questions are needed

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Alcohol, vaping, cannabis, and screening`
- exact subtopics: `alcohol and other drugs; e-cigarettes; cannabis harms and withdrawal; CRAFFT and AUDIT-C; brief intervention / 5 A's`

Task:

- generate exactly `2` new replacement questions only
- stay inside the same `B04` topic scope
- avoid all accepted and rejected angle families
- do not imitate or paraphrase prior stems
- keep the questions grounded in the note PDFs first

Already accepted angles to avoid:

- vaping still matters because e-cigarettes are rising and linked to later traditional cigarette uptake
- the CRAFFT `Car` item about riding with an impaired driver
- AUDIT-C as the alcohol-specific tool rather than CRAFFT
- multiple positive CRAFFT responses prompting fuller assessment
- after Ask + Assess + Advise, the next plan is Assist + Arrange
- conjunctival injection as an acute cannabis effect rather than withdrawal
- engage the adolescent directly and discuss confidentiality before CRAFFT when a parent dominates
- the skipped 5 A’s element is `Assess stage of change and dependence`
- acute cannabis effects with derealisation and paranoia
- early-onset cannabis use is linked to anxiety, depression, and psychosis

Rejected / overlapping angle families to avoid completely:

- “party drinking is still a health issue” / social drinking as a generic alcohol-risk counselling stem
- cannabis used to self-medicate anxiety or depression
- early questioning matters because adolescence is peak initiation and the brain is vulnerable
- the exact next step after Ask + Assess in the 5 A’s sequence
- a comprehensive adolescent drug-and-alcohol assessment for multisubstance use with school decline
- classic cannabis withdrawal presentation with irritability, poor appetite, restlessness, vivid dreams
- the previously rejected parental-alcohol-supply pattern family
- sedatives are less common but more harmful
- teenage binge drinking can affect memory/concentration up to a week later
- evening cannabis use can affect schoolwork even without psychotic symptoms
- mixing alcohol with cannabis in the same session
- burden-of-disease explanation that declining prevalence does not make AOD review unimportant

Prefer only fresh angle families like:

- a different clinically applied interpretation of AOD trends that does not reuse the burden-of-disease stem
- a different alcohol-risk scenario not based on “party drinking,” “mixing substances,” or “binge drinking affects concentration”
- a different cannabis-harm scenario not based on withdrawal, acute derealisation/paranoia, self-medication, or schoolwork/cognition denial
- a different use of CRAFFT, AUDIT-C, or the 5 A’s that does not repeat any accepted or rejected pattern

Originality rules:

- prefer counselling, interpretation, screening, and management-heavy questions
- avoid sentence-level rewrites of the notes
- if a concept feels close to any banned family, replace it with another

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
- generate exactly `2` questions

Before answering, silently self-check that:

- neither question paraphrases accepted or rejected items
- the response is valid JSON only

Return JSON only.
