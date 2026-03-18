Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Follow `SOURCE_PRIORITY.md` strictly:

- Louisa notes first
- CAH Bible second
- question zip only for concept hints and exam flavour

You are generating **replacement questions only** for batch `B02`.

Context:

- `B02` target was `12` questions
- `4` questions were already accepted
- `8` questions need replacement because they were too similar to other items in the same batch or existing local content

Batch scope remains:

- curriculum area: `Adolescent Medicine`
- topic cluster: `Consent, confidentiality, and service access`
- exact subtopics: `mature minor / Gillick competence; consent in emergencies; refusal and conflict; special medical treatment; Medicare access for adolescents`

Task:

- generate exactly `8` new replacement questions only
- stay inside the same `B02` topic scope
- do not repeat accepted or rejected angles
- do not imitate or paraphrase past-question stems
- keep the questions grounded in the note PDFs first

Do **not** reuse these accepted angles:

- `capacity depends on maturity / understanding / weighing risks and benefits, not age alone`
- `emergency or life-saving treatment can proceed without consent when no parent is available`
- `parental refusal causing risk of significant harm may require a Mandatory Report`
- `experimental procedure` as the clearest example of `special medical treatment`

Do **not** reuse these rejected or overlapping angle families:

- another “which adolescent is a mature minor?” profile-match question
- another question that directly asks for the `intermediate understanding` row from the consent table
- another foreseen-emergency / blood-transfusion-in-heart-surgery stem
- another “can a capable minor’s refusal be overridden by a court?” stem
- another “best next step before a court order is counselling and repeat discussion” stem
- another “permanent infertility means NCAT because neither parent nor mature minor can consent” stem
- another Medicare age-threshold question focused on `14 = online claims history` or `15 = own Medicare card`
- another Medicare Safety Net age-threshold question focused on `25 if full-time student`

Prefer fresh note-grounded angles such as:

- explaining confidentiality boundaries and their limits to an adolescent or parent
- distinguishing when parent involvement still matters without turning the question into a table-recall item
- recognising situations where disagreement should prompt escalation, second opinion, or careful planning without using the same court-order stems
- identifying what makes a treatment category unusual or high-stakes without reusing the experimental-procedure or permanent-infertility examples
- practical service-access scenarios that use Medicare or adolescent privacy in a more applied way than pure age-threshold recall
- consultation wording or communication strategies that fit adolescent consent and confidentiality care

Originality rules for this replacement set:

- prefer counselling/explanation, conflict-resolution, communication, planning, privacy, and applied service-access questions
- avoid legal-definition recitation, statute-style trivia, or direct reproduction of note-table wording
- if a candidate question feels too close to a rejected pattern, skip it and replace it with another
- spread the `8` questions across the batch scope rather than clustering most of them around one consent subtopic

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
- generate exactly `8` questions

Before answering, silently self-check that:

- these are replacements, not paraphrases of rejected items
- the set does not over-cluster around one legal-consent fact pattern
- the questions feel note-first rather than question-bank-derived
- the response is valid JSON only

Return JSON only.
