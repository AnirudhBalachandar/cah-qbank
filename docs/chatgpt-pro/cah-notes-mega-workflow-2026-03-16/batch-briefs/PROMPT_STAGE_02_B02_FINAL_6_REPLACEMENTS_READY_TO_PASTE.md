Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating the **final 6 replacement questions only** for batch `B02`.

Context:

- `B02` target was `12` questions
- `6` questions are already accepted
- only `6` more questions are needed

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Consent, confidentiality, and service access`
- exact subtopics: `mature minor / Gillick competence; consent in emergencies; refusal and conflict; special medical treatment; Medicare access for adolescents`

Task:

- generate exactly `6` new replacement questions only
- stay inside the same `B02` topic scope
- do not repeat accepted or rejected angles
- do not imitate or paraphrase prior stems
- keep the questions grounded in the note PDFs first

Do **not** reuse these already accepted angles:

- `capacity depends on maturity / understanding / weighing risks and benefits, not age alone`
- `emergency or life-saving treatment can proceed without consent when no parent is available`
- `parental refusal causing risk of significant harm may require a Mandatory Report`
- `experimental procedure` as special medical treatment
- `inability to manage influences on decision-making` as the key competence concern
- `explain that treatment delays may affect the patient` as the counselling point in conflict

Do **not** reuse these rejected or overlapping angle families:

- another direct `mature understanding means the young person's consent is usually sufficient` table-row question
- another direct `intermediate understanding` consent-table question
- another `which adolescent is a mature minor?` profile-match question
- another `capacity dispute -> specialist opinion` question
- another `treatment-plan dispute -> second medical opinion` question
- another `capable minor refusal can be overridden by a court` question
- another foreseen-emergency blood-transfusion / heart-surgery / court-order question
- another `permanent infertility` or `drug of addiction >10 days` special-medical-treatment question
- another Medicare question built around the direct age-threshold facts `14 = online claims history`, `15 = own card`, or `25 if full-time student`
- another confidentiality question framed as `broader risk assessment should still continue in drug and alcohol assessment`

Prefer fresh note-grounded angles such as:

- how to explain confidentiality and its limits to an adolescent or parent in a clinically applied way
- how seriousness of the proposed treatment affects how carefully competence is assessed
- how to distinguish supportive parental involvement from parental control of the decision
- what kind of communication best maintains adolescent engagement during consent discussions
- practical service-access counselling that uses Medicare arrangements without turning the question into age-threshold recall
- recognising that some treatments fall into unusual consent pathways using a different note-based example than the ones already used

Originality rules for this final set:

- prefer counselling/explanation, communication, privacy, planning, and applied conflict-management questions
- avoid direct reproduction of note-table wording
- avoid purely legal-trivia or threshold-recall items
- if a candidate question feels too close to an accepted or rejected family, skip it and replace it with another

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
- the set is spread across the batch scope and not over-clustered around one fact table
- the questions feel note-first rather than question-bank-derived
- the response is valid JSON only

Return JSON only.
