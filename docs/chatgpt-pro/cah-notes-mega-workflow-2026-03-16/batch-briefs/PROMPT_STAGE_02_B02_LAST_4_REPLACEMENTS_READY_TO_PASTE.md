Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating the **last 4 replacement questions only** for batch `B02`.

Context:

- `B02` target was `12` questions
- `8` questions are already accepted
- only `4` more questions are needed
- multiple retries have already failed because many remaining consent/service-access concepts are highly table-like

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Consent, confidentiality, and service access`
- exact subtopics: `mature minor / Gillick competence; consent in emergencies; refusal and conflict; special medical treatment; Medicare access for adolescents`

Task:

- generate exactly `4` new replacement questions only
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
- seriousness / gravity of treatment as a competence factor
- GAMT requiring both parents or all persons with parental responsibility

Rejected angle families to avoid completely:

- parent answering for the adolescent instead of direct assessment
- mature-understanding / intermediate-understanding table-row recall
- `which adolescent is a mature minor?`
- blood transfusion / heart surgery / foreseen emergency
- court override of a capable minor’s refusal
- specialist opinion on capacity
- second medical opinion for treatment-plan dispute
- no suitable alternative treatment
- document everything
- court order framed as last resort
- permanent infertility
- drug of addiction > 10 days
- under-16 special-medical-treatment heading applied to a 16-year-old
- any Medicare item built around own card / online claims history / Safety Net / independent access
- confidentiality framed as explaining privacy before AOD assessment

Use only genuinely fresh angle families like:

- applied explanation of the NSW note distinction between `child` and `young person`, without making it a raw age-threshold quiz
- what “adult presumed competent at 18” means in a clinically applied comparison
- supportive parental involvement versus legal decision-making authority, using a scenario clearly different from the rejected parent-answering-for-teen stem
- a confidentiality-limits or engagement question that is not about “start with confidentiality before AOD questions”
- a note-based pathway interpretation question that uses untouched wording and does not restate any table row

Originality rules:

- prefer counselling, communication, interpretation, and pathway-understanding questions
- avoid direct note-table recitation
- avoid legal-trivia one-liners
- if any candidate feels close to a banned family, replace it with a different one

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
- generate exactly `4` questions

Before answering, silently self-check that:

- none of the 4 questions paraphrase accepted or rejected items
- the set uses only fresh angle families
- the response is valid JSON only

Return JSON only.
