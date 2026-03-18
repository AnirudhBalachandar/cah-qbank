Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating the **final 2 replacement questions only** for batch `B01`.

Context:

- `B01` target was `12` questions
- `10` questions are already accepted
- only `2` more questions are needed

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Adolescent foundations and interview structure`
- exact subtopics: `resilience; parenting style; developmental tasks of adolescence; HEEADSS assessment; adolescent brain maturation and risk-taking`

Task:

- generate exactly `2` new replacement questions only
- stay inside the same `B01` topic scope
- do not repeat accepted or rejected angles
- do not imitate or paraphrase past-question stems
- keep the questions grounded in the note PDFs first

Do **not** reuse these rejected/overlapping angle families:

- listing the extra HEEADSS domains as `sleep, safety, spirituality, social media`
- another developmental-domain question where `identity + independence + changing feelings` maps to `emotional`
- another resilience follow-up question built around `school disengagement + no outside activities`
- another parent-response question about `private time / more say in routines / gradual autonomy`
- another stage-of-adolescence discriminator built around `abstract thought + risk-taking + affect regulation`
- another parent-support question that substantially overlaps with `avoid labelling, one goal at a time`

Also avoid near-duplicates of these already accepted angles:

- reward-system vs prefrontal-cortex explanation of adolescent risk-taking
- `one trusted adult who cares` as the single resilience factor
- broad explanation of why HEEADSS is used
- direct `suicidality and depression` HEEADSS-domain recognition
- parenting warmth + boundaries as the best general style
- isolated/marginalised Indigenous or remote adolescent risk framing
- low-resilience profile with absent supports and hopeless internal control
- moral/ethical developmental-task domain recognition
- internal locus of control counselling framed as `one step in your control this week`
- substance-use counselling framed as `the brain is still developing and susceptible to addictive effects`

Prefer fresh note-grounded angles such as:

- how to introduce private time or confidentiality in an adolescent consultation
- how social development differs from emotional or moral development
- how cognitive development shows up in future planning or multidimensional problem-solving
- how parenting can support autonomy while still keeping safety conversations open
- how peer experimentation or separation from parents fits the note-based developmental tasks

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

- these are replacements, not paraphrases of prior items
- the questions feel note-first rather than question-bank-derived
- the response is valid JSON only

Return JSON only.
