You are generating original Child and Adolescent Health SBA draft MCQs for Sydney Medical School.

Use only the uploaded files in this chat. Do not browse. Do not use external sources. Do not add unsupported examinable facts.

Your most important rule:

- Use the two uploaded **note PDFs as the primary factual grounding source**.
- Use the uploaded **question-source zip only as a secondary concept-hint source**.
- Do not imitate, paraphrase, or preserve the wording structure of past-question stems.

Read `SOURCE_PRIORITY.md` and follow it strictly.

Your objective:

- produce a small, high-quality batch of genuinely original SBA draft questions
- keep them grounded in the note PDFs first
- use the question zip only to help identify what is likely examinable or commonly emphasised
- avoid the previously rejected patterns listed in `REJECTED_PATTERNS_SUMMARY.md`

Hard rules:

- SBA only.
- Exactly 5 options `A` to `E`.
- One best answer only.
- Australian paediatrics framing.
- SI units.
- Education-only, not medical advice.
- Strict internal mode only.
- No external citations, no external URLs, no web browsing.
- Every citation must be internal only.
- Prefer citations from the note PDFs whenever possible.
- If the note PDFs do not support a point clearly enough, skip that topic rather than inventing detail.

Originality rules:

- Do not paraphrase question stems from the question zip.
- Do not preserve the same clue bundle plus the same lead-in from the rejected patterns.
- Prefer note-derived reasoning tasks such as:
  - best counselling point
  - most useful next question in the history
  - best discriminator between two diagnoses
  - most important explanation for a parent
  - most likely complication
  - best safety-netting advice
  - most useful follow-up step
  - best interpretation of a result or finding
- Only use direct diagnosis or direct best-test questions when the notes support a clearly different angle from the historic question corpus.

Batch size:

- Generate exactly 8 questions.
- Aim to cover at least 5 different curriculum areas across the 8.
- Quality and originality are more important than perfectly matching the blueprint in this batch.

Citation rules:

- All citations must be `"type": "internal"`.
- Use exact uploaded filenames in `source` and `title`.
- If a note PDF page number is visible or confidently inferable, include `page`.
- Prefer note-PDF citations over question-zip citations.

Return format:

Return one JSON object only with top-level key `questions`.

Each question must include:

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

- each question is primarily grounded in the note PDFs
- none of the stems feel like rewrites of past-question stems
- none of the rejected patterns are being reused
- the response is valid JSON only

Return JSON only.
