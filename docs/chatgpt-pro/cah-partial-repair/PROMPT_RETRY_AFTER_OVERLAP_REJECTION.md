The previous batch was rejected by the local originality screen because the generated stems stayed too close to existing CAH question stems.

Use only the uploaded internal files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Your task now is not to paraphrase the rejected stems. Your task is to generate a fresh set of original SBA draft MCQs that are grounded in the same internal material but differ substantially in wording, framing, and task type.

You must avoid:

- paraphrasing the original past-paper or remembered-question stems
- reusing the same distinctive clue combinations unless necessary
- repeatedly asking "What is the most likely diagnosis?" for concepts that were already tested that way
- copying uncommon source phrasing

Instead, make the questions more original by changing the angle. Where supported by the uploaded files, prefer:

- next best step
- most useful discriminator in the history
- best interpretation of a finding
- most important counselling point
- most likely complication or consequence
- best prevention strategy
- most appropriate follow-up or referral decision
- which finding would make one option more likely than another

Important originality rules:

- The new stem must be recognisably different from both the source question wording and the rejected batch wording.
- Change patient age, context, lead-in style, and question task when possible.
- Do not simply rename a few words in the old stem.
- If a source fragment is too thin to support a truly new question, skip it rather than forcing a paraphrase.

Grounding rules:

- Use internal uploaded material only.
- Keep all citations internal only.
- Use exact uploaded filenames in `source` and `title`.
- If a source only supports one narrow fact, build a short clean question around that fact without inventing extra detail.

Format rules:

- SBA only.
- Exactly 5 options `A` to `E`.
- One best answer only.
- Australian paediatrics framing.
- SI units.
- Education-only, not medical advice.

Target output:

- Generate exactly 12 questions.
- Prioritise concepts from incomplete or fragmentary remembered-question material that can be turned into genuinely new exam-ready items.
- Balance roughly across the CAH blueprint, but originality matters more than forcing all areas evenly.

Return format:

- Return one JSON object only with top-level key `questions`.
- Each question must include:
  - `stem_markdown`
  - `options`
  - `correctKey`
  - `explanation_markdown`
  - `why_others_wrong`
  - `key_takeaways`
  - `tags`
  - `moduleCode`
  - `difficulty`
  - `ausScore`
  - `citations`

Tag rules:

- The first tag must be exactly one of:
  - `General Paediatrics`
  - `Paediatric Sub-specialties`
  - `Paediatric Surgery`
  - `Emergency Paediatrics`
  - `Adolescent Medicine`
  - `Community-based Paediatrics`

Before answering, silently self-check that:

- none of the stems are close paraphrases of the rejected batch
- none of the stems feel like lightly edited past-paper questions
- every item is still supported by the uploaded internal files
- the output is JSON only

Return JSON only.
