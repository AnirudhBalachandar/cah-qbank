Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating an **ultra-targeted replacement set only** for batch `B02`.

Context:

- `B02` target was `12` questions
- `6` questions are already accepted
- repeated retries have failed because the remaining note content is highly table-like and keeps overlapping with existing items

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Consent, confidentiality, and service access`
- exact subtopics: `mature minor / Gillick competence; consent in emergencies; refusal and conflict; special medical treatment; Medicare access for adolescents`

Task:

- generate exactly `6` new replacement questions only
- stay inside the same `B02` topic scope
- avoid all accepted and rejected angle families
- do not imitate or paraphrase prior stems
- keep the questions grounded in the note PDFs first

Already accepted angles to avoid:

- age alone does not determine competence
- emergency life-saving treatment without prior consent
- Mandatory Report when parental refusal creates significant harm risk
- experimental procedure as special medical treatment
- inability to manage influences on decision-making
- explaining that treatment delays may affect the patient

Previously rejected angle families to avoid completely:

- direct mature-understanding or intermediate-understanding table-row recall
- profile-match `which adolescent is a mature minor?`
- blood transfusion / heart surgery / foreseen emergency
- court override of a capable minor’s refusal
- specialist opinion on capacity
- second medical opinion for treatment-plan dispute
- no suitable alternative treatment
- document everything
- permanent infertility
- drug of addiction > 10 days
- GAMT framed as `parental consent + MDT + diagnosis`
- Medicare framed around `own card`, `online claims history`, `Safety Net until 25`
- confidentiality framed as `explain confidentiality early before AOD assessment`

Only use fresh angle families like these:

- applied explanation of why a clinician may still want supportive parental involvement even when competence is being assessed individually
- seriousness of a decision changing the depth of capacity assessment, without using the same “simple dressing vs serious treatment” contrast
- a conflict-management principle question about court involvement being a last resort, without using any specific previously rejected scenarios
- GAMT framed around `both parents or all persons with parental responsibility`, without repeating the MDT/diagnosis wording
- a service-access counselling question about adolescent privacy or independent attendance that does **not** mention the direct Medicare thresholds or quote the card/claims facts
- distinction between `child` and `young person` in the NSW note framing, but only if presented as a clinically applied interpretation rather than age-threshold trivia

Originality rules:

- prefer counselling, communication, interpretation, and applied pathway questions
- avoid note-table recitation
- avoid one-sentence legal-trivia items
- if a candidate question feels at all close to a banned family, replace it with a different one

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

- none of the questions are paraphrases of accepted or rejected items
- the set uses only fresh angle families
- the response is valid JSON only

Return JSON only.
